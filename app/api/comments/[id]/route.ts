import { NextResponse } from 'next/server';
import { getActor } from '@/lib/server/actor';
import { one } from '@/lib/server/db';
import { publish } from '@/lib/server/bus';

type Ctx = { params: Promise<{ id: string }> };

async function ownComment(id: number) {
  return one<any>(
    `select c.*, v.project_id from comment c join version v on v.id = c.version_id
      where c.id = $1`,
    [id]
  );
}

function isOwn(comment: any, actor: Awaited<ReturnType<typeof getActor>>): boolean {
  if (!actor) return false;
  return actor.kind === 'editor'
    ? Number(comment.author_user_id) === actor.userId
    : Number(comment.author_guest_id) === actor.guestId;
}

// Eigen comment bewerken (besloten regel 2).
export async function PATCH(req: Request, { params }: Ctx) {
  const actor = await getActor();
  const { id } = await params;
  const comment = await ownComment(Number(id));
  if (!comment) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!isOwn(comment, actor)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const { body } = await req.json().catch(() => ({}));
  const text = String(body ?? '').trim();
  if (!text) return NextResponse.json({ error: 'body verplicht' }, { status: 400 });
  await one('update comment set body = $2, edited_at = now() where id = $1 returning id', [
    Number(id),
    text.slice(0, 2000),
  ]);
  publish(Number(comment.version_id), 'comment');
  return NextResponse.json({ ok: true });
}

// Soft-delete: rij blijft staan, replies blijven leesbaar als "Comment verwijderd".
export async function DELETE(_req: Request, { params }: Ctx) {
  const actor = await getActor();
  const { id } = await params;
  const comment = await ownComment(Number(id));
  if (!comment) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!isOwn(comment, actor)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  await one('update comment set deleted_at = now() where id = $1 returning id', [Number(id)]);
  publish(Number(comment.version_id), 'comment');
  return NextResponse.json({ ok: true });
}
