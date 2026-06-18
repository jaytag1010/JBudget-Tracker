import test from "node:test";
import assert from "node:assert/strict";

import {
  firstName,
  formatCurrency,
  timeBasedGreeting,
  weekdaySubtitle,
} from "../js/utils.js";

function localDate(day, hour, minute = 0) {
  return new Date(2026, 5, day, hour, minute);
}

test("time-based greeting follows the required boundaries", () => {
  assert.equal(timeBasedGreeting(localDate(15, 4, 59)), "Good Evening");
  assert.equal(timeBasedGreeting(localDate(15, 5)), "Good Morning");
  assert.equal(timeBasedGreeting(localDate(15, 11, 59)), "Good Morning");
  assert.equal(timeBasedGreeting(localDate(15, 12)), "Good Afternoon");
  assert.equal(timeBasedGreeting(localDate(15, 16, 59)), "Good Afternoon");
  assert.equal(timeBasedGreeting(localDate(15, 17)), "Good Evening");
});

test("firstName extracts the first word and supplies a fallback", () => {
  assert.equal(firstName("Jayson Taguba"), "Jayson");
  assert.equal(firstName("  Jay  "), "Jay");
  assert.equal(firstName("", "Friend"), "Friend");
});

test("weekday subtitles match the configured day", () => {
  assert.equal(weekdaySubtitle(localDate(15, 9)), "Let's start the week strong.");
  assert.equal(weekdaySubtitle(localDate(16, 9)), "Keep your spending on track.");
  assert.equal(weekdaySubtitle(localDate(21, 9)), "Ready for a new financial week?");
});

test("negative currency keeps the minus sign before the peso symbol", () => {
  assert.equal(formatCurrency(-2500), "-\u20b12,500.00");
  assert.equal(formatCurrency(10000), "\u20b110,000.00");
});
