// lib/docs/sanitize.ts — a document that crossed the wire, made safe to hold.
//
// A SourceDoc is made on the server, but it travels: to the browser, back with
// every turn, into storage, to the other person in a shared line of thinking.
// Anything that crossed the wire is untrusted, so it is re-read here: shapes
// checked, kinds and flags from their lists, ids well formed and unique, every
// size capped, and every reference (a block's table, a figure) pointing at
// something that exists — or dropped.
//
// What a document SAYS is never trusted either, but that is a different
// matter: its text is data and only ever reaches a model inside a fence that
// says so (lib/docs/render.ts). This file guarantees its shape.
//
// PURE.

import {
  BLOCK_FLAGS,
  BLOCK_KINDS,
  CHART_KINDS,
  CHECK_IDS,
  DOC_FORMATS,
  FIGURE_KINDS,
  READ_METHODS,
  type BlockFlag,
  type Box,
  type DocBlock,
  type DocCheck,
  type DocFigure,
  type DocPage,
  type DocTable,
  type SourceDoc,
} from './types';

export const DOC_LIMITS = {
  name: 160,
  title: 300,
  pages: 1000,
  blocks: 6000,
  blockText: 8000,
  /** characters of block text across the whole document */
  text: 400_000,
  tables: 120,
  rows: 400,
  cols: 30,
  cell: 400,
  figures: 200,
  caption: 600,
  described: 1500,
  checks: 24,
  checkSays: 400,
  refs: 40,
} as const;

const L = DOC_LIMITS;
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\u0000/g, '').slice(0, max) : '');
const int = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null);
const frac = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= -0.01 && v <= 1.01;

export const DOC_ID = /^[0-9a-f]{16}$/;
export const BLOCK_ID = /^p\d{1,4}\.\d{1,5}$/;
const PART_ID = /^[tf]\d{1,4}$/;

function box(v: unknown): Box | undefined {
  if (!Array.isArray(v) || v.length !== 4 || !v.every(frac)) return undefined;
  const [x0, y0, x1, y1] = v as number[];
  if (!(x1 >= x0 && y1 >= y0)) return undefined;
  const c = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 10000) / 10000;
  return [c(x0), c(y0), c(x1), c(y1)];
}

function flags(v: unknown): BlockFlag[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = [...new Set(v.filter((f): f is BlockFlag => (BLOCK_FLAGS as readonly string[]).includes(f as string)))];
  return out.length ? out : undefined;
}

const method = (v: unknown) => ((READ_METHODS as readonly string[]).includes(v as string) ? (v as DocBlock['method']) : 'text');
const conf = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1 ? Math.round(v * 100) / 100 : undefined);

function table(raw: unknown, pages: number): DocTable | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' && PART_ID.test(r.id) && r.id.startsWith('t') ? r.id : null;
  const page = int(r.page, 1, pages);
  if (!id || !page || !Array.isArray(r.rows)) return null;
  const rows = r.rows
    .slice(0, L.rows)
    .filter(Array.isArray)
    .map((row) => (row as unknown[]).slice(0, L.cols).map((c) => str(typeof c === 'number' ? String(c) : c, L.cell)));
  if (!rows.length) return null;
  const head = int(r.head, 0, Math.min(5, rows.length)) ?? 0;
  const caption = str(r.caption, L.caption).trim();
  return {
    id,
    page,
    rows,
    head,
    ...(caption ? { caption } : {}),
    ...(box(r.box) ? { box: box(r.box) } : {}),
    method: method(r.method),
    ...(conf(r.conf) !== undefined ? { conf: conf(r.conf) } : {}),
    ...(flags(r.flags) ? { flags: flags(r.flags) } : {}),
  };
}

function figure(raw: unknown, pages: number, tableIds: Set<string>): DocFigure | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' && PART_ID.test(r.id) && r.id.startsWith('f') ? r.id : null;
  const page = int(r.page, 1, pages);
  if (!id || !page) return null;
  const caption = str(r.caption, L.caption).trim();
  const alt = str(r.alt, L.caption).trim();
  const described = str(r.described, L.described).trim();
  const table = typeof r.table === 'string' && tableIds.has(r.table) ? r.table : undefined;
  const kind = (FIGURE_KINDS as readonly string[]).includes(r.kind as string) ? (r.kind as DocFigure['kind']) : undefined;
  const chart = kind === 'chart' && (CHART_KINDS as readonly string[]).includes(r.chart as string) ? (r.chart as DocFigure['chart']) : undefined;
  return {
    id,
    page,
    ...(kind ? { kind } : {}),
    ...(chart ? { chart } : {}),
    ...(caption ? { caption } : {}),
    ...(alt ? { alt } : {}),
    ...(described ? { described } : {}),
    ...(table ? { table } : {}),
    ...(box(r.box) ? { box: box(r.box) } : {}),
    method: method(r.method),
  };
}

function page(raw: unknown): DocPage | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const n = int(r.n, 1, L.pages);
  if (!n) return null;
  const m = r.method === 'none' ? 'none' : method(r.method);
  const ocr = r.ocr === 'needed' || r.ocr === 'done' || r.ocr === 'failed' ? r.ocr : 'none';
  const size = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 20000 ? Math.round(v * 10) / 10 : undefined);
  return {
    n,
    ...(size(r.w) ? { w: size(r.w) } : {}),
    ...(size(r.h) ? { h: size(r.h) } : {}),
    method: m,
    chars: int(r.chars, 0, 10_000_000) ?? 0,
    images: int(r.images, 0, 10_000) ?? 0,
    ocr,
    ...(typeof r.hash === 'string' && /^[0-9a-f]{8,40}$/.test(r.hash) ? { hash: r.hash } : {}),
  };
}

function check(raw: unknown): DocCheck | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!(CHECK_IDS as readonly string[]).includes(r.id as string)) return null;
  const level = r.level === 'warn' || r.level === 'fail' ? r.level : 'ok';
  const says = str(r.says, L.checkSays).trim();
  if (!says) return null;
  const pages = Array.isArray(r.pages) ? r.pages.map((p) => int(p, 1, L.pages)).filter((p): p is number => p !== null).slice(0, L.refs) : [];
  const blocks = Array.isArray(r.blocks) ? r.blocks.filter((b): b is string => typeof b === 'string' && BLOCK_ID.test(b)).slice(0, L.refs) : [];
  return { id: r.id as DocCheck['id'], level, says, ...(pages.length ? { pages } : {}), ...(blocks.length ? { blocks } : {}) };
}

/** A document from anywhere, made safe — or null when it is not one. */
export function sanitizeSourceDoc(raw: unknown): SourceDoc | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1 || typeof r.id !== 'string' || !DOC_ID.test(r.id)) return null;
  const format = (DOC_FORMATS as readonly string[]).includes(r.format as string) ? (r.format as SourceDoc['format']) : null;
  if (!format) return null;
  const name = str(r.name, L.name).replace(/[\u0000-\u001f]/g, '').trim() || 'document';
  const pageCount = int(r.pageCount, 1, 100_000) ?? 1;
  const maxPage = Math.min(pageCount, L.pages);

  const pages: DocPage[] = [];
  const seenPages = new Set<number>();
  for (const p of Array.isArray(r.pages) ? r.pages : []) {
    const clean = page(p);
    if (!clean || clean.n > maxPage || seenPages.has(clean.n)) continue;
    seenPages.add(clean.n);
    pages.push(clean);
    if (pages.length >= L.pages) break;
  }
  pages.sort((a, b) => a.n - b.n);

  const tables: DocTable[] = [];
  const tableIds = new Set<string>();
  for (const t of Array.isArray(r.tables) ? r.tables : []) {
    const clean = table(t, maxPage);
    if (!clean || tableIds.has(clean.id)) continue;
    tableIds.add(clean.id);
    tables.push(clean);
    if (tables.length >= L.tables) break;
  }
  const figures: DocFigure[] = [];
  const figureIds = new Set<string>();
  for (const f of Array.isArray(r.figures) ? r.figures : []) {
    const clean = figure(f, maxPage, tableIds);
    if (!clean || figureIds.has(clean.id)) continue;
    figureIds.add(clean.id);
    figures.push(clean);
    if (figures.length >= L.figures) break;
  }

  const blocks: DocBlock[] = [];
  const blockIds = new Set<string>();
  let text = 0;
  for (const b of Array.isArray(r.blocks) ? r.blocks : []) {
    if (!b || typeof b !== 'object') continue;
    const o = b as Record<string, unknown>;
    const id = typeof o.id === 'string' && BLOCK_ID.test(o.id) ? o.id : null;
    const pg = int(o.page, 1, maxPage);
    const kind = (BLOCK_KINDS as readonly string[]).includes(o.kind as string) ? (o.kind as DocBlock['kind']) : null;
    if (!id || !pg || !kind || blockIds.has(id)) continue;
    // a block's id names its page; one that does not is not this document's
    if (Number(id.slice(1, id.indexOf('.'))) !== pg) continue;
    const t = str(o.text, L.blockText);
    if (!t.trim() && kind !== 'figure' && kind !== 'table') continue;
    if (text + t.length > L.text) break;
    text += t.length;
    blockIds.add(id);
    const level = int(o.level, 1, 6);
    const tbl = kind === 'table' && typeof o.table === 'string' && tableIds.has(o.table) ? o.table : undefined;
    const fig = kind === 'figure' && typeof o.figure === 'string' && figureIds.has(o.figure) ? o.figure : undefined;
    const tex = kind === 'equation' ? str(o.tex, L.blockText).trim() : '';
    const fl = flags(o.flags);
    // the reading before a correction, only where there was one
    const was = fl?.includes('corrected') ? str(o.was, L.blockText) : '';
    text += was.length;
    blocks.push({
      id,
      page: pg,
      kind,
      text: t,
      ...(level ? { level } : {}),
      ...(box(o.box) ? { box: box(o.box) } : {}),
      ...(tbl ? { table: tbl } : {}),
      ...(fig ? { figure: fig } : {}),
      ...(tex ? { tex } : {}),
      method: method(o.method),
      ...(conf(o.conf) !== undefined ? { conf: conf(o.conf) } : {}),
      ...(fl ? { flags: fl } : {}),
      ...(was ? { was } : {}),
    });
    if (blocks.length >= L.blocks) break;
  }

  const checks = (Array.isArray(r.checks) ? r.checks : []).map(check).filter((c): c is DocCheck => !!c).slice(0, L.checks);
  const title = str(r.title, L.title).trim();
  const unread =
    r.unread && typeof r.unread === 'object' && int((r.unread as Record<string, unknown>).from, 1, 100_000) && int((r.unread as Record<string, unknown>).to, 1, 100_000)
      ? { from: (r.unread as { from: number }).from, to: (r.unread as { to: number }).to }
      : undefined;
  return {
    v: 1,
    id: r.id,
    name,
    format,
    ...(title ? { title } : {}),
    pageCount,
    pages,
    blocks,
    tables,
    figures,
    checks,
    ...(unread && unread.to >= unread.from ? { unread } : {}),
    ...(typeof r.readAt === 'number' && Number.isFinite(r.readAt) ? { readAt: r.readAt } : {}),
  };
}

/** The ids every block, table and figure answers to — for checking a citation points at something. */
export function blockOf(doc: SourceDoc, id: string): DocBlock | undefined {
  return doc.blocks.find((b) => b.id === id);
}
