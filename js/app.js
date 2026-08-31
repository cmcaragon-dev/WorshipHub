
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
    collectionGroup,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
    loadPlaylists,
    savePlaylist,
    deletePlaylistCloud,
    loadServices,
    saveService,
    saveServices,
    deleteServiceCloud
} from "./firestore.js";

import { songs } from "./initial-songs.js";

// =====================================
// CUSTOM SONG LIBRARY SYNC
// =====================================
function syncCustomSongsIntoLibrary() {
    try {
        const saved = JSON.parse(localStorage.getItem("worshipHubCustomSongs") || "[]");
        if (!Array.isArray(saved)) return;
        saved.forEach(customSong => {
            if (!customSong || !customSong.id) return;
            const existingIndex = songs.findIndex(s => String(s.id) === String(customSong.id));
            if (existingIndex >= 0) songs[existingIndex] = customSong;
            else songs.push(customSong);
        });
    } catch (error) {
        console.warn("Unable to sync custom songs:", error);
    }
}

syncCustomSongsIntoLibrary();

async function syncSongYoutubeLinksIntoLibrary(){
    try{
        const snap=await getDocs(collection(db,"songs"));
        snap.forEach(d=>{
            const data=d.data()||{};
            const key=String(data.id||d.id).trim();
            if(!key || !data.youtube) return;
            const song=songs.find(s=>String(s.id??s.file??"").trim()===key);
            if(song) song.youtube=String(data.youtube||"");
        });
        if(typeof renderSongs==="function") renderSongs(songs);
        if(typeof renderAllSongsTable==="function") renderAllSongsTable(songs);
    }catch(error){
        console.warn("Unable to sync song YouTube links:",error);
    }
}

window.addEventListener("worshiphub:songs-updated", function() {
    syncCustomSongsIntoLibrary();
    if (typeof renderSongs === "function") renderSongs(songs);
    if (typeof renderAllSongsTable === "function") renderAllSongsTable(songs);
    if (typeof updateDashboard === "function") updateDashboard();
});


/* =====================================
   CURRENT USER
===================================== */

let currentUser = null;
const ADMIN_EMAIL = "jfcm.s07@gmail.com";
const isCurrentAdmin = () => String(currentUser?.email || "").trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();


/* =====================================
   USER DATA
===================================== */

let playlists = [];

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

onAuthStateChanged(auth, async function(user) {

    console.log("Firebase authentication state:", user);

    /* =====================================
       NOT LOGGED IN
    ===================================== */

    if (!user) {

        window.location.href = "login.html";

        return;

    }


    /* =====================================
       LOGGED IN
    ===================================== */

    currentUser = user;
    showAdminServiceButton();

    await syncSongYoutubeLinksIntoLibrary();

    console.log("Logged in user:", currentUser.uid);
    console.log("Email:", currentUser.email);


    /* =====================================
       LOAD USER PLAYLISTS
    ===================================== */

    try {

        playlists = await loadPlaylists(
            currentUser.uid
        );

        playlists.sort(function(a, b) {

            return (a.name || "").localeCompare(
                b.name || ""
            );

        });

        console.log(
            "User playlists:",
            playlists
        );

    }
    catch(error) {

        console.error(
            "Playlist loading error:",
            error
        );

        playlists = [];

    }


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

    if (typeof renderPlaylists === "function") {

        renderPlaylists();

    }


    if (typeof renderServices === "function") {

        renderServices();

    }


    if (typeof updatePlaylistCounter === "function") {

        updatePlaylistCounter();

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
    renderAllSongsTable([...songs].sort((a,b) => String(a.title || "").localeCompare(String(b.title || ""))));
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


    renderAllSongsTable(filteredSongs);

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
    renderAllSongsTable(songs);

}

// Make available to HTML onclick=""
window.clearAllSongsSearch = clearAllSongsSearch;

// ==========================================
// RENDER ALL SONGS TABLE
// ==========================================

function renderAllSongsTable(songList) {
    const tableBody = document.getElementById("allSongsTableBody");
    if (!tableBody) return;

    tableBody.innerHTML = "";
    const list = Array.isArray(songList) ? songList : [];

    if (!list.length) {
        tableBody.innerHTML = `
            <tr><td colspan="7" style="text-align:center;padding:40px;color:#98a2b3;">
                🔍 No songs found.
            </td></tr>`;
        return;
    }

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
                   title="${song.youtube ? "Open YouTube link" : "No YouTube link added"}">📺 YouTube</a>
                ${song.customSong ? `
                    <button type="button" class="song-action-btn edit" data-song-action="edit" data-song-id="${escapeHtml(song.id)}">✏ Edit</button>
                    <button type="button" class="song-action-btn delete" data-song-action="delete" data-song-id="${escapeHtml(song.id)}">🗑 Delete</button>
                ` : ''}
            </td>`;

        if (song.customSong) {
            row.querySelector('[data-song-action="edit"]')?.addEventListener("click", () => {
                const target = songs.find(x => String(x.id) === String(song.id));
                if (target && window.WorshipHubSongEditor?.open) {
                    window.WorshipHubSongEditor.open(target);
                }
            });
            row.querySelector('[data-song-action="delete"]')?.addEventListener("click", async () => {
                if (window.WorshipHubSongEditor?.deleteSong) {
                    const deleted = await window.WorshipHubSongEditor.deleteSong(song.id);
                    if (deleted) renderAllSongsTable(songs);
                }
            });
        }

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

document.addEventListener(
    "DOMContentLoaded",
    function() {

        const searchInput =
            document.getElementById("allSongsSearch");

        if (!searchInput) {
            return;
        }

        searchInput.addEventListener(
            "keydown",
            function(event) {

                if (event.key === "Enter") {

                    searchAllSongs();

                }

            }
        );

    }
);
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

/* =====================================
   ADMIN: ALL SERVICE PLANS
===================================== */
const allServicePlanBtn = document.getElementById("allServicePlanBtn");
const allServicePlanPanel = document.getElementById("allServicePlanPanel");
const closeAllServicePlans = document.getElementById("closeAllServicePlans");
const allServicePlanList = document.getElementById("allServicePlanList");
const adminServiceUser = document.getElementById("adminServiceUser");
const adminServiceName = document.getElementById("adminServiceName");
const adminCreateService = document.getElementById("adminCreateService");

function showAdminServiceButton(){
    if(allServicePlanBtn) allServicePlanBtn.style.display = isCurrentAdmin() ? "block" : "none";
}

async function loadAllServicePlans(){
    if(!isCurrentAdmin() || !allServicePlanList) return;
    allServicePlanList.innerHTML = '<div class="empty-message">Loading all service plans…</div>';
    try{
        const [serviceSnap, usersSnap] = await Promise.all([
            getDocs(collectionGroup(db,"services")),
            getDocs(collection(db,"users"))
        ]);
        const users = new Map();
        usersSnap.forEach(d=>users.set(d.id, d.data()||{}));
        const plans=[];
        serviceSnap.forEach(d=>{
            const parentUser = d.ref.parent.parent?.id || "";
            const data=d.data()||{};
            const u=users.get(parentUser)||{};
            plans.push({id:d.id, ownerUid:parentUser, ownerEmail:u.email||u.displayName||parentUser, ...data});
        });
        plans.sort((a,b)=>String(a.ownerEmail||"").localeCompare(String(b.ownerEmail||"")) || String(a.name||"").localeCompare(String(b.name||"")));
        renderAllServicePlans(plans);
        if(adminServiceUser){
            const opts=[...users.entries()].sort((a,b)=>String(a[1]?.email||a[1]?.displayName||a[0]).localeCompare(String(b[1]?.email||b[1]?.displayName||b[0])));
            adminServiceUser.innerHTML=opts.map(([uid,u])=>`<option value="${escapeHtml(uid)}">${escapeHtml(u.email||u.displayName||uid)}</option>`).join("");
        }
    }catch(error){
        console.error("Unable to load all service plans:",error);
        allServicePlanList.innerHTML='<div class="empty-message">Unable to load all service plans. Please check Firebase permissions.</div>';
    }
}

function renderAllServicePlans(plans){
    if(!allServicePlanList) return;
    if(!plans.length){ allServicePlanList.innerHTML='<div class="empty-message">No Service Plans have been created yet.</div>'; return; }
    allServicePlanList.innerHTML=plans.map(plan=>{
        const songsList=Array.isArray(plan.songs)?plan.songs:[];
        return `<div class="service-item admin-all-service-item">
            <div class="service-header" onclick="this.parentElement.classList.toggle('expanded')">
              <div><div class="service-title">▶ ${escapeHtml(plan.name||"Untitled Service")}</div>
              <div class="service-count">👤 ${escapeHtml(plan.ownerEmail||plan.ownerUid)} · ${songsList.length} ${songsList.length===1?"Song":"Songs"}</div></div>
            </div>
            <div class="service-body" style="display:none">
              ${songsList.length?songsList.map((song,i)=>`<div class="service-song"><div class="service-song-info"><div class="service-song-title">🎵 ${escapeHtml(song.title||"Untitled Song")}</div><div class="service-song-key">🎼 ${escapeHtml(song.serviceKey||song.key||song.originalKey||"—")}</div></div></div>`).join(""):'<div class="empty-message">No songs in this plan.</div>'}
            </div>
        </div>`;
    }).join("");
    allServicePlanList.querySelectorAll('.admin-all-service-item').forEach(item=>{
        const body=item.querySelector('.service-body');
        item.querySelector('.service-header')?.addEventListener('click',()=>{ body.style.display=body.style.display==='none'?'block':'none'; });
    });
}

if(allServicePlanBtn) allServicePlanBtn.addEventListener('click', async()=>{ allServicePlanPanel?.classList.add('show'); await loadAllServicePlans(); });
if(closeAllServicePlans) closeAllServicePlans.addEventListener('click',()=>allServicePlanPanel?.classList.remove('show'));
if(adminCreateService) adminCreateService.addEventListener('click',async()=>{
    if(!isCurrentAdmin()){ alert('Administrator access required.'); return; }
    const uid=adminServiceUser?.value;
    const name=adminServiceName?.value.trim();
    if(!uid || !name){ alert('Please select a user and enter a service plan name.'); return; }
    const service={id:String(Date.now()),name,songs:[],notes:[],createdAt:new Date().toISOString(),createdByAdmin:true,createdByUid:currentUser.uid};
    try{
        await saveService(uid,service);
        adminServiceName.value='';
        await loadAllServicePlans();
        alert('Service Plan created for the selected user.');
    }catch(error){ console.error(error); alert('Unable to create the Service Plan for this user. Please check Firebase permissions.'); }
});

window.loadAllServicePlans=loadAllServicePlans;

/* =====================================
   PLAYLIST MANAGER
===================================== */


const playlistBtn =
document.getElementById("playlistBtn");

const playlistPanel =
document.getElementById("playlistPanel");

const closePlaylist =
document.getElementById("closePlaylist");

const playlistList =
document.getElementById("playlistList");

const playlistName =
document.getElementById("playlistName");

const createPlaylist =
document.getElementById("createPlaylist");

playlistBtn.onclick=function(){

    playlistPanel.classList.add("show");

    renderPlaylists();

}

closePlaylist.onclick=function(){

    playlistPanel.classList.remove("show");

}

createPlaylist.onclick =
async function() {

    if (!currentUser) {

        alert(
            "Please login first."
        );

        return;

    }


    const name =
        playlistName.value.trim();


    if (!name) {

        alert(
            "Please enter a playlist name."
        );

        return;

    }


    const youtube =
        prompt(
            "Enter YouTube link for this playlist (optional):"
        ) || "";


    const playlist = {

        id: String(Date.now()),

        name: name,

        youtube: youtube,

        songs: [],

        createdAt:
            new Date().toISOString()

    };


    try {

        await savePlaylist(
            currentUser.uid,
            playlist
        );


        playlists.push(
            playlist
        );


        playlists.sort(
            (a, b) =>
                a.name.localeCompare(
                    b.name
                )
        );


        playlistName.value = "";


        renderPlaylists();


        updatePlaylistCounter();


    }
    catch(error) {

        console.error(
            "Create playlist error:",
            error
        );

        alert(
            "Unable to create playlist."
        );

    }

};

function renderPlaylists(){
playlists.sort(function(a,b){

    return a.name.localeCompare(b.name);

});
    playlistList.innerHTML="";

    playlists.forEach(function(list){

        let songsHtml="";

        list.songs.forEach(function(song,index){

            songsHtml += `

            <div class="playlist-song">

                <div>

                    🎵 ${song.title}

                    <br>

                    <small>${song.artist}</small>

                </div>

                <div>



<button class="youtube-btn"
    onclick="openSongYoutube('${song.youtube || ""}')">
    📺
</button>

                    <button class="remove-song-btn"
        onclick="removeSongFromPlaylist(${list.id},${index})">

    ❌ 

</button>

                </div>

            </div>

            `;

        });

        playlistList.innerHTML += `

<div class="service-item">

    <div class="service-header"
         onclick="togglePlaylist(${list.id})">

        <div>

            <div class="service-title">

                <span id="playlistArrow${list.id}">
                    ▶
                </span>

                ${list.name}

            </div>

            <div class="service-count">

                ${list.songs.length} Songs

            </div>

        </div>

    </div>

    <div id="playlistBody${list.id}"
         class="service-body">

        <button onclick="addSongsToPlaylist(${list.id})">

            ➕ Add Songs

       

<button onclick="openYoutube(${list.id})">

    📺 YouTube

</button>

<button onclick="editYoutube(${list.id})">

    🔗 Edit Link

</button>

        <button onclick="renamePlaylist(${list.id})">

            ✏ Rename

        </button>

        <button onclick="deletePlaylist(${list.id})">

           

        </button>

        <hr>

        ${songsHtml}

    </div>

</div>

`;

    });

}
function openSongYoutube(url){

    if(!url){

        alert("No YouTube link.");

        return;

    }

    window.open(url,"_blank");
}
function openYoutube(id){

    const playlist = playlists.find(p => p.id == id);

    if(!playlist){
        return;
    }

    if(!playlist.youtube){
        alert("This playlist has no YouTube link.");
        return;
    }

    window.open(playlist.youtube, "_blank");

}

window.openYoutube = openYoutube;

async function editYoutube(id) {

    if (!currentUser) {

        alert("Please login first.");

        return;

    }

    const playlist =
        playlists.find(
            p => p.id == id
        );

    if (!playlist) {

        return;

    }

    const link = prompt(
        "YouTube Link:",
        playlist.youtube || ""
    );

    if (link === null) {

        return;

    }

    playlist.youtube = link.trim();

    try {

        await savePlaylist(
            currentUser.uid,
            playlist
        );

        renderPlaylists();

    }
    catch(error) {

        console.error(
            "YouTube update error:",
            error
        );

        alert(
            "Unable to save YouTube link."
        );

    }

}

window.editYoutube = editYoutube;

function togglePlaylist(id){

    const body =
    document.getElementById("playlistBody"+id);

    const arrow =
    document.getElementById("playlistArrow"+id);

    body.classList.toggle("show");

    arrow.innerHTML =
        body.classList.contains("show")
        ? "▼"
        : "▶";

}
window.togglePlaylist = togglePlaylist;

function openSong(file){

    if (localStorage.getItem("currentServiceId")) {
        localStorage.setItem("resumePresentation", "true");
    }
    location.href = file;

}

async function deletePlaylist(id) {

    if (!currentUser) {

        alert("Please login first.");

        return;

    }

    const playlist = playlists.find(
        p => p.id == id
    );

    if (!playlist) {

        return;

    }

    if (!confirm(
        `Delete "${playlist.name}"?`
    )) {

        return;

    }

    try {

        await deletePlaylistCloud(
            currentUser.uid,
            id
        );

        playlists = playlists.filter(
            p => p.id != id
        );

        renderPlaylists();

        updatePlaylistCounter();

    }
    catch(error) {

        console.error(
            "Delete playlist error:",
            error
        );

        alert(
            "Unable to delete playlist."
        );

    }

}

window.deletePlaylist = deletePlaylist;



async function removeSongFromPlaylist(
    playlistId,
    songIndex
) {

    if (!currentUser) {

        alert("Please login first.");

        return;

    }

    const playlist = playlists.find(
        p => p.id == playlistId
    );

    if (!playlist) {

        return;

    }

    if (!confirm(
        "Remove this song from the playlist?"
    )) {

        return;

    }

    playlist.songs.splice(
        songIndex,
        1
    );

    try {

        await savePlaylist(
            currentUser.uid,
            playlist
        );

        renderPlaylists();

    }
    catch(error) {

        console.error(
            "Remove song error:",
            error
        );

        alert(
            "Unable to save playlist."
        );

    }

}

window.removeSongFromPlaylist =
    removeSongFromPlaylist;

function updatePlaylistCounter(){

    const total =

    document.getElementById("totalPlaylists");

    if(total){

        total.textContent = playlists.length;

    }

}

updatePlaylistCounter();

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

    location.href =
    service.songs[index].file;

};
}
function finishService() {

    localStorage.removeItem("currentServiceId");

    localStorage.removeItem("currentSongIndex");

    localStorage.removeItem("resumePresentation");

    alert("Service Finished.");

}
window.finishService = finishService;
function updateDashboard(){

    const totalServices =
        document.getElementById("totalServices");

    if(totalServices){

        totalServices.textContent =
            services.length;

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

let filteredSongs = songs;

renderSongs(filteredSongs);


function renderSongs(songList) {
    const songGrid = document.getElementById("songGrid");
    if (!songGrid) return;

    // Always display the main song cards alphabetically by title, including
    // newly created Add Song entries and filtered/search results.
    const list = (Array.isArray(songList) ? [...songList] : []).sort((a, b) =>
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
            <p><strong>Key:</strong> ${escapeHtml(song.key || song.originalKey || "—")}</p>
            <p><strong>Category:</strong> ${escapeHtml(song.category || "—")}</p>
            <div class="song-card-actions">
                <a class="open-song" href="${song.customSong ? `custom-song.html?id=${encodeURIComponent(song.id)}` : (song.file || "#")}">🎵 Open Song</a>
                <a class="youtube-song-btn${song.youtube ? "" : " disabled"}"
                   href="${song.youtube ? escapeHtml(song.youtube) : "#"}"
                   ${song.youtube ? 'target="_blank" rel="noopener noreferrer"' : 'aria-disabled="true" onclick="return false;"'}
                   title="${song.youtube ? "Open YouTube link" : "No YouTube link added"}">📺 YouTube</a>
                ${song.customSong ? `
                    <button type="button" class="song-action-btn edit" data-card-action="edit" data-song-id="${escapeHtml(song.id)}">✏ Edit</button>
                    <button type="button" class="song-action-btn delete" data-card-action="delete" data-song-id="${escapeHtml(song.id)}">🗑 Delete</button>
                ` : ""}
            </div>
        </div>
    `).join("");

    songGrid.querySelectorAll('[data-card-action="edit"]').forEach(btn => {
        btn.addEventListener("click", () => {
            const target = songs.find(x => String(x.id) === String(btn.dataset.songId));
            if (target && window.WorshipHubSongEditor?.open) window.WorshipHubSongEditor.open(target);
        });
    });

    songGrid.querySelectorAll('[data-card-action="delete"]').forEach(btn => {
        btn.addEventListener("click", async () => {
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

const serviceName =
document.getElementById("serviceName");

const createService =
document.getElementById("createService");

servicePlannerBtn.onclick=function(){

    servicePanel.classList.add("show");

}

closeService.onclick=function(){

    servicePanel.classList.remove("show");

    // Clear active service presentation
    localStorage.removeItem("currentService");
    localStorage.removeItem("currentSongIndex");
    localStorage.removeItem("resumePresentation");

};
function closeServicePlanner(){

    servicePanel.classList.remove("show");

    localStorage.removeItem("currentService");
    localStorage.removeItem("currentSongIndex");
    localStorage.removeItem("resumePresentation");

}

createService.onclick =
async function() {

    if (!currentUser) {

        alert(
            "Please login first."
        );

        return;

    }


    const name =
        serviceName.value.trim();


    if (!name) {

        alert(
            "Please enter a service name."
        );

        return;

    }


    const service = {

        id: String(Date.now()),

        name: name,

        songs: [],

        notes: [],

        createdAt:
            new Date().toISOString()

    };


    try {

        await saveService(
            currentUser.uid,
            service
        );


        services.push(
            service
        );
        window.services = services;


        services.sort(
            (a, b) =>
                a.name.localeCompare(
                    b.name
                )
        );


        serviceName.value = "";


        renderServices();

    }
    catch(error) {

        console.error(
            "Create service error:",
            error
        );

        alert(
            "Unable to create service."
        );

    }

};
function renderServices() {

    if (!serviceList) {

        console.error(
            "serviceList element not found."
        );

        return;

    }


    // =====================================
    // CLEAR SERVICE LIST
    // =====================================

    serviceList.innerHTML = "";


    // =====================================
    // NO SERVICES
    // =====================================

    if (
        !Array.isArray(services) ||
        services.length === 0
    ) {

        serviceList.innerHTML = `

            <div class="empty-message">

                No Service Planner created yet.

            </div>

        `;

        updateDashboard();

        return;

    }


    // =====================================
    // SORT SERVICES
    // =====================================

    services.sort(function(a, b) {

        return (a.name || "").localeCompare(
            b.name || ""
        );

    });


    // =====================================
    // RENDER SERVICES
    // =====================================

    services.forEach(function(service) {

        const serviceSongs =
            Array.isArray(service.songs)
                ? service.songs
                : [];


        // =================================
        // SONG HTML
        // =================================

        let songsHtml = "";


        serviceSongs.forEach(
            function(song, index) {

                songsHtml += `

                    <div class="service-song" draggable="true" data-service-id="${service.id}" data-song-index="${index}">

                        <div class="service-song-info">

                            <div class="service-song-title">

                                🎵
                                ${song.title || "Untitled Song"}

                            </div>

                            <div class="service-song-artist">

                                ${song.artist || ""}

                            </div>

                            <div class="service-song-key">

                                🎼
                                ${song.serviceKey || song.key || ""}

                            </div>

                        </div>


                        <button
                            class="remove-song-btn"
                            onclick="
                                removeSongFromService(
                                    '${service.id}',
                                    ${index}
                                )
                            ">

                            🗑

                        </button>

                    </div>

                `;

            }
        );


        // =================================
        // SERVICE HTML
        // =================================

        serviceList.innerHTML += `

            <div class="service-item">


                <div
                    class="service-header"
                    onclick="
                        toggleService(
                            '${service.id}'
                        )
                    ">

                    <div>

                        <div class="service-title">

                            <span
                                id="serviceArrow${service.id}">

                                ▶

                            </span>

                            ${service.name}

                        </div>


                        <div class="service-count">

                            ${serviceSongs.length}

                            ${
                                serviceSongs.length === 1
                                    ? "Song"
                                    : "Songs"
                            }

                        </div>

                    </div>

                </div>


                <div
                    id="serviceBody${service.id}"
                    class="service-body">


                    <button
                        onclick="
                            addSongsToService(
                                '${service.id}'
                            )
                        ">

                        ➕ Add Songs

                    </button>


                    <button
                        onclick="
                            startService(
                                '${service.id}'
                            )
                        ">

                        ▶ Start Service

                    </button>
                    <button
    type="button"
    onclick="printServiceSongs('${service.id}')"
>
     <i class="fas fa-print"></i>Print Service
</button>

                    <button
                        onclick="
                            renameService(
                                '${service.id}'
                            )
                        ">

                        ✏ Rename

                    </button>


                    <button
                        onclick="
                            deleteService(
                                '${service.id}'
                            )
                        ">

                        🗑 Delete

                    </button>


                    <hr>


                    <div class="service-song-list">

                        ${songsHtml}

                    </div>


                </div>

            </div>

        `;

    });


    // Enable drag-and-drop song ordering.
    serviceList.querySelectorAll('.service-song[draggable="true"]').forEach(row=>{
        row.addEventListener('dragstart',()=>row.classList.add('dragging'));
        row.addEventListener('dragend',()=>row.classList.remove('dragging'));
        row.addEventListener('dragover',event=>{ event.preventDefault(); const dragging=serviceList.querySelector('.service-song.dragging'); if(!dragging || dragging===row)return; const rect=row.getBoundingClientRect(); const before=event.clientY < rect.top+rect.height/2; const list=row.parentElement; if(before) list.insertBefore(dragging,row); else list.insertBefore(dragging,row.nextSibling); });
    });

    // Persist the new order when the user releases a dragged song.
    serviceList.querySelectorAll('.service-song[draggable="true"]').forEach(row=>{
        row.addEventListener('dragend',async()=>{
            const serviceId=row.dataset.serviceId; const service=services.find(x=>String(x.id)===String(serviceId)); if(!service)return;
            const list=row.parentElement; const rows=[...list.querySelectorAll('.service-song[draggable="true"]')];
            const reordered=rows.map(r=>service.songs[Number(r.dataset.songIndex)]).filter(Boolean);
            service.songs=reordered;
            await saveServicesCloud();
            renderServices();
        });
    });

    // =====================================
    // UPDATE DASHBOARD
    // =====================================

    updateDashboard();

}

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
let selectedPlaylist = null;


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

    list.forEach(function(song) {

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

        key:
            song.key || "",

        originalKey:
            song.originalKey || song.key || "",

        serviceKey:
            song.serviceKey || song.key || "",

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

        // Remove local song if Firebase save failed
        selectedService.songs =
            selectedService.songs.filter(function(s) {

                return s.file !== song.file;

            });

        alert(
            "Unable to save song."
        );

    }

}

window.selectSong = selectSong;

closeSongPicker.onclick = function(){
    songPicker.classList.remove("show");
};

async function startService(serviceId) {

    let service = services.find(function(s) {

        return String(s.id) === String(serviceId);

    });


    if (!service) {

        alert("Service not found.");

        return;

    }


    if (
        !Array.isArray(service.songs) ||
        service.songs.length === 0
    ) {

        alert(
            "This service has no songs."
        );

        return;

    }

    // Re-read the selected Service Planner from Firebase before opening it.
    // This guarantees that serviceKey/key values saved by the song page are
    // not replaced by an older in-memory copy from index.html.
    try {
        const freshSnap = await getDoc(
            doc(db, "users", currentUser.uid, "services", String(serviceId))
        );
        if (freshSnap.exists()) {
            service = { id: freshSnap.id, ...freshSnap.data() };
            if (!Array.isArray(service.songs)) service.songs = [];
        }
    } catch (error) {
        console.warn("Unable to refresh Service Planner before starting:", error);
    }


    // ======================================
    // SAVE ACTIVE SERVICE
    // ======================================

    localStorage.setItem(
        "currentServiceId",
        String(service.id)
    );

    localStorage.setItem(
        "currentServiceName",
        String(service.name || service.title || "Service Planner")
    );


    localStorage.setItem(
        "currentSongIndex",
        "0"
    );


    localStorage.setItem(
        "resumePresentation",
        "true"
    );


    console.log(
        "START SERVICE:"
    );

    console.log(
        "ID:",
        service.id
    );

    console.log(
        "NAME:",
        service.name
    );

    console.log(
        "SONGS:",
        service.songs.length
    );


    // ======================================
    // OPEN FIRST SONG
    // ======================================

    const firstSong =
        service.songs[0];


    if (!firstSong || !firstSong.file) {

        alert(
            "First song file not found."
        );

        return;

    }


    // All songs now use the same structured Add Song/custom-song page.
    if (firstSong.customSong === true) {
        const customUrl =
            "custom-song.html?id=" +
            encodeURIComponent(firstSong.id || "");
        window.location.assign(customUrl);
        return;
    }

    alert("This service contains a song that is not available in the structured song library.");

}


window.startService =
    startService;

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
function addSongsToPlaylist(playlistId){

    selectedPlaylist = playlists.find(
        p => p.id == playlistId
    );

    if(!selectedPlaylist){
        return;
    }

    renderPlaylistSongPicker(songs);

    songPicker.classList.add("show");

    songPickerSearch.value = "";

}
window.addSongsToPlaylist = addSongsToPlaylist;
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
function renderPlaylistSongPicker(list){

    songPickerList.innerHTML = "";

    list.forEach(song => {

        songPickerList.innerHTML += `

        <div class="song-picker-card">

            <div class="song-picker-info">

                <div class="song-picker-title">

                    ${song.title}

                </div>

                <div class="song-picker-artist">

                    ${song.artist}

                </div>

            </div>

            <button onclick="selectSongForPlaylist('${song.file}')">

                Add

            </button>

        </div>

        `;

    });

}
async function selectSongForPlaylist(
    file
) {

    if (!currentUser) {

        alert(
            "Please login first."
        );

        return;

    }


    if (!selectedPlaylist) {

        return;

    }


    const song =
        songs.find(
            s => s.file === file
        );


    if (!song) {

        alert(
            "Song not found."
        );

        return;

    }


    const exists =
        selectedPlaylist.songs.some(
            s => s.file === file
        );


    if (exists) {

        alert(
            "This song is already in the playlist."
        );

        return;

    }


    selectedPlaylist.songs.push({

        id: song.id,

        title: song.title,

        artist: song.artist,

        file: song.file,

        youtube:
            song.youtube || "",

        category:
            song.category || "",

        language:
            song.language || "",

        key:
            song.key || "",

        originalKey:
            song.originalKey || song.key || "",

        customSong:
            song.customSong === true,

        sections:
            Array.isArray(song.sections)
                ? JSON.parse(JSON.stringify(song.sections))
                : null

    });


    try {

        await savePlaylist(
            currentUser.uid,
            selectedPlaylist
        );


        renderPlaylists();


        songPicker.classList.remove(
            "show"
        );


    }
    catch(error) {

        console.error(
            "Add song error:",
            error
        );

        alert(
            "Unable to save song."
        );

    }

}
window.selectSongForPlaylist = selectSongForPlaylist;

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
                    <div class="service-print-song-meta">
                        <div class="service-print-planner">${escPrint(service.name || service.title || "Service Planner")}</div>
                        <h1>${escPrint(song.title || "Untitled Song")}</h1>
                        <div class="service-print-info">
                            <span><b>Artist:</b> ${escPrint(song.artist || "")}</span>
                            <span><b>Original Key:</b> ${escPrint(song.originalKey || song.key || "—")}</span>
                            <span><b>Service Key:</b> ${escPrint(normalizePrintKey(song))}</span>
                            <span><b>Song:</b> ${i + 1} / ${songs.length}</span>
                        </div>
                    </div>
                    <div class="service-print-passing" aria-label="Auto-generated passing chords">
                        ${passing.map(([label, value]) => `<span class="service-print-passing-item"><b>${escPrint(label)}:</b> <span>${escPrint(value)}</span></span>`).join(' <span class="service-print-separator" aria-hidden="true">|</span> ')}
                    </div>
                </header>
                <div class="service-print-content">${lyricsMarkup}</div>
            `;

            article.querySelectorAll("button, input, select, textarea, script, style, .song-toolbar, .presentationScreen, #presentationScreen").forEach(el => el.remove());
            article.querySelectorAll(".section-title").forEach(el => {
                el.classList.add("service-print-section-title");
                el.style.background = "#ffd700";
                el.style.color = "#000";
            });
            article.querySelectorAll(".chord, .song-line, .song-line *:not(.service-print-section-title)").forEach(el => {
                el.style.background = "transparent";
                el.style.color = "#111";
                el.style.webkitTextFillColor = "#111";
                el.style.textShadow = "none";
                el.classList.remove("highlight", "highlighted", "active", "chord-highlight");
            });
            list.appendChild(article);
        }

        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        const cleanup = () => {
            document.body.classList.remove("worshiphub-service-printing");
            document.getElementById("worshipHubServicePrintRoot")?.remove();
            window.removeEventListener("afterprint", cleanup);
        };

        if (window.WorshipHubPrintPreview) {
            window.WorshipHubPrintPreview.open(printRoot);
        } else {
            window.addEventListener("afterprint", cleanup, { once: true });
            setTimeout(cleanup, 60000);
            window.print();
        }
    } catch (error) {
        console.error("Service print error:", error);
        document.body.classList.remove("worshiphub-service-printing");
        document.getElementById("worshipHubServicePrintRoot")?.remove();
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

    renderPlaylists();

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


function sortPlaylists() {

    playlists.sort(function(a, b) {

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
