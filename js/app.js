import {
  clearFirestoreListeners, listenExpenses, restartFirestoreListeners, setFirestoreConnectionObserver,
} from "../firebase/db.js";
import { reconnectFirebase } from "../firebase/config.js";
import {
  navigateTo, initializeNavigation, initConfirmDialog, initModalBackdrops,
  closeAllModals, showToast,
} from "./ui.js";
import { CORE_DATA_SOURCES, classifyFirebaseError, evaluateCoreData } from "./connectionState.js";
import { initSettings, onCategoriesChanged, onProfileChanged, renderUserProfile } from "./settings.js";
import { initExpenseForm, openAddExpense, renderCategoryGrid } from "./expenses.js";
import { initBudgets, updateBudgetExpenses } from "./budgets.js";
import { initSavings } from "./savings.js";
import { initHistory, updateHistory } from "./history.js";
import { updateDashboard, initInsightsToggle, initGreetingClock, setDashboardProfileName } from "./dashboard.js";
import { initRecurring } from "./recurring.js";
import { updateFinancialExpenses } from "./financial.js";
import { initNotifications } from "./notifications.js";
import {
  initAuth, signInWithGoogle, signInWithEmail, signUpWithEmail,
  authErrorMessage, signOutUser,
} from "./auth.js";

let currentUser = null;
let initializedUserId = null;
let initialDataReady = false;
let navigationInitialized = false;
let retrying = false;
let initialLoadTimer = null;
const coreSnapshots = new Map();

function showAuthScreen() {
  document.getElementById("auth-screen")?.classList.remove("hidden");
}

function hideAuthScreen() {
  document.getElementById("auth-screen")?.classList.add("hidden");
}

function dismissLoading() {
  document.getElementById("loading-screen")?.classList.add("fade-out");
}

function showInitializing(message = "Loading your SpendWise data...") {
  const screen = document.getElementById("loading-screen");
  if (!screen) return;
  screen.classList.remove("fade-out");
  screen.innerHTML = `
    <div class="splash-bg-glow"></div>
    <div class="loading-logo">
      <div class="splash-icon-wrap"><img src="icons/icon-192.png" alt="SpendWise" class="splash-icon-img"></div>
      <h1 class="splash-title">SpendWise</h1>
      <p class="loading-state-message">${message}</p>
      <div class="splash-spinner-wrap"><div class="splash-spinner"></div></div>
    </div>`;
}

function showBlockingState(state) {
  const screen = document.getElementById("loading-screen");
  if (!screen) return;
  screen.classList.remove("fade-out");
  screen.innerHTML = `
    <div class="loading-logo">
      <div class="loading-icon" aria-hidden="true">⚠</div>
      <h1>${state.title}</h1>
      <p class="loading-state-message">${state.message}</p>
      ${state.retryable ? '<button type="button" class="loading-retry-btn" id="loading-retry-btn">Retry Connection</button>' : ""}
      ${state.reauthenticate ? '<button type="button" class="loading-retry-btn" id="loading-signin-btn">Sign In Again</button>' : ""}
    </div>`;
  document.getElementById("loading-retry-btn")?.addEventListener("click", retryConnection);
  document.getElementById("loading-signin-btn")?.addEventListener("click", async event => {
    event.currentTarget.disabled = true;
    event.currentTarget.textContent = "Signing Out...";
    try {
      clearFirestoreListeners();
      await signOutUser();
    } catch (error) {
      console.error("Could not reset the authentication session:", error);
      event.currentTarget.disabled = false;
      event.currentTarget.textContent = "Sign In Again";
    }
  });
}

function showConnectionBanner(message, error = false) {
  const banner = document.getElementById("connection-banner");
  if (!banner) return;
  document.getElementById("connection-banner-message").textContent = message;
  banner.classList.remove("hidden");
  banner.classList.toggle("error", error);
}

function hideConnectionBanner() {
  document.getElementById("connection-banner")?.classList.add("hidden");
}

function handleFirestoreData(snapshot) {
  coreSnapshots.set(snapshot.source, snapshot);
  const state = evaluateCoreData(coreSnapshots, navigator.onLine);
  if (state.mode === "online") {
    clearTimeout(initialLoadTimer);
    initialDataReady = true;
    retrying = false;
    hideConnectionBanner();
    dismissLoading();
  } else if (state.mode === "offline-cache") {
    clearTimeout(initialLoadTimer);
    initialDataReady = true;
    retrying = false;
    dismissLoading();
    showConnectionBanner("You are offline. Showing saved data that may be outdated.");
  } else if (state.mode === "offline-empty") {
    showBlockingState({
      title: "Offline with no saved data",
      message: "Reconnect to load your SpendWise account. No empty values will be treated as real data.",
      retryable: true,
    });
  } else if (!initialDataReady && state.mode === "syncing") {
    showInitializing("Connecting to Firebase and verifying your saved data...");
  }
}

function handleFirestoreError({ source, error }) {
  clearTimeout(initialLoadTimer);
  console.error(`Firestore listener failed (${source}):`, error);
  const state = classifyFirebaseError(error, navigator.onLine);
  retrying = false;
  if (!CORE_DATA_SOURCES.includes(source) && source !== "retry") {
    showConnectionBanner(`${state.title}. Some optional data may be unavailable.`, true);
  } else if (initialDataReady) {
    showConnectionBanner(`${state.title}. ${state.message}`, true);
  } else {
    showBlockingState(state);
  }
}

async function retryConnection() {
  if (retrying || !currentUser) return;
  retrying = true;
  if (!initialDataReady) showInitializing("Retrying Firebase connection...");
  else showConnectionBanner("Reconnecting to Firebase...");
  try {
    coreSnapshots.clear();
    await reconnectFirebase();
    restartFirestoreListeners();
    showConnectionBanner("Connected. Waiting for fresh data...");
  } catch (error) {
    handleFirestoreError({ source: "retry", error });
  } finally {
    retrying = false;
  }
}

function boot() {
  bindAuthForm();
  document.getElementById("connection-retry-btn")?.addEventListener("click", retryConnection);
  window.addEventListener("offline", () => {
    if (!currentUser) return;
    const state = evaluateCoreData(coreSnapshots, false);
    if (initialDataReady || state.mode === "offline-cache") {
      showConnectionBanner("You are offline. Showing saved data that may be outdated.");
    } else {
      showBlockingState({
        title: "Offline with no saved data",
        message: "Reconnect to load your SpendWise account. No empty values will be treated as real data.",
        retryable: true,
      });
    }
  });
  window.addEventListener("online", () => currentUser && retryConnection());
  registerServiceWorker();
  setFirestoreConnectionObserver({ onData: handleFirestoreData, onError: handleFirestoreError });

  initAuth(
    async user => {
      hideAuthScreen();
      await initApp(user);
    },
    () => {
      currentUser = null;
      initializedUserId = null;
      initialDataReady = false;
      coreSnapshots.clear();
      clearFirestoreListeners();
      hideConnectionBanner();
      dismissLoading();
      showAuthScreen();
    },
    error => {
      console.error("Authentication initialization failed:", error);
      showBlockingState(classifyFirebaseError(error, navigator.onLine));
    }
  );
}

async function initApp(user) {
  if (initializedUserId === user.uid) return;
  if (initializedUserId && initializedUserId !== user.uid) {
    location.reload();
    return;
  }
  currentUser = user;
  initializedUserId = user.uid;
  initialDataReady = false;
  coreSnapshots.clear();
  showInitializing("Loading your authenticated SpendWise data...");
  clearTimeout(initialLoadTimer);
  initialLoadTimer = setTimeout(() => {
    if (!initialDataReady) {
      showBlockingState({
        title: "Firebase is taking too long",
        message: "SpendWise has not received verified account data yet. Check your connection and retry.",
        retryable: true,
      });
    }
  }, 15000);

  try {
    await initSettings();
    initConfirmDialog();
    initModalBackdrops();
    initExpenseForm();
    bindNavigation();
    initHistory();
    await initSavings();
    initBudgets([]);
    initRecurring();
    initNotifications();
    initInsightsToggle();
    initGreetingClock();

    listenExpenses(expenses => {
      updateDashboard(expenses);
      updateHistory(expenses);
      updateBudgetExpenses(expenses);
      updateFinancialExpenses(expenses);
    });

    onCategoriesChanged(() => renderCategoryGrid(null));
    onProfileChanged(setDashboardProfileName);
    renderUserProfile(user);
    if (!navigationInitialized) {
      navigationInitialized = true;
      initializeNavigation();
    }
  } catch (error) {
    console.error("SpendWise initialization failed:", error);
    showBlockingState(classifyFirebaseError(error, navigator.onLine));
  }
}

function bindAuthForm() {
  let isSignUp = false;
  document.getElementById("google-signin-btn")?.addEventListener("click", async () => {
    setAuthLoading(true);
    clearAuthError();
    try { await signInWithGoogle(); }
    catch (error) {
      showAuthError(authErrorMessage(error.code));
      setAuthLoading(false);
    }
  });
  document.getElementById("auth-toggle-btn")?.addEventListener("click", () => {
    isSignUp = !isSignUp;
    setAuthMode(isSignUp);
  });
  document.getElementById("auth-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const email = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-password").value;
    const name = document.getElementById("auth-name")?.value.trim() || "";
    if (!email || !password) return showAuthError("Please fill in all fields.");
    setAuthLoading(true);
    clearAuthError();
    try {
      if (isSignUp) await signUpWithEmail(email, password, name);
      else await signInWithEmail(email, password);
    } catch (error) {
      showAuthError(authErrorMessage(error.code));
      setAuthLoading(false);
    }
  });
}

function setAuthMode(signup) {
  const title = document.getElementById("auth-form-title");
  const nameRow = document.getElementById("auth-name-row");
  const submit = document.getElementById("auth-submit-btn");
  const toggle = document.getElementById("auth-toggle-btn");
  if (title) title.textContent = signup ? "Create Account" : "Welcome Back";
  if (submit) submit.textContent = signup ? "Create Account" : "Sign In";
  if (toggle) toggle.textContent = signup ? "Already have an account? Sign in" : "Don't have an account? Sign up";
  if (nameRow) nameRow.classList.toggle("hidden", !signup);
  clearAuthError();
}

function setAuthLoading(loading) {
  const button = document.getElementById("auth-submit-btn");
  const google = document.getElementById("google-signin-btn");
  if (button) { button.disabled = loading; button.textContent = loading ? "Please wait..." : "Sign In"; }
  if (google) google.disabled = loading;
}

function showAuthError(message) {
  const element = document.getElementById("auth-error");
  if (!element) return;
  element.textContent = message;
  element.classList.remove("hidden");
}

function clearAuthError() {
  document.getElementById("auth-error")?.classList.add("hidden");
}

function bindNavigation() {
  document.querySelectorAll(".nav-item[data-page]").forEach(button => {
    button.addEventListener("click", () => navigateTo(button.dataset.page));
  });
  document.getElementById("nav-add-btn")?.addEventListener("click", openAddExpense);
  document.getElementById("notification-btn")?.addEventListener("click", () => navigateTo("notifications"));
  document.getElementById("budget-settings-btn")?.addEventListener("click", () => navigateTo("settings"));
  document.getElementById("profile-btn")?.addEventListener("click", () => navigateTo("profile"));
  document.getElementById("settings-back-btn")?.addEventListener("click", () => navigateTo("dashboard"));
  document.querySelectorAll("[data-nav]").forEach(button => {
    button.addEventListener("click", () => navigateTo(button.dataset.nav));
  });
  document.addEventListener("keydown", event => event.key === "Escape" && closeAllModals());
  initSwipeToClose();
}

function initSwipeToClose() {
  let startY = 0;
  document.addEventListener("touchstart", event => {
    if (event.target.closest(".modal-sheet")) startY = event.touches[0].clientY;
  }, { passive: true });
  document.addEventListener("touchend", event => {
    const sheet = event.target.closest(".modal-sheet");
    if (!sheet || event.changedTouches[0].clientY - startY <= 80) return;
    const modal = sheet.closest(".modal");
    if (modal) {
      modal.classList.remove("open");
      document.body.style.overflow = "";
    }
  }, { passive: true });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  if (sessionStorage.getItem("spendwise-sw-reloaded") === "1") {
    sessionStorage.removeItem("spendwise-sw-reloaded");
  }
  window.addEventListener("load", async () => {
    try {
      const hadController = Boolean(navigator.serviceWorker.controller);
      const registration = await navigator.serviceWorker.register("/service-worker.js");
      if (hadController) {
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (sessionStorage.getItem("spendwise-sw-reloaded") === "1") return;
          sessionStorage.setItem("spendwise-sw-reloaded", "1");
          location.reload();
        }, { once: true });
      }
      await registration.update();
    } catch (error) {
      console.warn("Service worker registration unavailable:", error);
    }
  });
}

boot();
