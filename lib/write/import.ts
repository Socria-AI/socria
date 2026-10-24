// lib/write/import.ts — a file opened into the writing.
//
// Word (.docx), Markdown, plain text and HTML are read here, in the browser,
// and never leave the device — with their formatting, tables and pictures
// (a picture comes in at the address it had and is kept by the caller before
// it joins the writing: parse.ts settleImages). Other formats a writer might
// have (PDF, OpenDocument, RTF) go through the same document reader every
// attachment does and come in as their words and their shape — headings,
// lists, paragraphs — without emphasis; a PDF holds placed text, not
// paragraphs and styles, and the import says so.
//
// PURE apart from the reader passed in for those other formats.

import type { SourceDoc } from '@/lib/docs/types';
import { uid, type Block, type PageSetup } from './doc';
import { decodeHtml, htmlToBlocks, markdownToBlocks, textToBlocks } from './parse';
import { readDocx } from './word';
import { ZipError } from './zip';

export interface Imported {
  title: string;
  blocks: Block[];
  notes: string[];
  /** a Word document's paper and margins, and its own font and size */
  page?: PageSetup;
  font?: string;
  size?: number;
}

/** What can be opened, for the file picker. */
export const IMPORT_ACCEPT = '.docx,.docm,.dotx,.md,.markdown,.txt,.text,.html,.htm,.pdf,.odt,.rtf';

export const MAX_IMPORT_BYTES = 25 * 1024 * 1024;

const stem = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();

/** A SourceDoc's blocks as writing: headings, paragraphs, lists and quotes; page furniture left out. */
export function blocksFromSource(doc: SourceDoc, format: 'pdf' | 'other' = 'other'): Imported {
  const blocks: Block[] = [];
  let title = doc.title?.trim() ?? '';
  let figures = 0;
  let tables = 0;
  for (const b of doc.blocks) {
    const text = b.text.replace(/\r\n?/g, '\n').trim();
    if (!text) continue;
    if (b.kind === 'header' || b.kind === 'footer') continue;
    if (b.kind === 'figure') {
      figures++;
      continue;
    }
    if (b.kind === 'title') {
      if (!title) title = text.replace(/\s+/g, ' ');
      else blocks.push({ id: uid('b'), t: 'h1', text });
      continue;
    }
    if (b.kind === 'heading') {
      const n = b.level ?? 1;
      blocks.push({ id: uid('b'), t: n <= 1 ? 'h1' : n === 2 ? 'h2' : 'h3', text: text.replace(/\s+/g, ' ') });
      continue;
    }
    if (b.kind === 'list') {
      // the reader keeps a list's label in its words ("1.", "•"); it becomes the list's own
      const m = /^(\(?(\d+|[a-z]|[ivxlc]+)[.)]|[•\-–*·▪◦])\s+/i.exec(text);
      const ordered = !!m && /^\(?(\d+|[a-z]|[ivxlc]+)[.)]/i.test(m[1]);
      blocks.push({ id: uid('b'), t: ordered ? 'ol' : 'ul', lvl: Math.max(1, Math.min(3, b.level ?? 1)), text: m ? text.slice(m[0].length) : text });
      continue;
    }
    if (b.kind === 'quote') {
      blocks.push({ id: uid('b'), t: 'quote', text });
      continue;
    }
    if (b.kind === 'table') tables++;
    blocks.push({ id: uid('b'), t: 'p', text });
  }
  const notes = [
    format === 'pdf'
      ? 'A PDF holds words placed on pages, not paragraphs and styles: its words and headings came in, without their fonts, emphasis or layout.'
      : 'The words came in without their bold, italics and underlining — open a .docx to keep them.',
  ];
  if (figures) notes.push(figures === 1 ? 'A picture was left out.' : `${figures} pictures were left out.`);
  if (tables) notes.push(tables === 1 ? 'A table came in as lines of text.' : `${tables} tables came in as lines of text.`);
  return { title, blocks, notes };
}

/**
 * A file into the writing. `readOther` is the document reader for formats the
 * browser cannot read itself. Throws with a sentence a person can read.
 */
export async function importFile(file: File, readOther?: (file: File) => Promise<SourceDoc>): Promise<Imported> {
  const name = file.name;
  if (file.size > MAX_IMPORT_BYTES) throw new Error(`${name} is too large to open here — 25 MB is the most.`);
  if (/\.doc$/i.test(name)) throw new Error('That is an older Word file (.doc). Open it in Word, choose File → Save As → Word Document (.docx), and open that here.');
  if (/\.(docx|docm|dotx)$/i.test(name)) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      const r = await readDocx(bytes);
      if (!r.blocks.length && !r.title) throw new ZipError(`${name} has no words in it to bring in.`);
      return { title: r.title || stem(name), blocks: r.blocks, notes: r.notes, ...(r.page ? { page: r.page } : {}), ...(r.font ? { font: r.font } : {}), ...(r.size ? { size: r.size } : {}) };
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : 'That document could not be opened.');
    }
  }
  if (/\.(md|markdown|txt|text|html?)$/i.test(name)) {
    const text = await file.text();
    if (!text.trim()) throw new Error(`${name} is empty.`);
    if (/\.html?$/i.test(name)) {
      const t = decodeHtml(/<title[^>]*>([^<]*)<\/title>/i.exec(text)?.[1] ?? '').replace(/\s+/g, ' ').trim();
      const blocks = htmlToBlocks(text, { images: true });
      // a page Socria made puts its title first, as a heading: it is the title, not a heading
      const first = blocks[0];
      if (t && first?.t === 'h1' && first.text === t) return { title: t, blocks: blocks.slice(1), notes: [] };
      return { title: t || stem(name), blocks, notes: [] };
    }
    if (/\.(md|markdown)$/i.test(name)) {
      const blocks = markdownToBlocks(text, { images: true });
      // a Markdown file's first top heading is its title
      const first = blocks[0];
      if (first?.t === 'h1') return { title: first.text, blocks: blocks.slice(1), notes: [] };
      return { title: stem(name), blocks, notes: [] };
    }
    return { title: stem(name), blocks: textToBlocks(text), notes: [] };
  }
  if (/\.(pdf|odt|rtf)$/i.test(name) && readOther) {
    const doc = await readOther(file);
    const r = blocksFromSource(doc, /\.pdf$/i.test(name) ? 'pdf' : 'other');
    return { ...r, title: r.title || stem(name) };
  }
  throw new Error('That kind of file cannot be opened into the writing. Word (.docx), PDF, Markdown, text and HTML can.');
}
