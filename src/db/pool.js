import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  host:                    process.env.DB_HOST,
  port:                    Number(process.env.DB_PORT),
  database:                process.env.DB_NAME,
  user:                    process.env.DB_USER,
  password:                process.env.DB_PASSWORD,
  max:                     20,
  idleTimeoutMillis:       30_000,
  connectionTimeoutMillis: 2_000,
});

pool.on('error', (err) => console.error('Unexpected pg pool error:', err));

export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  console.debug(`[DB] ${Date.now() - start}ms | rows: ${res.rowCount}`);
  return res;
}

export async function getClient() {
  const client      = await pool.connect();
  const origQuery   = client.query.bind(client);
  const origRelease = client.release.bind(client);

  const timeout = setTimeout(() => {
    console.error('[DB] Client checkout exceeded 5s — potential leak');
    origRelease();
  }, 5_000);

  client.query = (...args) => { clearTimeout(timeout); return origQuery(...args); };
  client.release = () => {
    clearTimeout(timeout);
    client.query   = origQuery;
    client.release = origRelease;
    origRelease();
  };

  return client;
}
