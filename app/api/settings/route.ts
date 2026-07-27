import { NextResponse } from 'next/server';
import { getEditor } from '@/lib/server/auth';
import { one } from '@/lib/server/db';
import { getBranding } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

// Openbaar: gasten hebben de huisstijl nodig vóór ze een naam invullen.
export async function GET() {
  return NextResponse.json(await getBranding());
}

export async function PATCH(req: Request) {
  const editor = await getEditor();
  if (!editor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  if (typeof body.studioName === 'string') {
    const name = body.studioName.trim().slice(0, 60);
    if (!name) return NextResponse.json({ error: 'Naam mag niet leeg zijn' }, { status: 400 });
    await one('update settings set studio_name = $1, updated_at = now() where id = true returning id', [name]);
  }
  if (body.accentHue != null) {
    const hue = Math.round(Number(body.accentHue));
    if (!Number.isFinite(hue) || hue < 0 || hue > 360) {
      return NextResponse.json({ error: 'Ongeldige kleur' }, { status: 400 });
    }
    await one('update settings set accent_hue = $1, updated_at = now() where id = true returning id', [hue]);
  }
  return NextResponse.json(await getBranding());
}
