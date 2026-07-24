// Domain types + seed data for the prototype front-end.
// The real API (see db/schema.sql and Tech Notitie section 4) replaces this module.

export const FPS = 25;
export const TOTAL_FRAMES = 1950; // 78s at 25 fps

export type Stroke = [number, number][]; // points normalized 0–100

export interface Reply {
  id: number;
  name: string;
  ago: string;
  body: string;
  mine?: boolean;
}

export interface Comment {
  id: number;
  version: number;
  name: string;
  frame: number; // integer frames, never seconds
  body: string;
  pin: { x: number; y: number } | null; // fractions 0–1 of the video box
  strokes: Stroke[];
  likes: number;
  liked: boolean;
  resolved: boolean;
  deleted: boolean;
  mine: boolean;
  ago: string;
  replies: Reply[];
}

export interface ImmichFile {
  id: string;
  name: string;
  meta: string;
}

export interface Project {
  id: string;
  title: string;
  version: number; // newest version number
  reviewers: string[];
  agoLabel: string;
  duration: string;
  hasCut: boolean;
  archived: boolean;
  shareToken: string;
}

export interface AppState {
  projects: Project[];
  comments: Record<string, Comment[]>; // projectId -> comments
  nasGb: number;
  awaitingReply: number;
}

export const AVATAR_COLORS = [
  'oklch(0.5 0.08 240)',
  'oklch(0.55 0.09 78)',
  'oklch(0.5 0.08 160)',
  'oklch(0.5 0.09 300)',
];

export function nameColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function initials(name: string): string {
  const words = name.replace(/\(.*\)/, '').trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// mm:ss:ff timecode
export function timecode(frame: number, fps: number = FPS): string {
  const totalSeconds = Math.floor(frame / fps);
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');
  const ff = String(frame % fps).padStart(2, '0');
  return `${mm}:${ss}:${ff}`;
}

export const IMMICH_FILES: ImmichFile[] = [
  { id: 'a1', name: 'zeeuwse-kust_v4_prores.mov', meta: 'PRORES 422 · 01:18 · 11.8 GB · VANDAAG' },
  { id: 'a2', name: 'rabo_aftermovie_v2_master.mov', meta: 'PRORES 422 · 02:04 · 18.2 GB · GISTEREN' },
  { id: 'a3', name: 'interview_ruwe-selectie.mp4', meta: 'H.264 · 12:40 · 3.1 GB · 3 DAGEN GELEDEN' },
];

export function seedState(): AppState {
  return {
    nasGb: 41,
    awaitingReply: 3,
    projects: [
      {
        id: 'zeeuwse-kust',
        title: 'Zeeuwse Kust — Brand Film',
        version: 3,
        reviewers: ['Jasper', 'Marijn', 'Tim'],
        agoLabel: '2D AGO',
        duration: '01:18',
        hasCut: true,
        archived: false,
        shareToken: '9fk2-zeeuwse',
      },
      {
        id: 'rabo-aftermovie',
        title: 'Rabo — Aftermovie',
        version: 1,
        reviewers: [],
        agoLabel: 'ALL RESOLVED',
        duration: '02:04',
        hasCut: false,
        archived: false,
        shareToken: '2xq8-rabo',
      },
    ],
    comments: {
      'zeeuwse-kust': [
        {
          id: 1,
          version: 2,
          name: 'Jasper (client)',
          frame: 202, // 00:08:02
          body: 'Kan de logo-reveal iets langer blijven staan? Nu is het net te snel om te lezen.',
          pin: null,
          strokes: [],
          likes: 2,
          liked: false,
          resolved: false,
          deleted: false,
          mine: false,
          ago: '1d',
          replies: [],
        },
        {
          id: 2,
          version: 2,
          name: 'Marijn',
          frame: 611, // 00:24:11
          body: 'Deze shot 4 frames later insnijden — nu val je op de beweging.',
          pin: { x: 0.31, y: 0.55 },
          strokes: [
            [
              [22, 18], [30, 12], [42, 10], [52, 13], [56, 22], [52, 32],
              [40, 38], [28, 36], [20, 28], [22, 18],
            ],
          ],
          likes: 1,
          liked: false,
          resolved: false,
          deleted: false,
          mine: false,
          ago: '4h',
          replies: [
            { id: 1, name: 'You', ago: '3h', body: 'Fixed in v3 — check hem nog een keer?', mine: true },
          ],
        },
        {
          id: 3,
          version: 3,
          name: 'Tim',
          frame: 1550, // 01:02:00
          body: 'De drone-shot aan het einde mag wat mij betreft nog 2 seconden langer — mooi rustpunt.',
          pin: null,
          strokes: [],
          likes: 0,
          liked: false,
          resolved: false,
          deleted: false,
          mine: false,
          ago: '2d',
          replies: [],
        },
        {
          id: 4,
          version: 2,
          name: 'Jasper (client)',
          frame: 450, // 00:18:00
          body: 'Muziek zit hier net iets te hard onder de voice-over.',
          pin: null,
          strokes: [],
          likes: 1,
          liked: false,
          resolved: true,
          deleted: false,
          mine: false,
          ago: '1d',
          replies: [],
        },
        {
          id: 5,
          version: 3,
          name: 'Marijn',
          frame: 900, // 00:36:00
          body: 'Kleurcorrectie van het strand-shot is nu precies goed.',
          pin: null,
          strokes: [],
          likes: 0,
          liked: false,
          resolved: true,
          deleted: false,
          mine: false,
          ago: '4h',
          replies: [],
        },
      ],
      'rabo-aftermovie': [],
    },
  };
}
