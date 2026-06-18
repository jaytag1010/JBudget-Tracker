import {
  listenRecurringExpenses, addRecurringExpense, updateRecurringExpense, deleteRecurringExpense,
  listenRecurringOccurrences, skipRecurringOccurrence,
} from "../firebase/db.js";
import { openModal, closeModal, showToast, confirmDialog } from "./ui.js";
import { formatCurrency, todayISO } from "./utils.js";
import {
  dateKey, daysBetween, firstOccurrenceOnOrAfter, nextDueDate, occurrenceId,
  occurrencesInRange, recurrenceLabel, reminderDays, scheduleFor, validateSchedule,
} from "./recurrence.js";
import { getCategories } from "./settings.js";
import { openAddExpense } from "./expenses.js";
import { getNotificationSettings, notifyExternal, notifyGenerated, notifySystem } from "./notifications.js";

let _items = [];
let _occurrenceStatuses = [];
let _editingId = null;
let _skipTarget = null;
const _resolving = new Set();

export function initRecurring() {
  bindRecurringEvents();
  listenRecurringExpenses(items => {
    _items = items;
    renderRecurringPage();
    renderUpcomingBills();
    syncRecurringNotifications();
  });
  listenRecurringOccurrences(items => {
    _occurrenceStatuses = items;
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

function bindRecurringEvents() {
  document.getElementById("add-recurring-btn")?.addEventListener("click", openAddRecurring);
  document.getElementById("recurring-form")?.addEventListener("submit", handleRecurringSubmit);
  document.getElementById("recurring-frequency")?.addEventListener("change", renderScheduleFields);
  document.getElementById("skip-occurrence-cancel")?.addEventListener("click", closeSkipModal);
  document.getElementById("skip-occurrence-confirm")?.addEventListener("click", confirmSkipOccurrence);
  document.getElementById("modal-skip-occurrence")?.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.stopPropagation();
      if (!_skipTarget?.saving) closeSkipModal();
    }
    if (event.key === "Tab") trapSkipFocus(event);
  });
  document.addEventListener("spendwise:notification-settings", syncRecurringNotifications);
}

function openAddRecurring() {
  _editingId = null;
  document.getElementById("modal-recurring-title").textContent = "Add Recurring Expense";
  document.getElementById("recurring-form").reset();
  document.getElementById("recurring-id").value = "";
  document.getElementById("recurring-frequency").value = "monthly";
  document.getElementById("recurring-day-of-week").value = String(new Date().getDay());
  document.getElementById("recurring-day-of-month").value = String(new Date().getDate());
  document.getElementById("recurring-year-month").value = String(new Date().getMonth() + 1);
  document.getElementById("recurring-year-day").value = String(new Date().getDate());
  document.getElementById("recurring-reminder").value = "same-day";
  document.getElementById("recurring-active").checked = true;
  populateRecurringCategories("");
  renderScheduleFields();
  setScheduleError("");
  openModal("modal-recurring");
}

function openEditRecurring(item) {
  _editingId = item.id;
  const schedule = scheduleFor(item);
  document.getElementById("modal-recurring-title").textContent = "Edit Recurring Expense";
  document.getElementById("recurring-id").value = item.id;
  document.getElementById("recurring-name").value = item.name || "";
  document.getElementById("recurring-amount").value = item.amount || "";
  document.getElementById("recurring-frequency").value = schedule.frequency;
  document.getElementById("recurring-day-of-week").value = String(schedule.dayOfWeek ?? 1);
  document.getElementById("recurring-day-of-month").value = String(schedule.dayOfMonth ?? 1);
  document.getElementById("recurring-year-month").value = String(schedule.month ?? 1);
  document.getElementById("recurring-year-day").value = String(schedule.dayOfMonth ?? 1);
  document.getElementById("recurring-reminder").value = item.reminderTiming || "same-day";
  document.getElementById("recurring-active").checked = item.active !== false;
  populateRecurringCategories(item.category || "");
  renderScheduleFields();
  setScheduleError("");
  openModal("modal-recurring");
}

function populateRecurringCategories(selected) {
  const select = document.getElementById("recurring-category");
  if (!select) return;
  select.innerHTML = '<option value="">Choose category...</option>';
  getCategories().forEach(category => {
    const option = document.createElement("option");
    option.value = category.name;
    option.textContent = `${category.icon} ${category.name}`;
    option.selected = category.name === selected;
    select.appendChild(option);
  });
}

function scheduleFromForm() {
  const frequency = document.getElementById("recurring-frequency").value;
  if (frequency === "weekly") {
    return { frequency, dayOfWeek: Number(document.getElementById("recurring-day-of-week").value) };
  }
  if (frequency === "yearly") {
    return {
      frequency,
      month: Number(document.getElementById("recurring-year-month").value),
      dayOfMonth: Number(document.getElementById("recurring-year-day").value),
    };
  }
  return { frequency: "monthly", dayOfMonth: Number(document.getElementById("recurring-day-of-month").value) };
}

function renderScheduleFields() {
  const frequency = document.getElementById("recurring-frequency")?.value || "monthly";
  document.getElementById("recurring-weekly-fields")?.classList.toggle("hidden", frequency !== "weekly");
  document.getElementById("recurring-monthly-fields")?.classList.toggle("hidden", frequency !== "monthly");
  document.getElementById("recurring-yearly-fields")?.classList.toggle("hidden", frequency !== "yearly");
}

async function handleRecurringSubmit(event) {
  event.preventDefault();
  const schedule = scheduleFromForm();
  const scheduleError = validateSchedule(schedule);
  setScheduleError(scheduleError);
  if (scheduleError) return;

  const existing = _items.find(item => item.id === _editingId);
  const ruleChanged = existing && JSON.stringify(scheduleFor(existing)) !== JSON.stringify(schedule);
  const anchor = firstOccurrenceOnOrAfter({ ...schedule, dueDate: todayISO() }, new Date());
  const data = normalizeRecurring({
    name: document.getElementById("recurring-name").value.trim(),
    amount: parseFloat(document.getElementById("recurring-amount").value),
    category: document.getElementById("recurring-category").value,
    ...schedule,
    dueDate: ruleChanged || !existing ? dateKey(anchor) : dateKey(existing.dueDate),
    scheduleEffectiveDate: ruleChanged ? todayISO() : existing?.scheduleEffectiveDate || null,
    reminderTiming: document.getElementById("recurring-reminder").value,
    active: document.getElementById("recurring-active").checked,
  });

  if (!data.name) return showToast("Enter a recurring name", "error");
  if (!data.amount || data.amount <= 0) return showToast("Enter a valid amount", "error");
  if (!data.category) return showToast("Choose a category", "error");

  const submit = document.getElementById("recurring-submit-btn");
  submit.disabled = true;
  submit.textContent = "Saving...";
  try {
    if (_editingId) {
      await updateRecurringExpense(_editingId, data);
      await notifySystem("Recurring expense updated", `${data.name} was updated.`);
      showToast("Recurring expense updated");
    } else {
      await addRecurringExpense(data);
      await notifySystem("Recurring expense added", `${data.name} reminders are active.`);
      showToast("Recurring expense added");
    }
    closeModal("modal-recurring");
  } catch (error) {
    console.error(error);
    showToast("Error saving recurring expense", "error");
  } finally {
    submit.disabled = false;
    submit.textContent = "Save Recurring Expense";
  }
}

function normalizeRecurring(data) {
  const schedule = scheduleFor(data);
  const normalized = {
    name: data.name,
    amount: Number(data.amount),
    category: data.category,
    frequency: schedule.frequency,
    dueDate: data.dueDate,
    reminderTiming: data.reminderTiming || "same-day",
    active: data.active !== false,
  };
  if (schedule.frequency === "weekly") normalized.dayOfWeek = schedule.dayOfWeek;
  if (schedule.frequency === "monthly") normalized.dayOfMonth = schedule.dayOfMonth;
  if (schedule.frequency === "yearly") {
    normalized.month = schedule.month;
    normalized.dayOfMonth = schedule.dayOfMonth;
  }
  if (data.scheduleEffectiveDate) normalized.scheduleEffectiveDate = data.scheduleEffectiveDate;
  return normalized;
}

function setScheduleError(message) {
  const element = document.getElementById("recurring-schedule-error");
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("hidden", !message);
}

function renderRecurringPage() {
  const list = document.getElementById("recurring-list");
  if (!list) return;
  if (!_items.length) {
    list.innerHTML = '<p class="empty-msg">No recurring expenses yet.</p>';
    return;
  }
  list.innerHTML = "";
  _items.forEach(item => {
    const card = document.createElement("div");
    card.className = "recurring-card";
    const payable = nextPayableOccurrence(item);
    card.innerHTML = `
      <div class="recurring-main">
        <div class="recurring-check">${item.active === false ? "○" : "☑"}</div>
        <div class="recurring-info">
          <div class="recurring-name">${item.name}</div>
          <div class="recurring-meta">${recurrenceLabel(item)}</div>
        </div>
        <div class="recurring-amount">${formatCurrency(item.amount)}</div>
      </div>
      <div class="recurring-footer">
        <span>${payable ? `Next unresolved: ${formatShortDate(payable.due)}` : "No unresolved occurrence"}</span>
        <div>
          <button class="mini-btn" data-pay ${payable && item.active !== false ? "" : "disabled"}>Pay</button>
          <button class="mini-btn" data-toggle>${item.active === false ? "Enable" : "Disable"}</button>
          <button class="mini-btn" data-edit>Edit</button>
          <button class="mini-btn danger" data-del>Remove</button>
        </div>
      </div>`;
    card.querySelector("[data-pay]").addEventListener("click", () => payable && payOccurrence(payable));
    card.querySelector("[data-toggle]").addEventListener("click", () => toggleRecurring(item));
    card.querySelector("[data-edit]").addEventListener("click", () => openEditRecurring(item));
    card.querySelector("[data-del]").addEventListener("click", () => removeRecurring(item));
    list.appendChild(card);
  });
}

async function toggleRecurring(item) {
  try {
    await updateRecurringExpense(item.id, { ...normalizeRecurring({ ...item, dueDate: dateKey(item.dueDate) }), active: item.active === false });
    await notifySystem("Recurring expense updated", `${item.name} is now ${item.active === false ? "active" : "disabled"}.`);
  } catch {
    showToast("Error updating recurring expense", "error");
  }
}

function renderUpcomingBills() {
  const list = document.getElementById("upcoming-bills-list");
  if (!list) return;
  const occurrences = buildVisibleOccurrences();
  if (!occurrences.length) {
    list.innerHTML = '<p class="empty-msg compact">No unresolved bills this month.</p>';
    return;
  }
  list.innerHTML = "";
  occurrences.forEach(occurrence => {
    const row = document.createElement("div");
    row.className = `bill-row${occurrence.overdue ? " overdue" : ""}`;
    row.innerHTML = `
      <div>
        <div class="bill-name">${occurrence.item.name}</div>
        <div class="bill-date">Due: ${formatShortDate(occurrence.due)} · ${recurrenceLabel(occurrence.item)}</div>
        ${occurrence.overdue ? `<div class="overdue-badge">OVERDUE by ${occurrence.daysOverdue} day${occurrence.daysOverdue === 1 ? "" : "s"}</div>` : ""}
      </div>
      <div class="bill-actions">
        <span>${formatCurrency(occurrence.item.amount)}</span>
        <button class="mini-btn" data-skip>Skip</button>
        <button class="mini-btn" data-pay>Pay</button>
      </div>`;
    row.querySelector("[data-skip]").addEventListener("click", () => openSkipModal(occurrence));
    row.querySelector("[data-pay]").addEventListener("click", event => payOccurrence(occurrence, event.currentTarget));
    list.appendChild(row);
  });
}

function buildVisibleOccurrences(now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(today.getFullYear(), today.getMonth() - 12, 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return _items.filter(item => item.active !== false)
    .flatMap(item => buildOccurrences(item, start, end, today))
    .filter(occurrence => occurrence.status === "pending")
    .filter(occurrence => occurrence.due <= today || sameMonth(occurrence.due, today))
    .sort((a, b) => a.due - b.due || a.item.name.localeCompare(b.item.name));
}

function buildOccurrences(item, start, end, today = new Date()) {
  const statusMap = new Map(_occurrenceStatuses.map(status => [status.id, status]));
  return occurrencesInRange(item, start, end).map(due => {
    const id = occurrenceId(item.id, due);
    const status = statusMap.get(id)?.status || "pending";
    return {
      id, item, due, dueKey: dateKey(due), status,
      overdue: status === "pending" && due < today,
      daysOverdue: Math.max(0, daysBetween(due, today)),
    };
  });
}

function nextPayableOccurrence(item, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth() - 12, 1);
  const end = new Date(now.getFullYear() + 2, now.getMonth(), now.getDate());
  return buildOccurrences(item, start, end, new Date(now.getFullYear(), now.getMonth(), now.getDate()))
    .find(occurrence => occurrence.status === "pending");
}

function syncRecurringNotifications() {
  buildVisibleOccurrences().forEach(occurrence => {
    const days = daysBetween(new Date(), occurrence.due);
    const inAppDue = occurrence.overdue || (days >= 0 && days <= reminderDays(occurrence.item.reminderTiming));
    const pushSettings = getNotificationSettings();
    const externalDue = occurrence.overdue || days === pushSettings.recurringBillReminders.daysBefore;
    if (!inAppDue && !externalDue) return;
    const when = occurrence.overdue
      ? `overdue by ${occurrence.daysOverdue} day${occurrence.daysOverdue === 1 ? "" : "s"}`
      : days === 0 ? "due today" : days === 1 ? "due tomorrow" : `due in ${days} days`;
    const payload = {
      type: "recurring",
      icon: occurrence.overdue ? "🔴" : "📅",
      severity: occurrence.overdue ? "danger" : days <= 1 ? "warn" : "info",
      title: `${occurrence.item.name} ${when}`,
      message: `${formatCurrency(occurrence.item.amount)} due on ${formatShortDate(occurrence.due)}.`,
      sourceId: occurrence.id,
      externalCategory: occurrence.overdue ? "overdueBillAlerts" : "recurringBillReminders",
      daysUntilDue: days,
      daysOverdue: occurrence.daysOverdue,
      isRelevant: () => !_occurrenceStatuses.some(status => status.id === occurrence.id && status.status !== "pending"),
    };
    if (inAppDue) notifyGenerated(`recurring-${occurrence.id}`, { ...payload, externalCategory: null });
    if (externalDue) notifyExternal(`recurring-${occurrence.id}`, payload);
  });
}

function openSkipModal(occurrence) {
  if (_resolving.has(occurrence.id)) return;
  _skipTarget = { occurrence, saving: false, returnFocus: document.activeElement };
  document.getElementById("skip-occurrence-name").textContent = `${occurrence.item.name} due ${formatShortDate(occurrence.due)}`;
  document.getElementById("skip-occurrence-error").classList.add("hidden");
  openModal("modal-skip-occurrence");
  document.getElementById("skip-occurrence-cancel").focus();
}

function closeSkipModal() {
  if (_skipTarget?.saving) return;
  const returnFocus = _skipTarget?.returnFocus;
  closeModal("modal-skip-occurrence");
  _skipTarget = null;
  if (returnFocus?.isConnected) returnFocus.focus();
}

function trapSkipFocus(event) {
  const modal = document.getElementById("modal-skip-occurrence");
  const focusable = [...modal.querySelectorAll("button:not([disabled])")];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

async function confirmSkipOccurrence() {
  const target = _skipTarget;
  if (!target || target.saving || _resolving.has(target.occurrence.id)) return;
  target.saving = true;
  _resolving.add(target.occurrence.id);
  const button = document.getElementById("skip-occurrence-confirm");
  button.disabled = true;
  button.textContent = "Skipping...";
  try {
    await skipRecurringOccurrence(target.occurrence.id, occurrencePayload(target.occurrence));
    closeModal("modal-skip-occurrence");
    _skipTarget = null;
    if (target.returnFocus?.isConnected) target.returnFocus.focus();
    showToast("Bill occurrence skipped", "info");
  } catch (error) {
    const message = error?.code === "occurrence-already-paid" ? "A paid occurrence cannot be skipped."
      : error?.code === "occurrence-already-skipped" ? "This occurrence is already skipped."
        : "Could not skip this occurrence. Try again.";
    const errorElement = document.getElementById("skip-occurrence-error");
    errorElement.textContent = message;
    errorElement.classList.remove("hidden");
    target.saving = false;
  } finally {
    _resolving.delete(target.occurrence.id);
    button.disabled = false;
    button.textContent = "Skip Occurrence";
  }
}

function payOccurrence(occurrence, button = null) {
  if (_resolving.has(occurrence.id)) return;
  if (button) {
    button.disabled = true;
    button.textContent = "Opening...";
    setTimeout(() => { button.disabled = false; button.textContent = "Pay"; }, 500);
  }
  openAddExpense({
    amount: occurrence.item.amount,
    category: occurrence.item.category,
    note: occurrence.item.name,
    date: occurrence.dueKey,
    recurringId: occurrence.item.id,
    recurringOccurrenceId: occurrence.id,
    recurringDueDate: occurrence.dueKey,
    recurringName: occurrence.item.name,
  });
}

function occurrencePayload(occurrence) {
  return {
    recurringId: occurrence.item.id,
    recurringName: occurrence.item.name,
    occurrenceDate: occurrence.dueKey,
    dueDate: occurrence.dueKey,
    amount: Number(occurrence.item.amount || 0),
    category: occurrence.item.category || "",
  };
}

async function removeRecurring(item) {
  const confirmed = await confirmDialog("Remove Recurring Expense", `Remove "${item.name}"?`);
  if (!confirmed) return;
  try {
    await deleteRecurringExpense(item.id);
    await notifySystem("Recurring expense removed", `${item.name} was removed.`);
    showToast("Recurring expense removed", "info");
  } catch {
    showToast("Error removing recurring expense", "error");
  }
}

function sameMonth(first, second) {
  return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth();
}

function formatShortDate(date) {
  return date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

export { nextDueDate } from "./recurrence.js";
