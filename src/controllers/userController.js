import bcrypt from 'bcrypt';
import { query } from '../db/pool.js';

const TABLE  = { admin: 'admins', analyst: 'analysts', viewer: 'viewers' };
const ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);

function resolveTable(role, res) {
  const table = TABLE[role];
  if (!table) { res.status(400).json({ error: 'Unknown role' }); return null; }
  return table;
}

export async function listUsers(req, res) {
  const table = resolveTable(req.params.role, res);
  if (!table) return;
  const { rows } = await query(
    `SELECT id, email, full_name, status, created_at FROM ${table} ORDER BY created_at DESC`
  );
  res.json(rows);
}

export async function getUser(req, res) {
  const table = resolveTable(req.params.role, res);
  if (!table) return;
  const { rows } = await query(
    `SELECT id, email, full_name, status, created_at, updated_at FROM ${table} WHERE id = $1`,
    [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
}

export async function createUser(req, res) {
  const { email, password, full_name, role, status } = req.body;
  const table = resolveTable(role, res);
  if (!table) return;

  const password_hash = await bcrypt.hash(password, ROUNDS);
  try {
    const { rows } = await query(
      `INSERT INTO ${table} (email, password_hash, full_name, status)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, full_name, status, created_at`,
      [email, password_hash, full_name, status]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    throw err;
  }
}

export async function updateUser(req, res) {
  const table = resolveTable(req.params.role, res);
  if (!table) return;

  const { full_name, status, password } = req.body;
  const setClauses = [];
  const values     = [];
  let idx = 1;

  if (full_name !== undefined) { setClauses.push(`full_name = $${idx++}`);     values.push(full_name); }
  if (status    !== undefined) { setClauses.push(`status = $${idx++}`);        values.push(status); }
  if (password  !== undefined) {
    setClauses.push(`password_hash = $${idx++}`);
    values.push(await bcrypt.hash(password, ROUNDS));
  }

  if (setClauses.length === 0) return res.status(400).json({ error: 'No fields to update' });

  values.push(req.params.id);
  const { rows } = await query(
    `UPDATE ${table} SET ${setClauses.join(', ')} WHERE id = $${idx}
     RETURNING id, email, full_name, status, updated_at`,
    values
  );
  if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
}

export async function deactivateUser(req, res) {
  const table = resolveTable(req.params.role, res);
  if (!table) return;

  const { rows } = await query(
    `UPDATE ${table} SET status = 'inactive' WHERE id = $1 RETURNING id, email, status`,
    [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'User not found' });

  await query('DELETE FROM sessions WHERE user_id = $1', [req.params.id]);
  res.json({ message: 'User deactivated and sessions revoked', user: rows[0] });
}
