'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Avatar from './Avatar';
import Logo from './Logo';
import { IMMICH_FILES, ImmichFile, Project } from '@/lib/data';
import { setState, useAppState } from '@/lib/store';

type PickerMode = { kind: 'version'; project: Project } | { kind: 'project' };
type Proc = { name: string; pct: number; mode: PickerMode };

export default function Dashboard() {
  const app = useAppState();
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [picker, setPicker] = useState<PickerMode | null>(null);
  const [proc, setProc] = useState<Proc | null>(null);
  const [shareFor, setShareFor] = useState<Project | null>(null);

  const projects = app.projects.filter(
    (p) => !p.archived && p.title.toLowerCase().includes(query.toLowerCase())
  );

  const openCount = Object.values(app.comments)
    .flat()
    .filter((c) => !c.resolved && !c.deleted).length;

  // Close the card menu on any outside click
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuOpen]);

  // Simulated ffmpeg progress (real app: transcode worker + polling)
  useEffect(() => {
    if (!proc) return;
    if (proc.pct >= 100) {
      const t = setTimeout(() => {
        finishProc(proc);
        setProc(null);
      }, 350);
      return () => clearTimeout(t);
    }
    const t = setTimeout(
      () => setProc((p) => (p ? { ...p, pct: Math.min(100, p.pct + 4 + Math.round(Math.random() * 5)) } : p)),
      120
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proc]);

  function finishProc(p: Proc) {
    if (p.mode.kind === 'version') {
      const id = p.mode.project.id;
      setState((s) => ({
        ...s,
        projects: s.projects.map((pr) =>
          pr.id === id ? { ...pr, version: pr.version + 1, agoLabel: 'NOW' } : pr
        ),
      }));
    } else {
      const title = p.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ');
      const id = `p-${Date.now()}`;
      setState((s) => ({
        ...s,
        projects: [
          ...s.projects,
          {
            id,
            title,
            version: 1,
            reviewers: [],
            agoLabel: 'NOW',
            duration: '—',
            hasCut: false,
            archived: false,
            shareToken: `${id.slice(-4)}-new`,
          },
        ],
        comments: { ...s.comments, [id]: [] },
      }));
    }
  }

  function pick(file: ImmichFile) {
    if (!picker) return;
    setProc({ name: file.name, pct: 0, mode: picker });
    setPicker(null);
  }

  function commitRename(id: string) {
    const title = renameDraft.trim();
    if (title) {
      setState((s) => ({
        ...s,
        projects: s.projects.map((p) => (p.id === id ? { ...p, title } : p)),
      }));
    }
    setRenaming(null);
  }

  function copyLink(p: Project) {
    navigator.clipboard?.writeText(`https://review.wolf.nl/r/${p.shareToken}`).catch(() => {});
  }

  return (
    <div className="shell">
      <nav className="rail">
        <div className="railLogo">
          <Logo size={30} />
        </div>
        <div className="railItem active" title="Projects">▤</div>
        <div className="railItem" title="Recent">◷</div>
        <div className="railItem" title="Settings">⚙</div>
        <div className="railSpacer" />
        <Avatar name="Marloes B" size={30} />
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
              onClick={() => router.push(`/review/${app.projects[0].id}?as=client`)}
            >
              Preview as client
            </button>
            <button className="primaryBtn" onClick={() => setPicker({ kind: 'project' })}>
              New project
            </button>
          </div>
        </header>

        {proc && (
          <div className="procBar">
            <div className="procHead">
              <span className="procName">{proc.name}</span>
              <span className="procCaption">FFMPEG · 1080P PROXY · {proc.pct}%</span>
            </div>
            <div className="procTrack">
              <div className="procFill" style={{ width: `${proc.pct}%` }} />
            </div>
          </div>
        )}

        <div className="dashScroll">
          <div className="stats">
            <div className="statCard">
              <div className="statNum">{projects.length + 5}</div>
              <div className="statLabel">Active projects</div>
            </div>
            <div className="statCard">
              <div className="statNum">{openCount}</div>
              <div className="statLabel">Open comments</div>
            </div>
            <div className="statCard">
              <div className="statNum">{app.awaitingReply}</div>
              <div className="statLabel">Awaiting your reply</div>
            </div>
            <div className="statCard">
              <div className="statNum">{app.nasGb} GB</div>
              <div className="statLabel">On the NAS</div>
            </div>
          </div>

          <div className="grid">
            {projects.map((p) => {
              const comments = app.comments[p.id] ?? [];
              const unresolved = comments.filter((c) => !c.resolved && !c.deleted).length;
              const meta = [
                `V${p.version}`,
                p.reviewers.length ? `${p.reviewers.length} REVIEWERS` : null,
                p.agoLabel || null,
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <div
                  key={p.id}
                  className="card"
                  onClick={() => router.push(`/review/${p.id}`)}
                >
                  <div className="thumb">
                    <span className="thumbCaption">THUMBNAIL</span>
                    {unresolved > 0 && <span className="openBadge">{unresolved} OPEN</span>}
                    <span className="durChip">{p.duration}</span>
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
                          if (e.key === 'Enter') commitRename(p.id);
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
                        {p.reviewers.map((r) => (
                          <Avatar key={r} name={r} />
                        ))}
                      </div>
                      {unresolved > 0 && (
                        <span className="unresolvedLabel">{unresolved} unresolved</span>
                      )}
                      <button
                        className={`dotsBtn ${menuOpen === p.id ? 'open' : ''}`}
                        style={{ marginLeft: unresolved > 0 ? 8 : 'auto' }}
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
                          copyLink(p);
                          setMenuOpen(null);
                        }}
                      >
                        <span className="menuIcon">⧉</span> Copy review link
                      </button>
                      <div className="menuSep" />
                      <button
                        className="menuItem destructive"
                        onClick={() => {
                          setMenuOpen(null);
                          setState((s) => ({
                            ...s,
                            projects: s.projects.map((pr) =>
                              pr.id === p.id ? { ...pr, archived: true } : pr
                            ),
                          }));
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
            Prototype: alleen het eerste project heeft een cut geladen.
          </div>
        </div>
      </div>

      {picker && (
        <div className="backdrop" onClick={() => setPicker(null)}>
          <div className="modal picker" onClick={(e) => e.stopPropagation()}>
            <div className="modalHead">
              <div>
                <div className="modalTitle">
                  {picker.kind === 'version' ? 'Add version from Immich' : 'New project from Immich'}
                </div>
                <div className="modalSub">
                  {picker.kind === 'version'
                    ? `${picker.project.title} · wordt v${picker.project.version + 1}`
                    : 'Kies een video — dit wordt v1 van een nieuw project'}
                </div>
              </div>
              <button className="modalClose" onClick={() => setPicker(null)}>✕</button>
            </div>
            <div className="pickerRows">
              {IMMICH_FILES.map((f) => (
                <div className="pickerRow" key={f.id}>
                  <div className="pickerThumb" />
                  <div className="pickerText">
                    <div className="pickerName">{f.name}</div>
                    <div className="pickerMeta">{f.meta}</div>
                  </div>
                  <button className="useBtn" onClick={() => pick(f)}>Use</button>
                </div>
              ))}
            </div>
            <div className="pickerFoot">SERVER-TO-SERVER · IMMICH API KEY BLIJFT OP DE NAS</div>
          </div>
        </div>
      )}

      {shareFor && <ShareModal project={shareFor} onClose={() => setShareFor(null)} />}
    </div>
  );
}

const EXPIRY_STEPS = ['7 days', '30 days', '90 days', 'Never'] as const;

function ShareModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const [askName, setAskName] = useState(true);
  const [pw, setPw] = useState(false);
  const [dl, setDl] = useState(true);
  const [expiry, setExpiry] = useState(1); // 30 days
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const link = `review.wolf.nl/r/${project.shareToken}`;

  function copy() {
    navigator.clipboard?.writeText(`https://${link}`).catch(() => {});
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1600);
  }

  const expiryLabel = EXPIRY_STEPS[expiry];
  const expirySub =
    expiryLabel === 'Never' ? 'Verloopt nooit' : `${expiryLabel.replace(' days', ' dagen')} na delen`;

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modalHead">
          <div>
            <div className="modalTitle">Share for review</div>
            <div className="modalSub">{project.title} · v{project.version}</div>
          </div>
          <button className="modalClose" onClick={onClose}>✕</button>
        </div>

        <div className="linkRow">
          <div className="linkField">{link}</div>
          <button className="copyBtn" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
        </div>

        <div className="toggleRow">
          <div className="toggleText">
            <div className="toggleTitle">Ask for a name</div>
            <div className="toggleSub">No account, just who&apos;s talking</div>
          </div>
          <button className={`switch ${askName ? 'on' : ''}`} onClick={() => setAskName(!askName)}>
            <span className="knob" />
          </button>
        </div>
        <div className="toggleRow">
          <div className="toggleText">
            <div className="toggleTitle">Password</div>
            <div className="toggleSub">{pw ? 'On' : 'Off'}</div>
          </div>
          <button className={`switch ${pw ? 'on' : ''}`} onClick={() => setPw(!pw)}>
            <span className="knob" />
          </button>
        </div>
        <div className="toggleRow">
          <div className="toggleText">
            <div className="toggleTitle">Allow download</div>
            <div className="toggleSub">Reviewer picks proxy or original</div>
          </div>
          <button className={`switch ${dl ? 'on' : ''}`} onClick={() => setDl(!dl)}>
            <span className="knob" />
          </button>
        </div>
        <div className="toggleRow" style={{ borderBottom: 'none' }}>
          <div className="toggleText">
            <div className="toggleTitle">Link expires</div>
            <div className="toggleSub">{expirySub}</div>
          </div>
          <button
            className="expiryChip"
            onClick={() => setExpiry((expiry + 1) % EXPIRY_STEPS.length)}
          >
            {expiryLabel} ▾
          </button>
        </div>

        {dl && (
          <div className="dlChips">
            <span className="dlChip">1080p proxy · 240 MB</span>
            <span className="dlChip">Original · ProRes 12 GB</span>
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
