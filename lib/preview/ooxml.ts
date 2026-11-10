// lib/preview/ooxml.ts — the inside of an Office file, opened in the browser to be DRAWN.
//
// The server reads .docx/.xlsx/.pptx into a reading (lib/docs) — the text Socria
// reasons with. The preview opens the very same file again, here, to draw it the
// way the application that made it would: cells in their grid, shapes where they
// sit on the slide. Nothing here is sent anywhere.
//
// A zip is opened with JSZip; the XML is read by the same forgiving tree reader the
// server uses (lib/docs/xml.ts). Limits are kept because a file can be malformed or
// hostile, and the tab that opened it is the one that would pay.
//
// PURE apart from JSZip (which runs in Node as well, for the tests).

import JSZip from 'jszip';
import { attr, kids, parseXml, type XNode } from '@/lib/docs/xml';

/** Entries looked at in one archive. */
export const MAX_ENTRIES = 4000;
/** The most text read out of one part. */
export const MAX_PART_CHARS = 24 * 1024 * 1024;

export class PreviewError extends Error {}

export interface Package {
  /** a part's text, or null when it is not there */
  text(path: string): Promise<string | null>;
  /** a part's XML tree, or null */
  xml(path: string): Promise<XNode | null>;
  /** a part's bytes, or null */
  bytes(path: string): Promise<Uint8Array | null>;
  has(path: string): boolean;
  paths(): string[];
}

/** Open an Office file. Throws a PreviewError a person can read when it is not one. */
export async function openPackage(data: ArrayBuffer | Uint8Array): Promise<Package> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new PreviewError('This file is damaged or is not the kind of file its name says.');
  }
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  if (names.length > MAX_ENTRIES) throw new PreviewError('This file holds more parts than a preview opens.');
  const lower = new Map(names.map((n) => [n.toLowerCase(), n]));
  const real = (p: string) => lower.get(p.replace(/^\/+/, '').toLowerCase());
  const cache = new Map<string, XNode | null>();
  const text = async (p: string) => {
    const n = real(p);
    if (!n) return null;
    const s = await zip.files[n].async('string');
    if (s.length > MAX_PART_CHARS) throw new PreviewError('A part of this file is too large to draw here.');
    return s;
  };
  return {
    text,
    async xml(p) {
      const key = real(p) ?? p;
      if (cache.has(key)) return cache.get(key)!;
      const s = await text(p);
      const tree = s === null ? null : parseXml(s);
      cache.set(key, tree);
      return tree;
    },
    async bytes(p) {
      const n = real(p);
      return n ? zip.files[n].async('uint8array') : null;
    },
    has: (p) => !!real(p),
    paths: () => names,
  };
}

export interface Rel {
  id: string;
  type: string;
  target: string;
  external: boolean;
}

/** Where a part's relationships are: word/document.xml → word/_rels/document.xml.rels. */
export function relsPathOf(part: string): string {
  const i = part.lastIndexOf('/');
  return `${part.slice(0, i + 1)}_rels/${part.slice(i + 1)}.rels`;
}

/** A target relative to a part, as a path inside the package. */
export function resolveTarget(part: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const base = part.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') base.pop();
    else if (seg && seg !== '.') base.push(seg);
  }
  return base.join('/');
}

/** A part's relationships by id, their targets resolved. */
export async function relsOf(pkg: Package, part: string): Promise<Map<string, Rel>> {
  const out = new Map<string, Rel>();
  const tree = await pkg.xml(relsPathOf(part));
  const root = tree ? kids(tree)[0] : undefined;
  for (const r of kids(root, 'Relationship')) {
    const id = attr(r, 'Id');
    const target = attr(r, 'Target');
    if (!id || !target) continue;
    const external = attr(r, 'TargetMode') === 'External';
    out.set(id, { id, type: (attr(r, 'Type') ?? '').split('/').pop() ?? '', target: external ? target : resolveTarget(part, target), external });
  }
  return out;
}

/** The document's root element (the first element under the synthetic root). */
export const rootOf = (tree: XNode | null): XNode | undefined => (tree ? kids(tree)[0] : undefined);

/** A local name without its prefix: "a:srgbClr" → "srgbClr". */
export const local = (name: string) => name.slice(name.indexOf(':') + 1);

/** Children by local name, whatever the prefix. */
export const kidsL = (n: XNode | undefined, name: string): XNode[] => (n ? kids(n).filter((c) => local(c.name) === name) : []);
export const kidL = (n: XNode | undefined, name: string): XNode | undefined => kidsL(n, name)[0];

/** A media part's type, by its extension — what a picture is drawn as. */
export function mimeOfPath(path: string): string | null {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff' } as Record<string, string>)[ext] ?? null;
}

// ── colour ──────────────────────────────────────────────────────────

/** "FF1F4E79" (ARGB) or "1F4E79" → "#1F4E79". */
export function hexColor(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const m = /^(?:[0-9a-f]{2})?([0-9a-f]{6})$/i.exec(v.trim());
  return m ? `#${m[1].toUpperCase()}` : undefined;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

/** A colour's luminance changed as DrawingML says: lumMod and lumOff, in 1/100000ths. */
export function lum(hex: string, mod?: number, off?: number): string {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  const l2 = Math.max(0, Math.min(1, l * (mod ?? 1) + (off ?? 0)));
  return toHex(...hslToRgb(h, s, l2));
}

/** A spreadsheet tint: toward white (positive) or black (negative). */
export function tint(hex: string, t: number): string {
  if (!t) return hex;
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  const l2 = t < 0 ? l * (1 + t) : l * (1 - t) + t;
  return toHex(...hslToRgb(h, s, l2));
}

/** Shade and tint as DrawingML writes them (a:shade, a:tint), in 1/100000ths. */
export function shadeTint(hex: string, shade?: number, tnt?: number): string {
  let [r, g, b] = hexToRgb(hex);
  if (shade !== undefined) [r, g, b] = [r * shade, g * shade, b * shade];
  if (tnt !== undefined) [r, g, b] = [r + (255 - r) * (1 - tnt), g + (255 - g) * (1 - tnt), b + (255 - b) * (1 - tnt)];
  return toHex(r, g, b);
}

/** A theme's colour scheme: dk1, lt1, dk2, lt2, accent1–6, hlink, folHlink → "#RRGGBB". */
export async function themeColors(pkg: Package, themePath: string | undefined): Promise<Record<string, string>> {
  const out: Record<string, string> = { dk1: '#000000', lt1: '#FFFFFF', dk2: '#44546A', lt2: '#E7E6E6', accent1: '#4472C4', accent2: '#ED7D31', accent3: '#A5A5A5', accent4: '#FFC000', accent5: '#5B9BD5', accent6: '#70AD47', hlink: '#0563C1', folHlink: '#954F72' };
  if (!themePath) return out;
  const tree = await pkg.xml(themePath);
  const scheme = tree ? findL(tree, 'clrScheme') : undefined;
  for (const c of scheme ? kids(scheme) : []) {
    const v = kids(c)[0];
    if (!v) continue;
    const hex = local(v.name) === 'srgbClr' ? hexColor(attr(v, 'val')) : local(v.name) === 'sysClr' ? hexColor(attr(v, 'lastClr')) : undefined;
    if (hex) out[local(c.name)] = hex;
  }
  return out;
}

/** The first descendant with a local name. */
export function findL(n: XNode | undefined, name: string): XNode | undefined {
  if (!n) return undefined;
  for (const c of kids(n)) {
    if (local(c.name) === name) return c;
    const f = findL(c, name);
    if (f) return f;
  }
  return undefined;
}

/** Every descendant with a local name. */
export function findAllL(n: XNode | undefined, name: string, out: XNode[] = []): XNode[] {
  if (!n) return out;
  for (const c of kids(n)) {
    if (local(c.name) === name) out.push(c);
    findAllL(c, name, out);
  }
  return out;
}
