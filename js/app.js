// ─── App Entry Point ──────────────────────────
import { listenExpenses } from "../firebase/db.js";
import { navigateTo, initConfirmDialog, initModalBackdrops, closeAllModals, showToast } from "./ui.js";
import { initSettings, onCategoriesChanged } from "./settings.js";
import { initExpenseForm, openAddExpense, renderCategoryGrid, renderPaymentChips } from "./expenses.js";
import { initBudgets, updateBudgetExpenses } from "./budgets.js";
import { initSavings } from "./savings.js";
import { initHistory, updateHistory } from "./history.js";
import { updateDashboard } from "./dashboard.js";

// ── Boot ──────────────────────────────────────
async function boot() {
  try {
    // 1. Init settings (seeds defaults, starts listeners)
    await initSettings();

    // 2. Init UI scaffolding
    initConfirmDialog();
    initModalBackdrops();
    initExpenseForm();
    bindNavigation();

    // 3. Init page-specific modules
    initHistory();
    await initSavings();
    initBudgets([]);

    // 4. Start real-time expense listener
    listenExpenses(expenses => {
      updateDashboard(expenses);
      updateHistory(expenses);
      updateBudgetExpenses(expenses);
    });

    // 5. Re-render expense form grids when categories/methods change
    onCategoriesChanged(() => renderCategoryGrid(null));

    // 6. Hide loading screen
    dismissLoading();

  } catch (err) {
    console.error("Boot error:", err);
    document.getElementById("loading-screen").innerHTML = `
      <div class="loading-logo">
        <div class="loading-icon">⚠️</div>
        <h1>Connection Error</h1>
        <p style="max-width:280px;text-align:center;color:#a0a0b8">
          Could not connect to Firebase.<br>
          Please check your internet connection and Firebase config in
          <code>firebase/config.js</code>.
        </p>
        <button onclick="location.reload()" style="margin-top:16px;padding:12px 24px;background:#7c6cf7;color:#fff;border:none;border-radius:10px;font-size:15px;cursor:pointer;font-weight:600">
          Retry
        </button>
      </div>`;
  }
}

function dismissLoading() {
  const screen = document.getElementById("loading-screen");
  screen.classList.add("fade-out");
  setTimeout(() => screen.remove(), 500);
}

// ── Navigation ────────────────────────────────
function bindNavigation() {
  // Bottom nav buttons
  document.querySelectorAll(".nav-item[data-page]").forEach(btn => {
    btn.addEventListener("click", () => navigateTo(btn.dataset.page));
  });

  // FAB (+ add expense)
  document.getElementById("nav-add-btn")?.addEventListener("click", openAddExpense);

  // Dashboard → Settings
  document.getElementById("settings-btn")?.addEventListener("click", () => navigateTo("settings"));

  // Settings back button
  document.getElementById("settings-back-btn")?.addEventListener("click", () => navigateTo("dashboard"));

  // "View All" link buttons
  document.querySelectorAll("[data-nav]").forEach(btn => {
    btn.addEventListener("click", () => navigateTo(btn.dataset.nav));
  });

  // Keyboard shortcut: Escape closes modals
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeAllModals();
  });

  // Swipe-to-close on modal sheets (touch)
  initSwipeToClose();
}

// ── Swipe down to close bottom sheets ─────────
function initSwipeToClose() {
  let startY = 0;
  document.addEventListener("touchstart", e => {
    const sheet = e.target.closest(".modal-sheet");
    if (sheet) startY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener("touchend", e => {
    const sheet = e.target.closest(".modal-sheet");
    if (!sheet) return;
    const dy = e.changedTouches[0].clientY - startY;
    if (dy > 80) {
      const modal = sheet.closest(".modal");
      if (modal) {
        modal.classList.remove("open");
        document.body.style.overflow = "";
      }
    }
  }, { passive: true });
}

// ── Start ─────────────────────────────────────
boot();
