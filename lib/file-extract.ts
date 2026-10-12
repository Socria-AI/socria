import 'server-only';
// lib/file-extract.ts
//
// Turning a file into something a model can read.
//
// Every document is read ONCE, when it is attached, into a structured
// reading (lib/docs: its blocks, tables, figures and equations, where each
// came from, and the checks run against the file's own text). From that one
// reading come two things:
//
//   notes   the reading written out as text — headings, lists, tables as
//           rows, equations, figures by their alt text and charts by their
//           numbers, page markers, and any problem the checks found — for
//           Core 4, which reads text
//   docs    the reading itself, for Logos, which cites it passage by passage
//           and shows it beside the map (asked for with `docs: true`)
//
// Formats: PDF (reading order rebuilt from the page's geometry), Word,
// PowerPoint, Excel, OpenDocument, RTF, Markdown, CSV, HTML, LaTeX,
// notebooks, text and code; a zip of any of these, each file read in its own
// right, images inside handed back to be read like any other image.
//
// A zip is untrusted input with a famous failure mode: a few KB that inflate
// to gigabytes. lib/docs/zip.ts inflates under a hard ceiling for every
// archive here, and the sizes an archive declares about itself are never
// trusted for that.

import { MAX_FILE_TEXT, extensionOf, isSecretFile, kindOfFile, refusalFor } from './file-kinds';
import { readDocument, type DocRead } from './docs/read';
import { renderDocAsNote } from './docs/render';
import { MAX_ENTRIES, unzip } from './docs/zip';

export interface ExtractedNote {
  name: string;
  text: string;
  /** cut at MAX_FILE_TEXT */
  truncated: boolean;
}

export interface ExtractedImage {
  name: string;
  /** data:image/...;base64 — for the vision pass, never stored */
  dataUrl: string;
}

export interface ExtractResult {
  notes: ExtractedNote[];
  images: ExtractedImage[];
  /** files that could not be read, each with the reason */
  skipped: string[];
  /** the structured readings, when asked for */
  docs?: DocRead[];
}

/** Images handed back out of a zip — each one is a vision call. */
const MAX_ZIP_IMAGES = 4;
/** An image inside a zip larger than this is not worth base64-ing back. */
const MAX_ZIP_IMAGE_BYTES = 3 * 1024 * 1024;
/** Documents read in their own right out of one zip. */
const MAX_ZIP_DOCS = 8;

/** True when the bytes look like text rather than a binary format. */
export function looksLikeText(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8192);
  let odd = 0;
  for (let i = 0; i < n; i++) {
    const b = buf[i];
    if (b === 0) return false;
    if (b < 9 || (b > 13 && b < 32)) odd++;
  }
  return odd / Math.max(n, 1) < 0.02;
}

const IMAGE_MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

/** One document, read: its note, and its reading. Throws with a reason a person can read. */
/** Pictures handed back with a reading, for a vision description on request: few, small, and well under a response's limit. */
const MEDIA = { count: 4, bytes: 700_000, total: 1_800_000 };

async function readOne(name: string, buf: Buffer, max: number, withMedia = false): Promise<{ note: ExtractedNote; read: DocRead }> {
  const read = await readDocument(name, buf, withMedia ? { media: MEDIA } : {});
  const doc = read.doc;
  // a PDF that is ALL scan: nothing to read as text here — Logos reads such pages from their images
  if (doc.format === 'pdf' && !doc.blocks.length && doc.pages.some((p) => p.ocr === 'needed')) {
    throw new Error('it has no text layer — it looks scanned. Attach the pages as images instead');
  }
  const { text, truncated } = renderDocAsNote(doc, max);
  return { note: { name, text: text.replace(/\u0000/g, ''), truncated }, read };
}

/**
 * Everything readable in a zip, as ONE note — a folder of files is one thing
 * somebody attached, and six chips for one archive would be noise. Each file
 * is headed by its path so the model can say which file it means. With
 * `docs`, each document inside is also returned as a reading of its own.
 */
async function zipContents(name: string, buf: Buffer, withDocs: boolean): Promise<ExtractResult> {
  const files = unzip(buf);
  const skipped: string[] = [];
  const images: ExtractedImage[] = [];
  const sections: string[] = [];
  const docs: DocRead[] = [];
  let total = 0;
  let looked = 0;
  const paths = Array.from(files.keys())
    .filter((p) => !/(^|\/)(__MACOSX|\.git|node_modules|\.DS_Store)(\/|$)/.test(p) && !/(^|\/)\._/.test(p))
    .sort();

  for (const path of paths) {
    if (looked++ >= MAX_ENTRIES) {
      skipped.push(`${paths.length - MAX_ENTRIES} more files in ${name} (only the first ${MAX_ENTRIES} were looked at)`);
      break;
    }
    if (isSecretFile(path)) {
      skipped.push(`${path} (looks like a secrets file)`);
      continue;
    }
    const kind = kindOfFile(path);
    try {
      if (kind === 'image') {
        if (images.length >= MAX_ZIP_IMAGES) {
          skipped.push(`${path} (only ${MAX_ZIP_IMAGES} images are read from an archive)`);
          continue;
        }
        const bytes = files.get(path)!();
        if (bytes.length > MAX_ZIP_IMAGE_BYTES) {
          skipped.push(`${path} (image too large)`);
          continue;
        }
        images.push({ name: path.split('/').pop() || path, dataUrl: `data:${IMAGE_MIME[extensionOf(path)] ?? 'image/png'};base64,${bytes.toString('base64')}` });
        continue;
      }
      if (total >= MAX_FILE_TEXT) {
        skipped.push(`${path} (the archive's text limit was reached)`);
        continue;
      }
      if (extensionOf(path) === 'zip') {
        skipped.push(`${path} (archives inside archives are not opened)`);
        continue;
      }
      const bytes = files.get(path)!();
      if (kind !== 'document' && kind !== 'text' && !looksLikeText(bytes)) {
        skipped.push(`${path} (not a readable format)`);
        continue;
      }
      const { note, read } = await readOne(path, bytes, MAX_FILE_TEXT);
      const text = note.text.trim();
      if (!text) continue;
      const section = `--- ${path} ---\n${text}`;
      sections.push(section);
      total += section.length;
      if (withDocs && kind === 'document' && docs.length < MAX_ZIP_DOCS) docs.push(read);
    } catch (e) {
      skipped.push(`${path} (${e instanceof Error ? e.message : 'could not be read'})`);
    }
  }

  const notes: ExtractedNote[] = [];
  if (sections.length) {
    const header = `Archive ${name}: ${sections.length} file${sections.length === 1 ? '' : 's'} read${images.length ? `, ${images.length} image${images.length === 1 ? '' : 's'} attached separately` : ''}.`;
    const text = `${header}\n\n${sections.join('\n\n')}`;
    notes.push(text.length > MAX_FILE_TEXT ? { name, text: text.slice(0, MAX_FILE_TEXT), truncated: true } : { name, text, truncated: false });
  }
  if (!notes.length && !images.length) skipped.unshift(`${name} (nothing inside it could be read)`);
  return { notes, images, skipped, ...(withDocs ? { docs } : {}) };
}

/** The whole reader: one uploaded file in, notes and images out — and, asked for, its structured reading. */
export async function extractFile(name: string, buf: Buffer, opts: { docs?: boolean } = {}): Promise<ExtractResult> {
  const kind = kindOfFile(name);
  if (kind === 'secret' || kind === 'image') return { notes: [], images: [], skipped: [refusalFor(name)] };
  if (extensionOf(name) === 'zip') {
    try {
      return await zipContents(name, buf, !!opts.docs);
    } catch (e) {
      return { notes: [], images: [], skipped: [`${name} could not be opened: ${e instanceof Error ? e.message : 'unknown error'}.`] };
    }
  }
  if (kind === 'unsupported' && !looksLikeText(buf)) return { notes: [], images: [], skipped: [refusalFor(name)] };
  try {
    const { note, read } = await readOne(name, buf, MAX_FILE_TEXT, !!opts.docs);
    if (!note.text.trim()) return { notes: [], images: [], skipped: [`${name} has no text in it.`] };
    return { notes: [note], images: [], skipped: [], ...(opts.docs ? { docs: [read] } : {}) };
  } catch (e) {
    return { notes: [], images: [], skipped: [`${name} could not be read: ${e instanceof Error ? e.message : 'unknown error'}.`] };
  }
}
