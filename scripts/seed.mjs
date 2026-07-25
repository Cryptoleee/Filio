// Maakt het (enige) editor-account aan als het nog niet bestaat.
// Env: EDITOR_EMAIL, EDITOR_PASSWORD, EDITOR_NAME.
import './env.mjs';
import { randomBytes, scryptSync } from 'node:crypto';
import pg from 'pg';

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres@localhost:5432/filio',
});
await client.connect();

const email = process.env.EDITOR_EMAIL ?? 'editor@example.com';
const password = process.env.EDITOR_PASSWORD ?? 'filio-dev';
const name = process.env.EDITOR_NAME ?? 'Editor';

const existing = await client.query('select id from "user" where email = $1', [email]);
if (existing.rows.length) {
  console.log(`[seed] editor ${email} bestaat al`);
} else {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 32).toString('hex');
  await client.query(
    'insert into "user" (email, password_hash, display_name) values ($1, $2, $3)',
    [email, `${salt}:${hash}`, name]
  );
  console.log(`[seed] editor ${email} aangemaakt`);
}
await client.end();
