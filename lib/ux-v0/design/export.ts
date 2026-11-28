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
import { bleedMm, exportPixels, formatOf, pointsOf } from './formats';
import { framePlan, freezeAt, freezeCss } from './motion';
import { ownFamilies, ownFontCss } from './typefaces';
import { faceHeads } from './frame';

/** Whether an artboard is set in any of the company's own fonts (then a standalone file must carry them). */
export const ownFamiliesUsed = (a: Pick<DesignArtboard, 'html'>, tokens: string): boolean => {
  const mine = new Set(ownFamilies().map((f) => f.toLowerCase()));
  return mine.size > 0 && faceHeads(a, tokens).some((f) => mine.has(f.toLowerCase()));
};

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
export function artboardSvg(a: DesignArtboard, tokens: string, o: { fontCss: string; assets: ReadonlyMap<string, string>; background?: string | null; extraCss?: string }): string {
  const parser = new DOMParser();
  const d = parser.parseFromString(`<!doctype html><html><body><div class="sx-root">${scopeFragment(a.html, o.assets)}</div></body></html>`, 'text/html');
  const root = d.body.firstElementChild as HTMLElement;
  const style = d.createElement('style');
  style.textContent = `${o.fontCss}\n${ownFontCss()}\n${baseCss(a.width, a.height, o.background ?? 'transparent').replace(/html,body\{[^}]*\}/, '')}\n${scopeCss(tokens)}${o.extraCss ? `\n${o.extraCss}` : ''}`;
  const holder = d.createElement('div');
  holder.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  holder.setAttribute('style', `width:${a.width}px;height:${a.height}px;overflow:hidden;margin:0;padding:0`);
  holder.appendChild(style);
  holder.appendChild(root);
  const xhtml = new XMLSerializer().serializeToString(holder);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${a.width}" height="${a.height}" viewBox="0 0 ${a.width} ${a.height}"><foreignObject x="0" y="0" width="${a.width}" height="${a.height}">${xhtml}</foreignObject></svg>`;
}

/** An SVG drawn into a canvas of the given size. */
async function drawn(svg: string, w: number, h: number, background: string | null): Promise<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }> {
  // a data address, not an object address: Chromium taints a canvas that draws a foreignObject SVG from a blob:
  // address (found by the browser check), and a tainted canvas cannot be written out
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
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
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('This browser cannot draw the picture.');
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(img, 0, 0, w, h);
  return { canvas, ctx };
}

/** An SVG drawn into a canvas of the given size, as a PNG or JPEG. */
export async function rasterize(svg: string, w: number, h: number, type: 'image/png' | 'image/jpeg', quality = 0.92, background: string | null = null): Promise<Blob> {
  const { canvas } = await drawn(svg, w, h, background ?? (type === 'image/jpeg' ? '#ffffff' : null));
  return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('The picture could not be written.'))), type, quality));
}

/** Every word left out of the drawing (its place kept): what remains is what the words sit on. */
const NO_WORDS = '.sx-root,.sx-root *,.sx-root *::before,.sx-root *::after{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;-webkit-text-stroke-color:transparent!important;text-decoration-color:transparent!important}.sx-root svg text,.sx-root svg tspan{fill:transparent!important;stroke:transparent!important}';

/**
 * The artboard's pixels as drawn with its words left out, small (its longer side at most `maxSide`): what the
 * contrast of words is measured against (contrast.ts). Null when it cannot be drawn or read.
 */
export async function artboardPixels(a: DesignArtboard, tokens: string, assets: ReadonlyMap<string, string>, maxSide = 900): Promise<{ data: Uint8ClampedArray; width: number; height: number; scale: number } | null> {
  try {
    const fonts = await embeddedFonts(facesFor(a, tokens).faces);
    const svg = artboardSvg(a, tokens, { fontCss: fonts.css, assets, background: '#ffffff', extraCss: NO_WORDS });
    const scale = Math.min(1, maxSide / Math.max(a.width, a.height));
    const w = Math.max(1, Math.round(a.width * scale));
    const h = Math.max(1, Math.round(a.height * scale));
    const { ctx } = await drawn(svg, w, h, '#ffffff');
    return { data: ctx.getImageData(0, 0, w, h).data, width: w, height: h, scale };
  } catch {
    return null;
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

export interface PdfPage {
  jpeg: Uint8Array;
  /** the picture's pixels */
  px: number;
  py: number;
  /** the page, in points */
  w: number;
  h: number;
  /** where the picture goes on the page (points, from the bottom-left); absent: it fills the page */
  place?: { x: number; y: number; w: number; h: number };
  /** drawing operators after the picture (crop marks) */
  marks?: string;
  /** where the sheet is cut, and how far the picture runs past it: [x0 y0 x1 y1] in points */
  trimBox?: [number, number, number, number];
  bleedBox?: [number, number, number, number];
}

/** A PDF whose pages are JPEG pictures, each at its exact size in points. */
export function pdfFromPages(pages: readonly PdfPage[], title: string): Uint8Array {
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
    const box = (name: string, b?: [number, number, number, number]) => (b ? ` /${name} [${b.map(f2).join(' ')}]` : '');
    obj(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f2(p.w)} ${f2(p.h)}]${box('BleedBox', p.bleedBox)}${box('TrimBox', p.trimBox)} /Resources << /XObject << /Im${i} ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`);
    const at = p.place ?? { x: 0, y: 0, w: p.w, h: p.h };
    const content = `q ${f2(at.w)} 0 0 ${f2(at.h)} ${f2(at.x)} ${f2(at.y)} cm /Im${i} Do Q${p.marks ? `\n${p.marks}` : ''}`;
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
    // (the company's own font files travel inside the file: whether that is allowed is their licence)
    ownFontCss() && ownFamiliesUsed(a, tokens) ? `<style>${ownFontCss()}</style>` : '',
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

// ── many at once: a folder of pictures, a deck, a prototype ──

/** Artboards as numbered pictures in one ZIP file (a carousel's slides, a campaign's formats). */
export async function artboardsZip(boards: readonly DesignArtboard[], tokens: string, assets: ReadonlyMap<string, string>, o: { type?: 'image/png' | 'image/jpeg'; onProgress?: (done: number, of: number) => void } = {}): Promise<{ blob: Blob; names: string[]; fontsSubstituted: boolean }> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const type = o.type ?? 'image/png';
  const names: string[] = [];
  let subs = false;
  const pad = String(boards.length).length;
  for (let i = 0; i < boards.length; i++) {
    const a = boards[i];
    const p = await artboardPicture(a, tokens, assets, { type, scale: a.medium === 'print' ? 1 : 2, maxSide: 6000 });
    subs ||= p.fontsSubstituted;
    const name = `${String(i + 1).padStart(pad, '0')}-${fileName(a.name)}.${type === 'image/png' ? 'png' : 'jpg'}`;
    names.push(name);
    zip.file(name, await p.blob.arrayBuffer());
    o.onProgress?.(i + 1, boards.length);
  }
  return { blob: await zip.generateAsync({ type: 'blob', compression: 'STORE' }), names, fontsSubstituted: subs };
}

const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * Artboards as one HTML file that is walked through: a deck (arrow keys, click) or a prototype (an element with
 * data-go="<artboard id>" leads to that artboard). Every slide is its own document inside, exactly as designed —
 * live text, its faces linked, its pictures inside. It is a walk-through of designed screens, not a working product.
 */
export function walkthroughHtml(boards: readonly DesignArtboard[], tokens: string, assets: ReadonlyMap<string, string>, o: { title: string; prototype?: boolean }): string {
  const go = `<script>document.addEventListener('click',function(e){var n=e.target;while(n&&n.nodeType===1&&!n.getAttribute('data-go'))n=n.parentNode;if(n&&n.getAttribute){e.preventDefault();parent.postMessage({go:n.getAttribute('data-go')},'*')}else if(${o.prototype ? 'false' : 'true'}){parent.postMessage({next:true},'*')}});<\/script><style>[data-go]{cursor:pointer}</style>`;
  const slides = boards.map((a) => {
    // (the canvas's element ids are taken out of a single-artboard file; here data-go must survive, and it does)
    const doc = artboardHtml({ ...a, medium: 'screen' }, tokens, assets).replace('</body>', `${go}</body>`);
    return `<section data-id="${escAttr(a.id)}" data-w="${a.width}" data-h="${a.height}" aria-label="${escAttr(a.name)}" hidden><iframe title="${escAttr(a.name)}" width="${a.width}" height="${a.height}" srcdoc="${escAttr(doc)}"></iframe></section>`;
  });
  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${o.title.replace(/[<&]/g, '')}</title>`,
    '<style>html,body{margin:0;height:100%;background:#111;overflow:hidden;font:13px/1.4 system-ui,sans-serif;color:#ddd}section{position:absolute;inset:0 0 34px 0;display:grid;place-items:center}section[hidden]{display:none}iframe{border:0;background:#fff;transform-origin:center center}footer{position:absolute;left:0;right:0;bottom:0;height:34px;display:flex;gap:14px;align-items:center;justify-content:center}button{font:inherit;color:#eee;background:none;border:1px solid #555;border-radius:6px;padding:3px 10px;cursor:pointer}</style>',
    '</head><body>',
    ...slides,
    `<footer><button id="prev" aria-label="Previous">←</button><span id="where"></span><button id="next" aria-label="Next">→</button>${o.prototype ? '<span>A click-through of designed screens — not a working product.</span>' : ''}</footer>`,
    `<script>(function(){var s=[].slice.call(document.querySelectorAll('section')),i=0;function fit(){s.forEach(function(x){var f=x.firstChild,w=+x.dataset.w,h=+x.dataset.h,k=Math.min((innerWidth-24)/w,(innerHeight-58)/h,1);f.style.transform='scale('+k+')'})}function show(n){i=Math.max(0,Math.min(s.length-1,n));s.forEach(function(x,j){x.hidden=j!==i});document.getElementById('where').textContent=s[i].getAttribute('aria-label')+' · '+(i+1)+' / '+s.length;location.hash=s[i].dataset.id}document.getElementById('prev').onclick=function(){show(i-1)};document.getElementById('next').onclick=function(){show(i+1)};addEventListener('keydown',function(e){if(e.key==='ArrowRight'||e.key===' ')show(i+1);if(e.key==='ArrowLeft')show(i-1)});addEventListener('message',function(e){var d=e.data||{};if(d.go){var n=s.findIndex(function(x){return x.dataset.id===d.go});if(n>=0)show(n)}else if(d.next)show(i+1)});addEventListener('resize',fit);fit();var h=location.hash.slice(1),at=s.findIndex(function(x){return x.dataset.id===h});show(at>=0?at:0)})();<\/script>`,
    '</body></html>',
  ].join('\n');
}

// ── print: a sheet with bleed and crop marks ──

const MM_PT = 72 / 25.4;

/** Crop marks at a trimmed sheet's four corners, outside the bleed (PDF drawing operators; points from the bottom-left). */
export function cropMarks(trim: [number, number, number, number], bleed: number): string {
  const [x0, y0, x1, y1] = trim;
  const gap = bleed + 1 * MM_PT;
  const len = 4 * MM_PT;
  const lines: [number, number, number, number][] = [];
  for (const x of [x0, x1]) {
    lines.push([x, y0 - gap, x, y0 - gap - len], [x, y1 + gap, x, y1 + gap + len]);
  }
  for (const y of [y0, y1]) {
    lines.push([x0 - gap, y, x0 - gap - len, y], [x1 + gap, y, x1 + gap + len, y]);
  }
  return `q 0.25 w 0 0 0 RG ${lines.map((l) => `${f2(l[0])} ${f2(l[1])} m ${f2(l[2])} ${f2(l[3])} l S`).join(' ')} Q`;
}

/** A print sheet's page: the picture with its bleed, on a page large enough for crop marks, with its trim and bleed boxes. */
export function printPage(p: { jpeg: Uint8Array; px: number; py: number; trimW: number; trimH: number; bleed: number }): PdfPage {
  const margin = p.bleed + 6 * MM_PT;
  const trim: [number, number, number, number] = [margin, margin, margin + p.trimW, margin + p.trimH];
  return {
    jpeg: p.jpeg,
    px: p.px,
    py: p.py,
    w: p.trimW + margin * 2,
    h: p.trimH + margin * 2,
    place: { x: margin - p.bleed, y: margin - p.bleed, w: p.trimW + p.bleed * 2, h: p.trimH + p.bleed * 2 },
    trimBox: trim,
    bleedBox: [trim[0] - p.bleed, trim[1] - p.bleed, trim[2] + p.bleed, trim[3] + p.bleed],
    marks: cropMarks(trim, p.bleed),
  };
}

/** A picture with its edges mirrored outward by `b` pixels on every side: bleed for what was designed to the edge. */
async function withBleed(blob: Blob, w: number, h: number, b: number, quality = 0.93): Promise<{ blob: Blob; w: number; h: number }> {
  const img = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = w + b * 2;
  canvas.height = h + b * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the picture.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, b, b, w, h);
  if (b > 0) {
    const flip = (tx: number, ty: number, sx: number, sy: number, src: [number, number, number, number], dw: number, dh: number) => {
      ctx.save();
      ctx.translate(tx, ty);
      ctx.scale(sx, sy);
      ctx.drawImage(img, src[0], src[1], src[2], src[3], 0, 0, dw, dh);
      ctx.restore();
    };
    flip(b, b, -1, 1, [0, 0, b, h], b, h); // left
    flip(w + b * 2, b, -1, 1, [w - b, 0, b, h], b, h); // right
    flip(b, b, 1, -1, [0, 0, w, b], w, b); // top
    flip(b, h + b * 2, 1, -1, [0, h - b, w, b], w, b); // bottom
    flip(b, b, -1, -1, [0, 0, b, b], b, b);
    flip(w + b * 2, b, -1, -1, [w - b, 0, b, b], b, b);
    flip(b, h + b * 2, -1, -1, [0, h - b, b, b], b, b);
    flip(w + b * 2, h + b * 2, -1, -1, [w - b, h - b, b, b], b, b);
  }
  const out = await new Promise<Blob>((res, rej) => canvas.toBlob((x) => (x ? res(x) : rej(new Error('The picture could not be written.'))), 'image/jpeg', quality));
  return { blob: out, w: canvas.width, h: canvas.height };
}

/**
 * Print sheets as one PDF for a printer: each page the sheet with its bleed (the design's edges carried outward —
 * what was designed to the edge runs past the cut), crop marks, and its trim and bleed boxes. The pictures are RGB:
 * this is not a CMYK file and claims no print standard; a printer converts it, or says what they need.
 */
export async function artboardsPrintPdf(boards: readonly DesignArtboard[], tokens: string, assets: ReadonlyMap<string, string>, title: string): Promise<{ blob: Blob; fontsSubstituted: boolean; pages: { name: string; trimMm: [number, number]; bleedMm: number; ppi: number }[] }> {
  const pages: PdfPage[] = [];
  const said: { name: string; trimMm: [number, number]; bleedMm: number; ppi: number }[] = [];
  let subs = false;
  for (const a of boards) {
    const f = formatOf(a.format);
    // (a sheet that is not one of the print formats is given the usual 3 mm)
    const mm = (f && bleedMm(f)) || 3;
    const p = await artboardPicture(a, tokens, assets, { type: 'image/jpeg', maxSide: 6600, quality: 0.93 });
    subs ||= p.fontsSubstituted;
    const k = p.w / a.width;
    const b = Math.round((mm / 25.4) * 96 * k);
    const sheet = await withBleed(p.blob, p.w, p.h, b);
    pages.push(printPage({ jpeg: new Uint8Array(await sheet.blob.arrayBuffer()), px: sheet.w, py: sheet.h, trimW: pointsOf(a.width), trimH: pointsOf(a.height), bleed: mm * MM_PT }));
    said.push({ name: a.name, trimMm: [Math.round((a.width / 96) * 25.4), Math.round((a.height / 96) * 25.4)], bleedMm: mm, ppi: Math.round(k * 96) });
  }
  return { blob: new Blob([pdfFromPages(pages, title) as BlobPart], { type: 'application/pdf' }), fontsSubstituted: subs, pages: said };
}

// ── motion: frames, a video, a sequence ──

export interface MotionFrames {
  frames: ImageBitmap[];
  fps: number;
  w: number;
  h: number;
  seconds: number;
}

/** An artboard that moves, drawn moment by moment over its length (lib/ux-v0/design/motion.ts): the frames of an export. */
export async function motionFrames(a: DesignArtboard, tokens: string, assets: ReadonlyMap<string, string>, o: { maxSide?: number; onProgress?: (done: number, of: number) => void; signal?: AbortSignal } = {}): Promise<MotionFrames> {
  const seconds = a.seconds ?? 4;
  const plan = framePlan(seconds);
  const fonts = await embeddedFonts(facesFor(a, tokens).faces);
  const k = Math.min(1, (o.maxSide ?? 1080) / Math.max(a.width, a.height));
  // (even sizes: video encoders ask for them)
  const w = Math.max(2, Math.round((a.width * k) / 2) * 2);
  const h = Math.max(2, Math.round((a.height * k) / 2) * 2);
  const frames: ImageBitmap[] = [];
  for (let i = 0; i < plan.times.length; i++) {
    if (o.signal?.aborted) throw new Error('Stopped.');
    const t = plan.times[i];
    const svg = artboardSvg({ ...a, html: freezeAt(a.html, t) }, freezeCss(tokens, t), { fontCss: fonts.css, assets, background: '#ffffff' });
    const { canvas } = await drawn(svg, w, h, '#ffffff');
    frames.push(await createImageBitmap(canvas));
    o.onProgress?.(i + 1, plan.times.length);
  }
  return { frames, fps: plan.fps, w, h, seconds };
}

const VIDEO_TYPES = ['video/mp4;codecs=avc1.42E01E', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

/** The kind of video this browser can record, or null (then only frames can be exported). */
export function videoType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return VIDEO_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

/**
 * The frames as a video, recorded by the browser as they are played back at their own speed (so it takes as long as
 * the video is long). What it is depends on the browser: MP4 (H.264) where it can record one, WebM otherwise — said
 * in what is returned. No sound.
 */
export async function motionVideo(m: MotionFrames, o: { signal?: AbortSignal } = {}): Promise<{ blob: Blob; mime: string; ext: 'mp4' | 'webm' }> {
  const mime = videoType();
  if (!mime) throw new Error('This browser cannot record video. Export the frames instead.');
  const canvas = document.createElement('canvas');
  canvas.width = m.w;
  canvas.height = m.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the frames.');
  ctx.drawImage(m.frames[0], 0, 0);
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.min(16_000_000, Math.max(2_500_000, m.w * m.h * 6)) });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((res, rej) => {
    rec.onstop = () => res();
    rec.onerror = () => rej(new Error('The video could not be recorded.'));
  });
  rec.start();
  const step = 1000 / m.fps;
  const t0 = performance.now();
  for (let i = 0; i < m.frames.length; i++) {
    if (o.signal?.aborted) break;
    ctx.drawImage(m.frames[i], 0, 0);
    track.requestFrame?.();
    const wait = t0 + (i + 1) * step - performance.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
  rec.stop();
  await done;
  stream.getTracks().forEach((t) => t.stop());
  if (o.signal?.aborted) throw new Error('Stopped.');
  const blob = new Blob(chunks, { type: mime.split(';')[0] });
  if (!blob.size) throw new Error('The video came out empty.');
  return { blob, mime, ext: mime.startsWith('video/mp4') ? 'mp4' : 'webm' };
}

/** The frames as numbered PNGs in one ZIP file (for an editor that assembles sequences). */
export async function motionZip(m: MotionFrames, name: string): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const canvas = document.createElement('canvas');
  canvas.width = m.w;
  canvas.height = m.h;
  const ctx = canvas.getContext('2d')!;
  const pad = String(m.frames.length).length;
  for (let i = 0; i < m.frames.length; i++) {
    ctx.drawImage(m.frames[i], 0, 0);
    const png = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('A frame could not be written.'))), 'image/png'));
    zip.file(`${fileName(name)}-${String(i + 1).padStart(pad, '0')}.png`, await png.arrayBuffer());
  }
  zip.file('README.txt', `${name}\n${m.frames.length} frames at ${m.fps} frames a second (${m.seconds} s), ${m.w} × ${m.h} px.\n`);
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}
