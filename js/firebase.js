"use strict";

import {
    auth,
    db
} from "./firebase.js";

import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
    getAuth
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    getFirestore
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


/* =====================================
   FIRESTORE
===================================== */

const db =
    getFirestore(app);


/* =====================================
   EXPORT
===================================== */

export {
    app,
    auth,
    db
};
