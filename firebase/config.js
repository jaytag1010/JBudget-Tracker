// ─────────────────────────────────────────────
//  Firebase Configuration
//  Replace the values below with your own project
//  from https://console.firebase.google.com
// ─────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, enableIndexedDbPersistence }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDQuzcseb6IZuShbWZB6XRQgM0FHxBpPI8",
  authDomain: "jbudtrack.firebaseapp.com",
  projectId: "jbudtrack",
  storageBucket: "jbudtrack.firebasestorage.app",
  messagingSenderId: "11019068359",
  appId: "1:11019068359:web:e681a8f588bb6873c26fe2"
};

const app = initializeApp(firebaseConfig);
export const db  = getFirestore(app);
export default app;

// Enable offline persistence (cache data when offline)
enableIndexedDbPersistence(db).catch(err => {
  if (err.code === 'failed-precondition') {
    console.warn("Offline persistence unavailable: multiple tabs open.");
  } else if (err.code === 'unimplemented') {
    console.warn("Offline persistence not supported in this browser.");
  }
});
