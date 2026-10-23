// lib/write/word.ts — a Word document read into the writing, in the browser.
//
// The file never leaves the device: the zip is opened here (lib/write/zip.ts)
// and its XML read here. What comes in is what a writer means by the document
// — its title, headings, paragraphs, quotes, bulleted and numbered lists, and
// bold, italic and underline — with Word's styles and numbering resolved the
// way Word resolves them. What cannot come in (pictures, footnotes, comments,
// text boxes, a table's grid) is counted and said, never silently dropped.
//
// PURE given the bytes.

import { attr, isNode, parseXml, type XNode } from '@/lib/docs/xml';
import { normalizeMarks, uid, type Block, type BlockType, type Mark, type MarkType } from './doc';
import { unzipSome, ZipError } from './zip';

export interface WordReading {
  /** the paragraph styled as the document's Title, if there is one */
  title: string;
  blocks: Block[];
  /** what was left out, said plainly: “2 pictures were left out.” */
  notes: string[];
}

const local = (n: XNode) => {
  const k = n.name.indexOf(':');
  return k < 0 ? n.name : n.name.slice(k + 1);
};
const kidL = (n: XNode | undefined, name: string) => (n ? n.children.find((c): c is XNode => isNode(c) && local(c) === name) : undefined);
const kidsL = (n: XNode | undefined, name?: string) => (n ? n.children.filter((c): c is XNode => isNode(c) && (name === undefined || local(c) === name)) : []);
/** Whether anything under a node has this local name. */
const hasL = (n: XNode, name: string): boolean => n.children.some((c) => isNode(c) && (local(c) === name || hasL(c, name)));

/** A toggle property as Word writes it: present means on, unless its val says otherwise. */
function onOff(n: XNode | undefined): boolean | undefined {
  if (!n) return undefined;
  const v = attr(n, 'val');
  return v === undefined ? true : !/^(0|false|off|none)$/i.test(v);
}

interface StyleInfo {
  name: string;
  basedOn?: string;
  type: string;
  outline?: number;
  numId?: string;
  ilvl?: number;
  b?: boolean;
  i?: boolean;
  u?: boolean;
}

function readStyles(xml: string | undefined): Map<string, StyleInfo> {
  const out = new Map<string, StyleInfo>();
  if (!xml) return out;
  const root = parseXml(xml);
  const styles = kidsL(kidL(root, 'styles'), 'style');
  for (const s of styles) {
    const id = attr(s, 'styleId');
    if (!id) continue;
    const pPr = kidL(s, 'pPr');
    const rPr = kidL(s, 'rPr');
    const numPr = kidL(pPr, 'numPr');
    const outline = attr(kidL(pPr, 'outlineLvl'), 'val');
    const u = kidL(rPr, 'u');
    out.set(id, {
      name: (attr(kidL(s, 'name'), 'val') ?? id).toLowerCase(),
      basedOn: attr(kidL(s, 'basedOn'), 'val'),
      type: attr(s, 'type') ?? 'paragraph',
      ...(outline !== undefined ? { outline: Number(outline) } : {}),
      ...(numPr ? { numId: attr(kidL(numPr, 'numId'), 'val'), ilvl: Number(attr(kidL(numPr, 'ilvl'), 'val') ?? 0) } : {}),
      ...(rPr ? { b: onOff(kidL(rPr, 'b')), i: onOff(kidL(rPr, 'i')), u: u ? attr(u, 'val') !== 'none' : undefined } : {}),
    });
  }
  return out;
}

/** A style with what it inherits, to a few levels — as Word reads basedOn. */
function resolve(styles: Map<string, StyleInfo>, id: string | undefined): StyleInfo[] {
  const chain: StyleInfo[] = [];
  let at = id;
  for (let k = 0; at && k < 12; k++) {
    const s = styles.get(at);
    if (!s || chain.includes(s)) break;
    chain.push(s);
    at = s.basedOn;
  }
  return chain;
}

/** numId → for each level, whether it is bullets. */
function readNumbering(xml: string | undefined): Map<string, Map<number, boolean>> {
  const out = new Map<string, Map<number, boolean>>();
  if (!xml) return out;
  const root = kidL(parseXml(xml), 'numbering');
  const abstract = new Map<string, Map<number, boolean>>();
  for (const a of kidsL(root, 'abstractNum')) {
    const levels = new Map<number, boolean>();
    for (const l of kidsL(a, 'lvl')) levels.set(Number(attr(l, 'ilvl') ?? 0), attr(kidL(l, 'numFmt'), 'val') === 'bullet');
    abstract.set(attr(a, 'abstractNumId') ?? '', levels);
  }
  for (const n of kidsL(root, 'num')) {
    const levels = new Map(abstract.get(attr(kidL(n, 'abstractNumId'), 'val') ?? '') ?? []);
    for (const o of kidsL(n, 'lvlOverride')) {
      const l = kidL(o, 'lvl');
      if (l) levels.set(Number(attr(o, 'ilvl') ?? 0), attr(kidL(l, 'numFmt'), 'val') === 'bullet');
    }
    out.set(attr(n, 'numId') ?? '', levels);
  }
  return out;
}

interface Counts {
  pictures: number;
  footnotes: number;
  tables: number;
  boxes: number;
}

/** A paragraph's words and their emphasis, from its runs — tracked deletions and field codes left out. */
function readRuns(p: XNode, styles: Map<string, StyleInfo>, counts: Counts): { text: string; marks: Mark[] } {
  let text = '';
  const marks: Mark[] = [];
  // a field's instruction (between begin and separate) is code, not words; its result is shown
  let showing = true;
  const fieldState: boolean[] = [];
  const add = (s: string, on: MarkType[]) => {
    if (!s || !showing) return;
    const at = text.length;
    text += s;
    for (const t of on) {
      const last = marks.length ? [...marks].reverse().find((m) => m.t === t) : undefined;
      if (last && last.e === at) last.e = at + s.length;
      else marks.push({ s: at, e: at + s.length, t });
    }
  };
  const walk = (n: XNode) => {
    for (const c of n.children) {
      if (!isNode(c)) continue;
      const name = local(c);
      if (name === 'del' || name === 'moveFrom' || name === 'pPr') continue;
      if (name === 'r') {
        run(c);
        continue;
      }
      if (name === 'fldSimple' || name === 'hyperlink' || name === 'ins' || name === 'moveTo' || name === 'smartTag' || name === 'customXml' || name === 'sdt' || name === 'sdtContent' || name === 'bdo' || name === 'dir') walk(c);
    }
  };
  const run = (r: XNode) => {
    const rPr = kidL(r, 'rPr');
    if (onOff(kidL(rPr, 'vanish'))) return;
    const style = resolve(styles, attr(kidL(rPr, 'rStyle'), 'val'));
    const pick = (k: 'b' | 'i' | 'u') => {
      const direct = k === 'u' ? (kidL(rPr, 'u') ? attr(kidL(rPr, 'u'), 'val') !== 'none' : undefined) : onOff(kidL(rPr, k));
      if (direct !== undefined) return direct;
      for (const s of style) if (s[k] !== undefined) return s[k];
      // Word's built-in character styles, by name, when they carry no properties of their own
      const names = style.map((s) => s.name);
      if (k === 'b') return names.some((x) => x === 'strong');
      if (k === 'i') return names.some((x) => x === 'emphasis' || x === 'subtle emphasis' || x === 'intense emphasis');
      return false;
    };
    const on: MarkType[] = [];
    if (pick('b')) on.push('b');
    if (pick('i')) on.push('i');
    if (pick('u')) on.push('u');
    for (const c of r.children) {
      if (!isNode(c)) continue;
      const name = local(c);
      if (name === 'fldChar') {
        const t = attr(c, 'fldCharType');
        if (t === 'begin') {
          fieldState.push(showing);
          showing = false;
        } else if (t === 'separate') showing = fieldState.length ? fieldState[fieldState.length - 1] : true;
        else if (t === 'end') showing = fieldState.length ? fieldState.pop()! : true;
        continue;
      }
      if (name === 't') add(c.children.filter((x): x is string => !isNode(x)).join(''), on);
      else if (name === 'tab' || name === 'ptab') add('\t', on);
      else if (name === 'br' || name === 'cr') {
        if (attr(c, 'type') !== 'page' && attr(c, 'type') !== 'column') add('\n', on);
      } else if (name === 'noBreakHyphen') add('-', on);
      else if (name === 'sym') {
        const ch = attr(c, 'char');
        const cp = ch ? parseInt(ch, 16) : NaN;
        // symbol-font glyphs live in the private-use area; their meaning is not text
        if (Number.isFinite(cp) && cp < 0xe000) add(String.fromCharCode(cp), on);
      } else if (name === 'drawing' || name === 'pict' || name === 'object') {
        if (hasL(c, 'txbxContent')) counts.boxes++;
        else counts.pictures++;
      } else if (name === 'AlternateContent') counts.pictures++;
      else if (name === 'footnoteReference' || name === 'endnoteReference') counts.footnotes++;
    }
  };
  walk(p);
  return { text, marks };
}

function tidy(text: string, marks: Mark[]): { text: string; marks: Mark[] } {
  const lead = text.length - text.replace(/^[ \n]+/, '').length;
  const body = text.slice(lead).replace(/[ \n]+$/, '');
  return { text: body.replace(/ /g, ' '), marks: marks.map((m) => ({ s: m.s - lead, e: m.e - lead, t: m.t })) };
}

/** The body of a Word document — document.xml, with its styles and numbering — as blocks. */
export function readWordXml(documentXml: string, stylesXml?: string, numberingXml?: string): WordReading {
  const styles = readStyles(stylesXml);
  const numbering = readNumbering(numberingXml);
  const root = parseXml(documentXml);
  const body = kidL(kidL(root, 'document'), 'body');
  const blocks: Block[] = [];
  const counts: Counts = { pictures: 0, footnotes: 0, tables: 0, boxes: 0 };
  let title = '';

  const paragraph = (p: XNode) => {
    const pPr = kidL(p, 'pPr');
    const styleId = attr(kidL(pPr, 'pStyle'), 'val');
    const chain = resolve(styles, styleId);
    const names = chain.map((s) => s.name);
    // numbering set on the paragraph, or carried by its style (Word's "List Bullet" and the like)
    const numPr = kidL(pPr, 'numPr');
    const fromStyle = numPr ? undefined : chain.find((s) => s.numId);
    const numId = numPr ? attr(kidL(numPr, 'numId'), 'val') : fromStyle?.numId;
    const ilvl = numPr ? Number(attr(kidL(numPr, 'ilvl'), 'val') ?? 0) : fromStyle?.ilvl ?? 0;
    const read = readRuns(p, styles, counts);
    const { text, marks } = tidy(read.text, read.marks);
    if (!text.trim()) return;
    let t: BlockType = 'p';
    let lvl: number | undefined;
    const heading = names.map((n) => /^heading\s*([1-9])$/.exec(n)?.[1]).find(Boolean);
    const outline = chain.find((s) => s.outline !== undefined && s.outline < 9)?.outline;
    if (names.includes('title')) {
      if (!title) {
        title = text.replace(/\s+/g, ' ').trim();
        return;
      }
      t = 'h1';
    } else if (heading || outline !== undefined) {
      const n = heading ? Number(heading) : (outline as number) + 1;
      t = n <= 1 ? 'h1' : n === 2 ? 'h2' : 'h3';
    } else if (names.some((n) => n === 'quote' || n === 'intense quote' || n === 'block text')) t = 'quote';
    else if (numId && numId !== '0') {
      const bullet = numbering.get(numId)?.get(ilvl);
      t = bullet === false ? 'ol' : 'ul';
      lvl = Math.min(3, Math.max(1, ilvl + 1));
    } else if (names.some((n) => /^list bullet/.test(n))) {
      t = 'ul';
      lvl = 1;
    } else if (names.some((n) => /^list number/.test(n))) {
      t = 'ol';
      lvl = 1;
    }
    const block: Block = { id: uid('b'), t, text };
    if (lvl) block.lvl = lvl;
    // a heading is a heading: bold set on all of it is the heading's look, not emphasis the person added
    const m = normalizeMarks(marks, text.length);
    if (m && !(t === 'h1' || t === 'h2' || t === 'h3')) block.marks = m;
    blocks.push(block);
  };

  const table = (tbl: XNode) => {
    counts.tables++;
    for (const tr of kidsL(tbl, 'tr')) {
      const cells: string[] = [];
      for (const tc of kidsL(tr, 'tc')) {
        const words = kidsL(tc, 'p')
          .map((p) => {
            const r = readRuns(p, styles, counts);
            return tidy(r.text, r.marks).text;
          })
          .filter((s) => s.trim())
          .join(' ');
        cells.push(words);
      }
      const line = cells.join('\t').replace(/\t+$/, '');
      if (line.trim()) blocks.push({ id: uid('b'), t: 'p', text: line });
    }
  };

  const walk = (n: XNode | undefined) => {
    for (const c of kidsL(n)) {
      const name = local(c);
      if (name === 'p') paragraph(c);
      else if (name === 'tbl') table(c);
      else if (name === 'sdt') walk(kidL(c, 'sdtContent'));
      else if (name === 'customXml' || name === 'ins' || name === 'moveTo') walk(c);
    }
  };
  walk(body);

  const notes: string[] = [];
  const say = (n: number, one: string, many: string) => n && notes.push(n === 1 ? one : many.replace('#', String(n)));
  say(counts.pictures, 'A picture was left out — the writing space holds words.', '# pictures were left out — the writing space holds words.');
  say(counts.boxes, 'The words in a text box were left out.', 'The words in # text boxes were left out.');
  say(counts.footnotes, 'A footnote was left out.', '# footnotes were left out.');
  say(counts.tables, 'A table came in as lines, its cells separated by tabs.', '# tables came in as lines, their cells separated by tabs.');
  return { title, blocks, notes };
}

/** A .docx file's bytes into the writing. Throws with a sentence a person can read. */
export async function readDocx(bytes: Uint8Array): Promise<WordReading> {
  let parts: Map<string, Uint8Array>;
  try {
    parts = await unzipSome(bytes, (n) => n === 'word/document.xml' || n === 'word/styles.xml' || n === 'word/numbering.xml');
  } catch (e) {
    if (e instanceof ZipError) throw e;
    throw new ZipError('This document could not be opened.');
  }
  const dec = new TextDecoder('utf-8');
  const doc = parts.get('word/document.xml');
  if (!doc) throw new ZipError('This is not a Word document (.docx) — it has no document inside.');
  const text = (name: string) => {
    const b = parts.get(name);
    return b ? dec.decode(b) : undefined;
  };
  return readWordXml(dec.decode(doc), text('word/styles.xml'), text('word/numbering.xml'));
}
