import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { getEditor } from '@/lib/server/auth';
import { one } from '@/lib/server/db';
import { getBranding, readSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

function brandingDir(): string {
  const dir = join(process.env.PROXY_DIR ?? join(process.cwd(), 'data', 'proxies'), 'branding');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export async function POST(req: Request) {
  const editor = await getEditor();
  if (!editor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('logo');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Geen bestand ontvangen' }, { status: 400 });
  }
  const ext = TYPES[file.type];
  if (!ext) {
    return NextResponse.json({ error: 'Gebruik een PNG, JPG, WEBP of SVG' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Bestand is groter dan 2 MB' }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const path = join(brandingDir(), `logo.${ext}`);
  writeFileSync(path, buf);

  // Oude logo in een ander formaat opruimen
  const previous = await readSettings();
  if (previous?.logo_path && previous.logo_path !== path) {
    try {
      unlinkSync(previous.logo_path);
    } catch {
      /* al weg */
    }
  }

  await one(
    'update settings set logo_path = $1, logo_mime = $2, updated_at = now() where id = true returning id',
    [path, file.type]
  );
  return NextResponse.json(await getBranding());
}

export async function DELETE() {
  const editor = await getEditor();
  if (!editor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const current = await readSettings();
  if (current?.logo_path) {
    try {
      unlinkSync(current.logo_path);
    } catch {
      /* al weg */
    }
  }
  await one(
    'update settings set logo_path = null, logo_mime = null, updated_at = now() where id = true returning id'
  );
  return NextResponse.json(await getBranding());
}
