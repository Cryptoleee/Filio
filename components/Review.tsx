'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Avatar from './Avatar';
import Logo from './Logo';
import { DEFAULT_FPS, PLACEHOLDER_FRAMES, timecode } from '@/lib/data';
import { ApiError, api, timeAgo } from '@/lib/api';
import type { ApiComment, ApiVersion, ReviewPayload, Stroke } from '@/lib/types';

export type ReviewSource =
  | { kind: 'editor'; projectId: number }
  | { kind: 'guest'; token: string };

type Sort = 'timecode' | 'newest' | 'oldest';

interface GateInfo {
  projectTitle: string;
  askName: boolean;
  needsPassword: boolean;
  expiresDays: number | null;
}

const STROKE_WINDOW = 40; // frames rond een comment waarin pin/tekening zichtbaar zijn

export default function Review({ source, preview = false }: { source: ReviewSource; preview?: boolean }) {
  const [payload, setPayload] = useState<ReviewPayload | null>(null);
  const [gate, setGate] = useState<GateInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [pwDraft, setPwDraft] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

  // player
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(false);

  // versies
  const [version, setVersion] = useState(0); // 0 = nog niet gekozen → laatste

  // composer — compact veldje dat bij de pin openklapt
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [pin, setPin] = useState<{ x: number; y: number } | null>(null);
  const [draftStrokes, setDraftStrokes] = useState<Stroke[]>([]);
  const [drawMode, setDrawMode] = useState(false);
  const [liveStroke, setLiveStroke] = useState<Stroke | null>(null);

  const closeComposer = () => {
    setComposerOpen(false);
    setPin(null);
    setDraft('');
    setDraftStrokes([]);
    setDrawMode(false);
    setLiveStroke(null);
  };

  // rail
  const [sort, setSort] = useState<Sort>('timecode');
  const [openOnly, setOpenOnly] = useState(false);
  const [resolvedCollapsed, setResolvedCollapsed] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [replyDraft, setReplyDraft] = useState('');

  // overige ui
  const [dlOpen, setDlOpen] = useState(false);
  const [hoverPin, setHoverPin] = useState<number | null>(null);
  const [dragging, setDragging] = useState<null | { kind: 'draft' } | { kind: 'comment'; id: number }>(null);
  const [editing, setEditing] = useState<{ id: number; draft: string } | null>(null);
  const [narrow, setNarrow] = useState(false);
  const coarseRef = useRef(false);
  const lastTapRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // <900px: rail onder de video, composer als sticky balk (ontwerp 2a)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    coarseRef.current = window.matchMedia('(pointer: coarse)').matches;
    return () => mq.removeEventListener('change', apply);
  }, []);

  const boxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const movedRef = useRef(false);
  const drawingRef = useRef(false);

  const apiBase = source.kind === 'editor' ? `/api/projects/${source.projectId}` : `/api/r/${source.token}`;

  const load = useCallback(async () => {
    try {
      const data = await api<ReviewPayload>(apiBase);
      setPayload(data);
      setGate(null);
      setLoadError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401 && e.data?.needsJoin) {
        setGate(e.data as GateInfo);
      } else if (e instanceof ApiError && e.status === 401 && source.kind === 'editor') {
        location.href = '/login';
      } else {
        setLoadError(e instanceof Error ? e.message : String(e));
      }
    }
  }, [apiBase, source.kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const versions = payload?.versions ?? [];
  const latestNumber = versions.length ? versions[versions.length - 1].number : 0;
  useEffect(() => {
    if (version === 0 && latestNumber) setVersion(latestNumber);
  }, [version, latestNumber]);

  const v: ApiVersion | null =
    versions.find((x) => x.number === (version || latestNumber)) ?? versions[versions.length - 1] ?? null;
  const fps = v?.fps ?? DEFAULT_FPS;
  const totalFrames = v?.totalFrames ?? PLACEHOLDER_FRAMES;
  const ready = v?.status === 'ready';

  // ---- SSE: nieuwe comments live inschuiven ----
  useEffect(() => {
    if (!v?.id || gate) return;
    const es = new EventSource(`/api/versions/${v.id}/events`);
    es.onmessage = (e) => {
      if (e.data === 'comment') void load();
    };
    return () => es.close();
  }, [v?.id, gate, load]);

  // ---- seek-helper: frame is leidend, video volgt ----
  const seek = useCallback(
    (f: number) => {
      const clamped = Math.min(totalFrames - 1, Math.max(0, f));
      setFrame(clamped);
      const video = videoRef.current;
      // halve frame erbij zodat we nooit één frame te vroeg landen
      if (video && ready) video.currentTime = (clamped + 0.5) / fps;
    },
    [totalFrames, fps, ready]
  );

  // Afspelen ruimt de pending pin en de open composer op — anders blijft
  // de stip in beeld staan terwijl de video doorloopt.
  useEffect(() => {
    if (playing) closeComposer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // ---- afspelen: echte video indien ready, anders synthetische klok ----
  useEffect(() => {
    const video = videoRef.current;
    if (ready && video) {
      if (playing) void video.play().catch(() => setPlaying(false));
      else video.pause();
    }
  }, [playing, ready, v?.id]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const frameMs = 1000 / fps;
    const tick = (t: number) => {
      const video = videoRef.current;
      if (ready && video) {
        setFrame(Math.min(totalFrames - 1, Math.round(video.currentTime * fps)));
      } else {
        acc += t - last;
        const adv = Math.floor(acc / frameMs);
        if (adv > 0) {
          acc -= adv * frameMs;
          setFrame((f) => {
            let nf = f + adv;
            if (nf >= totalFrames) {
              if (loop) return nf % totalFrames;
              setPlaying(false);
              return totalFrames - 1;
            }
            return nf;
          });
        }
      }
      last = t;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, loop, fps, totalFrames, ready]);

  // ---- toetsenbord ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return;
      if (e.key === ' ') {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        setPlaying(false);
        setFrame((f) => {
          const nf = Math.min(totalFrames - 1, Math.max(0, f + (e.key === 'ArrowLeft' ? -1 : 1)));
          const video = videoRef.current;
          if (video && ready) video.currentTime = (nf + 0.5) / fps;
          return nf;
        });
      } else if (e.key.toLowerCase() === 'c') {
        e.preventDefault();
        setPlaying(false);
        setComposerOpen(true);
        setTimeout(() => taRef.current?.focus(), 0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [totalFrames, fps, ready]);

  // ---- letterboxing: reken tegen het werkelijke videovlak, niet het element ----
  const videoAspect = v?.width && v?.height ? v.width / v.height : 16 / 9;
  const BOX_ASPECT = 16 / 9;
  const plane =
    videoAspect >= BOX_ASPECT
      ? {
          left: 0,
          width: 1,
          top: (1 - BOX_ASPECT / videoAspect) / 2,
          height: BOX_ASPECT / videoAspect,
        }
      : {
          top: 0,
          height: 1,
          left: (1 - videoAspect / BOX_ASPECT) / 2,
          width: videoAspect / BOX_ASPECT,
        };

  const fracFromEvent = (e: { clientX: number; clientY: number }) => {
    const rect = boxRef.current!.getBoundingClientRect();
    const bx = (e.clientX - rect.left) / rect.width;
    const by = (e.clientY - rect.top) / rect.height;
    return {
      x: Math.min(1, Math.max(0, (bx - plane.left) / plane.width)),
      y: Math.min(1, Math.max(0, (by - plane.top) / plane.height)),
    };
  };
  const planePct = (x: number, y: number) => ({
    left: `${(plane.left + x * plane.width) * 100}%`,
    top: `${(plane.top + y * plane.height) * 100}%`,
  });

  // Flip de tooltip als hij rechts uit beeld zou lopen — op fractie én op pixels
  // (op een smal scherm loopt 210px al ruim vóór 55% van de breedte uit beeld).
  const flipTipX = (x: number) => {
    if (x > 0.55) return true;
    const boxW = boxRef.current?.clientWidth ?? 0;
    return boxW > 0 && (plane.left + x * plane.width) * boxW + 226 > boxW;
  };

  // ---- lokale patch + server-refresh ----
  const patchComment = useCallback((id: number, fn: (c: ApiComment) => ApiComment) => {
    setPayload((p) =>
      p ? { ...p, comments: p.comments.map((c) => (c.id === id ? fn(c) : c)) } : p
    );
  }, []);

  // ---- pin slepen (pointer events: muis én touch) ----
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      movedRef.current = true;
      const f = fracFromEvent(e);
      if (dragging.kind === 'draft') setPin(f);
      else patchComment(dragging.id, (c) => ({ ...c, pin: f }));
    };
    const onUp = async (e: PointerEvent) => {
      const dragged = dragging;
      setDragging(null);
      if (dragged.kind === 'comment' && movedRef.current) {
        // pin-positie is onderdeel van het comment — persist als eigen comment
        const f = fracFromEvent(e);
        try {
          await api(`/api/comments/${dragged.id}/pin`, {
            method: 'PATCH',
            body: JSON.stringify({ pin: f }),
          });
        } catch {
          void load();
        }
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, patchComment]);

  const onBoxPointerDown = (e: React.PointerEvent) => {
    if (!drawMode) return;
    e.preventDefault();
    drawingRef.current = true;
    const f = fracFromEvent(e);
    setLiveStroke([[f.x * 100, f.y * 100]]);
    const onMove = (ev: PointerEvent) => {
      const p = fracFromEvent(ev);
      setLiveStroke((s) => (s ? [...s, [p.x * 100, p.y * 100]] : s));
    };
    const onUp = () => {
      drawingRef.current = false;
      setLiveStroke((s) => {
        if (s && s.length > 1) setDraftStrokes((d) => [...d, s]);
        return null;
      });
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const placePin = (f: { x: number; y: number }) => {
    setPlaying(false);
    setPin(f);
    setComposerOpen(true);
    setTimeout(() => taRef.current?.focus(), 0);
  };

  const onBoxClick = (e: React.MouseEvent) => {
    if (movedRef.current) {
      // net een drag afgerond — die klik mag geen losse pin plaatsen
      movedRef.current = false;
      return;
    }
    if (drawMode) return;
    if (!coarseRef.current) {
      placePin(fracFromEvent(e));
      return;
    }
    // Touch (2a): tap = pin plaatsen, dubbel-tap = fullscreen
    const now = performance.now();
    if (now - lastTapRef.current < 300) {
      lastTapRef.current = 0;
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
      if (document.fullscreenElement) void document.exitFullscreen();
      else void boxRef.current?.requestFullscreen().catch(() => {});
      return;
    }
    lastTapRef.current = now;
    const f = fracFromEvent(e);
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => placePin(f), 300);
  };

  // ---- comments binnen de gekozen versie ----
  const comments = payload?.comments ?? [];
  const currentVersion = version || latestNumber;
  const scoped = useMemo(
    () =>
      comments.filter(
        (c) =>
          c.versionNumber === currentVersion ||
          (c.versionNumber < currentVersion && !c.resolved && !c.deleted)
      ),
    [comments, currentVersion]
  );
  const sortFn = (a: ApiComment, b: ApiComment) =>
    sort === 'timecode' ? a.frame - b.frame : sort === 'newest' ? b.id - a.id : a.id - b.id;
  const openList = scoped.filter((c) => !c.resolved).sort(sortFn);
  const resolvedList = scoped.filter((c) => c.resolved).sort(sortFn);
  const unresolvedCount = scoped.filter((c) => !c.resolved && !c.deleted).length;

  const byTimecode = [...scoped].sort((a, b) => a.frame - b.frame);
  const pinNumber = (c: ApiComment) => byTimecode.indexOf(c) + 1;

  const nearPins = scoped.filter(
    (c) => c.pin && !c.deleted && Math.abs(c.frame - frame) <= STROKE_WINDOW
  );
  const selectedComment = scoped.find((c) => c.id === selected) ?? null;
  const visibleStrokes =
    selectedComment && !selectedComment.deleted &&
    Math.abs(selectedComment.frame - frame) <= STROKE_WINDOW
      ? selectedComment.strokes
      : [];

  // ---- acties ----
  const selectComment = (c: ApiComment) => {
    setSelected(c.id);
    setReplyDraft('');
    setPlaying(false);
    seek(c.frame);
  };

  const post = async () => {
    if (!draft.trim() || !v) return;
    setPlaying(false);
    const res = await api<{ id: number }>(`/api/versions/${v.id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: draft.trim(), frame, pin, strokes: draftStrokes }),
    });
    closeComposer();
    await load();
    setSelected(res.id);
  };

  const postReply = async (c: ApiComment) => {
    if (!replyDraft.trim()) return;
    const body = replyDraft.trim();
    setReplyDraft('');
    await api(`/api/versions/${c.versionId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body, frame: c.frame, parentId: c.id }),
    });
    await load();
  };

  const toggleLike = (c: ApiComment) => {
    patchComment(c.id, (cc) => ({
      ...cc,
      liked: !cc.liked,
      likes: cc.likes + (cc.liked ? -1 : 1),
    }));
    api(`/api/comments/${c.id}/reaction`, { method: 'PUT' }).catch(() => void load());
  };

  const toggleResolve = (c: ApiComment) => {
    patchComment(c.id, (cc) => ({ ...cc, resolved: !cc.resolved }));
    api(`/api/comments/${c.id}/resolve`, { method: 'PATCH' }).catch(() => void load());
  };

  const softDelete = async (c: ApiComment) => {
    await api(`/api/comments/${c.id}`, { method: 'DELETE' });
    await load();
  };

  const saveEdit = async () => {
    if (!editing) return;
    const { id, draft: body } = editing;
    setEditing(null);
    if (!body.trim()) return;
    patchComment(id, (c) => ({ ...c, body: body.trim() }));
    try {
      await api(`/api/comments/${id}`, { method: 'PATCH', body: JSON.stringify({ body }) });
    } catch {
      void load();
    }
  };

  const join = async () => {
    if (gate?.askName && !nameDraft.trim()) return;
    try {
      await api(`/api/r/${source.kind === 'guest' ? source.token : ''}/join`, {
        method: 'POST',
        body: JSON.stringify({ name: nameDraft.trim(), password: pwDraft || undefined }),
      });
      setJoinError(null);
      await load();
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : 'Inloggen mislukt');
    }
  };

  const seekFromTrack = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    seek(Math.round(((e.clientX - rect.left) / rect.width) * totalFrames));
    setPlaying(false);
  };

  // ---- render ----
  if (loadError) {
    return (
      <div className="shell" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-2)', fontSize: 13 }}>{loadError}</div>
      </div>
    );
  }

  const viewerIsEditor = payload?.viewer.isEditor ?? false;
  const guestChrome = preview || !viewerIsEditor;
  const displayMe =
    viewerIsEditor && !preview ? 'You' : payload?.viewer.name ?? (nameDraft || 'Reviewer');
  const title = payload?.project.title ?? gate?.projectTitle ?? '…';
  const sharedSub = payload?.project.sharedAt
    ? `SHARED ${timeAgo(payload.project.sharedAt).toUpperCase()} AGO`
    : 'NOT SHARED YET';
  const allowDownload = payload?.project.allowDownload ?? false;

  const displayName = (c: { name: string; mine: boolean }) =>
    c.mine && viewerIsEditor ? 'You' : c.name;

  const commentRow = (c: ApiComment) => {
    const isSelected = selected === c.id;
    return (
      <div
        key={c.id}
        className={`commentRow ${isSelected ? 'selected' : ''} ${c.resolved ? 'resolvedRow' : ''}`}
        onClick={() => selectComment(c)}
      >
        <div className="cRowHead">
          <Avatar name={displayName(c)} />
          <span className="cName">{displayName(c)}</span>
          <span className="cTc">{timecode(c.frame, fps)}</span>
          {c.versionNumber < currentVersion && <span className="vBadge">V{c.versionNumber}</span>}
          <span className="cAgo">{timeAgo(c.createdAt)}</span>
        </div>
        {editing?.id === c.id ? (
          <div className="editWrap" onClick={(e) => e.stopPropagation()}>
            <textarea
              className="editTa"
              autoFocus
              rows={2}
              value={editing.draft}
              onChange={(e) => setEditing({ id: c.id, draft: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void saveEdit();
                }
                if (e.key === 'Escape') setEditing(null);
              }}
            />
            <button className="sendBtn" onClick={() => void saveEdit()}>✓</button>
          </div>
        ) : (
          <div className={`cBody ${c.deleted ? 'deleted' : ''}`}>
            {c.deleted ? 'Comment verwijderd' : c.body}
          </div>
        )}
        {!c.deleted && c.pin && (
          <div className="pinnedCaption">
            <span className="dot">◉</span> PINNED ON FRAME
          </div>
        )}
        <div className="cActions" onClick={(e) => e.stopPropagation()}>
          {!c.deleted && (
            <button className={`cAct ${c.liked ? 'liked' : ''}`} onClick={() => toggleLike(c)}>
              👍{c.likes > 0 ? ` ${c.likes}` : ''}
            </button>
          )}
          <button className="cAct" onClick={() => selectComment(c)}>
            Jump to frame
          </button>
          {c.mine && !c.deleted && (
            <>
              <button
                className="cAct"
                onClick={() => setEditing({ id: c.id, draft: c.body })}
              >
                Edit
              </button>
              <button className="cAct" onClick={() => void softDelete(c)}>
                Delete
              </button>
            </>
          )}
          {!c.deleted && (
            <button
              className={`cAct resolveAct ${c.resolved ? 'resolved' : ''}`}
              onClick={() => toggleResolve(c)}
            >
              {c.resolved ? '✓ Resolved' : '○ Resolve'}
            </button>
          )}
        </div>
        {c.replies.map((r) => (
          <div className="replyCard" key={r.id}>
            <div className="replyHead">
              <Avatar name={displayName(r)} />
              <span className="replyName">{displayName(r)}</span>
              <span className="replyAgo">{timeAgo(r.createdAt)}</span>
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
                if (e.key === 'Enter') void postReply(c);
              }}
            />
            <button className="sendBtn" onClick={() => void postReply(c)}>↑</button>
          </div>
        )}
      </div>
    );
  };


  return (
    <div className="main" style={{ height: '100vh' }}>
      <header className="rvHeader">
        {guestChrome ? <Logo size={26} /> : <Link href="/"><Logo size={26} /></Link>}
        {!guestChrome && <Link className="backLink" href="/">← Projects</Link>}
        <div className="headDivider" />
        <div className="rvTitleWrap">
          <div className="rvTitle">{title}</div>
          <div className="rvSub">CLIENT REVIEW · {sharedSub}</div>
        </div>
        {versions.length > 0 && (
          <div className="verGroup">
            <div className="verPills">
              {versions.map((ver) => (
                <button
                  key={ver.id}
                  className={`verPill ${ver.number === currentVersion ? 'active' : ''}`}
                  onClick={() => {
                    setVersion(ver.number);
                    setSelected(null);
                    setPlaying(false);
                    setFrame(0);
                  }}
                >
                  V{ver.number}
                </button>
              ))}
            </div>
            <span className="verLabel">
              {currentVersion === latestNumber ? 'LATEST' : 'OLDER CUT'}
            </span>
          </div>
        )}
        <div className="rvRight">
          <span className="kbdHint">SPACE PLAY · ←→ FRAME · C COMMENT</span>
          {allowDownload && (
            <div className="dlWrap">
              <button className="dlBtn" onClick={() => setDlOpen(!dlOpen)}>↓ Download ▾</button>
              {dlOpen && (
                <div className="dlMenu" onMouseLeave={() => setDlOpen(false)}>
                  <a
                    className="dlItem"
                    href={v && ready ? `${v.streamUrl}?download=1` : undefined}
                    onClick={() => setDlOpen(false)}
                  >
                    <div className="dlItemTitle">
                      1080p proxy{payload?.project.proxyLabel ? ` — ${payload.project.proxyLabel}` : ''}
                    </div>
                    <div className="dlItemMeta">H.264 · DIRECT VAN DE NAS</div>
                  </a>
                  <a
                    className="dlItem"
                    href={v ? `${v.streamUrl}?original=1` : undefined}
                    onClick={() => setDlOpen(false)}
                  >
                    <div className="dlItemTitle">
                      Original{payload?.project.originalLabel ? ` — ${payload.project.originalLabel}` : ''}
                    </div>
                    <div className="dlItemMeta">UIT IMMICH · ORIGINELE BESTANDSNAAM</div>
                  </a>
                </div>
              )}
            </div>
          )}
          <Avatar name={displayMe} size={26} />
        </div>
      </header>

      <div className="rvBody">
        <div className="videoCol">
          <div className="videoBox" ref={boxRef} onPointerDown={onBoxPointerDown} onClick={onBoxClick}>
            {ready && v ? (
              <video
                key={v.id}
                ref={videoRef}
                className="videoEl"
                src={v.streamUrl}
                poster={v.posterUrl}
                preload="auto"
                playsInline
                loop={loop}
                onEnded={() => !loop && setPlaying(false)}
              />
            ) : (
              <div className="videoPh">
                <span className="phTitle">
                  {v ? (v.status === 'failed' ? 'FAILED' : `${v.progress}%`) : 'NO CUT'}
                </span>
                <span className="phSub">
                  {v
                    ? v.status === 'failed'
                      ? 'TRANSCODE MISLUKT — CHECK DE WORKER-LOGS'
                      : 'FFMPEG MAAKT DE 1080P PROXY…'
                    : 'VOEG EEN VERSIE TOE VIA HET DASHBOARD'}
                </span>
              </div>
            )}

            {!playing && <div className="pausedChip">PAUSED · {timecode(frame, fps)}</div>}

            {/* tekenlaag — gepositioneerd op het werkelijke videovlak */}
            <svg
              className="svgOverlay"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              style={{
                left: `${plane.left * 100}%`,
                top: `${plane.top * 100}%`,
                width: `${plane.width * 100}%`,
                height: `${plane.height * 100}%`,
              }}
            >
              {visibleStrokes.concat(draftStrokes).map((s, i) => (
                <polyline
                  key={i}
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

            {nearPins.map((c) => {
              const p = c.pin!;
              const isDragging = dragging?.kind === 'comment' && dragging.id === c.id;
              const tipOpen = hoverPin === c.id || (selected === c.id && !isDragging);
              return (
                <div key={c.id}>
                  <div
                    className={`pin ${c.resolved ? 'resolved' : ''} ${isDragging ? 'dragging' : ''}`}
                    style={planePct(p.x, p.y)}
                    onPointerDown={(e) => {
                      if (!c.mine && !viewerIsEditor) return; // alleen eigen pins verslepen
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
                        ...planePct(p.x, p.y),
                        transform: `${
                          flipTipX(p.x) ? 'translateX(-100%) translateX(-16px)' : 'translateX(16px)'
                        } ${p.y > 0.6 ? 'translateY(-100%)' : ''}`,
                      }}
                    >
                      <div className="pinTipHead">
                        <Avatar name={displayName(c)} />
                        <span className="pinTipName">{displayName(c)}</span>
                        <span className="pinTipTc">{timecode(c.frame, fps)}</span>
                      </div>
                      <div className="pinTipBody">{c.body}</div>
                    </div>
                  )}
                </div>
              );
            })}

            {pin && (
              <div
                className={`pin pending ${dragging?.kind === 'draft' ? 'dragging' : ''}`}
                style={planePct(pin.x, pin.y)}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setDragging({ kind: 'draft' });
                }}
                onClick={(e) => e.stopPropagation()}
              />
            )}

            {/* compacte composer die bij de pin openklapt */}
            {composerOpen && !gate && (
              <div
                className={`pinComposer ${draft.trim() ? 'hasDraft' : ''}`}
                style={{
                  ...(pin ? planePct(pin.x, pin.y) : { left: '50%', top: '66%' }),
                  transform: `${
                    flipTipX(pin?.x ?? 0.5)
                      ? 'translateX(-100%) translateX(-18px)'
                      : 'translateX(18px)'
                  } ${(pin?.y ?? 0.66) > 0.6 ? 'translateY(-100%)' : ''}`,
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="pinComposerHead">
                  <span className="tcChip">@ {timecode(frame, fps)}</span>
                  <span className="pinComposerAs">{displayMe}</span>
                  <button className="pinComposerClose" onClick={closeComposer}>✕</button>
                </div>
                <textarea
                  ref={taRef}
                  className="pinComposerTa"
                  rows={2}
                  autoFocus
                  placeholder={pin ? 'Feedback bij deze pin…' : 'Feedback bij dit frame…'}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void post();
                    }
                    if (e.key === 'Escape') closeComposer();
                  }}
                />
                <div className="pinComposerActions">
                  <button
                    className={`compChip ${drawMode ? 'active' : ''}`}
                    title="Tekenen op de frame"
                    onClick={() => setDrawMode(!drawMode)}
                  >
                    ✎
                  </button>
                  {draftStrokes.length > 0 && (
                    <button
                      className="compChip"
                      title="Laatste lijn ongedaan maken"
                      onClick={() => setDraftStrokes((d) => d.slice(0, -1))}
                    >
                      ↺
                    </button>
                  )}
                  <button
                    className={`sendBtn pinComposerSend ${draft.trim() ? '' : 'dim'}`}
                    onClick={() => void post()}
                  >
                    ↑
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="controls">
            <div className="track" onClick={seekFromTrack}>
              <div className="trackProgress" style={{ width: `${(frame / totalFrames) * 100}%` }} />
              {scoped
                .filter((c) => !c.deleted)
                .map((c) => (
                  <div
                    key={c.id}
                    className={`marker ${c.resolved ? 'resolved' : ''}`}
                    style={{ left: `${(c.frame / totalFrames) * 100}%` }}
                    title={`${timecode(c.frame, fps)} — ${displayName(c)}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      selectComment(c);
                    }}
                  />
                ))}
              <div className="trackHandle" style={{ left: `${(frame / totalFrames) * 100}%` }} />
            </div>
            <div className="ctrlRow">
              <button className="playBtn" onClick={() => setPlaying(!playing)}>
                {playing ? '❚❚' : '▶'}
              </button>
              <span>
                <span className="tcNow">{timecode(frame, fps)}</span>{' '}
                <span className="tcTotal">/ {timecode(totalFrames, fps)}</span>
              </span>
              <div className="ctrlChips">
                <button
                  className="ctrlChip"
                  onClick={() => {
                    setPlaying(false);
                    seek(frame - 1);
                  }}
                >
                  ◀ frame
                </button>
                <button
                  className="ctrlChip"
                  onClick={() => {
                    setPlaying(false);
                    seek(frame + 1);
                  }}
                >
                  frame ▶
                </button>
                <button className={`ctrlChip ${loop ? 'active' : ''}`} onClick={() => setLoop(!loop)}>
                  Loop
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
                  Pauzeer op een frame en laat daar je feedback achter — met een pin of tekening als
                  dat helpt.
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
                      <span className="resolvedBarToggle">{resolvedCollapsed ? 'Show' : 'Hide'}</span>
                    </button>
                    {!resolvedCollapsed && resolvedList.map(commentRow)}
                  </>
                )}
              </>
            )}
          </div>
        </aside>

      </div>

      {gate && (
        <div className="backdrop">
          <div className="gateModal">
            <Logo size={34} />
            <div className="gateTitle">{gate.projectTitle}</div>
            <div className="gateExplainer">
              Je bent uitgenodigd om deze cut te bekijken en feedback te geven.
              {gate.askName ? ' Vul je naam in zodat de editor weet wie er reageert.' : ''}
            </div>
            {gate.askName && (
              <input
                className="gateInput"
                autoFocus
                placeholder="Je naam"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void join();
                }}
              />
            )}
            {gate.needsPassword && (
              <input
                className="gateInput"
                type="password"
                placeholder="Wachtwoord"
                value={pwDraft}
                onChange={(e) => setPwDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void join();
                }}
              />
            )}
            {joinError && (
              <div style={{ color: 'var(--destructive)', fontSize: 12, marginBottom: 10 }}>
                {joinError}
              </div>
            )}
            <button className="gateBtn" onClick={() => void join()}>
              Open review
            </button>
            <div className="gateCaption">
              NO ACCOUNT NEEDED
              {gate.expiresDays != null ? ` · LINK EXPIRES IN ${gate.expiresDays} DAYS` : ''}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
