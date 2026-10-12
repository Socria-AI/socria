// lib/docs/rtf.ts — Rich Text Format, read from its control words.
//
// The old reader deleted control words with regular expressions, which loses
// tables (cells became one run-on line), headings, list labels, and any text
// in a code page other than Latin-1. This tokenizes RTF properly — groups,
// control words, hex and Unicode escapes with their fallback characters —
// and reads:
//
//   paragraphs, headings (outline level, or a "heading N" style), the labels
//   of numbered and bulleted lists as the file renders them, tables (\cell,
//   \row), footnotes (at the end), the document's title from its info group,
//   page breaks, superscripts and subscripts, Symbol-font characters, and
//   text in the file's own code page.
//
// Pictures, objects, headers and footers are skipped, field instructions are
// skipped and field results read.
//
// PURE.

import { DocBuilder, type ReaderOut } from './build';
import { guessHead, symbolChar } from './office';
import { CAPTION, LIST_MARK, toScript } from './text';
import type { BlockKind, DocCheck } from './types';

const SKIP = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'header', 'headerl', 'headerr', 'headerf', 'footer', 'footerl', 'footerr', 'footerf', 'fldinst', 'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'xmlnstbl', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'mmathPr', 'pgdsctbl', 'revtbl', 'object', 'objdata', 'filetbl', 'nonshppict', 'bkmkstart', 'bkmkend', 'xe', 'tc', 'pn', 'pntext', 'protusertbl', 'userprops', 'docvar', 'template', 'wgrffmtfilter', 'shpinst', 'atnid', 'atnauthor', 'annotation', 'atrfstart', 'atrfend']);

interface Run {
  text: string;
  sup: boolean;
  sub: boolean;
}

/** A Windows code page's bytes as text, where the runtime knows the code page. */
function decodeBytes(bytes: number[], cpg: number): string {
  try {
    return new TextDecoder(cpg === 65001 ? 'utf-8' : `windows-${cpg}`).decode(new Uint8Array(bytes));
  } catch {
    return String.fromCharCode(...bytes);
  }
}

export function readRtf(src: string, meta: { id: string; name: string }): ReaderOut {
  if (!/^\s*\{\\rtf/.test(src)) throw new Error('it is not an RTF file');
  const b = new DocBuilder('structured');
  const notes: DocCheck[] = [];
  let page = 1;
  let title: string | undefined;
  let cpg = 1252;
  const fonts = new Map<number, string>();
  const styles = new Map<number, string>();
  const styleOutline = new Map<number, number>();
  let footCount = 0;

  // group state
  interface State {
    skip: boolean;
    dest: string;
    font: number;
    uc: number;
    sup: boolean;
    sub: boolean;
    bold: boolean;
  }
  let st: State = { skip: false, dest: '', font: -1, uc: 1, sup: false, sub: false, bold: false };
  const stack: State[] = [];
  let runs: Run[] = [];
  let pendingBytes: number[] = [];
  let skipFallback = 0;
  // paragraph state
  let outline = -1;
  let styleNo = -1;
  let inTable = false;
  let listLabel = '';
  let cell: string[] = [];
  let row: string[] = [];
  let table: string[][] = [];
  const footnotes: string[] = [];
  let footBuf: Run[] | null = null;
  let infoTitle = '';
  let fontEntry = '';
  let styleEntry = '';
  let groupFont = -1;

  const flushBytes = () => {
    if (!pendingBytes.length) return;
    const t = decodeBytes(pendingBytes, cpg);
    pendingBytes = [];
    emit(t);
  };
  const emit = (t: string) => {
    if (!t) return;
    if (st.dest === 'title') {
      infoTitle += t;
      return;
    }
    if (st.dest === 'fonttbl') {
      fontEntry += t;
      return;
    }
    if (st.dest === 'stylesheet') {
      styleEntry += t;
      return;
    }
    if (st.skip) return;
    let text = t;
    const fname = fonts.get(st.font) ?? '';
    if (/symbol|wingdings/i.test(fname)) text = [...t].map((ch) => symbolChar(fname, ch.codePointAt(0)!) ?? ch).join('');
    if (st.dest === 'listtext') {
      listLabel += text;
      return;
    }
    const target = footBuf ?? runs;
    target.push({ text, sup: st.sup, sub: st.sub });
  };
  const runText = (rs: Run[]) =>
    rs
      .map((r) => {
        if ((r.sup || r.sub) && r.text.trim()) return toScript(r.text.trim(), r.sup ? 'sup' : 'sub') ?? r.text;
        return r.text;
      })
      .join('');
  const flushTable = () => {
    if (!table.length) return;
    const width = Math.max(...table.map((r) => r.length));
    for (const r of table) while (r.length < width) r.push('');
    b.table({ page, rows: table.slice(0, 400), head: guessHead(table) });
    table = [];
  };
  const endPara = () => {
    flushBytes();
    if (footBuf) {
      // a paragraph inside a footnote is part of the footnote
      footBuf.push({ text: ' ', sup: false, sub: false });
      return;
    }
    const text = runText(runs).replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
    runs = [];
    if (inTable) {
      cell.push(text);
      return;
    }
    flushTable();
    const label = listLabel.replace(/\t/g, '').trim();
    listLabel = '';
    if (!text) return;
    const style = styles.get(styleNo) ?? '';
    const h = /^heading (\d)/i.exec(style);
    let kind: BlockKind = 'paragraph';
    let level: number | undefined;
    const ol = outline >= 0 ? outline : styleOutline.get(styleNo) ?? -1;
    if (ol >= 0 && ol <= 8) {
      kind = 'heading';
      level = ol + 1;
    } else if (h) {
      kind = 'heading';
      level = Number(h[1]);
    } else if (/^title$/i.test(style)) kind = 'title';
    else if (/caption/i.test(style) || CAPTION.test(text)) kind = 'caption';
    else if (label || LIST_MARK.test(text)) {
      kind = 'list';
      level = 1;
    }
    const full = label && !text.startsWith(label) ? `${label} ${text}` : text;
    b.block({ page, kind, text: full, ...(level ? { level } : {}) });
  };

  const re = /\\([a-zA-Z]+)(-?\d+)? ?|\\'([0-9a-fA-F]{2})|\\([^a-zA-Z])|([{}])|([^\\{}\r\n]+)|[\r\n]+/g;
  let m: RegExpExecArray | null;
  let pendingStar = false;
  while ((m = re.exec(src))) {
    if (b.chars > 300_000) {
      notes.push({ id: 'unread', level: 'warn', says: 'The document is longer than Socria reads at once; its end was not read.' });
      break;
    }
    const [, word, arg, hex, sym, brace, text] = m;
    if (hex !== undefined) {
      if (skipFallback > 0) {
        skipFallback--;
        continue;
      }
      pendingBytes.push(parseInt(hex, 16));
      continue;
    }
    if (text !== undefined) {
      let t = text;
      if (skipFallback > 0) {
        const n = Math.min(skipFallback, t.length);
        t = t.slice(n);
        skipFallback -= n;
      }
      flushBytes();
      emit(t);
      continue;
    }
    if (brace === '{') {
      flushBytes();
      stack.push({ ...st });
      groupFont = -1;
      continue;
    }
    if (brace === '}') {
      flushBytes();
      if (st.dest === 'fonttbl' && fontEntry) {
        const name = fontEntry.replace(/;.*$/, '').trim();
        if (groupFont >= 0) fonts.set(groupFont, name);
        fontEntry = '';
      }
      if (st.dest === 'stylesheet' && styleEntry) {
        const name = styleEntry.replace(/;.*$/, '').trim();
        if (st.font >= 0) styles.set(st.font, name);
        styleEntry = '';
      }
      if (st.dest === 'footnote' && footBuf && (!stack.length || stack[stack.length - 1].dest !== 'footnote')) {
        const t = runText(footBuf).replace(/\s+/g, ' ').trim();
        if (t) footnotes.push(t);
        footBuf = null;
      }
      st = stack.pop() ?? st;
      continue;
    }
    if (sym !== undefined) {
      if (sym === '*') {
        pendingStar = true;
        continue;
      }
      if (sym === '~') emit(' ');
      else if (sym === '-') emit('');
      else if (sym === '_') emit('‑');
      else if (sym === '\\' || sym === '{' || sym === '}') emit(sym);
      else if (sym === '\n' || sym === '\r') endPara();
      continue;
    }
    if (!word) continue;
    const n = arg === undefined ? undefined : Number(arg);
    // an ignorable destination this reader does not know is skipped whole
    if (pendingStar) {
      pendingStar = false;
      if (!['listtext', 'footnote', 'fldrslt'].includes(word)) {
        st.skip = true;
        st.dest = word;
        continue;
      }
    }
    switch (word) {
      case 'ansicpg':
        cpg = n ?? 1252;
        break;
      case 'uc':
        st.uc = n ?? 1;
        break;
      case 'u': {
        flushBytes();
        const cp = (n ?? 0) < 0 ? (n ?? 0) + 65536 : (n ?? 0);
        emit(String.fromCharCode(cp));
        skipFallback = st.uc;
        break;
      }
      case 'par':
      case 'sect':
        endPara();
        break;
      case 'page':
        endPara();
        flushTable();
        page++;
        break;
      case 'line':
        emit('\n');
        break;
      case 'tab':
        emit('\t');
        break;
      case 'emdash':
        emit('—');
        break;
      case 'endash':
        emit('–');
        break;
      case 'bullet':
        emit('•');
        break;
      case 'lquote':
        emit('‘');
        break;
      case 'rquote':
        emit('’');
        break;
      case 'ldblquote':
        emit('“');
        break;
      case 'rdblquote':
        emit('”');
        break;
      case 'pard':
        outline = -1;
        styleNo = -1;
        inTable = false;
        break;
      case 'intbl':
        inTable = true;
        break;
      case 'cell':
        endPara();
        row.push(cell.join('\n').trim());
        cell = [];
        break;
      case 'row':
        if (cell.length || runs.length) {
          endPara();
          row.push(cell.join('\n').trim());
          cell = [];
        }
        if (row.length) table.push(row);
        row = [];
        inTable = false;
        break;
      case 'outlinelevel':
        if (st.dest === 'stylesheet') styleOutline.set(st.font, n ?? -1);
        else outline = n ?? -1;
        break;
      case 'chftn': {
        // the footnote's number, as the file renders it: in the text, then again in the note
        const mark = toScript(String(footBuf ? footCount : ++footCount), 'sup') ?? '';
        if (footBuf) footBuf.push({ text: `${mark} `, sup: false, sub: false });
        else runs.push({ text: mark, sup: false, sub: false });
        break;
      }
      case 'up':
        st.sup = (n ?? 6) > 0;
        st.sub = false;
        break;
      case 'dn':
        st.sub = (n ?? 6) > 0;
        st.sup = false;
        break;
      case 's':
        if (st.dest === 'stylesheet') st.font = n ?? -1;
        else styleNo = n ?? -1;
        break;
      case 'f':
        if (st.dest === 'fonttbl') groupFont = n ?? -1;
        else st.font = n ?? -1;
        break;
      case 'super':
        st.sup = true;
        st.sub = false;
        break;
      case 'sub':
        st.sub = true;
        st.sup = false;
        break;
      case 'nosupersub':
        st.sup = st.sub = false;
        break;
      case 'plain':
        st.sup = st.sub = st.bold = false;
        break;
      case 'b':
        st.bold = n !== 0;
        break;
      case 'listtext':
        st.dest = 'listtext';
        break;
      case 'footnote':
        flushBytes();
        st.dest = 'footnote';
        footBuf = [];
        break;
      case 'fldrslt':
        st.skip = false;
        break;
      case 'title':
        st.dest = 'title';
        break;
      case 'fonttbl':
        st.dest = 'fonttbl';
        break;
      case 'stylesheet':
        st.dest = 'stylesheet';
        break;
      case 'info':
        // the document's properties: only its title is read
        st.skip = true;
        st.dest = 'info';
        break;
      default:
        if (SKIP.has(word)) {
          st.skip = true;
          st.dest = word;
        }
    }
  }
  endPara();
  flushTable();
  for (const f of footnotes) b.block({ page, kind: 'footnote', text: f });
  title = infoTitle.trim() || undefined;
  const doc = b.build({ id: meta.id, name: meta.name, format: 'rtf', pageCount: page, ...(title ? { title } : {}) });
  // RTF's words are the reading's: tokenizing is the reading, so the checks compare the document against itself
  return { doc, raw: [], notes, media: [] };
}
