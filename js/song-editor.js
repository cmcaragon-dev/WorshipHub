"use strict";

import { songs } from "./initial-songs.js";
import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { canAddSongs, canEditSongs, isAdmin, ADMIN_EMAIL } from "./admin-settings.js";
import { collection, doc, setDoc, deleteDoc, serverTimestamp, getDoc, getDocs, collectionGroup, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const STORAGE_KEY = "worshipHubCustomSongs";
const DELETED_SONG_TITLES_KEY = "worshipHubDeletedSongTitles";
const DELETED_SONG_DOC_PREFIX = "__deleted_song__";
function deletedSongDocId(titleKey){ return DELETED_SONG_DOC_PREFIX + encodeURIComponent(String(titleKey || "")); }
function normalizeDeletedTitle(title){
    return String(title || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}
function isDeletedTitle(title){
    const key = normalizeDeletedTitle(title);
    if(!key) return false;
    try {
        const v = JSON.parse(localStorage.getItem(DELETED_SONG_TITLES_KEY) || "[]");
        return Array.isArray(v) && v.map(normalizeDeletedTitle).includes(key);
    } catch(e){ return false; }
}
const SHARP_KEYS = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

let sections = [];
let editingId = null;

function uid(prefix = "id") {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
}

function esc(value) {
    return String(value ?? "")
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;")
        .replace(/'/g,"&#039;");
}

function loadCustomSongs() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        if (!Array.isArray(saved)) return;
        saved.forEach(song => {
            if (!song || !song.id) return;
            if (isDeletedTitle(song.title)) return;
            if (!songs.some(existing => String(existing.id) === String(song.id))) {
                songs.push(song);
            }
        });
    } catch (error) {
        console.warn("Unable to load WorshipHub custom songs:", error);
    }
}

async function saveSongToFirebase(song) {
    try {
        await setDoc(doc(collection(db, "songs"), String(song.id)), {
            ...song,
            updatedAt: serverTimestamp(),
            createdAt: song.createdAt || serverTimestamp(),
            customSong: true,
            public: true
        });
        console.log("Saved custom song to Firebase:", song.id);
    } catch (error) {
        console.error("Firebase song save failed:", error);
        throw error;
    }
}


async function deleteSongFromFirebase(id) {
    if (!id) return;
    try {
        await deleteDoc(doc(db, "songs", String(id)));
        console.log("Deleted Firebase song:", id);
    } catch (error) {
        console.error("Firebase delete failed:", error);
        throw error;
    }
}


async function cleanupSongLinks(song) {
    const id = String(song?.id || "");
    const file = String(song?.file || "");
    if (!id) return;
    const refs = [];
    try {
        const [serviceSnap, playlistSnap] = await Promise.all([
            getDocs(collectionGroup(db, "services")),
            getDocs(collectionGroup(db, "playlists"))
        ]);
        [...serviceSnap.docs, ...playlistSnap.docs].forEach(snap => {
            const data = snap.data() || {};
            if (Array.isArray(data.songs) && data.songs.some(x => String(x?.id || "") === id || String(x?.file || "") === file)) {
                refs.push(snap.ref);
            }
        });
        for (let i = 0; i < refs.length; i += 400) {
            const batch = writeBatch(db);
            refs.slice(i, i + 400).forEach(ref => {
                const data = serviceSnap.docs.find(d => d.ref.path === ref.path)?.data() || playlistSnap.docs.find(d => d.ref.path === ref.path)?.data() || {};
                const songs = Array.isArray(data.songs) ? data.songs.filter(x => String(x?.id || "") !== id && String(x?.file || "") !== file) : [];
                batch.update(ref, { songs, updatedAt: serverTimestamp() });
            });
            await batch.commit();
        }
    } catch (error) {
        console.warn("Song link cleanup was not fully completed. Check admin Firestore rules:", error);
    }
}

async function deleteSong(songOrId) {
    const id = typeof songOrId === "string" ? songOrId : songOrId?.id;
    const song = songs.find(s => String(s.id) === String(id));
    if (!song?.customSong) return false;
    const user = auth.currentUser;
    const allowedToManage = await canEditSongs(user);
    if (!allowedToManage) {
        alert("You do not have permission to edit or delete songs.");
        return false;
    }
    if (!confirm(`Delete "${song.title || "Untitled Song"}"? This will permanently remove all duplicate copies of the same title and their Firebase links.`)) return false;

    const titleKey = normalizeDeletedTitle(song.title);
    const matchingSongs = songs.filter(s => normalizeDeletedTitle(s?.title) === titleKey);
    const firebaseIds = new Set(matchingSongs.map(s => String(s.id)).filter(Boolean));

    // Create a title-level tombstone BEFORE syncing anything else so every
    // bundled/local/Firebase duplicate with this title stays deleted.
    if (titleKey) {
        const deleted = (() => {
            try { return new Set(JSON.parse(localStorage.getItem(DELETED_SONG_TITLES_KEY) || "[]")); }
            catch(e){ return new Set(); }
        })();
        deleted.add(titleKey);
        localStorage.setItem(DELETED_SONG_TITLES_KEY, JSON.stringify([...deleted]));
        // Permanent Firebase tombstone. The marker stays in the existing
        // /songs collection, so the deleted title cannot reappear from the
        // bundled library or another user's browser after refresh.
        try {
            await setDoc(doc(db, "songs", deletedSongDocId(titleKey)), {
                deletedSong: true,
                titleKey,
                title: String(song.title || "").trim(),
                deletedAt: serverTimestamp(),
                deletedBy: user.uid
            }, { merge: true });
        } catch(error) {
            console.error("Unable to save permanent Firebase deletion marker:", error);
            alert("The song was not permanently deleted because Firebase could not save the deletion marker. Please check Firestore permissions and try again.");
            return false;
        }
    }
    if (window.WorshipHubDeletedSongs?.remember) {
        matchingSongs.forEach(s => window.WorshipHubDeletedSongs.remember(s.id));
    }
    try {
        const snap = await getDocs(collection(db, "songs"));
        for (const docSnap of snap.docs) {
            const data = docSnap.data() || {};
            const docId = String(data.id || docSnap.id);
            if (normalizeDeletedTitle(data.title) === titleKey || firebaseIds.has(docId)) {
                firebaseIds.add(docId);
                try { await deleteDoc(doc(db, "songs", docId)); }
                catch (error) { console.warn("Unable to delete duplicate Firebase song:", docId, error); }
            }
        }
    } catch (error) {
        console.warn("Unable to scan Firebase songs for duplicate deletion:", error);
        try { await deleteSongFromFirebase(id); } catch(e) { throw e; }
    }

    // Remove every local duplicate immediately.
    for (let i = songs.length - 1; i >= 0; i--) {
        if (normalizeDeletedTitle(songs[i]?.title) === titleKey || firebaseIds.has(String(songs[i]?.id))) songs.splice(i, 1);
    }
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        const remaining = Array.isArray(saved) ? saved.filter(s => !firebaseIds.has(String(s?.id)) && normalizeDeletedTitle(s?.title) !== titleKey) : [];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
    } catch(e) {}

    await cleanupSongLinks(song);
    window.dispatchEvent(new CustomEvent("worshiphub:songs-updated", { detail: { deletedId: id, deletedTitle: song.title } }));
    if (editingId === id) closeEditor();
    alert("Song deleted successfully. All duplicate copies with the same title are now blocked from returning.");
    return true;
}

async function loadCustomSongsFromFirebase() {
    try {
        const snap = await getDocs(collection(db, "songs"));
        let changed = false;
        snap.forEach(docSnap => {
            const song = docSnap.data();
            if (!song || song.metadataOnly === true || song.deletedSong === true || String(docSnap.id).startsWith(DELETED_SONG_DOC_PREFIX)) return;
            if (window.WorshipHubDeletedSongs?.isDeleted?.(song.id || docSnap.id)) {
                if (window.WorshipHubDeletedSongs?.rememberTitle) window.WorshipHubDeletedSongs.rememberTitle(song.title);
                return;
            }
            if (window.WorshipHubDeletedSongs?.isDeletedTitle?.(song.title) || isDeletedTitle(song.title)) return;
            const normalized = { ...song, id: String(song.id || docSnap.id) };
            let index = songs.findIndex(existing => String(existing.id) === normalized.id);
            if (index < 0) {
                const titleKey = normalizeDeletedTitle(normalized.title);
                if (titleKey) {
                    index = songs.findIndex(existing => normalizeDeletedTitle(existing?.title) === titleKey);
                }
            }
            // Firebase is the shared master copy. Replace the old local/bundled
            // song completely so amended lyrics/chords cannot be overwritten
            // by stale local fields.
            if (index >= 0) songs[index] = normalized;
            else songs.push(normalized);
            changed = true;
        });
        if (changed) {
            saveCustomSongs();
            window.dispatchEvent(new CustomEvent("worshiphub:songs-updated", { detail: { loadedFromFirebase: true } }));
        }
    } catch (error) {
        console.warn("Unable to load custom songs from Firebase:", error);
    }
}

function saveCustomSongs() {
    const custom = songs.filter(song => song && song.customSong === true);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
}

// Song titles are unique in WorshipHub. Comparison is case-insensitive and
// ignores repeated/leading/trailing spaces, so titles such as "Goodness of God"
// and "  goodness   of   god " are treated as the same song. When editing,
// the current song itself is excluded from the duplicate check.
function normalizeSongTitle(title) {
    return String(title || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

async function findDuplicateSongTitle(title, currentId = null) {
    const normalizedTitle = normalizeSongTitle(title);
    if (!normalizedTitle) return null;

    // CRITICAL: when editing an existing song, the title of that exact record
    // is always allowed. Older versions could lose editingId for a bundled
    // song and then compare the song against its own Firebase copy, producing
    // the false "Song Already Available" error.
    if (currentId) {
        const current = songs.find(song => String(song?.id || "") === String(currentId));
        if (current && normalizeSongTitle(current.title) === normalizedTitle) {
            return null;
        }
    }

    // For a title change while editing, or for a brand-new song, only another
    // distinct record should block the save.
    const localMatch = songs.find(song => {
        if (!song) return false;
        if (currentId && String(song.id || "") === String(currentId)) return false;
        return normalizeSongTitle(song.title) === normalizedTitle;
    });
    if (localMatch) return localMatch;

    // Check Firebase only when needed. This avoids a cloud read when the user
    // is simply saving the same title on the current record.
    try {
        const snap = await getDocs(collection(db, "songs"));
        for (const docSnap of snap.docs) {
            const song = docSnap.data() || {};
            if (song.deletedSong === true || String(docSnap.id).startsWith(DELETED_SONG_DOC_PREFIX)) continue;
            const songId = String(song.id || docSnap.id);
            if (currentId && songId === String(currentId)) continue;
            if (normalizeSongTitle(song.title) === normalizedTitle) return { ...song, id: songId };
        }
    } catch (error) {
        console.warn("Unable to perform Firebase duplicate-title check:", error);
    }
    return null;
}

function makeSection(type = "Verse", number = 1) {
    return {
        id: uid("section"),
        type,
        number,
        lines: [makeLine()]
    };
}

function makeLine(lyrics = "") {
    return {
        id: uid("line"),
        lyrics,
        chords: []
    };
}

function openEditor(song = null) {
    const panel = document.getElementById("songEditorPanel");
    if (!panel) return;

    editingId = song?.id || null;
    document.getElementById("editorSongTitle").value = song?.title || "";
    document.getElementById("editorSongArtist").value = song?.artist || "";
    document.getElementById("editorSongCategory").value = song?.category || "Worship";
    document.getElementById("editorSongLanguage").value = song?.language || "English";
    document.getElementById("editorSongKey").value = song?.key || "C";
    document.getElementById("editorSongYoutube").value = song?.youtube || "";
    const sourceEl = document.getElementById("editorSourceUrl");
    if (sourceEl) sourceEl.value = song?.sourceUrl || "";

    sections = song?.sections
        ? JSON.parse(JSON.stringify(song.sections))
        : [makeSection("Verse", 1), makeSection("Chorus", 1)];

    renderEditor();
    panel.classList.add("show");
    panel.setAttribute("aria-hidden", "false");
}

function closeEditor() {
    const panel = document.getElementById("songEditorPanel");
    if (!panel) return;
    panel.classList.remove("show");
    panel.setAttribute("aria-hidden", "true");
    editingId = null;
}

function renderEditor() {
    const root = document.getElementById("songEditorSections");
    if (!root) return;

    root.innerHTML = sections.map((section, sectionIndex) => `
        <div class="editor-section" data-section-index="${sectionIndex}">
            <div class="editor-section-head">
                <select class="editor-section-type">
                    ${["Intro","Verse","Chorus","Pre-Chorus","Bridge","Tag","Instrumental","Outro"].map(type =>
                        `<option value="${type}" ${section.type === type ? "selected" : ""}>${type}</option>`
                    ).join("")}
                </select>
                <input class="editor-section-number" type="number" min="1" value="${section.number || 1}" aria-label="Section number">
                <span class="spacer"></span>
                <button class="editor-icon-btn section-up" type="button" title="Move section up">↑</button>
                <button class="editor-icon-btn section-down" type="button" title="Move section down">↓</button>
                <button class="editor-icon-btn section-add-line" type="button" title="Add lyric line">＋</button>
                <button class="editor-icon-btn section-delete" type="button" title="Delete section">🗑</button>
            </div>
            <div class="editor-lines">
                ${section.lines.map((line, lineIndex) => renderLine(line, sectionIndex, lineIndex)).join("")}
            </div>
        </div>
    `).join("");

    root.querySelectorAll(".editor-section-type").forEach(select => {
        select.addEventListener("change", e => {
            const sectionIndex = Number(e.target.closest(".editor-section").dataset.sectionIndex);
            sections[sectionIndex].type = e.target.value;
        });
    });
    root.querySelectorAll(".editor-section-number").forEach(input => {
        input.addEventListener("input", e => {
            const sectionIndex = Number(e.target.closest(".editor-section").dataset.sectionIndex);
            sections[sectionIndex].number = Number(e.target.value) || 1;
        });
    });

    root.querySelectorAll(".section-up").forEach(btn => btn.onclick = () => moveSection(btn, -1));
    root.querySelectorAll(".section-down").forEach(btn => btn.onclick = () => moveSection(btn, 1));
    root.querySelectorAll(".section-delete").forEach(btn => btn.onclick = () => deleteSection(btn));
    root.querySelectorAll(".section-add-line").forEach(btn => btn.onclick = () => addLine(btn));
    root.querySelectorAll(".editor-line-delete").forEach(btn => btn.onclick = () => deleteLine(btn));

    root.querySelectorAll(".editor-lyric-input").forEach(input => {
        input.addEventListener("input", e => {
            const [si, li] = getLineIndexes(e.target);
            sections[si].lines[li].lyrics = e.target.value;
        });
    });

    root.querySelectorAll(".editor-chord-input").forEach(input => {
        input.addEventListener("input", e => {
            const [si, li] = getLineIndexes(e.target);
            syncLineChords(si, li, e.target.value);
        });
    });
}

function chordTextFromPositions(line) {
    if (typeof line?.chordText === "string") return line.chordText;
    const chords = Array.isArray(line?.chords) ? line.chords : [];
    if (!chords.length) return "";
    const chars = [];
    chords.slice().sort((a,b) => (Number(a.position)||0) - (Number(b.position)||0)).forEach(c => {
        const pos = Math.max(0, Number(c.position) || 0);
        const text = String(c.originalChord || c.chord || "").trim();
        while (chars.length < pos) chars.push(" ");
        Array.from(text).forEach((ch, i) => { chars[pos+i] = ch; });
    });
    return chars.join("");
}


// Wrap an imported chord/lyric line as a single unit. The chord row and lyric row
// use the same character coordinates, so when a lyric line is split, the chord
// positions are split and re-based at exactly the same point.
function wrapImportedLine(line, maxChars = 72) {
    const lyrics = String(line?.lyrics || "");
    const chordText = String(line?.chordText || "");
    if (!lyrics || lyrics.length <= maxChars) return [{...line, lyrics, chordText, chords: chordsFromText(chordText)}];

    const rows = [];
    let start = 0;
    const safeWidth = Math.max(12, Number(maxChars) || 72);
    while (start < lyrics.length) {
        let end = Math.min(lyrics.length, start + safeWidth);
        if (end < lyrics.length) {
            const segment = lyrics.slice(start, end);
            const breakAt = Math.max(segment.lastIndexOf(" "), segment.lastIndexOf("\t"));
            if (breakAt > Math.floor(safeWidth * 0.55)) end = start + breakAt + 1;
        }
        if (end <= start) end = Math.min(lyrics.length, start + safeWidth);

        const rowLyrics = lyrics.slice(start, end);
        const rowChord = chordText.slice(start, end);
        rows.push({
            id: uid("line"),
            lyrics: rowLyrics,
            chordText: rowChord,
            chords: chordsFromText(rowChord)
        });
        start = end;
    }
    return rows;
}

function wrapImportedSections(sections, maxChars = 72) {
    return (sections || []).map(section => ({
        ...section,
        lines: (section.lines || []).flatMap(line => wrapImportedLine(line, maxChars))
    }));
}

function chordsFromText(chordText) {
    const text = String(chordText || "");
    const chords = [];
    const re = /\S+/g;
    let match;
    while ((match = re.exec(text))) {
        const value = match[0].trim();
        if (!value) continue;
        chords.push({ id: uid("chord"), chord:value, originalChord:value, position:match.index });
    }
    return chords;
}

function syncLineChords(sectionIndex, lineIndex, chordText) {
    const line = sections[sectionIndex].lines[lineIndex];
    line.chordText = String(chordText ?? "");
    line.chords = chordsFromText(line.chordText);
}

function renderLine(line, sectionIndex, lineIndex) {
    const width = Math.max(line.lyrics.length, String(line.chordText || "").length, 1);
    const chordText = chordTextFromPositions(line);
    line.chordText = chordText;

    return `
        <div class="editor-line" data-section-index="${sectionIndex}" data-line-index="${lineIndex}">
            <div class="editor-line-main">
                <textarea class="editor-chord-input" data-section-index="${sectionIndex}" data-line-index="${lineIndex}" spellcheck="false" wrap="off" placeholder="Type chords here. Use spaces to place each chord exactly above the lyric...">${esc(chordText)}</textarea>
                <textarea class="editor-lyric-input" data-section-index="${sectionIndex}" data-line-index="${lineIndex}" spellcheck="false" wrap="off" placeholder="Type lyrics here...">${esc(line.lyrics)}</textarea>
            </div>
            <button class="editor-line-delete" type="button" title="Delete line">×</button>
        </div>
    `;
}

function getLineIndexes(element) {
    const line = element.closest(".editor-line");
    return [Number(line.dataset.sectionIndex), Number(line.dataset.lineIndex)];
}

function refreshChordStrip(sectionIndex, lineIndex) {
    const line = sections[sectionIndex].lines[lineIndex];
    const input = document.querySelector(`.editor-line[data-section-index="${sectionIndex}"][data-line-index="${lineIndex}"] .editor-chord-input`);
    if (input) input.value = chordTextFromPositions(line);
}

function addChordAtClick(event) {
    // Legacy compatibility. New Add Song editing is direct: type chords in the
    // chord row above the lyrics and use spaces for exact character alignment.
    const input = event?.currentTarget;
    input?.focus();
}

function moveSection(button, direction) {
    const sectionIndex = Number(button.closest(".editor-section").dataset.sectionIndex);
    const target = sectionIndex + direction;
    if (target < 0 || target >= sections.length) return;
    [sections[sectionIndex], sections[target]] = [sections[target], sections[sectionIndex]];
    renderEditor();
}

function deleteSection(button) {
    const sectionIndex = Number(button.closest(".editor-section").dataset.sectionIndex);
    if (sections.length === 1) {
        alert("A song must have at least one section.");
        return;
    }
    if (!confirm(`Delete ${sections[sectionIndex].type} ${sections[sectionIndex].number || ""}?`)) return;
    sections.splice(sectionIndex, 1);
    renderEditor();
}

function addLine(button) {
    const sectionIndex = Number(button.closest(".editor-section").dataset.sectionIndex);
    sections[sectionIndex].lines.push(makeLine());
    renderEditor();
    focusLastLine(sectionIndex);
}

function deleteLine(button) {
    const [si, li] = getLineIndexes(button);
    if (sections[si].lines.length === 1) {
        sections[si].lines[0] = makeLine();
    } else {
        sections[si].lines.splice(li, 1);
    }
    renderEditor();
}

function focusLastLine(sectionIndex) {
    const input = document.querySelector(`.editor-section[data-section-index="${sectionIndex}"] .editor-lyric-input:last-of-type`);
    input?.focus();
}

async function refreshCustomSongInServices(updatedSong){
    if(!updatedSong?.id || !auth.currentUser) return;
    try{
        const serviceSnap=await getDocs(collection(db,"users",auth.currentUser.uid,"services"));
        for(const serviceDoc of serviceSnap.docs){
            const data=serviceDoc.data()||{};
            if(!Array.isArray(data.songs)) continue;
            let changed=false;
            const nextSongs=data.songs.map(item=>{
                if(String(item?.id||"")!==String(updatedSong.id)) return item;
                changed=true;
                return {
                    ...item,
                    ...updatedSong,
                    // Service-specific key/transpose remain authoritative.
                    serviceKey:item?.serviceKey || updatedSong.serviceKey || updatedSong.key,
                    transpose:item?.transpose ?? updatedSong.transpose ?? 0
                };
            });
            if(changed){
                await setDoc(doc(db,"users",auth.currentUser.uid,"services",serviceDoc.id),{
                    ...data,
                    songs:nextSongs,
                    updatedAt:serverTimestamp()
                },{merge:true});
            }
        }
    }catch(error){
        console.warn("Unable to refresh edited custom song in Service Planner:",error);
        // The master structured song is still saved. custom-song-runtime also refreshes
        // the master Firebase copy when opening from a service.
    }
}


function cleanImportedText(value) {
    return String(value || "")
        .replace(/\u00a0/g, " ")
        .replace(/\r/g, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function guessKey(text) {
    const value = String(text || "");
    const m = value.match(/(?:original\s+key|song\s+key|key|tonality|in\s+the\s+key\s+of)\s*[:\-]?\s*([A-G](?:#|b)?(?:\s*(?:m|min|maj|major|minor))?)/i);
    if (!m) return "";
    let k = m[1].replace(/\s+/g, "").replace(/major$/i, "").replace(/maj$/i, "").replace(/minor$/i, "m").replace(/min$/i, "m");
    if (/^[A-G](?:#|b)?m?$/.test(k)) {
        if (k.includes("b")) {
            const flatMap={Db:"C#",Eb:"D#",Gb:"F#",Ab:"G#",Bb:"A#"};
            k=flatMap[k.replace("m","")] ? flatMap[k.replace("m","")] + (k.endsWith("m")?"m":"") : k;
        }
        return k;
    }
    return "";
}

function guessLanguage(text, doc) {
    const meta = doc?.querySelector("meta[property='og:locale'], meta[name='language'], meta[http-equiv='content-language']")?.getAttribute("content") || "";
    const lang = String(meta || "").toLowerCase();
    if (lang.includes("fil") || lang.includes("tl")) return "Filipino";
    if (lang.includes("es")) return "Spanish";
    if (lang.includes("ko")) return "Korean";
    if (lang.includes("zh")) return "Chinese";
    if (lang.includes("ja")) return "Japanese";
    return /\b(english|tagalog|filipino|spanish|korean|chinese|japanese)\b/i.exec(text)?.[1] || "English";
}

function textFromElement(el) { return cleanImportedText(el?.innerText || el?.textContent || ""); }

function extractChordLines(container) {
    const text = container?.innerText || container?.textContent || "";
    return cleanImportedText(text).split("\n").map(x => x.replace(/\t/g,"    ").trimEnd()).filter(Boolean);
}

function normalizeSectionHeading(line) {
    let t = String(line || "").trim().replace(/^[\[({]+|[\])}]+$/g, "").replace(/[:\-]+$/g, "").trim();
    t = t.replace(/^(?:section|part)\s*[:\-]\s*/i, "");
    const m = t.match(/^(intro|introduction|verse|chorus|pre[- ]?chorus|prechorus|bridge|tag|instrumental|interlude|outro|refrain|ending|ending chorus)\s*(?:#|[- ]*)?(\d+)?$/i);
    if (!m) return null;
    const key = m[1].toLowerCase().replace(/\s+/g," ");
    const names={introduction:"Intro",intro:"Intro",verse:"Verse",chorus:"Chorus","pre chorus":"Pre-Chorus","pre-chorus":"Pre-Chorus",prechorus:"Pre-Chorus",bridge:"Bridge",tag:"Tag",instrumental:"Instrumental",interlude:"Interlude",outro:"Outro",refrain:"Chorus",ending:"Outro","ending chorus":"Chorus"};
    return {type:names[key] || "Verse", number:Number(m[2]) || 1};
}

function isChordOnly(line) {
    const t=String(line||"").trim();
    if(!t) return false;
    const tokens=t.split(/\s+/).filter(Boolean);
    const chord=/^[A-G](?:#|b)?(?:m|maj|min|sus|add|dim|aug|7|9|11|13|\+|-)*(?:\/[A-G](?:#|b)?)?(?:\([^)]*\))?$/;
    return tokens.length>0 && tokens.length<=18 && tokens.every(x=>chord.test(x));
}

function buildSectionsFromImportedText(text) {
    const rawLines=cleanImportedText(text).split("\n").map(x=>x.replace(/\t/g,"    ").trimEnd());
    const result=[]; let current=null; const counters={Verse:0,Chorus:0,Bridge:0,Intro:0,Outro:0};
    const add=(type,number)=>{ counters[type]=(counters[type]||0)+1; current={id:uid("section"),type,number:number||counters[type],lines:[]}; result.push(current); };
    // Do not force Verse 1 until actual content is encountered.
    for(let i=0;i<rawLines.length;i++){
        const line=rawLines[i]; if(!line.trim()) continue;
        const heading=normalizeSectionHeading(line);
        if(heading){ add(heading.type,heading.number); continue; }
        if(!current) add("Verse",1);
        // Preserve the exact chord row above its lyric row. This is the most reliable
        // representation for WorshipHub's chord-position editor and presentation.
        if(i+1<rawLines.length && isChordOnly(line) && !isChordOnly(rawLines[i+1])){
            const lyric=rawLines[++i];
            current.lines.push({id:uid("line"),lyrics:lyric,chordText:line,chords:chordsFromText(line)});
        } else if(isChordOnly(line)) {
            // Keep a standalone chord row instead of losing it.
            current.lines.push({id:uid("line"),lyrics:"",chordText:line,chords:chordsFromText(line)});
        } else {
            current.lines.push({id:uid("line"),lyrics:line,chordText:"",chords:[]});
        }
    }
    return result.filter(s=>s.lines.some(l=>l.lyrics.trim()||l.chordText.trim()));
}

function parseImportedPage(html,url) {
    const parser=new DOMParser();
    const doc=parser.parseFromString(html,"text/html");

    // Metadata is read only from structured song metadata and clearly-labelled
    // song fields. We intentionally do NOT use arbitrary body text to populate
    // artist/category/language because chord pages often contain unrelated ads,
    // navigation, recommendations and comments.
    let jsonLdItems=[];
    doc.querySelectorAll("script[type='application/ld+json']").forEach(script=>{
        try{
            const parsed=JSON.parse(script.textContent||"{}");
            const items=Array.isArray(parsed)?parsed:(parsed?.["@graph"]||[parsed]);
            items.filter(x=>x&&typeof x==="object").forEach(x=>jsonLdItems.push(x));
        }catch(e){}
    });
    const songJson=jsonLdItems.find(x=>x.name && (x.byArtist||x.author||x.genre||x.inLanguage||x.musicalKey||x.key)) || jsonLdItems.find(x=>x.name) || {};
    const meta=(selectors)=>{
        for(const sel of selectors){
            const el=doc.querySelector(sel);
            const v=cleanImportedText(el?.getAttribute("content")||el?.getAttribute("value")||el?.textContent||"");
            if(v) return v;
        }
        return "";
    };
    const asName=(v)=>cleanImportedText(typeof v==="string"?v:(v?.name||v?.[0]?.name||""));
    const title=cleanImportedText(
        meta(["meta[property='og:title']","meta[name='twitter:title']"]) ||
        asName(songJson.name) ||
        cleanImportedText(doc.querySelector("h1")?.textContent||"") ||
        cleanImportedText(doc.title||"")
    ).replace(/\s*[-|–—]\s*(?:chords?|lyrics?|tabs?|guitar.*)$/i,"").trim();
    const artist=meta(["meta[name='author']","meta[property='music:musician']","meta[name='artist']"]) ||
        asName(songJson.byArtist) || asName(songJson.author) ||
        meta(["[itemprop='byArtist']","[itemprop='author']","[class~='artist']","[class*='artist-name' i]"]);

    const genre=meta(["meta[property='music:genre']","meta[name='genre']","meta[name='category']","meta[name='keywords']"]) || asName(songJson.genre);
    let category="Worship";
    if(/\bhymn\b/i.test(genre)) category="Hymn";
    else if(/\bpraise\b/i.test(genre)) category="Praise";
    else if(/\bother\b/i.test(genre)) category="Other";

    const langValue=meta(["meta[property='og:locale']","meta[name='language']","meta[http-equiv='content-language']","html[lang]"]) || asName(songJson.inLanguage);
    let language="English";
    if(/^(fil|tl|fil-ph|tl-ph)|filipino|tagalog/i.test(langValue)) language="Filipino";
    else if(/^es|spanish/i.test(langValue)) language="Spanish";
    else if(/^ko|korean/i.test(langValue)) language="Korean";
    else if(/^zh|chinese/i.test(langValue)) language="Chinese";
    else if(/^ja|japanese/i.test(langValue)) language="Japanese";

    // Key is extracted only from song/chord-specific labels or structured data.
    // This avoids accidentally picking a key-like string from unrelated page text.
    const keySource=[
        asName(songJson.musicalKey), asName(songJson.key),
        meta(["[itemprop='musicalKey']","[data-key]",".song-key",".original-key",".key"])
    ].filter(Boolean).join(" ");
    const key=guessKey(keySource) || "C";

    // Lyrics/chords come only from the likely song-content container. Remove
    // page chrome, ads, comments, sharing widgets and related content first.
    const main=doc.querySelector("main,article,[role='main'],.song,.song-content,.lyrics,.chords,.tab,.tabs")||doc.body;
    const clone=main.cloneNode(true);
    clone.querySelectorAll("script,style,noscript,svg,nav,footer,header,form,button,aside,[class*=comment i],[class*=related i],[class*=advert i],[class*=ads i],[class*=social i],[class*=share i],[class*=recommend i],[class*=recommended i],[class*=cookie i]").forEach(el=>el.remove());
    const lines=extractChordLines(clone);

    return {
        title,
        artist,
        category,
        key,
        language,
        sourceUrl:url,
        sections:buildSectionsFromImportedText(lines.join("\n"))
    };
}

async function importChordPage() {
    const sourceEl = document.getElementById("editorSourceUrl");
    const url = String(sourceEl?.value || "").trim();
    if (!url) { alert("Please enter the chord page URL first."); sourceEl?.focus(); return; }
    if (!/^https?:\/\//i.test(url)) { alert("Please enter a complete URL starting with http:// or https://"); return; }
    const button = document.getElementById("importChordPageBtn");
    const original = button?.innerHTML;
    if (button) { button.disabled = true; button.innerHTML = "⏳ Importing..."; }
    try {
        let html = "";
        let response;
        try { response = await fetch(url, { mode: "cors", credentials: "omit" }); } catch (e) { response = null; }
        if (response?.ok) html = await response.text();
        else {
            // Fallback for public pages that do not send browser CORS headers.
            const proxy = `https://r.jina.ai/${url}`;
            const proxyResponse = await fetch(proxy, { mode: "cors" });
            if (!proxyResponse.ok) throw new Error(`HTTP ${proxyResponse.status}`);
            html = await proxyResponse.text();
        }
        const imported = parseImportedPage(html, url);
        if (!imported.title && !imported.sections.length) throw new Error("No song content could be detected on that page.");
        document.getElementById("editorSongTitle").value = imported.title || "";
        document.getElementById("editorSongArtist").value = imported.artist || "";
        document.getElementById("editorSongCategory").value = ["Worship","Praise","Hymn","Other"].includes(imported.category) ? imported.category : "Worship";
        document.getElementById("editorSongLanguage").value = imported.language || "English";
        document.getElementById("editorSongKey").value = SHARP_KEYS.includes(imported.key) ? imported.key : "C";
        sections = imported.sections?.length ? wrapImportedSections(imported.sections, 72) : [makeSection("Verse",1)];
        renderEditor();
        alert("Song details and chord/lyric lines were imported. Please review the alignment and metadata before saving.");
    } catch (error) {
        console.error("Chord page import failed:", error);
        alert("Unable to import this page automatically. The site may block browser access or use a layout WorshipHub cannot read. You can still paste the chord/lyric lines into the editor.");
    } finally {
        if (button) { button.disabled = false; button.innerHTML = original || "🔗 Import Chord Page"; }
    }
}

async function saveSong() {
    const user = auth.currentUser;
    const allowed = await canAddSongs(user);
    const existing = editingId ? songs.find(existing => String(existing.id) === String(editingId)) : null;
    const isAdmin = String(user?.email || "").toLowerCase() === ADMIN_EMAIL;
    const isOwner = existing && existing.createdByUid && existing.createdByUid === user?.uid;
    if (!user || (!allowed && !isOwner && !isAdmin)) {
        alert("You do not have permission to add or edit songs.");
        return;
    }
    const title = document.getElementById("editorSongTitle").value.trim();
    if (!title) {
        alert("Please enter the Song Title.");
        return;
    }

    // Prevent duplicate song titles. This applies to both built-in songs and
    // songs created through Add Song. Editing the same song is allowed.
    const duplicateSong = await findDuplicateSongTitle(title, editingId);
    if (duplicateSong) {
        const duplicateTitle = String(duplicateSong.title || title).trim();
        alert(`Song Already Available\n\n"${duplicateTitle}" is already available in WorshipHub.\n\nPlease use a different Song Title.`);
        return;
    }

    // Normalize every chord so the presentation renderer can bind it to <span class="chord">.
    sections = sections.map(section => ({
        ...section,
        lines: (section.lines || []).map(line => ({
            ...line,
            chordText: chordTextFromPositions(line),
            chords: chordsFromText(chordTextFromPositions(line)).map((chord, chordIndex) => ({
                ...chord,
                id: (line.chords || [])[chordIndex]?.id || chord.id || uid("chord")
            }))
        }))
    }));

    const id = editingId || uid("song");
    const song = {
        id,
        title,
        artist: document.getElementById("editorSongArtist").value.trim(),
        category: document.getElementById("editorSongCategory").value,
        language: document.getElementById("editorSongLanguage").value.trim() || "English",
        key: document.getElementById("editorSongKey").value,
        originalKey: document.getElementById("editorSongKey").value,
        // Keep the Service Planner key when editing an existing song. The
        // song's original key may be changed, but an existing service should
        // not silently lose its selected Service Key.
        serviceKey: existing?.serviceKey || existing?.key || document.getElementById("editorSongKey").value,
        youtube: document.getElementById("editorSongYoutube").value.trim(),
        sourceUrl: document.getElementById("editorSourceUrl")?.value.trim() || "",
        file: `custom-song.html?id=${encodeURIComponent(id)}`,
        customSong: true,
        transpose: 0,
        sections: JSON.parse(JSON.stringify(sections)),
        contentVersion: 2,
        linkedChordFormat: "span.chord-above-lyrics",
        createdAt: editingId ? (existing?.createdAt || new Date().toISOString()) : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdByUid: existing?.createdByUid || user.uid,
        createdByEmail: existing?.createdByEmail || user.email || ""
    };

    const index = songs.findIndex(existing => String(existing.id) === String(id));
    if (index >= 0) songs[index] = song;
    else songs.push(song);

    saveCustomSongs();

    // Save permanently so every authenticated user can access the song.
    await saveSongToFirebase(song);
    await refreshCustomSongInServices(song);

    // Notify the main WorshipHub app immediately. This keeps All Songs and
    // the Service Planner picker synchronized without requiring a page reload.
    window.dispatchEvent(new CustomEvent("worshiphub:songs-updated", {
        detail: { song }
    }));

    renderLibrary();
    closeEditor();
    alert("Song saved successfully. It is now available in All Songs and Service Planner.");
}

function renderLibrary() {
    if (typeof window.renderSongs === "function") window.renderSongs(songs);
    if (typeof window.renderAllSongsTable === "function") window.renderAllSongsTable(songs);
}

function previewSong() {
    let modal = document.getElementById("editorPreviewModal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "editorPreviewModal";
        modal.className = "editor-preview-modal";
        modal.innerHTML = `<div class="editor-preview-card"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><h2 id="editorPreviewTitle">Preview</h2><button id="closeEditorPreview" class="editor-secondary">Close</button></div><div id="editorPreviewBody"></div></div>`;
        document.body.appendChild(modal);
        document.getElementById("closeEditorPreview").onclick = () => modal.classList.remove("show");
    }
    document.getElementById("editorPreviewTitle").textContent = document.getElementById("editorSongTitle").value || "Song Preview";
    document.getElementById("editorPreviewBody").innerHTML = sections.map(section => `
        <div class="editor-preview-section">
            <div class="editor-preview-section-title">${esc(section.type)} ${section.number || ""}</div>
            ${section.lines.map(line => {
                const chordText = chordTextFromPositions(line);
                return `<div class="editor-preview-line"><span class="chord">${esc(chordText)}</span><br><span class="editor-preview-lyrics">${esc(line.lyrics)}</span></div>`;
            }).join("")}
        </div>
    `).join("");
    modal.classList.add("show");
}

function addSection() {
    const verseCount = sections.filter(s => s.type === "Verse").length;
    sections.push(makeSection("Verse", verseCount + 1));
    renderEditor();
}

function addLineToLast() {
    if (!sections.length) sections.push(makeSection("Verse", 1));
    sections[sections.length - 1].lines.push(makeLine());
    renderEditor();
}

onAuthStateChanged(auth, user => {
    if (user) loadCustomSongsFromFirebase();
});

document.addEventListener("DOMContentLoaded", () => {
    loadCustomSongs();

    const keySelect = document.getElementById("editorSongKey");
    if (keySelect) keySelect.innerHTML = SHARP_KEYS.map(key => `<option value="${key}">${key}</option>`).join("");

    document.getElementById("addSongBtn")?.addEventListener("click", async () => {
        if (!(await canAddSongs(auth.currentUser))) {
            alert("Adding songs is currently disabled for your account.");
            return;
        }
        openEditor();
    });
    document.getElementById("closeSongEditor")?.addEventListener("click", closeEditor);
    document.getElementById("cancelSongEditor")?.addEventListener("click", closeEditor);
    document.getElementById("saveSongEditor")?.addEventListener("click", saveSong);
    document.getElementById("addEditorSection")?.addEventListener("click", addSection);
    document.getElementById("addEditorLine")?.addEventListener("click", addLineToLast);
    document.getElementById("importChordPageBtn")?.addEventListener("click", importChordPage);
    document.getElementById("editorPreviewBtn")?.addEventListener("click", previewSong);
    document.getElementById("quickImportSong")?.addEventListener("click", () => {
        document.getElementById("addSongBtn")?.click();
        setTimeout(() => document.getElementById("editorSourceUrl")?.focus(), 250);
    });

    window.openSongEditor = openEditor;
    window.closeSongEditor = closeEditor;
    window.WorshipHubSongEditor = { open: openEditor, save: saveSong, deleteFirebaseSong: deleteSongFromFirebase, deleteSong };
});

loadCustomSongs();


// Sidebar shortcut: ask for the chord-page URL first, then open Add Song
// with the imported details ready for review before saving.
document.addEventListener("DOMContentLoaded", () => {
    const importBtn=document.getElementById("importSongBtn");
    importBtn?.addEventListener("click", async () => {
        const url=window.prompt("Paste the chord/song page link to import:");
        if(!url || !url.trim()) return;
        if(!/^https?:\/\//i.test(url.trim())) {
            alert("Please enter a complete URL starting with http:// or https://");
            return;
        }
        document.getElementById("addSongBtn")?.click();
        setTimeout(() => {
            const source=document.getElementById("editorSourceUrl");
            if(source){ source.value=url.trim(); }
            importChordPage();
        }, 180);
    });
    const source=document.getElementById("editorSourceUrl");
    source?.addEventListener("keydown", e => { if(e.key==="Enter"){ e.preventDefault(); importChordPage(); } });
});
