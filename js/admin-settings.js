import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, doc, getDoc, getDocs, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const ADMIN_EMAIL = "jfcm.s07@gmail.com";

async function getUserPermission(uid) {
    if (!uid) return false;
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() && snap.data().allowAddSongs === true;
}

export async function canAddSongs(user = auth.currentUser) {
    if (!user) return false;
    if (String(user.email || "").toLowerCase() === ADMIN_EMAIL) return true;
    return getUserPermission(user.uid);
}

export async function setUserSongPermission(uid, value) {
    const user = auth.currentUser;
    if (!user || String(user.email || "").toLowerCase() !== ADMIN_EMAIL) {
        throw new Error("Admin only");
    }
    await setDoc(doc(db, "users", uid), {
        allowAddSongs: Boolean(value),
        permissionUpdatedAt: serverTimestamp(),
        permissionUpdatedBy: ADMIN_EMAIL
    }, { merge: true });
}

export async function loadSongPermission() {
    return canAddSongs();
}

export async function setSongPermission(value) {
    const user = auth.currentUser;
    if (!user || String(user.email || "").toLowerCase() !== ADMIN_EMAIL) throw new Error("Admin only");
    await setDoc(doc(db, "settings", "songPermission"), {
        allowAddSongs: Boolean(value), updatedAt: serverTimestamp(), updatedBy: ADMIN_EMAIL
    }, { merge: true });
}

function isAdmin(user) {
    return !!user && String(user.email || "").toLowerCase() === ADMIN_EMAIL;
}

function openSettings() {
    const panel = document.getElementById("settingsPanel");
    if (!panel) return;
    panel.classList.add("show");
    panel.setAttribute("aria-hidden", "false");
    renderSettings();
}

function closeSettings() {
    const panel = document.getElementById("settingsPanel");
    if (!panel) return;
    panel.classList.remove("show");
    panel.setAttribute("aria-hidden", "true");
}

async function renderSettings() {
    const root = document.getElementById("adminSettingsContent");
    const user = auth.currentUser;
    if (!root) return;
    if (!user) {
        root.innerHTML = '<div class="settings-empty">Please sign in to access Settings.</div>';
        return;
    }

    if (!isAdmin(user)) {
        const allowed = await canAddSongs(user);
        root.innerHTML = `
          <section class="settings-card settings-account-card">
            <div class="settings-card-icon">👤</div>
            <div class="settings-card-main">
              <div class="settings-card-title">Your account</div>
              <div class="settings-card-subtitle">${user.email || "Signed-in user"}</div>
              <div class="permission-badge ${allowed ? "enabled" : "disabled"}">${allowed ? "✓ Add Song enabled" : "× Add Song disabled"}</div>
            </div>
          </section>
          <section class="settings-card">
            <div class="settings-card-title">Song permissions</div>
            <p class="settings-help">Song creation is controlled by the WorshipHub administrator. Contact the administrator if you need permission to add or edit songs.</p>
          </section>`;
        return;
    }

    root.innerHTML = `
      <section class="settings-hero">
        <div class="settings-admin-icon">🛡️</div>
        <div><div class="settings-card-title">Administrator</div><div class="settings-card-subtitle">${ADMIN_EMAIL}</div></div>
        <span class="admin-badge">ADMIN</span>
      </section>
      <section class="settings-card">
        <div class="settings-section-head">
          <div><div class="settings-card-title">User song permissions</div><div class="settings-help">Allow or block individual users from adding and editing custom songs.</div></div>
          <button id="refreshUserPermissions" class="settings-secondary" type="button">↻ Refresh</button>
        </div>
        <div class="settings-search-wrap"><input id="userPermissionSearch" type="search" placeholder="Search users by name or email…"></div>
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
        list.innerHTML = '<div class="settings-error">Unable to load users. Check Firestore rules.</div>';
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
        const admin = String(u.email || "").toLowerCase() === ADMIN_EMAIL;
        const allowed = admin || u.allowAddSongs === true;
        const initials = String(u.name || u.email || "U").trim().charAt(0).toUpperCase();
        return `<div class="user-permission-row" data-user-id="${u.id}">
          <div class="user-avatar">${initials}</div>
          <div class="user-info"><div class="user-name">${u.name || "Unnamed user"}</div><div class="user-email">${u.email || ""}</div></div>
          <div class="user-role">${admin ? "Administrator" : "User"}</div>
          <label class="permission-toggle" title="${admin ? "Administrator always has access" : "Toggle Add Song permission"}">
            <input type="checkbox" class="user-song-toggle" ${allowed ? "checked" : ""} ${admin ? "disabled" : ""}>
            <span></span><b>${allowed ? "Allowed" : "Blocked"}</b>
          </label>
        </div>`;
    }).join("");

    list.querySelectorAll(".user-song-toggle").forEach(toggle => {
        toggle.addEventListener("change", async e => {
            const row = e.target.closest(".user-permission-row");
            const uid = row?.dataset.userId;
            if (!uid) return;
            e.target.disabled = true;
            try {
                await setUserSongPermission(uid, e.target.checked);
                const target = cachedUsers.find(u => u.id === uid);
                if (target) target.allowAddSongs = e.target.checked;
                row.querySelector("b").textContent = e.target.checked ? "Allowed" : "Blocked";
                window.dispatchEvent(new CustomEvent("worshiphub:permissions-updated"));
            } catch (error) {
                e.target.checked = !e.target.checked;
                alert("Unable to update this user's permission.");
            } finally { e.target.disabled = false; }
        });
    });
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("settingsBtn")?.addEventListener("click", openSettings);
    document.getElementById("closeSettings")?.addEventListener("click", closeSettings);
    document.getElementById("settingsPanel")?.addEventListener("click", e => {
        if (e.target.id === "settingsPanel") closeSettings();
    });
});

onAuthStateChanged(auth, async user => {
    const addBtn = document.getElementById("addSongBtn");
    if (!addBtn) return;
    const allowed = await canAddSongs(user);
    addBtn.disabled = !allowed;
    addBtn.title = allowed ? "Add a new song" : "Add Song is disabled by the administrator";
    addBtn.classList.toggle("permission-disabled", !allowed);
    addBtn.style.opacity = allowed ? "1" : ".55";
});

window.WorshipHubSettings = { open: openSettings, close: closeSettings, canAddSongs, setUserSongPermission };
