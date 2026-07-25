import { NextResponse } from 'next/server';
import { getEditor, getGuest } from '@/lib/server/auth';
import { one } from '@/lib/server/db';
import { reviewPayload } from '@/lib/server/payload';

type Ctx = { params: Promise<{ token: string }> };

// Project + versies + comments in één payload (Tech Notitie §4).
// Zonder guest-cookie: 401 met join-info zodat de client de naam-gate toont.
export async function GET(_req: Request, { params }: Ctx) {
  const { token } = await params;
  const share = await one<any>(
    `select s.*, p.title from share_link s join project p on p.id = s.project_id
      where s.token = $1 and s.revoked_at is null`,
    [token]
  );
  if (!share || (share.expires_at && new Date(share.expires_at) < new Date())) {
    return NextResponse.json({ error: 'Link verlopen of ingetrokken' }, { status: 404 });
  }

  const editor = await getEditor();
  if (editor) {
    const payload = await reviewPayload(Number(share.project_id), {
      kind: 'editor',
      userId: editor.userId,
      name: editor.name,
    });
    return NextResponse.json(payload);
  }

  const guest = await getGuest();
  if (!guest || guest.shareLinkId !== Number(share.id)) {
    return NextResponse.json(
      {
        needsJoin: true,
        projectTitle: share.title,
        askName: share.ask_name,
        needsPassword: Boolean(share.password_hash),
        expiresDays: share.expires_at
          ? Math.max(1, Math.round((new Date(share.expires_at).getTime() - Date.now()) / 86400000))
          : null,
      },
      { status: 401 }
    );
  }

  const payload = await reviewPayload(Number(share.project_id), {
    kind: 'guest',
    guestId: guest.guestId,
    name: guest.name,
  });
  return NextResponse.json(payload);
}
