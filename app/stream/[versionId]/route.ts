import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { canAccessProject, getActor } from '@/lib/server/actor';
import { one } from '@/lib/server/db';

type Ctx = { params: Promise<{ versionId: string }> };

export const dynamic = 'force-dynamic';

// Proxy-mp4 met Range-support (206) — zonder Range werkt scrubben niet in Safari.
// Token/cookie-check + Cache-Control: private; de client ziet nooit een Immich-URL.
export async function GET(req: Request, { params }: Ctx) {
  const actor = await getActor();
  if (!actor) return new Response('unauthorized', { status: 401 });
  const { versionId } = await params;
  const version = await one<any>('select * from version where id = $1', [Number(versionId)]);
  if (!version || !version.proxy_path) return new Response('not found', { status: 404 });
  if (!(await canAccessProject(actor, Number(version.project_id)))) {
    return new Response('forbidden', { status: 403 });
  }

  const url = new URL(req.url);
  const wantsDownload = url.searchParams.has('download') || url.searchParams.has('original');
  if (wantsDownload && actor.kind === 'guest') {
    // Downloads alleen als de share-link het toestaat (besloten regel 4)
    const share = await one<any>(
      `select s.allow_download from guest g join share_link s on s.id = g.share_link_id
        where g.id = $1`,
      [actor.guestId]
    );
    if (!share?.allow_download) return new Response('downloads disabled', { status: 403 });
  }

  if (url.searchParams.has('original')) {
    // Origineel door-streamen uit Immich met de oorspronkelijke bestandsnaam.
    // De Immich-URL en API-key blijven server-side.
    if (!process.env.IMMICH_URL || !process.env.IMMICH_API_KEY) {
      return new Response('immich not configured', { status: 404 });
    }
    const upstream = await fetch(
      `${process.env.IMMICH_URL}/api/assets/${version.immich_asset_id}/original`,
      { headers: { 'x-api-key': process.env.IMMICH_API_KEY } }
    );
    if (!upstream.ok || !upstream.body) {
      return new Response('immich error', { status: 502 });
    }
    return new Response(upstream.body, {
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${version.orig_filename ?? 'original'}"`,
        'Cache-Control': 'private',
      },
    });
  }

  let size: number;
  try {
    size = statSync(version.proxy_path).size;
  } catch {
    return new Response('proxy missing', { status: 404 });
  }

  const range = req.headers.get('range');
  const baseHeaders: Record<string, string> = {
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
  };
  if (url.searchParams.has('download')) {
    const base = (version.orig_filename ?? `versie-${version.number}`).replace(/\.[a-z0-9]+$/i, '');
    baseHeaders['Content-Disposition'] = `attachment; filename="${base}-1080p-proxy.mp4"`;
  }

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m?.[1] ? parseInt(m[1], 10) : 0;
    let end = m?.[2] ? parseInt(m[2], 10) : size - 1;
    if (Number.isNaN(start) || start >= size) start = 0;
    if (Number.isNaN(end) || end >= size) end = size - 1;
    const stream = createReadStream(version.proxy_path, { start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        ...baseHeaders,
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Content-Length': String(end - start + 1),
      },
    });
  }

  const stream = createReadStream(version.proxy_path);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: { ...baseHeaders, 'Content-Length': String(size) },
  });
}
