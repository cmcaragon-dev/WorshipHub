"use strict";

import { loadServices } from "./firestore.js";

const FIREBASE_USER = "guest";

const CURRENT_SERVICE_KEY = "currentServiceId";
const CURRENT_SONG_INDEX_KEY = "currentSongIndex";


/* =====================================
   GET CURRENT SERVICE
===================================== */

async function getCurrentService() {

    const serviceId = Number(
        localStorage.getItem(CURRENT_SERVICE_KEY)
    );

    console.log("CURRENT SERVICE ID:", serviceId);

    if (!serviceId) {
        console.log("No current service ID.");
        return null;
    }

    const services =
        await loadServices(FIREBASE_USER);

    console.log("SERVICES FROM FIREBASE:", services);

    const service = services.find(function(service) {

        return Number(service.id) === serviceId;

    });

    console.log("CURRENT SERVICE:", service);

    return service || null;
}


/* =====================================
   CURRENT SONG INDEX
===================================== */

function getCurrentSongIndex() {

    return Number(
        localStorage.getItem(
            CURRENT_SONG_INDEX_KEY
        ) || 0
    );
}


/* =====================================
   OPEN SONG
===================================== */

function openSongInPresentation(song) {

    if (!song || !song.file) {

        alert("Song file not found.");

        return;
    }

    localStorage.setItem(
        "resumePresentation",
        "true"
    );

    /*
     * Firebase example:
     *
     * songs/samasamangnagpupuri.html
     *
     * We only need:
     *
     * samasamangnagpupuri.html
     */

    let filename =
        String(song.file).trim();

    filename =
        filename.split("/").pop();

    /*
     * IMPORTANT:
     *
     * Always use the actual GitHub Pages
     * project path.
     */

    const url =
        "/WorshipHub/songs/" + filename;

    console.log(
        "================================"
    );

    console.log(
        "SERVICE NAVIGATION"
    );

    console.log(
        "Song:",
        song.title
    );

    console.log(
        "Firebase file:",
        song.file
    );

    console.log(
        "Filename:",
        filename
    );

    console.log(
        "FINAL URL:",
        url
    );

    console.log(
        "================================"
    );

    window.location.assign(url);
}


/* =====================================
   NEXT SONG
===================================== */

async function nextServiceSong() {

    console.log(
        "========== NEXT CLICK =========="
    );

    const service =
        await getCurrentService();

    if (!service) {

        alert("No active service.");

        return;
    }

    if (
        !service.songs ||
        service.songs.length === 0
    ) {

        alert("This service has no songs.");

        return;
    }

    let index =
        getCurrentSongIndex();

    console.log(
        "CURRENT INDEX:",
        index
    );

    console.log(
        "TOTAL SONGS:",
        service.songs.length
    );

    if (
        index >=
        service.songs.length - 1
    ) {

        alert("End of Service.");

        return;
    }

    index++;

    localStorage.setItem(
        CURRENT_SONG_INDEX_KEY,
        String(index)
    );

    const nextSong =
        service.songs[index];

    console.log(
        "NEXT SONG:",
        nextSong
    );

    openSongInPresentation(
        nextSong
    );
}


/* =====================================
   PREVIOUS SONG
===================================== */

async function previousServiceSong() {

    console.log(
        "========== PREVIOUS CLICK =========="
    );

    const service =
        await getCurrentService();

    if (!service) {

        alert("No active service.");

        return;
    }

    if (
        !service.songs ||
        service.songs.length === 0
    ) {

        alert("This service has no songs.");

        return;
    }

    let index =
        getCurrentSongIndex();

    console.log(
        "CURRENT INDEX:",
        index
    );

    if (index <= 0) {

        alert("This is the first song.");

        return;
    }

    index--;

    localStorage.setItem(
        CURRENT_SONG_INDEX_KEY,
        String(index)
    );

    const previousSong =
        service.songs[index];

    console.log(
        "PREVIOUS SONG:",
        previousSong
    );

    openSongInPresentation(
        previousSong
    );
}


/* =====================================
   MAKE FUNCTIONS AVAILABLE TO HTML
===================================== */

window.nextServiceSong =
    nextServiceSong;

window.previousServiceSong =
    previousServiceSong;

console.log(
    "SERVICE NAVIGATION LOADED"
);
