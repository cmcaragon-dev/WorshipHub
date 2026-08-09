"use strict";

const SERVICE_STORAGE = {
    ID: "currentServiceId",
    INDEX: "currentSongIndex"
};

function getServiceId() {

    return localStorage.getItem(
        SERVICE_STORAGE.ID
    );
}

function getSongIndex() {

    return Number(
        localStorage.getItem(
            SERVICE_STORAGE.INDEX
        ) || 0
    );
}

function getStoredServices() {

    return JSON.parse(
        localStorage.getItem("services")
    ) || [];
}

function getCurrentService() {

    const serviceId = getServiceId();

    if (!serviceId) {
        return null;
    }

    const services = getStoredServices();

    return services.find(
        service =>
            String(service.id) === String(serviceId)
    ) || null;
}

function nextServiceSong() {

    const service = getCurrentService();

    if (!service) {
        alert("No active service.");
        return;
    }

    const songs = service.songs || [];

    let index = getSongIndex();

    if (index >= songs.length - 1) {
        alert("End of Service.");
        return;
    }

    index++;

    localStorage.setItem(
        SERVICE_STORAGE.INDEX,
        String(index)
    );

    const song = songs[index];

    if (!song || !song.file) {
        alert("Next song file not found.");
        return;
    }

    location.href = song.file;
}

function previousServiceSong() {

    const service = getCurrentService();

    if (!service) {
        alert("No active service.");
        return;
    }

    let index = getSongIndex();

    if (index <= 0) {
        alert("This is the first song.");
        return;
    }

    index--;

    localStorage.setItem(
        SERVICE_STORAGE.INDEX,
        String(index)
    );

    const song = service.songs[index];

    if (!song || !song.file) {
        alert("Previous song file not found.");
        return;
    }

    location.href = song.file;
}

window.nextServiceSong =
    nextServiceSong;

window.previousServiceSong =
    previousServiceSong;
