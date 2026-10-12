// lib/docs/vision.ts — reading a page, or a figure, from a picture of it.
//
// A scanned page has no text of its own; a photograph of a whiteboard never
// had any; a chart drawn as an image holds its numbers only as pixels. These
// are read by a vision model, and what it returns is held to a stricter
// standard than anything else in a document, because it is the one place a
// reading can be invented:
//
//   · transcription, not description — the page's words as written, in
//     reading order, spelling and numbers untouched
//   · [illegible] where it cannot read, never a guess — a block that says so
//     is flagged, and the flag is shown wherever the block is
//   · every block marked as read by vision (method 'vision'), with the
//     model's own confidence, and handwriting marked as handwriting
//   · where the page ALSO has a text layer (a page whose font could not be
//     decoded), every number the vision reading holds is looked for in that
//     layer; one that is not there is flagged 'unverified-numbers'
//   · a figure's description is kept apart from the document's words
//     (DocFigure.described) and always shown as an interpretation
//
// The model call itself is in app/api/docs/page/route.ts; this file is the
// prompt, the strict parse of what comes back, and the merge into the
// document. PURE.

import { checkDoc } from './checks';
import { fingerprint } from './hash';
import { numberKey, numbersIn } from './text';
import type { BlockFlag, BlockKind, DocBlock, DocCheck, DocFigure, SourceDoc } from './types';

export const PAGE_READ_PROMPT = `You transcribe one page of a document from a picture of it. Another program will rely on your transcription as the text of that page, and people will quote it, so it must be exactly what is written.

Return ONLY a JSON object:
{"blocks":[{"kind":"title|heading|paragraph|list|table|equation|caption|footnote|figure|note","text":"...","level":1,"rows":[["..."]],"tex":"...","handwriting":false,"confidence":"high|medium|low"}]}

Rules:
- Transcribe, never describe, summarise, correct, complete or translate. Keep spelling, punctuation, capitals, numbers, signs (− and -), decimal points, units and symbols exactly as written.
- Reading order: top to bottom; on a page with columns, the whole left column before the right.
- One block per heading, paragraph, list item, caption, footnote, equation or table. "level" only for headings (1 = largest).
- Where any part cannot be read with certainty, write [illegible] in its place. Never guess a word, and above all never guess a number.
- Tables: kind "table", "rows" holds every row as written (the heading row first when there is one), one string per cell, "" for an empty cell. "text" may be "".
- Equations: kind "equation", "text" in plain linear notation as written (e.g. x = (−b ± √(b^2 − 4ac))/(2a)) and "tex" in LaTeX.
- Pictures, photographs, charts and diagrams: kind "figure"; "text" is a short, plain, factual description of what it shows; put any words or numbers printed inside it in "labels" (an array of strings) exactly as printed.
- Handwriting: set "handwriting": true and transcribe it if it is legible; otherwise [illegible].
- "confidence": high when every character is clear, medium when some are not, low when much is guesswork — in which case prefer [illegible].
- A blank page returns {"blocks":[]}.`;

export const FIGURE_READ_PROMPT = `You look at one figure from a document — a chart, a diagram, a photograph or a drawing — so that someone can work with it in words. What you return is shown as a reading of the figure, never as the document's own words.

Return ONLY a JSON object:
{"kind":"chart|diagram|photo|drawing|table|equation|other","chart":"bar|column|line|area|pie|scatter|other","described":"...","labels":["..."],"data":[["header","header"],["row","value"]],"confidence":"high|medium|low"}

Rules:
- "described": two to four plain sentences of what it shows — what kind of figure, what its axes or parts are, what is being compared. Facts you can see, no conclusions, no advice.
- "labels": every word and number printed in the figure, exactly as printed.
- "data": only for a chart whose values are printed on it, or can be read exactly from labelled gridlines — each value as printed. If values would have to be estimated from bar heights or line positions, leave "data" out entirely. Never invent a number.
- "chart" only when kind is chart.
- Where something cannot be read, say [illegible].`;

export interface VisionBlock {
  kind: BlockKind;
  text: string;
  level?: number;
  rows?: string[][];
  tex?: string;
  labels?: string[];
  handwriting?: boolean;
  confidence: 'high' | 'medium' | 'low';
}

const KINDS = new Set<BlockKind>(['title', 'heading', 'paragraph', 'list', 'table', 'equation', 'caption', 'footnote', 'figure', 'note', 'quote', 'code']);
const str = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\u0000/g, '').slice(0, n) : '');

/** The JSON object in a model's reply, wherever it sits (fenced, or with words around it). */
export function jsonIn(raw: string): unknown {
  const t = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try {
      return JSON.parse(t.slice(a, b + 1));
    } catch {
      return null;
    }
  }
}

/** A page's transcription, checked for shape. null when the reply is not one. */
export function parsePageReply(raw: string): VisionBlock[] | null {
  const j = jsonIn(raw) as { blocks?: unknown } | null;
  if (!j || !Array.isArray(j.blocks)) return null;
  const out: VisionBlock[] = [];
  for (const x of j.blocks.slice(0, 400)) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const kind = KINDS.has(o.kind as BlockKind) ? (o.kind as BlockKind) : 'paragraph';
    const text = str(o.text, 6000).trim();
    const rows = Array.isArray(o.rows)
      ? o.rows
          .slice(0, 200)
          .filter(Array.isArray)
          .map((r) => (r as unknown[]).slice(0, 30).map((c) => str(typeof c === 'number' ? String(c) : c, 400)))
      : undefined;
    const labels = Array.isArray(o.labels) ? o.labels.slice(0, 60).map((l) => str(l, 200)).filter(Boolean) : undefined;
    if (!text && !(rows && rows.length) && !(labels && labels.length)) continue;
    const confidence = o.confidence === 'low' || o.confidence === 'medium' ? o.confidence : 'high';
    const level = typeof o.level === 'number' && o.level >= 1 && o.level <= 6 ? Math.round(o.level) : undefined;
    out.push({
      kind: kind === 'table' && !(rows && rows.length) ? 'paragraph' : kind,
      text,
      ...(level && kind === 'heading' ? { level } : {}),
      ...(rows && rows.length ? { rows } : {}),
      ...(str(o.tex, 2000).trim() ? { tex: str(o.tex, 2000).trim() } : {}),
      ...(labels && labels.length ? { labels } : {}),
      ...(o.handwriting === true ? { handwriting: true } : {}),
      confidence,
    });
  }
  return out;
}

export interface FigureReading {
  kind?: DocFigure['kind'];
  chart?: DocFigure['chart'];
  described: string;
  labels: string[];
  data?: string[][];
  confidence: 'high' | 'medium' | 'low';
}

/** A figure's reading, checked for shape. */
export function parseFigureReply(raw: string): FigureReading | null {
  const j = jsonIn(raw) as Record<string, unknown> | null;
  if (!j || typeof j !== 'object') return null;
  const described = str(j.described, 1500).trim();
  if (!described) return null;
  const kinds: Record<string, DocFigure['kind']> = { chart: 'chart', diagram: 'diagram', photo: 'image', drawing: 'drawing', table: 'image', equation: 'equation', other: 'image' };
  const charts = ['bar', 'column', 'line', 'area', 'pie', 'scatter', 'other'];
  const data = Array.isArray(j.data)
    ? j.data
        .slice(0, 60)
        .filter(Array.isArray)
        .map((r) => (r as unknown[]).slice(0, 12).map((c) => str(typeof c === 'number' ? String(c) : c, 120)))
    : undefined;
  return {
    ...(kinds[str(j.kind, 20)] ? { kind: kinds[str(j.kind, 20)] } : {}),
    ...(j.kind === 'chart' && charts.includes(str(j.chart, 20)) ? { chart: str(j.chart, 20) as DocFigure['chart'] } : {}),
    described,
    labels: Array.isArray(j.labels) ? j.labels.slice(0, 60).map((l) => str(l, 200)).filter(Boolean) : [],
    ...(data && data.length > 1 ? { data } : {}),
    confidence: j.confidence === 'low' || j.confidence === 'medium' ? j.confidence : 'high',
  };
}

const CONF = { high: 0.9, medium: 0.7, low: 0.45 } as const;

/**
 * A page's vision reading merged into the document: whatever was read from
 * the page before (nothing, for a scan; undecodable text, for a page whose
 * font has no map) is replaced; ids are given; tables and figures join the
 * document's; the page is marked read by vision; the checks that do not need
 * the file's text are run again, and those that did are kept.
 */
export function mergePageReading(doc: SourceDoc, page: number, read: VisionBlock[] | null, textLayer = '', partial = false): SourceDoc {
  const pg = doc.pages.find((p) => p.n === page);
  if (!pg) return doc;
  if (!read) {
    return withChecks({ ...doc, pages: doc.pages.map((p) => (p.n === page ? { ...p, ocr: 'failed' as const } : p)) });
  }
  // a reading cut off at the model's limit is a part of the page, and is said to be
  if (partial) doc = { ...doc, checks: [...doc.checks.filter((c) => !(c.id === 'unread' && c.pages?.length === 1 && c.pages[0] === page)), { id: 'unread', level: 'warn', says: `Page ${page} was read from its image only in part: it holds more than one reading carries.`, pages: [page] }] };
  const layerNums = new Set(numbersIn(textLayer).map((n) => numberKey(Math.abs(n.value))));
  const hasLayer = textLayer.trim().length > 20;
  const keepBlocks = doc.blocks.filter((b) => b.page !== page);
  const dropTables = new Set(doc.tables.filter((t) => t.page === page).map((t) => t.id));
  const dropFigures = new Set(doc.figures.filter((f) => f.page === page).map((f) => f.id));
  const tables = doc.tables.filter((t) => !dropTables.has(t.id));
  const figures = doc.figures.filter((f) => !dropFigures.has(f.id));
  let tn = Math.max(0, ...doc.tables.map((t) => Number(t.id.slice(1)) || 0));
  let fn = Math.max(0, ...doc.figures.map((f) => Number(f.id.slice(1)) || 0));
  const added: DocBlock[] = [];
  read.forEach((v, i) => {
    const id = `p${page}.${i + 1}`;
    const flags: BlockFlag[] = [];
    const all = [v.text, ...(v.rows?.flat() ?? []), ...(v.labels ?? [])].join(' ');
    if (/\[illegible\]/i.test(all)) flags.push('illegible');
    if (v.handwriting) flags.push('handwriting');
    if (v.confidence === 'low') flags.push('uncertain');
    if (hasLayer && numbersIn(all).some((n) => !layerNums.has(numberKey(Math.abs(n.value))))) flags.push('unverified-numbers');
    const base = { id, page, method: 'vision' as const, conf: CONF[v.confidence], ...(flags.length ? { flags } : {}) };
    if (v.kind === 'table' && v.rows?.length) {
      const tid = `t${++tn}`;
      const width = Math.max(...v.rows.map((r) => r.length));
      const rows = v.rows.map((r) => [...r, ...Array(width - r.length).fill('')]);
      tables.push({ id: tid, page, rows, head: rows.length > 1 && rows[0].every((c) => !/^[-−]?[\d.,%]+$/.test(c.trim())) ? 1 : 0, method: 'vision', conf: CONF[v.confidence], ...(flags.length ? { flags } : {}) });
      added.push({ ...base, kind: 'table', text: rows.map((r) => r.join(' | ')).join('\n').slice(0, 6000), table: tid });
    } else if (v.kind === 'figure') {
      const fid = `f${++fn}`;
      // what the model saw is an interpretation; the words printed in the figure are the page's
      figures.push({ id: fid, page, kind: 'image', ...(v.text ? { described: v.text.slice(0, 1500) } : {}), method: 'vision' });
      added.push({ ...base, kind: 'figure', text: (v.labels ?? []).join(' · ').slice(0, 6000), figure: fid });
    } else {
      added.push({ ...base, kind: v.kind, text: v.text, ...(v.level ? { level: v.level } : {}), ...(v.kind === 'equation' ? { tex: v.tex ?? v.text } : {}) });
    }
  });
  // reading order across the document: pages in order, this page's blocks where its page falls
  const blocks = [...keepBlocks.filter((b) => b.page < page), ...added, ...keepBlocks.filter((b) => b.page > page)];
  const text = added.map((b) => b.text).join('\n');
  const pages = doc.pages.map((p) =>
    p.n === page ? { ...p, method: added.length ? ('vision' as const) : p.method, chars: text.length, ocr: 'done' as const, hash: fingerprint(`${page}:vision:${text}`) } : p
  );
  return withChecks({ ...doc, blocks, tables, figures, pages });
}

/** A figure's vision reading merged into the document: its description (an interpretation) and, where the chart printed its values, a table. */
export function mergeFigureReading(doc: SourceDoc, figureId: string, read: FigureReading): SourceDoc {
  const f = doc.figures.find((x) => x.id === figureId);
  if (!f) return doc;
  let tables = doc.tables;
  let table = f.table;
  let blocks = doc.blocks;
  if (read.data && !f.table) {
    const tid = `t${Math.max(0, ...doc.tables.map((t) => Number(t.id.slice(1)) || 0)) + 1}`;
    const width = Math.max(...read.data.map((r) => r.length));
    const rows = read.data.map((r) => [...r, ...Array(width - r.length).fill('')]);
    tables = [...doc.tables, { id: tid, page: f.page, rows, head: 1, caption: f.caption ?? 'Values read from the figure', method: 'vision', conf: CONF[read.confidence], flags: ['unverified-numbers'] }];
    table = tid;
    // the table follows its figure in the reading
    const at = doc.blocks.findIndex((b) => b.figure === figureId);
    if (at >= 0) {
      const onPage = doc.blocks.filter((b) => b.page === f.page);
      const n = Math.max(0, ...onPage.map((b) => Number(b.id.split('.')[1]) || 0)) + 1;
      const tb: DocBlock = { id: `p${f.page}.${n}`, page: f.page, kind: 'table', text: rows.map((r) => r.join(' | ')).join('\n').slice(0, 6000), table: tid, method: 'vision', conf: CONF[read.confidence], flags: ['unverified-numbers'] };
      blocks = [...doc.blocks.slice(0, at + 1), tb, ...doc.blocks.slice(at + 1)];
    }
  }
  const figures = doc.figures.map((x) => (x.id === figureId ? { ...x, described: read.described, ...(read.kind && !x.kind ? { kind: read.kind } : {}), ...(read.chart && !x.chart ? { chart: read.chart } : {}), ...(table ? { table } : {}) } : x));
  return { ...doc, blocks, tables, figures };
}

/** The checks that need only the document, run again; the ones that needed the file's own text, kept. */
export function withChecks(doc: SourceDoc): SourceDoc {
  const kept = doc.checks.filter((c) => c.id === 'numbers' || c.id === 'minus' || c.id === 'unread' || (c.id === 'duplicates' && c.level === 'ok'));
  const fresh = checkDoc(doc, [], {}).filter((c) => !kept.some((k) => k.id === c.id));
  const vision = doc.blocks.filter((b) => b.method === 'vision');
  const notes: DocCheck[] = [];
  if (vision.length) {
    const unverified = vision.filter((b) => b.flags?.includes('unverified-numbers')).length;
    const illegible = vision.filter((b) => b.flags?.includes('illegible')).length;
    const pages = [...new Set(vision.map((b) => b.page))];
    notes.push({
      id: 'scans',
      level: unverified || illegible ? 'warn' : 'ok',
      says: `${pages.length === 1 ? `Page ${pages[0]} was` : `Pages ${pages.slice(0, 6).join(', ')}${pages.length > 6 ? '…' : ''} were`} read from the image by a vision model and marked as such${illegible ? `; ${illegible} passage${illegible === 1 ? ' has' : 's have'} parts that could not be read` : ''}${unverified ? `; ${unverified} hold${unverified === 1 ? 's' : ''} numbers the page’s own text does not confirm` : ''}.`,
      pages,
    });
  }
  // one scans check: what was read from images, and what still waits
  const pending = fresh.find((c) => c.id === 'scans' && c.level !== 'ok' && doc.pages.some((p) => p.ocr === 'needed'));
  const checks = [...kept, ...fresh.filter((c) => c.id !== 'scans')];
  const read = notes[0];
  if (read && pending) checks.push({ id: 'scans', level: 'warn', says: `${read.says} ${pending.says}`, pages: [...new Set([...(read.pages ?? []), ...(pending.pages ?? [])])] });
  else if (read) checks.push(read);
  else if (pending) checks.push(pending);
  else {
    const failed = fresh.find((c) => c.id === 'scans');
    if (failed) checks.push(failed);
  }
  return { ...doc, checks: checks.slice(0, 24) };
}
