import { one } from './db';

export interface Branding {
  studioName: string;
  accentHue: number;
  logoUrl: string | null; // met cache-buster, of null als er geen logo is
}

export const DEFAULT_BRANDING: Branding = {
  studioName: 'Filio',
  accentHue: 78,
  logoUrl: null,
};

export interface SettingsRow {
  studio_name: string;
  accent_hue: number;
  logo_path: string | null;
  logo_mime: string | null;
  updated_at: Date;
}

export async function readSettings(): Promise<SettingsRow | null> {
  return one<SettingsRow>('select * from settings where id = true');
}

// Wordt in de layout gebruikt: mag nooit de pagina slopen als de database
// (nog) niet bereikbaar is — dan valt hij terug op de standaardhuisstijl.
export async function getBranding(): Promise<Branding> {
  try {
    const row = await readSettings();
    if (!row) return DEFAULT_BRANDING;
    return {
      studioName: row.studio_name,
      accentHue: row.accent_hue,
      logoUrl: row.logo_path ? `/brand/logo?v=${row.updated_at.getTime()}` : null,
    };
  } catch {
    return DEFAULT_BRANDING;
  }
}
