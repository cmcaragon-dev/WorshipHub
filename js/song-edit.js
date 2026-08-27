import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { isAdmin, canEditSongs } from "./admin-settings.js";

/*
 * Song-page editor
 * - Edit button is visible only to the administrator.
 * - Every editable line is shown as CHORDS ABOVE / LYRICS BELOW.
 * - Chord spacing is stored as plain text so the original horizontal
 *   positions are preserved exactly.
 * - Lyrics can also be edited.
 */

function slug() {
    const path = location.pathname.split("/").pop() || "";
    return path.replace(/\.html$/i, "") || String(window.currentSong?.id || "song");
}

function esc(value) {
    return String(value ?? "")
        .replace(/&/g,"&amp;").replace(/</g,"&lt;")
        .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

function getSourceLines() {
    const root = document.getElementById("lyrics");
    if (!root) return [];
    return [...root.querySelectorAll(":scope > .song-section")].flatMap((section, sectionIndex) =>
        [...section.querySelectorAll(":scope > .song-line")].map((line, lineIndex) => {
            const chords = [...line.querySelectorAll(":scope > .chord")];
            let chordLayout = "";
            if (chords.length) {
                const range = document.createRange();
                range.setStart(line, 0);
                range.setEndAfter(chords[chords.length - 1]);
                chordLayout = range.cloneContents().textContent || "";
                chordLayout = chordLayout.replace(/\r?\n/g, "");
            }
            const clone = line.cloneNode(true);
            clone.querySelectorAll(".chord").forEach(n => n.remove());
            const lyricText = clone.textContent || "";
            return { sectionIndex, lineIndex, line, chordLayout, lyricText };
        })
    );
}

function applyLineEdit(line, chordLayout, lyricText) {
    line.innerHTML = "";
    if (String(chordLayout || "").length) {
        const chordSpan = document.createElement("span");
        chordSpan.className = "chord";
        chordSpan.dataset.layoutChord = "true";
        chordSpan.textContent = String(chordLayout);
        line.appendChild(chordSpan);
    }
    line.appendChild(document.createTextNode(String(lyricText ?? "")));
}

async function loadSavedLayout() {
    try {
        const snap = await getDoc(doc(db, "songs", slug()));
        if (!snap.exists()) return;
        const data = snap.data() || {};
        const chordLayouts = data.chordLayouts || {};
        const lyricLayouts = data.lyricLayouts || {};
        const sections = [...document.querySelectorAll("#lyrics > .song-section")];

        Object.keys({ ...chordLayouts, ...lyricLayouts }).forEach(key => {
            const [si, li] = key.split(":").map(Number);
            const line = sections[si]?.querySelectorAll(":scope > .song-line")?.[li];
            if (!line) return;
            const source = getSourceLines().find(x => x.sectionIndex === si && x.lineIndex === li);
            const chord = Object.prototype.hasOwnProperty.call(chordLayouts,key) ? String(chordLayouts[key]) : source?.chordLayout || "";
            const lyric = Object.prototype.hasOwnProperty.call(lyricLayouts,key) ? String(lyricLayouts[key]) : source?.lyricText || "";
            applyLineEdit(line, chord, lyric);
        });
        document.dispatchEvent(new CustomEvent("worshiphub:song-layout-loaded"));
    } catch (e) {
        console.warn("Could not load saved song edits:", e);
    }
}

function addEditButton() {
    if (!isAdmin(auth.currentUser)) return;
    if (document.getElementById("editSongBtn")) return;
    const toolbar = document.querySelector(".song-toolbar");
    if (!toolbar) return;
    const btn = document.createElement("button");
    btn.id = "editSongBtn";
    btn.type = "button";
    btn.textContent = "✎ Edit Song";
    btn.className = "song-edit-btn";
    btn.title = "Edit song lyrics and chord positions";
    btn.addEventListener("click", openEditor);
    toolbar.insertBefore(btn, toolbar.querySelector("#presentationBtn") || toolbar.lastElementChild);
}

function openEditor() {
    if (!isAdmin(auth.currentUser)) {
        alert("Only the administrator can edit songs.");
        return;
    }
    const root = document.getElementById("lyrics");
    if (!root) return;

    let panel = document.getElementById("songChordEditor");
    if (!panel) {
        panel = document.createElement("div");
        panel.id = "songChordEditor";
        panel.className = "song-chord-editor";
        document.body.appendChild(panel);
    }

    const sourceLines = getSourceLines();
    const grouped = {};
    sourceLines.forEach(item => {
        const key = `${item.sectionIndex}:${item.lineIndex}`;
        grouped[key] = item;
    });

    const sections = [...root.querySelectorAll(":scope > .song-section")];
    panel.innerHTML = `
      <div class="song-chord-editor-card">
        <div class="song-chord-editor-head">
          <div>
            <strong>Edit Song</strong>
            <span class="song-editor-admin-badge">ADMIN</span>
          </div>
          <button type="button" id="closeChordEditor" aria-label="Close">×</button>
        </div>
        <div class="song-editor-columns">
          <div class="song-editor-column-label">CHORDS</div>
          <div class="song-editor-column-label">LYRICS</div>
        </div>
        <div id="chordEditorRows"></div>
        <div class="song-chord-editor-actions">
          <button type="button" id="cancelChordEdit">Cancel</button>
          <button type="button" id="saveChordEdit" class="primary">💾 Save Changes</button>
        </div>
      </div>`;

    const rows = panel.querySelector("#chordEditorRows");

    sections.forEach((section, si) => {
        const title = section.querySelector(":scope > .section-title")?.textContent?.trim() || `Section ${si+1}`;
        const heading = document.createElement("div");
        heading.className = "chord-editor-section-title";
        heading.textContent = title;
        rows.appendChild(heading);

        [...section.querySelectorAll(":scope > .song-line")].forEach((line, li) => {
            const source = grouped[`${si}:${li}`] || { chordLayout:"", lyricText:line.textContent || "" };
            const wrap = document.createElement("div");
            wrap.className = "chord-editor-row";
            wrap.dataset.key = `${si}:${li}`;
            wrap.innerHTML = `
              <textarea class="chord-layout-input" spellcheck="false" aria-label="Chords above lyrics"></textarea>
              <textarea class="chord-editor-lyric-input" spellcheck="false" aria-label="Lyrics below chords"></textarea>`;
            wrap.querySelector(".chord-layout-input").value = source.chordLayout;
            wrap.querySelector(".chord-editor-lyric-input").value = source.lyricText;
            rows.appendChild(wrap);
        });
    });

    panel.querySelector("#closeChordEditor").onclick = () => panel.remove();
    panel.querySelector("#cancelChordEdit").onclick = () => panel.remove();

    panel.querySelector("#saveChordEdit").onclick = async () => {
        const user = auth.currentUser;
        if (!user || !isAdmin(user) || !(await canEditSongs(user))) {
            alert("Only the administrator can edit songs.");
            return;
        }

        const chordLayouts = {};
        const lyricLayouts = {};
        panel.querySelectorAll(".chord-editor-row").forEach(row => {
            const key = row.dataset.key;
            chordLayouts[key] = row.querySelector(".chord-layout-input").value;
            lyricLayouts[key] = row.querySelector(".chord-editor-lyric-input").value;
        });

        const btn = panel.querySelector("#saveChordEdit");
        btn.disabled = true;
        try {
            const songId = String(window.currentSong?.id || slug());
            await setDoc(doc(db, "songs", songId), {
                id: songId,
                title: window.currentSong?.title || document.title,
                artist: window.currentSong?.artist || "",
                slug: slug(),
                chordLayouts,
                lyricLayouts,
                updatedAt: serverTimestamp(),
                updatedBy: user.email || user.uid,
                updatedByUid: user.uid,
                chordLayoutVersion: 4
            }, { merge: true });

            const currentSections = [...root.querySelectorAll(":scope > .song-section")];
            Object.keys(chordLayouts).forEach(key => {
                const [si, li] = key.split(":").map(Number);
                const line = currentSections[si]?.querySelectorAll(":scope > .song-line")?.[li];
                if (line) applyLineEdit(line, chordLayouts[key], lyricLayouts[key]);
            });

            document.dispatchEvent(new CustomEvent("worshiphub:song-layout-saved"));
            panel.remove();
            if (window.WorshipHubSongRuntime?.updateAll) window.WorshipHubSongRuntime.updateAll();
            alert("Song lyrics and chord positions saved successfully.");
        } catch (e) {
            console.error("Save song edit failed:", e);
            const code = e?.code || "unknown";
            const detail = code === "permission-denied"
                ? "Firebase denied the write. Deploy the included firestore.rules and make sure you are signed in as the administrator."
                : (e?.message || "Unknown Firebase error.");
            alert(`Unable to save the song.\n\n${detail}`);
        } finally {
            btn.disabled = false;
        }
    };
}

async function refreshEditorAccess(user) {
    const button = document.getElementById("editSongBtn");
    if (button && !isAdmin(user)) button.remove();
    if (isAdmin(user)) addEditButton();
}

onAuthStateChanged(auth, async user => {
    await loadSavedLayout();
    await refreshEditorAccess(user);
});

document.addEventListener("DOMContentLoaded", async () => {
    await loadSavedLayout();
    await refreshEditorAccess(auth.currentUser);
});

window.WorshipHubSongEditor = { openEditor, canEdit: canEditSongs };
