import { NextResponse } from 'next/server';
import { getActor } from '@/lib/server/actor';
import { one } from '@/lib/server/db';
import { publish } from '@/lib/server/bus';

type Ctx = { params: Promise<{ id: string }> };

// Pin verslepen = eigen comment bijwerken (editor mag alle pins verplaatsen).
export async function PATCH(req: Request, { params }: Ctx) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const comment = await one<any>('select * from comment where id = $1', [Number(id)]);
  if (!comment) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const own =
    actor.kind === 'editor' || Number(comment.author_guest_id) === (actor as any).guestId;
  if (!own) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { pin } = await req.json().catch(() => ({}));
  const x = Math.min(1, Math.max(0, Number(pin?.x)));
  const y = Math.min(1, Math.max(0, Number(pin?.y)));
  if (Number.isNaN(x) || Number.isNaN(y)) {
    return NextResponse.json({ error: 'pin {x,y} verplicht' }, { status: 400 });
  }
  await one('update comment set pin_x = $2, pin_y = $3, edited_at = now() where id = $1 returning id', [
    Number(id),
    x,
    y,
  ]);
  publish(Number(comment.version_id), 'comment');
  return NextResponse.json({ ok: true });
}
