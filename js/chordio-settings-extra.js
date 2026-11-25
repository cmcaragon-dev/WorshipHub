/* CHORDIO Settings extras: preferences, offline & storage, backups, admin exports. */
import { auth, db } from "./firebase.js";
import { isAdmin } from "./admin-settings.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (s, r = document) => r.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lsGet = (k, d = "") => { try { return localStorage.getItem(k) ?? d; } catch (_) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
const saved = (t = "Preference saved") => window.chordioSaveStatus?.flash(t);

function download(name, text, type = "application/json") {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const stamp = () => new Date().toISOString().slice(0, 10);
const csvCell = v => `"${String(v ?? "").replace(/"/g, '""')}"`;

function seg(name, current, options) {
    return `<span class="cx-seg" role="group" aria-label="${esc(name)}">${options.map(([v, l]) =>
        `<button type="button" data-pref="${esc(name)}" data-value="${esc(v)}" aria-pressed="${String(v) === String(current)}">${esc(l)}</button>`).join("")}</span>`;
}

function prefsHtml() {
    const theme = window.chordioGetTheme ? window.chordioGetTheme() : "dark";
    return `
    <section class="settings-card cx-pref" id="cxPrefs">
        <div class="settings-card-title">Preferences</div>
        <p class="settings-help">Saved on this device and applied across every page.</p>
        <div class="cx-row"><div><strong>Appearance</strong><small>Night is easier in dim sanctuaries; Day suits bright rooms.</small></div>${seg("theme", theme, [["dark", "Night"], ["light", "Day"]])}</div>
        <div class="cx-row"><div><strong>Print orientation</strong><small>Default for the Print button on songs and Service Planner.</small></div>${seg("printOrient", lsGet("chordioPrintOrient", "portrait"), [["portrait", "Portrait"], ["landscape", "Landscape"]])}</div>
        <div class="cx-row"><div><strong>Print columns</strong><small>Split each printed page into two columns or keep one.</small></div>${seg("printCols", lsGet("chordioPrintCols", "2"), [["1", "1"], ["2", "2"]])}</div>
        <div class="cx-row"><div><strong>Print text size</strong><small>Long lines still shrink automatically to fit the page.</small></div>${seg("printSize", lsGet("chordioPrintSize", "M"), [["S", "Small"], ["M", "Medium"], ["L", "Large"]])}</div>
        <div class="cx-row"><div><strong>Reduce motion</strong><small>Turns off animations and transitions.</small></div>${seg("motion", lsGet("chordioMotion", "full"), [["full", "Off"], ["reduced", "On"]])}</div>
    </section>`;
}

function deviceHtml() {
    return `
    <section class="settings-card cx-pref" id="cxDevice">
        <div class="settings-card-title">This device</div>
        <div class="cx-row"><div><strong>Connection</strong><small id="cxOnline">Checking…</small></div></div>
        <div class="cx-row"><div><strong>Offline storage</strong><small id="cxStorage">Checking…</small></div></div>
        <div class="cx-row"><div><strong>App version</strong><small id="cxVersion">Checking…</small></div></div>
        <div class="cx-row"><div><strong>Refresh app files</strong><small>Use this if the app looks outdated after an update. Your songs and services are not deleted.</small></div>
            <button type="button" class="settings-secondary" id="cxRefreshApp">Refresh now</button></div>
    </section>`;
}

function backupHtml(admin) {
    return `
    <section class="settings-card cx-pref" id="cxBackup">
        <div class="settings-card-title">Backup & export</div>
        <p class="settings-help">Download a copy of your data as a file you can keep.</p>
        <div class="cx-row"><div><strong>My Service Planners</strong><small>All services, songs, keys and notes.</small></div><button type="button" class="settings-secondary" data-export="services">Download</button></div>
        <div class="cx-row"><div><strong>My custom songs</strong><small>Songs saved on this device.</small></div><button type="button" class="settings-secondary" data-export="custom">Download</button></div>
        ${admin ? `
        <div class="cx-row"><div><strong>Song library (admin)</strong><small>Every shared song in the cloud library.</small></div><button type="button" class="settings-secondary" data-export="library">Download</button></div>
        <div class="cx-row"><div><strong>Users & permissions (admin)</strong><small>CSV with names, emails and song access.</small></div><button type="button" class="settings-secondary" data-export="users">Download</button></div>` : ""}
        <div class="cx-msg" id="cxExportMsg" role="status"></div>
    </section>`;
}

async function exportData(kind, btn) {
    const msg = $("#cxExportMsg");
    const old = btn.textContent; btn.disabled = true; btn.textContent = "Preparing…";
    try {
        if (kind === "custom") {
            let list = []; try { list = JSON.parse(lsGet("worshipHubCustomSongs", "[]")); } catch (_) {}
            download(`chordio-custom-songs-${stamp()}.json`, JSON.stringify(list, null, 2));
        } else if (kind === "services") {
            const snap = await getDocs(collection(db, "users", auth.currentUser.uid, "services"));
            download(`chordio-services-${stamp()}.json`, JSON.stringify(snap.docs.map(d => ({ id: d.id, ...d.data() })), null, 2));
        } else if (kind === "library") {
            const snap = await getDocs(collection(db, "songs"));
            download(`chordio-song-library-${stamp()}.json`, JSON.stringify(snap.docs.map(d => ({ id: d.id, ...d.data() })), null, 2));
        } else if (kind === "users") {
            const snap = await getDocs(collection(db, "users"));
            const rows = [["Name", "Email", "Role", "Add songs", "Edit songs"]].concat(snap.docs.map(d => {
                const u = d.data() || {};
                return [u.name || u.displayName || "", u.email || "", u.role || "user", u.allowAddSongs ? "Yes" : "No", u.allowEditSongs ? "Yes" : "No"];
            }));
            download(`chordio-users-${stamp()}.csv`, rows.map(r => r.map(csvCell).join(",")).join("\n"), "text/csv");
        }
        if (msg) { msg.textContent = "Downloaded."; msg.dataset.type = "ok"; }
        saved("Backup downloaded");
    } catch (e) {
        console.error("Export failed", e);
        if (msg) { msg.textContent = "Couldn't create the backup. Check your connection and try again."; msg.dataset.type = "error"; }
    } finally { btn.disabled = false; btn.textContent = old; }
}

async function fillDevice() {
    const online = $("#cxOnline"), storage = $("#cxStorage"), ver = $("#cxVersion");
    const setOnline = () => { if (online) online.textContent = navigator.onLine ? "Online" : "Offline — changes will sync when you reconnect"; };
    setOnline(); window.addEventListener("online", setOnline); window.addEventListener("offline", setOnline);
    try {
        const e = await navigator.storage.estimate();
        const mb = n => (n / 1048576).toFixed(1) + " MB";
        storage.textContent = `${mb(e.usage || 0)} used of ${mb(e.quota || 0)}`;
    } catch (_) { storage.textContent = "Not available in this browser"; }
    try {
        const keys = await caches.keys();
        const shell = keys.find(k => /^chordio-shell-/.test(k));
        ver.textContent = shell ? shell.replace("chordio-shell-", "Build ") : "Not installed for offline use yet";
    } catch (_) { ver.textContent = "Not available in this browser"; }
}

async function refreshApp(btn) {
    btn.disabled = true; btn.textContent = "Refreshing…";
    try {
        const regs = await navigator.serviceWorker?.getRegistrations?.() || [];
        await Promise.all(regs.map(r => r.unregister()));
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => /^chordio-/.test(k)).map(k => caches.delete(k)));
    } catch (e) { console.warn(e); }
    location.reload();
}

function applyPref(name, value) {
    if (name === "theme") window.chordioSetTheme?.(value);
    else if (name === "printOrient") lsSet("chordioPrintOrient", value);
    else if (name === "printCols") lsSet("chordioPrintCols", value);
    else if (name === "printSize") lsSet("chordioPrintSize", value);
    else if (name === "motion") {
        lsSet("chordioMotion", value);
        document.documentElement.setAttribute("data-cx-motion", value === "reduced" ? "reduced" : "full");
    }
    saved();
}

let mounted = false;
function mount(admin) {
    const host = $("#adminSettingsContent");
    if (!host) return;
    let wrap = $("#cxSettingsExtra");
    if (!wrap) {
        wrap = document.createElement("div"); wrap.id = "cxSettingsExtra"; wrap.className = "cx-extra";
        host.insertAdjacentElement("afterend", wrap);
    }
    wrap.innerHTML = prefsHtml() + deviceHtml() + (auth.currentUser ? backupHtml(admin) : "");
    mounted = true;
    wrap.onclick = e => {
        const p = e.target.closest("[data-pref]");
        if (p) {
            p.parentElement.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b === p)));
            applyPref(p.dataset.pref, p.dataset.value); return;
        }
        const x = e.target.closest("[data-export]"); if (x) { exportData(x.dataset.export, x); return; }
        const r = e.target.closest("#cxRefreshApp"); if (r) refreshApp(r);
    };
    fillDevice();
}

mount(false);
onAuthStateChanged(auth, user => mount(!!user && isAdmin(user)));
