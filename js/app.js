
"use strict";

/* =====================================
   FIREBASE
===================================== */

import { auth } from "./firebase.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    loadPlaylists,
    savePlaylist,
    deletePlaylistCloud,
    loadServices,
    saveService,
    saveServices,
    deleteServiceCloud
} from "./firestore.js";

import { songs } from "./songs.js";


/* =====================================
   CURRENT USER
===================================== */

let currentUser = null;


/* =====================================
   USER DATA
===================================== */

let playlists = [];

let services = [];


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
// ==========================================
// ALL SONGS
// ==========================================

function showAllSongs() {

    const panel =
        document.getElementById("allSongsPanel");

    const tableBody =
        document.getElementById("allSongsTableBody");


    if (!panel || !tableBody) {

        console.error(
            "All Songs panel elements not found."
        );

        return;

    }


    // Clear previous rows

    tableBody.innerHTML = "";


    // ==========================================
    // SORT SONGS ALPHABETICALLY
    // ==========================================

    const allSongs =
        [...songs].sort(function(a, b) {

            return (a.title || "").localeCompare(
                b.title || ""
            );

        });


    // ==========================================
    // CREATE TABLE ROWS
    // ==========================================

    allSongs.forEach(function(song, index) {

        const row =
            document.createElement("tr");


        const title =
            song.title || "Untitled Song";

        const artist =
            song.artist || "";

        const category =
            song.category || "";

        const language =
            song.language || "";
         const key =
            song.key || "";

        row.innerHTML = `

            <td>
                ${index + 1}
            </td>

            <td>

                <a
                    href="${song.file}"
                    class="all-song-title">

                    🎵 ${title}

                </a>

            </td>

            <td>
                ${artist}
            </td>

            <td>
                ${category}
            </td>

            <td>
                ${language}
            </td>
              ${key}
            </td>

        `;


        tableBody.appendChild(row);

    });


    // ==========================================
    // SHOW PANEL
    // ==========================================

    panel.classList.add("show");


    console.log(
        "All Songs displayed:",
        allSongs.length
    );

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

    const tableBody =
        document.getElementById("allSongsTableBody");

    if (!tableBody) {

        console.error(
            "allSongsTableBody not found."
        );

        return;

    }


    tableBody.innerHTML = "";


    if (!songList || songList.length === 0) {

        tableBody.innerHTML = `

            <tr>

                <td
                    colspan="5"
                    style="
                        text-align:center;
                        padding:40px;
                        color:#98a2b3;
                    ">

                    🔍 No songs found.

                </td>

            </tr>

        `;

        return;

    }


    songList.forEach(function(song, index) {

        const row =
            document.createElement("tr");


        // ----------------------------------
        // SONG TITLE
        // ----------------------------------

        const titleCell =
            document.createElement("td");

        titleCell.innerHTML = `

            <a
                href="${song.file || "#"}"
                class="all-song-title">

                ${song.title || "Untitled Song"}

            </a>

        `;


        // ----------------------------------
        // ARTIST
        // ----------------------------------

        const artistCell =
            document.createElement("td");

        artistCell.textContent =
            song.artist || "—";


        // ----------------------------------
        // CATEGORY
        // ----------------------------------

        const categoryCell =
            document.createElement("td");

        categoryCell.textContent =
            song.category || "—";


        // ----------------------------------
        // LANGUAGE
        // ----------------------------------

        const languageCell =
            document.createElement("td");

        languageCell.textContent =
            song.language || "—";

       // ----------------------------------
        // LANGUAGE
        // ----------------------------------

        const keyCell =
            document.createElement("td");

        keyCell.textContent =
            song.key || "—";


        // ----------------------------------
        // NUMBER
        // ----------------------------------

        const numberCell =
            document.createElement("td");

        numberCell.textContent =
            index + 1;


        row.appendChild(numberCell);

        row.appendChild(titleCell);

        row.appendChild(artistCell);

        row.appendChild(categoryCell);

        row.appendChild(languageCell);

         row.appendChild(keyCell);


        tableBody.appendChild(row);

    });

}
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

                    <div class="service-song">

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

        const alreadyAdded =
            addedSongs.some(function(serviceSong) {

                return serviceSong.file === song.file;

            });

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
                    class="song-picker-add-btn ${alreadyAdded ? "added" : ""}"
                    ${alreadyAdded ? "disabled" : ""}
                    onclick="selectSong('${song.file}')">

                    ${alreadyAdded ? "✓ Added" : "Add"}

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

        return s.file === file;

    });

    if (!song) {
        alert("Song not found.");
        return;
    }

    // Make sure songs exists
    if (!Array.isArray(selectedService.songs)) {

        selectedService.songs = [];

    }

    // Check if already added
    const exists =
        selectedService.songs.some(function(s) {

            return s.file === song.file;

        });

    if (exists) {

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
            song.key || "",

        serviceKey:
            song.key || "",

        transpose: 0,

        youtube:
            song.youtube || ""

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

    const service = services.find(function(s) {

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


    // ======================================
    // SAVE ACTIVE SERVICE
    // ======================================

    localStorage.setItem(
        "currentServiceId",
        String(service.id)
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


    const filename =
        String(firstSong.file)
        .trim()
        .split("/")
        .pop();


    const url =
        "/WorshipHub/songs/" + filename;


    window.location.assign(url);

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
            song.key || ""

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
