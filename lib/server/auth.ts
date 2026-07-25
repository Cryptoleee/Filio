// Editor- en gast-sessies via HMAC-getekende httpOnly cookies.
// Geen extern auth-systeem: één editor (user-tabel), gasten via share-link + naam.

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { one } from './db';

const SECRET = process.env.SESSION_SECRET ?? 'dev-secret-change-me';

export const EDITOR_COOKIE = 'filio_editor';
export const GUEST_COOKIE = 'filio_guest';

function sign(value: string): string {
  const mac = createHmac('sha256', SECRET).update(value).digest('base64url');
  return `${value}.${mac}`;
}

function verify(signed: string | undefined): string | null {
  if (!signed) return null;
  const i = signed.lastIndexOf('.');
  if (i < 0) return null;
  const value = signed.slice(0, i);
  const expected = sign(value);
  if (
    expected.length === signed.length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(signed))
  ) {
    return value;
  }
  return null;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function checkPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 32).toString('hex');
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(hash));
}

export interface EditorSession {
  userId: number;
  name: string;
}

export interface GuestSession {
  guestId: number;
  shareLinkId: number;
  projectId: number;
  name: string;
  color: string;
}

export async function getEditor(): Promise<EditorSession | null> {
  const jar = await cookies();
  const id = verify(jar.get(EDITOR_COOKIE)?.value);
  if (!id) return null;
  const user = await one<{ id: string; display_name: string }>(
    'select id, display_name from "user" where id = $1',
    [Number(id)]
  );
  return user ? { userId: Number(user.id), name: user.display_name } : null;
}

export async function getGuest(): Promise<GuestSession | null> {
  const jar = await cookies();
  const raw = verify(jar.get(GUEST_COOKIE)?.value);
  if (!raw) return null;
  const [guestId, secret] = raw.split(':');
  const row = await one<any>(
    `select g.id, g.display_name, g.color, g.session_secret, g.share_link_id, s.project_id
       from guest g join share_link s on s.id = g.share_link_id
      where g.id = $1`,
    [Number(guestId)]
  );
  if (!row || row.session_secret !== secret) return null;
  return {
    guestId: Number(row.id),
    shareLinkId: Number(row.share_link_id),
    projectId: Number(row.project_id),
    name: row.display_name,
    color: row.color,
  };
}

export function editorCookieValue(userId: number): string {
  return sign(String(userId));
}

export function guestCookieValue(guestId: number, secret: string): string {
  return sign(`${guestId}:${secret}`);
}

export const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 90,
};
