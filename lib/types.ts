// Shapes die de API naar de client stuurt.

export type Stroke = [number, number][]; // punten genormaliseerd 0–100

export interface ApiReply {
  id: number;
  name: string;
  body: string;
  createdAt: string;
  mine: boolean;
}

export interface ApiComment {
  id: number;
  versionId: number;
  versionNumber: number;
  name: string;
  frame: number; // integer frames, nooit seconden
  body: string;
  pin: { x: number; y: number } | null;
  strokes: Stroke[];
  likes: number;
  liked: boolean;
  resolved: boolean;
  deleted: boolean;
  mine: boolean;
  createdAt: string;
  replies: ApiReply[];
}

export interface ApiVersion {
  id: number;
  number: number;
  fps: number;
  totalFrames: number;
  status: 'queued' | 'transcoding' | 'ready' | 'failed';
  progress: number;
  streamUrl: string;
  posterUrl: string;
  width: number | null;
  height: number | null;
}

export interface ReviewPayload {
  project: {
    id: number;
    title: string;
    allowDownload: boolean;
    sharedAt: string | null;
    shareUrl: string | null; // alleen voor de editor
    proxyLabel: string | null;
    originalLabel: string | null;
    accentHue: number | null; // eigen projectkleur, null = studio-accent
  };
  versions: ApiVersion[];
  comments: ApiComment[];
  viewer: { name: string; isEditor: boolean };
}

export interface ProjectSummary {
  id: number;
  title: string;
  latestVersion: number;
  status: ApiVersion['status'] | 'empty';
  progress: number;
  transcodingName: string | null;
  unresolved: number;
  reviewers: string[];
  updatedLabel: string;
  durationLabel: string | null;
  posterUrl: string | null;
  shareToken: string | null;
  accentHue: number | null;
}

export interface DashboardPayload {
  projects: ProjectSummary[];
  stats: {
    activeProjects: number;
    openComments: number;
    awaitingReply: number;
    nasGb: number;
  };
  viewer: { name: string };
}

export interface SharePayload {
  url: string;
  askName: boolean;
  hasPassword: boolean;
  allowDownload: boolean;
  expiresDays: number | null; // null = nooit
  proxyLabel: string | null;
  originalLabel: string | null;
}

export interface ImmichVideoRow {
  id: string;
  filename: string;
  meta: string;
  sizeBytes: number;
}
