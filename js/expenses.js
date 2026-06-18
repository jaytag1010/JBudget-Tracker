// ─── Expense Module ───────────────────────────
import { addExpense, updateExpense, deleteExpense, addRecurringExpense, payRecurringOccurrence } from "../firebase/db.js";
import { openModal, closeModal, showToast, confirmDialog } from "./ui.js";
import { formatDate, formatDateInput, todayISO, evaluateExpression, formatCurrency } from "./utils.js";
import { getCategories, getPaymentMethods } from "./settings.js";

let editingId = null;
let pendingRecurringOccurrence = null;

// ── Open "Add Expense" modal ──────────────────
export function openAddExpense(prefill = {}) {
  editingId = null;
  pendingRecurringOccurrence = prefill.recurringOccurrenceId ? {
    id: prefill.recurringOccurrenceId,
    recurringId: prefill.recurringId || "",
    recurringName: prefill.recurringName || prefill.note || "",
    dueDate: prefill.recurringDueDate || prefill.date || todayISO(),
    amount: Number(prefill.amount || 0),
    category: prefill.category || "",
  } : null;
  document.getElementById("modal-expense-title").textContent = "Add Expense";
  document.getElementById("expense-submit-btn").textContent  = "Save Expense";
  document.getElementById("expense-form").reset();
  document.getElementById("expense-id").value     = "";
  document.getElementById("expense-amount").value = prefill.amount || "";
  document.getElementById("expense-note").value   = prefill.note || "";
  document.getElementById("expense-date").value   = prefill.date || todayISO();
  document.getElementById("expense-category").value = prefill.category || "";
  document.getElementById("expense-payment").value  = "";
  document.getElementById("expense-recurring").checked = false;
  document.getElementById("expense-recurring-fields").classList.add("hidden");
  document.getElementById("expense-recurring-due").value = prefill.date || todayISO();
  document.getElementById("expense-recurring-name").value = prefill.note || "";
  renderCategoryGrid(prefill.category || null);
  renderPaymentChips(null);
  openModal("modal-expense");
  document.getElementById("expense-amount").focus();
}

// ── Open "Edit Expense" modal ─────────────────
export function openEditExpense(expense) {
  editingId = expense.id;
  pendingRecurringOccurrence = null;
  document.getElementById("modal-expense-title").textContent = "Edit Expense";
  document.getElementById("expense-submit-btn").textContent  = "Update Expense";
  document.getElementById("expense-id").value     = expense.id;
  document.getElementById("expense-amount").value = expense.amount;
  document.getElementById("expense-note").value   = expense.note || "";
  document.getElementById("expense-date").value   = formatDateInput(expense.date);
  document.getElementById("expense-category").value = expense.category || "";
  document.getElementById("expense-payment").value  = expense.paymentMethod || "";
  document.getElementById("expense-recurring").checked = false;
  document.getElementById("expense-recurring-fields").classList.add("hidden");
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

  document.getElementById("expense-recurring")?.addEventListener("change", e => {
    const fields = document.getElementById("expense-recurring-fields");
    fields?.classList.toggle("hidden", !e.target.checked);
    if (e.target.checked) {
      document.getElementById("expense-recurring-due").value ||= document.getElementById("expense-date").value || todayISO();
      document.getElementById("expense-recurring-name").value ||= document.getElementById("expense-note").value.trim();
    }
  });

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
        if (pendingRecurringOccurrence) {
          await payRecurringOccurrence(pendingRecurringOccurrence.id, {
            recurringId: pendingRecurringOccurrence.recurringId,
            recurringName: pendingRecurringOccurrence.recurringName,
            dueDate: pendingRecurringOccurrence.dueDate,
            amount: pendingRecurringOccurrence.amount,
            category: pendingRecurringOccurrence.category,
          }, data);
        } else {
          await addExpense(data);
        }
        if (document.getElementById("expense-recurring")?.checked) {
          const recurringName = document.getElementById("expense-recurring-name").value.trim() || note || category;
          const dueDate = document.getElementById("expense-recurring-due").value || date;
          const frequency = document.getElementById("expense-recurring-frequency").value;
          const due = new Date(`${dueDate}T00:00:00`);
          const schedule = frequency === "weekly" ? { dayOfWeek: due.getDay() }
            : frequency === "yearly" ? { month: due.getMonth() + 1, dayOfMonth: due.getDate() }
              : { dayOfMonth: due.getDate() };
          await addRecurringExpense({
            name: recurringName,
            amount,
            category,
            frequency,
            ...schedule,
            dueDate,
            reminderTiming: document.getElementById("expense-recurring-reminder").value,
          });
        }
        showToast("Expense added");
      }
      pendingRecurringOccurrence = null;
      closeModal("modal-expense");
    } catch (err) {
      console.error(err);
      const message = err?.code === "occurrence-already-paid"
        ? "This bill occurrence is already paid"
        : err?.code === "occurrence-already-skipped"
          ? "This skipped occurrence cannot be paid"
          : "Error saving expense";
      showToast(message, "error");
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
export function buildTxCard(expense, { showActions = false } = {}) {
  const cats    = getCategories();
  const cat     = cats.find(c => c.name === expense.category) || { icon: "💸", color: "#7c6cf7" };
  const card    = document.createElement("div");
  card.className = "tx-card";
  card.dataset.id = expense.id;

  card.innerHTML = `
    <div class="tx-icon" style="background:${cat.color}22">${cat.icon}</div>
    <div class="tx-info">
      <button type="button" class="tx-cat tx-cat-action" data-category="${expense.category}">${expense.category}</button>
      <div class="tx-meta">${expense.paymentMethod}${expense.note ? " · " + expense.note : ""}</div>
    </div>
    <div class="tx-right">
      <div class="tx-amount">−₱${Number(expense.amount).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
      <div class="tx-date">${formatDate(expense.date)}</div>
      ${showActions ? `<div class="tx-actions">
        <button type="button" class="tx-action-btn" data-edit-expense aria-label="Edit ${expense.category} expense" title="Edit expense">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L8 18l-4 1 1-4z"/></svg>
        </button>
        <button type="button" class="tx-action-btn danger" data-delete-expense aria-label="Delete ${expense.category} expense" title="Delete expense">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>
        </button>
      </div>` : ""}
    </div>`;

  if (!showActions) {
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Edit ${expense.category} expense from ${formatDate(expense.date)}`);
  }
  card.addEventListener("click", () => openEditExpense(expense));
  card.addEventListener("keydown", event => {
    if (!showActions && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      openEditExpense(expense);
    }
  });
  card.querySelector(".tx-cat-action")?.addEventListener("click", e => {
    e.stopPropagation();
    document.dispatchEvent(new CustomEvent("spendwise:category-insight", {
      detail: { category: expense.category },
    }));
  });
  card.querySelector("[data-edit-expense]")?.addEventListener("click", event => {
    event.stopPropagation();
    openEditExpense(expense);
  });
  card.querySelector("[data-delete-expense]")?.addEventListener("click", async event => {
    event.stopPropagation();
    const button = event.currentTarget;
    button.disabled = true;
    await handleDeleteExpense(expense.id);
    if (button.isConnected) button.disabled = false;
  });

  return card;
}

// ── Render a list of expenses into a container ─
export function renderExpenseList(containerEl, expenses, options = {}) {
  if (!expenses.length) {
    containerEl.innerHTML = '<p class="empty-msg">No transactions found.</p>';
    return;
  }
  containerEl.innerHTML = "";
  expenses.forEach(e => containerEl.appendChild(buildTxCard(e, options)));
}
