import { getEditor, getGuest } from './auth';
import { one } from './db';
import type { Actor } from './payload';

export { actorId } from './payload';

// Editor wint van gast als beide cookies bestaan.
export async function getActor(): Promise<Actor | null> {
  const editor = await getEditor();
  if (editor) return { kind: 'editor', userId: editor.userId, name: editor.name };
  const guest = await getGuest();
  if (guest) return { kind: 'guest', guestId: guest.guestId, name: guest.name };
  return null;
}

// Mag deze actor bij dit project? Gasten alleen bij het project van hun share-link.
export async function actorProjectId(actor: Actor): Promise<number | null> {
  if (actor.kind === 'editor') return null; // editor mag overal bij
  const row = await one<{ project_id: string }>(
    `select s.project_id from guest g join share_link s on s.id = g.share_link_id
      where g.id = $1`,
    [actor.guestId]
  );
  return row ? Number(row.project_id) : null;
}

export async function canAccessProject(actor: Actor, projectId: number): Promise<boolean> {
  if (actor.kind === 'editor') return true;
  return (await actorProjectId(actor)) === projectId;
}

// Simpele in-memory rate limit: 20 comment-posts per minuut per actor.
const buckets = new Map<string, number[]>();

export function rateLimited(key: string, max = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return true;
  }
  hits.push(now);
  buckets.set(key, hits);
  return false;
}
