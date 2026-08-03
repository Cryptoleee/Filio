// Zet een gebeurtenis in de wachtrij. De worker bundelt en verstuurt ze
// (scripts/worker.mjs) — de webserver wacht dus nooit op een melding.

import { query } from './db';

export interface NotifyEvent {
  projectId: number;
  kind: 'comment' | 'reply' | 'transcode_ready' | 'transcode_failed';
  actorName?: string | null;
  versionNumber?: number | null;
  timecode?: string | null;
  body?: string | null;
}

export async function queueNotification(e: NotifyEvent): Promise<void> {
  try {
    await query(
      `insert into notification_event
         (project_id, kind, actor_name, version_number, timecode, body)
       values ($1, $2, $3, $4, $5, $6)`,
      [e.projectId, e.kind, e.actorName ?? null, e.versionNumber ?? null, e.timecode ?? null, e.body ?? null]
    );
  } catch (err) {
    // Een mislukte melding mag nooit het plaatsen van een comment blokkeren.
    console.error('[notify] kon gebeurtenis niet opslaan:', err);
  }
}
