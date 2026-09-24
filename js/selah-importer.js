"use strict";

import { songs } from "./initial-songs.js";
import { auth, db } from "./firebase.js";
import { canAddSongs } from "./admin-settings.js";
import { collection, doc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const SELAH_API = "https://selah.jfcm-missions.com/wp-json/wp/v2/songs";
const STORAGE_KEY = "worshipHubCustomSongs";
const PAGE_SIZE = 100;
const BATCH_SIZE = 450;

function uid(prefix="selah") { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,9)}`; }
function clean(value) { return String(value ?? "").replace(/\u00a0/g," ").replace(/\r/g,"").replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n").trim(); }
function normalizeKey(value) {
  let k=clean(value).replace(/^key\s*[:\-]?\s*/i,"").replace(/\s+/g,"");
  k=k.replace(/major$/i,"").replace(/maj$/i,"").replace(/minor$/i,"m").replace(/min$/i,"m");
  const flatMap={Db:"C#",Eb:"D#",Gb:"F#",Ab:"G#",Bb:"A#",Dbm:"C#m",Ebm:"D#m",Gbm:"F#m",Abm:"G#m",Bbm:"A#m"};
  return flatMap[k]||k;
}
function guessKey(text) {
  const m=String(text||"").match(/(?:original\s+key|song\s+key|key|tonality|in\s+the\s+key\s+of)\s*[:\-]?\s*([A-G](?:#|b)?(?:\s*(?:m|min|maj|major|minor))?)/i);
  return m ? normalizeKey(m[1]) : "";
}
function chordTokens(text) {
  const out=[],re=/\S+/g; let m;
  while((m=re.exec(String(text||"")))) out.push({id:uid("chord"),chord:m[0],originalChord:m[0],position:m.index});
  return out;
}
function isChordOnly(line) {
  const t=String(line||"").trim(); if(!t) return false;
  const tokens=t.split(/\s+/).filter(Boolean); if(!tokens.length||tokens.length>24) return false;
  const chord=/^(?:[A-G](?:#|b)?(?:m|maj|min|sus|add|dim|aug|7|9|11|13|6|4|5|2|\+|-)*(?:\/[A-G](?:#|b)?)?|N\.?C\.?)$/i;
  return tokens.every(x=>chord.test(x)||/^\((?:\d+x|break|repeat|2x|3x)\)$/i.test(x)||/^[–—-]+$/.test(x));
}
function headingInfo(line) {
  const t=clean(line).replace(/^\[|\]$/g,"").replace(/[:\-]+$/g,"").trim();
  const m=t.match(/^(intro(?:duction)?|verse|v\.?\s*\d*|chorus|koro|pre[- ]?(?:chorus|koro)|bridge|tag|instrumental|interlude|outro|ending|end|coda|refrain|ending chorus)\s*(?:#|[- ]*)?(\d+)?$/i);
  if(!m) return null;
  const raw=m[1].toLowerCase().replace(/\s+/g," "); let type="Verse";
  if(/^intro/.test(raw)) type="Intro"; else if(/^chorus$|^koro$|^refrain$|ending chorus/.test(raw)) type="Chorus"; else if(/^pre/.test(raw)) type="Pre-Chorus"; else if(/^bridge/.test(raw)) type="Bridge"; else if(/^tag/.test(raw)) type="Tag"; else if(/^instrumental/.test(raw)) type="Instrumental"; else if(/^interlude/.test(raw)) type="Interlude"; else if(/^outro|^ending|^end|^coda/.test(raw)) type="Outro";
  return {type,number:Number(m[2])||1};
}
function htmlParagraphLines(html) {
  const doc=new DOMParser().parseFromString(String(html||""),"text/html");
  const paragraphs=[...doc.querySelectorAll("p")]; const source=paragraphs.length?paragraphs:[...doc.body.children]; const lines=[];
  for(const el of source){ const clone=el.cloneNode(true); clone.querySelectorAll("br").forEach(br=>br.replaceWith("\n")); const text=(clone.textContent||"").replace(/\u00a0/g," ").replace(/\r/g,""); text.split("\n").map(x=>x.trimEnd()).forEach(x=>{const v=x.trim();if(v)lines.push(v);}); }
  return lines;
}
function buildSections(html) {
  const lines=htmlParagraphLines(html),sections=[],counters={}; let current=null;
  const add=(type,number)=>{counters[type]=(counters[type]||0)+1;current={id:uid("section"),type,number:number||counters[type],lines:[]};sections.push(current);};
  for(let i=0;i<lines.length;i++){
    const line=lines[i],h=headingInfo(line); if(h){add(h.type,h.number);continue;} if(!current)add("Verse",1);
    if(i+1<lines.length&&isChordOnly(line)&&!isChordOnly(lines[i+1])){const lyric=lines[++i];current.lines.push({id:uid("line"),lyrics:lyric,chordText:line,chords:chordTokens(line)});}
    else if(isChordOnly(line)) current.lines.push({id:uid("line"),lyrics:"",chordText:line,chords:chordTokens(line)});
    else current.lines.push({id:uid("line"),lyrics:line,chordText:"",chords:[]});
  }
  return sections.filter(s=>s.lines.some(l=>String(l.lyrics||"").trim()||String(l.chordText||"").trim()));
}
function parseSelahRecord(record) {
  const id=Number(record?.id),title=clean(record?.title?.rendered||record?.title||"Untitled Song"),html=String(record?.content?.rendered||""),key=guessKey(html),songId=`selah-${id}`;
  return {id:songId,title,artist:"Selah",category:"Selah",language:"",key,originalKey:key,serviceKey:key||"C",youtube:"",source:"Selah",sourceId:id,sourceUrl:String(record?.link||""),file:`custom-song.html?id=${encodeURIComponent(songId)}`,customSong:true,structuredVersion:2,contentVersion:2,sourceMigratedFromHtml:true,sourceHtmlPreserved:html,selahModified:String(record?.modified||""),selahSlug:String(record?.slug||""),selahStatus:String(record?.status||"publish"),selahAuthorId:record?.author??null,sections:buildSections(html),updatedAt:new Date().toISOString(),createdAt:String(record?.date||new Date().toISOString())};
}
async function fetchPage(page,useProxy=false) {
  const url=`${SELAH_API}?per_page=${PAGE_SIZE}&page=${page}&_envelope=1`,target=useProxy?`https://r.jina.ai/${url}`:url;
  const response=await fetch(target,{mode:"cors",credentials:"omit",cache:"no-store"}); if(!response.ok)throw new Error(`HTTP ${response.status} while reading Selah page ${page}`);
  const raw=await response.text(); let envelope;
  try{envelope=JSON.parse(raw);}catch(e){const start=raw.indexOf("{");const end=raw.lastIndexOf("}");if(start<0||end<=start)throw new Error("Selah returned an unreadable response.");envelope=JSON.parse(raw.slice(start,end+1));}
  const body=Array.isArray(envelope)?envelope:envelope?.body; if(!Array.isArray(body))throw new Error(`Selah page ${page} did not return a song array.`);
  const headers=envelope?.headers||{}; return {records:body,total:Number(headers["X-WP-Total"]||headers["x-wp-total"]||0),totalPages:Number(headers["X-WP-TotalPages"]||headers["x-wp-totalpages"]||0)};
}
function findSelahSong(sourceId){return songs.find(s=>Number(s?.sourceId)===Number(sourceId)||String(s?.id||"")===`selah-${sourceId}`);}
function saveLocal(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(songs.filter(s=>s&&s.customSong===true)));}catch(e){console.warn("Unable to save imported Selah songs locally:",e);}}
async function saveFirebaseBulk(imported){
  if(!auth.currentUser||!imported.length)return {saved:0,failed:false}; let saved=0;
  try{for(let start=0;start<imported.length;start+=BATCH_SIZE){const batch=writeBatch(db),chunk=imported.slice(start,start+BATCH_SIZE);chunk.forEach(song=>batch.set(doc(collection(db,"songs"),String(song.id)),{...song,public:true,customSong:true,updatedAt:serverTimestamp(),createdAt:song.createdAt||serverTimestamp()},{merge:true}));await batch.commit();saved+=chunk.length;}return {saved,failed:false};}
  catch(error){console.error("Bulk Selah Firebase import failed:",error);return {saved,failed:true,error};}
}
function renderStatus(message,percent=null,kind="info"){const box=document.getElementById("selahImportStatus");if(!box)return;box.className=`selah-import-status ${kind}`;box.querySelector(".selah-import-message").textContent=message;const bar=box.querySelector(".selah-import-progress");if(percent===null){bar.style.width="0%";bar.parentElement.style.display="none";}else{bar.parentElement.style.display="block";bar.style.width=`${Math.max(0,Math.min(100,percent))}%`;}}
function setButtonBusy(busy){const btn=document.getElementById("importAllSelahBtn");if(!btn)return;btn.disabled=busy;btn.innerHTML=busy?'<span class="quick-icon"><i class="fa-solid fa-arrows-rotate fa-spin"></i></span><span>Importing Selah…</span>':'<span class="quick-icon"><i class="fa-solid fa-cloud-arrow-down"></i></span><span>Import All Selah Songs</span>';}
function ensureUI(){
  if(document.getElementById("importAllSelahBtn"))return;
  // CHORDIO's modern sidebar is rebuilt by chordio-v63-ux.js after the page loads.
  // Insert the Selah control into the visible sidebar actions, not next to the
  // hidden compatibility button used by the app internals.
  const actions=document.querySelector(".chordio-sidebar-actions");
  if(!actions)return;
  const anchor=actions.querySelector('[data-sidebar-quick="import"]');
  const btn=document.createElement("button");btn.id="importAllSelahBtn";btn.type="button";btn.className="chordio-sidebar-action chordio-selah-import-button";btn.title="Automatically import or update the complete Selah song library";btn.innerHTML='<span class="quick-icon"><i class="fa-solid fa-cloud-arrow-down"></i></span><span>Import All Selah Songs</span>';if(anchor) anchor.insertAdjacentElement("afterend",btn); else actions.appendChild(btn);
  const modal=document.createElement("div");modal.id="selahImportModal";modal.className="chordio-modal";modal.setAttribute("aria-hidden","true");modal.innerHTML=`<div class="chordio-dialog selah-import-dialog" role="dialog" aria-modal="true" aria-labelledby="selahImportTitle"><div class="chordio-dialog-head"><div><span>SELAH MUSIC LIBRARY</span><h3 id="selahImportTitle">Import All Selah Songs</h3></div><button type="button" id="closeSelahImport" aria-label="Close">✕</button></div><p class="chordio-dialog-help">CHORDIO will automatically retrieve every available Selah API page, remove duplicate Selah IDs, and add or update the songs in the library.</p><div class="selah-import-summary"><div><strong id="selahImportCount">0</strong><span>songs processed</span></div><div><strong id="selahImportPages">0 / 0</strong><span>API pages</span></div><div><strong id="selahImportAdded">0</strong><span>new / updated</span></div></div><div id="selahImportStatus" class="selah-import-status info"><div class="selah-import-message">Ready to import.</div><div class="selah-import-progress-wrap"><div class="selah-import-progress"></div></div></div><div class="selah-import-actions"><button type="button" id="cancelSelahImport" class="secondary">Close</button><button type="button" id="startSelahImport" class="primary"><i class="fa-solid fa-cloud-arrow-down"></i> Start Import</button></div></div>`;document.body.appendChild(modal);
  const open=()=>{modal.classList.add("show");modal.setAttribute("aria-hidden","false");};const close=()=>{if(!window.__selahImportRunning){modal.classList.remove("show");modal.setAttribute("aria-hidden","true");}};
  btn.addEventListener("click",async()=>{if(!(await canAddSongs(auth.currentUser))){alert("You do not have permission to import Selah songs.");return;}open();});
  document.getElementById("closeSelahImport").addEventListener("click",close);document.getElementById("cancelSelahImport").addEventListener("click",close);document.getElementById("startSelahImport").addEventListener("click",runImport);
   document.addEventListener("worshiphub:permissions-updated",ev=>{const admin=!!ev.detail?.isAdmin;btn.disabled=!admin;btn.setAttribute("aria-disabled",String(!admin));btn.classList.toggle("permission-disabled",!admin);});
}
async function runImport(){
  if(window.__selahImportRunning)return;window.__selahImportRunning=true;setButtonBusy(true);const start=document.getElementById("startSelahImport"),close=document.getElementById("cancelSelahImport");if(start)start.disabled=true;if(close)close.textContent="Run in Background";
  try{
    renderStatus("Connecting to Selah…",2);let first;try{first=await fetchPage(1,false);}catch(error){console.warn("Direct Selah API access failed; trying public proxy:",error);first=await fetchPage(1,true);}
    const total=first.total||first.records.length,totalPages=first.totalPages||Math.max(1,Math.ceil(total/PAGE_SIZE));document.getElementById("selahImportPages").textContent=`1 / ${totalPages}`;const all=[...first.records];document.getElementById("selahImportCount").textContent=String(all.length);renderStatus(`Page 1 of ${totalPages} loaded — ${all.length} songs found.`,Math.min(100,1/totalPages*100));
    for(let page=2;page<=totalPages;page++){let result;try{result=await fetchPage(page,false);}catch(error){result=await fetchPage(page,true);}all.push(...result.records);document.getElementById("selahImportPages").textContent=`${page} / ${totalPages}`;document.getElementById("selahImportCount").textContent=String(all.length);renderStatus(`Downloading Selah page ${page} of ${totalPages}…`,page/totalPages*100);await new Promise(resolve=>setTimeout(resolve,25));}
    const unique=new Map();all.forEach(record=>{if(record?.id!=null)unique.set(Number(record.id),record);});const imported=[...unique.values()].map(parseSelahRecord).filter(song=>song.sourceId&&song.title);
    let added=0,updated=0,unchanged=0;
    for(const incoming of imported){const existing=findSelahSong(incoming.sourceId);if(existing){const same=String(existing.selahModified||"")===String(incoming.selahModified||"")&&String(existing.sourceUrl||"")===String(incoming.sourceUrl||"");if(same){unchanged++;continue;}incoming.createdAt=existing.createdAt||incoming.createdAt;incoming.serviceKey=existing.serviceKey||incoming.serviceKey;incoming.transpose=existing.transpose??0;const idx=songs.indexOf(existing);if(idx>=0)songs[idx]={...existing,...incoming};updated++;}else{songs.push(incoming);added++;}}
    saveLocal();const firebaseResult=await saveFirebaseBulk(imported);window.dispatchEvent(new CustomEvent("worshiphub:songs-updated",{detail:{selahImport:true,imported:imported.length,added,updated,unchanged}}));document.getElementById("selahImportAdded").textContent=String(added+updated);renderStatus(`Import complete — ${imported.length} Selah songs processed. ${added} new, ${updated} updated, ${unchanged} unchanged.${firebaseResult.failed?" Local library was updated, but Firebase sync needs to be retried.":" Firebase sync completed."}`,100,firebaseResult.failed?"warning":"success");if(start){start.disabled=false;start.innerHTML='<i class="fa-solid fa-rotate"></i> Run Again';}if(close)close.textContent="Close";alert(`Selah import complete.\n\n${imported.length} songs processed\n${added} new\n${updated} updated\n${unchanged} unchanged${firebaseResult.failed?"\n\nFirebase sync could not be completed.":""}`);
  }catch(error){console.error("CHORDIO Selah bulk import failed:",error);renderStatus(`Import stopped: ${error.message||error}`,null,"error");if(start){start.disabled=false;start.innerHTML='<i class="fa-solid fa-rotate"></i> Try Again';}if(close)close.textContent="Close";alert(`Selah import could not be completed.\n\n${error.message||error}`);}
  finally{window.__selahImportRunning=false;setButtonBusy(false);}
}
const style=document.createElement("style");style.textContent=`
.chordio-selah-import-button{display:flex!important;align-items:center!important;gap:11px!important;width:100%!important;min-height:48px!important;padding:6px 9px!important;border-radius:12px!important;border:0!important;background:transparent!important;color:inherit!important;text-align:left!important;cursor:pointer!important}.chordio-selah-import-button:hover{background:rgba(189,154,50,.08)!important}.chordio-selah-import-button:disabled{opacity:.65;cursor:not-allowed}.chordio-selah-import-button .quick-icon{width:34px;height:34px;min-width:34px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;background:linear-gradient(145deg,#d9b34a,#b98b19);color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.35),0 3px 8px rgba(151,111,8,.25)}.selah-import-dialog{width:min(720px,96vw)}.selah-import-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:15px 20px}.selah-import-summary>div{border:1px solid #e0e5e9;border-radius:11px;padding:12px;text-align:center;background:#f9fafb}.selah-import-summary strong{display:block;font-size:22px;color:#172635}.selah-import-summary span{font-size:10px;color:#78838c;font-weight:800;text-transform:uppercase;letter-spacing:.05em}.selah-import-status{margin:0 20px 15px;padding:13px 14px;border:1px solid #dfe5ea;border-radius:10px;background:#f8fafb}.selah-import-status.success{border-color:#b9d8c2;background:#f4fbf6}.selah-import-status.warning{border-color:#e4d29c;background:#fffaf0}.selah-import-status.error{border-color:#e1b9b9;background:#fff7f7}.selah-import-message{font-size:12px;color:#4e5b65;line-height:1.5}.selah-import-progress-wrap{height:7px;background:#e7ebef;border-radius:99px;overflow:hidden;margin-top:10px;display:none}.selah-import-progress{height:100%;width:0;background:#b58a00;transition:width .2s ease}.selah-import-actions{display:flex;justify-content:flex-end;gap:9px;padding:12px 20px;background:#f8fafb;border-top:1px solid #e4e9ed}.selah-import-actions button{padding:10px 14px;border-radius:8px;border:1px solid #cfd7df;background:#fff;font-weight:800;cursor:pointer}.selah-import-actions button.primary{background:#172a3a;color:#fff;border-color:#172a3a}.selah-import-actions button:disabled{opacity:.6;cursor:not-allowed}@media(max-width:600px){.selah-import-summary{grid-template-columns:1fr}.selah-import-dialog{max-height:92vh}}`;
document.head.appendChild(style);document.addEventListener("DOMContentLoaded",ensureUI);setTimeout(ensureUI,500);setTimeout(ensureUI,1500);setTimeout(ensureUI,3000);window.CHORDIOSelahImporter={run:runImport};
