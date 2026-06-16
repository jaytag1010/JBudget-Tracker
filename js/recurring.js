import {
  listenRecurringExpenses, addRecurringExpense, updateRecurringExpense, deleteRecurringExpense,
} from "../firebase/db.js";
import { openModal, closeModal, showToast, confirmDialog } from "./ui.js";
import { formatCurrency, formatDateInput, todayISO } from "./utils.js";
import { getCategories } from "./settings.js";
import { openAddExpense } from "./expenses.js";
import { notifyGenerated, notifySystem } from "./notifications.js";

let _items = [];
let _editingId = null;

export function initRecurring() {
  bindRecurringEvents();
  listenRecurringExpenses(items => {
    _items = items;
    renderRecurringPage();
    renderUpcomingBills();
    syncRecurringNotifications();
  });
}

export function getRecurringExpenses() {
  return _items;
}

export async function createRecurringFromExpense(data) {
  return addRecurringExpense(normalizeRecurring(data));
}

function normalizeRecurring(data) {
  return {
    name: data.name,
    amount: Number(data.amount),
    category: data.category,
    frequency: data.frequency || "monthly",
    dueDate: data.dueDate,
    reminderTiming: data.reminderTiming || "same-day",
    active: data.active !== false,
  };
}

function bindRecurringEvents() {
  document.getElementById("add-recurring-btn")?.addEventListener("click", openAddRecurring);
  document.getElementById("recurring-form")?.addEventListener("submit", handleRecurringSubmit);
}

function openAddRecurring() {
  _editingId = null;
  document.getElementById("modal-recurring-title").textContent = "Add Recurring Expense";
  document.getElementById("recurring-form").reset();
  document.getElementById("recurring-id").value = "";
  document.getElementById("recurring-due").value = todayISO();
  populateRecurringCategories("");
  openModal("modal-recurring");
}

function openEditRecurring(item) {
  _editingId = item.id;
  document.getElementById("modal-recurring-title").textContent = "Edit Recurring Expense";
  document.getElementById("recurring-id").value = item.id;
  document.getElementById("recurring-name").value = item.name || "";
  document.getElementById("recurring-amount").value = item.amount || "";
  document.getElementById("recurring-frequency").value = item.frequency || "monthly";
  document.getElementById("recurring-due").value = formatDateInput(item.dueDate);
  document.getElementById("recurring-reminder").value = item.reminderTiming || "same-day";
  document.getElementById("recurring-active").checked = item.active !== false;
  populateRecurringCategories(item.category || "");
  openModal("modal-recurring");
}

function populateRecurringCategories(selected) {
  const sel = document.getElementById("recurring-category");
  if (!sel) return;
  sel.innerHTML = '<option value="">Choose category...</option>';
  getCategories().forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat.name;
    opt.textContent = `${cat.icon} ${cat.name}`;
    opt.selected = cat.name === selected;
    sel.appendChild(opt);
  });
}

async function handleRecurringSubmit(e) {
  e.preventDefault();
  const data = {
    name: document.getElementById("recurring-name").value.trim(),
    amount: parseFloat(document.getElementById("recurring-amount").value),
    category: document.getElementById("recurring-category").value,
    frequency: document.getElementById("recurring-frequency").value,
    dueDate: document.getElementById("recurring-due").value,
    reminderTiming: document.getElementById("recurring-reminder").value,
    active: document.getElementById("recurring-active").checked,
  };

  if (!data.name) return showToast("Enter a recurring name", "error");
  if (!data.amount || data.amount <= 0) return showToast("Enter a valid amount", "error");
  if (!data.category) return showToast("Choose a category", "error");
  if (!data.dueDate) return showToast("Choose a due date", "error");

  try {
    if (_editingId) {
      await updateRecurringExpense(_editingId, normalizeRecurring(data));
      notifySystem("Recurring expense updated", `${data.name} was updated.`);
      showToast("Recurring expense updated");
    } else {
      await addRecurringExpense(normalizeRecurring(data));
      notifySystem("Recurring expense added", `${data.name} reminders are active.`);
      showToast("Recurring expense added");
    }
    closeModal("modal-recurring");
  } catch (err) {
    console.error(err);
    showToast("Error saving recurring expense", "error");
  }
}

function renderRecurringPage() {
  const el = document.getElementById("recurring-list");
  if (!el) return;
  if (!_items.length) {
    el.innerHTML = '<p class="empty-msg">No recurring expenses yet.</p>';
    return;
  }

  el.innerHTML = "";
  _items.forEach(item => {
    const card = document.createElement("div");
    card.className = "recurring-card";
    const next = nextDueDate(item);
    card.innerHTML = `
      <div class="recurring-main">
        <div class="recurring-check">${item.active === false ? "○" : "☑"}</div>
        <div class="recurring-info">
          <div class="recurring-name">${item.name}</div>
          <div class="recurring-meta">${titleCase(item.frequency)} · ${duePhrase(item)}</div>
        </div>
        <div class="recurring-amount">${formatCurrency(item.amount)}</div>
      </div>
      <div class="recurring-footer">
        <span>Next due: ${formatShortDate(next)}</span>
        <div>
          <button class="mini-btn" data-pay="${item.id}">Pay</button>
          <button class="mini-btn" data-toggle="${item.id}">${item.active === false ? "Enable" : "Disable"}</button>
          <button class="mini-btn" data-edit="${item.id}">Edit</button>
          <button class="mini-btn danger" data-del="${item.id}">Remove</button>
        </div>
      </div>`;
    card.querySelector("[data-pay]").addEventListener("click", () => payRecurring(item));
    card.querySelector("[data-toggle]").addEventListener("click", () => toggleRecurring(item));
    card.querySelector("[data-edit]").addEventListener("click", () => openEditRecurring(item));
    card.querySelector("[data-del]").addEventListener("click", () => removeRecurring(item));
    el.appendChild(card);
  });
}

async function toggleRecurring(item) {
  try {
    await updateRecurringExpense(item.id, {
      name: item.name,
      amount: item.amount,
      category: item.category,
      frequency: item.frequency,
      dueDate: formatDateInput(item.dueDate),
      reminderTiming: item.reminderTiming,
      active: item.active === false,
    });
    notifySystem("Recurring expense updated", `${item.name} is now ${item.active === false ? "active" : "disabled"}.`);
  } catch {
    showToast("Error updating recurring expense", "error");
  }
}

function renderUpcomingBills() {
  const el = document.getElementById("upcoming-bills-list");
  if (!el) return;
  const due = _items
    .filter(item => item.active !== false)
    .map(item => ({ item, due: nextDueDate(item) }))
    .filter(({ due }) => daysBetween(new Date(), due) >= 0 && daysBetween(new Date(), due) <= 7)
    .sort((a, b) => a.due - b.due);

  if (!due.length) {
    el.innerHTML = '<p class="empty-msg compact">No bills due in the next 7 days.</p>';
    return;
  }

  el.innerHTML = "";
  due.forEach(({ item, due }) => {
    const row = document.createElement("div");
    row.className = "bill-row";
    row.innerHTML = `
      <div>
        <div class="bill-name">${item.name}</div>
        <div class="bill-date">${formatShortDate(due)}</div>
      </div>
      <div class="bill-actions">
        <span>${formatCurrency(item.amount)}</span>
        <button class="mini-btn" data-pay="${item.id}">Pay</button>
      </div>`;
    row.querySelector("[data-pay]").addEventListener("click", () => payRecurring(item, due));
    el.appendChild(row);
  });
}

function syncRecurringNotifications() {
  _items
    .filter(item => item.active !== false)
    .forEach(item => {
      const due = nextDueDate(item);
      const days = daysBetween(new Date(), due);
      if (days < 0 || days > reminderDays(item.reminderTiming)) return;
      const when = days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
      notifyGenerated(`recurring-${item.id}-${due.toISOString().split("T")[0]}`, {
        type: "recurring",
        icon: "📅",
        severity: days <= 1 ? "warn" : "info",
        title: `${item.name} bill due ${when}`,
        message: `${formatCurrency(item.amount)} due on ${formatShortDate(due)}.`,
        sourceId: item.id,
      });
    });
}

function payRecurring(item, due = nextDueDate(item)) {
  openAddExpense({
    amount: item.amount,
    category: item.category,
    note: item.name,
    date: due.toISOString().split("T")[0],
    recurringId: item.id,
  });
}

async function removeRecurring(item) {
  const ok = await confirmDialog("Remove Recurring Expense", `Remove "${item.name}"?`);
  if (!ok) return;
  try {
    await deleteRecurringExpense(item.id);
    notifySystem("Recurring expense removed", `${item.name} was removed.`);
    showToast("Recurring expense removed", "info");
  } catch {
    showToast("Error removing recurring expense", "error");
  }
}

export function nextDueDate(item, from = new Date()) {
  const base = item.dueDate?.toDate ? item.dueDate.toDate() : new Date(item.dueDate);
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let due = new Date(base.getFullYear(), base.getMonth(), base.getDate());

  if ((item.frequency || "monthly") === "weekly") {
    while (due < today) due.setDate(due.getDate() + 7);
    return due;
  }
  if (item.frequency === "yearly") {
    due = new Date(today.getFullYear(), base.getMonth(), base.getDate());
    if (due < today) due = new Date(today.getFullYear() + 1, base.getMonth(), base.getDate());
    return due;
  }

  due = new Date(today.getFullYear(), today.getMonth(), Math.min(base.getDate(), daysInMonth(today)));
  if (due < today) {
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    due = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(base.getDate(), daysInMonth(nextMonth)));
  }
  return due;
}

function daysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function daysBetween(a, b) {
  const one = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const two = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((two - one) / 86400000);
}

function reminderDays(value) {
  if (value === "1-day") return 1;
  if (value === "3-days") return 3;
  if (value === "7-days") return 7;
  return 0;
}

function duePhrase(item) {
  const due = item.dueDate?.toDate ? item.dueDate.toDate() : new Date(item.dueDate);
  if (item.frequency === "weekly") {
    return `Every ${due.toLocaleDateString("en-PH", { weekday: "long" })}`;
  }
  if (item.frequency === "yearly") {
    return `Every ${due.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}`;
  }
  return `Every ${ordinal(due.getDate())}`;
}

function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][Math.min(n % 10, 4)] || "th"}`;
}

function formatShortDate(date) {
  return date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

function titleCase(value) {
  return String(value || "").replace(/^\w/, c => c.toUpperCase());
}
