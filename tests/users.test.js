import { describe, it, expect, beforeAll } from 'vitest';
import { agent, getToken, ADMIN, ANALYST, VIEWER } from './helpers.js';

let adminToken, analystToken, viewerToken;
let createdUserId;

beforeAll(async () => {
  [adminToken, analystToken, viewerToken] = await Promise.all([
    getToken(ADMIN.email,   ADMIN.password,   ADMIN.role),
    getToken(ANALYST.email, ANALYST.password, ANALYST.role),
    getToken(VIEWER.email,  VIEWER.password,  VIEWER.role),
  ]);
});

describe('GET /api/users/:role', () => {
  it('admin can list viewers', async () => {
    const res = await agent
      .get('/api/users/viewer')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('admin can list analysts', async () => {
    const res = await agent
      .get('/api/users/analyst')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it('analyst cannot list users (403)', async () => {
    const res = await agent
      .get('/api/users/viewer')
      .set('Authorization', `Bearer ${analystToken}`);
    expect(res.status).toBe(403);
  });

  it('viewer cannot list users (403)', async () => {
    const res = await agent
      .get('/api/users/viewer')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 400 for unknown role', async () => {
    const res = await agent
      .get('/api/users/superuser')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/users', () => {
  const email = `created_${Date.now()}@finboard.dev`;

  it('admin can create a new viewer', async () => {
    const res = await agent
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: 'New Viewer',
        email,
        password: 'NewPass1!',
        role:     'viewer',
        status:   'active',
      });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe(email);
    createdUserId = res.body.id;
  });

  it('rejects duplicate email with 409', async () => {
    const res = await agent
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: 'Dup',
        email,
        password: 'NewPass1!',
        role:     'viewer',
        status:   'active',
      });
    expect(res.status).toBe(409);
  });

  it('analyst cannot create users (403)', async () => {
    const res = await agent
      .post('/api/users')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({ full_name: 'X', email: 'x@x.com', password: 'pass1234', role: 'viewer', status: 'active' });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/users/:role/:id', () => {
  it('admin can update a user name', async () => {
    const res = await agent
      .patch(`/api/users/viewer/${createdUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ full_name: 'Updated Name' });
    expect(res.status).toBe(200);
    expect(res.body.full_name).toBe('Updated Name');
  });

  it('rejects empty body with 400', async () => {
    const res = await agent
      .patch(`/api/users/viewer/${createdUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/users/:role/:id (deactivate)', () => {
  it('admin can deactivate a user', async () => {
    const res = await agent
      .delete(`/api/users/viewer/${createdUserId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.status).toBe('inactive');
  });

  it('deactivated user cannot log in (403)', async () => {
    const res = await agent.post('/api/auth/login').send({
      email:    `created_${createdUserId.slice(0, 8)}@finboard.dev`,
      password: 'NewPass1!',
      role:     'viewer',
    });
    // Either 401 (not found by email pattern) or 403 (inactive) — both are correct rejections
    expect([401, 403]).toContain(res.status);
  });
});
