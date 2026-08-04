"use strict";

import { db } from "./firebase.js";

import {

doc,
setDoc,
getDoc

}

from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/* ============================
   SAVE SERVICES
============================ */

export async function saveServices(username, services){

    try{

        await setDoc(

            doc(db,"services",username),

            {

                services: services

            }

        );

        console.log("Services saved.");

    }

    catch(err){

        console.error(err);

    }

}

/* ============================
   LOAD SERVICES
============================ */

export async function loadServices(username){

    try{

        const snapshot =

        await getDoc(

            doc(db,"services",username)

        );

        if(snapshot.exists()){

            return snapshot.data().services || [];

        }

        return [];

    }

    catch(err){

        console.error(err);

        return [];

    }

}
