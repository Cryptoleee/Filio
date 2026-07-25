// Transcode-worker (Tech Notitie §2): pakt versies met status 'queued' op,
// haalt het origineel uit Immich (of genereert zonder Immich een testclip),
// maakt een 1080p H.264-proxy met korte GOP (keyframe elke 1s) + poster,
// en leest fps/duur/afmetingen uit ffprobe.
//
// Proxies gaan naar PROXY_DIR — nooit terug de Immich-library in.

import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, statSync, unlinkSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres@localhost:5432/filio';
const PROXY_DIR = process.env.PROXY_DIR ?? join(process.cwd(), 'data', 'proxies');
const IMMICH_URL = process.env.IMMICH_URL;
const IMMICH_API_KEY = process.env.IMMICH_API_KEY;

mkdirSync(PROXY_DIR, { recursive: true });

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 3 });

// Duur van de testclips in mock-modus (zonder Immich), per asset-id.
const MOCK_DURATIONS = { 'mock-zeeuwse-v4': 78, 'mock-rabo-v2': 124, 'mock-interview': 60 };

function run(cmd, args, { onStderr } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => {
      err += d;
      onStderr?.(String(d));
    });
    p.on('close', (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err.slice(-800)}`))
    );
  });
}

async function ffprobe(path) {
  const out = await run('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=r_frame_rate,width,height',
    '-show_entries', 'format=duration',
    '-of', 'json',
    path,
  ]);
  const data = JSON.parse(out);
  const stream = data.streams?.[0] ?? {};
  const [num, den] = String(stream.r_frame_rate ?? '25/1').split('/').map(Number);
  return {
    fpsNum: num || 25,
    fpsDen: den || 1,
    width: stream.width ?? null,
    height: stream.height ?? null,
    durationMs: Math.round(Number(data.format?.duration ?? 0) * 1000),
  };
}

async function fetchOriginal(version, destPath) {
  if (IMMICH_URL && IMMICH_API_KEY) {
    const res = await fetch(`${IMMICH_URL}/api/assets/${version.immich_asset_id}/original`, {
      headers: { 'x-api-key': IMMICH_API_KEY },
    });
    if (!res.ok) throw new Error(`Immich download failed: ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath));
    return;
  }
  // Mock-modus: genereer een herkenbare testclip zodat de hele flow zonder
  // Immich end-to-end te testen is.
  const secs = MOCK_DURATIONS[version.immich_asset_id] ?? 30;
  await run('ffmpeg', [
    '-y',
    '-f', 'lavfi', '-i', `testsrc2=size=1280x720:rate=25:duration=${secs}`,
    '-f', 'lavfi', '-i', `sine=frequency=330:duration=${secs}`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest',
    '-f', 'mp4', // destPath heeft een .tmp-extensie, dus het formaat expliciet
    destPath,
  ]);
}

async function transcode(version) {
  const id = Number(version.id);
  console.log(`[worker] versie ${id} (${version.immich_asset_id}) → transcoding`);
  await pool.query("update version set status = 'transcoding', progress = 0 where id = $1", [id]);

  const srcPath = join(PROXY_DIR, `v${id}-src.tmp`);
  const proxyPath = join(PROXY_DIR, `v${id}-proxy.mp4`);
  const posterPath = join(PROXY_DIR, `v${id}-poster.jpg`);

  try {
    await fetchOriginal(version, srcPath);
    const meta = await ffprobe(srcPath);
    const fps = meta.fpsNum / meta.fpsDen;
    const gop = Math.max(1, Math.round(fps)); // keyframe elke seconde → frame-accuraat scrubben
    const durationS = meta.durationMs / 1000;

    let lastPct = -1;
    await run(
      'ffmpeg',
      [
        '-y', '-i', srcPath,
        '-vf', "scale='min(1920,iw)':-2",
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
        '-g', String(gop), '-keyint_min', String(gop), '-sc_threshold', '0',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart',
        proxyPath,
      ],
      {
        onStderr: (chunk) => {
          const m = /time=(\d+):(\d+):(\d+\.\d+)/.exec(chunk);
          if (!m || !durationS) return;
          const t = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
          const pct = Math.min(99, Math.round((t / durationS) * 100));
          if (pct > lastPct) {
            lastPct = pct;
            pool
              .query('update version set progress = $2 where id = $1', [id, pct])
              .catch(() => {});
          }
        },
      }
    );

    await run('ffmpeg', [
      '-y', '-ss', String(durationS * 0.25), '-i', proxyPath,
      '-frames:v', '1', '-vf', "scale='min(640,iw)':-2", posterPath,
    ]);

    const origBytes = version.orig_bytes ?? statSync(srcPath).size;
    await pool.query(
      `update version
          set status = 'ready', progress = 100,
              proxy_path = $2, proxy_bytes = $3, poster_path = $4,
              duration_ms = $5, fps_numerator = $6, fps_denominator = $7,
              width = $8, height = $9, orig_bytes = $10
        where id = $1`,
      [
        id, proxyPath, statSync(proxyPath).size, posterPath,
        meta.durationMs, meta.fpsNum, meta.fpsDen, meta.width, meta.height, origBytes,
      ]
    );
    console.log(`[worker] versie ${id} klaar (${meta.durationMs}ms @ ${meta.fpsNum}/${meta.fpsDen})`);
  } catch (err) {
    console.error(`[worker] versie ${id} mislukt:`, err.message);
    await pool.query("update version set status = 'failed' where id = $1", [id]);
  } finally {
    try {
      unlinkSync(srcPath);
    } catch {
      /* al weg */
    }
  }
}

console.log(`[worker] gestart · PROXY_DIR=${PROXY_DIR} · immich=${IMMICH_URL ? 'ja' : 'mock'}`);
for (;;) {
  try {
    const { rows } = await pool.query(
      "select * from version where status = 'queued' order by created_at limit 1"
    );
    if (rows[0]) {
      await transcode(rows[0]);
      continue; // meteen kijken of er nog een job staat
    }
  } catch (err) {
    console.error('[worker] poll-fout:', err.message);
  }
  await new Promise((r) => setTimeout(r, 2000));
}
