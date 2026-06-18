// ─── Dashboard Module ─────────────────────────
import {
  formatCurrency, timeBasedGreeting, firstName, weekdaySubtitle,
  monthKey, expensesForMonth, groupByCategory,
} from "./utils.js";
import { renderExpenseList } from "./expenses.js";

// ── State ─────────────────────────────────────
let _allExpenses = [];
let _insightMode = "month";   // "month" | "year"
let _profileDisplayName = "Friend";
let _greetingTimer = null;

// ── Update Dashboard ──────────────────────────
export function updateDashboard(expenses) {
  _allExpenses = expenses;
  updateGreeting();
  updateRecentTransactions(expenses);
  updateTopCategory(expenses);
  updateInsights(expenses);
}

// ── Insights Toggle Init (call once from app.js) ──
export function initInsightsToggle() {
  document.getElementById("insight-month-tab")
    ?.addEventListener("click", () => setInsightMode("month"));
  document.getElementById("insight-year-tab")
    ?.addEventListener("click",  () => setInsightMode("year"));
}

export function initGreetingClock() {
  updateGreeting();
  if (_greetingTimer) clearInterval(_greetingTimer);
  _greetingTimer = setInterval(updateGreeting, 60000);
}

function setInsightMode(mode) {
  _insightMode = mode;
  document.getElementById("insight-month-tab")?.classList.toggle("active", mode === "month");
  document.getElementById("insight-year-tab")?.classList.toggle("active",  mode === "year");
  updateInsights(_allExpenses);
}

// ── Greeting ──────────────────────────────────
function updateGreeting() {
  const el = document.getElementById("greeting-text");
  const subtitle = document.getElementById("greeting-subtitle");
  const now = new Date();
  if (el) el.textContent = `${timeBasedGreeting(now)}, ${firstName(_profileDisplayName)}`;
  if (subtitle) subtitle.textContent = weekdaySubtitle(now);
}

export function setDashboardProfileName(displayName) {
  _profileDisplayName = displayName || "Friend";
  updateGreeting();
}

// ── Recent Transactions ───────────────────────
function updateRecentTransactions(expenses) {
  const el = document.getElementById("dash-recent-list");
  if (!el) return;
  renderExpenseList(el, expenses.slice(0, 5));
}

// ── Top Category (always this month) ─────────
function updateTopCategory(expenses) {
  const el = document.getElementById("dash-top-cat");
  if (!el) return;

  const thisMonth = expensesForMonth(expenses, monthKey());
  if (!thisMonth.length) {
    el.innerHTML = "—";
    return;
  }

  const grouped = groupByCategory(thisMonth);
  const [topCat] = Object.entries(grouped).sort(([, a], [, b]) => b - a);
  if (topCat) {
    // Stacked layout: name on first line, amount on second line — prevents truncation.
    el.innerHTML =
      `<span class="top-cat-name">${topCat[0]}</span>` +
      `<span class="top-cat-amt">${formatCurrency(topCat[1])}</span>`;
  }
}

// ════════════════════════════════════════════
//  INSIGHTS — dispatcher
// ════════════════════════════════════════════

function updateInsights(expenses) {
  if (_insightMode === "year") {
    updateInsightsYearly(expenses);
  } else {
    updateInsightsMonthly(expenses);
  }
}

// ════════════════════════════════════════════
//  THIS MONTH MODE
// ════════════════════════════════════════════

function updateInsightsMonthly(expenses) {
  const now          = new Date();
  const thisMonthKey = monthKey();
  const thisMonth    = expensesForMonth(expenses, thisMonthKey);

  // Last month
  const lastDate     = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, "0")}`;
  const lastMonth    = expensesForMonth(expenses, lastMonthKey);

  // Update card labels
  setLabel("insight-peak-label", "Peak Spending Day");
  setLabel("insight-avg-label",  "Daily Average");
  setLabel("insight-vs-label",   "vs Last Month");

  updatePeakDay(thisMonth);
  updateDailyAvg(thisMonth);
  updateVsCompare(thisMonth, lastMonth);
  updateTopMethod(thisMonth);
}

// ── 1. Peak Spending Day ──────────────────────
function updatePeakDay(thisMonth) {
  const el = document.getElementById("insight-peak-day");
  if (!el) return;

  if (!thisMonth.length) {
    el.textContent = "No data yet";
    el.className   = "insight-value muted";
    return;
  }

  const byDay = {};
  thisMonth.forEach(e => {
    const d   = e.date?.toDate ? e.date.toDate() : new Date(e.date);
    const key = d.toISOString().split("T")[0];
    byDay[key] = (byDay[key] || 0) + Number(e.amount);
  });

  const [peakKey, peakAmt] = Object.entries(byDay).sort(([, a], [, b]) => b - a)[0];
  const [yr, mo, dy] = peakKey.split("-").map(Number);
  const label = new Date(yr, mo - 1, dy).toLocaleDateString("en-PH", { month: "short", day: "numeric" });

  el.textContent = label;
  el.title       = `${formatCurrency(peakAmt)} spent on ${label}`;
  el.className   = "insight-value accent";
}

// ── 2. Daily Average ──────────────────────────
function updateDailyAvg(thisMonth) {
  const el = document.getElementById("insight-daily-avg");
  if (!el) return;

  if (!thisMonth.length) {
    el.textContent = "₱0.00";
    el.className   = "insight-value";
    return;
  }

  const daysPassed = new Date().getDate();   // 1–31 elapsed days this month
  const total      = thisMonth.reduce((s, e) => s + Number(e.amount), 0);

  el.textContent = formatCurrency(total / daysPassed);
  el.className   = "insight-value";
}

// ── 3. VS comparison (shared by monthly + yearly) ──
function updateVsCompare(current, prior) {
  const pctEl = document.getElementById("insight-vs-pct");
  const absEl = document.getElementById("insight-vs-abs");
  if (!pctEl) return;

  const thisTotal = current.reduce((s, e) => s + Number(e.amount), 0);
  const prevTotal = prior.reduce  ((s, e) => s + Number(e.amount), 0);

  if (!prevTotal) {
    pctEl.textContent = "No prior data";
    pctEl.className   = "insight-vs-pct muted";
    if (absEl) { absEl.textContent = ""; absEl.className = "insight-vs-abs"; }
    return;
  }

  const diff      = thisTotal - prevTotal;
  const pctChange = Math.round(Math.abs(diff / prevTotal) * 100);
  const arrow     = diff > 0 ? "↑" : "↓";
  const sign      = diff > 0 ? "+" : "−";
  const colorCls  = diff > 0 ? "red" : "green";

  pctEl.textContent = `${arrow} ${pctChange}%`;
  pctEl.className   = `insight-vs-pct ${colorCls}`;
  if (absEl) {
    absEl.textContent = `(${sign}${formatCurrency(Math.abs(diff))})`;
    absEl.className   = `insight-vs-abs ${colorCls}`;
  }
}

// ── 4. Top Payment Method (freq + amount) ─────
function updateTopMethod(scopedExpenses) {
  const freqEl = document.getElementById("insight-method-freq");
  const amtEl  = document.getElementById("insight-method-amt");
  if (!freqEl || !amtEl) return;

  if (!scopedExpenses.length) {
    freqEl.textContent = "—";
    amtEl.textContent  = "—";
    return;
  }

  const freq   = {};   // method → transaction count
  const totals = {};   // method → total amount

  scopedExpenses.forEach(e => {
    const m  = e.paymentMethod || "Unknown";
    freq[m]   = (freq[m]   || 0) + 1;
    totals[m] = (totals[m] || 0) + Number(e.amount);
  });

  const [topFreqMethod, topFreqCount] = Object.entries(freq)  .sort(([, a], [, b]) => b - a)[0];
  const [topAmtMethod,  topAmtValue]  = Object.entries(totals).sort(([, a], [, b]) => b - a)[0];

  freqEl.textContent = `${topFreqMethod} (${topFreqCount}x)`;
  amtEl.textContent  = `${topAmtMethod} (${formatCurrency(topAmtValue)})`;
}

// ════════════════════════════════════════════
//  THIS YEAR MODE
// ════════════════════════════════════════════

function updateInsightsYearly(expenses) {
  setLabel("insight-peak-label", "Peak Spending Month");
  setLabel("insight-avg-label",  "Monthly Average");
  setLabel("insight-vs-label",   "vs Last Year");

  const now      = new Date();
  const thisYear = now.getFullYear();

  updatePeakMonth(expenses, thisYear);
  updateMonthlyAvg(expenses, thisYear);
  updateVsLastYear(expenses, now);
  updateTopMethod(expensesForYear(expenses, thisYear));
}

// ── Y1. Peak Spending Month ───────────────────
function updatePeakMonth(expenses, thisYear) {
  const el = document.getElementById("insight-peak-day");
  if (!el) return;

  const yearExp = expensesForYear(expenses, thisYear);

  if (!yearExp.length) {
    el.textContent = "No data yet";
    el.className   = "insight-value muted";
    return;
  }

  const byMonth = {};
  yearExp.forEach(e => {
    const d   = e.date?.toDate ? e.date.toDate() : new Date(e.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    byMonth[key] = (byMonth[key] || 0) + Number(e.amount);
  });

  const [peakKey, peakAmt] = Object.entries(byMonth).sort(([, a], [, b]) => b - a)[0];
  const [yr, mo] = peakKey.split("-").map(Number);
  const monthName = new Date(yr, mo - 1, 1).toLocaleDateString("en-PH", { month: "short" });
  const label     = `${monthName} — ${formatCurrency(peakAmt)}`;

  el.textContent = label;
  el.title       = `Highest spending month of ${thisYear}`;
  el.className   = "insight-value accent";
}

// ── Y2. Monthly Average ───────────────────────
function updateMonthlyAvg(expenses, thisYear) {
  const el = document.getElementById("insight-daily-avg");
  if (!el) return;

  const yearExp = expensesForYear(expenses, thisYear);

  if (!yearExp.length) {
    el.textContent = "₱0.00";
    el.className   = "insight-value";
    return;
  }

  // Count distinct months that have at least one expense
  const activeMonths = new Set(
    yearExp.map(e => {
      const d = e.date?.toDate ? e.date.toDate() : new Date(e.date);
      return d.getMonth();
    })
  );

  const total = yearExp.reduce((s, e) => s + Number(e.amount), 0);
  el.textContent = formatCurrency(total / activeMonths.size) + "/mo";
  el.className   = "insight-value";
}

// ── Y3. VS Last Year (year-to-date only) ──────
// Compares Jan–<currentMonth> this year vs same period last year.
function updateVsLastYear(expenses, now) {
  const thisYear  = now.getFullYear();
  const lastYear  = thisYear - 1;
  const upToMonth = now.getMonth();   // 0-based; same cut-off for both years

  const thisYTD = expensesYTD(expenses, thisYear, upToMonth);
  const lastYTD = expensesYTD(expenses, lastYear, upToMonth);

  updateVsCompare(thisYTD, lastYTD);
}

// ════════════════════════════════════════════
//  LOCAL HELPERS
// ════════════════════════════════════════════

// All expenses in a given calendar year
function expensesForYear(expenses, year) {
  return expenses.filter(e => {
    const d = e.date?.toDate ? e.date.toDate() : new Date(e.date);
    return d.getFullYear() === year;
  });
}

// All expenses in [year, Jan – upToMonth] (inclusive, 0-based month)
function expensesYTD(expenses, year, upToMonth) {
  return expenses.filter(e => {
    const d = e.date?.toDate ? e.date.toDate() : new Date(e.date);
    return d.getFullYear() === year && d.getMonth() <= upToMonth;
  });
}

// Set text of a label element by ID
function setLabel(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
