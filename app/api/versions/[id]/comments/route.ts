import { NextResponse } from 'next/server';
import { actorId, getActor } from '@/lib/server/actor';
import { canAccessProject, rateLimited } from '@/lib/server/actor';
import { one } from '@/lib/server/db';
import { publish } from '@/lib/server/bus';
import { queueNotification } from '@/lib/server/notify';

type Ctx = { params: Promise<{ id: string }> };

const MAX_BODY = 2000;

export async function POST(req: Request, { params }: Ctx) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const versionId = Number(id);
  const version = await one<any>(
    `select v.*, p.title as project_title from version v
      join project p on p.id = v.project_id where v.id = $1`,
    [versionId]
  );
  if (!version) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (!(await canAccessProject(actor, Number(version.project_id)))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  if (rateLimited(`comment:${actorId(actor)}`)) {
    return NextResponse.json({ error: 'Te veel comments — wacht even' }, { status: 429 });
  }

  const { body, frame, pin, strokes, parentId } = await req.json().catch(() => ({}));
  const text = String(body ?? '').trim();
  if (!text) return NextResponse.json({ error: 'body verplicht' }, { status: 400 });
  if (text.length > MAX_BODY) {
    return NextResponse.json({ error: `max ${MAX_BODY} tekens` }, { status: 400 });
  }
  const frameInt = Number.isInteger(frame) ? frame : Math.round(Number(frame) || 0);

  const drawing =
    Array.isArray(strokes) && strokes.length
      ? JSON.stringify(strokes.map((points: any) => ({ tool: 'pen', color: 'amber', points })))
      : null;

  const row = await one<{ id: string }>(
    `insert into comment (version_id, parent_id, author_guest_id, author_user_id,
                          body, frame, pin_x, pin_y, drawing)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [
      versionId,
      parentId ?? null,
      actor.kind === 'guest' ? actor.guestId : null,
      actor.kind === 'editor' ? actor.userId : null,
      text,
      frameInt,
      pin?.x ?? null,
      pin?.y ?? null,
      drawing,
    ]
  );

  publish(versionId, 'comment');
  // Alleen gastfeedback is nieuws voor de editor; eigen comments niet.
  if (actor.kind === 'guest') {
    const fps = (version.fps_numerator ?? 25) / (version.fps_denominator ?? 1);
    const secs = Math.floor(frameInt / fps);
    await queueNotification({
      projectId: Number(version.project_id),
      kind: parentId ? 'reply' : 'comment',
      actorName: actor.name,
      versionNumber: version.number,
      timecode: `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`,
      body: text,
    });
  }
  return NextResponse.json({ id: Number(row!.id) }, { status: 201 });
}
