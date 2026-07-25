// Server-to-server Immich-client. De API-key blijft op de server (env),
// komt nooit in de browser. Zonder IMMICH_URL draait alles in mock-modus:
// de picker toont demobestanden en de worker genereert een testclip met ffmpeg.

export interface ImmichVideo {
  id: string;
  filename: string;
  durationLabel: string;
  sizeBytes: number;
  codec: string;
  takenLabel: string;
}

const MOCK_VIDEOS: ImmichVideo[] = [
  {
    id: 'mock-zeeuwse-v4',
    filename: 'zeeuwse-kust_v4_prores.mov',
    durationLabel: '01:18',
    sizeBytes: 11.8 * 1e9,
    codec: 'PRORES 422',
    takenLabel: 'VANDAAG',
  },
  {
    id: 'mock-rabo-v2',
    filename: 'rabo_aftermovie_v2_master.mov',
    durationLabel: '02:04',
    sizeBytes: 18.2 * 1e9,
    codec: 'PRORES 422',
    takenLabel: 'GISTEREN',
  },
  {
    id: 'mock-interview',
    filename: 'interview_ruwe-selectie.mp4',
    durationLabel: '12:40',
    sizeBytes: 3.1 * 1e9,
    codec: 'H.264',
    takenLabel: '3 DAGEN GELEDEN',
  },
];

export function immichConfigured(): boolean {
  return Boolean(process.env.IMMICH_URL && process.env.IMMICH_API_KEY);
}

export async function searchVideos(q: string): Promise<ImmichVideo[]> {
  if (!immichConfigured()) {
    const needle = q.toLowerCase();
    return MOCK_VIDEOS.filter((v) => v.filename.toLowerCase().includes(needle));
  }
  // Endpointnamen verschillen per Immich-versie — check /api/api-docs van je
  // eigen installatie (Tech Notitie §5). Dit volgt de huidige search-metadata API.
  const res = await fetch(`${process.env.IMMICH_URL}/api/search/metadata`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.IMMICH_API_KEY!,
    },
    body: JSON.stringify({ type: 'VIDEO', originalFileName: q || undefined, size: 50 }),
  });
  if (!res.ok) throw new Error(`Immich search failed: ${res.status}`);
  const data = await res.json();
  const assets: any[] = data?.assets?.items ?? [];
  return assets.map((a) => ({
    id: a.id,
    filename: a.originalFileName ?? a.id,
    durationLabel: (a.duration ?? '').slice(3, 8) || '—',
    sizeBytes: Number(a.exifInfo?.fileSizeInByte ?? 0),
    codec: (a.exifInfo?.description || 'VIDEO').toUpperCase(),
    takenLabel: (a.fileCreatedAt ?? '').slice(0, 10),
  }));
}

export function mockVideoById(id: string): ImmichVideo | undefined {
  return MOCK_VIDEOS.find((v) => v.id === id);
}
