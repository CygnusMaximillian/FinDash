import { describe, it, expect, beforeAll } from 'vitest';
import { agent, getToken, ADMIN, ANALYST, VIEWER } from './helpers.js';

let adminToken, analystToken, viewerToken;
let createdRecordId, createdVersion;

beforeAll(async () => {
  [adminToken, analystToken, viewerToken] = await Promise.all([
    getToken(ADMIN.email,   ADMIN.password,   ADMIN.role),
    getToken(ANALYST.email, ANALYST.password, ANALYST.role),
    getToken(VIEWER.email,  VIEWER.password,  VIEWER.role),
  ]);
});

// ── Dashboard ─────────────────────────────────────────────────
describe('GET /api/records/dashboard', () => {
  it('returns summary for all roles', async () => {
    for (const token of [adminToken, analystToken, viewerToken]) {
      const res = await agent
        .get('/api/records/dashboard')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('summary');
      expect(res.body).toHaveProperty('timestamp');
    }
  });

  it('includes recent activity for analyst and admin', async () => {
    for (const token of [adminToken, analystToken]) {
      const res = await agent
        .get('/api/records/dashboard')
        .set('Authorization', `Bearer ${token}`);
      expect(Array.isArray(res.body.recent)).toBe(true);
    }
  });

  it('omits recent activity for viewer', async () => {
    const res = await agent
      .get('/api/records/dashboard')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.body.recent).toHaveLength(0);
  });

  it('rejects unauthenticated request with 401', async () => {
    const res = await agent.get('/api/records/dashboard');
    expect(res.status).toBe(401);
  });
});

// ── List records ──────────────────────────────────────────────
describe('GET /api/records', () => {
  it('returns paginated records', async () => {
    const res = await agent
      .get('/api/records?page=1&page_size=5')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body.data.length).toBeLessThanOrEqual(5);
  });

  it('viewer receives limited fields only', async () => {
    const res = await agent
      .get('/api/records?page=1&page_size=1')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    const row = res.body.data[0];
    // viewer should NOT see description or version
    expect(row).not.toHaveProperty('description');
    expect(row).not.toHaveProperty('version');
  });

  it('admin receives full rows', async () => {
    const res = await agent
      .get('/api/records?page=1&page_size=1')
      .set('Authorization', `Bearer ${adminToken}`);
    const row = res.body.data[0];
    expect(row).toHaveProperty('version');
    expect(row).toHaveProperty('created_by');
  });

  it('rejects invalid page_size with 400', async () => {
    const res = await agent
      .get('/api/records?page_size=999')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });
});

// ── Create record ─────────────────────────────────────────────
describe('POST /api/records', () => {
  it('admin can create a record', async () => {
    const res = await agent
      .post('/api/records')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title:       'Integration Test Revenue',
        record_type: 'revenue',
        amount:      9999.99,
        currency:    'USD',
        recorded_at: '2025-06-01',
      });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Integration Test Revenue');
    expect(res.body.version).toBe(1);
    createdRecordId = res.body.id;
    createdVersion  = res.body.version;
  });

  it('analyst cannot create a record (403)', async () => {
    const res = await agent
      .post('/api/records')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({ title: 'X', record_type: 'revenue', amount: 1 });
    expect(res.status).toBe(403);
  });

  it('viewer cannot create a record (403)', async () => {
    const res = await agent
      .post('/api/records')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ title: 'X', record_type: 'revenue', amount: 1 });
    expect(res.status).toBe(403);
  });

  it('rejects missing required fields with 400', async () => {
    const res = await agent
      .post('/api/records')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'No type or amount' });
    expect(res.status).toBe(400);
  });
});

// ── Get single record ─────────────────────────────────────────
describe('GET /api/records/:id', () => {
  it('returns the record for admin', async () => {
    const res = await agent
      .get(`/api/records/${createdRecordId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(createdRecordId);
  });

  it('viewer gets limited fields', async () => {
    const res = await agent
      .get(`/api/records/${createdRecordId}`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('version');
  });

  it('returns 404 for unknown id', async () => {
    const res = await agent
      .get('/api/records/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

// ── Update record (optimistic lock) ──────────────────────────
describe('PATCH /api/records/:id', () => {
  it('admin can update with correct client_version', async () => {
    const res = await agent
      .patch(`/api/records/${createdRecordId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Updated Title', client_version: createdVersion });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Title');
    expect(res.body.version).toBe(createdVersion + 1);
    createdVersion = res.body.version;
  });

  it('returns 409 on stale client_version', async () => {
    const res = await agent
      .patch(`/api/records/${createdRecordId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Stale', client_version: 1 }); // version 1 is stale
    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('server_version');
  });

  it('analyst cannot update (403)', async () => {
    const res = await agent
      .patch(`/api/records/${createdRecordId}`)
      .set('Authorization', `Bearer ${analystToken}`)
      .send({ title: 'X', client_version: createdVersion });
    expect(res.status).toBe(403);
  });
});

// ── Audit history ─────────────────────────────────────────────
describe('GET /api/records/:id/audit', () => {
  it('admin can view audit trail', async () => {
    const res = await agent
      .get(`/api/records/${createdRecordId}/audit`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('analyst can view audit trail', async () => {
    const res = await agent
      .get(`/api/records/${createdRecordId}/audit`)
      .set('Authorization', `Bearer ${analystToken}`);
    expect(res.status).toBe(200);
  });

  it('viewer cannot view audit trail (403)', async () => {
    const res = await agent
      .get(`/api/records/${createdRecordId}/audit`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(403);
  });
});

// ── Soft delete ───────────────────────────────────────────────
describe('DELETE /api/records/:id', () => {
  it('admin can soft-delete a record', async () => {
    const res = await agent
      .delete(`/api/records/${createdRecordId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
  });

  it('deleted record is no longer visible', async () => {
    const res = await agent
      .get(`/api/records/${createdRecordId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('viewer cannot delete (403)', async () => {
    // Create a fresh record first
    const create = await agent
      .post('/api/records')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'To Delete', record_type: 'expense', amount: 1 });
    const id = create.body.id;

    const res = await agent
      .delete(`/api/records/${id}`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(403);

    // Cleanup
    await agent
      .delete(`/api/records/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);
  });
});
