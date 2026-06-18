export const DEFAULT_NOTIFICATION_SETTINGS = Object.freeze({
  pushEnabled: false,
  recurringBillReminders: { enabled: true, daysBefore: 0 },
  overdueBillAlerts: { enabled: true, frequency: "daily" },
  budgetAlerts: { enabled: true, thresholds: [80, 90, 95, 100] },
  savingsGoalUpdates: { enabled: true },
  monthlySummaryNotifications: { enabled: false },
  quietHours: { enabled: false, startTime: "22:00", endTime: "07:00", timeZone: "" },
});

export function normalizeNotificationSettings(saved = {}) {
  const quiet = saved.quietHours || {};
  const thresholds = Array.isArray(saved.budgetAlerts?.thresholds)
    ? saved.budgetAlerts.thresholds.map(Number).filter(value => [80, 90, 95, 100].includes(value))
    : [...DEFAULT_NOTIFICATION_SETTINGS.budgetAlerts.thresholds];
  return {
    pushEnabled: saved.pushEnabled === true,
    recurringBillReminders: {
      enabled: saved.recurringBillReminders?.enabled !== false,
      daysBefore: [0, 1, 3, 7].includes(Number(saved.recurringBillReminders?.daysBefore))
        ? Number(saved.recurringBillReminders.daysBefore) : 0,
    },
    overdueBillAlerts: {
      enabled: saved.overdueBillAlerts?.enabled !== false,
      frequency: ["daily", "every_3_days", "weekly"].includes(saved.overdueBillAlerts?.frequency)
        ? saved.overdueBillAlerts.frequency : "daily",
    },
    budgetAlerts: { enabled: saved.budgetAlerts?.enabled !== false, thresholds },
    savingsGoalUpdates: { enabled: saved.savingsGoalUpdates?.enabled !== false },
    monthlySummaryNotifications: { enabled: saved.monthlySummaryNotifications?.enabled === true },
    quietHours: {
      enabled: quiet.enabled === true,
      startTime: validTime(quiet.startTime) ? quiet.startTime : "22:00",
      endTime: validTime(quiet.endTime) ? quiet.endTime : "07:00",
      timeZone: typeof quiet.timeZone === "string" ? quiet.timeZone : "",
    },
  };
}

export function validateQuietHours(quietHours) {
  if (!validTime(quietHours.startTime) || !validTime(quietHours.endTime)) return "Choose valid start and end times.";
  if (quietHours.startTime === quietHours.endTime) return "Start and end times must be different.";
  return "";
}

export function isQuietHoursActive(quietHours, date = new Date()) {
  if (!quietHours?.enabled || validateQuietHours(quietHours)) return false;
  const current = date.getHours() * 60 + date.getMinutes();
  const start = minutes(quietHours.startTime);
  const end = minutes(quietHours.endTime);
  return start > end ? current >= start || current < end : current >= start && current < end;
}

export function millisecondsUntilQuietHoursEnd(quietHours, date = new Date()) {
  if (!isQuietHoursActive(quietHours, date)) return 0;
  const end = minutes(quietHours.endTime);
  const current = date.getHours() * 60 + date.getMinutes();
  let delta = end - current;
  if (delta <= 0) delta += 24 * 60;
  return delta * 60000 - date.getSeconds() * 1000 - date.getMilliseconds();
}

function validTime(value) {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function minutes(value) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}
