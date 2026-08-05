import {
    doc,
    setDoc,
    getDoc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

import { db } from "./firebase.js";

export async function saveServices(userId, services) {

    await setDoc(
        doc(db, "services", userId),
        {
            services: services
        }
    );

}

export async function loadServices(userId) {

    const snap = await getDoc(
        doc(db, "services", userId)
    );

    if (!snap.exists()) {
        return [];
    }

    return snap.data().services || [];

}

export function watchServices(userId, callback) {

    return onSnapshot(
        doc(db, "services", userId),
        (docSnap) => {

            if (docSnap.exists()) {

                callback(
                    docSnap.data().services || []
                );

            } else {

                callback([]);

            }

        }
    );

}
