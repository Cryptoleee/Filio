-- Filio — video review platform
-- Postgres 16 schema, per Tech Notitie sectie 3 (datamodel).
-- frame is ALTIJD een integer (nooit seconden als float);
-- pin-coördinaten zijn fracties 0–1 van het videovlak.

create table "user" (
  id            bigint generated always as identity primary key,
  email         text not null unique,
  password_hash text not null,
  display_name  text not null
  -- alleen de editor; geen registratie
);

create table project (
  id            bigint generated always as identity primary key,
  title         text not null,
  client_name   text,
  accent_color  text,
  logo_asset_id text,
  created_at    timestamptz not null default now(),
  archived_at   timestamptz
);

create table version (
  id              bigint generated always as identity primary key,
  project_id      bigint not null references project(id),
  number          int not null,
  immich_asset_id text not null,
  orig_filename   text,
  orig_bytes      bigint,
  proxy_path      text,
  proxy_bytes     bigint,
  poster_path     text,
  duration_ms     int,
  fps_numerator   int,           -- bv. 25/1 of 24000/1001
  fps_denominator int,
  width           int,
  height          int,
  status          text not null default 'queued'
                  check (status in ('queued', 'transcoding', 'ready', 'failed')),
  progress        int not null default 0, -- 0–100, door de worker bijgewerkt
  created_at      timestamptz not null default now(),
  unique (project_id, number)
);

create table share_link (
  id            bigint generated always as identity primary key,
  project_id    bigint not null references project(id),
  token         text not null unique, -- 32 bytes random, base58, in het pad /r/<token>
  ask_name      boolean not null default true,
  password_hash text,
  allow_download boolean not null default true,
  expires_at    timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now()
);

create table guest (
  id             bigint generated always as identity primary key,
  share_link_id  bigint not null references share_link(id),
  display_name   text not null,
  color          text not null, -- afgeleid van naam-hash
  session_secret text not null, -- httpOnly cookie na join
  last_seen_at   timestamptz
);

create table comment (
  id                      bigint generated always as identity primary key,
  version_id              bigint not null references version(id),
  parent_id               bigint references comment(id), -- replies, 1 niveau diep
  author_guest_id         bigint references guest(id),
  author_user_id          bigint references "user"(id),
  body                    text not null,
  frame                   int not null,     -- integer frames, nooit seconden
  pin_x                   real,             -- 0–1, nullable
  pin_y                   real,
  drawing                 jsonb,            -- [{tool, color, points:[[x,y],…]}], genormaliseerd 0–100
  resolved_at             timestamptz,
  resolved_by             bigint,
  carried_from_comment_id bigint references comment(id),
  deleted_at              timestamptz,      -- soft-delete door de gast zelf
  created_at              timestamptz not null default now(),
  edited_at               timestamptz,
  check (author_guest_id is not null or author_user_id is not null)
);

create index comment_version_idx on comment (version_id, created_at);

create table reaction (
  comment_id bigint not null references comment(id),
  actor_id   text not null, -- guest:<id> of user:<id>
  kind       text not null default 'thumbs_up',
  unique (comment_id, actor_id, kind)
);
