// lib/ux-v0/fonts.ts — the typefaces SocriaUX v0 may choose, and how to load them.
//
// The model names fonts; it never invents them. A name outside this list is
// replaced by the nearest default of its kind, so a brief or a spec can only
// ever ask for a face that exists and that Google Fonts will serve. Each entry
// carries the axis request Google's CSS2 API accepts for that family — a
// request for a weight a static family does not have is refused outright,
// which is why the weights are written per family rather than assumed (every
// request below was checked against the API). `weights` is what the family
// really has, so a look that asks for weight 800 of a face that stops at 700
// is drawn at 700, never synthesised; `italic` says whether a true italic is
// loaded, so emphasis is never a slanted roman.

export type FontKind = 'serif' | 'sans' | 'mono';

export interface FontEntry {
  name: string;
  kind: FontKind;
  /** the CSS2 axis query; empty for a single-style family */
  axes: string;
  /** a word on its character, offered to the model so it can choose deliberately */
  note: string;
  /** the weights it has: a range [min, max] for a variable family, or the list for a static one */
  weights: readonly number[];
  variable?: boolean;
  /** a true italic is loaded */
  italic?: boolean;
  /** drawn for headlines only: never set as running text */
  displayOnly?: boolean;
}

const V = (min: number, max: number) => ({ weights: [min, max], variable: true });

export const FONTS: readonly FontEntry[] = [
  // serifs
  { name: 'Instrument Serif', kind: 'serif', axes: 'ital@0;1', note: 'condensed editorial display serif, one weight', weights: [400], italic: true, displayOnly: true },
  { name: 'Fraunces', kind: 'serif', axes: 'ital,wght@0,300..900;1,300..900', note: 'soft, characterful old-style display serif', ...V(300, 900), italic: true },
  { name: 'Playfair Display', kind: 'serif', axes: 'ital,wght@0,400..900;1,400..900', note: 'high-contrast classic display serif', ...V(400, 900), italic: true },
  { name: 'DM Serif Display', kind: 'serif', axes: 'ital@0;1', note: 'robust, warm display serif, one weight', weights: [400], italic: true, displayOnly: true },
  { name: 'Cormorant Garamond', kind: 'serif', axes: 'ital,wght@0,300..700;1,300..700', note: 'delicate, refined Garamond for luxury; at 500, Socria’s own voice', ...V(300, 700), italic: true },
  { name: 'Libre Baskerville', kind: 'serif', axes: 'ital,wght@0,400;0,700;1,400', note: 'sturdy book serif, very readable', weights: [400, 700], italic: true },
  { name: 'Lora', kind: 'serif', axes: 'ital,wght@0,400..700;1,400..700', note: 'calligraphic, friendly text serif', ...V(400, 700), italic: true },
  { name: 'Newsreader', kind: 'serif', axes: 'ital,wght@0,300..700;1,300..700', note: 'journalistic text serif', ...V(300, 700), italic: true },
  { name: 'Source Serif 4', kind: 'serif', axes: 'ital,wght@0,300..800;1,300..800', note: 'neutral, professional text serif', ...V(300, 800), italic: true },
  { name: 'EB Garamond', kind: 'serif', axes: 'ital,wght@0,400..800;1,400..800', note: 'classical Garamond for long reading', ...V(400, 800), italic: true },
  { name: 'Bodoni Moda', kind: 'serif', axes: 'ital,wght@0,400..900;1,400..900', note: 'fashion-magazine Didone', ...V(400, 900), italic: true },
  { name: 'Young Serif', kind: 'serif', axes: '', note: 'chunky, confident heading serif, one weight', weights: [400], displayOnly: true },
  { name: 'Old Standard TT', kind: 'serif', axes: 'ital,wght@0,400;0,700;1,400', note: 'nineteenth-century scholarly serif', weights: [400, 700], italic: true },
  { name: 'Spectral', kind: 'serif', axes: 'ital,wght@0,300;0,400;0,600;1,300;1,400', note: 'quiet screen-first literary serif', weights: [300, 400, 600], italic: true },
  { name: 'IBM Plex Serif', kind: 'serif', axes: 'ital,wght@0,400;0,600;1,400', note: 'engineered, institutional serif', weights: [400, 600], italic: true },
  { name: 'Gloock', kind: 'serif', axes: '', note: 'sharp high-contrast poster serif, one weight', weights: [400], displayOnly: true },
  // sans
  { name: 'Inter', kind: 'sans', axes: 'wght@100..900', note: 'neutral UI sans, excellent at small sizes', ...V(100, 900) },
  { name: 'DM Sans', kind: 'sans', axes: 'wght@100..900', note: 'geometric, low-contrast, friendly', ...V(100, 900) },
  { name: 'Manrope', kind: 'sans', axes: 'wght@200..800', note: 'modern semi-rounded grotesk', ...V(200, 800) },
  { name: 'Space Grotesk', kind: 'sans', axes: 'wght@300..700', note: 'technical grotesk with quirks', ...V(300, 700) },
  { name: 'Work Sans', kind: 'sans', axes: 'wght@100..900', note: 'plain, open grotesk', ...V(100, 900) },
  { name: 'Plus Jakarta Sans', kind: 'sans', axes: 'wght@200..800', note: 'contemporary, product-friendly sans', ...V(200, 800) },
  { name: 'IBM Plex Sans', kind: 'sans', axes: 'wght@100..700', note: 'engineered corporate sans', ...V(100, 700) },
  { name: 'Outfit', kind: 'sans', axes: 'wght@100..900', note: 'clean geometric display sans', ...V(100, 900) },
  { name: 'Sora', kind: 'sans', axes: 'wght@100..800', note: 'wide, techy geometric sans', ...V(100, 800) },
  { name: 'Archivo', kind: 'sans', axes: 'wght@100..900', note: 'grotesk with presence in headlines', ...V(100, 900) },
  { name: 'Public Sans', kind: 'sans', axes: 'wght@100..900', note: 'civic, strong, neutral', ...V(100, 900) },
  { name: 'Karla', kind: 'sans', axes: 'wght@200..800', note: 'quirky small grotesk', ...V(200, 800) },
  { name: 'Syne', kind: 'sans', axes: 'wght@400..800', note: 'art-gallery display sans', ...V(400, 800) },
  { name: 'Bricolage Grotesque', kind: 'sans', axes: 'wght@200..800', note: 'expressive contemporary grotesque', ...V(200, 800) },
  { name: 'Geist', kind: 'sans', axes: 'wght@100..900', note: 'precise contemporary grotesk; Socria’s interface face', ...V(100, 900) },
  { name: 'Instrument Sans', kind: 'sans', axes: 'wght@400..700', note: 'crisp, slightly narrow neo-grotesk', ...V(400, 700) },
  { name: 'Hanken Grotesk', kind: 'sans', axes: 'wght@100..900', note: 'warm, open grotesk', ...V(100, 900) },
  { name: 'Familjen Grotesk', kind: 'sans', axes: 'wght@400..700', note: 'idiosyncratic Scandinavian grotesk', ...V(400, 700) },
  { name: 'Unbounded', kind: 'sans', axes: 'wght@200..900', note: 'wide, rounded display sans for loud headlines', ...V(200, 900), displayOnly: true },
  { name: 'Anton', kind: 'sans', axes: '', note: 'tall condensed poster sans, one heavy weight', weights: [400], displayOnly: true },
  { name: 'Big Shoulders Display', kind: 'sans', axes: 'wght@400..900', note: 'industrial condensed display sans', ...V(400, 900), displayOnly: true },
  // mono
  { name: 'IBM Plex Mono', kind: 'mono', axes: 'wght@400;500;600', note: 'engineered mono', weights: [400, 500, 600] },
  { name: 'JetBrains Mono', kind: 'mono', axes: 'wght@100..800', note: 'developer mono', ...V(100, 800) },
  { name: 'Space Mono', kind: 'mono', axes: 'wght@400;700', note: 'retro geometric mono', weights: [400, 700] },
  { name: 'Geist Mono', kind: 'mono', axes: 'wght@100..900', note: 'precise contemporary mono', ...V(100, 900) },
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

/** A body face from what was asked (never a display-only face), else the default. */
export function bodyFont(name: unknown): string {
  const f = knownFont(name);
  return f && !f.displayOnly ? f.name : DEFAULT_BODY;
}

/** The weight a family can really draw nearest to the one asked. */
export function nearestWeight(name: string, want: number): number {
  const f = knownFont(name);
  if (!f) return Math.max(100, Math.min(900, Math.round(want / 100) * 100));
  if (f.variable) return Math.max(f.weights[0], Math.min(f.weights[1], Math.round(want / 50) * 50));
  return [...f.weights].sort((a, b) => Math.abs(a - want) - Math.abs(b - want))[0];
}

/** Whether the family has a true italic loaded. */
export function hasItalic(name: string): boolean {
  return !!knownFont(name)?.italic;
}

/** The stylesheet URL that loads these families, or null when there are none. */
export function fontStylesheet(names: readonly string[]): string | null {
  const families = [...new Set(names)]
    .map((n) => knownFont(n))
    .filter((f): f is FontEntry => !!f)
    .map((f) => `family=${encodeURIComponent(f.name).replace(/%20/g, '+')}${f.axes ? `:${f.axes}` : ''}`);
  if (!families.length) return null;
  return `https://fonts.googleapis.com/css2?${[...new Set(families)].join('&')}&display=swap`;
}

/** The CSS font-family value for a face, with a fallback of its kind. */
export function fontStack(name: string): string {
  const f = knownFont(name);
  const fallback = f?.kind === 'serif' ? 'Georgia, "Times New Roman", serif' : f?.kind === 'mono' ? 'ui-monospace, Menlo, monospace' : 'system-ui, -apple-system, "Segoe UI", sans-serif';
  return `"${f?.name ?? name}", ${fallback}`;
}

/** The list, as one compact line per font, for a prompt. */
export function fontMenu(): string {
  return FONTS.map((f) => `${f.name} (${f.kind}${f.displayOnly ? ', headlines only' : ''}: ${f.note})`).join('; ');
}
