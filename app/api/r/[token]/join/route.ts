import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { COOKIE_OPTS, GUEST_COOKIE, checkPassword, guestCookieValue } from '@/lib/server/auth';
import { one } from '@/lib/server/db';
import { AVATAR_COLORS, nameColor } from '@/lib/data';

type Ctx = { params: Promise<{ token: string }> };

// Naam + eventueel wachtwoord → httpOnly guest-cookie (SameSite=Lax).
// Daarna kan de gast eigen comments bewerken/verwijderen zonder opnieuw te typen.
export async function POST(req: Request, { params }: Ctx) {
  const { token } = await params;
  const share = await one<any>(
    'select * from share_link where token = $1 and revoked_at is null',
    [token]
  );
  if (!share || (share.expires_at && new Date(share.expires_at) < new Date())) {
    return NextResponse.json({ error: 'Link verlopen of ingetrokken' }, { status: 404 });
  }

  const { name, password } = await req.json().catch(() => ({}));
  const displayName = share.ask_name ? String(name ?? '').trim() : String(name ?? 'Reviewer').trim() || 'Reviewer';
  if (share.ask_name && !displayName) {
    return NextResponse.json({ error: 'Naam verplicht' }, { status: 400 });
  }
  if (displayName.length > 60) {
    return NextResponse.json({ error: 'Naam te lang' }, { status: 400 });
  }
  if (share.password_hash && !checkPassword(String(password ?? ''), share.password_hash)) {
    return NextResponse.json({ error: 'Onjuist wachtwoord' }, { status: 401 });
  }

  const secret = randomBytes(24).toString('hex');
  const guest = await one<{ id: string }>(
    `insert into guest (share_link_id, display_name, color, session_secret, last_seen_at)
     values ($1, $2, $3, $4, now()) returning id`,
    [share.id, displayName, nameColor(displayName) ?? AVATAR_COLORS[0], secret]
  );

  const res = NextResponse.json({ ok: true, name: displayName });
  res.cookies.set(GUEST_COOKIE, guestCookieValue(Number(guest!.id), secret), COOKIE_OPTS);
  return res;
}
