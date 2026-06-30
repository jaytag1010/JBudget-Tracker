// ─── History Module ───────────────────────────
import { formatCurrency } from "./utils.js";
import { renderExpenseList } from "./expenses.js";
import { getCategories } from "./settings.js";
import { openModal } from "./ui.js";

let _allExpenses = [];
let _calendarDate = new Date();
let _incomingFilters = null;

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

export function initHistory() {
  populateMonthNameFilter();
  bindHistoryFilters();
  bindCalendarEvents();
  document.addEventListener("spendwise:navigation", event => {
    if (event.detail?.page !== "history") return;
    _incomingFilters = event.detail.filters || { category: "", year: "", month: "" };
    applyIncomingFilters(true);
    applyFilters();
  });
  document.addEventListener("spendwise:category-insight", e => {
    if (e.detail?.category) openCategoryInsight(e.detail.category);
  });
}

export function updateHistory(expenses) {
  _allExpenses = expenses;
  populateYearFilter();
  populateCategoryFilter();
  applyIncomingFilters(true);
  applyFilters();
}

function applyIncomingFilters(consume = false) {
  if (!_incomingFilters) return;
  ensureFilterOption("filter-year", _incomingFilters.year, _incomingFilters.year);
  ensureFilterOption("filter-category", _incomingFilters.category, _incomingFilters.category);
  setFilterValue("filter-category", _incomingFilters.category);
  setFilterValue("filter-year", _incomingFilters.year);
  setFilterValue("filter-month", _incomingFilters.month);
  if (_incomingFilters.year && _incomingFilters.month) {
    _calendarDate = new Date(Number(_incomingFilters.year), Number(_incomingFilters.month) - 1, 1);
  }
  if (consume) _incomingFilters = null;
}

function ensureFilterOption(id, value, label) {
  if (!value) return;
  const select = document.getElementById(id);
  if (!select || [...select.options].some(option => option.value === String(value))) return;
  select.add(new Option(String(label), String(value)));
}

function setFilterValue(id, value) {
  const select = document.getElementById(id);
  if (!select) return;
  const normalized = String(value || "");
  select.value = [...select.options].some(option => option.value === normalized) ? normalized : "";
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
  ensureFilterOption("filter-year", current, current);
  if (current) sel.value = current;
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
  ensureFilterOption("filter-category", current, current);
  if (current) sel.value = current;
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
  if (list) renderExpenseList(list, filtered, { showActions: true });
  renderSpendingCalendar(filtered);

  const total = filtered.reduce((s, e) => s + Number(e.amount || 0), 0);
  const badge = document.getElementById("history-total");
  if (badge) badge.textContent = formatCurrency(total);

  const rawSearch = document.getElementById("search-input")?.value || "";
  const clearBtn  = document.getElementById("search-clear");
  if (clearBtn) clearBtn.classList.toggle("hidden", !rawSearch);
}

function bindCalendarEvents() {
  document.getElementById("calendar-prev-btn")?.addEventListener("click", () => {
    _calendarDate = new Date(_calendarDate.getFullYear(), _calendarDate.getMonth() - 1, 1);
    applyFilters();
  });
  document.getElementById("calendar-next-btn")?.addEventListener("click", () => {
    _calendarDate = new Date(_calendarDate.getFullYear(), _calendarDate.getMonth() + 1, 1);
    applyFilters();
  });
}

function renderSpendingCalendar(filteredExpenses) {
  const grid = document.getElementById("spending-calendar");
  const title = document.getElementById("calendar-title");
  if (!grid) return;

  const year = _calendarDate.getFullYear();
  const month = _calendarDate.getMonth();
  if (title) {
    title.textContent = _calendarDate.toLocaleDateString("en-PH", { month: "long", year: "numeric" });
  }

  const byDay = {};
  filteredExpenses.forEach(e => {
    const d = e.date?.toDate ? e.date.toDate() : new Date(e.date);
    if (d.getFullYear() !== year || d.getMonth() !== month) return;
    const day = d.getDate();
    if (!byDay[day]) byDay[day] = { total: 0, expenses: [] };
    byDay[day].total += Number(e.amount || 0);
    byDay[day].expenses.push(e);
  });

  const firstDay = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  grid.innerHTML = "";

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");
    empty.className = "calendar-day empty";
    grid.appendChild(empty);
  }

  for (let day = 1; day <= days; day++) {
    const data = byDay[day];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "calendar-day" + (data ? " has-spend" : "");
    btn.innerHTML = `<span>${day}</span>${data ? `<strong>${formatCurrency(data.total)}</strong>` : ""}`;
    if (data) btn.addEventListener("click", () => openDayExpenses(year, month, day, data.expenses, data.total));
    grid.appendChild(btn);
  }
}

function openDayExpenses(year, month, day, expenses, total) {
  const title = document.getElementById("day-expenses-title");
  const list = document.getElementById("day-expenses-list");
  if (!list) return;
  const date = new Date(year, month, day);
  if (title) title.textContent = date.toLocaleDateString("en-PH", { month: "long", day: "numeric" });

  const rows = expenses
    .sort((a, b) => String(a.category).localeCompare(String(b.category)))
    .map(e => `<div class="day-expense-row"><span>${e.category}</span><strong>${formatCurrency(e.amount)}</strong></div>`)
    .join("");
  list.innerHTML = `${rows}<div class="day-expense-total"><span>Total</span><strong>${formatCurrency(total)}</strong></div>`;
  openModal("modal-day-expenses");
}

function openCategoryInsight(category) {
  const title = document.getElementById("category-insight-title");
  const body = document.getElementById("category-insight-body");
  if (!body) return;
  if (title) title.textContent = category;

  const now = new Date();
  const thisKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastKey = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}`;
  const monthlyTotals = {};

  _allExpenses.filter(e => e.category === category).forEach(e => {
    const d = e.date?.toDate ? e.date.toDate() : new Date(e.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyTotals[key] = (monthlyTotals[key] || 0) + Number(e.amount || 0);
  });

  const totals = Object.values(monthlyTotals);
  const thisMonth = monthlyTotals[thisKey] || 0;
  const lastMonth = monthlyTotals[lastKey] || 0;
  const average = totals.length ? totals.reduce((s, v) => s + v, 0) / totals.length : 0;
  const trend = lastMonth ? ((thisMonth - lastMonth) / lastMonth) * 100 : 0;
  const trendDown = trend < 0;
  const recent = Object.entries(monthlyTotals).sort(([a], [b]) => a.localeCompare(b)).slice(-6);
  const max = Math.max(...recent.map(([, v]) => v), 1);

  body.innerHTML = `
    <div class="category-insight-grid">
      <div><span>This Month</span><strong>${formatCurrency(thisMonth)}</strong></div>
      <div><span>Last Month</span><strong>${formatCurrency(lastMonth)}</strong></div>
      <div><span>Monthly Average</span><strong>${formatCurrency(average)}</strong></div>
      <div><span>Trend</span><strong class="${trendDown ? "green" : "red"}">${trendDown ? "↓" : "↑"} ${Math.abs(Math.round(trend))}%</strong></div>
    </div>
    <div class="mini-chart">
      ${recent.map(([key, value]) => `
        <div class="mini-chart-row">
          <span>${formatMonthKey(key)}</span>
          <div><i style="width:${Math.max(4, Math.round((value / max) * 100))}%"></i></div>
          <strong>${formatCurrency(value)}</strong>
        </div>`).join("") || '<p class="empty-msg compact">No category spending yet.</p>'}
    </div>`;
  openModal("modal-category-insight");
}

function formatMonthKey(key) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-PH", { month: "short" });
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
  ["filter-category", "filter-year", "filter-month"].forEach(id => {
    document.getElementById(id)?.addEventListener("change", () => {
      _incomingFilters = null;
      applyFilters();
    });
  });
  document.getElementById("search-clear")   ?.addEventListener("click", () => {
    const inp = document.getElementById("search-input");
    if (inp) { inp.value = ""; inp.dispatchEvent(new Event("input")); }
  });
  document.getElementById("analytics-btn")?.addEventListener("click", openSpendingAnalytics);
}
