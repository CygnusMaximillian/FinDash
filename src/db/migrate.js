import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { pool } from './pool.js';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, '../../schema.sql');

async function migrate() {
  const sql = readFileSync(schemaPath, 'utf8');
  console.log('Running migrations...');
  await pool.query(sql);
  console.log('✅  Migrations complete.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('❌  Migration failed:', err.message);
  process.exit(1);
});
