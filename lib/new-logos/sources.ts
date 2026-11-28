// lib/new-logos/sources.ts — SOURCES belong to the workspace, REFERENCES belong to components, the CANVAS belongs to
// the person.
//
// A SOURCE is one canonical record per file a person brought in: what it is called, what kind of file, how well it
// was read, and two pointers into storage that already exists —
//   • the ORIGINAL, kept privately under the account by its content hash (lib/file-originals.ts, bucket socria-files;
//     account deletion already empties it and export already lists it);
//   • the READING, the structured text the main app's reader makes of a file (lib/docs: pages, blocks with ids like
//     "p3.12", tables, checks), kept here on the record so it is the same on every device.
// Nothing about a source is copied when it is used. A REFERENCE ties one component (a question, a finding, a decision,
// an artifact…) to one source, optionally at one passage, with the words quoted, a note, how the component stands on
// the source (quoted, derived, an interpretation) and who made the tie (the person, or the assistant citing it). Many
// components reference the same source; removing a reference never touches the source; deleting a source is its own,
// confirmed act. A source placed on a canvas is presentation only — a canvas layout item `s:<source id>` — so removing
// it from the canvas removes nothing else.
//
// Pure: no I/O.

import { cleanText } from './clean';
import { cleanId, type NodeRow } from './model';
import { selectPassages } from '@/lib/docs/ground';
import { parseKey } from '@/lib/docs/render';
import { sanitizeSourceDoc } from '@/lib/docs/sanitize';
import { GROUNDS, type DocBlock, type Ground, type SourceDoc } from '@/lib/docs/types';

export const SOURCE_KINDS = ['document', 'image', 'text'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/**
 * How well a source was read:
 *   ready    read in full
 *   partial  read, but not all of it (pages past the reading limit)
 *   scanned  some pages are scans whose words have not been read yet
 *   failed   nothing could be read from it
 *   stored   kept as itself, without a reading (an image)
 */
export const SOURCE_STATUSES = ['ready', 'partial', 'scanned', 'failed', 'stored'] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export const SOURCE_LIMITS = {
  name: 200,
  sourcesPerUser: 2000,
  refsPerUser: 20_000,
  quote: 600,
  note: 300,
  conversations: 50,
  /** a reading kept on the record, as JSON */
  readingChars: 2_000_000,
  /** what one question takes from one source: passages, and characters of their words */
  passages: 8,
  passageChars: 9_000,
  /** sources one question may draw on */
  perAsk: 6,
} as const;

export const FILE_ID_RE = /^[a-f0-9]{32}$/;
export const DOC_ID_RE = /^[a-f0-9]{16}$/;
export const BLOCK_ID_RE = /^p\d{1,4}\.\d{1,5}$/;
export const SOURCE_ID_RE = /^s_[a-z0-9]{8,32}$/;

export interface SourceMeta {
  id: string;
  name: string;
  file_name: string;
  mime: string;
  size: number;
  kind: SourceKind;
  /** the original's id in the account's file storage */
  file_id: string | null;
  /** the reading's id (a hash of the file: the same file is the same document) */
  doc_id: string | null;
  status: SourceStatus;
  pages: number;
  format: string;
  /** conversations it was brought into */
  conversation_ids: string[];
  created_at: number;
  updated_at: number;
}

export interface SourceRow extends SourceMeta {
  user_id: string;
  reading: SourceDoc | null;
}

export const REF_ORIGINS = ['human', 'ai'] as const;
export type RefOrigin = (typeof REF_ORIGINS)[number];

export interface SourceRefRow {
  id: string;
  user_id: string;
  source_id: string;
  node_id: string;
  /** the passage ("p3.12"), when the reference is to one */
  passage: string | null;
  /** its words, as quoted */
  quote: string;
  note: string;
  /** how the component stands on it: its words, computed from it, or a reading of it */
  ground: Ground | null;
  /** who tied them: the person, or the assistant citing it */
  origin: RefOrigin;
  created_at: number;
}

// ── ids ──────────────────────────────────────────────────────────────

function rnd(n: number): string {
  const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const b = new Uint8Array(n);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') crypto.getRandomValues(b);
  else for (let k = 0; k < n; k++) b[k] = Math.floor(Math.random() * 256);
  return Array.from(b, (x) => a[x % a.length]).join('');
}
export const newSourceId = () => `s_${rnd(20)}`;
export const newRefId = () => `sr_${rnd(20)}`;
export const sourceRef = (id: string) => `s:${id}`;
/** What a source dragged from the library carries (its id), for a canvas to take. */
export const SOURCE_DRAG = 'application/x-nl-source';

// ── what a file is ───────────────────────────────────────────────────

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|heic|bmp|svg)$/i;
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|ya?ml|xml|html?|tex|bib|log|[cm]?[jt]sx?|py|rb|go|rs|java|kt|swift|c|cc|cpp|h|hpp|cs|php|sql|r|m|sh)$/i;

export function sourceKindOf(name: string, mime: string): SourceKind {
  if (mime.startsWith('image/') || IMAGE_EXT.test(name)) return 'image';
  if (mime.startsWith('text/') || TEXT_EXT.test(name)) return 'text';
  return 'document';
}

/** How well a reading went, from what the reader itself recorded. */
export function statusOf(reading: SourceDoc | null, kind: SourceKind): SourceStatus {
  if (!reading) return kind === 'image' ? 'stored' : 'failed';
  if (!reading.blocks.some((b) => b.text.trim())) return reading.pages.some((p) => p.ocr === 'needed') ? 'scanned' : 'failed';
  if (reading.pages.some((p) => p.ocr === 'needed')) return 'scanned';
  if (reading.unread) return 'partial';
  return 'ready';
}

const unit = (format: string) => (format === 'pptx' || format === 'odp' ? 'slide' : format === 'xlsx' || format === 'ods' ? 'sheet' : 'page');

/** How well a source was read, in words. */
export function statusLabel(s: Pick<SourceMeta, 'status' | 'pages' | 'format'>, reading?: SourceDoc | null): string {
  const u = unit(s.format);
  const n = s.pages ? `${s.pages} ${u}${s.pages === 1 ? '' : 's'}` : '';
  switch (s.status) {
    case 'ready':
      return n ? `Read · ${n}` : 'Read';
    case 'partial':
      return reading?.unread ? `Partly read · ${u}s ${reading.unread.from}–${reading.unread.to} not read` : `Partly read${n ? ` · ${n}` : ''}`;
    case 'scanned':
      return 'Scanned pages not read yet';
    case 'failed':
      return 'Nothing could be read from it';
    case 'stored':
      return 'Kept as an image';
  }
}

// ── cleaning ─────────────────────────────────────────────────────────

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** A reading small enough to keep on the record: tables and figures go first, then blocks from the end (said, not hidden). */
export function fitReading(doc: SourceDoc): SourceDoc {
  let out = doc;
  const size = (d: SourceDoc) => JSON.stringify(d).length;
  if (size(out) <= SOURCE_LIMITS.readingChars) return out;
  out = { ...out, figures: [], tables: [] };
  if (size(out) <= SOURCE_LIMITS.readingChars) return out;
  let blocks = out.blocks;
  while (blocks.length > 1 && size({ ...out, blocks }) > SOURCE_LIMITS.readingChars) blocks = blocks.slice(0, Math.floor(blocks.length * 0.85));
  const lastPage = blocks.length ? blocks[blocks.length - 1].page : 0;
  return { ...out, blocks, pages: out.pages.filter((p) => p.n <= lastPage), unread: { from: Math.min(out.pageCount, lastPage + 1), to: out.pageCount } };
}

export interface SourceInput {
  name: string;
  file_name: string;
  mime: string;
  size: number;
  kind: SourceKind;
  file_id: string | null;
  doc_id: string | null;
  reading: SourceDoc | null;
  conversation_ids: string[];
}

/** What a browser sends to make a source, checked. Null when it is not one. */
export function sanitizeSourceInput(raw: unknown): SourceInput | null {
  const r = obj(raw);
  const file_name = cleanText(r.fileName ?? r.name, SOURCE_LIMITS.name);
  const name = cleanText(r.name, SOURCE_LIMITS.name) || file_name;
  if (!name) return null;
  const mime = cleanText(r.mime, 120).toLowerCase();
  const size = typeof r.size === 'number' && Number.isFinite(r.size) && r.size >= 0 ? Math.floor(r.size) : 0;
  const file_id = typeof r.fileId === 'string' && FILE_ID_RE.test(r.fileId) ? r.fileId : null;
  const parsed = r.reading === undefined || r.reading === null ? null : sanitizeSourceDoc(r.reading);
  const reading = parsed ? fitReading(parsed) : null;
  const doc_id = reading ? reading.id : typeof r.docId === 'string' && DOC_ID_RE.test(r.docId) ? r.docId : null;
  if (!file_id && !reading) return null;
  const conversation_ids = [...new Set((Array.isArray(r.conversationIds) ? r.conversationIds : []).map(cleanId).filter((x): x is string => !!x))].slice(0, SOURCE_LIMITS.conversations);
  return { name, file_name: file_name || name, mime, size, kind: sourceKindOf(file_name || name, mime), file_id, doc_id, reading, conversation_ids };
}

export interface RefInput {
  source_id: string;
  node_id: string;
  passage: string | null;
  quote: string;
  note: string;
  ground: Ground | null;
  origin: RefOrigin;
}

export function sanitizeRefInput(raw: unknown): RefInput | null {
  const r = obj(raw);
  const source_id = typeof r.sourceId === 'string' && SOURCE_ID_RE.test(r.sourceId) ? r.sourceId : null;
  const node_id = cleanId(r.nodeId);
  if (!source_id || !node_id) return null;
  return {
    source_id,
    node_id,
    passage: typeof r.passage === 'string' && BLOCK_ID_RE.test(r.passage) ? r.passage : null,
    quote: cleanText(r.quote, SOURCE_LIMITS.quote, { multiline: true }),
    note: cleanText(r.note, SOURCE_LIMITS.note),
    ground: (GROUNDS as readonly string[]).includes(r.ground as string) ? (r.ground as Ground) : null,
    origin: r.origin === 'ai' ? 'ai' : 'human',
  };
}

export const metaOf = (row: SourceRow): SourceMeta => {
  const { user_id: _u, reading: _r, ...meta } = row;
  void _u;
  void _r;
  return meta;
};

// ── passages ─────────────────────────────────────────────────────────

/** A passage's words, cut to a length, for showing where a reference points. */
export function excerptOf(doc: SourceDoc | null | undefined, block: string | null, max = 280): string {
  if (!doc) return '';
  const b = block ? doc.blocks.find((x) => x.id === block) : doc.blocks.find((x) => x.kind !== 'heading' && x.kind !== 'title' && x.text.trim());
  if (!b) return '';
  const t = b.text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** The headings of a reading, in order: its outline. */
export const outlineOf = (doc: SourceDoc | null | undefined, max = 12): DocBlock[] => (doc ? doc.blocks.filter((b) => (b.kind === 'heading' || b.kind === 'title') && b.text.trim()).slice(0, max) : []);

/**
 * The part of a reading that bears on a question: its outline and the passages that best match the question (BM25,
 * the main app's own retrieval), in reading order and within a budget — never the whole document. With no question,
 * the opening. The result is a reading of the same document (same id), so the chat endpoint letters and cites it as
 * usual and shows it passage by passage.
 */
export function readingForQuestion(doc: SourceDoc, query: string, opts: { passages?: number; chars?: number } = {}): SourceDoc {
  const n = opts.passages ?? SOURCE_LIMITS.passages;
  const budget = opts.chars ?? SOURCE_LIMITS.passageChars;
  const chosen = new Set<string>();
  let used = 0;
  const take = (b: DocBlock) => {
    if (chosen.has(b.id) || used >= budget) return;
    chosen.add(b.id);
    used += b.text.length;
  };
  for (const h of outlineOf(doc, 24)) take(h);
  const hits = query.trim() ? selectPassages(doc, query, n) : [];
  for (const { block } of hits) take(block);
  if (!hits.length) for (const b of doc.blocks.filter((x) => x.kind !== 'heading' && x.kind !== 'title' && x.text.trim()).slice(0, n)) take(b);
  const blocks = doc.blocks.filter((b) => chosen.has(b.id));
  const pages = new Set(blocks.map((b) => b.page));
  const tables = new Set(blocks.map((b) => b.table).filter(Boolean));
  const figures = new Set(blocks.map((b) => b.figure).filter(Boolean));
  return {
    ...doc,
    blocks,
    pages: doc.pages.filter((p) => pages.has(p.n)),
    tables: doc.tables.filter((t) => tables.has(t.id)),
    figures: doc.figures.filter((f) => figures.has(f.id)),
  };
}

/** A reply's words without its citation keys: a key ([A1.4]) numbers the documents of one exchange and means nothing
 *  once the words are kept elsewhere — there, what they were drawn from is kept as references instead. */
export const withoutCitations = (text: string) => text.replace(/[ \t]?\[[A-Z]\d{1,4}\.\d{1,5}\]/g, '');

/** The citation keys a reply uses ([A3.12]). */
export function citationsIn(text: string): { letter: string; block: string }[] {
  const out: { letter: string; block: string }[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/\[([A-Z]\d{1,4}\.\d{1,5})\]/g)) {
    const k = parseKey(m[1]);
    if (k && !seen.has(m[1])) {
      seen.add(m[1]);
      out.push(k);
    }
  }
  return out;
}

// ── what is in the workspace already ────────────────────────────────

interface MessageLike {
  role?: string;
  content?: string;
  attachments?: unknown;
}

export interface ConversationDoc {
  doc_id: string;
  file_id: string | null;
  name: string;
  pages: number;
  format: string;
  /** the reading as text, as the attachment kept it */
  text: string;
  conversation_ids: string[];
}

/**
 * Documents already brought into conversations (as message attachments) — the person's existing uploads, offered in
 * the library so nothing they brought in before is lost from view. Each once, with every conversation it is in.
 */
export function conversationDocs(conversations: Iterable<{ id: string; messages: MessageLike[] }>): ConversationDoc[] {
  const out = new Map<string, ConversationDoc>();
  for (const c of conversations) {
    for (const m of c.messages) {
      for (const a of Array.isArray(m.attachments) ? m.attachments : []) {
        const at = obj(a);
        if (at.kind !== 'doc' || typeof at.doc !== 'string' || !DOC_ID_RE.test(at.doc)) continue;
        const had = out.get(at.doc);
        if (had) {
          if (!had.conversation_ids.includes(c.id)) had.conversation_ids.push(c.id);
          continue;
        }
        out.set(at.doc, {
          doc_id: at.doc,
          file_id: typeof at.file === 'string' && FILE_ID_RE.test(at.file) ? at.file : null,
          name: cleanText(at.name, SOURCE_LIMITS.name) || 'Document',
          pages: typeof at.pages === 'number' ? at.pages : 0,
          format: cleanText(at.format, 20) || 'txt',
          text: typeof at.text === 'string' ? at.text : '',
          conversation_ids: [c.id],
        });
      }
    }
  }
  return [...out.values()];
}

/** Where a source is used: the components that reference it, the conversations it is in, the canvases it sits on. */
export function usesOf(
  source: Pick<SourceMeta, 'id' | 'doc_id' | 'conversation_ids'>,
  refs: readonly SourceRefRow[],
  nodes: readonly NodeRow[],
  conversations: Iterable<{ id: string; messages: MessageLike[] }>,
  placements: Readonly<Record<string, string[]>>
): { nodes: NodeRow[]; conversations: string[]; canvases: string[] } {
  const ids = new Set(refs.filter((r) => r.source_id === source.id).map((r) => r.node_id));
  const convs = new Set(source.conversation_ids);
  if (source.doc_id) for (const d of conversationDocs(conversations)) if (d.doc_id === source.doc_id) d.conversation_ids.forEach((c) => convs.add(c));
  return { nodes: nodes.filter((n) => ids.has(n.id) && n.archived_at === null), conversations: [...convs], canvases: placements[source.id] ?? [] };
}

// ── finding things to mention ───────────────────────────────────────

export interface Mentionable {
  kind: 'source' | NodeRow['type'];
  id: string;
  label: string;
  hint: string;
}

/** What matches what is typed after @: names that start with it first, then names that contain it. */
export function matchMentions(items: readonly Mentionable[], query: string, max = 8): Mentionable[] {
  const q = query.trim().toLowerCase();
  if (!q) return items.slice(0, max);
  const score = (m: Mentionable) => {
    const l = m.label.toLowerCase();
    if (l.startsWith(q)) return 0;
    if (l.split(/[\s._-]+/).some((w) => w.startsWith(q))) return 1;
    if (l.includes(q)) return 2;
    return 9;
  };
  return items
    .map((m) => ({ m, s: score(m) }))
    .filter((x) => x.s < 9)
    .sort((a, b) => a.s - b.s || a.m.label.length - b.m.label.length)
    .slice(0, max)
    .map((x) => x.m);
}

/** How a component stands on its sources, in words: what is quoted, an interpretation, or nothing cited. */
export function standingOf(node: Pick<NodeRow, 'provenance'>, refs: readonly SourceRefRow[]): string {
  const ai = node.provenance.origin === 'ai';
  if (!refs.length) return ai ? 'AI-generated, no source cited' : node.provenance.origin === 'external' ? 'From an outside source' : 'Yours';
  const n = new Set(refs.map((r) => r.source_id)).size;
  const of = `${n} source${n === 1 ? '' : 's'}`;
  if (refs.some((r) => r.ground === 'verbatim')) return `Quoted from ${of}`;
  return ai ? `AI interpretation of ${of}` : `Backed by ${of}`;
}

/**
 * The documents an exchange draws on: those attached to its question, and those its replies cite ([A3.12]), each with
 * the passages cited. Letters are counted over the whole conversation, as the chat endpoint counts them.
 */
export function exchangeDocs(all: readonly MessageLike[], ex: { ask?: MessageLike | null; replies: readonly MessageLike[] }): { doc_id: string; name: string; passages: string[] }[] {
  const letters = new Map<string, string>();
  const names = new Map<string, string>();
  for (const m of all)
    for (const a of Array.isArray(m.attachments) ? m.attachments : []) {
      const at = obj(a);
      if (at.kind !== 'doc' || typeof at.doc !== 'string' || letters.has(at.doc)) continue;
      if (letters.size >= 26) break;
      letters.set(at.doc, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[letters.size]);
      names.set(at.doc, cleanText(at.name, SOURCE_LIMITS.name) || 'Document');
    }
  const byLetter = new Map([...letters].map(([doc, l]) => [l, doc]));
  const out = new Map<string, { doc_id: string; name: string; passages: string[] }>();
  const entry = (doc: string) => {
    let e = out.get(doc);
    if (!e) out.set(doc, (e = { doc_id: doc, name: names.get(doc) ?? 'Document', passages: [] }));
    return e;
  };
  for (const a of Array.isArray(ex.ask?.attachments) ? (ex.ask?.attachments as unknown[]) : []) {
    const at = obj(a);
    if (at.kind === 'doc' && typeof at.doc === 'string' && DOC_ID_RE.test(at.doc)) entry(at.doc);
  }
  for (const r of ex.replies)
    for (const c of citationsIn(typeof r.content === 'string' ? r.content : '')) {
      const doc = byLetter.get(c.letter);
      if (doc && !entry(doc).passages.includes(c.block)) entry(doc).passages.push(c.block);
    }
  return [...out.values()];
}
