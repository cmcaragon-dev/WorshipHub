"use strict";

import { loadServices } from "./firestore.js";

/* =====================================
   CONFIG
===================================== */

const FIREBASE_USER = "guest";

const CURRENT_SERVICE_KEY = "currentServiceId";
const CURRENT_SONG_INDEX_KEY = "currentSongIndex";

/* =====================================
   LOAD CURRENT SERVICE
===================================== */

async function getCurrentServiceFromFirebase() {

    try {

        const serviceId = Number(
            localStorage.getItem(CURRENT_SERVICE_KEY)
        );

        if (!serviceId) {

            console.log("No current service ID.");

            return null;

        }

        const services =
            await loadServices(FIREBASE_USER);

        console.log("Services loaded:", services);

        const service =
            services.find(function(service) {

                return Number(service.id) === serviceId;

            });

        console.log("Current service:", service);

        return service || null;

    }

    catch(error) {

        console.error(
            "Unable to load service:",
            error
        );

        return null;

    }

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
   SAVE SONG INDEX
===================================== */

function setCurrentSongIndex(index) {

    localStorage.setItem(

        CURRENT_SONG_INDEX_KEY,

        String(index)

    );

}


/* =====================================
   NEXT SONG
===================================== */

async function nextServiceSong() {

    console.log("NEXT BUTTON CLICKED");

    const service =
        await getCurrentServiceFromFirebase();

    if (!service) {

        alert(
            "No active service found."
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


    console.log(
        "Current index:",
        index
    );

    console.log(
        "Total songs:",
        service.songs.length
    );


    /* =================================
       CHECK END OF SERVICE
    ================================= */

    if (
        index >=
        service.songs.length - 1
    ) {

        alert(
            "You have reached the last song."
        );

        return;

    }


    /* =================================
       MOVE TO NEXT SONG
    ================================= */

    index++;

    setCurrentSongIndex(index);


    const nextSong =
        service.songs[index];


    if (
        !nextSong ||
        !nextSong.file
    ) {

        alert(
            "Next song file was not found."
        );

        console.error(
            "Invalid next song:",
            nextSong
        );

        return;

    }


    console.log(
        "NEXT SONG:",
        nextSong.title
    );

    console.log(
        "NEXT FILE:",
        nextSong.file
    );


    /* =================================
       OPEN NEXT SONG
    ================================= */

    window.location.href =
        nextSong.file;

}


/* =====================================
   PREVIOUS SONG
===================================== */

async function previousServiceSong() {

    console.log(
        "PREVIOUS BUTTON CLICKED"
    );

    const service =
        await getCurrentServiceFromFirebase();

    if (!service) {

        alert(
            "No active service found."
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


    if (index <= 0) {

        alert(
            "This is the first song."
        );

        return;

    }


    index--;

    setCurrentSongIndex(index);


    const previousSong =
        service.songs[index];


    if (
        !previousSong ||
        !previousSong.file
    ) {

        alert(
            "Previous song file was not found."
        );

        return;

    }


    console.log(
        "PREVIOUS SONG:",
        previousSong.title
    );


    window.location.href =
        previousSong.file;

}


/* =====================================
   SERVICE PROGRESS
===================================== */

async function updateServiceProgress() {

    const label =
        document.getElementById(
            "serviceProgress"
        );

    if (!label) {

        return;

    }


    const service =
        await getCurrentServiceFromFirebase();


    if (!service) {

        label.textContent = "";

        return;

    }


    const index =
        getCurrentSongIndex();


    label.textContent =
        "Song " +
        (index + 1) +
        " of " +
        service.songs.length;

}


/* =====================================
   CURRENT SERVICE NAME
===================================== */

async function updateCurrentServiceName() {

    const label =
        document.getElementById(
            "currentService"
        );

    if (!label) {

        return;

    }


    const service =
        await getCurrentServiceFromFirebase();


    label.textContent =
        service
        ? service.name
        : "None";

}


/* =====================================
   MAKE FUNCTIONS AVAILABLE TO HTML
===================================== */

window.nextServiceSong =
    nextServiceSong;

window.previousServiceSong =
    previousServiceSong;

window.updateServiceProgress =
    updateServiceProgress;

window.updateCurrentServiceName =
    updateCurrentServiceName;


/* =====================================
   INITIALIZE
===================================== */

document.addEventListener(
    "DOMContentLoaded",
    function() {

        updateServiceProgress();

        updateCurrentServiceName();

    }
);
