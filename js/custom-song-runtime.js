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
let loaded = false;

function esc(value){
    return String(value ?? "")
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;");
}

/*
 * Transpose only the musical note portion of a chord.
 * Examples:
 * C -> D
 * Am -> Bm
 * G7 -> A7
 * Cadd9 -> Dadd9
 * G/B -> A/C#
 * Bbmaj7 -> Bmaj7
 */
function transposeChord(chord, steps = transposeSteps){
    const value = String(chord || "").trim();
    if (!value) return "";

    return value.replace(/(^|\/)([A-Ga-g])([#b]?)/g, (full, prefix, letter, accidental) => {
        const note = letter.toUpperCase() + accidental;
        const normalized = FLATS[note] || note;
        const noteIndex = SHARP.indexOf(normalized);
        if (noteIndex < 0) return full;

        const shifted = SHARP[(noteIndex + steps) % 12 + (steps < 0 && (noteIndex + steps) % 12 < 0 ? 12 : 0)];
        return prefix + shifted;
    });
}

function normalizeSteps(value){
    const n = Number(value) || 0;
    return ((n % 12) + 12) % 12;
}

function render(){
    if (!song) return;

    const title = document.getElementById("songTitle");
    const artist = document.getElementById("songArtist");
    const key = document.getElementById("songKey");
    const stage = document.getElementById("stage");

    if (title) title.textContent = song.title || "Untitled Song";
    if (artist) artist.textContent = song.artist || "";
    if (key) key.textContent = transposeChord(song.originalKey || song.key || "—");

    const sections = Array.isArray(song.sections) ? song.sections : [];

    if (!sections.length){
        stage.innerHTML = '<div class="empty">This song has no structured lyrics yet.</div>';
        updateCounter();
        return;
    }

    stage.innerHTML = sections.map(section => `
        <section class="section">
            <div class="section-title">${esc(section.type)} ${section.number || ""}</div>
            ${(Array.isArray(section.lines) ? section.lines : []).map(line => {
                const chords = Array.isArray(line.chords) ? line.chords : [];
                const chordHTML = chords.map(c => {
                    const position = Number(c.position) || 0;
                    const original = String(c.chord || "");
                    return `<span class="chord" data-original-chord="${esc(original)}" style="left:${position * 15}px">${esc(transposeChord(original))}</span>`;
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
    if (counter) counter.textContent = service ? `Song ${index + 1} / ${service.songs.length}` : "Custom Song";
}

function setTranspose(delta){
    // Keep an unbounded step counter so repeated clicks work correctly.
    transposeSteps += Number(delta) || 0;
    render();
}

function redirectSong(nextSong){
    if (!nextSong) return;

    if (nextSong.customSong || String(nextSong.file || "").startsWith("custom-song.html")){
        window.location.href = nextSong.file || `custom-song.html?id=${encodeURIComponent(nextSong.id)}`;
        return;
    }

    const file = String(nextSong.file || "").split("/").pop();
    if (file) window.location.href = `/WorshipHub/songs/${file}`;
}

async function load(){
    if (loaded) return;
    loaded = true;

    const params = new URLSearchParams(location.search);
    const id = params.get("id");
    const serviceId = localStorage.getItem("currentServiceId");
    index = Number(localStorage.getItem("currentSongIndex") || 0);

    if (serviceId){
        try{
            const user = auth.currentUser;
            if (user){
                const snap = await getDoc(doc(db, "users", user.uid, "services", String(serviceId)));
                if (snap.exists()){
                    service = { id:snap.id, ...snap.data() };
                    if (Array.isArray(service.songs) && service.songs[index]){
                        song = service.songs[index];
                    }
                }
            }
        }catch(error){
            console.warn("Unable to load service song", error);
        }
    }

    if (!song && id){
        try{
            const list = JSON.parse(localStorage.getItem("worshipHubCustomSongs") || "[]");
            song = list.find(s => String(s.id) === String(id)) || null;
        }catch(error){
            console.warn("Unable to load custom song", error);
        }
    }

    if (!song){
        const stage = document.getElementById("stage");
        if (stage) stage.innerHTML = '<div class="empty">Song could not be loaded.</div>';
        return;
    }

    // Always start at the song's saved service transpose, but do not mutate it.
    transposeSteps = Number(song.transpose || 0);
    render();
}

/* Controls are bound after the module is evaluated and the DOM exists. */
document.addEventListener("DOMContentLoaded", () => {
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
        if (history.length > 1) history.back();
        else window.location.href = "index.html";
    });

    document.getElementById("prev")?.addEventListener("click", () => {
        if (service && index > 0){
            index--;
            localStorage.setItem("currentSongIndex", String(index));
            redirectSong(service.songs[index]);
        }
    });

    document.getElementById("next")?.addEventListener("click", () => {
        if (service && index < service.songs.length - 1){
            index++;
            localStorage.setItem("currentSongIndex", String(index));
            redirectSong(service.songs[index]);
        }
    });

    load();
});

// Firebase auth can be asynchronous; if the service song requires the logged-in
// user, retry loading once authentication state is available.
onAuthStateChanged(auth, () => {
    if (!song && !loaded) load();
});
