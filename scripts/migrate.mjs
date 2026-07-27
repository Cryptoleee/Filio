// Past de SQL-migraties uit db/migrations toe die nog niet gedraaid hebben.
// Bestaande database zonder migratietabel? Dan wordt 001_init als baseline
// gemarkeerd, zodat een draaiende installatie zonder dataverlies bijwerkt.
import './env.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres@localhost:5432/filio',
});
await client.connect();

await client.query(`
  create table if not exists schema_migrations (
    version    text primary key,
    applied_at timestamptz not null default now()
  )`);

const applied = new Set(
  (await client.query('select version from schema_migrations')).rows.map((r) => r.version)
);

// Bestaande installatie van vóór het migratiesysteem: baseline markeren.
if (applied.size === 0) {
  const { rows } = await client.query("select to_regclass('project') as t");
  if (rows[0].t) {
    await client.query('insert into schema_migrations (version) values ($1)', [files[0]]);
    applied.add(files[0]);
    console.log(`[migrate] bestaande database gevonden — ${files[0]} als baseline gemarkeerd`);
  }
}

let ran = 0;
for (const file of files) {
  if (applied.has(file)) continue;
  const sql = readFileSync(join(dir, file), 'utf8');
  await client.query('begin');
  try {
    await client.query(sql);
    await client.query('insert into schema_migrations (version) values ($1)', [file]);
    await client.query('commit');
    console.log(`[migrate] toegepast: ${file}`);
    ran++;
  } catch (err) {
    await client.query('rollback');
    console.error(`[migrate] MISLUKT bij ${file}:`, err.message);
    process.exit(1);
  }
}

console.log(ran === 0 ? '[migrate] database is bij' : `[migrate] ${ran} migratie(s) toegepast`);
await client.end();
