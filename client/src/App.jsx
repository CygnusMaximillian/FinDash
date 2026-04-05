import React, { useState, useEffect } from 'react';
import Dashboard from './Dashboard';
import Records from './Records';
import Users from './Users';

// ── API helper ────────────────────────────────────────────────
// All fetch calls go through here. Reads token from localStorage.
async function api(method, path, body) {
  const token = localStorage.getItem('token');
  const res = await fetch('/api' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { data });
  return data;
}

export { api }; // shared by child components

// ─────────────────────────────────────────────────────────────

export default function App() {
  // Auth state — read from localStorage on first load
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [role,  setRole]  = useState(() => localStorage.getItem('role'));
  const [email, setEmail] = useState(() => localStorage.getItem('email'));

  // Which page is visible
  const [view, setView] = useState('dashboard');

  // Login/register tab
  const [authTab, setAuthTab] = useState('login');

  // Form error/success messages
  const [loginError,       setLoginError]       = useState('');
  const [registerError,    setRegisterError]    = useState('');
  const [registerSuccess,  setRegisterSuccess]  = useState('');

  // ── Polling: refresh current view every 15 s ──────────────
  // We expose a counter that child components watch to know when to reload
  const [pollTick, setPollTick] = useState(0);
  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => setPollTick(t => t + 1), 15_000);
    return () => clearInterval(id);
  }, [token]);

  // ── Login ─────────────────────────────────────────────────
  async function handleLogin(e) {
    e.preventDefault();
    setLoginError('');
    const fd = new FormData(e.target);
    try {
      const data = await api('POST', '/auth/login', {
        email:    fd.get('email'),
        password: fd.get('password'),
        role:     fd.get('role'),
      });
      localStorage.setItem('token', data.token);
      localStorage.setItem('role',  data.role);
      localStorage.setItem('email', fd.get('email'));
      setToken(data.token);
      setRole(data.role);
      setEmail(fd.get('email'));
      setView('dashboard');
    } catch (err) {
      setLoginError(err.message);
    }
  }

  // ── Register ──────────────────────────────────────────────
  async function handleRegister(e) {
    e.preventDefault();
    setRegisterError('');
    setRegisterSuccess('');
    const fd = new FormData(e.target);
    if (fd.get('password') !== fd.get('confirm')) {
      setRegisterError('Passwords do not match');
      return;
    }
    try {
      await api('POST', '/auth/register', {
        full_name: fd.get('full_name'),
        email:     fd.get('email'),
        password:  fd.get('password'),
        role:      fd.get('role'),
        status:    'active',
      });
      setRegisterSuccess('Account created! You can now sign in.');
      e.target.reset();
      setTimeout(() => setAuthTab('login'), 1500);
    } catch (err) {
      setRegisterError(err.message);
    }
  }

  // ── Logout ────────────────────────────────────────────────
  async function handleLogout() {
    try { await api('POST', '/auth/logout'); } catch {}
    localStorage.clear();
    setToken(null);
    setRole(null);
    setEmail(null);
  }

  // ── Not logged in → show login/register screen ────────────
  if (!token) {
    return (
      <div id="login-screen">
        <div className="login-card">
          <div className="login-logo">📊 FinBoard</div>

          <div className="auth-tabs">
            <button className={`auth-tab ${authTab === 'login' ? 'active' : ''}`} onClick={() => setAuthTab('login')}>Sign in</button>
            <button className={`auth-tab ${authTab === 'register' ? 'active' : ''}`} onClick={() => setAuthTab('register')}>Register</button>
          </div>

          {authTab === 'login' && (
            <div>
              {loginError && <div className="alert">{loginError}</div>}
              <form onSubmit={handleLogin}>
                <label>Email
                  <input type="email" name="email" placeholder="admin@finboard.dev" required />
                </label>
                <label>Password
                  <input type="password" name="password" placeholder="••••••••" required />
                </label>
                <label>Role
                  <select name="role">
                    <option value="admin">Admin</option>
                    <option value="analyst">Analyst</option>
                    <option value="viewer">Viewer</option>
                  </select>
                </label>
                <button type="submit" className="btn-primary">Sign in</button>
              </form>
              <p className="hint">Demo — admin@finboard.dev / Admin1234!</p>
            </div>
          )}

          {authTab === 'register' && (
            <div>
              {registerError   && <div className="alert">{registerError}</div>}
              {registerSuccess && <div className="alert-success">{registerSuccess}</div>}
              <form onSubmit={handleRegister}>
                <label>Full Name
                  <input type="text" name="full_name" placeholder="Jane Smith" required />
                </label>
                <label>Email
                  <input type="email" name="email" placeholder="jane@example.com" required />
                </label>
                <label>Password
                  <input type="password" name="password" placeholder="Min 8 characters" minLength={8} required />
                </label>
                <label>Confirm Password
                  <input type="password" name="confirm" placeholder="Repeat password" required />
                </label>
                <label>Role
                  <select name="role">
                    <option value="viewer">Viewer — read-only dashboard</option>
                    <option value="analyst">Analyst — view records &amp; insights</option>
                    <option value="admin">Admin — full access</option>
                  </select>
                </label>
                <button type="submit" className="btn-primary">Create account</button>
              </form>
              <p className="hint">After registering, sign in with your credentials.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Logged in → show app shell ────────────────────────────
  return (
    <div id="app">
      <aside id="sidebar">
        <div className="sidebar-logo">📊 FinBoard</div>
        <nav>
          <a href="#" className={`nav-item ${view === 'dashboard' ? 'active' : ''}`} onClick={e => { e.preventDefault(); setView('dashboard'); }}>Dashboard</a>
          <a href="#" className={`nav-item ${view === 'records'   ? 'active' : ''}`} onClick={e => { e.preventDefault(); setView('records'); }}>Records</a>
          {role === 'admin' && (
            <a href="#" className={`nav-item ${view === 'users' ? 'active' : ''}`} onClick={e => { e.preventDefault(); setView('users'); }}>Users</a>
          )}
        </nav>
        <div className="sidebar-footer">
          <span id="user-badge">{email} · {role}</span>
          <button className="btn-ghost" onClick={handleLogout}>Sign out</button>
        </div>
      </aside>

      <main id="content">
        {view === 'dashboard' && <Dashboard role={role} pollTick={pollTick} />}
        {view === 'records'   && <Records   role={role} pollTick={pollTick} />}
        {view === 'users'     && <Users />}
      </main>
    </div>
  );
}
