"use strict";

import {
    initializeApp
}
from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";

import {
    getAuth
}
from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
    getFirestore
}
from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";


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

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);

export {
    app,
    auth,
    db
};
