import {
    loadServices,
    saveServices
} from "./firestore.js";

"use strict";

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

               const id = Number(
            localStorage.getItem("currentServiceId")
        );

        if (!id) {
            return null;
        }

        const services =
            await loadServices("guest");

        if (!Array.isArray(services)) {
            return null;
        }

        return services.find(function(service) {

            return Number(service.id) === id;

        }) || null;
    },


    /* --------------------------------------
       SONG INDEX
    -------------------------------------- */

    getSongIndex() {

        return Number(
            localStorage.getItem(
                "currentSongIndex"
            ) || 0
        );

    },


    setSongIndex(index) {

        localStorage.setItem(
            "currentSongIndex",
            String(index)
        );

    },


    /* --------------------------------------
       SAVE TRANSPOSED SERVICE KEY
    -------------------------------------- */

    async saveCurrentServiceKey() {

        console.log(
            "========== SAVE SERVICE KEY =========="
        );

        const serviceId = Number(
            localStorage.getItem(
                "currentServiceId"
            )
        );

        const songIndex = Number(
            localStorage.getItem(
                "currentSongIndex"
            ) || 0
        );

        console.log(
            "Service ID:",
            serviceId
        );

        console.log(
            "Song Index:",
            songIndex
        );


        if (!serviceId) {

            alert(
                "No active Service Planner service."
            );

            return;

        }


        /* ----------------------------------
           LOAD SERVICES FROM FIREBASE
        ---------------------------------- */

        const services =
            await loadServices("guest");


        if (!Array.isArray(services)) {

            alert(
                "Unable to load services from Firebase."
            );

            return;

        }


        /* ----------------------------------
           FIND CURRENT SERVICE
        ---------------------------------- */

        const service =
            services.find(function(s) {

                return Number(s.id) === serviceId;

            });


        if (!service) {

            alert(
                "Service Planner service not found."
            );

            return;

        }


        /* ----------------------------------
           FIND CURRENT SONG
        ---------------------------------- */

        if (
            !service.songs ||
            !service.songs[songIndex]
        ) {

            alert(
                "Current song was not found in the service."
            );

            return;

        }


        const serviceSong =
            service.songs[songIndex];


        /* ----------------------------------
           GET DISPLAYED SERVICE KEY
        ---------------------------------- */

        const serviceKeyElement =
            document.getElementById("serviceKey");


        if (!serviceKeyElement) {

            alert(
                "Service Key element not found."
            );

            return;

        }


        const newServiceKey =
            serviceKeyElement.textContent.trim();


        if (!newServiceKey) {

            alert(
                "Service Key is empty."
            );

            return;

        }


        /* ----------------------------------
           SAVE SERVICE KEY
        ---------------------------------- */

        serviceSong.serviceKey =
            newServiceKey;


        /* ----------------------------------
           SAVE TRANSPOSE VALUE
        ---------------------------------- */

        serviceSong.transpose =
            App.transpose;


        /* ----------------------------------
           PRESERVE ORIGINAL KEY
        ---------------------------------- */

        if (!serviceSong.originalKey) {

            serviceSong.originalKey =
                serviceSong.key ||
                currentSong.key;

        }


        console.log(
            "SERVICE BEING SAVED:",
            service
        );

        console.log(
            "SONG BEING SAVED:",
            serviceSong
        );


        /* ----------------------------------
           SAVE TO FIREBASE
        ---------------------------------- */

        await saveServices(
            "guest",
            services
        );


        /* ----------------------------------
           VERIFY
        ---------------------------------- */

        const verifyServices =
            await loadServices("guest");


        const verifyService =
            verifyServices.find(function(s) {

                return Number(s.id) === serviceId;

            });


        console.log(
            "FIREBASE VERIFIED SERVICE:",
            verifyService
        );


        console.log(
            "FIREBASE VERIFIED SONG:",
            verifyService?.songs?.[songIndex]
        );


        alert(
            "Service Key saved successfully: " +
            newServiceKey
        );

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
            : ${getTransposedKey(key,9)}m

            <br>

            <strong>RETURN TO VERSE</strong>
            : ${getTransposedKey(key,7)}

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


        /*
         * IMPORTANT:
         * Firebase stores the transpose amount.
         */

        const savedTranspose =
            Number(song.transpose || 0);


        App.transpose =
            savedTranspose;


        /*
         * Rebuild chords from ORIGINAL
         * HTML chords.
         *
         * We only do this when a saved
         * transpose exists.
         */

        const steps =
            Math.round(
                savedTranspose * 2
            );


        if (steps !== 0) {

            /*
             * Reload original chord values
             * from the page before applying
             * transpose.
             */

            document
                .querySelectorAll(".chord")
                .forEach(chord => {

                    /*
                     * We cannot reliably restore
                     * original chord text if it has
                     * already been modified.
                     *
                     * The page starts with the
                     * original chords on each load,
                     * so apply the saved steps here.
                     */

                });


            /*
             * Reapply transpose
             */

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


                                    if (
                                        index === -1
                                    ) {

                                        index =
                                            FLAT_SCALE.indexOf(note);

                                    }


                                    if (
                                        index === -1
                                    ) {

                                        return note;

                                    }


                                    return SHARP_SCALE[
                                        (index +
                                            direction +
                                            12) % 12
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


        /*
         * We are already inside /songs/
         */

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
const saveServiceKey =
    document.getElementById("saveServiceKey");

if (saveServiceKey) {

    saveServiceKey.addEventListener(
        "click",
        async function () {

            await Service.saveCurrentServiceKey();

        }
    );

}
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

window.startPresentation = function () {
    Presentation.start();
};

window.exitPresentation = function () {
    Presentation.close();
};
