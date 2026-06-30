import test from "node:test";
import assert from "node:assert/strict";

import { CORE_DATA_SOURCES, classifyFirebaseError, evaluateCoreData } from "../js/connectionState.js";

function snapshots(fromCache, sizes = {}) {
  return new Map(CORE_DATA_SOURCES.map(source => [source, { source, fromCache, size: sizes[source] || 0 }]));
}

test("core data is not ready until every required source responds", () => {
  const partial = snapshots(false);
  partial.delete("expenses");
  assert.deepEqual(evaluateCoreData(partial, true), { ready: false, mode: "loading" });
});

test("verified server snapshots produce online state", () => {
  assert.deepEqual(evaluateCoreData(snapshots(false), true), { ready: true, mode: "online" });
});

test("offline cache is usable only when cached account data exists", () => {
  assert.deepEqual(evaluateCoreData(snapshots(true, { expenses: 2 }), false), { ready: true, mode: "offline-cache" });
  assert.deepEqual(evaluateCoreData(snapshots(true), false), { ready: false, mode: "offline-empty" });
});

test("Firebase errors are classified without exposing raw details", () => {
  assert.equal(classifyFirebaseError({ code: "permission-denied" }).kind, "permission");
  assert.equal(classifyFirebaseError({ code: "permission-denied" }).reauthenticate, false);
  assert.equal(classifyFirebaseError({ code: "permission-denied" }).retryable, true);
  assert.equal(classifyFirebaseError({ code: "auth/user-token-expired" }).reauthenticate, true);
  assert.equal(classifyFirebaseError({ code: "unavailable" }).kind, "network");
  assert.equal(classifyFirebaseError({ code: "auth/user-token-expired" }).kind, "auth");
});
