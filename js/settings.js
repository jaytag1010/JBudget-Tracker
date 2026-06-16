// ─── Settings Module ─────────────────────────
import {
  addCategory, updateCategory, deleteCategory, listenCategories, seedDefaultCategories,
  addPaymentMethod, updatePaymentMethod, deletePaymentMethod, listenPaymentMethods,
  seedDefaultPaymentMethods, resetAllData, exportUserData,
  listenProfileSettings, updateProfileSettings,
} from "../firebase/db.js";
import { openModal, closeModal, showToast, confirmDialog, renderColorPicker, CATEGORY_COLORS } from "./ui.js";
import { signOutUser } from "./auth.js";
import { exportSpendWiseWorkbook } from "./excelExport.js";

// ── In-memory caches (updated by real-time listeners) ──
let _categories     = [];
let _paymentMethods = [];
let _authUser       = null;
let _profileSettings = null;
let _unsubProfile = null;
let _pendingPhotoDataUrl = null;
let _systemThemeMedia = null;
let _restoreGoogleProfile = false;

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
  document.getElementById("sign-out-btn")?.addEventListener("click", async () => {
    const ok = await confirmDialog("Sign Out", "Sign out of SpendWise?", "Sign Out");
    if (ok) signOutUser();
  });
  document.getElementById("profile-logout-btn")?.addEventListener("click", async () => {
    const ok = await confirmDialog("Sign Out", "Sign out of SpendWise?", "Sign Out");
    if (ok) signOutUser();
  });
  document.getElementById("profile-theme-btn")?.addEventListener("click", () => {
    renderThemeOptions();
    openModal("modal-theme");
  });
  document.getElementById("about-btn")?.addEventListener("click", () => {
    showToast("SpendWise v2.0 financial planning release", "info");
  });
  document.getElementById("export-data-btn")?.addEventListener("click", handleExportData);
  document.getElementById("edit-profile-btn")?.addEventListener("click", openEditProfile);
  document.getElementById("edit-profile-form")?.addEventListener("submit", handleProfileSubmit);
  document.getElementById("profile-photo-input")?.addEventListener("change", handleProfilePhotoInput);
  document.getElementById("remove-profile-photo-btn")?.addEventListener("click", () => {
    _pendingPhotoDataUrl = "";
    renderProfileEditPreview();
  });
  document.getElementById("restore-google-profile-btn")?.addEventListener("click", () => {
    _pendingPhotoDataUrl = null;
    _restoreGoogleProfile = true;
    document.getElementById("profile-display-name-input").value = _authUser?.displayName || "";
    renderProfileEditPreview(true);
  });
  document.querySelectorAll("[data-theme-choice]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await saveThemePreference(btn.dataset.themeChoice);
      closeModal("modal-theme");
    });
  });
  bindCategoryForm();
  bindPaymentForm();
}

async function handleExportData() {
  try {
    const data = await exportUserData();
    exportSpendWiseWorkbook(data);
    showToast("Export ready", "success");
  } catch (err) {
    console.error(err);
    showToast("Export failed", "error");
  }
}

// ── User profile card ─────────────────────────
export function renderUserProfile(user) {
  if (!user) return;
  _authUser = user;
  subscribeProfileSettings();
  renderProfileSurfaces();
  return;
  const avatar = document.getElementById("user-avatar");
  const name   = document.getElementById("user-name");
  const email  = document.getElementById("user-email");
  const profileAvatar = document.getElementById("profile-avatar");
  const profileName = document.getElementById("profile-name");
  const profileEmail = document.getElementById("profile-email");
  const memberSince = document.getElementById("profile-member-since");
  const displayName = user.displayName || "User";
  const displayEmail = user.email || "";
  const initial = (user.displayName || user.email || "?")[0].toUpperCase();
  if (avatar) {
    if (user.photoURL) {
      avatar.innerHTML = `<img src="${user.photoURL}" alt="avatar" class="avatar-img">`;
    } else {
      avatar.textContent = initial;
    }
  }
  if (profileAvatar) {
    profileAvatar.innerHTML = user.photoURL
      ? `<img src="${user.photoURL}" alt="avatar" class="avatar-img">`
      : initial;
  }
  if (name)  name.textContent  = displayName;
  if (email) email.textContent = displayEmail;
  if (profileName) profileName.textContent = displayName;
  if (profileEmail) profileEmail.textContent = displayEmail;
  if (memberSince) {
    const created = user.metadata?.creationTime ? new Date(user.metadata.creationTime) : null;
    memberSince.textContent = created
      ? `Member since ${created.toLocaleDateString("en-PH", { month: "long", year: "numeric" })}`
      : "Member since —";
  }
}

function subscribeProfileSettings() {
  if (_unsubProfile) return;
  _unsubProfile = listenProfileSettings(settings => {
    _profileSettings = settings || {};
    applyThemePreference(_profileSettings.theme || "dark");
    renderProfileSurfaces();
  });
}

function renderProfileSurfaces() {
  const user = _authUser;
  if (!user) return;
  const avatar = document.getElementById("user-avatar");
  const name = document.getElementById("user-name");
  const email = document.getElementById("user-email");
  const profileAvatar = document.getElementById("profile-avatar");
  const profileName = document.getElementById("profile-name");
  const profileEmail = document.getElementById("profile-email");
  const memberSince = document.getElementById("profile-member-since");
  const headerProfile = document.getElementById("profile-btn");
  const displayName = _profileSettings?.displayName || user.displayName || "User";
  const displayEmail = maskEmail(user.email || "");
  const initial = (user.displayName || user.email || "?")[0].toUpperCase();
  const photoUrl = resolveProfilePhoto();

  if (avatar) avatar.innerHTML = photoUrl ? `<img src="${photoUrl}" alt="avatar" class="avatar-img">` : initial;
  if (profileAvatar) profileAvatar.innerHTML = photoUrl ? `<img src="${photoUrl}" alt="avatar" class="avatar-img">` : initial;
  if (headerProfile) {
    headerProfile.innerHTML = photoUrl
      ? `<img src="${photoUrl}" alt="Profile" class="header-profile-img">`
      : '<span class="header-symbol">👤</span>';
  }
  if (name) name.textContent = displayName;
  if (email) email.textContent = displayEmail;
  if (profileName) profileName.textContent = displayName;
  if (profileEmail) profileEmail.textContent = displayEmail;
  if (memberSince) {
    const created = user.metadata?.creationTime ? new Date(user.metadata.creationTime) : null;
    memberSince.textContent = created
      ? `Member since ${created.toLocaleDateString("en-PH", { month: "long", year: "numeric" })}`
      : "Member since -";
  }
  updateThemeLabel(_profileSettings?.theme || "dark");
}

function resolveProfilePhoto() {
  if (_profileSettings?.photoRemoved) return "";
  return _profileSettings?.photoDataUrl || _authUser?.photoURL || "";
}

function maskEmail(email) {
  if (!email || !email.includes("@")) return "";
  const [local, domain] = email.split("@");
  if (local.length <= 1) return `${local}@${domain}`;
  if (local.length === 2) return `${local[0]}@${domain}`;
  return `${local[0]}${"*".repeat(Math.max(1, local.length - 2))}${local[local.length - 1]}@${domain}`;
}

function openEditProfile() {
  _pendingPhotoDataUrl = _profileSettings?.photoDataUrl ?? null;
  _restoreGoogleProfile = false;
  document.getElementById("profile-display-name-input").value =
    _profileSettings?.displayName || _authUser?.displayName || "";
  document.getElementById("profile-photo-input").value = "";
  renderProfileEditPreview();
  openModal("modal-edit-profile");
}

function renderProfileEditPreview(forceGoogle = false) {
  const el = document.getElementById("profile-edit-preview");
  if (!el) return;
  const photo = forceGoogle ? (_authUser?.photoURL || "") : (_pendingPhotoDataUrl === null ? resolveProfilePhoto() : _pendingPhotoDataUrl);
  const initial = (_authUser?.displayName || _authUser?.email || "?")[0].toUpperCase();
  el.innerHTML = photo ? `<img src="${photo}" alt="Profile preview">` : `<span>${initial}</span>`;
}

async function handleProfilePhotoInput(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    _pendingPhotoDataUrl = await resizeImage(file, 320);
    renderProfileEditPreview();
  } catch {
    showToast("Could not read image", "error");
  }
}

async function handleProfileSubmit(e) {
  e.preventDefault();
  const displayName = document.getElementById("profile-display-name-input").value.trim();
  const payload = { displayName: displayName || _authUser?.displayName || "User" };
  if (_restoreGoogleProfile) {
    payload.displayName = _authUser?.displayName || "User";
    payload.photoDataUrl = "";
    payload.photoRemoved = false;
  } else if (_pendingPhotoDataUrl === "") {
    payload.photoDataUrl = "";
    payload.photoRemoved = true;
  } else if (_pendingPhotoDataUrl !== null) {
    payload.photoDataUrl = _pendingPhotoDataUrl;
    payload.photoRemoved = false;
  }
  try {
    await updateProfileSettings(payload);
    closeModal("modal-edit-profile");
    showToast("Profile updated");
  } catch (err) {
    console.error(err);
    showToast("Profile update failed", "error");
  }
}

function resizeImage(file, maxSize) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result; };
    reader.onerror = reject;
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", .82));
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function saveThemePreference(theme) {
  try {
    await updateProfileSettings({ theme });
    showToast("Theme updated");
  } catch {
    showToast("Theme update failed", "error");
  }
}

function applyThemePreference(theme) {
  _systemThemeMedia ||= window.matchMedia("(prefers-color-scheme: dark)");
  if (!_systemThemeMedia._spendwiseBound) {
    _systemThemeMedia.addEventListener("change", () => {
      if ((_profileSettings?.theme || "dark") === "auto") applyThemePreference("auto");
    });
    _systemThemeMedia._spendwiseBound = true;
  }
  const resolved = theme === "auto" ? (_systemThemeMedia.matches ? "dark" : "light") : theme;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = theme;
  updateThemeLabel(theme);
  renderThemeOptions();
}

function renderThemeOptions() {
  const theme = _profileSettings?.theme || "dark";
  document.querySelectorAll("[data-theme-choice]").forEach(btn => {
    btn.classList.toggle("selected", btn.dataset.themeChoice === theme);
  });
}

function updateThemeLabel(theme) {
  const el = document.getElementById("theme-current-label");
  if (!el) return;
  el.textContent = theme === "auto" ? "Auto" : theme === "light" ? "Light" : "Dark";
}
