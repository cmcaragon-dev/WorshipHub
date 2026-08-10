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
        document.getElementById("registerEmail").value.trim();

    const password =
        document.getElementById("registerPassword").value;


    console.log("Name:", name);
    console.log("Email:", email);


    try {

        const userCredential =
            await createUserWithEmailAndPassword(
                auth,
                email,
                password
            );

        const user =
            userCredential.user;

        console.log("Firebase Auth:", user.uid);


        await setDoc(
            doc(db, "users", user.uid),
            {
                uid: user.uid,
                name: name,
                email: user.email,
                createdAt: serverTimestamp()
            }
        );


        alert("Account created successfully!");

        window.location.href = "index.html";


    } catch(error) {

        console.error(
            "CREATE ACCOUNT ERROR:",
            error
        );

        alert(error.message);

    }

});
