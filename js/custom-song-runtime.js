"use strict";

import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const FLATS = { Db:"C#", Eb:"D#", Gb:"F#", Ab:"G#", Bb:"A#" };

let song = null;
let transposeSteps = 0;
let fontSize = 3;
let service = null;
let index = 0;
let authResolved = false;
let loading = false;

function esc(value){
    return String(value ?? "")
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;");
}

function noteToIndex(note){
    const normalized = FLATS[note] || note;
    return SHARP.indexOf(normalized);
}

function transposeNote(note, steps){
    const index = noteToIndex(note);
    if(index < 0) return note;
    return SHARP[((index + steps) % 12 + 12) % 12];
}

/*
 * Transposes the root and slash/bass note while preserving the chord quality.
 * C -> D, Am7 -> Bm7, Cadd9 -> Dadd9, G/B -> A/C#, Bbmaj7 -> Bmaj7.
 */
function transposeChord(chord, steps = transposeSteps){
    const value = String(chord || "").trim();
    if(!value) return "";

    // Root at the beginning.
    const rootMatch = value.match(/^([A-Ga-g])([#b]?)/);
    if(!rootMatch) return value;

    const root = rootMatch[1].toUpperCase() + rootMatch[2];
    let result = transposeNote(root, Number(steps) || 0) + value.slice(rootMatch[0].length);

    // Slash/bass note, if present.
    result = result.replace(/\/([A-Ga-g])([#b]?)/, (full, letter, accidental) => {
        const bass = letter.toUpperCase() + accidental;
        return "/" + transposeNote(bass, Number(steps) || 0);
    });

    return result;
}

function currentKey(){
    return song?.originalKey || song?.key || song?.serviceKey || "";
}

function render(){
    if(!song) return;

    const title = document.getElementById("songTitle");
    const artist = document.getElementById("songArtist");
    const key = document.getElementById("songKey");
    const stage = document.getElementById("stage");

    if(title) title.textContent = song.title || "Untitled Song";
    if(artist) artist.textContent = song.artist || "";
    if(key) key.textContent = transposeChord(currentKey(), transposeSteps) || "—";

    const sections = Array.isArray(song.sections) ? song.sections : [];
    if(!stage) return;

    if(!sections.length){
        stage.innerHTML = '<div class="empty">This song has no structured lyrics yet.</div>';
        updateCounter();
        return;
    }

    stage.innerHTML = sections.map(section => `
        <section class="section">
            <div class="section-title">${esc(section.type)} ${section.number || ""}</div>
            ${(Array.isArray(section.lines) ? section.lines : []).map(line => {
                const chords = Array.isArray(line.chords) ? line.chords.map(c => typeof c === "string" ? ({chord:c, position:0}) : c) : [];
                const chordHTML = chords.map(c => {
                    const position = Math.max(0, Number(c.position) || 0);
                    const original = String(c.chord || "").trim();
                    const displayed = transposeChord(original, transposeSteps);
                    return `<span class="chord" data-original-chord="${esc(original)}" style="left:${position * 15}px">${esc(displayed)}</span>`;
                }).join("");

                return `
                    <div class="line">
                        <div class="chords">${chordHTML}</div>
                        <div class="lyrics" style="font-size:calc(22px + ${fontSize}px)">${esc(line.lyrics || "")}</div>
                    </div>
                `;
            }).join("")}
        </section>
    `).join("");

    updateCounter();
}

function updateCounter(){
    const counter = document.getElementById("counter");
    if(counter){
        counter.textContent = service && Array.isArray(service.songs)
            ? `Song ${index + 1} / ${service.songs.length}`
            : "Custom Song";
    }
    const prev = document.getElementById("prev");
    const next = document.getElementById("next");
    if(prev) prev.disabled = !(service && index > 0);
    if(next) next.disabled = !(service && index < service.songs.length - 1);
}

function setTranspose(delta){
    transposeSteps += Number(delta) || 0;
    if(transposeSteps > 11) transposeSteps -= 12;
    if(transposeSteps < -11) transposeSteps += 12;

    // Re-render both the key AND every chord from the original stored chord.
    // This deliberately does not modify song.sections, so repeated transpose
    // operations never compound rounding or string-replacement errors.
    render();
}

function redirectSong(nextSong){
    if(!nextSong) return;
    localStorage.setItem("currentSongIndex", String(index));

    if(nextSong.customSong === true || String(nextSong.file || "").startsWith("custom-song.html")){
        window.location.href = `custom-song.html?id=${encodeURIComponent(nextSong.id || "")}`;
        return;
    }

    const file = String(nextSong.file || "").split("/").pop();
    if(file) window.location.href = `/WorshipHub/songs/${encodeURIComponent(file)}`;
}

async function loadFromService(){
    const serviceId = localStorage.getItem("currentServiceId");
    if(!serviceId || !auth.currentUser) return false;

    try{
        const snap = await getDoc(doc(db, "users", auth.currentUser.uid, "services", String(serviceId)));
        if(!snap.exists()) return false;

        service = { id:snap.id, ...snap.data() };
        if(!Array.isArray(service.songs) || !service.songs.length) return false;

        if(index < 0 || index >= service.songs.length) index = 0;
        song = service.songs[index] || null;
        return !!song;
    }catch(error){
        console.error("Unable to load Service Planner:", error);
        return false;
    }
}

function loadFromLocalCustomSong(id){
    if(!id) return false;
    try{
        const list = JSON.parse(localStorage.getItem("worshipHubCustomSongs") || "[]");
        const found = list.find(s => String(s.id) === String(id));
        if(found){
            song = found;
            return true;
        }
    }catch(error){
        console.warn("Unable to load custom song:", error);
    }
    return false;
}

async function loadFromFirebaseSong(id){
    if(!id) return false;
    try{
        const snap = await getDoc(doc(db, "songs", String(id)));
        if(snap.exists()){
            song = { id: snap.id, ...snap.data() };
            return true;
        }
    }catch(error){
        console.warn("Unable to load Firebase song:", error);
    }
    return false;
}

async function load(){
    if(loading || song) return;
    loading = true;

    const params = new URLSearchParams(location.search);
    const id = params.get("id");
    index = Number(localStorage.getItem("currentSongIndex") || 0);

    // If this page was launched from Service Planner, the service is authoritative.
    // Wait for Firebase auth before deciding that there is no service.
    let found = false;
    if(authResolved){
        found = await loadFromService();
    }

    // Standalone custom-song URL fallback.
    if(!found){
        found = await loadFromFirebaseSong(id);
    }

    if(!found){
        found = loadFromLocalCustomSong(id);
        service = null;
    }

    if(!found){
        const stage = document.getElementById("stage");
        if(stage) stage.innerHTML = '<div class="empty">Song could not be loaded.</div>';
        updateCounter();
        loading = false;
        return;
    }

    transposeSteps = Number(song.transpose || 0);
    render();
    loading = false;
}

function bindControls(){
    document.getElementById("plus")?.addEventListener("click", () => {
        fontSize = Math.min(14, fontSize + 1);
        render();
    });
    document.getElementById("minus")?.addEventListener("click", () => {
        fontSize = Math.max(0, fontSize - 1);
        render();
    });
    document.getElementById("up")?.addEventListener("click", () => setTranspose(1));
    document.getElementById("down")?.addEventListener("click", () => setTranspose(-1));

    document.getElementById("close")?.addEventListener("click", () => {
        window.location.href = "index.html";
    });

    document.getElementById("prev")?.addEventListener("click", () => {
        if(!service || index <= 0) return;
        index -= 1;
        localStorage.setItem("currentSongIndex", String(index));
        redirectSong(service.songs[index]);
    });

    document.getElementById("next")?.addEventListener("click", () => {
        if(!service || index >= service.songs.length - 1) return;
        index += 1;
        localStorage.setItem("currentSongIndex", String(index));
        redirectSong(service.songs[index]);
    });

    updateCounter();
}

document.addEventListener("DOMContentLoaded", bindControls);

window.WorshipHubCustomSong = {
    transposeUp: () => setTranspose(1),
    transposeDown: () => setTranspose(-1),
    getTranspose: () => transposeSteps,
    getSong: () => song,
    reload: () => { song = null; service = null; loading = false; load(); }
};

onAuthStateChanged(auth, async (user) => {
    authResolved = true;
    if(!song){
        await load();
    }
});
