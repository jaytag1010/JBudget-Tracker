// ─── Savings Module ───────────────────────────
import {
  listenSavingsGoals, addSavingsGoal, updateSavingsGoal, deleteSavingsGoal,
  seedDefaultSavingsGoal, listenSavingsContributions, addSavingsContribution
} from "../firebase/db.js";
import { openModal, closeModal, showToast, confirmDialog } from "./ui.js";
import { formatCurrency, formatDateInput, pct } from "./utils.js";
import { updateFinancialSavings } from "./financial.js";
import { notifyGenerated, notifySystem } from "./notifications.js";

let _goals = [];
let _contributions = [];

document.addEventListener("spendwise:notification-settings", syncSavingsNotifications);

// ── Init ──────────────────────────────────────
export async function initSavings() {
  await seedDefaultSavingsGoal();
  listenSavingsGoals(goals => {
    _goals = goals;
    renderSavingsPage();
    renderSavingsDashboard();
    updateFinancialSavings(goals);
    syncSavingsNotifications();
  });
  listenSavingsContributions(items => {
    _contributions = items;
    renderSavingsPage();
  });
  bindSavingsEvents();
}

// ── Full Savings Page ─────────────────────────
function renderSavingsPage() {
  const list  = document.getElementById("savings-list");
  const total = document.getElementById("savings-total");
  const count = document.getElementById("savings-goal-count");
  if (!list) return;

  const totalSaved = _goals.reduce((s, g) => s + Number(g.currentAmount || 0), 0);
  if (total) total.textContent = formatCurrency(totalSaved);
  if (count) count.textContent = _goals.length;

  if (!_goals.length) {
    list.innerHTML = '<p class="empty-msg">No savings goals yet. Tap + to add one!</p>';
    return;
  }

  list.innerHTML = "";
  _goals.forEach(g => list.appendChild(buildSavingCard(g)));
}

function buildSavingCard(goal) {
  const current  = Number(goal.currentAmount || 0);
  const target   = Number(goal.targetAmount  || 1);
  const p        = pct(current, target);
  const remaining = Math.max(0, target - current);
  const complete  = p >= 100;
  const forecast  = calculateForecast(goal);

  const card = document.createElement("div");
  card.className = "saving-card";

  let deadlineHtml = "";
  if (goal.deadline) {
    const d = goal.deadline.toDate ? goal.deadline.toDate() : new Date(goal.deadline);
    deadlineHtml = `<div class="saving-deadline">🗓 ${d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}</div>`;
  }

  card.innerHTML = `
    <div class="saving-header">
      <div>
        <div class="saving-name">${complete ? "✅ " : ""}${goal.name}</div>
        ${deadlineHtml}
      </div>
      <div class="saving-actions">
        <button class="icon-btn" data-edit="${goal.id}" aria-label="Edit goal">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="icon-btn" data-del="${goal.id}" aria-label="Delete goal" style="color:var(--red)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>
    </div>
    <div class="saving-progress-row">
      <span class="saving-current">${formatCurrency(current)}</span>
      <span class="saving-target">of ${formatCurrency(target)}</span>
    </div>
    <div class="saving-bar-wrap">
      <div class="saving-bar ${complete ? "complete" : ""}" style="width:${p}%"></div>
    </div>
    <div class="saving-footer">
      <span class="saving-pct">${p}% complete</span>
      <span>${complete ? "Goal reached! 🎉" : formatCurrency(remaining) + " to go"}</span>
    </div>
    <div class="saving-forecast">
      <div>
        <span class="forecast-label">Estimated Completion</span>
        <strong>${forecast.dateLabel}</strong>
      </div>
      <span class="forecast-status ${forecast.statusClass}">${forecast.status}</span>
    </div>`;

  card.querySelector(`[data-edit]`).addEventListener("click", () => openEditGoal(goal));
  card.querySelector(`[data-del]`).addEventListener("click",  () => handleDeleteGoal(goal));
  return card;
}

// ── Dashboard savings mini-list ───────────────
function renderSavingsDashboard() {
  const el = document.getElementById("dash-savings-list");
  if (!el) return;
  const top3 = _goals.slice(0, 3);
  if (!top3.length) {
    el.innerHTML = '<p class="empty-msg">No savings goals yet.</p>';
    return;
  }
  el.innerHTML = "";
  top3.forEach(g => {
    const current = Number(g.currentAmount || 0);
    const target  = Number(g.targetAmount  || 1);
    const p       = pct(current, target);
    const card = document.createElement("div");
    card.className = "saving-mini-card";
    card.innerHTML = `
      <div class="smc-header">
        <span class="smc-name">${g.name}</span>
        <span class="smc-pct">${p}%</span>
      </div>
      <div class="smc-bar-wrap">
        <div class="smc-bar" style="width:${p}%"></div>
      </div>`;
    el.appendChild(card);
  });
}

// ── Goal modal ────────────────────────────────
function openAddGoal() {
  document.getElementById("modal-saving-title").textContent = "Add Savings Goal";
  document.getElementById("saving-form").reset();
  document.getElementById("saving-id").value = "";
  openModal("modal-saving");
}

function openEditGoal(goal) {
  document.getElementById("modal-saving-title").textContent = "Edit Savings Goal";
  document.getElementById("saving-id").value       = goal.id;
  document.getElementById("saving-name").value     = goal.name;
  document.getElementById("saving-target").value   = goal.targetAmount;
  document.getElementById("saving-current").value  = goal.currentAmount || 0;
  document.getElementById("saving-deadline").value = goal.deadline ? formatDateInput(goal.deadline) : "";
  openModal("modal-saving");
}

async function handleDeleteGoal(goal) {
  const ok = await confirmDialog("Delete Goal", `Delete "${goal.name}"? Progress will be lost.`);
  if (!ok) return;
  try {
    await deleteSavingsGoal(goal.id);
    showToast("Goal deleted", "info");
  } catch { showToast("Error deleting goal", "error"); }
}

// ── Bind events ───────────────────────────────
function bindSavingsEvents() {
  document.getElementById("add-saving-btn")?.addEventListener("click", openAddGoal);

  document.getElementById("saving-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const id      = document.getElementById("saving-id").value;
    const name    = document.getElementById("saving-name").value.trim();
    const target  = parseFloat(document.getElementById("saving-target").value);
    const current = parseFloat(document.getElementById("saving-current").value) || 0;
    const deadline = document.getElementById("saving-deadline").value;

    if (!name)            { showToast("Enter a goal name", "error"); return; }
    if (!target || target <= 0) { showToast("Enter a valid target amount", "error"); return; }
    if (current < 0)      { showToast("Amount saved can't be negative", "error"); return; }

    const data = { name, targetAmount: target, currentAmount: current, deadline: deadline || null };
    try {
      if (id) {
        await updateSavingsGoal(id, data);
        notifySystem("Savings goal updated", `${name} progress was updated.`);
        showToast("Goal updated");
      } else {
        const ref = await addSavingsGoal(data);
        if (current > 0) {
          await addSavingsContribution({
            goalId: ref.id,
            goalName: name,
            amount: current,
            currentAmount: current,
            date: new Date(),
          });
        }
        notifySystem("Savings goal added", `${name} is now being tracked.`);
        showToast("Goal added");
      }
      closeModal("modal-saving");
    } catch { showToast("Error saving goal", "error"); }
  });
}

function syncSavingsNotifications() {
  _goals.forEach(goal => {
    if (!goal.deadline) return;
    const forecast = calculateForecast(goal);
    if (forecast.status !== "Behind") return;
    const current = Number(goal.currentAmount || 0);
    const target = Number(goal.targetAmount || 0);
    const remaining = Math.max(0, target - current);
    notifyGenerated(`savings-${goal.id}-behind`, {
      type: "savings",
      icon: "💰",
      severity: "warn",
      title: `${goal.name} behind target`,
      message: `${formatCurrency(remaining)} remaining. Estimated completion: ${forecast.dateLabel}.`,
      sourceId: goal.id,
      externalCategory: "savingsGoalUpdates",
      isRelevant: () => {
        const latest = _goals.find(item => item.id === goal.id);
        return Boolean(latest?.deadline && calculateForecast(latest).status === "Behind");
      },
    });
  });
}

function calculateForecast(goal) {
  const current = Number(goal.currentAmount || 0);
  const target = Number(goal.targetAmount || 0);
  const remaining = Math.max(0, target - current);
  if (remaining <= 0) {
    return { dateLabel: "Complete", status: "Ahead", statusClass: "ahead" };
  }

  const contributions = _contributions
    .filter(c => c.goalId === goal.id && Number(c.amount || 0) > 0)
    .sort((a, b) => toDate(a.date) - toDate(b.date));

  if (!contributions.length) {
    return { dateLabel: "Add contributions", status: "Behind", statusClass: "behind" };
  }

  const firstDate = toDate(contributions[0].date);
  const lastDate = toDate(contributions[contributions.length - 1].date);
  const positiveTotal = contributions.reduce((s, c) => s + Number(c.amount || 0), 0);
  const monthSpan = Math.max(1, monthDiff(firstDate, lastDate) + 1);
  const monthlyRate = positiveTotal / monthSpan;
  const monthsNeeded = Math.ceil(remaining / monthlyRate);
  const estimated = new Date();
  estimated.setMonth(estimated.getMonth() + monthsNeeded);

  const dateLabel = estimated.toLocaleDateString("en-PH", { month: "long", year: "numeric" });
  const status = goal.deadline ? statusAgainstDeadline(estimated, toDate(goal.deadline)) : "On Track";
  return { dateLabel, status, statusClass: status.toLowerCase().replace(" ", "-") };
}

function statusAgainstDeadline(estimated, deadline) {
  const diffMonths = monthDiff(estimated, deadline);
  if (diffMonths >= 2) return "Ahead";
  if (estimated <= deadline) return "On Track";
  return "Behind";
}

function monthDiff(a, b) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function toDate(value) {
  return value?.toDate ? value.toDate() : new Date(value);
}
