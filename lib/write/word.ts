// lib/write/word.ts — a Word document read into the writing, in the browser.
//
// The file never leaves the device: the zip is opened here (lib/write/zip.ts)
// and its XML read here. What comes in is what a writer means by the document
// — its title, headings, paragraphs, quotes, bulleted and numbered lists,
// code, tables, pictures and page breaks; bold, italic, underline,
// strikethrough, superscript, subscript, fonts, sizes, colours, highlights and
// links; alignment, indentation and spacing; and its page — with Word's
// styles, theme fonts and numbering resolved the way Word resolves them.
// Formatting a paragraph's style gives it (a heading's size, a quote's
// italics) is the block's look, not marks on its words; what the writer set
// on the words themselves becomes marks. What cannot come in (footnotes,
// comments, text boxes, a picture in a format a browser cannot show, cells
// merged across rows) is counted and said, never silently dropped.
//
// PURE given the bytes.

import { attr, isNode, parseXml, type XNode } from '@/lib/docs/xml';
import {
  ALIGNS,
  emptyCell,
  fontValue,
  lineSpacing,
  makeImage,
  makePageBreak,
  makeRule,
  normalizeMarks,
  PAPER,
  points,
  sanitizePage,
  sizeValue,
  tableFrom,
  uid,
  type Align,
  type Block,
  type BlockType,
  type Mark,
  type PageSetup,
  type PaperSize,
} from './doc';
import { bytesToDataUrl, imageSize, sniffImage } from './media';
import { unzipSome, ZipError } from './zip';

export interface WordReading {
  /** the paragraph styled as the document's Title, if there is one */
  title: string;
  blocks: Block[];
  /** what was left out, said plainly: “2 footnotes were left out.” */
  notes: string[];
  /** the paper, orientation and margins it was set on */
  page?: PageSetup;
  /** its own font and size, under everything */
  font?: string;
  size?: number;
}

const local = (n: XNode) => {
  const k = n.name.indexOf(':');
  return k < 0 ? n.name : n.name.slice(k + 1);
};
const kidL = (n: XNode | undefined, name: string) => (n ? n.children.find((c): c is XNode => isNode(c) && local(c) === name) : undefined);
const kidsL = (n: XNode | undefined, name?: string) => (n ? n.children.filter((c): c is XNode => isNode(c) && (name === undefined || local(c) === name)) : []);
/** Whether anything under a node has this local name. */
const hasL = (n: XNode, name: string): boolean => n.children.some((c) => isNode(c) && (local(c) === name || hasL(c, name)));
/** The first node under this one with a local name. */
function findL(n: XNode | undefined, name: string): XNode | undefined {
  if (!n) return undefined;
  for (const c of n.children) {
    if (!isNode(c)) continue;
    if (local(c) === name) return c;
    const f = findL(c, name);
    if (f) return f;
  }
  return undefined;
}

/** A toggle property as Word writes it: present means on, unless its val says otherwise. */
function onOff(n: XNode | undefined): boolean | undefined {
  if (!n) return undefined;
  const v = attr(n, 'val');
  return v === undefined ? true : !/^(0|false|off|none)$/i.test(v);
}

// ── run and paragraph properties ────────────────────────────────────

/** What formatting a run has, as Word's properties say it. Undefined is "not said here". */
interface RunProps {
  b?: boolean;
  i?: boolean;
  u?: boolean;
  s?: boolean;
  vert?: 'sup' | 'sub' | null;
  font?: string;
  size?: number;
  color?: string | null;
  bg?: string | null;
  hidden?: boolean;
}

const HIGHLIGHT_HEX: Record<string, string> = {
  yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff', blue: '#0000ff', red: '#ff0000', darkblue: '#000080', darkcyan: '#008080',
  darkgreen: '#008000', darkmagenta: '#800080', darkred: '#800000', darkyellow: '#808000', darkgray: '#808080', lightgray: '#c0c0c0', black: '#000000', white: '#ffffff',
};

interface Theme {
  major?: string;
  minor?: string;
}

function readTheme(xml: string | undefined): Theme {
  if (!xml) return {};
  const root = parseXml(xml);
  const latin = (which: string) => attr(kidL(findL(root, which), 'latin'), 'typeface') || undefined;
  return { major: latin('majorFont'), minor: latin('minorFont') };
}

function fontOf(rFonts: XNode | undefined, theme: Theme): string | undefined {
  if (!rFonts) return undefined;
  const direct = attr(rFonts, 'ascii') ?? attr(rFonts, 'hAnsi');
  if (direct) return direct;
  const th = attr(rFonts, 'asciiTheme') ?? attr(rFonts, 'hAnsiTheme');
  if (th) return /^major/i.test(th) ? theme.major : theme.minor;
  return undefined;
}

function readRPr(rPr: XNode | undefined, theme: Theme): RunProps {
  if (!rPr) return {};
  const out: RunProps = {};
  const b = onOff(kidL(rPr, 'b'));
  if (b !== undefined) out.b = b;
  const i = onOff(kidL(rPr, 'i'));
  if (i !== undefined) out.i = i;
  const u = kidL(rPr, 'u');
  if (u) out.u = attr(u, 'val') !== 'none';
  const s = onOff(kidL(rPr, 'strike')) ?? onOff(kidL(rPr, 'dstrike'));
  if (s !== undefined) out.s = s;
  const va = attr(kidL(rPr, 'vertAlign'), 'val');
  if (va) out.vert = va === 'superscript' ? 'sup' : va === 'subscript' ? 'sub' : null;
  const font = fontOf(kidL(rPr, 'rFonts'), theme);
  if (font) out.font = font;
  const sz = Number(attr(kidL(rPr, 'sz'), 'val'));
  if (sz > 0) out.size = sz / 2;
  const color = attr(kidL(rPr, 'color'), 'val');
  if (color) out.color = /^[0-9a-f]{6}$/i.test(color) && color.toLowerCase() !== '000000' ? `#${color.toLowerCase()}` : null;
  const hl = attr(kidL(rPr, 'highlight'), 'val');
  if (hl) out.bg = HIGHLIGHT_HEX[hl.toLowerCase()] ?? null;
  const shd = attr(kidL(rPr, 'shd'), 'fill');
  if (shd && out.bg === undefined) out.bg = /^[0-9a-f]{6}$/i.test(shd) && !/^ffffff$/i.test(shd) ? `#${shd.toLowerCase()}` : null;
  const vanish = onOff(kidL(rPr, 'vanish'));
  if (vanish !== undefined) out.hidden = vanish;
  return out;
}

/** Later layers say over earlier ones; a layer that says nothing about a property leaves it. */
function merge(...layers: RunProps[]): RunProps {
  const out: RunProps = {};
  for (const l of layers) for (const [k, v] of Object.entries(l) as [keyof RunProps, never][]) if (v !== undefined) out[k] = v;
  return out;
}

interface ParaProps {
  jc?: string;
  before?: number;
  after?: number;
  line?: number;
  lineRule?: string;
  indLeft?: number;
  pageBreakBefore?: boolean;
}

function readPPr(pPr: XNode | undefined): ParaProps {
  if (!pPr) return {};
  const out: ParaProps = {};
  const jc = attr(kidL(pPr, 'jc'), 'val');
  if (jc) out.jc = jc;
  const sp = kidL(pPr, 'spacing');
  if (sp) {
    const before = attr(sp, 'before');
    const after = attr(sp, 'after');
    const line = attr(sp, 'line');
    if (before !== undefined && /^\d+$/.test(before)) out.before = Number(before);
    if (after !== undefined && /^\d+$/.test(after)) out.after = Number(after);
    if (line !== undefined && /^\d+$/.test(line)) {
      out.line = Number(line);
      out.lineRule = attr(sp, 'lineRule') ?? 'auto';
    }
  }
  const ind = kidL(pPr, 'ind');
  const left = ind ? attr(ind, 'left') ?? attr(ind, 'start') : undefined;
  if (left !== undefined && /^-?\d+$/.test(left)) out.indLeft = Number(left);
  const pbb = onOff(kidL(pPr, 'pageBreakBefore'));
  if (pbb !== undefined) out.pageBreakBefore = pbb;
  return out;
}

const mergeP = (...layers: ParaProps[]): ParaProps => Object.assign({}, ...layers.map((l) => Object.fromEntries(Object.entries(l).filter(([, v]) => v !== undefined))));

interface StyleInfo {
  name: string;
  basedOn?: string;
  type: string;
  outline?: number;
  numId?: string;
  ilvl?: number;
  run: RunProps;
  para: ParaProps;
}

interface Styles {
  map: Map<string, StyleInfo>;
  defaults: RunProps;
  /** the paragraph style used where a paragraph names none */
  normal?: string;
}

function readStyles(xml: string | undefined, theme: Theme): Styles {
  const map = new Map<string, StyleInfo>();
  if (!xml) return { map, defaults: {} };
  const root = parseXml(xml);
  const styles = kidL(root, 'styles');
  const defaults = readRPr(kidL(kidL(kidL(styles, 'docDefaults'), 'rPrDefault'), 'rPr'), theme);
  let normal: string | undefined;
  for (const s of kidsL(styles, 'style')) {
    const id = attr(s, 'styleId');
    if (!id) continue;
    const pPr = kidL(s, 'pPr');
    const numPr = kidL(pPr, 'numPr');
    const outline = attr(kidL(pPr, 'outlineLvl'), 'val');
    const type = attr(s, 'type') ?? 'paragraph';
    const def = attr(s, 'default');
    if (type === 'paragraph' && def && /^(1|true|on)$/i.test(def)) normal = id;
    map.set(id, {
      name: (attr(kidL(s, 'name'), 'val') ?? id).toLowerCase(),
      basedOn: attr(kidL(s, 'basedOn'), 'val'),
      type,
      ...(outline !== undefined ? { outline: Number(outline) } : {}),
      ...(numPr ? { numId: attr(kidL(numPr, 'numId'), 'val'), ilvl: Number(attr(kidL(numPr, 'ilvl'), 'val') ?? 0) } : {}),
      run: readRPr(kidL(s, 'rPr'), theme),
      para: readPPr(pPr),
    });
  }
  return { map, defaults, normal };
}

/** A style with what it inherits, to a few levels — as Word reads basedOn. Nearest first. */
function resolve(styles: Styles, id: string | undefined): StyleInfo[] {
  const chain: StyleInfo[] = [];
  let at = id;
  for (let k = 0; at && k < 12; k++) {
    const s = styles.map.get(at);
    if (!s || chain.includes(s)) break;
    chain.push(s);
    at = s.basedOn;
  }
  return chain;
}

/** A chain's run properties, the base style first, so the nearest says last. */
const chainRun = (chain: StyleInfo[]) => merge(...[...chain].reverse().map((s) => s.run));
const chainPara = (chain: StyleInfo[]) => mergeP(...[...chain].reverse().map((s) => s.para));

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

/** The document's relationships: id → target, and whether it is outside the package. */
function readRels(xml: string | undefined): Map<string, { target: string; external: boolean; type: string }> {
  const out = new Map<string, { target: string; external: boolean; type: string }>();
  if (!xml) return out;
  for (const r of kidsL(kidL(parseXml(xml), 'Relationships'), 'Relationship')) {
    const id = attr(r, 'Id');
    const target = attr(r, 'Target');
    if (id && target) out.set(id, { target, external: attr(r, 'TargetMode') === 'External', type: (attr(r, 'Type') ?? '').split('/').pop() ?? '' });
  }
  return out;
}

interface Counts {
  pictures: number;
  unreadable: number;
  footnotes: number;
  boxes: number;
  merged: number;
}

// ── a paragraph's runs ──────────────────────────────────────────────

/** What a paragraph holds, in order: words with their marks, page breaks, pictures. */
type Piece = { k: 'text'; text: string; marks: Mark[] } | { k: 'pb' } | { k: 'img'; src: string; alt: string; iw?: number; ih?: number; wIn?: number };

interface ReadCtx {
  styles: Styles;
  theme: Theme;
  rels: Map<string, { target: string; external: boolean; type: string }>;
  media: Map<string, Uint8Array>;
  counts: Counts;
  /** what the document's words are in when nothing is said: docDefaults and Normal */
  base: RunProps;
}

/** A link's address as Word stores it: a relationship's external target. */
function linkOf(id: string | undefined, ctx: ReadCtx): string | undefined {
  if (!id) return undefined;
  const r = ctx.rels.get(id);
  return r && r.external && /^(https?:|mailto:|tel:)/i.test(r.target) ? r.target : undefined;
}

function pictureOf(n: XNode, ctx: ReadCtx): Piece | null {
  const blip = findL(n, 'blip');
  const imagedata = findL(n, 'imagedata');
  const rid = blip ? attr(blip, 'embed') : imagedata ? attr(imagedata, 'id') : undefined;
  const rel = rid ? ctx.rels.get(rid) : undefined;
  if (!rel || rel.external) return null;
  const path = rel.target.startsWith('/') ? rel.target.slice(1) : `word/${rel.target.replace(/^\.\//, '')}`;
  const bytes = ctx.media.get(path);
  if (!bytes) return null;
  const type = sniffImage(bytes);
  if (!type) {
    ctx.counts.unreadable++;
    return { k: 'text', text: '', marks: [] };
  }
  const size = imageSize(bytes, type);
  const ext = findL(n, 'extent');
  const cx = Number(attr(ext, 'cx'));
  const docPr = findL(n, 'docPr') ?? findL(n, 'cNvPr');
  const alt = (attr(docPr, 'descr') ?? attr(docPr, 'title') ?? '').trim();
  return { k: 'img', src: bytesToDataUrl(bytes, type), alt, ...(size ? { iw: size.w, ih: size.h } : {}), ...(cx > 0 ? { wIn: cx / 914400 } : {}) };
}

/**
 * A paragraph's pieces from its runs — tracked deletions and field codes left
 * out, a field's shown result kept, a HYPERLINK field read as the link it is.
 * `paraRun` is what the paragraph's own style says about its words; `headingLook`
 * is whether that style's look belongs to the block (a heading) rather than to
 * the words.
 */
function readRuns(p: XNode, ctx: ReadCtx, paraRun: RunProps, headingLook: boolean): Piece[] {
  const pieces: Piece[] = [];
  let cur: { text: string; marks: Mark[] } = { text: '', marks: [] };
  const flush = () => {
    if (cur.text) pieces.push({ k: 'text', ...cur });
    cur = { text: '', marks: [] };
  };
  // a field's instruction (between begin and separate) is code, not words; its result is shown
  let showing = true;
  const fieldState: { showing: boolean; instr: string; href?: string }[] = [];
  let fieldHref: string | undefined;
  const add = (s: string, props: RunProps, href: string | undefined) => {
    if (!s || !showing) return;
    const at = cur.text.length;
    cur.text += s;
    const e = at + s.length;
    const put = (t: Mark['t'], v?: string) => {
      const last = [...cur.marks].reverse().find((m) => m.t === t);
      if (last && last.e === at && last.v === v) last.e = e;
      else cur.marks.push({ s: at, e, t, ...(v ? { v } : {}) });
    };
    if (props.b) put('b');
    if (props.i) put('i');
    if (props.u && !href) put('u');
    if (props.s) put('s');
    if (props.vert === 'sup') put('sup');
    if (props.vert === 'sub') put('sub');
    if (href) put('a', href);
    const base = ctx.base;
    if (props.font && props.font !== base.font) {
      const f = fontValue(props.font);
      if (f) put('font', f);
    }
    if (props.size && props.size !== base.size && !headingLook) {
      const z = sizeValue(props.size);
      if (z) put('size', z);
    }
    if (props.color && props.color !== base.color && !href) put('color', props.color);
    if (props.bg) put('bg', props.bg);
  };
  const run = (r: XNode, href: string | undefined) => {
    const rPr = kidL(r, 'rPr');
    const charStyle = resolve(ctx.styles, attr(kidL(rPr, 'rStyle'), 'val'));
    // a link's own look (Word's Hyperlink style) is the link, not colour and underline the writer chose
    const linkLook = charStyle.some((s) => s.name === 'hyperlink' || s.name === 'internet link');
    const charProps = linkLook ? {} : chainRun(charStyle);
    const direct = readRPr(rPr, ctx.theme);
    const props = headingLook ? merge(ctx.base, charProps, direct) : merge(ctx.base, paraRun, charProps, direct);
    // Word's built-in character styles, by name, when they carry no properties of their own
    const names = charStyle.map((s) => s.name);
    if (props.b === undefined && names.includes('strong')) props.b = true;
    if (props.i === undefined && names.some((x) => x === 'emphasis' || x === 'subtle emphasis' || x === 'intense emphasis')) props.i = true;
    if (props.hidden) return;
    const link = href ?? fieldHref;
    for (const c of r.children) {
      if (!isNode(c)) continue;
      const name = local(c);
      if (name === 'fldChar') {
        const t = attr(c, 'fldCharType');
        if (t === 'begin') {
          fieldState.push({ showing, instr: '' });
          showing = false;
        } else if (t === 'separate') {
          const top = fieldState[fieldState.length - 1];
          showing = top ? top.showing : true;
          const m = top ? /HYPERLINK\s+"([^"]+)"/i.exec(top.instr) : null;
          if (top && m && /^(https?:|mailto:|tel:)/i.test(m[1])) {
            top.href = m[1];
            fieldHref = m[1];
          }
        } else if (t === 'end') {
          const top = fieldState.pop();
          showing = top ? top.showing : true;
          if (top?.href) fieldHref = fieldState.map((f) => f.href).filter(Boolean).pop();
        }
        continue;
      }
      if (name === 'instrText') {
        const top = fieldState[fieldState.length - 1];
        if (top) top.instr += c.children.filter((x): x is string => !isNode(x)).join('');
        continue;
      }
      if (name === 't') add(c.children.filter((x): x is string => !isNode(x)).join(''), props, link);
      else if (name === 'tab' || name === 'ptab') add('\t', props, link);
      else if (name === 'br' || name === 'cr') {
        const type = attr(c, 'type');
        if (type === 'page') {
          flush();
          pieces.push({ k: 'pb' });
        } else if (type !== 'column') add('\n', props, link);
      } else if (name === 'noBreakHyphen') add('-', props, link);
      else if (name === 'sym') {
        const ch = attr(c, 'char');
        const cp = ch ? parseInt(ch, 16) : NaN;
        // symbol-font glyphs live in the private-use area; their meaning is not text
        if (Number.isFinite(cp) && cp < 0xe000) add(String.fromCharCode(cp), props, link);
      } else if (name === 'drawing' || name === 'pict' || name === 'object' || name === 'AlternateContent') {
        if (hasL(c, 'txbxContent')) {
          ctx.counts.boxes++;
          continue;
        }
        const pic = pictureOf(c, ctx);
        if (pic && pic.k === 'img') {
          flush();
          pieces.push(pic);
        } else if (!pic) ctx.counts.pictures++;
      } else if (name === 'footnoteReference' || name === 'endnoteReference') ctx.counts.footnotes++;
    }
  };
  const walk = (n: XNode, href: string | undefined) => {
    for (const c of n.children) {
      if (!isNode(c)) continue;
      const name = local(c);
      if (name === 'del' || name === 'moveFrom' || name === 'pPr') continue;
      if (name === 'r') {
        run(c, href);
        continue;
      }
      if (name === 'hyperlink') {
        walk(c, linkOf(attr(c, 'id'), ctx) ?? href);
        continue;
      }
      if (name === 'fldSimple') {
        const m = /HYPERLINK\s+"([^"]+)"/i.exec(attr(c, 'instr') ?? '');
        walk(c, m && /^(https?:|mailto:|tel:)/i.test(m[1]) ? m[1] : href);
        continue;
      }
      if (name === 'ins' || name === 'moveTo' || name === 'smartTag' || name === 'customXml' || name === 'sdt' || name === 'sdtContent' || name === 'bdo' || name === 'dir') walk(c, href);
    }
  };
  walk(p, undefined);
  flush();
  return pieces;
}

function tidy(text: string, marks: Mark[]): { text: string; marks: Mark[] } {
  const lead = text.length - text.replace(/^[ \n]+/, '').length;
  const body = text.slice(lead).replace(/[ \n]+$/, '');
  return { text: body.replace(/\u00a0/g, ' '), marks: marks.map((m) => ({ ...m, s: m.s - lead, e: m.e - lead })) };
}

const JC_ALIGN: Record<string, Align> = { center: 'center', right: 'right', end: 'right', both: 'justify', distribute: 'justify' };

/** A paragraph's settings as the writing keeps them: alignment always; spacing and indentation the writer set on it. */
function paraAttrs(direct: ParaProps, chain: ParaProps, t: BlockType): Partial<Block> {
  const out: Partial<Block> = {};
  const jc = direct.jc ?? chain.jc;
  const align = jc ? JC_ALIGN[jc] : undefined;
  if (align && (ALIGNS as readonly string[]).includes(align) && t !== 'code') out.align = align;
  if (direct.before !== undefined) out.sb = points(direct.before / 20);
  if (direct.after !== undefined) out.sa = points(direct.after / 20);
  const line = direct.line ?? chain.line;
  const rule = direct.line !== undefined ? direct.lineRule : chain.lineRule;
  if (line && (rule ?? 'auto') === 'auto') {
    const lh = lineSpacing(line / 240);
    // single and its near neighbours are the page's own spacing, unless set on the paragraph itself
    if (direct.line !== undefined ? Math.abs(lh - 1) > 0.01 : lh >= 1.3) out.lh = lh;
  }
  if (direct.indLeft !== undefined && direct.indLeft >= 360 && t !== 'ul' && t !== 'ol' && t !== 'code') out.ind = Math.max(1, Math.min(8, Math.round(direct.indLeft / 720)));
  return out;
}

/** The paper the section is set on, as the nearest of the sizes the writing offers. */
function readPage(sectPr: XNode | undefined): PageSetup | undefined {
  if (!sectPr) return undefined;
  const sz = kidL(sectPr, 'pgSz');
  const mar = kidL(sectPr, 'pgMar');
  const w = Number(attr(sz, 'w')) / 1440;
  const h = Number(attr(sz, 'h')) / 1440;
  if (!(w > 0 && h > 0)) return undefined;
  const landscape = attr(sz, 'orient') === 'landscape' || w > h;
  const short = Math.min(w, h);
  const long = Math.max(w, h);
  let best: PaperSize = 'letter';
  let bestD = Infinity;
  for (const [k, p] of Object.entries(PAPER) as [PaperSize, { w: number; h: number }][]) {
    const d = Math.abs(p.w - short) + Math.abs(p.h - long);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  const inch = (v: string | undefined) => (v !== undefined && /^-?\d+$/.test(v) ? Math.abs(Number(v)) / 1440 : 1);
  return sanitizePage({ size: best, orient: landscape ? 'landscape' : 'portrait', m: [inch(attr(mar, 'top')), inch(attr(mar, 'right')), inch(attr(mar, 'bottom')), inch(attr(mar, 'left'))] }) ?? undefined;
}

/** The body of a Word document — document.xml, with its styles, numbering, relationships and pictures — as blocks. */
export function readWordXml(
  documentXml: string,
  stylesXml?: string,
  numberingXml?: string,
  extra: { rels?: string; media?: Map<string, Uint8Array>; theme?: string } = {}
): WordReading {
  const theme = readTheme(extra.theme);
  const styles = readStyles(stylesXml, theme);
  const numbering = readNumbering(numberingXml);
  const root = parseXml(documentXml);
  const body = kidL(kidL(root, 'document'), 'body');
  const blocks: Block[] = [];
  const counts: Counts = { pictures: 0, unreadable: 0, footnotes: 0, boxes: 0, merged: 0 };
  const normalChain = resolve(styles, styles.normal ?? 'Normal');
  const base = merge(styles.defaults, chainRun(normalChain));
  const ctx: ReadCtx = { styles, theme, rels: readRels(extra.rels), media: extra.media ?? new Map(), counts, base };
  let title = '';
  let pageWidthIn = 6.5;

  /** A paragraph's type and depth, from its style and its numbering. */
  const shapeOf = (p: XNode): { t: BlockType; lvl?: number; chain: StyleInfo[]; title: boolean } => {
    const pPr = kidL(p, 'pPr');
    const styleId = attr(kidL(pPr, 'pStyle'), 'val');
    const chain = resolve(styles, styleId ?? styles.normal);
    const names = chain.map((s) => s.name);
    // numbering set on the paragraph, or carried by its style (Word's "List Bullet" and the like)
    const numPr = kidL(pPr, 'numPr');
    const fromStyle = numPr ? undefined : chain.find((s) => s.numId);
    const numId = numPr ? attr(kidL(numPr, 'numId'), 'val') : fromStyle?.numId;
    const ilvl = numPr ? Number(attr(kidL(numPr, 'ilvl'), 'val') ?? 0) : fromStyle?.ilvl ?? 0;
    const heading = names.map((n) => /^heading\s*([1-9])$/.exec(n)?.[1]).find(Boolean);
    const outline = chain.find((s) => s.outline !== undefined && s.outline < 9)?.outline;
    if (names.includes('title')) return { t: 'h1', chain, title: true };
    if (heading || outline !== undefined) {
      const n = heading ? Number(heading) : (outline as number) + 1;
      return { t: n <= 1 ? 'h1' : n === 2 ? 'h2' : 'h3', chain, title: false };
    }
    if (names.some((n) => n === 'quote' || n === 'intense quote' || n === 'block text')) return { t: 'quote', chain, title: false };
    if (names.some((n) => n === 'source code' || n === 'html preformatted' || n === 'code' || n === 'plain text' || n === 'preformatted text')) return { t: 'code', chain, title: false };
    if (numId && numId !== '0') {
      const bullet = numbering.get(numId)?.get(ilvl);
      return { t: bullet === false ? 'ol' : 'ul', lvl: Math.min(3, Math.max(1, ilvl + 1)), chain, title: false };
    }
    if (names.some((n) => /^list bullet/.test(n))) return { t: 'ul', lvl: 1, chain, title: false };
    if (names.some((n) => /^list number/.test(n))) return { t: 'ol', lvl: 1, chain, title: false };
    return { t: 'p', chain, title: false };
  };

  const paragraph = (p: XNode) => {
    const pPr = kidL(p, 'pPr');
    const shape = shapeOf(p);
    const heading = shape.t === 'h1' || shape.t === 'h2' || shape.t === 'h3' || shape.title;
    // a heading's, a quotation's or code's look is the block's own — not marks on its words
    const blockLook = heading || shape.t === 'quote' || shape.t === 'code';
    const direct = readPPr(pPr);
    const chainP = chainPara(shape.chain);
    if (direct.pageBreakBefore ?? chainP.pageBreakBefore) blocks.push(makePageBreak());
    const pieces = readRuns(p, ctx, chainRun(shape.chain), blockLook);
    // an empty paragraph with a line under it is how Word draws a horizontal line
    if (!pieces.some((x) => x.k !== 'text' || x.text.trim()) && kidL(kidL(pPr, 'pBdr'), 'bottom')) {
      const v = attr(kidL(kidL(pPr, 'pBdr'), 'bottom'), 'val');
      if (v && v !== 'none' && v !== 'nil') {
        blocks.push(makeRule());
        return;
      }
    }
    const attrs = paraAttrs(direct, chainP, shape.t);
    let first = true;
    for (const piece of pieces) {
      if (piece.k === 'pb') {
        blocks.push(makePageBreak());
        continue;
      }
      if (piece.k === 'img') {
        const w = piece.wIn ? Math.round(Math.min(100, (piece.wIn / pageWidthIn) * 100)) : undefined;
        blocks.push({ ...makeImage({ src: 'm:' + '0'.repeat(32), alt: piece.alt, iw: piece.iw, ih: piece.ih, ...(w && w < 98 ? { w } : {}), ...(attrs.align && attrs.align !== 'justify' ? { align: attrs.align } : {}) }), src: piece.src });
        continue;
      }
      const { text, marks } = tidy(piece.text, piece.marks);
      if (!text.trim()) continue;
      if (shape.title && !title && first) {
        title = text.replace(/\s+/g, ' ').trim();
        first = false;
        continue;
      }
      first = false;
      const block: Block = { id: uid('b'), t: shape.t, text, ...attrs };
      if (shape.lvl) block.lvl = shape.lvl;
      const m = shape.t === 'code' ? undefined : normalizeMarks(marks, text.length);
      // a heading is a heading: bold set on all of it is the heading's look, not emphasis the person added
      const kept = m && heading ? m.filter((x) => !(x.t === 'b' && x.s === 0 && x.e === text.length)) : m;
      if (kept?.length) block.marks = kept;
      // one block of code, not a block a line: consecutive code paragraphs are one
      const prev = blocks[blocks.length - 1];
      if (shape.t === 'code' && prev?.t === 'code') prev.text += '\n' + text;
      else blocks.push(block);
    }
  };

  const table = (tbl: XNode) => {
    const rows: Block[][] = [];
    let head = false;
    const grid = kidsL(kidL(tbl, 'tblGrid'), 'gridCol').map((g) => Number(attr(g, 'w')) || 0);
    kidsL(tbl, 'tr').forEach((tr, r) => {
      if (r === 0 && onOff(kidL(kidL(tr, 'trPr'), 'tblHeader'))) head = true;
      const row: Block[] = [];
      for (const tc of kidsL(tr, 'tc')) {
        const tcPr = kidL(tc, 'tcPr');
        const span = Math.min(20, Math.max(1, Number(attr(kidL(tcPr, 'gridSpan'), 'val')) || 1));
        const vmerge = kidL(tcPr, 'vMerge');
        const continued = vmerge && attr(vmerge, 'val') !== 'restart';
        let text = '';
        const marks: Mark[] = [];
        let align: Align | undefined;
        if (!continued) {
          for (const p of kidsL(tc, 'p').concat(...kidsL(tc, 'tbl').map((inner) => kidsL(inner, 'tr').flatMap((x) => kidsL(x, 'tc').flatMap((c) => kidsL(c, 'p')))))) {
            const shape = shapeOf(p);
            const pieces = readRuns(p, ctx, chainRun(shape.chain), false);
            const words = pieces.filter((x): x is Extract<Piece, { k: 'text' }> => x.k === 'text');
            if (pieces.some((x) => x.k === 'img')) counts.pictures++;
            for (const w of words) {
              const t = tidy(w.text, w.marks);
              if (!t.text.trim()) continue;
              if (text) text += '\n';
              marks.push(...t.marks.map((m) => ({ ...m, s: m.s + text.length, e: m.e + text.length })));
              text += t.text;
            }
            const jc = readPPr(kidL(p, 'pPr')).jc;
            if (!align && jc && (JC_ALIGN[jc] === 'center' || JC_ALIGN[jc] === 'right')) align = JC_ALIGN[jc];
          }
        } else counts.merged++;
        const m = normalizeMarks(marks, text.length);
        row.push({ ...emptyCell(), text, ...(m ? { marks: m } : {}), ...(align ? { align } : {}) });
        for (let k = 1; k < span; k++) row.push(emptyCell());
      }
      if (row.length) rows.push(row);
    });
    const width = Math.max(0, ...rows.map((r) => r.length));
    const t = tableFrom(rows, { head, ...(grid.length === width && grid.every((g) => g > 0) ? { cols: grid } : {}) });
    if (t && t.text.replace(/[\t\n]/g, '').trim()) blocks.push(t);
  };

  const sectPr = kidL(body, 'sectPr');
  const page = readPage(sectPr);
  if (page) pageWidthIn = Math.max(1, (page.orient === 'landscape' ? PAPER[page.size].h : PAPER[page.size].w) - page.m[1] - page.m[3]);

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
  say(counts.pictures, 'A picture that could not be read was left out.', '# pictures that could not be read were left out.');
  say(counts.unreadable, 'A picture in a format the page cannot show (such as EMF) was left out.', '# pictures in formats the page cannot show (such as EMF) were left out.');
  say(counts.boxes, 'The words in a text box were left out.', 'The words in # text boxes were left out.');
  say(counts.footnotes, 'A footnote was left out.', '# footnotes were left out.');
  say(counts.merged, 'Cells merged across rows came in as separate cells.', 'Cells merged across rows came in as separate cells (# of them).');
  const font = base.font ? fontValue(base.font) : null;
  const size = base.size ? Number(sizeValue(base.size)) : null;
  return { title, blocks, notes, ...(page ? { page } : {}), ...(font ? { font } : {}), ...(size ? { size } : {}) };
}

/** A .docx file's bytes into the writing. Throws with a sentence a person can read. */
export async function readDocx(bytes: Uint8Array): Promise<WordReading> {
  let parts: Map<string, Uint8Array>;
  try {
    parts = await unzipSome(
      bytes,
      (n) => n === 'word/document.xml' || n === 'word/styles.xml' || n === 'word/numbering.xml' || n === 'word/_rels/document.xml.rels' || n === 'word/theme/theme1.xml' || n.startsWith('word/media/')
    );
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
  const media = new Map<string, Uint8Array>();
  for (const [name, data] of Array.from(parts)) if (name.startsWith('word/media/')) media.set(name, data);
  return readWordXml(dec.decode(doc), text('word/styles.xml'), text('word/numbering.xml'), { rels: text('word/_rels/document.xml.rels'), media, theme: text('word/theme/theme1.xml') });
}
