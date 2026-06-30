// ─── Budget Module ────────────────────────────
import {
  listenAllBudgets, setTotalBudget, setCategoryBudget, deleteCategoryBudget
} from "../firebase/db.js";
import {
  openModal, closeModal, showToast, confirmDialog, setProgressBar,
  navigateTo, updateCurrentNavigationState,
} from "./ui.js";
import { formatCurrency, monthKey, monthLabel, expensesForMonth, groupByCategory, pct } from "./utils.js";
import { getCategories } from "./settings.js";
import { updateFinancialBudgets } from "./financial.js";
import { notifySystem } from "./notifications.js";

let currentMonthKey  = monthKey();
let allBudgets       = [];   // all budget docs, sorted asc by id (YYYY-MM)
let currentExpenses  = [];
let unsubAllBudgets  = null;
let isAnnualMode     = false;

// ── Init ─────────────────────────────────────
export function initBudgets(expenses) {
  currentExpenses = expenses;
  renderBudgetMonth();
  subscribeToAllBudgets();
  bindBudgetEvents();
  document.addEventListener("spendwise:navigation", event => {
    if (event.detail?.page !== "budgets" || !event.detail.state?.budgetMode) return;
    setBudgetMode(event.detail.state.budgetMode === "annual");
  });
}

export function updateBudgetExpenses(expenses) {
  currentExpenses = expenses;
  renderBudgetPage();
}

// ── Month display label ───────────────────────
function renderBudgetMonth() {
  const el = document.getElementById("budget-month-display");
  if (el) el.textContent = monthLabel(currentMonthKey);
}

// ── Subscribe to all budget docs ──────────────
function subscribeToAllBudgets() {
  unsubAllBudgets?.();
  unsubAllBudgets = listenAllBudgets(budgets => {
    allBudgets = budgets;
    updateFinancialBudgets(budgets);
    renderBudgetPage();
  });
}

// ── Carry-forward: most recent budget doc ≤ key ─
function getEffectiveBudget(key) {
  const eligible = allBudgets.filter(b => b.id <= key);
  return eligible.length ? eligible[eligible.length - 1] : null;
}

// ── Is this month fully in the past? ─────────
function isPastMonth(key) {
  return key < monthKey();
}

// ── Router: monthly vs annual ─────────────────
export function renderBudgetPage() {
  if (isAnnualMode) {
    renderAnnualBudgetPage();
  } else {
    renderMonthlyBudgetPage();
  }
}

// ════════════════════════════════════════════
//  MONTHLY MODE
// ════════════════════════════════════════════
function renderMonthlyBudgetPage() {
  const budget     = getEffectiveBudget(currentMonthKey);
  const monthExp   = expensesForMonth(currentExpenses, currentMonthKey);
  const totalSpent = monthExp.reduce((s, e) => s + Number(e.amount), 0);
  const total      = budget?.total || 0;
  const remaining  = total - totalSpent;
  const locked     = isPastMonth(currentMonthKey);

  const labelEl = document.getElementById("budget-period-label");
  if (labelEl) labelEl.textContent = "Monthly Budget";

  document.getElementById("budget-total-display").textContent   = formatCurrency(total);
  document.getElementById("budget-total-spent").textContent     = formatCurrency(totalSpent) + " spent";
  document.getElementById("budget-total-remaining").textContent = remaining < 0
    ? formatCurrency(remaining) + " remaining"
    : formatCurrency(remaining) + " left";

  const bar = document.getElementById("budget-overall-bar");
  if (bar) {
    const p = total > 0 ? Math.min(100, Math.round((totalSpent / total) * 100)) : 0;
    bar.style.width = p + "%";
    bar.className   = "ob-bar" + (p >= 100 ? " danger" : p >= 75 ? " warn" : "");
  }

  toggleAnnualUI(false, locked);
  renderAllocationRow(budget);
  renderMonthlyCategoryBudgets(budget, monthExp, locked);
  syncDashboardBudget(total, totalSpent, remaining);
}

// ── Allocated / Remaining allocation row ──────
function renderAllocationRow(budget) {
  const el = document.getElementById("budget-allocation-row");
  if (!el) return;

  const cats      = budget?.categories || {};
  const total     = budget?.total || 0;
  const allocated = Object.values(cats).reduce((s, v) => s + v, 0);
  const leftover  = total - allocated;

  if (total === 0 && allocated === 0) { el.classList.add("hidden"); return; }
  el.classList.remove("hidden");

  const allocEl  = document.getElementById("budget-allocated-amt");
  const remainEl = document.getElementById("budget-alloc-remaining");
  if (allocEl)  allocEl.textContent  = formatCurrency(allocated);
  if (remainEl) remainEl.textContent = formatCurrency(leftover);

  const allocBar = document.getElementById("budget-alloc-bar");
  if (allocBar && total > 0) {
    const p = Math.min(100, Math.round((allocated / total) * 100));
    allocBar.style.width = p + "%";
    allocBar.className   = "alloc-bar" + (p >= 100 ? " danger" : p >= 75 ? " warn" : "");
  }
}

// ── Category budget cards (monthly, sortable) ─
function renderMonthlyCategoryBudgets(budget, monthExp, locked) {
  const el = document.getElementById("budget-list");
  if (!el) return;

  const cats     = getCategories();
  const catBudgs = budget?.categories || {};
  const spent    = groupByCategory(monthExp);

  if (!Object.keys(catBudgs).length) {
    el.innerHTML = '<p class="empty-msg">No category budgets set. Tap "+ Set Budget" to add one.</p>';
    return;
  }

  // Sort highest → lowest budget
  const sorted = Object.entries(catBudgs).sort(([, a], [, b]) => b - a);

  el.innerHTML = "";
  sorted.forEach(([catName, budgetAmt]) => {
    const catSpent  = spent[catName] || 0;
    const remaining = budgetAmt - catSpent;
    const p         = pct(catSpent, budgetAmt);
    const cat       = cats.find(c => c.name === catName) || { icon: "📦", color: "#7c6cf7" };

    const card = document.createElement("div");
    card.className = "budget-cat-card";
    makeBudgetCardInteractive(card, catName, false);
    card.innerHTML = `
      <div class="bcc-header">
        <div class="bcc-left">
          <span class="bcc-icon">${cat.icon}</span>
          <span class="bcc-name">${catName}</span>
          ${locked ? '<span class="bcc-locked-badge">🔒 Locked</span>' : ""}
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
        <span class="${remaining < 0 ? "red" : "green"}">${remaining < 0
          ? "Over by " + formatCurrency(Math.abs(remaining))
          : formatCurrency(remaining) + " left"}</span>
      </div>
      ${!locked ? `<div class="bcc-actions">
        <button class="btn-edit-sm btn" data-edit="${catName}">Edit</button>
        <button class="btn-del-sm btn"  data-del="${catName}">Remove</button>
      </div>` : ""}`;

    if (!locked) {
      card.querySelector("[data-edit]").addEventListener("click", event => {
        event.stopPropagation();
        openEditCatBudget(catName, budgetAmt);
      });
      card.querySelector("[data-del]").addEventListener("click", event => {
        event.stopPropagation();
        handleDeleteCatBudget(catName);
      });
    }
    el.appendChild(card);
  });
}

// ════════════════════════════════════════════
//  ANNUAL MODE  — historical + projected
// ════════════════════════════════════════════

function calculateAnnualTotals() {
  const year    = new Date().getFullYear();
  let annualTotal = 0;
  const catAnnual = {};

  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, "0")}`;
    const eff = getEffectiveBudget(key);
    if (!eff) continue;
    annualTotal += (eff.total || 0);
    Object.entries(eff.categories || {}).forEach(([cat, amt]) => {
      catAnnual[cat] = (catAnnual[cat] || 0) + amt;
    });
  }
  return { annualTotal, catAnnual };
}

function renderAnnualBudgetPage() {
  const year = new Date().getFullYear();
  const { annualTotal, catAnnual } = calculateAnnualTotals();

  const yearExp    = currentExpenses.filter(e => {
    const d = e.date?.toDate ? e.date.toDate() : new Date(e.date);
    return d.getFullYear() === year;
  });
  const totalSpent = yearExp.reduce((s, e) => s + Number(e.amount), 0);
  const remaining  = annualTotal - totalSpent;

  const labelEl = document.getElementById("budget-period-label");
  if (labelEl) labelEl.textContent = `Annual Budget (${year})`;

  document.getElementById("budget-total-display").textContent   = formatCurrency(annualTotal);
  document.getElementById("budget-total-spent").textContent     = formatCurrency(totalSpent) + " spent";
  document.getElementById("budget-total-remaining").textContent = remaining < 0
    ? formatCurrency(remaining) + " remaining"
    : formatCurrency(remaining) + " left";

  const bar = document.getElementById("budget-overall-bar");
  if (bar) {
    const p = annualTotal > 0 ? Math.min(100, Math.round((totalSpent / annualTotal) * 100)) : 0;
    bar.style.width = p + "%";
    bar.className   = "ob-bar" + (p >= 100 ? " danger" : p >= 75 ? " warn" : "");
  }

  const noteEl = document.getElementById("budget-annual-note");
  if (noteEl) {
    const latest = getEffectiveBudget(monthKey());
    noteEl.textContent = latest?.total
      ? `Historical budgets + ${formatCurrency(latest.total)}/mo for future months — read-only view`
      : "Set a monthly budget first to see the annual projection.";
  }

  toggleAnnualUI(true, false);

  const allocEl = document.getElementById("budget-allocation-row");
  if (allocEl) allocEl.classList.add("hidden");

  renderAnnualCategoryBudgets(yearExp, catAnnual);
}

function renderAnnualCategoryBudgets(yearExp, catAnnual) {
  const el = document.getElementById("budget-list");
  if (!el) return;

  const cats  = getCategories();
  const spent = groupByCategory(yearExp);

  if (!Object.keys(catAnnual).length) {
    el.innerHTML = '<p class="empty-msg">No category budgets set. Switch to Monthly view to add budgets.</p>';
    return;
  }

  const sorted = Object.entries(catAnnual).sort(([, a], [, b]) => b - a);

  el.innerHTML = "";
  sorted.forEach(([catName, annualBudget]) => {
    const catSpent  = spent[catName] || 0;
    const remaining = annualBudget - catSpent;
    const p         = pct(catSpent, annualBudget);
    const cat       = cats.find(c => c.name === catName) || { icon: "📦", color: "#7c6cf7" };

    const card = document.createElement("div");
    card.className = "budget-cat-card";
    makeBudgetCardInteractive(card, catName, true);
    card.innerHTML = `
      <div class="bcc-header">
        <div class="bcc-left">
          <span class="bcc-icon">${cat.icon}</span>
          <span class="bcc-name">${catName}</span>
          <span class="bcc-annual-badge">Annual</span>
        </div>
        <div class="bcc-right">
          <div class="bcc-spent ${catSpent > annualBudget ? "red" : catSpent / annualBudget >= .75 ? "yellow" : ""}">
            ${formatCurrency(catSpent)}
          </div>
          <div class="bcc-budget">of ${formatCurrency(annualBudget)}</div>
        </div>
      </div>
      <div class="bcc-bar-wrap">
        <div class="bcc-bar ${p >= 100 ? "danger" : p >= 75 ? "warn" : ""}" style="width:${p}%"></div>
      </div>
      <div class="bcc-footer">
        <span>${p}% used</span>
        <span class="${remaining < 0 ? "red" : "green"}">${remaining < 0
          ? "Over by " + formatCurrency(Math.abs(remaining))
          : formatCurrency(remaining) + " left"}</span>
      </div>`;
    el.appendChild(card);
  });
}

function makeBudgetCardInteractive(card, category, annual) {
  const [year, month] = currentMonthKey.split("-").map(Number);
  const label = annual
    ? `View ${category} expenses for ${new Date().getFullYear()}`
    : `View ${category} expenses for ${monthLabel(currentMonthKey)}`;
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", label);
  const open = () => {
    const mode = annual ? "annual" : "monthly";
    updateCurrentNavigationState({ page: "budgets", budgetMode: mode });
    navigateTo("history", {
      filters: {
        category,
        year: annual ? new Date().getFullYear() : year,
        month: annual ? "" : month,
      },
      state: { fromPage: "budgets", budgetMode: mode },
    });
  };
  card.addEventListener("click", open);
  card.addEventListener("keydown", event => {
    if ((event.key === "Enter" || event.key === " ") && event.target === card) {
      event.preventDefault();
      open();
    }
  });
}

function setBudgetMode(annual) {
  isAnnualMode = annual;
  document.getElementById("budget-monthly-tab")?.classList.toggle("active", !annual);
  document.getElementById("budget-annual-tab")?.classList.toggle("active", annual);
  document.getElementById("budget-monthly-tab")?.setAttribute("aria-pressed", String(!annual));
  document.getElementById("budget-annual-tab")?.setAttribute("aria-pressed", String(annual));
  renderBudgetPage();
}

// ── Toggle UI visibility for annual/locked mode ─
function toggleAnnualUI(isAnnual, locked) {
  const editBtn    = document.getElementById("edit-total-budget-btn");
  const addCatBtn  = document.getElementById("add-cat-budget-btn");
  const annualNote = document.getElementById("budget-annual-note");

  if (editBtn)    editBtn.style.visibility   = (isAnnual || locked) ? "hidden" : "visible";
  if (addCatBtn)  addCatBtn.style.visibility = (isAnnual || locked) ? "hidden" : "visible";
  if (annualNote) annualNote.classList.toggle("hidden", !isAnnual);
}

// ── Dashboard sync (monthly only) ─────────────
function syncDashboardBudget(total, spent, remaining) {
  const remEl   = document.getElementById("dash-remaining");
  const totEl   = document.getElementById("dash-budget-total");
  const pctEl   = document.getElementById("dash-budget-pct");
  const barEl   = document.getElementById("dash-budget-bar");
  const spentEl = document.getElementById("dash-spent");

  if (remEl) {
    remEl.textContent = formatCurrency(remaining);
    remEl.classList.toggle("negative", remaining < 0);
  }
  if (totEl)   totEl.textContent   = formatCurrency(total);
  if (spentEl) spentEl.textContent = formatCurrency(spent);
  if (barEl && pctEl) setProgressBar(barEl, pctEl, spent, total);
}

// ── Category budget modals ────────────────────
function openAddCatBudget() {
  document.getElementById("modal-cat-budget-title").textContent = "Set Category Budget";
  document.getElementById("cat-budget-form").reset();
  document.getElementById("cat-budget-id").value = "";
  populateCatSelect(null);
  openModal("modal-cat-budget");
}

function openEditCatBudget(catName, amount) {
  document.getElementById("modal-cat-budget-title").textContent = "Edit Category Budget";
  document.getElementById("cat-budget-id").value     = catName;
  document.getElementById("cat-budget-amount").value = amount;
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

// ── Budget Exceed Warning ─────────────────────
function showBudgetExceedModal(monthlyTotal, newAllocation) {
  return new Promise(resolve => {
    const excess = newAllocation - monthlyTotal;
    document.getElementById("exceed-monthly-total").textContent  = formatCurrency(monthlyTotal);
    document.getElementById("exceed-new-allocation").textContent = formatCurrency(newAllocation);
    document.getElementById("exceed-excess").textContent         = formatCurrency(excess);

    const adjustBtn = document.getElementById("exceed-adjust-btn");
    const cancelBtn = document.getElementById("exceed-cancel-btn");

    function cleanup(val) {
      closeModal("modal-budget-exceed");
      resolve(val);
    }

    adjustBtn.onclick = () => cleanup("adjust");
    cancelBtn.onclick = () => cleanup("cancel");

    openModal("modal-budget-exceed");
  });
}

// ── Budget Timeline ───────────────────────────
function openBudgetTimeline() {
  const el = document.getElementById("budget-timeline-list");
  if (!el) return;

  if (!allBudgets.length) {
    el.innerHTML = '<p class="empty-msg">No budget history yet. Set a monthly budget to get started.</p>';
    openModal("modal-budget-timeline");
    return;
  }

  el.innerHTML = "";

  allBudgets.forEach((budget, i) => {
    const prevBudget = i > 0 ? allBudgets[i - 1] : null;
    const nextBudget = allBudgets[i + 1] || null;

    // Compute coverage end label
    let coverEnd = "onwards";
    if (nextBudget) {
      const [yr, mo] = nextBudget.id.split("-").map(Number);
      const d = new Date(yr, mo - 2, 1); // month before next entry
      coverEnd = d.toLocaleDateString("en-PH", { month: "long", year: "numeric" });
    }

    // Change badge
    let changeTag = "";
    if (!prevBudget) {
      changeTag = '<span class="timeline-badge initial">Initial</span>';
    } else {
      const diff = (budget.total || 0) - (prevBudget.total || 0);
      if (diff !== 0) {
        const sign = diff > 0 ? "+" : "−";
        changeTag = `<span class="timeline-badge ${diff > 0 ? "up" : "down"}">${sign}${formatCurrency(Math.abs(diff))}</span>`;
      }
    }

    // Category chips
    const catEntries = Object.entries(budget.categories || {}).sort(([, a], [, b]) => b - a);
    const catChips   = catEntries.map(([cat, amt]) =>
      `<span class="timeline-cat-chip">${cat}: ${formatCurrency(amt)}</span>`
    ).join("");

    const entry = document.createElement("div");
    entry.className = "timeline-entry" + (isPastMonth(budget.id) ? " past" : "");
    entry.innerHTML = `
      <div class="timeline-dot"></div>
      <div class="timeline-content">
        <div class="timeline-month-row">
          <span class="timeline-month">${monthLabel(budget.id)}</span>
          ${changeTag}
        </div>
        <div class="timeline-budget-amt">${formatCurrency(budget.total || 0)}</div>
        <div class="timeline-covers">Covers: ${monthLabel(budget.id)} – ${coverEnd}</div>
        ${catChips ? `<div class="timeline-cats">${catChips}</div>` : ""}
      </div>`;
    el.appendChild(entry);
  });

  openModal("modal-budget-timeline");
}

// ── Bind all budget page events ───────────────
function bindBudgetEvents() {

  // Monthly / Annual toggle
  document.getElementById("budget-monthly-tab")?.addEventListener("click", () => {
    if (!isAnnualMode) return;
    setBudgetMode(false);
  });

  document.getElementById("budget-annual-tab")?.addEventListener("click", () => {
    if (isAnnualMode) return;
    setBudgetMode(true);
  });

  // Calendar icon → Budget Timeline
  document.getElementById("budget-month-btn")?.addEventListener("click", openBudgetTimeline);

  // Add category budget
  document.getElementById("add-cat-budget-btn")?.addEventListener("click", openAddCatBudget);

  // Category budget form submit
  document.getElementById("cat-budget-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const catName = document.getElementById("cat-budget-category").value;
    const amount  = parseFloat(document.getElementById("cat-budget-amount").value);
    if (!catName)              { showToast("Choose a category", "error"); return; }
    if (!amount || amount <= 0){ showToast("Enter a valid amount", "error"); return; }

    // Check budget exceed
    const effective     = getEffectiveBudget(currentMonthKey);
    const monthlyTotal  = effective?.total || 0;
    const existingCats  = { ...(effective?.categories || {}) };
    existingCats[catName] = amount;
    const newAllocation = Object.values(existingCats).reduce((s, v) => s + v, 0);

    if (monthlyTotal > 0 && newAllocation > monthlyTotal) {
      const result = await showBudgetExceedModal(monthlyTotal, newAllocation);
      if (result === "cancel") return;
      if (result === "adjust") {
        try { await setTotalBudget(currentMonthKey, newAllocation); }
        catch { showToast("Error updating budget", "error"); return; }
      }
    }

    try {
      await setCategoryBudget(currentMonthKey, catName, amount);
      notifySystem("Budget updated", `${catName} budget set to ${formatCurrency(amount)}.`);
      showToast("Category budget saved");
      closeModal("modal-cat-budget");
    } catch { showToast("Error saving budget", "error"); }
  });

  // Edit total budget
  document.getElementById("edit-total-budget-btn")?.addEventListener("click", () => {
    const effective = getEffectiveBudget(currentMonthKey);
    document.getElementById("total-budget-amount").value = effective?.total || "";
    openModal("modal-total-budget");
  });

  document.getElementById("total-budget-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const amount = parseFloat(document.getElementById("total-budget-amount").value);
    if (!amount || amount <= 0) { showToast("Enter a valid amount", "error"); return; }
    try {
      await setTotalBudget(currentMonthKey, amount);
      notifySystem("Budget updated", `Monthly budget set to ${formatCurrency(amount)}.`);
      showToast("Monthly budget saved");
      closeModal("modal-total-budget");
    } catch { showToast("Error saving budget", "error"); }
  });
}
