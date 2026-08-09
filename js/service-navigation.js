"use strict";

import {
    loadServices
} from "./firestore.js";


const FIREBASE_USER = "guest";

const CURRENT_SERVICE_ID = "currentServiceId";
const CURRENT_SONG_INDEX = "currentSongIndex";


let services = [];


/* =====================================
   LOAD SERVICES FROM FIRESTORE
===================================== */

async function loadServiceData() {

    try {

        services =
            await loadServices(FIREBASE_USER);

        console.log(
            "Navigation services loaded:",
            services
        );

    }

    catch(error) {

        console.error(
            "Unable to load services:",
            error
        );

        services = [];

    }

}


/* =====================================
   GET CURRENT SERVICE
===================================== */

function getCurrentService() {

    const serviceId =
        localStorage.getItem(
            CURRENT_SERVICE_ID
        );

    if(!serviceId) {

        console.error(
            "No current service ID."
        );

        return null;

    }


    const service =
        services.find(function(service) {

            return String(service.id) ===
                   String(serviceId);

        });


    console.log(
        "Current service:",
        service
    );


    return service || null;

}


/* =====================================
   GET CURRENT SONG INDEX
===================================== */

function getCurrentSongIndex() {

    return Number(
        localStorage.getItem(
            CURRENT_SONG_INDEX
        ) || 0
    );

}


/* =====================================
   NEXT
===================================== */

async function nextServiceSong() {

    console.log("NEXT BUTTON CLICKED");


    /*
       Make sure Firestore data
       is available.
    */

    if(services.length === 0) {

        await loadServiceData();

    }


    const service =
        getCurrentService();


    if(!service) {

        alert(
            "No active service found."
        );

        return;

    }


    if(
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


    if(
        index >=
        service.songs.length - 1
    ) {

        alert(
            "This is the last song."
        );

        return;

    }


    index++;


    const nextSong =
        service.songs[index];


    if(
        !nextSong ||
        !nextSong.file
    ) {

        alert(
            "Next song file not found."
        );

        console.error(
            "Invalid next song:",
            nextSong
        );

        return;

    }


    /*
       SAVE INDEX BEFORE
       CHANGING PAGE
    */

    localStorage.setItem(
        CURRENT_SONG_INDEX,
        String(index)
    );


    console.log(
        "Going to:",
        nextSong.file
    );


    location.href =
        nextSong.file;

}


/* =====================================
   PREVIOUS
===================================== */

async function previousServiceSong() {

    console.log(
        "PREVIOUS BUTTON CLICKED"
    );


    if(services.length === 0) {

        await loadServiceData();

    }


    const service =
        getCurrentService();


    if(!service) {

        alert(
            "No active service found."
        );

        return;

    }


    let index =
        getCurrentSongIndex();


    if(index <= 0) {

        alert(
            "This is the first song."
        );

        return;

    }


    index--;


    const previousSong =
        service.songs[index];


    if(
        !previousSong ||
        !previousSong.file
    ) {

        alert(
            "Previous song file not found."
        );

        return;

    }


    localStorage.setItem(
        CURRENT_SONG_INDEX,
        String(index)
    );


    location.href =
        previousSong.file;

}


/* =====================================
   FINISH SERVICE
===================================== */

function finishService() {

    localStorage.removeItem(
        CURRENT_SERVICE_ID
    );

    localStorage.removeItem(
        CURRENT_SONG_INDEX
    );

    localStorage.removeItem(
        "resumePresentation"
    );

    alert(
        "Service Finished."
    );

}


/* =====================================
   MAKE AVAILABLE TO HTML BUTTONS
===================================== */

window.nextServiceSong =
    nextServiceSong;

window.previousServiceSong =
    previousServiceSong;

window.finishService =
    finishService;


/* =====================================
   INITIAL LOAD
===================================== */

loadServiceData();
