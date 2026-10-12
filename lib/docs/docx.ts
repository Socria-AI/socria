// lib/docs/docx.ts — a Word document, read from its own structure.
//
// Word holds what a PDF has to be reverse-engineered for: which paragraph is
// a heading and at what level, which is a list item, a caption or a
// quotation; which table cells are merged; how an equation is built. The old
// reader kept Word's text runs and lost the rest — every equation, chart,
// text box and heading. This reads:
//
//   headings    by style ("Heading 2", or any style with an outline level) —
//               and, where a document makes its headings by hand, short
//               paragraphs set all in bold or large
//   lists       numbered and bulleted, numbered as Word numbers them
//   tables      merged cells kept in place; heading rows from the file's own
//               "repeat as header row"; tables used for page layout read as
//               the text they hold; columns lined up with tabs read as tables
//   equations   Word's own (OMML) in linear notation (lib/docs/omml.ts). Old
//               Equation Editor and MathType objects cannot be read as text:
//               they are said to be there, never guessed at
//   charts      from the numbers they cache, as tables (lib/docs/office.ts);
//               SmartArt as an outline of its words; spreadsheets embedded
//               in the document as the tables they show
//   text boxes  read where they sit
//   notes       footnotes at the end of the page they are cited on; endnotes
//               at the end; comments beside the paragraph they are about
//   pictures    their alt text — and the picture itself, for a vision
//               reading on request
//   pages       where Word last broke them, when it saved that; otherwise at
//               the document's own page and section breaks
//
// Deleted tracked changes are left out and inserted ones read; hidden text
// and unfilled form placeholders are left out, as Word leaves them out when
// it prints. Every character the reading holds is checked against an
// independent walk of the file's XML (lib/docs/checks.ts).
//
// PURE — works over OfficeParts.

import { DocBuilder, type MediaRef, type ReaderOut } from './build';
import { alternate, chartRawText, coreTitle, diagramRawText, findIn, guessHead, isLayoutTable, mimeOf, pictureInfo, readChart, readDiagram, relsOf, symbolChar, visible, type ChartData, type OfficeParts, type Rel } from './office';
import { equationText } from './omml';
import { CAPTION, LIST_MARK, toScript } from './text';
import type { BlockFlag, BlockKind, DocCheck, FigureKind } from './types';
import { attr, first, kid, kids, parseXml, relId, textOf, type XNode } from './xml';
import { embeddedWorkbook } from './xlsx';

/** Characters read before the rest of a long document is left unread (and said to be). */
const BUDGET = 300_000;
const MONO_FONT = /courier|mono|consol|menlo|inconsolata|lucida ?console|andale|source code|fira code|jetbrains/i;

const on = (n: XNode | undefined) => !!n && !/^(0|false|off|none)$/i.test(attr(n, 'val') ?? 'true');
const num = (n: XNode | undefined) => {
  const v = Number(attr(n, 'val'));
  return Number.isFinite(v) ? v : undefined;
};

// ── styles ──────────────────────────────────────────────────────────

interface Style {
  id: string;
  name: string;
  type: string;
  basedOn?: string;
  pPr?: XNode;
  rPr?: XNode;
}

class Styles {
  private map = new Map<string, Style>();
  defaultParagraph?: string;
  /** half-points */
  defaultSize = 20;
  defaultFont = '';
  defaultBold = false;

  constructor(xml: string | null) {
    if (!xml) return;
    const root = parseXml(xml);
    const rPr = first(first(first(root, 'w:docDefaults'), 'w:rPrDefault'), 'w:rPr');
    this.defaultSize = num(kid(rPr, 'w:sz')) ?? 20;
    this.defaultFont = attr(kid(rPr, 'w:rFonts'), 'ascii') ?? '';
    this.defaultBold = on(kid(rPr, 'w:b'));
    for (const s of kids(first(root, 'w:styles'), 'w:style')) {
      const id = attr(s, 'styleId');
      if (!id) continue;
      const style: Style = { id, name: (attr(kid(s, 'w:name'), 'val') ?? id).toLowerCase(), type: attr(s, 'type') ?? 'paragraph', basedOn: attr(kid(s, 'w:basedOn'), 'val'), pPr: kid(s, 'w:pPr'), rPr: kid(s, 'w:rPr') };
      this.map.set(id, style);
      if (style.type === 'paragraph' && /^(1|true|on)$/i.test(attr(s, 'default') ?? '')) this.defaultParagraph = id;
    }
  }

  /** A style and those it is based on, nearest first. */
  chain(id: string | undefined, fallback = true): Style[] {
    const out: Style[] = [];
    const seen = new Set<string>();
    let cur = id ?? (fallback ? this.defaultParagraph : undefined);
    while (cur && !seen.has(cur) && out.length < 12) {
      seen.add(cur);
      const s = this.map.get(cur);
      if (!s) break;
      out.push(s);
      cur = s.basedOn;
    }
    return out;
  }
}

const pick = <T,>(chain: Style[], f: (s: Style) => T | undefined): T | undefined => {
  for (const s of chain) {
    const v = f(s);
    if (v !== undefined) return v;
  }
  return undefined;
};

type StyleKind = 'title' | 'subtitle' | 'heading' | 'caption' | 'quote' | 'code' | 'toc' | 'note';

interface ParaStyle {
  chain: Style[];
  kind?: StyleKind;
  level?: number;
  num?: { id: string; ilvl: number };
  pageBreakBefore: boolean;
}

function styleKind(name: string): { kind: StyleKind; level?: number } | null {
  let m: RegExpExecArray | null;
  if ((m = /^heading\s*([1-9])$/.exec(name))) return { kind: 'heading', level: Number(m[1]) };
  if (name === 'title') return { kind: 'title' };
  if (name === 'subtitle') return { kind: 'subtitle' };
  if ((m = /^toc\s*([1-9])$/.exec(name))) return { kind: 'toc', level: Number(m[1]) };
  if (/caption/.test(name)) return { kind: 'caption' };
  if (/quote/.test(name)) return { kind: 'quote' };
  if (/\bcode\b|preformatted|source|verbatim|listing|macro text|plain text/.test(name)) return { kind: 'code' };
  if (/footnote text|endnote text|annotation text|comment text/.test(name)) return { kind: 'note' };
  return null;
}

function paraStyle(styles: Styles, pPr: XNode | undefined): ParaStyle {
  const chain = styles.chain(attr(kid(pPr, 'w:pStyle'), 'val'));
  let kind: StyleKind | undefined;
  let level: number | undefined;
  for (const s of chain) {
    const k = styleKind(s.name);
    if (k) {
      kind = k.kind;
      level = k.level;
      break;
    }
  }
  const outline = num(kid(pPr, 'w:outlineLvl')) ?? pick(chain, (s) => num(kid(s.pPr, 'w:outlineLvl')));
  if (outline !== undefined && outline >= 0 && outline <= 8 && (!kind || kind === 'heading')) {
    kind = 'heading';
    level = level ?? outline + 1;
  }
  const numPr = kid(pPr, 'w:numPr') ?? pick(chain, (s) => kid(s.pPr, 'w:numPr'));
  const numId = attr(kid(numPr, 'w:numId'), 'val');
  const ilvl = num(kid(kid(pPr, 'w:numPr'), 'w:ilvl')) ?? num(kid(numPr, 'w:ilvl')) ?? 0;
  const pbb = kid(pPr, 'w:pageBreakBefore') ?? pick(chain, (s) => kid(s.pPr, 'w:pageBreakBefore'));
  return { chain, kind, level, ...(numId && numId !== '0' ? { num: { id: numId, ilvl: Math.max(0, Math.min(8, ilvl)) } } : {}), pageBreakBefore: on(pbb) };
}

interface RunProps {
  bold: boolean;
  size: number;
  font: string;
  vanish: boolean;
  script?: 'sup' | 'sub';
}

function runProps(styles: Styles, rPr: XNode | undefined, ps: ParaStyle): RunProps {
  const rChain = styles.chain(attr(kid(rPr, 'w:rStyle'), 'val'), false);
  const get = (name: string) => kid(rPr, name) ?? pick(rChain, (s) => kid(s.rPr, name)) ?? pick(ps.chain, (s) => kid(s.rPr, name));
  const b = get('w:b');
  const va = attr(get('w:vertAlign'), 'val');
  return {
    bold: b ? on(b) : styles.defaultBold,
    size: num(get('w:sz')) ?? styles.defaultSize,
    font: attr(get('w:rFonts'), 'ascii') ?? attr(get('w:rFonts'), 'hAnsi') ?? styles.defaultFont,
    vanish: hiddenRun(styles, rPr),
    ...(va === 'superscript' ? { script: 'sup' as const } : va === 'subscript' ? { script: 'sub' as const } : {}),
  };
}

// ── numbering ───────────────────────────────────────────────────────

interface Lvl {
  start: number;
  fmt: string;
  text: string;
}

function roman(n: number): string {
  const r: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of r) while (n >= v) {
    out += s;
    n -= v;
  }
  return out || String(n);
}

function formatNumber(n: number, fmt: string): string {
  switch (fmt) {
    case 'decimalZero':
      return n < 10 ? `0${n}` : String(n);
    case 'lowerLetter':
    case 'upperLetter': {
      // Word's letters repeat rather than carry: …, z, aa, bb
      const s = String.fromCharCode(97 + ((n - 1) % 26)).repeat(Math.floor((n - 1) / 26) + 1);
      return fmt === 'upperLetter' ? s.toUpperCase() : s;
    }
    case 'lowerRoman':
      return roman(n).toLowerCase();
    case 'upperRoman':
      return roman(n);
    case 'ordinal': {
      const t = n % 100;
      return `${n}${t >= 11 && t <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
    }
    case 'decimalEnclosedCircle':
      return n >= 1 && n <= 20 ? String.fromCodePoint(0x2460 + n - 1) : String(n);
    case 'none':
      return '';
    default:
      return String(n);
  }
}

class Numbering {
  private abs = new Map<string, Map<number, Lvl>>();
  private nums = new Map<string, { abs: string; overrides: Map<number, number> }>();
  private counters = new Map<string, (number | undefined)[]>();

  constructor(xml: string | null) {
    if (!xml) return;
    const root = parseXml(xml);
    for (const a of kids(first(root, 'w:numbering'), 'w:abstractNum')) {
      const levels = new Map<number, Lvl>();
      for (const l of kids(a, 'w:lvl')) {
        levels.set(Number(attr(l, 'ilvl') ?? 0), { start: num(kid(l, 'w:start')) ?? 1, fmt: attr(kid(l, 'w:numFmt'), 'val') ?? 'decimal', text: attr(kid(l, 'w:lvlText'), 'val') ?? '' });
      }
      this.abs.set(attr(a, 'abstractNumId') ?? '', levels);
    }
    for (const n of kids(first(root, 'w:numbering'), 'w:num')) {
      const overrides = new Map<number, number>();
      for (const o of kids(n, 'w:lvlOverride')) {
        const s = num(kid(o, 'w:startOverride'));
        if (s !== undefined) overrides.set(Number(attr(o, 'ilvl') ?? 0), s);
      }
      this.nums.set(attr(n, 'numId') ?? '', { abs: attr(kid(n, 'w:abstractNumId'), 'val') ?? '', overrides });
    }
  }

  /** The label Word shows for the next paragraph in this list at this level ("3.", "b)", "•"), advancing the count. */
  label(numId: string, ilvl: number): string | null {
    const n = this.nums.get(numId);
    if (!n) return null;
    const levels = this.abs.get(n.abs);
    if (!levels) return null;
    // a list restarted with its own start numbers counts on its own; otherwise lists of one definition count together
    const key = n.overrides.size ? `num:${numId}` : `abs:${n.abs}`;
    const c = this.counters.get(key) ?? [];
    const lvl = levels.get(ilvl) ?? { start: 1, fmt: 'decimal', text: `%${ilvl + 1}.` };
    const startOf = (l: number) => n.overrides.get(l) ?? levels.get(l)?.start ?? 1;
    c[ilvl] = c[ilvl] === undefined ? startOf(ilvl) : c[ilvl]! + 1;
    for (let l = ilvl + 1; l < 9; l++) c[l] = undefined;
    this.counters.set(key, c);
    if (lvl.fmt === 'bullet') return '•';
    if (lvl.fmt === 'none' && !/%\d/.test(lvl.text)) return lvl.text.trim() || null;
    return lvl.text.replace(/%([1-9])/g, (_, d) => {
      const l = Number(d) - 1;
      return formatNumber(c[l] ?? startOf(l), levels.get(l)?.fmt ?? 'decimal');
    }).trim() || null;
  }
}

// ── what a walk of the body finds ───────────────────────────────────

interface Note {
  kind: 'foot' | 'end';
  id: string;
  mark: string;
}

type After =
  | { t: 'figure'; kind: FigureKind; alt?: string; title?: string; part?: string; chart?: ChartData; diagram?: { text: string; level: number }[]; flags?: BlockFlag[] }
  | { t: 'workbook'; parts: OfficeParts; alt?: string }
  | { t: 'box'; items: Item[] }
  | { t: 'comment'; id: string };

interface Para {
  t: 'p';
  kind: BlockKind;
  /** decided by the file's own style or numbering (not by a guess from its looks) */
  styled: boolean;
  /** a short, all-bold or large paragraph: perhaps a heading made by hand */
  pseudo: boolean;
  large: boolean;
  text: string;
  level?: number;
  tex?: string;
  flags: BlockFlag[];
  after: After[];
  notes: Note[];
  breaksBefore: number;
  breaksAfter: number;
  /** a paragraph's cells, when it is a row of tab-separated columns */
  tabCells?: string[];
  bold: boolean;
}

interface Table {
  t: 'tbl';
  rows: string[][];
  head: number;
  caption?: string;
  /** the cells' own contents, row by row, for a table that turns out to be page layout */
  cells?: Item[][][];
  after: After[];
  notes: Note[];
  breaks: number;
}

type Item = Para | Table;

interface Ctx {
  parts: OfficeParts;
  styles: Styles;
  numbering: Numbering;
  rels: Map<string, Rel>;
  /** pages from Word's own record of where it broke them */
  rendered: boolean;
  footnotes: Map<string, XNode>;
  endnotes: Map<string, XNode>;
  comments: Map<string, { author: string; node: XNode }>;
  counters: { foot: number; end: number };
  /** labels and marks the reading adds that the file does not hold as text */
  generated: string[];
  /** text read from embedded files, for the checks */
  embeddedRaw: string[];
  notes: DocCheck[];
  depth: number;
}

interface PState {
  text: string;
  /** text other than equations */
  plain: string;
  math: string[];
  visible: boolean;
  pieces: { len: number; bold: boolean; size: number; mono: boolean }[];
  after: After[];
  notes: Note[];
  flags: Set<BlockFlag>;
  breaksBefore: number;
  breaksAfter: number;
  /** the mark of the note being read, for its own w:footnoteRef */
  mark?: string;
  ps: ParaStyle;
}

function placeholder(sdt: XNode): boolean {
  return !!kid(kid(sdt, 'w:sdtPr'), 'w:showingPlcHdr') && on(kid(kid(sdt, 'w:sdtPr'), 'w:showingPlcHdr'));
}

function pageBreak(st: PState) {
  if (st.visible) st.breaksAfter++;
  else st.breaksBefore++;
}

function addText(st: PState, s: string, p: RunProps) {
  if (!s) return;
  st.text += s;
  st.plain += s;
  if (/\S/.test(s)) {
    st.visible = true;
    st.pieces.push({ len: s.replace(/\s/g, '').length, bold: p.bold, size: p.size, mono: MONO_FONT.test(p.font) });
  }
}

function drawing(ctx: Ctx, d: XNode): After[] {
  const container = kid(d, 'wp:inline') ?? kid(d, 'wp:anchor');
  if (!container) return [];
  const info = pictureInfo(kid(container, 'wp:docPr'));
  if (info.hidden) return [];
  const out: After[] = [];
  const gd = first(container, 'a:graphicData');
  const chartRef = first(gd, 'c:chart') ?? first(gd, 'cx:chart');
  const dgm = first(gd, 'dgm:relIds');
  if (chartRef) {
    const rel = ctx.rels.get(relId(chartRef) ?? '');
    const xml = rel && !rel.external ? ctx.parts.text(rel.target) : null;
    const chart = xml ? readChart(xml) : null;
    out.push({ t: 'figure', kind: 'chart', ...(info.alt ? { alt: info.alt } : {}), ...(info.title ? { title: info.title } : {}), ...(chart ? { chart } : { flags: ['illegible'] as BlockFlag[] }) });
  } else if (dgm) {
    const rel = ctx.rels.get(attr(dgm, 'dm') ?? '');
    const xml = rel && !rel.external ? ctx.parts.text(rel.target) : null;
    out.push({ t: 'figure', kind: 'diagram', ...(info.alt ? { alt: info.alt } : {}), ...(info.title ? { title: info.title } : {}), diagram: xml ? readDiagram(xml) : [] });
  } else {
    const pics = findIn(container, 'pic:pic');
    pics.forEach((pic, i) => {
      const own = pictureInfo(first(pic, 'pic:cNvPr'));
      if (info.decorative || own.decorative) return;
      const blip = first(pic, 'a:blip');
      const rel = ctx.rels.get(attr(blip, 'embed') ?? '') ?? ctx.rels.get(attr(blip, 'link') ?? '');
      const alt = (i === 0 ? info.alt : undefined) ?? own.alt;
      const title = (i === 0 ? info.title : undefined) ?? own.title;
      out.push({ t: 'figure', kind: 'image', ...(alt ? { alt } : {}), ...(title ? { title } : {}), ...(rel && !rel.external ? { part: rel.target } : {}) });
    });
    const shape = /wordprocessingShape|wordprocessingGroup|wordprocessingCanvas/.test(attr(gd, 'uri') ?? '');
    if (!pics.length && !shape && !info.decorative) out.push({ t: 'figure', kind: 'object', ...(info.alt ? { alt: info.alt } : {}), ...(info.title ? { title: info.title } : {}) });
  }
  if (ctx.depth < 3) for (const box of findIn(container, 'w:txbxContent')) out.push({ t: 'box', items: blockLevel({ ...ctx, depth: ctx.depth + 1 }, kids(box)) });
  return out;
}

/** Old-style (VML) pictures and text boxes. */
function pict(ctx: Ctx, p: XNode): After[] {
  const out: After[] = [];
  for (const im of findIn(p, 'v:imagedata')) {
    const rel = ctx.rels.get(relId(im) ?? '');
    const alt = (attr(im, 'title') ?? '').trim();
    out.push({ t: 'figure', kind: 'image', ...(alt ? { alt } : {}), ...(rel && !rel.external ? { part: rel.target } : {}) });
  }
  if (ctx.depth < 3) for (const box of findIn(p, 'w:txbxContent')) out.push({ t: 'box', items: blockLevel({ ...ctx, depth: ctx.depth + 1 }, kids(box)) });
  return out;
}

/** An embedded object: an old-style equation, a spreadsheet, or something else. */
function object(ctx: Ctx, o: XNode): After[] {
  const ole = first(o, 'o:OLEObject');
  const prog = attr(ole, 'ProgID') ?? '';
  const rel = ctx.rels.get(relId(ole) ?? '');
  if (/^equation|mathtype|dsmt|axmath/i.test(prog)) return [{ t: 'figure', kind: 'equation', flags: ['illegible'] }];
  if (rel && !rel.external && /\.xlsx$/i.test(rel.target) && ctx.parts.open) {
    try {
      const inner = ctx.parts.open(rel.target);
      if (inner) return [{ t: 'workbook', parts: inner }];
    } catch {
      // read below as an object that could not be opened
    }
  }
  return [{ t: 'figure', kind: 'object', flags: ['illegible'], ...(prog ? { title: prog.replace(/\.\d+$/, '') } : {}) }];
}

function runChildren(ctx: Ctx, st: PState, nodes: XNode[], p: RunProps) {
  for (const c of nodes) {
    switch (c.name) {
      case 'w:t': {
        let s = textOf(c);
        if (/^(symbol|wingdings|webdings)/i.test(p.font)) {
          let missing = false;
          s = [...s]
            .map((ch) => {
              const m = symbolChar(p.font, ch.codePointAt(0)!);
              if (m === null) missing = true;
              return m ?? '';
            })
            .join('');
          if (missing) st.flags.add('symbols-missing');
        }
        if (p.script) s = (/^\s*$/.test(s) ? s : toScript(s, p.script)) ?? s;
        addText(st, s, p);
        break;
      }
      case 'w:tab':
      case 'w:ptab':
        st.text += '\t';
        st.plain += '\t';
        break;
      case 'w:br': {
        const type = attr(c, 'type');
        if (type === 'page') {
          if (!ctx.rendered) pageBreak(st);
        } else if (type !== 'column') {
          st.text += '\n';
          st.plain += '\n';
        }
        break;
      }
      case 'w:cr':
        st.text += '\n';
        st.plain += '\n';
        break;
      case 'w:noBreakHyphen':
        addText(st, '‑', p);
        break;
      case 'w:sym': {
        const ch = symbolChar(attr(c, 'font') ?? '', attr(c, 'char') ?? '');
        if (ch) addText(st, ch, p);
        else st.flags.add('symbols-missing');
        break;
      }
      case 'w:lastRenderedPageBreak':
        if (ctx.rendered) pageBreak(st);
        break;
      case 'w:footnoteReference':
      case 'w:endnoteReference': {
        const foot = c.name === 'w:footnoteReference';
        const id = attr(c, 'id') ?? '';
        const custom = on(kid(c, 'w:customMarkFollows')) || /^(1|true)$/.test(attr(c, 'customMarkFollows') ?? '');
        let mark = '';
        if (!custom) {
          mark = foot ? (toScript(String(++ctx.counters.foot), 'sup') ?? '') : `[${roman(++ctx.counters.end).toLowerCase()}]`;
          st.text += mark;
          ctx.generated.push(mark);
        }
        if ((foot ? ctx.footnotes : ctx.endnotes).has(id)) st.notes.push({ kind: foot ? 'foot' : 'end', id, mark });
        break;
      }
      case 'w:footnoteRef':
      case 'w:endnoteRef':
        if (st.mark) st.text += `${st.mark} `;
        break;
      case 'w:commentReference':
        st.after.push({ t: 'comment', id: attr(c, 'id') ?? '' });
        break;
      case 'w:drawing':
        st.after.push(...drawing(ctx, c));
        break;
      case 'w:pict':
        st.after.push(...pict(ctx, c));
        break;
      case 'w:object':
        st.after.push(...object(ctx, c));
        break;
      case 'mc:AlternateContent':
        runChildren(ctx, st, alternate(c), p);
        break;
      case 'w:ruby':
        for (const r of kids(kid(c, 'w:rubyBase'), 'w:r')) run(ctx, st, r);
        break;
      default:
        // w:rPr, w:fldChar, w:instrText, w:delText, w:annotationRef, w:separator… carry no text of their own
        break;
    }
  }
}

function run(ctx: Ctx, st: PState, r: XNode) {
  const p = runProps(ctx.styles, kid(r, 'w:rPr'), st.ps);
  if (p.vanish) return;
  runChildren(ctx, st, kids(r), p);
}

/** Text Word does not show: hidden directly, or by its character style. */
function hiddenRun(styles: Styles, rPr: XNode | undefined): boolean {
  return on(kid(rPr, 'w:vanish')) || on(kid(rPr, 'w:specVanish')) || on(pick(styles.chain(attr(kid(rPr, 'w:rStyle'), 'val'), false), (s) => kid(s.rPr, 'w:vanish')));
}

function inline(ctx: Ctx, st: PState, nodes: XNode[]) {
  for (const n of nodes) {
    switch (n.name) {
      case 'w:r':
        run(ctx, st, n);
        break;
      case 'w:hyperlink':
      case 'w:ins':
      case 'w:moveTo':
      case 'w:smartTag':
      case 'w:customXml':
      case 'w:dir':
      case 'w:bdo':
      case 'w:fldSimple':
        inline(ctx, st, kids(n));
        break;
      case 'w:sdt':
        if (!placeholder(n)) inline(ctx, st, kids(kid(n, 'w:sdtContent')));
        break;
      case 'mc:AlternateContent':
        inline(ctx, st, alternate(n));
        break;
      case 'm:oMathPara':
      case 'm:oMath': {
        const t = equationText(n);
        if (t) {
          st.math.push(t);
          st.text += st.text && !/\s$/.test(st.text) ? ` ${t} ` : `${t} `;
        }
        break;
      }
      default:
        // w:pPr, w:del, w:moveFrom, bookmarks, proofing marks, comment ranges
        break;
    }
  }
}

const tidy = (s: string) =>
  s
    .replace(/\t+/g, ' ')
    .replace(/[  ]{2,}/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();

function para(ctx: Ctx, p: XNode, opts: { inTable?: boolean; mark?: string } = {}): Para {
  const pPr = kid(p, 'w:pPr');
  const ps = paraStyle(ctx.styles, pPr);
  const st: PState = { text: '', plain: '', math: [], visible: false, pieces: [], after: [], notes: [], flags: new Set(), breaksBefore: 0, breaksAfter: 0, ...(opts.mark ? { mark: opts.mark } : {}), ps };
  if (!ctx.rendered && ps.pageBreakBefore) st.breaksBefore++;
  const sect = kid(pPr, 'w:sectPr');
  if (!ctx.rendered && sect && attr(kid(sect, 'w:type'), 'val') !== 'continuous') st.breaksAfter++;
  const label = ps.num ? ctx.numbering.label(ps.num.id, ps.num.ilvl) : null;
  inline(ctx, st, kids(p));

  const rawTabs = st.plain.replace(/^\t+/, '');
  const tabCells = !st.math.length && rawTabs.includes('\t') ? rawTabs.split(/\t+/).map((c) => c.trim()) : undefined;
  let text = tidy(st.text);
  const plain = tidy(st.plain);
  let kind: BlockKind = 'paragraph';
  let level: number | undefined;
  let tex: string | undefined;
  let styled = false;
  // an equation alone in its paragraph — perhaps with its number, "(3)"
  if (st.math.length && (!plain || /^\(\s*[\w.]+\s*\)$/.test(plain))) {
    kind = 'equation';
    tex = st.math.join('; ');
    text = plain ? `${tex}   ${plain}` : tex;
    styled = true;
  } else if (ps.kind === 'title') {
    kind = 'title';
    styled = true;
  } else if (ps.kind === 'heading') {
    kind = 'heading';
    level = ps.level ?? 1;
    styled = true;
  } else if (ps.kind === 'caption') {
    kind = 'caption';
    styled = true;
  } else if (ps.kind === 'quote') {
    kind = 'quote';
    styled = true;
  } else if (ps.kind === 'code') {
    kind = 'code';
    styled = true;
  } else if (ps.kind === 'toc') {
    kind = 'list';
    level = Math.min(4, ps.level ?? 1);
    styled = true;
  } else if (label !== null && ps.num) {
    kind = 'list';
    level = Math.min(4, ps.num.ilvl + 1);
    styled = true;
  } else if (CAPTION.test(text) && text.split(/\s+/).length <= 60) {
    kind = 'caption';
  } else if (st.pieces.length && st.pieces.every((x) => x.mono)) {
    kind = 'code';
  } else if (LIST_MARK.test(text)) {
    kind = 'list';
    level = 1;
  }
  if (label && text) {
    text = `${label} ${text}`;
    ctx.generated.push(label);
  }
  const chars = st.pieces.reduce((n, x) => n + x.len, 0);
  const bold = chars > 0 && st.pieces.every((x) => x.bold);
  const large = chars > 0 && st.pieces.every((x) => x.size >= ctx.styles.defaultSize * 1.2);
  const words = text ? text.split(/\s+/).length : 0;
  const pseudo = kind === 'paragraph' && !opts.inTable && (bold || large) && words > 0 && words <= 12 && !/[.;,]$/.test(text);
  if (kind === 'code') text = st.text.replace(/\t/g, '    ').replace(/\s+$/, '');
  return {
    t: 'p',
    kind,
    styled,
    pseudo,
    large,
    text,
    ...(level ? { level } : {}),
    ...(tex ? { tex } : {}),
    flags: [...st.flags],
    after: st.after,
    notes: st.notes,
    breaksBefore: st.breaksBefore,
    breaksAfter: st.breaksAfter,
    ...(tabCells && tabCells.length >= 2 && kind === 'paragraph' ? { tabCells } : {}),
    bold,
  };
}

/** w:tr elements, through the content controls and custom XML that may wrap them. */
function rowNodes(tbl: XNode): XNode[] {
  const out: XNode[] = [];
  for (const c of kids(tbl)) {
    if (c.name === 'w:tr') out.push(c);
    else if (c.name === 'w:sdt') out.push(...rowNodes(kid(c, 'w:sdtContent') ?? c));
    else if (c.name === 'w:customXml' || c.name === 'w:ins' || c.name === 'w:moveTo') out.push(...rowNodes(c));
    else if (c.name === 'mc:AlternateContent') out.push(...alternate(c).filter((x) => x.name === 'w:tr'));
  }
  return out;
}

function cellNodes(tr: XNode): XNode[] {
  const out: XNode[] = [];
  for (const c of kids(tr)) {
    if (c.name === 'w:tc') out.push(c);
    else if (c.name === 'w:sdt') out.push(...cellNodes(kid(c, 'w:sdtContent') ?? c));
    else if (c.name === 'w:customXml') out.push(...cellNodes(c));
  }
  return out;
}

const itemText = (it: Item): string => (it.t === 'p' ? it.text : it.rows.map((r) => r.filter(Boolean).join(' | ')).join('; '));

function table(ctx: Ctx, tbl: XNode): Table {
  const tblPr = kid(tbl, 'w:tblPr');
  const caption = (attr(kid(tblPr, 'w:tblCaption'), 'val') ?? '').trim();
  const rows: string[][] = [];
  const cells: Item[][][] = [];
  const bold: boolean[] = [];
  let header = 0;
  let headerOpen = true;
  const after: After[] = [];
  const notes: Note[] = [];
  let breaks = 0;
  for (const tr of rowNodes(tbl)) {
    const trPr = kid(tr, 'w:trPr');
    if (on(kid(trPr, 'w:hidden'))) continue;
    const row: string[] = [];
    const rowItems: Item[][] = [];
    for (let i = 0; i < (num(kid(trPr, 'w:gridBefore')) ?? 0); i++) {
      row.push('');
      rowItems.push([]);
    }
    let allBold = true;
    let any = false;
    for (const tc of cellNodes(tr)) {
      const tcPr = kid(tc, 'w:tcPr');
      const span = Math.max(1, Math.min(60, num(kid(tcPr, 'w:gridSpan')) ?? 1));
      const vm = kid(tcPr, 'w:vMerge');
      const cont = (vm && attr(vm, 'val') !== 'restart') || (kid(tcPr, 'w:hMerge') && attr(kid(tcPr, 'w:hMerge'), 'val') !== 'restart');
      const items = blockLevel(ctx, kids(tc).filter((k) => k.name !== 'w:tcPr'), { inTable: true });
      for (const it of items) {
        after.push(...it.after);
        notes.push(...it.notes);
        breaks += it.t === 'p' ? it.breaksBefore + it.breaksAfter : it.breaks;
        if (it.t === 'p' && it.text) {
          any = true;
          if (!it.bold) allBold = false;
        }
      }
      row.push(cont ? '' : items.map(itemText).filter(Boolean).join('\n'));
      rowItems.push(cont ? [] : items);
      for (let i = 1; i < span; i++) {
        row.push('');
        rowItems.push([]);
      }
    }
    for (let i = 0; i < (num(kid(trPr, 'w:gridAfter')) ?? 0); i++) row.push('');
    if (headerOpen && on(kid(trPr, 'w:tblHeader'))) header++;
    else headerOpen = false;
    rows.push(row);
    cells.push(rowItems);
    bold.push(any && allBold);
  }
  const width = Math.max(0, ...rows.map((r) => r.length));
  for (const r of rows) while (r.length < width) r.push('');
  const head = header || guessHead(rows, bold[0], bold[1]);
  return { t: 'tbl', rows, head, ...(caption ? { caption } : {}), cells, after, notes, breaks };
}

function blockLevel(ctx: Ctx, nodes: XNode[], opts: { inTable?: boolean; mark?: string } = {}): Item[] {
  const out: Item[] = [];
  for (const n of nodes) {
    switch (n.name) {
      case 'w:p':
        out.push(para(ctx, n, opts));
        break;
      case 'w:tbl':
        if (ctx.depth < 6) out.push(table({ ...ctx, depth: ctx.depth + 1 }, n));
        break;
      case 'w:sdt':
        if (!placeholder(n)) out.push(...blockLevel(ctx, kids(kid(n, 'w:sdtContent')), opts));
        break;
      case 'w:customXml':
      case 'w:ins':
      case 'w:moveTo':
        out.push(...blockLevel(ctx, kids(n), opts));
        break;
      case 'mc:AlternateContent':
        out.push(...blockLevel(ctx, alternate(n), opts));
        break;
      case 'w:altChunk':
        ctx.notes.push({ id: 'unread', level: 'warn', says: 'Part of the document is a file embedded whole (an imported page or document); it was not read.' });
        break;
      default:
        break;
    }
  }
  return out;
}

/** Runs of paragraphs lined up with tabs, the same number of columns each, holding numbers: tables typed by hand. */
function tabTables(items: Item[]): Item[] {
  const out: Item[] = [];
  let i = 0;
  while (i < items.length) {
    const it = items[i];
    if (it.t !== 'p' || !it.tabCells) {
      out.push(it);
      i++;
      continue;
    }
    const width = it.tabCells.length;
    let j = i;
    while (j < items.length) {
      const x = items[j];
      if (x.t !== 'p' || !x.tabCells || x.tabCells.length !== width || x.after.length || x.breaksBefore || (j > i && items[j - 1].t === 'p' && (items[j - 1] as Para).breaksAfter)) break;
      j++;
    }
    const run = items.slice(i, j) as Para[];
    const rows = run.map((p) => p.tabCells!);
    const short = rows.every((r) => r.every((c) => c.length <= 40));
    const numeric = rows.slice(1).some((r) => r.some((c) => /\d/.test(c)));
    if ((run.length >= 3 || (run.length >= 2 && width >= 3)) && short && numeric) {
      out.push({ t: 'tbl', rows, head: guessHead(rows, run[0].bold, run[1]?.bold), after: [], notes: run.flatMap((p) => p.notes), breaks: run.reduce((n, p) => n + p.breaksAfter, 0) });
      i = j;
    } else {
      out.push(it);
      i++;
    }
  }
  return out;
}

// ── the independent walk, for the checks ────────────────────────────

/**
 * Every character of text the file holds where Word would show it, found by
 * walking the XML generically — not by the reader above. Whatever the reader
 * misses (an element it does not know) or reads twice is caught by comparing
 * the two (lib/docs/checks.ts).
 */
function rawWalk(ctx: Ctx, n: XNode, out: string[], seen: Set<XNode>, depth = 0, drawings = true): void {
  if (depth > 60) return;
  const walk = (x: XNode) => rawWalk(ctx, x, out, seen, depth + 1, drawings);
  for (const c of n.children) {
    if (typeof c === 'string') continue;
    switch (c.name) {
      case 'w:del':
      case 'w:moveFrom':
      case 'w:delText':
      case 'w:instrText':
      case 'w:delInstrText':
      case 'w:rPr':
      case 'w:pPr':
      case 'w:tblPr':
      case 'w:trPr':
      case 'w:tcPr':
      case 'w:sectPr':
      case 'w:object':
        break;
      case 'mc:AlternateContent':
        walk({ name: '#', attrs: {}, children: alternate(c) });
        break;
      case 'w:sdt':
        if (!placeholder(c)) walk(kid(c, 'w:sdtContent') ?? c);
        break;
      case 'w:tr':
        if (!on(kid(kid(c, 'w:trPr'), 'w:hidden'))) walk(c);
        break;
      case 'w:r': {
        const rPr = kid(c, 'w:rPr');
        if (hiddenRun(ctx.styles, rPr)) break;
        const va = attr(kid(rPr, 'w:vertAlign'), 'val');
        if (va === 'superscript' || va === 'subscript') {
          const t = kids(c, 'w:t').map(textOf).join('');
          out.push(/^\s*$/.test(t) ? t : (toScript(t, va === 'superscript' ? 'sup' : 'sub') ?? t));
          walk({ name: '#', attrs: {}, children: kids(c).filter((k) => k.name !== 'w:t') });
        } else walk(c);
        break;
      }
      case 'w:t':
        out.push(textOf(c));
        break;
      case 'm:t':
        out.push(` ${textOf(c)} `);
        break;
      case 'w:tab':
      case 'w:ptab':
        out.push('\t');
        break;
      case 'w:br':
      case 'w:cr':
        out.push('\n');
        break;
      case 'w:noBreakHyphen':
        out.push('‑');
        break;
      case 'w:sym':
        out.push(symbolChar(attr(c, 'font') ?? '', attr(c, 'char') ?? '') ?? '');
        break;
      case 'w:p':
      case 'w:tc':
        walk(c);
        out.push('\n');
        break;
      case 'w:footnoteReference':
      case 'w:endnoteReference':
      case 'w:commentReference': {
        const id = attr(c, 'id') ?? '';
        const node = c.name === 'w:footnoteReference' ? ctx.footnotes.get(id) : c.name === 'w:endnoteReference' ? ctx.endnotes.get(id) : ctx.comments.get(id)?.node;
        if (node && !seen.has(node)) {
          seen.add(node);
          out.push('\n');
          walk(node);
          out.push('\n');
        }
        break;
      }
      case 'w:drawing': {
        if (!drawings) break;
        const container = kid(c, 'wp:inline') ?? kid(c, 'wp:anchor');
        const info = pictureInfo(kid(container, 'wp:docPr'));
        if (info.hidden) break;
        const gd = first(container, 'a:graphicData');
        const ref = first(gd, 'c:chart') ?? first(gd, 'cx:chart');
        const dm = first(gd, 'dgm:relIds');
        const pics = findIn(container, 'pic:pic');
        // alt text as the reader takes it: the drawing's own, else each picture's
        if (ref || dm || !pics.length) out.push('\n', info.alt ?? '', '\n', info.title ?? '', '\n');
        pics.forEach((pic, i) => {
          const own = pictureInfo(first(pic, 'pic:cNvPr'));
          if (info.decorative || own.decorative) return;
          out.push('\n', (i === 0 ? info.alt : undefined) ?? own.alt ?? '', '\n', (i === 0 ? info.title : undefined) ?? own.title ?? '', '\n');
        });
        const rel = ctx.rels.get(relId(ref) ?? attr(dm, 'dm') ?? '');
        const xml = rel && !rel.external ? ctx.parts.text(rel.target) : null;
        if (xml && ref) out.push('\n', chartRawText(xml), '\n');
        if (xml && dm) out.push('\n', diagramRawText(xml), '\n');
        walk(c);
        break;
      }
      case 'w:pict':
        if (drawings) walk(c);
        break;
      case 'v:imagedata':
        out.push('\n', attr(c, 'title') ?? '', '\n');
        break;
      default:
        walk(c);
    }
  }
}

// ── the reader ──────────────────────────────────────────────────────

function notesOf(parts: OfficeParts, part: string, el: string): Map<string, XNode> {
  const out = new Map<string, XNode>();
  const xml = parts.text(part);
  if (!xml) return out;
  const root = parseXml(xml);
  for (const n of kids(first(root, el === 'w:footnote' ? 'w:footnotes' : 'w:endnotes') ?? root, el)) {
    const type = attr(n, 'type');
    if (type && type !== 'normal') continue;
    out.set(attr(n, 'id') ?? '', n);
  }
  return out;
}

/** A Word document into a SourceDoc. */
export function readDocx(parts: OfficeParts, meta: { id: string; name: string }): ReaderOut {
  // the main part, from the package's own relationships
  let main = 'word/document.xml';
  const rootRels = parts.text('_rels/.rels');
  if (rootRels) {
    for (const r of kids(first(parseXml(rootRels), 'Relationships'), 'Relationship')) {
      if (/officeDocument$/.test(r.attrs.Type ?? '') && r.attrs.Target) main = r.attrs.Target.replace(/^\//, '');
    }
  }
  const xml = parts.text(main);
  if (xml === null) throw new Error('it has no document inside it');
  const rels = relsOf(parts, main);
  // a part the relationships name, or — in a package written without them — the part by its usual name
  const USUAL: [RegExp, string][] = [[/^styles$/, 'word/styles.xml'], [/^numbering$/, 'word/numbering.xml'], [/^footnotes$/, 'word/footnotes.xml'], [/^endnotes$/, 'word/endnotes.xml'], [/^comments$/, 'word/comments.xml']];
  const relOf = (type: RegExp) => [...rels.values()].find((r) => type.test(r.type) && !r.external)?.target ?? (rels.size ? undefined : USUAL.find(([t, n]) => t.source === type.source && parts.text(n) !== null)?.[1]);
  const root = parseXml(xml);
  const body = first(root, 'w:body');
  if (!body) throw new Error('it has no document inside it');

  const comments = new Map<string, { author: string; node: XNode }>();
  const cxml = relOf(/^comments$/) ? parts.text(relOf(/^comments$/)!) : null;
  if (cxml) for (const c of kids(first(parseXml(cxml), 'w:comments'), 'w:comment')) comments.set(attr(c, 'id') ?? '', { author: attr(c, 'author') ?? '', node: c });

  const ctx: Ctx = {
    parts,
    styles: new Styles(relOf(/^styles$/) ? parts.text(relOf(/^styles$/)!) : null),
    numbering: new Numbering(relOf(/^numbering$/) ? parts.text(relOf(/^numbering$/)!) : null),
    rels,
    rendered: xml.includes('lastRenderedPageBreak'),
    footnotes: relOf(/^footnotes$/) ? notesOf(parts, relOf(/^footnotes$/)!, 'w:footnote') : new Map(),
    endnotes: relOf(/^endnotes$/) ? notesOf(parts, relOf(/^endnotes$/)!, 'w:endnote') : new Map(),
    comments,
    counters: { foot: 0, end: 0 },
    generated: [],
    embeddedRaw: [],
    notes: [],
    depth: 0,
  };

  const items = tabTables(blockLevel(ctx, kids(body)));

  // headers and footers: every part a section refers to, once each
  const hf = { header: [] as string[], footer: [] as string[] };
  for (const sect of [...findSect(body), ...kids(body, 'w:sectPr')]) {
    for (const ref of [...kids(sect, 'w:headerReference'), ...kids(sect, 'w:footerReference')]) {
      const rel = rels.get(relId(ref) ?? '');
      if (rel && !rel.external && !hf.header.includes(rel.target) && !hf.footer.includes(rel.target)) (ref.name === 'w:headerReference' ? hf.header : hf.footer).push(rel.target);
    }
  }

  const b = new DocBuilder('structured');
  const media: { figure: number; part: string }[] = [];
  let page = 1;
  let footQueue: Note[] = [];
  const endQueue: Note[] = [];
  let lastStyledHeading = 0;
  let seenBody = false;
  let stopped = false;

  const emitNote = (n: Note) => {
    const node = (n.kind === 'foot' ? ctx.footnotes : ctx.endnotes).get(n.id);
    if (!node) return;
    const its = blockLevel({ ...ctx, depth: ctx.depth + 1 }, kids(node), { mark: n.mark });
    const text = its.map(itemText).filter(Boolean).join('\n');
    if (!text) return;
    const withMark = text.startsWith(n.mark) ? text : `${n.mark} ${text}`.trim();
    if (n.mark) ctx.generated.push(n.mark);
    b.block({ page, kind: 'footnote', text: withMark });
  };
  const newPage = () => {
    for (const n of footQueue) emitNote(n);
    footQueue = [];
    page++;
  };

  const figureText = (a: Extract<After, { t: 'figure' }>) => [a.chart?.title, ...(a.chart?.axes ?? []), a.alt, a.title].filter(Boolean).join('\n');
  const emitAfter = (a: After) => {
    if (a.t === 'box') return emitItems(a.items);
    if (a.t === 'comment') {
      const c = ctx.comments.get(a.id);
      if (!c) return;
      const text = blockLevel({ ...ctx, depth: ctx.depth + 1 }, kids(c.node)).map(itemText).filter(Boolean).join(' ');
      if (!text) return;
      const label = `[Comment${c.author ? ` — ${c.author}` : ''}]`;
      ctx.generated.push(label);
      b.block({ page, kind: 'note', text: `${label} ${text}` });
      return;
    }
    if (a.t === 'workbook') {
      const r = embeddedWorkbook(a.parts, b, page, ctx.notes);
      if (r) ctx.embeddedRaw.push(r.raw);
      else ctx.notes.push({ id: 'unread', level: 'warn', says: 'A spreadsheet embedded in the document could not be read.', pages: [page] });
      return;
    }
    if (a.kind === 'chart' && a.chart) {
      const t = a.chart.rows.length > 1 ? b.table({ page, rows: a.chart.rows, head: a.chart.head, ...(a.chart.title ? { caption: a.chart.title } : {}) }) : undefined;
      b.figure({ page, kind: 'chart', chart: a.chart.kind, ...(a.chart.title ? { caption: a.chart.title } : {}), ...(a.alt ? { alt: a.alt } : {}), ...(t !== undefined ? { table: t } : {}) }, figureText(a));
      if (a.chart.empty) ctx.notes.push({ id: 'tables', level: 'warn', says: 'A chart holds no numbers of its own; only its picture is in the file.', pages: [page] });
      return;
    }
    const i = b.figure({ page, kind: a.kind, ...(a.alt ? { alt: a.alt } : {}) }, figureText(a), a.flags);
    if (a.part) media.push({ figure: i, part: a.part });
    if (a.kind === 'diagram') for (const d of a.diagram ?? []) b.block({ page, kind: 'list', level: d.level, text: d.text });
  };

  const emitPara = (p: Para) => {
    for (let i = 0; i < p.breaksBefore; i++) newPage();
    if (p.text) {
      let kind = p.kind;
      let level = p.level;
      if (kind === 'heading' && p.styled) lastStyledHeading = level ?? 1;
      if (p.pseudo) {
        // a heading made by hand: large type before any text is the title; bold lines head sections
        if (!seenBody && page === 1 && p.large && !b.blocks.some((x) => x.kind === 'title')) kind = 'title';
        else {
          kind = 'heading';
          level = Math.min(6, (lastStyledHeading || 0) + 1);
        }
      }
      if (kind === 'paragraph' || kind === 'list') seenBody = true;
      const last = b.blocks[b.blocks.length - 1];
      if (kind === 'code' && last?.kind === 'code' && last.page === page) {
        // a program is one block, not a block per line
        last.text += `\n${p.text}`;
        b.chars += p.text.length + 1;
      } else b.block({ page, kind, text: p.text, ...(level ? { level } : {}), ...(p.tex ? { tex: p.tex } : {}), ...(p.flags.length ? { flags: p.flags } : {}) });
    }
    for (const a of p.after) emitAfter(a);
    footQueue.push(...p.notes.filter((n) => n.kind === 'foot'));
    endQueue.push(...p.notes.filter((n) => n.kind === 'end'));
    for (let i = 0; i < p.breaksAfter; i++) newPage();
  };

  const emitTable = (t: Table) => {
    if (t.cells && isLayoutTable(t.rows)) {
      // a table used to lay out a page: what its cells hold, row by row
      for (const row of t.cells) for (const cell of row) emitItems(cell);
      return;
    }
    seenBody = true;
    b.table({ page, rows: t.rows, head: t.head, ...(t.caption ? { caption: t.caption } : {}) });
    for (const a of t.after) emitAfter(a);
    footQueue.push(...t.notes.filter((n) => n.kind === 'foot'));
    endQueue.push(...t.notes.filter((n) => n.kind === 'end'));
    for (let i = 0; i < t.breaks; i++) newPage();
  };

  let midPage = false;
  function emitItems(list: Item[]) {
    for (const it of list) {
      if (stopped) return;
      // a long document stops at a page break once enough is read — or anywhere, well past it
      if ((b.chars > BUDGET && it.t === 'p' && it.breaksBefore) || b.chars > BUDGET * 1.25) {
        stopped = true;
        midPage = !(it.t === 'p' && it.breaksBefore);
        return;
      }
      if (it.t === 'p') emitPara(it);
      else emitTable(it);
    }
  }

  // headers first, on the first page
  for (const part of hf.header) {
    const hx = parts.text(part);
    if (!hx) continue;
    const hctx = { ...ctx, rels: relsOf(parts, part) };
    for (const it of blockLevel(hctx, kids(first(parseXml(hx), 'w:hdr')))) {
      const t = itemText(it);
      if (t) b.block({ page: 1, kind: 'header', text: t });
    }
  }
  emitItems(items);
  const lastPage = page;
  if (!stopped) {
    for (const n of footQueue) emitNote(n);
    footQueue = [];
    for (const n of endQueue) emitNote(n);
    for (const part of hf.footer) {
      const fx = parts.text(part);
      if (!fx) continue;
      const fctx = { ...ctx, rels: relsOf(parts, part) };
      for (const it of blockLevel(fctx, kids(first(parseXml(fx), 'w:ftr')))) {
        const t = itemText(it);
        if (t) b.block({ page, kind: 'footer', text: t });
      }
    }
  }

  // the independent walk, over exactly what the reading covered
  const raw: string[] = [];
  const seen = new Set<XNode>();
  for (const part of hf.header) {
    const hx = parts.text(part);
    if (hx) rawWalk({ ...ctx, rels: relsOf(parts, part) }, parseXml(hx), raw, seen, 0, false);
  }
  let unread: { from: number; to: number } | undefined;
  if (stopped) {
    // pages, as far as the file records them: Word's last rendering, or its own breaks
    const breaks = ctx.rendered ? (xml.match(/<w:lastRenderedPageBreak\b/g) ?? []).length : (xml.match(/<w:br\b[^>]*w:type="page"/g) ?? []).length + (xml.match(/<w:pageBreakBefore\b/g) ?? []).length;
    const total = Math.max(lastPage + 1, breaks + 1);
    ctx.notes.push({ id: 'unread', level: 'warn', says: `The document is longer than Socria reads at once: it was read to page ${lastPage}${midPage ? ' (part of it)' : ''}.` });
    unread = { from: lastPage + 1, to: total };
  } else {
    rawWalk(ctx, body, raw, seen);
    for (const part of hf.footer) {
      const fx = parts.text(part);
      if (fx) rawWalk({ ...ctx, rels: relsOf(parts, part) }, parseXml(fx), raw, seen, 0, false);
    }
  }
  const objects = b.figures.filter((f) => f.kind === 'equation').length;
  if (objects) ctx.notes.push({ id: 'equations', level: 'warn', says: `${objects} equation${objects === 1 ? ' is' : 's are'} stored as an embedded Equation Editor or MathType object, which cannot be read as text — ${objects === 1 ? 'it is' : 'they are'} marked where ${objects === 1 ? 'it sits' : 'they sit'}.` });

  const doc = b.build({ id: meta.id, name: meta.name, format: 'docx', pageCount: Math.max(1, b.lastPage), title: coreTitle(parts), ...(unread ? { unread } : {}) });
  const out: ReaderOut = {
    doc,
    raw: stopped ? [] : [{ n: 0, text: [...raw, '\n', ...ctx.generated.map((g) => ` ${g} `), '\n', ...ctx.embeddedRaw].join('') }],
    notes: ctx.notes,
    media: media
      .map((m) => ({ figure: `f${m.figure + 1}`, page: doc.figures[m.figure]?.page ?? 1, part: m.part, mime: mimeOf(m.part) }))
      .filter((m): m is MediaRef => visible(m.mime)),
  };
  return out;
}

/** Section properties held in paragraphs (a section break), for their headers and footers. */
function findSect(body: XNode): XNode[] {
  const out: XNode[] = [];
  for (const p of kids(body, 'w:p')) {
    const s = kid(kid(p, 'w:pPr'), 'w:sectPr');
    if (s) out.push(s);
  }
  return out;
}
