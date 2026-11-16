// lib/ux-v0/fonts.ts — the typefaces SocriaUX v0 may choose, and how to load them.
//
// The model names fonts; it never invents them. A name outside this list is
// replaced by the nearest default of its kind, so a brief or a spec can only
// ever ask for a face that exists and that Google Fonts will serve. Each entry
// carries the axis request Google's CSS2 API accepts for that family — a
// request for a weight a static family does not have is refused outright,
// which is why the weights are written per family rather than assumed.

export type FontKind = 'serif' | 'sans' | 'mono';

export interface FontEntry {
  name: string;
  kind: FontKind;
  /** the CSS2 axis query; empty for a single-weight family */
  axes: string;
  /** a word on its character, offered to the model so it can choose deliberately */
  note: string;
}

export const FONTS: readonly FontEntry[] = [
  { name: 'Instrument Serif', kind: 'serif', axes: 'ital@0;1', note: 'condensed editorial display serif, one weight' },
  { name: 'Fraunces', kind: 'serif', axes: 'wght@300..700', note: 'soft, characterful old-style display serif' },
  { name: 'Playfair Display', kind: 'serif', axes: 'wght@400..700', note: 'high-contrast classic display serif' },
  { name: 'DM Serif Display', kind: 'serif', axes: 'ital@0;1', note: 'robust, warm display serif, one weight' },
  { name: 'Cormorant Garamond', kind: 'serif', axes: 'wght@400;500;600', note: 'delicate, refined Garamond for luxury' },
  { name: 'Libre Baskerville', kind: 'serif', axes: 'wght@400;700', note: 'sturdy book serif, very readable' },
  { name: 'Lora', kind: 'serif', axes: 'wght@400..700', note: 'calligraphic, friendly text serif' },
  { name: 'Newsreader', kind: 'serif', axes: 'wght@400..600', note: 'journalistic text serif' },
  { name: 'Source Serif 4', kind: 'serif', axes: 'wght@400..700', note: 'neutral, professional text serif' },
  { name: 'EB Garamond', kind: 'serif', axes: 'wght@400..700', note: 'classical Garamond for long reading' },
  { name: 'Bodoni Moda', kind: 'serif', axes: 'wght@400..700', note: 'fashion-magazine Didone' },
  { name: 'Young Serif', kind: 'serif', axes: '', note: 'chunky, confident heading serif, one weight' },
  { name: 'Inter', kind: 'sans', axes: 'wght@400..700', note: 'neutral UI sans, excellent at small sizes' },
  { name: 'DM Sans', kind: 'sans', axes: 'wght@400..700', note: 'geometric, low-contrast, friendly' },
  { name: 'Manrope', kind: 'sans', axes: 'wght@400..700', note: 'modern semi-rounded grotesk' },
  { name: 'Space Grotesk', kind: 'sans', axes: 'wght@400..700', note: 'technical grotesk with quirks' },
  { name: 'Work Sans', kind: 'sans', axes: 'wght@400..700', note: 'plain, open grotesk' },
  { name: 'Plus Jakarta Sans', kind: 'sans', axes: 'wght@400..700', note: 'contemporary, product-friendly sans' },
  { name: 'IBM Plex Sans', kind: 'sans', axes: 'wght@400;500;600;700', note: 'engineered corporate sans' },
  { name: 'Outfit', kind: 'sans', axes: 'wght@400..700', note: 'clean geometric display sans' },
  { name: 'Sora', kind: 'sans', axes: 'wght@400..700', note: 'wide, techy geometric sans' },
  { name: 'Archivo', kind: 'sans', axes: 'wght@400..700', note: 'grotesk with presence in headlines' },
  { name: 'Public Sans', kind: 'sans', axes: 'wght@400..700', note: 'civic, strong, neutral' },
  { name: 'Karla', kind: 'sans', axes: 'wght@400..700', note: 'quirky small grotesk' },
  { name: 'Syne', kind: 'sans', axes: 'wght@400..700', note: 'art-gallery display sans' },
  { name: 'Bricolage Grotesque', kind: 'sans', axes: 'wght@400..700', note: 'expressive contemporary grotesque' },
  { name: 'IBM Plex Mono', kind: 'mono', axes: 'wght@400;500;600', note: 'engineered mono' },
  { name: 'JetBrains Mono', kind: 'mono', axes: 'wght@400..700', note: 'developer mono' },
  { name: 'Space Mono', kind: 'mono', axes: 'wght@400;700', note: 'retro geometric mono' },
];

const BY_NAME = new Map(FONTS.map((f) => [f.name.toLowerCase(), f]));

export const DEFAULT_DISPLAY = 'Fraunces';
export const DEFAULT_BODY = 'Inter';

/** A font name, as the list spells it — or null when it is not on the list. */
export function knownFont(name: unknown): FontEntry | null {
  if (typeof name !== 'string') return null;
  return BY_NAME.get(name.trim().toLowerCase()) ?? null;
}

/** A display face from what was asked, else the default. */
export function displayFont(name: unknown): string {
  return knownFont(name)?.name ?? DEFAULT_DISPLAY;
}

/** A body face from what was asked (never a single-weight display face), else the default. */
export function bodyFont(name: unknown): string {
  const f = knownFont(name);
  return f && f.axes !== '' && f.axes !== 'ital@0;1' ? f.name : DEFAULT_BODY;
}

/** The stylesheet URL that loads these families, or null when there are none. */
export function fontStylesheet(names: readonly string[]): string | null {
  const families = [...new Set(names)]
    .map((n) => knownFont(n))
    .filter((f): f is FontEntry => !!f)
    .map((f) => `family=${encodeURIComponent(f.name).replace(/%20/g, '+')}${f.axes ? `:${f.axes}` : ''}`);
  if (!families.length) return null;
  return `https://fonts.googleapis.com/css2?${families.join('&')}&display=swap`;
}

/** The CSS font-family value for a face, with a fallback of its kind. */
export function fontStack(name: string): string {
  const f = knownFont(name);
  const fallback = f?.kind === 'serif' ? 'Georgia, "Times New Roman", serif' : f?.kind === 'mono' ? 'ui-monospace, Menlo, monospace' : 'system-ui, -apple-system, "Segoe UI", sans-serif';
  return `"${f?.name ?? name}", ${fallback}`;
}

/** The list, as one compact line per font, for a prompt. */
export function fontMenu(): string {
  return FONTS.map((f) => `${f.name} (${f.kind}: ${f.note})`).join('; ');
}
