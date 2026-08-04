import {

saveServices,
loadServices

}

from "./firestore.js";

/* =====================================
   PLAYLIST MANAGER
===================================== */
let services = [];

let playlists =
JSON.parse(localStorage.getItem("playlists")) || [];

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

function savePlaylists(){

    localStorage.setItem(

        "playlists",

        JSON.stringify(playlists)

    );

}

function renderPlaylists(){

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
function openSongYoutube(file){

    const song = songs.find(s => s.file === file);

    if(!song){

        alert("Song not found.");

        return;

    }

    if(!song.youtube){

        alert("No YouTube link for this song.");

        return;

    }

    window.open(song.youtube, "_blank");

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

    window.open(playlist.youtube,"_blank");

}
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

function openSong(file){

    location.href = file;

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

    savePlaylists();

    renderPlaylists();

}

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

function updatePlaylistCounter(){

    document.getElementById(

        "totalPlaylists"

    ).textContent =
    playlists.length;

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
document.getElementById("continueBtn").onclick=function(){

    const last = getLastSong();

    if(!last){

        alert("No recent song.");

        return;

    }

    location.href = last.file;

};
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

    songList.forEach(song => {

        songGrid.innerHTML += `

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

}
renderSongs(songs);

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

servicePlannerBtn.onclick = function(){

    servicePanel.classList.add("show");

    renderServices();

};

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

createService.onclick = function () {

    const name = serviceName.value.trim();

    if (!name) return;

    services.push({
        id: Date.now(),
        name: name,
        songs: [],
        notes: []
    });

    await saveServicesCloud();

    serviceName.value = "";

    renderServices();
};
function renderServices() {

    serviceList.innerHTML = "";

    services.forEach(function(service) {

        let songList = "";

        service.songs.forEach((song,index)=>{

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

    selectedService = services.find(s=>s.id===serviceId);

    renderSongPicker(songs);

    songPicker.classList.add("show");

}
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
function selectSong(file){

    const song = songs.find(s=>s.file===file);

    if(!song) return;

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

await saveServicesCloud();

renderServices();

songPicker.classList.remove("show");

selectedService = null;
}
	
closeSongPicker.onclick=function(){

    songPicker.classList.remove("show");

};
songPickerSearch.onkeyup=function(){

    const keyword=this.value.toLowerCase();

    const filtered=songs.filter(song=>

        song.title.toLowerCase().includes(keyword) ||

        song.artist.toLowerCase().includes(keyword) ||

        song.category.toLowerCase().includes(keyword)

    );

    renderSongPicker(filtered);

};
function startService(serviceId) {

    const service = services.find(s => s.id == serviceId);

    if (!service) return;

    if (service.songs.length === 0) {
        alert("This service has no songs.");
        return;
    }

    localStorage.setItem("currentServiceId", service.id);
    localStorage.setItem("currentSongIndex", "0");

    await saveServicesCloud();

    location.href = service.songs[0].file;
}
function deleteService(id) {

    const index = services.findIndex(s => s.id == id);

    if (index === -1) {
        alert("Service not found.");
        return;
    }

    if (!confirm("Delete this service?")) {
        return;
    }

    services.splice(index, 1);

   await  saveServicesCloud();

    renderServices();

    localStorage.removeItem("currentServiceId");
    localStorage.removeItem("currentSongIndex");
    localStorage.removeItem("resumePresentation");
}
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

function renameService(id){

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
function removeSongFromService(serviceId, songIndex){

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
window.removeSongFromService =
removeSongFromService;
function searchSongs(keyword = "") {

    if (!keyword) {
        keyword = document.getElementById("searchBox").value;
    }

    keyword = keyword.toLowerCase().trim();

    const songs = document.querySelectorAll(".song-card");

    songs.forEach(song => {

        const title = song.textContent.toLowerCase();

        song.style.display =
            title.includes(keyword) ? "" : "none";

    });

}
async function saveServicesCloud(){

    await saveServices(

        currentUser.username,

        services

    );

}
async function initializeServices(){

    services =

    await loadServices(

        currentUser.username

    );

    renderServices();

}

initializeServices();
