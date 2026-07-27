import { NextResponse } from 'next/server';
import { getEditor } from '@/lib/server/auth';
import { query } from '@/lib/server/db';
import { reviewPayload } from '@/lib/server/payload';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const editor = await getEditor();
  if (!editor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const payload = await reviewPayload(Number(id), {
    kind: 'editor',
    userId: editor.userId,
    name: editor.name,
  });
  if (!payload) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(payload);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const editor = await getEditor();
  if (!editor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (typeof body.title === 'string' && body.title.trim()) {
    await query('update project set title = $2 where id = $1', [Number(id), body.title.trim()]);
  }
  if (body.accentHue !== undefined) {
    const hue = body.accentHue === null ? null : Math.round(Number(body.accentHue));
    if (hue !== null && (!Number.isFinite(hue) || hue < 0 || hue > 360)) {
      return NextResponse.json({ error: 'Ongeldige kleur' }, { status: 400 });
    }
    await query('update project set accent_hue = $2 where id = $1', [Number(id), hue]);
  }
  if (body.archived === true) {
    // Archiveren, niet verwijderen: klantfeedback is de enige onvervangbare data.
    await query('update project set archived_at = now() where id = $1', [Number(id)]);
  }
  return NextResponse.json({ ok: true });
}
