"use strict";

// ==========================================
// FIREBASE
// ==========================================

import {
    auth,
    db
} from "./firebase.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ==========================================
// CURRENT SERVICE
// ==========================================

let activeService = null;
let currentService = null;
let presentationService = null;
let firebaseUser = null;
/* --------------------------------------
   LOAD ACTIVE SERVICE FROM FIREBASE
-------------------------------------- */

async function loadActiveService(user) {

    /* ----------------------------------
       GET FIREBASE USER
    ---------------------------------- */

    if (!user) {

        user = auth.currentUser;

    }


    /* ----------------------------------
       GET CURRENT SERVICE ID
    ---------------------------------- */

    const serviceId =
        localStorage.getItem(
            "currentServiceId"
        );


    console.log(
        "READING currentServiceId:",
        serviceId
    );


    if (!serviceId) {

        console.error(
            "NO currentServiceId IN LOCAL STORAGE"
        );

        return null;

    }


    /* ----------------------------------
       CHECK FIREBASE AUTHENTICATION
    ---------------------------------- */

    if (!user) {

        console.error(
            "NO AUTHENTICATED FIREBASE USER"
        );

        return null;

    }


    console.log(
        "FIREBASE USER:",
        user.uid
    );


    try {

        /* ----------------------------------
           FIRESTORE SERVICE REFERENCE
        ---------------------------------- */

        const serviceRef = doc(
            db,
            "users",
            user.uid,
            "services",
            String(serviceId)
        );


        console.log(
            "READING FIRESTORE SERVICE:",
            `users/${user.uid}/services/${serviceId}`
        );


        /* ----------------------------------
           GET SERVICE
        ---------------------------------- */

        const snapshot =
            await getDoc(serviceRef);


        if (!snapshot.exists()) {

            console.error(
                "SERVICE DOES NOT EXIST:",
                serviceId
            );

            return null;

        }


        /* ----------------------------------
           BUILD ACTIVE SERVICE
        ---------------------------------- */

        activeService = {

            id: snapshot.id,

            ...snapshot.data()

        };


        /* ----------------------------------
           MAKE SURE SONGS EXISTS
        ---------------------------------- */

        if (
            !Array.isArray(
                activeService.songs
            )
        ) {

            activeService.songs = [];

        }


        /* ----------------------------------
           SET SERVICE REFERENCES
        ---------------------------------- */

        currentService =
            activeService;


        presentationService =
            activeService;


        /* ----------------------------------
           LOG RESULT
        ---------------------------------- */

        console.log(
            "================================"
        );

        console.log(
            "ACTIVE SERVICE LOADED"
        );

        console.log(
            "ID:",
            activeService.id
        );

        console.log(
            "NAME:",
            activeService.name
        );

        console.log(
            "SONGS:",
            activeService.songs.length
        );

        console.log(
            "================================"
        );


        return activeService;

    }
    catch (error) {

        console.error(
            "LOAD ACTIVE SERVICE ERROR:",
            error
        );

        return null;

    }

}


// ==========================================
// WAIT FOR FIREBASE AUTHENTICATION
// ==========================================

const activeServiceReady =
new Promise(function(resolve) {

    onAuthStateChanged(
    auth,
    async function (user) {

        firebaseUser = user;

        console.log(
            "AUTH STATE:",
            user ? user.uid : "NO USER"
        );

        if (!user) {

            console.warn(
                "NO AUTHENTICATED FIREBASE USER"
            );

            return;
        }

        console.log(
            "AUTHENTICATED FIREBASE USER:",
            user.uid
        );

        const service =
            await loadActiveService(user);

        if (!service) {

            console.warn(
                "NO ACTIVE SERVICE"
            );

            return;
        }

        console.log(
            "ACTIVE SERVICE READY:",
            service
        );

    }
);


// ==========================================
// GET ACTIVE SERVICE
// ==========================================

async function getActiveService() {

    if (activeService) {

        return activeService;

    }


    const service =
        await activeServiceReady;


    return service;

}

/* ==========================================================
   WORSHIP SONGS MANAGER
   PART 1A - CORE ENGINE
========================================================== */

/* ==========================================================
   CHORD SCALES
========================================================== */

const SHARP_SCALE = [
    "C","C#","D","D#","E","F",
    "F#","G","G#","A","A#","B"
];

const FLAT_SCALE = [
    "C","Db","D","Eb","E","F",
    "Gb","G","Ab","A","Bb","B"
];

/* ==========================================================
   APP
========================================================== */

const App = {

    fontSize:
        parseInt(localStorage.getItem("songFontSize")) || 22,

    transpose: 0,

    init() {

        this.cacheDOM();

        this.loadDarkMode();

        this.updateLyricsFont();

        Service.restoreTranspose();

        Service.updateKeyDisplay();

        Service.updateGuide();

        Service.updateProgress();

        this.bindEvents();

    },   // ⭐ THIS COMMA IS IMPORTANT

    cacheDOM() {

        this.lyrics =
            document.getElementById("lyrics");

        this.fontPlus =
            document.getElementById("fontPlus");

        this.fontMinus =
            document.getElementById("fontMinus");

        this.darkButton =
            document.getElementById("darkMode");

        this.transposeUp =
            document.getElementById("transposeUp");

        this.transposeDown =
            document.getElementById("transposeDown");

        this.serviceKey =
            document.getElementById("serviceKey");

        this.songEnding =
            document.getElementById("songEnding");

    },

    bindEvents() {

        this.fontPlus?.addEventListener("click", () => {

            this.fontSize += 2;

            if (this.fontSize > 48) {
                this.fontSize = 48;
            }

            this.updateLyricsFont();

        });

        this.fontMinus?.addEventListener("click", () => {

            this.fontSize -= 2;

            if (this.fontSize < 12) {
                this.fontSize = 12;
            }

            this.updateLyricsFont();

        });

        this.darkButton?.addEventListener(
            "click",
            () => this.toggleDarkMode()
        );

        this.transposeUp?.addEventListener(
            "click",
            () => Service.transpose(1)
        );

        this.transposeDown?.addEventListener(
            "click",
            () => Service.transpose(-1)
        );

    },

    updateLyricsFont() {

        document.querySelectorAll(
            ".song-line, .chord"
        ).forEach(el => {

            el.style.fontSize =
                this.fontSize + "px";

        });

        localStorage.setItem(
            "songFontSize",
            this.fontSize
        );

    },

    loadDarkMode() {

        if (
            localStorage.getItem("darkMode") === "true"
        ) {

            document.body.classList.add("dark");

        }

    },

    toggleDarkMode() {

        document.body.classList.toggle("dark");

        localStorage.setItem(
            "darkMode",
            document.body.classList.contains("dark")
        );

    }

};

/* ==========================================================
   SERVICE
========================================================== */

const Service = {

    transpose(step){

        App.transpose += step * 0.5;

        document.querySelectorAll(".chord")

        .forEach(chord=>{

            chord.innerText=

            chord.innerText.replace(

                /[A-G](#|b)?/g,

                note=>{

                    let index=

                    SHARP_SCALE.indexOf(note);

                    if(index===-1){

                        index=

                        FLAT_SCALE.indexOf(note);

                    }

                    if(index===-1){

                        return note;

                    }

                    return SHARP_SCALE[

                        (index+step+12)%12

                    ];

                }

            );

        });

        this.saveTranspose();

        this.updateKeyDisplay();

        this.updateGuide();

    },

   getKey(){

    return getTransposedKey(

        currentSong.key,

        Math.round(App.transpose * 2)

    );

},

    updateKeyDisplay(){

        if(!App.serviceKey) return;

        App.serviceKey.innerText=

            this.getKey();

    },

    updateGuide(){

        if(!App.songEnding) return;

        const key=this.getKey();

        const ending=getTransposedKey(key,5);

        App.songEnding.innerHTML=`

            <strong>LAST 3</strong>

            : ${getTransposedKey(key,9)}m

            <br>

            <strong>RETURN TO VERSE</strong>

            : ${getTransposedKey(key,7)}

            <br>

            <strong>ENDING</strong>

            : ${ending} &nbsp;

              ${ending}m &nbsp;

              ${key}

            <br>

            <strong>SING IN THE SPIRIT</strong>

            : ${key}

              &nbsp;

              ${ending}

        `;

    }

};


/* ==========================================================
   HELPERS
========================================================== */

function getTransposedKey(key,step){

    let index=

    SHARP_SCALE.indexOf(key);

    if(index===-1){

        index=

        FLAT_SCALE.indexOf(key);

    }

    if(index===-1){

        return key;

    }

    return SHARP_SCALE[

        (index+step+12)%12

    ];

}

/* ==========================================================
   SERVICE PLANNER
========================================================== */


Object.assign(Service, {

    /* --------------------------------------
       GET CURRENT SERVICE FROM FIREBASE
    -------------------------------------- */

    async getCurrent() {

        const id =
            localStorage.getItem("currentServiceId");

        if (!id) {
            console.warn("No currentServiceId found.");
            return null;
        }

        if (!auth.currentUser) {
            console.warn("No authenticated Firebase user.");
            return null;
        }

        try {

            const serviceRef = doc(
                db,
                "users",
                auth.currentUser.uid,
                "services",
                String(id)
            );

            const snapshot =
                await getDoc(serviceRef);

            if (!snapshot.exists()) {

                console.warn(
                    "Service not found:",
                    id
                );

                return null;
            }

            const service = {
                id: snapshot.id,
                ...snapshot.data()
            };

            if (!Array.isArray(service.songs)) {
                service.songs = [];
            }

            console.log(
                "Current Service:",
                service
            );

            return service;

        }
        catch (error) {

            console.error(
                "Error loading current service:",
                error
            );

            return null;
        }
    },


    /* --------------------------------------
       GET CURRENT SONG INDEX
    -------------------------------------- */

    getSongIndex() {

        return Number(
            localStorage.getItem(
                "currentSongIndex"
            ) || 0
        );

    },


    /* --------------------------------------
       SET CURRENT SONG INDEX
    -------------------------------------- */

    setSongIndex(index) {

        localStorage.setItem(
            "currentSongIndex",
            String(index)
        );

    },


    /* --------------------------------------
       GET CURRENT SONG
    -------------------------------------- */

    async getCurrentSong() {

        const service =
            await Service.getCurrent();

        if (!service) {
            return null;
        }

        if (!Array.isArray(service.songs)) {
            return null;
        }

        const index =
            Service.getSongIndex();

        if (
            index < 0 ||
            index >= service.songs.length
        ) {
            return null;
        }

        return service.songs[index];

    },


    /* --------------------------------------
       SAVE CURRENT SERVICE KEY
    -------------------------------------- */

   async saveCurrentServiceKey() {

    const user =
        firebaseUser || auth.currentUser;

    if (!user) {

        console.warn(
            "No authenticated Firebase user."
        );

        return false;
    }

    const serviceId =
        localStorage.getItem(
            "currentServiceId"
        );

    if (!serviceId) {

        console.warn(
            "No currentServiceId found."
        );

        return false;
    }

    try {

        const serviceRef = doc(
            db,
            "users",
            user.uid,
            "services",
            String(serviceId)
        );

        const snapshot =
            await getDoc(serviceRef);

        if (!snapshot.exists()) {

            console.warn(
                "Service does not exist:",
                serviceId
            );

            return false;
        }

        const service = {
            id: snapshot.id,
            ...snapshot.data()
        };

        if (!Array.isArray(service.songs)) {
            service.songs = [];
        }

        const songIndex =
            Service.getSongIndex();

        if (
            songIndex < 0 ||
            songIndex >= service.songs.length
        ) {

            console.warn(
                "Current song was not found:",
                songIndex
            );

            return false;
        }

        const serviceSong =
            service.songs[songIndex];

        const serviceKeyElement =
            document.getElementById(
                "serviceKey"
            );

        if (!serviceKeyElement) {

            alert(
                "Service Key element not found."
            );

            return false;
        }

        const newServiceKey =
            serviceKeyElement.textContent.trim();

        if (!newServiceKey) {

            alert(
                "Service Key is empty."
            );

            return false;
        }

        serviceSong.serviceKey =
            newServiceKey;

        serviceSong.transpose =
            Number(App.transpose || 0);

        if (!serviceSong.originalKey) {

            serviceSong.originalKey =
                serviceSong.key ||
                currentSong?.key ||
                "";
        }

        await updateDoc(
            serviceRef,
            {
                songs: service.songs
            }
        );

        console.log(
            "SERVICE SAVED:",
            service
        );

        console.log(
            "SONG SAVED:",
            serviceSong
        );

        alert(
            "Service Key saved successfully: " +
            newServiceKey
        );

        return true;

    }
    catch (error) {

        console.error(
            "ERROR SAVING SERVICE KEY:",
            error
        );

        alert(
            "Unable to save Service Key."
        );

        return false;
    }
},


    /* --------------------------------------
       TRANSPOSE
    -------------------------------------- */

    transpose(step) {

        App.transpose += step * 0.5;

        document
            .querySelectorAll(".chord")
            .forEach(chord => {

                chord.innerText =
                    chord.innerText.replace(
                        /[A-G](#|b)?/g,
                        note => {

                            let index =
                                SHARP_SCALE.indexOf(note);

                            if (index === -1) {

                                index =
                                    FLAT_SCALE.indexOf(note);
                            }

                            if (index === -1) {
                                return note;
                            }

                            return SHARP_SCALE[
                                (index + step + 12) % 12
                            ];

                        }
                    );

            });

        this.updateKeyDisplay();
        this.updateGuide();

    },


    /* --------------------------------------
       CURRENT KEY
    -------------------------------------- */

    getKey() {

        return getTransposedKey(
            currentSong.key,
            Math.round(
                App.transpose * 2
            )
        );

    },


    /* --------------------------------------
       DISPLAY SERVICE KEY
    -------------------------------------- */

    updateKeyDisplay() {

        if (!App.serviceKey) {
            return;
        }

        App.serviceKey.innerText =
            this.getKey();

    },


    /* --------------------------------------
       UPDATE SONG GUIDE
    -------------------------------------- */

    updateGuide() {

        if (!App.songEnding) {
            return;
        }

        const key =
            this.getKey();

        const ending =
            getTransposedKey(key, 5);

        App.songEnding.innerHTML = `

            <strong>LAST 3</strong>
            : ${getTransposedKey(key, 9)}m

            <br>

            <strong>RETURN TO VERSE</strong>
            : ${getTransposedKey(key, 7)}

            <br>

            <strong>ENDING</strong>
            : ${ending}
              &nbsp;
              ${ending}m
              &nbsp;
              ${key}

            <br>

            <strong>SING IN THE SPIRIT</strong>
            : ${key}
              &nbsp;
              ${ending}

        `;

    },


    /* --------------------------------------
       RESTORE SAVED TRANSPOSE
    -------------------------------------- */

    async restoreTranspose() {

        const service =
            await this.getCurrent();

        if (!service) {
            return;
        }

        const index =
            this.getSongIndex();

        const song =
            service.songs?.[index];

        if (!song) {
            return;
        }

        const savedTranspose =
            Number(song.transpose || 0);

        App.transpose =
            savedTranspose;

        const steps =
            Math.round(
                savedTranspose * 2
            );

        if (steps !== 0) {

            const direction =
                steps > 0 ? 1 : -1;

            for (
                let i = 0;
                i < Math.abs(steps);
                i++
            ) {

                document
                    .querySelectorAll(".chord")
                    .forEach(chord => {

                        chord.innerText =
                            chord.innerText.replace(
                                /[A-G](#|b)?/g,
                                note => {

                                    let index =
                                        SHARP_SCALE.indexOf(note);

                                    if (index === -1) {

                                        index =
                                            FLAT_SCALE.indexOf(note);
                                    }

                                    if (index === -1) {
                                        return note;
                                    }

                                    return SHARP_SCALE[
                                        (
                                            index +
                                            direction +
                                            12
                                        ) % 12
                                    ];

                                }
                            );

                    });
            }
        }

        this.updateKeyDisplay();
        this.updateGuide();

        const transposeDisplay =
            document.getElementById(
                "transposeValue"
            );

        if (transposeDisplay) {

            transposeDisplay.innerText =
                (App.transpose >= 0 ? "+" : "") +
                App.transpose.toFixed(1);

        }

    },


    /* --------------------------------------
       NEXT SONG
    -------------------------------------- */

    async next() {

        const service =
            await this.getCurrent();

        if (!service) {

            alert(
                "No active service."
            );

            return;
        }

        let index =
            this.getSongIndex();

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

        this.setSongIndex(index);

        localStorage.setItem(
            "resumePresentation",
            "true"
        );

        const nextFile =
            service.songs[index].file
                .replace(/^songs\//, "");

        console.log(
            "NEXT:",
            nextFile
        );

        location.href =
            nextFile;

    },


    /* --------------------------------------
       PREVIOUS SONG
    -------------------------------------- */

    async previous() {

        const service =
            await this.getCurrent();

        if (!service) {

            alert(
                "No active service."
            );

            return;
        }

        let index =
            this.getSongIndex();

        if (index <= 0) {

            alert(
                "This is the first song."
            );

            return;
        }

        index--;

        this.setSongIndex(index);

        localStorage.setItem(
            "resumePresentation",
            "true"
        );

        const previousFile =
            service.songs[index].file
                .replace(/^songs\//, "");

        console.log(
            "PREVIOUS:",
            previousFile
        );

        location.href =
            previousFile;

    },


    /* --------------------------------------
       STOP SERVICE
    -------------------------------------- */

    stop() {

        localStorage.removeItem(
            "currentService"
        );

        localStorage.removeItem(
            "currentServiceId"
        );

        localStorage.removeItem(
            "currentSongIndex"
        );

        localStorage.removeItem(
            "resumePresentation"
        );

        const progress =
            document.getElementById(
                "serviceProgress"
            );

        if (progress) {
            progress.innerHTML = "";
        }

        alert(
            "Service ended."
        );

    },


    /* --------------------------------------
       UPDATE PROGRESS
    -------------------------------------- */

    async updateProgress() {

        const progress =
            document.getElementById(
                "serviceProgress"
            );

        if (!progress) {
            return;
        }

        const service =
            await this.getCurrent();

        if (!service) {

            progress.innerHTML = "";

            return;
        }

        const index =
            this.getSongIndex();

        progress.innerHTML = `

            Service:
            <strong>${service.name}</strong>
            |
            Song
            ${index + 1}
            of
            ${service.songs.length}

        `;

    }

});

/* ==========================================================
   PRESENTATION
========================================================== */

const Presentation = {

    start(){

        const overlay =
        document.getElementById("presentationScreen");

        if(!overlay) return;

        overlay.classList.add("show");

        const title =
        document.getElementById("presentationTitle");

        const lyrics =
        document.getElementById("presentationLyrics");

        if(title){

            title.innerText =
            currentSong.title;

        }

        if(lyrics && App.lyrics){

            lyrics.innerHTML =
            App.lyrics.innerHTML;

        }

        this.update();

        if(document.documentElement.requestFullscreen){

            document.documentElement.requestFullscreen();

        }

    },


    close(){

        document
        .getElementById("presentationScreen")
        ?.classList.remove("show");

        if(document.fullscreenElement){

            document.exitFullscreen();

        }

    },


    update(){

        const service =
        Service.getCurrent();

        if(!service) return;

        const index =
        Service.getSongIndex();

        document
        .getElementById("presentationCounter")
        ?.replaceChildren(

            document.createTextNode(

                `Song ${index+1} / ${service.songs.length}`

            )

        );

        const preview =
        document.getElementById("nextSongPreview");

        if(preview){

            preview.innerHTML =
            index < service.songs.length-1

            ? `Next : ${service.songs[index+1].title}`

            : "";

        }

    }

};


/* ==========================================================
   UTILITIES
========================================================== */

function fitToOnePage(){

    window.print();

}
window.fitToOnePage = fitToOnePage;

function goHome(){

    localStorage.removeItem("currentService");

    localStorage.removeItem("currentServiceId");

    localStorage.removeItem("currentSongIndex");

    localStorage.removeItem("resumePresentation");

    if(document.fullscreenElement){

        document.exitFullscreen();

    }

    location.href="../index.html";

}

function showArtist(){

    alert(

        "Artist : " +

        currentSong.artist

    );

}
window.goHome = goHome;

/* ==========================================================
   COMPATIBILITY
========================================================== */

function startPresentation(){

    Presentation.start();

}

function exitPresentation(){

    Presentation.close();

}


/* ==========================================================
   KEYBOARD
========================================================== */

document.addEventListener(

    "keydown",

    function(e){

        switch(e.key){

            case "+":
            case "=":

                App.fontPlus?.click();

            break;


            case "-":

                App.fontMinus?.click();

            break;


            case "ArrowRight":

                Service.next();

            break;


            case "ArrowLeft":

                Service.previous();

            break;


            case "p":
            case "P":

                Presentation.start();

            break;


            case "Escape":

                Presentation.close();

            break;


            case "d":
            case "D":

                App.darkButton?.click();

            break;


            case "h":
            case "H":

                goHome();

            break;


            case "a":
            case "A":

                showArtist();

            break;

        }

    }

);


/* ==========================================================
   INITIALIZATION
========================================================== */

window.addEventListener(

    "load",

    function(){

        App.init();

        if(

            localStorage.getItem(

                "resumePresentation"

            )==="true"

        ){

            localStorage.removeItem(

                "resumePresentation"

            );

            setTimeout(

                ()=>Presentation.start(),

                300

            );

        }

    }

);
// ======================================
// GLOBAL FUNCTIONS FOR HTML BUTTONS
// ======================================

window.nextServiceSong = function () {
    Service.next();
};

window.previousServiceSong = function () {
    Service.previous();
};

window.stopService = function () {
    Service.stop();
};

window.startPresentation = async function() {

    console.log(
        "START PRESENTATION"
    );


    const service =
        await getActiveService();


    if (!service) {

        alert(
            "No Active Service."
        );

        console.error(
            "Service Planner service not found."
        );

        return;
    }


    console.log(
        "STARTING SERVICE:",
        service.name
    );


    console.log(
        "SERVICE SONGS:",
        service.songs
    );


    if (
        !Array.isArray(service.songs) ||
        service.songs.length === 0
    ) {

        alert(
            "This Service Planner has no songs."
        );

        return;
    }


    // ======================================
    // YOUR EXISTING PRESENTATION CODE
    // GOES BELOW THIS LINE
    // ======================================

};

window.exitPresentation = function () {
    Presentation.close();
};

onAuthStateChanged(
    auth,
    async function(user) {

        console.log(
            "AUTH STATE CHANGED:",
            user
        );


        if (!user) {

            console.warn(
                "NO AUTHENTICATED FIREBASE USER"
            );

            return;

        }


        console.log(
            "AUTHENTICATED FIREBASE USER:",
            user.uid
        );


        const service =
            await loadActiveService(user);


        if (!service) {

            console.warn(
                "NO ACTIVE SERVICE"
            );

            return;

        }


        console.log(
            "ACTIVE SERVICE READY:",
            service
        );

    }
);
