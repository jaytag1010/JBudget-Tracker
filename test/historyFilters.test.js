import test from "node:test";
import assert from "node:assert/strict";

import { buildNavigationUrl, parseNavigationLocation } from "../js/historyFilters.js";

test("monthly History URLs preserve categories with spaces", () => {
  const url = buildNavigationUrl("/", "history", { category: "Online Shopping", year: 2026, month: 6 });
  assert.equal(url, "/?page=history&category=Online+Shopping&year=2026&month=6");
  assert.deepEqual(parseNavigationLocation(url.slice(1)), {
    page: "history",
    filters: { category: "Online Shopping", year: "2026", month: "6" },
  });
});

test("annual History URLs use all months", () => {
  const url = buildNavigationUrl("/", "history", { category: "Transportation", year: 2026, month: "" });
  assert.equal(url, "/?page=history&category=Transportation&year=2026&month=all");
  assert.equal(parseNavigationLocation(url.slice(1)).filters.month, "");
});

test("invalid route filters fall back safely", () => {
  assert.deepEqual(parseNavigationLocation("?page=history&year=nope&month=99"), {
    page: "history",
    filters: { category: "", year: "", month: "" },
  });
});
