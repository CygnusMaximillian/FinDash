import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';
import { loginSchema, createUserSchema } from '../validators/schemas.js';

const TABLE = { admin: 'admins', analyst: 'analysts', viewer: 'viewers' };

function durationMs(str) {
  const map   = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  const match = str.match(/^(\d+)([smhd])$/);
  return match ? Number(match[1]) * map[match[2]] : 8 * 3_600_000;
}

export async function login(req, res) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
  }

  const { email, password, role } = parsed.data;
  const table = TABLE[role];

  const { rows } = await query(
    `SELECT id, password_hash, status FROM ${table} WHERE email = $1`,
    [email]
  );
  if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

  const user = rows[0];
  if (user.status === 'inactive') return res.status(403).json({ error: 'Account is inactive' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const expiresIn = process.env.JWT_EXPIRES_IN ?? '8h';
  const token     = jwt.sign({ sub: user.id, role }, process.env.JWT_SECRET, { expiresIn });
  const expiresAt = new Date(Date.now() + durationMs(expiresIn));

  await query(
    `INSERT INTO sessions (user_id, role, token, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [user.id, role, token, req.ip, req.headers['user-agent'] ?? null, expiresAt]
  );

  res.json({ token, expires_at: expiresAt, role });
}

export async function logout(req, res) {
  await query('DELETE FROM sessions WHERE token = $1', [req.user.token]);
  res.json({ message: 'Logged out successfully' });
}

export async function register(req, res) {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
  }

  const { email, password, full_name, role, status } = parsed.data;
  const table = TABLE[role];
  const ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);
  const password_hash = await bcrypt.hash(password, ROUNDS);

  try {
    const { rows } = await query(
      `INSERT INTO ${table} (email, password_hash, full_name, status)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, full_name, status, created_at`,
      [email, password_hash, full_name, status]
    );
    res.status(201).json({ message: 'Account created successfully', user: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    throw err;
  }
}

// Admin: view all active sessions (useful for monitoring concurrent admins)
export async function listSessions(req, res) {
  const { rows } = await query(
    `SELECT id, user_id, role, ip_address, user_agent, last_seen_at, expires_at, created_at
     FROM sessions WHERE expires_at > NOW() ORDER BY created_at DESC`
  );
  res.json(rows);
}

// Admin: forcibly revoke any session
export async function revokeSession(req, res) {
  const { rows } = await query(
    `DELETE FROM sessions WHERE id = $1 RETURNING id`,
    [req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Session not found' });
  res.json({ message: 'Session revoked', id: rows[0].id });
}
