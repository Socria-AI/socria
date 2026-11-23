'use client';
// lib/ux-v0/design/export.ts — an artboard as a picture, a PDF, an SVG or an HTML file, in the browser.
//
// THE SAME HTML. A picture is taken by putting the artboard's HTML (scoped exactly as its frame scopes it, frame.ts)
// into an SVG <foreignObject>, with its faces and pictures inside as data, and drawing that SVG on a canvas. Nothing
// is re-laid-out by another engine: the browser that drew the frame draws the picture.
//
// What can differ from the frame, and is said: a face that could not be fetched stands in with its fallback
// (`fontsSubstituted`); a picture that could not be read is left out (`missing`). An SVG export is the same
// foreignObject document: it opens in browsers, not in vector editors (said in the menu that offers it).

import { graphicFontStylesheet } from '../fonts';
import type { DesignArtboard } from './doc';
import { baseCss, facesFor, scopeCss, scopeFragment } from './frame';
import { exportPixels, formatOf, pointsOf } from './formats';

const fontCache = new Map<string, string>();

export async function toDataUrl(blob: Blob): Promise<string> {
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

/** The artboard as an SVG document whose content is its HTML (see the head of this file). */
export function artboardSvg(a: DesignArtboard, tokens: string, o: { fontCss: string; assets: ReadonlyMap<string, string>; background?: string | null }): string {
  const parser = new DOMParser();
  const d = parser.parseFromString(`<!doctype html><html><body><div class="sx-root">${scopeFragment(a.html, o.assets)}</div></body></html>`, 'text/html');
  const root = d.body.firstElementChild as HTMLElement;
  const style = d.createElement('style');
  style.textContent = `${o.fontCss}\n${baseCss(a.width, a.height, o.background ?? 'transparent').replace(/html,body\{[^}]*\}/, '')}\n${scopeCss(tokens)}`;
  const holder = d.createElement('div');
  holder.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  holder.setAttribute('style', `width:${a.width}px;height:${a.height}px;overflow:hidden;margin:0;padding:0`);
  holder.appendChild(style);
  holder.appendChild(root);
  const xhtml = new XMLSerializer().serializeToString(holder);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${a.width}" height="${a.height}" viewBox="0 0 ${a.width} ${a.height}"><foreignObject x="0" y="0" width="${a.width}" height="${a.height}">${xhtml}</foreignObject></svg>`;
}

/** An SVG drawn into a canvas of the given size, as a PNG or JPEG. */
export async function rasterize(svg: string, w: number, h: number, type: 'image/png' | 'image/jpeg', quality = 0.92, background: string | null = null): Promise<Blob> {
  // a data address, not an object address: Chromium taints a canvas that draws a foreignObject SVG from a blob:
  // address (found by the browser check), and a tainted canvas cannot be written out
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('The design could not be drawn as a picture.'));
      img.src = url;
    });
    // (the faces are inside the SVG as data: give the decoder a moment to apply them)
    await new Promise((r) => setTimeout(r, 30));
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
  }
}

export interface Pictured {
  blob: Blob;
  w: number;
  h: number;
  fontsSubstituted: boolean;
}

/** One artboard as a PNG or JPEG: at its export size (print at its resolution), times `scale`, at most `maxSide`. */
export async function artboardPicture(a: DesignArtboard, tokens: string, assets: ReadonlyMap<string, string>, o: { type: 'image/png' | 'image/jpeg'; scale?: number; maxSide?: number; quality?: number; transparent?: boolean }): Promise<Pictured> {
  const fonts = await embeddedFonts(facesFor(a, tokens).faces);
  const svg = artboardSvg(a, tokens, { fontCss: fonts.css, assets, background: o.transparent ? null : '#ffffff' });
  const f = formatOf(a.format);
  const px = exportPixels({ width: a.width, height: a.height, medium: a.medium, dpi: f?.dpi ?? 72 }, o.scale ?? 1);
  const cap = o.maxSide ?? 8000;
  const k = Math.min(1, cap / Math.max(px.w, px.h));
  const w = Math.max(1, Math.round(px.w * k));
  const h = Math.max(1, Math.round(px.h * k));
  const blob = await rasterize(svg, w, h, o.type, o.quality ?? 0.92, o.transparent ? null : '#ffffff');
  return { blob, w, h, fontsSubstituted: !fonts.ok };
}

/** A picture small enough to send to the designer for a look (a data address). */
export async function lookPicture(a: DesignArtboard, tokens: string, assets: ReadonlyMap<string, string>): Promise<string | null> {
  try {
    for (const side of [1100, 820, 600]) {
      const p = await artboardPicture(a, tokens, assets, { type: 'image/jpeg', maxSide: side, quality: 0.82 });
      if (p.blob.size <= 850_000) return toDataUrl(p.blob);
    }
  } catch {
    /* the look is skipped: said by the caller */
  }
  return null;
}

// ── PDF ──

const enc = new TextEncoder();
const pdfStr = (s: string) => `(${s.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, '?')})`;
const f2 = (v: number) => (Math.round(v * 100) / 100).toString();

/** A PDF whose pages are JPEG pictures, each at its exact size in points. */
export function pdfFromPages(pages: readonly { jpeg: Uint8Array; px: number; py: number; w: number; h: number }[], title: string): Uint8Array {
  if (!pages.length) throw new Error('A PDF needs at least one page.');
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (b: Uint8Array) => {
    chunks.push(b);
    length += b.length;
  };
  const text = (s: string) => push(enc.encode(s));
  const obj = (id: number, body: string | Uint8Array[]) => {
    offsets[id] = length;
    text(`${id} 0 obj\n`);
    if (typeof body === 'string') text(body);
    else for (const b of body) push(b);
    text('\nendobj\n');
  };
  text('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  const pageIds = pages.map((_, i) => 4 + i * 3);
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  obj(3, `<< /Title ${pdfStr(title)} /Producer (SocriaUX) /Creator (SocriaUX) >>`);
  pages.forEach((p, i) => {
    const id = pageIds[i];
    obj(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f2(p.w)} ${f2(p.h)}] /Resources << /XObject << /Im${i} ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`);
    const content = `q ${f2(p.w)} 0 0 ${f2(p.h)} 0 0 cm /Im${i} Do Q`;
    obj(id + 1, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    obj(id + 2, [enc.encode(`<< /Type /XObject /Subtype /Image /Width ${p.px} /Height ${p.py} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`), p.jpeg, enc.encode('\nendstream')]);
  });
  const xref = length;
  const size = 4 + pages.length * 3;
  let table = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let i = 1; i < size; i++) table += `${String(offsets[i] ?? 0).padStart(10, '0')} 00000 n \n`;
  text(`${table}trailer\n<< /Size ${size} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** Artboards as one PDF, a page each at its exact size. */
export async function artboardsPdf(boards: readonly DesignArtboard[], tokens: string, assets: ReadonlyMap<string, string>, title: string): Promise<{ blob: Blob; fontsSubstituted: boolean }> {
  const pages = [];
  let subs = false;
  for (const a of boards) {
    const p = await artboardPicture(a, tokens, assets, { type: 'image/jpeg', maxSide: 7000, quality: 0.93 });
    subs ||= p.fontsSubstituted;
    pages.push({ jpeg: new Uint8Array(await p.blob.arrayBuffer()), px: p.w, py: p.h, w: pointsOf(a.width), h: pointsOf(a.height) });
  }
  return { blob: new Blob([pdfFromPages(pages, title) as BlobPart], { type: 'application/pdf' }), fontsSubstituted: subs };
}

/** The artboard as a standalone HTML file (its faces linked, its pictures inside). */
export function artboardHtml(a: DesignArtboard, tokens: string, assets: ReadonlyMap<string, string>): string {
  const fonts = facesFor(a, tokens);
  const page = a.medium === 'web';
  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    `<meta name="viewport" content="width=${page ? 'device-width' : a.width}, initial-scale=1">`,
    `<title>${a.name.replace(/[<&]/g, '')}</title>`,
    fonts.href ? `<link rel="stylesheet" href="${fonts.href}">` : '',
    `<style>${page ? `html,body{margin:0;padding:0}.sx-root{position:relative;width:${a.width}px;max-width:100%;min-height:${a.height}px;margin:0 auto}.sx-root *,.sx-root *::before,.sx-root *::after{box-sizing:border-box}` : baseCss(a.width, a.height)}</style>`,
    tokens ? `<style>${scopeCss(tokens)}</style>` : '',
    '</head><body>',
    `<div class="sx-root">${scopeFragment(a.html, assets).replace(/\sdata-sx="e\d+"/g, '')}</div>`,
    '</body></html>',
  ]
    .filter(Boolean)
    .join('\n');
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const fileName = (s: string) => s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'design';
