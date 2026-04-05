/**
 * Shared test helpers — creates a supertest agent bound to the Express app
 * and provides convenience wrappers for auth flows.
 */
import request from 'supertest';
import app from '../src/index.js';

export const agent = request(app);

/**
 * Login and return the bearer token.
 * @param {string} email
 * @param {string} password
 * @param {'admin'|'analyst'|'viewer'} role
 */
export async function getToken(email, password, role) {
  const res = await agent
    .post('/api/auth/login')
    .send({ email, password, role });
  return res.body.token;
}

// Seed credentials (must match src/db/seed.js)
export const ADMIN    = { email: 'admin@finboard.dev',   password: 'Admin1234!',   role: 'admin' };
export const ANALYST  = { email: 'analyst@finboard.dev', password: 'Analyst1234!', role: 'analyst' };
export const VIEWER   = { email: 'viewer@finboard.dev',  password: 'Viewer1234!',  role: 'viewer' };
