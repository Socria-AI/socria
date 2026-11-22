// lib/ux-v0/dsi/assets.ts — logos, icons, pictures and font files brought into a design system, safely.
//
// Every file is identified by its bytes, never by its name or the type it claims: PNG, JPEG and WebP by their
// signatures (with their pixel size read from the header, nothing decoded), TrueType/OpenType/WOFF by theirs (with
// the family, version, copyright and licence read from the name table), SVG by its markup. An SVG is rebuilt from an
// allowlist of elements and attributes (SocriaUX's own tokenizer, lib/ux-v0/graphics/svgimport.ts): scripts, event
// handlers, foreign objects, external references, entity declarations and unsafe styles never survive, and what was
// removed is said. A raster too small to stand for a logo is marked as a reference, not a master. Each asset is
// hashed (SHA-256 of what is stored). Logos arrive unapproved; once the owner approves one it is protected: SocriaUX
// never redesigns, recolours, crops or distorts it.

import { parseSvgXml } from '../graphics/svgimport';
import { parseCss } from './css-parse';
import { uid, type AssetFormat, type AssetKind, type BrandAsset, type FontMeta, type SourceRef } from './schema';

export const ASSET_LIMITS = { svg: 1_000_000, raster: 10_000_000, font: 5_000_000, inline: 450_000, lowRes: 500 } as const;

// ── bytes ──

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const u16 = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32 = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]);
const le16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const le24 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

/** What a file is, from its bytes. */
export function sniff(bytes: Uint8Array): AssetFormat | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG' && bytes[4] === 0x0d && bytes[5] === 0x0a) return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp';
  if (bytes.length >= 4) {
    const tag = ascii(bytes, 0, 4);
    if (tag === 'wOFF') return 'woff';
    if (tag === 'wOF2') return 'woff2';
    if (tag === 'OTTO') return 'otf';
    if (u32(bytes, 0) === 0x00010000 || tag === 'true') return 'ttf';
  }
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(0, 2048)).replace(/^﻿/, '');
  if (/^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(head)) return 'svg';
  return null;
}

/** A raster's pixel size from its header. */
export function rasterSize(bytes: Uint8Array, format: AssetFormat): { width: number; height: number } | null {
  if (format === 'png' && bytes.length >= 24 && ascii(bytes, 12, 4) === 'IHDR') return { width: u32(bytes, 16), height: u32(bytes, 20) };
  if (format === 'jpeg') {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1];
      const len = u16(bytes, i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: u16(bytes, i + 5), width: u16(bytes, i + 7) };
      if (len < 2) return null;
      i += 2 + len;
    }
    return null;
  }
  if (format === 'webp' && bytes.length >= 30) {
    const chunk = ascii(bytes, 12, 4);
    if (chunk === 'VP8 ') return { width: le16(bytes, 26) & 0x3fff, height: le16(bytes, 28) & 0x3fff };
    if (chunk === 'VP8L' && bytes[20] === 0x2f) {
      const b = bytes.subarray(21, 25);
      return { width: 1 + (((b[1] & 0x3f) << 8) | b[0]), height: 1 + (((b[3] & 0xf) << 10) | (b[2] << 2) | ((b[1] & 0xc0) >> 6)) };
    }
    if (chunk === 'VP8X') return { width: 1 + le24(bytes, 24), height: 1 + le24(bytes, 27) };
  }
  return null;
}

// ── fonts ──

function readName(b: Uint8Array, off: number): Partial<Record<number, string>> {
  const out: Partial<Record<number, string>> = {};
  if (off + 6 > b.length) return out;
  const count = u16(b, off + 2);
  const strings = off + u16(b, off + 4);
  const score = (p: number, e: number, l: number) => (p === 3 && (e === 1 || e === 10) ? (l === 0x409 ? 3 : 2) : p === 1 && e === 0 ? 1 : p === 0 ? 2 : 0);
  const best: Partial<Record<number, number>> = {};
  for (let k = 0; k < Math.min(count, 400); k++) {
    const r = off + 6 + k * 12;
    if (r + 12 > b.length) break;
    const [p, e, l, id, len, so] = [u16(b, r), u16(b, r + 2), u16(b, r + 4), u16(b, r + 6), u16(b, r + 8), u16(b, r + 10)];
    if (![0, 1, 2, 4, 5, 13, 14, 16, 17].includes(id)) continue;
    const sc = score(p, e, l);
    if (!sc || (best[id] ?? 0) >= sc) continue;
    const s0 = strings + so;
    if (s0 + len > b.length) continue;
    let text = '';
    if (p === 3 || p === 0) for (let i = 0; i + 1 < len; i += 2) text += String.fromCharCode(u16(b, s0 + i));
    else text = ascii(b, s0, len);
    best[id] = sc;
    out[id] = text.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 600);
  }
  return out;
}

function sfntMeta(b: Uint8Array, tables: Map<string, { off: number; len: number; data?: Uint8Array }>): FontMeta {
  const nameT = tables.get('name');
  const os2 = tables.get('OS/2');
  const nameBytes = nameT?.data ?? b;
  const names = nameT ? readName(nameBytes, nameT.data ? 0 : nameT.off) : {};
  const osBytes = os2?.data ?? b;
  const osOff = os2 ? (os2.data ? 0 : os2.off) : -1;
  const weight = osOff >= 0 && osOff + 6 <= osBytes.length ? u16(osBytes, osOff + 4) : 400;
  const italic = osOff >= 0 && osOff + 64 <= osBytes.length ? (u16(osBytes, osOff + 62) & 1) === 1 : /italic|oblique/i.test(names[2] ?? '');
  return {
    family: names[16] || names[1] || '',
    subfamily: names[17] || names[2] || '',
    fullName: names[4] || '',
    version: names[5] || '',
    copyright: names[0] || '',
    licence: names[13] || '',
    licenceUrl: names[14] || '',
    weight: weight >= 1 && weight <= 1000 ? weight : 400,
    italic,
  };
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate');
  const stream = new Blob([data as unknown as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A font file's names and weight (TrueType, OpenType, WOFF); WOFF2 is identified but its names are not read. */
export async function fontMeta(bytes: Uint8Array, format: AssetFormat): Promise<FontMeta | null> {
  const tables = new Map<string, { off: number; len: number; data?: Uint8Array }>();
  if (format === 'ttf' || format === 'otf') {
    const n = u16(bytes, 4);
    for (let k = 0; k < Math.min(n, 100); k++) {
      const r = 12 + k * 16;
      if (r + 16 > bytes.length) break;
      tables.set(ascii(bytes, r, 4), { off: u32(bytes, r + 8), len: u32(bytes, r + 12) });
    }
    return sfntMeta(bytes, tables);
  }
  if (format === 'woff') {
    const n = u16(bytes, 12);
    for (let k = 0; k < Math.min(n, 100); k++) {
      const r = 44 + k * 20;
      if (r + 20 > bytes.length) break;
      const tag = ascii(bytes, r, 4);
      if (tag !== 'name' && tag !== 'OS/2') continue;
      const off = u32(bytes, r + 4);
      const comp = u32(bytes, r + 8);
      const orig = u32(bytes, r + 12);
      if (off + comp > bytes.length || orig > 2_000_000) continue;
      const raw = bytes.subarray(off, off + comp);
      tables.set(tag, { off: 0, len: orig, data: comp < orig ? await inflate(raw) : raw });
    }
    return sfntMeta(bytes, tables);
  }
  return null;
}

// ── SVG ──

const ELEMENTS = new Set(['svg', 'g', 'defs', 'symbol', 'use', 'title', 'desc', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'textPath', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'pattern', 'marker', 'image', 'style', 'filter', 'feGaussianBlur', 'feOffset', 'feBlend', 'feColorMatrix', 'feComposite', 'feFlood', 'feMerge', 'feMergeNode', 'feMorphology', 'feDropShadow', 'switch']);
const ATTRS = new Set(
  'id class d x y x1 y1 x2 y2 cx cy r rx ry fx fy fr width height viewBox preserveAspectRatio points transform fill stroke stroke-width stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset stroke-opacity opacity fill-opacity fill-rule clip-rule clip-path mask filter style offset stop-color stop-opacity gradientUnits gradientTransform spreadMethod patternUnits patternContentUnits patternTransform href xlink:href font-family font-size font-weight font-style text-anchor dominant-baseline letter-spacing word-spacing dx dy rotate textLength lengthAdjust display visibility version xmlns xmlns:xlink xml:space clipPathUnits maskUnits maskContentUnits markerWidth markerHeight refX refY orient markerUnits stdDeviation in in2 result mode operator k1 k2 k3 k4 values type flood-color flood-opacity radius color vector-effect shape-rendering paint-order mix-blend-mode isolation aria-label aria-hidden role focusable startOffset method spacing side path enable-background overflow'.split(' '),
);
const STYLE_PROPS = new Set(['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'opacity', 'fill-opacity', 'fill-rule', 'clip-rule', 'clip-path', 'mask', 'filter', 'stop-color', 'stop-opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'word-spacing', 'text-anchor', 'dominant-baseline', 'display', 'visibility', 'isolation', 'mix-blend-mode', 'color', 'flood-color', 'flood-opacity', 'paint-order', 'vector-effect', 'shape-rendering', 'overflow']);
const LOCAL_URL = /^url\(\s*['"]?#[\w:.-]{1,120}['"]?\s*\)$/;
const SAFE_IMAGE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/;

/** A style value that cannot reach outside the drawing (no url() but local references, no expressions, no scripts). */
function safeStyleValue(v: string): boolean {
  const s = v.trim();
  if (/expression\s*\(|javascript:|vbscript:|@import|behavior\s*:|-moz-binding|\\/i.test(s)) return false;
  const urls = s.match(/url\([^)]*\)/gi) ?? [];
  return urls.every((u) => LOCAL_URL.test(u));
}

function cleanStyleAttr(v: string, removed: Map<string, number>): string {
  const out: string[] = [];
  for (const part of v.split(';')) {
    const i = part.indexOf(':');
    if (i <= 0) continue;
    const k = part.slice(0, i).trim().toLowerCase();
    const val = part.slice(i + 1).trim();
    if (STYLE_PROPS.has(k) && safeStyleValue(val) && val.length < 300) out.push(`${k}:${val}`);
    else bump(removed, 'unsafe or unknown style properties');
  }
  return out.join(';');
}

function cleanStylesheet(css: string, removed: Map<string, number>): string {
  const sheet = parseCss(css);
  if (sheet.imports.length) bump(removed, '@import rules');
  const rules: string[] = [];
  for (const r of sheet.rules) {
    if (r.context.length) continue;
    const sels = r.selectors.filter((s) => /^[\w\s.#:,>*+~[\]="'-]{1,200}$/.test(s) && !/javascript|expression/i.test(s));
    if (!sels.length) continue;
    const decls = r.decls.filter((d) => STYLE_PROPS.has(d.prop) && safeStyleValue(d.value)).map((d) => `${d.prop}:${d.value}${d.important ? ' !important' : ''}`);
    if (r.decls.length > decls.length) bump(removed, 'unsafe or unknown style properties');
    if (decls.length) rules.push(`${sels.join(',')}{${decls.join(';')}}`);
  }
  return rules.join('');
}

const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface El {
  name: string;
  attrs: Record<string, string>;
  children: El[];
  text: string;
}

export interface SanitizedSvg {
  svg: string;
  width: number;
  height: number;
  removed: string[];
  colours: string[];
  elements: number;
  /** the drawing is only a raster picture wrapped in SVG */
  rasterOnly: boolean;
}

/** An SVG rebuilt from the allowlist (see the head of this file); throws, saying why, when it cannot be read at all. */
export function sanitizeSvg(src: string): SanitizedSvg {
  if (src.length > ASSET_LIMITS.svg) throw new Error(`That SVG is larger than ${ASSET_LIMITS.svg / 1_000_000} MB.`);
  if (/<!ENTITY/i.test(src)) throw new Error('That SVG declares entities, which SocriaUX does not read (they can hide content or expand without limit).');
  const root = parseSvgXml(src) as unknown as El;
  const removed = new Map<string, number>();
  const colours = new Set<string>();
  let elements = 0;
  let paths = 0;
  let images = 0;
  const note = (v: string) => {
    const m = v.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi);
    m?.forEach((c) => colours.add(c.toLowerCase()));
  };
  const out = (e: El, depth: number): string => {
    if (depth > 40 || elements > 6000) return '';
    const name = e.name.replace(/^svg:/, '');
    // a link around a drawing: the link goes, the drawing stays
    if (name === 'a') {
      bump(removed, 'links (their drawing kept)');
      return e.children.map((c) => out(c, depth + 1)).join('');
    }
    if (!ELEMENTS.has(name)) {
      bump(removed, name === 'script' ? '<script> elements' : name === 'foreignObject' ? '<foreignObject> elements' : `<${name}> elements`);
      return '';
    }
    elements++;
    if (/^(path|rect|circle|ellipse|line|polyline|polygon|text)$/.test(name)) paths++;
    const attrs: string[] = [];
    for (const [k0, v] of Object.entries(e.attrs)) {
      const k = k0;
      if (/^on/i.test(k)) {
        bump(removed, 'event handler attributes');
        continue;
      }
      if (!ATTRS.has(k) && !/^data-[\w-]+$/.test(k)) {
        if (!/^(sodipodi|inkscape|xmlns:\w+|serif|i|x):?/i.test(k)) bump(removed, 'unknown attributes');
        continue;
      }
      if (/^data-/.test(k)) continue;
      if (k === 'href' || k === 'xlink:href') {
        const ok = name === 'image' ? SAFE_IMAGE.test(v) : /^#[\w:.-]{1,120}$/.test(v.trim());
        if (!ok) {
          bump(removed, name === 'image' ? 'external pictures' : 'external references');
          continue;
        }
        if (name === 'image') images++;
      }
      if (k === 'style') {
        const s = cleanStyleAttr(v, removed);
        if (s) attrs.push(`style="${esc(s)}"`), note(s);
        continue;
      }
      if (/^(clip-path|mask|filter|fill|stroke)$/.test(k) && /url\(/i.test(v) && !LOCAL_URL.test(v.trim())) {
        bump(removed, 'external references');
        continue;
      }
      if (/javascript:|vbscript:|data:text|expression\(/i.test(v)) {
        bump(removed, 'unsafe attribute values');
        continue;
      }
      if (k === 'fill' || k === 'stroke' || k === 'stop-color') note(v);
      attrs.push(`${k}="${esc(v.slice(0, 20000))}"`);
    }
    if (name === 'image' && !attrs.some((a) => a.startsWith('href=') || a.startsWith('xlink:href='))) return '';
    if (name === 'use' && !attrs.some((a) => /^(xlink:)?href=/.test(a))) return '';
    if (name === 'style') {
      const css = cleanStylesheet(e.text, removed);
      note(css);
      return css ? `<style>${esc(css).replace(/&gt;/g, '>').replace(/&quot;/g, '"')}</style>` : '';
    }
    if (name === 'svg' && depth === 0 && !attrs.some((a) => a.startsWith('xmlns='))) attrs.unshift('xmlns="http://www.w3.org/2000/svg"');
    const kids = e.children.map((c) => out(c, depth + 1)).join('');
    const text = /^(text|tspan|textPath|title|desc)$/.test(name) ? esc(e.text.slice(0, 2000)) : '';
    const open = `<${name}${attrs.length ? ` ${[...new Set(attrs)].join(' ')}` : ''}`;
    return kids || text ? `${open}>${text}${kids}</${name}>` : `${open}/>`;
  };
  let svg = out(root, 0);
  if (/\sxlink:href=/.test(svg) && !/^<svg[^>]*\sxmlns:xlink=/.test(svg)) svg = svg.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
  const vb = (root.attrs.viewBox ?? '').trim().split(/[\s,]+/).map(Number);
  const num = (s?: string) => (s && /^[\d.]+(px)?$/.test(s.trim()) ? parseFloat(s) : NaN);
  let width = num(root.attrs.width);
  let height = num(root.attrs.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    if (vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0) [width, height] = [vb[2], vb[3]];
    else [width, height] = [Number.isFinite(width) ? width : 300, Number.isFinite(height) ? height : 150];
  }
  return {
    svg,
    width: Math.round(width * 100) / 100,
    height: Math.round(height * 100) / 100,
    removed: [...removed].map(([k, n]) => `${n} ${k}`),
    colours: [...colours].slice(0, 40),
    elements,
    rasterOnly: images > 0 && paths === 0,
  };
}

// ── one asset ──

export interface AssetInput {
  name: string;
  bytes: Uint8Array;
  /** the type the browser or server says it is (checked against the bytes, never trusted) */
  mime?: string;
}

export interface AssetOpts {
  kind?: AssetKind;
  role?: string;
  approved?: boolean;
  now?: number;
  source?: SourceRef;
  licence?: string;
  /** keeps a large file elsewhere (this browser's store) and returns its address, upload:<id> */
  store?: (bytes: Uint8Array, mime: string) => Promise<string | null>;
}

const MIME: Record<AssetFormat, string> = { svg: 'image/svg+xml', png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' };

export function kindFromName(name: string, format: AssetFormat): AssetKind {
  if (['ttf', 'otf', 'woff', 'woff2'].includes(format)) return 'font';
  const n = name.toLowerCase();
  if (/logo|wordmark|logotype|brandmark|lockup|emblem|monogram/.test(n)) return 'logo';
  if (/icon|glyph|pictogram/.test(n)) return 'icon';
  if (/pattern|texture|motif/.test(n)) return 'pattern';
  return 'image';
}

export function logoRoleFromName(name: string): string {
  const n = name.toLowerCase();
  if (/revers|negative|inverse|white|knockout|on-dark|dark-bg/.test(n)) return 'reversed';
  if (/wordmark|logotype|type-only/.test(n)) return 'wordmark';
  if (/symbol|mark(?!et)|icon|glyph|monogram/.test(n) && !/wordmark/.test(n)) return 'mark';
  if (/mono|black|one-colou?r|1c/.test(n)) return 'mono';
  if (/favicon/.test(n)) return 'favicon';
  return 'primary';
}

/** One file as a brand asset (see the head of this file), or why it was refused. */
export async function importAsset(input: AssetInput, opts: AssetOpts = {}): Promise<{ asset: BrandAsset | null; notes: string[]; error?: string }> {
  const notes: string[] = [];
  const format = sniff(input.bytes);
  if (!format) return { asset: null, notes, error: `${input.name} is not a file SocriaUX keeps (SVG, PNG, JPEG, WebP, TTF, OTF or WOFF), whatever its name says.` };
  const claimed = (input.mime ?? '').toLowerCase();
  if (claimed && claimed !== 'application/octet-stream' && !claimed.includes(format === 'jpeg' ? 'jpeg' : format === 'svg' ? 'svg' : format) && !(format.startsWith('woff') || format === 'ttf' || format === 'otf')) notes.push(`${input.name} says it is ${claimed} but its bytes are ${format}; it was read as ${format}.`);
  const now = opts.now ?? Date.now();
  const kind = opts.kind ?? kindFromName(input.name, format);
  const source: SourceRef = opts.source ?? { kind: 'asset', ref: input.name, file: input.name };
  const base = { id: uid('as'), name: input.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 120) || 'Asset', kind, format, mime: MIME[format], version: 1, approved: opts.approved === true, protected: opts.approved === true && kind === 'logo', source, importedAt: now, ...(opts.licence ? { licence: opts.licence.slice(0, 600) } : {}) };
  if (format === 'svg') {
    if (input.bytes.length > ASSET_LIMITS.svg) return { asset: null, notes, error: `${input.name} is larger than ${ASSET_LIMITS.svg / 1_000_000} MB.` };
    let s: SanitizedSvg;
    try {
      s = sanitizeSvg(new TextDecoder().decode(input.bytes));
    } catch (e) {
      return { asset: null, notes, error: `${input.name}: ${e instanceof Error ? e.message : 'not a readable SVG'}` };
    }
    if (s.removed.length) notes.push(`${input.name}: removed ${s.removed.join(', ')}.`);
    if (s.rasterOnly) notes.push(`${input.name} only wraps a raster picture in SVG: it is not a vector logo.`);
    const bytes = new TextEncoder().encode(s.svg);
    return {
      asset: { ...base, vector: !s.rasterOnly, width: s.width, height: s.height, bytes: bytes.length, hash: await sha256Hex(bytes), svg: s.svg, ...(kind === 'logo' ? { role: opts.role ?? logoRoleFromName(input.name) } : opts.role ? { role: opts.role } : {}), ...(s.rasterOnly ? { lowRes: true } : {}), notes: [...(s.removed.length ? [`Sanitized: removed ${s.removed.join(', ')}`] : []), ...(s.colours.length ? [`Colours: ${s.colours.slice(0, 8).join(' ')}`] : [])] },
      notes,
    };
  }
  const isFont = format === 'ttf' || format === 'otf' || format === 'woff' || format === 'woff2';
  const max = isFont ? ASSET_LIMITS.font : ASSET_LIMITS.raster;
  if (input.bytes.length > max) return { asset: null, notes, error: `${input.name} is larger than ${max / 1_000_000} MB.` };
  let src: string | null = null;
  if (input.bytes.length <= ASSET_LIMITS.inline) src = `data:${MIME[format]};base64,${toBase64(input.bytes)}`;
  else if (opts.store) src = await opts.store(input.bytes, MIME[format]);
  if (!src) return { asset: null, notes, error: `${input.name} is too large to keep without this browser’s storage.` };
  const hash = await sha256Hex(input.bytes);
  if (isFont) {
    const meta = await fontMeta(input.bytes, format).catch(() => null);
    if (format === 'woff2') notes.push(`${input.name} is WOFF2: kept, but its names and licence are compressed (Brotli) and were not read.`);
    if (meta && !meta.licence && !meta.licenceUrl) notes.push(`${input.name} carries no licence in its name table: check its licence before using it outside SocriaUX.`);
    notes.push(`${meta?.family || input.name} is kept as a file with its licence details; SocriaUX draws designs with the closest face it can serve.`);
    return { asset: { ...base, kind: 'font', vector: false, bytes: input.bytes.length, hash, src, ...(meta ? { font: meta, ...(meta.licence ? { licence: meta.licence.slice(0, 600) } : {}) } : {}), notes: meta ? [`${meta.family} ${meta.subfamily} · weight ${meta.weight}${meta.version ? ` · ${meta.version}` : ''}`] : [] }, notes };
  }
  const size = rasterSize(input.bytes, format);
  if (!size || !size.width || !size.height) return { asset: null, notes, error: `${input.name}: its header does not say its size; it may be damaged.` };
  const lowRes = kind === 'logo' && Math.max(size.width, size.height) < ASSET_LIMITS.lowRes;
  if (kind === 'logo') notes.push(lowRes ? `${input.name} is a ${size.width}×${size.height} raster: too small to be the logo itself. Kept as a reference; import the vector (SVG) logo for designs.` : `${input.name} is a raster logo (${size.width}×${size.height}); a vector (SVG) original scales better.`);
  return { asset: { ...base, vector: false, width: size.width, height: size.height, bytes: input.bytes.length, hash, src, ...(lowRes ? { lowRes: true } : {}), ...(kind === 'logo' ? { role: opts.role ?? logoRoleFromName(input.name) } : opts.role ? { role: opts.role } : {}), notes: lowRes ? ['Low resolution: a reference, not a master'] : [] }, notes };
}

/** A logo approved by the owner: from now on protected (never redesigned, recoloured, cropped or distorted). */
export function approveAsset(a: BrandAsset, approved: boolean): BrandAsset {
  if (a.lowRes && approved && a.kind === 'logo') return { ...a, approved: false, protected: false, notes: [...a.notes.filter((n) => !n.startsWith('Cannot approve')), 'Cannot approve a low-resolution raster as the logo: import the vector original'].slice(0, 8) };
  return { ...a, approved, protected: approved && a.kind === 'logo' };
}

/** An asset id that is safe as a board or document asset id. */
export const assetDocId = (a: BrandAsset) => `bs${a.hash.slice(0, 14)}`;

/** The asset as an image address products can draw (SVG as a data URL). */
export function assetHref(a: BrandAsset): string | null {
  if (a.svg) return `data:image/svg+xml;base64,${toBase64(new TextEncoder().encode(a.svg))}`;
  return a.src ?? null;
}
