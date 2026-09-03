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

    // IMPORTANT: size the Song Page from ONLY the song currently being
    // displayed. Do not inspect service.songs, the song list, or any other
    // song. A new measurement is made every time the selected song changes.
    const currentSections = normalizeSections(song.sections || []);
    const currentLines = currentSections.flatMap(section => section.lines || []);
    if (!currentLines.length) {
        stage.style.removeProperty("--wh-song-stage-width");
        stage.style.removeProperty("--wh-song-column-width");
        stage.dataset.measuredSong = String(song.id || song.title || "");
        return;
    }

    const fontSize = 20 + fontSize;
    const canvas = sizeSongColumnsToContent.canvas || (sizeSongColumnsToContent.canvas = document.createElement("canvas"));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.font = `${fontSize}px Consolas, Monaco, "Courier New", monospace`;

    // Measure the current song's longest visible lyric/chord row only.
    let longest = 0;
    currentLines.forEach(line => {
        const lyrics = String(line?.lyrics || "");
        const chords = String(line?.chordText || chordRowFromPositionsNoTranspose(line) || "");
        longest = Math.max(longest, ctx.measureText(lyrics).width, ctx.measureText(chords).width);
    });

    // Account for the section padding, while keeping both columns the same
    // width. The stage is exactly two column widths + the column gap.
    const gap = 28;
    const sectionPadding = 28;
    const minimumColumn = 220;
    const viewportLimit = Math.max(320, window.innerWidth - 16);
    const desiredColumn = Math.max(minimumColumn, Math.ceil(longest + sectionPadding));
    const maxColumn = Math.max(minimumColumn, Math.floor((viewportLimit - gap) / 2));
    const columnWidth = Math.min(desiredColumn, maxColumn);
    const stageWidth = Math.min(viewportLimit, (columnWidth * 2) + gap);

    stage.style.setProperty("--wh-song-column-width", `${columnWidth}px`);
    stage.style.setProperty("--wh-song-stage-width", `${stageWidth}px`);
    stage.style.width = `${stageWidth}px`;
    stage.style.maxWidth = `${viewportLimit}px`;
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
    const sections = wrappedSectionsForDisplay(normalizeSections(song.sections), stage, 20 + fontSize);
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
    if(!serviceId || !auth.currentUser) return false;
    try {
        // startService stores a confirmed snapshot. Use it immediately so the
        // presentation does not wait for a second Firestore service read.
        let cached = null;
        try { cached = JSON.parse(localStorage.getItem("currentServiceSnapshot") || "null"); } catch(e) {}
        if(cached && String(cached.id) === String(serviceId) && Array.isArray(cached.songs)){
            service = cached;
        } else {
            const snap = await getDoc(doc(db,"users",auth.currentUser.uid,"services",String(serviceId)));
            if(!snap.exists()) return false;
            service = {id:snap.id,...snap.data()};
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
            found=await loadFromFirebaseSong(id);
            if(!found) found=loadFromLocalCustomSong(id);
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

function renderCustomPresentation(){
    const output=document.getElementById("customPresentationLyrics");
    if(!output||!song)return;
    output.innerHTML="";

    const grid=document.createElement("div");
    grid.className="custom-presentation-grid";
    output.appendChild(grid);

    const cols=[document.createElement("div"),document.createElement("div")];
    cols.forEach(c=>{c.className="custom-presentation-column";grid.appendChild(c);});

    const sections=wrappedSectionsForDisplay(normalizeSections(song.sections), output, 32);
    const weight=section=>{
        const lines=Array.isArray(section?.lines)?section.lines:[];
        return Math.max(1,lines.length*2+lines.reduce((n,l)=>n+Math.max(String(l?.lyrics||"").length,String(l?.chordText||"").length)/80,0));
    };
    const total=sections.reduce((n,s)=>n+weight(s),0);
    const target=total/2;
    let accumulated=0;
    let split=sections.length;
    if(sections.length>1){
        for(let i=0;i<sections.length-1;i++){
            accumulated+=weight(sections[i]);
            if(accumulated>=target){split=i+1;break;}
        }
        split=Math.min(Math.max(1,split),sections.length-1);
    }

    sections.forEach((section,sectionIndex)=>{
        const sec=document.createElement("section");
        sec.className="custom-presentation-section";
        sec.dataset.sectionIndex=String(sectionIndex);
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
        cols[sectionIndex<split?0:1].appendChild(sec);
    });

    const t=document.getElementById("customPresentationTitle");
    if(t)t.textContent=song.title||"Untitled Song";
    const k=document.getElementById("customPresentationKey");
    // The Presentation must show exactly the same displayed key as the Song Page.
    // Do not transpose the already-displayed Service Key a second time.
    const pageKey = String(document.getElementById("songKey")?.textContent || "").trim();
    const authoritativeKey = pageKey || customServiceKey();
    if(k)k.textContent=`Key: ${authoritativeKey || "—"}`;
    renderCustomPassingChords();
    renderCustomNextPreview();
    updateCounter();
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

function bindControls(){
    document.getElementById("plus")?.addEventListener("click",()=>{fontSize=Math.min(14,fontSize+1);render();if(document.getElementById("customPresentationScreen")?.classList.contains("show"))renderCustomPresentation();});
    document.getElementById("minus")?.addEventListener("click",()=>{fontSize=Math.max(0,fontSize-1);render();if(document.getElementById("customPresentationScreen")?.classList.contains("show"))renderCustomPresentation();});
    document.getElementById("up")?.addEventListener("click",()=>{setTranspose(1);if(document.getElementById("customPresentationScreen")?.classList.contains("show"))renderCustomPresentation();});
    document.getElementById("down")?.addEventListener("click",()=>{setTranspose(-1);if(document.getElementById("customPresentationScreen")?.classList.contains("show"))renderCustomPresentation();});
    document.getElementById("close")?.addEventListener("click",()=>window.location.assign("index.html"));
    document.getElementById("presentationBtn")?.addEventListener("click",startCustomPresentation);
    document.getElementById("printBtn")?.addEventListener("click",printCustomSong);
    document.getElementById("customPresentationClose")?.addEventListener("click",exitCustomPresentation);
    document.getElementById("customPresentationMax")?.addEventListener("click",enterCustomFullscreen);
    document.getElementById("customPresentationStop")?.addEventListener("click",stopCustomService);
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
