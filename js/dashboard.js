// ─── Dashboard Module ─────────────────────────
import { formatCurrency, greeting, monthKey, expensesForMonth, groupByCategory } from "./utils.js";
import { renderExpenseList } from "./expenses.js";

// ── Update Dashboard ──────────────────────────
export function updateDashboard(expenses) {
  updateGreeting();
  updateRecentTransactions(expenses);
  updateTopCategory(expenses);
<<<<<<< HEAD
  updateInsights(expenses);          // ← NEW
}

// ── Greeting ──────────────────────────────────
=======
}

>>>>>>> 4d1d8a11fa60e2d5ede438ee92d413f807984b36
function updateGreeting() {
  const el = document.getElementById("greeting-text");
  if (el) el.textContent = greeting();
}

<<<<<<< HEAD
// ── Recent Transactions ───────────────────────
function updateRecentTransactions(expenses) {
  const el = document.getElementById("dash-recent-list");
  if (!el) return;
  renderExpenseList(el, expenses.slice(0, 5));
}

// ── Top Category ──────────────────────────────
=======
function updateRecentTransactions(expenses) {
  const el   = document.getElementById("dash-recent-list");
  if (!el) return;
  const recent = expenses.slice(0, 5);
  renderExpenseList(el, recent);
}

>>>>>>> 4d1d8a11fa60e2d5ede438ee92d413f807984b36
function updateTopCategory(expenses) {
  const el = document.getElementById("dash-top-cat");
  if (!el) return;

  const thisMonth = expensesForMonth(expenses, monthKey());
  if (!thisMonth.length) { el.textContent = "—"; return; }

  const grouped = groupByCategory(thisMonth);
<<<<<<< HEAD
  const [topCat] = Object.entries(grouped).sort(([, a], [, b]) => b - a);
  if (topCat) el.textContent = `${topCat[0]} (${formatCurrency(topCat[1])})`;
}

// ════════════════════════════════════════════
//  INSIGHTS  (NEW)
// ════════════════════════════════════════════

function updateInsights(expenses) {
  const now          = new Date();
  const thisMonthKey = monthKey();
  const thisMonth    = expensesForMonth(expenses, thisMonthKey);

  // Last month key
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey  = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;
  const lastMonth     = expensesForMonth(expenses, lastMonthKey);

  updatePeakDay(thisMonth);
  updateDailyAvg(thisMonth);
  updateVsLastMonth(thisMonth, lastMonth);
  updateTopPaymentMethod(thisMonth);
}

// ── 1. Highest Spending Day ───────────────────
function updatePeakDay(thisMonth) {
  const el = document.getElementById("insight-peak-day");
  if (!el) return;

  if (!thisMonth.length) {
    el.textContent = "No data yet";
    el.className = "insight-value";
    return;
  }

  // Group total spending by calendar date
  const byDay = {};
  thisMonth.forEach(e => {
    const d   = e.date?.toDate ? e.date.toDate() : new Date(e.date);
    const key = d.toISOString().split("T")[0];           // "YYYY-MM-DD"
    byDay[key] = (byDay[key] || 0) + Number(e.amount);
  });

  const [peakKey, peakAmt] = Object.entries(byDay).sort(([, a], [, b]) => b - a)[0];
  // Build date label without timezone shift
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
    el.className = "insight-value";
    return;
  }

  const daysPassed = new Date().getDate();   // 1–31 elapsed days this month
  const total      = thisMonth.reduce((s, e) => s + Number(e.amount), 0);
  const avg        = total / daysPassed;

  el.textContent = formatCurrency(avg);
  el.className   = "insight-value";
}

// ── 3. vs Last Month ──────────────────────────
function updateVsLastMonth(thisMonth, lastMonth) {
  const el = document.getElementById("insight-vs-last");
  if (!el) return;

  const thisTotal = thisMonth.reduce((s, e) => s + Number(e.amount), 0);
  const lastTotal = lastMonth.reduce((s, e) => s + Number(e.amount), 0);

  if (!lastTotal) {
    el.textContent = "No prior data";
    el.className   = "insight-value muted";
    return;
  }

  const diff      = thisTotal - lastTotal;
  const pctChange = Math.round(Math.abs(diff / lastTotal) * 100);
  const sign      = diff > 0 ? "+" : "−";

  el.textContent = `${sign}${pctChange}%`;
  // Green = spending less, Red = spending more
  el.className   = "insight-value " + (diff > 0 ? "red" : "green");
  el.title       = diff > 0
    ? `Spending ${formatCurrency(Math.abs(diff))} more than last month`
    : `Saving ${formatCurrency(Math.abs(diff))} compared to last month`;
}

// ── 4. Most Used Payment Method ───────────────
function updateTopPaymentMethod(thisMonth) {
  const el = document.getElementById("insight-top-method");
  if (!el) return;

  if (!thisMonth.length) {
    el.textContent = "No data yet";
    el.className   = "insight-value";
    return;
  }

  // Count transactions per payment method (frequency, not amount)
  const counts = {};
  thisMonth.forEach(e => {
    const m = e.paymentMethod || "Unknown";
    counts[m] = (counts[m] || 0) + 1;
  });

  const [topMethod, txCount] = Object.entries(counts).sort(([, a], [, b]) => b - a)[0];

  el.textContent = topMethod;
  el.title       = `Used ${txCount} time${txCount !== 1 ? "s" : ""} this month`;
  el.className   = "insight-value";
=======
  const [topCat] = Object.entries(grouped).sort(([,a],[,b]) => b - a);
  if (topCat) {
    el.textContent = `${topCat[0]} (${formatCurrency(topCat[1])})`;
  }
>>>>>>> 4d1d8a11fa60e2d5ede438ee92d413f807984b36
}
