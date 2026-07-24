# Filio — self-hosted video review

Een zelf-gehost alternatief voor Vimeo Review / Frame.io: één editor, klanten
reviewen via een gedeelde link zonder account. Feedback is frame-accuraat, met
optionele pin of tekening op de frame. Cuts staan in Immich op een UGREEN NAS.

## Stand van zaken

Dit is de **front-end van dashboard en reviewpagina**, gebouwd naar de design-handoff
(`design_handoff_video_review`). Data is nu nog een in-memory prototype-store
(`lib/store.ts`); het Postgres-schema voor de echte back-end staat klaar in
`db/schema.sql` en de API-routes staan beschreven in de Tech Notitie (sectie 4).

- `/` — dashboard (alleen editor): projectgrid, stats, ⋯-menu (versie toevoegen,
  hernoemen, share, archiveren), Immich-picker met gesimuleerde ffmpeg-progress,
  share-modal.
- `/review/[id]` — reviewpagina: frame-accurate player (25 fps, rAF), pins
  (sleepbaar), tekenen (SVG, genormaliseerde paden), comment-rail met sorteren,
  filter, resolve, 👍, replies, soft-delete en versie-carry-over.
- `/review/[id]?as=client` — "Preview as client" (naam-gate).
- `/r/[token]` — de gedeelde gastlink.

## Draaien

```bash
npm install
npm run dev   # http://localhost:3000
```

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

## Volgende stappen (bouworde uit de Tech Notitie)

1. ✅ Player met frame-accurate timecode + comments/rail/resolve + gastflow + pin/tekenen (deze front-end)
2. Postgres aansluiten (`db/schema.sql`) + API-routes uit sectie 4
3. Transcode-worker (ffmpeg 1080p proxy, korte GOP) + Immich-koppeling (server-to-server, API-key blijft op de NAS)
4. `/stream/:versionId` met Range-support en token-check
5. Gebundelde feedbackmail naar de editor + SSE voor live comments
