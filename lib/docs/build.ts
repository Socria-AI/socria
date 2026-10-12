// lib/docs/build.ts — what a reader found, made into a SourceDoc.
//
// Every reader (Word, PowerPoint, Excel, OpenDocument, Markdown, CSV, HTML…)
// finds blocks, tables and figures in reading order and hands them here as
// drafts. This gives them what a document needs and no reader should do
// differently: ids ("p3.12", "t4", "f2"), captions joined to the table or
// figure beside them, a record per page with a fingerprint of what was read
// from it, and the document's title.
//
// A figure's block says only what the figure itself holds and nothing else
// does — its alt text, a chart's own title — never its caption, which is a
// block of its own: the same words read twice would be counted twice by the
// checks, and would be.
//
// PURE.

import type { RawPage } from './checks';
import { fingerprint } from './hash';
import { captionKind } from './text';
import type { BlockFlag, BlockKind, Box, ChartKind, DocBlock, DocCheck, DocFigure, DocFormat, DocPage, DocTable, FigureKind, ReadMethod, SourceDoc } from './types';

/** A picture inside the file that a vision model could be shown, on request. */
export interface MediaRef {
  /** the figure it is ("f3") */
  figure: string;
  page: number;
  /** where it is in the package ('' when the reader holds it as data) */
  part: string;
  mime: string;
  /** the picture itself, when the reader has it in hand (a notebook's output) */
  dataUrl?: string;
}

/** What every reader hands back. */
export interface ReaderOut {
  /** checks not yet run — lib/docs/read.ts runs them */
  doc: SourceDoc;
  /** the file's own text, page by page (n = 0: the whole document), for the checks */
  raw: RawPage[];
  /** what the reader itself noticed: limits reached, objects it could not read */
  notes: DocCheck[];
  media: MediaRef[];
}

export interface DraftBlock {
  page: number;
  kind: BlockKind;
  text: string;
  level?: number;
  box?: Box;
  /** index of the draft table this block is */
  table?: number;
  /** index of the draft figure this block is */
  figure?: number;
  tex?: string;
  flags?: BlockFlag[];
  conf?: number;
  method?: ReadMethod;
}

export interface DraftTable {
  page: number;
  rows: string[][];
  head: number;
  caption?: string;
  box?: Box;
  flags?: BlockFlag[];
  method?: ReadMethod;
}

export interface DraftFigure {
  page: number;
  kind?: FigureKind;
  chart?: ChartKind;
  caption?: string;
  alt?: string;
  /** index of the draft table holding its numbers */
  table?: number;
  box?: Box;
  method?: ReadMethod;
}

/** The longest a block's text may be (the sanitizer's ceiling is 8,000). */
const MAX_BLOCK_TEXT = 7000;
const MAX_TABLE_TEXT = 6000;

/** A table as text, one row per line — what a table block says. */
export const tableText = (rows: string[][]) => rows.map((r) => r.map((c) => c.replace(/\s*\n\s*/g, ' ')).join(' | ')).join('\n');

export class DocBuilder {
  blocks: DraftBlock[] = [];
  tables: DraftTable[] = [];
  figures: DraftFigure[] = [];
  /** characters of block text so far */
  chars = 0;

  constructor(readonly method: ReadMethod) {}

  block(b: DraftBlock): void {
    let text = b.kind === 'code' || b.kind === 'equation' ? b.text.replace(/\s+$/g, '') : b.text.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
    if (!text && b.kind !== 'figure' && b.kind !== 'table') return;
    // a table's block only holds its place in the reading — its cells are in the table itself
    if (b.kind === 'table' && text.length > MAX_TABLE_TEXT) text = `${text.slice(0, MAX_TABLE_TEXT).replace(/\n[^\n]*$/, '')}\n…`;
    // a passage too long for one block is several, broken where a line or a sentence ends
    while (text.length > MAX_BLOCK_TEXT && b.kind !== 'table') {
      const window = text.slice(0, MAX_BLOCK_TEXT);
      const cut = Math.max(window.lastIndexOf('\n'), window.lastIndexOf('. ') + 1, window.lastIndexOf(' '));
      const at = cut > MAX_BLOCK_TEXT / 2 ? cut : MAX_BLOCK_TEXT;
      this.blocks.push({ ...b, text: text.slice(0, at).trimEnd() });
      this.chars += at;
      text = b.kind === 'code' ? text.slice(at).replace(/^\n/, '') : text.slice(at).trimStart();
    }
    this.blocks.push({ ...b, text });
    this.chars += text.length;
  }

  /** A table and the block that stands for it, at this point in the reading. */
  table(t: DraftTable, opts: { box?: Box } = {}): number {
    const rows = t.rows.map((r) => r.map((c) => c.replace(/\u0000/g, '')));
    const i = this.tables.push({ ...t, rows }) - 1;
    this.block({ page: t.page, kind: 'table', text: tableText(rows), table: i, ...(opts.box ?? t.box ? { box: opts.box ?? t.box } : {}), ...(t.flags?.length ? { flags: t.flags } : {}), ...(t.method ? { method: t.method } : {}) });
    return i;
  }

  /** A figure and its block. `text` is what the figure itself holds: alt text, a chart's title. */
  figure(f: DraftFigure, text = '', flags?: BlockFlag[]): number {
    const i = this.figures.push(f) - 1;
    this.block({ page: f.page, kind: 'figure', text, figure: i, ...(f.box ? { box: f.box } : {}), ...(flags?.length ? { flags } : {}), ...(f.method ? { method: f.method } : {}) });
    return i;
  }

  /** The last page anything was read on. */
  get lastPage(): number {
    return this.blocks.reduce((m, b) => Math.max(m, b.page), 1);
  }

  build(meta: {
    id: string;
    name: string;
    format: DocFormat;
    pageCount: number;
    title?: string;
    unread?: { from: number; to: number };
    /** page sizes, where pages have one (slides) */
    sizes?: Map<number, { w: number; h: number }>;
    /** pages that hold only pictures and wait for a vision reading */
    scans?: Set<number>;
  }): SourceDoc {
    const tableIds = this.tables.map((_, i) => `t${i + 1}`);
    const figureIds = this.figures.map((_, i) => `f${i + 1}`);
    const tables: DocTable[] = this.tables.map((t, i) => ({
      id: tableIds[i],
      page: t.page,
      rows: t.rows,
      head: Math.max(0, Math.min(t.head, t.rows.length)),
      ...(t.caption ? { caption: t.caption } : {}),
      ...(t.box ? { box: t.box } : {}),
      method: t.method ?? this.method,
      ...(t.flags?.length ? { flags: t.flags } : {}),
    }));
    const figures: DocFigure[] = this.figures.map((f, i) => ({
      id: figureIds[i],
      page: f.page,
      ...(f.kind ? { kind: f.kind } : {}),
      ...(f.chart ? { chart: f.chart } : {}),
      ...(f.caption ? { caption: f.caption } : {}),
      ...(f.alt ? { alt: f.alt } : {}),
      ...(f.table !== undefined && tableIds[f.table] ? { table: tableIds[f.table] } : {}),
      ...(f.box ? { box: f.box } : {}),
      method: f.method ?? this.method,
    }));
    const counters = new Map<number, number>();
    const blocks: DocBlock[] = this.blocks.map((b) => {
      const k = (counters.get(b.page) ?? 0) + 1;
      counters.set(b.page, k);
      return {
        id: `p${b.page}.${k}`,
        page: b.page,
        kind: b.kind,
        text: b.text,
        ...(b.level ? { level: Math.max(1, Math.min(6, Math.round(b.level))) } : {}),
        ...(b.box ? { box: b.box } : {}),
        ...(b.table !== undefined && tableIds[b.table] ? { table: tableIds[b.table] } : {}),
        ...(b.figure !== undefined && figureIds[b.figure] ? { figure: figureIds[b.figure] } : {}),
        ...(b.kind === 'equation' ? { tex: b.tex ?? b.text } : {}),
        method: b.method ?? this.method,
        ...(b.conf !== undefined ? { conf: b.conf } : {}),
        ...(b.flags?.length ? { flags: [...new Set(b.flags)] } : {}),
      };
    });
    linkCaptions(blocks, tables, figures);

    const pageCount = Math.max(1, meta.pageCount, ...blocks.map((b) => b.page));
    const pages: DocPage[] = [];
    for (let n = 1; n <= pageCount; n++) {
      if (meta.unread && n >= meta.unread.from) break;
      const on = blocks.filter((b) => b.page === n);
      const text = on.map((b) => b.text).join('\n');
      const size = meta.sizes?.get(n);
      const images = figures.filter((f) => f.page === n).length;
      pages.push({
        n,
        ...(size ? { w: Math.round(size.w * 10) / 10, h: Math.round(size.h * 10) / 10 } : {}),
        method: text.trim() ? this.method : 'none',
        chars: text.length,
        images,
        ocr: meta.scans?.has(n) ? 'needed' : 'none',
        hash: fingerprint(`${n}:${text}:${images}`),
      });
    }
    // the title the document shows outranks the one its properties hold, which is often stale
    const title = blocks.find((b) => b.kind === 'title')?.text ?? meta.title;
    return {
      v: 1,
      id: meta.id,
      name: meta.name,
      format: meta.format,
      ...(title ? { title: title.replace(/\s+/g, ' ').slice(0, 300) } : {}),
      pageCount,
      pages,
      blocks,
      tables,
      figures,
      checks: [],
      ...(meta.unread ? { unread: meta.unread } : {}),
    };
  }
}

/**
 * Captions to the table or figure beside them on the same page, nearest
 * first: "Table 2:" to a table, "Figure 3:" to a figure, an unlabelled
 * caption to either. A table or figure takes one caption.
 */
export function linkCaptions(blocks: DocBlock[], tables: DocTable[], figures: DocFigure[]): void {
  const byTable = new Map(tables.map((t) => [t.id, t]));
  const byFigure = new Map(figures.map((f) => [f.id, f]));
  blocks.forEach((b, i) => {
    if (b.kind !== 'caption') return;
    const want = captionKind(b.text);
    // a table's caption is usually above it, a figure's below: look that way first
    const order = want === 'figure' ? [i - 1, i + 1, i - 2, i + 2] : [i + 1, i - 1, i + 2, i - 2];
    for (const j of order) {
      const n = blocks[j];
      if (!n || n.page !== b.page) continue;
      if (n.kind === 'table' && want !== 'figure') {
        const t = n.table ? byTable.get(n.table) : undefined;
        if (t && !t.caption) {
          t.caption = b.text;
          return;
        }
      }
      if (n.kind === 'figure' && want !== 'table') {
        const f = n.figure ? byFigure.get(n.figure) : undefined;
        if (f && !f.caption) {
          f.caption = b.text;
          return;
        }
      }
    }
  });
}
