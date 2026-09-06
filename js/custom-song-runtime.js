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
let multiScreenEnabled = (()=>{ try { const saved=JSON.parse(localStorage.getItem("chordioMultiScreenEnabled")||"null"); return {1:saved?.[1]!==false,2:saved?.[2]!==false,3:saved?.[3]!==false,4:saved?.[4]!==false}; } catch(_) { return {1:true,2:true,3:true,4:true}; } })();
let multiScreenIsOutput = false;
let multiScreenDisplayId = "";
let multiScreenCurrentSection = 0;
let multiScreenBackground = (()=>{ try{return JSON.parse(localStorage.getItem("chordioMultiScreenBackground")||"null")||{type:"none",url:""};}catch(_){return {type:"none",url:""};} })();
let multiScreenBackgrounds = (()=>{ try { const saved=JSON.parse(localStorage.getItem("chordioMultiScreenBackgrounds")||"null"); return {1:saved?.[1]||multiScreenBackground,2:saved?.[2]||multiScreenBackground,3:saved?.[3]||multiScreenBackground,4:saved?.[4]||multiScreenBackground}; } catch(_) { return {1:multiScreenBackground,2:multiScreenBackground,3:multiScreenBackground,4:multiScreenBackground}; } })();
let multiLyricsSettings = (()=>{ try { return JSON.parse(localStorage.getItem("chordioMultiLyricsSettings")||"null") || {spacing:1.15,vertical:50,font:100,align:"center"}; } catch(_) { return {spacing:1.15,vertical:50,font:100,align:"center"}; } })();
function multiLyricsSettingsStorageKey(){const serviceId=localStorage.getItem("currentServiceId")||"standalone";return "chordioMultiLyricsSettings:"+String(serviceId)+":"+String(song?.id||new URLSearchParams(location.search).get("id")||song?.title||"song");}
function getMultiLyricsSettings(){const defaults={spacing:1.15,vertical:50,font:100,align:"center"};const serviceSaved=localStorage.getItem("currentServiceId")&&song?.id?(service?.multiLyricsSettings||{})[String(song.id)]:null;try{return {...defaults,...(serviceSaved||JSON.parse(localStorage.getItem(multiLyricsSettingsStorageKey())||"null")||{}),...(multiLyricsSettings||{})};}catch(_){return {...defaults,...(multiLyricsSettings||{})};}}
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
    return {type:"chordio-multiscreen-state",song:song?{...song,sections:normalizeSections(song.sections)}:null,serviceName:service?.name||"",serviceIndex:index,serviceSongs:service?.songs||[],sectionIndex:multiScreenCurrentSection,modes:{...multiScreenModes},enabled:{...multiScreenEnabled},background:{...(multiScreenBackgrounds[1]||multiScreenBackground)},backgrounds:{...multiScreenBackgrounds},layout:getPresentationLayout(),lyricsSettings:getMultiLyricsSettings(),lyricsOverrides:getMultiLyricsOverrides()};
}
function multiScreenBroadcast(extra={}){
    const message={...multiScreenMessage(),...extra};
    try{multiScreenChannel?.postMessage(message);}catch(_){}
    try{localStorage.setItem("chordioMultiScreenState",JSON.stringify(message));}catch(_){}
    Object.values(multiScreenWindows).forEach(w=>{try{if(w&&!w.closed)w.postMessage(message,"*");}catch(_){} });
}
function multiScreenOpenControl(){
    const panel=document.getElementById("multiScreenControl");if(!panel)return;
    panel.classList.add("show");panel.setAttribute("aria-hidden","false");
    const serviceName=document.getElementById("multiServiceName");if(serviceName)serviceName.textContent=service?.name||"No Service Planner";
    [1,2,3,4].forEach(n=>{const el=document.getElementById(`multiMode${n}`);if(el)el.value=multiScreenModes[n]||"lyrics";const cb=document.getElementById(`multiEnabled${n}`);if(cb)cb.checked=multiScreenEnabled[n]!==false;});
    renderMultiServiceSongs();renderMultiScreenSectionButtons();renderMultiPartLyricsPreview();renderMultiStructureList();renderMultiBackgroundControls();syncMultiLyricsSettingsControls();syncMultiLyricsEditor();renderMultiScreenPreviews();multiScreenBroadcast({});
}
function multiScreenCloseControl(){const panel=document.getElementById("multiScreenControl");if(panel){panel.classList.remove("show");panel.setAttribute("aria-hidden","true");}}
function renderMultiServiceSongs(){
    const box=document.getElementById("multiServiceSongList");if(!box)return;box.innerHTML="";
    const songs=Array.isArray(service?.songs)?service.songs:[];
    if(!songs.length){box.innerHTML='<div class="multi-preview-empty" style="height:120px">No songs in this Service Planner.</div>';return;}
    songs.forEach((item,i)=>{
        const b=document.createElement("button");b.type="button";b.className="multi-service-song"+(i===index?" active":"");
        b.innerHTML=`<span class="song-num">${i+1}</span><span class="song-name">${esc(item.title||"Untitled Song")}</span><span class="song-meta">${esc(item.artist||"")} • Key: ${esc(item.serviceKey||item.key||item.originalKey||"—")}</span>${item.presentationNote?`<span class="song-note">📝 ${esc(item.presentationNote)}</span>`:""}`;
        b.onclick=async()=>{await loadServiceIndex(i);multiScreenCurrentSection=0;renderMultiScreenControl();multiScreenBroadcast({sectionIndex:0});};
        box.appendChild(b);
    });
}
function renderMultiScreenControl(){
    const name=document.getElementById("multiServiceName");if(name)name.textContent=service?.name||"No Service Planner";
    renderMultiServiceSongs();renderMultiScreenSectionButtons();renderMultiPartLyricsPreview();renderMultiStructureList();renderMultiBackgroundControls();syncMultiLyricsSettingsControls();syncMultiLyricsEditor();renderMultiScreenPreviews();
}
function renderMultiLivePreview(){renderMultiPartLyricsPreview();}
function renderMultiPartLyricsPreview(){const box=document.getElementById("multiPartLyricsPreview");if(!box)return;box.innerHTML="";const visible=multiScreenVisibleSections(),entry=visible[multiScreenCurrentSection];if(!song||!entry){box.innerHTML='<div class="multi-preview-empty">Select a song and song part.</div>';return;}const settings=getMultiLyricsSettings();const wrap=document.createElement("div");wrap.className="multi-part-lyrics-inner";wrap.style.textAlign=settings.align||"center";wrap.style.lineHeight=String(Math.max(.7,Math.min(2.4,Number(settings.spacing)||1.15)));wrap.style.fontSize=`${Math.max(.5,Math.min(2,Number(settings.font||100)/100))}em`;const v=Math.max(0,Math.min(100,Number(settings.vertical)||50));wrap.style.paddingTop=`${Math.max(0,Math.min(65,v*0.65))}vh`;getMultiLyricsForSection(entry.section,entry.item.id).forEach(text=>{const ly=document.createElement("div");ly.className="multi-part-lyrics-line";ly.textContent=String(text||"");wrap.appendChild(ly);});box.appendChild(wrap);}
function syncMultiLyricsSettingsControls(){const settings=getMultiLyricsSettings();[['multiLyricsSpacing',settings.spacing],['multiLyricsVertical',settings.vertical],['multiLyricsFont',settings.font],['multiLyricsAlign',settings.align]].forEach(([id,value])=>{const el=document.getElementById(id);if(el)el.value=String(value);});const a=document.getElementById("multiLyricsSpacingValue");if(a)a.textContent=Number(settings.spacing).toFixed(2);const b=document.getElementById("multiLyricsVerticalValue");if(b)b.textContent=`${Math.round(Number(settings.vertical))}%`;const c=document.getElementById("multiLyricsFontValue");if(c)c.textContent=`${Math.round(Number(settings.font))}%`;}
function readMultiLyricsSettingsControls(){return{spacing:Number(document.getElementById("multiLyricsSpacing")?.value||1.15),vertical:Number(document.getElementById("multiLyricsVertical")?.value||50),font:Number(document.getElementById("multiLyricsFont")?.value||100),align:document.getElementById("multiLyricsAlign")?.value||"center"};}
function renderMultiScreenPreviews(){
    const box=document.getElementById("multiScreenPreviews");if(!box)return;
    box.innerHTML="";
    const visible=multiScreenVisibleSections(),selected=visible[multiScreenCurrentSection]?.section,settings=getMultiLyricsSettings();
    [1,2,3,4].forEach(n=>{
        const card=document.createElement("div");card.className="multi-screen-preview-card"+(multiScreenEnabled[n]===false?" disabled":"");
        const head=document.createElement("div");head.className="multi-screen-preview-card-head";head.innerHTML=`<strong>SCREEN ${n}</strong><span>${multiScreenEnabled[n]===false?"HIDDEN":multiScreenModeLabel(multiScreenModes[n])}</span>`;card.appendChild(head);
        const stage=document.createElement("div");stage.className="multi-screen-preview-stage";
        if(multiScreenEnabled[n]===false) stage.innerHTML='<span class="multi-preview-empty">Screen disabled</span>';
        else if(!song||!selected) stage.innerHTML='<span class="multi-preview-empty">No song selected</span>';
        else if(multiScreenModes[n]==="blank") stage.innerHTML='<span class="multi-preview-empty">BLACK / BLANK</span>';
        else {
            // Each HDMI screen can have its own background.
            const bg=multiScreenBackgrounds[n]||multiScreenBackground||{type:"none",url:""};
            if(bg.type==="image"&&bg.url){stage.style.backgroundImage=`linear-gradient(rgba(0,0,0,.32),rgba(0,0,0,.32)),url("${String(bg.url).replace(/"/g,'\"')}")`;stage.style.backgroundSize="cover";stage.style.backgroundPosition="center";}
            if(bg.type==="video"&&bg.url){const v=document.createElement("video");v.src=bg.url;v.autoplay=true;v.muted=true;v.loop=true;v.playsInline=true;v.className="multi-preview-bg-video";stage.appendChild(v);void v.play().catch(()=>{});}
            const overlay=document.createElement("div");overlay.className="multi-preview-bg-overlay";stage.appendChild(overlay);
            if(multiScreenModes[n]==="lyrics"){
                stage.classList.add("lyrics-preview");stage.style.textAlign=settings.align||"center";
                const l=document.createElement("div");l.className="preview-selected-lyrics";l.style.lineHeight=String(settings.spacing||1.15);l.style.fontSize=`${Math.max(.65,Number(settings.font||100)/100)}em`;l.style.paddingTop=`${Math.max(0,Number(settings.vertical||50)-50)/4}%`;
                getMultiLyricsForSection(selected,visible[multiScreenCurrentSection]?.item?.id).slice(0,7).forEach(text=>{const x=document.createElement("div");x.textContent=String(text||"");l.appendChild(x);});stage.appendChild(l);
            }else{
                // The small Screen Output Preview intentionally shows only the content area.
                // Song title and passing chords are reserved for the actual Lyrics + Chords output.
                stage.classList.add("chords-preview");
                visible.slice(0,5).forEach((entry,i)=>{const sec=document.createElement("div");sec.className="preview-chords-section"+(i===multiScreenCurrentSection?" selected":"");const label=document.createElement("b");label.textContent=presentationSectionLabel(entry.section,i);sec.appendChild(label);(entry.section.lines||[]).slice(0,3).forEach(line=>{const row=document.createElement("div");row.className="preview-chord-row";const ch=document.createElement("span");ch.className="pc-chord";ch.textContent=chordRowFromPositions(line);const ly=document.createElement("span");ly.textContent=String(line.lyrics||"");row.append(ch,ly);sec.appendChild(row);});stage.appendChild(sec);});
            }
        }
        card.appendChild(stage);box.appendChild(card);
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
    const globalType=document.getElementById("multiBackgroundType"),globalUrl=document.getElementById("multiBackgroundUrl");
    if(globalType)globalType.value=multiScreenBackground.type||"none";
    if(globalUrl)globalUrl.value=multiScreenBackground.url||"";
    [1,2,3,4].forEach(n=>{const bg=multiScreenBackgrounds[n]||{type:"none",url:""};const type=document.getElementById(`multiBackgroundType${n}`),url=document.getElementById(`multiBackgroundUrl${n}`);if(type)type.value=bg.type||"none";if(url)url.value=bg.url||"";});
}
function saveMultiScreenBackgrounds(){try{localStorage.setItem("chordioMultiScreenBackgrounds",JSON.stringify(multiScreenBackgrounds));}catch(_){}multiScreenBackground={...multiScreenBackgrounds[1]};try{localStorage.setItem("chordioMultiScreenBackground",JSON.stringify(multiScreenBackground));}catch(_){}multiScreenBroadcast({backgrounds:multiScreenBackgrounds,background:multiScreenBackground});}
async function setMultiScreenBackground(n,type,url){multiScreenBackgrounds[n]={type:type||"none",url:url||""};saveMultiScreenBackgrounds();renderMultiBackgroundControls();renderMultiScreenPreviews();}

function multiScreenOpenDisplay(displayNumber){
    if(!song)return;const n=Number(displayNumber);if(multiScreenEnabled[n]===false)return;const mode=multiScreenModes[n]||"lyrics";
    const url=new URL(location.href);url.searchParams.set("multiScreen","1");url.searchParams.set("display",String(n));url.searchParams.set("id",String(song.id||""));url.searchParams.set("mode",mode);
    const features="popup=yes,resizable=yes,scrollbars=no,width=1280,height=720";let w=multiScreenWindows[n];
    if(!w||w.closed)w=window.open(url.href,`CHORDIO_SCREEN_${n}`,features);else{try{w.location.href=url.href;w.focus();}catch(_){}}
    multiScreenWindows[n]=w;setTimeout(()=>multiScreenBroadcast({}),400);
}
function multiScreenOpenAll(){[1,2,3,4].forEach(n=>{if(multiScreenEnabled[n]!==false)multiScreenOpenDisplay(n);});}
function multiScreenCloseAll(){Object.values(multiScreenWindows).forEach(w=>{try{if(w&&!w.closed)w.close();}catch(_){}});multiScreenWindows={};}
function multiScreenBlackAll(){multiScreenBroadcast({black:true});}
function fitMultiLyricsToScreen(output, section, settings){
    if(!output||!section)return;
    const width=Math.max(320,output.clientWidth||window.innerWidth||1280);
    const height=Math.max(240,output.clientHeight||window.innerHeight||720);
    const userScale=Math.max(.7,Math.min(1.5,Number(settings.font||100)/100));
    const spacing=Math.max(.7,Math.min(2.2,Number(settings.spacing||1.15)));
    const vertical=Math.max(0,Math.min(100,Number(settings.vertical??50)));
    const align=settings.align||"center";
    section.style.textAlign=align;
    section.style.paddingTop="0px";
    section.style.paddingBottom="0px";
    section.style.minHeight="0";
    section.style.height="auto";
    section.style.width="100%";
    const lines=[...section.querySelectorAll('.multi-output-lyric-only-line')];
    const initial=Math.max(22,Math.min(92,Math.min(width*0.072,height*0.105)*userScale));
    let size=initial;
    const applySize=()=>lines.forEach(line=>{line.style.fontSize=`${size}px`;line.style.lineHeight=String(spacing);line.style.width="100%";line.style.boxSizing="border-box";line.style.whiteSpace="pre-wrap";line.style.overflowWrap="anywhere";line.style.wordBreak="break-word";line.style.textAlign=align;});
    applySize();
    // Shrink until the wrapped lyrics fit the real output viewport.
    for(let i=0;i<28;i++){
        const tooTall=section.scrollHeight>height*.90;
        const tooWide=section.scrollWidth>width*.98;
        if(!tooTall&&!tooWide)break;
        size*=.93;
        if(size<16){size=16;break;}
        applySize();
    }
    // Vertical position is based on the remaining free space after fitting.
    const contentHeight=section.scrollHeight;
    const freeSpace=Math.max(0,height-contentHeight);
    section.style.paddingTop=`${freeSpace*(vertical/100)}px`;
    section.dataset.fittedFontSize=String(Math.round(size));
}

function renderMultiScreenOutput(message){
    const root=document.getElementById("multiScreenOutput");if(!root)return;const output=document.getElementById("multiOutputLyrics");if(!output)return;
    const data=message?.song||song;if(!data)return;const display=String(multiScreenDisplayId);const mode=message?.modes?.[display]||new URLSearchParams(location.search).get("mode")||"lyrics";const enabled=message?.enabled?.[display]!==false;
    root.classList.add("active");document.body.classList.add("multi-output-active");
    const bg=(message?.backgrounds?.[display])||message?.background||{type:"none",url:""};
    const bgEl=document.getElementById("multiOutputBackground");
    const lyricsOnly=mode==="lyrics";
    root.classList.toggle("multi-output-lyrics-only",lyricsOnly);root.classList.toggle("multi-output-chords",mode==="chords");
    if(bgEl){
        bgEl.style.display="block";
        bgEl.style.backgroundImage=(bg.type==="image"&&bg.url)?`url(${JSON.stringify(String(bg.url))})`:"none";
        bgEl.style.backgroundSize="cover";bgEl.style.backgroundPosition="center";bgEl.style.backgroundRepeat="no-repeat";
        let video=bgEl.querySelector("video");
        if(bg.type==="video"&&bg.url){
            if(!video){video=document.createElement("video");video.autoplay=true;video.muted=true;video.loop=true;video.playsInline=true;video.setAttribute("aria-hidden","true");bgEl.appendChild(video);}
            if(video.src!==bg.url)video.src=bg.url;
            video.style.cssText="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;";void video.play().catch(()=>{});
        }else if(video){video.remove();}
    }
    document.getElementById("multiOutputTitle").textContent=data.title||"CHORDIO";document.getElementById("multiOutputArtist").textContent=data.artist||"";
    const key=data.serviceKey||data.key||data.originalKey||"";document.getElementById("multiOutputKey").textContent=key?`Key: ${key}`:"";document.getElementById("multiOutputMode").textContent=enabled?multiScreenModeLabel(mode):"Hidden";
    const passing=document.getElementById("multiOutputPassing");if(passing){const items=customPassingChordsForSong(data);passing.innerHTML=`<div class="multi-output-passing-items">${items.map((x,i)=>`${i?'<span class="multi-output-passing-sep">|</span>':''}<span class="multi-output-passing-item"><span class="multi-output-passing-label">${esc(x[0])}:</span><span class="multi-output-passing-value">${esc(x[1])}</span></span>`).join("")}</div>`;}
    const note=document.getElementById("multiOutputNoteText");if(note)note.textContent=message?.serviceSongs?.[Number(message?.serviceIndex)]?.presentationNote||"";
    const next=message?.serviceSongs?.[Number(message?.serviceIndex)+1];document.getElementById("multiOutputNextTitle").textContent=next?.title||"END OF SERVICE";document.getElementById("multiOutputNextKey").textContent=next?`Service Key: ${next.serviceKey||next.key||next.originalKey||"—"}`:"";
    if(message?.black||!enabled||mode==="blank"){output.innerHTML="";return;}
    const source=normalizeSections(data.sections||[]),layout=message?.layout||getPresentationLayout();const visible=layout.map(item=>({item,section:source[Number(item.id)]})).filter(x=>x.section&&x.item.visible!==false);const idx=Math.max(0,Math.min(Number(message?.sectionIndex??0),Math.max(0,visible.length-1)));const settings={spacing:1.15,vertical:50,font:100,align:"center",...(message?.lyricsSettings||{})};const outputLyricsOverrides=message?.lyricsOverrides||{};
    output.innerHTML="";
    if(mode==="lyrics"){
        const entry=visible[idx];if(!entry)return;const sec=entry.section;output.className="multi-output-lyrics-stage";output.style.textAlign=settings.align||"center";output.style.paddingTop="0";
        const el=document.createElement("section");el.className="multi-output-section current lyrics-only-section";
        const lyricLines=Array.isArray(outputLyricsOverrides[String(entry.item.id)])?outputLyricsOverrides[String(entry.item.id)]:((sec.lines||[]).map(line=>String(line?.lyrics||"")));
        lyricLines.forEach(text=>{const ly=document.createElement("div");ly.className="multi-output-lyric-only-line";ly.textContent=String(text||"");el.appendChild(ly);});
        output.appendChild(el);fitMultiLyricsToScreen(output,el,settings);document.getElementById("multiOutputSection").textContent="";
    }else{
        output.className="multi-output-chords-stage";output.style.textAlign="left";output.style.paddingTop="30px";visible.forEach((entry,i)=>{const sec=entry.section;const el=document.createElement("section");el.className="multi-output-section"+(i===idx?" current-part":"");el.dataset.sectionIndex=String(i);const title=document.createElement("div");title.className="multi-output-section-title";title.textContent=presentationSectionLabel(sec,i);el.appendChild(title);(sec.lines||[]).forEach(line=>{const row=document.createElement("div");row.className="multi-output-line";const ch=document.createElement("div");ch.className="multi-output-chord";ch.textContent=chordRowFromPositions(line);if(ch.textContent)row.appendChild(ch);const ly=document.createElement("div");ly.className="multi-output-lyric";ly.textContent=String(line.lyrics||"");row.appendChild(ly);el.appendChild(row);});output.appendChild(el);});requestAnimationFrame(()=>{const target=output.querySelector(`.multi-output-section[data-section-index="${idx}"]`);if(target)target.scrollIntoView({block:"start",behavior:"smooth"});});document.getElementById("multiOutputSection").textContent=presentationSectionLabel(visible[idx]?.section,idx);
    }
}
function customPassingChordsForSong(data){
    const key=String(data?.serviceKey||data?.key||data?.originalKey||"C");
    const normalize=v=>String(v||"C").trim().replace(/\s*(major|minor|maj|m)\s*$/i,"").replace(/[♯]/g,"#").replace(/[♭]/g,"b");
    const sharp=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];const flat=["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
    const root=(normalize(key).match(/^[A-G](?:#|b)?/i)||["C"])[0];const mapped={Db:"C#",Eb:"D#",Gb:"F#",Ab:"G#",Bb:"A#"};const idx=Math.max(0,sharp.indexOf(mapped[root]||root));const trans=n=>((sharp[(idx+n+120)%12]));
    const out=[["RETURN TO VERSE 1",trans(7)],["LAST 3",trans(9)+"m"]];if(String(data?.category||data?.genre||"").trim().toLowerCase()==="worship"){const p5=trans(5);out.push(["OUTRO",`${p5} → ${p5}m → ${normalize(key)}`],["SINGING IN THE SPIRIT",`${normalize(key)} → ${p5}`]);}return out;
}
window.addEventListener("resize",()=>{if(multiScreenIsOutput){try{const cached=JSON.parse(localStorage.getItem("chordioMultiScreenState")||"null");if(cached)renderMultiScreenOutput(cached);}catch(_){}}});

function initMultiScreen(){
    const params=new URLSearchParams(location.search);multiScreenIsOutput=params.get("multiScreen")==="1";multiScreenDisplayId=params.get("display")||"";
    try{multiScreenChannel=new BroadcastChannel("chordio-multiscreen");}catch(_){multiScreenChannel=null;}
    if(multiScreenIsOutput){
        document.body.classList.add("multi-screen-output-page");
        const enterOutputFullscreen=()=>{try{if(!document.fullscreenElement)document.documentElement.requestFullscreen?.().catch(()=>{});}catch(_){}};
        setTimeout(enterOutputFullscreen,250);
        window.addEventListener("click",enterOutputFullscreen,{once:true});
        window.addEventListener("message",e=>{if(e.data?.type==="chordio-multiscreen-state")renderMultiScreenOutput(e.data);if(e.data?.type==="chordio-multiscreen-request")window.opener?.postMessage(multiScreenMessage(),"*");});
        multiScreenChannel?.addEventListener("message",e=>{if(e.data?.type==="chordio-multiscreen-state")renderMultiScreenOutput(e.data);});
        try{const cached=JSON.parse(localStorage.getItem("chordioMultiScreenState")||"null");if(cached)renderMultiScreenOutput(cached);}catch(_){}
        setTimeout(()=>{try{window.opener?.postMessage({type:"chordio-multiscreen-request",display:multiScreenDisplayId},"*");}catch(_){ }},300);
    }else{
        window.addEventListener("message",e=>{if(e.data?.type==="chordio-multiscreen-request")try{e.source?.postMessage(multiScreenMessage(),"*")}catch(_){} });
        document.getElementById("multiScreenControl")?.addEventListener("click",e=>{if(e.target.id==="multiScreenControl")multiScreenCloseControl();});
        document.getElementById("multiScreenClose")?.addEventListener("click",multiScreenCloseControl);document.getElementById("multiOpenAll")?.addEventListener("click",multiScreenOpenAll);document.getElementById("multiBlackAll")?.addEventListener("click",multiScreenBlackAll);document.getElementById("multiCloseAll")?.addEventListener("click",multiScreenCloseAll);
        document.getElementById("multiPreviewSong")?.addEventListener("click",()=>multiScreenBroadcast({sectionIndex:multiScreenCurrentSection}));
        ["multiLyricsSpacing","multiLyricsVertical","multiLyricsFont","multiLyricsAlign"].forEach(id=>document.getElementById(id)?.addEventListener("input",()=>{multiLyricsSettings={...multiLyricsSettings,...readMultiLyricsSettingsControls()};const d=multiLyricsSettings;const a=document.getElementById("multiLyricsSpacingValue");if(a)a.textContent=Number(d.spacing).toFixed(2);const b=document.getElementById("multiLyricsVerticalValue");if(b)b.textContent=`${Math.round(d.vertical)}%`;const c=document.getElementById("multiLyricsFontValue");if(c)c.textContent=`${Math.round(d.font)}%`;renderMultiPartLyricsPreview();renderMultiScreenPreviews();multiScreenBroadcast({lyricsSettings:d});}));
        document.getElementById("multiLyricsSettingsApply")?.addEventListener("click",async()=>{const ok=await saveMultiLyricsSettings(readMultiLyricsSettingsControls());syncMultiLyricsSettingsControls();renderMultiPartLyricsPreview();renderMultiScreenPreviews();multiScreenBroadcast({lyricsSettings:getMultiLyricsSettings()});const st=document.getElementById("multiLyricsSettingsStatus");if(st){st.textContent=ok?"Saved for this Service Planner":"Save failed";setTimeout(()=>st.textContent="",1600);}});
        document.getElementById("multiLyricsEditorSave")?.addEventListener("click",async()=>{const ok=await saveMultiLyricsFormatting();const st=document.getElementById("multiLyricsEditorStatus");if(st){st.textContent=ok?"Lyrics formatting saved for this Service Planner":"Save failed";setTimeout(()=>st.textContent="",1800);}});
        document.getElementById("multiLyricsEditorReset")?.addEventListener("click",()=>{const visible=multiScreenVisibleSections(),entry=visible[multiScreenCurrentSection];if(!entry)return;const all=getMultiLyricsOverrides();delete all[String(entry.item.id)];try{localStorage.setItem(multiLyricsOverridesStorageKey(),JSON.stringify(all));}catch(_){}syncMultiLyricsEditor();renderMultiPartLyricsPreview();renderMultiScreenPreviews();multiScreenBroadcast({lyricsOverrides:all});});
        document.getElementById("multiStructureReset")?.addEventListener("click",()=>{void savePresentationLayout(defaultPresentationLayout()).then(()=>{multiScreenCurrentSection=0;renderMultiScreenControl();multiScreenBroadcast({sectionIndex:0});});});
        document.getElementById("multiStructureSave")?.addEventListener("click",async()=>{await savePresentationLayout(getPresentationLayout());const b=document.getElementById("multiStructureSave");if(b){const old=b.textContent;b.textContent="✓ Saved";setTimeout(()=>b.textContent=old,1200);}});
        [1,2,3,4].forEach(n=>{document.getElementById(`multiMode${n}`)?.addEventListener("change",e=>{multiScreenModes[n]=e.target.value;try{localStorage.setItem("chordioMultiScreenModes",JSON.stringify(multiScreenModes));}catch(_){}renderMultiScreenPreviews();multiScreenBroadcast({});});document.getElementById(`multiEnabled${n}`)?.addEventListener("change",e=>{multiScreenEnabled[n]=e.target.checked;try{localStorage.setItem("chordioMultiScreenEnabled",JSON.stringify(multiScreenEnabled));}catch(_){}renderMultiScreenPreviews();if(!multiScreenEnabled[n]){try{multiScreenWindows[n]?.close();}catch(_){}}multiScreenBroadcast({});});document.querySelector(`[data-open-screen="${n}"]`)?.addEventListener("click",()=>multiScreenOpenDisplay(n));});
        document.getElementById("multiBackgroundApply")?.addEventListener("click",()=>{const type=document.getElementById("multiBackgroundType")?.value||"none";const url=document.getElementById("multiBackgroundUrl")?.value.trim()||"";[1,2,3,4].forEach(n=>multiScreenBackgrounds[n]={type,url});saveMultiScreenBackgrounds();renderMultiBackgroundControls();renderMultiScreenPreviews();});
        document.getElementById("multiBackgroundClear")?.addEventListener("click",()=>{[1,2,3,4].forEach(n=>multiScreenBackgrounds[n]={type:"none",url:""});saveMultiScreenBackgrounds();renderMultiBackgroundControls();renderMultiScreenPreviews();});
        [1,2,3,4].forEach(n=>{document.getElementById(`multiBackgroundApply${n}`)?.addEventListener("click",()=>{const type=document.getElementById(`multiBackgroundType${n}`)?.value||"none";const url=document.getElementById(`multiBackgroundUrl${n}`)?.value.trim()||"";setMultiScreenBackground(n,type,url);});document.getElementById(`multiBackgroundClear${n}`)?.addEventListener("click",()=>setMultiScreenBackground(n,"none",""));document.getElementById(`multiBackgroundFile${n}`)?.addEventListener("change",e=>{const file=e.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>setMultiScreenBackground(n,file.type.startsWith("video/")?"video":"image",String(reader.result||""));reader.readAsDataURL(file);});});
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
