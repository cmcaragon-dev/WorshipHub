"use strict";

// ==========================================
// FIREBASE PLAYLIST MANAGER
// ==========================================

import {
    auth,
    db
} from "./firebase.js";

import {
    collection,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


// ==========================================
// VARIABLES
// ==========================================

let playlists = [];
let currentUser = null;


// ==========================================
// PLAYLIST COLLECTION
// ==========================================

function playlistCollection() {

    if (!currentUser) {
        return null;
    }

    return collection(
        db,
        "users",
        currentUser.uid,
        "playlists"
    );
}


// ==========================================
// LOAD PLAYLISTS
// ==========================================

async function loadPlaylists() {

    if (!currentUser) {
        console.warn("No authenticated user.");
        return;
    }

    try {

        const playlistRef = playlistCollection();

        if (!playlistRef) {
            console.warn("Playlist collection reference is null.");
            return;
        }

        const snapshot = await getDocs(playlistRef);

        playlists = snapshot.docs.map(item => ({
            id: item.id,
            ...item.data()
        }));

        console.log(
            "Loaded playlists:",
            playlists
        );

        renderPlaylists();
        updatePlaylistCounter();

    } catch (error) {

        console.error(
            "Error loading playlists:",
            error
        );

    }
}


// ==========================================
// SAVE NEW PLAYLIST
// ==========================================

async function createNewPlaylist() {

    if (!currentUser) {
        alert("Please log in first.");
        return;
    }

    const input =
        document.getElementById("playlistName");

    if (!input) {
        console.error(
            'Element "playlistName" was not found.'
        );
        return;
    }

    const name = input.value.trim();

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

    try {

        await addDoc(
            playlistCollection(),
            {
                name: name,
                youtube: youtube,
                songs: [],
                createdAt: serverTimestamp()
            }
        );

        input.value = "";

        await loadPlaylists();

    } catch (error) {

        console.error(
            "Error creating playlist:",
            error
        );

        alert(
            "Unable to create playlist."
        );
    }
}


// ==========================================
// RENDER PLAYLISTS
// ==========================================

function renderPlaylists() {

    const playlistList =
        document.getElementById(
            "playlistList"
        );

    if (!playlistList) {
        return;
    }

    playlistList.innerHTML = "";

    playlists.forEach(playlist => {

        let songsHtml = "";

        (playlist.songs || []).forEach(
            (song, index) => {

                songsHtml += `
                    <div class="playlist-song">

                        <div>
                            🎵 ${song.title || "Untitled"}
                            <br>

                            <small>
                                ${song.artist || ""}
                            </small>
                        </div>

                        <div>

                            <button
                                onclick="openSong('${song.file || ""}')">
                                ▶
                            </button>

                            <button
                                onclick="openSongYoutube('${song.youtube || ""}')">
                                📺
                            </button>

                            <button
                                onclick="removeSongFromPlaylist('${playlist.id}', ${index})">
                                ❌
                            </button>

                        </div>

                    </div>
                `;
            }
        );

        playlistList.innerHTML += `
            <div class="service-item">

                <div
                    class="service-header"
                    onclick="togglePlaylist('${playlist.id}')"
                >

                    <div>

                        <div class="service-title">

                            <span
                                id="playlistArrow${playlist.id}"
                            >
                                ▶
                            </span>

                            ${playlist.name}

                        </div>

                        <div class="service-count">

                            ${(playlist.songs || []).length}
                            Songs

                        </div>

                    </div>

                </div>

                <div
                    id="playlistBody${playlist.id}"
                    class="service-body"
                >

                    <button
                        onclick="addSongsToPlaylist('${playlist.id}')"
                    >
                        ➕ Add Songs
                    </button>

                    <button
                        onclick="openYoutube('${playlist.id}')"
                    >
                        📺 YouTube
                    </button>

                    <button
                        onclick="editYoutube('${playlist.id}')"
                    >
                        🔗 Edit Link
                    </button>

                    <button
                        onclick="renamePlaylist('${playlist.id}')"
                    >
                        ✏ Rename
                    </button>

                    <button
                        onclick="deletePlaylist('${playlist.id}')"
                    >
                        🗑 Delete
                    </button>

                    <hr>

                    ${songsHtml}

                </div>

            </div>
        `;
    });
}


// ==========================================
// TOGGLE PLAYLIST
// ==========================================

window.togglePlaylist = function (id) {

    const body =
        document.getElementById(
            "playlistBody" + id
        );

    const arrow =
        document.getElementById(
            "playlistArrow" + id
        );

    if (!body) {
        return;
    }

    body.classList.toggle("show");

    if (arrow) {

        arrow.innerHTML =
            body.classList.contains("show")
                ? "▼"
                : "▶";
    }
};


// ==========================================
// OPEN PLAYLIST YOUTUBE
// ==========================================

window.openYoutube = function (id) {

    const playlist =
        playlists.find(
            p => p.id === id
        );

    if (!playlist) {
        return;
    }

    if (!playlist.youtube) {

        alert(
            "This playlist has no YouTube link."
        );

        return;
    }

    window.open(
        playlist.youtube,
        "_blank"
    );
};


// ==========================================
// EDIT YOUTUBE
// ==========================================

window.editYoutube = async function (id) {

    const playlist =
        playlists.find(
            p => p.id === id
        );

    if (!playlist) {
        return;
    }

    const link =
        prompt(
            "YouTube Link:",
            playlist.youtube || ""
        );

    if (link === null) {
        return;
    }

    try {

        await updateDoc(
            doc(
                db,
                "users",
                currentUser.uid,
                "playlists",
                id
            ),
            {
                youtube: link.trim()
            }
        );

        await loadPlaylists();

    } catch (error) {

        console.error(
            "Error updating YouTube link:",
            error
        );
    }
};


// ==========================================
// RENAME PLAYLIST
// ==========================================

window.renamePlaylist = async function (id) {

    const playlist =
        playlists.find(
            p => p.id === id
        );

    if (!playlist) {
        return;
    }

    const newName =
        prompt(
            "Playlist name:",
            playlist.name
        );

    if (!newName || !newName.trim()) {
        return;
    }

    try {

        await updateDoc(
            doc(
                db,
                "users",
                currentUser.uid,
                "playlists",
                id
            ),
            {
                name: newName.trim()
            }
        );

        await loadPlaylists();

    } catch (error) {

        console.error(
            "Error renaming playlist:",
            error
        );
    }
};


// ==========================================
// DELETE PLAYLIST
// ==========================================

window.deletePlaylist = async function (id) {

    if (!confirm("Delete this playlist?")) {
        return;
    }

    try {

        await deleteDoc(
            doc(
                db,
                "users",
                currentUser.uid,
                "playlists",
                id
            )
        );

        await loadPlaylists();

    } catch (error) {

        console.error(
            "Error deleting playlist:",
            error
        );
    }
};


// ==========================================
// ADD SONG TO PLAYLIST
// ==========================================

window.addSongToPlaylist = async function (
    playlistId,
    song
) {

    const playlist =
        playlists.find(
            p => p.id === playlistId
        );

    if (!playlist) {
        return;
    }

    const songs =
        [...(playlist.songs || [])];

    if (
        songs.some(
            s => s.file === song.file
        )
    ) {

        alert(
            "This song is already in the playlist."
        );

        return;
    }

    songs.push(song);

    try {

        await updateDoc(
            doc(
                db,
                "users",
                currentUser.uid,
                "playlists",
                playlistId
            ),
            {
                songs: songs
            }
        );

        await loadPlaylists();

    } catch (error) {

        console.error(
            "Error adding song:",
            error
        );
    }
};


// ==========================================
// REMOVE SONG FROM PLAYLIST
// ==========================================

window.removeSongFromPlaylist =
async function (
    playlistId,
    songIndex
) {

    const playlist =
        playlists.find(
            p => p.id === playlistId
        );

    if (!playlist) {
        return;
    }

    if (
        !confirm(
            "Remove this song from the playlist?"
        )
    ) {
        return;
    }

    const songs =
        [...(playlist.songs || [])];

    songs.splice(
        songIndex,
        1
    );

    try {

        await updateDoc(
            doc(
                db,
                "users",
                currentUser.uid,
                "playlists",
                playlistId
            ),
            {
                songs: songs
            }
        );

        await loadPlaylists();

    } catch (error) {

        console.error(
            "Error removing song:",
            error
        );
    }
};


// ==========================================
// OPEN SONG
// ==========================================

window.openSong = function (file) {

    if (!file) {
        return;
    }

    window.location.href = file;
};


// ==========================================
// OPEN SONG YOUTUBE
// ==========================================

window.openSongYoutube = function (url) {

    if (!url) {

        alert(
            "No YouTube link for this song."
        );

        return;
    }

    window.open(
        url,
        "_blank"
    );
};


// ==========================================
// COUNTER
// ==========================================

function updatePlaylistCounter() {

    const counter =
        document.getElementById(
            "totalPlaylists"
        );

    if (counter) {

        counter.textContent =
            playlists.length;
    }
}


// ==========================================
// CREATE BUTTON
// ==========================================

const createPlaylistBtn =
    document.getElementById(
        "createPlaylist"
    );

if (createPlaylistBtn) {

    createPlaylistBtn.onclick =
        createNewPlaylist;
}


// ==========================================
// OPEN PANEL
// ==========================================

const playlistBtn =
    document.getElementById(
        "playlistBtn"
    );

if (playlistBtn) {

    playlistBtn.onclick =
        function () {

            const panel =
                document.getElementById(
                    "playlistPanel"
                );

            if (panel) {

                panel.classList.add(
                    "show"
                );

                loadPlaylists();
            }
        };
}


// ==========================================
// CLOSE PANEL
// ==========================================

const closePlaylist =
    document.getElementById(
        "closePlaylist"
    );

if (closePlaylist) {

    closePlaylist.onclick =
        function () {

            const panel =
                document.getElementById(
                    "playlistPanel"
                );

            if (panel) {

                panel.classList.remove(
                    "show"
                );
            }
        };
}


// ==========================================
// AUTH STATE
// ==========================================

onAuthStateChanged(
    auth,
    async function (user) {

        if (!user) {

            window.location.href =
                "login.html";

            return;
        }

        currentUser = user;

        console.log(
            "Authenticated user:",
            currentUser.uid
        );

        await loadPlaylists();
    }
);
