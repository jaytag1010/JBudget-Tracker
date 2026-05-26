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
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
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
