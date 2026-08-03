-- Notificaties: gebundelde meldingen via ntfy (en/of mail).
-- Gebeurtenissen komen in een wachtrij; de worker stuurt ze pas als het even
-- stil is, zodat één feedbackronde één melding oplevert in plaats van tien.

alter table settings
  add column if not exists ntfy_url                text,
  add column if not exists ntfy_topic              text,
  add column if not exists ntfy_token              text,
  add column if not exists notify_quiet_minutes    int not null default 5,
  add column if not exists notify_max_wait_minutes int not null default 30,
  add column if not exists notify_feedback         boolean not null default true,
  add column if not exists notify_transcode_ready  boolean not null default false,
  add column if not exists notify_transcode_failed boolean not null default true;

create table if not exists notification_event (
  id             bigint generated always as identity primary key,
  project_id     bigint references project(id),
  kind           text not null,  -- comment | reply | transcode_ready | transcode_failed
  actor_name     text,
  version_number int,
  timecode       text,
  body           text,
  created_at     timestamptz not null default now(),
  sent_at        timestamptz
);

create index if not exists notification_pending_idx
  on notification_event (sent_at, created_at);
