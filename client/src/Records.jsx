import React, { useState, useEffect } from 'react';
import { api } from './App';

const fmt     = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const TYPES   = ['revenue', 'expense', 'asset', 'liability', 'equity'];

export default function Records({ role, pollTick }) {
  const [records,    setRecords]    = useState([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [search,     setSearch]     = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [modal,      setModal]      = useState(null); // null | 'new' | record-object (for edit)

  const pageSize = 15;
  const isAdmin  = role === 'admin';

  // Load records whenever page, typeFilter, or pollTick changes
  useEffect(() => {
    const params = new URLSearchParams({ page, page_size: pageSize });
    if (typeFilter) params.set('type', typeFilter);
    api('GET', `/records?${params}`)
      .then(data => { setRecords(data.data); setTotal(data.total); })
      .catch(err => console.error('Records load failed', err));
  }, [page, typeFilter, pollTick]);

  // Client-side search filter (no extra API call)
  const visible = records.filter(r =>
    !search || r.title.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(total / pageSize);

  async function createRecord(e) {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('POST', '/records', {
        title:       fd.get('title'),
        record_type: fd.get('record_type'),
        amount:      parseFloat(fd.get('amount')),
        currency:    fd.get('currency') || 'USD',
        description: fd.get('description') || undefined,
        recorded_at: fd.get('recorded_at') || undefined,
      });
      setModal(null);
      setPage(1);
    } catch (err) { alert(err.message); }
  }

  async function updateRecord(e, record) {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('PATCH', `/records/${record.id}`, {
        title:          fd.get('title'),
        record_type:    fd.get('record_type'),
        amount:         parseFloat(fd.get('amount')),
        currency:       fd.get('currency'),
        description:    fd.get('description') || undefined,
        recorded_at:    fd.get('recorded_at') || undefined,
        client_version: record.version,
      });
      setModal(null);
      setPage(page); // re-trigger load
    } catch (err) {
      if (err.data?.server_version) {
        alert(`Version conflict — someone else updated this record (server v${err.data.server_version}). Re-fetching…`);
        setModal(null);
      } else {
        alert(err.message);
      }
    }
  }

  async function deleteRecord(record) {
    if (!confirm(`Delete "${record.title}"?`)) return;
    try {
      await api('DELETE', `/records/${record.id}`);
      setPage(1);
    } catch (err) { alert(err.message); }
  }

  return (
    <section className="view">
      <div className="page-header">
        <h1>Financial Records</h1>
        {isAdmin && <button className="btn-primary" onClick={() => setModal('new')}>+ New Record</button>}
      </div>

      <div className="filters">
        <input
          type="text"
          placeholder="Search title…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}>
          <option value="">All types</option>
          {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Title</th><th>Type</th><th>Amount</th><th>Currency</th><th>Date</th>
              {isAdmin && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={isAdmin ? 6 : 5} style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>No records found</td></tr>
            ) : visible.map(r => (
              <tr key={r.id}>
                <td>{r.title}</td>
                <td><span className={`badge badge-${r.record_type}`}>{r.record_type}</span></td>
                <td className={r.record_type === 'expense' || r.record_type === 'liability' ? 'amount-negative' : 'amount-positive'}>
                  {fmt.format(r.amount)}
                </td>
                <td>{r.currency}</td>
                <td>{fmtDate(r.recorded_at)}</td>
                {isAdmin && (
                  <td>
                    <button className="btn-sm" onClick={() => setModal(r)}>Edit</button>{' '}
                    <button className="btn-danger" onClick={() => deleteRecord(r)}>Del</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button key={p} className={p === page ? 'active' : ''} onClick={() => setPage(p)}>{p}</button>
            ))}
            <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>›</button>
          </div>
        )}
      </div>

      {/* New record modal */}
      {modal === 'new' && (
        <Modal title="New Financial Record" onClose={() => setModal(null)}>
          <form className="modal-form" onSubmit={createRecord}>
            <label>Title <input name="title" required /></label>
            <label>Type
              <select name="record_type">
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label>Amount <input name="amount" type="number" step="0.01" min="0.01" required /></label>
            <label>Currency <input name="currency" defaultValue="USD" maxLength={3} /></label>
            <label>Date <input name="recorded_at" type="date" /></label>
            <label>Description <textarea name="description" /></label>
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn-primary">Create</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit record modal */}
      {modal && modal !== 'new' && (
        <Modal title="Edit Record" onClose={() => setModal(null)}>
          <form className="modal-form" onSubmit={e => updateRecord(e, modal)}>
            <label>Title <input name="title" defaultValue={modal.title} required /></label>
            <label>Type
              <select name="record_type" defaultValue={modal.record_type}>
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label>Amount <input name="amount" type="number" step="0.01" defaultValue={modal.amount} required /></label>
            <label>Currency <input name="currency" defaultValue={modal.currency} maxLength={3} /></label>
            <label>Date <input name="recorded_at" type="date" defaultValue={modal.recorded_at?.slice(0, 10) || ''} /></label>
            <label>Description <textarea name="description" defaultValue={modal.description || ''} /></label>
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

// Simple modal wrapper
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
