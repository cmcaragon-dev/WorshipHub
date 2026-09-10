"use strict";

import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { songs as worshipHubSongs } from "./initial-songs.js";

const SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const FLATS = { Db:"C#", Eb:"D#", Gb:"F#", Ab:"G#", Bb:"A#" };
let song = null, transposeSteps = 0, fontSize = 3, service = null, index = 0, authResolved = false, loading = false;

const esc = value => String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
const noteToIndex = note => SHARP.indexOf(FLATS[note] || note);
const transposeNote = (note, steps) => { const i = noteToIndex(note); return i < 0 ? note : SHARP[((i + steps) % 12 + 12) % 12]; };

function transposeChord(chord, steps = transposeSteps) {
    const value = String(chord ?? "");
    if (!value.trim()) return "";

    // Transpose every chord token in a chord span, including sharp/flat
    // chords such as Bm, C#m and F#m, while preserving all whitespace.
    const transposeToken = token => {
        const rootMatch = token.match(/^([A-Ga-g])([#b]?)/);
        if (!rootMatch) return token;

        const root = rootMatch[1].toUpperCase() + rootMatch[2];
        let result = transposeNote(root, Number(steps) || 0) + token.slice(rootMatch[0].length);
        return result.replace(/\/([A-Ga-g])([#b]?)(?=$|[^A-Za-z])/g,
            (_, letter, accidental) =>
                "/" + transposeNote(letter.toUpperCase() + accidental, Number(steps) || 0)
        );
    };

    return value.replace(/\S+/g, transposeToken);
}

function normalizeChord(chord, index = 0) {
    if (typeof chord === "string") return { id:`chord-${index}`, chord:chord.trim(), originalChord:chord.trim(), position:0 };
    const value = String(chord?.originalChord || chord?.chord || chord?.value || "").trim();
    return { ...chord, id: chord?.id || `chord-${index}`, chord:value, originalChord:value, position:Math.max(0, Number(chord?.position) || 0) };
}

function chordRowFromPositionsNoTranspose(line) {
    const chords = Array.isArray(line?.chords) ? line.chords : [];
    if (typeof line?.chordText === "string") return line.chordText;
    if (!chords.length) return "";
    const chars=[];
    chords.slice().sort((a,b)=>(Number(a.position)||0)-(Number(b.position)||0)).forEach(c=>{
        const p=Math.max(0,Number(c?.position)||0);
        const t=String(c?.originalChord||c?.chord||"").trim();
        while(chars.length<p) chars.push(" ");
        Array.from(t).forEach((ch,i)=>{chars[p+i]=ch;});
    });
    return chars.join("");
}

function normalizeSections(raw) {
    return (Array.isArray(raw) ? raw : []).map(section => ({
        ...section,
        lines:(Array.isArray(section?.lines) ? section.lines : []).map(line => ({
            ...line,
            lyrics:String(line?.lyrics || ""),
            chordText: typeof line?.chordText === "string" ? line.chordText : chordRowFromPositionsNoTranspose(line),
            chords:(Array.isArray(line?.chords) ? line.chords : []).map(normalizeChord)
        }))
    }));
}


function getAvailableColumnWidth(element) {
    if (!element) return Math.max(180, window.innerWidth - 40);
    const styles = window.getComputedStyle(element);
    const columns = Math.max(1, parseInt(styles.columnCount || "1", 10) || 1);
    const gap = parseFloat(styles.columnGap || "0") || 0;
    if (columns > 1) return Math.max(180, (element.clientWidth - gap * (columns - 1)) / columns);
    return Math.max(180, element.clientWidth);
}

function sizeSongColumnsToContent(stage) {
    if (!stage || !song) return;

    // SONG PAGE: there is intentionally NO two-column/content-column
    // restriction.  Size the single song canvas from ONLY the currently
    // selected song's longest lyric/chord row.  This makes the white
    // background follow the actual song instead of the whole library.
    const currentSections = normalizeSections(song.sections || []);
    const currentLines = currentSections.flatMap(section => section.lines || []);
    if (!currentLines.length) {
        stage.style.removeProperty("--wh-song-stage-width");
        stage.style.removeProperty("--wh-song-content-width");
        stage.style.removeProperty("width");
        stage.dataset.measuredSong = String(song.id || song.title || "");
        return;
    }

    const measuredFontSize = 20 + fontSize;
    const canvas = sizeSongColumnsToContent.canvas || (sizeSongColumnsToContent.canvas = document.createElement("canvas"));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.font = `${measuredFontSize}px Consolas, Monaco, "Courier New", monospace`;

    let longest = 0;
    currentLines.forEach(line => {
        const lyrics = String(line?.lyrics || "");
        const chords = String(line?.chordText || chordRowFromPositionsNoTranspose(line) || "");
        longest = Math.max(longest, ctx.measureText(lyrics).width, ctx.measureText(chords).width);
    });

    // The background follows the longest visible row.  Do not cap it to two
    // columns or to a fixed desktop width.  On a small screen the page can
    // horizontally scroll rather than shrinking/reflowing the chord grid.
    const horizontalPadding = 56;
    const contentWidth = Math.max(260, Math.ceil(longest));
    const stageWidth = Math.max(320, Math.ceil(contentWidth + horizontalPadding));

    stage.style.setProperty("--wh-song-content-width", `${contentWidth}px`);
    stage.style.setProperty("--wh-song-stage-width", `${stageWidth}px`);
    stage.style.width = `${stageWidth}px`;
    stage.style.maxWidth = "none";
    stage.dataset.measuredSong = String(song.id || song.title || "");
}

function measureWrapLimit(element, fontSizePx) {
    const width = getAvailableColumnWidth(element);
    const canvas = measureWrapLimit.canvas || (measureWrapLimit.canvas = document.createElement("canvas"));
    const ctx = canvas.getContext("2d");
    if (!ctx) return Math.max(18, Math.floor(width / (Number(fontSizePx) * 0.6)));
    ctx.font = `${Number(fontSizePx) || 23}px Consolas, "Courier New", monospace`;
    const sample = Math.max(1, ctx.measureText("M").width);
    return Math.max(18, Math.floor((width - 8) / sample));
}

function wrapSongLine(line, maxChars) {
    const lyrics = String(line?.lyrics || "");
    const chordText = String(line?.chordText || chordRowFromPositionsNoTranspose(line) || "");
    const sourceLength = Math.max(lyrics.length, chordText.length);
    if (sourceLength <= maxChars) return [{...line, lyrics, chordText}];

    const rows = [];
    let start = 0;
    while (start < sourceLength) {
        let end = Math.min(sourceLength, start + maxChars);
        if (end < sourceLength) {
            const lyricPart = lyrics.slice(start, end);
            const at = Math.max(lyricPart.lastIndexOf(" "), lyricPart.lastIndexOf("\\t"));
            if (at >= Math.floor(maxChars * 0.55)) end = start + at + 1;
        }
        if (end <= start) end = Math.min(sourceLength, start + maxChars);

        rows.push({
            ...line,
            id: `${line?.id || "line"}-${start}`,
            lyrics: lyrics.slice(start, end),
            // Keep the chord row on the exact same character grid as the lyric slice.
            chordText: chordText.slice(start, end),
            chords: []
        });
        start = end;
    }
    return rows;
}

function wrappedSectionsForDisplay(sections, element, fontSizePx) {
    const limit = measureWrapLimit(element, fontSizePx);
    return (sections || []).map(section => ({
        ...section,
        lines: (section.lines || []).flatMap(line => wrapSongLine(line, limit))
    }));
}

function currentKey(){ return song?.originalKey || song?.key || song?.serviceKey || ""; }

function render() {
    if (!song) return;
    document.getElementById("songTitle")?.replaceChildren(document.createTextNode(song.title || "Untitled Song"));
    document.getElementById("songArtist")?.replaceChildren(document.createTextNode(song.artist || ""));
    const key = document.getElementById("songKey");
    if (key) key.textContent = transposeChord(currentKey(), transposeSteps) || "—";
    const stage = document.getElementById("stage");
    if (!stage) return;
    sizeSongColumnsToContent(stage);
    const sections = normalizeSections(song.sections);
    if (!sections.length) { stage.innerHTML = '<div class="empty">Song unavailable.</div>'; updateCounter(); return; }

    stage.innerHTML = sections.map((section, si) => `
        <section class="section" data-section-index="${si}">
            <div class="section-title">${esc(section.type)} ${esc(section.number || "")}</div>
            ${section.lines.map((line, li) => `
                <div class="line song-line" data-section-index="${si}" data-line-index="${li}">
                    <span class="chord" style="font-size:${20 + fontSize}px !important;line-height:${20 + fontSize}px !important" data-chord-text="true" data-original-chord="${esc(line.chordText || chordRowFromPositionsNoTranspose(line))}">${esc(transposeChord(line.chordText || chordRowFromPositionsNoTranspose(line), transposeSteps))}</span><br>
                    <span class="lyrics" style="font-size:${20 + fontSize}px !important">${esc(line.lyrics)}</span>
                </div>`).join("")}
        </section>`).join("");

    // Guarantee that every Add Song chord is a real .chord span and is transposed from its original value.
    stage.querySelectorAll(".chord").forEach(span => {
        const original = span.dataset.originalChord || span.textContent || "";
        span.textContent = transposeChord(original, transposeSteps);
    });
    sizeSongColumnsToContent(stage);
    updateCounter();
}

function updateCounter(){
    const counter = document.getElementById("counter");
    if(counter) counter.textContent = service?.songs?.length ? `Song ${index + 1} / ${service.songs.length}` : "Custom Song";
    const prev = document.getElementById("prev"), next = document.getElementById("next");
    if(prev) prev.disabled = !(service && index > 0);
    if(next) next.disabled = !(service && index < service.songs.length - 1);
    const presentationPrev = document.getElementById("customPresentationPrev");
    const presentationNext = document.getElementById("customPresentationNext");
    const presentationPrevBottom = document.getElementById("customPresentationPrevBottom");
    const presentationNextBottom = document.getElementById("customPresentationNextBottom");
    if(presentationPrev) presentationPrev.disabled = !(service && index > 0);
    if(presentationNext) presentationNext.disabled = !(service && index < service.songs.length - 1);
    if(presentationPrevBottom) presentationPrevBottom.disabled = !(service && index > 0);
    if(presentationNextBottom) presentationNextBottom.disabled = !(service && index < service.songs.length - 1);
}

function normalizedServiceSongKey(){
    return transposeChord(currentKey(), transposeSteps) || currentKey() || "C";
}

function showTransposeSavedNotification(serviceName, serviceKey){
    const existing = document.getElementById("transposeSavedNotification");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "transposeSavedNotification";
    toast.className = "transpose-saved-notification";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    const name = String(serviceName || "Selected Service Planner");
    const key = String(serviceKey || "");
    toast.innerHTML = `<span class="transpose-saved-icon">✓</span><span><strong>Transpose Saved</strong><small>Saved to ${esc(name)}${key ? ` • Service Key: ${esc(key)}` : ""}</small></span>`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    window.setTimeout(() => {
        toast.classList.remove("show");
        window.setTimeout(() => toast.remove(), 250);
    }, 2600);
}

async function saveTransposeToSelectedService(){
    const serviceId = localStorage.getItem("currentServiceId");
    if(!serviceId || !auth.currentUser || !service?.songs?.[index] || !song) return;

    const serviceSong = service.songs[index];
    const transposedKey = normalizedServiceSongKey();

    // Keep the original song key untouched. The selected Service Planner
    // receives the current transposed key in serviceKey and the semitone
    // offset in transpose so the same setting can be restored later.
    const updatedServiceSong = {
        ...serviceSong,
        serviceKey: transposedKey,
        transpose: Number(transposeSteps) || 0
    };

    const updatedSongs = service.songs.map((item, i) => i === index ? updatedServiceSong : item);
    const updatedService = { ...service, songs: updatedSongs };

    try {
        await setDoc(
            doc(db, "users", auth.currentUser.uid, "services", String(serviceId)),
            { songs: updatedSongs, updatedAt: serverTimestamp() },
            { merge: true }
        );
        service = updatedService;
        localStorage.setItem("currentSongIndex", String(index));
        // Store a small client-side snapshot as well. This makes the index
        // planner reflect the new key immediately after returning to it.
        localStorage.setItem("worshipHubServiceKeyUpdate", JSON.stringify({
            serviceId: String(serviceId),
            songId: String(updatedServiceSong.id || ""),
            serviceKey: transposedKey,
            transpose: Number(transposeSteps) || 0,
            updatedAt: Date.now()
        }));
        window.dispatchEvent(new CustomEvent("worshiphub:service-updated", {
            detail: { id: serviceId, service: updatedService }
        }));

        // Confirm to the user that the transposed chords/key were persisted
        // to the exact Service Planner currently being used.
        showTransposeSavedNotification(
            updatedService.name || service.name || "Selected Service Planner",
            transposedKey
        );
    } catch(error){
        console.error("Unable to save Service Planner transpose:", error);
        // The visual transpose still works locally, but make the failure clear
        // so the user knows the Service Planner value was not persisted.
        alert("The song was transposed, but the Service Planner key could not be saved. Please check your Firebase permissions.");
    }
}

function setTranspose(delta){
    transposeSteps += Number(delta) || 0;
    if(transposeSteps > 11) transposeSteps -= 12;
    if(transposeSteps < -11) transposeSteps += 12;
    render();
    if(service?.songs?.[index]) void saveTransposeToSelectedService();
}

async function redirectSong(nextSong, targetIndex=index){
    if(!nextSong)return;
    localStorage.setItem("currentSongIndex",String(targetIndex));
    localStorage.setItem("resumePresentation","true");
    if(localStorage.getItem("currentServiceId")) localStorage.setItem("presentationMode","service");

    // Presentation navigation stays on the current page. This avoids a full
    // HTML/Firebase reload every time Next/Previous is pressed.
    const presentation=document.getElementById("customPresentationScreen");
    if(presentation?.classList.contains("show") && service?.songs?.[targetIndex]){
        index=targetIndex;
        customPresentationSectionIndex=0;
        const candidate=service.songs[index];
        // Render the Service Planner snapshot immediately. Never wait for the
        // master /songs document before showing the next song. The master copy
        // is refreshed in the background and only replaces the content after
        // the new song is already visible.
        song={
            ...candidate,
            sections:normalizeSections(candidate.sections),
            serviceKey:candidate.serviceKey || candidate.key,
            transpose:Number(candidate.transpose || 0)
        };
        transposeSteps=Number(song.transpose||0);
        render();
        renderCustomPresentation();
        updateCounter();
        renderCustomNextPreview();

        if(candidate?.id){
            void refreshMasterSong(candidate.id).then(master=>{
                if(!master || String(song?.id||"")!==String(candidate.id||"")) return;
                song={
                    ...song, ...master,
                    sections:normalizeSections(master.sections),
                    serviceKey:candidate.serviceKey || master.serviceKey || master.key || candidate.key,
                    transpose:Number(candidate.transpose ?? master.transpose ?? 0)
                };
                transposeSteps=Number(song.transpose||0);
                render();
                if(document.getElementById("customPresentationScreen")?.classList.contains("show")) renderCustomPresentation();
            });
        }
        return;
    }

    if(nextSong.customSong===true || String(nextSong.file||"").startsWith("custom-song.html")){
        window.location.assign(`custom-song.html?id=${encodeURIComponent(nextSong.id||"")}`); return;
    }
    alert("The selected song is not available in the structured song library.");
}

async function loadFromService(){
    const serviceId = localStorage.getItem("currentServiceId");
    if(!serviceId) return false;
    try {
        // Prefer the confirmed local snapshot. This also lets Guest mode keep
        // working with a service that was opened before the user signed out.
        let cached = null;
        try { cached = JSON.parse(localStorage.getItem("currentServiceSnapshot") || "null"); } catch(e) {}
        if(cached && String(cached.id) === String(serviceId) && Array.isArray(cached.songs)){
            service = cached;
        } else if(auth.currentUser) {
            const snap = await getDoc(doc(db,"users",auth.currentUser.uid,"services",String(serviceId)));
            if(!snap.exists()) return false;
            service = {id:snap.id,...snap.data()};
        } else {
            return false;
        }
        // Restore backgrounds from THIS Service Planner only.
        loadServiceScopedMultiBackground();
        if(!Array.isArray(service.songs) || !service.songs.length) return false;

        const params=new URLSearchParams(location.search);
        const requestedId=params.get("id");
        // A service may intentionally contain the SAME song more than once.
        // Preserve the service position from currentSongIndex instead of
        // findIndex(), which would always jump back to the first copy.
        if(index < 0 || index >= service.songs.length){
            index=0;
        }
        if(requestedId && String(service.songs[index]?.id||"") !== String(requestedId)){
            const requestedMatches=[];
            service.songs.forEach((s,i)=>{
                if(String(s?.id||"")===String(requestedId)) requestedMatches.push(i);
            });
            if(requestedMatches.length && !requestedMatches.includes(index)) index=requestedMatches[0];
        }

        const candidate=service.songs[index];
        if(!candidate) return false;

        // Service Planner stores a snapshot of the song. For Add Song entries,
        // the master document in /songs is the source of truth after an edit.
        // Load that master copy and only keep service-specific values such as
        // Service Key and transpose. This makes edits immediately visible in
        // both the normal song page and Presentation mode even if an older
        // service snapshot still exists.
        // Render the service snapshot immediately. It already contains the song
        // content, so presentation startup does not wait for another Firestore
        // document read. Refresh from the master copy in the background only.
        song={...candidate,sections:normalizeSections(candidate.sections)};
        if(candidate.customSong===true || String(candidate.file||"").startsWith("custom-song.html")){
            void refreshMasterSong(candidate.id).then(master=>{
                if(!master) return;
                if(String(song?.id||"")!==String(candidate.id||"")) return;
                song={
                    ...song,
                    ...master,
                    sections:normalizeSections(master.sections),
                    serviceKey:candidate.serviceKey || master.serviceKey || master.key,
                    transpose:Number(candidate.transpose ?? master.transpose ?? 0)
                };
                transposeSteps=Number(song.transpose||0);
                render();
                if(document.getElementById("customPresentationScreen")?.classList.contains("show")) renderCustomPresentation();
            }).catch(()=>{});
        }
        localStorage.setItem("currentSongIndex",String(index));
        return true;
    } catch(error){ console.error("Unable to load Service Planner:",error); return false; }
}
async function refreshMasterSong(id){
    if(!id) return null;
    const cacheKey=`worshipHubSongCache:${String(id)}`;
    try{
        const snap=await getDoc(doc(db,"songs",String(id)));
        if(!snap.exists()) return null;
        const master={id:snap.id,...snap.data(),sections:normalizeSections(snap.data()?.sections)};
        try{localStorage.setItem(cacheKey,JSON.stringify({savedAt:Date.now(),song:master}));}catch(_){}
        return master;
    }catch(error){
        console.warn("Unable to refresh Firebase song:",error);
        return null;
    }
}

function loadCachedFirebaseSong(id){
    if(!id) return false;
    try{
        const raw=localStorage.getItem(`worshipHubSongCache:${String(id)}`);
        if(!raw) return false;
        const cached=JSON.parse(raw);
        const data=cached?.song;
        if(!data || !Array.isArray(data.sections)) return false;
        song={...data,sections:normalizeSections(data.sections)};
        return true;
    }catch(_){ return false; }
}

async function loadFromFirebaseSong(id){
    if(!id) return false;
    // Use a previously loaded master song immediately, then refresh it in the
    // background. This removes the Firestore round-trip from the visible load
    // path when the user has already opened the song before.
    if(loadCachedFirebaseSong(id)){
        void refreshMasterSong(id).then(master=>{
            if(!master || String(song?.id||"")!==String(id)) return;
            song={...master,sections:normalizeSections(master.sections)};
            transposeSteps=Number(song.transpose||0);
            render();
        });
        return true;
    }
    const master=await refreshMasterSong(id);
    if(master){
        song=master;
        return true;
    }
    return false;
}

function loadFromLocalCustomSong(id){
    if(!id) return false;
    try { const list=JSON.parse(localStorage.getItem("worshipHubCustomSongs")||"[]"); const found=list.find(s=>String(s.id)===String(id)); if(found){song={...found,sections:normalizeSections(found.sections)}; return true;} }
    catch(error){ console.warn("Unable to load custom song:",error); }
    return false;
}

let bootPromise=null;
let customPresentationSectionIndex=0;
async function load(){
    if(bootPromise) return bootPromise;
    bootPromise=(async()=>{
        if(loading || song) return !!song;
        loading=true;
        const params=new URLSearchParams(location.search);
        const id=params.get("id");
        index=Number(localStorage.getItem("currentSongIndex")||0);
        const hasService=!!localStorage.getItem("currentServiceId");
        const resumePresentation=localStorage.getItem("resumePresentation")==="true";

        // A service requires the authenticated UID. Do not start a competing
        // direct-song read before Auth resolves; that used to cause duplicate
        // Firestore reads and a race between the service and song loaders.
        let found=false;
        if(hasService && resumePresentation){
            if(!auth.currentUser){ loading=false; return false; }
            found=await loadFromService();
        }else{
            // Prefer local sources for direct Song Page opens. A locally saved
            // Add Song must never wait for Firebase before it can be displayed.
            found=loadFromLocalCustomSong(id);
            if(!found) found=loadCachedFirebaseSong(id);

            if(found){
                // Refresh Firebase only after the song is already visible.
                if(id){
                    void refreshMasterSong(id).then(master=>{
                        if(!master || String(song?.id||"")!==String(id||"")) return;
                        song={...song,...master,sections:normalizeSections(master.sections)};
                        transposeSteps=Number(song.transpose||0);
                        render();
                        if(multiScreenIsOutput){multiScreenLastOutputState=multiScreenMessage();renderMultiScreenOutput(multiScreenLastOutputState);}
                    }).catch(()=>{});
                }
            }else{
                found=await loadFromFirebaseSong(id);
            }
            if(!found) service=null;
        }

        if(!found){
            document.getElementById("stage")?.replaceChildren(Object.assign(document.createElement("div"),{className:"empty",textContent:"Song could not be loaded."}));
            updateCounter(); loading=false; return false;
        }
        transposeSteps=Number(song.transpose||0);
        render();
        if(multiScreenIsOutput){
            multiScreenLastOutputState=multiScreenMessage();
            renderMultiScreenOutput(multiScreenLastOutputState);
        }
        loading=false;

        const paramsAfterLoad = new URLSearchParams(location.search);
        const startMultiScreenOnLoad = paramsAfterLoad.get("multiScreenStart") === "1" || localStorage.getItem("startMultiScreenOnLoad") === "true";
        if(startMultiScreenOnLoad){
            try{localStorage.removeItem("startMultiScreenOnLoad");}catch(_){}
            localStorage.setItem("presentationMode","service");
            setTimeout(() => {
                try {
                    multiScreenOpenControl();
                    renderMultiScreenControl();
                    multiScreenBroadcast({sectionIndex:multiScreenCurrentSection});
                } catch(error) {
                    console.warn("Unable to auto-open Multi-Screen:", error);
                }
            }, 120);
        } else if(resumePresentation && service && service.songs?.length){
            localStorage.setItem("presentationMode","service");
            setTimeout(() => { void startCustomPresentation(); }, 0);
        }
        return true;
    })();
    try{return await bootPromise;}finally{bootPromise=null;}
}

function chordRowFromPositions(line) {
    // chordText is the exact monospace row entered in Add Song. Keep every
    // space and every character position; only transpose the chord tokens.
    const stored = typeof line?.chordText === "string" ? line.chordText : "";
    if (stored.length || !Array.isArray(line?.chords) || !line.chords.length) {
        if (!stored.length) return "";
        return stored.replace(/\S+/g, token => transposeChord(token, transposeSteps));
    }

    const chords = line.chords;
    const maxEnd = chords.reduce((max,c)=>{
        const p=Math.max(0,Number(c?.position)||0);
        const t=String(c?.originalChord||c?.chord||"").trim();
        return Math.max(max,p+t.length);
    }, 1);
    const chars=Array.from({length:maxEnd},()=>" ");
    chords.slice().sort((a,b)=>(Number(a.position)||0)-(Number(b.position)||0)).forEach(c=>{
        const p=Math.max(0,Number(c?.position)||0);
        const t=transposeChord(String(c?.originalChord||c?.chord||""),transposeSteps);
        Array.from(t).forEach((ch,i)=>{const at=p+i;if(at>=chars.length)chars.push(ch);else chars[at]=(chars[at]===" "?ch:chars[at]+ch);});
    });
    return chars.join("");
}
function normalizePassingKey(value){
    const v=String(value||"C").trim().replace(/\s*(major|minor|maj|m)\s*$/i,"").replace(/[♯]/g,"#").replace(/[♭]/g,"b");
    return v || "C";
}
function passingKeyIndex(key){
    const sharp=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
    const flat={Db:"C#",Eb:"D#",Gb:"F#",Ab:"G#",Bb:"A#"};
    const root=normalizePassingKey(key).match(/^[A-G](?:#|b)?/i)?.[0]||"C";
    return sharp.indexOf(flat[root]||root);
}
function passingTransposeKey(key, steps){
    const sharp=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
    const flat=["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
    const source=normalizePassingKey(key), root=source.match(/^[A-G](?:#|b)?/i)?.[0]||"C";
    const idx=(passingKeyIndex(root)+Number(steps||0)+120)%12;
    return /b/.test(root) ? flat[idx] : sharp[idx];
}
function customServiceKey(){
    const serviceSong=service?.songs?.[index];
    return normalizePassingKey(serviceSong?.serviceKey || serviceSong?.key || song?.serviceKey || song?.key || song?.originalKey || "C");
}
function customPassingChords(){
    const key=customServiceKey();
    const result=[
        ["RETURN TO VERSE 1",passingTransposeKey(key,7)],
        ["LAST 3",passingTransposeKey(key,9)+"m"]
    ];
    if(String(song?.category||song?.genre||"").trim().toLowerCase()==="worship"){
        const plus5=passingTransposeKey(key,5);
        result.push(["OUTRO",`${plus5} → ${plus5}m → ${key}`]);
        result.push(["SINGING IN THE SPIRIT",`${key} → ${plus5}`]);
    }
    return result;
}
function renderCustomPassingChords(){
    const box=document.getElementById("customPresentationPassing");
    if(!box)return;
    const items=customPassingChords();
    box.className="custom-presentation-passing";
    box.innerHTML=items.map(([label,value],i)=>
        `${i?'<span class="custom-presentation-passing-separator">|</span>':''}<span class="custom-presentation-passing-item"><span class="custom-presentation-passing-label">${esc(label)}:</span><span class="custom-presentation-passing-value">${esc(value)}</span></span>`
    ).join("");
}


const PRESENTATION_LAYOUT_PREFIX = "chordioPresentationLayout:";

function presentationLayoutStorageKey(){
    const serviceId=localStorage.getItem("currentServiceId") || "standalone";
    return PRESENTATION_LAYOUT_PREFIX + String(serviceId) + ":" + String(song?.id || new URLSearchParams(location.search).get("id") || song?.title || "song");
}
function defaultPresentationLayout(){
    return normalizeSections(song?.sections || []).map((section,index)=>({id:index,type:String(section?.type||""),number:String(section?.number||""),visible:true}));
}
function getPresentationLayout(){
    const defaults=defaultPresentationLayout();
    const serviceLayouts=service?.presentationLayouts || {};
    const serviceId=localStorage.getItem("currentServiceId");
    const serviceSaved=serviceId && song?.id ? serviceLayouts[String(song.id)] : null;
    try{
        const raw=serviceSaved || JSON.parse(localStorage.getItem(presentationLayoutStorageKey())||"null");
        if(!Array.isArray(raw)||!raw.length)return defaults;
        const byId=new Map(defaults.map(item=>[Number(item.id),item])), result=[];
        raw.forEach(item=>{const id=Number(item?.id);if(!byId.has(id))return;result.push({...byId.get(id),visible:item.visible!==false});byId.delete(id);});
        byId.forEach(item=>result.push(item));
        return result;
    }catch(_){return defaults;}
}
async function savePresentationLayout(layout){
    try{localStorage.setItem(presentationLayoutStorageKey(),JSON.stringify(layout));}catch(_){}
    const serviceId=localStorage.getItem("currentServiceId");
    if(!serviceId || !song?.id || !service) return true;
    const presentationLayouts={...(service.presentationLayouts||{}),[String(song.id)]:layout};
    service={...service,presentationLayouts};
    try{localStorage.setItem("currentServiceSnapshot",JSON.stringify(service));}catch(_){}
    if(auth.currentUser){
        try{
            await setDoc(doc(db,"users",auth.currentUser.uid,"services",String(serviceId)),{presentationLayouts,updatedAt:serverTimestamp()},{merge:true});
            return true;
        }catch(error){console.warn("Unable to save service-specific presentation structure:",error);return false;}
    }
    return true;
}
function applyPresentationLayout(sections){
    const source=normalizeSections(sections||[]), ordered=[];
    getPresentationLayout().forEach(item=>{const section=source[Number(item.id)];if(section&&item.visible!==false)ordered.push(section);});
    return ordered;
}
function presentationSectionLabel(section,index){
    return `${section?.type||""} ${section?.number||""}`.trim() || `Section ${index+1}`;
}
function renderPresentationLayoutPanel(){
    const panel=document.getElementById("customPresentationLayoutPanel"), list=document.getElementById("customPresentationLayoutList");
    if(!panel||!list||!song)return;
    const layout=getPresentationLayout(); list.innerHTML="";
    layout.forEach((item,pos)=>{
        const row=document.createElement("div");row.className="custom-layout-row"+(item.visible===false?" is-hidden":"");
        const num=document.createElement("span");num.className="custom-layout-number";num.textContent=String(pos+1);
        const name=document.createElement("span");name.className="custom-layout-name";name.textContent=presentationSectionLabel(song.sections?.[item.id],item.id);
        const up=document.createElement("button");up.type="button";up.className="custom-layout-move";up.textContent="↑";up.title="Move section up";up.disabled=pos===0;
        up.onclick=()=>{const next=getPresentationLayout();[next[pos-1],next[pos]]=[next[pos],next[pos-1]];void savePresentationLayout(next).then(()=>{customPresentationSectionIndex=0;renderPresentationLayoutPanel();renderCustomPresentation();});};
        const down=document.createElement("button");down.type="button";down.className="custom-layout-move";down.textContent="↓";down.title="Move section down";down.disabled=pos===layout.length-1;
        down.onclick=()=>{const next=getPresentationLayout();[next[pos],next[pos+1]]=[next[pos+1],next[pos]];void savePresentationLayout(next).then(()=>{customPresentationSectionIndex=0;renderPresentationLayoutPanel();renderCustomPresentation();});};
        const visible=document.createElement("label");visible.className="custom-layout-visible";
        const check=document.createElement("input");check.type="checkbox";check.checked=item.visible!==false;
        check.onchange=()=>{const next=getPresentationLayout();next[pos].visible=check.checked;void savePresentationLayout(next).then(()=>{customPresentationSectionIndex=0;renderPresentationLayoutPanel();renderCustomPresentation();});};
        visible.append(check,document.createTextNode("Show"));row.append(num,name,up,down,visible);list.appendChild(row);
    });
}
function bindPresentationLayoutControls(){
    const btn=document.getElementById("customPresentationLayout"),panel=document.getElementById("customPresentationLayoutPanel");
    const close=document.getElementById("customPresentationLayoutClose"),reset=document.getElementById("customPresentationLayoutReset");
    if(btn&&!btn.dataset.bound){btn.dataset.bound="1";btn.onclick=()=>{if(!panel)return;renderPresentationLayoutPanel();panel.hidden=!panel.hidden;};}
    if(close&&!close.dataset.bound){close.dataset.bound="1";close.onclick=()=>{if(panel)panel.hidden=true;};}
    if(reset&&!reset.dataset.bound){reset.dataset.bound="1";reset.onclick=()=>{void savePresentationLayout(defaultPresentationLayout()).then(()=>{customPresentationSectionIndex=0;renderPresentationLayoutPanel();renderCustomPresentation();});};}
}

function renderCustomPresentation(){
    const output=document.getElementById("customPresentationLyrics");
    if(!output||!song)return;
    output.innerHTML="";

    const grid=document.createElement("div");
    grid.className="custom-presentation-grid";
    output.appendChild(grid);

    // ONE COLUMN ONLY: every section remains in normal reading order.
    const column=document.createElement("div");
    column.className="custom-presentation-column";
    grid.appendChild(column);

    const sections=wrappedSectionsForDisplay(applyPresentationLayout(song.sections), output, 32);
    customPresentationSectionIndex=Math.max(0, Math.min(customPresentationSectionIndex, sections.length-1));

    sections.forEach((section,sectionIndex)=>{
        const sec=document.createElement("section");
        sec.className="custom-presentation-section";
        sec.dataset.sectionIndex=String(sectionIndex);
        sec.id=`customPresentationSection-${sectionIndex}`;
        const title=document.createElement("div");
        title.className="custom-presentation-section-title";
        title.textContent=`${section.type||""} ${section.number||""}`.trim();
        sec.appendChild(title);

        (section.lines||[]).forEach(line=>{
            const pair=document.createElement("div");
            pair.className="custom-presentation-line";
            const chordText=chordRowFromPositions(line);
            if(chordText){
                const ch=document.createElement("div");
                ch.className="custom-presentation-chord";
                ch.textContent=chordText;
                pair.appendChild(ch);
            }
            const ly=document.createElement("div");
            ly.className="custom-presentation-lyric";
            ly.textContent=String(line.lyrics||"");
            pair.appendChild(ly);
            sec.appendChild(pair);
        });
        column.appendChild(sec);
    });

    const t=document.getElementById("customPresentationTitle");
    if(t)t.textContent=song.title||"Untitled Song";
    const k=document.getElementById("customPresentationKey");
    const pageKey = String(document.getElementById("songKey")?.textContent || "").trim();
    const authoritativeKey = pageKey || customServiceKey();
    if(k)k.textContent=`Key: ${authoritativeKey || "—"}`;
    renderCustomPassingChords();
    renderCustomNextPreview();
    renderCustomPresentationNote();
    updateCounter();
    updateCustomPresentationSectionButtons();
    // Always show the selected section after re-rendering.
    requestAnimationFrame(()=>selectCustomPresentationSection(customPresentationSectionIndex,false));
    if(!multiScreenIsOutput) { multiScreenCurrentSection=customPresentationSectionIndex; multiScreenBroadcast({}); renderMultiScreenSectionButtons(); }
}
function selectCustomPresentationSection(index,smooth=true){
    const output=document.getElementById("customPresentationLyrics");
    if(!output)return;
    const section=output.querySelector(`#customPresentationSection-${Number(index)}`);
    if(section) section.scrollIntoView({behavior:smooth?"smooth":"auto",block:"start"});
}
function updateCustomPresentationSectionButtons(){
    const sections=document.querySelectorAll("#customPresentationLyrics .custom-presentation-section");
    const atStart=customPresentationSectionIndex<=0;
    const atEnd=customPresentationSectionIndex>=sections.length-1;
    ["customPresentationSectionPrev","customPresentationSectionPrevBottom"].forEach(id=>{
        const el=document.getElementById(id); if(el) el.disabled=atStart;
    });
    ["customPresentationSectionNext","customPresentationSectionNextBottom"].forEach(id=>{
        const el=document.getElementById(id); if(el) el.disabled=atEnd;
    });
}
function goCustomPresentationSection(delta){
    const sections=document.querySelectorAll("#customPresentationLyrics .custom-presentation-section");
    if(!sections.length)return;
    const next=Math.max(0,Math.min(customPresentationSectionIndex+delta,sections.length-1));
    if(next===customPresentationSectionIndex)return;
    customPresentationSectionIndex=next;
    selectCustomPresentationSection(next,true);
    updateCustomPresentationSectionButtons();
    multiScreenCurrentSection=next;
    if(!multiScreenIsOutput) { multiScreenBroadcast({sectionIndex:next}); renderMultiScreenSectionButtons(); renderMultiLivePreview(); }
}
function currentPresentationNote(){
    return String(service?.songs?.[index]?.presentationNote || "");
}

function renderCustomPresentationNote(){
    const panel=document.getElementById("customPresentationNotePanel");
    const input=document.getElementById("customPresentationNote");
    const status=document.getElementById("customPresentationNoteStatus");
    const save=document.getElementById("customPresentationNoteSave");
    if(!panel||!input) return;
    const hasService=!!localStorage.getItem("currentServiceId") && !!service?.songs?.[index];
    panel.style.display=hasService?"block":"none";
    input.value=hasService?currentPresentationNote():"";
    input.disabled=!hasService;
    if(save) save.disabled=!hasService;
    if(status) status.textContent="";
}

async function saveCustomPresentationNote(){
    const serviceId=localStorage.getItem("currentServiceId");
    const input=document.getElementById("customPresentationNote");
    const status=document.getElementById("customPresentationNoteStatus");
    const save=document.getElementById("customPresentationNoteSave");
    if(!serviceId || !service?.songs?.[index] || !input) return;
    const note=String(input.value||"").trim();
    const updatedSongs=service.songs.map((item,i)=>i===index?{...item,presentationNote:note}:item);
    const updatedService={...service,songs:updatedSongs};
    if(save) save.disabled=true;
    if(status) status.textContent="Saving...";
    try{
        if(auth.currentUser){
            await setDoc(doc(db,"users",auth.currentUser.uid,"services",String(serviceId)),{songs:updatedSongs,updatedAt:serverTimestamp()},{merge:true});
        }
        // Always keep the current snapshot in sync. In Guest mode this is a
        // local-only edit; a signed-in user also gets the Firebase save above.
        service=updatedService;
        try{localStorage.setItem("currentServiceSnapshot",JSON.stringify(service));}catch(_){}
        localStorage.setItem("worshipHubServiceNoteUpdate",JSON.stringify({serviceId:String(serviceId),songIndex:index,note,updatedAt:Date.now()}));
        window.dispatchEvent(new CustomEvent("worshiphub:service-note-updated",{detail:{id:String(serviceId),songIndex:index,note,service:updatedService}}));
        if(status) status.textContent="Saved";
        setTimeout(()=>{if(status) status.textContent="";},1600);
    }catch(error){
        console.error("Unable to save presentation note:",error);
        if(status) status.textContent="Save failed";
        alert("Unable to save the song note to this Service Planner. Please check your Firebase permissions.");
    }finally{
        if(save) save.disabled=false;
    }
}

function renderCustomNextPreview(){
    const p=document.getElementById("customNextSongPreview"); if(!p)return;
    const next=service?.songs?.[index+1]; p.innerHTML="";
    const label=document.createElement("span");label.className="custom-next-label";label.textContent="NEXT SONG";p.appendChild(label);
    const title=document.createElement("strong");title.className="custom-next-title";title.textContent=next?.title||"END OF SERVICE";p.appendChild(title);
    if(next){
        const key=document.createElement("span");key.className="custom-next-key";key.textContent=`Service Key: ${next.serviceKey||next.key||next.originalKey||"—"}`;p.appendChild(key);
        p.onclick=()=>redirectSong(next,index+1);
        p.onkeydown=(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();redirectSong(next,index+1);}};
    }else{p.onclick=null;p.onkeydown=null;}
    p.style.display="flex";
}
async function enterCustomFullscreen(){const s=document.getElementById("customPresentationScreen");if(!s||document.fullscreenElement)return;try{await s.requestFullscreen();}catch(_){try{await document.documentElement.requestFullscreen();}catch(__){}}}
async function exitCustomFullscreen(){if(document.fullscreenElement){try{await document.exitFullscreen();}catch(_){}}}
async function startCustomPresentation(){
    if(!song)return;
    const s=document.getElementById("customPresentationScreen");
    if(!s)return;
    document.body.classList.add("custom-presentation-active");
    s.classList.add("show");
    s.style.display="flex";
    renderCustomPresentation();
    // User gesture is not guaranteed when launched by Service Planner, so
    // fullscreen may be rejected. The presentation remains visible and
    // scrollable even when browser fullscreen permission is unavailable.
    try{ await enterCustomFullscreen(); }catch(_){ }
}
async function exitCustomPresentation(){const s=document.getElementById("customPresentationScreen");if(s){s.classList.remove("show");s.style.display="none";}document.body.classList.remove("custom-presentation-active");await exitCustomFullscreen();}

async function loadServiceIndex(targetIndex){
    if(!service || !Array.isArray(service.songs)) return false;
    const target=Number(targetIndex);
    if(!Number.isInteger(target) || target<0 || target>=service.songs.length) return false;
    const candidate=service.songs[target];
    if(!candidate) return false;
    index=target;
    multiActivePageSlide=null;
    multiSelectedPageSlideIndex=-1;
    customPresentationSectionIndex=0;
    localStorage.setItem("currentSongIndex",String(index));
    song={...candidate,sections:normalizeSections(candidate.sections),serviceKey:candidate.serviceKey || candidate.key,transpose:Number(candidate.transpose||0)};
    transposeSteps=Number(song.transpose||0);
    render();
    if(document.getElementById("customPresentationScreen")?.classList.contains("show")) renderCustomPresentation();
    // Refresh the master copy without blocking the transition.
    if(candidate.id){
        void refreshMasterSong(candidate.id).then(master=>{
            if(!master || String(song?.id||"")!==String(candidate.id||"")) return;
            song={...song,...master,sections:normalizeSections(master.sections),serviceKey:candidate.serviceKey || master.serviceKey || master.key || candidate.key,transpose:Number(candidate.transpose ?? master.transpose ?? 0)};
            transposeSteps=Number(song.transpose||0);
            render();
            if(document.getElementById("customPresentationScreen")?.classList.contains("show")) renderCustomPresentation();
        });
    }
    return true;
}

async function stopCustomService(){
    localStorage.removeItem("currentServiceId");
    localStorage.removeItem("currentSongIndex");
    localStorage.removeItem("resumePresentation");
    localStorage.removeItem("presentationMode");
    await exitCustomPresentation();
    alert("Service stopped.");
}


function printCustomSong(){
    if(!song) return;
    const root=document.createElement("div"); root.id="worshipHubPrintRoot";
    root.innerHTML=`<div class="print-song-header"><div class="print-song-meta"><div class="print-song-title">${esc(song.title||"Untitled Song")}</div><div class="print-song-info"><span><b>Artist:</b> ${esc(song.artist||"")}</span><span><b>Original Key:</b> ${esc(song.originalKey||song.key||"")}</span><span><b>Service Key:</b> ${esc(song.serviceKey||song.key||song.originalKey||"")}</span></div></div></div><div class="print-song-content"><div class="wh-print-source-content song"></div></div>`;
    const source=root.querySelector(".wh-print-source-content.song");
    normalizeSections(song.sections).forEach(section=>{
        const sec=document.createElement("section"); sec.className="song-section";
        const title=document.createElement("div"); title.className="section-title"; title.textContent=`${section.type||""} ${section.number||""}`.trim(); sec.appendChild(title);
        (section.lines||[]).forEach(line=>{
            const row=document.createElement("div"); row.className="song-line";
            const chord=document.createElement("span"); chord.className="chord"; chord.textContent=transposeChord(line.chordText||chordRowFromPositions(line),transposeSteps);
            const lyric=document.createElement("span"); lyric.className="print-lyric-text"; lyric.textContent=line.lyrics||"";
            row.appendChild(chord); row.appendChild(document.createElement("br")); row.appendChild(lyric); sec.appendChild(row);
        }); source.appendChild(sec);
    });
    document.getElementById("worshipHubPrintRoot")?.remove();
    document.body.appendChild(root);
    root.querySelectorAll(".section-title").forEach(t=>{t.style.background="#FFD700";t.style.color="#000";});
    window.WorshipHubPrintPreview?.open(root);
}


// CHORDIO MULTI-SCREEN OUTPUT CONTROL
let multiScreenChannel = null;
let multiScreenWindows = {};
let multiScreenModes = (()=>{ try { const saved=JSON.parse(localStorage.getItem("chordioMultiScreenModes")||"null"); return {1:saved?.[1]||"lyrics",2:saved?.[2]||"lyrics",3:saved?.[3]||"lyrics",4:saved?.[4]||"chords"}; } catch(_) { return {1:"lyrics",2:"lyrics",3:"lyrics",4:"chords"}; } })();
let multiScreenBackgroundModes = (()=>{ try { const saved=JSON.parse(localStorage.getItem("chordioMultiScreenBackgroundModes")||"null"); return {1:saved?.[1]||"common",2:saved?.[2]||"common",3:saved?.[3]||"common",4:saved?.[4]||"common"}; } catch(_) { return {1:"common",2:"common",3:"common",4:"common"}; } })();
let multiScreenEnabled = (()=>{ try { const saved=JSON.parse(localStorage.getItem("chordioMultiScreenEnabled")||"null"); return {1:saved?.[1]!==false,2:saved?.[2]!==false,3:saved?.[3]!==false,4:saved?.[4]!==false}; } catch(_) { return {1:true,2:true,3:true,4:true}; } })();
let multiScreenIsOutput = false;
let multiScreenDisplayId = "";
let multiScreenLastOutputState = null;
let multiScreenCurrentSection = 0;
let multiActivePageSlide = null;
let multiSelectedPageSlideIndex = -1;
let multiScreenPreviewCount = (()=>{ try { const n=Number(localStorage.getItem("chordioMultiScreenPreviewCount")||4); return Math.max(1,Math.min(4,n)); } catch(_) { return 4; } })();
let multiScreenPreviewSlots = (()=>{ try { const a=JSON.parse(localStorage.getItem("chordioMultiScreenPreviewSlots")||"null"); if(Array.isArray(a)&&a.length) return a.map(Number).filter(n=>n>=1&&n<=4).slice(0,4); } catch(_){} return [1,2,3,4]; })();
let multiScreenPreviewExpanded = 0;
let multiScreenBackground = (()=>{ try{return JSON.parse(localStorage.getItem("chordioMultiScreenBackground")||"null")||{type:"none",url:""};}catch(_){return {type:"none",url:""};} })();
let multiScreenSongBackgrounds = (()=>{ try{return JSON.parse(localStorage.getItem("chordioMultiScreenSongBackgrounds")||"null")||{};}catch(_){return {};} })();
function multiScreenSongBackgroundKey(data=song){return String(data?.id||data?.title||"song");}
function getMultiScreenSongBackground(data=song){const key=multiScreenSongBackgroundKey(data);return multiScreenSongBackgrounds[key]||((service?.multiScreenSongBackgrounds||{})[key]||null)||null;}
function getMultiScreenActiveBackground(data=song){return getMultiScreenSongBackground(data)||multiScreenBackground||{type:"none",url:""};}

/* The COMMON background is scoped to the selected Service Planner.
   localStorage is only a short-lived fallback for older planners/guest mode. */
function loadServiceScopedMultiBackground(){
    const saved=service?.multiScreenBackground;
    if(saved && typeof saved==="object"){
        multiScreenBackground={type:saved.type||"none",url:saved.url||""};
    }else{
        multiScreenBackground={type:"none",url:""};
    }
    multiScreenSongBackgrounds={...(service?.multiScreenSongBackgrounds||{})};
    try{
        localStorage.setItem("chordioMultiScreenBackground",JSON.stringify(multiScreenBackground));
        localStorage.setItem("chordioMultiScreenSongBackgrounds",JSON.stringify(multiScreenSongBackgrounds));
    }catch(_){}
}

const CHORDIO_CMG_BACKGROUNDS=["CMG - Neon Box Elevate.jpg","CMG - Foil Vibes Flash 17.jpg","CMG - Nature Tone Field.jpg","CMG - Line Blast Cross.jpg","CMG - Northern Pine Shadows.jpg","CMG - Water Wonder Descending.jpg","CMG - Hot Paint Fire Cross.jpg","CMG - Cross Tone 12.jpg","CMG - Dot Spin Vortex.jpg","CMG - Glitter Bliss Lava.jpg","CMG - Geometric Gold Alt 21.jpg","CMG - Northern Pine Dark Wood.jpg","CMG - Glitter Bliss 08.jpg","CMG - Sonic Bricks 18.jpg","CMG - CMG Remix 01-08.jpg","CMG - Nature King 17.jpg","CMG - Cross Tone 03.jpg","CMG - Glitter Bliss Galaxy.jpg","CMG - Summer Splash 10.jpg","CMG - Glitter Bliss 05.jpg","CMG - Vivid Haze Double.jpg","CMG - Nature Tone Clean 19.jpg","CMG - Candle Light Cluster.jpg","CMG - Night Stars 08.jpg","CMG - Foil Vibes Flash 03.jpg","CMG - Stained Glass Ocean.jpg","CMG - CMG Remix 02-08.jpg","CMG - Liquid Lines 15.jpg","CMG - Foil Vibes Flash 16.jpg","CMG - Simple Nature Snow 01.jpg","CMG - Summer Splash Blank.jpg","CMG - Stained Glass Sun Flare.jpg","CMG - Northern Pine Blank.jpg","CMG - Hope Starts Here Blank.jpg","CMG - Foil Vibes 08.jpg","CMG - Glitter Bliss 15.jpg","CMG - Nature King 21.jpg","CMG - Noise Play Ocean.jpg","CMG - Trend Lines Rainbow.jpg","CMG - Nature Tone Clean 12.jpg","CMG - Forest Shine 04.jpg","CMG - Fun Grunge Fire.jpg","CMG - Noise Play Upside.jpg","CMG - Feather Flow Blank.jpg","CMG - Glitter Bliss Ocean.jpg","CMG - Summer Ocean 14.jpg","CMG - Geometric Gold Holiday.jpg","CMG - LED Go 16.jpg","CMG - Crystal Gold Neue.jpg","CMG - LED Blitz Cross.jpg","CMG - Glitter Bliss Special.jpg","CMG - Praise His Name Shine.jpg","CMG - Ocean Vibes Clean 05.jpg","CMG - Water Wonder Darkness.jpg","CMG - The Best Is Yet To Come Blank.jpg","CMG - Northern Pine White Marble.jpg","CMG - Glitter Bliss Blast.jpg","CMG - Digital Mountains 07.jpg","CMG - Kaleidoscope Lines 14.jpg","CMG - Forest Shine 10.jpg","CMG - Bright Mountains 01.jpg","CMG - Noise Play Flash 03.jpg","CMG - CMG Remix 02-12.jpg","CMG - Bright Mountains 09.jpg","CMG - CMG Remix 02-06.jpg","CMG - Scenic Splash 06.jpg","CMG - Stained Glass Shine 02.jpg","CMG - Steel Bokeh Eden.jpg","CMG - Glitter Bliss Eve.jpg","CMG - Smooth Candy 09.jpg","CMG - Ink Tones Space Galaxy.jpg","CMG - Spring Watercolor Blue.jpg","CMG - Glitter Bliss Bright Star.jpg","CMG - Iridescent Flow 11.jpg","CMG - Simple Nature Snow 03.jpg","CMG - Forest Shine 11.jpg","CMG - Water Wonder Perfect.jpg","CMG - Dot Spin Warp.jpg","CMG - Doutone Mist 01.jpg","CMG - Night Stars 04.jpg","CMG - Rail Glitch Tech 05.jpg","CMG - Waters Edge Waterfall.jpg","CMG - Jesus Lives Blank.jpg","CMG - Split Smoke Clean 13.jpg","CMG - Bright Future Blaze.jpg","CMG - Waters Edge Majestic.jpg","CMG - Foil Shapes 08.jpg","CMG - Jewel Edge 12.jpg","CMG - Split Smoke Ocean.jpg","CMG - Iridescent Flow 12.jpg","CMG - CMG Remix 01-02.jpg","CMG - Stained Glass Shine 11.jpg","CMG - Stained Glass Ice.jpg","CMG - Nature Tone Waterfall.jpg","CMG - Glitter Gold Trees.jpg","CMG - Split Smoke Clean 16.jpg","CMG - Northern Pine Boxwood.jpg","CMG - Foil Vibes Flash 12.jpg","CMG - CMG Remix 02-02.jpg"];
const CHORDIO_UPLOADED_BG_DB="chordioUploadedBackgroundsDB";
const CHORDIO_UPLOADED_BG_STORE="backgrounds";
function chordioOpenUploadedBackgroundDB(){
    return new Promise((resolve,reject)=>{
        try{
            const req=indexedDB.open(CHORDIO_UPLOADED_BG_DB,1);
            req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(CHORDIO_UPLOADED_BG_STORE))db.createObjectStore(CHORDIO_UPLOADED_BG_STORE,{keyPath:"id"});};
            req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error("Unable to open background library"));
        }catch(e){reject(e);}
    });
}
function chordioGetUploadedBackgroundMeta(){try{return JSON.parse(localStorage.getItem("chordioUploadedBackgroundMeta")||"[]");}catch(_){return []}}
function chordioSetUploadedBackgroundMeta(list){try{localStorage.setItem("chordioUploadedBackgroundMeta",JSON.stringify(list));}catch(_){} }
async function chordioSaveUploadedBackground(file){
    const id="upload-"+Date.now()+"-"+Math.random().toString(36).slice(2,9);
    const item={id,name:String(file.name||"Uploaded Background"),type:String(file.type||"image/jpeg"),size:Number(file.size||0),createdAt:Date.now(),blob:file};
    const db=await chordioOpenUploadedBackgroundDB();
    await new Promise((resolve,reject)=>{const tx=db.transaction(CHORDIO_UPLOADED_BG_STORE,"readwrite");tx.objectStore(CHORDIO_UPLOADED_BG_STORE).put(item);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error("Unable to save background"));});
    db.close();
    const meta=chordioGetUploadedBackgroundMeta().filter(x=>x?.id!==id);meta.push({id,name:item.name,type:item.type,size:item.size,createdAt:item.createdAt});chordioSetUploadedBackgroundMeta(meta);
    return item;
}
async function chordioGetUploadedBackground(id){
    const db=await chordioOpenUploadedBackgroundDB();
    const item=await new Promise((resolve,reject)=>{const req=db.transaction(CHORDIO_UPLOADED_BG_STORE,"readonly").objectStore(CHORDIO_UPLOADED_BG_STORE).get(id);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);});
    db.close();return item;
}
async function chordioResolveBackgroundUrl(url){
    const raw=String(url||"");
    if(!raw.startsWith("idb://"))return raw;
    const item=await chordioGetUploadedBackground(raw.slice(6));
    if(!item?.blob)return "";
    return URL.createObjectURL(item.blob);
}
function chordioIsVideoType(type){return String(type||"").toLowerCase().startsWith("video/");}
async function chordioResolveBackgroundForDisplay(bg){
    if(!bg||!bg.url)return {type:bg?.type||"none",url:""};
    const url=await chordioResolveBackgroundUrl(bg.url);
    return {...bg,url};
}
function chordioCmgBackgroundUrl(name){return "backgrounds/cmg/"+encodeURIComponent(String(name||"")).replace(/%2F/g,"/");}
function chordioUploadedBackgroundUrl(id){return "idb://"+String(id||"");}
async function initCmgBackgroundLibrary(){
    const select=document.getElementById("multiCmgBackground");
    if(!select)return;
    const metas=chordioGetUploadedBackgroundMeta();
    const signature=metas.map(x=>`${x.id}:${x.name}:${x.type}`).join("|");
    if(select.dataset.ready==="1"&&select.dataset.signature===signature)return;
    const previous=String(select.value||"");
    const builtIn=CHORDIO_CMG_BACKGROUNDS.map(name=>`<option value="${esc(name)}">${esc(name.replace(/^CMG\s*-\s*/i,""))}</option>`).join("");
    const uploaded=metas.map(item=>`<option value="${esc(chordioUploadedBackgroundUrl(item.id))}">MY UPLOAD — ${esc(item.name)}</option>`).join("");
    select.innerHTML='<option value="">— Select an image/video background —</option>'+builtIn+(uploaded?'<option disabled>──────── MY SAVED BACKGROUNDS ────────</option>'+uploaded:'');
    if(previous&&select.querySelector(`option[value="${CSS.escape(previous)}"]`))select.value=previous;
    select.dataset.ready="1";select.dataset.signature=signature;
    await updateCmgBackgroundPreview();
}
async function updateCmgBackgroundPreview(){
    const select=document.getElementById("multiCmgBackground"),preview=document.getElementById("multiCmgPreview");
    if(!select||!preview)return;
    const value=String(select.value||"").trim();
    if(!value){preview.innerHTML='<div class="multi-cmg-preview-empty">Select an image/video background to preview it.</div>';return;}
    preview.innerHTML="";
    if(value.startsWith("idb://")){
        const item=await chordioGetUploadedBackground(value.slice(6));
        if(!item){preview.innerHTML='<div class="multi-cmg-preview-empty">Saved background is unavailable.</div>';return;}
        const url=URL.createObjectURL(item.blob);
        if(chordioIsVideoType(item.type)){
            const v=document.createElement("video");v.src=url;v.autoplay=true;v.muted=true;v.loop=true;v.playsInline=true;v.controls=false;v.style.cssText="width:100%;height:100%;object-fit:cover;display:block";preview.appendChild(v);void v.play().catch(()=>{});
        } else {const img=document.createElement("img");img.alt=item.name;img.src=url;img.style.cssText="width:100%;height:100%;object-fit:cover;display:block";preview.appendChild(img);}
        return;
    }
    const img=document.createElement("img");img.alt=value;img.src=chordioCmgBackgroundUrl(value);img.style.cssText="width:100%;height:100%;object-fit:cover;display:block";img.onerror=()=>{preview.innerHTML='<div class="multi-cmg-preview-empty">Unable to load this background.</div>';};preview.appendChild(img);
}
function chordioBackgroundDisplayName(name){return String(name||"").replace(/^CMG\s*-\s*/i,"").replace(/\.[^.]+$/i,"");}
async function openChordioBackgroundLibrary(){
    const modal=document.getElementById("chordioBackgroundLibraryModal");
    const gridImg=document.getElementById("chordioBackgroundImageGrid"),gridVid=document.getElementById("chordioBackgroundVideoGrid");
    if(!modal||!gridImg||!gridVid)return;
    gridImg.innerHTML="";gridVid.innerHTML="";
    const metas=chordioGetUploadedBackgroundMeta();
    const addCard=async(item,isUpload)=>{
        const card=document.createElement("button");card.type="button";card.className="chordio-bg-card";
        const mediaWrap=document.createElement("span");mediaWrap.className="chordio-bg-card-media";
        const label=document.createElement("span");label.className="chordio-bg-card-name";label.textContent=isUpload?item.name:chordioBackgroundDisplayName(item.name);
        if(isUpload){
            const dbItem=await chordioGetUploadedBackground(item.id);if(!dbItem)return;
            const url=URL.createObjectURL(dbItem.blob);
            if(chordioIsVideoType(dbItem.type)){const v=document.createElement("video");v.src=url;v.muted=true;v.loop=true;v.playsInline=true;v.autoplay=true;mediaWrap.appendChild(v);void v.play().catch(()=>{});}else{const img=document.createElement("img");img.src=url;img.alt=item.name;mediaWrap.appendChild(img);}
            card.dataset.value=chordioUploadedBackgroundUrl(item.id);
        }else{
            const img=document.createElement("img");img.src=chordioCmgBackgroundUrl(item.name);img.alt=item.name;mediaWrap.appendChild(img);card.dataset.value=item.name;
        }
        card.append(mediaWrap,label);card.onclick=async()=>{const value=String(card.dataset.value||"");const select=document.getElementById("multiCmgBackground");if(select)select.value=value;let type="image";if(value.startsWith("idb://")){const item=await chordioGetUploadedBackground(value.slice(6));if(item)type=chordioIsVideoType(item.type)?"video":"image";}else if(/\.(mp4|webm|ogg|mov|m4v)$/i.test(value))type="video";const typeEl=document.getElementById("multiBackgroundType");if(typeEl)typeEl.value=type;const input=document.getElementById("multiBackgroundUrl");if(input)input.value=value.startsWith("idb://")?value:chordioCmgBackgroundUrl(value);modal.classList.remove("show");modal.setAttribute("aria-hidden","true");};
        return card;
    };
    for(const name of CHORDIO_CMG_BACKGROUNDS){const card=await addCard({name},false);if(card)gridImg.appendChild(card);}
    for(const item of metas){const card=await addCard(item,true);if(card)(chordioIsVideoType(item.type)?gridVid:gridImg).appendChild(card);}
    modal.classList.add("show");modal.setAttribute("aria-hidden","false");
}
function closeChordioBackgroundLibrary(){const modal=document.getElementById("chordioBackgroundLibraryModal");if(modal){modal.classList.remove("show");modal.setAttribute("aria-hidden","true");}}
async function useSelectedCmgBackground(){
    const value=String(document.getElementById("multiCmgBackground")?.value||"").trim();
    if(!value)return;
    const scope=document.getElementById("multiBackgroundScopeSelect")?.value||"all";
    let url=value,type="image";
    if(value.startsWith("idb://")){const item=await chordioGetUploadedBackground(value.slice(6));if(!item)return;type=chordioIsVideoType(item.type)?"video":"image";}
    else {url=chordioCmgBackgroundUrl(value); type=/\.(mp4|webm|ogg|mov|m4v)$/i.test(value)?"video":"image";}
    const typeEl=document.getElementById("multiBackgroundType");if(typeEl)typeEl.value=type;
    const input=document.getElementById("multiBackgroundUrl");if(input)input.value=url;
    await setMultiScreenBackground(type,url,scope==="song");
}

let multiServiceSlidesBackground=(()=>{try{return JSON.parse(localStorage.getItem("chordioServiceSlidesBackground")||"null")||{type:"none",url:""};}catch(_){return {type:"none",url:""};}})();
function getMultiServiceSlidesBackground(){try{const saved=JSON.parse(localStorage.getItem("chordioServiceSlidesBackground")||"null");return saved||multiServiceSlidesBackground||{type:"none",url:""};}catch(_){return multiServiceSlidesBackground||{type:"none",url:""};}}
let multiLyricsSettings = (()=>{ try { return JSON.parse(localStorage.getItem("chordioMultiLyricsSettings")||"null") || {spacing:1.15,vertical:50,fontPx:42,align:"center",fontFamily:"Arial",bold:false,italic:false,underline:false,color:"#FFFFFF",letterSpacing:0}; } catch(_) { return {spacing:1.15,vertical:50,fontPx:42,align:"center",fontFamily:"Arial",bold:false,italic:false,underline:false,color:"#FFFFFF",letterSpacing:0}; } })();
function multiLyricsSettingsStorageKey(){const serviceId=localStorage.getItem("currentServiceId")||"standalone";return "chordioMultiLyricsSettings:"+String(serviceId)+":"+String(song?.id||new URLSearchParams(location.search).get("id")||song?.title||"song");}
function getMultiLyricsSettings(){const defaults={spacing:1.15,vertical:50,fontPx:42,align:"center",fontFamily:"Arial",bold:false,italic:false,underline:false,color:"#FFFFFF",letterSpacing:0};const serviceSaved=localStorage.getItem("currentServiceId")&&song?.id?(service?.multiLyricsSettings||{})[String(song.id)]:null;try{return {...defaults,...(serviceSaved||JSON.parse(localStorage.getItem(multiLyricsSettingsStorageKey())||"null")||{}),...(multiLyricsSettings||{})};}catch(_){return {...defaults,...(multiLyricsSettings||{})};}}
async function saveMultiLyricsSettings(settings){multiLyricsSettings={...getMultiLyricsSettings(),...(settings||{})};try{localStorage.setItem(multiLyricsSettingsStorageKey(),JSON.stringify(multiLyricsSettings));localStorage.setItem("chordioMultiLyricsSettings",JSON.stringify(multiLyricsSettings));}catch(_){}const serviceId=localStorage.getItem("currentServiceId");if(!serviceId||!song?.id||!service)return true;const all={...(service.multiLyricsSettings||{}),[String(song.id)]:multiLyricsSettings};service={...service,multiLyricsSettings:all};try{localStorage.setItem("currentServiceSnapshot",JSON.stringify(service));}catch(_){}if(auth.currentUser){try{await setDoc(doc(db,"users",auth.currentUser.uid,"services",String(serviceId)),{multiLyricsSettings:all,updatedAt:serverTimestamp()},{merge:true});return true;}catch(error){console.warn("Unable to save multi-screen lyrics settings:",error);return false;}}return true;}

function multiLyricsOverridesStorageKey(){const serviceId=localStorage.getItem("currentServiceId")||"standalone";return "chordioMultiLyricsOverrides:"+String(serviceId)+":"+String(song?.id||new URLSearchParams(location.search).get("id")||song?.title||"song");}
function getMultiLyricsOverrides(){const defaults={};const serviceSaved=localStorage.getItem("currentServiceId")&&song?.id?(service?.multiLyricsOverrides||{})[String(song.id)]:null;try{return {...defaults,...(serviceSaved||JSON.parse(localStorage.getItem(multiLyricsOverridesStorageKey())||"null")||{})};}catch(_){return defaults;}}
function getMultiLyricsForSection(section,sectionId){const overrides=getMultiLyricsOverrides();const key=String(sectionId);if(Array.isArray(overrides[key]))return overrides[key];return (section?.lines||[]).map(line=>String(line?.lyrics||""));}
function syncMultiLyricsEditor(){const visible=multiScreenVisibleSections(),entry=visible[multiScreenCurrentSection],ta=document.getElementById("multiLyricsEditor");if(!ta)return;if(!entry){ta.value="";return;}ta.value=getMultiLyricsForSection(entry.section,entry.item.id).join("\n");}
async function saveMultiLyricsFormatting(){const visible=multiScreenVisibleSections(),entry=visible[multiScreenCurrentSection];if(!entry||!song)return true;const lines=String(document.getElementById("multiLyricsEditor")?.value||"").replace(/\r/g,"").split("\n");const all={...getMultiLyricsOverrides(),[String(entry.item.id)]:lines};try{localStorage.setItem(multiLyricsOverridesStorageKey(),JSON.stringify(all));}catch(_){}const serviceId=localStorage.getItem("currentServiceId");if(serviceId&&song?.id&&service){const stored={...(service.multiLyricsOverrides||{}),[String(song.id)]:all};service={...service,multiLyricsOverrides:stored};try{localStorage.setItem("currentServiceSnapshot",JSON.stringify(service));}catch(_){}if(auth.currentUser){try{await setDoc(doc(db,"users",auth.currentUser.uid,"services",String(serviceId)),{multiLyricsOverrides:stored,updatedAt:serverTimestamp()},{merge:true});}catch(error){console.warn("Unable to save multi-screen lyrics formatting:",error);return false;}}}multiScreenBroadcast({lyricsOverrides:all});renderMultiPartLyricsPreview();renderMultiScreenPreviews();return true;}

function multiScreenModeLabel(mode){return mode==="chords"?"Lyrics + Chords":mode==="blank"?"Blank":"Lyrics Only";}
function multiScreenVisibleSections(){
    const source=normalizeSections(song?.sections||[]),layout=getPresentationLayout();
    return layout.map(item=>({item,section:source[Number(item.id)]})).filter(x=>x.section&&x.item.visible!==false);
}
function multiScreenMessage(){
    return {type:"chordio-multiscreen-state",song:song?{...song,sections:normalizeSections(song.sections)}:null,serviceName:service?.name||"",serviceIndex:index,serviceSongs:service?.songs||[],sectionIndex:multiScreenCurrentSection,modes:{...multiScreenModes},enabled:{...multiScreenEnabled},backgroundModes:{...multiScreenBackgroundModes},background:{...multiScreenBackground},songBackground:getMultiScreenSongBackground(song),serviceSlidesBackground:getMultiServiceSlidesBackground(),layout:getPresentationLayout(),lyricsSettings:getMultiLyricsSettings(),lyricsOverrides:getMultiLyricsOverrides(),activePageSlide:multiActivePageSlide};
}
function multiScreenBroadcast(extra={}){
    const message={...multiScreenMessage(),...extra};
    try{multiScreenChannel?.postMessage(message);}catch(_){}
    try{localStorage.setItem("chordioMultiScreenState",JSON.stringify(message));Object.keys(multiScreenWindows||{}).forEach(k=>{try{localStorage.setItem(`chordioMultiScreenOutputState:${k}`,JSON.stringify({...message,display:String(k)}));}catch(_){}});}catch(_){}
    Object.values(multiScreenWindows).forEach(w=>{try{if(w&&!w.closed)w.postMessage(message,"*");}catch(_){} });
}
function multiScreenOpenControl(){
    const panel=document.getElementById("multiScreenControl");if(!panel)return;
    panel.classList.add("show");panel.setAttribute("aria-hidden","false");
    const serviceTitle=document.getElementById("multiServiceSongTitle");if(serviceTitle)serviceTitle.textContent=service?.name?`SERVICE SONG - ${service.name}`:"SERVICE SONG";
    [1,2,3,4].forEach(n=>{const el=document.getElementById(`multiMode${n}`);if(el)el.value=multiScreenModes[n]||"lyrics";const cb=document.getElementById(`multiEnabled${n}`);if(cb)cb.checked=multiScreenEnabled[n]!==false;const bgm=document.getElementById(`multiBackgroundMode${n}`);if(bgm)bgm.value=multiScreenBackgroundModes[n]||"common";});
    initMultiFeatureAccordions();renderMultiServiceSongs();renderMultiScreenSectionButtons();renderMultiPartLyricsPreview();renderMultiStructureList();renderMultiBackgroundControls();syncMultiLyricsSettingsControls();syncMultiLyricsEditor();renderMultiSlides();renderMultiScreenPreviews();multiScreenBroadcast({});
}
function multiScreenCloseControl(){const panel=document.getElementById("multiScreenControl");if(panel){panel.classList.remove("show");panel.setAttribute("aria-hidden","true");}}
function currentServiceSongSlides(){return Array.isArray(service?.songs?.[index]?.pageSlides)?service.songs[index].pageSlides:[];}
async function saveServiceSongs(updatedSongs){const serviceId=localStorage.getItem("currentServiceId");const updatedService={...service,songs:updatedSongs};service=updatedService;try{localStorage.setItem("currentServiceSnapshot",JSON.stringify(service));}catch(_){}if(serviceId&&auth.currentUser){try{await setDoc(doc(db,"users",auth.currentUser.uid,"services",String(serviceId)),{songs:updatedSongs,updatedAt:serverTimestamp()},{merge:true});return true;}catch(error){console.warn("Unable to save service songs:",error);return false;}}return true;}

let multiSongLibraryCache=null;
async function refreshMultiSongLibrary(){
    try{
        // Keep local custom songs consistent with the main WorshipHub library.
        const local=JSON.parse(localStorage.getItem("worshipHubCustomSongs")||"[]");
        if(Array.isArray(local)) local.forEach(item=>{
            if(!item?.id)return;
            const i=worshipHubSongs.findIndex(x=>String(x?.id||"")===String(item.id));
            if(i>=0) worshipHubSongs[i]=item; else worshipHubSongs.push(item);
        });
    }catch(_){}
    if(multiSongLibraryCache)return multiSongLibraryCache;
    multiSongLibraryCache=worshipHubSongs;
    // Also pick up custom/master song documents saved directly in Firebase.
    if(auth.currentUser){
        try{
            const snap=await getDocs(collection(db,"songs"));
            snap.forEach(d=>{
                const data={id:d.id,...d.data()};
                if(data.deletedSong===true)return;
                const i=worshipHubSongs.findIndex(x=>String(x?.id||"")===String(data.id));
                if(i>=0) worshipHubSongs[i]={...worshipHubSongs[i],...data}; else worshipHubSongs.push(data);
            });
            multiSongLibraryCache=worshipHubSongs;
        }catch(error){console.warn("Unable to refresh Multi-Screen song library:",error);}
    }
    return multiSongLibraryCache;
}
function multiSongLibrary(){
    return Array.isArray(worshipHubSongs)?worshipHubSongs.filter(Boolean):[];
}
function openMultiAddSong(){
    const modal=document.getElementById("multiAddSongModal"); if(!modal)return;
    modal.classList.add("open"); modal.setAttribute("aria-hidden","false");
    const search=document.getElementById("multiAddSongSearch"); if(search){search.value="";setTimeout(()=>search.focus(),50);}
    renderMultiAddSongList();
    void refreshMultiSongLibrary().then(()=>renderMultiAddSongList());
}
function closeMultiAddSong(){
    const modal=document.getElementById("multiAddSongModal"); if(modal){modal.classList.remove("open");modal.setAttribute("aria-hidden","true");}
}
function renderMultiAddSongList(){
    const box=document.getElementById("multiAddSongList"); if(!box)return;
    const q=String(document.getElementById("multiAddSongSearch")?.value||"").trim().toLocaleLowerCase();
    const current=Array.isArray(service?.songs)?service.songs:[];
    const list=multiSongLibrary().filter(item=>{
        if(item.deletedSong===true)return false;
        const hay=`${item.title||""} ${item.artist||""} ${item.category||""} ${item.language||""}`.toLocaleLowerCase();
        return !q || hay.includes(q);
    }).slice().sort((a,b)=>String(a.title||"").localeCompare(String(b.title||""),undefined,{sensitivity:"base",numeric:true}));
    box.innerHTML="";
    if(!list.length){box.innerHTML='<div class="multi-add-song-empty">No songs found.</div>';return;}
    list.forEach(item=>{
        const key=String(item.id||item.file||item.title||"").trim().toLowerCase();
        const count=current.filter(x=>String(x?.id||x?.file||x?.title||"").trim().toLowerCase()===key).length;
        const row=document.createElement("div");row.className="multi-add-song-row";
        const info=document.createElement("div");info.className="multi-add-song-info";
        info.innerHTML=`<strong>${esc(item.title||"Untitled Song")}</strong><span>${esc(item.artist||"")} ${item.key?`• Key: ${esc(item.key)}`:""}</span>`;
        const btn=document.createElement("button");btn.type="button";btn.className="multi-add-song-btn";btn.textContent=count>=3?"✓ 3 Added":(count?`Add (${count}/3)`:"Add");
        btn.disabled=count>=3;
        btn.onclick=()=>void addSongToCurrentMultiService(item);
        row.append(info,btn);box.appendChild(row);
    });
}
async function addSongToCurrentMultiService(source){
    if(!service?.id){alert("No Service Planner is selected.");return;}
    if(!auth.currentUser){alert("Please login first.");return;}
    const current=Array.isArray(service.songs)?[...service.songs]:[];
    const key=String(source?.id||source?.file||source?.title||"").trim().toLowerCase();
    const count=current.filter(x=>String(x?.id||x?.file||x?.title||"").trim().toLowerCase()===key).length;
    if(count>=3){alert(`"${source.title||"This song"}" can only be added a maximum of 3 times to the same Service Planner.`);return;}
    const serviceSong={
        id:source.id||String(Date.now()),title:source.title||"",artist:source.artist||"",file:source.file||"",
        category:source.category||"",language:source.language||"",key:source.key||"",originalKey:source.originalKey||source.key||"",
        serviceKey:source.serviceKey||source.key||"",transpose:0,youtube:source.youtube||"",customSong:source.customSong===true,
        createdByUid:source.createdByUid||"",createdByEmail:source.createdByEmail||"",
        sections:Array.isArray(source.sections)?JSON.parse(JSON.stringify(source.sections)):null,
        contentVersion:source.contentVersion||null,createdAt:source.createdAt||null,updatedAt:source.updatedAt||null
    };
    const updatedSongs=[...current,serviceSong];
    const serviceId=String(service.id);
    try{
        await setDoc(doc(db,"users",auth.currentUser.uid,"services",serviceId),{songs:updatedSongs,updatedAt:serverTimestamp()},{merge:true});
        service={...service,songs:updatedSongs};
        localStorage.setItem("currentServiceSnapshot",JSON.stringify(service));
        renderMultiServiceSongs();
        renderMultiAddSongList();
        // Keep the new song available immediately; do not force a page reload.
        setMultiSlideStatus(`"${source.title||"Song"}" added to Service`);
    }catch(error){console.error("Unable to add song to Service Planner:",error);alert("Unable to add song to this Service Planner.");}
}
function renderMultiServiceSongs(){
    const box=document.getElementById("multiServiceSongList");if(!box)return;box.innerHTML="";
    const songs=Array.isArray(service?.songs)?service.songs:[];
    if(!songs.length){box.innerHTML='<div class="multi-preview-empty" style="height:120px">No songs in this Service Planner.</div>';return;}
    songs.forEach((item,i)=>{
        const b=document.createElement("button");b.type="button";b.draggable=true;b.className="multi-service-song"+(i===index?" active":"");b.dataset.songIndex=String(i);
        b.innerHTML=`<span class="song-drag" title="Drag to reorder">☷</span><span class="song-num">${i+1}</span><span class="song-name">${esc(item.title||"Untitled Song")}</span><span class="song-meta">${esc(item.artist||"")} • Key: ${esc(item.serviceKey||item.key||item.originalKey||"—")}</span>${item.presentationNote?`<span class="song-note">📝 ${esc(item.presentationNote)}</span>`:""}`;
        b.onclick=async()=>{await loadServiceIndex(i);multiScreenCurrentSection=0;multiActivePageSlide=null;multiSelectedPageSlideIndex=-1;renderMultiScreenControl();multiScreenBroadcast({sectionIndex:0,activePageSlide:null});};
        b.addEventListener("dragstart",e=>{e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",String(i));b.classList.add("dragging");});
        b.addEventListener("dragend",()=>b.classList.remove("dragging"));
        b.addEventListener("dragover",e=>{e.preventDefault();e.dataTransfer.dropEffect="move";b.classList.add("drag-over");});
        b.addEventListener("dragleave",()=>b.classList.remove("drag-over"));
        b.addEventListener("drop",async e=>{e.preventDefault();b.classList.remove("drag-over");const from=Number(e.dataTransfer.getData("text/plain")),to=i;if(!Number.isInteger(from)||from===to)return;const next=[...songs];const [moved]=next.splice(from,1);next.splice(to,0,moved);const currentId=String(song?.id||"");await saveServiceSongs(next);index=Math.max(0,next.findIndex(x=>String(x?.id||"")===currentId));if(index<0)index=0;const current=next[index];if(current){song={...current,sections:normalizeSections(current.sections),serviceKey:current.serviceKey||current.key,transpose:Number(current.transpose||0)};transposeSteps=Number(song.transpose||0);}renderMultiScreenControl();multiScreenBroadcast({});});
        box.appendChild(b);
    });
}
function renderMultiSlides(){
    const box=document.getElementById("multiSlideList");if(!box)return;box.innerHTML="";const slides=currentServiceSongSlides();
    if(!slides.length){box.innerHTML='<div class="multi-preview-empty">No page slides for this song.</div>';return;}
    slides.forEach((slide,i)=>{const row=document.createElement("div");row.className="multi-slide-row"+(i===multiSelectedPageSlideIndex?" active":"");row.draggable=true;row.innerHTML=`<span class="multi-slide-number">${i+1}</span><strong>${esc(slide.title||`Page ${i+1}`)}</strong><span>${esc(String(slide.text||"").replace(/\s+/g," ").slice(0,90))}</span>`;row.onclick=()=>{multiSelectedPageSlideIndex=i;const title=document.getElementById("multiSlideTitle"),text=document.getElementById("multiSlideText");if(title)title.value=slide.title||"";if(text)text.value=slide.text||"";renderMultiSlides();};row.addEventListener("dragstart",e=>{e.dataTransfer.setData("text/plain",String(i));});row.addEventListener("dragover",e=>e.preventDefault());row.addEventListener("drop",async e=>{e.preventDefault();const from=Number(e.dataTransfer.getData("text/plain"));if(!Number.isInteger(from)||from===i)return;const next=[...slides];const [m]=next.splice(from,1);next.splice(i,0,m);const updated=service.songs.map((x,j)=>j===index?{...x,pageSlides:next}:x);await saveServiceSongs(updated);multiSelectedPageSlideIndex=Math.min(i,next.length-1);renderMultiSlides();});box.appendChild(row);});
}
async function addPageSlide(){if(!service?.songs?.[index])return;const title=String(document.getElementById("multiSlideTitle")?.value||"").trim();const text=String(document.getElementById("multiSlideText")?.value||"").trim();if(!text){alert("Please enter the slide words first.");return;}const slides=[...currentServiceSongSlides(),{id:`slide-${Date.now()}`,title,text}];await saveServiceSongs(service.songs.map((x,i)=>i===index?{...x,pageSlides:slides}:x));multiSelectedPageSlideIndex=slides.length-1;renderMultiSlides();setMultiSlideStatus("Slide added");}
async function saveSelectedPageSlide(){if(multiSelectedPageSlideIndex<0||!service?.songs?.[index])return addPageSlide();const slides=[...currentServiceSongSlides()];const title=String(document.getElementById("multiSlideTitle")?.value||"").trim();const text=String(document.getElementById("multiSlideText")?.value||"").trim();if(!text){alert("Please enter the slide words first.");return;}slides[multiSelectedPageSlideIndex]={...slides[multiSelectedPageSlideIndex],title,text};await saveServiceSongs(service.songs.map((x,i)=>i===index?{...x,pageSlides:slides}:x));renderMultiSlides();setMultiSlideStatus("Slide saved");}
async function deleteSelectedPageSlide(){if(multiSelectedPageSlideIndex<0)return;const slides=[...currentServiceSongSlides()];slides.splice(multiSelectedPageSlideIndex,1);await saveServiceSongs(service.songs.map((x,i)=>i===index?{...x,pageSlides:slides}:x));multiSelectedPageSlideIndex=Math.min(multiSelectedPageSlideIndex,slides.length-1);if(multiSelectedPageSlideIndex<0){document.getElementById("multiSlideTitle").value="";document.getElementById("multiSlideText").value="";}renderMultiSlides();setMultiSlideStatus("Slide deleted");}
function setMultiSlideStatus(text){const el=document.getElementById("multiSlideStatus");if(el){el.textContent=text;setTimeout(()=>{if(el.textContent===text)el.textContent="";},1500);}}
function castSelectedPageSlide(){const slides=currentServiceSongSlides(),slide=slides[multiSelectedPageSlideIndex];if(!slide){alert("Select a page slide first.");return;}multiActivePageSlide={...slide,index:multiSelectedPageSlideIndex};multiScreenBroadcast({activePageSlide:multiActivePageSlide});setMultiSlideStatus("Slide cast to enabled screens");}
function stopPageSlideCast(){multiActivePageSlide=null;multiScreenBroadcast({activePageSlide:null});setMultiSlideStatus("Slide cast stopped");}
const CHORDIO_BIBLE_BOOKS=["Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges","Ruth","1 Samuel","2 Samuel","1 Kings","2 Kings","1 Chronicles","2 Chronicles","Ezra","Nehemiah","Esther","Job","Psalms","Proverbs","Ecclesiastes","Song of Solomon","Isaiah","Jeremiah","Lamentations","Ezekiel","Daniel","Hosea","Joel","Amos","Obadiah","Jonah","Micah","Nahum","Habakkuk","Zephaniah","Haggai","Zechariah","Malachi","Matthew","Mark","Luke","John","Acts","Romans","1 Corinthians","2 Corinthians","Galatians","Ephesians","Philippians","Colossians","1 Thessalonians","2 Thessalonians","1 Timothy","2 Timothy","Titus","Philemon","Hebrews","James","1 Peter","2 Peter","1 John","2 John","3 John","Jude","Revelation"];
const CHORDIO_BIBLE_TRANSLATIONS={BSB:{label:"Berean Standard Bible",id:"BSB"}};
const CHORDIO_BIBLE_BOOK_IDS={Genesis:"GEN",Exodus:"EXO",Leviticus:"LEV",Numbers:"NUM",Deuteronomy:"DEU",Joshua:"JOS",Judges:"JDG",Ruth:"RUT","1 Samuel":"1SA","2 Samuel":"2SA","1 Kings":"1KI","2 Kings":"2KI","1 Chronicles":"1CH","2 Chronicles":"2CH",Ezra:"EZR",Nehemiah:"NEH",Esther:"EST",Job:"JOB",Psalms:"PSA",Proverbs:"PRO",Ecclesiastes:"ECC","Song of Solomon":"SNG",Isaiah:"ISA",Jeremiah:"JER",Lamentations:"LAM",Ezekiel:"EZK",Daniel:"DAN",Hosea:"HOS",Joel:"JOL",Amos:"AMO",Obadiah:"OBA",Jonah:"JON",Micah:"MIC",Nahum:"NAM",Habakkuk:"HAB",Zephaniah:"ZEP",Haggai:"HAG",Zechariah:"ZEC",Malachi:"MAL",Matthew:"MAT",Mark:"MRK",Luke:"LUK",John:"JHN",Acts:"ACT",Romans:"ROM","1 Corinthians":"1CO","2 Corinthians":"2CO",Galatians:"GAL",Ephesians:"EPH",Philippians:"PHP",Colossians:"COL","1 Thessalonians":"1TH","2 Thessalonians":"2TH","1 Timothy":"1TI","2 Timothy":"2TI",Titus:"TIT",Philemon:"PHM",Hebrews:"HEB",James:"JAS","1 Peter":"1PE","2 Peter":"2PE","1 John":"1JN","2 John":"2JN","3 John":"3JN",Jude:"JUD",Revelation:"REV"};
function initOnlineBibleControls(){const list=document.getElementById("multiBibleBookList");if(list&&!list.dataset.ready){list.innerHTML=CHORDIO_BIBLE_BOOKS.map(book=>`<option value="${esc(book)}"></option>`).join("");list.dataset.ready="1";}updateOnlineBibleReferencePreview();}
function getOnlineBibleReference(){const book=String(document.getElementById("multiBibleBook")?.value||"").trim(),chapter=String(document.getElementById("multiBibleChapter")?.value||"").trim(),verse=String(document.getElementById("multiBibleVerse")?.value||"").trim().replace(/[–—]/g,"-").replace(/\s+/g,"");if(!book||!chapter||!verse||!/^[0-9]+$/.test(chapter)||!/^[0-9]+(?:-[0-9]+)?$/.test(verse)||!CHORDIO_BIBLE_BOOK_IDS[book])return "";return `${book} ${chapter}:${verse}`;}
function getOnlineBibleVersion(){return "BSB";}
function updateOnlineBibleReferencePreview(){return getOnlineBibleReference();}
async function fetchHelloAOBible(reference){
    const m=String(reference||"").match(/^(.*?)\s+(\d+):(\d+(?:-\d+)?)$/);if(!m)throw new Error("Invalid scripture reference");
    const bookId=CHORDIO_BIBLE_BOOK_IDS[m[1]];const chapter=m[2];const range=m[3];if(!bookId)throw new Error("Book not supported");
    const url=`https://bible.helloao.org/api/BSB/${bookId}/${chapter}.simple.json`;
    const response=await fetch(url,{headers:{Accept:"application/json"}});if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json();const parts=range.split("-").map(Number),from=parts[0],to=parts[1]||from;
    const verses=Array.isArray(data?.chapter?.content)?data.chapter.content.filter(v=>v?.type==="verse"&&Number(v.number)>=from&&Number(v.number)<=to):[];
    if(!verses.length)throw new Error("Verse not found");
    const text=verses.map(v=>{const verseNo=Number(v.number);const verseText=String(v.text||"").replace(/\s+/g," ").trim();return verseText?(range.includes("-")?`${verseNo}. ${verseText}`:verseText):"";}).filter(Boolean).join(" ").trim();
    if(!text)throw new Error("Verse text empty");
    return {reference,text,version:"BSB"};
}
function setBibleResultText(results,text){if(!results)return;results.innerHTML="";const verse=document.createElement("div");verse.className="multi-bible-result";verse.textContent=String(text||"").trim();results.appendChild(verse);}
function populateOnlineBibleResult(reference,data){const results=document.getElementById("multiBibleResults"),textBox=document.getElementById("multiBibleText"),text=String(data?.text||"").trim();if(textBox)textBox.value=text;setBibleResultText(results,text);const title=document.getElementById("multiSlideTitle"),slideText=document.getElementById("multiSlideText");if(title)title.value=reference;if(slideText)slideText.value=text;return text;}
async function fetchOnlineBibleVerse(){const reference=getOnlineBibleReference(),results=document.getElementById("multiBibleResults"),textBox=document.getElementById("multiBibleText");if(!reference){if(results)results.textContent="Enter Book, Chapter and Verse.";return null;}if(results)results.textContent="Searching…";try{return populateOnlineBibleResult(reference,await fetchHelloAOBible(reference));}catch(error){console.warn("Online Bible lookup failed:",error);if(results)results.textContent="Unable to retrieve this scripture. Check the reference and internet connection.";if(textBox)textBox.value="";return null;}}
async function addBibleReferenceSlide(){const reference=getOnlineBibleReference(),version="BSB";if(!reference){alert("Enter Book, Chapter and Verse first. Example: John → 3 → 16 or John → 3 → 1-5.");return;}let text=String(document.getElementById("multiBibleText")?.value||"").trim();if(!text)text=await fetchOnlineBibleVerse();if(!text)return;if(!service?.songs?.[index]){alert("Open a Service Planner song first.");return;}const slide={id:`scripture-${Date.now()}`,title:reference,text,scriptureReference:reference,scriptureVersion:version},slides=[...currentServiceSongSlides(),slide];await saveServiceSongs(service.songs.map((x,i)=>i===index?{...x,pageSlides:slides}:x));multiSelectedPageSlideIndex=slides.length-1;renderMultiSlides();const title=document.getElementById("multiSlideTitle"),slideText=document.getElementById("multiSlideText");if(title)title.value=slide.title;if(slideText)slideText.value=slide.text;setMultiSlideStatus("Scripture added as slide");}

function initMultiFeatureAccordions(){
    document.querySelectorAll("#multiScreenControl .multi-feature-toggle").forEach(toggle=>{
        if(toggle.dataset.bound==="1")return;
        toggle.dataset.bound="1";
        const activate=()=>{const panel=toggle.closest(".multi-feature-panel")||toggle.parentElement;panel?.classList.toggle("collapsed");};
        toggle.addEventListener("click",activate);
        toggle.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();activate();}});
    });
}

function renderMultiScreenControl(){
    const title=document.getElementById("multiServiceSongTitle");if(title)title.textContent=service?.name?`SERVICE SONG - ${service.name}`:"SERVICE SONG";
    renderMultiServiceSongs();renderMultiScreenSectionButtons();renderMultiPartLyricsPreview();renderMultiStructureList();renderMultiBackgroundControls();syncMultiLyricsSettingsControls();syncMultiLyricsEditor();renderMultiSlides();renderMultiScreenPreviews();
}
function renderMultiLivePreview(){renderMultiPartLyricsPreview();}
function renderMultiPartLyricsPreview(){
    const box=document.getElementById("multiPartLyricsPreview");if(!box)return;box.innerHTML="";
    const visible=multiScreenVisibleSections();
    if(!song||!visible.length){box.innerHTML='<div class="multi-preview-empty">Select a song part.</div>';return;}
    const settings=getMultiLyricsSettings();
    visible.forEach((entry,i)=>{
        const part=document.createElement("button");part.type="button";part.className="multi-part-preview-section"+(i===multiScreenCurrentSection?" active":"");part.style.height="auto";part.style.minHeight="0";part.dataset.sectionIndex=String(i);
        const head=document.createElement("div");head.className="multi-part-preview-section-title";head.textContent=presentationSectionLabel(entry.section,i);part.appendChild(head);
        const lines=getMultiLyricsForSection(entry.section,entry.item.id);
        const body=document.createElement("div");body.className="multi-part-preview-section-lines";
        lines.forEach(text=>{const ly=document.createElement("div");ly.textContent=String(text||"");ly.style.fontFamily=settings.fontFamily||"Arial";ly.style.fontSize=`${Math.max(10,Math.min(80,Number(settings.fontPx||42)))}px`;ly.style.fontWeight=settings.bold?"800":"400";ly.style.fontStyle=settings.italic?"italic":"normal";ly.style.textDecoration=settings.underline?"underline":"none";ly.style.color=settings.color||"#111827";ly.style.letterSpacing=`${Number(settings.letterSpacing||0)}px`;ly.style.lineHeight=String(Math.max(.7,Math.min(2.4,Number(settings.spacing)||1.15)));body.appendChild(ly);});
        part.appendChild(body);part.onclick=()=>multiScreenSelectSection(i,presentationSectionLabel(entry.section,i));box.appendChild(part);
    });
}

function syncMultiLyricsSettingsControls(){const settings=getMultiLyricsSettings();[['multiLyricsSpacing',settings.spacing],['multiLyricsVertical',settings.vertical],['multiLyricsFontPx',settings.fontPx],['multiLyricsAlign',settings.align],['multiLyricsFontFamily',settings.fontFamily],['multiLyricsColor',settings.color],['multiLyricsLetterSpacing',settings.letterSpacing]].forEach(([id,value])=>{const el=document.getElementById(id);if(el)el.value=String(value);});["multiLyricsBold","multiLyricsItalic","multiLyricsUnderline"].forEach(id=>{const el=document.getElementById(id);const key=id.replace("multiLyrics","").toLowerCase();if(el){const on=!!settings[key];el.setAttribute("aria-pressed",String(on));el.classList.toggle("active",on);}});const a=document.getElementById("multiLyricsSpacingValue");if(a)a.textContent=Number(settings.spacing).toFixed(2);const b=document.getElementById("multiLyricsVerticalValue");if(b)b.textContent=`${Math.round(Number(settings.vertical))}%`;const c=document.getElementById("multiLyricsFontValue");if(c)c.textContent=`${Math.round(Number(settings.fontPx||42))} px`;}
function readMultiLyricsSettingsControls(){return{spacing:Number(document.getElementById("multiLyricsSpacing")?.value||1.15),vertical:Number(document.getElementById("multiLyricsVertical")?.value||50),fontPx:Number(document.getElementById("multiLyricsFontPx")?.value||42),align:document.getElementById("multiLyricsAlign")?.value||"center",fontFamily:document.getElementById("multiLyricsFontFamily")?.value||"Arial",color:document.getElementById("multiLyricsColor")?.value||"#FFFFFF",letterSpacing:Number(document.getElementById("multiLyricsLetterSpacing")?.value||0),bold:document.getElementById("multiLyricsBold")?.getAttribute("aria-pressed")==="true",italic:document.getElementById("multiLyricsItalic")?.getAttribute("aria-pressed")==="true",underline:document.getElementById("multiLyricsUnderline")?.getAttribute("aria-pressed")==="true"};}
function fitMultiLyricsPreviewToStage(stage, element, settings){
    if(!stage||!element)return;
    const refH=1080, refW=1920;
    const scale=Math.max(.1,Math.min(1,stage.clientHeight/refH));
    const requested=Math.max(10,Math.min(240,Number(settings?.fontPx)||42))*scale;
    const spacing=Math.max(.7,Math.min(2.2,Number(settings?.spacing)||1.15));
    const vertical=Math.max(0,Math.min(100,Number(settings?.vertical)||50));
    const width=Math.max(1,stage.clientWidth),height=Math.max(1,stage.clientHeight);
    element.style.width='100%';element.style.height='100%';element.style.boxSizing='border-box';
    element.style.display='flex';element.style.flexDirection='column';element.style.justifyContent='flex-start';
    element.style.alignItems='stretch';element.style.paddingLeft='6%';element.style.paddingRight='6%';
    element.style.paddingTop='0';element.style.paddingBottom='0';element.style.lineHeight=String(spacing);
    const lines=[...element.children];
    lines.forEach(line=>{line.style.margin='0';line.style.padding='0';line.style.width='100%';line.style.boxSizing='border-box';line.style.lineHeight=String(spacing);});
    const applySize=size=>{element.style.fontSize=`${size}px`;lines.forEach(line=>line.style.fontSize=`${size}px`);};
    const fits=size=>{applySize(size);const h=element.scrollHeight,w=element.scrollWidth;return h<=height*.90+1&&w<=width*.92+1;};
    let low=Math.max(7,requested*.18),high=requested,best=low;
    if(fits(high))best=high;else for(let i=0;i<16&&low<=high;i++){const mid=(low+high)/2;if(fits(mid)){best=mid;low=mid+.25;}else high=mid-.25;}
    applySize(best);
    const used=element.scrollHeight,free=Math.max(0,height-used),top=free*(vertical/100);
    element.style.paddingTop=`${Math.round(top)}px`;element.style.paddingBottom=`${Math.max(0,Math.round(free-top))}px`;
    element.dataset.fittedFontSize=String(best);
    element.dataset.referenceScreen=`${refW}x${refH}`;
}

function renderMultiScreenPreviews(){
    const box=document.getElementById("multiScreenPreviews");if(!box)return;
    box.innerHTML="";
    const visible=multiScreenVisibleSections(),selected=visible[multiScreenCurrentSection]?.section,settings=getMultiLyricsSettings();
    const count=Math.max(1,Math.min(4,Number(multiScreenPreviewCount)||4));
    const slots=multiScreenPreviewSlots.slice(0,count);
    box.classList.remove("preview-count-1","preview-count-2","preview-count-3","preview-count-4","preview-expanded");
    box.classList.add(`preview-count-${count}`);if(multiScreenPreviewExpanded)box.classList.add("preview-expanded");

    const toolbar=document.createElement("div");toolbar.className="multi-screen-preview-toolbar";
    const label=document.createElement("strong");label.textContent="PREVIEW SCREENS";
    const select=document.createElement("select");select.id="multiScreenPreviewCount";select.setAttribute("aria-label","Number of screens to preview");
    [1,2,3,4].forEach(n=>{const o=document.createElement("option");o.value=String(n);o.textContent=`${n} Screen${n===1?"":"s"}`;o.selected=n===count;select.appendChild(o);});
    select.onchange=()=>{multiScreenPreviewCount=Math.max(1,Math.min(4,Number(select.value)||4));
        const available=[1,2,3,4]; multiScreenPreviewSlots=multiScreenPreviewSlots.filter(n=>available.includes(n));
        while(multiScreenPreviewSlots.length<multiScreenPreviewCount) multiScreenPreviewSlots.push(available.find(n=>!multiScreenPreviewSlots.includes(n))||available[0]);
        multiScreenPreviewSlots=multiScreenPreviewSlots.slice(0,multiScreenPreviewCount); multiScreenPreviewExpanded=0;
        try{localStorage.setItem("chordioMultiScreenPreviewCount",String(multiScreenPreviewCount));localStorage.setItem("chordioMultiScreenPreviewSlots",JSON.stringify(multiScreenPreviewSlots));}catch(_){} renderMultiScreenPreviews();};
    const slotWrap=document.createElement("div");slotWrap.className="multi-screen-preview-slots";
    const slotLabel=document.createElement("span");slotLabel.textContent="SHOW:";slotWrap.appendChild(slotLabel);
    [1,2,3,4].forEach(n=>{const b=document.createElement("button");b.type="button";b.textContent=String(n);b.className=slots.includes(n)?"active":"";b.title=slots.includes(n)?`Hide Screen ${n}`:`Show Screen ${n}`;b.onclick=()=>{
        const current=[...multiScreenPreviewSlots];
        if(current.includes(n)){
            if(current.length<=1)return;
            multiScreenPreviewSlots=current.filter(x=>x!==n);
        } else {
            multiScreenPreviewSlots=[...current,n];
        }
        // The SHOW selection is the actual ordered list of physical screens.
        multiScreenPreviewCount=Math.max(1,Math.min(4,multiScreenPreviewSlots.length));
        try{localStorage.setItem("chordioMultiScreenPreviewCount",String(multiScreenPreviewCount));localStorage.setItem("chordioMultiScreenPreviewSlots",JSON.stringify(multiScreenPreviewSlots));}catch(_){}
        multiScreenPreviewExpanded=0;renderMultiScreenPreviews();
    }; slotWrap.appendChild(b);});
    const hint=document.createElement("span");hint.textContent="Click a screen number to show/hide it. Drag the screen cards to arrange the sequence.";
    toolbar.append(label,select,slotWrap,hint);box.appendChild(toolbar);

    const grid=document.createElement("div");grid.className="multi-screen-preview-layout";box.appendChild(grid);
    const screens=slots;
    screens.forEach(n=>{
        const card=document.createElement("div");
        card.className="multi-screen-preview-card"+(multiScreenEnabled[n]===false?" disabled":"")+(multiScreenPreviewExpanded===n?" expanded":"");
        card.dataset.screen=String(n);
        card.draggable=true;
        card.title=`Drag Screen ${n} to change the preview sequence`;
        card.addEventListener("dragstart",ev=>{
            ev.dataTransfer.effectAllowed="move";
            ev.dataTransfer.setData("text/plain",String(n));
            card.classList.add("dragging");
        });
        card.addEventListener("dragend",()=>card.classList.remove("dragging"));
        card.addEventListener("dragover",ev=>{ev.preventDefault();ev.dataTransfer.dropEffect="move";card.classList.add("drag-over");});
        card.addEventListener("dragleave",()=>card.classList.remove("drag-over"));
        card.addEventListener("drop",ev=>{
            ev.preventDefault();ev.stopPropagation();card.classList.remove("drag-over");
            const from=Number(ev.dataTransfer.getData("text/plain"));
            const to=n;
            if(!from||from===to)return;
            const ordered=[...multiScreenPreviewSlots];
            const fromIndex=ordered.indexOf(from),toIndex=ordered.indexOf(to);
            if(fromIndex<0||toIndex<0)return;
            ordered.splice(fromIndex,1);
            ordered.splice(ordered.indexOf(to),0,from);
            multiScreenPreviewSlots=ordered;
            try{localStorage.setItem("chordioMultiScreenPreviewSlots",JSON.stringify(multiScreenPreviewSlots));}catch(_){}
            multiScreenPreviewExpanded=0;
            renderMultiScreenPreviews();
        });
        const head=document.createElement("div");head.className="multi-screen-preview-card-head";
        const title=document.createElement("strong");title.textContent=`SCREEN ${n}`;
        const mode=document.createElement("span");mode.textContent=multiScreenEnabled[n]===false?"HIDDEN":multiScreenModeLabel(multiScreenModes[n]);
        const settingsBtn=document.createElement("button");settingsBtn.type="button";settingsBtn.className="multi-preview-settings-button";settingsBtn.textContent="⚙ SETTINGS";settingsBtn.setAttribute("data-preview-settings",String(n));
        settingsBtn.onclick=(ev)=>{ev.stopPropagation();const panel=document.getElementById(`multiScreenSettings${n}`);if(panel){document.querySelectorAll("#multiScreenControl .multi-screen-settings-panel.open").forEach(p=>{if(p!==panel)p.classList.remove("open")});panel.classList.toggle("open");}};
        head.append(title,mode,settingsBtn);card.appendChild(head);

        const stage=document.createElement("div");stage.className="multi-screen-preview-stage";stage.title="Double-click to enlarge this screen";
        stage.ondblclick=(ev)=>{ev.preventDefault();ev.stopPropagation();multiScreenPreviewExpanded=(multiScreenPreviewExpanded===n?0:n);renderMultiScreenPreviews();};
        if(multiScreenEnabled[n]===false) stage.innerHTML='<span class="multi-preview-empty">Screen disabled</span>';
        else if(!song||!selected) stage.innerHTML='<span class="multi-preview-empty">No song selected</span>';
        else if(multiScreenModes[n]==="blank") stage.innerHTML='<span class="multi-preview-empty">BLACK / BLANK</span>';
        else {
            const bg=multiScreenBackgroundModes[n]==="black"?{type:"none",url:""}:getMultiScreenActiveBackground(song);
            if(bg.type==="image"&&bg.url){void chordioResolveBackgroundForDisplay(bg).then(resolved=>{if(resolved.url){stage.style.setProperty("background-image",`linear-gradient(rgba(0,0,0,.32),rgba(0,0,0,.32)),url(${JSON.stringify(String(resolved.url))})`,"important");stage.style.setProperty("background-size","cover","important");stage.style.setProperty("background-position","center","important");}});}
            if(bg.type==="video"&&bg.url){void chordioResolveBackgroundForDisplay(bg).then(resolved=>{if(resolved.url&&stage.isConnected){const v=document.createElement("video");v.src=resolved.url;v.autoplay=true;v.muted=true;v.loop=true;v.playsInline=true;v.className="multi-preview-bg-video";stage.prepend(v);void v.play().catch(()=>{});}});}
            const overlay=document.createElement("div");overlay.className="multi-preview-bg-overlay";stage.appendChild(overlay);
            if(multiScreenModes[n]==="lyrics"){
                stage.classList.add("lyrics-preview");stage.style.textAlign=settings.align||"center";
                const l=document.createElement("div");l.className="preview-selected-lyrics";l.style.fontFamily=settings.fontFamily||"Arial";l.style.fontWeight=settings.bold?"800":"400";l.style.fontStyle=settings.italic?"italic":"normal";l.style.textDecoration=settings.underline?"underline":"none";l.style.color=settings.color||"#fff";l.style.letterSpacing=`${Number(settings.letterSpacing||0)}px`;
                getMultiLyricsForSection(selected,visible[multiScreenCurrentSection]?.item?.id).forEach(text=>{const x=document.createElement("div");x.textContent=String(text||"");l.appendChild(x);});stage.appendChild(l);
                requestAnimationFrame(()=>fitMultiLyricsPreviewToStage(stage,l,settings));
            }else{
                stage.classList.add("chords-preview");
                const entry=visible[multiScreenCurrentSection];
                if(entry){const sec=document.createElement("div");sec.className="preview-chords-section selected";const lab=document.createElement("b");lab.textContent=presentationSectionLabel(entry.section,multiScreenCurrentSection);sec.appendChild(lab);(entry.section.lines||[]).forEach(line=>{const row=document.createElement("div");row.className="preview-chord-row";const ch=document.createElement("span");ch.className="pc-chord";ch.textContent=chordRowFromPositions(line);const ly=document.createElement("span");ly.textContent=String(line.lyrics||"");row.append(ch,ly);sec.appendChild(row);});stage.appendChild(sec);}
            }
        }
        card.appendChild(stage);grid.appendChild(card);
    });
}

function renderMultiScreenSectionButtons(){
    const box=document.getElementById("multiSectionButtons");if(!box)return;box.innerHTML="";
    const visible=multiScreenVisibleSections();
    visible.forEach((entry,i)=>{const sec=entry.section;const b=document.createElement("button");b.type="button";b.textContent=presentationSectionLabel(sec,i);if(i===multiScreenCurrentSection)b.classList.add("active");b.onclick=()=>multiScreenSelectSection(i,b.textContent);box.appendChild(b);});
    const status=document.getElementById("multiScreenCurrent");if(status)status.textContent=visible[multiScreenCurrentSection]?presentationSectionLabel(visible[multiScreenCurrentSection].section,multiScreenCurrentSection):"No section selected";
}
function multiScreenSelectSection(index,label=""){
    const visible=multiScreenVisibleSections();if(!visible.length)return;
    multiScreenCurrentSection=Math.max(0,Math.min(Number(index)||0,visible.length-1));
    customPresentationSectionIndex=multiScreenCurrentSection;
    selectCustomPresentationSection(multiScreenCurrentSection,true);updateCustomPresentationSectionButtons();
    renderMultiScreenSectionButtons();renderMultiPartLyricsPreview();syncMultiLyricsEditor();renderMultiScreenPreviews();
    multiScreenBroadcast({sectionIndex:multiScreenCurrentSection});
}
function renderMultiStructureList(){
    const box=document.getElementById("multiStructureList");if(!box)return;box.innerHTML="";
    const layout=getPresentationLayout();const sections=normalizeSections(song?.sections||[]);
    layout.forEach((item,pos)=>{
        const row=document.createElement("div");row.className="multi-structure-row"+(item.visible===false?" hidden":"");
        const p=document.createElement("span");p.className="pos";p.textContent=String(pos+1);
        const name=document.createElement("span");name.className="name";name.textContent=presentationSectionLabel(sections[item.id],item.id);
        const up=document.createElement("button");up.textContent="↑";up.disabled=pos===0;up.title="Move up";up.onclick=()=>{const n=getPresentationLayout();[n[pos-1],n[pos]]=[n[pos],n[pos-1]];void savePresentationLayout(n).then(()=>{multiScreenCurrentSection=0;renderMultiScreenControl();});};
        const down=document.createElement("button");down.textContent="↓";down.disabled=pos===layout.length-1;down.title="Move down";down.onclick=()=>{const n=getPresentationLayout();[n[pos],n[pos+1]]=[n[pos+1],n[pos]];void savePresentationLayout(n).then(()=>{multiScreenCurrentSection=0;renderMultiScreenControl();});};
        const hide=document.createElement("button");hide.className="hide-btn";hide.textContent=item.visible===false?"Show":"Hide";hide.onclick=()=>{const n=getPresentationLayout();n[pos].visible=n[pos].visible===false;void savePresentationLayout(n).then(()=>{multiScreenCurrentSection=0;renderMultiScreenControl();});};
        row.append(p,name,up,down,hide);box.appendChild(row);
    });
}
function renderMultiBackgroundControls(){
    initCmgBackgroundLibrary();
    const type=document.getElementById("multiBackgroundType"),url=document.getElementById("multiBackgroundUrl"),file=document.getElementById("multiBackgroundFile");
    const common=multiScreenBackground||{type:"none",url:""}, songBg=getMultiScreenSongBackground(song), bg=songBg||common;
    const scopeSelect=document.getElementById("multiBackgroundScopeSelect");
    const scopeValue=scopeSelect?.value||"all";
    const displayBg=scopeValue==="song"?(songBg||{type:"none",url:""}):common;
    if(type)type.value=displayBg.type||"none";
    if(url)url.value=displayBg.url||"";
    if(file)file.value="";
    const scope=document.getElementById("multiBackgroundScope");if(scope)scope.textContent=(scopeSelect?.value||"all")==="song"?(songBg?"CUSTOM BACKGROUND — THIS SONG":"NO SONG OVERRIDE — USING COMMON"):(songBg?"COMMON BACKGROUND + SONG OVERRIDES":"COMMON BACKGROUND — ALL SCREENS");
    const name=document.getElementById("multiBackgroundSongName");if(name)name.textContent=song?.title?`Current song: ${song.title}`:"No song selected";
}
async function saveMultiScreenBackground(){
    try{localStorage.setItem("chordioMultiScreenBackground",JSON.stringify(multiScreenBackground));}catch(_){}
    const serviceId=localStorage.getItem("currentServiceId");
    if(serviceId&&service&&auth.currentUser){
        try{
            service={...service,multiScreenBackground:{...multiScreenBackground}};
            localStorage.setItem("currentServiceSnapshot",JSON.stringify(service));
            await setDoc(doc(db,"users",auth.currentUser.uid,"services",String(serviceId)),{multiScreenBackground:{...multiScreenBackground},updatedAt:serverTimestamp()},{merge:true});
        }catch(error){console.warn("Unable to save Service Planner background:",error);return false;}
    }
    multiScreenBroadcast({background:{...multiScreenBackground},songBackground:getMultiScreenSongBackground(song)});
    return true;
}
async function setMultiScreenBackground(type,url,forSong=false){
    const bg={type:type||"none",url:url||""};
    if(forSong&&song){
        multiScreenSongBackgrounds[multiScreenSongBackgroundKey(song)]=bg;
        try{localStorage.setItem("chordioMultiScreenSongBackgrounds",JSON.stringify(multiScreenSongBackgrounds));}catch(_){}
        const serviceId=localStorage.getItem("currentServiceId");
        if(serviceId&&service&&auth.currentUser){try{const all={...(service.multiScreenSongBackgrounds||{}),[multiScreenSongBackgroundKey(song)]:bg};service={...service,multiScreenSongBackgrounds:all};localStorage.setItem("currentServiceSnapshot",JSON.stringify(service));await setDoc(doc(db,"users",auth.currentUser.uid,"services",String(serviceId)),{multiScreenSongBackgrounds:all,updatedAt:serverTimestamp()},{merge:true});}catch(error){console.warn("Unable to save song background:",error);}}
    }else{
        multiScreenBackground=bg;
        await saveMultiScreenBackground();
    }
    renderMultiBackgroundControls();renderMultiScreenPreviews();multiScreenBroadcast({background:{...multiScreenBackground},songBackground:getMultiScreenSongBackground(song)});
}
function clearMultiScreenSongBackground(){if(!song)return;delete multiScreenSongBackgrounds[multiScreenSongBackgroundKey(song)];try{localStorage.setItem("chordioMultiScreenSongBackgrounds",JSON.stringify(multiScreenSongBackgrounds));}catch(_){}renderMultiBackgroundControls();renderMultiScreenPreviews();multiScreenBroadcast({songBackground:null});}

function multiScreenOpenDisplay(displayNumber){
    if(!song)return;const n=Number(displayNumber);if(multiScreenEnabled[n]===false)return;const mode=multiScreenModes[n]||"lyrics";
    const fresh={...multiScreenMessage(),display:String(n)};try{localStorage.setItem(`chordioMultiScreenOutputState:${n}`,JSON.stringify(fresh));localStorage.setItem("chordioMultiScreenState",JSON.stringify(fresh));}catch(_){}
    const url=new URL(location.href);url.pathname=url.pathname.replace(/[^/]+$/, "multi-screen-output.html");url.search="";url.searchParams.set("display",String(n));url.searchParams.set("id",String(song.id||""));url.searchParams.set("mode",mode);url.searchParams.set("ts",String(Date.now()));
    const features="popup=yes,resizable=yes,scrollbars=no,fullscreen=yes,width=1920,height=1080";let w=multiScreenWindows[n];if(!w||w.closed)w=window.open(url.href,`CHORDIO_SCREEN_${n}`,features);else{try{w.location.replace(url.href);w.focus();}catch(_){}}multiScreenWindows[n]=w;
    const send=()=>{try{w?.postMessage({...multiScreenMessage(),display:String(n)},"*");}catch(_){} };send();setTimeout(send,200);setTimeout(send,500);setTimeout(send,1000);setTimeout(send,1800);
}
function multiScreenOpenAll(){[1,2,3,4].forEach(n=>{if(multiScreenEnabled[n]!==false)multiScreenOpenDisplay(n);});}
function multiScreenCloseAll(){Object.values(multiScreenWindows).forEach(w=>{try{if(w&&!w.closed)w.close();}catch(_){}});multiScreenWindows={};}
function multiScreenBlackAll(){multiScreenBroadcast({black:true});}
function fitMultiLyricsToScreen(output, section, settings){
    if(!output||!section)return;
    const width=Math.max(320,output.clientWidth||window.innerWidth||1280);
    const height=Math.max(240,output.clientHeight||window.innerHeight||720);
    const spacing=Math.max(.75,Math.min(1.9,Number(settings?.spacing)||1.15));
    const vertical=Math.max(0,Math.min(100,Number(settings?.vertical??50)));
    const align=settings?.align||"center";
    const requested=Math.max(14,Math.min(180,Number(settings?.fontPx)||42));
    const lines=[...section.querySelectorAll('.multi-output-lyric-only-line')];
    if(!lines.length)return;

    // Lyrics Only is an independent full-screen layout.  Do not use the
    // custom line-break/spacing editor for sizing; only the saved Lyrics
    // Display Settings are used here.
    section.style.width="100%";
    section.style.height="100%";
    section.style.minHeight="100%";
    section.style.margin="0";
    section.style.boxSizing="border-box";
    section.style.display="flex";
    section.style.flexDirection="column";
    section.style.alignItems=align==="left"?"flex-start":align==="right"?"flex-end":"center";
    section.style.justifyContent="flex-start";
    section.style.padding="0 5vw";
    section.style.overflow="hidden";
    output.style.width="100%";
    output.style.height="100%";
    output.style.minHeight="100%";
    output.style.boxSizing="border-box";
    output.style.overflow="hidden";
    output.style.textAlign=align;

    const applySize=size=>lines.forEach(line=>{
        line.style.fontSize=`${size}px`;
        line.style.lineHeight=String(spacing);
        line.style.width="100%";
        line.style.boxSizing="border-box";
        line.style.whiteSpace="pre-wrap";
        line.style.overflowWrap="anywhere";
        line.style.wordBreak="break-word";
        line.style.textAlign=align;
        line.style.margin="0";
        line.style.padding="0";
    });
    const contentHeight=()=>lines.reduce((sum,line)=>sum+line.getBoundingClientRect().height,0);
    const contentWidth=()=>Math.max(0,...lines.map(line=>line.scrollWidth||line.getBoundingClientRect().width));
    const fits=size=>{
        applySize(size);
        return contentHeight()<=height*.90 && contentWidth()<=width*.92;
    };

    // Find the largest size at or below the user's requested PX value that
    // fits the actual output window. This makes the Font Size control affect
    // the physical Screen Output while still auto-fitting smaller screens.
    let low=14, high=requested, best=14;
    if(fits(high)) best=high;
    else {
        for(let i=0;i<16&&low<=high;i++){
            const mid=Math.floor((low+high)/2);
            if(fits(mid)){best=mid;low=mid+1;}else high=mid-1;
        }
    }
    applySize(best);

    const used=contentHeight();
    const free=Math.max(0,height-used);
    const topSpace=Math.round(free*(vertical/100));
    section.style.paddingTop=`${topSpace}px`;
    section.style.paddingBottom=`${Math.max(0,free-topSpace)}px`;
    section.dataset.fittedFontSize=String(best);
}

function fitMultiPageSlideText(output,body,settings){
    if(!output||!body)return;
    const requested=Math.max(12,Math.min(240,Number(settings?.fontPx)||42));
    const min=18;let size=requested;
    body.style.fontSize=`${size}px`;body.style.lineHeight=String(Math.max(.85,Math.min(1.8,Number(settings?.spacing)||1.15)));
    body.style.maxHeight="86vh";body.style.overflow="hidden";body.style.width="92vw";body.style.boxSizing="border-box";
    const fits=()=>body.scrollHeight<=body.clientHeight+2&&body.scrollWidth<=body.clientWidth+2;
    for(let i=0;i<18&&!fits()&&size>min;i++){size=Math.max(min,Math.floor(size*0.88));body.style.fontSize=`${size}px`;}
}
function renderMultiScreenOutput(message){
    const root=document.getElementById("multiScreenOutput");if(!root)return;const output=document.getElementById("multiOutputLyrics");if(!output)return;
    const data=message?.song||song;if(!data)return;const display=String(multiScreenDisplayId);const mode=message?.modes?.[display]||new URLSearchParams(location.search).get("mode")||"lyrics";const enabled=message?.enabled?.[display]!==false;
    root.classList.add("active");root.classList.remove("multi-page-slide-active");document.body.classList.add("multi-output-active");
    const bgMode=message?.backgroundModes?.[display]||multiScreenBackgroundModes[display]||"common";
    let bg=(bgMode==="black")?{type:"none",url:""}:(message?.songBackground||message?.background||{type:"none",url:""});
    if(message?.activePageSlide && bgMode!=="black"){bg=message?.serviceSlidesBackground||getMultiServiceSlidesBackground()||bg;}
    // Fullscreen/output reload fallback: recover the song-specific background directly from localStorage.
    if(bgMode!=="black" && (!bg.url || bg.type==="none")){try{const saved=JSON.parse(localStorage.getItem("chordioMultiScreenSongBackgrounds")||"{}");const key=String(data?.id||data?.title||"song");if(saved?.[key]?.url)bg=saved[key];}catch(_){} }
    const bgEl=document.getElementById("multiOutputBackground");
    const lyricsOnly=mode==="lyrics";
    root.classList.toggle("multi-output-lyrics-only",lyricsOnly);root.classList.toggle("multi-output-chords",mode==="chords");
    if(bgEl){
        bgEl.style.display="block";
        bgEl.style.backgroundImage="none";
        bgEl.style.backgroundSize="cover";bgEl.style.backgroundPosition="center";bgEl.style.backgroundRepeat="no-repeat";
        let video=bgEl.querySelector("video");
        if(bg.type==="video"&&bg.url){
            void chordioResolveBackgroundForDisplay(bg).then(resolved=>{if(!resolved.url)return;if(!video){video=document.createElement("video");video.autoplay=true;video.muted=true;video.loop=true;video.playsInline=true;video.setAttribute("aria-hidden","true");bgEl.appendChild(video);}video.src=resolved.url;video.style.cssText="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;";void video.play().catch(()=>{});});
        }else if(bg.type==="image"&&bg.url){void chordioResolveBackgroundForDisplay(bg).then(resolved=>{if(resolved.url)bgEl.style.backgroundImage=`url(${JSON.stringify(String(resolved.url))})`;});if(video)video.remove();}
        else if(video){video.remove();}
    }
    document.getElementById("multiOutputTitle").textContent=data.title||"CHORDIO";document.getElementById("multiOutputArtist").textContent=data.artist||"";
    const key=data.serviceKey||data.key||data.originalKey||"";document.getElementById("multiOutputKey").textContent=key?`Key: ${key}`:"";document.getElementById("multiOutputMode").textContent=enabled?multiScreenModeLabel(mode):"Hidden";
    const passing=document.getElementById("multiOutputPassing");if(passing){const items=customPassingChordsForSong(data);passing.innerHTML=`<div class="multi-output-passing-items">${items.map((x,i)=>`${i?'<span class="multi-output-passing-sep">|</span>':''}<span class="multi-output-passing-item"><span class="multi-output-passing-label">${esc(x[0])}:</span><span class="multi-output-passing-value">${esc(x[1])}</span></span>`).join("")}</div>`;}
    const note=document.getElementById("multiOutputNoteText");if(note)note.textContent=message?.serviceSongs?.[Number(message?.serviceIndex)]?.presentationNote||"";
    const next=message?.serviceSongs?.[Number(message?.serviceIndex)+1];document.getElementById("multiOutputNextTitle").textContent=next?.title||"END OF SERVICE";document.getElementById("multiOutputNextKey").textContent=next?`Service Key: ${next.serviceKey||next.key||next.originalKey||"—"}`:"";
    const pageSlide=message?.activePageSlide||null;
    if(pageSlide && enabled){
        root.classList.add("multi-page-slide-active");output.className="multi-output-page-slide";output.innerHTML="";const slide=document.createElement("div");slide.className="multi-page-slide-output-card";const st=document.createElement("div");st.className="multi-page-slide-output-title";st.textContent=pageSlide.title||"";const body=document.createElement("div");body.className="multi-page-slide-output-text";body.textContent=String(pageSlide.text||"");const typ=message?.lyricsSettings||getMultiLyricsSettings();body.style.fontFamily=typ.fontFamily||"Arial";body.style.fontWeight=typ.bold?"800":"400";body.style.fontStyle=typ.italic?"italic":"normal";body.style.textDecoration=typ.underline?"underline":"none";body.style.color=typ.color||"#FFFFFF";body.style.letterSpacing=`${Number(typ.letterSpacing||0)}px`;slide.append(st,body);output.appendChild(slide);fitMultiPageSlideText(output,body,typ);document.getElementById("multiOutputSection").textContent="PAGE SLIDE";return;}
    if(message?.black||!enabled||mode==="blank"){output.innerHTML="";return;}
    const source=normalizeSections(data.sections||[]),layout=message?.layout||getPresentationLayout();const visible=layout.map(item=>({item,section:source[Number(item.id)]})).filter(x=>x.section&&x.item.visible!==false);const idx=Math.max(0,Math.min(Number(message?.sectionIndex??0),Math.max(0,visible.length-1)));const settings={spacing:1.15,vertical:50,font:100,align:"center",...(message?.lyricsSettings||{})};const outputLyricsOverrides=message?.lyricsOverrides||{};
    output.innerHTML="";
    if(mode==="lyrics"){
        const entry=visible[idx]||visible[0];
        if(!entry){output.innerHTML='<div class="multi-output-empty-state">No lyrics available for this song.</div>';return;}
        const sec=entry.section;
        output.className="multi-output-lyrics-stage";output.style.textAlign=settings.align||"center";output.style.paddingTop="0";
        const el=document.createElement("section");el.className="multi-output-section current lyrics-only-section";
        const lyricLines=Array.isArray(outputLyricsOverrides[String(entry.item.id)])?outputLyricsOverrides[String(entry.item.id)]:((sec.lines||[]).map(line=>String(line?.lyrics||"")));
        lyricLines.forEach(text=>{const ly=document.createElement("div");ly.className="multi-output-lyric-only-line";ly.textContent=String(text||"");ly.style.fontFamily=settings.fontFamily||"Arial";ly.style.fontWeight=settings.bold?"800":"400";ly.style.fontStyle=settings.italic?"italic":"normal";ly.style.textDecoration=settings.underline?"underline":"none";ly.style.color=settings.color||"#FFFFFF";ly.style.letterSpacing=`${Number(settings.letterSpacing||0)}px`;el.appendChild(ly);});
        output.appendChild(el);fitMultiLyricsToScreen(output,el,settings);document.getElementById("multiOutputSection").textContent="";
    }else{
        // Lyrics + Chords MUST be the same content/structure as PRESENTATION.
        // Deliberately ignore the Multi-Screen Custom Lyrics Line Breaks/Spacing
        // editor and its lyricsOverrides here. Those controls belong only to
        // Lyrics Only. Presentation uses the saved presentation layout and its
        // normal line-wrapping, so Screen Output follows that same source.
        const presentationSections=wrappedSectionsForDisplay(
            applyPresentationLayout(data.sections||[]),
            output,
            32
        );
        const presentationVisible=presentationSections.map((section,sectionIndex)=>({
            item:{id:sectionIndex},
            section
        }));
        const presentationIdx=Math.max(0,Math.min(Number(message?.sectionIndex??0),Math.max(0,presentationVisible.length-1)));
        if(!presentationVisible.length){output.innerHTML='<div class="multi-output-empty-state">No lyrics or chords available for this song.</div>';return;}
        output.className="multi-output-chords-stage";output.style.textAlign="left";output.style.paddingTop="0";
        presentationVisible.forEach((entry,sectionIndex)=>{
            const sec=entry.section;
            const sectionEl=document.createElement("section");
            sectionEl.className="custom-presentation-section"+(sectionIndex===presentationIdx?" current-part":"");
            sectionEl.dataset.sectionIndex=String(sectionIndex);
            sectionEl.id=`multiOutputPresentationSection-${sectionIndex}`;
            const title=document.createElement("div");
            title.className="custom-presentation-section-title";
            title.textContent=presentationSectionLabel(sec,sectionIndex);
            sectionEl.appendChild(title);
            (sec.lines||[]).forEach(line=>{
                const pair=document.createElement("div");pair.className="custom-presentation-line";
                const chordText=chordRowFromPositions(line);
                if(chordText){
                    const ch=document.createElement("div");
                    ch.className="custom-presentation-chord";
                    ch.textContent=chordText;
                    pair.appendChild(ch);
                }
                const ly=document.createElement("div");
                ly.className="custom-presentation-lyric";
                ly.textContent=String(line.lyrics||"");
                pair.appendChild(ly);
                sectionEl.appendChild(pair);
            });
            output.appendChild(sectionEl);
        });
        const selectedSection=output.querySelector(`#multiOutputPresentationSection-${presentationIdx}`)||output.firstElementChild;
        document.getElementById("multiOutputSection").textContent=presentationSectionLabel(presentationVisible[presentationIdx]?.section||presentationVisible[0].section,presentationIdx);
        requestAnimationFrame(()=>{
            if(selectedSection)selectedSection.scrollIntoView({block:"start",behavior:"auto"});
        });
    }
}
function customPassingChordsForSong(data){
    const key=String(data?.serviceKey||data?.key||data?.originalKey||"C");
    const normalize=v=>String(v||"C").trim().replace(/\s*(major|minor|maj|m)\s*$/i,"").replace(/[♯]/g,"#").replace(/[♭]/g,"b");
    const sharp=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];const flat=["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
    const root=(normalize(key).match(/^[A-G](?:#|b)?/i)||["C"])[0];const mapped={Db:"C#",Eb:"D#",Gb:"F#",Ab:"G#",Bb:"A#"};const idx=Math.max(0,sharp.indexOf(mapped[root]||root));const trans=n=>((sharp[(idx+n+120)%12]));
    const out=[["RETURN TO VERSE 1",trans(7)],["LAST 3",trans(9)+"m"]];if(String(data?.category||data?.genre||"").trim().toLowerCase()==="worship"){const p5=trans(5);out.push(["OUTRO",`${p5} → ${p5}m → ${normalize(key)}`],["SINGING IN THE SPIRIT",`${normalize(key)} → ${p5}`]);}return out;
}
window.addEventListener("resize",()=>{if(multiScreenIsOutput){try{if(multiScreenLastOutputState)renderMultiScreenOutput(multiScreenLastOutputState);else{const cached=JSON.parse(localStorage.getItem("chordioMultiScreenState")||"null");if(cached)renderMultiScreenOutput(cached);}}catch(_){}}});

function multiScreenReadCachedState(display){
    const keys=[];
    if(display)keys.push(`chordioMultiScreenOutputState:${display}`);
    keys.push("chordioMultiScreenState");
    for(const key of keys){
        try{const state=JSON.parse(localStorage.getItem(key)||"null");if(state?.song?.sections?.length || state?.song?.title)return state;}catch(_){}
    }
    return null;
}
function multiScreenNormalizeIncomingState(state){
    if(!state)return null;
    const out={...state};
    if(out.song){out.song={...out.song,sections:normalizeSections(out.song.sections||[])};}
    out.modes={...multiScreenModes,...(out.modes||{})};
    out.enabled={...multiScreenEnabled,...(out.enabled||{})};
    out.backgroundModes={...multiScreenBackgroundModes,...(out.backgroundModes||{})};
    out.lyricsSettings={...getMultiLyricsSettings(),...(out.lyricsSettings||{})};
    out.lyricsOverrides=out.lyricsOverrides||{};
    return out;
}
function multiScreenEnsureOutputContent(state){
    const normalized=multiScreenNormalizeIncomingState(state);
    if(normalized?.song?.sections?.length)return normalized;
    const cached=multiScreenReadCachedState(multiScreenDisplayId);
    return multiScreenNormalizeIncomingState(cached);
}

function loadOutputSongFallback(id){
    if(!id)return false;
    const wanted=String(id);
    // 1) Service snapshot is available to the popup on the same origin even
    // when the popup has not completed Firebase Auth yet.
    try{
        const snap=JSON.parse(localStorage.getItem("currentServiceSnapshot")||"null");
        const match=Array.isArray(snap?.songs)?snap.songs.find(x=>String(x?.id||"")===wanted):null;
        if(match&&Array.isArray(match.sections)&&match.sections.length){
            song={...match,sections:normalizeSections(match.sections)};
            transposeSteps=Number(song.transpose||0);
            return true;
        }
    }catch(_){}
    // 2) Locally saved custom songs / previously cached Firebase songs.
    if(loadFromLocalCustomSong(wanted)||loadCachedFirebaseSong(wanted)){
        transposeSteps=Number(song?.transpose||0);
        return true;
    }
    return false;
}

function initMultiScreen(){
    initOnlineBibleControls();
    const params=new URLSearchParams(location.search);multiScreenIsOutput=params.get("multiScreen")==="1";multiScreenDisplayId=params.get("display")||"";
    try{multiScreenChannel=new BroadcastChannel("chordio-multiscreen");}catch(_){multiScreenChannel=null;}
    if(multiScreenIsOutput){
        document.body.classList.add("multi-screen-output-page");
        const enterOutputFullscreen=()=>{try{if(!document.fullscreenElement)document.documentElement.requestFullscreen?.().catch(()=>{});}catch(_){}};
        setTimeout(enterOutputFullscreen,250);
        window.addEventListener("click",enterOutputFullscreen,{once:true});
        const expectedSongId=String(params.get("id")||"");
        let outputHandshakeComplete=false;
        const acceptState=state=>{
            const normalized=multiScreenEnsureOutputContent(state);
            if(!normalized?.song)return;
            const incomingId=String(normalized?.song?.id||"");
            if(!outputHandshakeComplete&&expectedSongId&&incomingId&&incomingId!==expectedSongId)return;
            if(expectedSongId&&incomingId===expectedSongId)outputHandshakeComplete=true;
            multiScreenLastOutputState=normalized;
            renderMultiScreenOutput(normalized);
        };
        window.addEventListener("message",e=>{if(e.data?.type==="chordio-multiscreen-state")acceptState(e.data);if(e.data?.type==="chordio-multiscreen-request")window.opener?.postMessage(multiScreenMessage(),"*");});
        multiScreenChannel?.addEventListener("message",e=>{if(e.data?.type==="chordio-multiscreen-state")acceptState(e.data);});
        window.addEventListener("storage",e=>{if(e.key==="chordioServiceSlidesBackground"||e.key==="chordioServiceSlidesBackgroundUpdatedAt"){try{if(multiScreenLastOutputState){const next={...multiScreenLastOutputState,serviceSlidesBackground:getMultiServiceSlidesBackground()};multiScreenLastOutputState=next;renderMultiScreenOutput(next);}}catch(_){}}});
        try{const scoped=JSON.parse(localStorage.getItem(`chordioMultiScreenOutputState:${multiScreenDisplayId}`)||"null");if(scoped&&(!expectedSongId||String(scoped?.song?.id||"")===expectedSongId))acceptState(scoped);if(!multiScreenLastOutputState){const cached=JSON.parse(localStorage.getItem("chordioMultiScreenState")||"null");if(cached&&(!expectedSongId||String(cached?.song?.id||"")===expectedSongId))acceptState(cached);}}catch(_){}
        // Do not depend on the opener/Auth handshake to paint the output.
        // A newly opened HDMI/presentation window must be able to recover the
        // exact song from the same-origin service snapshot/local cache.
        setTimeout(()=>{
            const id=String(params.get("id")||"");
            if(!multiScreenLastOutputState && id && loadOutputSongFallback(id)){
                const state=multiScreenNormalizeIncomingState({...multiScreenMessage(),display:multiScreenDisplayId});
                multiScreenLastOutputState=state;
                try{localStorage.setItem(`chordioMultiScreenOutputState:${multiScreenDisplayId}`,JSON.stringify(state));localStorage.setItem("chordioMultiScreenState",JSON.stringify(state));}catch(_){}
                renderMultiScreenOutput(state);
            }
            try{window.opener?.postMessage({type:"chordio-multiscreen-request",display:multiScreenDisplayId},"*");}catch(_){}
        },150);
        setTimeout(()=>{try{window.opener?.postMessage({type:"chordio-multiscreen-request",display:multiScreenDisplayId},"*");}catch(_){}},900);
    }else{
        window.addEventListener("message",e=>{if(e.data?.type==="chordio-multiscreen-request")try{e.source?.postMessage(multiScreenMessage(),"*")}catch(_){} });
        document.getElementById("multiScreenControl")?.addEventListener("click",e=>{if(e.target.id==="multiScreenControl")multiScreenCloseControl();});
        document.getElementById("multiScreenClose")?.addEventListener("click",multiScreenCloseControl);
        document.getElementById("multiAddSongButton")?.addEventListener("click",openMultiAddSong);
        document.getElementById("multiAddSongClose")?.addEventListener("click",closeMultiAddSong);
        document.getElementById("multiAddSongCancel")?.addEventListener("click",closeMultiAddSong);
        document.getElementById("multiAddSongSearch")?.addEventListener("input",renderMultiAddSongList);
        document.getElementById("multiAddSongModal")?.addEventListener("click",e=>{if(e.target.id==="multiAddSongModal")closeMultiAddSong();});
        document.getElementById("multiOpenAll")?.addEventListener("click",multiScreenOpenAll);document.getElementById("multiBlackAll")?.addEventListener("click",multiScreenBlackAll);document.getElementById("multiCloseAll")?.addEventListener("click",multiScreenCloseAll);
        document.getElementById("multiPreviewSong")?.addEventListener("click",()=>multiScreenBroadcast({sectionIndex:multiScreenCurrentSection}));
        ["multiLyricsSpacing","multiLyricsVertical","multiLyricsFontPx","multiLyricsAlign","multiLyricsFontFamily","multiLyricsColor","multiLyricsLetterSpacing"].forEach(id=>document.getElementById(id)?.addEventListener("input",()=>{multiLyricsSettings={...multiLyricsSettings,...readMultiLyricsSettingsControls()};syncMultiLyricsSettingsControls();renderMultiPartLyricsPreview();renderMultiScreenPreviews();multiScreenBroadcast({lyricsSettings:multiLyricsSettings});}));
        ["multiLyricsBold","multiLyricsItalic","multiLyricsUnderline"].forEach(id=>document.getElementById(id)?.addEventListener("click",e=>{const el=e.currentTarget;const on=el.getAttribute("aria-pressed")!=="true";el.setAttribute("aria-pressed",String(on));el.classList.toggle("active",on);multiLyricsSettings={...multiLyricsSettings,...readMultiLyricsSettingsControls()};renderMultiPartLyricsPreview();renderMultiScreenPreviews();multiScreenBroadcast({lyricsSettings:multiLyricsSettings});}));
        document.getElementById("multiLyricsSettingsApply")?.addEventListener("click",async()=>{const ok=await saveMultiLyricsSettings(readMultiLyricsSettingsControls());syncMultiLyricsSettingsControls();renderMultiPartLyricsPreview();renderMultiScreenPreviews();multiScreenBroadcast({lyricsSettings:getMultiLyricsSettings()});const st=document.getElementById("multiLyricsSettingsStatus");if(st){st.textContent=ok?"Saved for this Service Planner":"Save failed";setTimeout(()=>st.textContent="",1600);}});
        document.getElementById("multiLyricsEditorSave")?.addEventListener("click",async()=>{const ok=await saveMultiLyricsFormatting();const st=document.getElementById("multiLyricsEditorStatus");if(st){st.textContent=ok?"Lyrics formatting saved for this Service Planner":"Save failed";setTimeout(()=>st.textContent="",1800);}});
        document.getElementById("multiLyricsEditorReset")?.addEventListener("click",()=>{const visible=multiScreenVisibleSections(),entry=visible[multiScreenCurrentSection];if(!entry)return;const all=getMultiLyricsOverrides();delete all[String(entry.item.id)];try{localStorage.setItem(multiLyricsOverridesStorageKey(),JSON.stringify(all));}catch(_){}syncMultiLyricsEditor();renderMultiPartLyricsPreview();renderMultiScreenPreviews();multiScreenBroadcast({lyricsOverrides:all});});
        document.getElementById("multiStructureReset")?.addEventListener("click",()=>{void savePresentationLayout(defaultPresentationLayout()).then(()=>{multiScreenCurrentSection=0;renderMultiScreenControl();multiScreenBroadcast({sectionIndex:0});});});
        document.getElementById("multiStructureSave")?.addEventListener("click",async()=>{await savePresentationLayout(getPresentationLayout());const b=document.getElementById("multiStructureSave");if(b){const old=b.textContent;b.textContent="✓ Saved";setTimeout(()=>b.textContent=old,1200);}});
        document.querySelectorAll("[data-screen-settings]").forEach(btn=>btn.addEventListener("click",()=>{const n=btn.getAttribute("data-screen-settings");const panel=document.getElementById(`multiScreenSettings${n}`);if(panel){document.querySelectorAll("#multiScreenControl .multi-screen-settings-panel.open").forEach(p=>{if(p!==panel)p.classList.remove("open");});panel.classList.add("open");}}));
        document.querySelectorAll("[data-close-screen-settings]").forEach(btn=>btn.addEventListener("click",()=>{const n=btn.getAttribute("data-close-screen-settings");document.getElementById(`multiScreenSettings${n}`)?.classList.remove("open");}));
        [1,2,3,4].forEach(n=>{document.getElementById(`multiMode${n}`)?.addEventListener("change",e=>{multiScreenModes[n]=e.target.value;try{localStorage.setItem("chordioMultiScreenModes",JSON.stringify(multiScreenModes));}catch(_){}renderMultiScreenPreviews();multiScreenBroadcast({});});document.getElementById(`multiBackgroundMode${n}`)?.addEventListener("change",e=>{multiScreenBackgroundModes[n]=e.target.value||"common";try{localStorage.setItem("chordioMultiScreenBackgroundModes",JSON.stringify(multiScreenBackgroundModes));}catch(_){}renderMultiScreenPreviews();multiScreenBroadcast({});});document.getElementById(`multiEnabled${n}`)?.addEventListener("change",e=>{multiScreenEnabled[n]=e.target.checked;try{localStorage.setItem("chordioMultiScreenEnabled",JSON.stringify(multiScreenEnabled));}catch(_){}renderMultiScreenPreviews();if(!multiScreenEnabled[n]){try{multiScreenWindows[n]?.close();}catch(_){}}multiScreenBroadcast({});});document.querySelector(`[data-open-screen="${n}"]`)?.addEventListener("click",()=>multiScreenOpenDisplay(n));});
        document.getElementById("multiSlideAdd")?.addEventListener("click",()=>void addPageSlide());
        document.getElementById("multiSlideSave")?.addEventListener("click",()=>void saveSelectedPageSlide());
        document.getElementById("multiSlideDelete")?.addEventListener("click",()=>void deleteSelectedPageSlide());
        document.getElementById("multiSlideCast")?.addEventListener("click",castSelectedPageSlide);
        document.getElementById("multiSlideStop")?.addEventListener("click",stopPageSlideCast);
        document.getElementById("multiBibleSearch")?.addEventListener("click",()=>void fetchOnlineBibleVerse());
        ["multiBibleBook","multiBibleChapter","multiBibleVerse"].forEach(id=>document.getElementById(id)?.addEventListener("input",updateOnlineBibleReferencePreview));
        ["multiBibleBook","multiBibleChapter","multiBibleVerse"].forEach(id=>document.getElementById(id)?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();void fetchOnlineBibleVerse();}}));
        document.getElementById("multiBibleAdd")?.addEventListener("click",()=>void addBibleReferenceSlide());
        document.getElementById("multiBackgroundSettingsToggle")?.addEventListener("click",()=>{const panel=document.getElementById("multiBackgroundSettingsPanel");panel?.classList.toggle("open");});
        document.getElementById("multiBackgroundSettingsClose")?.addEventListener("click",()=>document.getElementById("multiBackgroundSettingsPanel")?.classList.remove("open"));
        document.getElementById("multiBackgroundApply")?.addEventListener("click",async()=>{const scope=document.getElementById("multiBackgroundScopeSelect")?.value||"all";let type=document.getElementById("multiBackgroundType")?.value||"none";let url=document.getElementById("multiBackgroundUrl")?.value.trim()||"";if(!url){const selected=String(document.getElementById("multiCmgBackground")?.value||"").trim();if(selected){url=selected.startsWith("idb://")?selected:chordioCmgBackgroundUrl(selected);if(selected.startsWith("idb://")){const item=await chordioGetUploadedBackground(selected.slice(6));if(item)type=chordioIsVideoType(item.type)?"video":"image";}else type=/\.(mp4|webm|ogg|mov|m4v)$/i.test(selected)?"video":"image";}}if(!url&&type!=="none"){alert("Please choose or upload an image/video background first.");return;}await setMultiScreenBackground(type,url,scope==="song");const st=document.getElementById("multiBackgroundSongName");if(st){const old=st.textContent;st.textContent="✓ Background applied";setTimeout(()=>{st.textContent=old;},1500);}});
        document.getElementById("multiBackgroundClear")?.addEventListener("click",()=>{const scope=document.getElementById("multiBackgroundScopeSelect")?.value||"all";if(scope==="song")clearMultiScreenSongBackground();else{multiScreenBackground={type:"none",url:""};void saveMultiScreenBackground().then(()=>{renderMultiBackgroundControls();renderMultiScreenPreviews();});}});
        document.getElementById("multiBackgroundScopeSelect")?.addEventListener("change",()=>renderMultiBackgroundControls());
        document.getElementById("multiCmgBackground")?.addEventListener("change",async()=>{const value=String(document.getElementById("multiCmgBackground")?.value||"");if(!value)return;const typeEl=document.getElementById("multiBackgroundType");const input=document.getElementById("multiBackgroundUrl");let type="image",url=value;if(value.startsWith("idb://")){const item=await chordioGetUploadedBackground(value.slice(6));if(item)type=chordioIsVideoType(item.type)?"video":"image";}else{url=chordioCmgBackgroundUrl(value);type=/\.(mp4|webm|ogg|mov|m4v)$/i.test(value)?"video":"image";}if(typeEl)typeEl.value=type;if(input)input.value=url;});
                document.getElementById("chordioBackgroundLibraryOpen")?.addEventListener("click",()=>void openChordioBackgroundLibrary());
        document.getElementById("chordioBackgroundLibraryClose")?.addEventListener("click",closeChordioBackgroundLibrary);
        document.getElementById("chordioBackgroundLibraryModal")?.addEventListener("click",e=>{if(e.target.id==="chordioBackgroundLibraryModal")closeChordioBackgroundLibrary();});
        void initCmgBackgroundLibrary();
        initMultiFeatureAccordions();
        initOnlineBibleControls();
        document.getElementById("multiBackgroundFile")?.addEventListener("change",async e=>{const file=e.target.files?.[0];if(!file)return;try{const saved=await chordioSaveUploadedBackground(file);await initCmgBackgroundLibrary();const select=document.getElementById("multiCmgBackground");if(select)select.value=chordioUploadedBackgroundUrl(saved.id);const type=saved.type.startsWith("video/")?"video":"image";const url=chordioUploadedBackgroundUrl(saved.id);const typeEl=document.getElementById("multiBackgroundType");if(typeEl)typeEl.value=type;const input=document.getElementById("multiBackgroundUrl");if(input)input.value=url;await openChordioBackgroundLibrary();}catch(error){console.error("Unable to save uploaded background:",error);alert("Unable to save this background. Please try another file.");}});
        document.getElementById("multiBackgroundSongFile")?.addEventListener("change",async e=>{const file=e.target.files?.[0];if(!file)return;try{const saved=await chordioSaveUploadedBackground(file);await initCmgBackgroundLibrary();const select=document.getElementById("multiCmgBackground");if(select)select.value=chordioUploadedBackgroundUrl(saved.id);await updateCmgBackgroundPreview();const type=saved.type.startsWith("video/")?"video":"image";await setMultiScreenBackground(type,chordioUploadedBackgroundUrl(saved.id),true);}catch(error){console.error("Unable to save uploaded song background:",error);alert("Unable to save this background. Please try another file.");}});
    }
}

// CHORDIO HOME NAVIGATION — defined globally so the Home button works even
// if another optional control initialization fails before bindControls finishes.
window.chordioGoHome = function(){
    try {
        localStorage.removeItem("resumePresentation");
        localStorage.removeItem("currentSongIndex");
        localStorage.removeItem("currentService");
        localStorage.removeItem("currentServiceId");
        sessionStorage.removeItem("worshiphubSongOpenedFromIndex");
    } catch(_) {}

    try {
        if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(()=>{});
        }
    } catch(_) {}

    // custom-song.html is always one level below the application root.
    // Use the current document path rather than browser history.
    const homeUrl = new URL("index.html", window.location.href).href;
    window.location.href = homeUrl;
};

function bindControls(){
    // Bind Home first. Other optional UI initialization must never prevent it.
    const homeButton = document.getElementById("close");
    if (homeButton && !homeButton.dataset.homeBound) {
        homeButton.dataset.homeBound = "true";
        homeButton.addEventListener("click",(event)=>{
            event.preventDefault();
            event.stopPropagation();
            window.chordioGoHome();
        }, true);
    }

    try { initMultiScreen(); } catch(error) { console.error("CHORDIO Multi-Screen init error:", error); }
    document.getElementById("multiScreenOpen")?.addEventListener("click",multiScreenOpenControl);
    bindPresentationLayoutControls();
    document.getElementById("plus")?.addEventListener("click",()=>{fontSize=Math.min(14,fontSize+1);render();if(document.getElementById("customPresentationScreen")?.classList.contains("show"))renderCustomPresentation();});
    document.getElementById("minus")?.addEventListener("click",()=>{fontSize=Math.max(0,fontSize-1);render();if(document.getElementById("customPresentationScreen")?.classList.contains("show"))renderCustomPresentation();});
    document.getElementById("up")?.addEventListener("click",()=>{setTranspose(1);if(document.getElementById("customPresentationScreen")?.classList.contains("show"))renderCustomPresentation();});
    document.getElementById("down")?.addEventListener("click",()=>{setTranspose(-1);if(document.getElementById("customPresentationScreen")?.classList.contains("show"))renderCustomPresentation();});
    document.getElementById("close")?.addEventListener("click",(event)=>{
        event.preventDefault();
        event.stopPropagation();
        window.chordioGoHome();
    });
    document.getElementById("presentationBtn")?.addEventListener("click",startCustomPresentation);
    document.getElementById("printBtn")?.addEventListener("click",printCustomSong);
    document.getElementById("customPresentationClose")?.addEventListener("click",exitCustomPresentation);
    document.getElementById("customPresentationMax")?.addEventListener("click",enterCustomFullscreen);
    document.getElementById("customPresentationStop")?.addEventListener("click",stopCustomService);
    document.getElementById("customPresentationNoteSave")?.addEventListener("click",()=>void saveCustomPresentationNote());
    document.getElementById("stopServiceBtn")?.addEventListener("click",stopCustomService);
    ["customPresentationSectionPrev","customPresentationSectionPrevBottom"].forEach(id=>document.getElementById(id)?.addEventListener("click",()=>goCustomPresentationSection(-1)));
    ["customPresentationSectionNext","customPresentationSectionNextBottom"].forEach(id=>document.getElementById(id)?.addEventListener("click",()=>goCustomPresentationSection(1)));
    document.addEventListener("keydown",(event)=>{
        if(!document.getElementById("customPresentationScreen")?.classList.contains("show")) return;
        if(["INPUT","TEXTAREA","SELECT"].includes(event.target?.tagName)) return;
        if(event.key==="ArrowRight"){event.preventDefault();next();return;}
        if(event.key==="ArrowLeft"){event.preventDefault();prev();return;}
        if(event.key==="ArrowDown"){event.preventDefault();goCustomPresentationSection(1);return;}
        if(event.key==="ArrowUp"){event.preventDefault();goCustomPresentationSection(-1);return;}
        if(event.key==="Escape"){event.preventDefault();exitCustomPresentation();}
    });
    const prev=()=>{
        if(!service||!Array.isArray(service.songs)||index<=0)return;
        const target=index-1; index=target; redirectSong(service.songs[target],target);
    };
    const next=()=>{
        if(!service||!Array.isArray(service.songs)||index>=service.songs.length-1)return;
        const target=index+1; index=target; redirectSong(service.songs[target],target);
    };
    ["customPresentationPrev","customPresentationPrevBottom","prev"].forEach(id=>document.getElementById(id)?.addEventListener("click",prev));
    ["customPresentationNext","customPresentationNextBottom","next"].forEach(id=>document.getElementById(id)?.addEventListener("click",next));
    document.getElementById("dark")?.addEventListener("click",()=>{document.body.classList.toggle("custom-dark");localStorage.setItem("customSongDarkMode",document.body.classList.contains("custom-dark")?"true":"false");});
    if(localStorage.getItem("customSongDarkMode")==="true")document.body.classList.add("custom-dark");
}

document.addEventListener("DOMContentLoaded",()=>{
    bindControls();
    const hasService=!!localStorage.getItem("currentServiceId");
    const resumePresentation=localStorage.getItem("resumePresentation")==="true";
    // Direct Song Page: start immediately; it does not need Auth to render.
    // Service launch: wait for Auth so we can read the user's service once.
    if(!(hasService && resumePresentation)) void load();
});
onAuthStateChanged(auth,async()=>{
    authResolved=true;
    const activeServiceId=localStorage.getItem("currentServiceId");
    const resume=localStorage.getItem("resumePresentation")==="true";
    if(activeServiceId && resume && !song){
        index=Number(localStorage.getItem("currentSongIndex")||0);
        await load();
    }
});

window.stopService = stopCustomService;
window.WorshipHubCustomSong={transposeUp:()=>setTranspose(1),transposeDown:()=>setTranspose(-1),getTranspose:()=>transposeSteps,getSong:()=>song,startPresentation:startCustomPresentation,exitPresentation:exitCustomPresentation,loadServiceIndex,reload:()=>{song=null;service=null;loading=false;bootPromise=null;load();}};
