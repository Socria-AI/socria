// lib/preview/slides.ts — a presentation as its slides.
//
// What the preview draws: each slide at its own size, every shape where the file
// puts it — text boxes with their runs (size, weight, colour, alignment, bullets),
// pictures, tables, filled and outlined shapes, groups — on the slide's background.
// A placeholder that leaves its position or its text style to the layout and the
// master takes them from there, the way PowerPoint does. Colours are resolved
// through the theme. Charts and SmartArt are shown as what they are, labelled,
// rather than guessed at.
//
// The reading Socria reasons with (lib/docs/pptx.ts) is separate.
//
// PURE (JSZip aside). Coordinates are EMU (914400 to the inch).

import { attr, textOf, type XNode } from '@/lib/docs/xml';
import { findAllL, findL, hexColor, kidL, kidsL, local, lum, mimeOfPath, openPackage, relsOf, rootOf, shadeTint, themeColors, type Package, type Rel } from './ooxml';

export interface Run {
  t: string;
  /** points */
  size?: number;
  b?: boolean;
  i?: boolean;
  u?: boolean;
  strike?: boolean;
  color?: string;
  font?: string;
  /** a line break, not text */
  br?: true;
  sup?: boolean;
  sub?: boolean;
}

export interface Para {
  align?: 'left' | 'center' | 'right' | 'justify';
  level: number;
  bullet?: string;
  runs: Run[];
  /** points before the paragraph */
  before?: number;
  /** line spacing as a multiple */
  line?: number;
}

export interface TextBody {
  paras: Para[];
  anchor: 'top' | 'middle' | 'bottom';
  /** EMU: left, top, right, bottom */
  inset: [number, number, number, number];
  wrap: boolean;
  vertical?: boolean;
}

export interface Shape {
  kind: 'shape' | 'picture' | 'table' | 'chart' | 'diagram' | 'media';
  x: number;
  y: number;
  w: number;
  h: number;
  rot?: number;
  flipH?: boolean;
  flipV?: boolean;
  geom?: string;
  fill?: string;
  line?: { color: string; width: number; dash?: boolean };
  text?: TextBody;
  /** picture: a part of the package */
  image?: string;
  /** picture: the part's type */
  mime?: string;
  table?: { cols: number[]; rows: { h: number; cells: { text: TextBody; fill?: string; span?: number; rowSpan?: number; merged?: boolean }[] }[] };
  /** what a chart or diagram is called in the file */
  label?: string;
  name?: string;
}

export interface Slide {
  n: number;
  hidden?: boolean;
  bg?: { color?: string; image?: string; mime?: string };
  shapes: Shape[];
  notes?: string;
}

export interface Deck {
  width: number;
  height: number;
  slides: Slide[];
}

/** The most slides drawn; beyond, the preview says so. */
export const MAX_SLIDES = 400;
const MAX_SHAPES = 600;

/** A placeholder's kind and index, for finding it on the layout and the master. */
interface PH {
  type: string;
  idx?: string;
}

interface Ctx {
  pkg: Package;
  theme: Record<string, string>;
  /** the master's map from bg1/tx1… to the theme's names */
  clrMap: Record<string, string>;
}

// ── colour ──────────────────────────────────────────────────────────

/** A DrawingML colour element (srgbClr, schemeClr, sysClr, prstClr) with its modifiers, as hex. */
function colorEl(n: XNode | undefined, ctx: Ctx): string | undefined {
  if (!n) return undefined;
  const name = local(n.name);
  let hex: string | undefined;
  if (name === 'srgbClr') hex = hexColor(attr(n, 'val'));
  else if (name === 'sysClr') hex = hexColor(attr(n, 'lastClr')) ?? (attr(n, 'val') === 'window' ? '#FFFFFF' : '#000000');
  else if (name === 'prstClr') hex = PRESET[attr(n, 'val') ?? ''] ?? undefined;
  else if (name === 'scrgbClr') hex = '#000000';
  else if (name === 'schemeClr') {
    const v = attr(n, 'val') ?? '';
    const mapped = ctx.clrMap[v] ?? v;
    hex = ctx.theme[mapped] ?? ctx.theme[v];
  }
  if (!hex) return undefined;
  const mod = Number(attr(kidL(n, 'lumMod'), 'val') ?? NaN) / 100000;
  const off = Number(attr(kidL(n, 'lumOff'), 'val') ?? NaN) / 100000;
  if (Number.isFinite(mod) || Number.isFinite(off)) hex = lum(hex, Number.isFinite(mod) ? mod : 1, Number.isFinite(off) ? off : 0);
  const shade = Number(attr(kidL(n, 'shade'), 'val') ?? NaN) / 100000;
  const tnt = Number(attr(kidL(n, 'tint'), 'val') ?? NaN) / 100000;
  if (Number.isFinite(shade) || Number.isFinite(tnt)) hex = shadeTint(hex, Number.isFinite(shade) ? shade : undefined, Number.isFinite(tnt) ? tnt : undefined);
  return hex;
}

const PRESET: Record<string, string> = { black: '#000000', white: '#FFFFFF', red: '#FF0000', green: '#008000', blue: '#0000FF', yellow: '#FFFF00', gray: '#808080', grey: '#808080', darkGray: '#A9A9A9', lightGray: '#D3D3D3', orange: '#FFA500' };

/** The colour inside a fill container (a:solidFill, a:fgClr…). */
const colorIn = (n: XNode | undefined, ctx: Ctx) => (n ? colorEl(n.children.find((c): c is XNode => typeof c !== 'string'), ctx) : undefined);

/** A shape's fill: solid, the first stop of a gradient, or none. */
function fillOf(spPr: XNode | undefined, ctx: Ctx): string | null | undefined {
  if (!spPr) return undefined;
  if (kidL(spPr, 'noFill')) return null;
  const solid = kidL(spPr, 'solidFill');
  if (solid) return colorIn(solid, ctx);
  const grad = kidL(spPr, 'gradFill');
  if (grad) return colorIn(findL(grad, 'gs'), ctx);
  return undefined;
}

function lineOf(spPr: XNode | undefined, ctx: Ctx): Shape['line'] | null | undefined {
  const ln = kidL(spPr, 'ln');
  if (!ln) return undefined;
  if (kidL(ln, 'noFill')) return null;
  const color = colorIn(kidL(ln, 'solidFill'), ctx);
  if (!color) return undefined;
  const w = Number(attr(ln, 'w') ?? 12700);
  return { color, width: w, ...(kidL(ln, 'prstDash') && attr(kidL(ln, 'prstDash'), 'val') !== 'solid' ? { dash: true } : {}) };
}

// ── text ────────────────────────────────────────────────────────────

/** Text defaults at one level: from a list style (a:lstStyle, p:titleStyle…), lvl1pPr … lvl9pPr. */
interface LevelStyle {
  size?: number;
  b?: boolean;
  i?: boolean;
  color?: string;
  font?: string;
  align?: Para['align'];
  bullet?: string | null;
  indent?: number;
}

function levelsOf(list: XNode | undefined, ctx: Ctx): LevelStyle[] {
  const out: LevelStyle[] = [];
  for (let l = 1; l <= 9; l++) {
    const p = kidL(list, `lvl${l}pPr`);
    if (!p) continue;
    out[l - 1] = { ...pPrStyle(p, ctx), ...rPrStyle(kidL(p, 'defRPr'), ctx) };
  }
  return out;
}

function pPrStyle(p: XNode | undefined, ctx: Ctx): LevelStyle {
  if (!p) return {};
  const s: LevelStyle = {};
  const algn = attr(p, 'algn');
  if (algn) s.align = algn === 'ctr' ? 'center' : algn === 'r' ? 'right' : algn === 'just' || algn === 'dist' ? 'justify' : 'left';
  if (kidL(p, 'buNone')) s.bullet = null;
  const ch = attr(kidL(p, 'buChar'), 'char');
  if (ch) s.bullet = ch;
  if (kidL(p, 'buAutoNum')) s.bullet = '#';
  const marL = attr(p, 'marL');
  if (marL) s.indent = Number(marL);
  void ctx;
  return s;
}

function rPrStyle(r: XNode | undefined, ctx: Ctx): LevelStyle {
  if (!r) return {};
  const s: LevelStyle = {};
  const sz = attr(r, 'sz');
  if (sz) s.size = Number(sz) / 100;
  const b = attr(r, 'b');
  if (b !== undefined) s.b = b === '1' || b === 'true';
  const i = attr(r, 'i');
  if (i !== undefined) s.i = i === '1' || i === 'true';
  const color = colorIn(kidL(r, 'solidFill'), ctx);
  if (color) s.color = color;
  const font = attr(kidL(r, 'latin'), 'typeface');
  if (font && !font.startsWith('+')) s.font = font;
  return s;
}

/** Levels merged, the nearer winning: the shape's own list style over the layout's over the master's. */
const mergeLevels = (...chains: LevelStyle[][]): LevelStyle[] =>
  Array.from({ length: 9 }, (_, l) => Object.assign({}, ...chains.map((c) => c[l] ?? {}).reverse()));

function readBody(txBody: XNode | undefined, inherited: LevelStyle[], ctx: Ctx, bodyPrs: (XNode | undefined)[], autonum: { n: number }): TextBody | undefined {
  if (!txBody) return undefined;
  const bodyPr = kidL(txBody, 'bodyPr');
  const own = levelsOf(kidL(txBody, 'lstStyle'), ctx);
  const levels = mergeLevels(own, inherited);
  // bodyPr: the nearest that says
  const bp = (name: string) => [bodyPr, ...bodyPrs].map((b) => attr(b, name)).find((v) => v !== undefined);
  const anchor = bp('anchor');
  const ins = (name: string, d: number) => Number(bp(name) ?? d);
  const scale = Number(attr(kidL(bodyPr, 'normAutofit'), 'fontScale') ?? 100000) / 100000;
  const vert = bp('vert');
  const paras: Para[] = [];
  for (const p of kidsL(txBody, 'p')) {
    const pPr = kidL(p, 'pPr');
    const level = Math.min(8, Number(attr(pPr, 'lvl') ?? 0));
    const lv = { ...levels[level], ...pPrStyle(pPr, ctx) };
    const runs: Run[] = [];
    for (const r of p.children) {
      if (typeof r === 'string') continue;
      const name = local(r.name);
      if (name === 'br') runs.push({ t: '\n', br: true });
      if (name !== 'r' && name !== 'fld') continue;
      const rPr = kidL(r, 'rPr');
      const rs = { ...lv, ...rPrStyle(rPr, ctx) };
      const t = textOf(kidL(r, 't'));
      if (!t) continue;
      const base = attr(rPr, 'baseline');
      runs.push({
        t,
        ...(rs.size ? { size: Math.round(rs.size * scale * 10) / 10 } : {}),
        ...(rs.b ? { b: true } : {}),
        ...(rs.i ? { i: true } : {}),
        ...(attr(rPr, 'u') && attr(rPr, 'u') !== 'none' ? { u: true } : {}),
        ...(attr(rPr, 'strike') && attr(rPr, 'strike') !== 'noStrike' ? { strike: true } : {}),
        ...(rs.color ? { color: rs.color } : {}),
        ...(rs.font ? { font: rs.font } : {}),
        ...(base && Number(base) > 0 ? { sup: true } : base && Number(base) < 0 ? { sub: true } : {}),
      });
    }
    // an empty paragraph still takes a line, at the size its end mark says
    if (!runs.length) {
      const end = rPrStyle(kidL(p, 'endParaRPr'), ctx);
      const size = end.size ?? lv.size;
      runs.push({ t: '', ...(size ? { size: size * scale } : {}) });
    }
    const hasText = runs.some((r) => r.t.trim());
    let bullet: string | undefined;
    if (hasText && lv.bullet) bullet = lv.bullet === '#' ? `${++autonum.n}.` : lv.bullet;
    else if (!lv.bullet) autonum.n = 0;
    const spcPct = attr(findL(kidL(pPr, 'lnSpc'), 'spcPct'), 'val');
    const before = attr(findL(kidL(pPr, 'spcBef'), 'spcPts'), 'val');
    paras.push({
      level,
      runs,
      ...(lv.align ? { align: lv.align } : {}),
      ...(bullet ? { bullet } : {}),
      ...(spcPct ? { line: Number(spcPct) / 100000 } : {}),
      ...(before ? { before: Number(before) / 100 } : {}),
    });
  }
  return {
    paras,
    anchor: anchor === 'ctr' ? 'middle' : anchor === 'b' ? 'bottom' : 'top',
    inset: [ins('lIns', 91440), ins('tIns', 45720), ins('rIns', 91440), ins('bIns', 45720)],
    wrap: bp('wrap') !== 'none',
    ...(vert && vert !== 'horz' ? { vertical: true } : {}),
  };
}

// ── placeholders: the layout and the master ─────────────────────────

interface Template {
  /** placeholders by type and by idx: their xfrm, bodyPr, list style */
  phs: { ph: PH; node: XNode }[];
  bg?: XNode;
  rels: Map<string, Rel>;
  part: string;
}

function phOf(sp: XNode): PH | undefined {
  const ph = findL(kidL(kidL(sp, 'nvSpPr') ?? kidL(sp, 'nvPicPr') ?? kidL(sp, 'nvGraphicFramePr'), 'nvPr'), 'ph');
  if (!ph) return undefined;
  return { type: attr(ph, 'type') ?? 'body', ...(attr(ph, 'idx') !== undefined ? { idx: attr(ph, 'idx') } : {}) };
}

async function templateOf(pkg: Package, part: string | undefined): Promise<Template | undefined> {
  if (!part) return undefined;
  const root = rootOf(await pkg.xml(part));
  if (!root) return undefined;
  const tree = findL(root, 'spTree');
  const phs: Template['phs'] = [];
  for (const sp of findAllL(tree, 'sp')) {
    const ph = phOf(sp);
    if (ph) phs.push({ ph, node: sp });
  }
  return { phs, bg: findL(kidL(root, 'cSld'), 'bg'), rels: await relsOf(pkg, part), part };
}

const sameKind = (a: string, b: string) => {
  const norm = (t: string) => (t === 'ctrTitle' ? 'title' : t === 'subTitle' || t === 'obj' ? 'body' : t);
  return norm(a) === norm(b);
};

/** The placeholder on a template a slide's placeholder takes after: by index, then by kind. */
function matchPh(t: Template | undefined, ph: PH): XNode | undefined {
  if (!t) return undefined;
  if (ph.idx !== undefined) {
    const byIdx = t.phs.find((p) => p.ph.idx === ph.idx);
    if (byIdx) return byIdx.node;
  }
  return t.phs.find((p) => p.ph.type === ph.type)?.node ?? t.phs.find((p) => sameKind(p.ph.type, ph.type))?.node;
}

function xfrmOf(n: XNode | undefined): { x: number; y: number; w: number; h: number; rot?: number; flipH?: boolean; flipV?: boolean } | undefined {
  const spPr = kidL(n, 'spPr') ?? kidL(n, 'grpSpPr');
  const x = kidL(spPr, 'xfrm') ?? kidL(n, 'xfrm');
  const off = kidL(x, 'off');
  const ext = kidL(x, 'ext');
  if (!off || !ext) return undefined;
  const rot = Number(attr(x, 'rot') ?? 0) / 60000;
  return {
    x: Number(attr(off, 'x') ?? 0),
    y: Number(attr(off, 'y') ?? 0),
    w: Number(attr(ext, 'cx') ?? 0),
    h: Number(attr(ext, 'cy') ?? 0),
    ...(rot ? { rot } : {}),
    ...(attr(x, 'flipH') === '1' ? { flipH: true } : {}),
    ...(attr(x, 'flipV') === '1' ? { flipV: true } : {}),
  };
}

// ── reading a deck ──────────────────────────────────────────────────

/** Read a .pptx into the slides a preview draws. */
export async function readDeck(data: ArrayBuffer | Uint8Array | Package): Promise<Deck> {
  const pkg = 'xml' in data ? data : await openPackage(data);
  const presPath = 'ppt/presentation.xml';
  const pres = rootOf(await pkg.xml(presPath));
  if (!pres) throw new Error('This presentation has no slides that can be drawn.');
  const presRels = await relsOf(pkg, presPath);
  const sz = kidL(pres, 'sldSz');
  const width = Number(attr(sz, 'cx') ?? 12192000);
  const height = Number(attr(sz, 'cy') ?? 6858000);
  const order = kidsL(kidL(pres, 'sldIdLst'), 'sldId')
    .map((s) => presRels.get(Object.entries(s.attrs).find(([k]) => k.endsWith(':id'))?.[1] ?? ''))
    .filter((r): r is Rel => !!r && r.type === 'slide');
  const templates = new Map<string, Template | undefined>();
  const tpl = async (p: string | undefined) => {
    if (!p) return undefined;
    if (!templates.has(p)) templates.set(p, await templateOf(pkg, p));
    return templates.get(p);
  };
  const slides: Slide[] = [];
  for (const [k, rel] of order.slice(0, MAX_SLIDES).entries()) {
    try {
      slides.push(await readSlide(pkg, rel.target, k + 1, tpl));
    } catch {
      // a slide that cannot be read is shown as empty rather than losing the deck
      slides.push({ n: k + 1, shapes: [] });
    }
  }
  if (!slides.length) throw new Error('This presentation has no slides that can be drawn.');
  return { width, height, slides };
}

async function readSlide(pkg: Package, part: string, n: number, tpl: (p: string | undefined) => Promise<Template | undefined>): Promise<Slide> {
  const root = rootOf(await pkg.xml(part));
  if (!root) return { n, shapes: [] };
  const rels = await relsOf(pkg, part);
  const relOfType = (r: Map<string, Rel>, t: string) => [...r.values()].find((x) => x.type === t)?.target;
  const layout = await tpl(relOfType(rels, 'slideLayout'));
  const master = await tpl(layout ? relOfType(layout.rels, 'slideMaster') : undefined);
  const masterRoot = master ? rootOf(await pkg.xml(master.part)) : undefined;
  const themePath = master ? relOfType(master.rels, 'theme') : undefined;
  const theme = await themeColors(pkg, themePath);
  const clrMapNode = kidL(masterRoot, 'clrMap');
  const clrMap: Record<string, string> = clrMapNode ? { ...clrMapNode.attrs } : { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' };
  const ctx: Ctx = { pkg, theme, clrMap };
  const txStyles = kidL(masterRoot, 'txStyles');
  const masterLevels = {
    title: levelsOf(kidL(txStyles, 'titleStyle'), ctx),
    body: levelsOf(kidL(txStyles, 'bodyStyle'), ctx),
    other: levelsOf(kidL(txStyles, 'otherStyle'), ctx),
  };

  // background: the slide's, else the layout's, else the master's
  const bgNode = findL(kidL(root, 'cSld'), 'bg') ?? layout?.bg ?? master?.bg;
  const bgRels = findL(kidL(root, 'cSld'), 'bg') ? rels : layout?.bg ? layout.rels : master?.rels;
  const bg = bgNode ? backgroundOf(bgNode, ctx, bgRels) : undefined;

  const shapes: Shape[] = [];
  const tree = findL(kidL(root, 'cSld'), 'spTree');
  const ctxFor = { ctx, rels, layout, master, masterLevels };
  walk(tree, shapes, ctxFor, null);
  // what the master and the layout draw on every slide (logos, rules, footers that are not placeholders)
  const behind: Shape[] = [];
  if (attr(root, 'showMasterSp') !== '0') {
    const layoutRoot = layout ? rootOf(await pkg.xml(layout.part)) : undefined;
    if (master && attr(layoutRoot, 'showMasterSp') !== '0') walk(findL(kidL(masterRoot, 'cSld'), 'spTree'), behind, { ...ctxFor, rels: master.rels }, null, true);
    if (layout) walk(findL(kidL(layoutRoot, 'cSld'), 'spTree'), behind, { ...ctxFor, rels: layout.rels }, null, true);
  }
  const notesPart = relOfType(rels, 'notesSlide');
  let notes: string | undefined;
  if (notesPart) {
    const nroot = rootOf(await pkg.xml(notesPart));
    const body = findAllL(nroot, 'sp').find((sp) => phOf(sp)?.type === 'body');
    notes = body ? kidsL(kidL(body, 'txBody'), 'p').map((p) => findAllL(p, 't').map(textOf).join('')).join('\n').trim() || undefined : undefined;
  }
  return {
    n,
    ...(attr(root, 'show') === '0' ? { hidden: true } : {}),
    ...(bg ? { bg } : {}),
    shapes: [...behind, ...shapes].slice(0, MAX_SHAPES),
    ...(notes ? { notes } : {}),
  };
}

function backgroundOf(bg: XNode, ctx: Ctx, rels: Map<string, Rel> | undefined): Slide['bg'] | undefined {
  const pr = kidL(bg, 'bgPr');
  if (pr) {
    const solid = kidL(pr, 'solidFill');
    if (solid) return { color: colorIn(solid, ctx) };
    const grad = kidL(pr, 'gradFill');
    if (grad) return { color: colorIn(findL(grad, 'gs'), ctx) };
    const blip = findL(kidL(pr, 'blipFill'), 'blip');
    const rid = blip ? Object.entries(blip.attrs).find(([k]) => k.endsWith(':embed'))?.[1] : undefined;
    const target = rid ? rels?.get(rid)?.target : undefined;
    if (target) return { image: target, mime: mimeOfPath(target) ?? undefined };
  }
  const ref = kidL(bg, 'bgRef');
  if (ref) {
    const c = colorEl(ref.children.find((x): x is XNode => typeof x !== 'string'), ctx);
    if (c) return { color: c };
  }
  return undefined;
}

interface WalkCtx {
  ctx: Ctx;
  rels: Map<string, Rel>;
  layout?: Template;
  master?: Template;
  masterLevels: { title: LevelStyle[]; body: LevelStyle[]; other: LevelStyle[] };
}

type Map2D = { off: [number, number]; ext: [number, number]; chOff: [number, number]; chExt: [number, number] } | null;

/** A child's position mapped through its group's transform. */
function place(p: { x: number; y: number; w: number; h: number }, g: Map2D) {
  if (!g || !g.chExt[0] || !g.chExt[1]) return p;
  const sx = g.ext[0] / g.chExt[0];
  const sy = g.ext[1] / g.chExt[1];
  return { x: g.off[0] + (p.x - g.chOff[0]) * sx, y: g.off[1] + (p.y - g.chOff[1]) * sy, w: p.w * sx, h: p.h * sy };
}

function walk(tree: XNode | undefined, out: Shape[], w: WalkCtx, group: Map2D, templateOnly = false) {
  if (!tree) return;
  for (const n of tree.children) {
    if (typeof n === 'string' || out.length >= MAX_SHAPES) continue;
    const name = local(n.name);
    if (name === 'grpSp') {
      const x = kidL(kidL(n, 'grpSpPr'), 'xfrm');
      const v = (el: string, a: string) => Number(attr(kidL(x, el), a) ?? 0);
      const inner: Map2D = x ? { off: [v('off', 'x'), v('off', 'y')], ext: [v('ext', 'cx'), v('ext', 'cy')], chOff: [v('chOff', 'x'), v('chOff', 'y')], chExt: [v('chExt', 'cx'), v('chExt', 'cy')] } : null;
      // a group inside a group: the inner transform is itself placed by the outer
      const composed: Map2D = inner && group ? { off: [place({ x: inner.off[0], y: inner.off[1], w: 0, h: 0 }, group).x, place({ x: inner.off[0], y: inner.off[1], w: 0, h: 0 }, group).y], ext: [inner.ext[0] * (group.ext[0] / (group.chExt[0] || 1)), inner.ext[1] * (group.ext[1] / (group.chExt[1] || 1))], chOff: inner.chOff, chExt: inner.chExt } : inner ?? group;
      walk(n, out, w, composed, templateOnly);
      continue;
    }
    if (name === 'AlternateContent') {
      // the fallback is what a reader without the newer feature draws
      walk(kidL(n, 'Fallback') ?? kidL(n, 'Choice'), out, w, group, templateOnly);
      continue;
    }
    if (name !== 'sp' && name !== 'pic' && name !== 'graphicFrame' && name !== 'cxnSp') continue;
    const ph = phOf(n);
    // on the master and the layout, placeholders are templates for slides, not things drawn on them
    if (templateOnly && ph) continue;
    const shape = readShape(n, name, ph, w);
    if (!shape) continue;
    const at = place(shape, group);
    out.push({ ...shape, ...at });
  }
}

function readShape(n: XNode, name: string, ph: PH | undefined, w: WalkCtx): Shape | undefined {
  const { ctx } = w;
  const layoutPh = ph ? matchPh(w.layout, ph) : undefined;
  const masterPh = ph ? matchPh(w.master, ph) : undefined;
  const pos = xfrmOf(n) ?? (layoutPh ? xfrmOf(layoutPh) : undefined) ?? (masterPh ? xfrmOf(masterPh) : undefined);
  if (!pos || pos.w <= 0 || pos.h <= 0) return undefined;
  const nm = attr(kidL(kidL(n, 'nvSpPr') ?? kidL(n, 'nvPicPr') ?? kidL(n, 'nvGraphicFramePr') ?? kidL(n, 'nvCxnSpPr'), 'cNvPr'), 'name');
  const base = { ...pos, ...(nm ? { name: nm } : {}) };

  if (name === 'pic') {
    const blip = findL(kidL(n, 'blipFill'), 'blip');
    const rid = blip ? Object.entries(blip.attrs).find(([k]) => k.endsWith(':embed'))?.[1] : undefined;
    const target = rid ? w.rels.get(rid)?.target : undefined;
    const isMedia = !!findL(kidL(kidL(n, 'nvPicPr'), 'nvPr'), 'videoFile') || !!findL(kidL(kidL(n, 'nvPicPr'), 'nvPr'), 'audioFile');
    if (!target) return { kind: 'shape', ...base, fill: '#EEEEEE', label: 'Picture' };
    return { kind: isMedia ? 'media' : 'picture', ...base, image: target, ...(mimeOfPath(target) ? { mime: mimeOfPath(target)! } : {}) };
  }

  if (name === 'graphicFrame') {
    const gd = findL(n, 'graphicData');
    const uri = attr(gd, 'uri') ?? '';
    // a frame's position is its own p:xfrm, which xfrmOf already reads
    const at = base;
    const tbl = findL(gd, 'tbl');
    if (tbl) return { kind: 'table', ...at, table: readTable(tbl, w) };
    if (/chart/.test(uri)) return { kind: 'chart', ...at, label: nm ?? 'Chart' };
    if (/diagram/.test(uri)) return { kind: 'diagram', ...at, label: nm ?? 'Diagram' };
    return { kind: 'diagram', ...at, label: nm ?? 'Embedded object' };
  }

  // a shape or a connector
  const spPr = kidL(n, 'spPr');
  const geom = attr(kidL(spPr, 'prstGeom'), 'prst') ?? (kidL(spPr, 'custGeom') ? 'custom' : undefined);
  // fill and line: the shape's own, else its style reference (p:style), else none
  const style = kidL(n, 'style');
  let fill = fillOf(spPr, ctx);
  if (fill === undefined && style) fill = colorEl(kidL(style, 'fillRef')?.children.find((c): c is XNode => typeof c !== 'string'), ctx);
  if (fill === undefined && layoutPh) fill = fillOf(kidL(layoutPh, 'spPr'), ctx);
  let line = lineOf(spPr, ctx);
  if (line === undefined && style && Number(attr(kidL(style, 'lnRef'), 'idx') ?? 0) > 0) {
    const c = colorEl(kidL(style, 'lnRef')?.children.find((x): x is XNode => typeof x !== 'string'), ctx);
    if (c) line = { color: c, width: 12700 };
  }
  if (name === 'cxnSp') return { kind: 'shape', ...base, geom: geom ?? 'line', ...(line ? { line } : { line: { color: '#000000', width: 12700 } }) };

  const kind = ph ? (sameKind(ph.type, 'title') ? 'title' : sameKind(ph.type, 'body') ? 'body' : 'other') : 'other';
  // text defaults: the layout's placeholder list style over the master placeholder's over the master's text styles
  const inherited = mergeLevels(
    levelsOf(kidL(kidL(layoutPh, 'txBody'), 'lstStyle'), ctx),
    levelsOf(kidL(kidL(masterPh, 'txBody'), 'lstStyle'), ctx),
    ph ? w.masterLevels[kind] : w.masterLevels.other
  );
  // a text box that is not a placeholder takes no bullets from the master's body style
  if (!ph) for (const l of inherited) if (l) l.bullet = l.bullet && l.bullet !== '#' ? undefined : l.bullet;
  // a style's font colour (p:style/a:fontRef), when the runs say nothing
  const fontRef = colorEl(kidL(style, 'fontRef')?.children.find((x): x is XNode => typeof x !== 'string'), ctx);
  // it outranks the master's text styles (a filled shape's white text), never the shape's own list style or runs
  if (fontRef) for (let l = 0; l < 9; l++) inherited[l] = { ...inherited[l], color: fontRef };
  const text = readBody(kidL(n, 'txBody'), inherited, ctx, [kidL(kidL(layoutPh, 'txBody'), 'bodyPr'), kidL(kidL(masterPh, 'txBody'), 'bodyPr')], { n: 0 });
  const hasText = !!text?.paras.some((p) => p.runs.some((r) => r.t.trim()));
  // an empty placeholder is a prompt in the editor ("Click to add title"), never drawn in a slide show
  if (ph && !hasText && !fill && !line) return undefined;
  return {
    kind: 'shape',
    ...base,
    ...(geom ? { geom } : {}),
    ...(fill ? { fill } : {}),
    ...(line ? { line } : {}),
    ...(text && hasText ? { text } : {}),
  };
}

function readTable(tbl: XNode, w: WalkCtx): NonNullable<Shape['table']> {
  const cols = kidsL(kidL(tbl, 'tblGrid'), 'gridCol').map((c) => Number(attr(c, 'w') ?? 0));
  const tblPr = kidL(tbl, 'tblPr');
  const firstRow = attr(tblPr, 'firstRow') === '1';
  const bandRow = attr(tblPr, 'bandRow') === '1';
  const accent = w.ctx.theme.accent1 ?? '#4472C4';
  const rows = kidsL(tbl, 'tr').map((tr, ri) => ({
    h: Number(attr(tr, 'h') ?? 0),
    cells: kidsL(tr, 'tc').map((tc) => {
      const tcPr = kidL(tc, 'tcPr');
      const own = fillOf(tcPr, w.ctx);
      // with no fill of its own, the table style's look: a heading row in the accent, banded rows tinted
      const fill = own ?? (own === null ? undefined : firstRow && ri === 0 ? accent : bandRow && ri % 2 === (firstRow ? 1 : 0) ? lum(accent, 0.2, 0.8) : undefined);
      const levels = firstRow && ri === 0 && !own ? [{ b: true, color: '#FFFFFF' }] : [];
      return {
        text: readBody(kidL(tc, 'txBody'), mergeLevels(levels as LevelStyle[], w.masterLevels.other), w.ctx, [], { n: 0 }) ?? { paras: [], anchor: 'top' as const, inset: [91440, 45720, 91440, 45720] as [number, number, number, number], wrap: true },
        ...(fill ? { fill } : {}),
        ...(Number(attr(tc, 'gridSpan') ?? 1) > 1 ? { span: Number(attr(tc, 'gridSpan')) } : {}),
        ...(Number(attr(tc, 'rowSpan') ?? 1) > 1 ? { rowSpan: Number(attr(tc, 'rowSpan')) } : {}),
        ...(attr(tc, 'hMerge') === '1' || attr(tc, 'vMerge') === '1' ? { merged: true } : {}),
      };
    }),
  }));
  return { cols, rows };
}

/** EMU to CSS pixels at 96 dpi. */
export const px = (emu: number) => emu / 9525;
