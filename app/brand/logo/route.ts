import { readFileSync } from 'node:fs';
import { readSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

// Openbaar: het logo staat ook op het gastscherm, vóór iemand een naam invult.
// Strikte CSP zodat een geüploade SVG nooit script kan uitvoeren.
export async function GET() {
  const row = await readSettings().catch(() => null);
  if (!row?.logo_path) return new Response('not found', { status: 404 });
  try {
    const buf = readFileSync(row.logo_path);
    return new Response(buf, {
      headers: {
        'Content-Type': row.logo_mime ?? 'image/png',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new Response('not found', { status: 404 });
  }
}
