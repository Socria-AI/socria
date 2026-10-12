// lib/objects/display-document.ts — A DOCUMENT, AS IT WAS READ.
//
// A file the person attached, open in the workspace beside the conversation:
// every passage with the key a reply cites it by ([A3.12]), how it was read
// (the file's own text, its structure, or a vision model looking at the page)
// and how sure that reading is; its tables, any of which can be charted; its
// equations; and what the automated checks of the reading found. A citation
// chip in a reply opens it at the passage cited.
//
// The reading itself is NOT in this state. A document is kept on the device
// that read it (lib/docs/client.ts) — it can be large, and it is the
// person's — so this object holds only which document it shows and how. On a
// device without it (a shared line of thinking, another browser), the figure
// says so rather than showing anything else.
//
// It is made only by attaching a file, never asked for by name or proposed by
// Socria (`internal`), and nothing in it is Socria's to change.
//
// PURE.

import { register, type Part, type ViewDecl } from './core';
import { cleanText, displayKind, headOps, readView, registerDisplay, type DisplayHead, type DisplayMeta } from './display-base';
import { DATA_LIMITS, dataFromGrid, type DataState } from './display-data';
import { findFunctions } from './function';
import type { DocBlock, SourceDoc } from '@/lib/docs/types';
import { DOC_FORMATS } from '@/lib/docs/types';

export type DocumentView = 'reading' | 'outline' | 'checks';

export interface DocumentState extends DisplayHead {
  view: DocumentView;
  /** the document's id (lib/docs: a hash of the file's bytes) */
  doc: string;
  /** its file name */
  name: string;
  format: (typeof DOC_FORMATS)[number];
  /** pages (slides, sheets) in the file */
  pages: number;
}

const VIEWS: DocumentView[] = ['reading', 'outline', 'checks'];
const DOC_ID = /^[0-9a-f]{16}$/;

export function sanitizeDocument(raw: unknown): DocumentState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const doc = typeof r.doc === 'string' && DOC_ID.test(r.doc) ? r.doc : null;
  const format = (DOC_FORMATS as readonly string[]).includes(r.format as string) ? (r.format as DocumentState['format']) : null;
  const pages = typeof r.pages === 'number' && Number.isInteger(r.pages) && r.pages >= 1 && r.pages <= 100_000 ? r.pages : null;
  const name = cleanText(r.name, 160);
  if (!doc || !format || !pages || !name) return null;
  return {
    title: cleanText(r.title, 80) || cleanText(name, 80),
    view: VIEWS.includes(r.view as DocumentView) ? (r.view as DocumentView) : 'reading',
    doc,
    name,
    format,
    pages,
  };
}

/** What a page is called in a format: a slide, a sheet, a page. */
export function pageWord(format: string, n = 1): string {
  const w = format === 'pptx' || format === 'odp' ? 'slide' : format === 'xlsx' || format === 'ods' ? 'sheet' : 'page';
  return n === 1 ? w : `${w}s`;
}

const FORMAT_SAID: Partial<Record<DocumentState['format'], string>> = { pdf: 'PDF', docx: 'Word', pptx: 'PowerPoint', xlsx: 'Excel', odt: 'OpenDocument text', odp: 'OpenDocument slides', ods: 'OpenDocument sheet', rtf: 'RTF', md: 'Markdown', txt: 'text', csv: 'CSV', tsv: 'TSV', html: 'HTML', tex: 'LaTeX', ipynb: 'notebook', image: 'image', code: 'code' };
export const formatSaid = (f: string): string => FORMAT_SAID[f as DocumentState['format']] ?? f;

const views: ViewDecl<DocumentState>[] = [
  { id: 'reading', label: 'Reading', shows: 'every passage as it was read, with its key, its page and how it was read', primary: true, interactions: ['go to a passage', 'correct a passage', 'mark one as misread', 'chart a table'] },
  { id: 'outline', label: 'Outline', shows: 'its headings, tables, figures and equations, to go to', interactions: ['go to a part'] },
  { id: 'checks', label: 'Checks', shows: 'what the automated checks of the reading found, and what you corrected', interactions: ['go to a passage a check names'] },
];

type S = DocumentState;
export const DOCUMENT_OPS = { ...headOps<S>(views, sanitizeDocument) };

const VIEW_WORDS: Record<string, string[]> = { reading: ['reading', 'passages', 'text'], outline: ['outline', 'contents', 'headings'], checks: ['checks', 'problems', 'issues'] };

export const DOCUMENT = displayKind<S>({
  kind: 'document',
  label: 'Document',
  sanitize: sanitizeDocument,
  ops: DOCUMENT_OPS,
  readOp: (text) => {
    const v = readView(text, views, VIEW_WORDS);
    return v ? { op: 'view', args: { view: v } } : null;
  },
  facts: (s) => [
    `${s.title}: the person’s document “${s.name}” (${formatSaid(s.format)}, ${s.pages} ${pageWord(s.format, s.pages)}) is open in the workspace as it was read, shown as its ${views.find((v) => v.id === s.view)?.label.toLowerCase() ?? s.view}.`,
    'What it says reaches you only as the passages given under DOCUMENTS, each with its key — never describe it beyond them.',
  ],
  text: (s) => `DOCUMENT “${s.name}” — ${formatSaid(s.format)}, ${s.pages} ${pageWord(s.format, s.pages)}, open in the workspace as it was read.`,
  parts: (): Part[] => [],
  views,
  maxStates: 12,
  argLimits: { count: 4, length: 80 },
  size: (_s, mode) => (mode === 'card' ? { w: 280, h: 150 } : mode === 'trail' ? { w: 200, h: 110 } : { w: 760, h: 640 }),
  shape: (s) => `${s.pages} ${pageWord(s.format, s.pages)} · ${formatSaid(s.format)}`,
});

/** The display for a document that was just read: its own title, else its file name. */
export function documentFromDoc(doc: Pick<SourceDoc, 'id' | 'name' | 'format' | 'pageCount' | 'title'>): DocumentState | null {
  return sanitizeDocument({ title: doc.title || doc.name, view: 'reading', doc: doc.id, name: doc.name, format: doc.format, pages: doc.pageCount });
}

// ── what can be made from a document ────────────────────────────────

/**
 * A table of the document as a chart's data — the same numbers, typed by
 * what every value in a column is (display-data.ts), marked as material the
 * person attached and naming where in it they came from. A column that is
 * not all numbers stays text: nothing is coerced. `left` says what did not fit.
 */
export function chartFromTable(doc: SourceDoc, tableId: string): { state: DataState; left: string[] } | null {
  const t = doc.tables.find((x) => x.id === tableId);
  if (!t || !t.rows.length) return null;
  const width = Math.max(...t.rows.map((r) => r.length));
  const head = Math.min(t.head, Math.max(0, t.rows.length - 1));
  // several heading rows read down each column as one name: "2023" over "Revenue" → "2023 Revenue"
  const names = Array.from({ length: width }, (_, i) =>
    t.rows
      .slice(0, head)
      .map((r) => (r[i] ?? '').trim())
      .filter(Boolean)
      .join(' ')
  );
  const body = t.rows.slice(head).filter((r) => r.some((c) => c.trim()));
  if (!body.length) return null;
  const title = t.caption?.trim() || `Table ${t.id.slice(1)} of ${doc.name}`;
  const state = dataFromGrid([names, ...body], title, { basis: 'source', by: 'person', source: { doc: doc.id, name: doc.name, table: t.id, page: t.page } });
  if (!state) return null;
  const left: string[] = [];
  if (width > DATA_LIMITS.columns) left.push(`${width - DATA_LIMITS.columns} of its ${width} columns`);
  if (body.length > DATA_LIMITS.rows) left.push(`${body.length - DATA_LIMITS.rows} of its ${body.length} rows`);
  return { state, left };
}

/**
 * An equation the workspace can compute with, written as the person would
 * send it: "f(x) = 3x^2 + 2" from "y = 3x² + 2". Null unless the engine reads
 * it as a function of one variable — an equation that would not plot is never
 * offered as one that does.
 */
export function functionFromEquation(b: Pick<DocBlock, 'text' | 'tex'>): string | null {
  const raw = (b.tex || b.text || '').trim();
  if (!raw || raw.length > 160) return null;
  const sup: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };
  const t = raw
    .replace(/\$/g, '')
    .replace(/[−–]/g, '-')
    .replace(/[·×]/g, '*')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (m) => `^${m.length > 1 ? `(${[...m].map((c) => sup[c]).join('')})` : sup[m]}`)
    .replace(/\s+\(\d{1,3}(?:\.\d{1,3})?\)\s*$/, '') // an equation's own number, set apart: "   (3)"
    .trim();
  let m = /^([a-zA-Z])\s*\(\s*([a-z])\s*\)\s*=\s*(.+)$/.exec(t);
  const written = m ? `${m[1]}(${m[2]}) = ${m[3].trim()}` : (m = /^y\s*=\s*(.+)$/.exec(t)) ? `f(x) = ${m[1].trim()}` : null;
  if (!written) return null;
  const found = findFunctions(written);
  return found.length === 1 && found[0].index === 0 ? written : null;
}

export const DOCUMENT_META: DisplayMeta = {
  kind: 'document',
  noun: 'document',
  handle: 'Doc',
  about: 'A file you attached, as Socria read it: every passage with the key replies cite it by, how it was read and how sure the reading is, its tables (which can be charted) and equations, and the checks the reading passed. Correct any passage that was read wrongly.',
  internal: true,
  tell: () =>
    'A DOCUMENT display is a file the person attached, shown as it was read. What it says reaches you only as the passages under DOCUMENTS: cite them by their keys, and never describe the document beyond them. Passages marked as corrected by the person say what the person wrote; passages they marked as read wrongly are doubted — do not rely on them.',
};

register(DOCUMENT);
registerDisplay(DOCUMENT_META);
