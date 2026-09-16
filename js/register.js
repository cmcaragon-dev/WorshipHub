"use strict";

import { auth, db } from "./firebase.js";

import {
    createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    doc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


/* =====================================
   REGISTER FORM
===================================== */

const registerForm =
    document.getElementById("registerForm");


if (!registerForm) {

    console.error(
        "registerForm not found."
    );

} else {


    registerForm.addEventListener(
        "submit",
        async function(e) {

            e.preventDefault();


            /* =====================================
               GET FORM VALUES
            ===================================== */

            const nameInput =
                document.getElementById("registerName");

            const emailInput =
                document.getElementById("registerEmail");

            const passwordInput =
                document.getElementById("registerPassword");


            /* =====================================
               CHECK INPUTS
            ===================================== */

            if (!nameInput) {

                console.error(
                    "registerName element not found."
                );

                alert(
                    "Registration error: Name field not found."
                );

                return;

            }


            if (!emailInput) {

                console.error(
                    "registerEmail element not found."
                );

                alert(
                    "Registration error: Email field not found."
                );

                return;

            }


            if (!passwordInput) {

                console.error(
                    "registerPassword element not found."
                );

                alert(
                    "Registration error: Password field not found."
                );

                return;

            }


            const name =
                nameInput.value.trim();

            const email =
                emailInput.value.trim();

            const password =
                passwordInput.value;


            if (!name) {

                alert("Please enter your name.");

                return;

            }


            if (!email) {

                alert("Please enter your email.");

                return;

            }


            if (!password) {

                alert("Please enter a password.");

                return;

            }


            if (password.length < 6) {

                alert(
                    "Password must be at least 6 characters."
                );

                return;

            }


            console.log(
                "Creating account..."
            );


            try {


                /* =====================================
                   CREATE FIREBASE AUTH ACCOUNT
                ===================================== */

                const userCredential =
                    await createUserWithEmailAndPassword(
                        auth,
                        email,
                        password
                    );


                const user =
                    userCredential.user;


                console.log(
                    "Firebase Auth SUCCESS:",
                    user.uid
                );


                /* =====================================
                   CREATE FIRESTORE USER PROFILE
                ===================================== */

                await setDoc(
                    doc(
                        db,
                        "users",
                        user.uid
                    ),
                    {
                        uid: user.uid,

                        name: name,

                        email: user.email,

                        allowAddSongs: false,

                        createdAt:
                            serverTimestamp()
                    }
                );


                console.log(
                    "Firestore profile created."
                );


                /* =====================================
                   SUCCESS
                ===================================== */

                alert(
                    "Account created successfully!"
                );


                window.location.href =
                    "index.html";


            } catch(error) {


                console.error(
                    "CREATE ACCOUNT ERROR:",
                    error
                );


                /* =====================================
                   FIREBASE ERROR MESSAGES
                ===================================== */

                if (
                    error.code ===
                    "auth/email-already-in-use"
                ) {

                    alert(
                        "This email is already registered."
                    );

                }

                else if (
                    error.code ===
                    "auth/invalid-email"
                ) {

                    alert(
                        "Please enter a valid email address."
                    );

                }

                else if (
                    error.code ===
                    "auth/weak-password"
                ) {

                    alert(
                        "Password is too weak. Use at least 6 characters."
                    );

                }

                else if (
                    error.code ===
                    "permission-denied"
                ) {

                    alert(
                        "Account was created, but Firestore denied access. Please check Firestore Security Rules."
                    );

                }

                else {

                    alert(
                        "CREATE ACCOUNT ERROR:\n\n" +
                        error.message
                    );

                }

            }

        }
    );

}
