// Gedeelde pure helpers (client + server). Geen state — data komt uit de API.

export const DEFAULT_FPS = 25;
export const PLACEHOLDER_FRAMES = 1950; // 78s — gebruikt zolang een versie nog transcodeert

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
  if (words.length === 1) return (words[0][0] ?? '?').toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// mm:ss:ff — frames zijn integers, nooit seconden als float
export function timecode(frame: number, fps: number = DEFAULT_FPS): string {
  const fpsInt = Math.round(fps);
  const totalSeconds = Math.floor(frame / fps);
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');
  const ff = String(Math.max(0, Math.round(frame - totalSeconds * fps)) % fpsInt).padStart(2, '0');
  return `${mm}:${ss}:${ff}`;
}
