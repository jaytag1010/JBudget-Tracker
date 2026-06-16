import { formatCurrency, monthKey, expensesForMonth, groupByCategory, sumAmounts, pct } from "./utils.js";
import { notifyGenerated } from "./notifications.js";

let _expenses = [];
let _budgets = [];
let _goals = [];

export function updateFinancialExpenses(expenses) {
  _expenses = expenses || [];
  renderFinancialWidgets();
}

export function updateFinancialBudgets(budgets) {
  _budgets = budgets || [];
  renderFinancialWidgets();
}

export function updateFinancialSavings(goals) {
  _goals = goals || [];
  renderFinancialWidgets();
}

function renderFinancialWidgets() {
  renderHealthScore();
  syncOverspendingNotifications();
}

function effectiveBudget(key) {
  const eligible = _budgets.filter(b => b.id <= key);
  return eligible.length ? eligible[eligible.length - 1] : null;
}

function currentScope() {
  const key = monthKey();
  const budget = effectiveBudget(key) || {};
  const expenses = expensesForMonth(_expenses, key);
  return { key, budget, expenses };
}

function renderHealthScore() {
  const scoreEl = document.getElementById("budget-health-score");
  const labelEl = document.getElementById("budget-health-label");
  const detailEl = document.getElementById("budget-health-detail");
  const barEl = document.getElementById("budget-health-bar");
  if (!scoreEl || !labelEl) return;

  const { budget, expenses } = currentScope();
  const totalBudget = Number(budget.total || 0);
  const totalSpent = sumAmounts(expenses);
  const catBudgets = budget.categories || {};
  const byCat = groupByCategory(expenses);
  const overCats = Object.entries(catBudgets).filter(([cat, amt]) => (byCat[cat] || 0) > Number(amt)).length;
  const goalProgress = _goals.length
    ? _goals.reduce((s, g) => s + pct(Number(g.currentAmount || 0), Number(g.targetAmount || 0)), 0) / _goals.length
    : 70;

  const adherence = totalBudget > 0 ? Math.max(0, 100 - Math.max(0, (totalSpent / totalBudget - 1) * 120)) : 70;
  const overPenalty = Object.keys(catBudgets).length ? Math.max(0, 100 - overCats * 18) : 80;
  const consistency = spendingConsistency(expenses);
  const score = Math.round((adherence * .4) + (goalProgress * .25) + (overPenalty * .2) + (consistency * .15));

  scoreEl.textContent = `${Math.max(0, Math.min(100, score))} / 100`;
  labelEl.textContent = scoreLabel(score);
  labelEl.className = `health-label ${scoreClass(score)}`;
  if (barEl) barEl.style.width = `${Math.max(4, Math.min(100, score))}%`;
  if (detailEl) {
    detailEl.title = "Score blends budget adherence, savings progress, over-budget categories, and spending consistency.";
  }
}

function spendingConsistency(expenses) {
  if (expenses.length < 4) return 75;
  const days = {};
  expenses.forEach(e => {
    const d = e.date?.toDate ? e.date.toDate() : new Date(e.date);
    const key = d.toISOString().split("T")[0];
    days[key] = (days[key] || 0) + Number(e.amount || 0);
  });
  const values = Object.values(days);
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  if (!avg) return 80;
  const variance = values.reduce((s, v) => s + Math.abs(v - avg), 0) / values.length;
  return Math.max(35, Math.round(100 - (variance / avg) * 35));
}

function scoreLabel(score) {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Fair";
  return "Needs Attention";
}

function scoreClass(score) {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 60) return "fair";
  return "attention";
}

function syncOverspendingNotifications() {
  const { budget, expenses } = currentScope();
  const alerts = [];
  const total = Number(budget.total || 0);
  const spent = sumAmounts(expenses);
  if (total > 0) addBudgetAlert(alerts, "Overall budget", spent, total, expenses);

  const byCat = groupByCategory(expenses);
  Object.entries(budget.categories || {}).forEach(([cat, amount]) => {
    addBudgetAlert(alerts, `${cat} budget`, byCat[cat] || 0, Number(amount), expenses.filter(e => e.category === cat));
  });

  alerts.slice(0, 8).forEach(alert => {
    notifyGenerated(alert.id, {
      type: "budget",
      icon: "⚠",
      severity: alert.level,
      title: alert.title,
      message: [alert.message, alert.pace].filter(Boolean).join(" "),
      sourceId: alert.id,
    });
  });
}

function addBudgetAlert(alerts, label, spent, budget, scopedExpenses) {
  if (!budget || spent <= 0) return;
  const used = spent / budget;
  const thresholds = [1, .95, .9, .8];
  const hit = thresholds.find(t => used >= t);
  if (!hit) return;

  const percent = Math.round(used * 100);
  const level = used >= 1 ? "danger" : used >= .95 ? "critical" : "warn";
  const projected = projectedOverage(scopedExpenses, budget);
  alerts.push({
    id: `budget-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    level,
    title: `${label} is ${percent}% used.`,
    message: `${formatCurrency(spent)} of ${formatCurrency(budget)} spent this month.`,
    pace: projected > 0 ? `Based on your current pace, you may exceed it by ${formatCurrency(projected)}.` : "",
  });
}

function projectedOverage(expenses, budget) {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const elapsed = Math.max(1, now.getDate());
  const spent = sumAmounts(expenses);
  const projected = (spent / elapsed) * daysInMonth;
  return Math.max(0, projected - budget);
}
