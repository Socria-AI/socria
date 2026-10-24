// lib/write/parse.ts — words coming in: a paste, an imported file, a draft from before.
//
// Whatever arrives — HTML from Word, Google Docs or a web page, Markdown,
// plain text, or the HTML the old Draft Space saved — becomes the same model
// of blocks and marks. The words are kept exactly; what is read around them is
// the shape a writer meant: headings, lists, quotes, code, tables, pictures,
// horizontal lines and page breaks; emphasis, struck words, superscript and
// subscript; links; and, from a word processor's paste, colours, highlights,
// fonts, sizes, alignment and indentation. Anything that is not writing —
// styles, scripts, Word's bookkeeping, a list's drawn bullet, Google Docs'
// "black" on every word — is left out, and nothing is added.
//
// PURE: no DOM. The same reader runs in the browser for a paste and in a test.

import { decodeEntities } from '@/lib/docs/xml';
import {
  colorValue,
  emptyBlock,
  emptyDoc,
  fontValue,
  FONT_KEYS,
  FONTS,
  hrefValue,
  isOpaque,
  makeImage,
  makePageBreak,
  makeRule,
  MEDIA_SRC,
  normalizeMarks,
  sanitizeWriteDoc,
  sizeValue,
  tableFrom,
  uid,
  type Align,
  type Block,
  type BlockType,
  type FlagMark,
  type Mark,
  type StoredDraft,
  type ValueMark,
  type WriteDoc,
} from './doc';
import { toHtml } from './render';

// ── entities ─────────────────────────────────────────────────────────

// Latin-1, in code point order from U+00A0: the names HTML gives them.
const LATIN1 =
  'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml'.split(' ');
const NAMED: Record<string, string> = {
  ensp: ' ', emsp: ' ', thinsp: ' ', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”', bdquo: '„',
  hellip: '…', bull: '•', prime: '′', Prime: '″', euro: '€', trade: '™', larr: '←', rarr: '→', uarr: '↑', darr: '↓', harr: '↔', minus: '−',
  le: '≤', ge: '≥', ne: '≠', asymp: '≈', infin: '∞', zwj: '', zwnj: '', lrm: '', rlm: '', dagger: '†', Dagger: '‡', permil: '‰', oelig: 'œ', OElig: 'Œ',
  scaron: 'š', Scaron: 'Š', fnof: 'ƒ', circ: 'ˆ', tilde: '˜', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', pi: 'π', sigma: 'σ', mu: 'μ', lambda: 'λ',
};
LATIN1.forEach((n, k) => (NAMED[n] = String.fromCharCode(0xa0 + k)));
NAMED.shy = '';

/** HTML's entities, the named ones included, read into their characters. */
export function decodeHtml(s: string): string {
  if (s.indexOf('&') < 0) return s;
  return decodeEntities(s.replace(/&([A-Za-z][A-Za-z0-9]{1,8});/g, (m, n) => (n in NAMED ? NAMED[n] : m)));
}

// ── CSS values, read the way a browser would ─────────────────────────

const NAMED_COLORS: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', orange: '#ffa500', purple: '#800080',
  gray: '#808080', grey: '#808080', silver: '#c0c0c0', maroon: '#800000', navy: '#000080', teal: '#008080', olive: '#808000', lime: '#00ff00',
  aqua: '#00ffff', cyan: '#00ffff', fuchsia: '#ff00ff', magenta: '#ff00ff', pink: '#ffc0cb', brown: '#a52a2a', darkred: '#8b0000', darkblue: '#00008b',
  darkgreen: '#006400', gold: '#ffd700', indigo: '#4b0082', violet: '#ee82ee', lightgray: '#d3d3d3', lightgrey: '#d3d3d3', darkgray: '#a9a9a9',
};

/** A CSS colour as #rrggbb — or null when it is none, transparent, the text's own, or not a colour. */
export function cssColor(v: string | undefined): string | null {
  if (!v) return null;
  const s = v.trim().toLowerCase().replace(/\s*!important$/, '');
  if (!s || /^(transparent|inherit|initial|unset|currentcolor|windowtext|auto|none)$/.test(s)) return null;
  if (NAMED_COLORS[s]) return NAMED_COLORS[s];
  const hex = colorValue(s);
  if (hex) return hex;
  const m = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(s);
  if (!m) return null;
  if (m[4] !== undefined) {
    const a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    if (a === 0) return null;
  }
  const h = (n: string) => Math.max(0, Math.min(255, Number(n))).toString(16).padStart(2, '0');
  return `#${h(m[1])}${h(m[2])}${h(m[3])}`;
}

/** A CSS length in points, for the units a word processor's paste uses. */
function cssPoints(v: string | undefined): number | null {
  if (!v) return null;
  const m = /^\s*(-?[\d.]+)\s*(pt|px|in|cm|mm|pc)?\s*$/i.exec(v);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] ?? 'px').toLowerCase();
  return unit === 'pt' ? n : unit === 'px' ? n * 0.75 : unit === 'in' ? n * 72 : unit === 'cm' ? (n * 72) / 2.54 : unit === 'mm' ? (n * 72) / 25.4 : n * 12;
}

function styleMap(attrs: string): Map<string, string> {
  const out = new Map<string, string>();
  const st = /style\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
  const css = decodeHtml(st?.[2] ?? st?.[3] ?? '');
  for (const part of css.split(';')) {
    const k = part.indexOf(':');
    if (k < 0) continue;
    const name = part.slice(0, k).trim().toLowerCase();
    const value = part.slice(k + 1).trim();
    if (name && value) out.set(name, value);
  }
  return out;
}

function attrOf(attrs: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>"']+))`, 'i').exec(attrs);
  const v = m ? m[1] ?? m[2] ?? m[3] : undefined;
  return v === undefined ? undefined : decodeHtml(v);
}

/** The first font a CSS font-family names, when it is one of the fonts this page offers. */
function cssFont(v: string | undefined): string | null {
  if (!v) return null;
  const first = v.split(',')[0].trim().replace(/^["']|["']$/g, '');
  const lower = first.toLowerCase();
  if (/^(monospace|ui-monospace)$/.test(lower)) return 'mono';
  for (const k of FONT_KEYS) if (k !== 'serif' && k !== 'sans' && FONTS[k].word.toLowerCase() === lower) return k;
  if (lower === 'consolas' || lower === 'courier') return lower === 'consolas' ? 'mono' : 'courier';
  if (lower === 'times') return 'times';
  if (lower === 'helvetica') return 'arial';
  return null;
}

// ── HTML ─────────────────────────────────────────────────────────────

/** A run of words with its marks: an open block, or a table's cell. */
interface Run {
  text: string;
  marks: Mark[];
}

/** An open block being filled. */
interface Building extends Run {
  t: BlockType;
  lvl?: number;
  /** began at a list item, so a paragraph inside the item continues it */
  li?: boolean;
  pre?: boolean;
  attrs: Partial<Block>;
}

interface Cell extends Run {
  th: boolean;
  align?: Align;
  /** the columns a merged cell spans: it takes the first, the rest come after it empty */
  span?: number;
}

interface TableBuilding {
  rows: Cell[][];
  row: Cell[] | null;
  cell: Cell | null;
  head: boolean;
  inHead: boolean;
  cols: number[];
  /** tables inside this one: their words are this one's */
  depth: number;
}

const BLOCK_TAGS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre', 'dt', 'dd', 'section', 'article', 'header', 'footer', 'figure', 'figcaption', 'ul', 'ol', 'address', 'aside', 'main', 'nav', 'details', 'summary', 'caption', 'hr', 'dl', 'title']);
const TABLE_TAGS = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'colgroup', 'col']);
const DROP = /<(style|script|head|title|xml|template|noscript|object|iframe|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

type Vals = Partial<Record<ValueMark, string | null>>;

/** Which marks an inline element turns on, which it turns off (Google Docs wraps everything in a bold that is not bold), and the values it sets. */
function inlineMarks(tag: string, attrs: string, opts: HtmlOptions): { on: FlagMark[]; off: FlagMark[]; val: Vals } {
  const on: FlagMark[] = [];
  const off: FlagMark[] = [];
  const val: Vals = {};
  if (tag === 'b' || tag === 'strong') on.push('b');
  if (tag === 'i' || tag === 'em' || tag === 'cite' || tag === 'dfn' || tag === 'var') on.push('i');
  if (tag === 'u' || tag === 'ins') on.push('u');
  if (tag === 's' || tag === 'strike' || tag === 'del') on.push('s');
  if (tag === 'sup') on.push('sup');
  if (tag === 'sub') on.push('sub');
  if (tag === 'code' || tag === 'kbd' || tag === 'samp' || tag === 'tt') val.font = 'mono';
  if (tag === 'a') {
    const href = hrefValue(attrOf(attrs, 'href'));
    if (href) val.a = href;
  }
  if (tag === 'font') {
    const c = cssColor(attrOf(attrs, 'color'));
    if (c) val.color = c;
    const f = cssFont(attrOf(attrs, 'face'));
    if (f && opts.styles !== false) val.font = f;
  }
  const css = styleMap(attrs);
  if (css.size) {
    const fw = css.get('font-weight')?.toLowerCase();
    if (fw) {
      if (fw === 'bold' || fw === 'bolder' || Number(fw) >= 600) on.push('b');
      else if (fw === 'normal' || fw === 'lighter' || Number(fw) <= 500) off.push('b');
    }
    const fs = css.get('font-style')?.toLowerCase();
    if (fs === 'italic' || fs === 'oblique') on.push('i');
    else if (fs === 'normal') off.push('i');
    const td = (css.get('text-decoration-line') ?? css.get('text-decoration'))?.toLowerCase();
    if (td) {
      if (/underline/.test(td)) on.push('u');
      if (/line-through/.test(td)) on.push('s');
      if (/none/.test(td)) off.push('u', 's');
    }
    const va = css.get('vertical-align')?.toLowerCase();
    if (va === 'super') on.push('sup');
    else if (va === 'sub') on.push('sub');
    else if (va === 'baseline') off.push('sup', 'sub');
    if (opts.styles !== false) {
      if (css.has('color')) {
        const c = cssColor(css.get('color'));
        // the text's own colour — what every Google Docs span says — is no colour at all
        val.color = c && c !== '#000000' ? c : null;
      }
      const bgRaw = css.get('background-color') ?? css.get('background');
      if (bgRaw !== undefined) {
        const bg = cssColor(bgRaw.split(/\s+/)[0]);
        val.bg = bg && bg !== '#ffffff' ? bg : null;
      }
      if (css.has('font-family')) {
        const f = cssFont(css.get('font-family'));
        if (f) val.font = f;
      }
      const size = cssPoints(css.get('font-size'));
      if (size !== null) {
        const v = sizeValue(size);
        val.size = v && (opts.baseSize === undefined || Number(v) !== opts.baseSize) ? v : null;
      }
    }
  }
  return { on: on.filter((t) => !off.includes(t)), off, val };
}

/** What a block element says about its paragraph: alignment, indentation, line spacing; and whether a page break comes with it. */
function blockStyle(tag: string, attrs: string, opts: HtmlOptions): { attrs: Partial<Block>; breakBefore: boolean; breakAfter: boolean } {
  const css = styleMap(attrs);
  const out: Partial<Block> = {};
  const align = (css.get('text-align') ?? attrOf(attrs, 'align') ?? '').toLowerCase();
  if (align === 'center' || align === 'right' || align === 'justify') out.align = align;
  if (opts.styles !== false && (tag === 'p' || tag === 'div' || /^h[1-6]$/.test(tag))) {
    const ml = cssPoints(css.get('margin-left') ?? css.get('padding-left'));
    if (ml !== null && ml >= 27) out.ind = Math.max(1, Math.min(8, Math.round(ml / 36)));
    const lhRaw = css.get('line-height');
    if (lhRaw && /^[\d.]+%?$/.test(lhRaw.trim())) {
      const css_ = lhRaw.trim().endsWith('%') ? parseFloat(lhRaw) / 100 : parseFloat(lhRaw);
      const word = css_ / 1.15;
      // single and its near neighbours are the page's own spacing; more is a choice the writer made
      if (word >= 1.3) out.lh = [1.5, 2, 2.5, 3].reduce((a, b) => (Math.abs(b - word) < Math.abs(a - word) ? b : a));
    }
  }
  const before = (css.get('page-break-before') ?? css.get('break-before') ?? '').toLowerCase();
  const after = (css.get('page-break-after') ?? css.get('break-after') ?? '').toLowerCase();
  return { attrs: out, breakBefore: before === 'always' || before === 'page', breakAfter: after === 'always' || after === 'page' };
}

export interface HtmlOptions {
  /** pictures come in, with the address they had (a data address or the web), to be kept before they join the writing (settleImages) */
  images?: boolean;
  /** colours, highlights, fonts, sizes, indentation and spacing come in — off for a paste without formatting */
  styles?: boolean;
  /** the size the writing is already in: a paste in that size is not marked with it */
  baseSize?: number;
}

/**
 * HTML into blocks. Tolerant of everything a clipboard holds — Word's
 * conditional comments and list bullets, Google Docs' wrappers, unclosed tags.
 */
export function htmlToBlocks(html: string, opts: HtmlOptions = {}): Block[] {
  const src = String(html ?? '')
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
    .replace(DROP, '');
  const out: Block[] = [];
  // (asserted, not narrowed: the closures below are what change it)
  let cur = null as Building | null;
  let table = null as TableBuilding | null;
  const lists: ('ul' | 'ol')[] = [];
  let quote = 0;
  let pre = 0;
  let heading: BlockType | null = null;
  // the block elements open, innermost last: their paragraph settings, and whether a page break follows them
  const blockAttrs: { tag: string; attrs: Partial<Block>; breakAfter: boolean }[] = [];
  /** A block element closed: it and anything left open inside it; a page break it asked for after it, put in. */
  const closeBlock = (tag: string) => {
    let k = blockAttrs.length - 1;
    while (k >= 0 && blockAttrs[k].tag !== tag) k--;
    if (k < 0) return;
    const gone = blockAttrs.splice(k);
    if (gone.some((g) => g.breakAfter)) {
      finish();
      out.push(makePageBreak());
    }
  };
  // the inline elements open, and what each did to the marks
  const inline: { tag: string; on: FlagMark[]; off: FlagMark[]; val: Vals }[] = [];
  // Word draws a list's bullet as text inside <![if !supportLists]>…<![endif]>: read it to tell numbers from bullets, then drop it
  let inMark = false;
  let markText = '';
  let wordList: { lvl: number } | null = null;

  const active = (): { on: FlagMark[]; val: Partial<Record<ValueMark, string>> } => {
    const on = new Set<FlagMark>();
    const val: Partial<Record<ValueMark, string>> = {};
    for (const el of inline) {
      for (const t of el.off) on.delete(t);
      for (const t of el.on) on.add(t);
      for (const [k, v] of Object.entries(el.val) as [ValueMark, string | null][]) {
        if (v) val[k] = v;
        else delete val[k];
      }
    }
    if (on.has('sup')) on.delete('sub');
    return { on: Array.from(on), val };
  };
  const currentAttrs = (): Partial<Block> => Object.assign({}, ...blockAttrs.map((b) => b.attrs));
  const contextType = (): { t: BlockType; lvl?: number } => {
    if (heading) return { t: heading };
    if (lists.length) return { t: lists[lists.length - 1], lvl: Math.min(3, lists.length) };
    if (quote) return { t: 'quote' };
    if (pre) return { t: 'code' };
    return { t: 'p' };
  };
  const trimRun = (r: Run, keepSpace: boolean): Run => {
    let text = r.text;
    let marks = r.marks;
    if (!keepSpace) {
      // the space a tag left at either end is not the person's
      const lead = text.length - text.replace(/^[ \n]+/, '').length;
      text = text.slice(lead).replace(/[ \n]+$/, '');
      marks = marks.map((m) => ({ ...m, s: m.s - lead, e: m.e - lead }));
    } else text = text.replace(/\n+$/, '');
    return { text: text.replace(/\u00a0/g, ' '), marks };
  };
  const finish = () => {
    if (!cur) return;
    const b = cur;
    cur = null;
    const { text, marks } = trimRun(b, !!b.pre);
    if (!text.trim()) return;
    const block: Block = { id: uid('b'), t: b.t, text, ...(b.t === 'code' ? {} : b.attrs) };
    if (b.lvl && (b.t === 'ul' || b.t === 'ol')) block.lvl = b.lvl;
    if (b.t === 'ul' || b.t === 'ol') delete block.ind;
    const m = b.t === 'code' ? undefined : normalizeMarks(marks, text.length);
    if (m) block.marks = m;
    out.push(block);
  };
  const start = (shape: { t: BlockType; lvl?: number }, li = false) => {
    finish();
    cur = { ...shape, text: '', marks: [], attrs: currentAttrs(), ...(li ? { li: true } : {}), ...(pre || shape.t === 'code' ? { pre: true } : {}) };
  };
  const addTo = (r: Run, text: string) => {
    const s = r.text.length;
    r.text += text;
    const { on: flags, val } = active();
    // a link's own look — the blue and the underline every editor paints it with — is the link, not formatting
    const on = val.a ? flags.filter((t) => t !== 'u') : flags;
    if (val.a) delete val.color;
    for (const t of on) {
      const last = [...r.marks].reverse().find((m) => m.t === t);
      if (last && last.e === s) last.e = s + text.length;
      else r.marks.push({ s, e: s + text.length, t });
    }
    for (const [t, v] of Object.entries(val) as [ValueMark, string][]) {
      const last = [...r.marks].reverse().find((m) => m.t === t);
      if (last && last.e === s && last.v === v) last.e = s + text.length;
      else r.marks.push({ s, e: s + text.length, t, v });
    }
  };
  const append = (raw: string) => {
    let text = raw;
    const into: Run | null = table?.cell ?? null;
    if (!pre || into) {
      text = text.replace(/[ \t\r\n\f]+/g, ' ');
      const host = into ?? cur;
      if (!host || !host.text || /[ \n]$/.test(host.text)) text = text.replace(/^ /, '');
    }
    if (!text) return;
    if (table && !table.cell) return; // words between a table's cells are not in any cell
    if (into) {
      addTo(into, text);
      return;
    }
    if (!cur) start(wordList ? { t: 'ul', lvl: wordList.lvl } : contextType());
    addTo(cur!, text);
  };
  /** A line break inside the run that is open: a cell's, or the block's. */
  const lineBreak = () => {
    if (table) {
      if (table.cell && table.cell.text && !table.cell.text.endsWith('\n')) table.cell.text += '\n';
      return;
    }
    if (!cur) start(contextType());
    cur!.text += '\n';
  };
  const closeCell = () => {
    if (!table?.cell) return;
    const c = table.cell;
    table.cell = null;
    const t = trimRun(c, false);
    const row = (table.row ??= []);
    row.push({ ...c, text: t.text, marks: t.marks });
    for (let k = 1; k < (c.span ?? 1); k++) row.push({ text: '', marks: [], th: c.th });
  };
  const closeRow = () => {
    if (!table) return;
    closeCell();
    if (table.row) {
      if (table.row.length) table.rows.push(table.row);
      if (table.rows.length === 1 && table.row.length && (table.inHead || table.row.every((c) => c.th))) table.head = true;
    }
    table.row = null;
  };
  const finishTable = () => {
    if (!table) return;
    closeRow();
    const t = table;
    table = null;
    const rows = t.rows.map((r) => r.map((c): Block => ({ id: uid('td'), t: 'p', text: c.text, ...(c.align ? { align: c.align } : {}), ...(normalizeMarks(c.marks, c.text.length) ? { marks: normalizeMarks(c.marks, c.text.length)! } : {}) })));
    if (!rows.some((r) => r.some((c) => c.text.trim()))) return;
    const width = Math.max(...rows.map((r) => r.length));
    const block = tableFrom(rows, { head: t.head, ...(t.cols.length === width ? { cols: t.cols } : {}) });
    if (block) out.push(block);
  };

  const re = /<!--[\s\S]*?-->|<!\[if !supportLists\]>|<!\[endif\]>|<!\[[^\]]*\]>|<![A-Za-z][^>]*>|<\?[^>]*>|<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)|</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const tok = m[0];
    if (tok.startsWith('<!--')) {
      if (/^<!--\s*pagebreak\s*-->$/i.test(tok) && !table) {
        finish();
        out.push(makePageBreak());
      }
      continue;
    }
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
    if (tok.startsWith('<![') || /^<![A-Za-z]/.test(tok) || tok.startsWith('<?')) continue;
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
      const bs = blockStyle(tag, attrs, opts);
      if ((bs.breakBefore || bs.breakAfter) && !table) {
        finish();
        out.push(makePageBreak());
        continue;
      }
      lineBreak();
      continue;
    }
    if (tag === 'img') {
      if (close || !opts.images || table) continue;
      const imgSrc = attrOf(attrs, 'src') ?? '';
      if (!/^(data:image\/(png|jpe?g|gif|webp);base64,|https?:\/\/)/i.test(imgSrc)) continue;
      finish();
      const w = Number(attrOf(attrs, 'width'));
      const h = Number(attrOf(attrs, 'height'));
      const pct = /^\s*([\d.]+)%\s*$/.exec(styleMap(attrs).get('width') ?? '');
      const share = pct ? Math.round(parseFloat(pct[1])) : 0;
      const align = currentAttrs().align;
      out.push({
        ...makeImage({ src: 'm:' + '0'.repeat(32), alt: attrOf(attrs, 'alt') ?? '', ...(w > 0 && h > 0 ? { iw: w, ih: h } : {}), ...(share > 0 && share < 100 ? { w: share } : {}), ...(align && align !== 'justify' ? { align } : {}) }),
        src: imgSrc,
      });
      continue;
    }
    if (tag === 'input' || tag === 'meta' || tag === 'link' || tag === 'wbr') continue;
    if (TABLE_TAGS.has(tag)) {
      if (tag === 'table') {
        if (close) {
          if (table && table.depth > 0) table.depth--;
          else finishTable();
        } else if (table) {
          table.depth++;
        } else {
          finish();
          wordList = null;
          table = { rows: [], row: null, cell: null, head: false, inHead: false, cols: [], depth: 0 };
        }
        continue;
      }
      if (!table) {
        // a cell with no table around it: its words are a line
        if ((tag === 'td' || tag === 'th') && !close && cur && cur.text && !cur.text.endsWith('\t')) cur.text += '\t';
        if (tag === 'tr' && close) finish();
        continue;
      }
      if (table.depth > 0) {
        // a table inside a cell: its cells are words of that cell
        if ((tag === 'td' || tag === 'th') && !close && table.cell?.text && !/[\t\n]$/.test(table.cell.text)) table.cell.text += ' ';
        if (tag === 'tr' && close && table.cell?.text) table.cell.text += '\n';
        continue;
      }
      if (tag === 'thead') table.inHead = !close;
      else if (tag === 'tr') {
        if (close) closeRow();
        else {
          closeRow();
          table.row = [];
        }
      } else if (tag === 'td' || tag === 'th') {
        if (close) closeCell();
        else {
          closeCell();
          if (!table.row) table.row = [];
          const css = styleMap(attrs);
          const a = (css.get('text-align') ?? attrOf(attrs, 'align') ?? '').toLowerCase();
          // a merged cell keeps its words in its first column; the others it spans stay, empty, so the grid stays a grid
          const span = Math.min(20, Math.max(1, Number(attrOf(attrs, 'colspan')) || 1));
          table.cell = { text: '', marks: [], th: tag === 'th', ...(a === 'center' || a === 'right' ? { align: a as Align } : {}), ...(span > 1 ? { span } : {}) };
        }
      } else if (tag === 'col' && !close) {
        const css = styleMap(attrs);
        const pct = /^\s*([\d.]+)%\s*$/.exec(css.get('width') ?? attrOf(attrs, 'width') ?? '');
        const w = pct ? parseFloat(pct[1]) : Number(attrOf(attrs, 'width')) || cssPoints(css.get('width')) || 0;
        const span = Math.min(20, Math.max(1, Number(attrOf(attrs, 'span')) || 1));
        for (let k = 0; k < span; k++) table.cols.push(w > 0 ? w : 1);
      }
      continue;
    }
    if (BLOCK_TAGS.has(tag)) {
      if (table) {
        // a cell's paragraphs, lists and headings are lines of the cell
        if (!close && table.cell && table.cell.text && !table.cell.text.endsWith('\n')) table.cell.text += '\n';
        if (tag === 'hr' && table.cell && table.cell.text && !table.cell.text.endsWith('\n')) table.cell.text += '\n';
        continue;
      }
      if (tag === 'hr') {
        if (close) continue;
        finish();
        wordList = null;
        out.push(makeRule());
        continue;
      }
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
        if (close) {
          heading = null;
          closeBlock(tag);
        } else {
          heading = tag === 'h1' ? 'h1' : tag === 'h2' ? 'h2' : 'h3';
          const bs = blockStyle(tag, attrs, opts);
          if (bs.breakBefore) out.push(makePageBreak());
          blockAttrs.push({ tag, attrs: bs.attrs, breakAfter: bs.breakAfter });
        }
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
        closeBlock(tag);
        continue;
      }
      if ((tag === 'p' || tag === 'div') && cur?.li && !cur.text.trim()) continue;
      // a paragraph cannot hold a paragraph: an unclosed one ends where the next begins
      if (tag === 'p' && blockAttrs.length && blockAttrs[blockAttrs.length - 1].tag === 'p') {
        finish();
        closeBlock('p');
      }
      const bs = blockStyle(tag, attrs, opts);
      if (bs.breakBefore) {
        finish();
        out.push(makePageBreak());
      }
      blockAttrs.push({ tag, attrs: bs.attrs, breakAfter: bs.breakAfter });
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
    inline.push({ tag, ...inlineMarks(tag, attrs, opts) });
  }
  finish();
  finishTable();
  return headingLook(out);
}

/** A heading is a heading: a size or a bold set on all of it is the heading's look, not something the person added. */
function headingLook(blocks: Block[]): Block[] {
  for (const b of blocks) {
    if (!(b.t === 'h1' || b.t === 'h2' || b.t === 'h3') || !b.marks) continue;
    const marks = b.marks.filter((m) => !(m.t === 'size' || (m.t === 'b' && m.s === 0 && m.e === b.text.length)));
    if (marks.length) b.marks = marks;
    else delete b.marks;
  }
  return blocks;
}

// ── pictures that came in with an address of their own ──────────────

/** A picture a paste or a file brought, still at the address it came with — a data address, or the web. */
export const isLooseImage = (b: Block) => b.t === 'img' && !!b.src && !MEDIA_SRC.test(b.src);

/**
 * Pictures that came in with an address of their own, kept before they join
 * the writing: `keep` stores one and says where it is now kept (or that it
 * could not be). A picture that could not be kept is left out — and counted,
 * so the import can say so.
 */
export async function settleImages(
  blocks: Block[],
  keep: (src: string, alt: string) => Promise<{ src: string; iw?: number; ih?: number; by?: string } | null>
): Promise<{ blocks: Block[]; dropped: number }> {
  let dropped = 0;
  const out: Block[] = [];
  for (const b of blocks) {
    if (!isLooseImage(b)) {
      out.push(b);
      continue;
    }
    let kept: Awaited<ReturnType<typeof keep>> = null;
    try {
      kept = await keep(b.src!, b.alt ?? '');
    } catch {
      kept = null;
    }
    if (!kept || !MEDIA_SRC.test(kept.src)) {
      dropped++;
      continue;
    }
    out.push({ ...b, src: kept.src, ...(kept.iw && kept.ih ? { iw: kept.iw, ih: kept.ih } : {}), ...(kept.by ? { by: kept.by } : {}) });
  }
  return { blocks: out, dropped };
}

// ── plain text and Markdown ──────────────────────────────────────────

/** Markdown's emphasis, struck words, code, links and escapes, read into words and marks. */
export function parseInline(s: string): { text: string; marks: Mark[] } {
  let text = '';
  const marks: Mark[] = [];
  let i = 0;
  const word = /[\p{L}\p{N}]/u;
  const take = (inner: string, t: Mark['t'] | null, v?: string) => {
    const r = parseInline(inner);
    const at = text.length;
    text += r.text;
    for (const mk of r.marks) marks.push({ ...mk, s: mk.s + at, e: mk.e + at });
    if (t && r.text) marks.push({ s: at, e: at + r.text.length, t, ...(v ? { v } : {}) });
  };
  const tags: [string, string, Mark['t']][] = [
    ['<u>', '</u>', 'u'],
    ['<s>', '</s>', 's'],
    ['<del>', '</del>', 's'],
    ['<sup>', '</sup>', 'sup'],
    ['<sub>', '</sub>', 'sub'],
  ];
  outer: while (i < s.length) {
    const ch = s[i];
    if (ch === '\\' && i + 1 < s.length && /[\\`*_[\]()#+\-.!<>|~{}]/.test(s[i + 1])) {
      text += s[i + 1];
      i += 2;
      continue;
    }
    if (ch === '`') {
      const run = /^`+/.exec(s.slice(i))![0];
      const j = s.indexOf(run, i + run.length);
      if (j > i + run.length - 1 && j >= 0) {
        const inner = s.slice(i + run.length, j);
        const code = run.length > 1 ? inner.replace(/^ (.*) $/, '$1') : inner;
        if (code) {
          const at = text.length;
          text += code;
          marks.push({ s: at, e: at + code.length, t: 'font', v: 'mono' });
        }
        i = j + run.length;
        continue;
      }
    }
    if (ch === '~' && s[i + 1] === '~') {
      const j = s.indexOf('~~', i + 2);
      if (j > i + 2 && !/\s/.test(s[i + 2]) && !/\s/.test(s[j - 1])) {
        take(s.slice(i + 2, j), 's');
        i = j + 2;
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
    if (ch === '<') {
      for (const [open, end, t] of tags) {
        if (s.startsWith(open, i)) {
          const j = s.indexOf(end, i + open.length);
          if (j > i + open.length) {
            take(s.slice(i + open.length, j), t);
            i = j + end.length;
            continue outer;
          }
        }
      }
      const auto = /^<((?:https?:\/\/|mailto:)[^>\s]+)>/i.exec(s.slice(i));
      if (auto) {
        const href = hrefValue(auto[1]);
        const at = text.length;
        text += auto[1].replace(/^mailto:/i, '');
        if (href) marks.push({ s: at, e: text.length, t: 'a', v: href });
        i += auto[0].length;
        continue;
      }
      if (/^<br\s*\/?>/i.test(s.slice(i))) {
        text += '\n';
        i += /^<br\s*\/?>/i.exec(s.slice(i))![0].length;
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
      const link = /^\[((?:\\.|[^\]\\])+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(s.slice(i));
      if (link) {
        const href = hrefValue(link[2]);
        take(link[1], href ? 'a' : null, href ?? undefined);
        i += link[0].length;
        continue;
      }
    }
    text += ch;
    i++;
  }
  return { text, marks };
}

/** Whether pasted text is Markdown rather than plain words: headings, emphasis, lists, tables or links in its syntax. */
export function looksLikeMarkdown(text: string): boolean {
  return (
    /^#{1,6}\s+\S/m.test(text) ||
    /\*\*[^*\n]+\*\*/.test(text) ||
    /^\s*[-*+]\s+\S[\s\S]*\n\s*[-*+]\s+\S/m.test(text) ||
    /^>\s/m.test(text) ||
    /\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)/.test(text) ||
    /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/m.test(text) ||
    /^```/m.test(text)
  );
}

const LIST_LINE = /^(\s*)([-*+•–◦▪]|\d{1,3}[.)])\s+(.*)$/;
const TABLE_RULE = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;
const PAGE_BREAK_LINE = /^\s*(<div[^>]*page-break-(after|before)\s*:\s*always[^>]*>\s*<\/div>|<!--\s*pagebreak\s*-->|\\newpage|\\pagebreak)\s*$/i;

/** One line of a Markdown table, as its cells — split on the bars that are not escaped. */
function tableCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let curr = '';
  for (let k = 0; k < s.length; k++) {
    if (s[k] === '\\' && s[k + 1] === '|') {
      curr += '\\|';
      k++;
      continue;
    }
    if (s[k] === '|') {
      cells.push(curr.trim());
      curr = '';
      continue;
    }
    curr += s[k];
  }
  cells.push(curr.trim());
  return cells;
}

export interface TextOptions {
  markdown?: boolean;
  /** a line that is only a picture becomes one, with the address it had (settleImages keeps it) */
  images?: boolean;
}

/**
 * Plain text into blocks. A blank line ends a paragraph; lines inside one are
 * joined when they were wrapped to a width, and kept as line breaks when they
 * were not (a poem, an address); a form feed is a page break. With
 * `markdown`, its syntax is read too: headings, lists, quotes, code, tables,
 * horizontal lines and pictures.
 */
export function textToBlocks(input: string, opts: TextOptions = {}): Block[] {
  const md = !!opts.markdown;
  const lines = String(input ?? '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').replace(/\f/g, '\n\f\n').split('\n');
  const out: Block[] = [];
  let para: string[] = [];
  let quoteLines: string[] = [];
  let item = null as { t: 'ul' | 'ol'; lvl: number; lines: string[] } | null;
  let fence: string | null = null;
  let fenced: string[] = [];

  const push = (t: BlockType, raw: string, lvl?: number) => {
    const r = md && t !== 'code' ? parseInline(raw) : { text: raw, marks: [] as Mark[] };
    const text = r.text.replace(/\u00a0/g, ' ');
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
    if (para.length) {
      // a Markdown table: a line of cells, a rule under it, then rows
      if (md && para.length >= 2 && /\|/.test(para[0]) && TABLE_RULE.test(para[1]) && /-/.test(para[1])) {
        const rows = [para[0], ...para.slice(2)].map((l) => tableCells(l));
        const rule = tableCells(para[1]);
        const cells = rows.map((r) =>
          r.map((c, k): Block => {
            const p = parseInline(c);
            const al = rule[k];
            const align: Align | undefined = al && /^:-+:$/.test(al) ? 'center' : al && /^-+:$/.test(al) ? 'right' : undefined;
            const marks = normalizeMarks(p.marks, p.text.length);
            return { id: uid('td'), t: 'p', text: p.text, ...(marks ? { marks } : {}), ...(align ? { align } : {}) };
          })
        );
        const t = tableFrom(cells, { head: true });
        if (t) out.push(t);
      } else push('p', joinLines(para).trim());
    }
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
    if (md && /^\s*(```+|~~~+)/.test(line)) {
      const mark = /^\s*(```+|~~~+)/.exec(line)![1];
      if (fence && mark.startsWith(fence[0]) && mark.length >= fence.length) {
        endAll();
        if (fenced.join('').trim()) out.push({ id: uid('b'), t: 'code', text: fenced.join('\n') });
        fenced = [];
        fence = null;
      } else if (!fence) {
        endAll();
        fence = mark;
      } else fenced.push(line);
      continue;
    }
    if (fence) {
      fenced.push(line);
      continue;
    }
    if (line === '\f') {
      endAll();
      out.push(makePageBreak());
      continue;
    }
    if (!line.trim()) {
      endAll();
      continue;
    }
    if (md && PAGE_BREAK_LINE.test(line)) {
      endAll();
      out.push(makePageBreak());
      continue;
    }
    // a line of = or - under a paragraph's line is Markdown's other way to write a heading
    if (md && para.length && !quoteLines.length && !item && /^\s{0,3}(=+|-+)\s*$/.test(line) && !/\|/.test(para[0])) {
      const words = joinLines(para).trim();
      para = [];
      push(line.trim()[0] === '=' ? 'h1' : 'h2', words);
      continue;
    }
    if (md && /^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line) && !(para.length && /\|/.test(para[0]))) {
      endAll();
      out.push(makeRule());
      continue;
    }
    const h = md ? /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line) : null;
    if (h) {
      endAll();
      push(h[1].length === 1 ? 'h1' : h[1].length === 2 ? 'h2' : 'h3', h[2]);
      continue;
    }
    const pic = md && opts.images ? /^\s*!\[([^\]]*)\]\(\s*(data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+|https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\s*\)\s*$/.exec(line) : null;
    if (pic) {
      endAll();
      out.push({ ...makeImage({ src: 'm:' + '0'.repeat(32), alt: pic[1] }), src: pic[2] });
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
  if (fence && fenced.join('').trim()) out.push({ id: uid('b'), t: 'code', text: fenced.join('\n') });
  endAll();
  return out;
}

export const markdownToBlocks = (md: string, opts: { images?: boolean } = {}) => textToBlocks(md, { markdown: true, ...opts });

/** Text from a clipboard or a file, read the way it was most likely written. */
export function pastedText(text: string): Block[] {
  return textToBlocks(text, { markdown: looksLikeMarkdown(text) });
}

/** Whether blocks are only words — no picture, line or table among them. */
export const onlyWords = (blocks: Block[]) => !blocks.some((b) => isOpaque(b.t));

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
