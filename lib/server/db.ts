import { Pool } from 'pg';

const globalForDb = globalThis as unknown as { __filioPool?: Pool };

export const db =
  globalForDb.__filioPool ??
  new Pool({
    connectionString:
      process.env.DATABASE_URL ?? 'postgresql://postgres@localhost:5432/filio',
    max: 10,
  });

if (!globalForDb.__filioPool) globalForDb.__filioPool = db;

export async function query<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const res = await db.query(text, params);
  return res.rows as T[];
}

export async function one<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
