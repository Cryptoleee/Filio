import { NextResponse } from 'next/server';
import { actorId, canAccessProject, getActor } from '@/lib/server/actor';
import { one } from '@/lib/server/db';
import { publish } from '@/lib/server/bus';

type Ctx = { params: Promise<{ id: string }> };

// 👍 aan/uit per actor (unique op comment+actor+kind).
export async function PUT(_req: Request, { params }: Ctx) {
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
  const aid = actorId(actor);
  const existing = await one(
    `delete from reaction where comment_id = $1 and actor_id = $2 and kind = 'thumbs_up' returning comment_id`,
    [Number(id), aid]
  );
  if (!existing) {
    await one(
      `insert into reaction (comment_id, actor_id, kind) values ($1, $2, 'thumbs_up') returning comment_id`,
      [Number(id), aid]
    );
  }
  publish(Number(comment.version_id), 'comment');
  return NextResponse.json({ liked: !existing });
}
