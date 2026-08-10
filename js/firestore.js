import { db }
from "./firebase.js";

import {
    collection,
    doc,
    setDoc,
    getDocs,
    deleteDoc,
    onSnapshot
}
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


/* ==================================================
   USER COLLECTION REFERENCES
================================================== */

function getPlaylistsCollection(uid) {

    return collection(
        db,
        "users",
        uid,
        "playlists"
    );

}


function getServicesCollection(uid) {

    return collection(
        db,
        "users",
        uid,
        "services"
    );

}


/* ==================================================
   SAVE PLAYLISTS
================================================== */

export async function savePlaylists(uid, playlists) {

    if (!uid) {

        console.error("Missing Firebase UID");

        return;

    }


    try {

        const playlistCollection =
            getPlaylistsCollection(uid);


        for (const playlist of playlists) {

            await setDoc(

                doc(
                    playlistCollection,
                    String(playlist.id)
                ),

                playlist

            );

        }

        console.log(
            "Playlists saved successfully."
        );

    }
    catch(error) {

        console.error(
            "Firebase playlist save error:",
            error
        );

    }

}


/* ==================================================
   LOAD PLAYLISTS
================================================== */

export async function loadPlaylists(uid) {

    if (!uid) {

        console.error(
            "Cannot load playlists: UID missing."
        );

        return [];

    }


    try {

        const snapshot =
            await getDocs(
                getPlaylistsCollection(uid)
            );


        const playlists = [];


        snapshot.forEach(docSnapshot => {

            playlists.push({

                id: docSnapshot.id,

                ...docSnapshot.data()

            });

        });


        console.log(
            "Loaded playlists:",
            playlists
        );


        return playlists;

    }
    catch(error) {

        console.error(
            "Firebase load playlists error:",
            error
        );

        return [];

    }

}


/* ==================================================
   DELETE PLAYLIST
================================================== */

export async function deletePlaylistFromFirebase(
    uid,
    playlistId
) {

    if (!uid || !playlistId) {

        return;

    }


    try {

        await deleteDoc(

            doc(
                getPlaylistsCollection(uid),
                String(playlistId)
            )

        );


        console.log(
            "Playlist deleted."
        );

    }
    catch(error) {

        console.error(
            "Delete playlist error:",
            error
        );

    }

}


/* ==================================================
   SAVE SERVICES
================================================== */

export async function saveServices(
    uid,
    services
) {

    if (!uid) {

        console.error(
            "Missing Firebase UID"
        );

        return;

    }


    try {

        const serviceCollection =
            getServicesCollection(uid);


        for (const service of services) {

            await setDoc(

                doc(
                    serviceCollection,
                    String(service.id)
                ),

                service

            );

        }


        console.log(
            "Services saved successfully."
        );

    }
    catch(error) {

        console.error(
            "Firebase service save error:",
            error
        );

    }

}


/* ==================================================
   LOAD SERVICES
================================================== */

export async function loadServices(uid) {

    if (!uid) {

        console.error(
            "Cannot load services: UID missing."
        );

        return [];

    }


    try {

        const snapshot =
            await getDocs(
                getServicesCollection(uid)
            );


        const services = [];


        snapshot.forEach(docSnapshot => {

            services.push({

                id: docSnapshot.id,

                ...docSnapshot.data()

            });

        });


        console.log(
            "Loaded services:",
            services
        );


        return services;

    }
    catch(error) {

        console.error(
            "Firebase load services error:",
            error
        );

        return [];

    }

}


/* ==================================================
   REAL-TIME SERVICE WATCHER
================================================== */

export function watchServices(
    uid,
    callback
) {

    if (!uid) {

        console.error(
            "Cannot watch services: UID missing."
        );

        return null;

    }


    return onSnapshot(

        getServicesCollection(uid),

        snapshot => {

            const services = [];


            snapshot.forEach(docSnapshot => {

                services.push({

                    id: docSnapshot.id,

                    ...docSnapshot.data()

                });

            });


            callback(services);

        },

        error => {

            console.error(
                "Firebase service watch error:",
                error
            );

        }

    );

}
