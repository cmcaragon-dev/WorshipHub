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
    // Accept complete key/chord names such as C#m, Bm7, F#sus4, etc.
    // Only the root note is needed when calculating the semitone distance.
    const value = String(note ?? "").trim();
    const match = value.match(/^([A-Ga-g])([#b]?)/);
    if (!match) return -1;
    const root = match[1].toUpperCase() + match[2];
    return SHARP.indexOf(FLAT_TO_SHARP[root] || root);
}

function transposeNote(note, steps) {
    const i = noteIndex(note);
    if (i < 0) return note;
    return SHARP[((i + steps) % 12 + 12) % 12];
}

function transposeChord(chord, steps = transposeSteps) {
    const value = String(chord ?? "");
    if (!value.trim()) return "";

    // A .chord span may contain several chords (for example "Bm C#m F#m")
    // separated by spaces. Transpose EVERY chord token while preserving every
    // character of whitespace exactly as entered. This keeps chord placement
    // aligned with the lyric text.
    const transposeToken = token => {
        const root = token.match(/^([A-Ga-g])([#b]?)/);
        if (!root) return token;

        const rootName = root[1].toUpperCase() + root[2];
        let result = transposeNote(rootName, Number(steps) || 0) + token.slice(root[0].length);

        // Also transpose slash/bass notes, e.g. C#m/G#.
        result = result.replace(/\/([A-Ga-g])([#b]?)(?=$|[^A-Za-z])/g,
            (_, n, a) => "/" + transposeNote(n.toUpperCase() + a, Number(steps) || 0));
        return result;
    };

    return value.replace(/\S+/g, transposeToken);
}

function originalChord(span) {
    if (!span.dataset.originalChord) span.dataset.originalChord = span.textContent;
    return span.dataset.originalChord;
}

function transposeChordLayout(layout, steps = transposeSteps) {
    const value = String(layout ?? "");
    if (!value) return "";
    return value.replace(/(^|\s)([A-Ga-g](?:#|b)?(?:m|maj7?|min7?|sus[24]?|dim7?|aug)?(?:\/[A-Ga-g](?:#|b)?)?)(?=\s|$)/g,
        (_, prefix, chord) => prefix + transposeChord(chord, steps));
}

function updateChordSpans(root = document) {
    root.querySelectorAll(".chord").forEach(span => {
        const original = originalChord(span);
        span.textContent = span.dataset.layoutChord === "true"
            ? transposeChordLayout(original)
            : transposeChord(original, transposeSteps);
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
    const serviceName = String(
        activeService.name ||
        activeService.title ||
        activeService.serviceName ||
        activeService.label ||
        "Service Planner"
    ).trim();
    el.textContent = `${serviceName}  •  Song ${Math.min(index + 1, activeService.songs.length)} / ${activeService.songs.length}`;
}

function updateAll() {
    updateChordSpans(document.getElementById("lyrics") || document);
    updateKey();
    updateProgress();
    requestAnimationFrame(layoutSongPageTwoColumns);
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
    const px = `${fontSize}px`;
    const source = document.getElementById("lyrics");
    const layout = document.getElementById("songDisplayLayout");
    if (source) source.style.setProperty("--wh-font-adjust", px);
    if (layout) layout.style.setProperty("--wh-font-adjust", px);
    document.querySelectorAll("#songDisplayLayout .song-display-line").forEach(line => {
        line.style.setProperty("--wh-font-adjust", px);
    });
    const presentation = document.getElementById("presentationLyrics");
    if (presentation) presentation.style.setProperty("--wh-font-adjust", px);
    requestAnimationFrame(layoutSongPageTwoColumns);
}

function goHome() {
    window.location.assign("../index.html");
}

function toggleDarkMode() {
    document.body.classList.toggle("dark-mode");
    const enabled = document.body.classList.contains("dark-mode");
    document.documentElement.classList.toggle("dark-mode", enabled);
    localStorage.setItem("worshipHubDarkMode", enabled ? "1" : "0");
    const button = document.getElementById("darkMode");
    if (button) button.textContent = enabled ? "☀️ Light" : "🌙 Dark";
}

function restoreDarkMode() {
    if (localStorage.getItem("worshipHubDarkMode") === "1") {
        document.body.classList.add("dark-mode");
        document.documentElement.classList.add("dark-mode");
    }
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
    if (typeof window.printSong === "function") {
        window.printSong();
        return;
    }
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
    const baseKey = song?.originalKey || song?.key || serviceSong.originalKey || serviceSong.key || "";
    const displayedKey = transposeChord(baseKey, transposeSteps);

    // Persist the service-specific key/transpose state. The original song
    // remains unchanged; reopening the service reconstructs the same chords
    // and lyrics from the original content using this saved transpose value.
    serviceSong.originalKey = serviceSong.originalKey || baseKey;
    serviceSong.serviceKey = displayedKey;
    serviceSong.transpose = transposeSteps;
    serviceSong.key = serviceSong.originalKey;
    try {
        await updateDoc(doc(db, "users", auth.currentUser.uid, "services", String(serviceId)), {
            songs: activeService.songs,
            updatedAt: serverTimestamp()
        });

        // Keep the in-memory Service Planner synchronized immediately.
        // This prevents the UI from reverting to the old key until a reload.
        if (Array.isArray(window.services)) {
            const localIndex = window.services.findIndex(s => String(s.id) === String(serviceId));
            if (localIndex >= 0) {
                window.services[localIndex] = {
                    ...window.services[localIndex],
                    songs: activeService.songs
                };
            }
        }
        localStorage.setItem(`serviceKey:${serviceId}:${index}`, displayedKey);
        localStorage.setItem(`serviceTranspose:${serviceId}:${index}`, String(transposeSteps));
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
    bindings.forEach(([id, handler]) => {
        const button = document.getElementById(id);
        if (!button) return;
        button.type = "button";
        button.onclick = handler;
    });
}

function normalizeSongDisplayLine(line) {
    const clone = line.cloneNode(true);
    clone.classList.add("song-display-line");
    clone.style.cssText = "";

    const chords = [...clone.querySelectorAll(":scope > .chord")];
    if (!chords.length) {
        const lyric = document.createElement("div");
        lyric.className = "song-display-lyric-row";
        const text = [...clone.childNodes]
            .filter(n => n.nodeType === Node.TEXT_NODE)
            .map(n => n.nodeValue || "")
            .join("")
            .replace(/^\s+/, "");
        lyric.textContent = text;
        clone.innerHTML = "";
        clone.appendChild(lyric);
        return clone;
    }

    const chordRow = document.createElement("div");
    chordRow.className = "song-display-chord-row";
    chordRow.textContent = chords.map(c => String(c.textContent || "")
        .replace(/\r?\n/g, "")
        .replace(/\t/g, "")
    ).join("");

    const lyricRow = document.createElement("div");
    lyricRow.className = "song-display-lyric-row";
    const lyricText = [...line.childNodes]
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.nodeValue || "")
        .join("")
        .replace(/^\s*(?:\r?\n)?\s*/, "");
    lyricRow.textContent = lyricText;

    clone.innerHTML = "";
    clone.appendChild(chordRow);
    clone.appendChild(lyricRow);
    return clone;
}

function normalizeSongDisplaySection(section) {
    const clone = section.cloneNode(false);
    clone.className = "song-display-section";
    const title = section.querySelector(":scope > .section-title");
    if (title) {
        const titleClone = title.cloneNode(true);
        titleClone.className = "song-display-section-title";
        clone.appendChild(titleClone);
    }

    section.querySelectorAll(":scope > .song-line").forEach(line => {
        clone.appendChild(normalizeSongDisplayLine(line));
    });
    return clone;
}

function layoutSongPageTwoColumns() {
    const source = document.getElementById("lyrics");
    if (!source) return;

    const sections = [...source.querySelectorAll(":scope > .song-section")];
    if (!sections.length) return;

    let layout = document.getElementById("songDisplayLayout");
    if (!layout) {
        layout = document.createElement("div");
        layout.id = "songDisplayLayout";
        layout.className = "song-display-layout";
        source.parentNode.insertBefore(layout, source);
    }

    // The original HTML remains the authoritative source for transpose,
    // print and presentation. It must never be visible beside the generated
    // display, otherwise every section appears twice.
    source.classList.add("wh-v24-source");
    layout.innerHTML = "";

    const availableHeight = Math.max(360, Math.floor(window.innerHeight - 250));
    let page = null;
    let columns = null;
    let columnIndex = 0;

    const newPage = () => {
        page = document.createElement("div");
        page.className = "song-display-page";
        page.style.minHeight = `${availableHeight}px`;
        page.style.height = `${availableHeight}px`;

        columns = [document.createElement("div"), document.createElement("div")];
        columns.forEach((col, i) => {
            col.className = "song-display-column";
            col.dataset.columnIndex = String(i);
            page.appendChild(col);
        });
        layout.appendChild(page);
        columnIndex = 0;
    };

    newPage();

    sections.forEach(section => {
        const displaySection = normalizeSongDisplaySection(section);
        let current = columns[columnIndex];
        current.appendChild(displaySection);

        if (current.scrollHeight > availableHeight + 2 && current.children.length > 1) {
            current.removeChild(displaySection);

            if (columnIndex === 0) {
                columnIndex = 1;
                columns[1].appendChild(displaySection);
            } else {
                newPage();
                columns[0].appendChild(displaySection);
            }
        }
    });
}

async function init() {
    const song = getCurrentSongSafe();
    window.currentSong = song || window.currentSong || null;
    restoreDarkMode();
    bindButtons();
    // Do not reset transpose state on every page load. It is restored from
    // the current Service Planner song below.
    transposeSteps = 0;
    activeService = await loadActiveService();
    const activeServiceId = localStorage.getItem("currentServiceId");
    if (activeServiceId && activeService?.songs?.length) {
        localStorage.setItem("resumePresentation", "true");
    }
    const serviceIndex = Number(localStorage.getItem("currentSongIndex") || 0);
    const serviceSong = activeService?.songs?.[serviceIndex];
    if (serviceSong) {
        const savedTranspose = Number(serviceSong.transpose);
        const oi = noteIndex(serviceSong.originalKey || serviceSong.key || song?.originalKey || song?.key);
        const si = noteIndex(serviceSong.serviceKey);

        if (Number.isFinite(savedTranspose)) {
            transposeSteps = savedTranspose;
        } else if (oi >= 0 && si >= 0) {
            transposeSteps = (si - oi + 12) % 12;
            if (transposeSteps > 6) transposeSteps -= 12;
        } else {
            const cached = Number(localStorage.getItem(`serviceTranspose:${activeServiceId}:${serviceIndex}`));
            if (Number.isFinite(cached)) transposeSteps = cached;
        }
    }
    updateAll();
    requestAnimationFrame(layoutSongPageTwoColumns);
    const favorite = document.getElementById("favoriteBtn");
    if (favorite) favorite.textContent = isFavorite() ? "★ Favorited" : "☆ Favorite";
    if (localStorage.getItem("resumePresentation") === "true") setTimeout(startPresentation, 250);
}

onAuthStateChanged(auth, async user => {
    authReady = true;
    if (user) activeService = await loadActiveService();
    updateProgress();
    requestAnimationFrame(layoutSongPageTwoColumns);
});

let songLayoutResizeTimer = 0;
window.addEventListener("resize", () => {
    clearTimeout(songLayoutResizeTimer);
    songLayoutResizeTimer = setTimeout(layoutSongPageTwoColumns, 120);
});

document.addEventListener("DOMContentLoaded", init);

window.goHome = goHome;
window.fitToOnePage = fitToOnePage;
window.startPresentation = startPresentation;
window.exitPresentation = exitPresentation;
window.previousServiceSong = previousServiceSong;
window.nextServiceSong = nextServiceSong;
window.stopService = stopService;
window.setSongFontSize = setFontSize;
window.toggleSongDarkMode = toggleDarkMode;
window.setSongTranspose = setTranspose;
window.WorshipHubSongRuntime = { setTranspose, updateAll, setFontSize, toggleDarkMode, startPresentation, exitPresentation, layoutSongPageTwoColumns };
