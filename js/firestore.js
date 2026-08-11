"use strict";

import {
    auth,
    db
} from "./firebase.js";

import {
    collection,
    doc,
    getDocs,
    setDoc,
    deleteDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


// =====================================
// PLAYLISTS
// =====================================

// LOAD USER PLAYLISTS
export async function loadPlaylists(uid) {

    if (!uid) {
        console.error("loadPlaylists: UID is missing.");
        return [];
    }

    try {

        const playlistRef = collection(
            db,
            "users",
            String(uid),
            "playlists"
        );

        const snapshot = await getDocs(playlistRef);

        const playlists = snapshot.docs.map(item => ({
            id: item.id,
            ...item.data()
        }));

        console.log(
            "Loaded playlists:",
            playlists
        );

        return playlists;

    } catch (error) {

        console.error(
            "Firebase playlist load error:",
            error
        );

        return [];
    }
}


// SAVE PLAYLIST
export async function savePlaylist(
    uid,
    playlist
) {

    if (!uid) {
        throw new Error(
            "Firebase UID is missing."
        );
    }

    if (!playlist) {
        throw new Error(
            "Playlist is missing."
        );
    }

    const playlistId = String(
        playlist.id || Date.now()
    );

    const playlistRef = doc(
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

            updatedAt: serverTimestamp()
        }
    );

    console.log(
        "Playlist saved:",
        playlistId
    );

    return playlistId;
}


// DELETE PLAYLIST
export async function deletePlaylistCloud(
    uid,
    playlistId
) {

    if (!uid || !playlistId) {
        return;
    }

    const playlistRef = doc(
        db,
        "users",
        String(uid),
        "playlists",
        String(playlistId)
    );

    await deleteDoc(playlistRef);

    console.log(
        "Playlist deleted:",
        playlistId
    );
}


// =====================================
// SERVICES
// =====================================

// LOAD USER SERVICES
export async function loadServices() {

    const user =
        auth.currentUser;

    if (!user) {

        console.warn(
            "loadServices: No authenticated Firebase user."
        );

        return [];

    }

    try {

        const servicesRef =
            collection(
                db,
                "users",
                user.uid,
                "services"
            );

        const snapshot =
            await getDocs(
                servicesRef
            );

        const services =
            snapshot.docs.map(
                function (doc) {

                    return {
                        id: doc.id,
                        ...doc.data()
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

// SAVE SERVICE
export async function saveService(
    uid,
    service
) {

    if (!uid) {
        throw new Error(
            "Firebase UID is missing."
        );
    }

    if (!service) {
        throw new Error(
            "Service is missing."
        );
    }

    const serviceId = String(
        service.id || Date.now()
    );

    const serviceRef = doc(
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

            id: serviceId,

            updatedAt: serverTimestamp()
        }
    );

    console.log(
        "Service saved:",
        serviceId
    );

    return serviceId;
}


// SAVE ALL SERVICES
export async function saveServices(
    uid,
    services
) {

    if (!uid) {
        throw new Error(
            "Firebase UID is missing."
        );
    }

    if (!Array.isArray(services)) {
        throw new Error(
            "Services must be an array."
        );
    }

    for (const service of services) {

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


// DELETE SERVICE
export async function deleteServiceCloud(
    uid,
    serviceId
) {

    if (!uid || !serviceId) {
        return;
    }

    const serviceRef = doc(
        db,
        "users",
        String(uid),
        "services",
        String(serviceId)
    );

    await deleteDoc(serviceRef);

    console.log(
        "Service deleted:",
        serviceId
    );
}
