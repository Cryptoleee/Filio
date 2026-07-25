import { NextResponse } from 'next/server';
import { getEditor } from '@/lib/server/auth';
import { immichConfigured, searchVideos } from '@/lib/server/immich';
import type { ImmichVideoRow } from '@/lib/types';

export async function GET(req: Request) {
  const editor = await getEditor();
  if (!editor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const q = new URL(req.url).searchParams.get('q') ?? '';
  try {
    const videos = await searchVideos(q);
    const rows: ImmichVideoRow[] = videos.map((v) => ({
      id: v.id,
      filename: v.filename,
      sizeBytes: v.sizeBytes,
      meta: [
        v.codec,
        v.durationLabel,
        v.sizeBytes >= 1e9
          ? `${(v.sizeBytes / 1e9).toFixed(1)} GB`
          : `${Math.round(v.sizeBytes / 1e6)} MB`,
        v.takenLabel,
      ].join(' · '),
    }));
    return NextResponse.json({ videos: rows, mock: !immichConfigured() });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
