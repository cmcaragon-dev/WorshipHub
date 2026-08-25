"use strict";

/*
 * WorshipHub Presentation Runtime v2
 *
 * Responsibilities:
 *  - Full-screen 2-column presentation
 *  - Compact chord-above-lyric rendering
 *  - Automatic passing-chord calculation from CURRENT SERVICE KEY
 *  - Next-song preview + service navigation
 *  - Presentation controls / keyboard navigation
 */

import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let service = null;
let serviceIndex = Number(localStorage.getItem("currentSongIndex") || 0);
let currentSong = null;
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

function normalizeKey(value) {
    return String(value ?? "")
        .trim()
        .replace(/\s*(major|minor|maj|m)\s*$/i, "")
        .replace(/[♯]/g, "#")
        .replace(/[♭]/g, "b");
}

const SHARP_KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_KEYS  = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

function parseRoot(key) {
    const clean = normalizeKey(key);
    const match = clean.match(/^[A-G](?:#|b)?/i);
    return match ? match[0][0].toUpperCase() + (match[0][1] || "") : "C";
}

function keyIndex(key) {
    const root = parseRoot(key);
    const sharpIndex = SHARP_KEYS.indexOf(root);
    if (sharpIndex >= 0) return sharpIndex;
    const flatIndex = FLAT_KEYS.indexOf(root);
    return flatIndex >= 0 ? flatIndex : 0;
}

function preferFlats(key) {
    const root = parseRoot(key);
    return root.includes("b") || /b/.test(String(key || ""));
}

function transposeKey(key, semitones) {
    const source = normalizeKey(key) || "C";
    const index = (keyIndex(source) + semitones + 120) % 12;
    return (preferFlats(source) ? FLAT_KEYS : SHARP_KEYS)[index];
}

function getOriginalKey(song) {
    return normalizeKey(
        song?.originalKey ||
        song?.baseKey ||
        song?.keyOriginal ||
        song?.key ||
        song?.serviceKey ||
        qs("serviceKey")?.textContent ||
        "C"
    );
}

// Passing chords must follow the CURRENT SERVICE KEY.
// The service key may have been changed by the song transpose controls before
// Presentation is opened, so prefer the visible service-key value on the page.
function getServiceKey(song) {
    const pageServiceKey = qs("serviceKey")?.textContent?.trim();
    const pageSongKey = qs("songKey")?.textContent?.trim();
    return normalizeKey(
        pageServiceKey ||
        pageSongKey ||
        song?.serviceKey ||
        song?.currentKey ||
        song?.key ||
        getOriginalKey(song) ||
        "C"
    );
}

function getCategory(song) {
    return String(song?.category || song?.genre || "").trim().toLowerCase();
}

function isWorship(song) {
    return getCategory(song) === "worship";
}

/*
 * Passing-chord rules for the presentation:
 *
 * IMPORTANT: These calculations use the CURRENT SERVICE KEY, not the
 * original/base key. Therefore, when the song is transposed before the
 * presentation opens, every passing chord follows the transposed key.
 *
 * Return to Verse 1 = Service Key + 7
 * Last 3            = Service Key + 9 + "m"
 * Worship only:
 *   Outro           = Service Key + 5 -> (Service Key + 5)m -> Service Key
 *   Spirit          = Service Key -> Service Key + 5
 */
function calculatePassingChords(song) {
    const serviceKey = getServiceKey(song);
    const returnKey = transposeKey(serviceKey, 7);
    const lastThree = `${transposeKey(serviceKey, 9)}m`;

    const result = {
        serviceKey,
        returnToVerse: returnKey,
        lastThree,
        outro: null,
        spirit: null
    };

    if (isWorship(song)) {
        const plusFive = transposeKey(serviceKey, 5);
        result.outro = `${plusFive} → ${plusFive}m → ${serviceKey}`;
        result.spirit = `${serviceKey} → ${plusFive}`;
    }

    return result;
}

function getSongFromPage() {
    if (window.currentSong) return window.currentSong;
    return {
        title: qs("songTitle")?.textContent || document.title || "Worship Song",
        artist: qs("songArtist")?.textContent || "",
        key: qs("serviceKey")?.textContent || "C",
        category: "",
        file: location.pathname
    };
}

function normalizeSong(song) {
    if (!song) return null;
    const merged = { ...song };
    const originalKey = normalizeKey(
        song.originalKey || song.baseKey || song.keyOriginal || song.key || song.serviceKey || "C"
    );
    merged.originalKey = originalKey;
    merged.key = song.serviceKey || song.key || originalKey;
    merged.title = song.title || "Untitled Song";
    merged.artist = song.artist || "";
    merged.category = song.category || song.genre || "";
    return merged;
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

function renderPassingChords(song) {
    const header = qs("presentationHeader");
    if (!header) return;

    let box = qs("presentationPassingChords");
    if (!box) {
        box = document.createElement("div");
        box.id = "presentationPassingChords";
        header.insertBefore(box, qs("presentationCounter") || null);
    }

    const data = calculatePassingChords(song);
    const items = [
        ["RETURN TO VERSE 1", data.returnToVerse, "always"],
        ["LAST 3", data.lastThree, "always"],
        ["OUTRO", data.outro, "worship"],
        ["SINGING IN THE SPIRIT", data.spirit, "worship"]
    ];

    const visible = items.filter(([, value, rule]) => value && (rule === "always" || isWorship(song)));

    // The section heading "PASSING CHORDS" was intentionally removed.
    // The labels/values sit directly beside the song title to avoid overlap.
    box.innerHTML = `
        <div class="presentation-passing-items">
            ${visible.map(([label, value]) => `
                <div class="presentation-passing-item">
                    <span class="presentation-passing-label">${esc(label)}</span>
                    <span class="presentation-passing-value">${esc(value)}</span>
                </div>
            `).join("")}
        </div>
    `;
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

function rebuildLine(line) {
    const chordNodes = [...line.querySelectorAll(":scope > .chord")];
    if (!chordNodes.length) {
        line.classList.add("presentation-line", "presentation-no-chord");
        return;
    }

    const chordRow = document.createElement("div");
    chordRow.className = "presentation-chord-row";

    chordNodes.forEach((chord) => {
        // The source song HTML stores chord text on its own line, often as:
        // <span class="chord">\nD            A</span>.
        // Moving that span directly into the presentation row would preserve
        // the newline and indentation and can create an extra line box or
        // make the chord appear vertically over the lyric. Normalize ONLY the
        // line breaks around the chord text; preserve all internal spaces so
        // chord positions stay aligned with the lyric.
        const normalizedChord = chord.cloneNode(true);
        // Preserve the chord's exact horizontal character position from the
        // source HTML. Only remove formatting newlines/tabs introduced by
        // indentation in the HTML; NEVER trim leading spaces because those
        // spaces are the actual chord placement.
        normalizedChord.textContent = String(chord.textContent || "")
            .replace(/\r?\n/g, "")
            .replace(/\t/g, "");
        normalizedChord.classList.add("presentation-chord");
        chordRow.appendChild(normalizedChord);
    });

    const lyricRow = document.createElement("div");
    lyricRow.className = "presentation-lyric-row";

    // Capture only text outside the chord spans. This preserves the lyric exactly.
    [...line.childNodes].forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) lyricRow.appendChild(document.createTextNode(node.nodeValue || ""));
    });

    // IMPORTANT: the parent line must contain the full height of BOTH rows.
    // Do not use a compressed line-height on the parent, otherwise the next
    // chord row can climb into the previous lyric row on large screens.
    line.style.display = "block";
    line.style.height = "auto";
    line.style.minHeight = "0";
    line.style.lineHeight = "normal";
    line.style.margin = "0";
    line.style.padding = "0";

    chordRow.style.display = "block";
    chordRow.style.height = "auto";
    chordRow.style.minHeight = "0";
    chordRow.style.lineHeight = "1";
    chordRow.style.margin = "0";
    chordRow.style.padding = "0";
    chordRow.style.whiteSpace = "pre";

    lyricRow.style.display = "block";
    lyricRow.style.height = "auto";
    lyricRow.style.minHeight = "0";
    lyricRow.style.lineHeight = "1";
    lyricRow.style.margin = "0";
    lyricRow.style.padding = "0";
    lyricRow.style.whiteSpace = "pre";

    line.innerHTML = "";
    line.classList.add("presentation-line");
    line.appendChild(chordRow);
    line.appendChild(lyricRow);
}


function removePresentationSectionNav() {
    const nav = qs("presentationSectionNav");
    if (nav) nav.remove();
}

function buildTwoColumns() {
    const target = qs("presentationLyrics");
    if (!target) return;

    const sections = collectSections();
    removePresentationSectionNav();
    target.innerHTML = "";
    target.dataset.selectedSection = "-1";

    if (!sections.length) return;

    // The presentation is a continuous, reading-order layout: section 1,
    // then section 2 below it, then section 3, etc. Only when the first
    // column reaches the available viewport height do we continue in the
    // second column. This keeps the presentation easy to follow for singers
    // and instrumentalists and avoids a masonry/grid layout that jumps
    // sections sideways too early.
    const grid = document.createElement("div");
    grid.className = "presentation-grid";

    const columns = [document.createElement("div"), document.createElement("div")];
    columns.forEach((column, index) => {
        column.className = "presentation-column";
        column.dataset.columnIndex = String(index);
        grid.appendChild(column);
    });
    target.appendChild(grid);

    const availableHeight = () => Math.max(0, target.clientHeight || window.innerHeight);
    let columnIndex = 0;

    sections.forEach((section, index) => {
        const clone = section.cloneNode(true);
        clone.classList.add("presentation-section");
        clone.dataset.sectionIndex = String(index);
        clone.id = `presentationSection-${index}`;

        clone.querySelectorAll(":scope > .section-title").forEach((title) => {
            title.classList.add("presentation-section-title");
        });
        clone.querySelectorAll(":scope > .song-line").forEach(rebuildLine);

        const currentColumn = columns[columnIndex];
        currentColumn.appendChild(clone);

        // Move the whole section to column 2 only if adding it would exceed
        // the visible presentation height and column 1 already has content.
        // If column 2 also becomes longer than the screen, it remains
        // vertically scrollable; we never create a third visible column.
        if (columnIndex === 0 && currentColumn.children.length > 1 &&
            currentColumn.scrollHeight > availableHeight()) {
            currentColumn.removeChild(clone);
            columns[1].appendChild(clone);
            columnIndex = 1;
        }
    });
}

// Kept as a harmless compatibility function for older code that may call it.
function selectPresentationSection(index, smooth = true) {
    const target = qs("presentationLyrics");
    if (!target) return;
    const section = target.querySelector(`#presentationSection-${Number(index)}`);
    if (section) section.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
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
        preview.innerHTML = `<span class="next-preview-label">NEXT SONG</span><strong>END OF SERVICE</strong>`;
        preview.dataset.url = "";
        return;
    }

    preview.dataset.url = getSongUrl(next);
    preview.innerHTML = `
        <span class="next-preview-label">NEXT SONG</span>
        <div class="next-preview-song-line">
            <strong class="next-preview-title">${esc(next.title || "Untitled Song")}</strong>
            <span class="next-preview-key">Key: ${esc(next.serviceKey || next.key || "—")}</span>
        </div>
    `;
}

function updateCounter() {
    const counter = qs("presentationCounter");
    if (!counter) return;
    counter.textContent = service?.songs?.length
        ? `${serviceIndex + 1} of ${service.songs.length}`
        : "STANDALONE";
}

function renderPresentation() {
    currentSong = normalizeSong(currentSong || getSongFromPage());

    const title = qs("presentationTitle");
    if (title) title.textContent = currentSong.title;

    updateCounter();
    renderPassingChords(currentSong);
    buildTwoColumns();
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

    const pageSong = normalizeSong(getSongFromPage());
    currentSong = pageSong;

    await loadService();

    if (service?.songs?.length) {
        const pageFile = location.pathname.split("/").pop();
        const found = service.songs.findIndex((song) => {
            const f = String(song.file || "").split("/").pop();
            return f === pageFile || String(song.id) === String(pageSong.id);
        });

        if (found >= 0) {
            serviceIndex = found;
            // Merge service data with the full page song so category/original key are retained.
            currentSong = normalizeSong({ ...pageSong, ...service.songs[found] });
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
window.refreshPresentation = renderPresentation;

window.openPresentationSongList = function openPresentationSongList() {
    window.location.assign("../index.html#songs");
};

window.openPresentationSettings = function openPresentationSettings() {
    window.location.assign("../settings.html");
};


function buildPrintPassingChords(song) {
    const serviceKey = getServiceKey(song);
    const plus5 = transposeKey(serviceKey, 5);
    const items = [
        ["RETURN TO VERSE 1", transposeKey(serviceKey, 7)],
        ["LAST 3", `${transposeKey(serviceKey, 9)}m`]
    ];
    if (isWorship(song)) {
        items.push(["OUTRO", `${plus5} → ${plus5}m → ${serviceKey}`]);
        items.push(["SINGING IN THE SPIRIT", `${serviceKey} → ${plus5}`]);
    }
    return items;
}

window.printSong = function printSong() {
    const source = qs("lyrics");
    if (!source) { window.print(); return; }

    const song = normalizeSong(getSongFromPage());
    const title = song?.title || document.querySelector(".song-title")?.textContent?.trim() || "WorshipHub";
    const artist = song?.artist || document.querySelector(".song-meta .meta-row:nth-child(1) .meta-value")?.textContent?.trim() || "";
    const originalKey = song?.originalKey || song?.key || document.querySelector(".song-meta .meta-row:nth-child(2) .meta-value")?.textContent?.trim() || "";
    const serviceKey = getServiceKey(song);
    const passing = buildPrintPassingChords(song);

    document.getElementById("worshipHubPrintRoot")?.remove();
    const root = document.createElement("div");
    root.id = "worshipHubPrintRoot";
    root.innerHTML = `
        <div class="print-song-header">
            <div class="print-song-meta">
                <div class="print-song-title">${esc(title)}</div>
                <div class="print-song-info">
                    <span><b>Artist:</b> ${esc(artist)}</span>
                    <span><b>Original Key:</b> ${esc(originalKey)}</span>
                    <span><b>Service Key:</b> ${esc(serviceKey)}</span>
                </div>
            </div>
            <div class="print-passing">
                ${passing.map(([label, value]) => `
                    <div class="print-passing-item">
                        <span class="print-passing-label">${esc(label)}</span>
                        <span class="print-passing-value">${esc(value)}</span>
                    </div>
                `).join("")}
            </div>
        </div>
        <div class="print-song-content"></div>
    `;
    const printContent = root.querySelector(".print-song-content");
    const printClone = source.cloneNode(true);
    printClone.querySelectorAll(".section-title").forEach((title) => {
        const label = String(title.textContent || "").trim();
        const shouldHighlight = /^(VERSE|CHORUS|BRIDGE|INTERLUDE)\b/i.test(label);
        title.classList.toggle("print-highlight-section", shouldHighlight);
        title.style.background = shouldHighlight ? "#FFD700" : "transparent";
        title.style.color = shouldHighlight ? "#000" : "#111";
    });
    // Absolutely no highlight on lyrics/chords. Only section headings may be yellow.
    printClone.querySelectorAll(".song-line, .song-line *, .chord").forEach((node) => {
        node.classList.remove("highlight", "highlighted", "active", "chord-highlight");
        node.style.background = "transparent";
        node.style.boxShadow = "none";
        node.style.textShadow = "none";
        node.style.color = "#111";
        node.style.webkitTextFillColor = "#111";
    });
    printContent.appendChild(printClone);
    document.body.appendChild(root);
    document.body.classList.add("worshiphub-printing");

    const cleanup = () => {
        document.body.classList.remove("worshiphub-printing");
        root.remove();
        window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    setTimeout(() => window.print(), 50);
};

function bindPresentationButtons() {
    const screen = qs("presentationScreen");
    if (!screen || screen.dataset.presentationBound) return;
    screen.dataset.presentationBound = "true";

    qs("nextSongPreview")?.addEventListener("click", () => {
        const url = qs("nextSongPreview")?.dataset.url;
        if (url) window.location.assign(url);
    });

    document.addEventListener("keydown", (event) => {
        if (!qs("presentationScreen")?.classList.contains("show")) return;

        if (event.key === "ArrowRight") {
            event.preventDefault();
            window.nextPresentationSong();
        }
        if (event.key === "ArrowLeft") {
            event.preventDefault();
            window.previousPresentationSong();
        }
        if (event.key === "Escape") {
            event.preventDefault();
            window.exitPresentation();
        }
        if (event.key.toLowerCase() === "f") {
            event.preventDefault();
            enterFullscreen();
        }
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    bindPresentationButtons();
    currentSong = normalizeSong(getSongFromPage());

    const activeServiceId = localStorage.getItem("currentServiceId");
    const shouldAutoPresent =
        localStorage.getItem("resumePresentation") === "true" ||
        !!activeServiceId;

    if (shouldAutoPresent) {
        setTimeout(() => {
            if (!qs("presentationScreen")?.classList.contains("show")) {
                window.startPresentation();
            }
        }, 180);
    }
});

onAuthStateChanged(auth, async () => {
    if (qs("presentationScreen")?.classList.contains("show")) {
        service = null;
        await loadService();
        renderPresentation();
    }
});

window.addEventListener("resize", () => {
    if (qs("presentationScreen")?.classList.contains("show")) renderPresentation();
});

// If the song page changes its Service Key through transpose controls while
// the presentation is open, immediately recalculate the passing chords.
const serviceKeyElement = qs("serviceKey") || qs("songKey");
if (serviceKeyElement && typeof MutationObserver !== "undefined") {
    const observer = new MutationObserver(() => {
        if (qs("presentationScreen")?.classList.contains("show")) {
            renderPassingChords(currentSong || getSongFromPage());
        }
    });
    observer.observe(serviceKeyElement, { childList: true, characterData: true, subtree: true });
}
