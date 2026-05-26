// ─────────────────────────────────────────────
//  Firestore Database Operations
// ─────────────────────────────────────────────
import { db } from "./config.js";
import {
  collection, doc,
  addDoc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot,
  Timestamp, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Collection refs ──────────────────────────
const COL = {
  expenses:       "expenses",
  categories:     "categories",
  paymentMethods: "paymentMethods",
  budgets:        "budgets",
  savingsGoals:   "savingsGoals",
  settings:       "settings",
};

// ─── Expenses ────────────────────────────────

export async function addExpense(data) {
  return addDoc(collection(db, COL.expenses), {
    ...data,
    amount:    Number(data.amount),
    date:      Timestamp.fromDate(new Date(data.date)),
    createdAt: serverTimestamp(),
  });
}

export async function updateExpense(id, data) {
  return updateDoc(doc(db, COL.expenses, id), {
    ...data,
    amount: Number(data.amount),
    date:   Timestamp.fromDate(new Date(data.date)),
  });
}

export async function deleteExpense(id) {
  return deleteDoc(doc(db, COL.expenses, id));
}

// Real-time listener for all expenses, sorted newest first
export function listenExpenses(callback) {
  const q = query(
    collection(db, COL.expenses),
    orderBy("date", "desc")
  );
  return onSnapshot(q, snap => {
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(items);
  });
}

// ─── Categories ──────────────────────────────

export async function addCategory(data) {
  return addDoc(collection(db, COL.categories), {
    ...data,
    createdAt: serverTimestamp(),
  });
}

export async function updateCategory(id, data) {
  return updateDoc(doc(db, COL.categories, id), data);
}

export async function deleteCategory(id) {
  return deleteDoc(doc(db, COL.categories, id));
}

export function listenCategories(callback) {
  return onSnapshot(collection(db, COL.categories), snap => {
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(items.sort((a, b) => (a.order ?? 99) - (b.order ?? 99)));
  });
}

// Seed default categories if none exist
export async function seedDefaultCategories() {
  const snap = await getDocs(collection(db, COL.categories));
  if (!snap.empty) return;
  const defaults = [
    { name: "Food",            icon: "🍔", color: "#e74c3c", order: 0 },
    { name: "Transpo",         icon: "🚌", color: "#3498db", order: 1 },
    { name: "Online Shopping", icon: "🛍️", color: "#9b59b6", order: 2 },
    { name: "House Rent",      icon: "🏠", color: "#27ae60", order: 3 },
  ];
  for (const cat of defaults) {
    await addDoc(collection(db, COL.categories), { ...cat, createdAt: serverTimestamp() });
  }
}

// ─── Payment Methods ─────────────────────────

export async function addPaymentMethod(data) {
  return addDoc(collection(db, COL.paymentMethods), {
    ...data,
    createdAt: serverTimestamp(),
  });
}

export async function updatePaymentMethod(id, data) {
  return updateDoc(doc(db, COL.paymentMethods, id), data);
}

export async function deletePaymentMethod(id) {
  return deleteDoc(doc(db, COL.paymentMethods, id));
}

export function listenPaymentMethods(callback) {
  return onSnapshot(collection(db, COL.paymentMethods), snap => {
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(items.sort((a, b) => (a.order ?? 99) - (b.order ?? 99)));
  });
}

// Seed default payment methods if none exist
export async function seedDefaultPaymentMethods() {
  const snap = await getDocs(collection(db, COL.paymentMethods));
  if (!snap.empty) return;
  const defaults = [
    { name: "Cash",      icon: "💵", order: 0 },
    { name: "GCash",     icon: "📱", order: 1 },
    { name: "Landbank",  icon: "🏦", order: 2 },
    { name: "Maribank",  icon: "💳", order: 3 },
  ];
  for (const m of defaults) {
    await addDoc(collection(db, COL.paymentMethods), { ...m, createdAt: serverTimestamp() });
  }
}

// ─── Budgets ─────────────────────────────────
// budgets/{YYYY-MM} → { total, categories: { [catName]: amount } }

export async function getBudget(monthKey) {
  const d = await getDoc(doc(db, COL.budgets, monthKey));
  return d.exists() ? { id: d.id, ...d.data() } : null;
}

export async function setTotalBudget(monthKey, amount) {
  return setDoc(doc(db, COL.budgets, monthKey), { total: Number(amount) }, { merge: true });
}

export async function setCategoryBudget(monthKey, categoryName, amount) {
  return setDoc(
    doc(db, COL.budgets, monthKey),
    { categories: { [categoryName]: Number(amount) } },
    { merge: true }
  );
}

export async function deleteCategoryBudget(monthKey, categoryName) {
  const ref = doc(db, COL.budgets, monthKey);
  const d = await getDoc(ref);
  if (!d.exists()) return;
  const cats = d.data().categories || {};
  delete cats[categoryName];
  return updateDoc(ref, { categories: cats });
}

export function listenBudget(monthKey, callback) {
  return onSnapshot(doc(db, COL.budgets, monthKey), snap => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

// ─── Savings Goals ───────────────────────────

export async function addSavingsGoal(data) {
  return addDoc(collection(db, COL.savingsGoals), {
    ...data,
    targetAmount:  Number(data.targetAmount),
    currentAmount: Number(data.currentAmount || 0),
    deadline:      data.deadline ? Timestamp.fromDate(new Date(data.deadline)) : null,
    createdAt:     serverTimestamp(),
  });
}

export async function updateSavingsGoal(id, data) {
  const payload = {
    ...data,
    targetAmount:  Number(data.targetAmount),
    currentAmount: Number(data.currentAmount || 0),
  };
  if (data.deadline) payload.deadline = Timestamp.fromDate(new Date(data.deadline));
  else payload.deadline = null;
  return updateDoc(doc(db, COL.savingsGoals, id), payload);
}

export async function deleteSavingsGoal(id) {
  return deleteDoc(doc(db, COL.savingsGoals, id));
}

export function listenSavingsGoals(callback) {
  const q = query(collection(db, COL.savingsGoals), orderBy("createdAt", "asc"));
  return onSnapshot(q, snap => {
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(items);
  });
}

// Seed default Emergency Fund goal if none exist
export async function seedDefaultSavingsGoal() {
  const snap = await getDocs(collection(db, COL.savingsGoals));
  if (!snap.empty) return;
  await addDoc(collection(db, COL.savingsGoals), {
    name: "Emergency Fund",
    targetAmount:  50000,
    currentAmount: 0,
    deadline: null,
    createdAt: serverTimestamp(),
  });
}

// ─── Reset All Data ───────────────────────────

export async function resetAllData() {
  const colNames = Object.values(COL);
  for (const name of colNames) {
    const snap = await getDocs(collection(db, name));
    for (const d of snap.docs) await deleteDoc(d.ref);
  }
}
