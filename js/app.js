
"use strict";

/* =====================================
   FIREBASE
===================================== */

import {
    saveServices,
    loadServices,
    watchServices
} from "./firestore.js";

/* =====================================
   CONFIG
===================================== */

const FIREBASE_USER = "guest";
let services = [];
const STORAGE_KEYS = {

    CURRENT_SERVICE : "currentServiceId",

    CURRENT_INDEX : "currentSongIndex",

    RESUME : "resumePresentation"

};
/* =====================================
   DATA
===================================== */



let playlists =
JSON.parse(
    localStorage.getItem("playlists")
) || [];

/* =====================================
   FIREBASE SAVE
===================================== */

async function saveServicesCloud(){

    await saveServices(
        FIREBASE_USER,
        services
    );

}
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

createPlaylist.onclick=function(){

    const name =
    playlistName.value.trim();

    if(name===""){

        alert("Please enter a playlist name.");

        return;

    }

   const youtube =
prompt("Enter YouTube link for this playlist (optional):") || "";

playlists.push({

    id: Date.now(),

    name: name,

    youtube: youtube,

    songs: []

});
	

    savePlaylists();

    playlistName.value="";

    renderPlaylists();

}
playlists.sort((a,b)=>a.name.localeCompare(b.name));

function savePlaylists(){

    localStorage.setItem(

        "playlists",

        JSON.stringify(playlists)

    );

}

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

            🗑 Delete

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

function editYoutube(id){

    const playlist = playlists.find(p => p.id == id);

    if(!playlist){
        return;
    }

    const link = prompt(

        "YouTube Link:",

        playlist.youtube || ""

    );

    if(link === null){
        return;
    }

    playlist.youtube = link.trim();

    savePlaylists();

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

    location.href = file;

}
function openSongInPresentation(song) {

    if (!song || !song.file) {

        alert("Song file not found.");
        return;

    }

    localStorage.setItem(
        "resumePresentation",
        "true"
    );

    let file = song.file.trim();

    /*
       Firebase should store:
       songs/samasamangnagpupuri.html
    */

    if (!file.startsWith("songs/")) {

        file = "songs/" + file;

    }

    console.log("Opening:", file);

    window.location.href = "../" + file;

}

function deletePlaylist(id){

    if(!confirm("Delete this playlist?"))

        return;

    playlists =
    playlists.filter(function(p){

        return p.id!=id;

    });

    savePlaylists();

    renderPlaylists();

}
window.deletePlaylist = deletePlaylist;
function removeSongFromPlaylist(playlistId, songIndex){

    const playlist = playlists.find(
        p => p.id == playlistId
    );

    if(!playlist){
        return;
    }

    if(!confirm("Remove this song from the playlist?")){
        return;
    }

    playlist.songs.splice(songIndex,1);
playlist.songs.sort(function(a,b){

    return a.title.localeCompare(b.title);

});
    savePlaylists();

    renderPlaylists();

}
window.removeSongFromPlaylist = removeSongFromPlaylist;

function renamePlaylist(id){

    const playlist =
    playlists.find(function(p){

        return p.id==id;

    });

    const newName =
    prompt(

        "Playlist name:",

        playlist.name

    );

    if(!newName)

        return;

    playlist.name =
    newName;

    savePlaylists();

    renderPlaylists();

}
window.renamePlaylist = renamePlaylist;

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

    location.href =
    service.songs[index].file;

};
}
function nextServiceSong() {

    const service = getCurrentService();

    if (!service) {
        alert("No active service.");
        return;
    }

    if (!service.songs || service.songs.length === 0) {
        alert("This service has no songs.");
        return;
    }

    let index = getCurrentSongIndex();

    if (index >= service.songs.length - 1) {
        alert("End of Service.");
        return;
    }

    index++;

    setCurrentSongIndex(index);

    const nextSong = service.songs[index];

    if (!nextSong || !nextSong.file) {
        alert("Next song file not found.");
        return;
    }

    console.log("NEXT SONG:", nextSong.title);
    console.log("INDEX:", index);

    location.href = nextSong.file;
}

window.nextServiceSong = nextServiceSong;

function previousServiceSong() {

    const service = getCurrentService();

    if (!service) {
        alert("No active service.");
        return;
    }

    if (!service.songs || service.songs.length === 0) {
        return;
    }

    let index = getCurrentSongIndex();

    if (index <= 0) {
        alert("This is the first song.");
        return;
    }

    index--;

    setCurrentSongIndex(index);

    const previousSong = service.songs[index];

    if (!previousSong || !previousSong.file) {
        alert("Previous song file not found.");
        return;
    }

    console.log("PREVIOUS SONG:", previousSong.title);
    console.log("INDEX:", index);

    location.href = previousSong.file;
}

window.previousServiceSong = previousServiceSong;

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
document.getElementById("totalFavorites").textContent =
getFavorites().length;

document.getElementById("totalSongs").textContent =
songs.length;

document.getElementById("totalArtists").textContent =
new Set(songs.map(s => s.artist)).size;

let filteredSongs = songs;

renderSongs(filteredSongs);


function renderSongs(songList) {

    const songGrid = document.getElementById("songGrid");

    if (!songGrid) {
        console.error("songGrid not found.");
        return;
    }

    songGrid.innerHTML = "";

    let html = "";

songList.forEach(function(song){

    html += `

    <div class="song-card">

        <h3>${song.title}</h3>

        <p><strong>Artist:</strong> ${song.artist}</p>

        <p><strong>Key:</strong> ${song.key}</p>

        <p><strong>Category:</strong> ${song.category}</p>

        <a class="open-song" href="${song.file}">
            🎵 Open Song
        </a>

    </div>

    `;

});
const totalSongs =
document.getElementById("totalSongs");

if(totalSongs){

    totalSongs.textContent = songList.length;

}
songGrid.innerHTML = html;
}

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

createService.onclick = async function () {

    const name = serviceName.value.trim();

    if (!name) {

        alert("Please enter a service name.");

        return;

    }

    services.push({

        id: Date.now(),

        name,

        songs: [],

        notes: [],

        createdDate: new Date().toLocaleString()

    });

    await saveServicesCloud();

    serviceName.value = "";

    renderServices();

};
function renderServices() {

    serviceList.innerHTML = "";

    if (services.length === 0) {

        serviceList.innerHTML = `
            <div class="empty-message">
                No Service Planner created yet.
            </div>
        `;

        updateDashboard();

        return;

    }

    // Sort services alphabetically
    services.sort(function(a, b) {
        return a.name.localeCompare(b.name);
    });

   services.forEach(function(service){

    let songList = "";

    service.songs.forEach(function(song,index){

        songList += `

    <div class="service-song">

       <div>

    <div class="service-song-title">

        🎵 ${song.title}

    </div>

    <small>

        ${song.artist}

    </small>

    <br>

    <span class="service-song-key">

    🎼 ${song.serviceKey}

</span>

</div>

        <button onclick="removeSongFromService(${service.id},${index})">
            🗑 Remove
        </button>

    </div>

    `;

});

        serviceList.innerHTML += `

<div class="service-item">

    <div class="service-header"

     onclick="toggleService(${service.id})">

    <div>

        <div class="service-title">

            <span id="serviceArrow${service.id}">
                ▶
            </span>

            ${service.name}

        </div>

        <div class="service-count">

            ${service.songs.length} Songs

        </div>

    </div>

</div>

    <div id="serviceBody${service.id}"

         class="service-body">

        <button onclick="addSongsToService(${service.id})">

            ➕ Add Songs

        </button>

        <button onclick="startService(${service.id})">

            ▶ Start Service

        </button>

        <button onclick="renameService(${service.id})">

            ✏ Rename

        </button>

        <button onclick="deleteService(${service.id})">

            🗑 Delete

        </button>

        <hr>

        ${songList}

    </div>

</div>

`;

    });

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

const closeSongPicker =
document.getElementById("closeSongPicker");

let selectedService = null;
let selectedPlaylist = null;

function renderSongPicker(list){

    songPickerList.innerHTML="";

    list.forEach(song=>{

        songPickerList.innerHTML+=`

        <div class="song-picker-card">

            <div class="song-picker-info">

                <div class="song-picker-title">

                    ${song.title}

                </div>

                <div class="song-picker-artist">

                    ${song.artist}

                </div>

            </div>

           <button onclick="selectSong('${song.file}')">
    Add
</button>

        </div>

        `;

    });

}
async function selectSong(file){

    console.log("Adding:", file);

    console.log("Selected Service:", selectedService);

    const song = songs.find(function(s){
        return s.file === file;
    });

    console.log("Found Song:", song);

    if(!song){
        alert("Song not found.");
        return;
    }

    selectedService.songs.push({
        id: song.id,
        title: song.title,
        artist: song.artist,
        file: song.file,
        category: song.category,
        language: song.language,
        key: song.key,
        originalKey: song.key,
        serviceKey: song.key,
        transpose: 0
    });

    console.log(selectedService);

   await saveServicesCloud();

const loaded = await loadServices(FIREBASE_USER);
console.log("Firestore returned:", loaded);

renderServices();

    songPicker.classList.remove("show");

    selectedService = null;
}

window.selectSong = selectSong;
	
closeSongPicker.onclick=function(){

    songPicker.classList.remove("show");

};

async function startService(serviceId) {

    const service = services.find(function(s) {
        return Number(s.id) === Number(serviceId);
    });

    if (!service) {
        alert("Service not found.");
        return;
    }

    if (!service.songs || service.songs.length === 0) {
        alert("This service has no songs.");
        return;
    }

    // Save active service
    localStorage.setItem(
        "currentServiceId",
        service.id
    );

    // Start with first song
    localStorage.setItem(
        "currentSongIndex",
        "0"
    );

    // Tell song page to immediately enter presentation
    localStorage.setItem(
        "resumePresentation",
        "true"
    );

    // Open first song
    let file = service.songs[0].file;

    if (file.startsWith("songs/")) {
        file = file.substring(6);
    }

    window.location.href = file;
}

window.startService = startService;

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

    const service = services.find(s => s.id == id);

    if (!service) {
        alert("Service not found.");
        return;
    }

    if (!confirm(`Delete "${service.name}"?`)) {
        return;
    }

    services = services.filter(s => s.id != id);

    await saveServicesCloud();

    renderServices();

    updateDashboard();

    // Clear current presentation if the deleted service was active
    const currentServiceId = Number(
        localStorage.getItem("currentServiceId")
    );

    if (currentServiceId === id) {

        localStorage.removeItem("currentServiceId");
        localStorage.removeItem("currentSongIndex");
        localStorage.removeItem("resumePresentation");

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
function selectSongForPlaylist(file){

    const song = songs.find(s => s.file === file);

    if(!song){
        return;
    }

    const exists = selectedPlaylist.songs.some(
        s => s.file === file
    );

    if(exists){

        alert("This song is already in the playlist.");

        return;

    }

    selectedPlaylist.songs.push(song);
selectedPlaylist.songs.sort(function(a,b){

    return a.title.localeCompare(b.title);

});
    savePlaylists();

    renderPlaylists();

    songPicker.classList.remove("show");

}
songPickerSearch.onkeyup = function(){

    const keyword = this.value.toLowerCase();

    const filtered = songs.filter(song =>

        song.title.toLowerCase().includes(keyword) ||

        song.artist.toLowerCase().includes(keyword) ||

        song.category.toLowerCase().includes(keyword)

    );

    if(selectedService){

        renderSongPicker(filtered);

    }
    else if(selectedPlaylist){

        renderPlaylistSongPicker(filtered);

    }

};
window.selectSongForPlaylist = selectSongForPlaylist;

function toggleService(id){

    const body = document.getElementById("serviceBody"+id);

    const title = document.getElementById("serviceArrow"+id);

    body.classList.toggle("show");

    if(body.classList.contains("show")){

        title.innerHTML="▼";

    }else{

        title.innerHTML="▶";

    }

}
window.toggleService = toggleService;

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

(async () => {

    services = await loadServices(FIREBASE_USER);
	console.log("SERVICES:", services);
console.log("CURRENT ID:", localStorage.getItem("currentServiceId"));

    renderServices();

    updateDashboard();

})();

/* =====================================
   CURRENT SERVICE HELPERS
===================================== */

function getCurrentService() {

    const id = Number(localStorage.getItem("currentServiceId"));

    console.log("Current Service ID:", id);
    console.log("Services:", services);

    const service = services.find(function(s){
        return Number(s.id) === id;
    });

    console.log("Found Service:", service);

    return service;
}
function getCurrentSongIndex() {

    return Number(
        localStorage.getItem("currentSongIndex") || 0
    );

}
function getSongUrl(file) {

    if (!file) {
        return "";
    }

    file = file.trim();

    if (file.startsWith("songs/")) {
        return "../" + file;
    }

    if (file.startsWith("../")) {
        return file;
    }

    return "./" + file;
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
	function sortSongs(list){

    return list.sort(function(a,b){

        return a.title.localeCompare(b.title);

    });

}
	function sortServices(){

    services.sort(function(a,b){

        return a.name.localeCompare(b.name);

    });

}
	function sortPlaylists(){

    playlists.sort(function(a,b){

        return a.name.localeCompare(b.name);

    });

}
