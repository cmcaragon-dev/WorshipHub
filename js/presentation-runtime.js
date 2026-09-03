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
let authReadyResolve;
const authReadyPromise = new Promise(resolve => { authReadyResolve = resolve; });
const authReadyWithTimeout = Promise.race([
    authReadyPromise,
    new Promise(resolve => setTimeout(resolve, 3500))
]);

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

// Transpose chord text without changing its whitespace. The whitespace is
// part of the chord/lyric positioning, so it must never be normalized.
// This handles simple chords, extended chords (m7, maj7, sus4, dim7, etc.),
// slash chords, and chord groups such as "Bm7 C#m7 F#m7".
function transposeChordText(value, semitones) {
    const text = String(value ?? "");
    if (!text.trim() || !Number.isFinite(semitones) || semitones === 0) return text;

    const transposeToken = token => {
        const rootMatch = token.match(/^([A-Ga-g])([#b♯♭]?)/);
        if (!rootMatch) return token;

        const accidental = rootMatch[2] === "♯" ? "#" : rootMatch[2] === "♭" ? "b" : rootMatch[2];
        const root = rootMatch[1].toUpperCase() + accidental;
        let result = transposeKey(root, semitones) + token.slice(rootMatch[0].length);

        // Transpose the bass note of slash chords, e.g. C#m7/G#.
        result = result.replace(/\/([A-Ga-g])([#b♯♭]?)(?=$|[^A-Za-z])/g,
            (_, letter, acc) => {
                const a = acc === "♯" ? "#" : acc === "♭" ? "b" : acc;
                return "/" + transposeKey(letter.toUpperCase() + a, semitones);
            });
        return result;
    };

    return text.replace(/\S+/g, transposeToken);
}

function getChordTransposeSteps(song) {
    const original = getOriginalKey(song);
    const current = getServiceKey(song);
    return (keyIndex(current) - keyIndex(original) + 12) % 12;
}

function getOriginalKey(song) {
    // ORIGINAL KEY is immutable. Never use the service key (`key`) as the
    // original key when a service-specific key has already been restored.
    return normalizeKey(
        song?.originalKey ||
        song?.baseKey ||
        song?.keyOriginal ||
        "C"
    );
}

// The Song Page display is the single source of truth for the Presentation.
// This prevents a stale Firebase/service object from changing C into A#, D,
// etc. after the Presentation is opened. Firebase is only a fallback when the
// page has not rendered a Service Key yet.
function getServiceKey(song) {
    const pageKey = qs("serviceKey")?.textContent?.trim();
    if (pageKey && !/^service\s*key\s*:/i.test(pageKey)) {
        return normalizeKey(pageKey);
    }

    const readyKey = window.__worshipHubServiceKeyReady
        ? (window.currentSong?.serviceKey || window.currentSong?.key)
        : null;

    const serviceIndex = Number(localStorage.getItem("currentSongIndex") || 0);
    const firebaseServiceKey = service?.songs?.[serviceIndex]?.serviceKey
        || service?.songs?.[serviceIndex]?.key;

    return normalizeKey(
        readyKey ||
        firebaseServiceKey ||
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
        song.originalKey || song.baseKey || song.keyOriginal || "C"
    );
    const serviceKey = normalizeKey(
        song.serviceKey || song.key || originalKey
    );
    merged.originalKey = originalKey;
    merged.serviceKey = serviceKey;
    merged.key = serviceKey;
    merged.title = song.title || "Untitled Song";
    merged.artist = song.artist || "";
    merged.category = song.category || song.genre || "";
    return merged;
}

async function loadService() {
    if (serviceLoading || service) return service;
    await authReadyWithTimeout;
    const serviceId = localStorage.getItem("currentServiceId");
    if (!serviceId || !auth.currentUser) return null;

    serviceLoading = true;
    try {
        // startService writes a confirmed snapshot before navigation. Render
        // from that snapshot immediately instead of adding another blocking
        // Firestore request to the presentation startup path.
        try {
            const cached = JSON.parse(localStorage.getItem("currentServiceSnapshot") || "null");
            if (cached && String(cached.id) === String(serviceId) && Array.isArray(cached.songs)) {
                service = cached;
                serviceLoading = false;
                return service;
            }
        } catch (e) {}
        const snap = await Promise.race([
            getDoc(doc(db, "users", auth.currentUser.uid, "services", String(serviceId))),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Service load timeout")), 5000))
        ]);
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
    // The Song Page has already rendered its chords using the authoritative
    // Service Key. Presentation must copy those displayed chords exactly.
    // Applying Original Key -> Service Key a second time here double-transposes
    // the chords (for example, the Presentation can appear one or more
    // semitones away from the Song Page).
    const chordTransposeSteps = 0;
    let lyricText = "";
    [...line.childNodes].forEach(node => { if (node.nodeType === Node.TEXT_NODE) lyricText += node.nodeValue || ""; });
    lyricText = lyricText.replace(/\r/g, "").replace(/\n/g, "").replace(/^\s+/, "").replace(/\s+$/, "");

    const chordRow = document.createElement("div");
    chordRow.className = "presentation-chord-row";
    chordNodes.forEach(chord => {
        const span = document.createElement("span");
        span.className = "presentation-chord";
        const displayedChordText = String(chord.textContent || "").replace(/\r/g, "").replace(/\n/g, "").replace(/\t/g, "");
        // Copy the exact chord already displayed on the Song Page. Do not
        // transpose it again in Presentation.
        span.textContent = displayedChordText;
        chordRow.appendChild(span);
    });

    const lyricRow = document.createElement("div");
    lyricRow.className = "presentation-lyric-row";
    lyricRow.textContent = lyricText;

    line.innerHTML = "";
    line.classList.add("presentation-line");
    line.style.cssText += ";display:block!important;margin:0!important;padding:0!important;height:auto!important;min-height:0!important;line-height:1!important;";
    chordRow.style.cssText = "display:block!important;width:100%!important;height:1em!important;min-height:1em!important;margin:0!important;padding:0!important;line-height:1em!important;font-family:Consolas,\"Courier New\",monospace!important;font-size:1em!important;white-space:pre!important;overflow:visible!important;";
    lyricRow.style.cssText = "display:block!important;width:100%!important;height:1em!important;min-height:1em!important;margin:0!important;padding:0!important;line-height:1em!important;font-family:Consolas,\"Courier New\",monospace!important;font-size:1em!important;white-space:pre!important;overflow:visible!important;";
    line.appendChild(chordRow);
    line.appendChild(lyricRow);
    if (!chordNodes.length) { line.classList.add("presentation-no-chord"); chordRow.style.display = "none"; }
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

    /*
     * Presentation reading flow:
     *
     *   1. Start at the TOP of column 1.
     *   2. Keep the song continuous in column 1, section after section.
     *   3. When the next COMPLETE section no longer fits in column 1,
     *      move that section to the TOP of column 2.
     *   4. Continue down column 2.
     *   5. When column 2 is full, create a NEW TWO-COLUMN PAGE below it
     *      and continue at the TOP of its column 1.
     *
     * This gives the exact requested reading order:
     *
     *   PAGE 1:  column 1 -> column 2
     *   PAGE 2:  column 1 -> column 2
     *   ...
     *
     * The whole presentation remains vertically scrollable.
     */
    const pages = [];
    let page = null;
    let columnIndex = 0;

    const createPage = () => {
        const pageGrid = document.createElement("div");
        pageGrid.className = "presentation-page";
        // Pages are intentionally content-sized. The outer #presentationLyrics
        // viewport scrolls vertically instead of shrinking the song to one screen.
        pageGrid.style.removeProperty("--presentation-page-height");

        const cols = [document.createElement("div"), document.createElement("div")];
        cols.forEach((column, index) => {
            column.className = "presentation-column";
            column.dataset.columnIndex = String(index);
            pageGrid.appendChild(column);
        });

        target.appendChild(pageGrid);
        const entry = { grid: pageGrid, columns: cols };
        pages.push(entry);
        return entry;
    };

    const availableHeight = () => Math.max(300, target.clientHeight || window.innerHeight);

    const makeSection = (sourceSection, index) => {
        const clone = sourceSection.cloneNode(true);
        clone.classList.add("presentation-section");
        clone.dataset.sectionIndex = String(index);
        clone.id = `presentationSection-${index}`;

        clone.querySelectorAll(":scope > .section-title").forEach((title) => {
            title.classList.add("presentation-section-title");
        });
        clone.querySelectorAll(":scope > .song-line").forEach(rebuildLine);
        return clone;
    };

    page = createPage();
    columnIndex = 0;

    sections.forEach((sourceSection, index) => {
        let clone = makeSection(sourceSection, index);
        let column = page.columns[columnIndex];
        column.appendChild(clone);

        // Measure the real rendered section. If it would make the current
        // column exceed the available presentation height, move the WHOLE
        // section to the next column. Never split a verse/chorus/bridge.
        if (column.scrollHeight > availableHeight() && column.children.length > 1) {
            column.removeChild(clone);

            if (columnIndex === 0) {
                columnIndex = 1;
                page.columns[1].appendChild(clone);
            } else {
                page = createPage();
                columnIndex = 0;
                page.columns[0].appendChild(clone);
            }
        }
    });

    // A section taller than a whole column is allowed to overflow vertically;
    // it remains readable and the outer presentation viewport can scroll.
    pages.forEach((entry) => {
        // Do not force a viewport-height page. Each page grows naturally from
        // its two columns; additional pages remain below and are scrollable.
        entry.grid.style.removeProperty("height");
        entry.grid.style.removeProperty("min-height");
        entry.grid.style.removeProperty("max-height");
        entry.grid.style.alignItems = "start";
    });
}

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

    return "";
}

function renderNextPreview() {
    const preview = qs("nextSongPreview");
    if (!preview) return;
    if (typeof window.moveNextPreviewToLowerRight === "function") window.moveNextPreviewToLowerRight();

    const songs = Array.isArray(service?.songs) ? service.songs : [];
    const next = songs[serviceIndex + 1];

    preview.style.display = "flex";
    preview.classList.add("v24-next-preview");

    if (!next) {
        preview.innerHTML = `<span class="next-preview-label">NEXT SONG</span><strong class="next-preview-title">END OF SERVICE</strong>`;
        preview.dataset.url = "";
        return;
    }

    preview.dataset.url = getSongUrl(next);
    preview.innerHTML = `
        <span class="next-preview-label">NEXT SONG</span>
        <div class="next-preview-song-line">
            <strong class="next-preview-title"></strong>
            <span class="next-preview-key"></span>
        </div>
    `;
    const title = preview.querySelector(".next-preview-title");
    const key = preview.querySelector(".next-preview-key");
    if (title) title.textContent = next.title || "Untitled Song";
    if (key) key.textContent = `Service Key: ${next.serviceKey || next.key || next.originalKey || "—"}`;

    preview.onclick = () => {
        if (preview.dataset.url) window.location.assign(preview.dataset.url);
    };
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

    let presentationKey = qs("presentationServiceKey");
    if (!presentationKey) {
        presentationKey = document.createElement("div");
        presentationKey.id = "presentationServiceKey";
        const header = qs("presentationHeader");
        if (header) header.insertBefore(presentationKey, qs("presentationCounter") || null);
    }
    if (presentationKey) {
        const authoritativeKey = getServiceKey(currentSong);
        presentationKey.textContent = `Service Key: ${authoritativeKey}`;
        presentationKey.setAttribute("aria-label", `Service Key: ${authoritativeKey}`);
    }

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

async function waitForSongPageServiceKey(timeoutMs = 2000) {
    if (window.__worshipHubServiceKeyReady && (window.currentSong?.serviceKey || window.currentSong?.key)) {
        return window.currentSong.serviceKey || window.currentSong.key;
    }
    return await new Promise(resolve => {
        let finished = false;
        const finish = () => {
            if (finished) return;
            finished = true;
            window.removeEventListener("worshiphub:service-key-ready", onReady);
            resolve(window.currentSong?.serviceKey || window.currentSong?.key || null);
        };
        const onReady = () => finish();
        window.addEventListener("worshiphub:service-key-ready", onReady, { once: true });
        setTimeout(finish, timeoutMs);
    });
}

window.startPresentation = async function startPresentation(options = {}) {
    // Automatic presentation must never block on Firebase/Auth or the browser
    // Fullscreen API. The presentation overlay itself is already viewport-sized.
    if (options && options.auto) {
        await authReadyWithTimeout;
    } else {
        await authReadyWithTimeout;
    }
    const screen = qs("presentationScreen");
    if (!screen) return;

    // Wait briefly for the Service Planner key to be ready before rendering.
    await waitForSongPageServiceKey(2000);

    const pageSong = normalizeSong(getSongFromPage());
    currentSong = pageSong;

    await loadService();

    if (service?.songs?.length) {
        const pageFile = location.pathname.split("/").pop();
        // A service may contain the same song more than once. Keep the
        // persisted serviceIndex when it still points to the requested song;
        // do not use findIndex() because it always selects the first copy.
        let found = -1;
        const currentCandidate = service.songs[serviceIndex];
        if (currentCandidate && (
            String(currentCandidate.id || "") === String(pageSong.id || "") ||
            String(currentCandidate.file || "").split("/").pop() === pageFile
        )) {
            found = serviceIndex;
        } else {
            found = service.songs.findIndex((song) => {
                const f = String(song.file || "").split("/").pop();
                return f === pageFile || String(song.id) === String(pageSong.id);
            });
        }

        if (found >= 0) {
            serviceIndex = found;
            // Merge service data with the full page song so category/original key are retained.
            // If the Service Planner key has been restored, keep
            // that exact key authoritative instead of allowing a stale service copy.
            const mergedServiceSong = { ...pageSong, ...service.songs[found] };
            if (window.__worshipHubServiceKeyReady && window.currentSong?.serviceKey) {
                mergedServiceSong.serviceKey = window.currentSong.serviceKey;
                mergedServiceSong.key = window.currentSong.serviceKey;
                mergedServiceSong.transpose = window.currentSong.transpose;
                mergedServiceSong.originalKey = window.currentSong.originalKey || mergedServiceSong.originalKey;
            }
            currentSong = normalizeSong(mergedServiceSong);
        }
    }

    localStorage.setItem("currentSongIndex", String(serviceIndex));
    localStorage.setItem("presentationMode", "standalone");

    // Open the presentation as a true viewport-sized overlay immediately.
    // Automatic startup uses the fixed viewport overlay only. Browser fullscreen
    // is intentionally reserved for the explicit Maximize button / F key.
    document.body.classList.add("presentation-active");
    screen.classList.add("show");
    screen.style.display = "flex";
    screen.style.position = "fixed";
    screen.style.inset = "0";
    screen.style.width = "100vw";
    screen.style.height = "100vh";
    renderPresentation();

    // IMPORTANT: Do NOT request browser fullscreen during automatic startup.
    // requestFullscreen() requires a user gesture in most browsers and can
    // leave the presentation waiting/appearing stuck while the page is loading.
    // The CSS overlay above is the automatic maximized mode. Browser fullscreen
    // is reserved for the explicit Maximize button / F key.
    if (options && options.userGesture) {
        await enterFullscreen();
    }
};


window.stopService = async function stopService(){
    localStorage.removeItem("currentServiceId");
    localStorage.removeItem("currentServiceName");
    localStorage.removeItem("currentSongIndex");
    localStorage.removeItem("resumePresentation");
    localStorage.removeItem("presentationMode");
    await window.exitPresentation();
    alert("Service stopped.");
};

window.exitPresentation = async function exitPresentation() {
    const screen = qs("presentationScreen");
    if (screen) {
        screen.classList.remove("show");
        screen.style.display = "none";
    }

    localStorage.removeItem("presentationMode");
    document.body.classList.remove("presentation-active");
    await exitFullscreen();
};

async function navigateService(delta) {
    if (!service?.songs?.length) return;
    const nextIndex = serviceIndex + delta;
    if (nextIndex < 0 || nextIndex >= service.songs.length) return;
    serviceIndex = nextIndex;
    localStorage.setItem("currentSongIndex", String(serviceIndex));

    // If the presentation is running inside custom-song.html, switch songs
    // without navigating away. This removes the visible loading delay between
    // songs and keeps the presentation overlay alive.
    if (typeof window.WorshipHubCustomSong?.loadServiceIndex === "function") {
        const changed = await window.WorshipHubCustomSong.loadServiceIndex(serviceIndex);
        if (changed) return;
    }

    const url = getSongUrl(service.songs[serviceIndex]);
    if (url) window.location.assign(url);
}

window.nextServiceSong = () => navigateService(1);
window.previousServiceSong = () => navigateService(-1);
window.nextPresentationSong = () => navigateService(1);
window.previousPresentationSong = () => navigateService(-1);
window.maximizePresentation = async function maximizePresentation() {
    // Explicit user action: browser fullscreen is safe here.
    await enterFullscreen();
};
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
            <div class="print-passing" aria-label="Auto-generated passing chords">
                ${passing.map(([label, value]) => `
                    <span class="print-passing-item">
                        <span class="print-passing-label">${esc(label)}:</span>
                        <span class="print-passing-value">${esc(value)}</span>
                    </span>
                `).join(' <span class="print-passing-separator" aria-hidden="true">|</span> ')}
            </div>
        </div>
        <div class="print-song-content"></div>
    `;
    const printContent = root.querySelector(".print-song-content");
    const printClone = source.cloneNode(true);
    printClone.removeAttribute("id");
    printClone.classList.add("wh-print-source-content");
    printClone.style.display = "block";
    printClone.style.visibility = "visible";
    printClone.style.height = "auto";
    printClone.style.maxHeight = "none";
    printClone.style.overflow = "visible";
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
    if (window.WorshipHubPrintPreview) {
        window.WorshipHubPrintPreview.open(root);
    } else {
        document.body.classList.add("worshiphub-printing");
        setTimeout(() => window.print(), 50);
    }
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

document.addEventListener("DOMContentLoaded", () => {
    bindPresentationButtons();
    currentSong = normalizeSong(getSongFromPage());

    // Every song page opens its presentation automatically, but NEVER enters
    // browser fullscreen. The presentation is simply shown as an overlay.
    // Browser fullscreen remains available only through the Maximize button
    // or the F key.
    setTimeout(() => {
        if (!qs("presentationScreen")?.classList.contains("show")) {
            window.startPresentation({ auto: true });
        }
    }, 120);
});

onAuthStateChanged(auth, async () => {
    authReadyResolve();
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


/* WorshipHub v24 next song preview */
(function(){
  function v24NextSongPreview(){
    try{
      const root = document.querySelector('.presentation-header,.presentation-title-bar');
      if(!root || document.querySelector('.v24-next-song-preview')) return;
      const raw = localStorage.getItem('worshipHubServicePlanner') ||
                  localStorage.getItem('servicePlanner') ||
                  localStorage.getItem('activeServicePlanner');
      if(!raw) return;
      let data; try{ data=JSON.parse(raw); }catch(e){ return; }
      const songs = data?.songs || data?.serviceSongs || data?.items || [];
      const currentId = data?.currentSongId || window.currentSongId;
      let idx = songs.findIndex(s => String(s.id||s.songId)===String(currentId));
      if(idx < 0 && typeof window.currentSongIndex === 'number') idx=window.currentSongIndex;
      const next = idx >= 0 ? songs[idx+1] : null;
      if(!next) return;
      const el=document.createElement('div');
      el.className='v24-next-song-preview presentation-next-song';
      const title=next.title||next.songTitle||'Next Song';
      const key=next.serviceKey||next.key||next.originalKey||'';
      el.innerHTML='<span class="next-label">NEXT:</span><span class="song-title"></span>'+
                   (key?'<span class="service-key"></span>':'');
      el.querySelector('.song-title').textContent=title;
      if(key) el.querySelector('.service-key').textContent='Key: '+key;
      root.appendChild(el);
    }catch(e){}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',v24NextSongPreview);
  else v24NextSongPreview();
})();

/* WorshipHub v26: move next-song preview into compact header */
(function(){
  function placeNextPreviewInHeader(){
    const preview=document.getElementById("nextSongPreview");
    const header=document.getElementById("presentationHeader");
    if(!preview || !header) return;
    if(preview.parentElement !== header){
      const counter=document.getElementById("presentationCounter");
      header.insertBefore(preview, counter || header.lastElementChild);
    }
    preview.style.display="flex";
  }
  window.placeNextSongPreviewInHeader=placeNextPreviewInHeader;
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",placeNextPreviewInHeader);
  else placeNextPreviewInHeader();
})();

/* WorshipHub v27: next-song preview lower-right */
(function(){
  function moveNextPreviewToLowerRight(){
    const preview = document.getElementById("nextSongPreview");
    const screen = document.getElementById("presentationScreen") || document.body;
    if (!preview || !screen) return;

    if (preview.parentElement !== screen) {
      screen.appendChild(preview);
    }

    preview.classList.add("wh-v27-next-song-preview");
    preview.style.display = "flex";
  }

  window.moveNextPreviewToLowerRight = moveNextPreviewToLowerRight;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", moveNextPreviewToLowerRight);
  } else {
    moveNextPreviewToLowerRight();
  }
})();
