import { auth, db } from "./firebase.js";

import {
    createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    doc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


const registerForm =
    document.getElementById("registerForm");


registerForm.addEventListener("submit", async function(e) {

    e.preventDefault();

    const name =
        document.getElementById("name").value.trim();

    const email =
        document.getElementById("email").value.trim();

    const password =
        document.getElementById("password").value;


    try {

        console.log("Creating Firebase account...");


        // =====================================
        // 1. CREATE AUTH ACCOUNT
        // =====================================

        const userCredential =
            await createUserWithEmailAndPassword(
                auth,
                email,
                password
            );


        const user =
            userCredential.user;


        console.log(
            "AUTH SUCCESS:",
            user.uid
        );


        // =====================================
        // 2. CREATE FIRESTORE USER PROFILE
        // =====================================

        await setDoc(
            doc(db, "users", user.uid),
            {
                uid: user.uid,
                name: name,
                email: user.email,
                createdAt: serverTimestamp()
            }
        );


        console.log(
            "FIRESTORE PROFILE CREATED"
        );


        alert("Account created successfully!");


        window.location.href =
            "index.html";


    } catch(error) {

        console.error(
            "CREATE ACCOUNT ERROR:",
            error
        );


        alert(
            "Create account failed:\n\n" +
            error.message
        );

    }

});
