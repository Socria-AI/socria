'use client';
// lib/ux-v0/graphics/raster.ts — a graphic as pixels, in the browser: PNG, JPEG and the pages of a PDF.
//
// The browser draws the same SVG the canvas shows into a canvas of the export's size. An SVG drawn as a picture may
// not load anything from outside itself, so first everything it needs is put inside it: each picture as a data
// address, each face as a data address in an @font-face rule (fetched once from Google Fonts and kept). What cannot be
// fetched (offline, a picture whose server refuses) is said in the result: a fallback face stood in, a picture was
// left out. Nothing here leaves the browser except those fetches.

import { graphicFontStylesheet } from '../fonts';
import type { Artboard, GraphicDoc } from './doc';
import { facesOf, pageSize, pdfFromPages, type PdfPage } from './export';
import { exportPixels } from './formats';
import { renderArtboard } from './render';
import type { Measure } from './text';

const fontCache = new Map<string, string>();
const assetCache = new Map<string, string>();

async function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

/** @font-face rules for the faces, with the font files inside; and whether every face could be fetched. */
export async function embeddedFonts(faces: readonly string[]): Promise<{ css: string; ok: boolean }> {
  const url = graphicFontStylesheet(faces);
  if (!url) return { css: '', ok: true };
  if (fontCache.has(url)) return { css: fontCache.get(url)!, ok: true };
  try {
    const res = await fetch(url);
    if (!res.ok) return { css: '', ok: false };
    let css = await res.text();
    const files = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]))];
    for (const f of files) {
      const r = await fetch(f);
      if (!r.ok) return { css: '', ok: false };
      css = css.split(f).join(await toDataUrl(await r.blob()));
    }
    fontCache.set(url, css);
    return { css, ok: true };
  } catch {
    return { css: '', ok: false };
  }
}

/** Each picture of a document as a data address (uploads through `resolve`), and the ones that could not be. */
export async function embeddedAssets(doc: GraphicDoc, resolve: (src: string) => Promise<Blob | null>): Promise<{ map: Map<string, string>; missing: string[] }> {
  const map = new Map<string, string>();
  const missing: string[] = [];
  for (const a of doc.assets) {
    if (a.src.startsWith('data:')) {
      map.set(a.id, a.src);
      continue;
    }
    const key = a.src;
    if (assetCache.has(key)) {
      map.set(a.id, assetCache.get(key)!);
      continue;
    }
    try {
      const blob = a.src.startsWith('upload:') ? await resolve(a.src) : await fetch(a.src, { mode: 'cors' }).then((r) => (r.ok ? r.blob() : null));
      if (!blob) throw new Error('missing');
      const url = await toDataUrl(blob);
      assetCache.set(key, url);
      map.set(a.id, url);
    } catch {
      missing.push(a.name);
    }
  }
  return { map, missing };
}

/** An SVG drawn into a canvas of the given size, as a PNG or JPEG. */
export async function rasterize(svg: string, w: number, h: number, type: 'image/png' | 'image/jpeg', quality = 0.92, background: string | null = null): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('The design could not be drawn as a picture.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot draw the picture.');
    if (background || type === 'image/jpeg') {
      ctx.fillStyle = background ?? '#ffffff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('The picture could not be written.'))), type, quality));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface RasterResult {
  blob: Blob;
  w: number;
  h: number;
  /** a fallback face stood in for one the design uses */
  fontsSubstituted: boolean;
  /** pictures that could not be put in */
  missing: string[];
}

/** One artboard as a PNG or JPEG, at its export size times `scale` (print at its resolution). */
export async function exportBoardImage(doc: GraphicDoc, board: Artboard, opts: { type: 'image/png' | 'image/jpeg'; scale?: number; transparent?: boolean; bleed?: boolean; measure?: Measure; resolve: (src: string) => Promise<Blob | null>; maxSide?: number }): Promise<RasterResult> {
  const fonts = await embeddedFonts(facesOf(doc));
  const assets = await embeddedAssets(doc, opts.resolve);
  const b = opts.transparent ? { ...board, background: null } : board;
  const svg = renderArtboard(doc, b, { measure: opts.measure, href: (id, src) => assets.map.get(id) ?? src, fontCss: fonts.css, bleed: opts.bleed, idPrefix: `x${board.id}-` });
  const bleedExtra = opts.bleed ? board.bleed * 2 : 0;
  const px = exportPixels({ ...board, width: board.width + bleedExtra, height: board.height + bleedExtra }, opts.scale ?? 1);
  // very large print sizes are capped (memory), said by the size returned
  const cap = opts.maxSide ?? 8000;
  const k = Math.min(1, cap / Math.max(px.w, px.h));
  const w = Math.round(px.w * k);
  const h = Math.round(px.h * k);
  const blob = await rasterize(svg, w, h, opts.type, 0.92, opts.transparent ? null : opts.type === 'image/jpeg' ? board.background ?? '#ffffff' : null);
  return { blob, w, h, fontsSubstituted: !fonts.ok, missing: assets.missing };
}

/** Artboards as one PDF, a page each at its exact size (see lib/ux-v0/graphics/export.ts). */
export async function exportPdf(doc: GraphicDoc, boards: readonly Artboard[], opts: { bleed?: boolean; measure?: Measure; resolve: (src: string) => Promise<Blob | null> }): Promise<{ blob: Blob; fontsSubstituted: boolean; missing: string[] }> {
  const pages: PdfPage[] = [];
  let subs = false;
  const missing = new Set<string>();
  for (const b of boards) {
    const r = await exportBoardImage(doc, b, { type: 'image/jpeg', bleed: opts.bleed, measure: opts.measure, resolve: opts.resolve, maxSide: 6000 });
    subs ||= r.fontsSubstituted;
    r.missing.forEach((m) => missing.add(m));
    const size = pageSize(b, !!opts.bleed);
    pages.push({ jpeg: new Uint8Array(await r.blob.arrayBuffer()), px: r.w, py: r.h, w: size.w, h: size.h, bleed: size.bleed });
  }
  const bytes = pdfFromPages(pages, { title: doc.name });
  return { blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }), fontsSubstituted: subs, missing: [...missing] };
}

/** The browser's real text measure (the canvas's measureText, the face loaded), cached per font and run. */
export function canvasMeasure(): Measure {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const ctx = canvas?.getContext('2d') ?? null;
  const cache = new Map<string, number>();
  return (text, font, weight, size, italic) => {
    if (!ctx) return text.length * size * 0.55;
    const key = `${font}|${weight}|${italic ? 1 : 0}|${text}`;
    let w1 = cache.get(key);
    if (w1 === undefined) {
      ctx.font = `${italic ? 'italic ' : ''}${weight} 100px "${font}", system-ui, sans-serif`;
      w1 = ctx.measureText(text).width / 100;
      if (cache.size > 20000) cache.clear();
      cache.set(key, w1);
    }
    return w1 * size;
  };
}
