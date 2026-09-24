/* CHORDIO PHASE 5 — session-state reliability and Service Planner cleanup */

"use strict";

/* =====================================
   FIREBASE
===================================== */

import { auth, db } from "./firebase.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    doc,
    getDoc,
    collection,
    getDocs,
    setDoc,
    deleteDoc,
    serverTimestamp,
    increment,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
    loadServices,
    saveService,
    saveServices,
    deleteServiceCloud
} from "./firestore.js";

import { songs } from "./initial-songs.js";
window.songs = songs;

// =====================================
// CUSTOM SONG LIBRARY SYNC
// =====================================
function syncCustomSongsIntoLibrary() {
    try {
        const saved = JSON.parse(localStorage.getItem("worshipHubCustomSongs") || "[]");
        if (!Array.isArray(saved)) return;
        saved.forEach(customSong => {
            if (!customSong || !customSong.id) return;
            if (getDeletedSongIds().has(String(customSong.id)) || isDeletedSongTitle(customSong.title)) return;
            const existingIndex = songs.findIndex(s => String(s.id) === String(customSong.id));
            if (existingIndex >= 0) songs[existingIndex] = customSong;
            else songs.push(customSong);
        });
    } catch (error) {
        console.warn("Unable to sync custom songs:", error);
    }
}


// =====================================
// SONG LIBRARY QUALITY / SELAH REPAIR
// =====================================
const SONG_LIBRARY_REPAIR_VERSION = "2026-09-24-v4-fast-library";
const FIREBASE_SONG_CACHE_KEY = "chordioSharedSongLibraryCacheV1";
const TAGALOG_WORDS = ["ang","ng","mga","ako","ikaw","siya","atin","ating","aming","mo","ko","ka","sa","kay","para","hindi","wala","may","ito","iyon","bawat","lahat","puso","pag","panginoon","hesus","salamat","pag-ibig","kanya","inyong","aking","buhay","ganda","umaawit","awit","puri","magpuri","dakila","banal","kamay","umawit","ligaya","ngiti","ginawa","pag-ibig"];
const PRAISE_WORDS = ["praise","praising","rejoice","celebrate","celebration","shout","dance","hallelujah","glory","victory","joy"];
const WORSHIP_WORDS = ["worship","holy","presence","surrender","adore","adoration","bow","kneel","majesty","faithful","lord","jesus","savior","saviour","cross","sacrifice","love"];
function repairClean(v){return String(v??"").replace(/\u00a0/g," ").replace(/\r/g,"").trim();}
function repairChordOnly(v){
    const t=repairClean(v); if(!t)return false;
    const tokens=t.split(/\s+/).filter(Boolean); if(!tokens.length||tokens.length>28)return false;
    const re=/^(?:[A-G](?:#|b)?(?:m|maj|min|sus|add|dim|aug|7|9|11|13|6|4|5|2|\+|-)*(?:\/[A-G](?:#|b)?)?|N\.?C\.?|\(\d+x\)|\((?:break|repeat)\)|[–—-])$/i;
    return tokens.every(x=>re.test(x));
}
function repairChordTokens(text){
    return repairClean(text).split(/\s+/).filter(Boolean).map((chord,i)=>({id:`repair-chord-${Date.now()}-${i}-${Math.random().toString(36).slice(2,6)}`,chord:chord.replace(/[–—]/g,"-"),originalChord:chord.replace(/[–—]/g,"-"),position:0}));
}
function repairHeading(v){
    const t=repairClean(v).replace(/^\[|\]$/g,"").replace(/[:\-]+$/g,"").trim();
    const m=t.match(/^(intro(?:duction)?|verse|v\.?\s*\d*|chorus|koro|pre[- ]?(?:chorus|koro)|bridge|tag|instrumental|interlude|outro|ending|end|coda|refrain|ending chorus)\s*(?:#|[- ]*)?(\d+)?$/i);
    if(!m)return null;
    const raw=m[1].toLowerCase().replace(/\s+/g," "); let type="Verse";
    if(/^intro/.test(raw))type="Intro"; else if(/^chorus$|^koro$|^refrain$|ending chorus/.test(raw))type="Chorus"; else if(/^pre/.test(raw))type="Pre-Chorus"; else if(/^bridge/.test(raw))type="Bridge"; else if(/^tag/.test(raw))type="Tag"; else if(/^instrumental/.test(raw))type="Instrumental"; else if(/^interlude/.test(raw))type="Interlude"; else if(/^outro|^ending|^end|^coda/.test(raw))type="Outro";
    return {type,number:Number(m[2])||1};
}
function rebuildSectionsFromSource(song){
    const html=String(song?.sourceHtmlPreserved||""); if(!html||!/<(?:p|br)\b/i.test(html))return null;
    const doc=new DOMParser().parseFromString(html,"text/html");
    const nodes=[...doc.querySelectorAll("p")]; const blocks=nodes.length?nodes:[...doc.body.children]; const lines=[];
    for(const el of blocks){
        const clone=el.cloneNode(true); clone.querySelectorAll("br").forEach(br=>br.replaceWith("\n"));
        String(clone.textContent||"").replace(/\u00a0/g," ").replace(/\r/g,"").split("\n").forEach(raw=>{const v=raw.trimEnd(); if(repairClean(v))lines.push(v);});
    }
    const sections=[]; let current=null; const counts={};
    const add=(type,num)=>{counts[type]=(counts[type]||0)+1; current={id:`repair-section-${Date.now()}-${sections.length}`,type,number:num||counts[type],lines:[]};sections.push(current);};
    for(let i=0;i<lines.length;i++){
        let line=lines[i], heading=repairHeading(line); if(heading){add(heading.type,heading.number);continue;}
        if(!current)add("Verse",1);
        if(/^\(?no\s+lyrics\)?$/i.test(repairClean(line))||/^\(?no\s+chords\)?$/i.test(repairClean(line)))continue;
        // Common bad import pattern: a chord row was stored as lyrics, followed by a placeholder.
        if(repairChordOnly(line) && i+1<lines.length && !repairChordOnly(lines[i+1]) && !/^\(?no\s+(?:lyrics|chords)\)?$/i.test(repairClean(lines[i+1]))){
            const lyric=lines[++i].trim(); current.lines.push({id:`repair-line-${Date.now()}-${i}`,lyrics:lyric,chordText:line,chords:repairChordTokens(line)}); continue;
        }
        // If a chord-only row is followed by NO LYRICS and then a real lyric, keep the chord row and pair it.
        if(repairChordOnly(line) && i+2<lines.length && /^\(?no\s+lyrics\)?$/i.test(repairClean(lines[i+1])) && !repairChordOnly(lines[i+2])){
            const lyric=lines[i+2].trim(); i+=2; current.lines.push({id:`repair-line-${Date.now()}-${i}`,lyrics:lyric,chordText:line,chords:repairChordTokens(line)}); continue;
        }
        // If the imported lyric field itself contains only chords, move it to chordText.
        if(repairChordOnly(line)) current.lines.push({id:`repair-line-${Date.now()}-${i}`,lyrics:"",chordText:line,chords:repairChordTokens(line)});
        else current.lines.push({id:`repair-line-${Date.now()}-${i}`,lyrics:line,chordText:"",chords:[]});
    }
    const cleaned=sections.filter(sec=>sec.lines.some(l=>repairClean(l.lyrics)||repairClean(l.chordText)));
    return cleaned.length?cleaned:null;
}
function detectSongLanguage(song,pageHtml=""){
    const page=String(pageHtml||"").toLowerCase();
    if(/song-category-tagalog|\btagalog\b|\bfilipino\b/.test(page))return "Tagalog";
    if(/song-category-english|\benglish\b/.test(page))return "English";
    const text=[song?.title,song?.sourceHtmlPreserved,...(song?.sections||[]).flatMap(s=>(s.lines||[]).map(l=>l?.lyrics||""))].join(" ").toLowerCase();
    const words=(text.match(/[a-záéíóúñ'-]+/g)||[]);
    let tag=0, eng=0;
    words.forEach(w=>{if(TAGALOG_WORDS.includes(w))tag++;});
    // Strong Filipino/Tagalog function words and common worship vocabulary.
    ["ang","ng","mga","ako","ikaw","sa","kay","para","hindi","wala","ito","iyon","bawat","lahat","puso","pag","panginoon","hesus","salamat","kanya","inyong","aking","buhay","umaawit","awit","puri","magpuri","dakila","banal","kamay","umawit","ligaya","ngiti","ginawa","pag-ibig"].forEach(w=>{if(words.includes(w))tag+=0.75;});
    ["the","and","your","you","lord","jesus","god","holy","love","heart","my","me","we","our","i","is","are","to","of","in","with"].forEach(w=>{if(words.includes(w))eng+=0.2;});
    return tag>eng && tag>=2 ? "Tagalog" : "English";
}
function detectSongCategory(song,pageHtml=""){
    const page=String(pageHtml||"").toLowerCase();
    // Prefer an explicit category/tag/class on the source page.
    if(/(?:category|class|tag|genre)[^\n]{0,120}\bpraise\b|song-category-praise|\bpraise[-_ ]song\b/.test(page))return "Praise";
    if(/(?:category|class|tag|genre)[^\n]{0,120}\bworship\b|song-category-worship|\bworship[-_ ]song\b/.test(page))return "Worship";
    const text=[song?.title,song?.sourceHtmlPreserved,...(song?.sections||[]).flatMap(s=>(s.lines||[]).map(l=>l?.lyrics||""))].join(" ").toLowerCase();
    const p=PRAISE_WORDS.reduce((n,w)=>n+(text.match(new RegExp(`\\b${w}\\b`,"g"))||[]).length,0);
    const w=WORSHIP_WORDS.reduce((n,x)=>n+(text.match(new RegExp(`\\b${x}\\b`,"g"))||[]).length,0);
    // Clear action/celebration language is generally praise; surrender/adore/holy/presence language is generally worship.
    return p>w ? "Praise" : "Worship";
}
function cleanExtractedArtist(v){
    let x=repairClean(v).replace(/^(?:by|artist|singer|performed\\s+by|song\\s+by|originally\\s+by)\\s*[:\\-]?\\s*/i,"").trim();
    x=x.replace(/^(?:lyrics|chords|key|song)\\s*[:\\-]?\\s*/i,"").trim();
    if(!x||x.length>120)return "";
    if(/^(?:selah|songs?|lyrics?|chords?|key|home|menu|search|share|copyright|admin|login|register|tagalog|english|praise|worship)$/i.test(x))return "";
    return x;
}
function extractArtistFromSelahHtml(pageHtml,title){
    if(!pageHtml)return "";
    const doc=new DOMParser().parseFromString(String(pageHtml),"text/html");
    const target=repairClean(title).toLowerCase();
    const candidates=[];
    for(const sel of ['[data-artist]','[data-artist-name]','[itemprop="byArtist"]','[itemprop="artist"]','[class*="song-artist"]','[class*="artist-name"]','[class*="artist"]','[id*="artist"]','meta[name="artist"]','meta[property="music:musician"]']){
        for(const el of [...doc.querySelectorAll(sel)]){
            candidates.push(el.getAttribute("data-artist")||el.getAttribute("data-artist-name")||el.getAttribute("content")||el.textContent||"");
        }
    }
    // JSON-LD is common on WordPress music pages.
    for(const script of [...doc.querySelectorAll('script[type="application/ld+json"]')]){
        try{
            const raw=JSON.parse(script.textContent||"null");
            const arr=Array.isArray(raw)?raw:[raw];
            for(const item of arr){
                const by=item?.byArtist||item?.artist||item?.performer;
                const vals=Array.isArray(by)?by:[by];
                vals.forEach(v=>candidates.push(v?.name||v?.url||v||""));
            }
        }catch(_){ }
    }
    for(const v of candidates){const a=cleanExtractedArtist(v);if(a&&a.toLowerCase()!==target)return a;}
    const hs=[...doc.querySelectorAll("h1,h2,h3")];
    const h=hs.find(el=>repairClean(el.textContent).toLowerCase()===target)||hs.find(el=>repairClean(el.textContent).toLowerCase().includes(target));
    if(h){let n=h;for(let d=0;d<4&&n;d++,n=n.parentElement){for(const el of [...n.children]){const a=cleanExtractedArtist(el.textContent||"");if(a&&a.toLowerCase()!==target&&!/^(?:key|verse|chorus|bridge|intro|outro|lyrics|chords)\b/i.test(a))return a;}}}
    return "";
}
async function fetchRepairPage(url){
    const targets=[String(url||""),`https://r.jina.ai/http://${String(url||"").replace(/^https?:\\/\\//,"")}`,`https://r.jina.ai/${String(url||"")}`];
    for(const target of targets){try{const r=await fetch(target,{mode:"cors",credentials:"omit",cache:"no-store"});if(r.ok){const t=await r.text();if(t&&t.length>200)return t;}}catch(_){} }
    return "";
}
async function repairSongLibrary(records){
    const source=Array.isArray(records)?records.filter(Boolean):[];
    const updated=[];
    // Check source pages in small parallel batches so a 477-song library does not take several minutes.
    const pageMap=new Map();
    const webSongs=source.filter(s=>s?.sourceUrl);
    for(let i=0;i<webSongs.length;i+=8){
        const batch=webSongs.slice(i,i+8);
        const results=await Promise.all(batch.map(async s=>[String(s.id),await fetchRepairPage(String(s.sourceUrl))]));
        results.forEach(([id,page])=>pageMap.set(id,page));
    }
    for(const original of source){
        const s={...original};
        const page=pageMap.get(String(s.id))||"";
        const rebuilt=rebuildSectionsFromSource(s);
        if(rebuilt){s.sections=rebuilt;s.structuredVersion=2;s.contentVersion=2;}
        if(page){
            const artist=extractArtistFromSelahHtml(page,s.title);
            if(artist)s.artist=artist;
        }
        // Normalize every song, not only Selah songs.
        s.language=detectSongLanguage(s,page);
        s.category=detectSongCategory(s,page);
        updated.push(s);
    }
    const sorted=[...updated].sort((a,b)=>String(a.title||"").localeCompare(String(b.title||""),undefined,{sensitivity:"base",numeric:true}));
    const numberById=new Map(sorted.map((s,i)=>[String(s.id),i+1]));
    updated.forEach(s=>{const n=numberById.get(String(s.id));if(n)s.songNumber=n;});
    return {songs:updated,changed:updated.length,total:updated.length};
}
async function seedBundledSongsToSharedFirebase(){
    if(!auth.currentUser || !canManageSongs) return false;
    try{
        const snap=await getDocs(collection(db,"songs"));
        const existing=new Set();
        snap.forEach(d=>{const data=d.data()||{};if(data.deletedSong!==true && !String(d.id).startsWith(DELETED_SONG_DOC_PREFIX)) existing.add(String(data.id||d.id));});
        const missingOrBundled=songs.filter(s=>s&&s.id&&!existing.has(String(s.id))&&!isAnyDeletedSong(s));
        // Only add missing bundled songs. Existing Firebase documents remain the shared master copy
        // and are normalized by the repair pass below, preventing stale bundled data from overwriting edits.
        for(let start=0;start<missingOrBundled.length;start+=400){
            const batch=writeBatch(db);
            for(const s of missingOrBundled.slice(start,start+400)){
                batch.set(doc(db,"songs",String(s.id)),{...s,customSong:true,updatedAt:serverTimestamp()},{merge:false});
            }
            await batch.commit();
        }
        return true;
    }catch(error){console.warn("Unable to seed bundled songs to shared Firebase library:",error);return false;}
}
async function runSongLibraryRepairIfNeeded(force=false){
    if(!force && localStorage.getItem("chordioSongLibraryRepairVersion")==SONG_LIBRARY_REPAIR_VERSION)return;
    try{
        // Read the shared master first. This is what makes the same song data visible to every account.
        if(auth.currentUser) await syncAllSongDocumentsIntoLibrary();
        const repaired=await repairSongLibrary(songs);
        repaired.songs.forEach(s=>{const i=songs.findIndex(x=>String(x.id)===String(s.id));if(i>=0)songs[i]=s;else songs.push(s);});
        try{localStorage.setItem("worshipHubCustomSongs",JSON.stringify(songs.filter(s=>s.customSong)));}catch(_){ }
        if(auth.currentUser && repaired.songs.length){
            for(let start=0;start<repaired.songs.length;start+=400){const batch=writeBatch(db);for(const s of repaired.songs.slice(start,start+400))batch.set(doc(db,"songs",String(s.id)),{...s,customSong:true,updatedAt:serverTimestamp()},{merge:true});await batch.commit();}
        }
        localStorage.setItem("chordioSongLibraryRepairVersion",SONG_LIBRARY_REPAIR_VERSION);
        if(typeof renderSongs==="function")renderSongs(songs);
        if(typeof renderAllSongsTable==="function")renderAllSongsTable(songs);
        console.info(`CHORDIO shared Song Library repair complete: ${repaired.total} songs normalized, categorized and numbered.`);
        return repaired;
    }catch(error){console.warn("CHORDIO Song Library repair skipped/failed:",error);return null;}
}

function hasStructuredLyrics(song){
    return !!(song && Array.isArray(song.sections) && song.sections.some(section => Array.isArray(section?.lines) && section.lines.length > 0));
}

const DELETED_SONGS_KEY = "worshipHubDeletedSongIds";
const DELETED_SONG_TITLES_KEY = "worshipHubDeletedSongTitles";
const DELETED_SONG_DOC_PREFIX = "__deleted_song__";
let firebaseDeletedSongTitles = new Set();
let songsReady = false;
let songsSyncInProgress = false;

function deletedSongDocId(titleKey){
    return DELETED_SONG_DOC_PREFIX + encodeURIComponent(String(titleKey || ""));
}

function isFirebaseDeletedTitle(title){
    const key = normalizeDeletedSongTitle(title);
    return !!key && firebaseDeletedSongTitles.has(key);
}

function isAnyDeletedSong(song){
    return getDeletedSongIds().has(String(song?.id || ""))
        || isDeletedSongTitle(song?.title)
        || isFirebaseDeletedTitle(song?.title);
}

async function loadFirebaseDeletedSongTitles(snapshot = null){
    firebaseDeletedSongTitles = new Set();
    try{
        const snap = snapshot || await getDocs(collection(db, "songs"));
        snap.forEach(docSnap => {
            const data = docSnap.data() || {};
            if(data.deletedSong === true || String(docSnap.id).startsWith(DELETED_SONG_DOC_PREFIX)){
                const key = normalizeDeletedSongTitle(data.titleKey || data.title);
                if(key) firebaseDeletedSongTitles.add(key);
            }
        });
        if(firebaseDeletedSongTitles.size){
            const local = getDeletedSongTitles();
            firebaseDeletedSongTitles.forEach(key => local.add(key));
            localStorage.setItem(DELETED_SONG_TITLES_KEY, JSON.stringify([...local]));
        }
        return firebaseDeletedSongTitles;
    }catch(error){
        console.warn("Unable to load Firebase deleted-song markers:", error);
        return firebaseDeletedSongTitles;
    }
}

async function migrateLocalDeletedTitlesToFirebase(){
    if(!canManageSongs) return;
    const titles = getDeletedSongTitles();
    if(!titles.size) return;
    try{
        const snap = await getDocs(collection(db, "songs"));
        for(const key of titles){
            try { await saveFirebaseDeletedSongTitle(key); }
            catch(error){ console.warn("Unable to save deleted-song marker:", key, error); continue; }
            // Older versions deleted only the local copy. Remove any remaining
            // Firebase song documents with the same title now that the permanent
            // tombstone exists.
            for(const docSnap of snap.docs){
                const data = docSnap.data() || {};
                if(data.deletedSong === true) continue;
                if(normalizeDeletedSongTitle(data.title) === key){
                    try { await deleteDoc(doc(db, "songs", docSnap.id)); }
                    catch(error){ console.warn("Unable to remove legacy deleted song from Firebase:", docSnap.id, error); }
                }
            }
        }
    }catch(error){
        console.warn("Unable to migrate legacy deleted songs to Firebase:", error);
    }
}

window.WorshipHubDeletedSongs = window.WorshipHubDeletedSongs || {};
function normalizeDeletedSongTitle(title){
    return String(title || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}
function getDeletedSongTitles(){
    try {
        const v = JSON.parse(localStorage.getItem(DELETED_SONG_TITLES_KEY) || "[]");
        return new Set(Array.isArray(v) ? v.map(normalizeDeletedSongTitle).filter(Boolean) : []);
    } catch(e){ return new Set(); }
}
function isDeletedSongTitle(title){
    const key = normalizeDeletedSongTitle(title);
    return !!key && getDeletedSongTitles().has(key);
}
function rememberDeletedSongTitle(title){
    const key = normalizeDeletedSongTitle(title);
    if(!key) return;
    const deleted = getDeletedSongTitles();
    deleted.add(key);
    localStorage.setItem(DELETED_SONG_TITLES_KEY, JSON.stringify([...deleted]));
}
function getDeletedSongIds(){
    try {
        const v = JSON.parse(localStorage.getItem(DELETED_SONGS_KEY) || "[]");
        return new Set(Array.isArray(v) ? v.map(String) : []);
    } catch(e){ return new Set(); }
}
function filterDeletedSongsFromLibrary(){
    const deleted = getDeletedSongIds();
    const deletedTitles = getDeletedSongTitles();
    for(let i=songs.length-1;i>=0;i--){
        const song = songs[i];
        if(deleted.has(String(song?.id)) || deletedTitles.has(normalizeDeletedSongTitle(song?.title)) || isFirebaseDeletedTitle(song?.title)) songs.splice(i,1);
    }
}
Object.assign(window.WorshipHubDeletedSongs, {
    isDeleted(id){ return getDeletedSongIds().has(String(id)) || isFirebaseDeletedTitle(id); },
    isDeletedTitle(title){ return isDeletedSongTitle(title) || isFirebaseDeletedTitle(title); },
    remember(id){
        const deleted=getDeletedSongIds(); deleted.add(String(id));
        localStorage.setItem(DELETED_SONGS_KEY, JSON.stringify([...deleted]));
    },
    rememberTitle(title){ rememberDeletedSongTitle(title); },
    forget(id){
        const deleted=getDeletedSongIds(); deleted.delete(String(id));
        localStorage.setItem(DELETED_SONGS_KEY, JSON.stringify([...deleted]));
    }
});

function songContentScore(song){
    if (!song) return 0;
    let lyrics = 0, chords = 0, lines = 0;
    for (const section of (Array.isArray(song.sections) ? song.sections : [])) {
        for (const line of (Array.isArray(section?.lines) ? section.lines : [])) {
            if (!line || typeof line !== "object") continue;
            const lyric = String(line.lyrics ?? line.text ?? "");
            const chord = String(line.chordText ?? line.chords ?? "");
            lyrics += lyric.trim().length;
            chords += chord.trim().length;
            if (lyric.trim() || chord.trim()) lines++;
        }
    }
    return (lyrics * 2) + (chords * 3) + (lines * 10) + (song.structuredVersion ? 25 : 0);
}

// Keep only one song for each title. When duplicates exist, retain the copy
// with the most complete structured lyrics/chords rather than an empty stub.
function removeDuplicateSongTitles(){
    const bestByTitle = new Map();
    const keyFor = song => String(song?.title || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
    for (const song of songs) {
        const key = keyFor(song);
        if (!key) continue;
        const current = bestByTitle.get(key);
        if (!current || songContentScore(song) > songContentScore(current)) {
            bestByTitle.set(key, song);
        }
    }
    const seen = new Set();
    for (let i = songs.length - 1; i >= 0; i--) {
        const song = songs[i];
        const key = keyFor(song);
        if (!key) continue;
        const winner = bestByTitle.get(key);
        if (song !== winner || seen.has(key)) songs.splice(i, 1);
        else seen.add(key);
    }
}

function removeUnstructuredSongsFromLibrary(){
    for(let i=songs.length-1;i>=0;i--){
        if(!hasStructuredLyrics(songs[i])) songs.splice(i,1);
    }
    try{
        const saved=JSON.parse(localStorage.getItem("worshipHubCustomSongs") || "[]");
        if(Array.isArray(saved)){
            const valid=saved.filter(hasStructuredLyrics);
            if(valid.length!==saved.length) localStorage.setItem("worshipHubCustomSongs",JSON.stringify(valid));
        }
    }catch(error){ console.warn("Unable to clean unstructured custom songs:",error); }
}

syncCustomSongsIntoLibrary();
filterDeletedSongsFromLibrary();
removeUnstructuredSongsFromLibrary();
removeDuplicateSongTitles();

function loadCachedSharedSongLibrary(){
    try{
        const raw=localStorage.getItem(FIREBASE_SONG_CACHE_KEY);
        if(!raw) return false;
        const cached=JSON.parse(raw);
        if(!Array.isArray(cached?.songs) || !cached.songs.length) return false;
        const deletedTitles=new Set(Array.isArray(cached.deletedTitles)?cached.deletedTitles:[]);
        cached.songs.forEach(data=>{
            const id=String(data?.id||"").trim(); if(!id) return;
            let index=songs.findIndex(x=>String(x?.id||"").trim()===id);
            if(index<0) index=songs.findIndex(x=>normalizeDeletedSongTitle(x?.title)===normalizeDeletedSongTitle(data?.title));
            if(index>=0) songs[index]={...data,id}; else songs.push({...data,id});
        });
        firebaseDeletedSongTitles=deletedTitles;
        filterDeletedSongsFromLibrary(); removeUnstructuredSongsFromLibrary(); removeDuplicateSongTitles();
        songsReady=true;
        return true;
    }catch(_){ return false; }
}

function saveSharedSongLibraryCache(){
    try{
        const payload={savedAt:Date.now(),songs:songs.filter(s=>s&&s.id).map(s=>({...s})),deletedTitles:[...firebaseDeletedSongTitles]};
        localStorage.setItem(FIREBASE_SONG_CACHE_KEY,JSON.stringify(payload));
    }catch(error){ console.warn("Unable to cache shared song library:",error); }
}

async function syncAllSongDocumentsIntoLibrary(){
    if(songsSyncInProgress) return;
    songsSyncInProgress = true;
    try {
        // ONE cloud read supplies both deletion tombstones and song documents.
        const snap = await getDocs(collection(db, "songs"));
        await loadFirebaseDeletedSongTitles(snap);
        snap.forEach(docSnap => {
            const data = docSnap.data() || {};
            if(data.deletedSong === true || String(docSnap.id).startsWith(DELETED_SONG_DOC_PREFIX)) return;
            const id = String(data.id || docSnap.id || "").trim();
            const titleKey = normalizeDeletedSongTitle(data.title);
            if (!id || (titleKey && (isDeletedSongTitle(data.title) || isFirebaseDeletedTitle(data.title)))) return;
            let index = songs.findIndex(song => String(song?.id || "").trim() === id);
            if (index < 0 && titleKey) index = songs.findIndex(song => normalizeDeletedSongTitle(song?.title) === titleKey);
            if (index >= 0) songs[index] = { ...data, id };
            else if (data.customSong === true || Array.isArray(data.sections)) songs.push({ ...data, id, customSong: data.customSong === true });
        });
        filterDeletedSongsFromLibrary();
        removeUnstructuredSongsFromLibrary();
        removeDuplicateSongTitles();
        saveSharedSongLibraryCache();
        songsReady = true;
        if (typeof renderSongs === "function") renderSongs(songs);
        if (typeof renderAllSongsTable === "function" && document.getElementById("allSongsPanel")?.classList.contains("show")) renderAllSongsTable(songs);
    } catch (error) {
        console.warn("Unable to sync shared Firebase song edits/deletions:", error);
        // If cloud is temporarily unavailable, keep the UI in loading state rather
        // than showing a misleading stale 75-song library.
        songsReady = false;
        showSongsLoadingState();
    } finally {
        songsSyncInProgress = false;
    }
}

window.addEventListener("worshiphub:songs-updated", function() {
    syncCustomSongsIntoLibrary();
    filterDeletedSongsFromLibrary();
    removeUnstructuredSongsFromLibrary();
    removeDuplicateSongTitles();
    if (typeof renderSongs === "function") renderSongs(songs);
    if (typeof renderAllSongsTable === "function") renderAllSongsTable(songs);
    if (typeof updateDashboard === "function") updateDashboard();
});


/* =====================================
   CURRENT USER
===================================== */

let currentUser = null;
const ADMIN_EMAILS = new Set(["jfcm.s07@gmail.com", "cmcaragon@gmail.com"]);
let currentUserProfile = null;
let canManageSongs = false;
function updateNormalUserToolState(){
    const admin = isCurrentAdmin();
    ['settingsBtn','addSongBtn','importSongBtn'].forEach(id=>{
        const el=document.getElementById(id);
        if(!el) return;
        el.disabled=!admin;
        el.setAttribute('aria-disabled',String(!admin));
        el.classList.toggle('permission-disabled',!admin);
        if(!admin) el.title = id==='settingsBtn' ? 'Settings are available to administrators only' : (id==='addSongBtn' ? 'Add Song is available to administrators only' : 'Import Song is available to administrators only');
    });
    document.querySelectorAll('[data-sidebar-quick="addsong"],[data-sidebar-quick="import"],.settings-action').forEach(el=>{
        el.disabled=!admin;
        el.setAttribute('aria-disabled',String(!admin));
        el.classList.toggle('permission-disabled',!admin);
    });
    window.dispatchEvent(new CustomEvent('worshiphub:permissions-updated',{detail:{isAdmin:admin}}));
}

const isCurrentAdmin = () => {
    const email = String(currentUser?.email || "").trim().toLowerCase();
    return ADMIN_EMAILS.has(email) || currentUserProfile?.role === "admin" || currentUserProfile?.isAdmin === true || currentUserProfile?.admin === true;
};

async function loadCurrentUserProfile(){
    currentUserProfile = null;
    canManageSongs = false;
    if(!currentUser?.uid) return;
    try{
        const snap = await getDoc(doc(db, "users", currentUser.uid));
        currentUserProfile = snap.exists() ? (snap.data() || {}) : null;
    }catch(error){
        console.warn("Unable to load current user profile:", error);
    }
    canManageSongs = isCurrentAdmin() || currentUserProfile?.allowEditSongs === true;
    updateNormalUserToolState();
}


/* =====================================
   USER DATA
===================================== */


let services = [];
window.services = services;

// Receive Service Planner key changes made from a song page. The song page
// writes the selected service directly to Firebase; this keeps index.html's
// local service list and displayed Song Key synchronized immediately.
window.addEventListener("worshiphub:service-updated", function(event) {
    const detail = event?.detail || {};
    const updatedService = detail.service;
    const serviceId = detail.id;
    if (!updatedService || serviceId == null) return;

    const index = services.findIndex(function(service) {
        return String(service.id) === String(serviceId);
    });

    if (index >= 0) {
        services[index] = {
            ...services[index],
            ...updatedService,
            songs: Array.isArray(updatedService.songs)
                ? [...updatedService.songs]
                : []
        };
    } else {
        services.push(updatedService);
    }

    window.services = services;

    if (typeof renderServices === "function") renderServices();
    if (typeof updateDashboard === "function") updateDashboard();
});


/* =====================================
   CURRENT SERVICE STORAGE
===================================== */

const STORAGE_KEYS = {

    CURRENT_SERVICE: "currentServiceId",

    CURRENT_INDEX: "currentSongIndex",

    RESUME: "resumePresentation"

};
/* =====================================
   FIREBASE AUTHENTICATION
===================================== */



async function recordSiteVisit(){
    const countedKey='chordioSiteVisitCounted';
    if(sessionStorage.getItem(countedKey)==='1') return;
    try{
        const ref=doc(db,'appStats','site');
        await setDoc(ref,{visits:increment(1),updatedAt:serverTimestamp()},{merge:true});
        sessionStorage.setItem(countedKey,'1');
        const snap=await getDoc(ref);
        window.chordioSiteVisits=Number(snap.data()?.visits||0);
        updateDashboard();
    }catch(error){console.warn('Unable to record site visit:',error);}
}
async function loadSiteVisitCount(){
    try{const snap=await getDoc(doc(db,'appStats','site'));window.chordioSiteVisits=Number(snap.data()?.visits||0);updateDashboard();}catch(error){console.warn('Unable to load site visits:',error);}
}

onAuthStateChanged(auth, async function(user) {

    console.log("Firebase authentication state:", user);

    const guestMode = localStorage.getItem("chordioGuestMode") === "1";
    const loginAccountBtn = document.getElementById("loginAccountBtn");
    const logoutBtn = document.getElementById("logoutBtn");
    if (loginAccountBtn) {
        loginAccountBtn.style.display = guestMode && !user ? "inline-flex" : "none";
        loginAccountBtn.onclick = () => { localStorage.removeItem("chordioGuestMode"); window.location.href = "login.html"; };
    }
    if (logoutBtn) logoutBtn.style.display = guestMode && !user ? "none" : "inline-flex";

    /* =====================================
       NOT LOGGED IN
    ===================================== */

    if (!user) {
        if (!guestMode) {
            window.location.href = "login.html";
            return;
        }

        // Guest mode: allow read-only access without Firebase authentication.
        currentUser = null;
        currentUserProfile = { name: "Guest", role: "guest" };
        canManageSongs = false;
        updateNormalUserToolState();
        songsReady = true;
        filterDeletedSongsFromLibrary();
        removeDuplicateSongTitles();
        const guestName = document.getElementById("userName");
        if (guestName) guestName.textContent = "Guest";
        const hadCachedLibrary=loadCachedSharedSongLibrary();
        renderSongs(songs);
        if (typeof renderAllSongsTable === "function") renderAllSongsTable(songs);
        // Guests/read-only users get the cached shared master immediately, then
        // refresh it once in the background. Never run the expensive web repair here.
        try { await syncAllSongDocumentsIntoLibrary(); } catch (_) {}
        if (typeof renderServices === "function") renderServices();
        if (typeof updateDashboard === "function") updateDashboard();
        await loadSiteVisitCount();
        await recordSiteVisit();
        return;
    }

    localStorage.removeItem("chordioGuestMode");


    /* =====================================
       LOGGED IN
    ===================================== */

    currentUser = user;
    updateNormalUserToolState();

    // FAST HOME LOAD: render the bundled library immediately. Previously the
    // home page waited for several sequential Firestore reads (profile, user
    // count, visit count, deletion migration, and the entire songs collection)
    // before displaying any songs. The bundled structured library is safe to
    // show immediately and is reconciled with Firebase in the background.
    filterDeletedSongsFromLibrary();
    removeDuplicateSongTitles();
    loadCachedSharedSongLibrary();
    songsReady = true;
    renderSongs(songs);
    if (typeof renderAllSongsTable === "function") renderAllSongsTable(songs);

    // Do not block the Home UI on dashboard counters or cloud synchronization.
    // These operations update the page as their results arrive.
    Promise.allSettled([
        loadCurrentUserProfile(),
        loadSiteVisitCount(),
        recordSiteVisit()
    ]);

    (async function syncLibraryInBackground(){
        try {
            await loadCurrentUserProfile();
            await migrateLocalDeletedTitlesToFirebase();
            await seedBundledSongsToSharedFirebase();
            await syncAllSongDocumentsIntoLibrary();
            // The Selah/web repair is expensive because it can inspect hundreds
            // of source pages. Run it only once for an administrator; ordinary
            // users consume the repaired shared Firebase master without waiting.
            if (canManageSongs) await runSongLibraryRepairIfNeeded(false);
            filterDeletedSongsFromLibrary();
            removeDuplicateSongTitles();
            songsReady = true;
            renderSongs(songs);
            if (typeof renderAllSongsTable === "function") renderAllSongsTable(songs);
        } catch(error) {
            console.warn("Background song synchronization failed:", error);
            // Keep the already-rendered bundled library available offline.
            songsReady = true;
            renderSongs(songs);
        }
    })();


    console.log("Logged in user:", currentUser.uid);
    console.log("Email:", currentUser.email);


    /* =====================================
       LOAD USER SERVICES
    ===================================== */

    try {
console.log(
    "Loading services for UID:",
    currentUser.uid
);
        services = await loadServices(
            currentUser.uid
        );
        window.services = services;

        services.sort(function(a, b) {

            return (a.name || "").localeCompare(
                b.name || ""
            );

        });

        console.log(
            "User services:",
            services
        );

    }
    catch(error) {

        console.error(
            "Service loading error:",
            error
        );

        services = [];

    }


    /* =====================================
       RENDER
    ===================================== */


    if (typeof renderServices === "function") {

        renderServices();

    }




    if (typeof updateDashboard === "function") {

        updateDashboard();

    }


    if (typeof renderSongs === "function") {

        renderSongs(songs);

    }

});
window.addEventListener("worshiphub:songs-updated", () => {
    syncCustomSongsIntoLibrary();
    if (document.getElementById("allSongsPanel")?.classList.contains("show")) showAllSongs();
});

// ==========================================
// ALL SONGS
// ==========================================

function showAllSongs() {
    const panel = document.getElementById("allSongsPanel");
    if (!panel) return;
    panel.classList.add("show");
    bindAllSongsColumnFilters();
    populateAllSongsFilters();
    updateAllSongsLibraryMeta();
    if (!songsReady) {
        const body = document.getElementById("allSongsTableBody");
        if(body) body.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:24px">Loading songs…</td></tr>';
        return;
    }
    filterDeletedSongsFromLibrary();
    removeDuplicateSongTitles();
    applyAllSongsColumnFilters();
}

// ==========================================
// CLOSE ALL SONGS
// ==========================================

function closeAllSongs() {

    const panel =
        document.getElementById("allSongsPanel");


    if (!panel) {

        return;

    }


    panel.classList.remove("show");

}

// ==========================================
// ALL SONGS SEARCH
// ==========================================

function searchAllSongs() {

    const searchInput =
        document.getElementById("allSongsSearch");

    const tableBody =
        document.getElementById("allSongsTableBody");

    if (!searchInput || !tableBody) {

        console.error(
            "All Songs search elements not found."
        );

        return;

    }

    const keyword =
        searchInput.value
            .toLowerCase()
            .trim();


    // Filter songs
    const filteredSongs = songs.filter(function(song) {

        const title =
            String(song.title || "")
                .toLowerCase();

        const artist =
            String(song.artist || "")
                .toLowerCase();

        const category =
            String(song.category || "")
                .toLowerCase();

        const language =
            String(song.language || "")
                .toLowerCase();
       const key =
            String(song.key || "")
                .toLowerCase();


        return (

            title.includes(keyword) ||

            artist.includes(keyword) ||

            category.includes(keyword) ||
           
             language.includes(keyword) ||

            key.includes(keyword)

        );

    });


    applyAllSongsColumnFilters();

}


// ==========================================
// CLEAR ALL SONGS SEARCH
// ==========================================

function clearAllSongsSearch() {

    const searchInput =
        document.getElementById("allSongsSearch");

    if (searchInput) {

        searchInput.value = "";

    }

    // Show all songs again
    applyAllSongsColumnFilters();

}

// Make available to HTML onclick=""
window.clearAllSongsSearch = clearAllSongsSearch;

// ==========================================
// RENDER ALL SONGS TABLE
// ==========================================

function getAllSongsColumnFilters() {
    const value = id => String(document.getElementById(id)?.value || "").trim().toLowerCase();
    return { title:value("filterSongTitle"), artist:value("filterArtist"), category:value("filterCategory"), language:value("filterLanguage"), key:value("filterKey") };
}

function populateAllSongsFilters() {
    const defs = [
        ["filterCategory", [...new Set(songs.map(s => String(s?.category || "").trim()).filter(Boolean))].sort()],
        ["filterLanguage", [...new Set(songs.map(s => String(s?.language || "").trim()).filter(Boolean))].sort()],
        ["filterKey", [...new Set(songs.map(s => String(s?.key || s?.originalKey || "").trim()).filter(Boolean))].sort()]
    ];
    defs.forEach(([id, values]) => {
        const el = document.getElementById(id); if(!el) return;
        const current = el.value;
        el.innerHTML = `<option value="">All</option>` + values.map(v => `<option value="${escapeHtml(v.toLowerCase())}">${escapeHtml(v)}</option>`).join("");
        el.value = current;
    });
}
function updateAllSongsLibraryMeta(visibleCount=null) {
    const meta=document.getElementById("allSongsLibraryMeta");
    if(!meta) return;
    const total=songs.filter(song=>!isAnyDeletedSong(song)).filter(hasStructuredLyrics).length;
    meta.textContent=`${visibleCount == null ? total : visibleCount} of ${total} songs`;
}
function applyAllSongsColumnFilters() {
    const filters = getAllSongsColumnFilters();
    const global = String(document.getElementById("allSongsSearch")?.value || "").trim().toLowerCase();
    const sortBy = String(document.getElementById("allSongsSort")?.value || "title");
    const filtered = songs.filter(song => {
        if (isAnyDeletedSong(song)) return false;
        const fields = {
            title:String(song.title || "").toLowerCase(),
            artist:String(song.artist || "").toLowerCase(),
            category:String(song.category || "").toLowerCase(),
            language:String(song.language || "").toLowerCase(),
            key:String(song.key || song.originalKey || "").toLowerCase()
        };
        const globalMatch = !global || Object.values(fields).some(v => v.includes(global));
        return globalMatch && Object.entries(filters).every(([k,v]) => !v || fields[k].includes(v));
    });
    filtered.sort((a,b)=>String(a?.[sortBy] || a?.title || "").localeCompare(String(b?.[sortBy] || b?.title || ""),undefined,{sensitivity:"base",numeric:true}));
    renderAllSongsTable(filtered);
}

function bindAllSongsColumnFilters() {
    ["filterSongTitle","filterArtist","filterCategory","filterLanguage","filterKey","allSongsSort"].forEach(id => {
        const el=document.getElementById(id);
        if(el && !el.dataset.bound){ el.dataset.bound="1"; el.addEventListener("input", applyAllSongsColumnFilters); el.addEventListener("change", applyAllSongsColumnFilters); }
    });
}

function renderAllSongsTable(songList) {
    const tableBody = document.getElementById("allSongsTableBody");
    if (!tableBody) return;

    tableBody.innerHTML = "";
    const list = (Array.isArray(songList) ? songList : [])
        .filter(song => !isAnyDeletedSong(song))
        .filter((song, index, arr) => arr.findIndex(x => normalizeDeletedSongTitle(x?.title) === normalizeDeletedSongTitle(song?.title)) === index);

    if (!list.length) {
        updateAllSongsLibraryMeta(0);
        tableBody.innerHTML = `
            <tr><td colspan="7" style="text-align:center;padding:40px;color:#98a2b3;">
                🔍 No songs found.
            </td></tr>`;
        return;
    }

    updateAllSongsLibraryMeta(list.length);
    list.forEach((song, index) => {
        const row = document.createElement("tr");
        const title = song.title || "Untitled Song";
        const artist = song.artist || "—";
        const category = song.category || "—";
        const language = song.language || "—";
        const key = song.key || song.originalKey || "—";
        const safeHref = song.customSong
            ? `custom-song.html?id=${encodeURIComponent(song.id)}`
            : (song.file || "#");

        row.innerHTML = `
            <td>${index + 1}</td>
            <td><a href="${safeHref}" class="all-song-title">🎵 ${escapeHtml(title)}</a></td>
            <td>${escapeHtml(artist)}</td>
            <td>${escapeHtml(category)}</td>
            <td>${escapeHtml(language)}</td>
            <td>${escapeHtml(key)}</td>
            <td class="song-actions-cell">
                <a class="youtube-song-btn${song.youtube ? "" : " disabled"}"
                   href="${song.youtube ? escapeHtml(song.youtube) : "#"}"
                   ${song.youtube ? 'target="_blank" rel="noopener noreferrer"' : 'aria-disabled="true" onclick="return false;"'}
                   title="${song.youtube ? "Open YouTube link" : "No YouTube link added"}"><i class="fa-brands fa-youtube youtube-real-icon" aria-hidden="true"></i></a>
            </td>`;

        // All Songs is intentionally read-only here; YouTube is the only row action.


        tableBody.appendChild(row);
    });
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

window.renderAllSongsTable = renderAllSongsTable;

document.addEventListener("DOMContentLoaded", function(){
    const searchInput=document.getElementById("allSongsSearch");
    if(searchInput && !searchInput.dataset.liveBound){
        searchInput.dataset.liveBound="1";
        searchInput.addEventListener("input", applyAllSongsColumnFilters);
    }
});
// ==========================================
// MAKE AVAILABLE TO HTML onclick=""
// ==========================================

window.showAllSongs =
    showAllSongs;

window.closeAllSongs =
    closeAllSongs;

/* =====================================
   SAVE SERVICES TO FIREBASE
===================================== */

async function saveServicesCloud() {

    if (!currentUser) {

        console.error(
            "No logged-in user."
        );

        return false;
    }

    if (!Array.isArray(services)) {

        console.error(
            "Services is not an array."
        );

        return false;
    }

    try {

        await saveServices(
            currentUser.uid,
            services
        );

        console.log(
            "Services saved to Firebase:",
            services
        );

        return true;

    }
    catch (error) {

        console.error(
            "Firebase service save error:",
            error
        );

        throw error;
    }
}

function openSong(file){

    // Remember that the Song Page was opened from the already-rendered
    // library. Its Home/Back control can return with history.back() so the
    // index page is restored instead of reloading Firebase/authentication.
    try { sessionStorage.setItem("worshiphubSongOpenedFromIndex", "true"); } catch(_) {}

    if (localStorage.getItem("currentServiceId")) {
        localStorage.setItem("resumePresentation", "true");
    }
    location.href = file;

}

function getFavorites(){

    return JSON.parse(

        localStorage.getItem("favorites")

    ) || [];

}

function getRecentSongs(){

    return JSON.parse(

        localStorage.getItem("recentSongs")

    ) || [];

}

function getLastSong(){

    return JSON.parse(

        localStorage.getItem("lastSong")

    );

}
const continueBtn =
document.getElementById("continueBtn");

if(continueBtn){

    continueBtn.onclick = function(){

    const service = getCurrentService();

    if(!service){

        alert("No active service.");

        return;

    }

    const index = Number(
        localStorage.getItem("currentSongIndex") || 0
    );

    if (localStorage.getItem("currentServiceId")) {
        localStorage.setItem("resumePresentation", "true");
    }

    const selectedSong = Array.isArray(service.songs) ? service.songs[index] : null;
    if (!selectedSong?.file) {
        alert("The selected song could not be opened. Please check the Service Planner order.");
        return;
    }

    location.href = selectedSong.file;

};
}
function finishService() {
    clearActiveServiceState();
    if (typeof renderServices === "function") renderServices();
    alert("Service Finished.");
}
window.finishService = finishService;
function updateDashboard(){

    const totalServices =
        document.getElementById("totalServices");

    if(totalServices){
        totalServices.textContent = services.length;
    }

    const current =
        document.getElementById("currentService");

    if(current){

        const service =
            getCurrentService();

        current.textContent =
            service
            ? service.name
            : "None";

    }

}
document.getElementById("totalSongs").textContent =
songs.length;

document.getElementById("totalArtists").textContent =
new Set(songs.map(s => s.artist)).size;

let filteredSongs = [];

function showSongsLoadingState(){
    const grid = document.getElementById("songGrid");
    if(grid) grid.innerHTML = '<div class="songs-loading-state">Loading songs…</div>';
    const total = document.getElementById("totalSongs");
    if(total) total.textContent = "…";
}
showSongsLoadingState();

function renderSongs(songList) {
    const songGrid = document.getElementById("songGrid");
    if (!songGrid) return;
    if (!songsReady) { showSongsLoadingState(); return; }

    // Always display the main song cards alphabetically by title, including
    // newly created Add Song entries and filtered/search results.
    const list = (Array.isArray(songList) ? [...songList] : [])
        .filter(song => !isAnyDeletedSong(song))
        .filter((song, index, arr) => arr.findIndex(x => normalizeDeletedSongTitle(x?.title) === normalizeDeletedSongTitle(song?.title)) === index)
        .filter(hasStructuredLyrics)
        .sort((a, b) =>
        String(a?.title || "Untitled Song").localeCompare(
            String(b?.title || "Untitled Song"),
            undefined,
            { sensitivity: "base", numeric: true }
        )
    );
    songGrid.innerHTML = list.map(song => `
        <div class="song-card" data-song-id="${escapeHtml(song.id)}">
            <h3>${escapeHtml(song.title || "Untitled Song")}</h3>
            <p><strong>Artist:</strong> ${escapeHtml(song.artist || "—")}</p>
            <p><strong>ID:</strong> ${escapeHtml(song.songNumber ?? "—")}</p>
            <p><strong>Key:</strong> ${escapeHtml(song.key || song.originalKey || "—")}</p>
            <p><strong>Category:</strong> ${escapeHtml(song.category || "—")}</p>
            <div class="song-card-actions ${canManageSongs ? "song-card-actions-managed" : "song-card-actions-basic"}">
                <div class="song-card-action-row song-card-action-row-primary">
                    <a class="open-song" href="${song.customSong ? `custom-song.html?id=${encodeURIComponent(song.id)}` : (song.file || "#")}">🎵 Open Song</a>
                </div>
                <div class="song-card-action-row song-card-action-row-secondary">
                    <a class="youtube-song-btn${song.youtube ? "" : " disabled"}"
                       href="${song.youtube ? escapeHtml(song.youtube) : "#"}"
                       ${song.youtube ? 'target="_blank" rel="noopener noreferrer"' : 'aria-disabled="true" onclick="return false;"'}
                       title="${song.youtube ? "Open YouTube link" : "No YouTube link added"}"><i class="fa-brands fa-youtube youtube-real-icon" aria-hidden="true"></i></a>
                    ${canManageSongs ? `
                        <button type="button" class="song-action-btn edit" data-card-action="edit" data-song-id="${escapeHtml(song.id)}">✏ Edit</button>
                        <button type="button" class="song-action-btn delete" data-card-action="delete" data-song-id="${escapeHtml(song.id)}">🗑 Delete</button>
                    ` : ""}
                </div>
            </div>
        </div>
    `).join("");

    songGrid.querySelectorAll('[data-card-action="edit"]').forEach(btn => {
        btn.addEventListener("click", () => {
            if(!canManageSongs) return;
            const target = songs.find(x => String(x.id) === String(btn.dataset.songId));
            if (target && window.WorshipHubSongEditor?.open) window.WorshipHubSongEditor.open(target);
        });
    });

    songGrid.querySelectorAll('[data-card-action="delete"]').forEach(btn => {
        btn.addEventListener("click", async () => {
            if(!canManageSongs) return;
            if (window.WorshipHubSongEditor?.deleteSong) {
                await window.WorshipHubSongEditor.deleteSong(btn.dataset.songId);
            }
        });
    });

    const totalSongs = document.getElementById("totalSongs");
    if (totalSongs) totalSongs.textContent = list.length;
}

window.renderSongs = renderSongs;

const servicePlannerBtn =
document.getElementById("servicePlannerBtn");

const servicePanel =
document.getElementById("servicePanel");

const closeService =
document.getElementById("closeService");

const serviceList =
document.getElementById("serviceList");

const newServiceFromPlanner = document.getElementById("newServiceFromPlanner");
if (newServiceFromPlanner) {
    newServiceFromPlanner.onclick = function(){
        if (window.chordioV63?.openNewService) window.chordioV63.openNewService();
    };
}

servicePlannerBtn.onclick = async function(){

    servicePanel.classList.add("show");
    document.body.classList.add("service-planner-open");

    // Refresh the Service Planner every time it is opened so services that
    // were already saved in Firebase are immediately shown in the list.
    if (currentUser) {
        try {
            const freshServices = await loadServices(currentUser.uid);
            services = Array.isArray(freshServices) ? freshServices : [];
            services.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
            window.services = services;
        } catch (error) {
            console.error("Unable to refresh Service Planner list:", error);
        }
    }

    renderServices();
}

function clearActiveServiceState(){
    // Closing the planner must fully clear the presentation session.
    // This prevents a closed planner from appearing ACTIVE after reopening.
    [
        "currentService",
        "currentServiceId",
        "currentServiceName",
        "currentServiceSnapshot",
        "currentSongIndex",
        "resumePresentation",
        "presentationMode",
        "startMultiScreenOnLoad"
    ].forEach(key => localStorage.removeItem(key));
}

closeService.onclick=function(){
    servicePanel.classList.remove("show");
    document.body.classList.remove("service-planner-open");
    clearActiveServiceState();
    renderServices();
};

function closeServicePlanner(){
    servicePanel.classList.remove("show");
    document.body.classList.remove("service-planner-open");
    clearActiveServiceState();
    renderServices();
}

/* Service creation is handled by the CHORDIO New Service dialog.
   The Service Planner is intentionally a review/control view only. */

function serviceDisplayNumber(service, index) {
    const n = Number.isFinite(index) ? index + 1 : 1;
    return String(n).padStart(2, "0");
}

function serviceStatus(service) {
    const active = String(localStorage.getItem("currentServiceId") || "") === String(service?.id || "");
    return active ? { label: "ACTIVE", cls: "active" } : { label: "READY", cls: "ready" };
}

function renderServices() {
    if (!serviceList) {
        console.error("serviceList element not found.");
        return;
    }
    serviceList.innerHTML = "";
    if (!Array.isArray(services) || services.length === 0) {
        serviceList.innerHTML = `<div class="empty-message">No Service Planner created yet.</div>`;
        updateDashboard();
        return;
    }

    services.sort((a, b) => {
        const ad = String(a?.date || "");
        const bd = String(b?.date || "");
        return bd.localeCompare(ad) || String(a?.name || "").localeCompare(String(b?.name || ""));
    });

    services.forEach(function(service, serviceIndex) {
        const serviceSongs = Array.isArray(service.songs) ? service.songs : [];
        const status = serviceStatus(service);
        let songsHtml = "";
        serviceSongs.forEach(function(song, index) {
            songsHtml += `
                <div class="service-song" draggable="true" data-service-id="${escapeHtml(service.id)}" data-song-index="${index}" data-song-instance="${escapeHtml(song._chordioInstanceId || `${serviceSongIdentity(song)}::${index}`)}">
                    <div class="service-song-drag" title="Drag to reorder" aria-label="Drag to reorder song">⋮⋮</div>
                    <div class="service-song-info">
                        <div class="service-song-title">🎵 ${escapeHtml(song.title || "Untitled Song")}</div>
                        <div class="service-song-artist">${escapeHtml(song.artist || "")}</div>
                        <div class="service-song-key">🎼 KEY: ${escapeHtml(song.serviceKey || song.key || song.originalKey || "—")}${song.presentationNote ? ` <span class="service-song-note-inline">| ${escapeHtml(song.presentationNote)}</span>` : ""}</div>
                    </div>
                    <div class="service-song-actions">
                        <a class="service-youtube-btn${song.youtube ? "" : " disabled"}" href="${song.youtube ? escapeHtml(song.youtube) : "#"}" ${song.youtube ? 'target="_blank" rel="noopener noreferrer"' : 'aria-disabled="true" onclick="return false;"'} title="${song.youtube ? "Open YouTube" : "No YouTube link"}"><i class="fa-brands fa-youtube" aria-hidden="true"></i></a>
                        <button class="remove-song-btn" onclick="removeSongFromService('${escapeHtml(service.id)}', ${index})" title="Delete song"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
                    </div>
                </div>`;
        });

        serviceList.innerHTML += `
            <div class="service-item" data-service-id="${escapeHtml(service.id)}">
                <div class="service-header" tabindex="0" role="button" aria-expanded="false" aria-controls="serviceBody${escapeHtml(service.id)}">
                    <div class="service-header-main">
                        <div class="service-title">
                            <span class="service-number">${serviceDisplayNumber(service, serviceIndex)}</span>
                            <span id="serviceArrow${escapeHtml(service.id)}" class="service-arrow">▸</span>
                            <span class="service-name-text">${escapeHtml(service.name || "Unnamed Service")}</span>
                            <span class="chordio-service-status ${status.cls}">${status.label}</span>
                        </div>
                        <div class="service-count">
                            <span class="chordio-service-date">${service.date ? escapeHtml(service.date) : "Date not set"}</span>
                            <span class="chordio-service-song-count">${serviceSongs.length} ${serviceSongs.length === 1 ? "Song" : "Songs"}</span>
                        </div>
                    </div>
                </div>
                <div id="serviceBody${escapeHtml(service.id)}" class="service-body">
                    <div class="service-action-bar">
                        <button type="button" class="edit-service-btn" onclick="editService('${escapeHtml(service.id)}')">✎ Edit Service</button>
                        <button type="button" class="start-multi-screen-service-btn" onclick="startMultiScreenService('${escapeHtml(service.id)}')" title="Open Multi-Screen for this Service Planner">🖥 Multi-Screen</button>
                        <button type="button" class="service-print-btn" onclick="printServiceSongs('${escapeHtml(service.id)}')"><i class="fas fa-print"></i> Print</button>
                        <button type="button" onclick="duplicateService('${escapeHtml(service.id)}')">⧉ Duplicate</button>
                        <button type="button" onclick="renameService('${escapeHtml(service.id)}')">✏ Rename</button>
                        <button type="button" class="danger-action" onclick="deleteService('${escapeHtml(service.id)}')">🗑 Delete</button>
                    </div>
                    <div class="service-song-hint"><span>↕ Drag the handle</span><span>•</span><span>Song order is saved automatically</span></div>
                    <hr>
                    <div class="service-song-list">${songsHtml || `<div class="service-empty-songs">No songs in this service yet.</div>`}</div>
                </div>
            </div>`;
    });

    serviceList.querySelectorAll('.service-header').forEach(header => {
        header.addEventListener('click', () => toggleService(header.closest('.service-item')?.dataset.serviceId));
        header.addEventListener('keydown', event => {
            if(event.key === 'Enter' || event.key === ' '){ event.preventDefault(); header.click(); }
        });
    });

    serviceList.querySelectorAll('.service-song[draggable="true"]').forEach(row => {
        const handle = row.querySelector('.service-song-drag');
        row.addEventListener('dragstart', event => {
            row.classList.add('dragging');
            event.dataTransfer.effectAllowed = 'move';
            try { event.dataTransfer.setData('text/plain', row.dataset.songIndex || ''); } catch(_) {}
        });
        row.addEventListener('dragend', () => row.classList.remove('dragging'));
        row.addEventListener('dragover', event => {
            event.preventDefault();
            const dragging = serviceList.querySelector('.service-song.dragging');
            if(!dragging || dragging === row) return;
            const rect = row.getBoundingClientRect();
            const before = event.clientY < rect.top + rect.height / 2;
            const list = row.parentElement;
            if(before) list.insertBefore(dragging, row); else list.insertBefore(dragging, row.nextSibling);
        });
        handle?.addEventListener('mousedown', () => row.classList.add('drag-handle-active'));
        handle?.addEventListener('mouseup', () => row.classList.remove('drag-handle-active'));
    });

    serviceList.querySelectorAll('.service-song[draggable="true"]').forEach(row => {
        row.addEventListener('dragend', async () => {
            const serviceId = row.dataset.serviceId;
            const service = services.find(x => String(x.id) === String(serviceId));
            if(!service) return;
            const list = row.parentElement;
            const rows = [...list.querySelectorAll('.service-song[draggable="true"]')];
            const original = Array.isArray(service.songs) ? [...service.songs] : [];
            // Rebuild by stable song-instance identity, not the old DOM index.
            // This prevents the sequence from snapping back when rows were moved more than once.
            const buckets = new Map();
            original.forEach((item, idx) => {
                const key = String(item?._chordioInstanceId || `${serviceSongIdentity(item)}::${idx}`);
                if(!buckets.has(key)) buckets.set(key, []);
                buckets.get(key).push(item);
            });
            const reordered = [];
            rows.forEach(r => {
                const key = String(r.dataset.songInstance || `${serviceSongIdentity(original[Number(r.dataset.songIndex)])}::${Number(r.dataset.songIndex)}`);
                const bucket = buckets.get(key);
                if(bucket?.length) reordered.push(bucket.shift());
            });
            if(reordered.length !== original.length) return;
            service.songs = reordered;
            service.updatedAt = new Date().toISOString();
            const ok = await saveServicesCloud();
            if(!ok){ service.songs=original; renderServices(); alert('Unable to save the new song sequence. Please try again.'); return; }
            // Keep every open/reopened Multi-Screen session on the same order.
            const activeId=String(localStorage.getItem('currentServiceId')||'');
            if(activeId===String(service.id)){
                try{localStorage.setItem('currentServiceSnapshot',JSON.stringify(service));}catch(_){}
                window.chordioSyncServicePlannerOrder?.(service.songs);
            }
            renderServices();
        });
    });
    updateDashboard();
}

async function duplicateService(id){
    if(!currentUser){ alert("Please login first."); return; }
    const source = services.find(s => String(s.id) === String(id));
    if(!source){ alert("Service not found."); return; }
    const baseName = String(source.name || "Service Planner").trim();
    const suggested = `${baseName} — Copy`;
    const name = prompt("Name for the duplicated Service Planner:", suggested);
    if(name === null) return;
    const finalName = String(name).trim();
    if(!finalName){ alert("Please enter a service name."); return; }
    const copy = JSON.parse(JSON.stringify(source));
    const oldId = String(copy.id || "");
    copy.id = `service-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    if(copy.presentationLayouts && typeof copy.presentationLayouts === "object") {
        const migratedLayouts={};
        Object.entries(copy.presentationLayouts).forEach(([key,value])=>{
            migratedLayouts[String(key).startsWith(oldId+":") ? copy.id+String(key).slice(oldId.length) : key]=value;
        });
        copy.presentationLayouts=migratedLayouts;
    }
    copy.name = finalName;
    copy.createdAt = new Date().toISOString();
    copy.updatedAt = new Date().toISOString();
    delete copy.status;
    services.push(copy);
    try{
        await saveServicesCloud();
        renderServices();
        updateDashboard();
        try{ localStorage.setItem("chordioToastMessage", `Duplicated “${baseName}” successfully.`); }catch(_){ }
    }catch(error){
        services = services.filter(s => String(s.id) !== String(copy.id));
        window.services = services;
        console.error("Duplicate service save failed:", error);
        alert("Unable to duplicate this Service Planner. Please try again.");
    }
}
window.duplicateService = duplicateService;

function addSongsToService(serviceId){

    selectedService = services.find(function(s){
        return s.id == serviceId;
    });

    console.log("Selected Service:", selectedService);

    renderSongPicker(songs);

    songPicker.classList.add("show");
}

window.addSongsToService = addSongsToService;

const songPicker =
document.getElementById("songPicker");

const songPickerList =
document.getElementById("songPickerList");

const songPickerSearch =
document.getElementById("songPickerSearch");

const closeSongPickerPanel =
    document.getElementById("closeSongPicker");

if (closeSongPickerPanel) {

    closeSongPickerPanel.onclick = function () {

        const songPicker =
            document.getElementById("songPicker");

        if (songPicker) {

            songPicker.classList.remove("show");

        }

    };

}

let selectedService = null;

function filterSongPicker(){
    if(!songPickerSearch) return;
    const query=String(songPickerSearch.value||"").trim().toLowerCase();
    const filtered=(Array.isArray(songs)?songs:[]).filter(song=>{
        if(!query) return true;
        const title=String(song?.title||"").toLowerCase();
        const artist=String(song?.artist||"").toLowerCase();
        const category=String(song?.category||song?.genre||"").toLowerCase();
        const language=String(song?.language||"").toLowerCase();
        return title.includes(query)||artist.includes(query)||category.includes(query)||language.includes(query);
    });
    renderSongPicker(filtered);
}

if(songPickerSearch){
    songPickerSearch.addEventListener("input",filterSongPicker);
    songPickerSearch.addEventListener("search",filterSongPicker);
}

function serviceSongIdentity(song){
    return String(song?.id || song?.file || song?.title || "").trim().toLowerCase();
}

function serviceSongCount(serviceSongs, song){
    const key=serviceSongIdentity(song);
    return serviceSongs.filter(item=>serviceSongIdentity(item)===key).length;
}

function renderSongPicker(list) {

    if (!songPickerList) {
        console.error("songPickerList not found.");
        return;
    }

    songPickerList.innerHTML = "";

    // Songs already inside the selected Service Planner
    const addedSongs =
        selectedService &&
        Array.isArray(selectedService.songs)
            ? selectedService.songs
            : [];

    list
        .filter(song => !getDeletedSongIds().has(String(song?.id)) && !isDeletedSongTitle(song?.title))
        .filter(hasStructuredLyrics)
        .slice()
        .sort(function(a, b) {
            return String(a.title || "").trim().localeCompare(
                String(b.title || "").trim(),
                undefined,
                { sensitivity: "base", numeric: true }
            );
        })
        .forEach(function(song) {

        const songCount = serviceSongCount(addedSongs, song);
        const maxed = songCount >= 3;

        songPickerList.innerHTML += `

            <div class="song-picker-card">

                <div class="song-picker-info">

                    <div class="song-picker-title">
                        ${song.title || "Untitled Song"}
                    </div>

                    <div class="song-picker-artist">
                        ${song.artist || ""}
                    </div>

                </div>

                <button
                    class="song-picker-add-btn ${maxed ? "added" : ""}"
                    ${maxed ? "disabled" : ""}
                    onclick="selectSong('${song.file || song.id || ""}')">

                    ${maxed ? "✓ 3 Added" : (songCount ? `Add (${songCount}/3)` : "Add")}

                </button>

            </div>

        `;

    });

}

async function selectSong(file) {

    if (!currentUser) {
        alert("Please login first.");
        return;
    }

    if (!selectedService) {
        alert("No Service Planner selected.");
        return;
    }

    const song = songs.find(function(s) {
        return String(s.file || "") === String(file) || String(s.id || "") === String(file);
    });

    if (!song) {
        alert("Song not found.");
        return;
    }
    if (isAnyDeletedSong(song)) {
        alert("This song was deleted and can no longer be added.");
        return;
    }

    // Make sure songs exists
    if (!Array.isArray(selectedService.songs)) {

        selectedService.songs = [];

    }

    // The same song may be added up to three times to one Service Planner.
    const existingCount = serviceSongCount(selectedService.songs, song);
    if(existingCount >= 3){
        alert(`"${song.title || "This song"}" can only be added a maximum of 3 times to the same Service Planner.`);
        return;
    }

    // Create service song
    const serviceSong = {

        id:
            song.id ||
            String(Date.now()),

        title:
            song.title || "",

        artist:
            song.artist || "",

        file:
            song.file || "",

        category:
            song.category || "",

        language:
            song.language || "",

        // A newly-added occurrence starts from the master song's original
        // key.  Never inherit a stale serviceKey from the master song because
        // serviceKey is specific to this Service Planner occurrence.
        key:
            song.key || "",

        originalKey:
            song.originalKey || song.key || "",

        serviceKey:
            song.originalKey || song.key || "",

        transpose: 0,

        youtube:
            song.youtube || "",

        customSong:
            song.customSong === true,

        createdByUid:
            song.createdByUid || "",

        createdByEmail:
            song.createdByEmail || "",

        sections:
            Array.isArray(song.sections)
                ? JSON.parse(JSON.stringify(song.sections))
                : null,

        contentVersion:
            song.contentVersion || null,

        createdAt:
            song.createdAt || null,

        updatedAt:
            song.updatedAt || null

    };

    // Add song locally
    selectedService.songs.push(
        serviceSong
    );

    try {

        // Save to Firebase
        await saveService(
            currentUser.uid,
            selectedService
        );

        // Update services array
        const serviceIndex =
            services.findIndex(function(s) {

                return String(s.id) ===
                       String(selectedService.id);

            });

        if (serviceIndex !== -1) {

            services[serviceIndex] = {
                ...selectedService,
                songs: [
                    ...selectedService.songs
                ]
            };

        }

        // Refresh Service Planner
        renderServices();

        updateDashboard();

        // IMPORTANT:
        // Refresh picker WITHOUT closing it
        renderSongPicker(songs);

        console.log(
            "Song added:",
            song.title
        );

    }
    catch(error) {

        console.error(
            "Error saving song:",
            error
        );

        // Remove only the occurrence that was just added.  Filtering by
        // file/id would also remove earlier intentional duplicate copies.
        const failedIndex = selectedService.songs.lastIndexOf(serviceSong);
        if (failedIndex >= 0) selectedService.songs.splice(failedIndex, 1);

        alert(
            "Unable to save song."
        );

    }

}

window.selectSong = selectSong;

closeSongPicker.onclick = function(){
    songPicker.classList.remove("show");
};

async function startMultiScreenService(serviceId){
    const id=String(serviceId||"");
    const selected=services.find(s=>String(s.id)===id);
    if(!selected){ alert("Service Planner not found."); return; }
    const serviceSongs=Array.isArray(selected.songs)?selected.songs:[];
    if(!serviceSongs.length){ alert("This Service Planner has no songs yet."); return; }
    // Set the exact planner session before opening the dedicated Multi-Screen
    // control. The Multi-Screen page reads these values on startup.
    try{
        localStorage.setItem("currentServiceId",id);
        localStorage.setItem("currentServiceName",String(selected.name||"Service Planner"));
        localStorage.setItem("currentServiceSnapshot",JSON.stringify(selected));
        localStorage.setItem("currentSongIndex","0");
        localStorage.setItem("resumePresentation","true");
        localStorage.setItem("presentationMode","service");
        localStorage.setItem("startMultiScreenOnLoad","true");
    }catch(error){ console.warn("Unable to save Multi-Screen service session:",error); }
    const first=serviceSongs[0]||{};
    // Always enter the CHORDIO song runtime: it is also the host for the
    // Multi-Screen controller and can render both Firebase/custom songs from
    // the Service Planner snapshot.
    const target=`custom-song.html?id=${encodeURIComponent(first.id||"")}`;
    window.location.assign(target);
}
window.startMultiScreenService = startMultiScreenService;

function displayCurrentServiceName() {

    const serviceNameElement =
        document.getElementById(
            "currentServiceName"
        );

    if (!serviceNameElement) {
        return;
    }

    const serviceName =
        localStorage.getItem(
            "currentServiceName"
        );

    if (serviceName) {

        serviceNameElement.textContent =
            serviceName;

    }
    else {

        serviceNameElement.textContent =
            "No Active Service";

    }

}

displayCurrentServiceName();
async function deleteService(id) {

    console.log("DELETE BUTTON CLICKED");
    console.log("Service ID:", id);

    // ==========================================
    // CHECK LOGIN
    // ==========================================

    if (!currentUser) {

        alert("Please login first.");

        return;

    }


    // ==========================================
    // FIND SERVICE
    // ==========================================

    const service = services.find(function(service) {

        return String(service.id) === String(id);

    });


    if (!service) {

        console.error(
            "Service not found:",
            id
        );

        alert("Service not found.");

        return;

    }


    // ==========================================
    // CONFIRM DELETE
    // ==========================================

    const confirmed = confirm(
        `Delete "${service.name}"?`
    );


    if (!confirmed) {

        return;

    }


    try {

     // ==========================================
// DELETE FROM FIREBASE
// ==========================================

console.log(
    "Deleting from Firebase:",
    service.id
);

await deleteServiceCloud(
    currentUser.uid,
    String(service.id)
);

console.log(
    "Firebase delete successful"
);


// ==========================================
// REMOVE FROM LOCAL ARRAY
// ==========================================

services = services.filter(function(service) {

    return String(service.id) !== String(id);

});


// ==========================================
// REFRESH SERVICE PLANNER
// ==========================================

renderServices();

updateDashboard();

console.log(
    "SERVICE DELETED:",
    service.name
);

        // ==========================================
        // CLEAR ACTIVE SERVICE
        // ==========================================

        const currentServiceId =
            localStorage.getItem(
                "currentServiceId"
            );


        if (
            currentServiceId &&
            String(currentServiceId) === String(id)
        ) {

            localStorage.removeItem(
                "currentServiceId"
            );

            localStorage.removeItem(
                "currentSongIndex"
            );

            localStorage.removeItem(
                "resumePresentation"
            );

            localStorage.removeItem(
                "currentService"
            );

            localStorage.removeItem(
                "currentServiceName"
            );

        }


        // ==========================================
        // REFRESH SERVICE PLANNER
        // ==========================================

        renderServices();

        updateDashboard();


        console.log(
            "SERVICE DELETED:",
            service.name
        );

        console.log(
            "Remaining services:",
            services
        );

    }
    catch(error) {

        console.error(
            "DELETE SERVICE ERROR:",
            error
        );

        alert(
            "Unable to delete the service. Please try again."
        );

    }

}


window.deleteService = deleteService;
// ==========================================
// TOGGLE SERVICE
// ==========================================

function toggleService(id) {

    console.log("toggleService called:", id);

    const body = document.getElementById(
        "serviceBody" + id
    );

    const arrow = document.getElementById(
        "serviceArrow" + id
    );

    if (!body) {
        console.error(
            "Service body not found:",
            "serviceBody" + id
        );
        return;
    }

    body.classList.toggle("show");

    if (arrow) {

        if (body.classList.contains("show")) {
            arrow.textContent = "▼";
        } else {
            arrow.textContent = "▶";
        }

    }
}

// MAKE FUNCTION AVAILABLE TO HTML onclick=""
window.toggleService = toggleService;

/* =========================================================
   PRINT SELECTED SERVICE PLANNER
   Prints every song belonging to the chosen service, in the
   exact service order. Structured songs are fetched and
   their #lyrics markup is reused so chord/lyric positioning
   is preserved. Firebase custom songs use their structured
   sections directly.
   ========================================================= */
async function printServiceSongs(serviceId) {
    const id = serviceId != null
        ? String(serviceId)
        : String(localStorage.getItem("currentServiceId") || "");

    const service = services.find(s => String(s.id) === id);
    if (!service) {
        alert("Please select a valid Service Planner first.");
        return;
    }

    const songs = Array.isArray(service.songs) ? service.songs : [];
    if (!songs.length) {
        alert("This service has no songs to print.");
        return;
    }

    const escPrint = value => String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

    const normalizePrintKey = song =>
        song?.serviceKey || song?.key || song?.originalKey || "—";

    const buildPassing = song => {
        const key = normalizePrintKey(song);
        const roots = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
        const flats = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
        const clean = String(key).replace(/\s*(major|minor|maj|m)\s*$/i, "");
        const match = clean.match(/^[A-G](?:#|b)?/i);
        const root = match ? match[0][0].toUpperCase() + (match[0][1] || "") : "C";
        let idx = roots.indexOf(root);
        if (idx < 0) idx = flats.indexOf(root);
        if (idx < 0) idx = 0;
        const useFlats = root.includes("b") || clean.includes("b");
        const arr = useFlats ? flats : roots;
        const trans = n => arr[(idx + n + 120) % 12];
        const items = [
            ["RETURN TO VERSE 1", trans(7)],
            ["LAST 3", trans(9) + "m"]
        ];
        const category = String(song?.category || song?.genre || "").toLowerCase();
        if (category === "worship" || category.includes("worship")) {
            const plus5 = trans(5);
            items.push(["OUTRO", `${plus5} → ${plus5}m → ${key}`]);
            items.push(["SINGING IN THE SPIRIT", `${key} → ${plus5}`]);
        }
        return items;
    };

    document.getElementById("worshipHubServicePrintRoot")?.remove();
    const printRoot = document.createElement("div");
    printRoot.id = "worshipHubServicePrintRoot";
    printRoot.innerHTML = `
        <div class="service-print-songs"></div>
    `;
    const list = printRoot.querySelector(".service-print-songs");
    document.body.appendChild(printRoot);
    let servicePrintStyle = document.getElementById("chordioServicePrintStyle");
    if(servicePrintStyle) servicePrintStyle.remove();
    servicePrintStyle=document.createElement("style");
    servicePrintStyle.id="chordioServicePrintStyle";
    servicePrintStyle.textContent=`
      #worshipHubServicePrintRoot{display:none;}
      body.worshiphub-service-printing #worshipHubServicePrintRoot{display:block!important;position:static!important;visibility:visible!important;}
      body.worshiphub-service-printing #worshipHubServicePrintRoot .service-print-song{display:flex!important;flex-direction:column!important;position:relative!important;width:297mm!important;height:210mm!important;min-height:210mm!important;box-sizing:border-box!important;padding:12mm 14mm 10mm!important;margin:0 auto!important;background:#fff!important;color:#111!important;overflow:hidden!important;break-after:page!important;page-break-after:always!important;font-family:Arial,Helvetica,sans-serif!important;}
      body.worshiphub-service-printing #worshipHubServicePrintRoot .service-print-song:last-child{break-after:auto!important;page-break-after:auto!important;}
      body.worshiphub-service-printing #worshipHubServicePrintRoot .service-print-song h1{margin:0 0 3px!important;font-size:22pt!important;line-height:1.08!important;color:#111!important;}
      body.worshiphub-service-printing #worshipHubServicePrintRoot .service-print-artist{font-size:11pt!important;font-weight:600!important;margin-bottom:4px!important;}
      body.worshiphub-service-printing #worshipHubServicePrintRoot .service-print-key{font-size:10pt!important;margin-bottom:5px!important;}
      body.worshiphub-service-printing #worshipHubServicePrintRoot .service-print-passing{font-size:8.5pt!important;line-height:1.3!important;}
      body.worshiphub-service-printing #worshipHubServicePrintRoot .service-print-passing-item{display:inline-block!important;margin-right:5px!important;}
      body.worshiphub-service-printing #worshipHubServicePrintRoot .service-print-rule,body.worshiphub-service-printing #worshipHubServicePrintRoot .service-print-footer-rule{height:1px!important;background:#222!important;width:100%!important;margin:6px 0 8px!important;flex:0 0 auto!important;}
      body.worshiphub-service-printing #worshipHubServicePrintRoot .service-print-content{font-size:9.5pt!important;line-height:1.08!important;column-count:2!important;column-gap:9mm!important;column-fill:auto!important;column-width:auto!important;flex:1 1 auto!important;min-height:0!important;height:auto!important;overflow:hidden!important;}
      body.worshiphub-service-printing #worshipHubServicePrintRoot .song-section{display:block!important;margin:0 0 8px!important;break-inside:avoid!important;page-break-inside:avoid!important;}
      body.worshiphub-service-printing #worshipHubServicePrintRoot .section-title{display:block!important;background:transparent!important;color:#111!important;font-weight:900!important;text-transform:uppercase!important;letter-spacing:.05em!important;margin:0 0 2px!important;padding:0!important;font-size:9.5pt!important;}
      body.worshiphub-service-printing #worshipHubServicePrintRoot .song-line{display:block!important;margin:0 0 2px!important;padding:0!important;white-space:pre-wrap!important;font-family:Consolas,"Courier New",monospace!important;line-height:1.02!important;break-inside:avoid!important;page-break-inside:avoid!important;}
      body.worshiphub-service-printing #worshipHubServicePrintRoot .song-line .chord{display:block!important;color:#d21f2f!important;-webkit-text-fill-color:#d21f2f!important;font-weight:800!important;white-space:pre!important;}
      body.worshiphub-service-printing #worshipHubServicePrintRoot .song-line .print-lyric-text{display:block!important;color:#111!important;-webkit-text-fill-color:#111!important;white-space:pre-wrap!important;}
      body.worshiphub-service-printing #worshipHubServicePrintRoot .service-print-footer-rule{margin:6px 0 4px!important;}
      body.worshiphub-service-printing #worshipHubServicePrintRoot .service-print-footer{display:flex!important;justify-content:space-between!important;align-items:center!important;gap:12px!important;text-align:initial!important;font-size:8pt!important;color:#777!important;font-weight:600!important;letter-spacing:.02em!important;flex:0 0 auto!important;}
      body.worshiphub-service-printing #worshipHubServicePrintRoot .service-print-footer .service-print-footer-left{color:#777!important;}
      body.worshiphub-service-printing #worshipHubServicePrintRoot .service-print-footer .service-print-footer-right{margin-left:auto!important;color:#555!important;white-space:nowrap!important;}
      @page{size:A4 landscape;margin:0;}
      @media screen{body.worshiphub-service-printing #worshipHubServicePrintRoot{position:fixed!important;inset:0!important;z-index:999999!important;background:#e9edf2!important;overflow:auto!important;}body.worshiphub-service-printing #worshipHubServicePrintRoot .service-print-song{margin:0 auto 18px!important;box-shadow:0 4px 18px rgba(0,0,0,.12)!important;}}
      @media print{body.worshiphub-service-printing>*:not(#worshipHubServicePrintRoot){display:none!important;}body.worshiphub-service-printing #worshipHubServicePrintRoot{display:block!important;position:static!important;background:#fff!important;}body.worshiphub-service-printing #worshipHubServicePrintRoot .service-print-song{box-shadow:none!important;margin:0!important;} }`
    document.head.appendChild(servicePrintStyle);
    document.body.classList.add("worshiphub-service-printing");

    try {
        for (let i = 0; i < songs.length; i++) {
            const song = songs[i] || {};
            let lyricsMarkup = "";

            if (song.customSong && Array.isArray(song.sections)) {
                lyricsMarkup = song.sections.map(section => `
                    <section class="song-section">
                        <div class="section-title">${escPrint(`${section.type || ""} ${section.number || ""}`.trim())}</div>
                        ${(Array.isArray(section.lines) ? section.lines : []).map(line => {
                            const chords = Array.isArray(line?.chords) ? line.chords : [];
                            const chordText = typeof line?.chordText === "string" ? line.chordText : (() => {
                                if (!chords.length) return "";
                                const chars=[];
                                chords.slice().sort((a,b)=>(Number(a?.position)||0)-(Number(b?.position)||0)).forEach(c=>{
                                    const pos=Math.max(0,Number(c?.position)||0);
                                    const text=String(c?.originalChord || c?.chord || c?.value || "").trim();
                                    while(chars.length<pos) chars.push(" ");
                                    Array.from(text).forEach((ch,i)=>{chars[pos+i]=ch;});
                                });
                                return chars.join("");
                            })();
                            return `<div class="song-line"><span class="chord">${escPrint(chordText)}</span><br><span class="print-lyric-text">${escPrint(line?.lyrics || "")}</span></div>`;
                        }).join("")}
                    </section>
                `).join("");
            } else {
                console.warn("Structured song content is missing for service print:", song.title);
            }

            if (!lyricsMarkup) {
                lyricsMarkup = `<div class="service-print-missing">Lyrics/chords could not be loaded for this song.</div>`;
            }

            const passing = buildPassing(song);
            const article = document.createElement("article");
            article.className = "service-print-song";
            article.innerHTML = `
                <header class="service-print-song-header">
                    <h1>${escPrint(song.title || "Untitled Song")}</h1>
                    <div class="service-print-artist">${escPrint(song.artist || "")}</div>
                    <div class="service-print-key"><b>KEY:</b> ${escPrint(normalizePrintKey(song))}</div>
                    <div class="service-print-passing" aria-label="Auto-generated passing chords">
                        <b>PASSING CHORDS:</b> ${passing.map(([label, value]) => `<span class="service-print-passing-item"><b>${escPrint(label)}:</b> <span>${escPrint(value)}</span></span>`).join(' <span class="service-print-separator" aria-hidden="true">|</span> ')}
                    </div>
                    <div class="service-print-rule"></div>
                </header>
                <div class="service-print-content">${lyricsMarkup}</div>
                <div class="service-print-footer-rule"></div>
                <footer class="service-print-footer"><span class="service-print-footer-left">${escPrint(service.name || service.title || "Service Planner")} | ${escPrint(service.date || "Date not set")}</span><span class="service-print-footer-right">Page ${i + 1} / ${songs.length}</span></footer>
            `;

            article.querySelectorAll("button, input, select, textarea, script, style, .song-toolbar, .presentationScreen, #presentationScreen").forEach(el => el.remove());
            article.querySelectorAll(".section-title").forEach(el => {
                el.classList.add("service-print-section-title");
                el.style.background = "#ffd700";
                el.style.color = "#000";
            });
            article.querySelectorAll(".chord, .song-line, .song-line *:not(.service-print-section-title)").forEach(el => {
                el.style.background = "transparent";
                if (!el.classList.contains("chord")) el.style.color = "#111";
                if (!el.classList.contains("chord")) el.style.webkitTextFillColor = "#111";
                el.style.textShadow = "none";
                el.classList.remove("highlight", "highlighted", "active", "chord-highlight");
            });
            list.appendChild(article);
        }

        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        // Keep the requested one-song-per-A4-page format even for longer songs.
        // Reduce only the song body text when needed; the title/header/footer
        // remain readable and the page never spills into a second sheet.
        list.querySelectorAll('.service-print-song').forEach(article=>{
            const content=article.querySelector('.service-print-content');
            if(!content) return;
            let size=9.5;
            const min=5.8;
            const fit=()=>{
                let guard=0;
                const overflows=()=> content.scrollWidth>content.clientWidth+2 || content.scrollHeight>content.clientHeight+2;
                while(overflows() && size>min && guard<30){
                    size=Math.max(min,size-0.25);
                    content.style.fontSize=`${size}pt`;
                    content.style.lineHeight=String(Math.max(.88,1.08-(9.5-size)*0.012));
                    guard++;
                }
            };
            fit();
        });

        const cleanup = () => {
            document.body.classList.remove("worshiphub-service-printing");
            document.getElementById("worshipHubServicePrintRoot")?.remove();
            document.getElementById("chordioServicePrintStyle")?.remove();
            window.removeEventListener("afterprint", cleanup);
        };

        // Service Planner printing is intentionally a direct A4 browser print.
        // Do not send it through the multi-column Print Preview: every song must
        // start on its own A4 page.
        window.addEventListener("afterprint", cleanup, { once: true });
        setTimeout(cleanup, 60000);
        window.print();
    } catch (error) {
        console.error("Service print error:", error);
        document.body.classList.remove("worshiphub-service-printing");
        document.getElementById("worshipHubServicePrintRoot")?.remove();
        document.getElementById("chordioServicePrintStyle")?.remove();
        alert("Unable to prepare the Service Planner print preview. Please try again.");
    }
}
window.printServiceSongs = printServiceSongs;

async function renameService(id){

    const service = services.find(
        s => s.id == id
    );

    if(!service){
        alert("Service not found");
        return;
    }

    const newName = prompt(
        "Enter new service name:",
        service.name
    );

    if(!newName){
        return;
    }

    service.name = newName;

    await saveServicesCloud();

    renderServices();

}
window.renameService = renameService;
async function removeSongFromService(serviceId, songIndex){

    console.log(
        "REMOVE:",
        serviceId,
        songIndex
    );

    const service =
    services.find(
        s => s.id == serviceId
    );

    if(!service){

        alert("Service not found");

        return;

    }

    if(!confirm(
        "Remove this song from " + service.name + "?"
    )){

        return;

    }

    service.songs.splice(
        songIndex,
        1
    );

    await saveServicesCloud();

    renderServices();

}
window.removeSongFromService = removeSongFromService;
function searchSongs(keyword = ""){

    if(!keyword){

        keyword = document.getElementById("searchBox").value;

    }

    keyword = keyword.toLowerCase().trim();

    filteredSongs = songs.filter(function(song){

        return (

            song.title.toLowerCase().includes(keyword) ||

            song.artist.toLowerCase().includes(keyword) ||

            song.category.toLowerCase().includes(keyword) ||

            song.language.toLowerCase().includes(keyword)

        );

    });

    renderSongs(filteredSongs);

}
window.searchSongs = searchSongs;

/* =====================================
   CURRENT SERVICE HELPERS
===================================== */

function getCurrentService() {

    if (activeService) {
        return activeService;
    }

    return null;
}
function getCurrentSongIndex() {

    return Number(
        localStorage.getItem("currentSongIndex") || 0
    );

}
function setCurrentSongIndex(index) {

    localStorage.setItem(
        "currentSongIndex",
        index
    );

}
document.addEventListener("DOMContentLoaded", function(){

    renderSongs(songs);


    updateDashboard();

});
document.addEventListener("keydown", function(e){

    switch(e.key){

        case "ArrowRight":

            nextServiceSong();

            break;

        case "ArrowLeft":

            previousServiceSong();

            break;

        case "Escape":

            finishService();

            break;

    }

});

function getCurrentSong(){

    const service = getCurrentService();

    if(!service){

        return null;

    }

    const index = Number(
        localStorage.getItem("currentSongIndex") || 0
    );

    return service.songs[index];

}

function updateServiceProgress(){

    const label =
    document.getElementById("serviceProgress");

    if(!label){

        return;

    }

    const service = getCurrentService();

    if(!service){

        label.textContent = "";

        return;

    }

    const index = Number(
        localStorage.getItem("currentSongIndex") || 0
    );

    label.textContent =
        "Song " +
        (index+1) +
        " of " +
        service.songs.length;

}
function updateCurrentServiceName(){

    const label =
    document.getElementById(
        "currentService"
    );

    if(!label){

        return;

    }

    const service =
    getCurrentService();

    label.textContent =
        service
        ? service.name
        : "None";

}
function sortSongs(list) {

    return list.sort(function(a, b) {

        return a.title.localeCompare(
            b.title
        );

    });

}


function sortServices() {

    services.sort(function(a, b) {

        return a.name.localeCompare(
            b.name
        );

    });

}


function ensurePresentationCloseButton() {

    const overlay =
        document.getElementById("presentationScreen");

    if (!overlay) {
        return null;
    }

    let closeButton =
        document.getElementById("closePresentation");

    if (!closeButton) {

        closeButton =
            document.createElement("button");

        closeButton.id =
            "closePresentation";

        closeButton.type =
            "button";

        closeButton.setAttribute(
            "aria-label",
            "Close presentation"
        );

        closeButton.title =
            "Close presentation";

        closeButton.textContent =
            "×";

        overlay.appendChild(
            closeButton
        );
    }

    if (!closeButton.dataset.presentationCloseBound) {

        closeButton.addEventListener(
            "click",
            function (event) {

                event.preventDefault();
                event.stopPropagation();

                window.exitPresentation();
            }
        );

        closeButton.dataset.presentationCloseBound =
            "true";
    }

    closeButton.style.display = "flex";
    closeButton.style.visibility = "visible";
    closeButton.style.opacity = "1";
    closeButton.style.pointerEvents = "auto";
    closeButton.style.zIndex = "99999999";

    return closeButton;
}
window.exitPresentation = function () {

    console.log("EXIT PRESENTATION");

    const overlay =
        document.getElementById(
            "presentationScreen"
        );

    if (overlay) {
        overlay.classList.remove("show");
        overlay.style.display = "none";
    }

    localStorage.removeItem(
        "presentationMode"
    );

    localStorage.removeItem(
        "resumePresentation"
    );

    console.log(
        "PRESENTATION CLOSED"
    );
};

function editService(serviceId){
    const target=services.find(s=>String(s.id)===String(serviceId));
    if(!target){alert('Service Planner not found.');return;}
    if(window.chordioV63?.openEditService) window.chordioV63.openEditService(target);
}
window.editService=editService;

window.chordioUpdateService = async function(serviceId,payload){
    if(!currentUser){alert('Please login first.');return false;}
    const idx=services.findIndex(s=>String(s.id)===String(serviceId));
    if(idx<0){alert('Service Planner not found.');return false;}
    const updated={...services[idx],name:String(payload?.name||services[idx].name||'').trim(),date:String(payload?.date||''),songs:Array.isArray(payload?.songs)?payload.songs:[],updatedAt:new Date().toISOString()};
    if(!updated.name)return false;
    try{
        await saveService(currentUser.uid,updated);
        services[idx]=updated;window.services=services;
        try{localStorage.setItem('currentServiceSnapshot',JSON.stringify(updated));}catch(_){}
        if(String(localStorage.getItem('currentServiceId')||'')===String(updated.id)) window.chordioSyncServicePlannerOrder?.(updated.songs);
        renderServices();updateDashboard();
        return true;
    }catch(error){console.error('Service update error',error);alert('Unable to update Service Planner.');return false;}
};

// CHORDIO V63 — dashboard New Service creator bridge
window.chordioCreateService = async function(payload){
    if(!currentUser){ alert('Please login first.'); return false; }
    const service={id:String(Date.now()),name:String(payload?.name||'').trim(),date:String(payload?.date||''),songs:Array.isArray(payload?.songs)?payload.songs:[],notes:[],createdAt:new Date().toISOString()};
    if(!service.name) return false;
    try{
        const savedId=await saveService(currentUser.uid,service);
        service.id=String(savedId||service.id);
        const idx=services.findIndex(s=>String(s.id)===service.id);
        if(idx>=0) services[idx]={...service}; else services.push({...service});
        services.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
        window.services=services;
        renderServices();
        try{const fresh=await loadServices(currentUser.uid);if(Array.isArray(fresh)){services=fresh;services.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));window.services=services;renderServices();}}catch(_){ }
        return true;
    }catch(error){console.error('V63 create service error',error);alert('Unable to create service.');return false;}
};
