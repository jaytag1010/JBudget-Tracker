export const CORE_DATA_SOURCES = ["budgets", "expenses", "profileSettings"];

export function classifyFirebaseError(error, online = true) {
  const code = String(error?.code || "").toLowerCase();
  if (code.includes("permission-denied")) {
    return { kind: "permission", title: "Data access denied", message: "We could not access part of your SpendWise data. Check account permissions and retry.", retryable: true, reauthenticate: false };
  }
  if (code.includes("unauthenticated") || code.includes("user-token-expired")) {
    return { kind: "auth", title: "Session expired", message: "Your session has expired. Please sign in again.", retryable: false, reauthenticate: true };
  }
  if (code.includes("invalid-api-key") || code.includes("app/no-options") || code.includes("invalid-argument")) {
    return { kind: "configuration", title: "Configuration error", message: "SpendWise could not start because its Firebase configuration is incomplete.", retryable: false };
  }
  if (!online || code.includes("unavailable") || code.includes("network-request-failed") || code.includes("deadline-exceeded")) {
    return { kind: "network", title: "You appear to be offline", message: "Reconnect to the internet and try again. Saved data remains available when cached.", retryable: true };
  }
  return { kind: "unknown", title: "SpendWise could not load", message: "Firebase did not respond successfully. Try the connection again.", retryable: true };
}

export function evaluateCoreData(snapshots, online = true) {
  const entries = CORE_DATA_SOURCES.map(source => snapshots.get(source));
  if (entries.some(entry => !entry)) return { ready: false, mode: "loading" };
  if (entries.every(entry => entry.fromCache === false)) return { ready: true, mode: "online" };
  const hasCachedData = entries.some(entry => entry.fromCache && entry.size > 0);
  if (!online && hasCachedData) return { ready: true, mode: "offline-cache" };
  if (!online) return { ready: false, mode: "offline-empty" };
  return { ready: false, mode: "syncing" };
}
