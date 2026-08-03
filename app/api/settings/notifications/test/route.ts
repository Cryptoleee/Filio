import { NextResponse } from 'next/server';
import { getEditor } from '@/lib/server/auth';
import { one } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

// Stuurt direct een testmelding, zodat de editor ziet of ntfy goed staat.
export async function POST() {
  const editor = await getEditor();
  if (!editor) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const row = await one<any>('select * from settings where id = true');
  const url = (process.env.NTFY_URL ?? row?.ntfy_url ?? '').replace(/\/+$/, '');
  const topic = process.env.NTFY_TOPIC ?? row?.ntfy_topic ?? '';
  const token = process.env.NTFY_TOKEN ?? row?.ntfy_token ?? '';
  if (!url || !topic) {
    return NextResponse.json({ error: 'Vul eerst een server en een onderwerp in' }, { status: 400 });
  }

  const headers: Record<string, string> = {
    'Content-Type': 'text/plain; charset=utf-8',
    Title: 'Filio werkt',
    Tags: 'wave',
    Priority: '3',
  };
  if (process.env.APP_URL) headers.Click = process.env.APP_URL;
  if (token) {
    headers.Authorization = token.includes(':')
      ? `Basic ${Buffer.from(token).toString('base64')}`
      : `Bearer ${token}`;
  }

  try {
    const res = await fetch(`${url}/${topic}`, {
      method: 'POST',
      headers,
      body: 'Testmelding — vanaf nu krijg je hier gebundelde feedback binnen.',
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 200);
      return NextResponse.json(
        { error: `ntfy antwoordde ${res.status}${text ? `: ${text}` : ''}` },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: `Kon ntfy niet bereiken: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    );
  }
}
