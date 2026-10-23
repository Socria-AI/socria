// lib/write/parse.ts — words coming in: a paste, an imported file, a draft from before.
//
// Whatever arrives — HTML from Word, Google Docs or a web page, Markdown,
// plain text, or the HTML the old Draft Space saved — becomes the same small
// model of blocks and marks. The words are kept exactly; only the shape around
// them (headings, lists, quotes, emphasis) is read. Anything that is not
// writing — styles, scripts, Word's bookkeeping, a list's drawn bullet — is
// left out, and nothing is added.
//
// PURE: no DOM. The same reader runs in the browser for a paste and in a test.

import { decodeEntities } from '@/lib/docs/xml';
import { emptyBlock, emptyDoc, normalizeMarks, sanitizeWriteDoc, uid, type Block, type BlockType, type Mark, type MarkType, type StoredDraft, type WriteDoc } from './doc';
import { toHtml } from './render';

// ── entities ─────────────────────────────────────────────────────────

// Latin-1, in code point order from U+00A0: the names HTML gives them.
const LATIN1 =
  'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml'.split(' ');
const NAMED: Record<string, string> = {
  ensp: ' ', emsp: ' ', thinsp: ' ', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”', bdquo: '„',
  hellip: '…', bull: '•', prime: '′', Prime: '″', euro: '€', trade: '™', larr: '←', rarr: '→', uarr: '↑', darr: '↓', harr: '↔', minus: '−',
  le: '≤', ge: '≥', ne: '≠', asymp: '≈', infin: '∞', zwj: '', zwnj: '', lrm: '', rlm: '', dagger: '†', Dagger: '‡', permil: '‰', oelig: 'œ', OElig: 'Œ',
  scaron: 'š', Scaron: 'Š', fnof: 'ƒ', circ: 'ˆ', tilde: '˜', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', pi: 'π', sigma: 'σ', mu: 'μ', lambda: 'λ',
};
LATIN1.forEach((n, k) => (NAMED[n] = String.fromCharCode(0xa0 + k)));
NAMED.shy = '';

function decodeHtml(s: string): string {
  if (s.indexOf('&') < 0) return s;
  return decodeEntities(s.replace(/&([A-Za-z][A-Za-z0-9]{1,8});/g, (m, n) => (n in NAMED ? NAMED[n] : m)));
}

// ── HTML ─────────────────────────────────────────────────────────────

/** An open block being filled, and the marks on its words so far. */
interface Building {
  t: BlockType;
  lvl?: number;
  text: string;
  marks: Mark[];
  /** began at a list item, so a paragraph inside the item continues it */
  li?: boolean;
  pre?: boolean;
}

const BLOCK_TAGS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre', 'tr', 'dt', 'dd', 'section', 'article', 'header', 'footer', 'figure', 'figcaption', 'table', 'ul', 'ol', 'address', 'aside', 'main', 'nav', 'details', 'summary', 'caption', 'hr', 'dl', 'title']);
const DROP = /<(style|script|head|title|xml|template|noscript|object|iframe|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

/** Which marks an inline element turns on, and which it turns off (Google Docs wraps everything in a bold that is not bold). */
function inlineMarks(tag: string, attrs: string): { on: MarkType[]; off: MarkType[] } {
  const on: MarkType[] = [];
  const off: MarkType[] = [];
  if (tag === 'b' || tag === 'strong') on.push('b');
  if (tag === 'i' || tag === 'em' || tag === 'cite' || tag === 'dfn' || tag === 'var') on.push('i');
  if (tag === 'u' || tag === 'ins') on.push('u');
  const style = /style\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
  const css = (style?.[2] ?? style?.[3] ?? '').toLowerCase();
  if (css) {
    const fw = /font-weight\s*:\s*([a-z0-9]+)/.exec(css)?.[1];
    if (fw) {
      if (fw === 'bold' || fw === 'bolder' || Number(fw) >= 600) on.push('b');
      else if (fw === 'normal' || fw === 'lighter' || Number(fw) <= 500) off.push('b');
    }
    const fs = /font-style\s*:\s*([a-z]+)/.exec(css)?.[1];
    if (fs === 'italic' || fs === 'oblique') on.push('i');
    else if (fs === 'normal') off.push('i');
    const td = /text-decoration(?:-line)?\s*:\s*([a-z\s-]+)/.exec(css)?.[1];
    if (td) {
      if (/underline/.test(td)) on.push('u');
      else if (/none/.test(td)) off.push('u');
    }
  }
  return { on: on.filter((t) => !off.includes(t)), off };
}

/**
 * HTML into blocks. Tolerant of everything a clipboard holds — Word's
 * conditional comments and list bullets, Google Docs' wrappers, unclosed tags.
 */
export function htmlToBlocks(html: string): Block[] {
  const src = String(html ?? '')
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
    .replace(DROP, '');
  const out: Block[] = [];
  // (asserted, not narrowed: the closures below are what change it)
  let cur = null as Building | null;
  const lists: ('ul' | 'ol')[] = [];
  let quote = 0;
  let pre = 0;
  let heading: BlockType | null = null;
  // the inline elements open, and what each did to the marks
  const inline: { tag: string; on: MarkType[]; off: MarkType[] }[] = [];
  // Word draws a list's bullet as text inside <![if !supportLists]>…<![endif]>: read it to tell numbers from bullets, then drop it
  let inMark = false;
  let markText = '';
  let wordList: { lvl: number } | null = null;

  const active = (): MarkType[] => {
    const on = new Set<MarkType>();
    for (const el of inline) {
      for (const t of el.off) on.delete(t);
      for (const t of el.on) on.add(t);
    }
    return Array.from(on);
  };
  const contextType = (): { t: BlockType; lvl?: number } => {
    if (heading) return { t: heading };
    if (lists.length) return { t: lists[lists.length - 1], lvl: Math.min(3, lists.length) };
    if (quote) return { t: 'quote' };
    return { t: 'p' };
  };
  const finish = () => {
    if (!cur) return;
    const b = cur;
    cur = null;
    let text = b.text;
    let marks = b.marks;
    if (!b.pre) {
      // the space a tag left at either end is not the person's
      const lead = text.length - text.replace(/^[ \n]+/, '').length;
      text = text.slice(lead).replace(/[ \n]+$/, '');
      marks = marks.map((m) => ({ s: m.s - lead, e: m.e - lead, t: m.t }));
    } else text = text.replace(/\n+$/, '');
    text = text.replace(/ /g, ' ');
    if (!text.trim()) return;
    const block: Block = { id: uid('b'), t: b.t, text };
    if (b.lvl && (b.t === 'ul' || b.t === 'ol')) block.lvl = b.lvl;
    const m = normalizeMarks(marks, text.length);
    if (m) block.marks = m;
    out.push(block);
  };
  const start = (shape: { t: BlockType; lvl?: number }, li = false) => {
    finish();
    cur = { ...shape, text: '', marks: [], ...(li ? { li: true } : {}), ...(pre ? { pre: true } : {}) };
  };
  const append = (raw: string) => {
    let text = raw;
    if (!pre) {
      text = text.replace(/[ \t\r\n\f]+/g, ' ');
      if (!cur || !cur.text || /[ \n]$/.test(cur.text)) text = text.replace(/^ /, '');
    }
    if (!text) return;
    if (!cur) start(wordList ? { t: 'ul', lvl: wordList.lvl } : contextType());
    const b = cur!;
    const s = b.text.length;
    b.text += text;
    for (const t of active()) {
      const last = [...b.marks].reverse().find((m) => m.t === t);
      if (last && last.e === s) last.e = s + text.length;
      else b.marks.push({ s, e: s + text.length, t });
    }
  };

  const re = /<!--[\s\S]*?-->|<!\[if !supportLists\]>|<!\[endif\]>|<!\[[^\]]*\]>|<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)|</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const tok = m[0];
    if (tok.startsWith('<!--')) continue;
    if (tok === '<![if !supportLists]>') {
      inMark = true;
      markText = '';
      continue;
    }
    if (tok === '<![endif]>') {
      if (inMark && wordList && cur) {
        // the drawn bullet said whether this is a numbered list
        const glyph = decodeHtml(markText).replace(/\s+/g, '').trim();
        cur.t = /^(\(?\d+|[a-z]|[ivxlc]+)[.)]/i.test(glyph) ? 'ol' : 'ul';
      }
      inMark = false;
      continue;
    }
    if (tok.startsWith('<![')) continue;
    if (m[4] !== undefined || tok === '<') {
      const text = decodeHtml(m[4] ?? '<');
      if (inMark) {
        markText += text;
        continue;
      }
      append(text);
      continue;
    }
    const close = m[1] === '/';
    const tag = m[2].toLowerCase();
    const attrs = m[3] ?? '';
    if (inMark) continue;
    if (tag === 'br') {
      if (!cur) start(contextType());
      cur!.text += '\n';
      continue;
    }
    if (tag === 'img' || tag === 'input' || tag === 'meta' || tag === 'link' || tag === 'wbr' || tag === 'col') continue;
    if (BLOCK_TAGS.has(tag)) {
      if (tag === 'ul' || tag === 'ol') {
        finish();
        if (close) lists.pop();
        else lists.push(tag);
        continue;
      }
      if (tag === 'blockquote') {
        finish();
        quote = Math.max(0, quote + (close ? -1 : 1));
        continue;
      }
      if (tag === 'pre') {
        finish();
        pre = Math.max(0, pre + (close ? -1 : 1));
        continue;
      }
      if (/^h[1-6]$/.test(tag)) {
        finish();
        heading = close ? null : tag === 'h1' ? 'h1' : tag === 'h2' ? 'h2' : 'h3';
        continue;
      }
      if (tag === 'li') {
        if (close) finish();
        else start(contextType().t === 'ul' || contextType().t === 'ol' ? contextType() : { t: 'ul', lvl: 1 }, true);
        continue;
      }
      if (close) {
        // a paragraph inside a list item ends with the item, not before it
        if ((tag === 'p' || tag === 'div') && cur?.li) continue;
        finish();
        wordList = null;
        continue;
      }
      if ((tag === 'p' || tag === 'div') && cur?.li && !cur.text.trim()) continue;
      // Word's lists are paragraphs that say so in their style
      const mso = /mso-list\s*:\s*l\d+\s+level(\d)/i.exec(attrs);
      const cls = /class\s*=\s*["']?([\w-]+)/i.exec(attrs)?.[1]?.toLowerCase() ?? '';
      if (mso) {
        wordList = { lvl: Math.min(3, Math.max(1, Number(mso[1]))) };
        start({ t: 'ul', lvl: wordList.lvl });
        continue;
      }
      wordList = null;
      if (cls === 'msotitle') start({ t: 'h1' });
      else if (cls === 'msoquote' || cls === 'msointensequote') start({ t: 'quote' });
      else start(contextType());
      continue;
    }
    if (tag === 'td' || tag === 'th') {
      // table cells: one row is one line, its cells separated by tabs, as a copied table reads
      if (!close && cur && cur.text && !cur.text.endsWith('\t')) cur.text += '\t';
      continue;
    }
    // inline elements
    if (close) {
      for (let k = inline.length - 1; k >= 0; k--) {
        if (inline[k].tag === tag) {
          inline.splice(k);
          break;
        }
      }
      continue;
    }
    if (/\/\s*$/.test(attrs)) continue;
    const marks = inlineMarks(tag, attrs);
    inline.push({ tag, ...marks });
  }
  finish();
  return out;
}

// ── plain text and Markdown ──────────────────────────────────────────

/** Markdown's emphasis, links and escapes, read into words and marks. */
export function parseInline(s: string): { text: string; marks: Mark[] } {
  let text = '';
  const marks: Mark[] = [];
  let i = 0;
  const word = /[\p{L}\p{N}]/u;
  const take = (inner: string, t: MarkType | null) => {
    const r = parseInline(inner);
    const at = text.length;
    text += r.text;
    for (const mk of r.marks) marks.push({ s: mk.s + at, e: mk.e + at, t: mk.t });
    if (t && r.text) marks.push({ s: at, e: at + r.text.length, t });
  };
  while (i < s.length) {
    const ch = s[i];
    if (ch === '\\' && i + 1 < s.length && /[\\`*_[\]()#+\-.!<>|~{}]/.test(s[i + 1])) {
      text += s[i + 1];
      i += 2;
      continue;
    }
    if (ch === '`') {
      const j = s.indexOf('`', i + 1);
      if (j > i + 1) {
        text += s.slice(i + 1, j);
        i = j + 1;
        continue;
      }
    }
    if (ch === '*' || ch === '_') {
      const dbl = s[i + 1] === ch;
      const delim = dbl ? ch + ch : ch;
      const next = s[i + delim.length];
      const prev = i > 0 ? s[i - 1] : '';
      if (next && !/\s/.test(next) && next !== ch && !(ch === '_' && prev && word.test(prev))) {
        let j = i + delim.length;
        let close = -1;
        while ((j = s.indexOf(delim, j)) >= 0) {
          const after = s[j + delim.length] ?? '';
          const ok = !/\s/.test(s[j - 1]) && !(ch === '_' && after && word.test(after)) && (dbl || (after !== ch && s[j - 1] !== ch));
          if (ok && j > i + delim.length) {
            close = j;
            break;
          }
          j += 1;
        }
        if (close > 0) {
          take(s.slice(i + delim.length, close), dbl ? 'b' : 'i');
          i = close + delim.length;
          continue;
        }
      }
    }
    if (s.startsWith('<u>', i)) {
      const j = s.indexOf('</u>', i + 3);
      if (j > i + 3) {
        take(s.slice(i + 3, j), 'u');
        i = j + 4;
        continue;
      }
    }
    if (ch === '!' && s[i + 1] === '[') {
      const img = /^!\[([^\]]*)\]\([^)]*\)/.exec(s.slice(i));
      if (img) {
        text += img[1];
        i += img[0].length;
        continue;
      }
    }
    if (ch === '[') {
      const link = /^\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(s.slice(i));
      if (link) {
        take(link[1], null);
        // the address is part of what was written; it is kept, beside the words it was on
        if (/^https?:\/\//i.test(link[2]) && link[2] !== link[1]) text += ` (${link[2]})`;
        i += link[0].length;
        continue;
      }
    }
    text += ch;
    i++;
  }
  return { text, marks };
}

/** Whether pasted text is Markdown rather than plain words: headings, emphasis or lists in its syntax. */
export function looksLikeMarkdown(text: string): boolean {
  return /^#{1,6}\s+\S/m.test(text) || /\*\*[^*\n]+\*\*/.test(text) || /^\s*[-*+]\s+\S[\s\S]*\n\s*[-*+]\s+\S/m.test(text) || /^>\s/m.test(text) || /\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)/.test(text);
}

const LIST_LINE = /^(\s*)([-*+•–◦▪]|\d{1,3}[.)])\s+(.*)$/;

/**
 * Plain text into blocks. A blank line ends a paragraph; lines inside one are
 * joined when they were wrapped to a width, and kept as line breaks when they
 * were not (a poem, an address). With `markdown`, its syntax is read too.
 */
export function textToBlocks(input: string, opts: { markdown?: boolean } = {}): Block[] {
  const md = !!opts.markdown;
  const lines = String(input ?? '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  const out: Block[] = [];
  let para: string[] = [];
  let quoteLines: string[] = [];
  let item = null as { t: 'ul' | 'ol'; lvl: number; lines: string[] } | null;
  let fence = false;
  let fenced: string[] = [];

  const push = (t: BlockType, raw: string, lvl?: number) => {
    const r = md ? parseInline(raw) : { text: raw, marks: [] as Mark[] };
    const text = r.text.replace(/ /g, ' ');
    if (!text.trim()) return;
    const b: Block = { id: uid('b'), t, text };
    if (lvl && (t === 'ul' || t === 'ol')) b.lvl = lvl;
    const m = normalizeMarks(r.marks, text.length);
    if (m) b.marks = m;
    out.push(b);
  };
  const joinLines = (ls: string[]): string => {
    if (ls.length < 2) return (ls[0] ?? '').trim();
    if (md) {
      // Markdown: a line ending in two spaces or a backslash breaks; any other joins with a space
      let joined = '';
      ls.forEach((l, k) => {
        const hard = /( {2,}|\\)$/.test(l);
        const body = (hard ? l.replace(/( {2,}|\\)$/, '') : l.trimEnd()).trimStart();
        joined += body + (k === ls.length - 1 ? '' : hard ? '\n' : ' ');
      });
      return joined;
    }
    // wrapped prose: long lines of similar length — joined; anything else keeps its line breaks
    const lens = ls.slice(0, -1).map((l) => l.trim().length);
    const max = Math.max(...lens);
    const wrapped = max >= 50 && lens.every((n) => n >= max * 0.6);
    return wrapped ? ls.map((l) => l.trim()).join(' ') : ls.map((l) => l.trimEnd()).join('\n');
  };
  const endPara = () => {
    if (para.length) push('p', joinLines(para).trim());
    para = [];
  };
  const endQuote = () => {
    if (quoteLines.length) push('quote', joinLines(quoteLines).trim());
    quoteLines = [];
  };
  const endItem = () => {
    if (item) push(item.t, item.lines.map((l) => l.trim()).join(' '), item.lvl);
    item = null;
  };
  const endAll = () => {
    endPara();
    endQuote();
    endItem();
  };

  for (const line of lines) {
    if (md && /^\s*(```|~~~)/.test(line)) {
      if (fence) {
        endAll();
        if (fenced.join('').trim()) out.push({ id: uid('b'), t: 'p', text: fenced.join('\n') });
        fenced = [];
        fence = false;
      } else {
        endAll();
        fence = true;
      }
      continue;
    }
    if (fence) {
      fenced.push(line);
      continue;
    }
    if (!line.trim()) {
      endAll();
      continue;
    }
    if (md && /^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      endAll();
      continue;
    }
    const h = md ? /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line) : null;
    if (h) {
      endAll();
      push(h[1].length === 1 ? 'h1' : h[1].length === 2 ? 'h2' : 'h3', h[2]);
      continue;
    }
    const q = /^\s{0,3}>\s?(.*)$/.exec(line);
    if (q && (md || line.trimStart().startsWith('> '))) {
      endPara();
      endItem();
      quoteLines.push(q[1]);
      continue;
    }
    const li = LIST_LINE.exec(line);
    if (li && (md || /^[•–◦▪-]|^\d{1,3}[.)]/.test(li[2]) || li[2] === '*')) {
      endPara();
      endQuote();
      endItem();
      const indent = li[1].length;
      item = { t: /^\d/.test(li[2]) ? 'ol' : 'ul', lvl: Math.min(3, 1 + Math.floor(indent / 2)), lines: [li[3]] };
      continue;
    }
    if (item && /^\s+\S/.test(line)) {
      item.lines.push(line);
      continue;
    }
    if (quoteLines.length && md) {
      quoteLines.push(line);
      continue;
    }
    endQuote();
    endItem();
    para.push(line);
  }
  if (fence && fenced.join('').trim()) out.push({ id: uid('b'), t: 'p', text: fenced.join('\n') });
  endAll();
  return out;
}

export const markdownToBlocks = (md: string) => textToBlocks(md, { markdown: true });

/** Text from a clipboard or a file, read the way it was most likely written. */
export function pastedText(text: string): Block[] {
  return textToBlocks(text, { markdown: looksLikeMarkdown(text) });
}

// ── what was saved before ────────────────────────────────────────────

/** The old Draft Space's page — a title and contentEditable HTML — as a document. Every word kept. */
export function fromLegacy(title: string, html: string, now = Date.now()): WriteDoc {
  const blocks = htmlToBlocks(html);
  return { ...emptyDoc(now), title: String(title ?? '').slice(0, 200), blocks: blocks.length ? blocks : [emptyBlock()], updatedAt: now };
}

/**
 * Any draft as stored — the new shape, the old one, or nothing — as the new
 * shape. An old draft is read into a document the first time it is opened;
 * its HTML is kept beside it until the next save writes both.
 */
export function normalizeDraft(raw: unknown): StoredDraft | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const doc = sanitizeWriteDoc(r.doc);
  if (doc) return { title: doc.title, html: typeof r.html === 'string' ? r.html : toHtml(doc), doc };
  if (typeof r.html !== 'string') return undefined;
  const title = typeof r.title === 'string' ? r.title : '';
  return { title, html: r.html, doc: fromLegacy(title, r.html, 0) };
}

/** What a document is saved as: the document, and the title and HTML anything older reads. */
export function storedFrom(doc: WriteDoc): StoredDraft {
  return { title: doc.title, html: toHtml(doc), doc };
}
