import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, collectionGroup, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { songs } from "./songs.js";

export const ADMIN_EMAIL = "cmcaragon@gmail.com";

const normalizeEmail = value => String(value || "").trim().toLowerCase();
export const isAdmin = (user = auth.currentUser) => normalizeEmail(user?.email) === ADMIN_EMAIL;

let settingsAuthReadyResolve;
const settingsAuthReady = new Promise(resolve => { settingsAuthReadyResolve = resolve; });

async function getUserPermission(uid) {
    if (!uid) return false;
    try {
        const snap = await getDoc(doc(db, "users", uid));
        return snap.exists() && snap.data()?.allowAddSongs === true;
    } catch (error) {
        console.warn("Unable to read song permission:", error);
        return false;
    }
}

export async function canAddSongs(user = auth.currentUser) {
    if (!user) return false;
    if (isAdmin(user)) return true;
    return getUserPermission(user.uid);
}

export async function setUserSongPermission(uid, value) {
    if (!isAdmin()) throw new Error("Admin only");
    await setDoc(doc(db, "users", uid), {
        allowAddSongs: Boolean(value),
        permissionUpdatedAt: serverTimestamp(),
        permissionUpdatedBy: ADMIN_EMAIL
    }, { merge: true });
}


async function getUserEditPermission(uid) {
    if (!uid) return false;
    try {
        const snap = await getDoc(doc(db, "users", uid));
        return snap.exists() && snap.data()?.allowEditSongs === true;
    } catch (error) {
        console.warn("Unable to read edit-song permission:", error);
        return false;
    }
}

export async function canEditSongs(user = auth.currentUser) {
    if (!user) return false;
    if (isAdmin(user)) return true;
    return getUserEditPermission(user.uid);
}

export async function setUserEditPermission(uid, value) {
    if (!isAdmin()) throw new Error("Admin only");
    await setDoc(doc(db, "users", uid), {
        allowEditSongs: Boolean(value),
        permissionUpdatedAt: serverTimestamp(),
        permissionUpdatedBy: ADMIN_EMAIL
    }, { merge: true });
}

function openSettings() {
    if (document.getElementById("adminSettingsContent")) return renderSettings();
    window.location.assign("settings.html");
}

async function renderSettings() {
    const root = document.getElementById("adminSettingsContent");
    if (!root) return;
    await settingsAuthReady;
    const user = auth.currentUser;

    if (!user) {
        root.innerHTML = `
            <section class="settings-card settings-state-card">
                <div class="settings-state-icon">🔐</div>
                <h3>Sign-in required</h3>
                <p>Your Firebase session has not been established for this page.</p>
                <button class="settings-primary" type="button" onclick="location.href='login.html'">Go to Login</button>
            </section>`;
        return;
    }

    if (!isAdmin(user)) {
        const allowed = await canAddSongs(user);
        root.innerHTML = `
            <section class="settings-hero">
                <div class="settings-admin-icon">👤</div>
                <div class="settings-card-main">
                    <div class="settings-card-title">My Account</div>
                    <div class="settings-card-subtitle">${escapeHtml(user.email || "Signed-in user")}</div>
                </div>
                <span class="permission-badge ${allowed ? "enabled" : "disabled"}">${allowed ? "✓ Add Song enabled" : "× Add Song disabled"}</span>
            </section>
            <section class="settings-card">
                <div class="settings-card-title">Song permissions</div>
                <p class="settings-help">The administrator controls who can add and edit songs.</p>
            </section>`;
        return;
    }

    root.innerHTML = `
        <section class="settings-hero">
            <div class="settings-admin-icon">🛡️</div>
            <div class="settings-card-main">
                <div class="settings-card-title">Administrator</div>
                <div class="settings-card-subtitle">${ADMIN_EMAIL}</div>
            </div>
            <span class="admin-badge">ADMIN</span>
        </section>
        <section class="settings-card">
            <div class="settings-section-head">
                <div>
                    <div class="settings-card-title">User Song Permissions</div>
                    <div class="settings-help">Allow or block each user from adding songs and editing existing song chords.</div>
                </div>
                <button id="refreshUserPermissions" class="settings-secondary" type="button">↻ Refresh</button>
            </div>
            <div class="permission-legend">
                <div class="permission-legend-item"><span class="legend-dot add"></span><div><strong>Add Song</strong><small>Create new songs using Add Song.</small></div></div>
                <div class="permission-legend-item"><span class="legend-dot edit"></span><div><strong>Edit Song</strong><small>Edit chord positions and save changes.</small></div></div>
            </div>
            <div class="settings-search-wrap"><input id="userPermissionSearch" type="search" placeholder="Search users by name or email…"></div>
            <div class="permission-table-head"><span>User</span><span>Role</span><span>Add Song</span><span>Edit Song</span></div>
            <div id="userPermissionList" class="user-permission-list"><div class="settings-loading">Loading users…</div></div>
        </section>`;

    document.getElementById("refreshUserPermissions")?.addEventListener("click", loadUsers);
    document.getElementById("userPermissionSearch")?.addEventListener("input", filterUsers);
    await loadUsers();
}

let cachedUsers = [];
async function loadUsers() {
    const list = document.getElementById("userPermissionList");
    if (!list) return;
    list.innerHTML = '<div class="settings-loading">Loading users…</div>';
    try {
        const snap = await getDocs(collection(db, "users"));
        cachedUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a,b) => String(a.name || a.email || "").localeCompare(String(b.name || b.email || "")));
        renderUserRows(cachedUsers);
    } catch (error) {
        console.error("Unable to load users:", error);
        list.innerHTML = `<div class="settings-error">Unable to load users. Check your Firestore rules.</div>`;
    }
}

function filterUsers() {
    const q = String(document.getElementById("userPermissionSearch")?.value || "").toLowerCase().trim();
    renderUserRows(cachedUsers.filter(u => `${u.name || ""} ${u.email || ""}`.toLowerCase().includes(q)));
}

function renderUserRows(users) {
    const list = document.getElementById("userPermissionList");
    if (!list) return;
    if (!users.length) {
        list.innerHTML = '<div class="settings-empty">No users found.</div>';
        return;
    }
    list.innerHTML = users.map(u => {
        const admin = normalizeEmail(u.email) === ADMIN_EMAIL;
        const addAllowed = admin || u.allowAddSongs === true;
        const editAllowed = admin || u.allowEditSongs === true;
        const label = String(u.name || u.email || "U").trim().charAt(0).toUpperCase();
        return `<div class="user-permission-row" data-user-id="${escapeHtml(u.id)}">
            <div class="user-identity"><div class="user-avatar">${escapeHtml(label)}</div><div class="user-info"><div class="user-name">${escapeHtml(u.name || "Unnamed user")}</div><div class="user-email">${escapeHtml(u.email || "")}</div></div></div>
            <div class="user-role"><span class="role-badge ${admin ? "admin" : "user"}">${admin ? "ADMIN" : "USER"}</span></div>
            <label class="permission-toggle permission-add" title="${admin ? "Administrator always has access" : "Allow this user to add new songs"}">
                <span class="permission-label">Add Song</span><input type="checkbox" class="user-song-toggle add-toggle" ${addAllowed ? "checked" : ""} ${admin ? "disabled" : ""}>
                <span class="switch"></span><b class="toggle-state">${addAllowed ? "ON" : "OFF"}</b>
            </label>
            <label class="permission-toggle permission-edit" title="${admin ? "Administrator always has access" : "Allow this user to edit existing songs"}>
                <span class="permission-label">Edit Song</span><input type="checkbox" class="user-song-toggle edit-toggle" ${editAllowed ? "checked" : ""} ${admin ? "disabled" : ""}>
                <span class="switch"></span><b class="toggle-state">${editAllowed ? "ON" : "OFF"}</b>
            </label>
        </div>`;
    }).join("");

    list.querySelectorAll(".add-toggle").forEach(toggle => {
        toggle.addEventListener("change", async event => {
            const row = event.target.closest(".user-permission-row");
            const uid = row?.dataset.userId;
            if (!uid) return;
            event.target.disabled = true;
            try {
                await setUserSongPermission(uid, event.target.checked);
                const target = cachedUsers.find(u => u.id === uid);
                if (target) target.allowAddSongs = event.target.checked;
                row.querySelector(".add-toggle + .switch + .toggle-state")?.replaceChildren(document.createTextNode(event.target.checked ? "ON" : "OFF"));
                window.dispatchEvent(new CustomEvent("worshiphub:permissions-updated"));
            } catch (error) {
                console.error(error);
                event.target.checked = !event.target.checked;
                alert("Unable to update Add Song permission.");
            } finally { event.target.disabled = false; }
        });
    });

    list.querySelectorAll(".edit-toggle").forEach(toggle => {
        toggle.addEventListener("change", async event => {
            const row = event.target.closest(".user-permission-row");
            const uid = row?.dataset.userId;
            if (!uid) return;
            event.target.disabled = true;
            try {
                await setUserEditPermission(uid, event.target.checked);
                const target = cachedUsers.find(u => u.id === uid);
                if (target) target.allowEditSongs = event.target.checked;
                row.querySelector(".edit-toggle + .switch + .toggle-state")?.replaceChildren(document.createTextNode(event.target.checked ? "ON" : "OFF"));
                window.dispatchEvent(new CustomEvent("worshiphub:permissions-updated"));
            } catch (error) {
                console.error(error);
                event.target.checked = !event.target.checked;
                alert("Unable to update Edit Song permission.");
            } finally { event.target.disabled = false; }
        });
    });
}

function escapeHtml(value) {
    return String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}


/* ============================================================
   GLOBAL ADMIN DASHBOARD
   Admin-only overview of users, service planners and playlists.
   Service/playlist documents remain in their original user paths;
   the parent UID is used as the creator identity.
============================================================ */
let globalAdminCache = { users: [], services: [], playlists: [] };

function adminTimestamp(value) {
    if (!value) return "—";
    if (typeof value?.toDate === "function") return value.toDate().toLocaleString();
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

function uniqueSongCount() {
    const map = new Map();
    (Array.isArray(songs) ? songs : []).forEach(s => {
        const id = String(s?.id || s?.file || s?.title || "");
        if (id) map.set(id, s);
    });
    return map.size;
}

function artistCount() {
    const set = new Set();
    (Array.isArray(songs) ? songs : []).forEach(s => {
        const a = String(s?.artist || "").trim();
        if (a) set.add(a.toLowerCase());
    });
    return set.size;
}

async function loadGlobalAdminData() {
    if (!isAdmin()) return null;
    const [userSnap, serviceSnap, playlistSnap] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(collectionGroup(db, "services")),
        getDocs(collectionGroup(db, "playlists"))
    ]);

    const users = userSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const byUid = new Map(users.map(u => [String(u.id), u]));

    const services = serviceSnap.docs.map(d => ({
        id: d.id,
        path: d.ref.path,
        ownerUid: d.ref.parent.parent?.id || "",
        owner: byUid.get(String(d.ref.parent.parent?.id || "")) || null,
        ...d.data()
    }));

    const playlists = playlistSnap.docs.map(d => ({
        id: d.id,
        path: d.ref.path,
        ownerUid: d.ref.parent.parent?.id || "",
        owner: byUid.get(String(d.ref.parent.parent?.id || "")) || null,
        ...d.data()
    }));

    globalAdminCache = { users, services, playlists };
    return globalAdminCache;
}

function adminRefFromPath(path) {
    const parts = String(path || "").split("/").filter(Boolean);
    if (parts.length !== 4) return null;
    return doc(db, ...parts);
}

async function adminEditRecord(kind, id) {
    if (!isAdmin()) return;
    const list = globalAdminCache[kind] || [];
    const item = list.find(x => String(x.id) === String(id));
    if (!item) return;

    if (kind === "services") {
        const name = prompt("Service Planner name:", item.name || item.title || "");
        if (name === null) return;
        const clean = name.trim();
        if (!clean) return alert("The Service Planner name cannot be empty.");
        const ref = adminRefFromPath(item.path);
        if (!ref) return;
        await updateDoc(ref, { name: clean, updatedAt: serverTimestamp(), updatedBy: ADMIN_EMAIL });
    } else {
        const name = prompt("Playlist name:", item.name || "");
        if (name === null) return;
        const clean = name.trim();
        if (!clean) return alert("The playlist name cannot be empty.");
        const youtube = prompt("YouTube playlist link (optional):", item.youtube || "");
        if (youtube === null) return;
        const ref = adminRefFromPath(item.path);
        if (!ref) return;
        await updateDoc(ref, {
            name: clean,
            youtube: youtube.trim(),
            updatedAt: serverTimestamp(),
            updatedBy: ADMIN_EMAIL
        });
    }
    await renderGlobalAdminDashboard();
}

async function adminDeleteRecord(kind, id) {
    if (!isAdmin()) return;
    const list = globalAdminCache[kind] || [];
    const item = list.find(x => String(x.id) === String(id));
    if (!item) return;
    const label = kind === "services" ? (item.name || "Service Planner") : (item.name || "Playlist");
    if (!confirm(`Delete "${label}" permanently?`)) return;
    const ref = adminRefFromPath(item.path);
    if (!ref) return;
    await deleteDoc(ref);
    await renderGlobalAdminDashboard();
}

function renderAdminRecordList(kind, items) {
    const title = kind === "services" ? "Service Planners" : "Playlists";
    if (!items.length) return `<div class="admin-empty">No ${title.toLowerCase()} found.</div>`;
    return items.map(item => {
        const owner = item.owner?.name || item.owner?.email || item.ownerUid || "Unknown user";
        const count = Array.isArray(item.songs) ? item.songs.length : 0;
        return `
        <div class="admin-record">
            <div class="admin-record-main">
                <strong>${escapeHtml(item.name || item.title || "Untitled")}</strong>
                <span>Created by ${escapeHtml(owner)}</span>
                <small>${count} song${count === 1 ? "" : "s"} · Updated ${escapeHtml(adminTimestamp(item.updatedAt || item.createdAt))}</small>
            </div>
            <div class="admin-record-actions">
                <button type="button" data-admin-action="edit" data-kind="${kind}" data-id="${escapeHtml(item.id)}">Edit</button>
                <button type="button" class="danger" data-admin-action="delete" data-kind="${kind}" data-id="${escapeHtml(item.id)}">Delete</button>
            </div>
        </div>`;
    }).join("");
}

function renderAdminUsers(users) {
    if (!users.length) return '<div class="admin-empty">No user profiles found.</div>';
    return users.map(u => {
        const admin = normalizeEmail(u.email) === ADMIN_EMAIL;
        return `
        <div class="admin-user-row">
            <div class="admin-user-avatar">${escapeHtml((u.name || u.email || "U").trim().charAt(0).toUpperCase())}</div>
            <div class="admin-user-main">
                <strong>${escapeHtml(u.name || "Unnamed user")}</strong>
                <span>${escapeHtml(u.email || "No email")}</span>
                <small>UID: ${escapeHtml(u.id)} · Joined ${escapeHtml(adminTimestamp(u.createdAt))}</small>
            </div>
            <div class="admin-user-badges">
                <b class="${admin ? "admin" : ""}">${admin ? "ADMIN" : "USER"}</b>
                ${u.allowAddSongs ? '<b class="allow">ADD SONG</b>' : ""}
                ${u.allowEditSongs ? '<b class="allow edit">EDIT SONG</b>' : ""}
            </div>
        </div>`;
    }).join("");
}

export async function renderGlobalAdminDashboard() {
    const root = document.getElementById("globalAdminDashboard");
    if (!root) return;
    const user = auth.currentUser;
    if (!user || !isAdmin(user)) {
        root.hidden = true;
        root.innerHTML = "";
        return;
    }
    root.hidden = false;
    root.innerHTML = '<div class="admin-loading">Loading global dashboard…</div>';
    try {
        const data = await loadGlobalAdminData();
        root.innerHTML = `
          <div class="admin-dashboard-head">
            <div>
              <span class="admin-eyebrow">ADMIN CONTROL CENTER</span>
              <h2>Global Dashboard</h2>
              <p>Manage the complete WorshipHub activity from one place.</p>
            </div>
            <button type="button" id="adminDashboardRefresh" class="admin-refresh">↻ Refresh</button>
          </div>
          <div class="admin-stat-grid">
            <button class="admin-stat-card" data-admin-tab="services"><span class="admin-stat-icon">📅</span><strong>${data.services.length}</strong><span>Service Planners</span></button>
            <button class="admin-stat-card" data-admin-tab="playlists"><span class="admin-stat-icon">▶</span><strong>${data.playlists.length}</strong><span>Playlists</span></button>
            <button class="admin-stat-card" data-admin-tab="users"><span class="admin-stat-icon">👥</span><strong>${data.users.length}</strong><span>Total Users</span></button>
            <div class="admin-stat-card"><span class="admin-stat-icon">🎵</span><strong>${uniqueSongCount()}</strong><span>Total Songs</span></div>
            <div class="admin-stat-card"><span class="admin-stat-icon">🎤</span><strong>${artistCount()}</strong><span>Total Artists</span></div>
            <div class="admin-stat-card"><span class="admin-stat-icon">📊</span><strong>${data.services.reduce((n,s)=>n+(Array.isArray(s.songs)?s.songs.length:0),0)}</strong><span>Songs in Services</span></div>
          </div>
          <div class="admin-dashboard-grid">
            <section class="admin-panel-card" data-admin-panel="services">
              <div class="admin-panel-title"><div><h3>Service Planners</h3><span>${data.services.length} total · creator included</span></div></div>
              <div class="admin-record-list">${renderAdminRecordList("services", data.services)}</div>
            </section>
            <section class="admin-panel-card" data-admin-panel="playlists">
              <div class="admin-panel-title"><div><h3>Playlists</h3><span>${data.playlists.length} total · creator included</span></div></div>
              <div class="admin-record-list">${renderAdminRecordList("playlists", data.playlists)}</div>
            </section>
            <section class="admin-panel-card admin-users-panel" data-admin-panel="users">
              <div class="admin-panel-title"><div><h3>Users</h3><span>${data.users.length} registered profile${data.users.length === 1 ? "" : "s"}</span></div></div>
              <div class="admin-user-list">${renderAdminUsers(data.users)}</div>
            </section>
          </div>
          <div class="admin-dashboard-footer">Administrator: <b>${escapeHtml(ADMIN_EMAIL)}</b> · Live Firestore data · ${new Date().toLocaleString()}</div>
        `;
        root.querySelector("#adminDashboardRefresh")?.addEventListener("click", renderGlobalAdminDashboard);
        root.querySelectorAll("[data-admin-tab]").forEach(btn => btn.addEventListener("click", () => {
            const target = root.querySelector(`[data-admin-panel="${btn.dataset.adminTab}"]`);
            target?.scrollIntoView({ behavior: "smooth", block: "start" });
        }));
        root.querySelectorAll("[data-admin-action]").forEach(btn => btn.addEventListener("click", async () => {
            try {
                if (btn.dataset.adminAction === "edit") await adminEditRecord(btn.dataset.kind, btn.dataset.id);
                else await adminDeleteRecord(btn.dataset.kind, btn.dataset.id);
            } catch (error) {
                console.error("Admin dashboard action failed:", error);
                alert(`Unable to ${btn.dataset.adminAction} this item. Check Firebase permissions.`);
            }
        }));
    } catch (error) {
        console.error("Global admin dashboard load failed:", error);
        root.hidden = false;
        root.innerHTML = `<div class="admin-error"><strong>Global dashboard could not load.</strong><span>${escapeHtml(error?.message || "Check Firestore rules for administrator access.")}</span></div>`;
    }
}

onAuthStateChanged(auth, async user => {
    settingsAuthReadyResolve(user || null);
    const addBtn = document.getElementById("addSongBtn");
    if (addBtn) {
        const allowed = await canAddSongs(user);
        addBtn.disabled = !allowed;
        addBtn.classList.toggle("permission-disabled", !allowed);
        addBtn.title = allowed ? "Add a new song" : "Add Song is disabled by the administrator";
    }
    const globalBtn = document.getElementById("globalAdminBtn");
    if (globalBtn) {
        globalBtn.hidden = !isAdmin(user);
        globalBtn.onclick = () => document.getElementById("globalAdminDashboard")?.scrollIntoView({behavior:"smooth", block:"start"});
    }
    if (document.getElementById("adminSettingsContent")) await renderSettings();
    if (document.getElementById("globalAdminDashboard")) await renderGlobalAdminDashboard();
});

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("settingsBtn")?.addEventListener("click", () => window.location.assign("settings.html"));
    if (document.getElementById("adminSettingsContent")) renderSettings();
    if (document.getElementById("globalAdminDashboard")) renderGlobalAdminDashboard();
});

window.WorshipHubSettings = { open: openSettings, canAddSongs, canEditSongs, setUserSongPermission, setUserEditPermission, isAdmin };
window.WorshipHubAdmin = { renderGlobalAdminDashboard, isAdmin };
