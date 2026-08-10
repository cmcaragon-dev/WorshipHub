"use strict";

import {
    auth,
    db
} from "./firebase.js";

import {
    createUserWithEmailAndPassword,
    updateProfile
} from
"https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    doc,
    setDoc,
    serverTimestamp
} from
"https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


const registerForm =
    document.getElementById("registerForm");

const message =
    document.getElementById("message");


registerForm.addEventListener(
    "submit",
    async function(event){

        event.preventDefault();


        const name =
            document
            .getElementById("registerName")
            .value
            .trim();


        const email =
            document
            .getElementById("registerEmail")
            .value
            .trim();


        const password =
            document
            .getElementById("registerPassword")
            .value;


        const confirmPassword =
            document
            .getElementById("confirmPassword")
            .value;


        // =====================================
        // VALIDATION
        // =====================================

        if(!name){

            message.innerText =
                "Please enter your name.";

            return;

        }


        if(!email){

            message.innerText =
                "Please enter your email.";

            return;

        }


        if(password.length < 6){

            message.innerText =
                "Password must be at least 6 characters.";

            return;

        }


        if(password !== confirmPassword){

            message.innerText =
                "Passwords do not match.";

            return;

        }


        try{

            message.innerText =
                "Creating account...";


            // =====================================
            // CREATE FIREBASE AUTH USER
            // =====================================

            const userCredential =
                await createUserWithEmailAndPassword(
                    auth,
                    email,
                    password
                );


            const user =
                userCredential.user;


            // =====================================
            // SAVE DISPLAY NAME
            // =====================================

            await updateProfile(
                user,
                {
                    displayName:name
                }
            );


            // =====================================
            // CREATE USER DOCUMENT
            // =====================================

            await setDoc(

                doc(
                    db,
                    "users",
                    user.uid
                ),

                {

                    uid:user.uid,

                    name:name,

                    email:user.email,

                    createdAt:
                        serverTimestamp(),

                    role:"user"

                }

            );


            // =====================================
            // CREATE USER DATA CONTAINERS
            // =====================================

            await setDoc(

                doc(
                    db,
                    "users",
                    user.uid,
                    "settings",
                    "profile"
                ),

                {

                    name:name,

                    email:user.email,

                    createdAt:
                        serverTimestamp()

                }

            );


            message.innerText =
                "Account created successfully!";


            // =====================================
            // GO TO DASHBOARD
            // =====================================

            setTimeout(
                function(){

                    window.location.href =
                        "index.html";

                },
                1000
            );


        }
        catch(error){

            console.error(
                "CREATE ACCOUNT ERROR:",
                error
            );


            // =====================================
            // FIREBASE ERROR MESSAGES
            // =====================================

            switch(error.code){

                case "auth/email-already-in-use":

                    message.innerText =
                        "This email is already registered.";

                    break;


                case "auth/invalid-email":

                    message.innerText =
                        "Invalid email address.";

                    break;


                case "auth/weak-password":

                    message.innerText =
                        "Password is too weak.";

                    break;


                case "auth/operation-not-allowed":

                    message.innerText =
                        "Email/password login is not enabled in Firebase.";

                    break;


                case "permission-denied":

                    message.innerText =
                        "Firebase permission denied. Check Firestore rules.";

                    break;


                default:

                    message.innerText =
                        error.message;

            }

        }

    }
);
