import { auth, db } from "./firebase.js";
import { songs as staticSongs } from "./initial-songs.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, doc, getDoc, getDocs, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const ADMIN_EMAIL = "cmcaragon@gmail.com";
const ADMIN_EMAILS = new Set(["cmcaragon@gmail.com", "jfcm.s07@gmail.com"]);

const normalizeEmail = value => String(value || "").trim().toLowerCase();
export const isAdmin = (user = auth.currentUser) => ADMIN_EMAILS.has(normalizeEmail(user?.email)) || user?.role === "admin" || user?.isAdmin === true || user?.admin === true;

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
        const [addAllowed, editAllowed] = await Promise.all([canAddSongs(user), canEditSongs(user)]);
        root.innerHTML = `
            <section class="settings-hero settings-admin-hero">
                <div class="settings-admin-icon">👤</div>
                <div class="settings-card-main">
                    <div class="settings-card-title">My Account</div>
                    <div class="settings-card-subtitle">${escapeHtml(user.email || "Signed-in user")}</div>
                    <p class="settings-admin-description">Your account access is managed by a CHORDIO administrator. These statuses update when the page is refreshed.</p>
                </div>
                <span class="role-badge user">USER</span>
            </section>
            <section class="settings-metrics settings-user-permission-metrics">
                <article class="settings-metric"><span class="settings-metric-icon">🎵</span><div><span class="settings-metric-label">Add Song</span><strong class="permission-badge ${addAllowed ? "enabled" : "disabled"}">${addAllowed ? "✓ Enabled" : "× Disabled"}</strong></div></article>
                <article class="settings-metric"><span class="settings-metric-icon">✏️</span><div><span class="settings-metric-label">Edit Song</span><strong class="permission-badge ${editAllowed ? "enabled" : "disabled"}">${editAllowed ? "✓ Enabled" : "× Disabled"}</strong></div></article>
            </section>
            <section class="settings-card">
                <div class="settings-card-title">How permissions work</div>
                <p class="settings-help">If Add Song or Edit Song is disabled, contact an administrator and ask them to enable the relevant permission. You cannot change your own access from this page.</p>
            </section>`;
        return;
    }

    root.innerHTML = `
        <section class="settings-hero settings-admin-hero">
            <div class="settings-admin-icon">🛡️</div>
            <div class="settings-card-main">
                <div class="settings-card-title">Administrator Console</div>
                <div class="settings-card-subtitle">${ADMIN_EMAIL}</div>
                <p class="settings-admin-description">Manage song-creation and editing access for each registered user. Changes are saved to the user account immediately.</p>
            </div>
            <span class="admin-badge">ADMIN</span>
        </section>
        <section class="settings-metrics" id="permissionMetrics" aria-label="Permission overview">
            <article class="settings-metric"><span class="settings-metric-icon">👥</span><div><span class="settings-metric-label">Registered users</span><strong id="metricUsers">—</strong></div></article>
            <article class="settings-metric"><span class="settings-metric-icon">🎵</span><div><span class="settings-metric-label">Add Song enabled</span><strong id="metricAdd">—</strong></div></article>
            <article class="settings-metric"><span class="settings-metric-icon">✏️</span><div><span class="settings-metric-label">Edit Song enabled</span><strong id="metricEdit">—</strong></div></article>
            <article class="settings-metric"><span class="settings-metric-icon">🔒</span><div><span class="settings-metric-label">No song access</span><strong id="metricRestricted">—</strong></div></article>
        </section>
        <section class="settings-card settings-permissions-panel">
            <div class="settings-panel-heading">
                <div><div class="settings-card-title">User access & approvals</div><p class="settings-help">Turn Add Song and Edit Song access on or off individually. Admin accounts always retain both permissions.</p></div>
                <button id="refreshUserPermissions" class="settings-secondary" type="button">↻ Refresh list</button>
            </div>
            <div class="settings-tools-row">
                <div class="settings-search-wrap"><span aria-hidden="true">⌕</span><input id="userPermissionSearch" type="search" placeholder="Search by name or email…" aria-label="Search users by name or email"></div>
                <div class="settings-filter-group" role="group" aria-label="Filter users">
                    <button type="button" class="settings-filter active" data-permission-filter="all">All users</button>
                    <button type="button" class="settings-filter" data-permission-filter="add">Add enabled</button>
                    <button type="button" class="settings-filter" data-permission-filter="edit">Edit enabled</button>
                    <button type="button" class="settings-filter" data-permission-filter="restricted">Restricted</button>
                </div>
            </div>
            <div class="permission-table-head"><span>User account</span><span>Role</span><span>Add Song access</span><span>Edit Song access</span></div>
            <div id="userPermissionList" class="user-permission-list"><div class="settings-loading">Loading users…</div></div>
            <div class="settings-permissions-footnote"><span>ⓘ</span><span>Permission changes are saved immediately. If a change fails, the switch will revert and an error message will appear.</span></div>
        </section>`;

    document.getElementById("refreshUserPermissions")?.addEventListener("click", loadUsers);
    document.getElementById("userPermissionSearch")?.addEventListener("input", filterUsers);
    document.querySelectorAll("[data-permission-filter]").forEach(button => button.addEventListener("click", () => {
        activePermissionFilter = button.dataset.permissionFilter || "all";
        document.querySelectorAll("[data-permission-filter]").forEach(item => item.classList.toggle("active", item === button));
        filterUsers();
    }));
    await loadUsers();
}


let cachedUsers = [];
let activePermissionFilter = "all";
async function loadUsers() {
    const list = document.getElementById("userPermissionList");
    if (!list) return;
    list.innerHTML = '<div class="settings-loading">Loading users…</div>';
    try {
        const snap = await getDocs(collection(db, "users"));
        cachedUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a,b) => String(a.name || a.email || "").localeCompare(String(b.name || b.email || "")));
        updatePermissionMetrics();
        filterUsers();
    } catch (error) {
        console.error("Unable to load users:", error);
        list.innerHTML = `<div class="settings-error">Unable to load users. Check your Firestore rules.</div>`;
    }
}

function filterUsers() {
    const q = String(document.getElementById("userPermissionSearch")?.value || "").toLowerCase().trim();
    const matches = cachedUsers.filter(u => {
        const textMatch = `${u.name || ""} ${u.email || ""}`.toLowerCase().includes(q);
        const admin = ADMIN_EMAILS.has(normalizeEmail(u.email)) || u.role === "admin" || u.isAdmin === true || u.admin === true;
        const add = admin || u.allowAddSongs === true;
        const edit = admin || u.allowEditSongs === true;
        const filterMatch = activePermissionFilter === "add" ? add
            : activePermissionFilter === "edit" ? edit
            : activePermissionFilter === "restricted" ? (!add && !edit)
            : true;
        return textMatch && filterMatch;
    });
    renderUserRows(matches);
}

function updatePermissionMetrics() {
    const isAdminUser = u => ADMIN_EMAILS.has(normalizeEmail(u.email)) || u.role === "admin" || u.isAdmin === true || u.admin === true;
    const add = u => isAdminUser(u) || u.allowAddSongs === true;
    const edit = u => isAdminUser(u) || u.allowEditSongs === true;
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = String(value); };
    set("metricUsers", cachedUsers.length);
    set("metricAdd", cachedUsers.filter(add).length);
    set("metricEdit", cachedUsers.filter(edit).length);
    set("metricRestricted", cachedUsers.filter(u => !add(u) && !edit(u)).length);
}

function renderUserRows(users) {
    const list = document.getElementById("userPermissionList");
    if (!list) return;
    if (!users.length) {
        list.innerHTML = '<div class="settings-empty settings-no-users"><span>🔎</span><strong>No matching users</strong><small>Try another search or choose a different filter.</small></div>';
        return;
    }
    list.innerHTML = users.map(u => {
        const admin = ADMIN_EMAILS.has(normalizeEmail(u.email)) || u.role === "admin" || u.isAdmin === true || u.admin === true;
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
                updatePermissionMetrics();
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
                updatePermissionMetrics();
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

onAuthStateChanged(auth, async user => {
    settingsAuthReadyResolve(user || null);
    const addBtn = document.getElementById("addSongBtn");
    if (addBtn) {
        const allowed = await canAddSongs(user);
        addBtn.disabled = !allowed;
        addBtn.classList.toggle("permission-disabled", !allowed);
        addBtn.title = allowed ? "Add a new song" : "Add Song is disabled by the administrator";
    }
    if (document.getElementById("adminSettingsContent")) await renderSettings();
});

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("settingsBtn")?.addEventListener("click", () => window.location.assign("settings.html"));
    if (document.getElementById("adminSettingsContent")) renderSettings();
});

window.WorshipHubSettings = { open: openSettings, canAddSongs, canEditSongs, setUserSongPermission, setUserEditPermission, isAdmin };
