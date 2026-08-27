"use strict";

import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { isAdmin } from "./admin-settings.js";

const SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const FLATS = { Db:"C#", Eb:"D#", Gb:"F#", Ab:"G#", Bb:"A#" };
let song = null, transposeSteps = 0, fontSize = 0, service = null, index = 0, authResolved = false, loading = false, autoPresentationStarted = false;

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


/* Transpose every chord token while preserving the exact spaces/positions. */
function transposeChordLayout(layout, steps = transposeSteps) {
    const source = String(layout || "");
    return source.replace(/[A-Ga-g](?:#|b)?(?:m|maj|min|dim|aug|sus|add)?\d*(?:\/[A-Ga-g](?:#|b)?)?/g, token => {
        if (!/^[A-Ga-g]/.test(token)) return token;
        return transposeChord(token, steps);
    });
}

function normalizeChord(chord, index = 0) {
    if (typeof chord === "string") return { id:`chord-${index}`, chord:chord.trim(), originalChord:chord.trim(), position:0 };
    const value = String(chord?.originalChord || chord?.chord || chord?.value || "").trim();
    return { ...chord, id: chord?.id || `chord-${index}`, chord:value, originalChord:value, position:Math.max(0, Number(chord?.position) || 0) };
}

function chordLayoutFromChords(line) {
    const chords = Array.isArray(line?.chords) ? [...line.chords] : [];
    if (!chords.length) return String(line?.chordLayout || "");
    chords.sort((a,b) => Number(a?.position || 0) - Number(b?.position || 0));
    let out = "", cursor = 0;
    chords.forEach(ch => {
        const value = String(ch?.originalChord || ch?.chord || ch?.value || "").trim();
        if (!value) return;
        const position = Math.max(cursor, Number(ch?.position) || 0);
        out += " ".repeat(Math.max(0, position - cursor)) + value;
        cursor = position + value.length;
    });
    return out;
}

function normalizeSections(raw) {
    return (Array.isArray(raw) ? raw : []).map(section => ({
        ...section,
        lines:(Array.isArray(section?.lines) ? section.lines : []).map(line => {
            const chords = (Array.isArray(line?.chords) ? line.chords : []).map(normalizeChord);
            return {
                ...line,
                lyrics:String(line?.lyrics || ""),
                chords,
                chordLayout:String(line?.chordLayout ?? chordLayoutFromChords({...line, chords}))
            };
        })
    }));
}

function currentKey(){ return song?.originalKey || song?.key || song?.serviceKey || ""; }

function parseChordTokens(layout) {
    const source = String(layout || "");
    const tokenRe = /\S+/g;
    const result = [];
    let match;
    while ((match = tokenRe.exec(source))) {
        const token = match[0].replace(/[|,;]+$/g, "");
        if (!/^[A-Ga-g](?:#|b)?(?:m|maj|maj7|min|min7|dim|dim7|aug|sus|add)?\d*(?:\/[A-Ga-g](?:#|b)?)?$/.test(token)) continue;
        result.push({ token, position: match.index });
    }
    return result;
}

function chordLayerMarkup(layout) {
    const tokens = parseChordTokens(layout);
    if (!tokens.length) return "";
    return tokens.map(({token, position}) =>
        `<span class="chord-token" data-chord-position="${position}" style="--chord-pos:${position}">${esc(transposeChord(token, transposeSteps))}</span>`
    ).join("");
}

function renderSourceLyrics(sections) {
    const source = document.getElementById("lyrics");
    if (!source) return;
    source.innerHTML = sections.map(section => `
        <section class="song-section">
            <div class="section-title">${esc(section.type || "SECTION")} ${esc(section.number || "")}</div>
            ${(section.lines || []).map(line => {
                const layout = String(line.chordLayout ?? "");
                return `<div class="song-line"><span class="chord" data-layout-chord="true">${esc(layout)}</span>${esc(line.lyrics || "")}</div>`;
            }).join("")}
        </section>
    `).join("");
}

function applyExactCustomChordPositions() {
    const stage = document.getElementById("stage");
    if (!stage) return;
    stage.querySelectorAll(".line").forEach(line => {
        const lyric = line.querySelector(":scope > .lyrics");
        const chordLayer = line.querySelector(":scope > .chords > .chord-layer");
        if (!lyric || !chordLayer) return;
        const cs = getComputedStyle(lyric);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const charWidth = ctx.measureText("0").width || parseFloat(cs.fontSize) * 0.6;
        chordLayer.style.position = "relative";
        chordLayer.style.height = "0.70em";
        line.querySelectorAll(".chord-token").forEach(token => {
            const pos = Number(token.dataset.chordPosition || token.style.getPropertyValue("--chord-pos") || 0);
            // Preserve the exact character-grid X position entered in Add Song.
            // Use a CSS variable instead of the chord font's 1ch unit so the
            // smaller chord font can never move the chord horizontally.
            token.style.setProperty("--chord-x", `${Math.max(0, pos) * charWidth}px`);
            token.style.setProperty("--chord-pos", String(Math.max(0, pos)));
            token.style.top = "0";
        });
    });
}

function render() {
    if (!song) return;
    document.getElementById("songTitle")?.replaceChildren(document.createTextNode(song.title || "Untitled Song"));
    document.getElementById("songArtist")?.replaceChildren(document.createTextNode(song.artist || ""));
    const key = document.getElementById("songKey");
    if (key) key.textContent = transposeChord(currentKey(), transposeSteps) || "—";

    const stage = document.getElementById("stage");
    if (!stage) return;
    const sections = normalizeSections(song.sections);
    if (!sections.length) {
        stage.innerHTML = '<div class="empty">This song has no structured lyrics yet.</div>';
        renderSourceLyrics([]);
        updateCounter();
        return;
    }

    const lyricSize = `calc(clamp(21px, 1.8vw, 31px) + ${fontSize}px)`;
    stage.innerHTML = sections.map((section, si) => `
        <section class="section" data-section-index="${si}">
            <div class="section-title">${esc(section.type)} ${esc(section.number || "")}</div>
            ${(section.lines || []).map((line, li) => {
                const layout = String(line.chordLayout ?? "");
                return `
                <div class="line" data-section-index="${si}" data-line-index="${li}" style="--line-font-size:${lyricSize}">
                    <div class="chords" aria-label="Chords above lyrics" style="--line-font-size:${lyricSize}"><div class="chord-layer">${chordLayerMarkup(layout)}</div></div>
                    <div class="lyrics" style="font-size:${lyricSize}">${esc(line.lyrics || "")}</div>
                </div>`;
            }).join("")}
        </section>`).join("");

    // Keep the exact character positions entered by the admin in a standard
    // .chord span source. The common presentation runtime reads this source.
    renderSourceLyrics(sections);
    // Position each chord from the lyric font's actual character width.
    // This keeps the admin-entered horizontal position exact even though
    // chords are intentionally rendered smaller than lyrics.
    requestAnimationFrame(applyExactCustomChordPositions);
    window.currentSong = song;
    updateCounter();

    // If this custom song was opened from a Service Planner, use the exact
    // same presentation runtime/features as the 45 built-in HTML songs.
    if (localStorage.getItem("currentServiceId") && !autoPresentationStarted) {
        autoPresentationStarted = true;
        setTimeout(() => {
            if (typeof window.startPresentation === "function" && !document.getElementById("presentationScreen")?.classList.contains("show")) {
                window.startPresentation();
            }
        }, 180);
    }
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
    if(file) window.location.assign(`/WorshipHub/songs/${encodeURIComponent(file)}`);
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
    transposeSteps=Number(song.transpose||0); render(); loading=false;
}

function bindControls(){
    document.getElementById("plus")?.addEventListener("click",()=>{fontSize=Math.min(12,fontSize+1);render();});
    document.getElementById("minus")?.addEventListener("click",()=>{fontSize=Math.max(0,fontSize-1);render();});
    document.getElementById("up")?.addEventListener("click",()=>setTranspose(1));
    document.getElementById("down")?.addEventListener("click",()=>setTranspose(-1));
    document.getElementById("homeBtn")?.addEventListener("click",()=>window.location.assign("index.html"));
    document.getElementById("themeBtn")?.addEventListener("click",()=>{
        document.body.classList.toggle("dark-custom");
        const b=document.getElementById("themeBtn");
        if(b) b.textContent=document.body.classList.contains("dark-custom") ? "☀ Light" : "☾ Dark";
    });
    document.getElementById("presentationBtn")?.addEventListener("click",()=>{
        if (typeof window.startPresentation === "function") window.startPresentation();
        else alert("Presentation is still loading. Please try again.");
    });
    document.getElementById("editBtn")?.addEventListener("click",openCustomEditor);
    document.getElementById("prev")?.addEventListener("click",()=>{if(!service||index<=0)return;index--;localStorage.setItem("currentSongIndex",String(index));redirectSong(service.songs[index]);});
    document.getElementById("next")?.addEventListener("click",()=>{if(!service||index>=service.songs.length-1)return;index++;localStorage.setItem("currentSongIndex",String(index));redirectSong(service.songs[index]);});
    if(!isAdmin(auth.currentUser)){ const b=document.getElementById("editBtn"); if(b)b.style.display="none"; }
}

function openCustomEditor(){
    if(!isAdmin(auth.currentUser)){alert("Only the administrator can edit songs.");return;}
    if(!song)return;
    let overlay=document.getElementById("customEditor");
    if(overlay) overlay.remove();
    overlay=document.createElement("div"); overlay.id="customEditor"; overlay.className="custom-editor-overlay";
    const sections=normalizeSections(song.sections);
    overlay.innerHTML=`<div class="custom-editor-card">
      <h2>Edit Chords & Lyrics</h2>
      <div class="custom-editor-note">Put the chord line above the lyrics. Spaces are preserved exactly as typed, so the chord position will not be automatically moved.</div>
      <div id="customEditorRows"></div>
      <div class="custom-editor-actions"><button id="customCancel">Cancel</button><button id="customSave" class="primary">Save Changes</button></div>
    </div>`;
    const rows=overlay.querySelector("#customEditorRows");
    sections.forEach((sec,si)=>{
      const h=document.createElement("div");h.className="custom-edit-section";h.textContent=`${sec.type||"SECTION"} ${sec.number||""}`;rows.appendChild(h);
      (sec.lines||[]).forEach((line,li)=>{
        const key=`${si}:${li}`, row=document.createElement("div");row.className="custom-edit-row";row.dataset.key=key;
        const chordLabel=document.createElement("div"); chordLabel.className="custom-edit-label"; chordLabel.textContent="CHORDS — type spaces exactly where the chord should sit";
        const chord=document.createElement("textarea");chord.className="custom-chord";chord.value=String(line.chordLayout||"");chord.placeholder="D          F#m      Bm";
        const lyricLabel=document.createElement("div"); lyricLabel.className="custom-edit-label"; lyricLabel.textContent="LYRICS — this line is directly below the chord line";
        const lyric=document.createElement("textarea");lyric.className="custom-lyric";lyric.value=String(line.lyrics||"");lyric.placeholder="Lyrics";
        row.append(chordLabel,chord,lyricLabel,lyric);rows.appendChild(row);
      });
    });
    overlay.querySelector("#customCancel").onclick=()=>overlay.remove();
    overlay.querySelector("#customSave").onclick=async()=>{
      const user=auth.currentUser;
      if(!user||!isAdmin(user)){alert("Only the administrator can edit songs.");return;}
      const updated=normalizeSections(song.sections).map(s=>({...s,lines:s.lines.map(l=>({...l}))}));
      overlay.querySelectorAll(".custom-edit-row").forEach(row=>{
        const [si,li]=row.dataset.key.split(":").map(Number);
        if(updated[si]?.lines?.[li]){
          updated[si].lines[li].chordLayout=row.querySelector(".custom-chord").value;
          updated[si].lines[li].lyrics=row.querySelector(".custom-lyric").value;
        }
      });
      const save=overlay.querySelector("#customSave");save.disabled=true;
      try{
        const id=String(song.id||new URLSearchParams(location.search).get("id")||"");
        await setDoc(doc(db,"songs",id),{...song,sections:updated,updatedAt:serverTimestamp(),updatedBy:user.email||user.uid},{merge:true});
        song={...song,sections:updated};render();overlay.remove();alert("Song saved successfully.");
      }catch(e){console.error(e);alert(`Unable to save the song. ${e?.message||""}`);}
      finally{save.disabled=false;}
    };
    document.body.appendChild(overlay);
}

document.addEventListener("DOMContentLoaded",()=>{bindControls();load();});
onAuthStateChanged(auth,async()=>{authResolved=true;if(!song) await load();});

window.transposeChordLayout = transposeChordLayout;
window.WorshipHubCustomSong={transposeChordLayout,transposeUp:()=>setTranspose(1),transposeDown:()=>setTranspose(-1),getTranspose:()=>transposeSteps,getSong:()=>song,reload:()=>{song=null;service=null;loading=false;load();}};
