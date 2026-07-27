-- Branding: studiologo, studionaam en accentkleur.
-- Eén rij (id = true), zodat er nooit twee kunnen bestaan.

create table settings (
  id          boolean primary key default true check (id),
  studio_name text not null default 'Filio',
  accent_hue  int not null default 78 check (accent_hue between 0 and 360),
  logo_path   text,
  logo_mime   text,
  updated_at  timestamptz not null default now()
);

insert into settings (id) values (true) on conflict do nothing;

-- Per project een eigen accentkleur (hue 0–360); leeg = studio-accent.
alter table project add column if not exists accent_hue int
  check (accent_hue between 0 and 360);
