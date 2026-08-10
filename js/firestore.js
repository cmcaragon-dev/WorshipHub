"use strict";

import { db }
from "./firebase.js";

import {
    collection,
    doc,
    addDoc,
    setDoc,
    getDocs,
    deleteDoc,
    onSnapshot,
    query,
    where,
    orderBy
}
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


/* =====================================
   SAVE SERVICES
===================================== */

export async function saveServices(
    username,
    services
) {

    try {

        await setDoc(

            doc(
                db,
                "services",
                username
            ),

            {
                services: services
            }

        );

        console.log(
            "Services saved to Firebase."
        );

    }

    catch(error) {

        console.error(
            "Firebase save error:",
            error
        );

        throw error;

    }

}


/* =====================================
   LOAD SERVICES
===================================== */

export async function loadServices(
    username
) {

    try {

        const snapshot =
            await getDoc(

                doc(
                    db,
                    "services",
                    username
                )

            );


        if (snapshot.exists()) {

            const data =
                snapshot.data();

            console.log(
                "Firebase services:",
                data.services
            );

            return data.services || [];

        }


        console.log(
            "No services document found."
        );

        return [];

    }

    catch(error) {

        console.error(
            "Firebase load error:",
            error
        );

        return [];

    }

}


/* =====================================
   REALTIME SERVICE LISTENER
===================================== */

export function watchServices(
    username,
    callback
) {

    const ref =
        doc(
            db,
            "services",
            username
        );


    return onSnapshot(

        ref,

        function(snapshot) {

            if (snapshot.exists()) {

                callback(
                    snapshot.data().services || []
                );

            }

            else {

                callback([]);

            }

        },

        function(error) {

            console.error(
                "Service listener error:",
                error
            );

        }

    );

}
