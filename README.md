# Filio — self-hosted video review

Een zelf-gehost alternatief voor Vimeo Review / Frame.io: één editor, klanten
reviewen via een gedeelde link zonder account. Feedback is frame-accuraat, met
optionele pin of tekening op de frame. Cuts staan in Immich op een UGREEN NAS.

## Architectuur

Next.js (UI + API-routes) + Postgres 16 + een ffmpeg-worker, alles in Docker op
de NAS achter Caddy (zie `docker-compose.yml`). De app is bewust dun: hij bewaart
projecten en comments, en verwijst voor de bytes naar Immich.

- `/` — dashboard (alleen editor, login via `/login`): projectgrid met echte
  posters, live stats, ⋯-menu (versie toevoegen, hernoemen, share, archiveren),
  Immich-picker, ffmpeg-voortgang uit de worker.
- `/review/[id]` — reviewpagina (editor): frame-accurate `<video>`-player op de
  1080p-proxy (frame = `round(t·fps)`, seek op `(frame+0.5)/fps`), sleepbare pins
  (letterbox-correct), tekenen in SVG, comment-rail met sorteren/filter/resolve/
  👍/replies/soft-delete en versie-carry-over. Live updates via SSE.
- `/r/[token]` — de gedeelde gastlink: naam-gate (en wachtwoord als ingesteld),
  httpOnly guest-cookie, daarna dezelfde reviewpagina.
- `/stream/:versionId` — proxy-mp4 met Range-support (206) en token-check;
  `?download=1` voor de proxy-download, `?original=1` streamt het origineel door
  uit Immich. De client ziet nooit een Immich-URL.

Zonder `IMMICH_URL` draait alles in **mock-modus**: de picker toont demobestanden
en de worker genereert testclips — de hele flow werkt dan lokaal zonder NAS.

## Draaien (dev)

```bash
npm install
cp .env.example .env          # DATABASE_URL, SESSION_SECRET, EDITOR_* invullen
npm run migrate && npm run seed
npm run worker &              # ffmpeg-transcodes
npm run dev                   # http://localhost:3000 → /login
```

Productie op de NAS: zie **[DEPLOY.md](DEPLOY.md)** voor de volledige
stap-voor-stap installatie (Docker, `.env`, domein + TLS via Caddy).

## Sneltoetsen (reviewpagina)

- `Space` — play/pauze
- `←` / `→` — één frame stappen
- `C` — pauzeert en focust de composer
- `⌘/Ctrl + Enter` — comment posten

## Besloten regels (niet heropenen)

1. Klanten zien elkaars comments — één gedeelde draad per versie.
2. Een gast mag eigen comments altijd bewerken/verwijderen (soft-delete, replies blijven leesbaar).
3. Open comments lopen automatisch mee naar de volgende versie; opgeloste blijven achter.
4. Download biedt 1080p-proxy én origineel, alleen als de share-link downloads toestaat.
5. Alleen de editor krijgt mail; klanten worden door de editor zelf geïnformeerd.
6. Projecten worden gearchiveerd, nooit verwijderd.

## Status t.o.v. de bouworde (Tech Notitie §10)

1. ✅ Schema (`db/migrations/`) + frame-accurate player
2. ✅ Comments met frame + rail, sorteren en resolve
3. ✅ Gastlink + naam-flow en share-modal (wachtwoord, download, expiry)
4. ✅ Pin op de frame + tekenen (genormaliseerde SVG-paden in `drawing` jsonb)
5. ✅ Transcode-worker (`scripts/worker.mjs`: 1080p H.264, GOP = 1 s, poster,
   ffprobe-metadata) + Immich-picker in het dashboard
6. ✅ Gebundelde digestmail naar de editor (venster ~10 min, SMTP via env) + SSE
7. ✅ Mobiel (2a): tap = pin, dubbel-tap = fullscreen, composer als sticky balk;
   pins en tekenen werken via pointer events ook op touch. Eigen comments zijn
   inline te bewerken (besloten regel 2).
8. ✅ Huisstijl in `/settings`: eigen logo, studionaam en accentkleur (ook per
   project), plus een instelbare interface-grootte voor grote schermen.
9. ✅ Push-notificaties via ntfy, gebundeld per feedbackronde (wachtrij in
   `notification_event`, verzending door de worker — zie `scripts/notifier.mjs`).

Database-updates lopen via genummerde migraties in `db/migrations/`; de web-container
draait `npm run migrate` bij elke start, dus een update vraagt geen handwerk.

Nog open richting echte NAS-deploy: Immich-endpointnamen checken tegen
`/api/api-docs` van je eigen installatie (§5) — de client zit in
`lib/server/immich.ts`.
