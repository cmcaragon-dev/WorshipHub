// ==========================================
// AUTHENTICATION
// ==========================================

import {

    createUserWithEmailAndPassword,

    signInWithEmailAndPassword,

    signOut,

    onAuthStateChanged

} from
"https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


import {

    doc,

    setDoc,

    getDoc,

    serverTimestamp

} from
"https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


import {

    auth,
    db

} from "./firebase.js";


// ==========================================
// REGISTER
// ==========================================

const registerBtn =
    document.getElementById(
        "registerBtn"
    );


if (registerBtn) {

    registerBtn.onclick =
        async function () {

            const name =
                document
                .getElementById("name")
                .value
                .trim();


            const email =
                document
                .getElementById("email")
                .value
                .trim();


            const password =
                document
                .getElementById("password")
                .value;


            const confirmPassword =
                document
                .getElementById(
                    "confirmPassword"
                )
                .value;


            const message =
                document.getElementById(
                    "registerMessage"
                );


            if (!name ||
                !email ||
                !password) {

                message.textContent =
                    "Please complete all fields.";

                return;

            }


            if (
                password !==
                confirmPassword
            ) {

                message.textContent =
                    "Passwords do not match.";

                return;

            }


            if (password.length < 6) {

                message.textContent =
                    "Password must be at least 6 characters.";

                return;

            }


            try {

                const result =
                    await createUserWithEmailAndPassword(
                        auth,
                        email,
                        password
                    );


                const user =
                    result.user;


                // ==================================
                // CREATE USER PROFILE
                // ==================================

                await setDoc(

                    doc(
                        db,
                        "users",
                        user.uid
                    ),

                    {

                        name: name,

                        email: user.email,

                        role: "user",

                        createdAt:
                            serverTimestamp()

                    }

                );


                message.style.color =
                    "green";


                message.textContent =
                    "Account created successfully.";


                setTimeout(
                    function () {

                        window.location.href =
                            "index.html";

                    },
                    1000
                );


            }

            catch (error) {

                console.error(error);


                message.style.color =
                    "#d32f2f";


                if (
                    error.code ===
                    "auth/email-already-in-use"
                ) {

                    message.textContent =
                        "This email is already registered.";

                }

                else if (
                    error.code ===
                    "auth/invalid-email"
                ) {

                    message.textContent =
                        "Invalid email address.";

                }

                else {

                    message.textContent =
                        error.message;

                }

            }

        };

}


// ==========================================
// LOGIN
// ==========================================

const loginBtn =
    document.getElementById(
        "loginBtn"
    );


if (loginBtn) {

    loginBtn.onclick =
        async function () {

            const email =
                document
                .getElementById("email")
                .value
                .trim();


            const password =
                document
                .getElementById("password")
                .value;


            const message =
                document.getElementById(
                    "loginMessage"
                );


            if (!email || !password) {

                message.textContent =
                    "Please enter email and password.";

                return;

            }


            try {

                await signInWithEmailAndPassword(

                    auth,

                    email,

                    password

                );


                window.location.href =
                    "index.html";


                    }

        catch (error) {

            console.error(
                "FIREBASE LOGIN ERROR CODE:",
                error.code
            );

            console.error(
                "FIREBASE LOGIN ERROR MESSAGE:",
                error.message
            );

            alert(
                "Login failed:\n\n" +
                error.code
            );

        }

    };

}

// ==========================================
// LOGOUT
// ==========================================

window.logoutUser =
    async function () {

        try {

            await signOut(auth);

            window.location.href =
                "login.html";

        }

        catch (error) {

            console.error(error);

        }

    };


// ==========================================
// GET USER PROFILE
// ==========================================

export async function getUserProfile(
    user
) {

    if (!user) {
        return null;
    }


    const userRef =
        doc(
            db,
            "users",
            user.uid
        );


    const snapshot =
        await getDoc(userRef);


    if (!snapshot.exists()) {

        return null;

    }


    return {

        uid: user.uid,

        email: user.email,

        ...snapshot.data()

    };

}


// ==========================================
// PROTECT DASHBOARD
// ==========================================

export function requireLogin(
    callback
) {

    onAuthStateChanged(

        auth,

        async function (user) {

            if (!user) {

                window.location.href =
                    "login.html";

                return;

            }


            const profile =
                await getUserProfile(user);


            callback(
                user,
                profile
            );

        }

    );

}


// ==========================================
// CURRENT AUTH USER
// ==========================================

export function watchAuth(
    callback
) {

    return onAuthStateChanged(

        auth,

        callback

    );

}
