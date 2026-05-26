// ─── Budget Module ────────────────────────────
import {
  listenBudget, setTotalBudget, setCategoryBudget, deleteCategoryBudget
} from "../firebase/db.js";
import { openModal, closeModal, showToast, confirmDialog, setProgressBar } from "./ui.js";
import { formatCurrency, monthKey, monthLabel, expensesForMonth, groupByCategory, pct } from "./utils.js";
import { getCategories } from "./settings.js";

let currentMonthKey = monthKey();
let currentBudget   = null;
let currentExpenses = [];
let unsubBudget     = null;

// ── Init ─────────────────────────────────────
export function initBudgets(expenses) {
  currentExpenses = expenses;
  renderBudgetMonth();
  subscribeToBudget(currentMonthKey);
  bindBudgetEvents();
}

export function updateBudgetExpenses(expenses) {
  currentExpenses = expenses;
  renderBudgetPage();
}

// ── Month display ─────────────────────────────
function renderBudgetMonth() {
  const el = document.getElementById("budget-month-display");
  if (el) el.textContent = monthLabel(currentMonthKey);
}

// ── Subscribe to Firestore budget doc ─────────
function subscribeToBudget(key) {
  unsubBudget?.();
  unsubBudget = listenBudget(key, budget => {
    currentBudget = budget;
    renderBudgetPage();
  });
}

// ── Full page render ──────────────────────────
export function renderBudgetPage() {
  const budget   = currentBudget;
  const monthExp = expensesForMonth(currentExpenses, currentMonthKey);
  const totalSpent = monthExp.reduce((s, e) => s + Number(e.amount), 0);
  const total      = budget?.total || 0;
  const remaining  = total - totalSpent;

  // Overall card
  document.getElementById("budget-total-display").textContent  = formatCurrency(total);
  document.getElementById("budget-total-spent").textContent    = formatCurrency(totalSpent) + " spent";
  document.getElementById("budget-total-remaining").textContent = formatCurrency(Math.max(0, remaining)) + " left";

  const bar = document.getElementById("budget-overall-bar");
  if (bar) {
    const p = total > 0 ? Math.min(100, Math.round((totalSpent / total) * 100)) : 0;
    bar.style.width = p + "%";
    bar.className = "ob-bar" + (p >= 100 ? " danger" : p >= 75 ? " warn" : "");
  }

  // Category budget list
  renderCategoryBudgets(budget, monthExp);

  // Dashboard sync
  syncDashboardBudget(total, totalSpent, remaining);
}

function renderCategoryBudgets(budget, monthExp) {
  const el = document.getElementById("budget-list");
  if (!el) return;

  const cats     = getCategories();
  const catBudgs = budget?.categories || {};
  const spent    = groupByCategory(monthExp);

  if (!Object.keys(catBudgs).length) {
    el.innerHTML = '<p class="empty-msg">No category budgets set. Tap "+ Set Budget" to add one.</p>';
    return;
  }

  el.innerHTML = "";
  Object.entries(catBudgs).forEach(([catName, budgetAmt]) => {
    const catSpent = spent[catName] || 0;
    const remaining = budgetAmt - catSpent;
    const p = pct(catSpent, budgetAmt);
    const cat = cats.find(c => c.name === catName) || { icon: "📦", color: "#7c6cf7" };

    const card = document.createElement("div");
    card.className = "budget-cat-card";
    card.innerHTML = `
      <div class="bcc-header">
        <div class="bcc-left">
          <span class="bcc-icon">${cat.icon}</span>
          <span class="bcc-name">${catName}</span>
        </div>
        <div class="bcc-right">
          <div class="bcc-spent ${catSpent > budgetAmt ? "red" : catSpent / budgetAmt >= .75 ? "yellow" : ""}">
            ${formatCurrency(catSpent)}
          </div>
          <div class="bcc-budget">of ${formatCurrency(budgetAmt)}</div>
        </div>
      </div>
      <div class="bcc-bar-wrap">
        <div class="bcc-bar ${p >= 100 ? "danger" : p >= 75 ? "warn" : ""}" style="width:${p}%"></div>
      </div>
      <div class="bcc-footer">
        <span>${p}% used</span>
        <span class="${remaining < 0 ? "red" : "green"}">${remaining < 0 ? "Over by " + formatCurrency(Math.abs(remaining)) : formatCurrency(remaining) + " left"}</span>
      </div>
      <div class="bcc-actions">
        <button class="btn-edit-sm btn" data-edit="${catName}">Edit</button>
        <button class="btn-del-sm btn"  data-del="${catName}">Remove</button>
      </div>`;

    card.querySelector(`[data-edit]`).addEventListener("click", () => openEditCatBudget(catName, budgetAmt));
    card.querySelector(`[data-del]`).addEventListener("click",  () => handleDeleteCatBudget(catName));
    el.appendChild(card);

    // Warn alerts
    if (p >= 100) showOverspendBanner(catName, catSpent - budgetAmt);
  });
}

// ── Dashboard sync ────────────────────────────
function syncDashboardBudget(total, spent, remaining) {
  const remEl  = document.getElementById("dash-remaining");
  const totEl  = document.getElementById("dash-budget-total");
  const pctEl  = document.getElementById("dash-budget-pct");
  const barEl  = document.getElementById("dash-budget-bar");
  const spentEl = document.getElementById("dash-spent");

  if (remEl)  remEl.textContent  = formatCurrency(Math.max(0, remaining));
  if (totEl)  totEl.textContent  = formatCurrency(total);
  if (spentEl) spentEl.textContent = formatCurrency(spent);
  if (barEl && pctEl) setProgressBar(barEl, pctEl, spent, total);
}

// ── Overspend banners ─────────────────────────
function showOverspendBanner(catName, overage) {
  // Non-intrusive: just update toast once per category over limit
  // (would be noisy on every render, so we only surface via card colors)
  void catName; void overage;
}

// ── Category budget modal ─────────────────────
function openAddCatBudget() {
  document.getElementById("modal-cat-budget-title").textContent = "Set Category Budget";
  document.getElementById("cat-budget-form").reset();
  document.getElementById("cat-budget-id").value = "";
  populateCatSelect(null);
  openModal("modal-cat-budget");
}

function openEditCatBudget(catName, amount) {
  document.getElementById("modal-cat-budget-title").textContent = "Edit Category Budget";
  document.getElementById("cat-budget-id").value      = catName;
  document.getElementById("cat-budget-amount").value  = amount;
  populateCatSelect(catName);
  openModal("modal-cat-budget");
}

function populateCatSelect(selected) {
  const sel  = document.getElementById("cat-budget-category");
  const cats = getCategories();
  sel.innerHTML = '<option value="">Choose category…</option>';
  cats.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.name;
    opt.textContent = `${c.icon} ${c.name}`;
    if (c.name === selected) opt.selected = true;
    sel.appendChild(opt);
  });
}

async function handleDeleteCatBudget(catName) {
  const ok = await confirmDialog("Remove Budget", `Remove budget for "${catName}"?`);
  if (!ok) return;
  try {
    await deleteCategoryBudget(currentMonthKey, catName);
    showToast("Budget removed", "info");
  } catch { showToast("Error removing budget", "error"); }
}

// ── Bind events ───────────────────────────────
function bindBudgetEvents() {
  // Add category budget
  document.getElementById("add-cat-budget-btn")?.addEventListener("click", openAddCatBudget);

  // Category budget form submit
  document.getElementById("cat-budget-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const catName = document.getElementById("cat-budget-category").value;
    const amount  = parseFloat(document.getElementById("cat-budget-amount").value);
    if (!catName) { showToast("Choose a category", "error"); return; }
    if (!amount || amount <= 0) { showToast("Enter a valid amount", "error"); return; }
    try {
      await setCategoryBudget(currentMonthKey, catName, amount);
      showToast("Category budget saved");
      closeModal("modal-cat-budget");
    } catch { showToast("Error saving budget", "error"); }
  });

  // Edit total budget
  document.getElementById("edit-total-budget-btn")?.addEventListener("click", () => {
    document.getElementById("total-budget-amount").value = currentBudget?.total || "";
    openModal("modal-total-budget");
  });

  document.getElementById("total-budget-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const amount = parseFloat(document.getElementById("total-budget-amount").value);
    if (!amount || amount <= 0) { showToast("Enter a valid amount", "error"); return; }
    try {
      await setTotalBudget(currentMonthKey, amount);
      showToast("Monthly budget saved");
      closeModal("modal-total-budget");
    } catch { showToast("Error saving budget", "error"); }
  });
}
