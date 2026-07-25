import { NextResponse } from 'next/server';
import { getEditor } from '@/lib/server/auth';
import { one } from '@/lib/server/db';

type Ctx = { params: Promise<{ id: string }> };

// Koppelt een Immich-asset als nieuwe versie en zet de transcode-job in de rij.
// De worker (scripts/worker.mjs) pakt status 'queued' op.
export async function POST(req: Request, { params }: Ctx) {
  const editor = await getEditor();
  if (!editor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const { assetId, filename, sizeBytes } = await req.json().catch(() => ({}));
  if (!assetId) return NextResponse.json({ error: 'assetId verplicht' }, { status: 400 });

  const next = await one<{ n: number }>(
    'select coalesce(max(number), 0) + 1 as n from version where project_id = $1',
    [Number(id)]
  );
  const row = await one<{ id: string }>(
    `insert into version (project_id, number, immich_asset_id, orig_filename, orig_bytes, status)
     values ($1, $2, $3, $4, $5, 'queued') returning id`,
    [Number(id), next!.n, assetId, filename ?? null, sizeBytes ? Math.round(sizeBytes) : null]
  );
  return NextResponse.json({ id: Number(row!.id), number: next!.n }, { status: 201 });
}
