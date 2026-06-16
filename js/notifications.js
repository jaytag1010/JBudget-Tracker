import {
  listenNotifications,
  upsertNotification,
  addSystemNotification,
  markAllNotificationsRead,
  clearReadNotifications,
  markNotificationRead,
} from "../firebase/db.js";
import { showToast } from "./ui.js";

let _notifications = [];

export function initNotifications() {
  bindNotificationEvents();
  listenNotifications(items => {
    _notifications = items;
    renderNotificationBadge();
    renderNotificationCenter();
  });
}

export function notifyGenerated(id, data) {
  return upsertNotification(id, {
    title: data.title,
    message: data.message,
    type: data.type || "system",
    icon: data.icon || iconForType(data.type),
    severity: data.severity || "info",
    sourceId: data.sourceId || id,
  }).catch(err => console.warn("Notification sync failed", err));
}

export function notifySystem(title, message) {
  return addSystemNotification({
    title,
    message,
    icon: "✅",
    severity: "success",
  }).catch(err => console.warn("System notification failed", err));
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
}

function renderNotificationBadge() {
  const badge = document.getElementById("notification-badge");
  if (!badge) return;
  const unread = _notifications.filter(n => n.read !== true).length;
  badge.classList.toggle("hidden", unread === 0);
  badge.textContent = unread > 9 ? "9+" : String(unread);
}

function renderNotificationCenter() {
  const el = document.getElementById("notification-list");
  if (!el) return;

  if (!_notifications.length) {
    el.innerHTML = '<p class="empty-msg">No notifications yet.</p>';
    return;
  }

  el.innerHTML = "";
  _notifications.forEach(item => {
    const row = document.createElement("div");
    row.className = `notification-item ${item.read === true ? "read" : "unread"} ${item.severity || ""}`;
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.innerHTML = `
      <div class="notification-icon">${item.icon || iconForType(item.type)}</div>
      <div class="notification-body">
        <div class="notification-title-row">
          <strong>${item.title || "Notification"}</strong>
          ${item.read === true ? "" : '<span class="notification-dot"></span>'}
        </div>
        <p>${item.message || ""}</p>
        <span>${formatNotificationTime(item.updatedAt || item.createdAt)}</span>
      </div>`;
    row.addEventListener("click", () => handleNotificationOpen(item));
    row.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleNotificationOpen(item);
      }
    });
    el.appendChild(row);
  });
}

async function handleNotificationOpen(item) {
  if (item.read === true) return;
  try {
    await markNotificationRead(item.id);
  } catch {
    showToast("Could not mark notification read", "error");
  }
}

function iconForType(type) {
  switch (type) {
    case "budget": return "⚠";
    case "recurring": return "📅";
    case "savings": return "💰";
    default: return "✅";
  }
}

function formatNotificationTime(value) {
  if (!value) return "Just now";
  const date = value.toDate ? value.toDate() : new Date(value);
  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
