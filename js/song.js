"use strict";

// ==========================================================
// FIREBASE
// ==========================================================

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

// ==========================================================
// CURRENT SERVICE
// ==========================================================

let activeService = null;
let currentService = null;
let presentationService = null;
let firebaseUser = null;

// ==========================================================
// LOAD ACTIVE SERVICE FROM FIREBASE
// ==========================================================

async function loadActiveService(user) {

// ------------------------------------------------------
// GET FIREBASE USER
// ------------------------------------------------------

if (!user) {
    user = auth.currentUser;
}

// ------------------------------------------------------
// GET CURRENT SERVICE ID
// ------------------------------------------------------

const serviceId =
    localStorage.getItem("currentServiceId");

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

// ------------------------------------------------------
// CHECK FIREBASE AUTHENTICATION
// ------------------------------------------------------

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

    // --------------------------------------------------
    // FIRESTORE SERVICE REFERENCE
    // --------------------------------------------------

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

    // --------------------------------------------------
    // GET SERVICE
    // --------------------------------------------------

    const snapshot =
        await getDoc(serviceRef);

    if (!snapshot.exists()) {

        console.error(
            "SERVICE DOES NOT EXIST:",
            serviceId
        );

        return null;
    }

    // --------------------------------------------------
    // BUILD ACTIVE SERVICE
    // --------------------------------------------------

    activeService = {
        id: snapshot.id,
        ...snapshot.data()
    };

    // --------------------------------------------------
    // MAKE SURE SONGS EXISTS
    // --------------------------------------------------

    if (!Array.isArray(activeService.songs)) {
        activeService.songs = [];
    }

    // --------------------------------------------------
    // SET SERVICE REFERENCES
    // --------------------------------------------------

    currentService = activeService;
    presentationService = activeService;

    // --------------------------------------------------
    // LOG RESULT
    // --------------------------------------------------

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

// ==========================================================
// WAIT FOR FIREBASE AUTHENTICATION
// ==========================================================

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

// ==========================================================
// GET ACTIVE SERVICE
// ==========================================================

async function getActiveService() {

if (activeService) {
    return activeService;
}

const service =
    await activeServiceReady;

return service;

}

// ==========================================================
// WORSHIP SONGS MANAGER
// CORE ENGINE
// ==========================================================

// ==========================================================
// CHORD SCALES
// ==========================================================

const SHARP_SCALE = [
"C",
"C#",
"D",
"D#",
"E",
"F",
"F#",
"G",
"G#",
"A",
"A#",
"B"
];

const FLAT_SCALE = [
"C",
"Db",
"D",
"Eb",
"E",
"F",
"Gb",
"G",
"Ab",
"A",
"Bb",
"B"
];

// ==========================================================
// APP
// ==========================================================

const App = {

fontSize:
    parseInt(
        localStorage.getItem("songFontSize")
    ) || 22,

transpose: 0,

// ------------------------------------------------------
// INITIALIZE
// ------------------------------------------------------

async init() {

    this.cacheDOM();

    this.loadDarkMode();

    this.updateLyricsFont();

    this.bindEvents();

    await Service.restoreTranspose();

Service.updateKeyDisplay();

await Service.updateGuide();

Service.updateProgress();
},

// ------------------------------------------------------
// CACHE DOM
// ------------------------------------------------------

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

// ------------------------------------------------------
// BIND EVENTS
// ------------------------------------------------------

bindEvents() {

    this.fontPlus?.addEventListener(
        "click",
        () => {

            this.fontSize += 2;

            if (this.fontSize > 48) {
                this.fontSize = 48;
            }

            this.updateLyricsFont();
        }
    );

    this.fontMinus?.addEventListener(
        "click",
        () => {

            this.fontSize -= 2;

            if (this.fontSize < 12) {
                this.fontSize = 12;
            }

            this.updateLyricsFont();
        }
    );

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

// ------------------------------------------------------
// UPDATE LYRICS FONT
// ------------------------------------------------------

updateLyricsFont() {

    document
        .querySelectorAll(
            ".song-line, .chord"
        )
        .forEach(el => {

            el.style.fontSize =
                this.fontSize + "px";
        });

    localStorage.setItem(
        "songFontSize",
        this.fontSize
    );
},

// ------------------------------------------------------
// LOAD DARK MODE
// ------------------------------------------------------

loadDarkMode() {

    if (
        localStorage.getItem("darkMode") === "true"
    ) {

        document.body.classList.add("dark");
    }
},

// ------------------------------------------------------
// TOGGLE DARK MODE
// ------------------------------------------------------

toggleDarkMode() {

    document.body.classList.toggle("dark");

    localStorage.setItem(
        "darkMode",
        document.body.classList.contains("dark")
    );
}

};

// ==========================================================
// HELPERS
// ==========================================================

function getTransposedKey(key, step) {

if (!key) {
    return "";
}

let index =
    SHARP_SCALE.indexOf(key);

if (index === -1) {

    index =
        FLAT_SCALE.indexOf(key);
}

if (index === -1) {
    return key;
}

return SHARP_SCALE[
    (index + step + 12) % 12
];

}
// ==========================================================
// PASSING CHORD HELPERS
// ==========================================================

function isWorshipSong(song) {

    if (!song) {
        return false;
    }

    const category =
        String(
            song.category ||
            song.genre ||
            ""
        )
        .trim()
        .toLowerCase();

    return category === "worship";
}


// ----------------------------------------------------------
// GET ACTIVE SERVICE KEY FOR PASSING CHORDS
// ----------------------------------------------------------

function getPassingChordKey(song) {

    if (!song) {
        return "";
    }

    /*
     * The displayed Service Key is authoritative.
     */

    const displayedServiceKey =
        document
            .getElementById("serviceKey")
            ?.textContent
            ?.trim();

    if (displayedServiceKey) {
        return displayedServiceKey;
    }

    /*
     * Fall back to the saved service key.
     */

    return (
        song.serviceKey ||
        song.originalKey ||
        song.key ||
        ""
    );
}

// ----------------------------------------------------------
// BUILD PASSING CHORD DATA
// ----------------------------------------------------------

function getPassingChords(song) {

    const key =
        getPassingChordKey(song);

    if (!key) {
        return null;
    }

    const returnToVerse =
        getTransposedKey(key, 7);

    const lastThree =
        getTransposedKey(key, 9) + "m";

    const outroFive =
        getTransposedKey(key, 5);

    const worship =
        isWorshipSong(song);

    return {

        key,

        returnToVerse,

        lastThree,

        outro:
            worship
                ? `${outroFive} → ${outroFive}m → ${key}`
                : "",

        spirit:
            worship
                ? `${key} → ${outroFive}`
                : ""
    };
}
// ==========================================================
// SERVICE
// ==========================================================

const Service = {

// ======================================================
// GET CURRENT SERVICE
// ======================================================

async getCurrent() {

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

    const service =
        await getActiveService();

    if (!service) {

        console.warn(
            "No active Firebase service."
        );

        return null;
    }

    if (!Array.isArray(service.songs)) {
        service.songs = [];
    }

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


// ======================================================
// GET SONG INDEX
// ======================================================

getSongIndex() {

    return Number(
        localStorage.getItem(
            "currentSongIndex"
        ) || 0
    );
},


// ======================================================
// SET SONG INDEX
// ======================================================

setSongIndex(index) {

    localStorage.setItem(
        "currentSongIndex",
        String(index)
    );
},


// ======================================================
// GET CURRENT SONG
// ======================================================

async getCurrentSong() {

    const service =
        await this.getCurrent();

    if (!service) {
        return null;
    }

    if (!Array.isArray(service.songs)) {
        return null;
    }

    const index =
        this.getSongIndex();

    if (
        index < 0 ||
        index >= service.songs.length
    ) {

        return null;
    }

    return service.songs[index];
},


// ======================================================
// SAVE CURRENT SERVICE KEY
// ======================================================

async saveCurrentServiceKey() {

    console.log(
        "================================"
    );

    console.log(
        "SAVE SERVICE KEY"
    );

    // --------------------------------------------------
    // GET AUTHENTICATED USER
    // --------------------------------------------------

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

    // --------------------------------------------------
    // GET CURRENT SERVICE ID
    // --------------------------------------------------

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

    // --------------------------------------------------
    // GET CURRENT SONG INDEX
    // --------------------------------------------------

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

        // ----------------------------------------------
        // FIRESTORE SERVICE REFERENCE
        // ----------------------------------------------

        const serviceRef =
            doc(
                db,
                "users",
                user.uid,
                "services",
                String(serviceId)
            );

        // ----------------------------------------------
        // GET SERVICE
        // ----------------------------------------------

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

        // ----------------------------------------------
        // CHECK SONGS
        // ----------------------------------------------

        if (!Array.isArray(service.songs)) {

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

        // ----------------------------------------------
        // GET CURRENT SONG
        // ----------------------------------------------

        const song =
            service.songs[songIndex];

        console.log(
            "CURRENT SONG BEFORE SAVE:",
            song
        );

        // ----------------------------------------------
        // GET DISPLAYED SERVICE KEY
        // ----------------------------------------------

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

       // ----------------------------------------------
// PRESERVE ORIGINAL KEY
// ----------------------------------------------

if (!song.originalKey) {

    song.originalKey =
        song.key ||
        displayedKey;
}

// ----------------------------------------------
// SAVE FINAL SERVICE KEY
// ----------------------------------------------

song.serviceKey =
    displayedKey;

// Keep transpose only as historical information.
// It must NOT be applied again when restoring.
song.transpose =
    Number(
        App.transpose || 0
    );

console.log(
    "================================"
);

console.log(
    "SAVING FINAL SERVICE KEY"
);

console.log(
    "ORIGINAL KEY:",
    song.originalKey
);

console.log(
    "SERVICE KEY:",
    song.serviceKey
);

console.log(
    "TRANSPOSE:",
    song.transpose
);

console.log(
    "================================"
);

        // ----------------------------------------------
        // UPDATE FIRESTORE
        // ----------------------------------------------

        await updateDoc(
            serviceRef,
            {
                songs: service.songs,

                updatedAt:
                    serverTimestamp()
            }
        );

        // ----------------------------------------------
        // VERIFY FIRESTORE SAVE
        // ----------------------------------------------

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

        // ----------------------------------------------
        // SUCCESS
        // ----------------------------------------------

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


// ======================================================
// TRANSPOSE
// ======================================================

async transpose(step) {

    console.log("================================");
    console.log("TRANSPOSE:", step);

    // --------------------------------------------------
    // GET CURRENT SONG
    // --------------------------------------------------

    let song = window.currentSong;

    if (!song) {
        song = await this.getCurrentSong();

        if (song) {
            window.currentSong = song;
        }
    }

    if (!song) {
        console.error("TRANSPOSE: NO CURRENT SONG");
        return;
    }

    // --------------------------------------------------
    // GET CURRENT DISPLAYED KEY
    // --------------------------------------------------

    const serviceKeyElement =
        document.getElementById("serviceKey");

    const currentKey =
        serviceKeyElement?.textContent?.trim() ||
        song.serviceKey ||
        song.originalKey ||
        song.key ||
        "";

    if (!currentKey) {
        console.error("TRANSPOSE: NO CURRENT KEY");
        return;
    }

    console.log(
        "CURRENT KEY BEFORE TRANSPOSE:",
        currentKey
    );

    // --------------------------------------------------
    // CALCULATE NEW KEY
    // --------------------------------------------------

    const newKey =
        getTransposedKey(currentKey, step);

    console.log(
        "NEW KEY:",
        newKey
    );

    // --------------------------------------------------
    // UPDATE TRANSPOSE VALUE
    // --------------------------------------------------

    App.transpose += step * 0.5;

    // --------------------------------------------------
    // UPDATE CHORDS
    // --------------------------------------------------

    document
        .querySelectorAll(".chord")
        .forEach(chord => {

            // IMPORTANT:
            // Always preserve the ORIGINAL chord.
            if (!chord.dataset.originalChord) {

                chord.dataset.originalChord =
                    chord.innerText;
            }

            const originalChord =
                chord.dataset.originalChord;

            chord.innerText =
                originalChord.replace(
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

                        // Calculate total semitone
                        // displacement from original key.
                        const totalSteps =
                            Math.round(
                                App.transpose / 0.5
                            );

                        return SHARP_SCALE[
                            (
                                index +
                                totalSteps +
                                12
                            ) % 12
                        ];
                    }
                );
        });

    // --------------------------------------------------
    // VERY IMPORTANT:
    // UPDATE THE IN-MEMORY SONG
    // --------------------------------------------------

    song.serviceKey =
        newKey;

    window.currentSong =
        song;

    // Also update the active service object
    // so it does not continue holding the old key.

    if (
        currentService &&
        Array.isArray(currentService.songs)
    ) {

        const index =
            this.getSongIndex();

        if (currentService.songs[index]) {

            currentService.songs[index].serviceKey =
                newKey;
        }
    }

    if (
        activeService &&
        Array.isArray(activeService.songs)
    ) {

        const index =
            this.getSongIndex();

        if (activeService.songs[index]) {

            activeService.songs[index].serviceKey =
                newKey;
        }
    }

    // --------------------------------------------------
    // UPDATE DISPLAY
    // --------------------------------------------------

    if (App.serviceKey) {

        App.serviceKey.innerText =
            newKey;
    }

    // --------------------------------------------------
    // UPDATE TRANSPOSE DISPLAY
    // --------------------------------------------------

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

    // --------------------------------------------------
    // UPDATE PASSING CHORDS
    // --------------------------------------------------

    await this.updateGuide();

    // --------------------------------------------------
    // SAVE TO FIREBASE
    // --------------------------------------------------

    const saved =
        await this.saveCurrentServiceKey();

    if (!saved) {

        console.warn(
            "Transpose changed locally, but Firebase save failed."
        );
    }

    console.log("================================");
    console.log("TRANSPOSE COMPLETE");
    console.log("KEY:", newKey);
    console.log("TRANSPOSE:", App.transpose);
    console.log("================================");
},

getKey() {

    const song =
        window.currentSong ||
        currentService?.songs?.[this.getSongIndex()] ||
        activeService?.songs?.[this.getSongIndex()];

    if (!song) {
        return "";
    }

    return (
        song.serviceKey ||
        song.originalKey ||
        song.key ||
        ""
    );
},

// ======================================================
// DISPLAY SERVICE KEY
// ======================================================

updateKeyDisplay() {

    if (!App.serviceKey) {
        return;
    }

    const key = this.getKey();

    if (key) {

        App.serviceKey.innerText =
            key;
    }

},

// ======================================================
// UPDATE PASSING CHORDS
// ======================================================

async updateGuide() {

    // ==================================================
    // GET CURRENT SONG
    // ==================================================

    let song =
        window.currentSong;

    // --------------------------------------------------
    // IF CURRENT SONG IS NOT YET AVAILABLE,
    // GET IT FROM THE ACTIVE SERVICE
    // --------------------------------------------------

    if (!song) {

        try {

            song =
                await this.getCurrentSong();

            if (song) {

                window.currentSong =
                    song;

            }

        }
        catch (error) {

            console.warn(
                "Unable to get current song for passing chords:",
                error
            );

        }
    }

    // --------------------------------------------------
    // STILL NO SONG
    // --------------------------------------------------

    if (!song) {

        console.warn(
            "PASSING CHORDS: No current song available."
        );

        return;
    }

    // ==================================================
    // BUILD PASSING CHORDS
    // ==================================================

    const passing =
        getPassingChords(song);

    if (!passing) {
        return;
    }

    // ==================================================
    // SONG PAGE
    // ==================================================

    let guide =
        document.getElementById(
            "passingChords"
        );

    if (!guide) {

        guide =
            document.createElement(
                "div"
            );

        guide.id =
            "passingChords";

        const lyrics =
            document.getElementById(
                "lyrics"
            );

        if (lyrics) {

            lyrics.parentNode.insertBefore(
                guide,
                lyrics
            );

        }
        else {

            document.body.prepend(
                guide
            );
        }
    }

    // ==================================================
    // BUILD HORIZONTAL GUIDE
    // ==================================================

    guide.innerHTML = `
<span class="passing-chords-title">
                    PASSING CHORDS: 
                </span>
       

        <div class="passing-chords-items">

            <div class="passing-chord-item">

                <span class="passing-label">
                    RETURN TO VERSE 1:
                </span>

                <span class="passing-value">
                    ${passing.returnToVerse}
                </span>

            </div>

            <div class="passing-chord-item">

                <span class="passing-label">
                    LAST 3:
                </span>

                <span class="passing-value">
                    ${passing.lastThree}
                </span>

            </div>

            ${
                passing.outro
                    ? `
                    <div class="passing-chord-item">

                        <span class="passing-label">
                            OUTRO:
                        </span>

                        <span class="passing-value">
                            ${passing.outro}
                        </span>

                    </div>
                    `
                    : ""
            }

            ${
                passing.spirit
                    ? `
                    <div class="passing-chord-item">

                        <span class="passing-label">
                            SINGING IN THE SPIRIT:
                        </span>

                        <span class="passing-value">
                            ${passing.spirit}
                        </span>

                    </div>
                    `
                    : ""
            }

        </div>
    `;

    // ==================================================
    // KEEP OLD SONG ENDING SYNCHRONIZED
    // ==================================================

    if (App.songEnding) {

        App.songEnding.innerHTML =
            guide.innerHTML;
    }

    // ==================================================
    // PRESENTATION
    // ==================================================

    Presentation.updatePassingChords();

},
// ======================================================
// RESTORE SAVED SERVICE KEY + CHORDS
// ======================================================

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

    // --------------------------------------------------
    // GET ORIGINAL KEY
    // --------------------------------------------------

    const originalKey =
        song.originalKey ||
        song.key ||
        "";

    // --------------------------------------------------
    // GET SAVED SERVICE KEY
    // --------------------------------------------------

    const savedServiceKey =
        song.serviceKey ||
        originalKey;

    if (!originalKey || !savedServiceKey) {
        return;
    }

    console.log(
        "================================"
    );

    console.log(
        "RESTORING SERVICE KEY"
    );

    console.log(
        "ORIGINAL KEY:",
        originalKey
    );

    console.log(
        "SAVED SERVICE KEY:",
        savedServiceKey
    );

    // --------------------------------------------------
    // CALCULATE DIFFERENCE
    // --------------------------------------------------

    let originalIndex =
        SHARP_SCALE.indexOf(originalKey);

    if (originalIndex === -1) {
        originalIndex =
            FLAT_SCALE.indexOf(originalKey);
    }

    let serviceIndex =
        SHARP_SCALE.indexOf(savedServiceKey);

    if (serviceIndex === -1) {
        serviceIndex =
            FLAT_SCALE.indexOf(savedServiceKey);
    }

    let steps = 0;

    if (
        originalIndex !== -1 &&
        serviceIndex !== -1
    ) {

        steps =
            serviceIndex -
            originalIndex;

        // Normalize to shortest direction
        if (steps > 6) {
            steps -= 12;
        }

        if (steps < -6) {
            steps += 12;
        }
    }

    console.log(
        "CHORD TRANSPOSE STEPS:",
        steps
    );

    // --------------------------------------------------
    // SET APP TRANSPOSE
    // --------------------------------------------------

    /*
     * Your system stores:
     *
     * 0.5 = 1 semitone
     *
     * Therefore:
     *
     * 1 semitone = 0.5
     */

    App.transpose =
        steps * 0.5;

    // --------------------------------------------------
    // RESTORE CHORDS FROM ORIGINAL HTML
    // --------------------------------------------------

    document
        .querySelectorAll(".chord")
        .forEach(chord => {

            if (!chord.dataset.originalChord) {

                chord.dataset.originalChord =
                    chord.innerText;
            }

            const originalChord =
                chord.dataset.originalChord;

            chord.innerText =
                originalChord.replace(
                    /[A-G](#|b)?/g,
                    note => {

                        let noteIndex =
                            SHARP_SCALE.indexOf(
                                note
                            );

                        if (noteIndex === -1) {

                            noteIndex =
                                FLAT_SCALE.indexOf(
                                    note
                                );
                        }

                        if (noteIndex === -1) {
                            return note;
                        }

                        return SHARP_SCALE[
                            (
                                noteIndex +
                                steps +
                                12
                            ) % 12
                        ];
                    }
                );
        });

    // --------------------------------------------------
    // FORCE DISPLAYED SERVICE KEY
    // --------------------------------------------------

    if (App.serviceKey) {

        App.serviceKey.innerText =
            savedServiceKey;
    }

    // --------------------------------------------------
    // UPDATE TRANSPOSE DISPLAY
    // --------------------------------------------------

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

    // --------------------------------------------------
    // UPDATE PASSING CHORDS
    // --------------------------------------------------

    await this.updateGuide();

    console.log(
        "SERVICE KEY RESTORED:",
        savedServiceKey
    );

    console.log(
        "CHORDS RESTORED WITH STEPS:",
        steps
    );

    console.log(
        "================================"
    );
},

// ======================================================
// NEXT SONG
// ======================================================

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

    const song =
        service.songs[index];

    if (!song || !song.file) {

        console.error(
            "NEXT SONG FILE NOT FOUND"
        );

        return;
    }

    const nextFile =
        song.file.replace(
            /^songs\//,
            ""
        );

    console.log(
        "NEXT:",
        nextFile
    );

    location.href =
        nextFile;
},


// ======================================================
// PREVIOUS SONG
// ======================================================

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

    const song =
        service.songs[index];

    if (!song || !song.file) {

        console.error(
            "PREVIOUS SONG FILE NOT FOUND"
        );

        return;
    }

    const previousFile =
        song.file.replace(
            /^songs\//,
            ""
        );

    console.log(
        "PREVIOUS:",
        previousFile
    );

    location.href =
        previousFile;
},


// ======================================================
// STOP SERVICE
// ======================================================

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

    localStorage.removeItem(
        "presentationMode"
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


// ======================================================
// UPDATE PROGRESS
// ======================================================

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

        progress.innerHTML =
            "";

        return;
    }

    const index =
        this.getSongIndex();

    progress.innerHTML = `

        Service:
        <strong>${service.name || ""}</strong>
        |
        Song
        ${index + 1}
        of
        ${service.songs.length}

    `;
}

};

// ==========================================================
// MODERN 3-COLUMN PRESENTATION
// ==========================================================

const Presentation = {
// ======================================================
// BUILD PRESENTATION PASSING CHORDS
// ======================================================

updatePassingChords() {

    const song =
        window.currentSong;

    if (!song) {
        return;
    }

    const passing =
        getPassingChords(song);

    if (!passing) {
        return;
    }

    const output =
        document.getElementById(
            "presentationLyrics"
        );

    if (!output) {
        return;
    }

    /*
     * Remove previous passing-chord bar
     */

    const oldBar =
        output.querySelector(
            ".presentation-passing-chords"
        );

    if (oldBar) {
        oldBar.remove();
    }

    /*
     * Create new bar
     */

    const bar =
        document.createElement(
            "div"
        );

    bar.className =
        "presentation-passing-chords";

    bar.innerHTML = `

        <div class="presentation-passing-title">
            PASSING CHORDS
        </div>

        <div class="presentation-passing-items">

            <div class="presentation-passing-item">
                <span class="presentation-passing-label">
                    RETURN TO VERSE 1:
                </span>
                <span class="presentation-passing-value">
                    ${passing.returnToVerse}
                </span>
            </div>

            <div class="presentation-passing-item">
                <span class="presentation-passing-label">
                    LAST 3:
                </span>
                <span class="presentation-passing-value">
                    ${passing.lastThree}
                </span>
            </div>

            <div class="presentation-passing-item">
                <span class="presentation-passing-label">
                    OUTRO:
                </span>
                <span class="presentation-passing-value">
                    ${passing.outro}
                </span>
            </div>

            <div class="presentation-passing-item">
                <span class="presentation-passing-label">
                    SINGING IN THE SPIRIT:
                </span>
                <span class="presentation-passing-value">
                    ${passing.spirit}
                </span>
            </div>

        </div>
    `;

    /*
     * Put passing chords ABOVE the lyrics/grid.
     */

    output.prepend(
        bar
    );
},
// ======================================================
// START PRESENTATION
// ======================================================

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

    // --------------------------------------------------
    // CHECK SERVICE
    // --------------------------------------------------

  const service =
    await Service.getCurrent();

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

// ==================================================
// SERVICE PLANNER MODE
// ==================================================

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

    window.currentSong =
        serviceSong;

    window.currentSongIndex =
        serviceIndex;

    localStorage.setItem(
        "presentationMode",
        "service"
    );

    const title =
        document.getElementById(
            "presentationTitle"
        );

    if (title) {

        title.innerText =
            serviceSong.title ||
            "Untitled Song";
    }

    overlay.classList.add(
        "show"
    );

    this.build();

    this.updatePassingChords();

    await this.update();

    return;
}

    // ==================================================
    // STANDALONE SONG MODE
    // ==================================================

    console.log(
        "PRESENTATION MODE: STANDALONE SONG"
    );

    let song =
        window.currentSong;

    if (
        !song &&
        typeof currentSong !== "undefined"
    ) {

        song =
            currentSong;
    }

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

    window.currentSong =
        song;

// ==================================================
// UPDATE SERVICE KEY FOR STANDALONE SONG
// ==================================================

// ==================================================
// UPDATE SERVICE KEY FOR STANDALONE SONG
// ==================================================

App.transpose =
    Number(
        song.transpose || 0
    );

// Service methods belong to Service
Service.updateKeyDisplay();

Service.updateGuide();

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

localStorage.setItem(
    "presentationMode",
    "standalone"
);

    const title =
        document.getElementById(
            "presentationTitle"
        );

    if (title) {

        title.innerText =
            song.title ||
            "Untitled Song";
    }

    overlay.classList.add(
        "show"
    );

    this.build();
this.updatePassingChords();
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
},


// ======================================================
// BUILD PRESENTATION
// ======================================================

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

    // --------------------------------------------------
    // COPY SOURCE
    // --------------------------------------------------

    const source =
        document.createElement(
            "div"
        );

    source.innerHTML =
        lyricsSource.innerHTML;

    // --------------------------------------------------
    // FIND SONG SECTIONS
    // --------------------------------------------------

    let sections =
        Array.from(
            source.querySelectorAll(
                ".song-section"
            )
        );

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

    if (!sections.length) {

        sections = [
            source
        ];
    }

    // --------------------------------------------------
    // CLEAR PRESENTATION
    // --------------------------------------------------

    output.innerHTML =
        "";

    // --------------------------------------------------
    // CREATE 3-COLUMN GRID
    // --------------------------------------------------

    const grid =
        document.createElement(
            "div"
        );

    grid.className =
        "presentation-grid";

    // --------------------------------------------------
    // CREATE SECTIONS
    // --------------------------------------------------

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

            // ------------------------------------------
            // SECTION TITLE
            // ------------------------------------------

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

            // ------------------------------------------
            // CONTENT
            // ------------------------------------------

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

                        newLine.style.display =
                            "block";

                        newLine.style.visibility =
                            "visible";

                        newLine.style.opacity =
                            "1";

                        newLine.style.color =
                            "#ffffff";

                        newLine
                            .querySelectorAll("*")
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

// --------------------------------------------------
// ADD PASSING CHORDS ABOVE PRESENTATION LYRICS
// --------------------------------------------------

this.updatePassingChords();

console.log(
    "PRESENTATION BUILD COMPLETE"
);

    console.log(
        "SECTIONS:",
        sections.length
    );
},

// ======================================================
// UPDATE PRESENTATION
// ======================================================

async update() {

console.log(
    "========================================"
);

console.log(
    "UPDATING PRESENTATION"
);

console.log(
    "========================================"
);


// ==================================================
// PRESENTATION MODE
// ==================================================

const mode =
    localStorage.getItem(
        "presentationMode"
    );

console.log(
    "PRESENTATION MODE:",
    mode
);


// ==================================================
// COUNTER
// ==================================================

const counter =
    document.getElementById(
        "presentationCounter"
    );


// ==================================================
// GET / CREATE NEXT SONG PREVIEW
// ==================================================

let preview =
    document.getElementById(
        "nextSongPreview"
    );


/*
 * If nextSongPreview does not exist in the HTML,
 * create it automatically.
 */

if (!preview) {

    console.log(
        "nextSongPreview not found - creating it"
    );

    const presentationScreen =
        document.getElementById(
            "presentationScreen"
        );

    if (!presentationScreen) {

        console.error(
            "presentationScreen not found"
        );

        return;
    }


    preview =
        document.createElement(
            "div"
        );

    preview.id =
        "nextSongPreview";


    // ------------------------------------------------
    // PREVIEW STYLE
    // ------------------------------------------------

    preview.style.position =
        "absolute";

    preview.style.left =
        "50%";

    preview.style.bottom =
        "25px";

    preview.style.transform =
        "translateX(-50%)";

    preview.style.zIndex =
        "999999";

    preview.style.display =
        "flex";

    preview.style.flexDirection =
        "column";

    preview.style.alignItems =
        "center";

    preview.style.justifyContent =
        "center";

    preview.style.textAlign =
        "center";

    preview.style.padding =
        "10px 30px";

    preview.style.minWidth =
        "280px";

    preview.style.maxWidth =
        "80%";

    preview.style.background =
        "rgba(0, 0, 0, 0.85)";

    preview.style.borderRadius =
        "12px";

    preview.style.border =
        "1px solid rgba(255,255,255,0.3)";

    preview.style.boxShadow =
        "0 5px 25px rgba(0,0,0,0.6)";

    preview.style.color =
        "#ffffff";

    preview.style.pointerEvents =
        "none";


    presentationScreen.appendChild(
        preview
    );


    console.log(
        "nextSongPreview CREATED"
    );
}


// ==================================================
// STANDALONE SONG
// ==================================================

if (
    mode === "standalone"
) {

    console.log(
        "UPDATE: STANDALONE SONG"
    );

    if (counter) {

        counter.innerText =
            "Standalone Song";
    }

    preview.innerHTML =
        "";

    preview.style.display =
        "none";

    return;
}


// ==================================================
// GET ACTIVE SERVICE
// ==================================================

const service =
    await Service.getCurrent();


if (!service) {

    console.warn(
        "UPDATE: NO ACTIVE SERVICE"
    );

    if (preview) {

        preview.innerHTML =
            "";

        preview.style.display =
            "none";
    }

    return;
}


// ==================================================
// GET SONGS
// ==================================================

const songs =
    Array.isArray(
        service.songs
    )
        ? service.songs
        : [];


const index =
    Number(
        Service.getSongIndex()
    ) || 0;


console.log(
    "SERVICE:",
    service.name
);

console.log(
    "CURRENT SONG INDEX:",
    index
);

console.log(
    "TOTAL SONGS:",
    songs.length
);


// ==================================================
// COUNTER
// ==================================================

if (counter) {

    counter.innerText =
        `Song ${index + 1} / ${songs.length}`;
}


// ==================================================
// CHECK NEXT SONG
// ==================================================

if (
    index >= 0 &&
    index < songs.length - 1
) {

    const nextSong =
        songs[index + 1];


    if (nextSong) {

        const nextTitle =
            nextSong.title ||
            nextSong.name ||
            "Untitled Song";


        console.log(
            "NEXT SONG:",
            nextTitle
        );


        // ==========================================
        // DISPLAY
        // ==========================================

        preview.innerHTML = `

            <div
                style="
                    font-size:12px;
                    font-weight:800;
                    letter-spacing:2px;
                    margin-bottom:5px;
                    opacity:0.75;
                "
            >
                NEXT SONG
            </div>

            <div
                style="
                    font-size:22px;
                    font-weight:800;
                    line-height:1.2;
                "
            >
                ${nextTitle}
            </div>

        `;


        preview.style.display =
            "flex";

        preview.style.visibility =
            "visible";

        preview.style.opacity =
            "1";


        console.log(
            "NEXT SONG PREVIEW DISPLAYED:",
            nextTitle
        );

        return;
    }
}


// ==================================================
// END OF SERVICE
// ==================================================

console.log(
    "NO NEXT SONG - END OF SERVICE"
);


preview.innerHTML = `

    <div
        style="
            font-size:12px;
            font-weight:800;
            letter-spacing:2px;
            opacity:0.75;
        "
    >
        NEXT SONG
    </div>

    <div
        style="
            font-size:20px;
            font-weight:700;
        "
    >
        End of Service
    </div>

`;


preview.style.display =
    "flex";

preview.style.visibility =
    "visible";

preview.style.opacity =
    "1";

}
};

// ==========================================================
// HOME
// ==========================================================

window.goHome = function () {

console.log(
    "GO HOME BUTTON CLICKED"
);

/*
 * always.html is assumed to be
 * inside the songs folder.
 */

window.location.href =
    "../index.html";

};

// ==========================================================
// START PRESENTATION
// ==========================================================

window.startPresentation =
async function () {

    console.log(
        "START PRESENTATION BUTTON CLICKED"
    );

    await Presentation.start();
};

// ==========================================================
// NEXT SERVICE SONG
// ==========================================================

window.nextServiceSong =
async function () {

    console.log(
        "NEXT SERVICE SONG BUTTON CLICKED"
    );

    await Service.next();
};

// ==========================================================
// PREVIOUS SERVICE SONG
// ==========================================================

window.previousServiceSong =
async function () {

    console.log(
        "PREVIOUS SERVICE SONG BUTTON CLICKED"
    );

    await Service.previous();
};

// ==========================================================
// STOP SERVICE
// ==========================================================

window.stopService =
function () {

    console.log(
        "STOP SERVICE BUTTON CLICKED"
    );

    Service.stop();
};

// ==========================================================
// EXIT PRESENTATION
// ==========================================================

window.exitPresentation = function () {

console.log("EXIT PRESENTATION");

const overlay =
    document.getElementById(
        "presentationScreen"
    );

if (overlay) {
    overlay.classList.remove("show");
}

localStorage.removeItem(
    "presentationMode"
);

localStorage.removeItem(
    "resumePresentation"
);

console.log(
    "PRESENTATION CLOSED"
);

};

// ==========================================================
// INITIALIZE APPLICATION
// ==========================================================

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
function formatStandaloneSongForPrint() {

    const lyrics =
        document.getElementById("lyrics");

    if (!lyrics) {
        return "";
    }


    const clone =
        lyrics.cloneNode(true);


    // Remove unwanted elements
    clone.querySelectorAll(
        ".song-controls, button"
    )
    .forEach(el => el.remove());


    // Preserve original chord positions
    clone.querySelectorAll(".chord")
    .forEach(chord => {

        chord.style.display =
            "inline-block";

        chord.style.marginRight =
            "4px";

    });


    return clone.innerHTML;

}
// ==========================================================
// COMMON PRINT ENGINE
// SERVICE PLANNER + STANDALONE SONG
// ==========================================================

function printSongsInServiceFormat(songList) {

    console.log(
        "========================================"
    );

    console.log(
        "PRINT SONGS"
    );

    console.log(
        songList
    );

    console.log(
        "========================================"
    );

    if (
        !Array.isArray(songList) ||
        songList.length === 0
    ) {

        alert(
            "No song available to print."
        );

        return;
    }

    // ------------------------------------------------------
    // REMOVE OLD PRINT CONTAINER
    // ------------------------------------------------------

    const oldContainer =
        document.getElementById(
            "servicePrintContainer"
        );

    if (oldContainer) {
        oldContainer.remove();
    }

    // ------------------------------------------------------
    // CREATE PRINT CONTAINER
    // ------------------------------------------------------

    const printContainer =
        document.createElement("div");

    printContainer.id =
        "servicePrintContainer";

    // ------------------------------------------------------
    // CREATE EACH SONG PAGE
    // ------------------------------------------------------

    songList.forEach(function(song) {

        if (!song) {
            return;
        }

        console.log(
            "Preparing print:",
            song.title
        );

        const page =
            document.createElement("section");

        page.className =
            "service-print-song";

        // --------------------------------------------------
        // HEADER
        // --------------------------------------------------

        const header =
            document.createElement("div");

        header.className =
            "service-print-header";

        // TITLE

        const title =
            document.createElement("div");

        title.className =
            "service-print-title";

        title.textContent =
            song.title ||
            "Untitled Song";

        header.appendChild(
            title
        );

        // ARTIST

        if (song.artist) {

            const artist =
                document.createElement("div");

            artist.className =
                "service-print-artist";

            artist.textContent =
                song.artist;

            header.appendChild(
                artist
            );
        }

        // SERVICE KEY

        const serviceKey =
            song.serviceKey ||
            song.key ||
            "";

        if (serviceKey) {

            const key =
                document.createElement("div");

            key.className =
                "service-print-key";

            key.textContent =
                "Key: " + serviceKey;

            header.appendChild(
                key
            );
        }

        page.appendChild(
            header
        );

        // --------------------------------------------------
        // CONTENT
        // --------------------------------------------------

        const content =
            document.createElement("div");

        content.className =
            "service-print-content";

        // --------------------------------------------------
        // GET CONTENT DIRECTLY FROM SONG OBJECT
        // --------------------------------------------------

        let songText =
    song.content ||
    song.lyrics ||
    song.text ||
    song.song ||
    "";


// --------------------------------------------------
// FALLBACK FOR STANDALONE SONG
// GET CURRENT DISPLAYED LYRICS
// --------------------------------------------------

if (!songText) {

    const lyricsElement =
        document.getElementById(
            "lyrics"
        );


    if (lyricsElement) {

        songText =
            lyricsElement.innerText;

        console.log(
            "PRINT FALLBACK: USING #lyrics CONTENT"
        );

    }

}


// --------------------------------------------------
// CHECK CONTENT
// --------------------------------------------------

if (!songText) {

    console.error(
        "NO SONG CONTENT:",
        song
    );


    content.innerHTML =
        `
        <div class="print-error">
            Song content not available.
        </div>
        `;

}
else {

    console.log(
        "PRINT SONG CONTENT FOUND:",
        songText.substring(0,100)
    );


    if (song.isHTMLContent) {

    content.innerHTML =
        songText;

}
else {

    content.innerHTML =
        formatServiceSongForPrint(
            songText,
            song
        );

}

        page.appendChild(
            content
        );

        printContainer.appendChild(
            page
        );

    });

    // ------------------------------------------------------
    // ADD TO DOCUMENT
    // ------------------------------------------------------

    document.body.appendChild(
        printContainer
    );

    // ------------------------------------------------------
    // PRINT
    // ------------------------------------------------------

    setTimeout(function() {

        window.print();

        setTimeout(function() {

            const container =
                document.getElementById(
                    "servicePrintContainer"
                );

            if (container) {
                container.remove();
            }

        }, 1000);

    }, 300);
}
// ==========================================================
// LOAD SERVICE SONG CONTENT BEFORE PRINT
// ==========================================================

async function prepareServiceSongsForPrint(songList) {


    for (const song of songList) {


        if (!song) {
            continue;
        }


        // Already has content
        if (
            song.content ||
            song.lyrics ||
            song.text
        ) {

            continue;

        }


        // Need file path
        if (!song.file) {

            console.warn(
                "NO FILE FOR SONG:",
                song
            );

            continue;
        }


        try {

            const response =
                await fetch(
                    song.file
                );


            const html =
                await response.text();


            const parser =
                new DOMParser();


            const doc =
                parser.parseFromString(
                    html,
                    "text/html"
                );


            const lyrics =
                doc.getElementById(
                    "lyrics"
                );


            if (lyrics) {

                song.content =
                    lyrics.innerText;


                console.log(
                    "LOADED SONG:",
                    song.title
                );

            }
            else {

                console.warn(
                    "NO #lyrics FOUND:",
                    song.title
                );

            }


        }
        catch(error) {

            console.error(
                "LOAD SONG ERROR:",
                song.title,
                error
            );

        }

    }

}
// ==========================================================
// SERVICE PLANNER PRINT
// ==========================================================

async function printServiceSongs() {

    console.log("========================================");
    console.log("PRINT SERVICE PLANNER");
    console.log("========================================");

    let serviceToPrint = null;

    // ------------------------------------------------------
    // 1. USE ACTIVE SERVICE ALREADY LOADED
    // ------------------------------------------------------

    if (
        activeService &&
        Array.isArray(activeService.songs)
    ) {

        serviceToPrint =
            activeService;

    }

    // ------------------------------------------------------
    // 2. USE CURRENT SERVICE
    // ------------------------------------------------------

    if (
        !serviceToPrint &&
        currentService &&
        Array.isArray(currentService.songs)
    ) {

        serviceToPrint =
            currentService;

    }

    // ------------------------------------------------------
    // 3. LOAD FROM FIREBASE
    // ------------------------------------------------------

    if (!serviceToPrint) {

        console.log(
            "Active service not available. Loading from Firebase..."
        );

        serviceToPrint =
            await getActiveService();
    }

    // ------------------------------------------------------
    // 4. CHECK SERVICE
    // ------------------------------------------------------

    if (!serviceToPrint) {

        console.error(
            "PRINT SERVICE: NO ACTIVE SERVICE"
        );

        alert(
            "Unable to print Service Planner.\n\n" +
            "No active service was found."
        );

        return;
    }

    // ------------------------------------------------------
    // 5. CHECK SONGS
    // ------------------------------------------------------

    if (
        !Array.isArray(serviceToPrint.songs) ||
        serviceToPrint.songs.length === 0
    ) {

        console.error(
            "PRINT SERVICE: NO SONGS",
            serviceToPrint
        );

        alert(
            "There are no songs in the Service Planner to print."
        );

        return;
    }

    console.log(
        "SERVICE TO PRINT:",
        serviceToPrint
    );

    console.log(
        "SONGS TO PRINT:",
        serviceToPrint.songs
    );

    // ------------------------------------------------------
    // 6. USE COMMON PRINT ENGINE
    // ------------------------------------------------------

    await prepareServiceSongsForPrint(
    serviceToPrint.songs
);

printSongsInServiceFormat(
    serviceToPrint.songs
);
}


// ==========================================================
// MAKE BUTTON AVAILABLE TO HTML
// ==========================================================

window.printServiceSongs =
    printServiceSongs;


// ==========================================================
// STANDALONE SONG PRINT
// BUTTON: fitToOnePage
// ==========================================================

function fitToOnePage() {

    console.log(
        "========================================"
    );

    console.log(
        "PRINT STANDALONE SONG"
    );

    console.log(
        "========================================"
    );

    let song = null;

    // ------------------------------------------------------
    // FIRST: WINDOW CURRENT SONG
    // ------------------------------------------------------

    if (
        window.currentSong
    ) {

        song =
            window.currentSong;
    }

    // ------------------------------------------------------
    // SECOND: LOCAL CURRENT SONG
    // ------------------------------------------------------

    if (
        !song &&
        typeof currentSong !== "undefined"
    ) {

        song =
            currentSong;
    }

    // ------------------------------------------------------
    // THIRD: USE SERVICE CURRENT SONG
    // ------------------------------------------------------

    if (!song) {

        const service =
            activeService ||
            currentService;

        if (
            service &&
            Array.isArray(service.songs)
        ) {

            const index =
                Service.getSongIndex();

            if (
                index >= 0 &&
                index < service.songs.length
            ) {

                song =
                    service.songs[index];
            }
        }
    }

    // ------------------------------------------------------
    // SONG NOT FOUND
    // ------------------------------------------------------

    if (!song) {

        console.error(
            "STANDALONE PRINT: SONG NOT FOUND"
        );

        alert(
            "Song is not available for printing."
        );

        return;
    }

    console.log(
        "STANDALONE SONG FOUND:",
        song
    );

    // ------------------------------------------------------
    // USE EXACT SAME PRINT ENGINE
    // ------------------------------------------------------

    song.content =
    formatStandaloneSongForPrint();

song.isHTMLContent =
    true;

printSongsInServiceFormat([
    song
]);
}


// ==========================================================
// MAKE BUTTON AVAILABLE
// ==========================================================

window.fitToOnePage =
    fitToOnePage;

window.printServiceSongs =
    printServiceSongs;

console.log(
    "PRINT FUNCTIONS READY",
    typeof window.fitToOnePage,
    typeof window.printServiceSongs
);
// ==========================================================
// PRINT HELPERS
// ==========================================================

function escapePrintHTML(text) {

    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}


// ----------------------------------------------------------
// CHECK IF LINE IS CHORD LINE
// ----------------------------------------------------------

function isChordLine(line) {

    if (!line) {
        return false;
    }

    const words =
        line.trim().split(/\s+/);

    if (!words.length) {
        return false;
    }


    let chordCount = 0;


    words.forEach(word => {

        if (
            /^[A-G](#|b)?(m|maj|min|sus|dim|aug)?[0-9]*$/
            .test(word)
        ) {

            chordCount++;
        }

    });


    return (
        chordCount === words.length
    );
}


// ----------------------------------------------------------
// TRANSPOSE PRINT CHORDS
// ----------------------------------------------------------

function transposePrintChords(
    chordLine,
    song
) {

    const originalKey =
        song.originalKey ||
        song.key ||
        "C";


    const serviceKey =
        song.serviceKey ||
        originalKey;


    let steps = 0;


    let originalIndex =
        SHARP_SCALE.indexOf(originalKey);


    if (originalIndex === -1) {

        originalIndex =
            FLAT_SCALE.indexOf(originalKey);
    }


    let serviceIndex =
        SHARP_SCALE.indexOf(serviceKey);


    if (serviceIndex === -1) {

        serviceIndex =
            FLAT_SCALE.indexOf(serviceKey);
    }


    if (
        originalIndex !== -1 &&
        serviceIndex !== -1
    ) {

        steps =
            serviceIndex -
            originalIndex;
    }


    return chordLine.replace(
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
                    steps +
                    12
                ) % 12
            ];

        }
    );

}
function formatServiceSongForPrint(
    songText,
    serviceSong
) {

    const lines =
        String(songText)
            .split(/\r?\n/);

    let html = "";

    let sectionOpen = false;

    lines.forEach(function(rawLine) {

        const line =
            rawLine.trim();

        if (!line) {
            return;
        }

        // --------------------------------------------------
        // SECTION
        // --------------------------------------------------

        if (
            /^\[.*\]$/.test(line)
        ) {

            if (sectionOpen) {
                html += "</div>";
            }

            const sectionName =
                line
                    .replace(/^\[/, "")
                    .replace(/\]$/, "");

            html +=
                `
                <div class="print-section">

                    <div class="print-section-title">
                        ${escapePrintHTML(sectionName)}
                    </div>
                `;

            sectionOpen = true;

            return;
        }

        // --------------------------------------------------
        // CHORD LINE
        // --------------------------------------------------

        if (isChordLine(line)) {

            const chordLine =
                transposePrintChords(
                    line,
                    serviceSong
                );

            const chords =
                chordLine
                    .split(/\s+/)
                    .map(function(chord) {

                        return `
                            <span class="print-chord">
                                ${escapePrintHTML(chord)}
                            </span>
                        `;

                    })
                    .join(" ");

            html +=
                `
                <div class="print-chord-line">
                    ${chords}
                </div>
                `;

            return;
        }

        // --------------------------------------------------
        // LYRIC
        // --------------------------------------------------

        html +=
            `
            <div class="print-lyric-line">
                ${escapePrintHTML(line)}
            </div>
            `;
    });

    if (sectionOpen) {
        html += "</div>";
    }

    return html;
}
