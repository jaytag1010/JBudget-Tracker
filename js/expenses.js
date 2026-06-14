// ─── Expense Module ───────────────────────────
import { addExpense, updateExpense, deleteExpense } from "../firebase/db.js";
import { openModal, closeModal, showToast, confirmDialog } from "./ui.js";
import { formatDate, formatDateInput, todayISO, evaluateExpression, formatCurrency } from "./utils.js";
import { getCategories, getPaymentMethods } from "./settings.js";

let editingId = null;

// ── Open "Add Expense" modal ──────────────────
export function openAddExpense() {
  editingId = null;
  document.getElementById("modal-expense-title").textContent = "Add Expense";
  document.getElementById("expense-submit-btn").textContent  = "Save Expense";
  document.getElementById("expense-form").reset();
  document.getElementById("expense-id").value     = "";
  document.getElementById("expense-date").value   = todayISO();
  document.getElementById("expense-category").value = "";
  document.getElementById("expense-payment").value  = "";
  renderCategoryGrid(null);
  renderPaymentChips(null);
  openModal("modal-expense");
  document.getElementById("expense-amount").focus();
}

// ── Open "Edit Expense" modal ─────────────────
export function openEditExpense(expense) {
  editingId = expense.id;
  document.getElementById("modal-expense-title").textContent = "Edit Expense";
  document.getElementById("expense-submit-btn").textContent  = "Update Expense";
  document.getElementById("expense-id").value     = expense.id;
  document.getElementById("expense-amount").value = expense.amount;
  document.getElementById("expense-note").value   = expense.note || "";
  document.getElementById("expense-date").value   = formatDateInput(expense.date);
  document.getElementById("expense-category").value = expense.category || "";
  document.getElementById("expense-payment").value  = expense.paymentMethod || "";
  renderCategoryGrid(expense.category);
  renderPaymentChips(expense.paymentMethod);
  openModal("modal-expense");
}

// ── Render category grid ──────────────────────
export function renderCategoryGrid(selected) {
  const grid   = document.getElementById("category-grid");
  const hidden = document.getElementById("expense-category");
  const cats   = getCategories();
  grid.innerHTML = "";
  cats.forEach(cat => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cat-btn" + (selected === cat.name ? " selected" : "");
    btn.innerHTML = `<span class="cat-btn-icon">${cat.icon}</span><span class="cat-btn-label">${cat.name}</span>`;
    btn.addEventListener("click", () => {
      grid.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      hidden.value = cat.name;
    });
    grid.appendChild(btn);
  });
}

// ── Render payment method chips ───────────────
export function renderPaymentChips(selected) {
  const row    = document.getElementById("payment-chips");
  const hidden = document.getElementById("expense-payment");
  const methods = getPaymentMethods();
  row.innerHTML = "";
  methods.forEach(m => {
    const chip = document.createElement("button");
    chip.type  = "button";
    chip.className = "chip" + (selected === m.name ? " selected" : "");
    chip.innerHTML = `${m.icon} ${m.name}`;
    chip.addEventListener("click", () => {
      row.querySelectorAll(".chip").forEach(c => c.classList.remove("selected"));
      chip.classList.add("selected");
      hidden.value = m.name;
    });
    row.appendChild(chip);
  });
}

// ── Form submit ───────────────────────────────
export function initExpenseForm() {

  // Calculator button — opens the dedicated calculator modal
  document.getElementById("calc-btn")?.addEventListener("click", () => {
    openCalculatorModal();
  });

  initCalculatorModal();

  document.getElementById("expense-form").addEventListener("submit", async e => {
    e.preventDefault();
    // Auto-evaluate any arithmetic expression before saving
    const raw    = (document.getElementById("expense-amount").value || "").trim();
    const amount = evaluateExpression(raw) ?? parseFloat(raw);
    const category = document.getElementById("expense-category").value;
    const payment  = document.getElementById("expense-payment").value;
    const note     = document.getElementById("expense-note").value.trim();
    const date     = document.getElementById("expense-date").value;

    if (!amount || amount <= 0) { showToast("Enter a valid amount", "error"); return; }
    if (!category)              { showToast("Pick a category", "error"); return; }
    if (!payment)               { showToast("Pick a payment method", "error"); return; }
    if (!date)                  { showToast("Pick a date", "error"); return; }

    const btn = document.getElementById("expense-submit-btn");
    btn.disabled = true;
    btn.textContent = "Saving…";

    try {
      const data = { amount, category, paymentMethod: payment, note, date };
      if (editingId) {
        await updateExpense(editingId, data);
        showToast("Expense updated");
      } else {
        await addExpense(data);
        showToast("Expense added");
      }
      closeModal("modal-expense");
    } catch (err) {
      console.error(err);
      showToast("Error saving expense", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = editingId ? "Update Expense" : "Save Expense";
    }
  });
}

// ── Delete expense ────────────────────────────
export async function handleDeleteExpense(id) {
  const ok = await confirmDialog("Delete Expense", "This transaction will be permanently deleted.");
  if (!ok) return;
  try {
    await deleteExpense(id);
    showToast("Expense deleted", "info");
  } catch {
    showToast("Error deleting expense", "error");
  }
}

// ── Calculator Modal ──────────────────────────

let _calcExpression = "";   // current expression string in the modal
let _calcResult     = null; // evaluated result (number), or null if invalid

function openCalculatorModal() {
  const amountInput = document.getElementById("expense-amount");
  // Pre-populate with whatever is already in the amount field
  _calcExpression = (amountInput.value || "").trim().replace(/[₱,\s]/g, "");
  _calcResult     = null;
  renderCalcDisplay();
  document.getElementById("calc-use-btn").disabled = true;
  openModal("modal-calc");
}

function renderCalcDisplay() {
  const displayEl = document.getElementById("calc-display");
  const resultEl  = document.getElementById("calc-result");
  if (!displayEl || !resultEl) return;

  displayEl.textContent = _calcExpression || "0";

  // Show a live result preview when the expression is complete and valid
  const val = evaluateExpression(_calcExpression);
  if (val !== null && String(_calcExpression) !== String(val)) {
    // Replace internal * / with display symbols for readability
    resultEl.textContent = `= ${formatCurrency(val)}`;
    _calcResult = val;
    document.getElementById("calc-use-btn").disabled = false;
  } else if (val !== null) {
    // Expression IS a plain number — still allow "Use Amount"
    resultEl.textContent = "";
    _calcResult = val;
    document.getElementById("calc-use-btn").disabled = false;
  } else {
    resultEl.textContent = "";
    _calcResult = null;
    document.getElementById("calc-use-btn").disabled = true;
  }
}

function initCalculatorModal() {
  const grid     = document.getElementById("modal-calc");
  const useBtn   = document.getElementById("calc-use-btn");
  const cancelBtn = document.getElementById("calc-cancel-btn");
  if (!grid) return;

  // Digit / operator button taps
  grid.querySelectorAll(".calc-key[data-value]").forEach(btn => {
    btn.addEventListener("click", () => {
      const v = btn.dataset.value;
      // Prevent double-decimal in the current number segment
      if (v === ".") {
        // Find the last number segment (after last operator)
        const lastSeg = _calcExpression.split(/[+\-*/()]/).pop() || "";
        if (lastSeg.includes(".")) return;
      }
      _calcExpression += v;
      renderCalcDisplay();
    });
  });

  // Function buttons (C, ⌫, =)
  grid.querySelectorAll(".calc-key[data-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      switch (btn.dataset.action) {
        case "clear":
          _calcExpression = "";
          _calcResult = null;
          renderCalcDisplay();
          break;
        case "backspace":
          _calcExpression = _calcExpression.slice(0, -1);
          renderCalcDisplay();
          break;
        case "equals": {
          const val = evaluateExpression(_calcExpression);
          if (val !== null) {
            _calcExpression = String(val);
            _calcResult = val;
            renderCalcDisplay();
          } else {
            document.getElementById("calc-result").textContent = "Invalid expression";
          }
          break;
        }
      }
    });
  });

  // "Use Amount" — transfer result to the expense amount field
  useBtn?.addEventListener("click", () => {
    if (_calcResult === null) return;
    const amountInput = document.getElementById("expense-amount");
    amountInput.value = _calcResult;
    showToast(`= ${formatCurrency(_calcResult)}`);
    closeModal("modal-calc");
  });

  // "Cancel" — close without changing the amount field
  cancelBtn?.addEventListener("click", () => closeModal("modal-calc"));
}

// ── Build a transaction card DOM element ──────
export function buildTxCard(expense) {
  const cats    = getCategories();
  const cat     = cats.find(c => c.name === expense.category) || { icon: "💸", color: "#7c6cf7" };
  const card    = document.createElement("div");
  card.className = "tx-card";
  card.dataset.id = expense.id;

  card.innerHTML = `
    <div class="tx-icon" style="background:${cat.color}22">${cat.icon}</div>
    <div class="tx-info">
      <div class="tx-cat">${expense.category}</div>
      <div class="tx-meta">${expense.paymentMethod}${expense.note ? " · " + expense.note : ""}</div>
    </div>
    <div class="tx-right">
      <div class="tx-amount">−₱${Number(expense.amount).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
      <div class="tx-date">${formatDate(expense.date)}</div>
    </div>`;

  // Long-press / tap to edit
  card.addEventListener("click", () => openEditExpense(expense));

  return card;
}

// ── Render a list of expenses into a container ─
export function renderExpenseList(containerEl, expenses) {
  if (!expenses.length) {
    containerEl.innerHTML = '<p class="empty-msg">No transactions found.</p>';
    return;
  }
  containerEl.innerHTML = "";
  expenses.forEach(e => containerEl.appendChild(buildTxCard(e)));
}
