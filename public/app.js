/* ── State ─────────────────────────────────────────────────── */
const state = {
  token: localStorage.getItem('token'),
  role:  localStorage.getItem('role'),
  email: localStorage.getItem('email'),
  pollTimer: null,
  lastTimestamp: null,
  currentView: 'dashboard',
  recordsPage: 1,
  recordsPageSize: 15,
  recordsTotal: 0,
  recordsData: [],
  recordsSearch: '',
  recordsType: '',
  usersRole: 'admin',
  charts: {},
};

const API = '/api';

/* ── HTTP helpers ──────────────────────────────────────────── */
async function http(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (state.token) opts.headers['Authorization'] = `Bearer ${state.token}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { data });
  return data;
}
const get  = (p)    => http('GET', p);
const post = (p, b) => http('POST', p, b);
const patch= (p, b) => http('PATCH', p, b);
const del  = (p)    => http('DELETE', p);

/* ── Format helpers ────────────────────────────────────────── */
const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const badge = (cls, text) => `<span class="badge badge-${cls}">${text}</span>`;

/* ── DOM refs ──────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const loginScreen = $('login-screen');
const app         = $('app');

/* ════════════════════════════════════════════════════════════
   AUTH TAB SWITCHER
═══════════════════════════════════════════════════════════ */
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.tab;
    $('tab-login').classList.toggle('hidden',    target !== 'login');
    $('tab-register').classList.toggle('hidden', target !== 'register');
  });
});

/* ════════════════════════════════════════════════════════════
   AUTH
═══════════════════════════════════════════════════════════ */
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = $('login-error');
  errEl.classList.add('hidden');
  try {
    const data = await post('/auth/login', {
      email:    $('l-email').value.trim(),
      password: $('l-password').value,
      role:     $('l-role').value,
    });
    state.token = data.token;
    state.role  = data.role;
    state.email = $('l-email').value.trim();
    localStorage.setItem('token', data.token);
    localStorage.setItem('role',  data.role);
    localStorage.setItem('email', state.email);
    bootApp();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

$('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = $('register-error');
  const okEl  = $('register-success');
  errEl.classList.add('hidden');
  okEl.classList.add('hidden');

  const password = $('r-password').value;
  const confirm  = $('r-confirm').value;
  if (password !== confirm) {
    errEl.textContent = 'Passwords do not match';
    errEl.classList.remove('hidden');
    return;
  }

  try {
    await post('/auth/register', {
      full_name: $('r-name').value.trim(),
      email:     $('r-email').value.trim(),
      password,
      role:      $('r-role').value,
      status:    'active',
    });
    okEl.textContent = 'Account created! You can now sign in.';
    okEl.classList.remove('hidden');
    $('register-form').reset();

    // Pre-fill login tab and switch to it after a moment
    setTimeout(() => {
      $('l-email').value = $('r-email').value || e.target.querySelector('#r-email').value;
      document.querySelector('[data-tab="login"]').click();
    }, 1500);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
});

$('logout-btn').addEventListener('click', async () => {
  try { await post('/auth/logout'); } catch {}
  localStorage.clear();
  Object.assign(state, { token: null, role: null, email: null });
  stopPolling();
  app.classList.add('hidden');
  loginScreen.classList.remove('hidden');
});

/* ════════════════════════════════════════════════════════════
   BOOT
═══════════════════════════════════════════════════════════ */
function bootApp() {
  loginScreen.classList.add('hidden');
  app.classList.remove('hidden');

  $('user-badge').textContent = `${state.email} · ${state.role}`;

  // Show/hide role-gated elements
  document.querySelectorAll('.admin-only').forEach(el => {
    state.role === 'admin' ? el.classList.remove('hidden') : el.classList.add('hidden');
  });
  document.querySelectorAll('.analyst-only').forEach(el => {
    state.role !== 'viewer' ? el.classList.remove('hidden') : el.classList.add('hidden');
  });

  // Nav
  document.querySelectorAll('.nav-item').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      switchView(a.dataset.view);
    });
  });

  switchView('dashboard');
  startPolling();
}

function switchView(view) {
  state.currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(a => a.classList.remove('active'));
  $(`view-${view}`).classList.remove('hidden');
  document.querySelector(`[data-view="${view}"]`).classList.add('active');

  if (view === 'dashboard') loadDashboard();
  if (view === 'records')   loadRecords();
  if (view === 'users')     loadUsers();
}

/* ════════════════════════════════════════════════════════════
   POLLING
═══════════════════════════════════════════════════════════ */
function startPolling() {
  stopPolling();
  state.pollTimer = setInterval(() => {
    if (state.currentView === 'dashboard') loadDashboard(true);
    if (state.currentView === 'records')   loadRecords(true);
  }, 15_000);
}
function stopPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
}

/* ════════════════════════════════════════════════════════════
   DASHBOARD
═══════════════════════════════════════════════════════════ */
async function loadDashboard(poll = false) {
  try {
    const data = await get('/records/dashboard');
    renderKPIs(data.summary);
    renderCharts(data.summary);
    if (data.recent?.length) renderRecent(data.recent);
  } catch (err) {
    console.error('Dashboard load failed', err);
  }
}

function renderKPIs(summary) {
  const totals = {};
  summary.forEach(r => { totals[r.record_type] = { count: r.count, amount: parseFloat(r.total_amount) }; });

  const revenue  = totals.revenue?.amount  || 0;
  const expense  = totals.expense?.amount  || 0;
  const asset    = totals.asset?.amount    || 0;
  const liability= totals.liability?.amount|| 0;
  const netProfit= revenue - expense;

  const kpis = [
    { label: 'Total Revenue',  value: fmt.format(revenue),   sub: `${totals.revenue?.count||0} records`,  color: '#00d4aa' },
    { label: 'Total Expenses', value: fmt.format(expense),   sub: `${totals.expense?.count||0} records`,  color: '#ff4d6d' },
    { label: 'Net Profit',     value: fmt.format(netProfit), sub: netProfit >= 0 ? '▲ Positive' : '▼ Negative', color: netProfit >= 0 ? '#00d4aa' : '#ff4d6d' },
    { label: 'Total Assets',   value: fmt.format(asset),     sub: `${totals.asset?.count||0} records`,    color: '#a09bff' },
    { label: 'Liabilities',    value: fmt.format(liability), sub: `${totals.liability?.count||0} records`,color: '#ffa94d' },
  ];

  $('kpi-row').innerHTML = kpis.map(k => `
    <div class="kpi-card">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value" style="color:${k.color}">${k.value}</div>
      <div class="kpi-sub">${k.sub}</div>
    </div>`).join('');
}

const CHART_COLORS = {
  revenue: '#00d4aa', expense: '#ff4d6d', asset: '#a09bff', liability: '#ffa94d', equity: '#74c0fc',
};

function renderCharts(summary) {
  const labels  = summary.map(r => r.record_type);
  const amounts = summary.map(r => parseFloat(r.total_amount));
  const colors  = labels.map(l => CHART_COLORS[l] || '#888');

  // Donut
  if (state.charts.donut) state.charts.donut.destroy();
  state.charts.donut = new Chart($('chart-donut'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data: amounts, backgroundColor: colors, borderWidth: 0 }] },
    options: {
      plugins: { legend: { position: 'bottom', labels: { color: '#8b90b0', font: { size: 11 } } } },
      cutout: '65%',
    },
  });

  // Bar
  if (state.charts.bar) state.charts.bar.destroy();
  state.charts.bar = new Chart($('chart-bar'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Amount (USD)', data: amounts, backgroundColor: colors, borderRadius: 6 }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#8b90b0' }, grid: { color: '#2e3250' } },
        y: { ticks: { color: '#8b90b0', callback: v => '$' + (v/1000).toFixed(0) + 'k' }, grid: { color: '#2e3250' } },
      },
    },
  });
}

function renderRecent(rows) {
  const tbody = $('recent-table').querySelector('tbody');
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.title}</td>
      <td>${badge(r.record_type, r.record_type)}</td>
      <td class="${r.record_type === 'expense' || r.record_type === 'liability' ? 'amount-negative' : 'amount-positive'}">${fmt.format(r.amount)}</td>
      <td>${fmtDate(r.updated_at)}</td>
    </tr>`).join('');
}

/* ════════════════════════════════════════════════════════════
   RECORDS
═══════════════════════════════════════════════════════════ */
async function loadRecords(poll = false) {
  try {
    const params = new URLSearchParams({
      page:      state.recordsPage,
      page_size: state.recordsPageSize,
    });
    if (state.recordsType)   params.set('type', state.recordsType);
    if (poll && state.lastTimestamp) params.set('since', state.lastTimestamp);

    const data = await get(`/records?${params}`);
    state.lastTimestamp = data.timestamp;

    if (poll) {
      // Merge new/updated rows into existing data
      data.data.forEach(incoming => {
        const idx = state.recordsData.findIndex(r => r.id === incoming.id);
        if (idx >= 0) state.recordsData[idx] = incoming;
        else state.recordsData.unshift(incoming);
      });
    } else {
      state.recordsData  = data.data;
      state.recordsTotal = data.total;
    }

    renderRecordsTable();
    renderPagination();
  } catch (err) {
    console.error('Records load failed', err);
  }
}

function filteredRecords() {
  return state.recordsData.filter(r => {
    const matchSearch = !state.recordsSearch || r.title.toLowerCase().includes(state.recordsSearch.toLowerCase());
    const matchType   = !state.recordsType   || r.record_type === state.recordsType;
    return matchSearch && matchType;
  });
}

function renderRecordsTable() {
  const rows = filteredRecords();
  const tbody = $('records-table').querySelector('tbody');
  const isAdmin = state.role === 'admin';

  tbody.innerHTML = rows.length === 0
    ? `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:2rem">No records found</td></tr>`
    : rows.map(r => `
      <tr>
        <td>${r.title}</td>
        <td>${badge(r.record_type, r.record_type)}</td>
        <td class="${r.record_type === 'expense' || r.record_type === 'liability' ? 'amount-negative' : 'amount-positive'}">${fmt.format(r.amount)}</td>
        <td>${r.currency}</td>
        <td>${fmtDate(r.recorded_at)}</td>
        ${isAdmin ? `<td>
          <button class="btn-sm" onclick="openEditRecord('${r.id}')">Edit</button>
          <button class="btn-danger" onclick="confirmDeleteRecord('${r.id}','${r.title.replace(/'/g,"\\'")}')">Del</button>
        </td>` : '<td></td>'}
      </tr>`).join('');
}

function renderPagination() {
  const total = state.recordsTotal;
  const pages = Math.ceil(total / state.recordsPageSize);
  const el    = $('records-pagination');
  if (pages <= 1) { el.innerHTML = ''; return; }

  let html = `<button ${state.recordsPage === 1 ? 'disabled' : ''} onclick="goPage(${state.recordsPage - 1})">‹</button>`;
  for (let i = 1; i <= pages; i++) {
    html += `<button class="${i === state.recordsPage ? 'active' : ''}" onclick="goPage(${i})">${i}</button>`;
  }
  html += `<button ${state.recordsPage === pages ? 'disabled' : ''} onclick="goPage(${state.recordsPage + 1})">›</button>`;
  el.innerHTML = html;
}

window.goPage = (p) => { state.recordsPage = p; loadRecords(); };

// Filters
$('search-input').addEventListener('input', (e) => {
  state.recordsSearch = e.target.value;
  renderRecordsTable();
});
$('type-filter').addEventListener('change', (e) => {
  state.recordsType = e.target.value;
  state.recordsPage = 1;
  loadRecords();
});

// New record
$('new-record-btn')?.addEventListener('click', () => openNewRecord());

window.openNewRecord = () => {
  openModal('New Financial Record', `
    <form class="modal-form" id="record-form">
      <label>Title <input name="title" required /></label>
      <label>Type
        <select name="record_type">
          <option value="revenue">Revenue</option>
          <option value="expense">Expense</option>
          <option value="asset">Asset</option>
          <option value="liability">Liability</option>
          <option value="equity">Equity</option>
        </select>
      </label>
      <label>Amount <input name="amount" type="number" step="0.01" min="0.01" required /></label>
      <label>Currency <input name="currency" value="USD" maxlength="3" /></label>
      <label>Date <input name="recorded_at" type="date" /></label>
      <label>Description <textarea name="description"></textarea></label>
      <div class="modal-actions">
        <button type="button" class="btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn-primary">Create</button>
      </div>
    </form>`);

  $('record-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      title:       fd.get('title'),
      record_type: fd.get('record_type'),
      amount:      parseFloat(fd.get('amount')),
      currency:    fd.get('currency') || 'USD',
      description: fd.get('description') || undefined,
      recorded_at: fd.get('recorded_at') || undefined,
    };
    try {
      await post('/records', body);
      closeModal();
      state.recordsPage = 1;
      loadRecords();
      loadDashboard();
    } catch (err) { alert(err.message); }
  });
};

window.openEditRecord = async (id) => {
  const record = state.recordsData.find(r => r.id === id);
  if (!record) return;

  openModal('Edit Record', `
    <form class="modal-form" id="edit-record-form">
      <label>Title <input name="title" value="${record.title}" required /></label>
      <label>Type
        <select name="record_type">
          ${['revenue','expense','asset','liability','equity'].map(t =>
            `<option value="${t}" ${record.record_type === t ? 'selected' : ''}>${t}</option>`
          ).join('')}
        </select>
      </label>
      <label>Amount <input name="amount" type="number" step="0.01" value="${record.amount}" required /></label>
      <label>Currency <input name="currency" value="${record.currency}" maxlength="3" /></label>
      <label>Date <input name="recorded_at" type="date" value="${record.recorded_at?.slice(0,10)||''}" /></label>
      <label>Description <textarea name="description">${record.description||''}</textarea></label>
      <div class="modal-actions">
        <button type="button" class="btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn-primary">Save</button>
      </div>
    </form>`);

  $('edit-record-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      title:          fd.get('title'),
      record_type:    fd.get('record_type'),
      amount:         parseFloat(fd.get('amount')),
      currency:       fd.get('currency'),
      description:    fd.get('description') || undefined,
      recorded_at:    fd.get('recorded_at') || undefined,
      client_version: record.version,
    };
    try {
      await patch(`/records/${id}`, body);
      closeModal();
      loadRecords();
      loadDashboard();
    } catch (err) {
      if (err.data?.server_version) {
        alert(`Version conflict — someone else updated this record (server v${err.data.server_version}). Re-fetching…`);
        loadRecords();
      } else {
        alert(err.message);
      }
    }
  });
};

window.confirmDeleteRecord = (id, title) => {
  if (!confirm(`Delete "${title}"?`)) return;
  del(`/records/${id}`)
    .then(() => { loadRecords(); loadDashboard(); })
    .catch(err => alert(err.message));
};

/* ════════════════════════════════════════════════════════════
   USERS
═══════════════════════════════════════════════════════════ */
async function loadUsers() {
  try {
    const rows = await get(`/users/${state.usersRole}`);
    renderUsersTable(rows);
  } catch (err) {
    console.error('Users load failed', err);
  }
}

function renderUsersTable(rows) {
  const tbody = $('users-table').querySelector('tbody');
  tbody.innerHTML = rows.length === 0
    ? `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:2rem">No users found</td></tr>`
    : rows.map(u => `
      <tr>
        <td>${u.full_name}</td>
        <td>${u.email}</td>
        <td>${badge(u.status, u.status)}</td>
        <td>${fmtDate(u.created_at)}</td>
        <td>
          <button class="btn-sm" onclick="openEditUser('${u.id}','${state.usersRole}','${u.full_name.replace(/'/g,"\\'")}','${u.status}')">Edit</button>
          ${u.status === 'active'
            ? `<button class="btn-danger" onclick="deactivateUser('${u.id}','${state.usersRole}')">Deactivate</button>`
            : ''}
        </td>
      </tr>`).join('');
}

// Tabs
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    state.usersRole = tab.dataset.role;
    loadUsers();
  });
});

$('new-user-btn')?.addEventListener('click', () => openNewUser());

window.openNewUser = () => {
  openModal('New User', `
    <form class="modal-form" id="user-form">
      <label>Full Name <input name="full_name" required /></label>
      <label>Email <input name="email" type="email" required /></label>
      <label>Password <input name="password" type="password" minlength="8" required /></label>
      <label>Role
        <select name="role">
          <option value="admin">Admin</option>
          <option value="analyst">Analyst</option>
          <option value="viewer">Viewer</option>
        </select>
      </label>
      <div class="modal-actions">
        <button type="button" class="btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn-primary">Create</button>
      </div>
    </form>`);

  $('user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await post('/users', {
        full_name: fd.get('full_name'),
        email:     fd.get('email'),
        password:  fd.get('password'),
        role:      fd.get('role'),
        status:    'active',
      });
      closeModal();
      loadUsers();
    } catch (err) { alert(err.message); }
  });
};

window.openEditUser = (id, role, fullName, status) => {
  openModal('Edit User', `
    <form class="modal-form" id="edit-user-form">
      <label>Full Name <input name="full_name" value="${fullName}" /></label>
      <label>Status
        <select name="status">
          <option value="active"   ${status === 'active'   ? 'selected' : ''}>Active</option>
          <option value="inactive" ${status === 'inactive' ? 'selected' : ''}>Inactive</option>
        </select>
      </label>
      <label>New Password (leave blank to keep) <input name="password" type="password" minlength="8" /></label>
      <div class="modal-actions">
        <button type="button" class="btn-ghost" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn-primary">Save</button>
      </div>
    </form>`);

  $('edit-user-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {};
    if (fd.get('full_name')) body.full_name = fd.get('full_name');
    if (fd.get('status'))    body.status    = fd.get('status');
    if (fd.get('password'))  body.password  = fd.get('password');
    try {
      await patch(`/users/${role}/${id}`, body);
      closeModal();
      loadUsers();
    } catch (err) { alert(err.message); }
  });
};

window.deactivateUser = async (id, role) => {
  if (!confirm('Deactivate this user and revoke all their sessions?')) return;
  try {
    await del(`/users/${role}/${id}`);
    loadUsers();
  } catch (err) { alert(err.message); }
};

/* ════════════════════════════════════════════════════════════
   MODAL
═══════════════════════════════════════════════════════════ */
function openModal(title, bodyHtml) {
  $('modal-title').textContent = title;
  $('modal-body').innerHTML = bodyHtml;
  $('modal-overlay').classList.remove('hidden');
}
window.closeModal = () => $('modal-overlay').classList.add('hidden');
$('modal-close').addEventListener('click', closeModal);
$('modal-overlay').addEventListener('click', (e) => { if (e.target === $('modal-overlay')) closeModal(); });

/* ════════════════════════════════════════════════════════════
   INIT — auto-login if token exists
═══════════════════════════════════════════════════════════ */
if (state.token && state.role) {
  bootApp();
}
