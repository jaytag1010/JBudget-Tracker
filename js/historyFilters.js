const VALID_PAGES = new Set([
  "dashboard", "history", "budgets", "savings", "recurring",
  "notifications", "notification-settings", "profile", "settings",
]);

export function parseNavigationLocation(search = "") {
  const params = new URLSearchParams(search);
  const requestedPage = params.get("page") || "dashboard";
  const page = VALID_PAGES.has(requestedPage) ? requestedPage : "dashboard";
  const year = /^\d{4}$/.test(params.get("year") || "") ? params.get("year") : "";
  const rawMonth = params.get("month") || "";
  const month = rawMonth === "all" ? "" : /^(?:[1-9]|1[0-2])$/.test(rawMonth) ? rawMonth : "";
  return {
    page,
    filters: page === "history" ? {
      category: (params.get("category") || "").trim(),
      year,
      month,
    } : null,
  };
}

export function buildNavigationUrl(pathname, page, filters = null) {
  const params = new URLSearchParams();
  if (page !== "dashboard") params.set("page", page);
  if (page === "history" && filters) {
    if (filters.category) params.set("category", filters.category);
    if (filters.year) params.set("year", String(filters.year));
    params.set("month", filters.month ? String(filters.month) : "all");
  }
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}`;
}
