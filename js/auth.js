// ─── Firebase Authentication Module ──────────
import { auth } from "../firebase/config.js";
import {
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword as _signInEmail,
  signOut,
  onAuthStateChanged,
  updateProfile,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const googleProvider = new GoogleAuthProvider();

// ── Auth state listener ───────────────────────
// Calls onSignedIn(user) or onSignedOut() once Firebase resolves.
export function initAuth(onSignedIn, onSignedOut, onError = console.error) {
  setPersistence(auth, browserLocalPersistence).catch(console.warn);
  return onAuthStateChanged(auth, user => {
    if (user) onSignedIn(user);
    else      onSignedOut();
  }, onError);
}

// ── Sign-in methods ───────────────────────────
export async function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export async function signInWithEmail(email, password) {
  return _signInEmail(auth, email, password);
}

export async function signUpWithEmail(email, password, displayName) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName?.trim()) {
    await updateProfile(cred.user, { displayName: displayName.trim() });
  }
  return cred;
}

// ── Sign-out (page reload clears all state) ───
export async function signOutUser() {
  await signOut(auth);
  location.reload();
}

// ── Current user helpers ──────────────────────
export function getCurrentUser() { return auth.currentUser; }

// ── Human-readable error messages ────────────
export function authErrorMessage(code) {
  const map = {
    "auth/user-not-found":        "No account found with this email.",
    "auth/wrong-password":        "Incorrect password. Please try again.",
    "auth/invalid-credential":    "Invalid email or password.",
    "auth/email-already-in-use":  "An account with this email already exists.",
    "auth/weak-password":         "Password must be at least 6 characters.",
    "auth/invalid-email":         "Please enter a valid email address.",
    "auth/popup-closed-by-user":  "Sign-in was cancelled.",
    "auth/popup-blocked":         "Popup blocked — please allow popups for this site.",
    "auth/network-request-failed":"Network error. Check your connection.",
    "auth/too-many-requests":     "Too many attempts. Please try again later.",
  };
  return map[code] || "Something went wrong. Please try again.";
}
