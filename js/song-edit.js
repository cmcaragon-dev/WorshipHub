import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { canEditSongs, isAdmin } from "./admin-settings.js";


function slug() {
    const path = location.pathname.split("/").pop() || "";
    return path.replace(/\.html$/i, "") || String(window.currentSong?.id || "song");
}

async function canEdit(user) {
    return canEditSongs(user);
}

function getSourceLines() {
    const root = document.getElementById("lyrics");
    if (!root) return [];
    return [...root.querySelectorAll(":scope > .song-section")].flatMap((section, sectionIndex) =>
        [...section.querySelectorAll(":scope > .song-line")].map((line, lineIndex) => {
            const chords = [...line.querySelectorAll(":scope > .chord")];
            const lastChord = chords[chords.length - 1];
            let chordLayout = "";
            if (lastChord) {
                const range = document.createRange();
                range.setStart(line, 0);
                range.setEndAfter(lastChord);
                chordLayout = range.cloneContents().textContent || "";
            }
            const lyricText = [...line.childNodes]
                .filter(n => !chords.includes(n) && !(n.nodeType === 3 && !n.nodeValue?.trim() && chordLayout.includes(n.nodeValue || "")))
                .map(n => n.nodeType === 3 ? n.nodeValue : "")
                .join("")
                .trim();
            return { sectionIndex, lineIndex, line, chordLayout, lyricText };
        })
    );
}

async function loadSavedLayout() {
    try {
        const snap = await getDoc(doc(db, "songs", slug()));
        if (!snap.exists()) return;
        const data = snap.data();
        const layouts = data.chordLayouts || {};
        const sections = [...document.querySelectorAll("#lyrics > .song-section")];
        Object.entries(layouts).forEach(([key, layout]) => {
            const [si, li] = key.split(":").map(Number);
            const line = sections[si]?.querySelectorAll(":scope > .song-line")?.[li];
            if (!line) return;
            applyChordLayout(line, String(layout));
        });
        document.dispatchEvent(new CustomEvent("worshiphub:song-layout-loaded"));
    } catch (e) {
        console.warn("Could not load saved chord layout:", e);
    }
}

function applyChordLayout(line, layout) {
    const nodes = [...line.childNodes];
    const chordNodes = nodes.filter(n => n.nodeType === 1 && n.classList?.contains("chord"));
    const lyric = nodes.filter(n => n.nodeType === 3).map(n => n.nodeValue || "").join("").trim();
    line.innerHTML = "";
    const chordSpan = document.createElement("span");
    chordSpan.className = "chord";
    chordSpan.dataset.layoutChord = "true";
    chordSpan.textContent = layout;
    line.appendChild(chordSpan);
    if (lyric) line.appendChild(document.createTextNode("\n" + lyric));
}

function addEditButton() {
    if (document.getElementById("editSongBtn")) return;
    const toolbar = document.querySelector(".song-toolbar");
    if (!toolbar) return;
    const btn = document.createElement("button");
    btn.id = "editSongBtn";
    btn.type = "button";
    btn.textContent = "✎ Edit Song";
    btn.className = "song-edit-btn";
    btn.title = "Edit chord spacing and position";
    btn.addEventListener("click", openEditor);
    toolbar.insertBefore(btn, toolbar.querySelector("#presentationBtn") || toolbar.lastElementChild);
}

function openEditor() {
    const root = document.getElementById("lyrics");
    if (!root) return;
    let panel = document.getElementById("songChordEditor");
    if (!panel) {
        panel = document.createElement("div");
        panel.id = "songChordEditor";
        panel.className = "song-chord-editor";
        document.body.appendChild(panel);
    }

    const sections = [...root.querySelectorAll(":scope > .song-section")];
    panel.innerHTML = `
      <div class="song-chord-editor-card">
        <div class="song-chord-editor-head">
          <div><strong>Edit Song Chords</strong><small>Move chords by adding/removing spaces. Lyrics are read-only.</small></div>
          <button type="button" id="closeChordEditor">×</button>
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
            const chords = [...line.querySelectorAll(":scope > .chord")];
            if (!chords.length) return;
            const range = document.createRange();
            range.setStart(line, 0);
            range.setEndAfter(chords[chords.length - 1]);
            const layout = range.cloneContents().textContent || "";
            const lyric = [...line.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue || "").join("").trim();
            const wrap = document.createElement("div");
            wrap.className = "chord-editor-row";
            wrap.dataset.key = `${si}:${li}`;
            wrap.innerHTML = `
              <div class="chord-editor-label">CHORDS — edit spaces to move the chords</div>
              <textarea class="chord-layout-input" spellcheck="false" aria-label="Chord position"></textarea>
              <div class="chord-editor-label lyric-label">LYRICS — reference only</div>
              <div class="chord-editor-lyric" aria-readonly="true"></div>
              <div class="chord-editor-guide">The chord line above corresponds directly to the lyric line below.</div>`;
            wrap.querySelector("textarea").value = layout.replace(/\n+$/,"");
            wrap.querySelector(".chord-editor-lyric").textContent = lyric;
            rows.appendChild(wrap);
        });
    });

    panel.querySelector("#closeChordEditor").onclick = () => panel.remove();
    panel.querySelector("#cancelChordEdit").onclick = () => panel.remove();
    panel.querySelector("#saveChordEdit").onclick = async () => {
        const layouts = {};
        panel.querySelectorAll(".chord-editor-row").forEach(row => {
            layouts[row.dataset.key] = row.querySelector("textarea").value;
        });
        const user = auth.currentUser;
        if (!user || !(await canEdit(user))) {
            alert("You do not have permission to edit songs.");
            return;
        }
        const btn = panel.querySelector("#saveChordEdit");
        btn.disabled = true;
        try {
            const songId = String(window.currentSong?.id || slug());
            const songRef = doc(db, "songs", songId);
            await setDoc(songRef, {
                id: songId,
                title: window.currentSong?.title || document.title,
                artist: window.currentSong?.artist || "",
                slug: slug(),
                chordLayouts: layouts,
                updatedAt: serverTimestamp(),
                updatedBy: user.email || user.uid,
                updatedByUid: user.uid,
                chordLayoutVersion: 2
            }, { merge: true });

            sections.forEach((section, si) => {
                [...section.querySelectorAll(":scope > .song-line")].forEach((line, li) => {
                    const key = `${si}:${li}`;
                    if (Object.prototype.hasOwnProperty.call(layouts, key)) applyChordLayout(line, layouts[key]);
                });
            });
            document.dispatchEvent(new CustomEvent("worshiphub:song-layout-saved"));
            panel.remove();
            if (window.WorshipHubSongRuntime?.updateAll) window.WorshipHubSongRuntime.updateAll();
            alert("Song chord positions saved.");
        } catch (e) {
            console.error("Save song chord layout failed:", e);
            const code = e?.code || "unknown";
            const detail = code === "permission-denied"
                ? "Firebase denied this write. Deploy the included firestore.rules and make sure you are signed in as the administrator or have Edit Song permission."
                : (e?.message || "Unknown Firebase error.");
            alert(`Unable to save the song.\n\n${detail}`);
        } finally {
            btn.disabled = false;
        }
    };
}

onAuthStateChanged(auth, async user => {
    await loadSavedLayout();
    if (await canEdit(user)) addEditButton();
});

document.addEventListener("DOMContentLoaded", async () => {
    await loadSavedLayout();
    if (await canEdit(auth.currentUser)) addEditButton();
});

window.WorshipHubSongEditor = { openEditor, canEdit };
