'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Avatar from './Avatar';
import Link from 'next/link';
import Brand from './Branding';
import { ApiError, api } from '@/lib/api';
import type { DashboardPayload, ImmichVideoRow, ProjectSummary, SharePayload } from '@/lib/types';

const MENU_HUES: (number | null)[] = [null, 78, 30, 12, 330, 265, 230, 195, 160];

type PickerMode = { kind: 'version'; project: ProjectSummary } | { kind: 'project' };

export default function Dashboard() {
  const router = useRouter();
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [picker, setPicker] = useState<PickerMode | null>(null);
  const [shareFor, setShareFor] = useState<ProjectSummary | null>(null);

  const load = useCallback(async () => {
    try {
      setPayload(await api<DashboardPayload>('/api/projects'));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) router.replace('/login');
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll zolang er een transcode loopt
  const transcoding = payload?.projects.find(
    (p) => p.status === 'queued' || p.status === 'transcoding'
  );
  useEffect(() => {
    if (!transcoding) return;
    const t = setTimeout(() => void load(), 1200);
    return () => clearTimeout(t);
  }, [transcoding, payload, load]);

  useEffect(() => {
    if (menuOpen == null) return;
    const close = () => setMenuOpen(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuOpen]);

  async function pick(file: ImmichVideoRow) {
    if (!picker) return;
    const mode = picker;
    setPicker(null);
    let projectId: number;
    if (mode.kind === 'version') {
      projectId = mode.project.id;
    } else {
      const title = file.filename.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ');
      const created = await api<{ id: number }>('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ title }),
      });
      projectId = created.id;
    }
    await api(`/api/projects/${projectId}/versions`, {
      method: 'POST',
      body: JSON.stringify({ assetId: file.id, filename: file.filename, sizeBytes: file.sizeBytes }),
    });
    void load();
  }

  async function commitRename(id: number) {
    const title = renameDraft.trim();
    setRenaming(null);
    if (!title) return;
    await api(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) });
    void load();
  }

  async function archive(id: number) {
    await api(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify({ archived: true }) });
    void load();
  }

  async function copyLink(p: ProjectSummary) {
    // GET /share maakt de link aan als die er nog niet is
    const share = await api<SharePayload>(`/api/projects/${p.id}/share`);
    await navigator.clipboard?.writeText(share.url).catch(() => {});
    void load();
  }

  const projects = (payload?.projects ?? []).filter((p) =>
    p.title.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="shell">
      <nav className="rail">
        <div className="railLogo">
          <Brand size={30} />
        </div>
        <div className="railItem active" title="Projecten">▤</div>
        <div className="railItem" title="Recent">◷</div>
        <Link className="railItem" href="/settings" title="Instellingen">⚙</Link>
        <div className="railSpacer" />
        <Avatar name={payload?.viewer.name ?? '·'} size={30} />
      </nav>

      <div className="main">
        <header className="dashHeader">
          <span className="dashTitle">Projects</span>
          <input
            className="search"
            placeholder="Search projects…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="headRight">
            <button
              className="chipBtn"
              onClick={async () => {
                const first = payload?.projects[0];
                if (!first) return;
                const share = await api<SharePayload>(`/api/projects/${first.id}/share`);
                router.push(`${new URL(share.url, location.href).pathname}?preview=1`);
              }}
            >
              Preview as client
            </button>
            <button className="primaryBtn" onClick={() => setPicker({ kind: 'project' })}>
              New project
            </button>
          </div>
        </header>

        {transcoding && (
          <div className="procBar">
            <div className="procHead">
              <span className="procName">
                {transcoding.transcodingName ?? transcoding.title}
              </span>
              <span className="procCaption">FFMPEG · 1080P PROXY · {transcoding.progress}%</span>
            </div>
            <div className="procTrack">
              <div className="procFill" style={{ width: `${transcoding.progress}%` }} />
            </div>
          </div>
        )}

        <div className="dashScroll">
          <div className="stats">
            <div className="statCard">
              <div className="statNum">{payload?.stats.activeProjects ?? '—'}</div>
              <div className="statLabel">Active projects</div>
            </div>
            <div className="statCard">
              <div className="statNum">{payload?.stats.openComments ?? '—'}</div>
              <div className="statLabel">Open comments</div>
            </div>
            <div className="statCard">
              <div className="statNum">{payload?.stats.awaitingReply ?? '—'}</div>
              <div className="statLabel">Awaiting your reply</div>
            </div>
            <div className="statCard">
              <div className="statNum">{payload?.stats.nasGb ?? '—'} GB</div>
              <div className="statLabel">On the NAS</div>
            </div>
          </div>

          <div className="grid">
            {projects.map((p) => {
              const meta = [
                p.latestVersion ? `V${p.latestVersion}` : 'NOG GEEN CUT',
                p.reviewers.length
                  ? `${p.reviewers.length} REVIEWER${p.reviewers.length === 1 ? '' : 'S'}`
                  : p.unresolved === 0 && p.latestVersion
                    ? 'ALL RESOLVED'
                    : null,
                p.updatedLabel,
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <div
                  key={p.id}
                  className="card"
                  style={p.accentHue != null ? ({ ['--accent-h']: p.accentHue } as React.CSSProperties) : undefined}
                  onClick={() => router.push(`/review/${p.id}`)}
                >
                  <div
                    className="thumb"
                    style={
                      p.posterUrl
                        ? {
                            backgroundImage: `url(${p.posterUrl})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                          }
                        : undefined
                    }
                  >
                    {!p.posterUrl && (
                      <span className="thumbCaption">
                        {p.status === 'transcoding' || p.status === 'queued'
                          ? 'TRANSCODING…'
                          : p.status === 'failed'
                            ? 'TRANSCODE FAILED'
                            : 'THUMBNAIL'}
                      </span>
                    )}
                    {p.unresolved > 0 && <span className="openBadge">{p.unresolved} OPEN</span>}
                    {p.durationLabel && <span className="durChip">{p.durationLabel}</span>}
                  </div>
                  <div className="cardBody">
                    {renaming === p.id ? (
                      <input
                        className="renameInput"
                        autoFocus
                        value={renameDraft}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void commitRename(p.id);
                          if (e.key === 'Escape') setRenaming(null);
                        }}
                        onBlur={() => setRenaming(null)}
                      />
                    ) : (
                      <div className="cardTitle">{p.title}</div>
                    )}
                    <div className="cardMeta">{meta}</div>
                    <div className="cardFooter">
                      <div className="avatars">
                        {p.reviewers.slice(0, 4).map((r) => (
                          <Avatar key={r} name={r} />
                        ))}
                      </div>
                      {p.unresolved > 0 && (
                        <span className="unresolvedLabel">{p.unresolved} unresolved</span>
                      )}
                      <button
                        className={`dotsBtn ${menuOpen === p.id ? 'open' : ''}`}
                        style={{ marginLeft: p.unresolved > 0 ? 8 : 'auto' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpen(menuOpen === p.id ? null : p.id);
                        }}
                      >
                        ⋯
                      </button>
                    </div>
                  </div>

                  {menuOpen === p.id && (
                    <div className="menu" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="menuItem"
                        onClick={() => {
                          setMenuOpen(null);
                          setPicker({ kind: 'version', project: p });
                        }}
                      >
                        <span className="menuIcon">+</span> Add new version
                      </button>
                      <button
                        className="menuItem"
                        onClick={() => {
                          setMenuOpen(null);
                          setRenaming(p.id);
                          setRenameDraft(p.title);
                        }}
                      >
                        <span className="menuIcon">✎</span> Rename project
                      </button>
                      <button
                        className="menuItem"
                        onClick={() => {
                          setMenuOpen(null);
                          setShareFor(p);
                        }}
                      >
                        <span className="menuIcon">↗</span> Share link…
                      </button>
                      <button
                        className="menuItem"
                        onClick={() => {
                          void copyLink(p);
                          setMenuOpen(null);
                        }}
                      >
                        <span className="menuIcon">⧉</span> Copy review link
                      </button>
                      <div className="menuSep" />
                      <div className="menuHues">
                        <span className="menuHuesLabel">Projectkleur</span>
                        <div className="menuHuesRow">
                          {MENU_HUES.map((h) => (
                            <button
                              key={h ?? 'auto'}
                              className={`menuHue ${(p.accentHue ?? null) === h ? 'active' : ''} ${h === null ? 'auto' : ''}`}
                              style={h === null ? undefined : ({ ['--accent-h']: h } as React.CSSProperties)}
                              title={h === null ? 'Studiokleur' : `Hue ${h}`}
                              onClick={async () => {
                                await api(`/api/projects/${p.id}`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ accentHue: h }),
                                });
                                void load();
                              }}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="menuSep" />
                      <button
                        className="menuItem destructive"
                        onClick={() => {
                          setMenuOpen(null);
                          void archive(p.id);
                        }}
                      >
                        <span className="menuIcon">⌫</span> Archive project
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            <button className="newTile" onClick={() => setPicker({ kind: 'project' })}>
              <div className="newTilePlus">+</div>
              <div className="newTileLabel">New project from Immich</div>
              <div className="newTileSub">OR DROP A FILE</div>
            </button>
          </div>

          <div className="footnote">
            Zonder IMMICH_URL draait de picker in mock-modus en genereert de worker testclips.
          </div>
        </div>
      </div>

      {picker && <ImmichPicker mode={picker} onPick={pick} onClose={() => setPicker(null)} />}
      {shareFor && <ShareModal project={shareFor} onClose={() => setShareFor(null)} />}
    </div>
  );
}

function ImmichPicker({
  mode,
  onPick,
  onClose,
}: {
  mode: PickerMode;
  onPick: (f: ImmichVideoRow) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<ImmichVideoRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  // Zoeken op bestandsnaam in Immich, met een korte debounce
  useEffect(() => {
    const t = setTimeout(() => {
      api<{ videos: ImmichVideoRow[] }>(`/api/immich/videos?q=${encodeURIComponent(q)}`)
        .then((d) => setRows(d.videos))
        .catch((e) => setError(String(e.message)));
    }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal picker" onClick={(e) => e.stopPropagation()}>
        <div className="modalHead">
          <div>
            <div className="modalTitle">
              {mode.kind === 'version' ? 'Add version from Immich' : 'New project from Immich'}
            </div>
            <div className="modalSub">
              {mode.kind === 'version'
                ? `${mode.project.title} · wordt v${mode.project.latestVersion + 1}`
                : 'Kies een video — dit wordt v1 van een nieuw project'}
            </div>
          </div>
          <button className="modalClose" onClick={onClose}>✕</button>
        </div>
        <input
          className="search pickerSearch"
          autoFocus
          placeholder="Zoek op bestandsnaam…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="pickerRows">
          {error && <div style={{ color: 'var(--destructive)', fontSize: 12 }}>{error}</div>}
          {rows === null && !error && (
            <div style={{ color: 'var(--text-meta)', fontSize: 12 }}>Immich doorzoeken…</div>
          )}
          {rows?.length === 0 && (
            <div style={{ color: 'var(--text-meta)', fontSize: 12, padding: '8px 2px' }}>
              Geen video&apos;s gevonden{q ? ` voor “${q}”` : ''}.
            </div>
          )}
          {rows?.map((f) => (
            <div className="pickerRow" key={f.id}>
              <div className="pickerThumb" />
              <div className="pickerText">
                <div className="pickerName">{f.filename}</div>
                <div className="pickerMeta">{f.meta.toUpperCase()}</div>
              </div>
              <button className="useBtn" onClick={() => onPick(f)}>Use</button>
            </div>
          ))}
        </div>
        <div className="pickerFoot">SERVER-TO-SERVER · IMMICH API KEY BLIJFT OP DE NAS</div>
      </div>
    </div>
  );
}

const EXPIRY_STEPS: (number | null)[] = [7, 30, 90, null];

function ShareModal({ project, onClose }: { project: ProjectSummary; onClose: () => void }) {
  const [share, setShare] = useState<SharePayload | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api<SharePayload>(`/api/projects/${project.id}/share`).then(setShare).catch(() => {});
  }, [project.id]);

  async function update(patch: Record<string, unknown>) {
    setShare(
      await api<SharePayload>(`/api/projects/${project.id}/share`, {
        method: 'POST',
        body: JSON.stringify(patch),
      })
    );
  }

  function copy() {
    if (!share) return;
    navigator.clipboard?.writeText(share.url).catch(() => {});
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1600);
  }

  const expiryLabel = share?.expiresDays == null ? 'Never' : `${share.expiresDays} days`;

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modalHead">
          <div>
            <div className="modalTitle">Share for review</div>
            <div className="modalSub">
              {project.title}{project.latestVersion ? ` · v${project.latestVersion}` : ''}
            </div>
          </div>
          <button className="modalClose" onClick={onClose}>✕</button>
        </div>

        <div className="linkRow">
          <div className="linkField">{share ? share.url.replace(/^https?:\/\//, '') : '…'}</div>
          <button className="copyBtn" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        </div>

        <div className="toggleRow">
          <div className="toggleText">
            <div className="toggleTitle">Ask for a name</div>
            <div className="toggleSub">No account, just who&apos;s talking</div>
          </div>
          <button
            className={`switch ${share?.askName ? 'on' : ''}`}
            onClick={() => share && update({ askName: !share.askName })}
          >
            <span className="knob" />
          </button>
        </div>
        <div className="toggleRow">
          <div className="toggleText">
            <div className="toggleTitle">Password</div>
            <div className="toggleSub">{share?.hasPassword ? 'On' : 'Off'}</div>
          </div>
          <button
            className={`switch ${share?.hasPassword ? 'on' : ''}`}
            onClick={() => {
              if (!share) return;
              if (share.hasPassword) void update({ password: null });
              else {
                const pw = prompt('Wachtwoord voor deze link:');
                if (pw) void update({ password: pw });
              }
            }}
          >
            <span className="knob" />
          </button>
        </div>
        <div className="toggleRow">
          <div className="toggleText">
            <div className="toggleTitle">Allow download</div>
            <div className="toggleSub">Reviewer picks proxy or original</div>
          </div>
          <button
            className={`switch ${share?.allowDownload ? 'on' : ''}`}
            onClick={() => share && update({ allowDownload: !share.allowDownload })}
          >
            <span className="knob" />
          </button>
        </div>
        <div className="toggleRow" style={{ borderBottom: 'none' }}>
          <div className="toggleText">
            <div className="toggleTitle">Link expires</div>
            <div className="toggleSub">
              {share?.expiresDays == null ? 'Verloopt nooit' : `${share.expiresDays} dagen na delen`}
            </div>
          </div>
          <button
            className="expiryChip"
            onClick={() => {
              if (!share) return;
              const i = EXPIRY_STEPS.indexOf(share.expiresDays == null ? null : share.expiresDays);
              const nearest = i >= 0 ? i : EXPIRY_STEPS.findIndex((s) => s != null && s >= (share.expiresDays ?? 0));
              void update({ expiresDays: EXPIRY_STEPS[(Math.max(0, nearest) + 1) % EXPIRY_STEPS.length] });
            }}
          >
            {expiryLabel} ▾
          </button>
        </div>

        {share?.allowDownload && (
          <div className="dlChips">
            <span className="dlChip">1080p proxy{share.proxyLabel ? ` · ${share.proxyLabel}` : ''}</span>
            <span className="dlChip">Original{share.originalLabel ? ` · ${share.originalLabel}` : ''}</span>
          </div>
        )}

        <div className="noteBox">
          <span style={{ color: 'rgba(255,255,255,.3)' }}>●</span>
          <span>Streaming from Immich · proxy 1080p, original stays on the NAS.</span>
        </div>
      </div>
    </div>
  );
}
