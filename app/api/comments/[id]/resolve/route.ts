import { NextResponse } from 'next/server';
import { actorId, canAccessProject, getActor } from '@/lib/server/actor';
import { one } from '@/lib/server/db';
import { publish } from '@/lib/server/bus';

type Ctx = { params: Promise<{ id: string }> };

// Togglet resolved_at (gast én editor mogen resolven).
export async function PATCH(_req: Request, { params }: Ctx) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const comment = await one<any>(
    `select c.*, v.project_id from comment c join version v on v.id = c.version_id
      where c.id = $1`,
    [Number(id)]
  );
  if (!comment) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!(await canAccessProject(actor, Number(comment.project_id)))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  await one(
    `update comment
        set resolved_at = case when resolved_at is null then now() else null end,
            resolved_by = case when resolved_at is null then $2::bigint else null end
      where id = $1 returning id`,
    [Number(id), actor.kind === 'editor' ? actor.userId : actor.guestId]
  );
  publish(Number(comment.version_id), 'comment');
  return NextResponse.json({ ok: true, actor: actorId(actor) });
}
