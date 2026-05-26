// ─── History Module ───────────────────────────
import { formatCurrency, monthKey, lastTwelveMonths } from "./utils.js";
import { renderExpenseList } from "./expenses.js";
import { getCategories } from "./settings.js";

let _allExpenses = [];

export function initHistory() {
  populateMonthFilter();
  bindHistoryFilters();
}

export function updateHistory(expenses) {
  _allExpenses = expenses;
  applyFilters();
  populateCategoryFilter();
}

// ── Populate Filters ──────────────────────────
function populateMonthFilter() {
  const sel = document.getElementById("filter-month");
  if (!sel) return;
  lastTwelveMonths().forEach(({ key, label }) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = label;
    if (key === monthKey()) opt.selected = true;
    sel.appendChild(opt);
  });
}

function populateCategoryFilter() {
  const sel  = document.getElementById("filter-category");
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">All Categories</option>';
  getCategories().forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat.name;
    opt.textContent = `${cat.icon} ${cat.name}`;
    if (cat.name === current) opt.selected = true;
    sel.appendChild(opt);
  });
}

// ── Apply Filters ─────────────────────────────
function applyFilters() {
  const search    = document.getElementById("search-input")?.value.toLowerCase() || "";
  const catFilter = document.getElementById("filter-category")?.value || "";
  const monthFilt = document.getElementById("filter-month")?.value || "";

  let filtered = _allExpenses;

  if (monthFilt) {
    filtered = filtered.filter(e => {
      const d = e.date?.toDate ? e.date.toDate() : new Date(e.date);
      return monthKey(d) === monthFilt;
    });
  }
  if (catFilter) {
    filtered = filtered.filter(e => e.category === catFilter);
  }
  if (search) {
    filtered = filtered.filter(e =>
      (e.category || "").toLowerCase().includes(search) ||
      (e.note || "").toLowerCase().includes(search) ||
      (e.paymentMethod || "").toLowerCase().includes(search) ||
      String(e.amount).includes(search)
    );
  }

  const list = document.getElementById("history-list");
  if (list) renderExpenseList(list, filtered);

  // Update history total
  const total = filtered.reduce((s, e) => s + Number(e.amount || 0), 0);
  const badge = document.getElementById("history-total");
  if (badge) badge.textContent = formatCurrency(total);

  // Show/hide clear button
  const clearBtn = document.getElementById("search-clear");
  if (clearBtn) clearBtn.classList.toggle("hidden", !search);
}

// ── Bind filter controls ──────────────────────
function bindHistoryFilters() {
  document.getElementById("search-input")?.addEventListener("input", applyFilters);
  document.getElementById("filter-category")?.addEventListener("change", applyFilters);
  document.getElementById("filter-month")?.addEventListener("change", applyFilters);
  document.getElementById("search-clear")?.addEventListener("click", () => {
    const inp = document.getElementById("search-input");
    if (inp) { inp.value = ""; inp.dispatchEvent(new Event("input")); }
  });
}
