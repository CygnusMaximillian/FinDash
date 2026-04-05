import { describe, it, expect } from 'vitest';
import { agent, ADMIN, ANALYST, VIEWER } from './helpers.js';

describe('POST /api/auth/login', () => {
  it('returns a token for valid admin credentials', async () => {
    const res = await agent.post('/api/auth/login').send(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.role).toBe('admin');
  });

  it('returns a token for valid analyst credentials', async () => {
    const res = await agent.post('/api/auth/login').send(ANALYST);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('analyst');
  });

  it('returns a token for valid viewer credentials', async () => {
    const res = await agent.post('/api/auth/login').send(VIEWER);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('viewer');
  });

  it('rejects wrong password with 401', async () => {
    const res = await agent.post('/api/auth/login').send({ ...ADMIN, password: 'wrongpass' });
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('rejects missing fields with 400', async () => {
    const res = await agent.post('/api/auth/login').send({ email: ADMIN.email });
    expect(res.status).toBe(400);
  });

  it('rejects invalid role with 400', async () => {
    const res = await agent.post('/api/auth/login').send({ ...ADMIN, role: 'superuser' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/register', () => {
  const unique = `test_${Date.now()}@finboard.dev`;

  it('creates a new viewer account', async () => {
    const res = await agent.post('/api/auth/register').send({
      full_name: 'Test Viewer',
      email:     unique,
      password:  'TestPass1!',
      role:      'viewer',
      status:    'active',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(unique);
  });

  it('rejects duplicate email with 409', async () => {
    const res = await agent.post('/api/auth/register').send({
      full_name: 'Dup',
      email:     unique,
      password:  'TestPass1!',
      role:      'viewer',
      status:    'active',
    });
    expect(res.status).toBe(409);
  });

  it('rejects short password with 400', async () => {
    const res = await agent.post('/api/auth/register').send({
      full_name: 'Short',
      email:     `short_${Date.now()}@test.dev`,
      password:  '123',
      role:      'viewer',
      status:    'active',
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/logout', () => {
  it('logs out successfully with a valid token', async () => {
    const loginRes = await agent.post('/api/auth/login').send(ADMIN);
    const token = loginRes.body.token;

    const res = await agent
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/logged out/i);
  });

  it('rejects logout without token with 401', async () => {
    const res = await agent.post('/api/auth/logout');
    expect(res.status).toBe(401);
  });
});
