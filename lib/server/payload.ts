// Bouwt de payloads die de client gebruikt: één query-set per scherm.

import { one, query } from './db';
import type {
  ApiComment,
  ApiVersion,
  DashboardPayload,
  ProjectSummary,
  ReviewPayload,
} from '../types';

export type Actor = { kind: 'editor'; userId: number; name: string } | {
  kind: 'guest';
  guestId: number;
  name: string;
};

export function actorId(a: Actor): string {
  return a.kind === 'editor' ? `user:${a.userId}` : `guest:${a.guestId}`;
}

function fpsOf(row: any): number {
  const num = Number(row.fps_numerator ?? 25);
  const den = Number(row.fps_denominator ?? 1);
  return den ? num / den : 25;
}

function totalFramesOf(row: any): number {
  const fps = fpsOf(row);
  return Math.max(1, Math.round(((Number(row.duration_ms) || 0) / 1000) * fps));
}

function formatBytes(bytes: number | null): string | null {
  if (!bytes) return null;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(bytes >= 10e9 ? 0 : 1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1e6))} MB`;
}

function durationLabel(ms: number | null): string | null {
  if (!ms) return null;
  const s = Math.round(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function mapVersion(row: any): ApiVersion {
  return {
    id: Number(row.id),
    number: row.number,
    fps: fpsOf(row),
    totalFrames: totalFramesOf(row),
    status: row.status,
    progress: row.progress,
    streamUrl: `/stream/${row.id}`,
    posterUrl: `/thumb/${row.id}`,
    width: row.width,
    height: row.height,
  };
}

async function mapComments(projectId: number, actor: Actor): Promise<ApiComment[]> {
  const rows = await query<any>(
    `select c.*, v.number as version_number,
            coalesce(g.display_name, u.display_name) as author_name,
            (select count(*)::int from reaction r
              where r.comment_id = c.id and r.kind = 'thumbs_up') as likes,
            exists(select 1 from reaction r
              where r.comment_id = c.id and r.kind = 'thumbs_up' and r.actor_id = $2) as liked
       from comment c
       join version v on v.id = c.version_id
       left join guest g on g.id = c.author_guest_id
       left join "user" u on u.id = c.author_user_id
      where v.project_id = $1
      order by c.created_at`,
    [projectId, actorId(actor)]
  );

  const isMine = (row: any) =>
    actor.kind === 'editor'
      ? Number(row.author_user_id) === actor.userId
      : Number(row.author_guest_id) === actor.guestId;

  const top = rows.filter((r) => !r.parent_id);
  const replies = rows.filter((r) => r.parent_id);

  return top.map((r) => ({
    id: Number(r.id),
    versionId: Number(r.version_id),
    versionNumber: r.version_number,
    name: r.author_name ?? 'Onbekend',
    frame: r.frame,
    body: r.deleted_at ? '' : r.body,
    pin: r.deleted_at || r.pin_x == null ? null : { x: Number(r.pin_x), y: Number(r.pin_y) },
    strokes:
      r.deleted_at || !r.drawing
        ? []
        : (r.drawing as any[]).map((d) => d.points as [number, number][]),
    likes: r.likes,
    liked: r.liked,
    resolved: Boolean(r.resolved_at),
    deleted: Boolean(r.deleted_at),
    mine: isMine(r),
    createdAt: r.created_at.toISOString(),
    replies: replies
      .filter((rep) => Number(rep.parent_id) === Number(r.id))
      .map((rep) => ({
        id: Number(rep.id),
        name: rep.author_name ?? 'Onbekend',
        body: rep.deleted_at ? '' : rep.body,
        createdAt: rep.created_at.toISOString(),
        mine: isMine(rep),
      })),
  }));
}

export async function reviewPayload(projectId: number, actor: Actor): Promise<ReviewPayload | null> {
  const project = await one<any>('select * from project where id = $1', [projectId]);
  if (!project) return null;

  const versionRows = await query<any>(
    'select * from version where project_id = $1 order by number',
    [projectId]
  );
  const share = await one<any>(
    `select * from share_link where project_id = $1 and revoked_at is null
      order by created_at desc limit 1`,
    [projectId]
  );
  const latest = versionRows[versionRows.length - 1];

  return {
    project: {
      id: Number(project.id),
      title: project.title,
      allowDownload: share ? share.allow_download : true,
      sharedAt: share ? share.created_at.toISOString() : null,
      shareUrl:
        actor.kind === 'editor' && share
          ? `${process.env.APP_URL ?? ''}/r/${share.token}`
          : null,
      proxyLabel: latest ? formatBytes(latest.proxy_bytes) : null,
      originalLabel: latest
        ? [latest.orig_filename, formatBytes(latest.orig_bytes)].filter(Boolean).join(' · ') || null
        : null,
    },
    versions: versionRows.map(mapVersion),
    comments: await mapComments(projectId, actor),
    viewer: { name: actor.name, isEditor: actor.kind === 'editor' },
  };
}

export async function dashboardPayload(editorName: string): Promise<DashboardPayload> {
  const projects = await query<any>(
    `select p.*,
            v.id as v_id, v.number as v_number, v.status as v_status,
            v.progress as v_progress, v.duration_ms as v_duration_ms,
            v.orig_filename as v_orig_filename, v.poster_path as v_poster_path
       from project p
       left join lateral (
         select * from version where project_id = p.id order by number desc limit 1
       ) v on true
      where p.archived_at is null
      order by p.created_at`
  );

  const summaries: ProjectSummary[] = [];
  for (const p of projects) {
    const unresolved = await one<{ n: number }>(
      `select count(*)::int as n
         from comment c join version v on v.id = c.version_id
        where v.project_id = $1 and c.parent_id is null
          and c.resolved_at is null and c.deleted_at is null`,
      [p.id]
    );
    const reviewers = await query<{ display_name: string }>(
      `select distinct g.display_name
         from comment c
         join guest g on g.id = c.author_guest_id
         join version v on v.id = c.version_id
        where v.project_id = $1`,
      [p.id]
    );
    const share = await one<any>(
      `select token from share_link where project_id = $1 and revoked_at is null
        order by created_at desc limit 1`,
      [p.id]
    );
    summaries.push({
      id: Number(p.id),
      title: p.title,
      latestVersion: p.v_number ?? 0,
      status: p.v_status ?? 'empty',
      progress: p.v_progress ?? 0,
      transcodingName:
        p.v_status === 'queued' || p.v_status === 'transcoding' ? p.v_orig_filename : null,
      unresolved: unresolved?.n ?? 0,
      reviewers: reviewers.map((r) => r.display_name),
      updatedLabel: relativeLabel(p.created_at),
      durationLabel: durationLabel(p.v_duration_ms),
      posterUrl: p.v_poster_path && p.v_id ? `/thumb/${p.v_id}` : null,
      shareToken: share?.token ?? null,
    });
  }

  const openComments = summaries.reduce((n, s) => n + s.unresolved, 0);
  const awaiting = await one<{ n: number }>(
    `select count(*)::int as n
       from comment c
      where c.parent_id is null and c.resolved_at is null and c.deleted_at is null
        and c.author_guest_id is not null
        and not exists (
          select 1 from comment r
           where r.parent_id = c.id and r.author_user_id is not null
        )`
  );
  const bytes = await one<{ total: string }>(
    `select coalesce(sum(coalesce(orig_bytes, 0) + coalesce(proxy_bytes, 0)), 0)::text as total
       from version`
  );

  return {
    projects: summaries,
    stats: {
      activeProjects: summaries.length,
      openComments,
      awaitingReply: awaiting?.n ?? 0,
      nasGb: Math.round(Number(bytes?.total ?? 0) / 1e9),
    },
    viewer: { name: editorName },
  };
}

function relativeLabel(date: Date): string {
  const diff = Date.now() - date.getTime();
  const d = Math.floor(diff / 86400000);
  if (d > 0) return `${d}D AGO`;
  const h = Math.floor(diff / 3600000);
  if (h > 0) return `${h}H AGO`;
  return 'NOW';
}
