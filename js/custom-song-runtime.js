"use strict";

import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const FLATS = {Db:"C#", Eb:"D#", Gb:"F#", Ab:"G#", Bb:"A#"};
let song = null;
let transpose = 0;
let fontSize = 3;
let service = null;
let index = 0;

function esc(value){return String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function transposeChord(chord){
    const value = String(chord || "").trim();
    if (!value) return "";
    return value.replace(/^[A-G](?:#|b)?/, note => {
        let normalized = FLATS[note] || note;
        const index = SHARP.indexOf(normalized);
        if (index < 0) return note;
        return SHARP[(index + transpose + 12) % 12];
    });
}
function render(){
    document.getElementById("songTitle").textContent=song?.title||"Untitled Song";
    document.getElementById("songArtist").textContent=song?.artist||"";
    document.getElementById("songKey").textContent=transposeChord(song?.originalKey||song?.key||"—");
    const stage=document.getElementById("stage");
    const sections=Array.isArray(song?.sections)?song.sections:[];
    if(!sections.length){stage.innerHTML='<div class="empty">This song has no structured lyrics yet.</div>';return;}
    stage.innerHTML=sections.map(section=>`<section class="section"><div class="section-title">${esc(section.type)} ${section.number||""}</div>${(section.lines||[]).map(line=>{
        const chordHTML=(line.chords||[]).map(c=>`<span class="chord" data-original-chord="${esc(c.chord)}" style="left:${Number(c.position||0)*15}px">${esc(transposeChord(c.chord))}</span>`).join("");
        return `<div class="line"><div class="chords">${chordHTML}</div><div class="lyrics" style="font-size:calc(22px + ${fontSize}px)">${esc(line.lyrics||"")}</div></div>`;
    }).join("")}</section>`).join("");
    updateCounter();
}
function updateCounter(){document.getElementById("counter").textContent=service?`Song ${index+1} / ${service.songs.length}`:"Custom Song";}
function redirectSong(nextSong){if(!nextSong)return; if(nextSong.customSong || String(nextSong.file||"").startsWith("custom-song.html")){window.location.href=nextSong.file||`custom-song.html?id=${encodeURIComponent(nextSong.id)}`;return;} const file=String(nextSong.file||"").split("/").pop(); if(file) window.location.href=`/WorshipHub/songs/${file}`;}
async function load(){
    const params=new URLSearchParams(location.search); const id=params.get("id");
    const serviceId=localStorage.getItem("currentServiceId");
    index=Number(localStorage.getItem("currentSongIndex")||0);
    if(serviceId){
        try{
            const user=auth.currentUser;
            if(user){const snap=await getDoc(doc(db,"users",user.uid,"services",String(serviceId))); if(snap.exists()){service={id:snap.id,...snap.data()};if(Array.isArray(service.songs)&&service.songs[index]){song=service.songs[index];}}}
        }catch(e){console.warn("Unable to load service song",e)}
    }
    if(!song && id){
        try{const list=JSON.parse(localStorage.getItem("worshipHubCustomSongs")||"[]");song=list.find(s=>String(s.id)===String(id))||null}catch(e){}
    }
    if(!song){document.getElementById("stage").innerHTML='<div class="empty">Song could not be loaded.</div>';return;}
    transpose=Number(song.transpose||0);
    render();
}

document.getElementById("plus").onclick=()=>{fontSize=Math.min(14,fontSize+1);render()};
document.getElementById("minus").onclick=()=>{fontSize=Math.max(0,fontSize-1);render()};
document.getElementById("up").onclick=()=>{
    transpose += 1;
    render();
};
document.getElementById("down").onclick=()=>{
    transpose -= 1;
    render();
};
document.getElementById("close").onclick=()=>{if(history.length>1)history.back();else window.location.href="index.html"};
document.getElementById("prev").onclick=()=>{if(service&&index>0){index--;localStorage.setItem("currentSongIndex",String(index));redirectSong(service.songs[index])}};
document.getElementById("next").onclick=()=>{if(service&&index<service.songs.length-1){index++;localStorage.setItem("currentSongIndex",String(index));redirectSong(service.songs[index])}};
onAuthStateChanged(auth,()=>load());
