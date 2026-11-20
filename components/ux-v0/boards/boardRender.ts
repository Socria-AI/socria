'use client';

// components/ux-v0/boards/boardRender.ts — what a board draws in the browser, and what it exports.
//
// A graphic material is drawn by the Graphics renderer (renderArtboard), its SVG kept per document so a board of
// dozens of materials draws each only when its document changes. A mockup draws its source's SVG inside its scene. A
// website is the real page, sealed in a frame without scripts (renderDesign + buildSandboxDoc), loaded from the
// project store by its id. The overview export is the board as arranged, one SVG with its faces and pictures put in,
// as PNG, PDF or SVG; the MATERIALS export is each material in its own formats, with a manifest by material id.

import { buildSandboxDoc } from '@/lib/ux-v0/sandbox';
import { renderDesign } from '@/lib/ux-v0/render';
import { getProject } from '@/lib/ux-v0/store';
import { currentSpec, type DesignProject } from '@/lib/ux-v0/types';
import { renderArtboard } from '@/lib/ux-v0/graphics/render';
import { embeddedAssets, embeddedFonts, exportBoardImage, rasterize } from '@/lib/ux-v0/graphics/raster';
import { pdfFromPages, svgFile } from '@/lib/ux-v0/graphics/export';
import type { GraphicDoc } from '@/lib/ux-v0/graphics/doc';
import type { Measure } from '@/lib/ux-v0/graphics/text';
import { mockupSvg, SCENE } from '@/lib/ux-v0/boards/mockup';
import { BOARD_FACE, boardFile, boardOverviewSvg, manifestOf, systemOverviewSvg, websiteSchematicSvg, type ManifestEntry, type WebsiteInfo } from '@/lib/ux-v0/boards/export';
import type { BoardState, GraphicMaterial, Material, MockupMaterial } from '@/lib/ux-v0/boards/model';
import { MOCKUP_LABEL } from '@/lib/ux-v0/boards/model';

export type Href = (id: string, src: string) => string;

// ── graphics, drawn once per document ──

const svgCache = new WeakMap<GraphicDoc, Map<string, string>>();

/** The SVG of one artboard of a document (the first by default; its pictures by `href`), kept for as long as the
 * document and the pictures' addresses are. */
export function graphicSvg(doc: GraphicDoc, prefix: string, href: Href, measure?: Measure, artboard = 0): string {
  let per = svgCache.get(doc);
  if (!per) svgCache.set(doc, (per = new Map()));
  const a = doc.artboards[Math.max(0, Math.min(doc.artboards.length - 1, artboard))];
  const pics = doc.assets.map((x) => href(x.id, x.src)).join('|');
  const key = `${prefix}|${a.id}|${pics}`;
  const hit = per.get(key);
  if (hit) return hit;
  const svg = renderArtboard(doc, a, { href, idPrefix: prefix, measure });
  per.set(key, svg);
  return svg;
}

/** A material's source graphic (a mockup's), or null. */
export const sourceOf = (b: BoardState, m: MockupMaterial): GraphicMaterial | null => {
  const src = m.source ? b.materials.find((x) => x.id === m.source!.material) : null;
  return src && src.type === 'graphic' ? src : null;
};

/** A mockup's scene, its source drawn inside it (or the empty scene, said waiting). */
export function mockupScene(b: BoardState, m: MockupMaterial, prefix: string, href: Href, measure?: Measure): { svg: string; w: number; h: number } | null {
  if (!b.system) return null;
  const src = sourceOf(b, m);
  const index = Math.max(0, Math.min((src?.doc?.artboards.length ?? 1) - 1, m.source?.artboard ?? 0));
  const art = src?.doc ? src.doc.artboards[index] : null;
  const s = src?.doc && art ? { svg: graphicSvg(src.doc, `${prefix}s-`, href, measure, index), w: art.width, h: art.height, ground: art.background ?? undefined } : null;
  return mockupSvg(m.template, s, b.system, prefix);
}

/** The words, faces and colours of a website project, for its schematic in exports. */
export function websiteInfo(p: DesignProject | null): WebsiteInfo | null {
  const spec = p ? currentSpec(p) : null;
  if (!p || !spec) return null;
  const hero = spec.sections.find((s) => s.kind === 'hero');
  return { name: p.name || 'Website', title: String(hero?.content?.title ?? spec.title ?? p.name).slice(0, 160), display: spec.tokens.fonts.display, body: spec.tokens.fonts.body, colors: spec.tokens.colors, sections: spec.sections.length };
}

/** A website project's page, sealed for a frame: no scripts, nothing it can reach. */
export function websiteDoc(p: DesignProject, nonce: string): string | null {
  const spec = currentSpec(p);
  if (!spec) return null;
  return buildSandboxDoc(renderDesign(spec, p.moodboard.refs).html, { parse: (h) => new DOMParser().parseFromString(h, 'text/html'), runScripts: false, nonce, inspector: '' }).doc;
}

/** The website projects a board links to, loaded from the store (missing ones said by their absence). */
export async function loadWebsites(b: BoardState): Promise<Map<string, DesignProject>> {
  const out = new Map<string, DesignProject>();
  for (const m of b.materials) {
    if (m.type !== 'website' || !m.projectId || m.projectId === 'pending' || out.has(m.projectId)) continue;
    const p = await getProject(m.projectId).catch(() => null);
    if (p && p.medium !== 'graphic' && p.medium !== 'board') out.set(m.projectId, p);
  }
  return out;
}

/** A material as SVG for the overview: graphics and mockups as themselves, a website as its schematic. */
export function overviewMaterialSvg(b: BoardState, websites: Map<string, DesignProject>, href: Href, measure?: Measure) {
  return (m: Material, prefix: string): { svg: string; w: number; h: number } | null => {
    if (m.type === 'graphic' && m.doc) {
      const a = m.doc.artboards[0];
      return { svg: renderArtboard(m.doc, a, { href, idPrefix: prefix, measure }), w: a.width, h: a.height };
    }
    if (m.type === 'mockup') return mockupScene(b, m, prefix, href, measure);
    if (m.type === 'website') {
      const w = m.view === 'mobile' ? 390 : 1280;
      const h = m.view === 'mobile' ? 844 : 820;
      return { svg: websiteSchematicSvg(websiteInfo(websites.get(m.projectId) ?? null), w, h, m.view === 'mobile'), w, h };
    }
    return null;
  };
}

// ── exports ──

const facesOfBoard = (b: BoardState, websites: Map<string, DesignProject>) => {
  const faces = new Set<string>([BOARD_FACE]);
  if (b.system) faces.add(b.system.tokens.fonts.display).add(b.system.tokens.fonts.body);
  for (const m of b.materials) {
    if (m.type === 'graphic' && m.doc) for (const a of m.doc.artboards) for (const n of a.children) if ('font' in n && typeof n.font === 'string') faces.add(n.font);
    if (m.type === 'graphic' && m.doc) faces.add(m.doc.tokens.fonts.display).add(m.doc.tokens.fonts.body);
    if (m.type === 'website') {
      const info = websiteInfo(websites.get(m.projectId) ?? null);
      if (info) faces.add(info.display).add(info.body);
    }
  }
  return [...faces];
};

/** Every picture of the board's graphics as a data address (for files that load nothing from outside). */
async function boardAssets(b: BoardState, resolve: (src: string) => Promise<Blob | null>): Promise<{ href: Href; missing: string[] }> {
  const map = new Map<string, string>();
  const missing: string[] = [];
  for (const m of b.materials) {
    if (m.type !== 'graphic' || !m.doc) continue;
    const r = await embeddedAssets(m.doc, resolve);
    r.map.forEach((v, k) => map.set(k, v));
    missing.push(...r.missing);
  }
  for (const a of b.assets) {
    if (map.has(a.id)) continue;
    const blob = a.src.startsWith('upload:') ? await resolve(a.src) : null;
    if (blob) map.set(a.id, await new Promise<string>((res) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = () => res('');
      fr.readAsDataURL(blob);
    }));
  }
  return { href: (id, src) => map.get(id) ?? (src.startsWith('upload:') ? '' : src), missing: [...new Set(missing)] };
}

export interface OverviewExport {
  blob: Blob;
  w: number;
  h: number;
  fontsSubstituted: boolean;
  missing: string[];
}

/** The board as arranged (with or without its notes) as PNG, PDF or SVG: the presentation, not the materials. */
export async function exportOverview(b: BoardState, kind: 'png' | 'pdf' | 'svg', opts: { annotations: boolean; websites: Map<string, DesignProject>; resolve: (src: string) => Promise<Blob | null>; measure?: Measure; maxSide?: number }): Promise<OverviewExport> {
  const fonts = await embeddedFonts(facesOfBoard(b, opts.websites));
  const pics = await boardAssets(b, opts.resolve);
  const refHref = (id: string) => pics.href(id, b.assets.find((a) => a.id === id)?.src ?? '');
  const ov = boardOverviewSvg(b, { materialSvg: overviewMaterialSvg(b, opts.websites, pics.href, opts.measure), refHref, annotations: opts.annotations, measure: opts.measure });
  const svg = fonts.css ? ov.svg.replace(/^(<svg[^>]*>)/, `$1<style>${fonts.css}</style>`) : ov.svg;
  if (kind === 'svg') return { blob: new Blob([svg], { type: 'image/svg+xml' }), w: ov.w, h: ov.h, fontsSubstituted: !fonts.ok, missing: pics.missing };
  const cap = opts.maxSide ?? (kind === 'pdf' ? 6000 : 8000);
  const k = Math.min(2, cap / Math.max(ov.w, ov.h));
  const w = Math.round(ov.w * k);
  const h = Math.round(ov.h * k);
  if (kind === 'png') return { blob: await rasterize(svg, w, h, 'image/png', 0.92, b.background.color), w, h, fontsSubstituted: !fonts.ok, missing: pics.missing };
  const jpeg = await rasterize(svg, w, h, 'image/jpeg', 0.9, b.background.color);
  const bytes = pdfFromPages([{ jpeg: new Uint8Array(await jpeg.arrayBuffer()), px: w, py: h, w: ov.w * 0.75, h: ov.h * 0.75, bleed: 0 }], { title: b.brief?.name ?? 'Board' });
  return { blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }), w, h, fontsSubstituted: !fonts.ok, missing: pics.missing };
}

const slugOf = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'material';

/** One material's own files: a graphic as PNG and SVG (and PDF for print), a mockup as PNG, a website as its package. */
export async function materialFiles(b: BoardState, m: Material, ctx: { websites: Map<string, DesignProject>; resolve: (src: string) => Promise<Blob | null>; measure?: Measure; exportSite?: (p: DesignProject) => Promise<Blob | null>; pdf?: (doc: GraphicDoc) => Promise<Blob> }): Promise<{ files: { name: string; blob: Blob; entry: ManifestEntry }[]; notes: string[] }> {
  const base = slugOf(m.name);
  const files: { name: string; blob: Blob; entry: ManifestEntry }[] = [];
  const notes: string[] = [];
  if (m.type === 'graphic') {
    if (!m.doc) return { files, notes: [`${m.name} has no design yet: generate it first.`] };
    const a = m.doc.artboards[0];
    const r = await exportBoardImage(m.doc, a, { type: 'image/png', measure: ctx.measure, resolve: ctx.resolve });
    files.push({ name: `${base}/${base}-${r.w}x${r.h}.png`, blob: r.blob, entry: { file: `${base}/${base}-${r.w}x${r.h}.png`, material: m.id, name: m.name, kind: m.brief.kind, format: m.brief.formats[0], width: a.width, height: a.height, unit: a.unit } });
    const assets = await embeddedAssets(m.doc, ctx.resolve);
    const text = svgFile(m.doc, a, { measure: ctx.measure, href: (id, src) => assets.map.get(id) ?? src, linkFonts: true });
    files.push({ name: `${base}/${base}.svg`, blob: new Blob([text], { type: 'image/svg+xml' }), entry: { file: `${base}/${base}.svg`, material: m.id, name: m.name, kind: m.brief.kind, format: m.brief.formats[0], width: a.width, height: a.height, unit: a.unit } });
    if (a.unit === 'pt' && ctx.pdf) {
      const pdf = await ctx.pdf(m.doc);
      files.push({ name: `${base}/${base}.pdf`, blob: pdf, entry: { file: `${base}/${base}.pdf`, material: m.id, name: m.name, kind: m.brief.kind, format: m.brief.formats[0], width: a.width, height: a.height, unit: a.unit } });
    }
    if (r.fontsSubstituted) notes.push(`${m.name}: a fallback face stood in for one that could not be fetched.`);
  } else if (m.type === 'mockup') {
    const scene = mockupScene(b, m, `x${m.id}-`, () => '', ctx.measure);
    if (!scene) return { files, notes: [`${m.name} has nothing to present yet.`] };
    const fonts = await embeddedFonts(facesOfBoard(b, ctx.websites));
    const src = sourceOf(b, m);
    const pics = src?.doc ? await embeddedAssets(src.doc, ctx.resolve) : null;
    const full = mockupScene(b, m, `x${m.id}-`, (id, s) => pics?.map.get(id) ?? (s.startsWith('upload:') ? '' : s), ctx.measure)!;
    const svg = fonts.css ? full.svg.replace(/^(<svg[^>]*>)/, `$1<style>${fonts.css}</style>`) : full.svg;
    const k = Math.min(2, 4000 / Math.max(full.w, full.h));
    const blob = await rasterize(svg, Math.round(full.w * k), Math.round(full.h * k), 'image/png');
    files.push({ name: `${base}/${base}.png`, blob, entry: { file: `${base}/${base}.png`, material: m.id, name: m.name, kind: `mockup:${m.template}`, width: Math.round(full.w * k), height: Math.round(full.h * k), unit: 'px' } });
  } else if (m.type === 'website') {
    const p = ctx.websites.get(m.projectId);
    if (!p) return { files, notes: [`${m.name}: its website project is not in this browser, so it was left out.`] };
    const zip = ctx.exportSite ? await ctx.exportSite(p) : null;
    if (zip) files.push({ name: `${base}/${slugOf(p.name)}-site.zip`, blob: zip, entry: { file: `${base}/${slugOf(p.name)}-site.zip`, material: m.id, name: m.name, kind: 'website', format: m.view } });
    else notes.push(`${m.name}: the website package could not be made here; export it from the website editor.`);
  }
  return { files, notes };
}

/** Materials (all, or some) in one .zip, each in its folder, with manifest.json naming each file by material id. */
export async function exportMaterialsZip(b: BoardState, ids: readonly string[] | null, ctx: Parameters<typeof materialFiles>[2] & { overview?: boolean }): Promise<{ blob: Blob; count: number; notes: string[] }> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const entries: ManifestEntry[] = [];
  const notes: string[] = [];
  for (const m of b.materials) {
    if (ids && !ids.includes(m.id)) continue;
    const r = await materialFiles(b, m, ctx);
    for (const f of r.files) {
      zip.file(f.name, f.blob);
      entries.push(f.entry);
    }
    notes.push(...r.notes);
  }
  if (ctx.overview) {
    const ov = await exportOverview(b, 'png', { annotations: false, websites: ctx.websites, resolve: ctx.resolve, measure: ctx.measure, maxSide: 6000 });
    zip.file('board-overview.png', ov.blob);
    entries.push({ file: 'board-overview.png', name: 'Board overview (no notes)', kind: 'board-overview', width: ov.w, height: ov.h, unit: 'px' });
  }
  zip.file('board.socriaux-board.json', boardFile(b));
  entries.push({ file: 'board.socriaux-board.json', name: 'The board file', kind: 'board' });
  zip.file('manifest.json', JSON.stringify(manifestOf(b, entries), null, 1));
  return { blob: await zip.generateAsync({ type: 'blob' }), count: entries.filter((e) => e.material).length, notes };
}

/** The system's overview as SVG markup for the board's system node. */
export const systemSvg = (b: BoardState, w: number, h: number, id: string, measure?: Measure) => (b.system ? systemOverviewSvg(b.system, w, h, id, measure) : '');

export { MOCKUP_LABEL, SCENE };
