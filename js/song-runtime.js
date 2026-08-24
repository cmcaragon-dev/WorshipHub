"use strict";

import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const FLAT_TO_SHARP = { Db:"C#", Eb:"D#", Gb:"F#", Ab:"G#", Bb:"A#" };

let transposeSteps = 0;
let fontSize = 0;
let activeService = null;
let authReady = false;

function getCurrentSongSafe() {
    try {
        if (typeof currentSong !== "undefined" && currentSong) return currentSong;
    } catch (_) {}
    return window.currentSong || null;
}

function noteIndex(note) {
    return SHARP.indexOf(FLAT_TO_SHARP[note] || note);
}

function transposeNote(note, steps) {
    const i = noteIndex(note);
    if (i < 0) return note;
    return SHARP[((i + steps) % 12 + 12) % 12];
}

function transposeChord(chord, steps = transposeSteps) {
    const value = String(chord || "").trim();
    if (!value) return "";
    const root = value.match(/^([A-Ga-g])([#b]?)/);
    if (!root) return value;
    const rootName = root[1].toUpperCase() + root[2];
    let result = transposeNote(rootName, Number(steps) || 0) + value.slice(root[0].length);
    result = result.replace(/\/([A-Ga-g])([#b]?)(?=\b|$)/g, (_, n, a) => "/" + transposeNote(n.toUpperCase() + a, Number(steps) || 0));
    return result;
}

function originalChord(span) {
    if (!span.dataset.originalChord) span.dataset.originalChord = span.textContent.trim();
    return span.dataset.originalChord;
}

function updateChordSpans(root = document) {
    root.querySelectorAll(".chord").forEach(span => {
        span.textContent = transposeChord(originalChord(span), transposeSteps);
    });
}

function updateKey() {
    const song = getCurrentSongSafe();
    const keyElement = document.getElementById("serviceKey");
    const key = song?.originalKey || song?.key || song?.serviceKey || "";
    if (keyElement) keyElement.textContent = transposeChord(key, transposeSteps);
}

function updateProgress() {
    const el = document.getElementById("serviceProgress");
    if (!el) return;
    if (!activeService?.songs?.length) {
        el.textContent = "";
        return;
    }
    const index = Number(localStorage.getItem("currentSongIndex") || 0);
    el.textContent = `Song ${Math.min(index + 1, activeService.songs.length)} of ${activeService.songs.length}`;
}

function updateAll() {
    updateChordSpans(document.getElementById("lyrics") || document);
    updateKey();
    updateProgress();
    if (document.getElementById("presentationScreen")?.classList.contains("show")) {
        if (typeof window.refreshPresentation === "function") window.refreshPresentation();
        else buildPresentation();
    }
}

function setTranspose(delta) {
    transposeSteps += Number(delta) || 0;
    if (transposeSteps > 11) transposeSteps -= 12;
    if (transposeSteps < -11) transposeSteps += 12;
    updateAll();
}

function setFontSize(delta) {
    fontSize = Math.max(-4, Math.min(8, fontSize + Number(delta || 0)));
    const song = document.getElementById("lyrics");
    if (song) song.style.fontSize = `calc(1em + ${fontSize}px)`;
    const lines = document.querySelectorAll(".song-line");
    lines.forEach(line => line.style.fontSize = `calc(20px + ${fontSize}px)`);
    const presentation = document.getElementById("presentationLyrics");
    if (presentation) presentation.style.fontSize = `calc(1em + ${fontSize}px)`;
}

function goHome() {
    window.location.assign("../index.html");
}

function toggleDarkMode() {
    document.body.classList.toggle("dark-mode");
    const enabled = document.body.classList.contains("dark-mode");
    localStorage.setItem("worshipHubDarkMode", enabled ? "1" : "0");
    const button = document.getElementById("darkMode");
    if (button) button.textContent = enabled ? "☀️ Light" : "🌙 Dark";
}

function restoreDarkMode() {
    if (localStorage.getItem("worshipHubDarkMode") === "1") document.body.classList.add("dark-mode");
    const button = document.getElementById("darkMode");
    if (button) button.textContent = document.body.classList.contains("dark-mode") ? "☀️ Light" : "🌙 Dark";
}

function toggleFavorite() {
    const song = getCurrentSongSafe();
    if (!song) return;
    const key = String(song.id || song.file || song.title || location.pathname);
    let favorites = [];
    try { favorites = JSON.parse(localStorage.getItem("favorites") || "[]"); } catch (_) {}
    const exists = favorites.includes(key);
    favorites = exists ? favorites.filter(x => x !== key) : [...favorites, key];
    localStorage.setItem("favorites", JSON.stringify(favorites));
    const button = document.getElementById("favoriteBtn");
    if (button) button.textContent = exists ? "☆ Favorite" : "★ Favorited";
}

function isFavorite() {
    const song = getCurrentSongSafe();
    if (!song) return false;
    try {
        return JSON.parse(localStorage.getItem("favorites") || "[]").includes(String(song.id || song.file || song.title || location.pathname));
    } catch (_) { return false; }
}

function fitToOnePage() {
    window.print();
}

function buildPresentation() {
    const overlay = document.getElementById("presentationScreen");
    const output = document.getElementById("presentationLyrics");
    const source = document.getElementById("lyrics");
    if (!overlay || !output || !source) return;
    const title = document.getElementById("presentationTitle");
    const counter = document.getElementById("presentationCounter");
    const song = getCurrentSongSafe();
    if (title) title.textContent = song?.title || document.title || "WorshipHub";
    if (counter) counter.textContent = activeService?.songs?.length ? `Song ${Number(localStorage.getItem("currentSongIndex") || 0) + 1} / ${activeService.songs.length}` : "Song";
    output.innerHTML = source.innerHTML;
    updateChordSpans(output);
    output.querySelectorAll(".chord").forEach(span => span.style.color = "#D4AF37");
}

function startPresentation() {
    const overlay = document.getElementById("presentationScreen");
    if (!overlay) return;
    localStorage.setItem("presentationMode", "true");
    buildPresentation();
    overlay.style.display = "block";
    overlay.classList.add("show");
}

function exitPresentation() {
    const overlay = document.getElementById("presentationScreen");
    if (overlay) {
        overlay.classList.remove("show");
        overlay.style.display = "none";
    }
    localStorage.removeItem("presentationMode");
}

async function loadActiveService() {
    const serviceId = localStorage.getItem("currentServiceId");
    if (!serviceId || !auth.currentUser) return null;
    try {
        const snap = await getDoc(doc(db, "users", auth.currentUser.uid, "services", String(serviceId)));
        if (!snap.exists()) return null;
        activeService = { id: snap.id, ...snap.data() };
        return activeService;
    } catch (error) {
        console.warn("Unable to load active service:", error);
        return null;
    }
}

function serviceSongAt(offset) {
    if (!activeService?.songs?.length) return null;
    const current = Number(localStorage.getItem("currentSongIndex") || 0);
    const target = current + offset;
    if (target < 0 || target >= activeService.songs.length) return null;
    return { song: activeService.songs[target], index: target };
}

function openServiceSong(item) {
    if (!item?.song) return;
    localStorage.setItem("currentSongIndex", String(item.index));
    const song = item.song;
    if (song.customSong) {
        window.location.assign(`../custom-song.html?id=${encodeURIComponent(song.id || "")}`);
        return;
    }
    const file = String(song.file || "").split("/").pop();
    if (file) window.location.assign(`./${encodeURIComponent(file)}`);
}

function previousServiceSong() {
    const item = serviceSongAt(-1);
    if (!item) return alert("This is the first song in the service.");
    openServiceSong(item);
}

function nextServiceSong() {
    const item = serviceSongAt(1);
    if (!item) return alert("This is the last song in the service.");
    openServiceSong(item);
}

function stopService() {
    localStorage.removeItem("currentServiceId");
    localStorage.removeItem("currentSongIndex");
    localStorage.removeItem("resumePresentation");
    exitPresentation();
    alert("Service stopped.");
}

async function saveServiceKey() {
    const song = getCurrentSongSafe();
    const serviceId = localStorage.getItem("currentServiceId");
    if (!auth.currentUser || !activeService || !serviceId) {
        alert("No active service is available.");
        return;
    }
    const index = Number(localStorage.getItem("currentSongIndex") || 0);
    const serviceSong = activeService.songs?.[index];
    if (!serviceSong) {
        alert("Current service song was not found.");
        return;
    }
    const displayedKey = transposeChord(song?.originalKey || song?.key || serviceSong.key || "", transposeSteps);
    serviceSong.originalKey = serviceSong.originalKey || song?.originalKey || song?.key || serviceSong.key || "";
    serviceSong.serviceKey = displayedKey;
    serviceSong.transpose = transposeSteps;
    try {
        await updateDoc(doc(db, "users", auth.currentUser.uid, "services", String(serviceId)), {
            songs: activeService.songs,
            updatedAt: serverTimestamp()
        });
        alert(`Service Key saved: ${displayedKey}`);
    } catch (error) {
        console.error("Unable to save service key:", error);
        alert("Unable to save the Service Key. Check your Firebase permissions.");
    }
}

function bindButtons() {
    const bindings = [
        ["transposeDown", () => setTranspose(-1)],
        ["transposeUp", () => setTranspose(1)],
        ["fontMinus", () => setFontSize(-1)],
        ["fontPlus", () => setFontSize(1)],
        ["darkMode", toggleDarkMode],
        ["favoriteBtn", toggleFavorite],
        ["saveServiceKey", saveServiceKey]
    ];
    bindings.forEach(([id, handler]) => document.getElementById(id)?.addEventListener("click", handler));
}

async function init() {
    const song = getCurrentSongSafe();
    window.currentSong = song || window.currentSong || null;
    restoreDarkMode();
    bindButtons();
    transposeSteps = Number(localStorage.getItem("currentSongIndex") && 0) || 0;
    if (song?.serviceKey && song?.originalKey) {
        const original = noteIndex(song.originalKey) >= 0 ? song.originalKey : song.key;
        if (original) transposeSteps = 0;
    }
    activeService = await loadActiveService();
    const serviceIndex = Number(localStorage.getItem("currentSongIndex") || 0);
    const serviceSong = activeService?.songs?.[serviceIndex];
    if (serviceSong?.serviceKey && serviceSong?.originalKey) {
        const oi = noteIndex(serviceSong.originalKey);
        const si = noteIndex(serviceSong.serviceKey);
        if (oi >= 0 && si >= 0) transposeSteps = (si - oi + 12) % 12;
    }
    updateAll();
    const favorite = document.getElementById("favoriteBtn");
    if (favorite) favorite.textContent = isFavorite() ? "★ Favorited" : "☆ Favorite";
    if (localStorage.getItem("resumePresentation") === "true") setTimeout(startPresentation, 250);
}

onAuthStateChanged(auth, async user => {
    authReady = true;
    if (user) activeService = await loadActiveService();
    updateProgress();
});

document.addEventListener("DOMContentLoaded", init);

window.goHome = goHome;
window.fitToOnePage = fitToOnePage;
window.startPresentation = startPresentation;
window.exitPresentation = exitPresentation;
window.previousServiceSong = previousServiceSong;
window.nextServiceSong = nextServiceSong;
window.stopService = stopService;
window.WorshipHubSongRuntime = { setTranspose, updateAll, startPresentation, exitPresentation };
