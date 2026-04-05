# FinBoard — Financial Dashboard API

A production-ready financial dashboard backend built with **Node.js**, **Express**, **PostgreSQL**, and **Zod**. Features role-based access control, optimistic locking for concurrent edits, incremental polling, soft deletes, rate limiting, and a full integration test suite.

---

## Quick Start

```bash
cp .env.example .env        # fill in Postgres + JWT values
npm install
npm run db:migrate          # create all 6 tables
npm run db:seed             # insert 3 demo users + 20 financial records
npm run dev                 # start with nodemon on http://localhost:3000
```

Open `http://localhost:3000` — the frontend is served by Express.

**Demo credentials**

| Email | Password | Role |
|-------|----------|------|
| admin@finboard.dev | Admin1234! | admin |
| analyst@finboard.dev | Analyst1234! | analyst |
| viewer@finboard.dev | Viewer1234! | viewer |

---

## Project Structure

```
├── schema.sql                    ← 6-table PostgreSQL schema
├── public/                       ← Single-page frontend (vanilla JS)
│   ├── index.html
│   ├── style.css
│   └── app.js
├── src/
│   ├── index.js                  ← Express app + rate limiting
│   ├── db/
│   │   ├── pool.js               ← pg Pool, query(), getClient()
│   │   ├── migrate.js            ← runs schema.sql
│   │   └── seed.js               ← synthetic data
│   ├── middleware/
│   │   ├── auth.js               ← JWT verify + authorize()
│   │   └── validate.js           ← Zod body/query validators
│   ├── validators/
│   │   └── schemas.js            ← all Zod schemas
│   ├── controllers/
│   │   ├── authController.js     ← login, logout, register, sessions
│   │   ├── userController.js     ← CRUD users (admin only)
│   │   └── recordsController.js  ← records, dashboard, audit
│   └── routes/
│       ├── auth.js
│       ├── users.js
│       └── records.js
├── tests/
│   ├── helpers.js
│   ├── auth.test.js
│   ├── records.test.js
│   └── users.test.js
└── vitest.config.js
```

---

## API Reference

### Auth

| Method | Path | Body | Auth | Notes |
|--------|------|------|------|-------|
| POST | `/api/auth/login` | `{ email, password, role }` | — | Returns JWT + session |
| POST | `/api/auth/register` | `{ full_name, email, password, role, status }` | — | Public self-registration |
| POST | `/api/auth/logout` | — | Bearer | Deletes session |
| GET | `/api/auth/sessions` | — | admin | All active sessions |
| DELETE | `/api/auth/sessions/:id` | — | admin | Revoke any session |

### Users (admin only)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/users/:role` | List users — `:role` = admin \| analyst \| viewer |
| GET | `/api/users/:role/:id` | Single user |
| POST | `/api/users` | Body includes `role` field |
| PATCH | `/api/users/:role/:id` | Partial update (name, status, password) |
| DELETE | `/api/users/:role/:id` | Soft-deactivate + revoke all sessions |

### Records

| Method | Path | Roles | Notes |
|--------|------|-------|-------|
| GET | `/api/records/dashboard` | all | Role-scoped summary + recent activity |
| GET | `/api/records` | all | Paginated, role-scoped fields, polling via `since` |
| GET | `/api/records/:id` | all | Viewer gets limited fields |
| GET | `/api/records/:id/audit` | analyst, admin | Full version history |
| POST | `/api/records` | admin | Creates + seeds audit log |
| PATCH | `/api/records/:id` | admin | Requires `client_version` for optimistic lock |
| DELETE | `/api/records/:id` | admin | Soft delete (`is_deleted = TRUE`) |

#### Query params for `GET /api/records`

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | int | 1 | Page number |
| `page_size` | int (1–100) | 20 | Rows per page |
| `since` | ISO datetime | — | Return only rows updated after this timestamp |

---

## Role Permissions

| Action | Viewer | Analyst | Admin |
|--------|:------:|:-------:|:-----:|
| View dashboard summary | ✅ | ✅ | ✅ |
| List records (limited fields) | ✅ | ✅ | ✅ |
| View full record details | ❌ | ✅ | ✅ |
| View audit history | ❌ | ✅ | ✅ |
| Create / update / delete records | ❌ | ❌ | ✅ |
| Manage users | ❌ | ❌ | ✅ |
| View / revoke sessions | ❌ | ❌ | ✅ |

---

## Version Control (Optimistic Locking)

Concurrent admin edits are handled without pessimistic locks:

1. Admin A and Admin B both fetch a record — both receive `version: 5`
2. Admin A saves first → DB version becomes `6`
3. Admin B sends `PATCH` with `client_version: 5`
4. Server sees `db.version (6) > client_version (5)` → **409 Conflict**
5. Admin B re-fetches (`version: 6`), merges their changes, retries

Every successful write appends an immutable snapshot to `financial_record_audit`.

---

## Polling Strategy

Clients store the `timestamp` from each response and pass it as `since` on the next poll. Only rows changed after that point are returned — an efficient incremental diff.

```js
let since = null;

async function poll() {
  const url = since
    ? `/api/records?since=${encodeURIComponent(since)}&page_size=50`
    : `/api/records?page_size=50`;

  const { data, timestamp } = await fetch(url, { headers: authHeader }).then(r => r.json());
  since = timestamp;
  applyDelta(data);
}

// Recommended intervals by role
const interval = role === 'admin' ? 10_000 : role === 'analyst' ? 20_000 : 30_000;
setInterval(poll, interval);
```

---

## Rate Limiting

| Scope | Window | Limit |
|-------|--------|-------|
| `/api/auth/*` | 15 min | 20 requests (brute-force protection) |
| `/api/*` | 1 min | 300 requests (generous for polling clients) |

Headers `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` are included in every response.

---

## Soft Deletes

Records are never physically removed. `DELETE /api/records/:id` sets `is_deleted = TRUE` and increments the version. All list/get queries filter on `is_deleted = FALSE`. The full history remains in `financial_record_audit`.

---

## Running Tests

Tests require a live PostgreSQL database with seeded data.

```bash
npm run db:migrate   # ensure schema exists
npm run db:seed      # ensure seed users exist
npm test             # vitest run (single pass)
npm run test:watch   # vitest watch mode
```

Test coverage:
- `tests/auth.test.js` — login, register, logout, validation edge cases
- `tests/records.test.js` — CRUD, role restrictions, optimistic lock conflict, soft delete, audit
- `tests/users.test.js` — list, create, update, deactivate, role guards

---

## Scaling Roadmap

The current single-node deployment is intentionally simple. As user load grows, the following architecture upgrades are planned in order of priority:

### 1. Horizontal Scaling with Nginx

Multiple Node.js instances will run behind an **Nginx** reverse proxy using upstream load balancing. Nginx handles:
- Round-robin or least-connections routing across app instances
- SSL termination
- Static file serving (offloading Express)
- Connection keep-alive and request buffering

```
Client → Nginx (SSL, static) → [Node :3001, Node :3002, Node :3003]
                                         ↓
                                    PostgreSQL
```

### 2. Redis for Session Storage and Caching

Currently sessions live in PostgreSQL. Under high concurrency this becomes a bottleneck. **Redis** will be introduced for:
- **Session store** — JWT session lookup moves from a DB query to an in-memory O(1) read
- **Dashboard cache** — aggregate summary queries (expensive GROUP BY) cached with a short TTL (10–30 s), invalidated on any record write
- **Rate limit counters** — `express-rate-limit` with a Redis store so limits are shared across all Node instances (not per-process)

```
Auth middleware → Redis session lookup (< 1ms)
Dashboard GET  → Redis cache hit → skip DB query
Record PATCH   → DB write → Redis cache invalidate
```

### 3. PostgreSQL Master–Slave Replication

To make the database layer resilient and scalable:
- **Primary (master)** handles all writes (`INSERT`, `UPDATE`, `DELETE`)
- **Read replicas (slaves)** handle all read queries (`SELECT`) — dashboard, list, audit
- Streaming replication keeps replicas in near-real-time sync
- If the primary fails, a replica is promoted automatically (using Patroni or pg_auto_failover)

```
Writes → Primary Postgres
Reads  → Replica 1 / Replica 2 (load balanced)
```

The pool configuration will route queries by type:

```js
// write pool → primary
export const writePool = new Pool({ host: process.env.DB_PRIMARY_HOST });

// read pool → replica (round-robin via PgBouncer or HAProxy)
export const readPool  = new Pool({ host: process.env.DB_REPLICA_HOST });
```

### 4. Apache Kafka for Event Streaming (high-scale)

Once the user base grows significantly and real-time requirements increase, **Apache Kafka** will be introduced as an event bus:

- Every financial record mutation publishes an event to a Kafka topic (`financial.records.changes`)
- Dashboard consumers subscribe and maintain materialised views in Redis — eliminating polling entirely
- Audit log writes become async (Kafka consumer writes to `financial_record_audit`)
- Enables future integrations: notifications, analytics pipelines, data warehouse exports

```
Record PATCH → Kafka topic: financial.records.changes
                    ↓
         ┌──────────┴──────────┐
   Dashboard consumer    Audit consumer
   (updates Redis cache)  (writes audit log)
```

This moves the architecture from request/response polling to a fully event-driven model, supporting hundreds of thousands of concurrent users with sub-second dashboard updates.

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP port | `3000` |
| `DB_HOST` | Postgres host | `localhost` |
| `DB_PORT` | Postgres port | `5432` |
| `DB_NAME` | Database name | — |
| `DB_USER` | Postgres user | — |
| `DB_PASSWORD` | Postgres password | — |
| `JWT_SECRET` | JWT signing secret | — |
| `JWT_EXPIRES_IN` | Token lifetime | `8h` |
| `BCRYPT_ROUNDS` | bcrypt cost factor | `12` |
| `POLL_MIN_MS` | Min poll interval (docs) | `10000` |
| `POLL_MAX_MS` | Max poll interval (docs) | `30000` |
