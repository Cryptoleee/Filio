// Gebundelde feedbackmail naar de editor (Tech Notitie §8):
// nieuwe comments/replies per versie verzamelen in een venster van ~10 minuten,
// dan één mail. Alleen naar de editor — klanten krijgen nooit mail.

import { query } from './db';

interface PendingItem {
  projectTitle: string;
  versionNumber: number;
  author: string;
  body: string;
  timecode: string;
}

const WINDOW_MS = Number(process.env.MAIL_DIGEST_MS ?? 10 * 60 * 1000);

const globalForDigest = globalThis as unknown as {
  __filioDigest?: { items: PendingItem[]; timer: ReturnType<typeof setTimeout> | null };
};

const state = globalForDigest.__filioDigest ?? { items: [], timer: null };
if (!globalForDigest.__filioDigest) globalForDigest.__filioDigest = state;

export function queueDigest(item: PendingItem) {
  state.items.push(item);
  if (!state.timer) {
    state.timer = setTimeout(() => {
      const items = state.items.splice(0);
      state.timer = null;
      void sendDigest(items);
    }, WINDOW_MS);
  }
}

async function sendDigest(items: PendingItem[]) {
  if (items.length === 0) return;
  const editor = await query<{ email: string; display_name: string }>(
    'select email, display_name from "user" limit 1'
  );
  if (!editor[0]) return;

  const byProject = new Map<string, PendingItem[]>();
  for (const it of items) {
    const key = `${it.projectTitle} · v${it.versionNumber}`;
    (byProject.get(key) ?? byProject.set(key, []).get(key)!).push(it);
  }

  const lines = [...byProject.entries()]
    .map(
      ([head, list]) =>
        `${head}\n` + list.map((i) => `  ${i.timecode} — ${i.author}: ${i.body}`).join('\n')
    )
    .join('\n\n');
  const subject = `Nieuwe feedback: ${items.length} comment${items.length === 1 ? '' : 's'}`;

  if (!process.env.SMTP_HOST) {
    console.log(`[digest] (geen SMTP_HOST — mail niet verstuurd)\n${subject}\n${lines}`);
    return;
  }
  const nodemailer = await import('nodemailer');
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  await transport.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to: editor[0].email,
    subject,
    text: lines,
  });
}
