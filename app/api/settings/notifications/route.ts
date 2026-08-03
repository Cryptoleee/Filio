import { NextResponse } from 'next/server';
import { getEditor } from '@/lib/server/auth';
import { one } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

export interface NotifySettings {
  ntfyUrl: string;
  ntfyTopic: string;
  hasToken: boolean;
  quietMinutes: number;
  maxWaitMinutes: number;
  feedback: boolean;
  transcodeReady: boolean;
  transcodeFailed: boolean;
  envOverride: boolean; // ingesteld via .env: UI kan het dan niet wijzigen
}

async function current(): Promise<NotifySettings> {
  const row = await one<any>('select * from settings where id = true');
  return {
    ntfyUrl: process.env.NTFY_URL ?? row?.ntfy_url ?? '',
    ntfyTopic: process.env.NTFY_TOPIC ?? row?.ntfy_topic ?? '',
    hasToken: Boolean(process.env.NTFY_TOKEN ?? row?.ntfy_token),
    quietMinutes: row?.notify_quiet_minutes ?? 5,
    maxWaitMinutes: row?.notify_max_wait_minutes ?? 30,
    feedback: row?.notify_feedback ?? true,
    transcodeReady: row?.notify_transcode_ready ?? false,
    transcodeFailed: row?.notify_transcode_failed ?? true,
    envOverride: Boolean(process.env.NTFY_URL || process.env.NTFY_TOPIC),
  };
}

export async function GET() {
  const editor = await getEditor();
  if (!editor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json(await current());
}

export async function PATCH(req: Request) {
  const editor = await getEditor();
  if (!editor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  if (typeof body.ntfyUrl === 'string') {
    const url = body.ntfyUrl.trim().replace(/\/+$/, '');
    if (url && !/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: 'Adres moet met http:// of https:// beginnen' }, { status: 400 });
    }
    await one('update settings set ntfy_url = $1 where id = true returning id', [url || null]);
  }
  if (typeof body.ntfyTopic === 'string') {
    const topic = body.ntfyTopic.trim().replace(/^\/+/, '');
    if (topic && !/^[\w-]{1,64}$/.test(topic)) {
      return NextResponse.json({ error: 'Onderwerp mag alleen letters, cijfers, - en _ bevatten' }, { status: 400 });
    }
    await one('update settings set ntfy_topic = $1 where id = true returning id', [topic || null]);
  }
  if (body.ntfyToken !== undefined) {
    const token = typeof body.ntfyToken === 'string' ? body.ntfyToken.trim() : '';
    await one('update settings set ntfy_token = $1 where id = true returning id', [token || null]);
  }
  for (const [key, column, min, max] of [
    ['quietMinutes', 'notify_quiet_minutes', 0, 120],
    ['maxWaitMinutes', 'notify_max_wait_minutes', 1, 1440],
  ] as const) {
    if (body[key] != null) {
      const n = Math.round(Number(body[key]));
      if (!Number.isFinite(n) || n < min || n > max) {
        return NextResponse.json({ error: 'Ongeldige wachttijd' }, { status: 400 });
      }
      await one(`update settings set ${column} = $1 where id = true returning id`, [n]);
    }
  }
  for (const [key, column] of [
    ['feedback', 'notify_feedback'],
    ['transcodeReady', 'notify_transcode_ready'],
    ['transcodeFailed', 'notify_transcode_failed'],
  ] as const) {
    if (typeof body[key] === 'boolean') {
      await one(`update settings set ${column} = $1 where id = true returning id`, [body[key]]);
    }
  }
  return NextResponse.json(await current());
}
