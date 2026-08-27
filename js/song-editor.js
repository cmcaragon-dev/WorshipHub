"use strict";

import { songs } from "./songs.js";
import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { canAddSongs, ADMIN_EMAIL } from "./admin-settings.js";
import { collection, doc, setDoc, deleteDoc, serverTimestamp, getDoc, getDocs, collectionGroup, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const STORAGE_KEY = "worshipHubCustomSongs";
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
    const isAdmin = String(user?.email || "").toLowerCase() === ADMIN_EMAIL;
    const isOwner = song.createdByUid && song.createdByUid === user?.uid;
    if (!isAdmin && !isOwner) {
        alert("Only the song owner or administrator can delete this song.");
        return false;
    }
    if (!confirm(`Delete "${song.title || "Untitled Song"}"? This will also remove its Firebase service/playlist links.`)) return false;
    await deleteSongFromFirebase(id);
    await cleanupSongLinks(song);
    const index = songs.findIndex(s => String(s.id) === String(id));
    if (index >= 0) songs.splice(index, 1);
    saveCustomSongs();
    window.dispatchEvent(new CustomEvent("worshiphub:songs-updated", { detail: { deletedId: id } }));
    if (editingId === id) closeEditor();
    alert("Song deleted successfully.");
    return true;
}

async function loadCustomSongsFromFirebase() {
    try {
        const snap = await getDocs(collection(db, "songs"));
        let changed = false;
        snap.forEach(docSnap => {
            const song = docSnap.data();
            if (!song || song.customSong !== true) return;
            const index = songs.findIndex(existing => String(existing.id) === String(song.id || docSnap.id));
            const normalized = { ...song, id: String(song.id || docSnap.id), customSong: true };
            if (index >= 0) songs[index] = { ...songs[index], ...normalized };
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
            sections[si].lines[li].chordLayout = e.target.value;
        });
    });
}

function chordLayoutFromChords(line) {
    const chords = Array.isArray(line?.chords) ? [...line.chords] : [];
    if (!chords.length) return String(line?.chordLayout || "");
    chords.sort((a,b) => Number(a.position || 0) - Number(b.position || 0));
    let out = "";
    let cursor = 0;
    chords.forEach(c => {
        const position = Math.max(cursor, Number(c.position) || 0);
        out += " ".repeat(Math.max(0, position - cursor));
        const value = String(c.originalChord || c.chord || "").trim();
        out += value;
        cursor = position + value.length;
    });
    return out;
}

function parseChordLayout(layout) {
    const value = String(layout || "");
    const result = [];
    const tokenRe = /\S+/g;
    let match;
    while ((match = tokenRe.exec(value))) {
        const token = match[0].replace(/[|,;]+$/g, "");
        if (!/^[A-Ga-g](?:#|b)?(?:m|maj|min|dim|aug|sus|add)?\d*(?:\/[A-Ga-g](?:#|b)?)?$/.test(token)) continue;
        result.push({
            id: uid("chord"),
            chord: token,
            originalChord: token,
            position: match.index
        });
    }
    return result;
}

function renderLine(line, sectionIndex, lineIndex) {
    const chordLayout = line.chordLayout ?? chordLayoutFromChords(line);
    line.chordLayout = chordLayout;
    return `
        <div class="editor-line" data-section-index="${sectionIndex}" data-line-index="${lineIndex}">
            <div class="editor-line-main">
                <textarea class="editor-chord-input" spellcheck="false" aria-label="Chords above lyrics">${esc(chordLayout)}</textarea>
                <textarea class="editor-lyric-input" data-section-index="${sectionIndex}" data-line-index="${lineIndex}" placeholder="Lyrics">${esc(line.lyrics || "")}</textarea>
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
    const strip = document.querySelector(`.editor-line[data-section-index="${sectionIndex}"][data-line-index="${lineIndex}"] .editor-chord-strip`);
    if (!strip) return;
    const width = Math.max(line.lyrics.length, 1);
    strip.style.minWidth = `${Math.max(520, width * 9.6 + 30)}px`;
    strip.innerHTML = (line.chords || []).map((item, chordIndex) => {
        const left = 8 + (item.position * 9.6);
        return `<span class="editor-chord-chip" data-chord-index="${chordIndex}" style="left:${left}px">${esc(item.chord)}</span>`;
    }).join("");
    strip.querySelectorAll(".editor-chord-chip").forEach(chip => {
        chip.addEventListener("click", event => {
            event.stopPropagation();
            const updated = prompt("Chord:", line.chords[Number(chip.dataset.chordIndex)].chord);
            if (updated === null) return;
            const value = updated.trim();
            if (!value) line.chords.splice(Number(chip.dataset.chordIndex), 1);
            else {
                line.chords[Number(chip.dataset.chordIndex)].chord = value;
                line.chords[Number(chip.dataset.chordIndex)].originalChord = value;
            }
            refreshChordStrip(sectionIndex, lineIndex);
        });
    });
}

function addChordAtClick(event) {
    const strip = event.currentTarget;
    const [si, li] = getLineIndexes(strip);
    const line = sections[si].lines[li];
    const rect = strip.getBoundingClientRect();
    const position = Math.max(0, Math.min(line.lyrics.length, Math.round((event.clientX - rect.left - 8) / 9.6)));
    const chord = prompt(`Chord at character ${position}:`, "C");
    if (chord === null || !chord.trim()) return;
    line.chords.push({ id: uid("chord"), chord: chord.trim(), originalChord: chord.trim(), position });
    line.chords.sort((a,b) => a.position - b.position);
    refreshChordStrip(si, li);
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

    // Normalize every chord so the presentation renderer can bind it to <span class="chord">.
    sections = sections.map(section => ({
        ...section,
        lines: (section.lines || []).map(line => ({
            ...line,
            chordLayout: String(line.chordLayout ?? chordLayoutFromChords(line)),
            chords: parseChordLayout(String(line.chordLayout ?? chordLayoutFromChords(line)))
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
        serviceKey: document.getElementById("editorSongKey").value,
        youtube: document.getElementById("editorSongYoutube").value.trim(),
        file: `custom-song.html?id=${encodeURIComponent(id)}`,
        customSong: true,
        isHTMLContent: true,
        transpose: 0,
        sections: JSON.parse(JSON.stringify(sections)),
        contentVersion: 1,
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
                const chordLayout = String(line.chordLayout ?? chordLayoutFromChords(line));
                return `<div class="editor-preview-line"><div class="editor-preview-chords">${esc(chordLayout)}</div><div class="editor-preview-lyrics">${esc(line.lyrics || "")}</div></div>`;
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
    document.getElementById("editorPreviewBtn")?.addEventListener("click", previewSong);

    window.openSongEditor = openEditor;
    window.closeSongEditor = closeEditor;
    window.WorshipHubSongEditor = { open: openEditor, save: saveSong, deleteFirebaseSong: deleteSongFromFirebase, deleteSong };
});

loadCustomSongs();
