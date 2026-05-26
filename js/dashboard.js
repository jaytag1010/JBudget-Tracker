// ─── Dashboard Module ─────────────────────────
import { formatCurrency, greeting, monthKey, expensesForMonth, groupByCategory } from "./utils.js";
import { renderExpenseList } from "./expenses.js";

// ── Update Dashboard ──────────────────────────
export function updateDashboard(expenses) {
  updateGreeting();
  updateRecentTransactions(expenses);
  updateTopCategory(expenses);
}

function updateGreeting() {
  const el = document.getElementById("greeting-text");
  if (el) el.textContent = greeting();
}

function updateRecentTransactions(expenses) {
  const el   = document.getElementById("dash-recent-list");
  if (!el) return;
  const recent = expenses.slice(0, 5);
  renderExpenseList(el, recent);
}

function updateTopCategory(expenses) {
  const el = document.getElementById("dash-top-cat");
  if (!el) return;

  const thisMonth = expensesForMonth(expenses, monthKey());
  if (!thisMonth.length) { el.textContent = "—"; return; }

  const grouped = groupByCategory(thisMonth);
  const [topCat] = Object.entries(grouped).sort(([,a],[,b]) => b - a);
  if (topCat) {
    el.textContent = `${topCat[0]} (${formatCurrency(topCat[1])})`;
  }
}
