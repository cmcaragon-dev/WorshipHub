"use strict";

import { loadServices } from "./firestore.js";

const FIREBASE_USER = "guest";

const CURRENT_SERVICE_KEY =
    "currentServiceId";

const CURRENT_SONG_INDEX_KEY =
    "currentSongIndex";


/* =====================================
   LOAD CURRENT SERVICE
===================================== */

async function getCurrentService() {

    const serviceId = Number(
        localStorage.getItem(
            CURRENT_SERVICE_KEY
        )
    );

    if (!serviceId) {
        return null;
    }

    const services =
        await loadServices(FIREBASE_USER);

    return services.find(function(service) {

        return Number(service.id) === serviceId;

    }) || null;
}


/* =====================================
   GET CURRENT INDEX
===================================== */

function getCurrentSongIndex() {

    return Number(
        localStorage.getItem(
            CURRENT_SONG_INDEX_KEY
        ) || 0
    );

}


/* =====================================
   OPEN SONG IN PRESENTATION
===================================== */

function openSongInPresentation(song) {

    if (!song || !song.file) {

        alert("Song file not found.");

        return;

    }

    /*
        Keep service active
    */

    localStorage.setItem(
        "resumePresentation",
        "true"
    );


    /*
        Firebase stores:

        songs/amazing-grace.html

        We are already inside /songs/
    */

    let file = song.file;

    if (file.startsWith("songs/")) {

        file = file.substring(6);

    }


    window.location.href = file;

}


/* =====================================
   NEXT
===================================== */

async function nextServiceSong() {

    console.log(
        "NEXT SERVICE SONG"
    );

    const service =
        await getCurrentService();


    if (!service) {

        alert(
            "No active service."
        );

        return;

    }


    if (
        !service.songs ||
        service.songs.length === 0
    ) {

        alert(
            "This service has no songs."
        );

        return;

    }


    let index =
        getCurrentSongIndex();


    if (
        index >=
        service.songs.length - 1
    ) {

        alert(
            "End of Service."
        );

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
        "Opening presentation:",
        nextSong.title
    );


    openSongInPresentation(
        nextSong
    );

}


/* =====================================
   PREVIOUS
===================================== */

async function previousServiceSong() {

    console.log(
        "PREVIOUS SERVICE SONG"
    );

    const service =
        await getCurrentService();


    if (!service) {

        alert(
            "No active service."
        );

        return;

    }


    let index =
        getCurrentSongIndex();


    if (index <= 0) {

        alert(
            "This is the first song."
        );

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
        "Opening presentation:",
        previousSong.title
    );


    openSongInPresentation(
        previousSong
    );

}


/* =====================================
   MAKE AVAILABLE TO HTML
===================================== */

window.nextServiceSong =
    nextServiceSong;

window.previousServiceSong =
    previousServiceSong;
