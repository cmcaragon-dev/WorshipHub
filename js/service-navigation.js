"use strict";

import {
    auth
} from "./firebase.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    loadServices
} from "./firestore.js";


/* =====================================
   STORAGE KEYS
===================================== */

const CURRENT_SERVICE_KEY =
    "currentServiceId";

const CURRENT_SONG_INDEX_KEY =
    "currentSongIndex";


/* =====================================
   WAIT FOR FIREBASE AUTHENTICATION
===================================== */

const firebaseAuthReady =
    new Promise(function (resolve) {

        onAuthStateChanged(
            auth,
            function (user) {

                console.log(
                    "SERVICE NAV AUTH:",
                    user
                        ? user.uid
                        : "NO USER"
                );

                resolve(user);

            }
        );

    });


/* =====================================
   GET CURRENT SERVICE
===================================== */

async function getCurrentService() {

    /* ---------------------------------
       WAIT FOR FIREBASE USER
    --------------------------------- */

    const user =
        await firebaseAuthReady;


    if (!user) {

        console.warn(
            "SERVICE NAVIGATION: No authenticated Firebase user."
        );

        return null;

    }


    console.log(
        "SERVICE NAVIGATION USER:",
        user.uid
    );


    /* ---------------------------------
       GET SERVICE ID
    --------------------------------- */

    const serviceId =
        localStorage.getItem(
            CURRENT_SERVICE_KEY
        );


    if (!serviceId) {

        console.warn(
            "No currentServiceId."
        );

        return null;

    }


    console.log(
        "SERVICE NAVIGATION SERVICE ID:",
        serviceId
    );


    /* ---------------------------------
       LOAD SERVICES FROM FIREBASE
    --------------------------------- */

    const services =
        await loadServices();


    if (!Array.isArray(services)) {

        console.warn(
            "Unable to load services."
        );

        return null;

    }


    /* ---------------------------------
       FIND CURRENT SERVICE
    --------------------------------- */

    const service =
        services.find(
            function (service) {

                return String(service.id) ===
                       String(serviceId);

            }
        );


    if (!service) {

        console.warn(
            "Current service not found:",
            serviceId
        );

        return null;

    }


    console.log(
        "CURRENT SERVICE:",
        service
    );


    return service;

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

        alert(
            "Song file not found."
        );

        return;

    }


    localStorage.setItem(
        "resumePresentation",
        "true"
    );


    /* ---------------------------------
       GET FILE NAME
    --------------------------------- */

    let filename =
        String(song.file).trim();


    filename =
        filename
            .split("/")
            .pop();


    /* ---------------------------------
       BUILD GITHUB PAGES URL
    --------------------------------- */

    const url =
        "/WorshipHub/songs/" +
        filename;


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


    window.location.assign(
        url
    );

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

        alert(
            "No active service."
        );

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

        alert(
            "No active service."
        );

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


    let index =
        getCurrentSongIndex();


    console.log(
        "CURRENT INDEX:",
        index
    );


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
        "PREVIOUS SONG:",
        previousSong
    );


    openSongInPresentation(
        previousSong
    );

}


/* =====================================
   DISPLAY SERVICE NAME
===================================== */

async function displayServiceName() {

    const serviceName =
        document.getElementById(
            "serviceNameDisplay"
        );


    if (!serviceName) {

        return;

    }


    serviceName.textContent =
        "Loading...";


    const service =
        await getCurrentService();


    if (service) {

        serviceName.textContent =
            service.name || "-";

    }
    else {

        serviceName.textContent =
            "-";

    }

}


/* =====================================
   MAKE FUNCTIONS AVAILABLE TO HTML
===================================== */

window.nextServiceSong =
    nextServiceSong;

window.previousServiceSong =
    previousServiceSong;


/* =====================================
   INITIALIZE SERVICE NAVIGATION
===================================== */

displayServiceName();


console.log(
    "SERVICE NAVIGATION LOADED"
);
