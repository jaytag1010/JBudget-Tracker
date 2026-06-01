// ─── History Module ───────────────────────────
import { formatCurrency } from "./utils.js";
import { renderExpenseList } from "./expenses.js";
import { getCategories } from "./settings.js";
import { openModal } from "./ui.js";

let _allExpenses = [];

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

export function initHistory() {
  populateMonthNameFilter();
  bindHistoryFilters();
}

export function updateHistory(expenses) {
  _allExpenses = expenses;
  populateYearFilter();
  populateCategoryFilter();
  applyFilters();
}

// ── Year filter — derived from actual expense data ─
function populateYearFilter() {
  const sel = document.getElementById("filter-year");
  if (!sel) return;
  const current = sel.value;

  const years = new Set();
  _allExpenses.forEach(e => {
    const d = e.date?.toDate ? e.date.toDate() : new Date(e.date);
    years.add(d.getFullYear());
  });

  sel.innerHTML = '<option value="">All Years</option>';
  Array.from(years).sort((a, b) => b - a).forEach(yr => {
    const opt = document.createElement("option");
    opt.value = yr;
    opt.textContent = yr;
    if (String(yr) === current) opt.selected = true;
    sel.appendChild(opt);
  });
}

// ── Month name filter — static Jan–Dec ─────────
function populateMonthNameFilter() {
  const sel = document.getElementById("filter-month");
  if (!sel) return;
  sel.innerHTML = '<option value="">All Months</option>';
  MONTH_NAMES.forEach((name, i) => {
    const opt = document.createElement("option");
    opt.value = i + 1; // 1-based month number
    opt.textContent = name;
    sel.appendChild(opt);
  });
}

// ── Category filter ───────────────────────────
function populateCategoryFilter() {
  const sel = document.getElementById("filter-category");
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

// ── Get filtered expenses ─────────────────────
function getFilteredExpenses() {
  const rawSearch = (document.getElementById("search-input")?.value || "").trim();
  const search    = rawSearch.toLowerCase();
  const catFilter = document.getElementById("filter-category")?.value || "";
  const yearFilt  = document.getElementById("filter-year")?.value || "";
  const monthFilt = document.getElementById("filter-month")?.value || ""; // "1"–"12"

  let filtered = _allExpenses;

  if (yearFilt) {
    filtered = filtered.filter(e => {
      const d = e.date?.toDate ? e.date.toDate() : new Date(e.date);
      return d.getFullYear() === Number(yearFilt);
    });
  }
  if (monthFilt) {
    filtered = filtered.filter(e => {
      const d = e.date?.toDate ? e.date.toDate() : new Date(e.date);
      return d.getMonth() + 1 === Number(monthFilt);
    });
  }
  if (catFilter) {
    filtered = filtered.filter(e => e.category === catFilter);
  }
  if (search) {
    // Strip ₱ and commas for numeric amount matching
    const stripped  = search.replace(/[₱,\s]/g, "");
    const searchNum = parseFloat(stripped);

    filtered = filtered.filter(e => {
      const textMatch =
        (e.category      || "").toLowerCase().includes(search) ||
        (e.note          || "").toLowerCase().includes(search) ||
        (e.paymentMethod || "").toLowerCase().includes(search);
      const amtMatch = !isNaN(searchNum) &&
        Math.abs(Number(e.amount) - searchNum) < 0.005;
      return textMatch || amtMatch;
    });
  }

  return filtered;
}

// ── Apply filters and re-render ───────────────
function applyFilters() {
  const filtered = getFilteredExpenses();

  const list = document.getElementById("history-list");
  if (list) renderExpenseList(list, filtered);

  const total = filtered.reduce((s, e) => s + Number(e.amount || 0), 0);
  const badge = document.getElementById("history-total");
  if (badge) badge.textContent = formatCurrency(total);

  const rawSearch = document.getElementById("search-input")?.value || "";
  const clearBtn  = document.getElementById("search-clear");
  if (clearBtn) clearBtn.classList.toggle("hidden", !rawSearch);
}

// ── Spending Analytics ────────────────────────
function openSpendingAnalytics() {
  const filtered = getFilteredExpenses();
  renderAnalyticsChart(filtered);
  openModal("modal-analytics");
}

function renderAnalyticsChart(expenses) {
  const chartEl   = document.getElementById("analytics-chart");
  const summaryEl = document.getElementById("analytics-summary");
  if (!chartEl || !summaryEl) return;

  const yearFilt  = document.getElementById("filter-year")?.value  || "";
  const monthFilt = document.getElementById("filter-month")?.value || "";

  // Group by period
  const periods = {};
  expenses.forEach(e => {
    const d  = e.date?.toDate ? e.date.toDate() : new Date(e.date);
    const yr = d.getFullYear();
    const mo = d.getMonth() + 1;
    let key;

    // If filtering by month-only (no year), group across years
    if (monthFilt && !yearFilt) {
      key = String(yr);
    } else {
      key = `${yr}-${String(mo).padStart(2, "0")}`;
    }
    periods[key] = (periods[key] || 0) + Number(e.amount);
  });

  const entries = Object.entries(periods).sort(([a], [b]) => b.localeCompare(a)); // newest first
  const values  = entries.map(([, v]) => v);
  const maxVal  = Math.max(...values, 1);

  if (!entries.length) {
    chartEl.innerHTML   = '<p class="empty-msg" style="padding:16px 0">No data for selected filters.</p>';
    summaryEl.innerHTML = "";
    return;
  }

  // Build horizontal bar chart
  chartEl.innerHTML = "";
  entries.forEach(([key, total]) => {
    const widthPct = Math.round((total / maxVal) * 100);
    const label    = key.includes("-")
      ? new Date(key + "-02").toLocaleDateString("en-PH", { month: "short", year: "numeric" })
      : key;

    const row = document.createElement("div");
    row.className = "chart-row";
    row.innerHTML = `
      <span class="chart-label">${label}</span>
      <div class="chart-bar-wrap">
        <div class="chart-bar" style="width:${widthPct}%"></div>
      </div>
      <span class="chart-value">${formatCurrency(total)}</span>`;
    chartEl.appendChild(row);
  });

  // Summary stats
  const total  = values.reduce((s, v) => s + v, 0);
  const avg    = total / values.length;
  const maxAmt = Math.max(...values);
  const minAmt = Math.min(...values);
  const maxEntry = entries.find(([, v]) => v === maxAmt);
  const minEntry = entries.find(([, v]) => v === minAmt);

  const fmtKey = k => k.includes("-")
    ? new Date(k + "-02").toLocaleDateString("en-PH", { month: "short", year: "numeric" })
    : k;

  summaryEl.innerHTML = `
    <div class="analytics-stat-grid">
      <div class="analytics-stat">
        <span class="astat-label">Highest</span>
        <span class="astat-value">${fmtKey(maxEntry[0])}</span>
        <span class="astat-amt accent">${formatCurrency(maxAmt)}</span>
      </div>
      <div class="analytics-stat">
        <span class="astat-label">Lowest</span>
        <span class="astat-value">${fmtKey(minEntry[0])}</span>
        <span class="astat-amt green">${formatCurrency(minAmt)}</span>
      </div>
      <div class="analytics-stat">
        <span class="astat-label">Average</span>
        <span class="astat-value">—</span>
        <span class="astat-amt">${formatCurrency(avg)}</span>
      </div>
      <div class="analytics-stat">
        <span class="astat-label">Total</span>
        <span class="astat-value">—</span>
        <span class="astat-amt">${formatCurrency(total)}</span>
      </div>
    </div>`;
}

// ── Bind filter controls ──────────────────────
function bindHistoryFilters() {
  document.getElementById("search-input")   ?.addEventListener("input",  applyFilters);
  document.getElementById("filter-category")?.addEventListener("change", applyFilters);
  document.getElementById("filter-year")    ?.addEventListener("change", applyFilters);
  document.getElementById("filter-month")   ?.addEventListener("change", applyFilters);
  document.getElementById("search-clear")   ?.addEventListener("click", () => {
    const inp = document.getElementById("search-input");
    if (inp) { inp.value = ""; inp.dispatchEvent(new Event("input")); }
  });
  document.getElementById("analytics-btn")?.addEventListener("click", openSpendingAnalytics);
}
