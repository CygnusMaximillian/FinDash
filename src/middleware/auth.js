import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';

/**
 * Verifies JWT, confirms session is alive in DB, refreshes last_seen_at.
 * Attaches { userId, role, sessionId, token } to req.user.
 */
export async function authenticate(req, res, next) {
  const header = req.headers['authorization'];
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = header.slice(7);
  try {
    jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const { rows } = await query(
    `SELECT id, user_id, role FROM sessions WHERE token = $1 AND expires_at > NOW()`,
    [token]
  );
  if (rows.length === 0) {
    return res.status(401).json({ error: 'Session expired or revoked' });
  }

  const session = rows[0];
  // Best-effort refresh — don't block the request
  query('UPDATE sessions SET last_seen_at = NOW() WHERE id = $1', [session.id]).catch(() => {});

  req.user = { userId: session.user_id, role: session.role, sessionId: session.id, token };
  next();
}

/**
 * Role guard factory.
 * Usage: authorize('admin')  or  authorize('admin', 'analyst')
 */
export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden — requires role: ${allowedRoles.join(' or ')}`,
      });
    }
    next();
  };
}
