// lib/ux-v0/design/typefaces.ts — the faces a design is set in: which are real here, the company's own, and
// the same design tried in others.
//
// A FACE IS DRAWN AS ITSELF OR SAID NOT TO BE. A design names its faces; SocriaUX can draw the ones in its library
// (served as web fonts) and the ones the company has given as font files (its own, kept with their licence as the
// file states it). Any other name is drawn by the browser in a fallback — which is a different typeface. That is
// never passed over: each face on an artboard is listed with what is really drawing it (faceStatus), the designer is
// told (flow.ts), and a brand's guidelines say so (guidelines.ts).
//
// THE COMPANY'S OWN FONTS are registered here once for the page (setOwnFonts) and reach every frame, picture and
// file an artboard is drawn as: the canvas, a look, a PDF, a video frame. A standalone HTML export carries the font
// file inside it — the person is told, because whether that is allowed is the font's licence, not SocriaUX's.
//
// THE SAME DESIGN IN OTHER FACES (swapFace) is made by code, not by a model: one face is replaced wherever the
// artboard uses it — in its own styles, and by overriding, on the copy alone, any shared property that carries it —
// and nothing else is touched. The person picks the faces to try; none is suggested.

import type { BrandAsset } from '../dsi/schema';
import { graphicFont } from '../fonts';
import type { DesignArtboard } from './doc';

export interface OwnFont {
  family: string;
  weight: number;
  italic: boolean;
  /** the file, as a data address */
  data: string;
  format: 'truetype' | 'opentype' | 'woff' | 'woff2';
  /** the licence as the file states it ('' when it states none) */
  licence: string;
}

let own: { css: string; fonts: OwnFont[] } = { css: '', fonts: [] };

const FORMAT: Record<string, OwnFont['format']> = { ttf: 'truetype', otf: 'opentype', woff: 'woff', woff2: 'woff2' };

/** A font file of the library as a face a design can name, given its bytes as a data address. */
export function ownFontOf(a: BrandAsset, data: string): OwnFont | null {
  if (a.kind !== 'font' || !/^data:/.test(data) || !FORMAT[a.format]) return null;
  // (a WOFF2 keeps its names compressed: then the file's own name says the family, its weight and whether it slants —
  // "Kalam-700", "CormorantGaramond-500-italic")
  const named = /^(.*?)[-_ ]?(\d{3}|thin|light|regular|medium|semibold|bold|black)?(?:[-_ ]?(italic))?$/i.exec(a.name.trim());
  const words: Record<string, number> = { thin: 100, light: 300, regular: 400, medium: 500, semibold: 600, bold: 700, black: 900 };
  const family = (a.font?.family || named?.[1] || a.name).replace(/["'\\{};<>]/g, '').replace(/[-_]+$/, '').trim().slice(0, 80);
  if (!family) return null;
  const weight = a.font?.weight ?? (named?.[2] ? words[named[2].toLowerCase()] ?? Number(named[2]) : 400);
  return { family, weight: Math.min(1000, Math.max(1, Math.round(weight || 400))), italic: a.font ? a.font.italic === true : !!named?.[3], data, format: FORMAT[a.format], licence: (a.font?.licence || a.licence || '').slice(0, 300) };
}

/** @font-face rules for the company's own fonts. */
export const fontFaceCss = (fonts: readonly OwnFont[]): string => fonts.map((f) => `@font-face{font-family:'${f.family}';font-weight:${f.weight};font-style:${f.italic ? 'italic' : 'normal'};font-display:block;src:url(${f.data}) format('${f.format}')}`).join('\n');

/** The company's own fonts for this page: from now on every frame and export draws with them. */
export function setOwnFonts(fonts: readonly OwnFont[]): void {
  own = { css: fontFaceCss(fonts), fonts: [...fonts] };
}
export const ownFontCss = (): string => own.css;
export const ownFamilies = (): string[] => [...new Set(own.fonts.map((f) => f.family))];
export const ownFonts = (): readonly OwnFont[] => own.fonts;

export interface FaceStatus {
  name: string;
  /** what is really drawing it */
  by: 'library' | 'own' | 'fallback';
  note: string;
}

/** Each face named, with what really draws it (see the head of this file). */
export function faceStatus(names: readonly string[], fonts: readonly OwnFont[] = own.fonts): FaceStatus[] {
  return names.map((name) => {
    const mine = fonts.filter((f) => f.family.toLowerCase() === name.toLowerCase());
    if (mine.length) {
      const lic = mine.find((f) => f.licence)?.licence;
      return { name, by: 'own', note: `Your font file${mine.length > 1 ? `s (${mine.length} styles)` : ''}. ${lic ? `Its licence, as the file states it: ${lic.slice(0, 140)}${lic.length > 140 ? '…' : ''}` : 'The file states no licence: check what yours allows before publishing with it.'}` };
    }
    const lib = graphicFont(name);
    if (lib) return { name: lib.name, by: 'library', note: 'Drawn as itself, from the font library (open licence; served as a web font).' };
    return { name, by: 'fallback', note: `Not in the font library: the browser draws it only if this computer happens to have it, and otherwise a fallback, which is a different typeface — so it will not look the same everywhere, nor in what you export. Add ${name}’s font file to the company’s library, or choose a face from the library.` };
  });
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const generic = (name: string): string => (graphicFont(name)?.kind === 'serif' ? 'serif' : graphicFont(name)?.kind === 'mono' ? 'monospace' : 'sans-serif');

/**
 * The artboard's HTML with one face replaced by another wherever it is the face asked for first (see the head of
 * this file). `tokens` are read, never changed: a shared property that carries the face is overridden on this
 * artboard alone.
 */
export function swapFace(a: Pick<DesignArtboard, 'html'>, tokens: string, from: string, to: string): string {
  const f = esc(from.trim());
  const next = `'${to.replace(/['"\\]/g, '')}', ${generic(to)}`;
  // a list of faces that begins with `from` (quoted or not), up to the end of the declaration
  const head = `(?:"${f}"|'${f}'|&quot;${f}&quot;|${f})(?=\\s*[,;}"!]|\\s*$)(?:\\s*,[^;}"]*)?`;
  let html = a.html
    .replace(new RegExp(`(font-family\\s*:\\s*)${head}`, 'gi'), `$1${next}`)
    .replace(new RegExp(`(font\\s*:[^;}{]*?\\d(?:px|pt|em|rem|%|vw|vh)(?:\\s*/\\s*[\\d.]+\\w*)?\\s+)${head}`, 'gi'), `$1${next}`)
    .replace(new RegExp(`(--[\\w-]+\\s*:\\s*)${head}`, 'gi'), `$1${next}`)
    .replace(new RegExp(`(font-family\\s*=\\s*")${f}(?:\\s*,[^"]*)?(")`, 'gi'), `$1${to.replace(/"/g, '')}, ${generic(to)}$2`);
  // shared properties that carry the face: overridden here, on this artboard alone
  const shared = [...tokens.matchAll(new RegExp(`(--[\\w-]+)\\s*:\\s*${head}`, 'gi'))].map((m) => m[1]);
  if (shared.length) {
    const rule = `<style>.sx-root{${[...new Set(shared)].map((n) => `${n}:${next}`).join(';')}}</style>`;
    // (after the artboard's own first <style>, so it wins over the shared styles and reads as part of the artboard)
    html = /<\/style>/i.test(html) ? html.replace(/<\/style>/i, `</style>${rule}`) : `${rule}${html}`;
  }
  return html;
}
