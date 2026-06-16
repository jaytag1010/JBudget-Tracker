// ─────────────────────────────────────────────
//  Firestore Database Operations  (per-user)
// ─────────────────────────────────────────────
import { db } from "./config.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, doc,
  addDoc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, orderBy, onSnapshot,
  Timestamp, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Collection name constants ─────────────────
const COL = {
  expenses:       "expenses",
  categories:     "categories",
  paymentMethods: "paymentMethods",
  budgets:        "budgets",
  savingsGoals:   "savingsGoals",
  recurring:      "recurringExpenses",
  savingsHistory: "savingsContributions",
  notifications:  "notifications",
  profileSettings:"profileSettings",
};

// ── UID helper ────────────────────────────────
// All DB calls happen AFTER onAuthStateChanged fires, so currentUser is set.
function uid() {
  const user = getAuth().currentUser;
  if (!user) throw new Error("User not authenticated");
  return user.uid;
}

// ── Scoped collection / doc helpers ──────────
const userCol = (name)         => collection(db, "users", uid(), name);
const userDoc = (name, id)     => doc(db,        "users", uid(), name, id);
const userDocDirect = (name)   => doc(db,        "users", uid(), name);

// ─────────────────────────────────────────────
//  EXPENSES
// ─────────────────────────────────────────────

export async function addExpense(data) {
  return addDoc(userCol(COL.expenses), {
    ...data,
    amount:    Number(data.amount),
    date:      Timestamp.fromDate(new Date(data.date)),
    createdAt: serverTimestamp(),
  });
}

export async function updateExpense(id, data) {
  return updateDoc(userDoc(COL.expenses, id), {
    ...data,
    amount: Number(data.amount),
    date:   Timestamp.fromDate(new Date(data.date)),
  });
}

export async function deleteExpense(id) {
  return deleteDoc(userDoc(COL.expenses, id));
}

export function listenExpenses(callback) {
  const q = query(userCol(COL.expenses), orderBy("date", "desc"));
  return onSnapshot(q, snap => {
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Secondary sort: within the same transaction date, newest-entered first.
    // Uses createdAt (server timestamp set on addExpense, never updated on edits).
    // Expenses that pre-date this feature (no createdAt) keep their existing relative order.
    docs.sort((a, b) => {
      const aDate = a.date?.toDate ? a.date.toDate() : new Date(a.date || 0);
      const bDate = b.date?.toDate ? b.date.toDate() : new Date(b.date || 0);
      const diff  = bDate - aDate;
      if (diff !== 0) return diff;
      // Same date — sort by createdAt DESC; missing createdAt falls to end
      const aTs = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
      const bTs = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
      return bTs - aTs;
    });

    callback(docs);
  });
}

// ─────────────────────────────────────────────
//  CATEGORIES
// ─────────────────────────────────────────────

export async function addCategory(data) {
  return addDoc(userCol(COL.categories), { ...data, createdAt: serverTimestamp() });
}

export async function updateCategory(id, data) {
  return updateDoc(userDoc(COL.categories, id), data);
}

export async function deleteCategory(id) {
  return deleteDoc(userDoc(COL.categories, id));
}

export function listenCategories(callback) {
  return onSnapshot(userCol(COL.categories), snap => {
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(items.sort((a, b) => (a.order ?? 99) - (b.order ?? 99)));
  });
}

// Seed default categories for a brand-new user
export async function seedDefaultCategories() {
  const snap = await getDocs(userCol(COL.categories));
  if (!snap.empty) return;
  const defaults = [
    { name: "Food",            icon: "🍔", color: "#e74c3c", order: 0 },
    { name: "Transpo",         icon: "🚌", color: "#3498db", order: 1 },
    { name: "Online Shopping", icon: "🛍️", color: "#9b59b6", order: 2 },
    { name: "House Rent",      icon: "🏠", color: "#27ae60", order: 3 },
  ];
  for (const cat of defaults) {
    await addDoc(userCol(COL.categories), { ...cat, createdAt: serverTimestamp() });
  }
}

// ─────────────────────────────────────────────
//  PAYMENT METHODS
// ─────────────────────────────────────────────

export async function addPaymentMethod(data) {
  return addDoc(userCol(COL.paymentMethods), { ...data, createdAt: serverTimestamp() });
}

export async function updatePaymentMethod(id, data) {
  return updateDoc(userDoc(COL.paymentMethods, id), data);
}

export async function deletePaymentMethod(id) {
  return deleteDoc(userDoc(COL.paymentMethods, id));
}

export function listenPaymentMethods(callback) {
  return onSnapshot(userCol(COL.paymentMethods), snap => {
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(items.sort((a, b) => (a.order ?? 99) - (b.order ?? 99)));
  });
}

// Seed default payment methods for a brand-new user
export async function seedDefaultPaymentMethods() {
  const snap = await getDocs(userCol(COL.paymentMethods));
  if (!snap.empty) return;
  const defaults = [
    { name: "Cash",     icon: "💵", order: 0 },
    { name: "GCash",    icon: "📱", order: 1 },
    { name: "Landbank", icon: "🏦", order: 2 },
    { name: "Maribank", icon: "💳", order: 3 },
  ];
  for (const m of defaults) {
    await addDoc(userCol(COL.paymentMethods), { ...m, createdAt: serverTimestamp() });
  }
}

// ─────────────────────────────────────────────
//  BUDGETS  (doc ID = "YYYY-MM")
// ─────────────────────────────────────────────

export async function getBudget(monthKey) {
  const d = await getDoc(userDoc(COL.budgets, monthKey));
  return d.exists() ? { id: d.id, ...d.data() } : null;
}

export async function setTotalBudget(monthKey, amount) {
  return setDoc(userDoc(COL.budgets, monthKey), { total: Number(amount) }, { merge: true });
}

export async function setCategoryBudget(monthKey, categoryName, amount) {
  return setDoc(
    userDoc(COL.budgets, monthKey),
    { categories: { [categoryName]: Number(amount) } },
    { merge: true }
  );
}

export async function deleteCategoryBudget(monthKey, categoryName) {
  const ref = userDoc(COL.budgets, monthKey);
  const d   = await getDoc(ref);
  if (!d.exists()) return;
  const cats = d.data().categories || {};
  delete cats[categoryName];
  return updateDoc(ref, { categories: cats });
}

export function listenBudget(monthKey, callback) {
  return onSnapshot(userDoc(COL.budgets, monthKey), snap => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

export function listenAllBudgets(callback) {
  return onSnapshot(userCol(COL.budgets), snap => {
    const budgets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(budgets.sort((a, b) => a.id.localeCompare(b.id)));
  });
}

// ─────────────────────────────────────────────
//  RECURRING EXPENSES
// ─────────────────────────────────────────────

export async function addRecurringExpense(data) {
  return addDoc(userCol(COL.recurring), {
    ...data,
    amount: Number(data.amount),
    dueDate: Timestamp.fromDate(new Date(data.dueDate)),
    active: data.active !== false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateRecurringExpense(id, data) {
  const payload = {
    ...data,
    amount: Number(data.amount),
    dueDate: Timestamp.fromDate(new Date(data.dueDate)),
    active: data.active !== false,
    updatedAt: serverTimestamp(),
  };
  return updateDoc(userDoc(COL.recurring, id), payload);
}

export async function deleteRecurringExpense(id) {
  return deleteDoc(userDoc(COL.recurring, id));
}

export function listenRecurringExpenses(callback) {
  const q = query(userCol(COL.recurring), orderBy("createdAt", "asc"));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

// ─────────────────────────────────────────────
//  SAVINGS GOALS
// ─────────────────────────────────────────────

export async function addSavingsGoal(data) {
  return addDoc(userCol(COL.savingsGoals), {
    ...data,
    targetAmount:  Number(data.targetAmount),
    currentAmount: Number(data.currentAmount || 0),
    deadline:      data.deadline ? Timestamp.fromDate(new Date(data.deadline)) : null,
    createdAt:     serverTimestamp(),
  });
}

export async function updateSavingsGoal(id, data) {
  const before = await getDoc(userDoc(COL.savingsGoals, id));
  const oldAmount = before.exists() ? Number(before.data().currentAmount || 0) : 0;
  const newAmount = Number(data.currentAmount || 0);
  const payload = {
    ...data,
    targetAmount:  Number(data.targetAmount),
    currentAmount: newAmount,
  };
  payload.deadline = data.deadline ? Timestamp.fromDate(new Date(data.deadline)) : null;
  await updateDoc(userDoc(COL.savingsGoals, id), payload);
  const delta = newAmount - oldAmount;
  if (delta !== 0) {
    await addSavingsContribution({
      goalId: id,
      goalName: data.name,
      amount: delta,
      currentAmount: newAmount,
      date: new Date(),
    });
  }
}

export async function deleteSavingsGoal(id) {
  return deleteDoc(userDoc(COL.savingsGoals, id));
}

export function listenSavingsGoals(callback) {
  const q = query(userCol(COL.savingsGoals), orderBy("createdAt", "asc"));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function addSavingsContribution(data) {
  return addDoc(userCol(COL.savingsHistory), {
    goalId: data.goalId,
    goalName: data.goalName || "",
    amount: Number(data.amount),
    currentAmount: Number(data.currentAmount || 0),
    date: Timestamp.fromDate(data.date instanceof Date ? data.date : new Date(data.date || Date.now())),
    createdAt: serverTimestamp(),
  });
}

export function listenSavingsContributions(callback) {
  const q = query(userCol(COL.savingsHistory), orderBy("date", "asc"));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

// ─────────────────────────────────────────────
//  NOTIFICATIONS
// ─────────────────────────────────────────────

export async function upsertNotification(id, data) {
  const ref = userDoc(COL.notifications, id);
  const snap = await getDoc(ref);
  const prev = snap.exists() ? snap.data() : null;
  const changed = !prev || prev.title !== data.title || prev.message !== data.message;
  return setDoc(ref, {
    ...data,
    read: prev ? (changed ? false : prev.read === true) : false,
    createdAt: prev?.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function addSystemNotification(data) {
  return addDoc(userCol(COL.notifications), {
    ...data,
    type: data.type || "system",
    read: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function listenNotifications(callback) {
  const q = query(userCol(COL.notifications), orderBy("updatedAt", "desc"));
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function markAllNotificationsRead() {
  const snap = await getDocs(userCol(COL.notifications));
  for (const d of snap.docs) {
    await updateDoc(d.ref, { read: true, updatedAt: serverTimestamp() });
  }
}

export async function clearReadNotifications() {
  const snap = await getDocs(userCol(COL.notifications));
  for (const d of snap.docs) {
    if (d.data().read === true) await deleteDoc(d.ref);
  }
}

export async function markNotificationRead(id) {
  return updateDoc(userDoc(COL.notifications, id), {
    read: true,
    updatedAt: serverTimestamp(),
  });
}

// ─────────────────────────────────────────────
//  PROFILE SETTINGS
// ─────────────────────────────────────────────

export function listenProfileSettings(callback) {
  return onSnapshot(userDoc(COL.profileSettings, "profile"), snap => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

export async function updateProfileSettings(data) {
  return setDoc(userDoc(COL.profileSettings, "profile"), {
    ...data,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

// Seed default Emergency Fund goal for a brand-new user
export async function seedDefaultSavingsGoal() {
  const snap = await getDocs(userCol(COL.savingsGoals));
  if (!snap.empty) return;
  await addDoc(userCol(COL.savingsGoals), {
    name: "Emergency Fund",
    targetAmount:  50000,
    currentAmount: 0,
    deadline: null,
    createdAt: serverTimestamp(),
  });
}

// ─────────────────────────────────────────────
//  RESET  (only the current user's data)
// ─────────────────────────────────────────────

export async function resetAllData() {
  for (const name of Object.values(COL)) {
    const snap = await getDocs(userCol(name));
    for (const d of snap.docs) await deleteDoc(d.ref);
  }
}

export async function exportUserData() {
  const data = {};
  for (const name of Object.values(COL)) {
    const snap = await getDocs(userCol(name));
    data[name] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  return data;
}
