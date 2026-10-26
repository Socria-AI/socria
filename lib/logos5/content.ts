// lib/logos5/content.ts — WHAT CONTENT HOLDS (Alex Tran: the Content view).
//
// Everything brought to a line of thinking, as cards: the documents attached
// in its conversation or sorted into its topics, the notes pasted into it, the
// pictures shown to it. Read from what the session already holds — the
// messages' attachments, the study's files, the documents read on this device
// — so nothing is stored twice, and a card can only stand for something that
// is there. A document attached three times is one card.
//
// AND WHAT THEY ASKED TO READ. Content is where substantial reading lives: a
// write-up they asked for — notes, a guide, a report (lib/runtime/
// orchestrate.ts routeTurn: 'reading') — is a card here, read as a document,
// and the conversation shows only its title and opening, so the same pages
// are never in two places. Which replies those are is read from the request
// each one answered, by the same reader the server used to write it.
//
// Pure.

import { mayAskToRead, routeTurn } from '../runtime/orchestrate';

export type ContentKind = 'doc' | 'note' | 'image' | 'writeup';

export interface ContentEntry {
  /** stable across visits: `doc:<id>` for a document, `note:<message>:<n>`, `img:<message>:<n>` */
  id: string;
  kind: ContentKind;
  title: string;
  /** "PDF · 12 pages" */
  meta: string;
  snippet?: string;
  /** a document's reading id */
  doc?: string;
  /** a note's text, or a document's reading when it is not on this device */
  text?: string;
  /** a picture's preview */
  image?: string;
  /** what was read in a picture */
  caption?: string;
}

interface AttachmentLike {
  kind: string;
  name?: string;
  text?: string;
  words?: number;
  reading?: string;
  thumb?: string;
  preview?: string;
  doc?: string;
  pages?: number;
  format?: string;
}

interface DocLike {
  name: string;
  format: string;
  title?: string;
  pageCount: number;
  blocks: readonly { text: string; kind?: string }[];
}

const FORMAT_NAME: Record<string, string> = {
  pdf: 'PDF',
  docx: 'Word',
  odt: 'Document',
  rtf: 'Document',
  pptx: 'Slides',
  odp: 'Slides',
  xlsx: 'Sheet',
  ods: 'Sheet',
  csv: 'Table',
  tsv: 'Table',
  md: 'Markdown',
  txt: 'Text',
  html: 'Web page',
  tex: 'LaTeX',
  ipynb: 'Notebook',
  image: 'Scan',
  code: 'Code',
};

const one = (s: string | undefined, max: number) => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

function pagesSaid(format: string, n: number): string {
  if (!n || n < 1) return '';
  if (format === 'pptx' || format === 'odp') return `${n} ${n === 1 ? 'slide' : 'slides'}`;
  if (format === 'xlsx' || format === 'ods') return `${n} ${n === 1 ? 'sheet' : 'sheets'}`;
  return `${n} ${n === 1 ? 'page' : 'pages'}`;
}

/** "lecture-4.pptx" → "pptx": what a file is, by its name, when nothing else says. */
const extOf = (name: string | undefined): string | undefined => {
  const m = /\.([a-z0-9]{2,5})$/i.exec(name ?? '');
  return m ? m[1].toLowerCase() : undefined;
};

export function docMeta(format: string | undefined, pages: number | undefined): string {
  const f = (format ?? '').toLowerCase();
  const kind = FORMAT_NAME[f] ?? (f ? f.toUpperCase() : 'Document');
  const p = pagesSaid(f, pages ?? 0);
  return p ? `${kind} · ${p}` : kind;
}

/** The opening of a document, for its card: the first passage that is not a title or a heading. */
function openingOf(doc: DocLike | undefined): string | undefined {
  if (!doc) return undefined;
  const b = doc.blocks.find((x) => x.text && x.kind !== 'title' && x.kind !== 'heading') ?? doc.blocks.find((x) => x.text);
  return b ? one(b.text, 140) : undefined;
}

// ── write-ups ────────────────────────────────────────────────────────

interface Said {
  role: string;
  content?: unknown;
}

/**
 * Which replies are write-ups, in one pass: each request read as the server
 * read it — against the reply before it (lib/map-skip.ts lastReplyIn) — and
 * every reply to one that asked for something to read and keep.
 */
function writeUpsOf(messages: readonly Said[]): Set<number> {
  const at = new Set<number>();
  let before: string | null = null;
  let reading = false;
  messages.forEach((m, i) => {
    if (m?.role === 'user') {
      const text = typeof m.content === 'string' ? m.content : '';
      const was = asked.get(m);
      reading = was && was.text === text && was.before === before ? was.reading : mayAskToRead(text) && routeTurn({ text, lastReply: before }).intent === 'reading';
      asked.set(m, { text, before, reading });
    } else if (m?.role === 'assistant') {
      if (reading && typeof m.content === 'string' && m.content.trim()) at.add(i);
      before = typeof m.content === 'string' ? m.content : '';
    }
  });
  return at;
}

// Read once: the cards and every message drawn ask on each render, and a list is a new list
// when anything in it changes — so the conversation as it stands is remembered, and each
// request's reading (routeTurn costs milliseconds), until its words or the reply before it change.
const readings = new WeakMap<readonly Said[], { n: number; last: Said | undefined; at: Set<number> }>();
const asked = new WeakMap<Said, { text: string; before: string | null; reading: boolean }>();
function writeUpsIn(messages: readonly Said[]): Set<number> {
  const last = messages[messages.length - 1];
  const was = readings.get(messages);
  if (was && was.n === messages.length && was.last === last) return was.at;
  const at = writeUpsOf(messages);
  readings.set(messages, { n: messages.length, last, at });
  return at;
}

/** The reply at `i` answers a request for something to read and keep — it is a write-up, filed in Content. */
export function isWriteUp(messages: readonly Said[], i: number): boolean {
  return writeUpsIn(messages).has(i);
}

/**
 * A write-up's parts: its title (the "# " line it was asked to begin with,
 * else its first sentence), its opening (the first passage after the title),
 * and its length. Tolerant of a reply still arriving: a title with nothing
 * under it yet has no opening.
 */
export function writeUpParts(text: string): { title: string; opening: string; words: number } {
  const lines = text.replace(/\r/g, '').split('\n');
  const at = lines.findIndex((l) => l.trim());
  const first = at >= 0 ? lines[at].trim() : '';
  const heading = /^#{1,3}\s+(.+?)\s*#*$/.exec(first);
  const title = one(heading ? heading[1] : first.split(/(?<=[.!?])\s/)[0] || 'Write-up', 90).replace(/[*_`]/g, '');
  const rest = heading ? lines.slice(at + 1) : lines.slice(at);
  const passage = rest
    .join('\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => p && !/^#{1,3}\s/.test(p) && !/^```/.test(p));
  const opening = passage ? one(passage.replace(/^[-*]\s+/gm, '').replace(/[*_`]/g, ''), 280) : '';
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return { title, opening, words };
}

/** A write-up's card id: stable across visits, from the reply's own id (or its place, before ids existed). */
export const writeUpId = (m: { id?: string }, i: number): string => `write:${m.id && /^[\w-]{1,80}$/.test(m.id) ? m.id : `i${i}`}`;

/**
 * Every card of a line of thinking, in the order things were brought: each
 * document once (its first arrival), each note and picture where it was said,
 * each write-up where it was written.
 */
export function contentOf(
  messages: readonly { id?: string; role: string; content?: unknown; attachments?: readonly AttachmentLike[] }[],
  files: readonly { doc: string; name: string; pages: number }[],
  docs: ReadonlyMap<string, DocLike>
): ContentEntry[] {
  const out: ContentEntry[] = [];
  const seen = new Set<string>();
  const addDoc = (id: string, name: string | undefined, format: string | undefined, pages: number | undefined, text?: string) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    const d = docs.get(id);
    const snippet = openingOf(d) ?? (text ? one(text, 140) : undefined);
    out.push({
      id: `doc:${id}`,
      kind: 'doc',
      doc: id,
      title: one(d?.title || d?.name || name || 'Document', 90),
      meta: docMeta(d?.format ?? format ?? extOf(name), d?.pageCount ?? pages),
      ...(snippet ? { snippet } : {}),
      ...(text ? { text } : {}),
    });
  };
  messages.forEach((m, mi) => {
    const key = (m.id && /^[\w-]{1,80}$/.test(m.id) ? m.id : `i${mi}`) as string;
    if (isWriteUp(messages, mi)) {
      const text = String(m.content);
      const w = writeUpParts(text);
      out.push({
        id: writeUpId(m, mi),
        kind: 'writeup',
        title: w.title,
        meta: `Written by Socria · ${w.words} ${w.words === 1 ? 'word' : 'words'}`,
        ...(w.opening ? { snippet: one(w.opening, 140) } : {}),
        text,
      });
      return;
    }
    (m.attachments ?? []).forEach((a, ai) => {
      if (!a || typeof a !== 'object') return;
      if (a.kind === 'doc' && a.doc) addDoc(a.doc, a.name, a.format, a.pages, a.text);
      else if (a.kind === 'note' && a.text?.trim()) {
        const words = a.words ?? a.text.trim().split(/\s+/).length;
        out.push({
          id: `note:${key}:${ai}`,
          kind: 'note',
          title: one(a.name || a.text.split('\n').find((l) => l.trim()) || 'Note', 90),
          meta: `Note · ${words} ${words === 1 ? 'word' : 'words'}`,
          snippet: one(a.text, 140),
          text: a.text,
        });
      } else if (a.kind === 'image' && (a.thumb || a.preview || a.reading)) {
        out.push({
          id: `img:${key}:${ai}`,
          kind: 'image',
          title: one(a.name || 'Picture', 90),
          meta: 'Picture',
          ...(a.reading ? { snippet: one(a.reading, 140), caption: a.reading } : {}),
          ...(a.preview || a.thumb ? { image: a.preview || a.thumb } : {}),
        });
      }
    });
  });
  for (const f of files) addDoc(f.doc, f.name, undefined, f.pages);
  return out;
}

/**
 * The material a turn brought — its documents and notes, not a picture shown
 * to ask about it — for the conversation's "Added to Content" line (Alex's
 * rule B: read in the background, said in a line, a press away).
 */
export function broughtBy(m: { id?: string; attachments?: readonly AttachmentLike[] }, entries: readonly ContentEntry[]): ContentEntry[] {
  const ids = new Set<string>();
  for (const a of m.attachments ?? []) {
    if (a.kind === 'doc' && a.doc) ids.add(`doc:${a.doc}`);
  }
  const key = m.id && /^[\w-]{1,80}$/.test(m.id) ? m.id : null;
  return entries.filter((e) => ids.has(e.id) || (!!key && e.id.startsWith(`note:${key}:`)));
}
