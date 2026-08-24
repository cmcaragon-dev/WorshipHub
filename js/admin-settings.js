
import { auth, db } from "./firebase.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const ADMIN = "jfcm.s07@gmail.com";

export async function loadSongPermission(){
 const user=auth.currentUser;
 if(!user) return false;
 if(user.email===ADMIN) return true;
 const snap=await getDoc(doc(db,"settings","songPermission"));
 return snap.exists() && snap.data().allowAddSongs===true;
}

export async function setSongPermission(value){
 if(auth.currentUser?.email!==ADMIN) throw new Error("Admin only");
 await setDoc(doc(db,"settings","songPermission"),{allowAddSongs:value});
}
