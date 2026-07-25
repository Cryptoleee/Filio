import { NextResponse } from 'next/server';
import { COOKIE_OPTS, EDITOR_COOKIE, checkPassword, editorCookieValue } from '@/lib/server/auth';
import { one } from '@/lib/server/db';

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password) {
    return NextResponse.json({ error: 'email en wachtwoord verplicht' }, { status: 400 });
  }
  const user = await one<any>('select * from "user" where email = $1', [email]);
  if (!user || !checkPassword(password, user.password_hash)) {
    return NextResponse.json({ error: 'Onjuiste inloggegevens' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true, name: user.display_name });
  res.cookies.set(EDITOR_COOKIE, editorCookieValue(Number(user.id)), COOKIE_OPTS);
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(EDITOR_COOKIE, '', { ...COOKIE_OPTS, maxAge: 0 });
  return res;
}
