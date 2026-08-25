"use strict";

// =====================================
// FIREBASE
// =====================================

import {
    auth,
    db
} from "./firebase.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    collection,
    doc,
    getDocs,
    setDoc,
    deleteDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


// =====================================
// FIREBASE AUTH READY
// =====================================

const firebaseAuthReady =
    new Promise(function (resolve) {

        onAuthStateChanged(
            auth,
            function (user) {

                console.log(
                    "FIRESTORE AUTH STATE:",
                    user
                        ? user.uid
                        : "NO USER"
                );

                resolve(user);

            }
        );

    });


// =====================================
// GET AUTHENTICATED FIREBASE USER
// =====================================

async function getFirebaseUser() {

    /*
     * If Firebase already knows the user,
     * use it immediately.
     */

    if (auth.currentUser) {

        return auth.currentUser;

    }


    /*
     * Otherwise wait for Firebase Auth
     * to finish restoring the session.
     */

    const user =
        await firebaseAuthReady;


    return user || null;

}


// =====================================
// PLAYLISTS
// =====================================


// =====================================
// LOAD USER PLAYLISTS
// =====================================

export async function loadPlaylists(
    uid
) {

    /*
     * If UID was not supplied,
     * use the authenticated Firebase user.
     */

    if (!uid) {

        const user =
            await getFirebaseUser();

        if (!user) {

            console.warn(
                "loadPlaylists: No authenticated Firebase user."
            );

            return [];

        }

        uid =
            user.uid;

    }


    try {

        const playlistRef =
            collection(
                db,
                "users",
                String(uid),
                "playlists"
            );


        console.log(
            "READING PLAYLISTS:",
            `users/${uid}/playlists`
        );


        const snapshot =
            await getDocs(
                playlistRef
            );


        const playlists =
            snapshot.docs.map(
                function (item) {

                    return {

                        id: item.id,

                        ...item.data()

                    };

                }
            );


        console.log(
            "Loaded playlists:",
            playlists
        );


        return playlists;

    }
    catch (error) {

        console.error(
            "Firebase playlist load error:",
            error
        );

        return [];

    }

}


// =====================================
// SAVE PLAYLIST
// =====================================

export async function savePlaylist(
    uid,
    playlist
) {

    /*
     * Get authenticated user if UID
     * was not supplied.
     */

    if (!uid) {

        const user =
            await getFirebaseUser();

        if (!user) {

            throw new Error(
                "No authenticated Firebase user."
            );

        }

        uid =
            user.uid;

    }


    if (!playlist) {

        throw new Error(
            "Playlist is missing."
        );

    }


    const playlistId =
        String(
            playlist.id || Date.now()
        );


    const playlistRef =
        doc(
            db,
            "users",
            String(uid),
            "playlists",
            playlistId
        );


    await setDoc(
        playlistRef,
        {

            ...playlist,

            id: playlistId,

            updatedAt:
                serverTimestamp()

        }
    );


    console.log(
        "Playlist saved:",
        playlistId
    );


    return playlistId;

}


// =====================================
// DELETE PLAYLIST
// =====================================

export async function deletePlaylistCloud(
    uid,
    playlistId
) {

    /*
     * Get authenticated user if UID
     * was not supplied.
     */

    if (!uid) {

        const user =
            await getFirebaseUser();

        if (!user) {

            console.warn(
                "deletePlaylistCloud: No authenticated Firebase user."
            );

            return;

        }

        uid =
            user.uid;

    }


    if (!playlistId) {

        return;

    }


    const playlistRef =
        doc(
            db,
            "users",
            String(uid),
            "playlists",
            String(playlistId)
        );


    await deleteDoc(
        playlistRef
    );


    console.log(
        "Playlist deleted:",
        playlistId
    );

}


// =====================================
// SERVICES
// =====================================


// =====================================
// LOAD USER SERVICES
// =====================================

export async function loadServices() {

    /*
     * IMPORTANT:
     *
     * Do NOT use "guest".
     *
     * Wait for Firebase authentication.
     */

    const user =
        await getFirebaseUser();


    if (!user) {

        console.warn(
            "loadServices: No authenticated Firebase user."
        );

        return [];

    }


    console.log(
        "loadServices: AUTHENTICATED USER:",
        user.uid
    );


    try {

        /*
         * Firestore structure:
         *
         * users
         *   └── USER_UID
         *        └── services
         */

        const servicesRef =
            collection(
                db,
                "users",
                user.uid,
                "services"
            );


        console.log(
            "READING FIRESTORE:",
            `users/${user.uid}/services`
        );


        const snapshot =
            await getDocs(
                servicesRef
            );


        const services =
            snapshot.docs.map(
                function (serviceDoc) {

                    return {

                        id:
                            serviceDoc.id,

                        ...serviceDoc.data()

                    };

                }
            );


        console.log(
            "FIREBASE SERVICES LOADED:",
            services
        );


        return services;

    }
    catch (error) {

        console.error(
            "Firebase service load error:",
            error
        );

        return [];

    }

}


// =====================================
// SAVE SERVICE
// =====================================

export async function saveService(
    uid,
    service
) {

    /*
     * Get authenticated user if UID
     * was not supplied.
     */

    if (!uid) {

        const user =
            await getFirebaseUser();

        if (!user) {

            throw new Error(
                "No authenticated Firebase user."
            );

        }

        uid =
            user.uid;

    }


    if (!service) {

        throw new Error(
            "Service is missing."
        );

    }


    const serviceId =
        String(
            service.id || Date.now()
        );


    const serviceRef =
        doc(
            db,
            "users",
            String(uid),
            "services",
            serviceId
        );


    await setDoc(
        serviceRef,
        {

            ...service,

            id:
                serviceId,

            updatedAt:
                serverTimestamp()

        }
    );


    console.log(
        "Service saved:",
        serviceId
    );


    return serviceId;

}


// =====================================
// SAVE ALL SERVICES
// =====================================

export async function saveServices(
    uid,
    services
) {

    /*
     * Get authenticated user if UID
     * was not supplied.
     */

    if (!uid) {

        const user =
            await getFirebaseUser();

        if (!user) {

            throw new Error(
                "No authenticated Firebase user."
            );

        }

        uid =
            user.uid;

    }


    if (!Array.isArray(services)) {

        throw new Error(
            "Services must be an array."
        );

    }


    for (
        const service of services
    ) {

        await saveService(
            uid,
            service
        );

    }


    console.log(
        "All services saved:",
        services.length
    );

}


// =====================================
// DELETE SERVICE
// =====================================

export async function deleteServiceCloud(uid, serviceId) {

    // =====================================
    // GET AUTHENTICATED USER
    // =====================================

    if (!uid) {

        const user =
            await getFirebaseUser();

        if (!user) {

            throw new Error(
                "deleteServiceCloud: No authenticated Firebase user."
            );

        }

        uid =
            user.uid;

    }


    // =====================================
    // VALIDATE SERVICE ID
    // =====================================

    if (
        serviceId === undefined ||
        serviceId === null ||
        String(serviceId).trim() === ""
    ) {

        throw new Error(
            "deleteServiceCloud: Service ID is missing."
        );

    }


    const serviceIdString =
        String(serviceId);


    // =====================================
    // FIRESTORE REFERENCE
    // =====================================

    const serviceRef =
        doc(
            db,
            "users",
            String(uid),
            "services",
            serviceIdString
        );


    console.log(
        "DELETING SERVICE FROM FIRESTORE:",
        `users/${uid}/services/${serviceIdString}`
    );


    // =====================================
    // DELETE
    // =====================================

    await deleteDoc(
        serviceRef
    );


    console.log(
        "FIREBASE SERVICE DELETE SUCCESS:",
        serviceIdString
    );


    return true;

}
