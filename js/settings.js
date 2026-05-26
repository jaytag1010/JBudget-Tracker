// ─── Settings Module ─────────────────────────
import {
  addCategory, updateCategory, deleteCategory, listenCategories, seedDefaultCategories,
  addPaymentMethod, updatePaymentMethod, deletePaymentMethod, listenPaymentMethods,
  seedDefaultPaymentMethods, resetAllData,
} from "../firebase/db.js";
import { openModal, closeModal, showToast, confirmDialog, renderColorPicker, CATEGORY_COLORS } from "./ui.js";

// ── In-memory caches (updated by real-time listeners) ──
let _categories     = [];
let _paymentMethods = [];

export const getCategories     = () => _categories;
export const getPaymentMethods = () => _paymentMethods;

// Called by other modules after data loads
let _onCatsChanged     = null;
let _onPaymentsChanged = null;
export function onCategoriesChanged(fn)     { _onCatsChanged = fn; }
export function onPaymentMethodsChanged(fn) { _onPaymentsChanged = fn; }

// ── Bootstrap ────────────────────────────────
export async function initSettings() {
  await seedDefaultCategories();
  await seedDefaultPaymentMethods();
  startListeners();
  bindSettingsPageEvents();
}

// ── Real-time listeners ───────────────────────
function startListeners() {
  listenCategories(cats => {
    _categories = cats;
    renderCategoriesList();
    _onCatsChanged?.(cats);
  });
  listenPaymentMethods(methods => {
    _paymentMethods = methods;
    renderPaymentsList();
    _onPaymentsChanged?.(methods);
  });
}

// ── Render categories in Settings page ───────
function renderCategoriesList() {
  const el = document.getElementById("categories-list");
  if (!el) return;
  if (!_categories.length) {
    el.innerHTML = '<p class="empty-msg">No categories.</p>';
    return;
  }
  el.innerHTML = "";
  _categories.forEach(cat => {
    const item = document.createElement("div");
    item.className = "settings-item";
    item.innerHTML = `
      <span class="settings-item-icon">${cat.icon}</span>
      <span class="settings-item-name">${cat.name}</span>
      <div class="settings-item-actions">
        <button class="icon-btn" data-edit-cat="${cat.id}" aria-label="Edit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="icon-btn" data-del-cat="${cat.id}" aria-label="Delete" style="color:var(--red)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>`;
    item.querySelector(`[data-edit-cat]`).addEventListener("click", () => openEditCategory(cat));
    item.querySelector(`[data-del-cat]`).addEventListener("click",  () => handleDeleteCategory(cat));
    el.appendChild(item);
  });
}

// ── Render payment methods in Settings page ───
function renderPaymentsList() {
  const el = document.getElementById("payments-list");
  if (!el) return;
  if (!_paymentMethods.length) {
    el.innerHTML = '<p class="empty-msg">No payment methods.</p>';
    return;
  }
  el.innerHTML = "";
  _paymentMethods.forEach(m => {
    const item = document.createElement("div");
    item.className = "settings-item";
    item.innerHTML = `
      <span class="settings-item-icon">${m.icon}</span>
      <span class="settings-item-name">${m.name}</span>
      <div class="settings-item-actions">
        <button class="icon-btn" data-edit-pay="${m.id}" aria-label="Edit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="icon-btn" data-del-pay="${m.id}" aria-label="Delete" style="color:var(--red)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>`;
    item.querySelector(`[data-edit-pay]`).addEventListener("click", () => openEditPayment(m));
    item.querySelector(`[data-del-pay]`).addEventListener("click",  () => handleDeletePayment(m));
    el.appendChild(item);
  });
}

// ── Category CRUD ─────────────────────────────
function openAddCategory() {
  document.getElementById("modal-category-title").textContent = "Add Category";
  document.getElementById("category-form").reset();
  document.getElementById("category-id").value    = "";
  document.getElementById("category-color").value = CATEGORY_COLORS[7];
  renderColorPicker("color-picker", "category-color");
  openModal("modal-category");
}

function openEditCategory(cat) {
  document.getElementById("modal-category-title").textContent = "Edit Category";
  document.getElementById("category-id").value    = cat.id;
  document.getElementById("category-icon").value  = cat.icon;
  document.getElementById("category-name").value  = cat.name;
  document.getElementById("category-color").value = cat.color || CATEGORY_COLORS[7];
  renderColorPicker("color-picker", "category-color");
  openModal("modal-category");
}

async function handleDeleteCategory(cat) {
  const ok = await confirmDialog("Delete Category", `Delete "${cat.name}"? Existing expenses won't be removed.`);
  if (!ok) return;
  try {
    await deleteCategory(cat.id);
    showToast("Category deleted", "info");
  } catch { showToast("Error deleting category", "error"); }
}

function bindCategoryForm() {
  document.getElementById("category-form").addEventListener("submit", async e => {
    e.preventDefault();
    const id    = document.getElementById("category-id").value;
    const icon  = document.getElementById("category-icon").value.trim() || "📦";
    const name  = document.getElementById("category-name").value.trim();
    const color = document.getElementById("category-color").value;
    if (!name) { showToast("Enter a category name", "error"); return; }
    try {
      if (id) { await updateCategory(id, { icon, name, color }); showToast("Category updated"); }
      else    { await addCategory({ icon, name, color }); showToast("Category added"); }
      closeModal("modal-category");
    } catch { showToast("Error saving category", "error"); }
  });
}

// ── Payment Method CRUD ───────────────────────
function openAddPayment() {
  document.getElementById("modal-payment-title").textContent = "Add Payment Method";
  document.getElementById("payment-form").reset();
  document.getElementById("payment-id").value = "";
  openModal("modal-payment");
}

function openEditPayment(m) {
  document.getElementById("modal-payment-title").textContent = "Edit Payment Method";
  document.getElementById("payment-id").value   = m.id;
  document.getElementById("payment-icon").value = m.icon;
  document.getElementById("payment-name").value = m.name;
  openModal("modal-payment");
}

async function handleDeletePayment(m) {
  const ok = await confirmDialog("Delete Payment Method", `Delete "${m.name}"?`);
  if (!ok) return;
  try {
    await deletePaymentMethod(m.id);
    showToast("Payment method deleted", "info");
  } catch { showToast("Error deleting payment method", "error"); }
}

function bindPaymentForm() {
  document.getElementById("payment-form").addEventListener("submit", async e => {
    e.preventDefault();
    const id   = document.getElementById("payment-id").value;
    const icon = document.getElementById("payment-icon").value.trim() || "💳";
    const name = document.getElementById("payment-name").value.trim();
    if (!name) { showToast("Enter a method name", "error"); return; }
    try {
      if (id) { await updatePaymentMethod(id, { icon, name }); showToast("Payment method updated"); }
      else    { await addPaymentMethod({ icon, name }); showToast("Payment method added"); }
      closeModal("modal-payment");
    } catch { showToast("Error saving payment method", "error"); }
  });
}

// ── Reset all data ────────────────────────────
async function handleResetData() {
  const ok = await confirmDialog("Reset All Data", "This will permanently delete ALL expenses, budgets, goals and settings. This cannot be undone.", "Reset");
  if (!ok) return;
  try {
    await resetAllData();
    showToast("All data reset", "warning");
  } catch { showToast("Error resetting data", "error"); }
}

// ── Wire up Settings page buttons ────────────
function bindSettingsPageEvents() {
  document.getElementById("add-category-btn")?.addEventListener("click", openAddCategory);
  document.getElementById("add-payment-btn")?.addEventListener("click",  openAddPayment);
  document.getElementById("reset-data-btn")?.addEventListener("click",   handleResetData);
  bindCategoryForm();
  bindPaymentForm();
}
