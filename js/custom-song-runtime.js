"use strict";

import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

function currentKey(){ return song?.originalKey || song?.key || song?.serviceKey || ""; }

function render() {
    if (!song) return;
    document.getElementById("songTitle")?.replaceChildren(document.createTextNode(song.title || "Untitled Song"));
    document.getElementById("songArtist")?.replaceChildren(document.createTextNode(song.artist || ""));
    const key = document.getElementById("songKey");
    if (key) key.textContent = transposeChord(currentKey(), transposeSteps) || "—";
    const stage = document.getElementById("stage");
    if (!stage) return;
    const sections = normalizeSections(song.sections);
    if (!sections.length) { stage.innerHTML = '<div class="empty">This song has no structured lyrics yet.</div>'; updateCounter(); return; }

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

function setTranspose(delta){
    transposeSteps += Number(delta) || 0;
    if(transposeSteps > 11) transposeSteps -= 12;
    if(transposeSteps < -11) transposeSteps += 12;
    render();
}

function redirectSong(nextSong, targetIndex=index){
    if(!nextSong) return;
    localStorage.setItem("currentSongIndex", String(targetIndex));
    localStorage.setItem("resumePresentation", "true");
    if(nextSong.customSong === true || String(nextSong.file || "").startsWith("custom-song.html")) {
        window.location.assign(`custom-song.html?id=${encodeURIComponent(nextSong.id || "")}`); return;
    }
    const file = String(nextSong.file || "").trim().split("/").pop();
    if(file) window.location.assign(`songs/${encodeURIComponent(file)}`);
}

async function loadFromService(){
    const serviceId = localStorage.getItem("currentServiceId");
    if(!serviceId || !auth.currentUser) return false;
    try {
        const snap = await getDoc(doc(db,"users",auth.currentUser.uid,"services",String(serviceId)));
        if(!snap.exists()) return false;
        service = {id:snap.id,...snap.data()};
        if(!Array.isArray(service.songs) || !service.songs.length) return false;
        if(index < 0 || index >= service.songs.length) index = 0;
        const candidate = service.songs[index];
        if(!candidate) return false;
        if(candidate.customSong) {
            // Use the service copy so the selected service order remains authoritative,
            // but ensure its structured sections are present for chord spans.
            song = {...candidate, sections:normalizeSections(candidate.sections)};
            return true;
        }
        song = candidate; return true;
    } catch(error){ console.error("Unable to load Service Planner:",error); return false; }
}

async function loadFromFirebaseSong(id){
    if(!id) return false;
    try { const snap = await getDoc(doc(db,"songs",String(id))); if(snap.exists()){ song={id:snap.id,...snap.data(),sections:normalizeSections(snap.data()?.sections)}; return true; } }
    catch(error){ console.warn("Unable to load Firebase song:",error); }
    return false;
}

function loadFromLocalCustomSong(id){
    if(!id) return false;
    try { const list=JSON.parse(localStorage.getItem("worshipHubCustomSongs")||"[]"); const found=list.find(s=>String(s.id)===String(id)); if(found){song={...found,sections:normalizeSections(found.sections)}; return true;} }
    catch(error){ console.warn("Unable to load custom song:",error); }
    return false;
}

async function load(){
    if(loading || song) return; loading=true;
    const params=new URLSearchParams(location.search); const id=params.get("id"); index=Number(localStorage.getItem("currentSongIndex")||0);
    let found=authResolved ? await loadFromService() : false;
    if(!found) found=await loadFromFirebaseSong(id);
    if(!found){ found=loadFromLocalCustomSong(id); if(!found) service=null; }
    if(!found){ document.getElementById("stage")?.replaceChildren(Object.assign(document.createElement("div"),{className:"empty",textContent:"Song could not be loaded."})); updateCounter(); loading=false; return; }
    transposeSteps=Number(song.transpose||0); render(); loading=false;
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
    const grid=document.createElement("div"); grid.className="custom-presentation-grid"; output.appendChild(grid);
    const cols=[document.createElement("div"),document.createElement("div")];
    cols.forEach(c=>{c.className="custom-presentation-column";grid.appendChild(c);});
    const sections=normalizeSections(song.sections);
    let col=cols[0];
    sections.forEach(section=>{
        const sec=document.createElement("section"); sec.className="custom-presentation-section";
        const title=document.createElement("div"); title.className="custom-presentation-section-title"; title.textContent=`${section.type||""} ${section.number||""}`.trim(); sec.appendChild(title);
        (section.lines||[]).forEach(line=>{
            const pair=document.createElement("div"); pair.className="custom-presentation-line"; pair.style.fontSize=`${Math.max(16,20+fontSize)}px`;
            const chordText=chordRowFromPositions(line);
            if(chordText){const ch=document.createElement("div");ch.className="custom-presentation-chord";ch.textContent=chordText;pair.appendChild(ch);}
            const ly=document.createElement("div");ly.className="custom-presentation-lyric";ly.textContent=String(line.lyrics||"");pair.appendChild(ly);
            sec.appendChild(pair);
        });
        col.appendChild(sec);
        if(col===cols[0] && output.clientHeight>0 && col.scrollHeight>Math.max(500,output.clientHeight*0.92)) col=cols[1];
    });
    const t=document.getElementById("customPresentationTitle"); if(t)t.textContent=song.title||"Untitled Song";
    const k=document.getElementById("customPresentationKey"); if(k)k.textContent=`Key: ${transposeChord(customServiceKey(),transposeSteps)||"—"}`;
    renderCustomPassingChords();
    renderCustomNextPreview();
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
async function startCustomPresentation(){if(!song)return;const s=document.getElementById("customPresentationScreen");if(!s)return;document.body.classList.add("custom-presentation-active");s.classList.add("show");s.style.display="flex";renderCustomPresentation();await enterCustomFullscreen();}
async function exitCustomPresentation(){const s=document.getElementById("customPresentationScreen");if(s){s.classList.remove("show");s.style.display="none";}document.body.classList.remove("custom-presentation-active");await exitCustomFullscreen();}


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

document.addEventListener("DOMContentLoaded",()=>{bindControls();load();});
onAuthStateChanged(auth,async()=>{
    authResolved=true;
    const activeServiceId=localStorage.getItem("currentServiceId");
    const resume=localStorage.getItem("resumePresentation")==="true";
    // DOMContentLoaded can load the custom song before Firebase auth resolves.
    // If Service Planner launched this page, restore the authoritative service
    // copy after auth so navigation and Next Song Preview have the service order.
    if(activeServiceId && resume){
        index=Number(localStorage.getItem("currentSongIndex")||0);
        const loaded=await loadFromService();
        if(loaded){
            transposeSteps=Number(song?.transpose||0);
            render();
            if(document.getElementById("customPresentationScreen")?.classList.contains("show")) renderCustomPresentation();
            return;
        }
    }
    if(!song) await load();
});

window.WorshipHubCustomSong={transposeUp:()=>setTranspose(1),transposeDown:()=>setTranspose(-1),getTranspose:()=>transposeSteps,getSong:()=>song,startPresentation:startCustomPresentation,exitPresentation:exitCustomPresentation,reload:()=>{song=null;service=null;loading=false;load();}};
