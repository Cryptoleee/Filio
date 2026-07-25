// Draait db/schema.sql als de tabellen nog niet bestaan.
import './env.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres@localhost:5432/filio',
});
await client.connect();

const exists = await client.query("select to_regclass('project') as t");
if (exists.rows[0].t) {
  console.log('[migrate] schema bestaat al — niets te doen');
} else {
  const sql = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'schema.sql'),
    'utf8'
  );
  await client.query('begin');
  await client.query(sql);
  await client.query('commit');
  console.log('[migrate] schema aangemaakt');
}
await client.end();
