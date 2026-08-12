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
    getDoc,
    updateDoc,
    serverTimestamp
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
    new Promise(function (resolve) {

        onAuthStateChanged(
            auth,
            async function (user) {

                firebaseUser = user;

                console.log(
                    "AUTH STATE:",
                    user
                        ? user.uid
                        : "NO USER"
                );

                if (!user) {

                    console.warn(
                        "NO AUTHENTICATED FIREBASE USER"
                    );

                    resolve(null);

                    return;
                }

                console.log(
                    "AUTHENTICATED FIREBASE USER:",
                    user.uid
                );

                try {

                    const service =
                        await loadActiveService(user);

                    if (!service) {

                        console.warn(
                            "NO ACTIVE SERVICE"
                        );

                        resolve(null);

                        return;
                    }

                    console.log(
                        "ACTIVE SERVICE READY:",
                        service
                    );

                    resolve(service);

                }
                catch (error) {

                    console.error(
                        "ERROR LOADING ACTIVE SERVICE:",
                        error
                    );

                    resolve(null);
                }

            }
        );

    });


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

   async init() {

    this.cacheDOM();

    this.loadDarkMode();

    this.updateLyricsFont();

    this.bindEvents();

    await Service.restoreTranspose();

    Service.updateKeyDisplay();

    Service.updateGuide();

    Service.updateProgress();

},

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

        /* ----------------------------------
           GET CURRENT SERVICE ID
        ---------------------------------- */

        const id =
            localStorage.getItem(
                "currentServiceId"
            );


        if (!id) {

            console.warn(
                "No currentServiceId found."
            );

            return null;

        }


        /* ----------------------------------
           WAIT FOR FIREBASE AUTH + SERVICE
        ---------------------------------- */

        const service =
            await getActiveService();


        if (!service) {

            console.warn(
                "No active Firebase service."
            );

            return null;

        }


        /* ----------------------------------
           MAKE SURE SONGS EXISTS
        ---------------------------------- */

        if (
            !Array.isArray(
                service.songs
            )
        ) {

            service.songs = [];

        }


        /* ----------------------------------
           VERIFY SERVICE ID
        ---------------------------------- */

        if (
            String(service.id) !==
            String(id)
        ) {

            console.warn(
                "Active service ID does not match currentServiceId:",
                service.id,
                id
            );

            return null;

        }


        console.log(
            "Current Service:",
            service
        );


        return service;

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

    console.log("================================");
    console.log("SAVE SERVICE KEY");

    // ======================================
    // 1. GET AUTHENTICATED USER
    // ======================================

    const user =
        firebaseUser ||
        auth.currentUser;

    if (!user) {

        console.error(
            "SAVE SERVICE KEY: NO AUTHENTICATED FIREBASE USER"
        );

        alert(
            "Firebase user is not authenticated."
        );

        return false;
    }

    console.log(
        "USER UID:",
        user.uid
    );

    // ======================================
    // 2. GET CURRENT SERVICE ID
    // ======================================

    const serviceId =
        localStorage.getItem(
            "currentServiceId"
        );

    if (!serviceId) {

        console.error(
            "NO currentServiceId"
        );

        alert(
            "No active Service Planner found."
        );

        return false;
    }

    console.log(
        "SERVICE ID:",
        serviceId
    );

    // ======================================
    // 3. GET CURRENT SONG INDEX
    // ======================================

    const songIndex =
        Number(
            localStorage.getItem(
                "currentSongIndex"
            ) || 0
        );

    console.log(
        "SONG INDEX:",
        songIndex
    );

    try {

        // ======================================
        // 4. GET SERVICE FROM FIRESTORE
        // ======================================

        const serviceRef =
            doc(
                db,
                "users",
                user.uid,
                "services",
                String(serviceId)
            );

        const snapshot =
            await getDoc(serviceRef);

        if (!snapshot.exists()) {

            console.error(
                "SERVICE DOES NOT EXIST:",
                serviceId
            );

            alert(
                "The Service Planner record was not found."
            );

            return false;
        }

        const service =
            snapshot.data();

        // ======================================
        // 5. CHECK SONGS
        // ======================================

        if (
            !Array.isArray(service.songs)
        ) {

            console.error(
                "SERVICE HAS NO SONGS ARRAY"
            );

            alert(
                "The Service Planner has no songs."
            );

            return false;
        }

        if (
            songIndex < 0 ||
            songIndex >= service.songs.length
        ) {

            console.error(
                "INVALID SONG INDEX:",
                songIndex
            );

            alert(
                "Current song was not found in the Service Planner."
            );

            return false;
        }

        // ======================================
        // 6. GET CURRENT SONG
        // ======================================

        const song =
            service.songs[songIndex];

        console.log(
            "CURRENT SONG BEFORE SAVE:",
            song
        );

        // ======================================
        // 7. GET DISPLAYED SERVICE KEY
        // ======================================

        const serviceKeyElement =
            document.getElementById(
                "serviceKey"
            );

        if (!serviceKeyElement) {

            console.error(
                "ELEMENT #serviceKey NOT FOUND"
            );

            alert(
                "Service Key element was not found."
            );

            return false;
        }

        const displayedKey =
            serviceKeyElement.textContent.trim();

        console.log(
            "DISPLAYED SERVICE KEY:",
            displayedKey
        );

        if (!displayedKey) {

            console.error(
                "DISPLAYED SERVICE KEY IS EMPTY"
            );

            alert(
                "Service Key is empty."
            );

            return false;
        }

        // ======================================
        // 8. PRESERVE ORIGINAL KEY
        // ======================================

        if (!song.originalKey) {

            song.originalKey =
                song.key ||
                displayedKey;
        }

        // ======================================
        // 9. SAVE SERVICE KEY + TRANSPOSE
        // ======================================

        song.serviceKey =
            displayedKey;

        song.transpose =
            Number(
                App.transpose || 0
            );

        console.log(
            "ORIGINAL KEY:",
            song.originalKey
        );

        console.log(
            "NEW SERVICE KEY:",
            song.serviceKey
        );

        console.log(
            "TRANSPOSE:",
            song.transpose
        );

        // ======================================
        // 10. UPDATE FIRESTORE
        // ======================================

        await updateDoc(
            serviceRef,
            {
                songs: service.songs,

                updatedAt:
                    serverTimestamp()
            }
        );

        // ======================================
        // 11. VERIFY FIRESTORE SAVE
        // ======================================

        const verify =
            await getDoc(serviceRef);

        if (!verify.exists()) {

            console.error(
                "SAVE VERIFICATION FAILED"
            );

            alert(
                "Service Key could not be verified."
            );

            return false;
        }

        const verifyData =
            verify.data();

        const savedSong =
            verifyData.songs?.[songIndex];

        console.log(
            "FIREBASE VERIFIED:",
            savedSong
        );

        // ======================================
        // 12. SUCCESS NOTIFICATION
        // ======================================

        alert(
            "Service Key saved successfully!\n\n" +
            "Service: " +
            (service.name || "Unknown") +
            "\n" +
            "Song: " +
            (song.title || "Unknown") +
            "\n" +
            "Service Key: " +
            displayedKey +
            "\n" +
            "Transpose: " +
            (song.transpose >= 0 ? "+" : "") +
            song.transpose
        );

        console.log(
            "================================"
        );

        console.log(
            "SERVICE KEY SUCCESSFULLY SAVED"
        );

        console.log(
            "SERVICE:",
            serviceId
        );

        console.log(
            "SONG:",
            songIndex
        );

        console.log(
            "KEY:",
            displayedKey
        );

        console.log(
            "TRANSPOSE:",
            song.transpose
        );

        console.log(
            "================================"
        );

        return true;

    }
    catch (error) {

        console.error(
            "SAVE SERVICE KEY ERROR:",
            error
        );

        alert(
            "Unable to save Service Key.\n\n" +
            error.message
        );

        return false;
    }
},

/* --------------------------------------
   TRANSPOSE
-------------------------------------- */

async transpose(step) {

    console.log(
        "TRANSPOSE:",
        step
    );


    /* ----------------------------------
       CHANGE TRANSPOSE VALUE
    ---------------------------------- */

    App.transpose +=
        step * 0.5;


    /* ----------------------------------
       CHANGE DISPLAYED CHORDS
    ---------------------------------- */

    document
        .querySelectorAll(".chord")
        .forEach(chord => {

            chord.innerText =
                chord.innerText.replace(
                    /[A-G](#|b)?/g,
                    note => {

                        let index =
                            SHARP_SCALE.indexOf(
                                note
                            );


                        if (index === -1) {

                            index =
                                FLAT_SCALE.indexOf(
                                    note
                                );

                        }


                        if (index === -1) {

                            return note;

                        }


                        return SHARP_SCALE[
                            (
                                index +
                                step +
                                12
                            ) % 12
                        ];

                    }
                );

        });


    /* ----------------------------------
       UPDATE KEY DISPLAY
    ---------------------------------- */

    this.updateKeyDisplay();

    this.updateGuide();


    /* ----------------------------------
       UPDATE TRANSPOSE DISPLAY
    ---------------------------------- */

    const transposeDisplay =
        document.getElementById(
            "transposeValue"
        );


    if (transposeDisplay) {

        transposeDisplay.innerText =
            (
                App.transpose >= 0
                    ? "+"
                    : ""
            ) +
            App.transpose.toFixed(1);

    }


    /* ----------------------------------
       SAVE SERVICE KEY TO FIREBASE
    ---------------------------------- */

    const saved =
        await this.saveCurrentServiceKey();


    if (!saved) {

        console.warn(
            "Transpose changed locally, but Firebase save failed."
        );

    }

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
   MODERN 3-COLUMN PRESENTATION
   ========================================================== */

const Presentation = {

    /* ======================================================
       START PRESENTATION
       ====================================================== */

    async start() {

        console.log(
            "========================================"
        );

        console.log(
            "STARTING PRESENTATION"
        );

        console.log(
            "========================================"
        );


        const overlay =
            document.getElementById(
                "presentationScreen"
            );


        if (!overlay) {

            console.error(
                "presentationScreen not found."
            );

            return;
        }


        /* ==================================================
           IMPORTANT:
           Determine whether the presentation was launched
           from Service Planner or directly from a song.
           ================================================== */

        const service =
            await Service.getCurrent();


        /*
         * Check whether the current song index actually
         * points to a song in the Service Planner.
         */

        let serviceSong = null;

        let serviceIndex = -1;


        if (service) {

            serviceIndex =
                Service.getSongIndex();


            if (
                Array.isArray(service.songs) &&
                serviceIndex >= 0 &&
                serviceIndex < service.songs.length
            ) {

                serviceSong =
                    service.songs[serviceIndex];

            }

        }


        /* ==================================================
           SERVICE PLANNER MODE
           ================================================== */

        if (serviceSong) {

            console.log(
                "PRESENTATION MODE: SERVICE PLANNER"
            );


            console.log(
                "SERVICE:",
                service.name
            );


            console.log(
                "SERVICE SONG INDEX:",
                serviceIndex
            );


            console.log(
                "SERVICE SONG:",
                serviceSong
            );


            /*
             * IMPORTANT
             *
             * The Service Planner song becomes the
             * presentation song.
             */

            window.currentSong =
                serviceSong;


            window.currentSongIndex =
                serviceIndex;


            /*
             * Remember that presentation is currently
             * being used from Service Planner.
             */

            localStorage.setItem(
                "presentationMode",
                "service"
            );


            /* ------------------------------------------
               TITLE
               ------------------------------------------ */

            const title =
                document.getElementById(
                    "presentationTitle"
                );


            if (title) {

                title.innerText =
                    serviceSong.title ||
                    "Untitled Song";

            }


            /* ------------------------------------------
               SHOW PRESENTATION
               ------------------------------------------ */

            overlay.classList.add(
                "show"
            );


            /* ------------------------------------------
               BUILD
               ------------------------------------------ */

            this.build();


            /* ------------------------------------------
               UPDATE SERVICE INFORMATION
               ------------------------------------------ */

            await this.update();


            return;
        }


        /* ==================================================
           STANDALONE SONG MODE
           ================================================== */

        console.log(
            "PRESENTATION MODE: STANDALONE SONG"
        );


        /*
         * DO NOT call Service.getCurrentSong()
         * here.
         *
         * A standalone song does not belong to the
         * Service Planner.
         */


        let song =
            window.currentSong;


        /*
         * Try the normal global variable if available.
         */

        if (
            !song &&
            typeof currentSong !== "undefined"
        ) {

            song =
                currentSong;

        }


        /*
         * Final check.
         */

        if (!song) {

            console.error(
                "No current song available."
            );


            alert(
                "Unable to start presentation.\n\n" +
                "The current song could not be identified."
            );


            return;
        }


        console.log(
            "STANDALONE SONG:",
            song
        );


        /*
         * Keep the song globally available.
         */

        window.currentSong =
            song;


        /*
         * Mark presentation as standalone.
         */

        localStorage.setItem(
            "presentationMode",
            "standalone"
        );


        /* ------------------------------------------
           TITLE
           ------------------------------------------ */

        const title =
            document.getElementById(
                "presentationTitle"
            );


        if (title) {

            title.innerText =
                song.title ||
                "Untitled Song";

        }


        /* ------------------------------------------
           SHOW PRESENTATION
           ------------------------------------------ */

        overlay.classList.add(
            "show"
        );


        /* ------------------------------------------
           BUILD
           ------------------------------------------ */

        this.build();


        /* ------------------------------------------
           STANDALONE COUNTER
           ------------------------------------------ */

        const counter =
            document.getElementById(
                "presentationCounter"
            );


        if (counter) {

            counter.innerText =
                "Standalone Song";

        }


        /* ------------------------------------------
           REMOVE NEXT SONG
           ------------------------------------------ */

        const preview =
            document.getElementById(
                "nextSongPreview"
            );


        if (preview) {

            preview.innerHTML =
                "";

            preview.style.display =
                "none";

        }

    },


    /* ======================================================
       BUILD PRESENTATION
       ====================================================== */

    build() {

        const output =
            document.getElementById(
                "presentationLyrics"
            );


        if (!output) {

            console.error(
                "presentationLyrics not found."
            );

            return;
        }


        /*
         * IMPORTANT:
         *
         * Do not depend only on App.lyrics.
         *
         * The current song page may use a different
         * lyrics container.
         */

        const lyricsSource =
            document.getElementById(
                "lyrics"
            );


        if (!lyricsSource) {

            console.error(
                "Lyrics source #lyrics not found."
            );

            output.innerHTML =
                "<div style='color:white;text-align:center;padding:40px'>" +
                "Lyrics could not be loaded." +
                "</div>";

            return;
        }


        /* ------------------------------------------
           COPY SOURCE
           ------------------------------------------ */

        const source =
            document.createElement(
                "div"
            );


        source.innerHTML =
            lyricsSource.innerHTML;


        /* ------------------------------------------
           FIND SONG SECTIONS
           ------------------------------------------ */

        let sections =
            Array.from(
                source.querySelectorAll(
                    ".song-section"
                )
            );


        /*
         * If the page does not use .song-section,
         * use the complete song content.
         */

        if (!sections.length) {

            const songElement =
                source.querySelector(
                    ".song"
                );


            if (songElement) {

                sections =
                    Array.from(
                        songElement.children
                    );

            }

        }


        /*
         * If still no sections, use the entire
         * lyrics container.
         */

        if (!sections.length) {

            sections = [
                source
            ];

        }


        /* ------------------------------------------
           CLEAR OLD PRESENTATION
           ------------------------------------------ */

        output.innerHTML =
            "";


        /* ------------------------------------------
           CREATE 3 COLUMN GRID
           ------------------------------------------ */

        const grid =
            document.createElement(
                "div"
            );


        grid.className =
            "presentation-grid";


        /* ------------------------------------------
           CREATE SECTIONS
           ------------------------------------------ */

        sections.forEach(
            section => {

                if (
                    !section.textContent.trim()
                ) {

                    return;
                }


                const card =
                    document.createElement(
                        "div"
                    );


                card.className =
                    "presentation-section";


                /* ----------------------------------
                   SECTION TITLE
                   ---------------------------------- */

                const sectionTitle =
                    section.querySelector(
                        ".section-title"
                    );


                if (sectionTitle) {

                    const newTitle =
                        document.createElement(
                            "div"
                        );


                    newTitle.className =
                        "presentation-section-title";


                    newTitle.textContent =
                        sectionTitle
                            .textContent
                            .trim();


                    card.appendChild(
                        newTitle
                    );

                }


                /* ----------------------------------
                   CONTENT
                   ---------------------------------- */

                const content =
                    document.createElement(
                        "div"
                    );


                content.className =
                    "presentation-section-content";


                const lines =
                    section.querySelectorAll(
                        ".song-line"
                    );


                if (lines.length) {

                    lines.forEach(
                        line => {

                            const newLine =
                                line.cloneNode(
                                    true
                                );


                            newLine.classList.add(
                                "presentation-line"
                            );


                            /*
                             * Remove unwanted source
                             * styling that may make the
                             * presentation invisible.
                             */

                            newLine.style.display =
                                "block";


                            newLine.style.visibility =
                                "visible";


                            newLine.style.opacity =
                                "1";


                            /* ----------------------
                               LYRIC COLOR
                               ---------------------- */

                            newLine.style.color =
                                "#ffffff";


                            newLine
                                .querySelectorAll(
                                    "*"
                                )
                                .forEach(
                                    element => {

                                        if (
                                            element.classList.contains(
                                                "chord"
                                            )
                                        ) {

                                            return;
                                        }


                                        element.style.color =
                                            "#ffffff";

                                    }
                                );


                            /* ----------------------
                               CHORD COLOR
                               ---------------------- */

                            newLine
                                .querySelectorAll(
                                    ".chord"
                                )
                                .forEach(
                                    chord => {

                                        chord.style.color =
                                            "#ff4444";


                                        chord.style.fontWeight =
                                            "900";

                                    }
                                );


                            content.appendChild(
                                newLine
                            );

                        }
                    );

                }
                else {

                    const clone =
                        section.cloneNode(
                            true
                        );


                    clone
                        .querySelectorAll(
                            ".section-title"
                        )
                        .forEach(
                            element =>
                                element.remove()
                        );


                    clone
                        .querySelectorAll(
                            ".chord"
                        )
                        .forEach(
                            chord => {

                                chord.style.color =
                                    "#ff4444";


                                chord.style.fontWeight =
                                    "900";

                            }
                        );


                    clone.style.color =
                        "#ffffff";


                    content.appendChild(
                        clone
                    );

                }


                card.appendChild(
                    content
                );


                grid.appendChild(
                    card
                );

            }
        );


        output.appendChild(
            grid
        );


        console.log(
            "PRESENTATION BUILD COMPLETE"
        );


        console.log(
            "SECTIONS:",
            sections.length
        );

    },


    /* ======================================================
       UPDATE PRESENTATION
       ====================================================== */

    async update() {

        /*
         * FIRST determine presentation mode.
         */

        const mode =
            localStorage.getItem(
                "presentationMode"
            );


        /* ==================================================
           STANDALONE
           ================================================== */

        if (
            mode === "standalone"
        ) {

            console.log(
                "UPDATE: STANDALONE MODE"
            );


            const counter =
                document.getElementById(
                    "presentationCounter"
                );


            if (counter) {

                counter.innerText =
                    "Standalone Song";

            }


            const preview =
                document.getElementById(
                    "nextSongPreview"
                );


            if (preview) {

                preview.innerHTML =
                    "";


                preview.style.display =
                    "none";

            }


            return;
        }


        /* ==================================================
           SERVICE PLANNER
           ================================================== */

        const service =
            await Service.getCurrent();


        if (!service) {

            console.warn(
                "UPDATE: No Service Planner"
            );

            return;
        }


        const songs =
            Array.isArray(service.songs)
                ? service.songs
                : [];


        const index =
            Number(
                Service.getSongIndex()
            ) || 0;


        /* ------------------------------------------
           COUNTER
           ------------------------------------------ */

        const counter =
            document.getElementById(
                "presentationCounter"
            );


        if (counter) {

            counter.innerText =
                `Song ${index + 1} / ${songs.length}`;

        }


        /* ------------------------------------------
           NEXT SONG
           ------------------------------------------ */

        const preview =
            document.getElementById(
                "nextSongPreview"
            );


        if (!preview) {

            return;
        }


        if (
            index >= 0 &&
            index < songs.length - 1 &&
            songs[index + 1]
        ) {

            const nextSong =
                songs[index + 1];


            preview.innerHTML = `

                <span class="next-song-label">
                    NEXT SONG
                </span>

                <span class="next-song-title">
                    ${
                        nextSong.title ||
                        "Untitled Song"
                    }
                </span>

            `;


            preview.style.display =
                "flex";

        }
        else {

            preview.innerHTML =
                "";


            preview.style.display =
                "none";

        }

    },


    /* ======================================================
       CLOSE PRESENTATION
       ====================================================== */

    close() {

        console.log(
            "CLOSING PRESENTATION"
        );


        const overlay =
            document.getElementById(
                "presentationScreen"
            );


        if (overlay) {

            overlay.classList.remove(
                "show"
            );

        }


        /*
         * Do NOT remove currentServiceId.
         *
         * The Service Planner must remain active.
         */


        localStorage.removeItem(
            "presentationMode"
        );


        console.log(
            "PRESENTATION CLOSED"
        );

    }

};
/* ======================================
   GLOBAL FUNCTIONS FOR HTML BUTTONS
====================================== */


/* --------------------------------------
   HOME
-------------------------------------- */

window.goHome = function () {

    console.log(
        "GO HOME BUTTON CLICKED"
    );

    /*
     * always.html is assumed to be inside
     * the songs folder.
     *
     * Change this path if your index.html
     * is somewhere else.
     */

    window.location.href =
        "../index.html";

};


/* --------------------------------------
   START PRESENTATION
-------------------------------------- */

window.startPresentation = async function () {

    console.log(
        "START PRESENTATION BUTTON CLICKED"
    );

    await Presentation.start();

};


/* --------------------------------------
   NEXT SERVICE SONG
-------------------------------------- */

window.nextServiceSong = async function () {

    console.log(
        "NEXT SERVICE SONG BUTTON CLICKED"
    );

    await Service.next();

};


/* --------------------------------------
   PREVIOUS SERVICE SONG
-------------------------------------- */

window.previousServiceSong = async function () {

    console.log(
        "PREVIOUS SERVICE SONG BUTTON CLICKED"
    );

    await Service.previous();

};


/* --------------------------------------
   STOP SERVICE
-------------------------------------- */

window.stopService = function () {

    console.log(
        "STOP SERVICE BUTTON CLICKED"
    );

    Service.stop();

};


/* --------------------------------------
   EXIT PRESENTATION
-------------------------------------- */

window.exitPresentation = function () {

    console.log(
        "EXIT PRESENTATION BUTTON CLICKED"
    );

    Presentation.close();

};


/* ======================================
   INITIALIZE APPLICATION
====================================== */

document.addEventListener(
    "DOMContentLoaded",
    async function () {

        console.log(
            "================================"
        );

        console.log(
            "INITIALIZING SONG APPLICATION"
        );

        console.log(
            "================================"
        );

        try {

            await App.init();

            console.log(
                "SONG APPLICATION INITIALIZED"
            );

        }
        catch (error) {

            console.error(
                "APP INITIALIZATION ERROR:",
                error
            );

        }

    }
);
