import { auth, db } from "./firebase.js";
import { songs as staticSongs } from "./songs.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, doc, getDoc, getDocs, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
        </section>
        <section class="settings-card settings-youtube-card">
            <div class="settings-section-head">
                <div>
                    <div class="settings-card-title">🎬 Song YouTube Links</div>
                    <div class="settings-help">Add or update the YouTube link for any song in the WorshipHub library. These links are saved to Firebase and appear on the song cards.</div>
                </div>
                <button id="refreshSongYoutubeLinks" class="settings-secondary" type="button">↻ Refresh</button>
            </div>
            <div class="settings-search-wrap"><input id="songYoutubeSearch" type="search" placeholder="Search songs by title, artist or category…"></div>
            <div id="songYoutubeList" class="song-youtube-admin-list"><div class="settings-loading">Loading songs…</div></div>
        </section>`;

    document.getElementById("refreshUserPermissions")?.addEventListener("click", loadUsers);
    document.getElementById("userPermissionSearch")?.addEventListener("input", filterUsers);
    document.getElementById("refreshSongYoutubeLinks")?.addEventListener("click", loadAdminSongYoutubeLinks);
    document.getElementById("songYoutubeSearch")?.addEventListener("input", filterAdminSongYoutubeLinks);
    await loadUsers();
    await loadAdminSongYoutubeLinks();
}


let cachedAdminSongs = [];
let adminYoutubeLinks = new Map();

function adminSongKey(song){
    return String(song?.id ?? song?.file ?? song?.title ?? "").trim();
}

async function loadAdminSongYoutubeLinks(){
    const root=document.getElementById("songYoutubeList");
    if(!root)return;
    root.innerHTML='<div class="settings-loading">Loading songs…</div>';
    try{
        const customSnap=await getDocs(collection(db,"songs"));
        adminYoutubeLinks=new Map();
        const merged=new Map();
        (Array.isArray(staticSongs)?staticSongs:[]).forEach(song=>merged.set(adminSongKey(song),{...song}));
        customSnap.forEach(d=>{
            const data=d.data()||{};
            const normalized={...data,id:data.id||d.id};
            const key=adminSongKey(normalized);
            if(normalized.youtube) adminYoutubeLinks.set(key,String(normalized.youtube));
            // A metadata-only document is a YouTube overlay for a built-in song,
            // not a new custom song. It is merged over the static library entry.
            if(key) merged.set(key,{...(merged.get(key)||{}),...normalized});
            if(normalized.customSong===true && !normalized.metadataOnly) merged.set(key,normalized);
        });
        cachedAdminSongs=[...merged.values()].sort((a,b)=>String(a.title||"").localeCompare(String(b.title||"")));
        renderAdminSongYoutubeLinks(cachedAdminSongs);
    }catch(error){
        console.error("Unable to load admin YouTube links:",error);
        // Still show the built-in library so the administrator can enter links.
        cachedAdminSongs=[...(Array.isArray(staticSongs)?staticSongs:[])].sort((a,b)=>String(a.title||"").localeCompare(String(b.title||"")));
        renderAdminSongYoutubeLinks(cachedAdminSongs);
    }
}

function filterAdminSongYoutubeLinks(){
    const q=String(document.getElementById("songYoutubeSearch")?.value||"").toLowerCase().trim();
    renderAdminSongYoutubeLinks(cachedAdminSongs.filter(song=>`${song.title||""} ${song.artist||""} ${song.category||""}`.toLowerCase().includes(q)));
}

function renderAdminSongYoutubeLinks(list){
    const root=document.getElementById("songYoutubeList");
    if(!root)return;
    if(!list.length){root.innerHTML='<div class="settings-empty">No songs found.</div>';return;}
    root.innerHTML=list.map((song,index)=>{
        const key=adminSongKey(song);
        const existing=song.youtube || adminYoutubeLinks.get(key) || "";
        return `<div class="song-youtube-admin-row" data-song-key="${escapeHtml(key)}">\n            <div class="song-youtube-admin-info"><strong>${escapeHtml(song.title||"Untitled Song")}</strong><small>${escapeHtml(song.artist||"—")} · ${escapeHtml(song.category||"—")}</small></div>\n            <div class="song-youtube-admin-editor"><input class="admin-youtube-input" type="url" value="${escapeHtml(existing)}" placeholder="https://www.youtube.com/watch?v=…" aria-label="YouTube link for ${escapeHtml(song.title||"song")}"><button class="settings-primary admin-youtube-save" type="button">Save</button></div>\n        </div>`;
    }).join("");
    root.querySelectorAll(".admin-youtube-save").forEach(btn=>btn.addEventListener("click",async()=>{
        const row=btn.closest(".song-youtube-admin-row");
        const key=row?.dataset.songKey;
        const input=row?.querySelector(".admin-youtube-input");
        if(!key||!input)return;
        const link=String(input.value||"").trim();
        if(link && !/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(link)){
            alert("Please enter a valid YouTube URL."); return;
        }
        btn.disabled=true;
        try{
            const base = cachedAdminSongs.find(s=>adminSongKey(s)===key) || staticSongs.find(s=>adminSongKey(s)===key);
            if(!base) throw new Error("Song was not found in the library.");
            const isCustom = base.customSong===true && base.metadataOnly!==true;
            const payload = isCustom
                ? {
                    ...base,
                    id:key,
                    youtube:link,
                    customSong:true,
                    public:true,
                    updatedAt:serverTimestamp(),
                    updatedBy:auth.currentUser?.email||""
                  }
                : {
                    id:key,
                    title:base.title||"",
                    artist:base.artist||"",
                    category:base.category||"",
                    language:base.language||"English",
                    key:base.key||"",
                    originalKey:base.originalKey||base.key||"",
                    file:base.file||"",
                    youtube:link,
                    // Mark this as metadata only so custom-song loaders do not
                    // mistake a built-in song for a user-created song.
                    customSong:true,
                    metadataOnly:true,
                    public:true,
                    updatedAt:serverTimestamp(),
                    updatedBy:auth.currentUser?.email||"",
                    updatedByUid:auth.currentUser?.uid||""
                  };
            await setDoc(doc(db,"songs",key),payload,{merge:true});
            adminYoutubeLinks.set(key,link);
            const local=staticSongs.find(s=>adminSongKey(s)===key);
            if(local)local.youtube=link;
            const custom=cachedAdminSongs.find(s=>adminSongKey(s)===key);
            if(custom)custom.youtube=link;
            btn.textContent="Saved ✓";
            setTimeout(()=>btn.textContent="Save",1200);
        }catch(error){
            console.error("Unable to save YouTube link:",error);
            alert("Unable to save the YouTube link. Please check your Firebase permissions.");
        }finally{btn.disabled=false;}
    }));
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
