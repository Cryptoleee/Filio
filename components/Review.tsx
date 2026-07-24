'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Avatar from './Avatar';
import Logo from './Logo';
import { Comment, FPS, Stroke, TOTAL_FRAMES, timecode } from '@/lib/data';
import { setState, useAppState } from '@/lib/store';

type Sort = 'timecode' | 'newest' | 'oldest';

const STROKE_WINDOW = 40; // frames around a comment where its pin/strokes render

export default function Review({ projectId, guest }: { projectId: string; guest: boolean }) {
  const app = useAppState();
  const router = useRouter();
  const project = app.projects.find((p) => p.id === projectId);

  // guest identity
  const [name, setName] = useState('');
  const [nameDraft, setNameDraft] = useState('');

  // player
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);

  // versions
  const maxVersion = project?.version ?? 1;
  const [version, setVersion] = useState(maxVersion);
  useEffect(() => setVersion(maxVersion), [maxVersion]);

  // composer
  const [draft, setDraft] = useState('');
  const [pin, setPin] = useState<{ x: number; y: number } | null>(null);
  const [draftStrokes, setDraftStrokes] = useState<Stroke[]>([]);
  const [drawMode, setDrawMode] = useState(false);
  const [liveStroke, setLiveStroke] = useState<Stroke | null>(null);

  // rail
  const [sort, setSort] = useState<Sort>('timecode');
  const [openOnly, setOpenOnly] = useState(false);
  const [resolvedCollapsed, setResolvedCollapsed] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [replyDraft, setReplyDraft] = useState('');

  // misc ui
  const [dlOpen, setDlOpen] = useState(false);
  const [hoverPin, setHoverPin] = useState<number | null>(null);
  const [dragging, setDragging] = useState<null | { kind: 'draft' } | { kind: 'comment'; id: number }>(null);

  const boxRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const movedRef = useRef(false);
  const drawingRef = useRef(false);

  const me = guest ? name || 'Guest' : 'You';

  const updateComment = useCallback(
    (id: number, fn: (c: Comment) => Comment) => {
      setState((s) => ({
        ...s,
        comments: {
          ...s.comments,
          [projectId]: (s.comments[projectId] ?? []).map((c) => (c.id === id ? fn(c) : c)),
        },
      }));
    },
    [projectId]
  );

  // ---- playback: rAF loop over integer frames ----
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const frameMs = 1000 / FPS;
    const tick = (t: number) => {
      acc += t - last;
      last = t;
      const adv = Math.floor(acc / frameMs);
      if (adv > 0) {
        acc -= adv * frameMs;
        setFrame((f) => {
          let nf = f + adv;
          if (nf >= TOTAL_FRAMES) {
            if (loop) return nf % TOTAL_FRAMES;
            setPlaying(false);
            return TOTAL_FRAMES - 1;
          }
          return nf;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, loop]);

  // ---- keyboard ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return;
      if (e.key === ' ') {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setPlaying(false);
        setFrame((f) => Math.max(0, f - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setPlaying(false);
        setFrame((f) => Math.min(TOTAL_FRAMES - 1, f + 1));
      } else if (e.key.toLowerCase() === 'c') {
        e.preventDefault();
        setPlaying(false);
        taRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- video-box coordinate helpers ----
  const fracFromEvent = (e: { clientX: number; clientY: number }) => {
    const rect = boxRef.current!.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    return { x, y };
  };

  // ---- pin dragging + drawing (window listeners while active) ----
  useEffect(() => {
    if (!dragging && !drawingRef.current) return;
    const onMove = (e: MouseEvent) => {
      if (dragging) {
        movedRef.current = true;
        const f = fracFromEvent(e);
        if (dragging.kind === 'draft') setPin(f);
        else updateComment(dragging.id, (c) => ({ ...c, pin: f }));
      }
    };
    const onUp = () => setDragging(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, updateComment]);

  const onBoxMouseDown = (e: React.MouseEvent) => {
    if (!drawMode) return;
    e.preventDefault();
    drawingRef.current = true;
    const f = fracFromEvent(e);
    setLiveStroke([[f.x * 100, f.y * 100]]);
    const onMove = (ev: MouseEvent) => {
      const p = fracFromEvent(ev);
      setLiveStroke((s) => (s ? [...s, [p.x * 100, p.y * 100]] : s));
    };
    const onUp = () => {
      drawingRef.current = false;
      setLiveStroke((s) => {
        if (s && s.length > 1) setDraftStrokes((d) => [...d, s]);
        return null;
      });
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const onBoxClick = (e: React.MouseEvent) => {
    if (movedRef.current) {
      // a drag just ended — its click must not place a stray pin
      movedRef.current = false;
      return;
    }
    if (drawMode) return;
    setPlaying(false);
    setPin(fracFromEvent(e));
  };

  // ---- comments in scope of the selected version ----
  const all = app.comments[projectId] ?? [];
  const scoped = useMemo(
    () =>
      all.filter(
        (c) => c.version === version || (c.version < version && !c.resolved && !c.deleted)
      ),
    [all, version]
  );
  const sortFn = (a: Comment, b: Comment) =>
    sort === 'timecode' ? a.frame - b.frame : sort === 'newest' ? b.id - a.id : a.id - b.id;
  const openList = scoped.filter((c) => !c.resolved).sort(sortFn);
  const resolvedList = scoped.filter((c) => c.resolved).sort(sortFn);
  const unresolvedCount = scoped.filter((c) => !c.resolved && !c.deleted).length;

  const byTimecode = [...scoped].sort((a, b) => a.frame - b.frame);
  const pinNumber = (c: Comment) => byTimecode.indexOf(c) + 1;

  const nearPins = scoped.filter(
    (c) => c.pin && !c.deleted && Math.abs(c.frame - frame) <= STROKE_WINDOW
  );
  const selectedComment = scoped.find((c) => c.id === selected) ?? null;
  const visibleStrokes =
    selectedComment &&
    !selectedComment.deleted &&
    Math.abs(selectedComment.frame - frame) <= STROKE_WINDOW
      ? selectedComment.strokes
      : [];

  // ---- actions ----
  const selectComment = (c: Comment) => {
    setSelected(c.id);
    setReplyDraft('');
    setPlaying(false);
    setFrame(c.frame);
  };

  const post = () => {
    if (!draft.trim()) return;
    setPlaying(false);
    const id = Math.max(0, ...all.map((c) => c.id)) + 1;
    const comment: Comment = {
      id,
      version,
      name: me,
      frame,
      body: draft.trim(),
      pin,
      strokes: draftStrokes,
      likes: 0,
      liked: false,
      resolved: false,
      deleted: false,
      mine: true,
      ago: 'nu',
      replies: [],
    };
    setState((s) => ({
      ...s,
      comments: { ...s.comments, [projectId]: [...(s.comments[projectId] ?? []), comment] },
    }));
    setDraft('');
    setPin(null);
    setDraftStrokes([]);
    setDrawMode(false);
    setLiveStroke(null);
    setSelected(id);
  };

  const postReply = (c: Comment) => {
    if (!replyDraft.trim()) return;
    const body = replyDraft.trim();
    updateComment(c.id, (cc) => ({
      ...cc,
      replies: [
        ...cc.replies,
        { id: cc.replies.length + 1, name: me, ago: 'nu', body, mine: true },
      ],
    }));
    setReplyDraft('');
  };

  const seekFromTrack = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const f = Math.round(((e.clientX - rect.left) / rect.width) * TOTAL_FRAMES);
    setFrame(Math.min(TOTAL_FRAMES - 1, Math.max(0, f)));
    setPlaying(false);
  };

  if (!project) {
    return (
      <div className="shell" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-2)', fontSize: 13 }}>
          Project niet gevonden. <Link href="/" style={{ color: 'var(--amber)' }}>← Terug naar projects</Link>
        </div>
      </div>
    );
  }

  const gateOpen = guest && !name;
  const shot = String(Math.floor(frame / Math.ceil(TOTAL_FRAMES / 8)) + 1).padStart(2, '0');

  const commentRow = (c: Comment) => {
    const isSelected = selected === c.id;
    return (
      <div
        key={c.id}
        className={`commentRow ${isSelected ? 'selected' : ''} ${c.resolved ? 'resolvedRow' : ''}`}
        onClick={() => selectComment(c)}
      >
        <div className="cRowHead">
          <Avatar name={c.name} />
          <span className="cName">{c.name}</span>
          <span className="cTc">{timecode(c.frame)}</span>
          {c.version < version && <span className="vBadge">V{c.version}</span>}
          <span className="cAgo">{c.ago}</span>
        </div>
        <div className={`cBody ${c.deleted ? 'deleted' : ''}`}>
          {c.deleted ? 'Comment verwijderd' : c.body}
        </div>
        {!c.deleted && c.pin && (
          <div className="pinnedCaption">
            <span className="dot">◉</span> PINNED ON FRAME
          </div>
        )}
        <div className="cActions" onClick={(e) => e.stopPropagation()}>
          {!c.deleted && (
            <button
              className={`cAct ${c.liked ? 'liked' : ''}`}
              onClick={() =>
                updateComment(c.id, (cc) => ({
                  ...cc,
                  liked: !cc.liked,
                  likes: cc.likes + (cc.liked ? -1 : 1),
                }))
              }
            >
              👍{c.likes > 0 ? ` ${c.likes}` : ''}
            </button>
          )}
          <button className="cAct" onClick={() => selectComment(c)}>
            Jump to frame
          </button>
          {c.mine && !c.deleted && (
            <button
              className="cAct"
              onClick={() => updateComment(c.id, (cc) => ({ ...cc, deleted: true }))}
            >
              Delete
            </button>
          )}
          {!c.deleted && (
            <button
              className={`cAct resolveAct ${c.resolved ? 'resolved' : ''}`}
              onClick={() =>
                updateComment(c.id, (cc) => ({ ...cc, resolved: !cc.resolved }))
              }
            >
              {c.resolved ? '✓ Resolved' : '○ Resolve'}
            </button>
          )}
        </div>
        {c.replies.map((r) => (
          <div className="replyCard" key={r.id}>
            <div className="replyHead">
              <Avatar name={r.name} />
              <span className="replyName">{r.name}</span>
              <span className="replyAgo">{r.ago}</span>
            </div>
            <div className="replyBody">{r.body}</div>
          </div>
        ))}
        {isSelected && !c.deleted && (
          <div className="replyRow" onClick={(e) => e.stopPropagation()}>
            <input
              className="replyField"
              placeholder="Reply…"
              value={replyDraft}
              onChange={(e) => setReplyDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') postReply(c);
              }}
            />
            <button className="sendBtn" onClick={() => postReply(c)}>↑</button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="main" style={{ height: '100vh' }}>
      <header className="rvHeader">
        <Link href={guest ? '#' : '/'} onClick={(e) => guest && e.preventDefault()}>
          <Logo size={26} />
        </Link>
        {!guest && (
          <Link className="backLink" href="/">← Projects</Link>
        )}
        <div className="headDivider" />
        <div className="rvTitleWrap">
          <div className="rvTitle">{project.title}</div>
          <div className="rvSub">{guest ? 'CLIENT REVIEW · SHARED 2 DAYS AGO' : 'CLIENT REVIEW · PROTOTYPE'}</div>
        </div>
        {project.hasCut && (
          <div className="verGroup">
            <div className="verPills">
              {Array.from({ length: maxVersion }, (_, i) => i + 1).map((v) => (
                <button
                  key={v}
                  className={`verPill ${v === version ? 'active' : ''}`}
                  onClick={() => {
                    setVersion(v);
                    setSelected(null);
                    setFrame(0);
                    setPlaying(false);
                  }}
                >
                  V{v}
                </button>
              ))}
            </div>
            <span className="verLabel">{version === maxVersion ? 'LATEST' : 'OLDER CUT'}</span>
          </div>
        )}
        <div className="rvRight">
          <span className="kbdHint">SPACE PLAY · ←→ FRAME · C COMMENT</span>
          <div className="dlWrap">
            <button className="dlBtn" onClick={() => setDlOpen(!dlOpen)}>↓ Download ▾</button>
            {dlOpen && (
              <div className="dlMenu" onMouseLeave={() => setDlOpen(false)}>
                <button className="dlItem" onClick={() => setDlOpen(false)}>
                  <div className="dlItemTitle">1080p proxy — 240 MB</div>
                  <div className="dlItemMeta">H.264 · DIRECT VAN DE NAS</div>
                </button>
                <button className="dlItem" onClick={() => setDlOpen(false)}>
                  <div className="dlItemTitle">Original — 12 GB</div>
                  <div className="dlItemMeta">PRORES 422 · UIT IMMICH</div>
                </button>
              </div>
            )}
          </div>
          <Avatar name={me} size={26} />
        </div>
      </header>

      <div className="rvBody">
        <div className="videoCol">
          <div
            className="videoBox"
            ref={boxRef}
            onMouseDown={onBoxMouseDown}
            onClick={onBoxClick}
          >
            <div className="videoPh">
              <span className="phTitle">SHOT {shot}</span>
              <span className="phSub">PLACEHOLDER — CLICK TO PIN</span>
            </div>

            {!playing && <div className="pausedChip">PAUSED · {timecode(frame)}</div>}

            {/* drawing overlay */}
            <svg className="svgOverlay" viewBox="0 0 100 100" preserveAspectRatio="none">
              {visibleStrokes.map((s, i) => (
                <polyline
                  key={`c${i}`}
                  points={s.map((p) => p.join(',')).join(' ')}
                  fill="none"
                  stroke="var(--amber)"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {draftStrokes.map((s, i) => (
                <polyline
                  key={`d${i}`}
                  points={s.map((p) => p.join(',')).join(' ')}
                  fill="none"
                  stroke="var(--amber)"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {liveStroke && (
                <polyline
                  points={liveStroke.map((p) => p.join(',')).join(' ')}
                  fill="none"
                  stroke="var(--amber-draw)"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>

            {/* comment pins */}
            {nearPins.map((c) => {
              const p = c.pin!;
              const isDragging = dragging?.kind === 'comment' && dragging.id === c.id;
              const tipOpen = hoverPin === c.id || (selected === c.id && !isDragging);
              return (
                <div key={c.id}>
                  <div
                    className={`pin ${c.resolved ? 'resolved' : ''} ${isDragging ? 'dragging' : ''}`}
                    style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setDragging({ kind: 'comment', id: c.id });
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (movedRef.current) {
                        movedRef.current = false;
                        return;
                      }
                      selectComment(c);
                    }}
                    onMouseEnter={() => setHoverPin(c.id)}
                    onMouseLeave={() => setHoverPin(null)}
                  >
                    {pinNumber(c)}
                  </div>
                  {tipOpen && (
                    <div
                      className="pinTip"
                      style={{
                        left: `${p.x * 100}%`,
                        top: `${p.y * 100}%`,
                        transform: `${
                          p.x > 0.55 ? 'translateX(-100%) translateX(-16px)' : 'translateX(16px)'
                        } ${p.y > 0.6 ? 'translateY(-100%)' : ''}`,
                      }}
                    >
                      <div className="pinTipHead">
                        <Avatar name={c.name} />
                        <span className="pinTipName">{c.name}</span>
                        <span className="pinTipTc">{timecode(c.frame)}</span>
                      </div>
                      <div className="pinTipBody">{c.body}</div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* pending (unposted) pin */}
            {pin && (
              <div
                className={`pin pending ${dragging?.kind === 'draft' ? 'dragging' : ''}`}
                style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setDragging({ kind: 'draft' });
                }}
                onClick={(e) => e.stopPropagation()}
              />
            )}
          </div>

          <div className="controls">
            <div className="track" onClick={seekFromTrack}>
              <div
                className="trackProgress"
                style={{ width: `${(frame / TOTAL_FRAMES) * 100}%` }}
              />
              {scoped
                .filter((c) => !c.deleted)
                .map((c) => (
                  <div
                    key={c.id}
                    className={`marker ${c.resolved ? 'resolved' : ''}`}
                    style={{ left: `${(c.frame / TOTAL_FRAMES) * 100}%` }}
                    title={`${timecode(c.frame)} — ${c.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      selectComment(c);
                    }}
                  />
                ))}
              <div
                className="trackHandle"
                style={{ left: `${(frame / TOTAL_FRAMES) * 100}%` }}
              />
            </div>
            <div className="ctrlRow">
              <button className="playBtn" onClick={() => setPlaying(!playing)}>
                {playing ? '❚❚' : '▶'}
              </button>
              <span>
                <span className="tcNow">{timecode(frame)}</span>{' '}
                <span className="tcTotal">/ {timecode(TOTAL_FRAMES)}</span>
              </span>
              <div className="ctrlChips">
                <button
                  className="ctrlChip"
                  onClick={() => {
                    setPlaying(false);
                    setFrame((f) => Math.max(0, f - 1));
                  }}
                >
                  ◀ frame
                </button>
                <button
                  className="ctrlChip"
                  onClick={() => {
                    setPlaying(false);
                    setFrame((f) => Math.min(TOTAL_FRAMES - 1, f + 1));
                  }}
                >
                  frame ▶
                </button>
                <button
                  className={`ctrlChip ${loop ? 'active' : ''}`}
                  onClick={() => setLoop(!loop)}
                >
                  Loop
                </button>
              </div>
            </div>
          </div>

          <div className="composer">
            <Avatar name={me} size={30} />
            <div className={`composerCard ${draft.trim() ? 'hasDraft' : ''}`}>
              <div className="composerHead">
                <span className="tcChip">@ {timecode(frame)}</span>
                <span className="composerAs">
                  Commenting as <b>{me}</b>
                </span>
              </div>
              <textarea
                ref={taRef}
                className="composerTa"
                rows={2}
                placeholder="Leave feedback at this frame…  (⌘/Ctrl + Enter to post)"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onFocus={() => setPlaying(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post();
                }}
              />
              <div className="composerActions">
                <button
                  className={`compChip ${pin ? 'active' : ''}`}
                  onClick={() => setPin(pin ? null : pin)}
                >
                  {pin ? '◉ Pin placed — drag to move · click to clear' : '◉ Click the frame to pin'}
                </button>
                <button
                  className={`compChip ${drawMode ? 'active' : ''}`}
                  onClick={() => {
                    setPlaying(false);
                    setDrawMode(!drawMode);
                  }}
                >
                  {drawMode ? '✎ Drawing — click to stop' : '✎ Draw'}
                </button>
                {draftStrokes.length > 0 && (
                  <button
                    className="compChip"
                    onClick={() => setDraftStrokes((d) => d.slice(0, -1))}
                  >
                    ↺ Undo
                  </button>
                )}
                <button className={`postBtn ${draft.trim() ? 'ready' : ''}`} onClick={post}>
                  Post
                </button>
              </div>
            </div>
          </div>
        </div>

        <aside className="commentRail">
          <div className="railHead">
            <div className="railHeadTop">
              <span className="railTitle">Comments</span>
              <span className="railCount">{scoped.length}</span>
              {unresolvedCount > 0 && (
                <span className="unresolvedCount">{unresolvedCount} unresolved</span>
              )}
            </div>
            <div className="sortRow">
              {(
                [
                  ['timecode', 'Timecode ↓'],
                  ['newest', 'Newest'],
                  ['oldest', 'Oldest'],
                ] as [Sort, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  className={`sortChip ${sort === key ? 'active' : ''}`}
                  onClick={() => setSort(key)}
                >
                  {label}
                </button>
              ))}
              <button
                className={`openFilter ${openOnly ? 'active' : ''}`}
                onClick={() => setOpenOnly(!openOnly)}
              >
                Unresolved
              </button>
            </div>
          </div>

          <div className="railScroll">
            {openList.length === 0 && resolvedList.length === 0 ? (
              <div className="emptyState">
                <div className="emptyCircle">◉</div>
                <div className="emptyTitle">Nothing here</div>
                <div className="emptyExplainer">
                  Pauzeer op een frame en laat daar je feedback achter — met een pin of tekening
                  als dat helpt.
                </div>
                <div className="hintChips">
                  <span className="hintChip">SPACE = PLAY</span>
                  <span className="hintChip">C = COMMENT</span>
                </div>
              </div>
            ) : (
              <>
                {openList.map(commentRow)}
                {!openOnly && resolvedList.length > 0 && (
                  <>
                    <button
                      className="resolvedBar"
                      onClick={() => setResolvedCollapsed(!resolvedCollapsed)}
                    >
                      <span className="checkSq">✓</span>
                      {resolvedList.length} resolved comment{resolvedList.length === 1 ? '' : 's'}
                      <span className="resolvedBarToggle">
                        {resolvedCollapsed ? 'Show' : 'Hide'}
                      </span>
                    </button>
                    {!resolvedCollapsed && resolvedList.map(commentRow)}
                  </>
                )}
              </>
            )}
          </div>
        </aside>
      </div>

      {gateOpen && (
        <div className="backdrop">
          <div className="gateModal">
            <Logo size={34} />
            <div className="gateTitle">{project.title}</div>
            <div className="gateExplainer">
              Je bent uitgenodigd om deze cut te bekijken en feedback te geven. Vul je naam in
              zodat de editor weet wie er reageert.
            </div>
            <input
              className="gateInput"
              autoFocus
              placeholder="Je naam"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && nameDraft.trim()) setName(nameDraft.trim());
              }}
            />
            <button
              className="gateBtn"
              onClick={() => nameDraft.trim() && setName(nameDraft.trim())}
            >
              Open review
            </button>
            <div className="gateCaption">NO ACCOUNT NEEDED · LINK EXPIRES IN 30 DAYS</div>
          </div>
        </div>
      )}
    </div>
  );
}
