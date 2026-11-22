// lib/ux-v0/refine-local.ts — change one creative decision, keep everything else.
//
// "Keep everything, but change the typography." "Warmer colours." "Reduce the
// motion." "Make the layout more experimental." These are changes to one part
// of a design's look, and they need no model and no regeneration: each is a
// patch to the tokens or the look, applied as a new version that Undo takes
// back, and refused (with the reason) when it would change something the
// designer locked. readAdjust() reads the everyday ways of asking, so a comment
// like the ones above is done at once, in code; anything else still goes to
// the model.

import { hslHex, hslOf, isDark, mix } from './color';
import { languageOf, paletteFor } from './direction';
import { FONTS, knownFont, nearestWeight } from './fonts';
import { stepMotion } from './motion';
import { FRAMES, STILL_MOTION, TREATMENTS, ensureContrast, type DesignSpec, type Look, type Patch } from './spec';

export const ADJUSTS = [
  'type-pairing', 'type-larger', 'type-smaller',
  'colour-warmer', 'colour-cooler', 'colour-contrast', 'colour-dark', 'colour-light',
  'layout-experimental', 'layout-calmer', 'layout-space', 'layout-denser',
  'motion-calmer', 'motion-livelier', 'motion-still', 'motion-more-expressive-hover',
  'imagery-treatment', 'imagery-frame',
] as const;
export type Adjust = (typeof ADJUSTS)[number];

export const ADJUST_LABEL: Record<Adjust, string> = {
  'type-pairing': 'Another type pairing',
  'type-larger': 'A larger type scale',
  'type-smaller': 'A smaller type scale',
  'colour-warmer': 'Warmer colours',
  'colour-cooler': 'Cooler colours',
  'colour-contrast': 'More contrast',
  'colour-dark': 'A dark ground',
  'colour-light': 'A light ground',
  'layout-experimental': 'A more experimental layout',
  'layout-calmer': 'A calmer layout',
  'layout-space': 'More space',
  'layout-denser': 'Denser',
  'motion-calmer': 'Calmer motion',
  'motion-livelier': 'Livelier motion',
  'motion-still': 'No motion',
  'motion-more-expressive-hover': 'More expressive interaction',
  'imagery-treatment': 'Another treatment of pictures',
  'imagery-frame': 'Another frame for pictures',
};

export const ADJUST_GROUPS: [string, Adjust[]][] = [
  ['Type', ['type-pairing', 'type-larger', 'type-smaller']],
  ['Colour', ['colour-warmer', 'colour-cooler', 'colour-contrast', 'colour-dark', 'colour-light']],
  ['Layout', ['layout-experimental', 'layout-calmer', 'layout-space', 'layout-denser']],
  ['Motion', ['motion-calmer', 'motion-livelier', 'motion-still', 'motion-more-expressive-hover']],
  ['Imagery', ['imagery-treatment', 'imagery-frame']],
];

const RATIOS = [1.2, 1.25, 1.333, 1.414, 1.5, 1.618];
const step = <T,>(xs: readonly T[], now: T, d: number) => xs[Math.max(0, Math.min(xs.length - 1, xs.indexOf(now) + d))] ?? now;

/** Turn the accent's hue toward a target, and tint the ground a little toward it. */
function turn(c: DesignSpec['tokens']['colors'], toward: number): DesignSpec['tokens']['colors'] {
  const [h, s, l] = hslOf(c.accent);
  const d = ((toward - h + 540) % 360) - 180;
  const accent = hslHex((h + Math.sign(d) * Math.min(Math.abs(d), 22) + 360) % 360, Math.max(s, 0.35), l);
  const tint = toward < 90 || toward > 330 ? '#f2dcc2' : '#c9d8e8';
  const background = isDark(c.background) ? c.background : mix(c.background, tint, 0.12);
  return {
    ...c,
    accent,
    background,
    text: ensureContrast(c.text, background, 7),
    muted: ensureContrast(c.muted, background, 4.5),
    accentText: ensureContrast(c.accentText, accent, 4.5),
  };
}

/**
 * The patches for one adjustment, or null when there is nothing to change
 * (already at the end of a scale). A pairing comes from the visual language's
 * own faces, so the type stays in character.
 */
export function adjust(spec: DesignSpec, a: Adjust): { patches: Patch[]; label: string } | null {
  const tk = spec.tokens;
  const L = spec.look;
  const m = L.motion ?? STILL_MOTION;
  const label = ADJUST_LABEL[a];
  const look = (x: Partial<Look>): Patch => ({ op: 'look', look: x, summary: label });
  const tokens = (x: Partial<DesignSpec['tokens']>): Patch => ({ op: 'tokens', tokens: x as any, summary: label });
  switch (a) {
    case 'type-pairing': {
      const lang = languageOf(L.language);
      const displays = (lang?.display ?? FONTS.filter((f) => f.kind !== 'mono').map((f) => f.name)).filter((f) => f !== tk.fonts.display);
      const display = displays.find((f) => knownFont(f)?.kind !== knownFont(tk.fonts.display)?.kind) ?? displays[0];
      if (!display) return null;
      const bodies = (lang?.body ?? ['Inter']).filter((f) => f !== display && !knownFont(f)?.displayOnly);
      const body = bodies.find((f) => f !== tk.fonts.body) ?? tk.fonts.body;
      return { patches: [tokens({ fonts: { display, body } }), look({ weight: nearestWeight(display, L.weight) })], label: `${label}: ${display} with ${body}` };
    }
    case 'type-larger':
    case 'type-smaller': {
      const near = RATIOS.reduce((x, y) => (Math.abs(y - L.ratio) < Math.abs(x - L.ratio) ? y : x));
      const next = step(RATIOS, near, a === 'type-larger' ? 1 : -1);
      return next === near ? null : { patches: [look({ ratio: next })], label: `${label} (${next})` };
    }
    case 'colour-warmer':
      return { patches: [tokens({ colors: turn(tk.colors, 28) })], label };
    case 'colour-cooler':
      return { patches: [tokens({ colors: turn(tk.colors, 215) })], label };
    case 'colour-contrast': {
      const c = tk.colors;
      return { patches: [tokens({ colors: { ...c, text: ensureContrast(c.text, c.background, 10), muted: ensureContrast(c.muted, c.background, 7), accentText: ensureContrast(c.accentText, c.accent, 7) } })], label };
    }
    case 'colour-dark':
      return isDark(tk.colors.background) ? null : { patches: [tokens({ colors: paletteFor('dark', tk.colors) })], label };
    case 'colour-light':
      return !isDark(tk.colors.background) ? null : { patches: [tokens({ colors: paletteFor('paper', tk.colors) })], label };
    case 'layout-experimental': {
      const grid: Look['grid'] = L.grid === 'asymmetric' ? 'poster' : L.grid === 'poster' ? 'modular' : 'asymmetric';
      return { patches: [look({ grid, rhythm: 'dramatic', width: 'wide' })], label: `${label} (${grid})` };
    }
    case 'layout-calmer': {
      const grid: Look['grid'] = L.grid === 'editorial' ? 'stack' : 'editorial';
      return { patches: [look({ grid, rhythm: 'even' })], label: `${label} (${grid})` };
    }
    case 'layout-space':
      return tk.scale === 'spacious' ? null : { patches: [tokens({ scale: tk.scale === 'compact' ? 'comfortable' : 'spacious' })], label };
    case 'layout-denser':
      return tk.scale === 'compact' ? null : { patches: [tokens({ scale: tk.scale === 'spacious' ? 'comfortable' : 'compact' })], label };
    case 'motion-calmer':
      return m.feel === 'still' ? null : { patches: [look({ motion: stepMotion(m, -1) })], label };
    case 'motion-livelier':
      return m.feel === 'kinetic' ? null : { patches: [look({ motion: stepMotion(m, 1) })], label };
    case 'motion-still':
      return m.feel === 'still' ? null : { patches: [look({ motion: { ...STILL_MOTION } })], label };
    case 'motion-more-expressive-hover': {
      const order: Look['motion']['hover'][] = ['none', 'underline', 'zoom', 'lift', 'invert'];
      const base = m.feel === 'still' ? stepMotion(m, 1) : m;
      const hover = step(order, base.hover, 1);
      return hover === m.hover && m.feel !== 'still' ? null : { patches: [look({ motion: { ...base, hover } })], label: `${label} (hover: ${hover})` };
    }
    case 'imagery-treatment': {
      const t = TREATMENTS[(TREATMENTS.indexOf(tk.imageTreatment) + 1) % TREATMENTS.length];
      return { patches: [tokens({ imageTreatment: t })], label: `${label} (${t})` };
    }
    case 'imagery-frame': {
      const f = FRAMES[(FRAMES.indexOf(L.frame) + 1) % FRAMES.length];
      return { patches: [look({ frame: f })], label: `${label} (${f})` };
    }
  }
}

/**
 * The adjustments a comment asks for in everyday words, or none (it then goes
 * to the model). "Keep everything, but change the typography" is a pairing;
 * "warmer colours", "reduce the motion", "more experimental layout",
 * "different imagery", "more space", "keep the composition but make the
 * interaction more expressive".
 */
export function readAdjust(words: string): Adjust[] {
  const n = ` ${words.toLowerCase().replace(/[’']/g, "'")} `;
  const out: Adjust[] = [];
  const add = (a: Adjust) => out.includes(a) || out.push(a);
  if (/\b(change|swap|another|different|new) (the )?(typography|type|fonts?|typefaces?|pairing)\b|\btypography\b.*\b(change|different)\b/.test(n)) add('type-pairing');
  if (/\b(bigger|larger|louder) (type|headlines?|typography)\b|\btype scale up\b/.test(n)) add('type-larger');
  if (/\b(smaller|quieter) (type|headlines?|typography)\b/.test(n)) add('type-smaller');
  if (/\bwarm(er)? (colou?rs?|palette|tones?)\b|\bmake it warmer\b/.test(n)) add('colour-warmer');
  if (/\bcool(er)? (colou?rs?|palette|tones?)\b|\bmake it cooler\b/.test(n)) add('colour-cooler');
  if (/\bmore contrast\b|\bhigher contrast\b/.test(n)) add('colour-contrast');
  if (/\b(dark|darker) (mode|ground|background|theme)\b|\bmake it dark\b/.test(n)) add('colour-dark');
  if (/\b(light|lighter) (mode|ground|background|theme)\b/.test(n)) add('colour-light');
  if (/\bmore experimental\b|\b(bolder|braver|less conventional|unconventional) layout\b/.test(n)) add('layout-experimental');
  if (/\b(calmer|simpler|more conventional|quieter) layout\b/.test(n)) add('layout-calmer');
  if (/\bmore (space|white ?space|air|breathing room)\b|\bmore spacious\b/.test(n)) add('layout-space');
  if (/\b(denser|more compact|tighter|less space)\b/.test(n)) add('layout-denser');
  if (/\b(no|stop the|remove the|without) (motion|animation|animations)\b/.test(n)) add('motion-still');
  else if (/\b(reduce|less|calmer|slower|subtler|tone down)( the)? (motion|animation|movement)\b|\bmotion intensity\b.*\b(reduce|lower|down)\b|\breduce the motion intensity\b/.test(n)) add('motion-calmer');
  else if (/\b(more|livelier|bolder|faster|stronger)( the)? (motion|animation|movement)\b|\bmore animated\b/.test(n)) add('motion-livelier');
  if (/\b(interaction|hovers?|interactions) more expressive\b|\bmore expressive (interaction|hovers?|interactions)\b/.test(n)) add('motion-more-expressive-hover');
  if (/\b(change|different|another) (the )?(imagery|image|photo|picture) (direction|treatment|style)\b|\bdifferent imagery\b/.test(n)) add('imagery-treatment');
  if (/\b(another|different) frame\b/.test(n)) add('imagery-frame');
  return out;
}
