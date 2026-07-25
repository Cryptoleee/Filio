# Filio op je NAS zetten — stap voor stap

Deze handleiding gaat ervan uit dat je Immich al draait (bijv. op
`immich.nasislike.com`) en dat je NAS Docker heeft. Alles wat je typt gaat via
SSH; kopieer de commando's gerust één voor één.

## Stap 1 — Voorbereiding (eenmalig)

1. **Docker op de NAS**: op een UGREEN NAS installeer je "Docker" via het App
   Center (op andere NAS-systemen heet dit Container Manager o.i.d.).
2. **SSH aanzetten**: NAS-instellingen → Terminal/SSH → inschakelen.
3. **Nieuwe Immich API-key maken**: Immich → klik je avatar → *Account
   Settings* → *API Keys* → *New API Key*. Bewaar hem even in je notities.
   (Trek oude keys die je ergens gedeeld hebt in.)

## Stap 2 — Code op de NAS zetten

Log in via SSH (vervang het IP door dat van je NAS):

```bash
ssh jouwgebruiker@192.168.1.xx
```

Haal de code binnen en ga de map in:

```bash
git clone https://github.com/cryptoleee/filio.git
cd filio
```

> Repo privé en vraagt git om een wachtwoord? Gebruik een GitHub *personal
> access token* als wachtwoord, of download de zip via GitHub → Code →
> Download ZIP en zet die met je bestandsbeheer op de NAS.

## Stap 3 — Instellingen invullen (.env)

Maak het instellingenbestand aan:

```bash
cp .env.example .env
nano .env
```

Vul deze regels in (de rest mag blijven staan):

```bash
IMMICH_URL=https://immich.nasislike.com     # of het interne adres, zie stap 7
IMMICH_API_KEY=<je nieuwe key uit stap 1>

APP_URL=http://192.168.1.xx:3000            # voorlopig; wordt je domein in stap 6
SESSION_SECRET=<lange willekeurige string>  # maak er een met: openssl rand -hex 32

EDITOR_EMAIL=leroy@wijzijnwolf.nl
EDITOR_PASSWORD=<kies een goed wachtwoord>  # hiermee log jij in
EDITOR_NAME=Leroy

DB_PASSWORD=<nog een willekeurige string>
```

Opslaan in nano: `Ctrl+O`, Enter, `Ctrl+X`.

## Stap 4 — Starten

```bash
docker compose up -d --build
```

De eerste keer duurt dit een paar minuten (image bouwen). Volg de logs met:

```bash
docker compose logs -f web
```

Zodra je `Ready` ziet: klaar. (`Ctrl+C` stopt alleen het meekijken.)

## Stap 5 — Testen op je eigen netwerk

Open in je browser: `http://192.168.1.xx:3000`

1. Log in met je `EDITOR_EMAIL` + `EDITOR_PASSWORD`.
2. Klik **New project** → je ziet je Immich-video's → kies er een met **Use**.
3. De voortgangsbalk toont de ffmpeg-transcode; daarna opent het project en
   speelt de video.
4. Via het ⋯-menu → **Share link…** maak je de klantlink.

Werkt dit? Dan is de kern klaar. De klantlink werkt nu alleen nog binnen je
eigen netwerk — stap 6 maakt hem openbaar.

## Stap 6 — Openbaar maken voor klanten (eigen domein + https)

1. **DNS**: maak bij je domeinprovider een A-record aan, bijv.
   `review.nasislike.com` → je thuis-IP (hetzelfde IP als waar
   `immich.nasislike.com` naar wijst).
2. **Poorten doorsturen**: in je router poort **80** en **443** doorsturen
   naar het IP van je NAS. (Draait er al een andere reverse proxy op die
   poorten voor Immich? Voeg Filio dan dáár toe in plaats van Caddy te
   starten, en sla de rest van deze stap over.)
3. In `.env` twee regels aanpassen/toevoegen:

   ```bash
   APP_URL=https://review.nasislike.com
   REVIEW_DOMAIN=review.nasislike.com
   ```

4. Herstarten, nu mét de proxy:

   ```bash
   docker compose --profile proxy up -d --build
   ```

Caddy haalt automatisch een TLS-certificaat op. Na een minuut werkt
`https://review.nasislike.com` — en de share-links die je kopieert gebruiken
vanaf nu dat adres.

## Stap 7 — Aanrader: Immich weer van internet af

De app praat server-to-server met Immich; nu alles op dezelfde NAS draait kan
dat via het interne adres, bijv.:

```bash
IMMICH_URL=http://192.168.1.xx:2283
```

Daarna `docker compose --profile proxy up -d` om het door te voeren, en je kunt
`immich.nasislike.com` weer van internet afhalen (poortforward of DNS weg).
Je fotobibliotheek hoeft niet publiek bereikbaar te zijn — de reviewsite wel.

## Beheer

- **Backup** (alleen de database is onvervangbaar — comments):
  ```bash
  docker compose exec db pg_dump -U filio filio > backup-$(date +%F).sql
  ```
- **Update naar een nieuwe versie**:
  ```bash
  git pull && docker compose --profile proxy up -d --build
  ```
- **Logs bekijken**: `docker compose logs -f web` (of `worker` / `caddy`).
- **Mail-digest aanzetten** (optioneel): vul de `SMTP_*`-regels in `.env` in;
  zonder SMTP verschijnt de gebundelde feedbackmail alleen in de logs.
