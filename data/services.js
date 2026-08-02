const services = JSON.parse(localStorage.getItem("services")) || [];

function saveServices() {
    localStorage.setItem("services", JSON.stringify(services));
}