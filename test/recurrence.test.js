import test from "node:test";
import assert from "node:assert/strict";

import {
  dateKey, firstOccurrenceOnOrAfter, nextOccurrenceDate, occurrenceId,
  recurrenceLabel, scheduleFor, validateSchedule,
} from "../js/recurrence.js";

test("weekly schedules use JavaScript weekday values with Sunday as zero", () => {
  const item = { id: "rent", frequency: "weekly", dayOfWeek: 5, dueDate: "2026-01-01" };
  assert.equal(scheduleFor(item).dayOfWeek, 5);
  assert.equal(dateKey(firstOccurrenceOnOrAfter(item, new Date(2026, 5, 15))), "2026-06-19");
  assert.equal(dateKey(nextOccurrenceDate(item, new Date(2026, 5, 19))), "2026-06-26");
  assert.equal(recurrenceLabel(item), "Every Friday");
});

test("every weekday produces the selected next weekday", () => {
  for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek += 1) {
    const item = { frequency: "weekly", dayOfWeek, dueDate: "2026-06-01" };
    assert.equal(firstOccurrenceOnOrAfter(item, new Date(2026, 5, 15)).getDay(), dayOfWeek);
  }
});

test("monthly schedules clamp 29th through 31st to the last valid day", () => {
  for (const [day, expected] of [[29, 28], [30, 28], [31, 28]]) {
    const item = { frequency: "monthly", dayOfMonth: day, dueDate: "2025-01-01" };
    assert.equal(dateKey(firstOccurrenceOnOrAfter(item, new Date(2025, 1, 1))), `2025-02-${expected}`);
  }
  const leap = { frequency: "monthly", dayOfMonth: 31, dueDate: "2024-01-01" };
  assert.equal(dateKey(firstOccurrenceOnOrAfter(leap, new Date(2024, 1, 1))), "2024-02-29");
  assert.equal(recurrenceLabel(leap), "Every 31st");
});

test("monthly schedules preserve ordinary selected days", () => {
  for (const dayOfMonth of [1, 15, 28]) {
    const item = { frequency: "monthly", dayOfMonth, dueDate: "2026-01-01" };
    assert.equal(firstOccurrenceOnOrAfter(item, new Date(2026, 5, 1)).getDate(), dayOfMonth);
  }
});

test("yearly February 29 falls back only in non-leap years", () => {
  const item = { frequency: "yearly", month: 2, dayOfMonth: 29, dueDate: "2024-01-01" };
  assert.equal(dateKey(firstOccurrenceOnOrAfter(item, new Date(2025, 0, 1))), "2025-02-28");
  assert.equal(dateKey(firstOccurrenceOnOrAfter(item, new Date(2028, 0, 1))), "2028-02-29");
  assert.equal(recurrenceLabel(item), "Every February 29");
});

test("yearly schedules preserve common month and day combinations", () => {
  const june = { frequency: "yearly", month: 6, dayOfMonth: 15, dueDate: "2026-01-01" };
  const december = { frequency: "yearly", month: 12, dayOfMonth: 25, dueDate: "2026-01-01" };
  assert.equal(dateKey(firstOccurrenceOnOrAfter(june, new Date(2026, 0, 1))), "2026-06-15");
  assert.equal(dateKey(firstOccurrenceOnOrAfter(december, new Date(2026, 0, 1))), "2026-12-25");
});

test("yearly validation rejects impossible month and day combinations", () => {
  assert.equal(validateSchedule({ frequency: "yearly", month: 4, dayOfMonth: 31 }), "Choose a valid day for that month.");
  assert.equal(validateSchedule({ frequency: "yearly", month: 2, dayOfMonth: 29 }), "");
});

test("occurrence IDs use stable local date-only keys", () => {
  assert.equal(occurrenceId("abc", new Date(2026, 5, 25, 23, 30)), "abc_2026-06-25");
});

test("legacy records infer schedule fields from their due date", () => {
  assert.deepEqual(scheduleFor({ frequency: "monthly", dueDate: "2026-06-25" }), { frequency: "monthly", dayOfMonth: 25 });
  assert.deepEqual(scheduleFor({ frequency: "yearly", dueDate: "2026-12-25" }), { frequency: "yearly", month: 12, dayOfMonth: 25 });
});
