// ─── App Entry Point ──────────────────────────
import { listenExpenses } from "../firebase/db.js";
import { navigateTo, initConfirmDialog, initModalBackdrops, closeAllModals, showToast } from "./ui.js";
import { initSettings, onCategoriesChanged } from "./settings.js";
import { initExpenseForm, openAddExpense, renderCategoryGrid } from "./expenses.js";
import { initBudgets, updateBudgetExpenses } from "./budgets.js";
import { initSavings } from "./savings.js";
import { initHistory, updateHistory } from "./history.js";
import { updateDashboard, initInsightsToggle } from "./dashboard.js";
import { initRecurring } from "./recurring.js";
import { updateFinancialExpenses } from "./financial.js";
import { initNotifications } from "./notifications.js";
import {
  initAuth, signInWithGoogle, signInWithEmail, signUpWithEmail,
  authErrorMessage,
} from "./auth.js";
import { renderUserProfile } from "./settings.js";

// ── Auth screen helpers ───────────────────────
function showAuthScreen() {
  document.getElementById("auth-screen")?.classList.remove("hidden");
}
function hideAuthScreen() {
  document.getElementById("auth-screen")?.classList.add("hidden");
}

// ── Loading screen ────────────────────────────
function dismissLoading() {
  const screen = document.getElementById("loading-screen");
  if (!screen) return;
  screen.classList.add("fade-out");
  setTimeout(() => screen.remove(), 500);
}

// ═══════════════════════════════════════════════
//  BOOT  ─ auth-first entry point
// ═══════════════════════════════════════════════
function boot() {
  // Bind auth form once (before auth state resolves)
  bindAuthForm();

  // Listen for auth state — Firebase resolves this quickly from cache
  initAuth(
    async (user) => {
      // ── Signed in ──
      hideAuthScreen();
      await initApp(user);
    },
    () => {
      // ── Signed out ──
      dismissLoading();
      showAuthScreen();
    }
  );
}

// ── Full app initialisation (runs after sign-in) ──
async function initApp(user) {
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

    listenExpenses(expenses => {
      updateDashboard(expenses);
      updateHistory(expenses);
      updateBudgetExpenses(expenses);
      updateFinancialExpenses(expenses);
    });

    onCategoriesChanged(() => renderCategoryGrid(null));
    renderUserProfile(user);
    dismissLoading();

  } catch (err) {
    console.error("Boot error:", err);
    document.getElementById("loading-screen").innerHTML = `
      <div class="loading-logo">
        <div class="loading-icon">⚠️</div>
        <h1>Connection Error</h1>
        <p style="max-width:280px;text-align:center;color:#a0a0b8">
          Could not reach Firebase.<br>
          Check your internet connection.
        </p>
        <button onclick="location.reload()"
          style="margin-top:16px;padding:12px 24px;background:#7c6cf7;color:#fff;
                 border:none;border-radius:10px;font-size:15px;cursor:pointer;font-weight:600">
          Retry
        </button>
      </div>`;
  }
}

// ═══════════════════════════════════════════════
//  AUTH FORM BINDING
// ═══════════════════════════════════════════════
function bindAuthForm() {
  let isSignUp = false;

  // ── Google sign-in ─────────────────────────
  document.getElementById("google-signin-btn")?.addEventListener("click", async () => {
    setAuthLoading(true);
    clearAuthError();
    try {
      await signInWithGoogle();
      // onAuthStateChanged fires → initApp runs automatically
    } catch (err) {
      showAuthError(authErrorMessage(err.code));
      setAuthLoading(false);
    }
  });

  // ── Toggle Sign In / Sign Up ────────────────
  document.getElementById("auth-toggle-btn")?.addEventListener("click", () => {
    isSignUp = !isSignUp;
    setAuthMode(isSignUp);
  });

  // ── Email form submit ───────────────────────
  document.getElementById("auth-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const email    = document.getElementById("auth-email").value.trim();
    const password = document.getElementById("auth-password").value;
    const name     = document.getElementById("auth-name")?.value.trim() || "";

    if (!email || !password) {
      showAuthError("Please fill in all fields.");
      return;
    }

    setAuthLoading(true);
    clearAuthError();

    try {
      if (isSignUp) {
        await signUpWithEmail(email, password, name);
      } else {
        await signInWithEmail(email, password);
      }
      // onAuthStateChanged fires → initApp runs automatically
    } catch (err) {
      showAuthError(authErrorMessage(err.code));
      setAuthLoading(false);
    }
  });
}

// ── Auth UI helpers ───────────────────────────
function setAuthMode(signup) {
  const title   = document.getElementById("auth-form-title");
  const nameRow = document.getElementById("auth-name-row");
  const submit  = document.getElementById("auth-submit-btn");
  const toggle  = document.getElementById("auth-toggle-btn");

  if (title)   title.textContent  = signup ? "Create Account"    : "Welcome Back";
  if (submit)  submit.textContent = signup ? "Create Account"    : "Sign In";
  if (toggle)  toggle.textContent = signup
    ? "Already have an account? Sign in"
    : "Don't have an account? Sign up";
  if (nameRow) nameRow.classList.toggle("hidden", !signup);
  clearAuthError();
}

function setAuthLoading(loading) {
  const btn = document.getElementById("auth-submit-btn");
  const ggl = document.getElementById("google-signin-btn");
  if (btn) { btn.disabled = loading; btn.textContent = loading ? "Please wait…" : btn.dataset.label || "Sign In"; }
  if (ggl) ggl.disabled = loading;
}

function showAuthError(msg) {
  const el = document.getElementById("auth-error");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
}

function clearAuthError() {
  const el = document.getElementById("auth-error");
  if (el) el.classList.add("hidden");
}

// ═══════════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════════
function bindNavigation() {
  document.querySelectorAll(".nav-item[data-page]").forEach(btn => {
    btn.addEventListener("click", () => navigateTo(btn.dataset.page));
  });

  document.getElementById("nav-add-btn")?.addEventListener("click", openAddExpense);
  document.getElementById("notification-btn")?.addEventListener("click", () => navigateTo("notifications"));
  document.getElementById("profile-btn")?.addEventListener("click", () => navigateTo("profile"));
  document.getElementById("settings-back-btn")?.addEventListener("click", () => navigateTo("dashboard"));

  document.querySelectorAll("[data-nav]").forEach(btn => {
    btn.addEventListener("click", () => navigateTo(btn.dataset.nav));
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeAllModals();
  });

  initSwipeToClose();
}

function initSwipeToClose() {
  let startY = 0;
  document.addEventListener("touchstart", e => {
    const sheet = e.target.closest(".modal-sheet");
    if (sheet) startY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener("touchend", e => {
    const sheet = e.target.closest(".modal-sheet");
    if (!sheet) return;
    if (e.changedTouches[0].clientY - startY > 80) {
      const modal = sheet.closest(".modal");
      if (modal) { modal.classList.remove("open"); document.body.style.overflow = ""; }
    }
  }, { passive: true });
}

// ── Start ─────────────────────────────────────
boot();
