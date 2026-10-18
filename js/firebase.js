"use strict";

import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
    getAuth,
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ==========================================
// YOUR FIREBASE CONFIG
// ==========================================

const firebaseConfig = {

    apiKey:
        "AIzaSyArrGfT8HThgvIJDzDRw_Hw8NxGJmBvOJs",

    authDomain:
        "worship-lyrics-manager.firebaseapp.com",

    projectId:
        "worship-lyrics-manager",

    storageBucket:
        "worship-lyrics-manager.firebasestorage.app",

    messagingSenderId:
        "196627692729",

    appId:
        "1:196627692729:web:f3a4d0de671b29e9ed2f68"

};


/* =====================================
   INITIALIZE FIREBASE
===================================== */

const app =
    initializeApp(firebaseConfig);


/* =====================================
   AUTHENTICATION
===================================== */

const auth =
    getAuth(app);

// Keep the signed-in session on the device so CHORDIO can reopen offline.
setPersistence(auth, browserLocalPersistence).catch(function (error) {
    console.warn("CHORDIO Auth persistence unavailable:", error);
});


/* =====================================
   FIRESTORE
===================================== */

let db;
try {
    // Firestore stores previously read data locally and queues writes while offline.
    db = initializeFirestore(app, {
        localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager()
        })
    });
} catch (error) {
    console.warn("Persistent Firestore cache could not be initialized:", error);
    // Fallback for browsers/environments that do not support persistent cache.
    db = initializeFirestore(app);
}


/* =====================================
   EXPORT
===================================== */

export {
    app,
    auth,
    db
};
