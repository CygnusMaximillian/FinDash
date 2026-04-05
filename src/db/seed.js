import bcrypt from 'bcrypt';
import { pool } from './pool.js';

const ROUNDS = 12;

// ── Seed users ────────────────────────────────────────────────
const users = [
  { table: 'admins',   email: 'admin@finboard.dev',   password: 'Admin1234!',   full_name: 'Alice Admin' },
  { table: 'analysts', email: 'analyst@finboard.dev', password: 'Analyst1234!', full_name: 'Bob Analyst' },
  { table: 'viewers',  email: 'viewer@finboard.dev',  password: 'Viewer1234!',  full_name: 'Carol Viewer' },
];

// ── Seed financial records ────────────────────────────────────
const records = [
  { title: 'Q1 Product Revenue',        record_type: 'revenue',   amount: 128500.00, currency: 'USD', description: 'SaaS subscription revenue Q1', recorded_at: '2025-01-31' },
  { title: 'Q2 Product Revenue',        record_type: 'revenue',   amount: 154200.00, currency: 'USD', description: 'SaaS subscription revenue Q2', recorded_at: '2025-04-30' },
  { title: 'Q3 Product Revenue',        record_type: 'revenue',   amount: 172800.00, currency: 'USD', description: 'SaaS subscription revenue Q3', recorded_at: '2025-07-31' },
  { title: 'Q4 Product Revenue',        record_type: 'revenue',   amount: 198400.00, currency: 'USD', description: 'SaaS subscription revenue Q4', recorded_at: '2025-10-31' },
  { title: 'Consulting Services',       record_type: 'revenue',   amount:  42000.00, currency: 'USD', description: 'Professional services billed', recorded_at: '2025-03-15' },
  { title: 'Office Lease',              record_type: 'expense',   amount:  18000.00, currency: 'USD', description: 'Annual office rent payment',   recorded_at: '2025-01-01' },
  { title: 'Cloud Infrastructure',      record_type: 'expense',   amount:  24600.00, currency: 'USD', description: 'AWS + GCP annual spend',       recorded_at: '2025-06-30' },
  { title: 'Payroll Q1',                record_type: 'expense',   amount:  95000.00, currency: 'USD', description: 'Staff salaries Q1',           recorded_at: '2025-03-31' },
  { title: 'Payroll Q2',                record_type: 'expense',   amount:  97500.00, currency: 'USD', description: 'Staff salaries Q2',           recorded_at: '2025-06-30' },
  { title: 'Marketing Campaign',        record_type: 'expense',   amount:  15800.00, currency: 'USD', description: 'Digital ads + events',        recorded_at: '2025-05-01' },
  { title: 'Software Licences',         record_type: 'expense',   amount:   8200.00, currency: 'USD', description: 'Tooling and SaaS licences',   recorded_at: '2025-02-01' },
  { title: 'Company Laptops',           record_type: 'asset',     amount:  32000.00, currency: 'USD', description: '16 MacBook Pros',             recorded_at: '2025-01-15' },
  { title: 'Office Furniture',          record_type: 'asset',     amount:  11500.00, currency: 'USD', description: 'Desks, chairs, monitors',     recorded_at: '2025-01-20' },
  { title: 'Cash Reserves',             record_type: 'asset',     amount: 320000.00, currency: 'USD', description: 'Operating cash in bank',      recorded_at: '2025-10-01' },
  { title: 'IP & Patents',              record_type: 'asset',     amount:  75000.00, currency: 'USD', description: 'Registered IP valuation',     recorded_at: '2025-04-01' },
  { title: 'Bank Loan',                 record_type: 'liability', amount: 150000.00, currency: 'USD', description: 'Term loan — 3 yr repayment',  recorded_at: '2025-01-01' },
  { title: 'Accounts Payable',          record_type: 'liability', amount:  22400.00, currency: 'USD', description: 'Outstanding vendor invoices', recorded_at: '2025-09-30' },
  { title: 'Deferred Revenue',          record_type: 'liability', amount:  38000.00, currency: 'USD', description: 'Annual subscriptions prepaid', recorded_at: '2025-07-01' },
  { title: 'Founder Equity',            record_type: 'equity',    amount: 500000.00, currency: 'USD', description: 'Initial founder capital',     recorded_at: '2024-01-01' },
  { title: 'Retained Earnings 2024',    record_type: 'equity',    amount:  84300.00, currency: 'USD', description: 'Profit carried forward',      recorded_at: '2024-12-31' },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Users ──────────────────────────────────────────────────
    let adminId;
    for (const u of users) {
      const hash = await bcrypt.hash(u.password, ROUNDS);
      const { rows } = await client.query(
        `INSERT INTO ${u.table} (email, password_hash, full_name, status)
         VALUES ($1, $2, $3, 'active')
         ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
         RETURNING id`,
        [u.email, hash, u.full_name]
      );
      if (u.table === 'admins') adminId = rows[0].id;
      console.log(`  ✓ ${u.table.slice(0, -1)}: ${u.email}`);
    }

    // ── Financial records ──────────────────────────────────────
    for (const r of records) {
      const { rows } = await client.query(
        `INSERT INTO financial_records
           (title, record_type, amount, currency, description, recorded_at,
            last_updated_by, last_updated_role, created_by, created_role)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'admin',$7,'admin')
         ON CONFLICT DO NOTHING
         RETURNING id, version`,
        [r.title, r.record_type, r.amount, r.currency, r.description, r.recorded_at, adminId]
      );
      if (rows.length > 0) {
        await client.query(
          `INSERT INTO financial_record_audit (record_id, version, snapshot, changed_by, changed_role)
           VALUES ($1, 1, $2, $3, 'admin')`,
          [rows[0].id, JSON.stringify({ ...r, id: rows[0].id, version: 1 }), adminId]
        );
        console.log(`  ✓ record: ${r.title}`);
      } else {
        console.log(`  – skipped (exists): ${r.title}`);
      }
    }

    await client.query('COMMIT');
    console.log('\n✅  Seed complete.');
    console.log('\nLogin credentials:');
    console.log('  admin@finboard.dev   / Admin1234!   (role: admin)');
    console.log('  analyst@finboard.dev / Analyst1234! (role: analyst)');
    console.log('  viewer@finboard.dev  / Viewer1234!  (role: viewer)');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌  Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
