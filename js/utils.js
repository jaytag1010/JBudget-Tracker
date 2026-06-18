// ─── Formatting ──────────────────────────────

export function formatCurrency(amount) {
  const n = Number(amount) || 0;
  return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(timestamp) {
  if (!timestamp) return "";
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateInput(timestamp) {
  if (!timestamp) return todayISO();
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return d.toISOString().split("T")[0];
}

export function todayISO() {
  return new Date().toISOString().split("T")[0];
}

export function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString("en-PH", { month: "long", year: "numeric" });
}

export function greeting() {
  return timeBasedGreeting(new Date());
}

export function timeBasedGreeting(date = new Date()) {
  const h = date.getHours();
  if (h >= 5 && h < 12) return "Good Morning";
  if (h >= 12 && h < 17) return "Good Afternoon";
  return "Good Evening";
}

export function firstName(displayName, fallback = "Friend") {
  const clean = String(displayName || "").trim();
  return clean ? clean.split(/\s+/)[0] : fallback;
}

export function weekdaySubtitle(date = new Date()) {
  return [
    "Ready for a new financial week?",
    "Let's start the week strong.",
    "Keep your spending on track.",
    "Halfway through the week.",
    "A little planning goes a long way.",
    "Weekend spending is coming up.",
    "Enjoy your weekend wisely.",
  ][date.getDay()];
}

// Filter expenses to a given YYYY-MM month string
export function expensesForMonth(expenses, key) {
  return expenses.filter(e => {
    const d = e.date?.toDate ? e.date.toDate() : new Date(e.date);
    return monthKey(d) === key;
  });
}

// Sum amounts
export function sumAmounts(expenses) {
  return expenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
}

// Group by category → { catName: total }
export function groupByCategory(expenses) {
  return expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + (Number(e.amount) || 0);
    return acc;
  }, {});
}

// Clamp 0-100
export function pct(part, total) {
  if (!total) return 0;
  return Math.min(100, Math.round((part / total) * 100));
}

// ── Safe arithmetic expression evaluator ──────
// Accepts: digits, decimal point, +  -  *  /  ( )
// Rejects anything else so no arbitrary JS can run.
// Returns a rounded number, or null if invalid/unsafe.
export function evaluateExpression(expr) {
  if (!expr && expr !== 0) return null;
  const cleaned = String(expr).replace(/[₱,\s]/g, "").trim();
  if (!cleaned) return null;

  // Plain number fast-path
  const plain = Number(cleaned);
  if (!isNaN(plain) && isFinite(plain)) return Math.round(plain * 100) / 100;

  // Whitelist: only safe arithmetic characters allowed
  if (!/^[0-9+\-*/().]+$/.test(cleaned)) return null;

  try {
    // eslint-disable-next-line no-new-func
    const result = new Function('"use strict"; return (' + cleaned + ')')();
    if (typeof result !== "number" || !isFinite(result) || result < 0) return null;
    return Math.round(result * 100) / 100;
  } catch {
    return null;
  }
}

// Generate last 12 months as options
export function lastTwelveMonths() {
  const months = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: monthKey(d), label: monthLabel(monthKey(d)) });
  }
  return months;
}
