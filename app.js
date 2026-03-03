/* ══════════════════════════════════════════════════════════
   Penny — app.js
   ══════════════════════════════════════════════════════════ */

'use strict';

// ── Constants ──────────────────────────────────────────────
const STORAGE = {
  expenses:  'penny_expenses',
  budgets:   'penny_budgets',
  goals:     'penny_goals',
  settings:  'penny_settings',
};

const DEFAULT_CATEGORIES = [
  { name: 'Housing',       emoji: '🏠' },
  { name: 'Food',          emoji: '🍔' },
  { name: 'Transport',     emoji: '🚗' },
  { name: 'Health',        emoji: '💊' },
  { name: 'Entertainment', emoji: '🎬' },
  { name: 'Shopping',      emoji: '🛍️' },
  { name: 'Utilities',     emoji: '💡' },
  { name: 'Other',         emoji: '📦' },
];

const GOAL_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f59e0b', '#10b981', '#06b6d4', '#3b82f6',
];

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

// ── State ──────────────────────────────────────────────────
let state = {
  currentYear:  new Date().getFullYear(),
  currentMonth: new Date().getMonth(), // 0-indexed
  selectedCategory: null,
  editingGoalId: null,
  selectedGoalColor: GOAL_COLORS[0],
  editingExpenseId: null,
  editSelectedCategory: null,
};

// ── Storage helpers ────────────────────────────────────────
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

function getExpenses()  { return load(STORAGE.expenses, []); }
function getBudgets()   { return load(STORAGE.budgets, {}); }
function getGoals()     { return load(STORAGE.goals, []); }
function getSettings()  {
  return Object.assign({ currency: '$', startDay: 1, categories: DEFAULT_CATEGORIES, dark: false }, load(STORAGE.settings, {}));
}

// ── Date helpers ───────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function isInMonth(dateStr, year, month) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.getFullYear() === year && d.getMonth() === month;
}

// Respects the user's custom billing-cycle start day (BUG-01 fix).
// e.g. startDay=15: "March" = Feb 15 – Mar 14
function isInPeriod(dateStr, year, month, startDay) {
  if (!startDay || startDay === 1) return isInMonth(dateStr, year, month);
  const d     = new Date(dateStr + 'T00:00:00');
  const start = new Date(year, month, startDay);
  const end   = new Date(year, month + 1, startDay); // exclusive
  return d >= start && d < end;
}

function formatCurrency(n, currency) {
  return `${currency}${Math.abs(n).toFixed(2)}`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Category helpers ───────────────────────────────────────
function getCatEmoji(catName) {
  const settings = getSettings();
  const found = settings.categories.find(c => c.name === catName);
  return found ? found.emoji : '📦';
}

// Category color — generate from name hash
function catColor(name) {
  const colors = [
    '#6366f1','#8b5cf6','#ec4899','#ef4444',
    '#f59e0b','#10b981','#06b6d4','#3b82f6',
    '#14b8a6','#f97316','#84cc16','#a855f7',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}

// ── ID generator ───────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// ── Debounce ───────────────────────────────────────────────
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ── XSS protection ─────────────────────────────────────────
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Toast ──────────────────────────────────────────────────
function showToast(msg, duration = 2000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

// ── Modal helpers ──────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

document.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.modal));
});
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape')
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
});

// ── Dark mode ──────────────────────────────────────────────
function applyDark(dark) {
  document.body.classList.toggle('dark', dark);
  document.body.classList.toggle('light', !dark);
  const sun  = document.querySelector('.sun-icon');
  const moon = document.querySelector('.moon-icon');
  sun.style.display  = dark ? 'none'  : '';
  moon.style.display = dark ? ''      : 'none';
}

document.getElementById('darkToggle').addEventListener('click', () => {
  const settings = getSettings();
  settings.dark = !settings.dark;
  save(STORAGE.settings, settings);
  applyDark(settings.dark);
  renderAll(); // re-render charts with correct theme colors
});

// ── Month navigation ───────────────────────────────────────
function isAtCurrentMonth() {
  const now = new Date();
  return state.currentYear === now.getFullYear() && state.currentMonth === now.getMonth();
}

function updateMonthLabel() {
  document.getElementById('monthLabel').textContent =
    `${MONTHS[state.currentMonth]} ${state.currentYear}`;
  document.getElementById('nextMonth').disabled = isAtCurrentMonth();
}

document.getElementById('prevMonth').addEventListener('click', () => {
  state.currentMonth--;
  if (state.currentMonth < 0) { state.currentMonth = 11; state.currentYear--; }
  updateMonthLabel();
  renderAll();
});

document.getElementById('nextMonth').addEventListener('click', () => {
  if (isAtCurrentMonth()) return;
  state.currentMonth++;
  if (state.currentMonth > 11) { state.currentMonth = 0; state.currentYear++; }
  updateMonthLabel();
  renderAll();
});

// ── Category chips (add expense form) ─────────────────────
function renderCategoryChips() {
  const settings = getSettings();
  const grid = document.getElementById('categoryGrid');
  grid.innerHTML = '';
  settings.categories.forEach(cat => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'cat-chip' + (state.selectedCategory === cat.name ? ' selected' : '');
    chip.innerHTML = `${escapeHtml(cat.emoji)} ${escapeHtml(cat.name)}`;
    chip.addEventListener('click', () => {
      state.selectedCategory = cat.name;
      renderCategoryChips();
    });
    grid.appendChild(chip);
  });
}

// ── Add expense form ───────────────────────────────────────
function initExpenseForm() {
  const form    = document.getElementById('expenseForm');
  const dateEl  = document.getElementById('expDate');
  dateEl.value  = todayStr();

  // Ensure date stays valid when navigating months
  form.addEventListener('submit', e => {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('amount').value);
    const date   = document.getElementById('expDate').value;
    const note   = document.getElementById('note').value.trim();

    if (!amount || amount <= 0) { showToast('Enter a valid amount'); return; }
    if (!state.selectedCategory) { showToast('Pick a category'); return; }
    if (!date) { showToast('Pick a date'); return; }

    const expenses = getExpenses();
    expenses.push({ id: uid(), amount, category: state.selectedCategory, note, date });
    save(STORAGE.expenses, expenses);

    document.getElementById('amount').value = '';
    document.getElementById('note').value   = '';
    document.getElementById('amount').focus();
    showToast('Expense added!');
    renderAll();
  });
}

// ── Summary cards ──────────────────────────────────────────
function renderSummary(monthExpenses) {
  const settings    = getSettings();
  const cur         = settings.currency;
  const budgets     = getBudgets();
  const totalBudget = Object.values(budgets).reduce((s, v) => s + (v || 0), 0);
  const totalSpent  = monthExpenses.reduce((s, e) => s + e.amount, 0);
  const remaining   = totalBudget - totalSpent;
  const overBudget  = totalBudget > 0 && remaining < 0;
  const pct         = totalBudget > 0 ? Math.round((remaining / totalBudget) * 100) : 0;
  const avgTx       = monthExpenses.length > 0 ? totalSpent / monthExpenses.length : 0;

  // Card 1 — Spent
  document.getElementById('totalSpent').textContent    = formatCurrency(totalSpent, cur);
  document.getElementById('spentVsBudget').textContent = totalBudget > 0
    ? `of ${formatCurrency(totalBudget, cur)} budgeted`
    : 'no budget set';

  // Card 2 — Remaining (BUG-02 fix: show actual overrun in red)
  if (totalBudget > 0) {
    document.getElementById('budgetRemaining').textContent =
      overBudget ? `-${formatCurrency(Math.abs(remaining), cur)}` : formatCurrency(remaining, cur);
    document.getElementById('budgetRemaining').className =
      'card-value' + (overBudget ? ' red' : ' green');
    document.getElementById('remainingPct').textContent =
      overBudget ? `${Math.abs(pct)}% over budget` : `${pct}% left`;
  } else {
    document.getElementById('budgetRemaining').textContent = '—';
    document.getElementById('budgetRemaining').className   = 'card-value';
    document.getElementById('remainingPct').textContent    = 'no budget set';
  }

  // Card 3 — Transactions
  document.getElementById('txCount').textContent = monthExpenses.length;
  document.getElementById('avgTx').textContent   = monthExpenses.length > 0
    ? `avg ${formatCurrency(avgTx, cur)} / transaction`
    : 'no transactions';

  // Card 4 — Daily Budget (how much can I spend per day to stay on track?)
  const now = new Date();
  const isThisMonth = isAtCurrentMonth();
  let dailyVal = '—', dailySub = 'set a budget to track';

  if (totalBudget > 0) {
    if (!isThisMonth) {
      // Past month — show how much was left / how far over
      dailyVal = overBudget
        ? `-${formatCurrency(Math.abs(remaining), cur)}`
        : formatCurrency(remaining, cur);
      dailySub = overBudget ? 'ended over budget' : 'ended under budget';
    } else if (overBudget) {
      dailyVal = 'Over';
      dailySub = `by ${formatCurrency(Math.abs(remaining), cur)}`;
    } else {
      const daysInMonth = new Date(state.currentYear, state.currentMonth + 1, 0).getDate();
      const daysLeft    = daysInMonth - now.getDate() + 1; // include today
      dailyVal = formatCurrency(remaining / daysLeft, cur);
      dailySub = `per day · ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`;
    }
  }
  document.getElementById('dailyBudget').textContent    = dailyVal;
  document.getElementById('dailyBudgetSub').textContent = dailySub;

  document.getElementById('currencySymbol').textContent = cur;
}

// ── Donut chart ────────────────────────────────────────────
let donutChart = null;

function renderDonut(monthExpenses) {
  const byCat = {};
  monthExpenses.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });
  const labels = Object.keys(byCat);
  const data   = Object.values(byCat);
  const colors = labels.map(catColor);

  const isEmpty = labels.length === 0;
  document.getElementById('donutEmpty').style.display = isEmpty ? '' : 'none';

  const ctx = document.getElementById('donutChart').getContext('2d');
  if (donutChart) donutChart.destroy();

  if (isEmpty) return;

  donutChart = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 8 }] },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '68%',
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: getComputedStyle(document.body).getPropertyValue('--text').trim() || '#1a1d2e',
            boxWidth: 12,
            padding: 10,
            font: { size: 12, family: "'Segoe UI', system-ui, sans-serif" },
          },
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              const cur = getSettings().currency;
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = Math.round((ctx.raw / total) * 100);
              return ` ${formatCurrency(ctx.raw, cur)} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

// ── Bar chart (6-month trend) ──────────────────────────────
let barChart = null;

function renderBar() {
  const expenses = getExpenses();
  const settings = getSettings();
  const cur = settings.currency;
  const labels = [];
  const data   = [];

  const now    = new Date();
  const months = []; // [ [year, month], … ] oldest → newest
  for (let i = 5; i >= 0; i--) {
    let m = now.getMonth() - i;
    let y = now.getFullYear();
    while (m < 0) { m += 12; y--; }
    months.push([y, m]);
    labels.push(MONTHS[m].slice(0, 3));
    const total = expenses
      .filter(e => isInMonth(e.date, y, m))
      .reduce((s, e) => s + e.amount, 0);
    data.push(parseFloat(total.toFixed(2)));
  }

  const ctx = document.getElementById('barChart').getContext('2d');
  const isDark = document.body.classList.contains('dark');
  const textColor = isDark ? '#8b93b8' : '#6b7280';
  const gridColor = isDark ? '#2d3350' : '#e4e7f0';

  if (barChart) barChart.destroy();

  barChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: `Spending (${cur})`,
        data,
        backgroundColor: months.map(([y, m]) =>
          (m === state.currentMonth && y === state.currentYear) ? '#6366f1' : '#a5b4fc'
        ),
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(ctx) { return ` ${formatCurrency(ctx.raw, cur)}`; },
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: textColor } },
        y: {
          grid: { color: gridColor },
          ticks: {
            color: textColor,
            callback: v => `${cur}${v}`,
          },
          beginAtZero: true,
        },
      },
    },
  });
}

// ── Budget bars ────────────────────────────────────────────
function renderBudgetBars(monthExpenses) {
  const settings = getSettings();
  const cur      = settings.currency;
  const budgets  = getBudgets();
  const byCat    = {};
  monthExpenses.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });

  const container = document.getElementById('budgetBars');

  // Show categories that have a budget or spending
  const cats = settings.categories.map(c => c.name);
  const allCats = [...new Set([...cats, ...Object.keys(byCat)])];
  const displayed = allCats.filter(c => budgets[c] || byCat[c]);

  if (displayed.length === 0) {
    container.innerHTML = '<p style="color:var(--text-faint);font-size:.82rem;text-align:center">Set budgets to see tracking here</p>';
    return;
  }

  container.innerHTML = displayed.map(cat => {
    const spent  = byCat[cat] || 0;
    const budget = budgets[cat] || 0;
    const pct    = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
    const color  = pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : catColor(cat);
    const emoji  = getCatEmoji(cat);

    return `
      <div class="budget-bar-item">
        <div class="budget-bar-header">
          <span class="budget-bar-name">${escapeHtml(emoji)} ${escapeHtml(cat)}</span>
          <span class="budget-bar-amt">
            ${formatCurrency(spent, cur)}${budget > 0 ? ` / ${formatCurrency(budget, cur)}` : ''}
          </span>
        </div>
        <div class="budget-bar-track">
          <div class="budget-bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
      </div>`;
  }).join('');
}

// ── Savings goals ──────────────────────────────────────────
function renderGoals() {
  const goals    = getGoals();
  const settings = getSettings();
  const cur      = settings.currency;
  const list     = document.getElementById('goalsList');
  const empty    = document.getElementById('goalsEmpty');

  if (goals.length === 0) {
    list.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = goals.map(g => {
    const pct = Math.min(100, Math.round((g.saved / g.target) * 100));
    const done = g.saved >= g.target;
    return `
      <div class="goal-item" data-id="${g.id}">
        <div class="goal-header">
          <div class="goal-name-row">
            <div class="goal-dot" style="background:${g.color}"></div>
            <span class="goal-name">${escapeHtml(g.name)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:.5rem">
            <span class="goal-pct" style="color:${g.color}">${pct}%</span>
            <div class="goal-actions">
              ${!done ? `<button class="goal-action-btn goal-deposit-btn" data-deposit="${g.id}" title="Log deposit">+</button>` : ''}
              <button class="goal-action-btn" data-edit="${g.id}" title="Edit">✏️</button>
              <button class="goal-action-btn" data-delete-goal="${g.id}" title="Delete">🗑️</button>
            </div>
          </div>
        </div>
        <div class="goal-track">
          <div class="goal-fill" style="width:${pct}%;background:${g.color}"></div>
        </div>
        <div class="goal-amounts">${formatCurrency(g.saved, cur)} saved of ${formatCurrency(g.target, cur)}</div>
        <div class="goal-deposit-row" id="dep-${g.id}" style="display:none">
          <input class="deposit-input" type="number" placeholder="Amount to deposit" step="0.01" min="0.01" />
          <button class="btn-dep-save" data-gid="${g.id}">Add</button>
          <button class="btn-dep-cancel" data-gid="${g.id}">Cancel</button>
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openGoalModal(btn.dataset.edit));
  });
  list.querySelectorAll('[data-delete-goal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const goals = getGoals().filter(g => g.id !== btn.dataset.deleteGoal);
      save(STORAGE.goals, goals);
      renderGoals();
      showToast('Goal deleted');
    });
  });

  // Deposit: toggle row
  list.querySelectorAll('[data-deposit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = document.getElementById(`dep-${btn.dataset.deposit}`);
      const opening = row.style.display === 'none';
      row.style.display = opening ? 'flex' : 'none';
      if (opening) row.querySelector('.deposit-input').focus();
    });
  });

  // Deposit: save
  function doDeposit(gid, input) {
    const amount = parseFloat(input.value);
    if (!amount || amount <= 0) { showToast('Enter a valid amount'); return; }
    const goals = getGoals();
    const idx   = goals.findIndex(g => g.id === gid);
    if (idx < 0) return;
    const prevSaved = goals[idx].saved;
    const newSaved  = Math.min(goals[idx].target, prevSaved + amount);
    if (newSaved === prevSaved) { showToast('Goal already reached!'); return; }
    goals[idx].saved = newSaved;
    save(STORAGE.goals, goals);
    renderGoals();
    // BUG-03 fix: report what was actually added, not what was requested
    const actualDeposit = newSaved - prevSaved;
    const cur = getSettings().currency;
    const msg = actualDeposit < amount
      ? `+${formatCurrency(actualDeposit, cur)} deposited (goal reached!)`
      : `+${formatCurrency(actualDeposit, cur)} deposited!`;
    showToast(msg);
  }
  list.querySelectorAll('.btn-dep-save').forEach(btn => {
    btn.addEventListener('click', () =>
      doDeposit(btn.dataset.gid, btn.closest('.goal-deposit-row').querySelector('.deposit-input'))
    );
  });
  list.querySelectorAll('.deposit-input').forEach(input => {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') doDeposit(input.closest('.goal-deposit-row').querySelector('.btn-dep-save').dataset.gid, input);
    });
  });

  // Deposit: cancel
  list.querySelectorAll('.btn-dep-cancel').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = document.getElementById(`dep-${btn.dataset.gid}`);
      row.style.display = 'none';
      row.querySelector('.deposit-input').value = '';
    });
  });
}

function openGoalModal(editId = null) {
  state.editingGoalId = editId;
  const goalModal = document.getElementById('goalModalTitle');
  goalModal.textContent = editId ? 'Edit Goal' : 'New Savings Goal';

  if (editId) {
    const goal = getGoals().find(g => g.id === editId);
    if (goal) {
      document.getElementById('goalName').value   = goal.name;
      document.getElementById('goalTarget').value = goal.target;
      document.getElementById('goalSaved').value  = goal.saved;
      state.selectedGoalColor = goal.color;
    }
  } else {
    document.getElementById('goalName').value   = '';
    document.getElementById('goalTarget').value = '';
    document.getElementById('goalSaved').value  = '';
    state.selectedGoalColor = GOAL_COLORS[0];
  }
  renderColorPicker();
  openModal('goalModal');
}

function renderColorPicker() {
  const picker = document.getElementById('goalColorPicker');
  picker.innerHTML = GOAL_COLORS.map(c => `
    <div class="color-swatch${c === state.selectedGoalColor ? ' selected' : ''}"
         style="background:${c}" data-color="${c}"></div>
  `).join('');
  picker.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      state.selectedGoalColor = sw.dataset.color;
      renderColorPicker();
    });
  });
}

document.getElementById('addGoalBtn').addEventListener('click', () => openGoalModal());

document.getElementById('saveGoalBtn').addEventListener('click', () => {
  const name   = document.getElementById('goalName').value.trim();
  const target = parseFloat(document.getElementById('goalTarget').value);
  const saved  = parseFloat(document.getElementById('goalSaved').value) || 0;

  if (!name) { showToast('Enter a goal name'); return; }
  if (!target || target <= 0) { showToast('Enter a valid target amount'); return; }

  const goals = getGoals();
  if (state.editingGoalId) {
    const idx = goals.findIndex(g => g.id === state.editingGoalId);
    if (idx >= 0) goals[idx] = { ...goals[idx], name, target, saved, color: state.selectedGoalColor };
  } else {
    goals.push({ id: uid(), name, target, saved, color: state.selectedGoalColor });
  }
  save(STORAGE.goals, goals);
  closeModal('goalModal');
  renderGoals();
  showToast(state.editingGoalId ? 'Goal updated!' : 'Goal added!');
  state.editingGoalId = null;
});

// ── Transactions ───────────────────────────────────────────
function renderTransactions(monthExpenses) {
  const settings = getSettings();
  const cur      = settings.currency;
  const filterCat = document.getElementById('filterCategory').value;
  const search    = document.getElementById('searchTx').value.toLowerCase();
  const txEmpty   = document.getElementById('txEmpty');
  const txList    = document.getElementById('txList');

  // Populate filter dropdown
  const allCats = [...new Set(getExpenses().map(e => e.category))].sort();
  const filterEl = document.getElementById('filterCategory');
  const prevFilter = filterEl.value;
  filterEl.innerHTML = '<option value="">All categories</option>' +
    allCats.map(c => `<option value="${c}"${prevFilter === c ? ' selected' : ''}>${c}</option>`).join('');

  let filtered = [...monthExpenses]
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter(e => (!filterCat || e.category === filterCat))
    .filter(e => !search || e.note.toLowerCase().includes(search) || e.category.toLowerCase().includes(search));

  if (filtered.length === 0) {
    txList.innerHTML = '';
    txEmpty.style.display = '';
    return;
  }
  txEmpty.style.display = 'none';

  txList.innerHTML = filtered.map(e => `
    <div class="tx-item" data-id="${e.id}">
      <div class="tx-icon" style="background:${catColor(e.category)}22;color:${catColor(e.category)}">
        ${escapeHtml(getCatEmoji(e.category))}
      </div>
      <div class="tx-info">
        <div class="tx-note">${escapeHtml(e.note || e.category)}</div>
        <div class="tx-meta">${escapeHtml(e.category)} · ${formatDate(e.date)}</div>
      </div>
      <div class="tx-amount">-${formatCurrency(e.amount, cur)}</div>
      <button class="tx-edit"   data-edit-expense="${e.id}" title="Edit transaction">✏️</button>
      <button class="tx-delete" data-delete="${e.id}"        title="Delete transaction">✕</button>
    </div>
  `).join('');

  txList.querySelectorAll('[data-edit-expense]').forEach(btn => {
    btn.addEventListener('click', () => openEditExpenseModal(btn.dataset.editExpense));
  });
  txList.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => {
      const expenses = getExpenses().filter(e => e.id !== btn.dataset.delete);
      save(STORAGE.expenses, expenses);
      renderAll();
      showToast('Transaction deleted');
    });
  });
}

// Search/filter only need to re-render the transaction list — not the charts.
function renderTxOnly() {
  const settings    = getSettings();
  const expenses    = getExpenses();
  const monthExpenses = expenses.filter(e =>
    isInPeriod(e.date, state.currentYear, state.currentMonth, settings.startDay)
  );
  renderTransactions(monthExpenses);
}
// ── Edit expense ───────────────────────────────────────────
function renderEditCategoryChips() {
  const settings = getSettings();
  const grid = document.getElementById('editCategoryGrid');
  grid.innerHTML = '';
  settings.categories.forEach(cat => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'cat-chip' + (state.editSelectedCategory === cat.name ? ' selected' : '');
    chip.innerHTML = `${escapeHtml(cat.emoji)} ${escapeHtml(cat.name)}`;
    chip.addEventListener('click', () => {
      state.editSelectedCategory = cat.name;
      renderEditCategoryChips();
    });
    grid.appendChild(chip);
  });
}

function openEditExpenseModal(id) {
  const expense = getExpenses().find(e => e.id === id);
  if (!expense) return;
  state.editingExpenseId    = id;
  state.editSelectedCategory = expense.category;
  const settings = getSettings();
  document.getElementById('editCurrencySymbol').textContent = settings.currency;
  document.getElementById('editAmount').value  = expense.amount;
  document.getElementById('editExpDate').value = expense.date;
  document.getElementById('editNote').value    = expense.note || '';
  renderEditCategoryChips();
  openModal('editExpenseModal');
}

document.getElementById('saveEditExpenseBtn').addEventListener('click', () => {
  const amount = parseFloat(document.getElementById('editAmount').value);
  const date   = document.getElementById('editExpDate').value;
  const note   = document.getElementById('editNote').value.trim();
  if (!amount || amount <= 0)          { showToast('Enter a valid amount'); return; }
  if (!state.editSelectedCategory)     { showToast('Pick a category'); return; }
  if (!date)                           { showToast('Pick a date'); return; }
  const expenses = getExpenses();
  const idx = expenses.findIndex(e => e.id === state.editingExpenseId);
  if (idx >= 0)
    expenses[idx] = { ...expenses[idx], amount, category: state.editSelectedCategory, note, date };
  save(STORAGE.expenses, expenses);
  state.editingExpenseId = null;
  closeModal('editExpenseModal');
  renderAll();
  showToast('Transaction updated!');
});

document.getElementById('filterCategory').addEventListener('change', renderTxOnly);
document.getElementById('searchTx').addEventListener('input', debounce(renderTxOnly, 180));

// ── Edit budgets modal ─────────────────────────────────────
document.getElementById('editBudgetsBtn').addEventListener('click', () => {
  const settings = getSettings();
  const budgets  = getBudgets();
  const cur      = settings.currency;

  document.getElementById('budgetInputs').innerHTML = settings.categories.map(cat => `
    <div class="budget-input-row">
      <div class="budget-input-label">
        <span>${escapeHtml(cat.emoji)}</span>
        <span>${escapeHtml(cat.name)}</span>
      </div>
      <input type="number" min="0" step="0.01" placeholder="No limit"
             data-cat="${escapeHtml(cat.name)}"
             value="${budgets[cat.name] || ''}" />
    </div>
  `).join('');

  openModal('budgetsModal');
});

document.getElementById('saveBudgetsBtn').addEventListener('click', () => {
  const budgets = {};
  document.querySelectorAll('#budgetInputs [data-cat]').forEach(inp => {
    const v = parseFloat(inp.value);
    if (v > 0) budgets[inp.dataset.cat] = v;
  });
  save(STORAGE.budgets, budgets);
  closeModal('budgetsModal');
  renderAll();
  showToast('Budgets saved!');
});

// ── Settings modal ─────────────────────────────────────────
document.getElementById('settingsBtn').addEventListener('click', () => {
  const settings = getSettings();
  document.getElementById('currencyInput').value  = settings.currency;
  document.getElementById('startDayInput').value  = settings.startDay;
  renderCategoryManager();
  openModal('settingsModal');
});

function renderCategoryManager() {
  const settings = getSettings();
  const mgr = document.getElementById('categoryManager');
  mgr.innerHTML = settings.categories.map((cat, i) => `
    <div class="category-manage-row">
      <span class="category-manage-name">${escapeHtml(cat.emoji)} ${escapeHtml(cat.name)}</span>
      ${i >= DEFAULT_CATEGORIES.length ? `<button class="category-delete-btn" data-delete-cat="${escapeHtml(cat.name)}">✕</button>` : '<span></span>'}
    </div>
  `).join('');
  mgr.querySelectorAll('[data-delete-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      const settings = getSettings();
      settings.categories = settings.categories.filter(c => c.name !== btn.dataset.deleteCat);
      save(STORAGE.settings, settings);
      renderCategoryManager();
    });
  });
}

document.getElementById('addCategoryBtn').addEventListener('click', () => {
  const input = document.getElementById('newCategoryInput');
  const name  = input.value.trim();
  if (!name) return;
  const settings = getSettings();
  if (settings.categories.find(c => c.name.toLowerCase() === name.toLowerCase())) {
    showToast('Category already exists');
    return;
  }
  settings.categories.push({ name, emoji: '📂' });
  save(STORAGE.settings, settings);
  input.value = '';
  renderCategoryManager();
  showToast(`Added "${name}"`);
});

document.getElementById('newCategoryInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('addCategoryBtn').click();
});

document.getElementById('saveSettingsBtn').addEventListener('click', () => {
  const settings  = getSettings();
  const currency  = document.getElementById('currencyInput').value.trim() || '$';
  const startDay  = parseInt(document.getElementById('startDayInput').value) || 1;
  settings.currency = currency;
  settings.startDay = Math.min(28, Math.max(1, startDay));
  save(STORAGE.settings, settings);
  closeModal('settingsModal');
  renderAll();
  showToast('Settings saved!');
});

document.getElementById('clearDataBtn').addEventListener('click', () => {
  if (confirm('This will delete ALL your expenses, budgets, and goals. Are you sure?')) {
    localStorage.removeItem(STORAGE.expenses);
    localStorage.removeItem(STORAGE.budgets);
    localStorage.removeItem(STORAGE.goals);
    renderAll();
    closeModal('settingsModal');
    showToast('All data cleared');
  }
});

// ── Export CSV ─────────────────────────────────────────────
document.getElementById('exportBtn').addEventListener('click', () => {
  const expenses = getExpenses();
  if (expenses.length === 0) { showToast('No data to export'); return; }

  const settings = getSettings();
  const rows = [['Date', 'Category', 'Amount', 'Note']];
  expenses
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach(e => rows.push([e.date, e.category, e.amount.toFixed(2), `"${e.note.replace(/"/g, '""')}"`]));

  const csv  = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `penny-export-${todayStr()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Exported to CSV!');
});

// ── Master render ──────────────────────────────────────────
function renderAll() {
  const settings      = getSettings();
  const expenses      = getExpenses();
  const monthExpenses = expenses.filter(e =>
    isInPeriod(e.date, state.currentYear, state.currentMonth, settings.startDay)
  );

  renderSummary(monthExpenses);
  renderDonut(monthExpenses);
  renderBar();
  renderBudgetBars(monthExpenses);
  renderGoals();
  renderTransactions(monthExpenses);
  renderCategoryChips();
}

// ── Init ───────────────────────────────────────────────────
function init() {
  const settings = getSettings();

  // Seed with sample data if completely fresh
  if (!localStorage.getItem(STORAGE.expenses)) {
    const now = new Date();
    const y = now.getFullYear();
    const m = pad(now.getMonth() + 1);
    const sampleExpenses = [
      { id: uid(), amount: 1200,  category: 'Housing',       note: 'Monthly rent',    date: `${y}-${m}-01` },
      { id: uid(), amount: 85.40, category: 'Food',          note: 'Weekly groceries', date: `${y}-${m}-03` },
      { id: uid(), amount: 45,    category: 'Transport',      note: 'Gas',             date: `${y}-${m}-05` },
      { id: uid(), amount: 12.99, category: 'Entertainment',  note: 'Netflix',         date: `${y}-${m}-07` },
      { id: uid(), amount: 63.20, category: 'Food',           note: 'Restaurants',     date: `${y}-${m}-10` },
      { id: uid(), amount: 29.99, category: 'Utilities',      note: 'Internet bill',   date: `${y}-${m}-12` },
      { id: uid(), amount: 150,   category: 'Shopping',       note: 'Clothes',         date: `${y}-${m}-14` },
      { id: uid(), amount: 22.50, category: 'Health',         note: 'Pharmacy',        date: `${y}-${m}-16` },
    ];
    save(STORAGE.expenses, sampleExpenses);

    const sampleBudgets = {
      Housing: 1300, Food: 400, Transport: 150, Health: 100,
      Entertainment: 60, Shopping: 200, Utilities: 80,
    };
    save(STORAGE.budgets, sampleBudgets);

    save(STORAGE.goals, [
      { id: uid(), name: 'Emergency Fund', target: 10000, saved: 3200, color: '#6366f1' },
      { id: uid(), name: 'Vacation',       target: 2000,  saved: 750,  color: '#10b981' },
    ]);
  }

  applyDark(settings.dark);
  updateMonthLabel();
  initExpenseForm();
  renderAll();
}

init();
