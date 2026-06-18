const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function normalizeDate(value) {
  if (value?.toDate) return normalizeDate(value.toDate());
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function dateKey(value) {
  const date = normalizeDate(value);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function occurrenceId(recurringId, dueDate) {
  return `${recurringId}_${dateKey(dueDate)}`;
}

export function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function scheduleFor(item) {
  const base = normalizeDate(item.dueDate || new Date());
  const frequency = item.frequency || "monthly";
  if (frequency === "weekly") {
    return { frequency, dayOfWeek: validInteger(item.dayOfWeek, 0, 6) ? Number(item.dayOfWeek) : base.getDay() };
  }
  if (frequency === "yearly") {
    return {
      frequency,
      month: validInteger(item.month, 1, 12) ? Number(item.month) : base.getMonth() + 1,
      dayOfMonth: validInteger(item.dayOfMonth, 1, 31) ? Number(item.dayOfMonth) : base.getDate(),
    };
  }
  return {
    frequency: "monthly",
    dayOfMonth: validInteger(item.dayOfMonth, 1, 31) ? Number(item.dayOfMonth) : base.getDate(),
  };
}

export function validateSchedule(schedule) {
  if (schedule.frequency === "weekly") {
    return validInteger(schedule.dayOfWeek, 0, 6) ? "" : "Choose one weekday.";
  }
  if (schedule.frequency === "monthly") {
    return validInteger(schedule.dayOfMonth, 1, 31) ? "" : "Choose a day from 1 through 31.";
  }
  if (schedule.frequency === "yearly") {
    if (!validInteger(schedule.month, 1, 12)) return "Choose a valid month.";
    if (!validInteger(schedule.dayOfMonth, 1, 31)) return "Choose a valid day.";
    const max = schedule.month === 2 ? 29 : daysInMonth(2024, Number(schedule.month) - 1);
    if (Number(schedule.dayOfMonth) > max) return "Choose a valid day for that month.";
    return "";
  }
  return "Choose a valid frequency.";
}

export function occurrenceDate(schedule, year, monthIndex = null) {
  if (schedule.frequency === "yearly") {
    const index = Number(schedule.month) - 1;
    return new Date(year, index, Math.min(Number(schedule.dayOfMonth), daysInMonth(year, index)));
  }
  const index = monthIndex;
  return new Date(year, index, Math.min(Number(schedule.dayOfMonth), daysInMonth(year, index)));
}

export function firstOccurrenceOnOrAfter(item, from) {
  const start = normalizeDate(from);
  const base = normalizeDate(item.dueDate);
  const effective = item.scheduleEffectiveDate ? normalizeDate(item.scheduleEffectiveDate) : base;
  const floor = new Date(Math.max(start.getTime(), base.getTime(), effective.getTime()));
  const schedule = scheduleFor(item);

  if (schedule.frequency === "weekly") {
    const result = new Date(floor);
    const offset = (schedule.dayOfWeek - result.getDay() + 7) % 7;
    result.setDate(result.getDate() + offset);
    return result;
  }
  if (schedule.frequency === "yearly") {
    let result = occurrenceDate(schedule, floor.getFullYear());
    if (result < floor) result = occurrenceDate(schedule, floor.getFullYear() + 1);
    return result;
  }
  let result = occurrenceDate(schedule, floor.getFullYear(), floor.getMonth());
  if (result < floor) {
    const next = new Date(floor.getFullYear(), floor.getMonth() + 1, 1);
    result = occurrenceDate(schedule, next.getFullYear(), next.getMonth());
  }
  return result;
}

export function nextOccurrenceDate(item, current) {
  const date = normalizeDate(current);
  const schedule = scheduleFor(item);
  if (schedule.frequency === "weekly") {
    date.setDate(date.getDate() + 7);
    return date;
  }
  if (schedule.frequency === "yearly") return occurrenceDate(schedule, date.getFullYear() + 1);
  const next = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return occurrenceDate(schedule, next.getFullYear(), next.getMonth());
}

export function occurrencesInRange(item, start, end) {
  const last = normalizeDate(end);
  const dates = [];
  let cursor = firstOccurrenceOnOrAfter(item, start);
  let guard = 0;
  while (cursor <= last && guard < 1000) {
    dates.push(new Date(cursor));
    cursor = nextOccurrenceDate(item, cursor);
    guard += 1;
  }
  return dates;
}

export function nextDueDate(item, from = new Date()) {
  return firstOccurrenceOnOrAfter(item, from);
}

export function recurrenceLabel(item) {
  const schedule = scheduleFor(item);
  if (schedule.frequency === "weekly") return `Every ${DAY_NAMES[schedule.dayOfWeek]}`;
  if (schedule.frequency === "yearly") return `Every ${MONTH_NAMES[schedule.month - 1]} ${schedule.dayOfMonth}`;
  return `Every ${ordinal(schedule.dayOfMonth)}`;
}

export function daysBetween(from, to) {
  return Math.round((normalizeDate(to) - normalizeDate(from)) / 86400000);
}

export function reminderDays(value) {
  if (value === "1-day") return 1;
  if (value === "3-days") return 3;
  if (value === "7-days") return 7;
  return 0;
}

function ordinal(number) {
  const value = Number(number);
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  return `${value}${["th", "st", "nd", "rd"][Math.min(value % 10, 4)] || "th"}`;
}

function validInteger(value, min, max) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max;
}
