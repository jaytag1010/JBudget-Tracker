// ─── Toast ───────────────────────────────────
let toastTimer;
export function showToast(msg, type = "success") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className   = `toast ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = "toast hidden"; }, 2800);
}

// ─── Modals ──────────────────────────────────
export function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("open");
  document.body.style.overflow = "hidden";
}

export function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("open");
  document.body.style.overflow = "";
}

export function closeAllModals() {
  document.querySelectorAll(".modal.open").forEach(m => m.classList.remove("open"));
  document.body.style.overflow = "";
}

// ─── Confirm Dialog ──────────────────────────
let confirmResolve;
export function confirmDialog(title, message, okLabel = "Delete") {
  document.getElementById("confirm-title").textContent   = title;
  document.getElementById("confirm-message").textContent = message;
  document.getElementById("confirm-ok").textContent      = okLabel;
  openModal("modal-confirm");
  return new Promise(resolve => { confirmResolve = resolve; });
}

export function initConfirmDialog() {
  document.getElementById("confirm-ok").addEventListener("click", () => {
    closeModal("modal-confirm");
    confirmResolve?.(true);
  });
  document.getElementById("confirm-cancel").addEventListener("click", () => {
    closeModal("modal-confirm");
    confirmResolve?.(false);
  });
}

// ─── Navigation ──────────────────────────────
let currentPage = "dashboard";

export function navigateTo(pageId) {
  const pages   = document.querySelectorAll(".page");
  const navBtns = document.querySelectorAll(".nav-item[data-page]");
  const target  = document.getElementById(`page-${pageId}`);
  if (!target) return;

  pages.forEach(p => p.classList.remove("active"));
  navBtns.forEach(b => b.classList.toggle("active", b.dataset.page === pageId));
  target.classList.add("active");
  currentPage = pageId;
  target.scrollTop = 0;
}

export function getCurrentPage() { return currentPage; }

// ─── Progress Bar Helpers ─────────────────────
export function setProgressBar(barEl, pctEl, spent, total) {
  const p = total > 0 ? Math.min(100, Math.round((spent / total) * 100)) : 0;
  if (barEl) {
    barEl.style.width = p + "%";
    barEl.className = barEl.className.replace(/\bwarn\b|\bdanger\b/g, "").trim();
    if (p >= 100) barEl.classList.add("danger");
    else if (p >= 75) barEl.classList.add("warn");
  }
  if (pctEl) {
    pctEl.textContent = p + "%";
    pctEl.className = pctEl.className.replace(/\bwarn\b|\bdanger\b/g, "").trim();
    if (p >= 100) pctEl.classList.add("red");
    else if (p >= 75) pctEl.classList.add("yellow");
    else pctEl.classList.add("green");
  }
}

// ─── Backdrop / close-on-backdrop ────────────
export function initModalBackdrops() {
  document.addEventListener("click", e => {
    const backdrop = e.target.closest("[data-close]");
    if (backdrop) closeModal(backdrop.dataset.close);
  });
}

// ─── Color Swatches ──────────────────────────
export const CATEGORY_COLORS = [
  "#e74c3c","#e67e22","#f1c40f","#2ecc71",
  "#1abc9c","#3498db","#9b59b6","#7c6cf7",
  "#e91e63","#00bcd4","#ff5722","#607d8b",
];

export function renderColorPicker(containerId, inputId) {
  const container = document.getElementById(containerId);
  const input     = document.getElementById(inputId);
  container.innerHTML = "";
  CATEGORY_COLORS.forEach(c => {
    const sw = document.createElement("button");
    sw.type = "button";
    sw.className = "color-swatch" + (input.value === c ? " selected" : "");
    sw.style.background = c;
    sw.title = c;
    sw.addEventListener("click", () => {
      container.querySelectorAll(".color-swatch").forEach(s => s.classList.remove("selected"));
      sw.classList.add("selected");
      input.value = c;
    });
    container.appendChild(sw);
  });
}
