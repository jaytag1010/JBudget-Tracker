import {
  listenNotifications, upsertNotification, addSystemNotification,
  markAllNotificationsRead, clearReadNotifications, markNotificationRead,
  listenProfileSettings, updateProfileSettings,
} from "../firebase/db.js";
import { auth } from "../firebase/config.js";
import { showToast } from "./ui.js";
import {
  isQuietHoursActive, millisecondsUntilQuietHoursEnd,
  normalizeNotificationSettings, validateQuietHours,
} from "./notificationPrefs.js";

let _notifications = [];
let _settings = normalizeNotificationSettings();
let _settingsReady = false;
const _delayed = new Map();

export function initNotifications() {
  bindNotificationEvents();
  listenNotifications(items => {
    _notifications = items;
    renderNotificationBadge();
    renderNotificationCenter();
  });
  listenProfileSettings(profile => {
    _settings = normalizeNotificationSettings(profile?.notificationSettings);
    _settingsReady = true;
    renderNotificationSettings();
    document.dispatchEvent(new CustomEvent("spendwise:notification-settings"));
  });
}

export function getNotificationSettings() {
  return _settings;
}

export function notifyGenerated(id, data) {
  const inApp = upsertNotification(id, {
    title: data.title,
    message: data.message,
    type: data.type || "system",
    icon: data.icon || iconForType(data.type),
    severity: data.severity || "info",
    sourceId: data.sourceId || id,
  }).catch(error => console.warn("Notification sync failed", error));
  inApp.then(() => queueExternalNotification(id, data));
  return inApp;
}

export function notifySystem(title, message) {
  return addSystemNotification({
    title,
    message,
    icon: "✅",
    severity: "success",
  }).catch(error => console.warn("System notification failed", error));
}

export function notifyExternal(id, data) {
  queueExternalNotification(id, data);
}

function bindNotificationEvents() {
  document.getElementById("notification-mark-read-btn")?.addEventListener("click", async () => {
    try {
      await markAllNotificationsRead();
      showToast("Notifications marked read", "info");
    } catch {
      showToast("Could not mark notifications read", "error");
    }
  });
  document.getElementById("notification-clear-read-btn")?.addEventListener("click", async () => {
    try {
      await clearReadNotifications();
      showToast("Read notifications cleared", "info");
    } catch {
      showToast("Could not clear notifications", "error");
    }
  });
  document.getElementById("notification-permission-btn")?.addEventListener("click", requestNotificationPermission);

  const settingsRoot = document.getElementById("page-notification-settings");
  settingsRoot?.addEventListener("change", handleSettingsChange);
}

async function handleSettingsChange() {
  if (!_settingsReady) return;
  const next = readNotificationSettingsForm();
  const quietError = validateQuietHours(next.quietHours);
  const error = document.getElementById("quiet-hours-error");
  error.textContent = quietError;
  error.classList.toggle("hidden", !quietError);
  if (quietError) return;

  setSettingsStatus("Saving...");
  try {
    await updateProfileSettings({ notificationSettings: next });
    setSettingsStatus("Notification preferences saved.");
  } catch (saveError) {
    console.error(saveError);
    setSettingsStatus("Could not save notification preferences.", true);
  }
}

function readNotificationSettingsForm() {
  return normalizeNotificationSettings({
    pushEnabled: document.getElementById("push-enabled").checked,
    recurringBillReminders: {
      enabled: document.getElementById("notify-recurring-enabled").checked,
      daysBefore: Number(document.querySelector('input[name="recurring-reminder-days"]:checked')?.value || 0),
    },
    overdueBillAlerts: {
      enabled: document.getElementById("notify-overdue-enabled").checked,
      frequency: document.getElementById("notify-overdue-frequency").value,
    },
    budgetAlerts: {
      enabled: document.getElementById("notify-budget-enabled").checked,
      thresholds: [...document.querySelectorAll('input[name="budget-threshold"]:checked')].map(input => Number(input.value)),
    },
    savingsGoalUpdates: { enabled: document.getElementById("notify-savings-enabled").checked },
    monthlySummaryNotifications: { enabled: document.getElementById("notify-monthly-enabled").checked },
    quietHours: {
      enabled: document.getElementById("quiet-hours-enabled").checked,
      startTime: document.getElementById("quiet-hours-start").value,
      endTime: document.getElementById("quiet-hours-end").value,
      timeZone: localTimeZone(),
    },
  });
}

function renderNotificationSettings() {
  setChecked("push-enabled", _settings.pushEnabled);
  setChecked("notify-recurring-enabled", _settings.recurringBillReminders.enabled);
  setChecked("notify-overdue-enabled", _settings.overdueBillAlerts.enabled);
  setChecked("notify-budget-enabled", _settings.budgetAlerts.enabled);
  setChecked("notify-savings-enabled", _settings.savingsGoalUpdates.enabled);
  setChecked("notify-monthly-enabled", _settings.monthlySummaryNotifications.enabled);
  setChecked("quiet-hours-enabled", _settings.quietHours.enabled);
  const reminder = document.querySelector(`input[name="recurring-reminder-days"][value="${_settings.recurringBillReminders.daysBefore}"]`);
  if (reminder) reminder.checked = true;
  document.querySelectorAll('input[name="budget-threshold"]').forEach(input => {
    input.checked = _settings.budgetAlerts.thresholds.includes(Number(input.value));
  });
  setValue("notify-overdue-frequency", _settings.overdueBillAlerts.frequency);
  setValue("quiet-hours-start", _settings.quietHours.startTime);
  setValue("quiet-hours-end", _settings.quietHours.endTime);
  const timezone = _settings.quietHours.timeZone || localTimeZone();
  document.getElementById("quiet-hours-timezone").textContent = `Local time zone: ${timezone || "Device default"}`;
  document.querySelectorAll(".push-dependent input, .push-dependent select").forEach(control => {
    control.disabled = !_settings.pushEnabled;
  });
  renderPermissionStatus();
}

function renderPermissionStatus() {
  const status = document.getElementById("notification-permission-status");
  const help = document.getElementById("notification-permission-help");
  const button = document.getElementById("notification-permission-btn");
  if (!status || !help || !button) return;

  if (!("Notification" in window)) {
    status.textContent = "Notifications Not Supported";
    help.textContent = "This browser cannot display external notifications. The in-app center still works.";
    button.classList.add("hidden");
    return;
  }
  if (!_settings.pushEnabled) {
    status.textContent = "Notifications Disabled";
    help.textContent = "External notifications are off. In-app notifications remain active.";
    button.classList.toggle("hidden", Notification.permission !== "default");
    return;
  }
  if (Notification.permission === "denied") {
    status.textContent = "Permission Blocked";
    help.textContent = "Enable notifications in your browser or device settings. SpendWise will not prompt again.";
    button.classList.add("hidden");
    return;
  }
  if (Notification.permission === "default") {
    status.textContent = "Permission Not Requested";
    help.textContent = "Press Enable Notifications to request browser permission.";
    button.classList.remove("hidden");
    return;
  }
  if (!("serviceWorker" in navigator) || !navigator.serviceWorker.controller) {
    status.textContent = "Service Worker Unavailable";
    help.textContent = "Foreground browser notifications are available; background push is not configured.";
    button.classList.add("hidden");
    return;
  }
  status.textContent = "Notifications Enabled";
  help.textContent = "External notifications follow your categories and Quiet Hours.";
  button.classList.add("hidden");
}

async function requestNotificationPermission() {
  if (!("Notification" in window) || Notification.permission === "denied") {
    renderPermissionStatus();
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      await updateProfileSettings({ notificationSettings: { ..._settings, pushEnabled: true } });
      showToast("Browser notifications enabled");
    }
  } catch (error) {
    console.error(error);
    showToast("Could not request notification permission", "error");
  } finally {
    renderPermissionStatus();
  }
}

function queueExternalNotification(id, data) {
  if (!canDeliverExternal(data) || delivered(deliveryKey(id, data))) return;
  if (isQuietHoursActive(_settings.quietHours)) {
    if (_delayed.has(id)) return;
    const timeout = setTimeout(() => {
      _delayed.delete(id);
      deliverExternalNotification(id, data);
    }, millisecondsUntilQuietHoursEnd(_settings.quietHours));
    _delayed.set(id, timeout);
    return;
  }
  deliverExternalNotification(id, data);
}

function deliverExternalNotification(id, data) {
  if (!canDeliverExternal(data) || delivered(deliveryKey(id, data))) return;
  if (isQuietHoursActive(_settings.quietHours)) {
    queueExternalNotification(id, data);
    return;
  }
  try {
    new Notification(data.title || "SpendWise", {
      body: data.message || "",
      icon: "icons/icon-192.png",
      tag: deliveryKey(id, data),
    });
    localStorage.setItem(deliveryKey(id, data), new Date().toISOString());
  } catch (error) {
    console.warn("External notification unavailable", error);
  }
}

function canDeliverExternal(data) {
  if (!_settingsReady || !_settings.pushEnabled) return false;
  if (!("Notification" in window) || Notification.permission !== "granted") return false;
  if (typeof data.isRelevant === "function" && !data.isRelevant()) return false;
  const category = data.externalCategory;
  if (!category || _settings[category]?.enabled !== true) return false;
  if (category === "recurringBillReminders" && Number(data.daysUntilDue) !== _settings.recurringBillReminders.daysBefore) return false;
  if (category === "budgetAlerts" && !_settings.budgetAlerts.thresholds.includes(Number(data.threshold))) return false;
  return true;
}

function deliveryKey(id, data) {
  const uid = auth.currentUser?.uid || "anonymous";
  let bucket = "once";
  if (data.externalCategory === "overdueBillAlerts") {
    const days = Number(data.daysOverdue || 0);
    const size = _settings.overdueBillAlerts.frequency === "weekly" ? 7
      : _settings.overdueBillAlerts.frequency === "every_3_days" ? 3 : 1;
    bucket = String(Math.floor(Math.max(0, days - 1) / size));
  }
  return `spendwise:external:${uid}:${id}:${bucket}`;
}

function delivered(key) {
  try { return Boolean(localStorage.getItem(key)); } catch { return false; }
}

function renderNotificationBadge() {
  const badge = document.getElementById("notification-badge");
  if (!badge) return;
  const unread = _notifications.filter(notification => notification.read !== true).length;
  badge.classList.toggle("hidden", unread === 0);
  badge.textContent = unread > 9 ? "9+" : String(unread);
}

function renderNotificationCenter() {
  const list = document.getElementById("notification-list");
  if (!list) return;
  if (!_notifications.length) {
    list.innerHTML = '<p class="empty-msg">No notifications yet.</p>';
    return;
  }
  list.innerHTML = "";
  _notifications.forEach(item => {
    const row = document.createElement("div");
    row.className = `notification-item ${item.read === true ? "read" : "unread"} ${item.severity || ""}`;
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.innerHTML = `
      <div class="notification-icon">${item.icon || iconForType(item.type)}</div>
      <div class="notification-body">
        <div class="notification-title-row"><strong>${item.title || "Notification"}</strong>${item.read === true ? "" : '<span class="notification-dot"></span>'}</div>
        <p>${item.message || ""}</p>
        <span>${formatNotificationTime(item.updatedAt || item.createdAt)}</span>
      </div>`;
    row.addEventListener("click", () => handleNotificationOpen(item));
    row.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleNotificationOpen(item);
      }
    });
    list.appendChild(row);
  });
}

async function handleNotificationOpen(item) {
  if (item.read === true) return;
  try { await markNotificationRead(item.id); }
  catch { showToast("Could not mark notification read", "error"); }
}

function iconForType(type) {
  if (type === "budget") return "⚠";
  if (type === "recurring") return "📅";
  if (type === "savings") return "💰";
  return "✅";
}

function formatNotificationTime(value) {
  if (!value) return "Just now";
  const date = value.toDate ? value.toDate() : new Date(value);
  return date.toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function setChecked(id, value) {
  const element = document.getElementById(id);
  if (element) element.checked = value;
}

function setValue(id, value) {
  const element = document.getElementById(id);
  if (element) element.value = value;
}

function setSettingsStatus(message, error = false) {
  const element = document.getElementById("notification-settings-status");
  if (!element) return;
  element.textContent = message;
  element.style.color = error ? "var(--red)" : "var(--text-muted)";
}

function localTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; }
  catch { return ""; }
}
