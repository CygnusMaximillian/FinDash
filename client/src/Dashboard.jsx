import React, { useState, useEffect, useRef } from 'react';
import { api } from './App';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

const fmt     = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

const CHART_COLORS = {
  revenue: '#00d4aa', expense: '#ff4d6d', asset: '#a09bff', liability: '#ffa94d', equity: '#74c0fc',
};

export default function Dashboard({ role, pollTick }) {
  const [summary, setSummary] = useState([]);
  const [recent,  setRecent]  = useState([]);

  const donutRef = useRef(null);
  const barRef   = useRef(null);
  const donutChart = useRef(null);
  const barChart   = useRef(null);

  // Load dashboard data on mount and every poll tick
  useEffect(() => {
    api('GET', '/records/dashboard')
      .then(data => {
        setSummary(data.summary || []);
        setRecent(data.recent  || []);
      })
      .catch(err => console.error('Dashboard load failed', err));
  }, [pollTick]);

  // Rebuild charts whenever summary changes
  useEffect(() => {
    if (!summary.length) return;

    const labels  = summary.map(r => r.record_type);
    const amounts = summary.map(r => parseFloat(r.total_amount));
    const colors  = labels.map(l => CHART_COLORS[l] || '#888');

    if (donutChart.current) donutChart.current.destroy();
    donutChart.current = new Chart(donutRef.current, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: amounts, backgroundColor: colors, borderWidth: 0 }] },
      options: {
        plugins: { legend: { position: 'bottom', labels: { color: '#8b90b0', font: { size: 11 } } } },
        cutout: '65%',
      },
    });

    if (barChart.current) barChart.current.destroy();
    barChart.current = new Chart(barRef.current, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Amount (USD)', data: amounts, backgroundColor: colors, borderRadius: 6 }] },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#8b90b0' }, grid: { color: '#2e3250' } },
          y: { ticks: { color: '#8b90b0', callback: v => '$' + (v / 1000).toFixed(0) + 'k' }, grid: { color: '#2e3250' } },
        },
      },
    });

    return () => {
      donutChart.current?.destroy();
      barChart.current?.destroy();
    };
  }, [summary]);

  // Build KPI cards from summary data
  const totals = {};
  summary.forEach(r => { totals[r.record_type] = { count: r.count, amount: parseFloat(r.total_amount) }; });
  const revenue   = totals.revenue?.amount   || 0;
  const expense   = totals.expense?.amount   || 0;
  const netProfit = revenue - expense;

  const kpis = [
    { label: 'Total Revenue',  value: fmt.format(revenue),              sub: `${totals.revenue?.count  || 0} records`, color: '#00d4aa' },
    { label: 'Total Expenses', value: fmt.format(expense),              sub: `${totals.expense?.count  || 0} records`, color: '#ff4d6d' },
    { label: 'Net Profit',     value: fmt.format(netProfit),            sub: netProfit >= 0 ? '▲ Positive' : '▼ Negative', color: netProfit >= 0 ? '#00d4aa' : '#ff4d6d' },
    { label: 'Total Assets',   value: fmt.format(totals.asset?.amount   || 0), sub: `${totals.asset?.count     || 0} records`, color: '#a09bff' },
    { label: 'Liabilities',    value: fmt.format(totals.liability?.amount || 0), sub: `${totals.liability?.count || 0} records`, color: '#ffa94d' },
  ];

  return (
    <section className="view">
      <div className="page-header">
        <h1>Dashboard</h1>
        <span className="poll-dot" title="Live polling active" />
      </div>

      {/* KPI cards */}
      <div className="kpi-row">
        {kpis.map(k => (
          <div className="kpi-card" key={k.label}>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={{ color: k.color }}>{k.value}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="charts-row">
        <div className="chart-card">
          <h3>By Type</h3>
          <canvas ref={donutRef} />
        </div>
        <div className="chart-card wide">
          <h3>Amount by Type</h3>
          <canvas ref={barRef} />
        </div>
      </div>

      {/* Recent activity — visible to analysts and admins */}
      {role !== 'viewer' && recent.length > 0 && (
        <div className="card">
          <h3>Recent Activity</h3>
          <table>
            <thead>
              <tr><th>Title</th><th>Type</th><th>Amount</th><th>Updated</th></tr>
            </thead>
            <tbody>
              {recent.map(r => (
                <tr key={r.id}>
                  <td>{r.title}</td>
                  <td><span className={`badge badge-${r.record_type}`}>{r.record_type}</span></td>
                  <td className={r.record_type === 'expense' || r.record_type === 'liability' ? 'amount-negative' : 'amount-positive'}>
                    {fmt.format(r.amount)}
                  </td>
                  <td>{fmtDate(r.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
