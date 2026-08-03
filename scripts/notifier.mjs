// Bundelt gebeurtenissen uit notification_event en verstuurt ze via ntfy
// en/of mail. Wordt vanuit de worker aangeroepen (één proces = geen dubbele
// meldingen). Regel: pas versturen als het `quiet` minuten stil is rond een
// project, of uiterlijk `maxWait` minuten na de eerste gebeurtenis — zo levert
// één feedbackronde één melding op.

const APP_URL = process.env.APP_URL ?? '';

function settingsFrom(row) {
  return {
    ntfyUrl: (process.env.NTFY_URL ?? row?.ntfy_url ?? '').replace(/\/+$/, ''),
    ntfyTopic: process.env.NTFY_TOPIC ?? row?.ntfy_topic ?? '',
    ntfyToken: process.env.NTFY_TOKEN ?? row?.ntfy_token ?? '',
    quiet: row?.notify_quiet_minutes ?? 5,
    maxWait: row?.notify_max_wait_minutes ?? 30,
    feedback: row?.notify_feedback ?? true,
    transcodeReady: row?.notify_transcode_ready ?? false,
    transcodeFailed: row?.notify_transcode_failed ?? true,
  };
}

export function buildMessage(projectTitle, events) {
  const feedback = events.filter((e) => e.kind === 'comment' || e.kind === 'reply');
  const failed = events.filter((e) => e.kind === 'transcode_failed');
  const ready = events.filter((e) => e.kind === 'transcode_ready');

  if (feedback.length) {
    const names = [...new Set(feedback.map((e) => e.actor_name).filter(Boolean))];
    const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} en ${names.at(-1)}`;
    const count = feedback.length;
    const versions = [...new Set(feedback.map((e) => e.version_number).filter(Boolean))];
    const title =
      `${count} nieuwe ${count === 1 ? 'reactie' : 'reacties'}` +
      (who ? ` van ${who}` : '') +
      ` — ${projectTitle}` +
      (versions.length === 1 ? ` v${versions[0]}` : '');

    const lines = feedback.slice(0, 5).map((e) => {
      const head = [e.timecode, e.actor_name].filter(Boolean).join(' · ');
      const body = (e.body ?? '').replace(/\s+/g, ' ').slice(0, 140);
      return `${head}\n${body}`;
    });
    if (feedback.length > 5) lines.push(`… en nog ${feedback.length - 5}`);
    return { title, body: lines.join('\n\n'), tags: 'speech_balloon', priority: '3' };
  }

  if (failed.length) {
    return {
      title: `Transcode mislukt — ${projectTitle}`,
      body: failed.map((e) => e.body ?? 'De proxy kon niet gemaakt worden.').join('\n'),
      tags: 'warning',
      priority: '4',
    };
  }

  if (ready.length) {
    const v = ready.at(-1)?.version_number;
    return {
      title: `Klaar om te delen — ${projectTitle}`,
      body: `De 1080p-proxy${v ? ` van v${v}` : ''} staat klaar.`,
      tags: 'white_check_mark',
      priority: '2',
    };
  }
  return null;
}

async function sendNtfy(cfg, msg, clickUrl) {
  if (!cfg.ntfyUrl || !cfg.ntfyTopic) return false;
  const headers = {
    'Content-Type': 'text/plain; charset=utf-8',
    Title: asciiTitle(msg.title),
    Priority: msg.priority,
    Tags: msg.tags,
  };
  if (clickUrl) headers.Click = clickUrl;
  if (cfg.ntfyToken) {
    headers.Authorization = cfg.ntfyToken.includes(':')
      ? `Basic ${Buffer.from(cfg.ntfyToken).toString('base64')}`
      : `Bearer ${cfg.ntfyToken}`;
  }
  const res = await fetch(`${cfg.ntfyUrl}/${cfg.ntfyTopic}`, {
    method: 'POST',
    headers,
    body: msg.body,
  });
  if (!res.ok) throw new Error(`ntfy antwoordde ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return true;
}

// HTTP-headers zijn niet betrouwbaar in UTF-8 en niet elke ntfy-versie decodeert
// RFC 2047. De titel gaat daarom ASCII-veilig het net op; de body blijft UTF-8,
// dus accenten en emoji in de feedback zelf blijven gewoon staan.
function asciiTitle(value) {
  const plain = value
    .replace(/[\u2012-\u2015\u2212]/g, '-')     // – — ‒ ― −
    .replace(/[\u2018\u2019\u201B]/g, "'")      // ' '
    .replace(/[\u201C\u201D]/g, '"')           // " "
    .replace(/\u2026/g, '...')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')            // accenten van letters halen
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x20-\x7E]/g, '')               // rest weglaten
    .replace(/\s+/g, ' ')
    .trim();
  return plain || 'Nieuwe feedback';
}

export async function flushNotifications(pool) {
  const { rows: settingsRows } = await pool.query('select * from settings where id = true');
  const cfg = settingsFrom(settingsRows[0]);

  const { rows: groups } = await pool.query(
    `select project_id,
            max(created_at) as newest,
            min(created_at) as oldest
       from notification_event
      where sent_at is null
      group by project_id`
  );

  for (const g of groups) {
    const quietFor = (Date.now() - new Date(g.newest).getTime()) / 60000;
    const waitingFor = (Date.now() - new Date(g.oldest).getTime()) / 60000;
    if (quietFor < cfg.quiet && waitingFor < cfg.maxWait) continue; // nog bezig

    const { rows: events } = await pool.query(
      `select * from notification_event
        where sent_at is null and project_id is not distinct from $1
        order by created_at`,
      [g.project_id]
    );
    const wanted = events.filter((e) =>
      e.kind === 'comment' || e.kind === 'reply'
        ? cfg.feedback
        : e.kind === 'transcode_ready'
          ? cfg.transcodeReady
          : cfg.transcodeFailed
    );

    const ids = events.map((e) => e.id);
    if (wanted.length === 0) {
      await pool.query('update notification_event set sent_at = now() where id = any($1)', [ids]);
      continue;
    }

    const { rows: projectRows } = await pool.query('select title from project where id = $1', [
      g.project_id,
    ]);
    const title = projectRows[0]?.title ?? 'Project';
    const msg = buildMessage(title, wanted);
    if (!msg) {
      await pool.query('update notification_event set sent_at = now() where id = any($1)', [ids]);
      continue;
    }

    const click = APP_URL && g.project_id ? `${APP_URL}/review/${g.project_id}` : undefined;
    try {
      const viaNtfy = await sendNtfy(cfg, msg, click);
      const viaMail = await sendMailDigest(msg, click);
      if (!viaNtfy && !viaMail) {
        console.log(`[notify] (niets ingesteld) ${msg.title}\n${msg.body}`);
      } else {
        console.log(`[notify] verstuurd: ${msg.title}`);
      }
      await pool.query('update notification_event set sent_at = now() where id = any($1)', [ids]);
    } catch (err) {
      console.error('[notify] versturen mislukt, probeer later opnieuw:', err.message);
    }
  }
}

async function sendMailDigest(msg, click) {
  if (!process.env.SMTP_HOST) return false;
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
    to: process.env.EDITOR_EMAIL,
    subject: msg.title,
    text: click ? `${msg.body}\n\n${click}` : msg.body,
  });
  return true;
}
