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
    const value = String(chord || "").trim();
    if (!value) return "";
    const rootMatch = value.match(/^([A-Ga-g])([#b]?)/);
    if (!rootMatch) return value;
    const root = rootMatch[1].toUpperCase() + rootMatch[2];
    let result = transposeNote(root, Number(steps) || 0) + value.slice(rootMatch[0].length);
    return result.replace(/\/([A-Ga-g])([#b]?)/, (_, letter, accidental) => "/" + transposeNote(letter.toUpperCase() + accidental, Number(steps) || 0));
}

function normalizeChord(chord, index = 0) {
    if (typeof chord === "string") return { id:`chord-${index}`, chord:chord.trim(), originalChord:chord.trim(), position:0 };
    const value = String(chord?.originalChord || chord?.chord || chord?.value || "").trim();
    return { ...chord, id: chord?.id || `chord-${index}`, chord:value, originalChord:value, position:Math.max(0, Number(chord?.position) || 0) };
}

function normalizeSections(raw) {
    return (Array.isArray(raw) ? raw : []).map(section => ({
        ...section,
        lines:(Array.isArray(section?.lines) ? section.lines : []).map(line => ({
            ...line,
            lyrics:String(line?.lyrics || ""),
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
                <div class="line" data-section-index="${si}" data-line-index="${li}">
                    <div class="chords" aria-label="Chords">
                        ${line.chords.map((c, ci) => {
                            const original = c.originalChord || c.chord;
                            const displayed = transposeChord(original, transposeSteps);
                            return `<span class="chord" data-chord-id="${esc(c.id)}" data-original-chord="${esc(original)}" data-position="${c.position}" style="left:${c.position * 15}px">${esc(displayed)}</span>`;
                        }).join("")}
                    </div>
                    <div class="lyrics" style="font-size:calc(22px + ${fontSize}px)">${esc(line.lyrics)}</div>
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
}

function setTranspose(delta){
    transposeSteps += Number(delta) || 0;
    if(transposeSteps > 11) transposeSteps -= 12;
    if(transposeSteps < -11) transposeSteps += 12;
    render();
}

function redirectSong(nextSong){
    if(!nextSong) return;
    localStorage.setItem("currentSongIndex", String(index));
    if(nextSong.customSong === true || String(nextSong.file || "").startsWith("custom-song.html")) {
        window.location.assign(`custom-song.html?id=${encodeURIComponent(nextSong.id || "")}`); return;
    }
    const file = String(nextSong.file || "").split("/").pop();
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
    const storedTranspose = Number(song.transpose || 0);
    const originalKey = song.originalKey || song.key || "";
    const serviceKey = song.serviceKey || "";
    transposeSteps = Number.isFinite(storedTranspose) ? storedTranspose : 0;
    if (serviceKey && originalKey && storedTranspose === 0) {
        const oi = noteToIndex(originalKey);
        const si = noteToIndex(serviceKey);
        if (oi >= 0 && si >= 0) transposeSteps = (si - oi + 12) % 12;
    }
    render(); loading=false;
}

function bindControls(){
    document.getElementById("plus")?.addEventListener("click",()=>{fontSize=Math.min(14,fontSize+1);render();});
    document.getElementById("minus")?.addEventListener("click",()=>{fontSize=Math.max(0,fontSize-1);render();});
    document.getElementById("up")?.addEventListener("click",()=>setTranspose(1));
    document.getElementById("down")?.addEventListener("click",()=>setTranspose(-1));
    document.getElementById("close")?.addEventListener("click",()=>window.location.assign("index.html"));
    document.getElementById("prev")?.addEventListener("click",()=>{if(!service||index<=0)return;index--;localStorage.setItem("currentSongIndex",String(index));redirectSong(service.songs[index]);});
    document.getElementById("next")?.addEventListener("click",()=>{if(!service||index>=service.songs.length-1)return;index++;localStorage.setItem("currentSongIndex",String(index));redirectSong(service.songs[index]);});
}

document.addEventListener("DOMContentLoaded",()=>{bindControls();load();});
onAuthStateChanged(auth,async()=>{authResolved=true;if(!song) await load();});

window.WorshipHubCustomSong={transposeUp:()=>setTranspose(1),transposeDown:()=>setTranspose(-1),getTranspose:()=>transposeSteps,getSong:()=>song,reload:()=>{song=null;service=null;loading=false;load();}};
