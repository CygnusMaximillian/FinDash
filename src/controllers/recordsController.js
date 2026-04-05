import { query, getClient } from '../db/pool.js';

// ── Dashboard summary (role-scoped) ──────────────────────────
export async function getDashboard(req, res) {
  const { role } = req.user;

  const { rows: summary } = await query(`
    SELECT record_type,
           COUNT(*)        AS count,
           SUM(amount)     AS total_amount,
           MAX(updated_at) AS last_updated
    FROM financial_records
    WHERE is_deleted = FALSE
    GROUP BY record_type
    ORDER BY record_type
  `);

  let recent = [];
  if (role !== 'viewer') {
    const { rows } = await query(`
      SELECT id, title, record_type, amount, currency, last_updated_role, updated_at
      FROM financial_records
      WHERE is_deleted = FALSE
      ORDER BY updated_at DESC
      LIMIT 10
    `);
    recent = rows;
  }

  res.json({ summary, recent, timestamp: new Date().toISOString() });
}

// ── List / poll records ───────────────────────────────────────
export async function listRecords(req, res) {
  const { role }                   = req.user;
  const { since, page, page_size } = req.query;

  const params     = [];
  const conditions = ['r.is_deleted = FALSE'];

  if (since) {
    params.push(since);
    conditions.push(`r.updated_at > $${params.length}`);   // ← fixed: was missing $
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const columns =
    role === 'viewer'
      ? 'r.id, r.title, r.record_type, r.amount, r.currency, r.recorded_at, r.updated_at'
      : role === 'analyst'
      ? 'r.id, r.title, r.record_type, r.amount, r.currency, r.description, r.recorded_at, r.version, r.updated_at'
      : 'r.*';

  const countParams = [...params];

  params.push(page_size);
  params.push((page - 1) * page_size);

  const [dataRes, countRes] = await Promise.all([
    query(
      `SELECT ${columns} FROM financial_records r ${where}
       ORDER BY r.updated_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    ),
    query(`SELECT COUNT(*) AS total FROM financial_records r ${where}`, countParams),
  ]);

  res.json({
    data:      dataRes.rows,
    total:     Number(countRes.rows[0].total),
    page,
    page_size,
    timestamp: new Date().toISOString(),
  });
}

// ── Get single record ─────────────────────────────────────────
export async function getRecord(req, res) {
  const { id }   = req.params;
  const { role } = req.user;

  const { rows } = await query(
    'SELECT * FROM financial_records WHERE id = $1 AND is_deleted = FALSE',
    [id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Record not found' });

  const record = rows[0];
  if (role === 'viewer') {
    const { id, title, record_type, amount, currency, recorded_at, updated_at } = record;
    return res.json({ id, title, record_type, amount, currency, recorded_at, updated_at });
  }
  res.json(record);
}

// ── Create record (admin only) ────────────────────────────────
export async function createRecord(req, res) {
  const { title, record_type, amount, currency, description, recorded_at } = req.body;
  const { userId, role } = req.user;

  const { rows } = await query(
    `INSERT INTO financial_records
       (title, record_type, amount, currency, description, recorded_at,
        last_updated_by, last_updated_role, created_by, created_role)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      title, record_type, amount, currency,
      description ?? null,
      recorded_at ?? new Date().toISOString().slice(0, 10),
      userId, role, userId, role,
    ]
  );

  const record = rows[0];

  await query(
    `INSERT INTO financial_record_audit (record_id, version, snapshot, changed_by, changed_role)
     VALUES ($1, $2, $3, $4, $5)`,
    [record.id, 1, JSON.stringify(record), userId, role]
  );

  res.status(201).json(record);
}

// ── Update with optimistic locking (admin only) ───────────────
/**
 * VERSION CONTROL FLOW:
 *  1. Client reads record  →  receives { ...data, version: N }
 *  2. Client sends PATCH   →  { ...changes, client_version: N }
 *  3. Server locks the row (FOR UPDATE) inside a transaction
 *  4. db.version > client_version  →  409 Conflict
 *  5. Otherwise: apply changes, increment version, append audit snapshot
 */
export async function updateRecord(req, res) {
  const { id }                        = req.params;
  const { userId, role }              = req.user;
  const { client_version, ...fields } = req.body;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT * FROM financial_records WHERE id = $1 AND is_deleted = FALSE FOR UPDATE`,
      [id]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Record not found' });
    }

    const current = rows[0];

    if (current.version > client_version) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error:          'Version conflict — record was updated by another user',
        server_version: current.version,
        client_version,
        hint:           'Re-fetch the record, apply your changes, and retry',
      });
    }

    const allowed    = ['title', 'record_type', 'amount', 'currency', 'description', 'recorded_at'];
    const setClauses = [];
    const values     = [];
    let idx = 1;

    for (const key of allowed) {
      if (fields[key] !== undefined) {
        setClauses.push(`${key} = $${idx++}`);   // ← fixed: was missing $
        values.push(fields[key]);
      }
    }

    setClauses.push(
      `version = $${idx++}`,
      `last_updated_by = $${idx++}`,
      `last_updated_role = $${idx++}`
    );
    values.push(current.version + 1, userId, role, id);

    const { rows: updated } = await client.query(
      `UPDATE financial_records SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    const newRecord = updated[0];

    await client.query(
      `INSERT INTO financial_record_audit (record_id, version, snapshot, changed_by, changed_role)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, newRecord.version, JSON.stringify(newRecord), userId, role]
    );

    await client.query('COMMIT');
    res.json(newRecord);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Soft-delete (admin only) ──────────────────────────────────
export async function deleteRecord(req, res) {
  const { id }           = req.params;
  const { userId, role } = req.user;

  const { rows } = await query(
    `UPDATE financial_records
     SET is_deleted = TRUE, last_updated_by = $2, last_updated_role = $3, version = version + 1
     WHERE id = $1 AND is_deleted = FALSE
     RETURNING id, version`,
    [id, userId, role]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Record not found' });
  res.json({ message: 'Record deleted', id: rows[0].id });
}

// ── Audit history (analyst + admin) ──────────────────────────
export async function getRecordAudit(req, res) {
  const { rows } = await query(
    `SELECT version, snapshot, changed_by, changed_role, changed_at
     FROM financial_record_audit
     WHERE record_id = $1
     ORDER BY version DESC`,
    [req.params.id]
  );
  res.json(rows);
}
