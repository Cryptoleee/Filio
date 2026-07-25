import { readFileSync } from 'node:fs';
import { canAccessProject, getActor } from '@/lib/server/actor';
import { one } from '@/lib/server/db';

type Ctx = { params: Promise<{ versionId: string }> };

export const dynamic = 'force-dynamic';

// Poster van de versie (door de worker uit het origineel getrokken, gecached).
export async function GET(_req: Request, { params }: Ctx) {
  const actor = await getActor();
  if (!actor) return new Response('unauthorized', { status: 401 });
  const { versionId } = await params;
  const version = await one<any>('select * from version where id = $1', [Number(versionId)]);
  if (!version || !version.poster_path) return new Response('not found', { status: 404 });
  if (!(await canAccessProject(actor, Number(version.project_id)))) {
    return new Response('forbidden', { status: 403 });
  }
  try {
    const buf = readFileSync(version.poster_path);
    return new Response(buf, {
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400' },
    });
  } catch {
    return new Response('poster missing', { status: 404 });
  }
}
