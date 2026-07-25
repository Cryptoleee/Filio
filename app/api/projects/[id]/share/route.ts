import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getEditor, hashPassword } from '@/lib/server/auth';
import { one } from '@/lib/server/db';
import type { SharePayload } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function newToken(): string {
  // 32 bytes random, base58 — geen enumeratie mogelijk (Tech Notitie §7)
  const bytes = randomBytes(32);
  let out = '';
  for (const b of bytes) out += BASE58[b % 58];
  return out;
}

async function payload(projectId: number): Promise<SharePayload> {
  let share = await one<any>(
    `select * from share_link where project_id = $1 and revoked_at is null
      order by created_at desc limit 1`,
    [projectId]
  );
  if (!share) {
    share = await one<any>(
      `insert into share_link (project_id, token, expires_at)
       values ($1, $2, now() + interval '30 days') returning *`,
      [projectId, newToken()]
    );
  }
  const latest = await one<any>(
    'select * from version where project_id = $1 order by number desc limit 1',
    [projectId]
  );
  const fmt = (b: number | null) =>
    !b ? null : b >= 1e9 ? `${(b / 1e9).toFixed(b >= 10e9 ? 0 : 1)} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`;
  return {
    url: `${process.env.APP_URL ?? ''}/r/${share.token}`,
    askName: share.ask_name,
    hasPassword: Boolean(share.password_hash),
    allowDownload: share.allow_download,
    expiresDays: share.expires_at
      ? Math.max(1, Math.round((new Date(share.expires_at).getTime() - Date.now()) / 86400000))
      : null,
    proxyLabel: latest ? fmt(Number(latest.proxy_bytes) || null) : null,
    originalLabel: latest
      ? [latest.orig_filename, fmt(Number(latest.orig_bytes) || null)].filter(Boolean).join(' · ') || null
      : null,
  };
}

export async function GET(_req: Request, { params }: Ctx) {
  const editor = await getEditor();
  if (!editor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  return NextResponse.json(await payload(Number(id)));
}

export async function POST(req: Request, { params }: Ctx) {
  const editor = await getEditor();
  if (!editor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const projectId = Number(id);
  await payload(projectId); // garandeert dat er een link bestaat
  const body = await req.json().catch(() => ({}));

  if (typeof body.askName === 'boolean') {
    await one(
      `update share_link set ask_name = $2 where project_id = $1 and revoked_at is null returning id`,
      [projectId, body.askName]
    );
  }
  if (typeof body.allowDownload === 'boolean') {
    await one(
      `update share_link set allow_download = $2 where project_id = $1 and revoked_at is null returning id`,
      [projectId, body.allowDownload]
    );
  }
  if ('password' in body) {
    await one(
      `update share_link set password_hash = $2 where project_id = $1 and revoked_at is null returning id`,
      [projectId, body.password ? hashPassword(String(body.password)) : null]
    );
  }
  if ('expiresDays' in body) {
    await one(
      `update share_link
          set expires_at = case when $2::int is null then null
                                else now() + ($2::int || ' days')::interval end
        where project_id = $1 and revoked_at is null returning id`,
      [projectId, body.expiresDays]
    );
  }
  return NextResponse.json(await payload(projectId));
}
