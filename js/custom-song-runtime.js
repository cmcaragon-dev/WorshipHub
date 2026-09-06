"use strict";

import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
        loading=false;

        if(resumePresentation && service && service.songs?.length){
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
    return PRESENTATION_LAYOUT_PREFIX + String(song?.id || new URLSearchParams(location.search).get("id") || song?.title || "song");
}
function defaultPresentationLayout(){
    return normalizeSections(song?.sections || []).map((section,index)=>({id:index,type:String(section?.type||""),number:String(section?.number||""),visible:true}));
}
function getPresentationLayout(){
    const defaults=defaultPresentationLayout();
    try{
        const saved=JSON.parse(localStorage.getItem(presentationLayoutStorageKey())||"null");
        if(!Array.isArray(saved)||!saved.length)return defaults;
        const byId=new Map(defaults.map(item=>[Number(item.id),item])), result=[];
        saved.forEach(item=>{
            const id=Number(item?.id); if(!byId.has(id))return;
            result.push({...byId.get(id),visible:item.visible!==false}); byId.delete(id);
        });
        byId.forEach(item=>result.push(item)); return result;
    }catch(_){return defaults;}
}
function savePresentationLayout(layout){try{localStorage.setItem(presentationLayoutStorageKey(),JSON.stringify(layout));}catch(_){}}
function applyPresentationLayout(sections){
    const source=normalizeSections(sections||[]), ordered=[];
    getPresentationLayout().forEach(item=>{
        const section=source[Number(item.id)];
        if(section&&item.visible!==false)ordered.push(section);
    });
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
        const row=document.createElement("div"); row.className="custom-layout-row"+(item.visible===false?" is-hidden":"");
        const num=document.createElement("span"); num.className="custom-layout-number"; num.textContent=String(pos+1);
        const name=document.createElement("span"); name.className="custom-layout-name"; name.textContent=presentationSectionLabel(song.sections?.[item.id],item.id);
        const up=document.createElement("button"); up.type="button"; up.className="custom-layout-move"; up.textContent="↑"; up.title="Move section up"; up.disabled=pos===0;
        up.onclick=()=>{const next=getPresentationLayout();[next[pos-1],next[pos]]=[next[pos],next[pos-1]];savePresentationLayout(next);customPresentationSectionIndex=0;renderPresentationLayoutPanel();renderCustomPresentation();};
        const down=document.createElement("button"); down.type="button"; down.className="custom-layout-move"; down.textContent="↓"; down.title="Move section down"; down.disabled=pos===layout.length-1;
        down.onclick=()=>{const next=getPresentationLayout();[next[pos],next[pos+1]]=[next[pos+1],next[pos]];savePresentationLayout(next);customPresentationSectionIndex=0;renderPresentationLayoutPanel();renderCustomPresentation();};
        const visible=document.createElement("label"); visible.className="custom-layout-visible";
        const check=document.createElement("input"); check.type="checkbox"; check.checked=item.visible!==false;
        check.onchange=()=>{const next=getPresentationLayout();next[pos].visible=check.checked;savePresentationLayout(next);customPresentationSectionIndex=0;renderPresentationLayoutPanel();renderCustomPresentation();};
        visible.append(check,document.createTextNode("Show")); row.append(num,name,up,down,visible); list.appendChild(row);
    });
}
function bindPresentationLayoutControls(){
    const btn=document.getElementById("customPresentationLayout"), panel=document.getElementById("customPresentationLayoutPanel");
    const close=document.getElementById("customPresentationLayoutClose"), reset=document.getElementById("customPresentationLayoutReset");
    if(btn&&!btn.dataset.bound){btn.dataset.bound="1";btn.onclick=()=>{if(!panel)return;renderPresentationLayoutPanel();panel.hidden=!panel.hidden;};}
    if(close&&!close.dataset.bound){close.dataset.bound="1";close.onclick=()=>{if(panel)panel.hidden=true;};}
    if(reset&&!reset.dataset.bound){reset.dataset.bound="1";reset.onclick=()=>{savePresentationLayout(defaultPresentationLayout());customPresentationSectionIndex=0;renderPresentationLayoutPanel();renderCustomPresentation();};}
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
    if(!multiScreenIsOutput) { multiScreenBroadcast({sectionIndex:next}); renderMultiScreenSectionButtons(); }
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
let multiScreenIsOutput = false;
let multiScreenDisplayId = "";
let multiScreenCurrentSection = 0;

function multiScreenMessage(){
    return {
        type:"chordio-multiscreen-state",
        song: song ? {...song, sections: normalizeSections(song.sections || [])} : null,
        transposeSteps: Number(transposeSteps || 0),
        modes: {...multiScreenModes},
        sectionIndex: Number(customPresentationSectionIndex || 0),
        layout: getPresentationLayout(),
        display: multiScreenDisplayId
    };
}
function multiScreenBroadcast(extra={}){
    const message={...multiScreenMessage(),...extra};
    try{ multiScreenChannel?.postMessage(message); }catch(_){ }
    Object.values(multiScreenWindows).forEach(w=>{try{if(w&&!w.closed)w.postMessage(message,"*");}catch(_){ }});
    try{localStorage.setItem("chordioMultiScreenState",JSON.stringify({...message,sentAt:Date.now()}));}catch(_){ }
}
function multiScreenOpenControl(){
    const panel=document.getElementById("multiScreenControl"); if(!panel)return;
    panel.classList.add("show"); panel.setAttribute("aria-hidden","false");
    [1,2,3,4].forEach(n=>{const el=document.getElementById(`multiMode${n}`);if(el)el.value=multiScreenModes[n]||"lyrics";});
    renderMultiScreenSectionButtons();
    multiScreenBroadcast({type:"chordio-multiscreen-state"});
}
function multiScreenCloseControl(){const panel=document.getElementById("multiScreenControl");if(panel){panel.classList.remove("show");panel.setAttribute("aria-hidden","true");}}
function multiScreenModeLabel(mode){return mode==="chords"?"Lyrics + Chords":mode==="blank"?"Blank":"Lyrics Only";}
function renderMultiScreenSectionButtons(){
    const box=document.getElementById("multiSectionButtons"); if(!box)return; box.innerHTML="";
    const sections=normalizeSections(song?.sections||[]);
    const layout=getPresentationLayout();
    layout.forEach((item,visibleIndex)=>{
        if(item.visible===false)return;
        const originalIndex=Number(item.id); const sec=sections[originalIndex]; if(!sec)return;
        const b=document.createElement("button"); b.type="button"; b.textContent=`${sec.type||"Section"} ${sec.number||""}`.trim();
        if(visibleIndex===multiScreenCurrentSection)b.classList.add("active");
        b.addEventListener("click",()=>multiScreenSelectSection(visibleIndex,b.textContent)); box.appendChild(b);
    });
}
function multiScreenSelectSection(index,label=""){
    multiScreenCurrentSection=Math.max(0,Number(index)||0); customPresentationSectionIndex=multiScreenCurrentSection;
    selectCustomPresentationSection(multiScreenCurrentSection,true); updateCustomPresentationSectionButtons(); renderMultiScreenSectionButtons();
    const status=document.getElementById("multiScreenCurrent"); if(status)status.textContent=label||`Section ${multiScreenCurrentSection+1}`;
    multiScreenBroadcast({sectionIndex:multiScreenCurrentSection});
}
function multiScreenOpenDisplay(displayNumber){
    if(!song)return;
    const n=Number(displayNumber); const mode=multiScreenModes[n]||"lyrics";
    const url=new URL(location.href); url.searchParams.set("multiScreen","1"); url.searchParams.set("display",String(n)); url.searchParams.set("id",String(song.id||"")); url.searchParams.set("mode",mode);
    const features="popup=yes,resizable=yes,scrollbars=no,width=1280,height=720";
    let w=multiScreenWindows[n];
    if(!w||w.closed) w=window.open(url.href,`CHORDIO_SCREEN_${n}`,features);
    else {try{w.location.href=url.href;w.focus();}catch(_){}}
    multiScreenWindows[n]=w;
    setTimeout(()=>multiScreenBroadcast({}),350);
}
function multiScreenOpenAll(){[1,2,3,4].forEach(n=>multiScreenOpenDisplay(n));}
function multiScreenCloseAll(){Object.values(multiScreenWindows).forEach(w=>{try{if(w&&!w.closed)w.close();}catch(_){}});multiScreenWindows={};}
function multiScreenBlackAll(){multiScreenBroadcast({black:true});}
function renderMultiScreenOutput(message){
    const root=document.getElementById("multiScreenOutput"); if(!root)return;
    const output=document.getElementById("multiOutputLyrics"); if(!output)return;
    const data=message?.song || song; if(!data)return;
    const mode=message?.modes?.[multiScreenDisplayId] || new URLSearchParams(location.search).get("mode") || "lyrics";
    root.classList.add("active"); document.body.classList.add("multi-output-active");
    document.getElementById("multiOutputTitle").textContent=data.title||"CHORDIO";
    const key=data.serviceKey||data.key||data.originalKey||""; document.getElementById("multiOutputKey").textContent=key?`Key: ${key}`:"";
    document.getElementById("multiOutputMode").textContent=multiScreenModeLabel(mode);
    if(message?.black){output.innerHTML="";return;}
    const sections=normalizeSections(data.sections||[]); output.innerHTML="";
    sections.forEach((sec,si)=>{
        const el=document.createElement("section");el.className="multi-output-section";el.id=`multi-output-section-${si}`;el.dataset.sectionIndex=String(si);
        if(si===Number(message?.sectionIndex??multiScreenCurrentSection))el.classList.add("current");
        const title=document.createElement("div");title.className="multi-output-section-title";title.textContent=`${sec.type||""} ${sec.number||""}`.trim();el.appendChild(title);
        (sec.lines||[]).forEach(line=>{
            const row=document.createElement("div");row.className="multi-output-line";
            if(mode==="chords"){
                const ch=document.createElement("div");ch.className="multi-output-chord";ch.textContent=chordRowFromPositions(line);row.appendChild(ch);
            }
            const ly=document.createElement("div");ly.className="multi-output-lyric";ly.textContent=String(line.lyrics||"");row.appendChild(ly);el.appendChild(row);
        }); output.appendChild(el);
    });
    const idx=Math.max(0,Number(message?.sectionIndex??multiScreenCurrentSection));
    requestAnimationFrame(()=>document.getElementById(`multi-output-section-${idx}`)?.scrollIntoView({behavior:"smooth",block:"start"}));
    const sectionLabel=sections[idx]?`${sections[idx].type||"Section"} ${sections[idx].number||""}`.trim():"";
    document.getElementById("multiOutputSection").textContent=sectionLabel;
}
function initMultiScreen(){
    const params=new URLSearchParams(location.search); multiScreenIsOutput=params.get("multiScreen")==="1"; multiScreenDisplayId=params.get("display")||"";
    try{multiScreenChannel=new BroadcastChannel("chordio-multiscreen");}catch(_){multiScreenChannel=null;}
    if(multiScreenIsOutput){
        window.addEventListener("message",e=>{if(e.data?.type==="chordio-multiscreen-state")renderMultiScreenOutput(e.data);if(e.data?.type==="chordio-multiscreen-request")window.opener?.postMessage(multiScreenMessage(),"*");});
        multiScreenChannel?.addEventListener("message",e=>{if(e.data?.type==="chordio-multiscreen-state")renderMultiScreenOutput(e.data);});
        try{const cached=JSON.parse(localStorage.getItem("chordioMultiScreenState")||"null");if(cached)renderMultiScreenOutput(cached);}catch(_){ }
        setTimeout(()=>{try{window.opener?.postMessage({type:"chordio-multiscreen-request",display:multiScreenDisplayId},"*");}catch(_){ }},300);
    }else{
        window.addEventListener("message",e=>{if(e.data?.type==="chordio-multiscreen-request")try{e.source?.postMessage(multiScreenMessage(),"*")}catch(_){}});
        document.getElementById("multiScreenControl")?.addEventListener("click",e=>{if(e.target.id==="multiScreenControl")multiScreenCloseControl();});
        document.getElementById("multiScreenClose")?.addEventListener("click",multiScreenCloseControl);
        document.getElementById("multiOpenAll")?.addEventListener("click",multiScreenOpenAll);
        document.getElementById("multiBlackAll")?.addEventListener("click",multiScreenBlackAll);
        document.getElementById("multiCloseAll")?.addEventListener("click",multiScreenCloseAll);
        [1,2,3,4].forEach(n=>{document.getElementById(`multiMode${n}`)?.addEventListener("change",e=>{multiScreenModes[n]=e.target.value;try{localStorage.setItem("chordioMultiScreenModes",JSON.stringify(multiScreenModes));}catch(_){} multiScreenBroadcast({});});document.querySelector(`[data-open-screen="${n}"]`)?.addEventListener("click",()=>multiScreenOpenDisplay(n));});
    }
}

function bindControls(){
    initMultiScreen();
    document.getElementById("multiScreenOpen")?.addEventListener("click",multiScreenOpenControl);
    bindPresentationLayoutControls();
    document.getElementById("plus")?.addEventListener("click",()=>{fontSize=Math.min(14,fontSize+1);render();if(document.getElementById("customPresentationScreen")?.classList.contains("show"))renderCustomPresentation();});
    document.getElementById("minus")?.addEventListener("click",()=>{fontSize=Math.max(0,fontSize-1);render();if(document.getElementById("customPresentationScreen")?.classList.contains("show"))renderCustomPresentation();});
    document.getElementById("up")?.addEventListener("click",()=>{setTranspose(1);if(document.getElementById("customPresentationScreen")?.classList.contains("show"))renderCustomPresentation();});
    document.getElementById("down")?.addEventListener("click",()=>{setTranspose(-1);if(document.getElementById("customPresentationScreen")?.classList.contains("show"))renderCustomPresentation();});
    document.getElementById("close")?.addEventListener("click",()=>{
        // Return to the already-loaded Song Library instead of navigating to
        // index.html again. Browser history/bfcache can restore the exact
        // library state without re-reading the user and song collection.
        const referrer = document.referrer || "";
        const sameOrigin = (()=>{ try { return new URL(referrer).origin === location.origin; } catch(_) { return false; } })();
        if (sameOrigin && /(?:^|\/)index\.html(?:$|[?#])/.test(new URL(referrer).pathname + new URL(referrer).search)) {
            history.back();
            return;
        }
        if (history.length > 1) { history.back(); return; }
        window.location.replace("index.html");
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
