'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Brand, { useBranding } from '@/components/Branding';
import { ApiError, api } from '@/lib/api';
import type { Branding } from '@/lib/server/settings';

const HUES = [
  { h: 78, label: 'Amber' },
  { h: 30, label: 'Oranje' },
  { h: 12, label: 'Rood' },
  { h: 330, label: 'Roze' },
  { h: 300, label: 'Paars' },
  { h: 265, label: 'Indigo' },
  { h: 230, label: 'Blauw' },
  { h: 195, label: 'Cyaan' },
  { h: 160, label: 'Groen' },
  { h: 130, label: 'Gras' },
];

const SCALES = [
  { v: 1, label: 'Compact' },
  { v: 1.1, label: 'Normaal' },
  { v: 1.2, label: 'Groot' },
  { v: 1.35, label: 'Extra groot' },
];

const QUIET_STEPS = [2, 5, 10, 30];

interface NotifySettings {
  ntfyUrl: string;
  ntfyTopic: string;
  hasToken: boolean;
  quietMinutes: number;
  maxWaitMinutes: number;
  feedback: boolean;
  transcodeReady: boolean;
  transcodeFailed: boolean;
  envOverride: boolean;
}

function NotificationsCard({
  onError,
  onSaved,
}: {
  onError: (msg: string | null) => void;
  onSaved: (msg: string) => void;
}) {
  const [cfg, setCfg] = useState<NotifySettings | null>(null);
  const [url, setUrl] = useState('');
  const [topic, setTopic] = useState('');
  const [token, setToken] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    api<NotifySettings>('/api/settings/notifications')
      .then((d) => {
        setCfg(d);
        setUrl(d.ntfyUrl);
        setTopic(d.ntfyTopic);
      })
      .catch(() => {});
  }, []);

  async function save(body: Record<string, unknown>, msg = 'Opgeslagen') {
    try {
      setCfg(
        await api<NotifySettings>('/api/settings/notifications', {
          method: 'PATCH',
          body: JSON.stringify(body),
        })
      );
      onSaved(msg);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Opslaan mislukt');
    }
  }

  async function test() {
    setTesting(true);
    onError(null);
    try {
      await api('/api/settings/notifications/test', { method: 'POST' });
      onSaved('Testmelding verstuurd');
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Test mislukt');
    } finally {
      setTesting(false);
    }
  }

  if (!cfg) return null;

  return (
    <section className="settingsCard">
      <h2 className="settingsTitle">Notificaties</h2>
      <p className="settingsHint">
        Meldingen op je telefoon via de ntfy-app. Ze worden gebundeld: je krijgt één
        melding per feedbackronde, niet per reactie.
      </p>

      {cfg.envOverride && (
        <p className="settingsHint" style={{ color: 'var(--amber)' }}>
          Server en onderwerp staan vast in je .env — die kun je hier niet wijzigen.
        </p>
      )}

      <div className="settingsRow">
        <div className="settingsLabel">
          <div className="toggleTitle">ntfy-server</div>
          <div className="toggleSub">Bijv. https://ntfy.sh of je eigen ntfy op de NAS</div>
        </div>
        <input
          className="settingsInput"
          placeholder="https://ntfy.sh"
          value={url}
          disabled={cfg.envOverride}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => url !== cfg.ntfyUrl && save({ ntfyUrl: url }, 'Server opgeslagen')}
        />
      </div>

      <div className="settingsRow">
        <div className="settingsLabel">
          <div className="toggleTitle">Onderwerp (topic)</div>
          <div className="toggleSub">Kies iets dat niemand raadt, bijv. filio-wolf-9f2k</div>
        </div>
        <input
          className="settingsInput"
          placeholder="filio-jouwnaam-1234"
          value={topic}
          disabled={cfg.envOverride}
          onChange={(e) => setTopic(e.target.value)}
          onBlur={() => topic !== cfg.ntfyTopic && save({ ntfyTopic: topic }, 'Onderwerp opgeslagen')}
        />
      </div>

      <div className="settingsRow">
        <div className="settingsLabel">
          <div className="toggleTitle">Toegangstoken</div>
          <div className="toggleSub">
            Alleen nodig bij een beveiligde ntfy-server{cfg.hasToken ? ' · nu ingesteld' : ''}
          </div>
        </div>
        <div className="logoControls">
          <input
            className="settingsInput"
            type="password"
            placeholder={cfg.hasToken ? '••••••••' : 'tk_… of gebruiker:wachtwoord'}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onBlur={() => token && save({ ntfyToken: token }, 'Token opgeslagen').then(() => setToken(''))}
          />
          {cfg.hasToken && (
            <button className="chipBtn" onClick={() => void save({ ntfyToken: '' }, 'Token gewist')}>
              Wissen
            </button>
          )}
        </div>
      </div>

      <div className="settingsRow">
        <div className="settingsLabel">
          <div className="toggleTitle">Bundelen</div>
          <div className="toggleSub">
            Melding als het zo lang stil is · uiterlijk na {cfg.maxWaitMinutes} min
          </div>
        </div>
        <div className="scaleRow">
          {QUIET_STEPS.map((m) => (
            <button
              key={m}
              className={`sortChip ${cfg.quietMinutes === m ? 'active' : ''}`}
              onClick={() => void save({ quietMinutes: m }, 'Bundeling opgeslagen')}
            >
              {m} min
            </button>
          ))}
        </div>
      </div>

      <div className="settingsRow">
        <div className="settingsLabel">
          <div className="toggleTitle">Nieuwe feedback van klanten</div>
          <div className="toggleSub">Comments en reacties, gebundeld per project</div>
        </div>
        <button
          className={`switch ${cfg.feedback ? 'on' : ''}`}
          onClick={() => void save({ feedback: !cfg.feedback })}
        >
          <span className="knob" />
        </button>
      </div>

      <div className="settingsRow">
        <div className="settingsLabel">
          <div className="toggleTitle">Versie klaar om te delen</div>
          <div className="toggleSub">Als de proxy klaar is met verwerken</div>
        </div>
        <button
          className={`switch ${cfg.transcodeReady ? 'on' : ''}`}
          onClick={() => void save({ transcodeReady: !cfg.transcodeReady })}
        >
          <span className="knob" />
        </button>
      </div>

      <div className="settingsRow">
        <div className="settingsLabel">
          <div className="toggleTitle">Verwerking mislukt</div>
          <div className="toggleSub">Zodat je het niet pas ontdekt als de klant belt</div>
        </div>
        <button
          className={`switch ${cfg.transcodeFailed ? 'on' : ''}`}
          onClick={() => void save({ transcodeFailed: !cfg.transcodeFailed })}
        >
          <span className="knob" />
        </button>
      </div>

      <div className="settingsRow" style={{ borderBottom: 'none' }}>
        <div className="settingsLabel">
          <div className="toggleTitle">Testen</div>
          <div className="toggleSub">
            Abonneer je in de ntfy-app op dit onderwerp en stuur een testmelding
          </div>
        </div>
        <button className="chipBtn" disabled={testing} onClick={() => void test()}>
          {testing ? 'Versturen…' : 'Stuur testmelding'}
        </button>
      </div>
    </section>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { branding, setBranding } = useBranding();
  const [name, setName] = useState(branding.studioName);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.1);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setName(branding.studioName), [branding.studioName]);

  useEffect(() => {
    const stored = Number(localStorage.getItem('filio-ui-scale'));
    if (stored) setScale(stored);
    else {
      const w = window.innerWidth;
      setScale(w >= 2400 ? 1.35 : w >= 1900 ? 1.2 : w >= 1500 ? 1.1 : 1);
    }
  }, []);

  function flash(msg: string) {
    setSaved(msg);
    setError(null);
    setTimeout(() => setSaved(null), 1800);
  }

  async function patch(body: Record<string, unknown>, msg: string) {
    try {
      setBranding(await api<Branding>('/api/settings', { method: 'PATCH', body: JSON.stringify(body) }));
      flash(msg);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) router.replace('/login');
      else setError(e instanceof Error ? e.message : 'Opslaan mislukt');
    }
  }

  async function uploadLogo(file: File) {
    const form = new FormData();
    form.append('logo', file);
    try {
      const res = await fetch('/api/settings/logo', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Upload mislukt');
      setBranding(data);
      flash('Logo opgeslagen');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload mislukt');
    }
  }

  async function removeLogo() {
    setBranding(await api<Branding>('/api/settings/logo', { method: 'DELETE' }));
    flash('Logo verwijderd');
  }

  function applyScale(v: number) {
    setScale(v);
    localStorage.setItem('filio-ui-scale', String(v));
    document.documentElement.style.setProperty('--zoom', String(v));
  }

  return (
    <div className="shell">
      <nav className="rail">
        <Link className="railLogo" href="/">
          <Brand size={30} />
        </Link>
        <Link className="railItem" href="/" title="Projecten">▤</Link>
        <div className="railItem" title="Recent">◷</div>
        <div className="railItem active" title="Instellingen">⚙</div>
        <div className="railSpacer" />
      </nav>

      <div className="main">
        <header className="dashHeader">
          <Link className="backLink" href="/">← Projects</Link>
          <span className="dashTitle">Instellingen</span>
          <div className="headRight">
            {saved && <span className="savedFlash">{saved}</span>}
            {error && <span className="errorFlash">{error}</span>}
          </div>
        </header>

        <div className="dashScroll">
          <div className="settingsWrap">
            <section className="settingsCard">
              <h2 className="settingsTitle">Huisstijl</h2>
              <p className="settingsHint">
                Dit ziet je klant op de reviewpagina en op het aanmeldscherm.
              </p>

              <div className="settingsRow">
                <div className="settingsLabel">
                  <div className="toggleTitle">Studionaam</div>
                  <div className="toggleSub">Verschijnt in de titel van het browsertabblad</div>
                </div>
                <input
                  className="settingsInput"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => name.trim() && name !== branding.studioName && patch({ studioName: name }, 'Naam opgeslagen')}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                />
              </div>

              <div className="settingsRow">
                <div className="settingsLabel">
                  <div className="toggleTitle">Logo</div>
                  <div className="toggleSub">PNG, JPG, WEBP of SVG · max 2 MB · vierkant werkt het best</div>
                </div>
                <div className="logoControls">
                  <div className="logoPreview">
                    <Brand size={40} />
                  </div>
                  <button className="chipBtn" onClick={() => fileRef.current?.click()}>
                    {branding.logoUrl ? 'Vervangen' : 'Uploaden'}
                  </button>
                  {branding.logoUrl && (
                    <button className="chipBtn" onClick={() => void removeLogo()}>
                      Verwijderen
                    </button>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadLogo(f);
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>

              <div className="settingsRow">
                <div className="settingsLabel">
                  <div className="toggleTitle">Accentkleur</div>
                  <div className="toggleSub">Knoppen, pins en markers — per project aan te passen</div>
                </div>
                <div className="hueRow">
                  {HUES.map((h) => (
                    <button
                      key={h.h}
                      title={h.label}
                      className={`hueDot ${branding.accentHue === h.h ? 'active' : ''}`}
                      style={{ ['--accent-h' as string]: h.h }}
                      onClick={() => void patch({ accentHue: h.h }, 'Kleur opgeslagen')}
                    />
                  ))}
                </div>
              </div>
            </section>

            <section className="settingsCard">
              <h2 className="settingsTitle">Weergave</h2>
              <p className="settingsHint">
                Alleen voor deze browser — handig op een groot of juist klein scherm.
              </p>
              <div className="settingsRow" style={{ borderBottom: 'none' }}>
                <div className="settingsLabel">
                  <div className="toggleTitle">Interface-grootte</div>
                  <div className="toggleSub">Schaalt alles mee, inclusief tekst en knoppen</div>
                </div>
                <div className="scaleRow">
                  {SCALES.map((s) => (
                    <button
                      key={s.v}
                      className={`sortChip ${Math.abs(scale - s.v) < 0.01 ? 'active' : ''}`}
                      onClick={() => applyScale(s.v)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <NotificationsCard onError={setError} onSaved={flash} />

            <section className="settingsCard">
              <h2 className="settingsTitle">Account</h2>
              <div className="settingsRow" style={{ borderBottom: 'none' }}>
                <div className="settingsLabel">
                  <div className="toggleTitle">Uitloggen</div>
                  <div className="toggleSub">Je klanten houden gewoon toegang via hun link</div>
                </div>
                <button
                  className="chipBtn"
                  onClick={async () => {
                    await api('/api/login', { method: 'DELETE' });
                    router.replace('/login');
                  }}
                >
                  Uitloggen
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
