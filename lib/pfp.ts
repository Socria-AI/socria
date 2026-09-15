// lib/pfp.ts
//
// Your picture, composed from the marks Socria already has.
//
// No new glyph was drawn for this. The four brand marks are the real
// components and the node set is the same NodeGlyph the map draws with,
// which is why every option reads as Socria before it reads as a picture.
//
// WHAT IS PURE HERE AND WHY. The tables, the contrast rule and the config
// sanitiser. Everything that decides whether a picture is READABLE lives in
// this file so the suite can hold it: a ground whose ink does not carry on
// it is not a style choice, it is an avatar nobody can make out at 28px, and
// that is not something to discover by looking at a screenshot.

export interface Ground {
  id: string;
  name: string;
  /** the ground colour */
  bg: string;
  /** the ink, PAIRED rather than chosen — see contrastOf */
  ink: string;
  /** Socria One only */
  one?: boolean;
}

/**
 * The grounds, from the palette.
 *
 * Ink is paired with each ground rather than picked separately. Letting
 * somebody choose both is how you get moss on sage: two colours from the
 * same palette, individually correct, illegible together.
 */
export const GROUNDS: Ground[] = [
  { id: 'paper', name: 'Paper', bg: '#F4F1E8', ink: '#20201B' },
  { id: 'moss', name: 'Moss', bg: '#5E7633', ink: '#F4F1E8' },
  { id: 'sage', name: 'Sage', bg: '#9CB874', ink: '#1A2410' },
  { id: 'forest', name: 'Forest', bg: '#1A2410', ink: '#9CB874' },
  { id: 'ink', name: 'Ink', bg: '#20201B', ink: '#F4F1E8' },
  { id: 'prussian', name: 'Prussian', bg: '#26485A', ink: '#B8CDD9', one: true },
  { id: 'deep', name: 'Deep slate', bg: '#0F2430', ink: '#B8CDD9', one: true },
  { id: 'gold', name: 'Gold', bg: '#B8A26B', ink: '#1A2410', one: true },
];

export interface BrandMark {
  id: string;
  name: string;
  kind: 'img' | 'logos' | 'letter' | 'one' | 'node';
  src?: string;
  one?: boolean;
}

export const BRAND_MARKS: BrandMark[] = [
  { id: 'mark', name: 'The mark', kind: 'img', src: '/socria-mark.png' },
  { id: 'logos', name: 'Logos', kind: 'logos' },
  { id: 'letter', name: 'Initial', kind: 'letter' },
  { id: 'one', name: 'The seal', kind: 'one', src: '/socria-one-mark.png', one: true },
];

/** The node marks, by the groups the map already sorts them into. */
export const GROUPS: { id: string; name: string; types: string[] | null }[] = [
  { id: 'brand', name: 'The brand', types: null },
  { id: 'reasoning', name: 'Reasoning', types: ['goal', 'decision', 'value', 'belief', 'idea', 'assumption', 'question', 'tension', 'claim', 'counterpoint', 'consequence', 'inference'] },
  { id: 'evidence', name: 'Evidence', types: ['evidence', 'source', 'concept', 'misconception', 'verification'] },
  { id: 'making', name: 'Making', types: ['theme', 'character', 'constraint', 'milestone'] },
  { id: 'maths', name: 'Mathematics', types: ['given', 'unknown', 'equation', 'definition', 'transformation', 'theorem', 'step', 'result', 'error'] },
];

export const RINGS = [
  { id: 'none', name: 'None' },
  { id: 'ring', name: 'Ring' },
  { id: 'seal', name: 'Seal', one: true },
] as const;

export const TEXTURES = [
  { id: 'none', name: 'Plain' },
  { id: 'grid', name: 'Notebook' },
  { id: 'grain', name: 'Grain' },
] as const;

export interface PfpConfig {
  mark: string;
  ground: string;
  ring: string;
  texture: string;
  /** one or two characters, for the Initial mark */
  letter: string;
}

export const DEFAULT_PFP: PfpConfig = {
  mark: 'mark',
  ground: 'moss',
  ring: 'none',
  texture: 'none',
  letter: 'A',
};

/* ── colour ─────────────────────────────────────────────────────── */

/** sRGB → relative luminance, the WCAG way. */
export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  if (!Number.isFinite(n)) return 0;
  const f = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((v) => v / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
}

/**
 * Whether a colour is dark in its own right.
 *
 * Used for one-off colours. NOT for deciding how to draw on a ground — see
 * takesLightInk, and the note there about why.
 */
export function isDark(hex: string): boolean {
  return luminance(hex) < 0.42;
}

/**
 * Whether this ground is drawn with LIGHT marks on it.
 *
 * Derived from the pair, not from a threshold on the background — and the
 * difference is not academic. Gold (#B8A26B) sits just under a 0.42
 * luminance cut, so a bg-only test calls it dark and inverts the brand mark
 * to light, while the ink paired with gold is #1A2410, which is dark. The
 * two then disagree and the picture is drawn with a light mark and dark text
 * on the same ground.
 *
 * Comparing the ink to the ground instead makes that contradiction
 * unrepresentable: the ink IS the considered decision, so the mark simply
 * follows it. The suite holds every ground to agreeing with itself.
 */
export function takesLightInk(ground: Ground): boolean {
  return luminance(ground.ink) > luminance(ground.bg);
}

/**
 * The WCAG contrast ratio between two colours, 1 to 21.
 *
 * Exported so the suite can hold every ground to a real number rather than
 * to somebody's eye. A mark at 28px in a sidebar is small text by any
 * reasonable reading, and the pairings here are fixed — nobody can choose
 * their way into an unreadable one, which is the whole reason ink is paired.
 */
export function contrastOf(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/* ── lookups, total ─────────────────────────────────────────────── */

export function groundOf(id: unknown): Ground {
  return GROUNDS.find((g) => g.id === id) ?? GROUNDS[0];
}

/** A known brand mark, or a node type treated as one. */
export function markOf(id: unknown): BrandMark {
  const s = typeof id === 'string' ? id : '';
  return BRAND_MARKS.find((m) => m.id === s) ?? { id: s, name: s, kind: 'node' };
}

/** Every node type the picker offers, flattened. */
export function nodeTypes(): string[] {
  return GROUPS.flatMap((g) => g.types ?? []);
}

/**
 * Whether a choice is behind Socria One.
 *
 * Asked of the parts rather than the whole so the picker can dim exactly the
 * swatch that is locked, instead of refusing a configuration after the fact.
 */
export function needsOne(cfg: Pick<PfpConfig, 'mark' | 'ground' | 'ring'>): boolean {
  if (groundOf(cfg.ground).one) return true;
  if (markOf(cfg.mark).one) return true;
  return RINGS.some((r) => r.id === cfg.ring && 'one' in r && r.one === true);
}

/**
 * A configuration that can actually be drawn.
 *
 * Total, and it does NOT reject: an unknown ground becomes the default rather
 * than an error, because this is read from stored state that an older or
 * newer version of the product may have written, and a picture is not worth
 * a broken account page. A free account holding a One choice keeps it in
 * storage and is simply drawn without it — so the picture returns intact if
 * they subscribe, rather than being quietly destroyed on load.
 */
export function sanitizePfp(raw: unknown, opts: { isOne?: boolean } = {}): PfpConfig {
  const r = (raw ?? {}) as Partial<Record<keyof PfpConfig, unknown>>;
  const allowOne = opts.isOne === true;

  const groundId = typeof r.ground === 'string' ? r.ground : '';
  const ground = GROUNDS.find((g) => g.id === groundId && (allowOne || !g.one));

  const markId = typeof r.mark === 'string' ? r.mark : '';
  const brand = BRAND_MARKS.find((m) => m.id === markId);
  const isNode = !brand && nodeTypes().includes(markId);
  const markOk = isNode || (brand && (allowOne || !brand.one));

  const ringId = typeof r.ring === 'string' ? r.ring : '';
  const ring = RINGS.find((x) => x.id === ringId && (allowOne || !('one' in x && x.one)));

  const textureId = typeof r.texture === 'string' ? r.texture : '';
  const texture = TEXTURES.find((x) => x.id === textureId);

  const letter = typeof r.letter === 'string' ? r.letter.trim().slice(0, 2) : '';

  return {
    mark: markOk ? markId : DEFAULT_PFP.mark,
    ground: ground ? ground.id : DEFAULT_PFP.ground,
    ring: ring ? ring.id : DEFAULT_PFP.ring,
    texture: texture ? texture.id : DEFAULT_PFP.texture,
    letter: letter || DEFAULT_PFP.letter,
  };
}

/** Where a picture is kept. Versioned, like every other stored shape here. */
export const PFP_KEY = 'socria.pfp.v1';
