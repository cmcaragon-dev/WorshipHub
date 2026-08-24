"use strict";

/* WorshipHub Presentation Runtime
 * Full-screen, three-column, compact worship presentation.
 * Works with the existing song HTML structure and keeps chord spans intact.
 */

import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let service = null;
let serviceIndex = Number(localStorage.getItem("currentSongIndex") || 0);
let currentSong = window.currentSong || null;
let authReady = false;
let serviceLoading = false;

const qs = (id) => document.getElementById(id);

function esc(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function getSongFromPage() {
    if (window.currentSong) return window.currentSong;
    return {
        title: qs("songTitle")?.textContent || document.title || "Worship Song",
        artist: qs("songArtist")?.textContent || "",
        key: qs("serviceKey")?.textContent || "",
        file: location.pathname
    };
}

function normalizeSong(song) {
    if (!song) return null;
    return {
        ...song,
        title: song.title || "Untitled Song",
        artist: song.artist || "",
        key: song.serviceKey || song.key || song.originalKey || ""
    };
}

async function loadService() {
    if (serviceLoading || service) return service;
    const serviceId = localStorage.getItem("currentServiceId");
    if (!serviceId || !auth.currentUser) return null;
    serviceLoading = true;
    try {
        const snap = await getDoc(doc(db, "users", auth.currentUser.uid, "services", String(serviceId)));
        if (snap.exists()) {
            service = { id: snap.id, ...snap.data() };
            if (!Array.isArray(service.songs)) service.songs = [];
        }
    } catch (error) {
        console.warn("Presentation: unable to load service", error);
    } finally {
        serviceLoading = false;
    }
    return service;
}

function getPassingData(song) {
    const raw = song?.passingChords || song?.passing || window.passingChords || null;
    if (raw && typeof raw === "object") return raw;
    try {
        const saved = JSON.parse(localStorage.getItem("passingChords") || "null");
        if (saved && typeof saved === "object") return saved;
    } catch (_) {}
    return null;
}

function renderPassingChords(song) {
    const header = qs("presentationHeader");
    if (!header) return;
    let box = qs("presentationPassingChords");
    if (!box) {
        box = document.createElement("div");
        box.id = "presentationPassingChords";
        header.insertBefore(box, qs("presentationCounter") || null);
    }

    const data = getPassingData(song);
    const entries = [];
    if (data) {
        const map = [
            ["returnToVerse", "RETURN TO VERSE 1"],
            ["lastThree", "LAST 3"],
            ["outro", "OUTRO"],
            ["spirit", "SINGING IN THE SPIRIT"]
        ];
        map.forEach(([key, label]) => {
            if (data[key]) entries.push(`<div class="presentation-passing-item"><span class="presentation-passing-label">${esc(label)}</span><span class="presentation-passing-value">${esc(data[key])}</span></div>`);
        });
    }
    box.innerHTML = `<div class="presentation-passing-title">PASSING CHORDS</div><div class="presentation-passing-items">${entries.length ? entries.join("") : '<div class="presentation-passing-empty">—</div>'}</div>`;
}

function collectSections() {
    const source = qs("lyrics");
    if (!source) return [];
    const sections = [...source.querySelectorAll(":scope > .song-section")];
    if (sections.length) return sections;
    const fallback = document.createElement("section");
    fallback.className = "song-section";
    fallback.append(...[...source.children].map(node => node.cloneNode(true)));
    return fallback.children.length ? [fallback] : [];
}

function sectionWeight(section) {
    const text = section.textContent || "";
    return Math.max(1, text.length + section.querySelectorAll(".song-line").length * 30);
}

function buildThreeColumns() {
    const target = qs("presentationLyrics");
    if (!target) return;
    const sections = collectSections();
    target.innerHTML = "";

    const grid = document.createElement("div");
    grid.className = "presentation-grid";
    const columns = [0, 1, 2].map(() => {
        const col = document.createElement("div");
        col.className = "presentation-column";
        grid.appendChild(col);
        return col;
    });

    const weights = [0, 0, 0];
    sections.forEach((section) => {
        let column = 0;
        if (weights[1] < weights[column]) column = 1;
        if (weights[2] < weights[column]) column = 2;
        const clone = section.cloneNode(true);
        clone.classList.add("presentation-section");
        clone.querySelectorAll(".section-title").forEach(title => title.classList.add("presentation-section-title"));
        clone.querySelectorAll(".song-line").forEach(line => {
            line.classList.add("presentation-line");
            const chordNodes = [...line.querySelectorAll(".chord")];
            if (chordNodes.length) {
                const chordRow = document.createElement("div");
                chordRow.className = "presentation-chord-row";
                chordNodes.forEach(chord => {
                    chord.classList.add("presentation-chord");
                    chordRow.appendChild(chord);
                });
                const lyricRow = document.createElement("div");
                lyricRow.className = "presentation-lyric-row";
                // Preserve all non-chord text exactly as it appears in the source line.
                const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
                const textParts = [];
                let node;
                while ((node = walker.nextNode())) {
                    if (!node.parentElement?.closest(".presentation-chord-row")) textParts.push(node.nodeValue || "");
                }
                lyricRow.textContent = textParts.join("");
                line.innerHTML = "";
                line.appendChild(chordRow);
                line.appendChild(lyricRow);
            }
        });
        columns[column].appendChild(clone);
        weights[column] += sectionWeight(section);
    });

    target.appendChild(grid);
}

function getSongUrl(song) {
    if (!song) return "";
    if (song.customSong || String(song.file || "").startsWith("custom-song.html")) {
        return `../custom-song.html?id=${encodeURIComponent(song.id || "")}`;
    }
    const file = String(song.file || song.url || "").trim();
    if (!file) return "";
    const clean = file.replace(/^\.\//, "").replace(/^\.\.\//, "");
    const name = clean.startsWith("songs/") ? clean.slice(6) : clean.split("/").pop();
    return `../songs/${encodeURIComponent(name)}`;
}

function renderNextPreview() {
    const preview = qs("nextSongPreview");
    if (!preview) return;
    const songs = service?.songs || [];
    const next = songs[serviceIndex + 1];
    if (!next) {
        preview.innerHTML = '<div class="next-preview-empty">END OF SERVICE</div>';
        preview.dataset.url = "";
        return;
    }
    preview.dataset.url = getSongUrl(next);
    preview.innerHTML = `<span class="next-preview-label">NEXT SONG</span><strong>${esc(next.title || "Untitled Song")}</strong><span class="next-preview-key">${esc(next.serviceKey || next.key || "")}</span>`;
}

function updateCounter() {
    const counter = qs("presentationCounter");
    if (!counter) return;
    if (service?.songs?.length) counter.textContent = `SONG ${serviceIndex + 1} / ${service.songs.length}`;
    else counter.textContent = "STANDALONE";
}

function renderPresentation() {
    currentSong = normalizeSong(getSongFromPage());
    const title = qs("presentationTitle");
    if (title) title.textContent = currentSong.title;
    updateCounter();
    renderPassingChords(currentSong);
    buildThreeColumns();
    renderNextPreview();
}

async function enterFullscreen() {
    const screen = qs("presentationScreen");
    if (!screen || document.fullscreenElement) return;
    try {
        await screen.requestFullscreen();
    } catch (_) {
        try { await document.documentElement.requestFullscreen(); } catch (_) {}
    }
}

async function exitFullscreen() {
    if (document.fullscreenElement) {
        try { await document.exitFullscreen(); } catch (_) {}
    }
}

window.startPresentation = async function startPresentation() {
    const screen = qs("presentationScreen");
    if (!screen) return;
    currentSong = normalizeSong(getSongFromPage());
    await loadService();
    if (service?.songs?.length) {
        const pageFile = location.pathname.split("/").pop();
        const found = service.songs.findIndex(s => {
            const f = String(s.file || "").split("/").pop();
            return f === pageFile || String(s.id) === String(currentSong.id);
        });
        if (found >= 0) {
            serviceIndex = found;
            currentSong = normalizeSong(service.songs[found]);
        }
    }
    localStorage.setItem("currentSongIndex", String(serviceIndex));
    localStorage.setItem("presentationMode", "standalone");
    screen.classList.add("show");
    screen.style.display = "flex";
    renderPresentation();
    await enterFullscreen();
};

window.exitPresentation = async function exitPresentation() {
    const screen = qs("presentationScreen");
    if (screen) {
        screen.classList.remove("show");
        screen.style.display = "none";
    }
    localStorage.removeItem("presentationMode");
    await exitFullscreen();
};

async function navigateService(delta) {
    if (!service?.songs?.length) return;
    const nextIndex = serviceIndex + delta;
    if (nextIndex < 0 || nextIndex >= service.songs.length) return;
    serviceIndex = nextIndex;
    localStorage.setItem("currentSongIndex", String(serviceIndex));
    const url = getSongUrl(service.songs[serviceIndex]);
    if (url) window.location.assign(url);
}

window.nextServiceSong = () => navigateService(1);
window.previousServiceSong = () => navigateService(-1);
window.nextPresentationSong = () => navigateService(1);
window.previousPresentationSong = () => navigateService(-1);

window.maximizePresentation = enterFullscreen;

function bindPresentationButtons() {
    const screen = qs("presentationScreen");
    if (!screen || screen.dataset.presentationBound) return;
    screen.dataset.presentationBound = "true";

    qs("nextSongPreview")?.addEventListener("click", () => {
        if (qs("nextSongPreview")?.dataset.url) window.location.assign(qs("nextSongPreview").dataset.url);
    });

    document.addEventListener("keydown", (event) => {
        if (!qs("presentationScreen")?.classList.contains("show")) return;
        if (event.key === "ArrowRight") { event.preventDefault(); window.nextPresentationSong(); }
        if (event.key === "ArrowLeft") { event.preventDefault(); window.previousPresentationSong(); }
        if (event.key === "Escape") { event.preventDefault(); window.exitPresentation(); }
        if (event.key.toLowerCase() === "f") { event.preventDefault(); enterFullscreen(); }
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    bindPresentationButtons();
    currentSong = normalizeSong(getSongFromPage());
    if (localStorage.getItem("resumePresentation") === "true") {
        setTimeout(() => window.startPresentation(), 150);
    }
});

onAuthStateChanged(auth, async () => {
    authReady = true;
    if (qs("presentationScreen")?.classList.contains("show")) {
        service = null;
        await loadService();
        renderPresentation();
    }
});

window.addEventListener("resize", () => {
    if (qs("presentationScreen")?.classList.contains("show")) renderPresentation();
});
