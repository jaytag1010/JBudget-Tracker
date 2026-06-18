import test from "node:test";
import assert from "node:assert/strict";

import {
  isQuietHoursActive, normalizeNotificationSettings, validateQuietHours,
} from "../js/notificationPrefs.js";

test("notification settings default external push and quiet hours to off", () => {
  const settings = normalizeNotificationSettings();
  assert.equal(settings.pushEnabled, false);
  assert.equal(settings.quietHours.enabled, false);
  assert.equal(settings.quietHours.startTime, "22:00");
  assert.equal(settings.quietHours.endTime, "07:00");
});

test("overnight quiet hours cover both sides of midnight", () => {
  const quiet = { enabled: true, startTime: "22:00", endTime: "07:00" };
  assert.equal(isQuietHoursActive(quiet, new Date(2026, 5, 1, 23)), true);
  assert.equal(isQuietHoursActive(quiet, new Date(2026, 5, 2, 6, 59)), true);
  assert.equal(isQuietHoursActive(quiet, new Date(2026, 5, 2, 7)), false);
});

test("same-day quiet hours stay within their interval", () => {
  const quiet = { enabled: true, startTime: "13:00", endTime: "15:00" };
  assert.equal(isQuietHoursActive(quiet, new Date(2026, 5, 1, 14)), true);
  assert.equal(isQuietHoursActive(quiet, new Date(2026, 5, 1, 16)), false);
});

test("equal quiet-hour times are rejected rather than treated as all day", () => {
  const quiet = { enabled: true, startTime: "10:00", endTime: "10:00" };
  assert.equal(validateQuietHours(quiet), "Start and end times must be different.");
  assert.equal(isQuietHoursActive(quiet, new Date(2026, 5, 1, 10)), false);
});
