// lib/ux-v0/design/pins.ts — typography and colour the person has said to keep, checked on what is made after.
//
// "I love this typography — keep it while exploring different compositions" is not a lock on elements: the
// composition is free, the faces are not. A pin holds the faces (by name) or the colours (hex) taken from an artboard
// at the moment the person said so. Everything made or changed afterwards is read for the faces it is set in and the
// colours it uses; what falls outside is said — to the designer's look at its own work (so it is corrected) and, if it
// is still there, to the person. Nothing is recoloured or re-set by code: a pin is a check, never a rewrite.
//
// A colour counts as kept when it is one of the kept colours, a tint or shade of one (the same hue, lighter or
// darker), or a neutral when a neutral was kept. Faces are compared by name.

import { parseColour } from '../dsi/colour';
import type { DesignArtboard, DesignPins } from './doc';
import { faceHeads } from './frame';

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n * 255))).toString(16).padStart(2, '0');

/**
 * What an artboard is really made of: its own HTML, and the shared custom properties it uses (directly, or through
 * another property's value) written out — so a face or a colour that reaches it through var() is read too, and one
 * the shared styles hold but this artboard never uses is not.
 */
export function effectiveCss(a: Pick<DesignArtboard, 'html'>, tokens: string): string {
  const html = a.html.replace(/data:[a-z/+.-]+;base64,[A-Za-z0-9+/=]+/gi, '');
  const defs = new Map<string, string>();
  for (const m of tokens.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) defs.set(m[1], m[2].trim());
  const used = new Set<string>();
  const want = (text: string) => {
    for (const m of text.matchAll(/var\(\s*(--[\w-]+)/g)) {
      if (used.has(m[1])) continue;
      used.add(m[1]);
      want(defs.get(m[1]) ?? '');
    }
  };
  want(html);
  const shared = [...used].filter((k) => defs.has(k)).map((k) => `${k}:${defs.get(k)}`);
  return shared.length ? `${html}\n:root{${shared.join(';')}}` : html;
}

/** The colours an artboard uses: written in its styles, inline styles and SVG attributes, or reaching it by var(). */
export function coloursUsed(a: Pick<DesignArtboard, 'html'>, tokens: string): string[] {
  const out = new Set<string>();
  const add = (v: string) => {
    const c = parseColour(v);
    if (!c || c.a === 0) return;
    out.add(`#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`);
  };
  const src = effectiveCss(a, tokens);
  for (const m of src.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) add(m[0]);
  for (const m of src.matchAll(/\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\([^()]*\)/gi)) add(m[0]);
  for (const m of src.matchAll(/(?:^|[\s:;,"'(])(white|black)(?=[\s;,"')!]|$)/gi)) add(m[1].toLowerCase());
  return [...out];
}

/** The faces an artboard is set in: the head of each list it writes, or that reaches it by var(). */
export const facesUsed = (a: Pick<DesignArtboard, 'html'>, tokens: string): string[] => faceHeads({ html: effectiveCss(a, tokens) }, '');

const rgbOf = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];

/** Hue (degrees) and how much colour there is (0–1), from RGB. */
function hueChroma(h: string): { hue: number; chroma: number; light: number } {
  const [r, g, b] = rgbOf(h).map((v) => v / 255);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const c = mx - mn;
  let hue = 0;
  if (c > 0) {
    if (mx === r) hue = ((g - b) / c) % 6;
    else if (mx === g) hue = (b - r) / c + 2;
    else hue = (r - g) / c + 4;
    hue = (hue * 60 + 360) % 360;
  }
  return { hue, chroma: c, light: (mx + mn) / 2 };
}

const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

/** Whether a colour belongs with the kept ones (see the head of this file). */
export function colourKept(colour: string, kept: readonly string[]): boolean {
  const c = hueChroma(colour);
  const [r, g, b] = rgbOf(colour);
  for (const k of kept) {
    const [kr, kg, kb] = rgbOf(k);
    if (Math.hypot(r - kr, g - kg, b - kb) <= 28) return true;
    const kc = hueChroma(k);
    // a neutral beside a kept neutral; a tint or shade of a kept colour (the same hue)
    if (c.chroma < 0.08 && kc.chroma < 0.08) return true;
    if (c.chroma >= 0.08 && kc.chroma >= 0.08 && hueGap(c.hue, kc.hue) <= 14) return true;
  }
  return false;
}

/** What to keep, taken from an artboard as it is. */
export function pinsFrom(a: Pick<DesignArtboard, 'html'>, tokens: string, what: 'faces' | 'colours'): DesignPins {
  return what === 'faces' ? { faces: facesUsed(a, tokens).slice(0, 8) } : { colours: coloursUsed(a, tokens).slice(0, 16) };
}

export const mergePins = (a: DesignPins | undefined, b: DesignPins): DesignPins => ({ ...(a ?? {}), ...b });

/** What an artboard does against what was kept, in words — or nothing. */
export function pinNotes(a: Pick<DesignArtboard, 'html'>, tokens: string, pins: DesignPins | undefined): string[] {
  if (!pins) return [];
  const out: string[] = [];
  if (pins.faces?.length) {
    const kept = new Set(pins.faces.map((f) => f.toLowerCase()));
    const off = facesUsed(a, tokens).filter((f) => !kept.has(f.toLowerCase()));
    if (off.length) out.push(`set in ${off.join(', ')}, outside the typefaces the person said to keep (${pins.faces.join(', ')})`);
  }
  if (pins.colours?.length) {
    const off = coloursUsed(a, tokens).filter((c) => !colourKept(c, pins.colours!));
    if (off.length) out.push(`uses ${off.slice(0, 6).join(', ')}, outside the colours the person said to keep (${pins.colours.join(', ')})`);
  }
  return out;
}
