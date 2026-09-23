import 'server-only';
// lib/file-extract.ts
//
// Turning a file into text a model can read.
//
// Core 4 reads text. So everything attached is reduced to text ONCE, when it
// is attached — the same bargain lib/logos-attachments.ts makes for images —
// and from then on the conversation carries the text, not the file.
//
//   pdf              its text layer (unpdf, a serverless build of pdf.js)
//   docx / odt       paragraphs and tables, from the XML inside the zip
//   pptx / odp       each slide's text, in slide order
//   xlsx / ods       each sheet as tab-separated rows
//   rtf              control words stripped
//   zip              every readable file inside, as one note; images inside
//                    are handed back to be read like any other image
//   text and code    UTF-8, as-is
//
// A zip is untrusted input with a famous failure mode: a few KB that inflate
// to gigabytes. Node's zlib is used rather than a JS unzipper precisely for
// `maxOutputLength`, which makes inflation STOP at a ceiling instead of
// discovering the size after the memory is gone. The sizes a zip declares
// about itself are never trusted for that.

import { inflateRawSync } from 'node:zlib';
import {
  MAX_FILE_TEXT,
  extensionOf,
  isSecretFile,
  kindOfFile,
  refusalFor,
} from './file-kinds';

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
}

/** The most any one archive may inflate to, in total. */
const MAX_INFLATED_TOTAL = 40 * 1024 * 1024;
/** The most any one entry may inflate to. */
const MAX_INFLATED_ENTRY = 16 * 1024 * 1024;
/** Entries looked at in an archive; a node_modules zip is not a document. */
const MAX_ENTRIES = 400;
/** Images handed back out of a zip — each one is a vision call. */
const MAX_ZIP_IMAGES = 4;
/** An image inside a zip larger than this is not worth base64-ing back. */
const MAX_ZIP_IMAGE_BYTES = 3 * 1024 * 1024;

// ── the zip container ───────────────────────────────────────────────

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localOffset: number;
  encrypted: boolean;
}

function readZipDirectory(buf: Buffer): ZipEntry[] {
  // End of central directory: 22 bytes plus a comment of up to 65535.
  const floor = Math.max(0, buf.length - 65_557);
  let eocd = -1;
  for (let i = buf.length - 22; i >= floor; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: ZipEntry[] = [];
  for (let n = 0; n < count && n < MAX_ENTRIES * 4; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) break;
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    out.push({ name, method, compressedSize, localOffset, encrypted: (flags & 1) === 1 });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** One entry's bytes, inflated under a hard ceiling. */
function readZipEntry(buf: Buffer, e: ZipEntry, budget: { left: number }): Buffer {
  if (e.encrypted) throw new Error('it is password-protected');
  // ZIP64 markers: sizes that do not fit 32 bits. Not supported, and not
  // something a document attached to a conversation needs.
  if (e.compressedSize === 0xffffffff || e.localOffset === 0xffffffff) throw new Error('it is too large');
  const lh = e.localOffset;
  if (lh + 30 > buf.length || buf.readUInt32LE(lh) !== 0x04034b50) throw new Error('the archive is damaged');
  const start = lh + 30 + buf.readUInt16LE(lh + 26) + buf.readUInt16LE(lh + 28);
  const raw = buf.subarray(start, start + e.compressedSize);
  const ceiling = Math.min(MAX_INFLATED_ENTRY, budget.left);
  if (ceiling <= 0) throw new Error('the archive is too large');
  let data: Buffer;
  if (e.method === 0) data = Buffer.from(raw);
  else if (e.method === 8) {
    try {
      data = inflateRawSync(raw, { maxOutputLength: ceiling });
    } catch (err) {
      if (err instanceof RangeError || /maxOutputLength|buffer/i.test(String(err))) {
        throw new Error('it inflates to more than Socria will read');
      }
      throw new Error('the archive is damaged');
    }
  } else throw new Error('it uses a compression method Socria cannot read');
  if (data.length > ceiling) throw new Error('it inflates to more than Socria will read');
  budget.left -= data.length;
  return data;
}

function unzip(buf: Buffer): Map<string, () => Buffer> {
  const budget = { left: MAX_INFLATED_TOTAL };
  const map = new Map<string, () => Buffer>();
  for (const e of readZipDirectory(buf)) {
    if (e.name.endsWith('/')) continue;
    map.set(e.name, () => readZipEntry(buf, e, budget));
  }
  return map;
}

// ── XML, without a DOM ──────────────────────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Text from an Office-style XML part.
 *
 * `text` names the element(s) whose content is text; `para` the element that
 * ends a paragraph; `cell`/`row` the table structure, if any. Everything
 * else is markup and skipped.
 */
function xmlText(
  xml: string,
  o: { text: RegExp; para: string[]; tab?: string[]; br?: string[]; cell?: string; row?: string }
): string {
  const lines: string[] = [];
  let line = '';
  let row: string[] | null = null;
  let inText = false;
  const re = /<(\/?)([A-Za-z0-9_:.-]+)[^>]*?(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  const flushLine = () => {
    const t = line.replace(/[ \t]+$/g, '');
    if (row) {
      if (t) row.push(t);
    } else lines.push(t);
    line = '';
  };
  while ((m = re.exec(xml))) {
    const [, close, tag, selfClose, text] = m;
    if (text !== undefined) {
      if (inText) line += decodeEntities(text);
      continue;
    }
    if (o.text.test(tag)) {
      inText = !close && !selfClose;
      continue;
    }
    if (!close && o.tab?.includes(tag)) line += '\t';
    else if (!close && o.br?.includes(tag)) line += '\n';
    else if (close && o.para.includes(tag)) flushLine();
    else if (o.row && tag === o.row) {
      if (!close && !selfClose) row = [];
      else if (close && row) {
        const cells = row;
        row = null;
        if (cells.length) lines.push(cells.join(' | '));
      }
    } else if (o.cell && tag === o.cell && close && row && line) flushLine();
  }
  if (line) flushLine();
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function part(files: Map<string, () => Buffer>, name: string): string | null {
  const get = files.get(name);
  return get ? get().toString('utf8') : null;
}

/** word/document.xml, then any headers, footnotes and comments worth having. */
function docx(files: Map<string, () => Buffer>): string {
  const w = { text: /^w:t$/, para: ['w:p'], tab: ['w:tab'], br: ['w:br', 'w:cr'], cell: 'w:tc', row: 'w:tr' };
  const body = part(files, 'word/document.xml');
  if (body === null) throw new Error('it has no document inside it');
  const out = [xmlText(body, w)];
  const foot = part(files, 'word/footnotes.xml');
  if (foot) {
    const t = xmlText(foot, w);
    if (t) out.push(`Footnotes:\n${t}`);
  }
  const comments = part(files, 'word/comments.xml');
  if (comments) {
    const t = xmlText(comments, w);
    if (t) out.push(`Comments:\n${t}`);
  }
  return out.join('\n\n');
}

const byNumber = (re: RegExp) => (a: string, b: string) =>
  Number(re.exec(a)?.[1] ?? 0) - Number(re.exec(b)?.[1] ?? 0);

function pptx(files: Map<string, () => Buffer>): string {
  const re = /^ppt\/slides\/slide(\d+)\.xml$/;
  const slides = Array.from(files.keys()).filter((k) => re.test(k)).sort(byNumber(re));
  if (!slides.length) throw new Error('it has no slides inside it');
  const a = { text: /^a:t$/, para: ['a:p'], br: ['a:br'], tab: ['a:tab'], cell: 'a:tc', row: 'a:tr' };
  return slides
    .map((s, i) => {
      const body = xmlText(part(files, s) ?? '', a);
      const notesName = s.replace('slides/slide', 'notesSlides/notesSlide');
      const notes = part(files, notesName);
      const n = notes ? xmlText(notes, a).replace(/^\d+$/m, '').trim() : '';
      return `Slide ${i + 1}\n${body || '(no text)'}${n ? `\nSpeaker notes: ${n}` : ''}`;
    })
    .join('\n\n');
}

function colIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function xlsx(files: Map<string, () => Buffer>): string {
  const shared: string[] = [];
  const ss = part(files, 'xl/sharedStrings.xml');
  if (ss) {
    for (const si of ss.split(/<\/si>/).slice(0, -1)) {
      const texts = Array.from(si.matchAll(/<t[^>]*>([^<]*)<\/t>/g)).map((m) => decodeEntities(m[1]));
      shared.push(texts.join(''));
    }
  }
  const book = part(files, 'xl/workbook.xml') ?? '';
  const names = Array.from(book.matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g)).map((m) => decodeEntities(m[1]));
  const re = /^xl\/worksheets\/sheet(\d+)\.xml$/;
  const sheets = Array.from(files.keys()).filter((k) => re.test(k)).sort(byNumber(re));
  if (!sheets.length) throw new Error('it has no sheets inside it');
  return sheets
    .map((s, i) => {
      const xml = part(files, s) ?? '';
      const rows: string[] = [];
      for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
        const cells: string[] = [];
        for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
          const attrs = c[1];
          const inner = c[2] ?? '';
          const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1] ?? '';
          const type = /\bt="(\w+)"/.exec(attrs)?.[1] ?? 'n';
          let v = '';
          if (type === 'inlineStr') v = Array.from(inner.matchAll(/<t[^>]*>([^<]*)<\/t>/g)).map((m) => m[1]).join('');
          else {
            const raw = /<v>([^<]*)<\/v>/.exec(inner)?.[1] ?? '';
            v = type === 's' ? shared[Number(raw)] ?? '' : type === 'b' ? (raw === '1' ? 'TRUE' : 'FALSE') : raw;
          }
          const at = ref ? colIndex(ref) : cells.length;
          while (cells.length < at) cells.push('');
          cells[at] = decodeEntities(v).replace(/\s+/g, ' ').trim();
        }
        while (cells.length && !cells[cells.length - 1]) cells.pop();
        if (cells.length) rows.push(cells.join('\t'));
      }
      return `Sheet: ${names[i] ?? `Sheet ${i + 1}`}\n${rows.join('\n') || '(empty)'}`;
    })
    .join('\n\n');
}

/** OpenDocument: one content.xml for text, slides and sheets alike. */
function odf(files: Map<string, () => Buffer>): string {
  const xml = part(files, 'content.xml');
  if (xml === null) throw new Error('it has no content inside it');
  return xmlTextAll(xml);
}

/** Every text node, with paragraph ends as newlines. ODF's shape. */
function xmlTextAll(xml: string): string {
  return decodeEntities(
    xml
      .replace(/<text:tab\/>/g, '\t')
      .replace(/<text:line-break\/>/g, '\n')
      .replace(/<text:s(?: text:c="(\d+)")?\/>/g, (_, n) => ' '.repeat(Number(n || 1)))
      .replace(/<\/(text:p|text:h)>/g, '\n')
      .replace(/<\/table:table-cell>/g, ' | ')
      .replace(/<\/table:table-row>/g, '\n')
      .replace(/<draw:page\b[^>]*draw:name="([^"]*)"[^>]*>/g, '\n$1\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/ \| \n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** RTF, roughly: groups and control words out, text and paragraph breaks kept. */
function rtf(src: string): string {
  return src
    .replace(/\\'([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\u(-?\d+)\??/g, (_, n) => String.fromCharCode((Number(n) + 65536) % 65536))
    .replace(/\{\\\*[^{}]*\}/g, '')
    .replace(/\{\\(fonttbl|colortbl|stylesheet|info|pict)[\s\S]*?\}\s*\}/g, '')
    .replace(/\\(par|line)\b ?/g, '\n')
    .replace(/\\tab\b ?/g, '\t')
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '')
    .replace(/\\([\\{}])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function pdf(buf: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const doc = await getDocumentProxy(new Uint8Array(buf));
  const { text, totalPages } = await extractText(doc, { mergePages: false });
  const pages = (Array.isArray(text) ? text : [text]).map((t) => t.replace(/[ \t]+\n/g, '\n').trim());
  if (!pages.some((p) => p)) {
    throw new Error(
      totalPages
        ? 'it has no text layer — it looks scanned. Attach the pages as images instead'
        : 'it has no pages'
    );
  }
  return pages.length > 1 ? pages.map((p, i) => `Page ${i + 1}\n${p}`).join('\n\n') : pages[0];
}

// ── the reader ──────────────────────────────────────────────────────

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

function clip(name: string, text: string): ExtractedNote {
  const clean = text.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trim();
  return clean.length > MAX_FILE_TEXT
    ? { name, text: clean.slice(0, MAX_FILE_TEXT), truncated: true }
    : { name, text: clean, truncated: false };
}

const IMAGE_MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

/** A single non-zip document to text. Throws with a reason a person can read. */
async function documentText(name: string, buf: Buffer): Promise<string> {
  const ext = extensionOf(name);
  switch (ext) {
    case 'pdf':
      return pdf(buf);
    case 'docx':
      return docx(unzip(buf));
    case 'pptx':
      return pptx(unzip(buf));
    case 'xlsx':
      return xlsx(unzip(buf));
    case 'odt':
    case 'odp':
    case 'ods':
      return odf(unzip(buf));
    case 'rtf':
      return rtf(buf.toString('latin1'));
    default:
      if (looksLikeText(buf)) return buf.toString('utf8');
      throw new Error('it is not a format Socria can read');
  }
}

/**
 * Everything readable in a zip, as ONE note — a folder of files is one thing
 * somebody attached, and six chips for one archive would be noise. Each file
 * is headed by its path so the model can say which file it means.
 */
async function zipContents(name: string, buf: Buffer): Promise<ExtractResult> {
  const files = unzip(buf);
  const skipped: string[] = [];
  const images: ExtractedImage[] = [];
  const sections: string[] = [];
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
        images.push({
          name: path.split('/').pop() || path,
          dataUrl: `data:${IMAGE_MIME[extensionOf(path)] ?? 'image/png'};base64,${bytes.toString('base64')}`,
        });
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
      let text: string;
      if (kind === 'document') text = await documentText(path, bytes);
      else if (kind === 'text' || looksLikeText(bytes)) text = bytes.toString('utf8');
      else {
        skipped.push(`${path} (not a readable format)`);
        continue;
      }
      text = text.replace(/\r\n?/g, '\n').trim();
      if (!text) continue;
      const section = `--- ${path} ---\n${text}`;
      sections.push(section);
      total += section.length;
    } catch (e) {
      skipped.push(`${path} (${e instanceof Error ? e.message : 'could not be read'})`);
    }
  }

  const notes: ExtractedNote[] = [];
  if (sections.length) {
    const header = `Archive ${name}: ${sections.length} file${sections.length === 1 ? '' : 's'} read${
      images.length ? `, ${images.length} image${images.length === 1 ? '' : 's'} attached separately` : ''
    }.`;
    notes.push(clip(name, `${header}\n\n${sections.join('\n\n')}`));
  }
  if (!notes.length && !images.length) {
    skipped.unshift(`${name} (nothing inside it could be read)`);
  }
  return { notes, images, skipped };
}

/** The whole reader: one uploaded file in, notes and images out. */
export async function extractFile(name: string, buf: Buffer): Promise<ExtractResult> {
  const kind = kindOfFile(name);
  if (kind === 'secret' || kind === 'image') {
    return { notes: [], images: [], skipped: [refusalFor(name)] };
  }
  if (extensionOf(name) === 'zip') {
    try {
      return await zipContents(name, buf);
    } catch (e) {
      return {
        notes: [],
        images: [],
        skipped: [`${name} could not be opened: ${e instanceof Error ? e.message : 'unknown error'}.`],
      };
    }
  }
  if (kind === 'unsupported' && !looksLikeText(buf)) {
    return { notes: [], images: [], skipped: [refusalFor(name)] };
  }
  try {
    const text = await documentText(name, buf);
    if (!text.trim()) return { notes: [], images: [], skipped: [`${name} has no text in it.`] };
    return { notes: [clip(name, text)], images: [], skipped: [] };
  } catch (e) {
    return {
      notes: [],
      images: [],
      skipped: [`${name} could not be read: ${e instanceof Error ? e.message : 'unknown error'}.`],
    };
  }
}
