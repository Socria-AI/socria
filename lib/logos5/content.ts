// lib/logos5/content.ts — WHAT CONTENT HOLDS (Alex Tran: the Content view).
//
// Everything brought to a line of thinking, as cards: the documents attached
// in its conversation or sorted into its topics, the notes pasted into it, the
// pictures shown to it. Read from what the session already holds — the
// messages' attachments, the study's files, the documents read on this device
// — so nothing is stored twice, and a card can only stand for something that
// is there. A document attached three times is one card.
//
// Pure.

export type ContentKind = 'doc' | 'note' | 'image';

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

/**
 * Every card of a line of thinking, in the order things were brought: each
 * document once (its first arrival), each note and picture where it was said.
 */
export function contentOf(
  messages: readonly { id?: string; role: string; attachments?: readonly AttachmentLike[] }[],
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
