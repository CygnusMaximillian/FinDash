import React, { useState, useEffect } from 'react';
import { api } from './App';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

export default function Users() {
  const [roleTab, setRoleTab] = useState('admin');
  const [users,   setUsers]   = useState([]);
  const [modal,   setModal]   = useState(null); // null | 'new' | user-object (for edit)

  // Load users whenever the role tab changes
  useEffect(() => {
    api('GET', `/users/${roleTab}`)
      .then(setUsers)
      .catch(err => console.error('Users load failed', err));
  }, [roleTab]);

  async function createUser(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('POST', '/users', {
        full_name: fd.get('full_name'),
        email:     fd.get('email'),
        password:  fd.get('password'),
        role:      fd.get('role'),
        status:    'active',
      });
      setModal(null);
      setRoleTab(t => t); // re-trigger load
    } catch (err) { alert(err.message); }
  }

  async function updateUser(e, user) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {};
    if (fd.get('full_name')) body.full_name = fd.get('full_name');
    if (fd.get('status'))    body.status    = fd.get('status');
    if (fd.get('password'))  body.password  = fd.get('password');
    try {
      await api('PATCH', `/users/${roleTab}/${user.id}`, body);
      setModal(null);
      setRoleTab(t => t);
    } catch (err) { alert(err.message); }
  }

  async function deactivateUser(user) {
    if (!confirm('Deactivate this user and revoke all their sessions?')) return;
    try {
      await api('DELETE', `/users/${roleTab}/${user.id}`);
      setRoleTab(t => t);
    } catch (err) { alert(err.message); }
  }

  return (
    <section className="view">
      <div className="page-header">
        <h1>User Management</h1>
        <button className="btn-primary" onClick={() => setModal('new')}>+ New User</button>
      </div>

      <div className="tabs">
        {['admin', 'analyst', 'viewer'].map(r => (
          <button key={r} className={`tab ${roleTab === r ? 'active' : ''}`} onClick={() => setRoleTab(r)}>
            {r.charAt(0).toUpperCase() + r.slice(1)}s
          </button>
        ))}
      </div>

      <div className="card">
        <table>
          <thead>
            <tr><th>Name</th><th>Email</th><th>Status</th><th>Created</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>No users found</td></tr>
            ) : users.map(u => (
              <tr key={u.id}>
                <td>{u.full_name}</td>
                <td>{u.email}</td>
                <td><span className={`badge badge-${u.status}`}>{u.status}</span></td>
                <td>{fmtDate(u.created_at)}</td>
                <td>
                  <button className="btn-sm" onClick={() => setModal(u)}>Edit</button>{' '}
                  {u.status === 'active' && (
                    <button className="btn-danger" onClick={() => deactivateUser(u)}>Deactivate</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* New user modal */}
      {modal === 'new' && (
        <Modal title="New User" onClose={() => setModal(null)}>
          <form className="modal-form" onSubmit={createUser}>
            <label>Full Name <input name="full_name" required /></label>
            <label>Email <input name="email" type="email" required /></label>
            <label>Password <input name="password" type="password" minLength={8} required /></label>
            <label>Role
              <select name="role">
                <option value="admin">Admin</option>
                <option value="analyst">Analyst</option>
                <option value="viewer">Viewer</option>
              </select>
            </label>
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn-primary">Create</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit user modal */}
      {modal && modal !== 'new' && (
        <Modal title="Edit User" onClose={() => setModal(null)}>
          <form className="modal-form" onSubmit={e => updateUser(e, modal)}>
            <label>Full Name <input name="full_name" defaultValue={modal.full_name} /></label>
            <label>Status
              <select name="status" defaultValue={modal.status}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <label>New Password (leave blank to keep) <input name="password" type="password" minLength={8} /></label>
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn-primary">Save</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div id="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div id="modal-box">
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2 id="modal-title">{title}</h2>
        <div id="modal-body">{children}</div>
      </div>
    </div>
  );
}
