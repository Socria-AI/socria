// lib/ux-v0/composer.ts — a part composed from its own content, by the strategy's placement procedure.
//
// A part the strategy composes (lib/ux-v0/strategy.ts) is rebuilt from its OWN words and pictures — its title, its
// points, its figures, its quote — on the twelve-column field (lib/ux-v0/compose.ts). Nothing is picked from a list
// of layouts: each spatial logic is a procedure that places the content it is given, its numbers drawn from the
// strategy's traits and a seed of the part's own, so the same logic with other content, or another design, lands
// elsewhere:
//
//   orthogonal  a broken grid: unequal spans, columns started off the expected lines, every other column a row lower
//   diagonal    a cascade: each point a step further across and down, along a band of the design's shapes
//   radial      about a centre: a figure of the design's (or its picture, cut to one) with the points set around it
//   scattered   spread across the field: each piece placed where it is farthest from the others, then read in order
//   layered     planes over planes: a mass, a picture with its silhouette echoed behind it, words over the mass
//
// Typography is part of the structure: display sizes by the strategy's type role, a label standing upright on the
// field's edge, a turn, numerals in outline, words wrapping a shape. Pictures are cut to the design's shapes, broken
// into fragments, or cropped hard, as the strategy says. Words are never placed on words, and only a title crosses a
// picture (on strips of the ground). The pieces are written in reading order, so on a phone, where the field is one
// column, the part reads top to bottom as it should; its ornaments step aside there.

import { RATIOS, type Cell, type Piece } from './compose';
import { figureFor, vocabulary, type FormSystem } from './form';
import { normalizeRecipe, shapeSeed, type ShapeKind, type ShapeRecipe } from './shape';
import { AXES, AXIS_LABEL, type Axis, type CompositionStrategy } from './strategy';

/** The kinds of part the composer can rebuild from their content (the rest must work as they are, or are the page's frame). */
export const COMPOSABLE = ['hero', 'features', 'stats', 'quote', 'split', 'cta', 'text'] as const;

/** A part's content, as the composer reads it. */
export interface Blocks {
  eyebrow?: string;
  title?: string;
  lead?: string;
  body?: string;
  items: { title: string; text?: string }[];
  figures: { value: string; label: string }[];
  quote?: { text: string; by?: string };
  bullets: string[];
  action?: string;
  /** how many pictures the part has */
  images: number;
}

const s = (v: unknown, n = 600) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');

/** A part's content read for composing, or null when it is not a part the composer rebuilds. */
export function blocksOf(sec: { kind: string; content: Record<string, unknown>; images: readonly string[] }): Blocks | null {
  if (!(COMPOSABLE as readonly string[]).includes(sec.kind)) return null;
  const c = sec.content;
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  const b: Blocks = {
    eyebrow: s(c.eyebrow, 48) || undefined,
    title: s(c.title, 120) || undefined,
    lead: s(sec.kind === 'hero' ? c.subtitle : sec.kind === 'features' ? c.intro : sec.kind === 'cta' ? c.text : '', 320) || undefined,
    body: s(sec.kind === 'split' ? c.text : sec.kind === 'text' ? list(c.paragraphs).filter((x) => typeof x === 'string').join(' ') : '', 700) || undefined,
    items: sec.kind === 'features' ? list(c.items).map((it: any) => ({ title: s(it?.title, 60), text: s(it?.text, 240) || undefined })).filter((it) => it.title) : [],
    figures: sec.kind === 'stats' ? list(c.items).map((it: any) => ({ value: s(it?.value, 16), label: s(it?.label, 60) })).filter((it) => it.value) : [],
    quote: sec.kind === 'quote' && s(c.quote) ? { text: s(c.quote, 320), by: [s(c.author, 60), s(c.role, 90)].filter(Boolean).join(', ') || undefined } : undefined,
    bullets: sec.kind === 'split' ? list(c.bullets).map((x) => s(x, 120)).filter(Boolean).slice(0, 6) : [],
    action: s(sec.kind === 'hero' ? c.primary : sec.kind === 'split' ? c.cta : sec.kind === 'cta' ? c.primary : '', 40) || undefined,
    images: Math.min(6, sec.images.length),
  };
  const hasContent = b.title || b.items.length || b.figures.length || b.quote || b.body;
  return hasContent ? b : null;
}

// ── the field, as the composer fills it ──────────────────────────────

const COLS = 12;
const ROWS = 8;

class Field {
  children: Piece[] = [];
  cells: Cell[] = [];
  /** where words already are: rows 1–8 × columns 1–12 */
  private words = Array.from({ length: ROWS + 1 }, () => Array.from({ length: COLS + 1 }, () => false));
  /** where pictures and opaque shapes are */
  private media = Array.from({ length: ROWS + 1 }, () => Array.from({ length: COLS + 1 }, () => false));
  static cell(col: number, span: number, row: number, rows: number): Cell {
    const c = Math.max(1, Math.min(COLS, Math.round(col)));
    const r = Math.max(1, Math.min(ROWS, Math.round(row)));
    return { col: c, span: Math.max(1, Math.min(COLS + 1 - c, Math.round(span))), row: r, rows: Math.max(1, Math.min(ROWS + 1 - r, Math.round(rows))) };
  }
  free(k: Cell, layer: 'words' | 'media' = 'words', margin = 0): boolean {
    const g = layer === 'words' ? this.words : this.media;
    for (let r = k.row; r < k.row + k.rows; r++) for (let c = Math.max(1, k.col - margin); c < Math.min(COLS + 1, k.col + k.span + margin); c++) if (g[r]?.[c]) return false;
    return true;
  }
  put(p: Piece, k0: Cell, layer: 'words' | 'media' | 'none' = 'words'): Cell {
    let k = k0;
    if (layer === 'words' && !this.free(k)) {
      // taken: the nearest free place of the same size, nearer rows first
      const near = this.find(k.span, k.rows, (x) => -Math.abs(x.row - k0.row) * 3 - Math.abs(x.col - k0.col)) ?? this.find(Math.max(2, k.span - 2), k.rows, (x) => -Math.abs(x.row - k0.row) * 3 - Math.abs(x.col - k0.col));
      if (near) k = near;
    }
    this.children.push(p);
    this.cells.push(k);
    if (layer !== 'none') {
      const g = layer === 'words' ? this.words : this.media;
      for (let r = k.row; r < k.row + k.rows; r++) for (let c = k.col; c < k.col + k.span; c++) g[r][c] = true;
    }
    return k;
  }
  /** The free place of this size that scores best; null when there is none. */
  find(span: number, rows: number, score: (k: Cell) => number, layer: 'words' | 'media' = 'words', avoidWords = layer === 'media', maxRow = ROWS): Cell | null {
    let best: { k: Cell; v: number } | null = null;
    for (let row = 1; row + rows - 1 <= maxRow; row++)
      for (let col = 1; col + span - 1 <= COLS; col++) {
        const k = { col, span, row, rows };
        if (!this.free(k, layer)) continue;
        if (avoidWords && !this.free(k, 'words')) continue;
        if (layer === 'words' && !this.free(k, 'media')) continue;
        const v = score(k);
        if (!best || v > best.v) best = { k, v };
      }
    return best?.k ?? null;
  }
  lastRow(): number {
    return this.cells.reduce((m, k) => Math.max(m, k.row + k.rows - 1), 0);
  }
}

function rng(seed: number) {
  let a = (seed || 1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── what the strategy says, per piece ──────────────────────────────────

/** The treatments a composition applies, which an exploration varies and a combination takes from another. */
export interface Treatments {
  images: CompositionStrategy['images'];
  vertical: boolean;
  rotate: number;
  outline: boolean;
  wrap: boolean;
  /** silhouettes behind silhouettes: masses and echoes */
  depth: boolean;
  role: CompositionStrategy['type']['role'];
}

export function treatmentsOf(st: CompositionStrategy, form: FormSystem): Treatments {
  return { images: st.images, vertical: st.type.vertical, rotate: st.type.rotate, outline: st.type.outline, wrap: st.type.wrap, depth: form.depth >= 50 || st.overlap >= 55, role: st.type.role };
}

function titleSize(len: number, role: Treatments['role']): 'l' | 'xl' | 'giant' | undefined {
  if (role === 'structural') return len <= 22 ? 'giant' : len <= 44 ? 'xl' : 'l';
  if (role === 'editorial') return len <= 30 ? 'xl' : 'l';
  if (role === 'quiet') return len <= 40 ? 'l' : undefined;
  return undefined;
}
const titleSpan = (size: ReturnType<typeof titleSize>, len: number) => (size === 'giant' ? 11 : size === 'xl' ? (len > 24 ? 10 : 8) : size === 'l' ? 8 : 7);

/** A shape of the design's for a place, preferring constructions the place asks for (a centre wants a radial figure). */
function figure(form: FormSystem, role: Parameters<typeof figureFor>[1], k: number, salt: string, prefer: readonly ShapeKind[] = []): ShapeRecipe {
  if (!prefer.length) return figureFor(form, role, k, salt);
  for (let i = 0; i < 6; i++) {
    const f = figureFor(form, role, k + i * 17, salt);
    if (prefer.includes(f.kind)) return f;
  }
  return figureFor(form, role, k, salt);
}

/** A band across the field from one corner toward the other, in the system's character: straight-edged or swept. */
function diagonalBand(form: FormSystem, down: boolean, seed: number): ShapeRecipe {
  if (form.curvature >= 55) {
    // a ribbon: two curves a band's width apart, sweeping from one corner toward the other
    const j = (n: number) => Math.round(n + ((seed * 7919 + n * 31) % 17) - 8);
    const path = down
      ? `M0 ${j(8)} C ${j(30)} ${j(-6)}, ${j(55)} ${j(70)}, 100 ${j(62)} L 100 ${j(92)} C ${j(60)} ${j(100)}, ${j(32)} ${j(34)}, 0 ${j(40)} Z`
      : `M0 ${j(62)} C ${j(30)} ${j(70)}, ${j(55)} ${j(-6)}, 100 ${j(8)} L 100 ${j(40)} C ${j(60)} ${j(34)}, ${j(32)} ${j(100)}, 0 ${j(92)} Z`;
    return normalizeRecipe({ kind: 'custom', path: path.replace(/-?\d+/g, (x) => String(Math.max(0, Math.min(100, Number(x))))) }) ?? normalizeRecipe({ kind: 'custom', points: [[0, 10], [100, 60], [100, 90], [0, 40]] })!;
  }
  const t = 26 + (seed % 12);
  const pts: [number, number][] = down
    ? [[0, 0], [t, 0], [100, 100 - t], [100, 100], [100 - t, 100], [0, t]]
    : [[0, 100], [0, 100 - t], [100 - t, 0], [100, 0], [100, t], [t, 100]];
  return normalizeRecipe({ kind: 'custom', points: pts })!;
}

export interface Composition {
  root: Piece;
  span?: 'wide' | 'bleed';
  tall?: 'screen';
  axis: Axis;
  treatments: Treatments;
  /** said plainly: "a diagonal cascade · pictures cut to its shapes · a label standing upright" */
  label: string;
}

export interface ComposeBlocksOptions {
  /** the part's own salt (its id): two parts of one page never land alike */
  salt: string;
  /** the page's opening */
  opening?: boolean;
  /** an exploration's other logic */
  axis?: Axis;
  /** an exploration's or a combination's other treatments */
  treatments?: Partial<Treatments>;
  /** the direction's one loud move (lib/ux-v0/plan.ts): figures are set huge, and a centre filled with the accent, only when it is theirs */
  loud?: string;
  /** which of the page's composed parts this is (0 the first): each takes the next logic of the strategy's ranking */
  k?: number;
}

/**
 * The part composed from its own content by the strategy's (or the exploration's) logic. Pure: the same content,
 * strategy and salt compose the same way.
 */
export function composeBlocks(b: Blocks, st: CompositionStrategy, form: FormSystem, opts: ComposeBlocksOptions): Composition {
  const ranked = st.ranked?.length ? st.ranked : [st.axis];
  const axis = opts.axis ?? ranked[(opts.k ?? 0) % ranked.length];
  const tr: Treatments = { ...treatmentsOf(st, form), ...(opts.treatments ?? {}) };
  const seed = shapeSeed(st.seed, opts.salt, axis);
  const R = rng(seed);
  const F = new Field();
  const lead = st.balance === 'end' ? false : st.balance === 'start' ? true : R() < 0.5;
  const salt = opts.salt;
  let shapeK = 0;
  // ── pictures, as the treatments cut them
  const picture = (i: number, ratio: (typeof RATIOS)[number] = '4:3'): Piece => {
    if (tr.images === 'fragmented' && opts.opening && i === 0) return { t: 'image', at: i, ratio, fill: true, fragments: figureFor(form, 'fragments', 0, salt) };
    if (tr.images === 'shaped' || tr.images === 'fragmented') return { t: 'image', at: i, ratio, fill: true, mask: figure(form, 'mask', i, salt, axis === 'radial' && i === 0 ? ['rings', 'radial', 'super'] : []), morph: true };
    if (tr.images === 'cropped') return { t: 'image', at: i, ratio: i % 2 ? '21:9' : '2:3', fill: true };
    return { t: 'image', at: i, ratio, fill: true };
  };
  const shape = (role: 'mass' | 'echo' | 'cut', tone: 'accent' | 'tint' | 'ink' | 'line' | 'ground', z: 'under' | 'over', prefer: readonly ShapeKind[] = [], keep = false): Piece => ({
    t: 'shape',
    form: figure(form, role, shapeK++, salt, prefer),
    tone,
    z,
    ...(keep ? { keep: true as const } : {}),
    ...(role !== 'echo' ? { morph: true as const } : {}),
  });
  // ── a label standing on the field's edge
  let c0 = 1;
  let c1 = COLS;
  let eyebrowDone = false;
  if (tr.vertical && b.eyebrow && b.eyebrow.length <= 40) {
    F.put({ t: 'text', role: 'eyebrow', text: b.eyebrow, orient: 'vertical' }, Field.cell(lead ? 1 : COLS, 1, 1, 3));
    if (lead) c0 = 2;
    else c1 = COLS - 1;
    eyebrowDone = true;
  }
  const width = c1 - c0 + 1;
  // ── the title: its size from the type's role, its span from its size
  const tLen = (b.title ?? '').length;
  // display type carries the opening; a later part's title stays a step below it, so the page keeps one loudest voice
  const size0 = b.quote ? undefined : titleSize(tLen, tr.role);
  const size = opts.opening || !size0 ? size0 : size0 === 'giant' ? (tLen <= 24 ? 'xl' : 'l') : size0 === 'xl' && tLen > 24 ? 'l' : size0;
  const tSpan = Math.min(width, titleSpan(size, tLen));
  const words: Piece[] = [];
  if (b.eyebrow && !eyebrowDone) words.push({ t: 'text', role: 'eyebrow', text: b.eyebrow, ...(tr.rotate ? { rotate: tr.rotate } : {}) });
  const titlePiece: Piece | null = b.title ? { t: 'text', role: 'title', text: b.title, ...(size ? { size } : {}) } : null;
  const head = (col: number, row: number, span = tSpan) => {
    if (words.length) {
      F.put(words[0], Field.cell(col, Math.min(span, 6), row, 1));
      row++;
    }
    if (titlePiece) F.put(titlePiece, Field.cell(col, span, row, 1));
    return row + (titlePiece ? 1 : 0);
  };
  const leadPiece = b.lead ? ({ t: 'text', role: 'lead', text: b.lead } as Piece) : null;
  const action = b.action ? ({ t: 'button', label: b.action, style: 'primary' } as Piece) : null;
  // the part's units of content, in reading order
  type Unit = { piece: Piece; span: number; rows: number };
  const units: Unit[] = [
    ...b.items.map((it): Unit => {
      const long = (it.text ?? '').length > 110;
      return { piece: it.text ? { t: 'stack', dir: 'col', gap: 's', align: 'start', children: [{ t: 'text', role: 'heading', text: it.title }, { t: 'text', role: 'body', text: it.text }] } : { t: 'text', role: 'heading', text: it.title }, span: long ? 4 : 3, rows: long ? 2 : 1 };
    }),
    ...b.figures.map((f): Unit =>
      !opts.loud || opts.loud === 'oversized-figure'
        ? { piece: { t: 'figure', value: f.value, label: f.label, ...(tr.outline ? { stroke: true as const } : {}) }, span: Math.max(3, Math.min(5, Math.ceil(f.value.length / 2) + 2)), rows: 2 }
        : { piece: { t: 'stack', dir: 'col', gap: 's', align: 'start', children: [{ t: 'text', role: 'heading', text: f.value, size: 'l' }, { t: 'text', role: 'caption', text: f.label }] }, span: 3, rows: 1 },
    ),
    ...(b.bullets.length ? [{ piece: { t: 'list', items: b.bullets, marker: 'rule' } as Piece, span: 5, rows: 2 }] : []),
  ];
  const body: Piece | null = b.body
    ? tr.wrap && b.body.length >= 160
      ? { t: 'flow', side: lead ? 'start' : 'end', form: figure(form, 'wrap', 0, salt), ...(b.images ? { at: 0 } : {}), tone: 'accent', children: [{ t: 'text', role: 'body', text: b.body }] }
      : { t: 'text', role: 'body', text: b.body }
    : null;
  const bodyUsesPicture = !!(body && body.t === 'flow' && body.at === 0);
  const quote: Piece | null = b.quote ? { t: 'text', role: 'quote', text: b.quote.text, size: b.quote.text.length <= 140 ? 'xl' : 'l' } : null;
  const by: Piece | null = b.quote?.by ? { t: 'text', role: 'caption', text: b.quote.by, ...(tr.vertical && b.quote.by.length <= 60 ? { orient: 'vertical' as const } : tr.rotate ? { rotate: tr.rotate } : {}) } : null;
  const pics = Array.from({ length: Math.max(0, b.images - (bodyUsesPicture ? 1 : 0)) }, (_, i) => i + (bodyUsesPicture ? 1 : 0));
  // rows sized for words: a row nothing but a shape stands in stays short, so a composition never opens into a void
  let rows: 's' | 'm' | 'l' = opts.opening && st.air >= 60 ? 'm' : 's';
  // within the page's column, as every other part is; only an opening, or pictures run to the edges, go wider
  let span: Composition['span'] = opts.opening ? 'wide' : undefined;
  let tall: Composition['tall'] | undefined;
  const placeUnits = (cands: (u: Unit, i: number) => Cell[]) => {
    units.forEach((u, i) => {
      const k = cands(u, i).find((x) => F.free(x) && F.free(x, 'media')) ?? F.find(u.span, u.rows, (x) => -x.row * 2 - Math.abs(x.col - c0) * 0.1);
      if (k) F.put(u.piece, k);
    });
  };
  const placeRest = (afterRow: number) => {
    // what remains in reading order where it fits: the lead, the body, the action
    for (const p of [leadPiece, body, action]) {
      if (!p || F.children.includes(p)) continue;
      const w = p.t === 'flow' ? Math.min(width, 9) : p.t === 'button' ? 3 : 5;
      const h = p.t === 'flow' ? 3 : 1;
      const k = F.find(w, h, (x) => -(Math.abs(x.row - afterRow) * 3) - Math.abs(x.col - (lead ? c0 : c1 - w + 1)));
      if (k) F.put(p, k);
    }
  };

  if (axis === 'orthogonal') {
    // a broken grid: the head to one side; points in two or three columns of unequal spans, started off the expected
    // lines, every other column a row lower; a picture standing tall on the other side
    const hasPic = pics.length > 0;
    const area = hasPic ? Math.max(6, width - 4) : width;
    const startCol = lead ? c0 : c1 - Math.min(tSpan, area) + 1;
    let row = head(lead ? c0 : Math.max(c0, c1 - Math.min(tSpan, area) + 1), 1, Math.min(tSpan, area));
    if (leadPiece) F.put(leadPiece, Field.cell(lead ? startCol + 1 : startCol, Math.min(6, area - 1), row++, 1));
    if (quote) {
      F.put(quote, Field.cell(lead ? c0 + 1 : c0, Math.min(10, area), row, 2));
      row += 2;
      if (by) F.put(by, by.t === 'text' && by.orient ? Field.cell(lead ? c1 : c0, 1, Math.max(1, row - 3), 3) : Field.cell(lead ? c0 + 4 : c0 + 1, 5, row++, 1));
    }
    if (body) {
      F.put(body, Field.cell(lead ? c0 + 1 : c0, Math.min(body.t === 'flow' ? 9 : 6, area - 1), row, body.t === 'flow' ? 3 : 2));
      row += body.t === 'flow' ? 3 : 2;
    }
    const n = units.length;
    const per = n <= 2 ? n : n === 4 ? 2 : 3;
    const patterns: number[][] = per === 3 ? [[4, 3, 4], [3, 5, 3], [5, 3, 3]] : per === 2 ? [[5, 4], [4, 5], [6, 4]] : [[6]];
    const spans = patterns[Math.floor(R() * patterns.length)].map((x) => Math.min(x, Math.floor(area / per)));
    const lane0 = lead ? c0 : c1 - area + 1;
    const slack = area - spans.reduce((a, x) => a + x, 0);
    const offs = spans.map((_, j) => (j === 0 ? Math.floor(R() * Math.min(2, Math.max(0, slack) + 1)) : 1 + Math.floor(R() * Math.max(1, Math.floor(slack / per)))));
    const starts: number[] = [];
    spans.forEach((sp, j) => starts.push(j === 0 ? lane0 + offs[0] : starts[j - 1] + spans[j - 1] + offs[j]));
    const base = Math.max(row, 2);
    placeUnits((u, i) => {
      const j = i % per;
      const band = Math.floor(i / per);
      const stagger = j % 2 === 1 ? 1 : 0;
      const step = u.rows + (n > 6 ? 0 : 1);
      return [Field.cell(Math.min(starts[j], c1 - spans[j] + 1), spans[j], base + band * step + stagger, u.rows)];
    });
    if (hasPic) {
      const col = lead ? c1 - 3 : c0;
      const k = F.find(4, 4, (x) => -Math.abs(x.col - col) * 4 - Math.abs(x.row - 2), 'media') ?? F.find(4, 3, () => 0, 'media');
      if (k) F.put(picture(pics[0], '3:4'), k, 'media');
      for (const [j, i] of pics.slice(1, 3).entries()) {
        const kk = F.find(3, 2, (x) => -Math.abs(x.row - (5 + j)) - Math.abs(x.col - (lead ? c0 : c1 - 2)), 'media');
        if (kk) F.put(picture(i, '1:1'), kk, 'media');
      }
      if (tr.depth && k && tr.images === 'shaped') F.put(shape('echo', 'accent', 'under'), Field.cell(k.col + (lead ? -1 : 1), 2, k.row + k.rows - 2, 2), 'none');
    }
    if (tr.depth || form.orthogonal >= 70) F.put(shape('mass', 'tint', 'under', form.orthogonal >= 70 ? ['stepped'] : []), Field.cell(lead ? Math.max(c0, c1 - 5) : c0, Math.min(6, width), 1, Math.min(4, Math.max(2, F.lastRow() - 1))), 'none');
    placeRest(F.lastRow());
  } else if (axis === 'diagonal') {
    // a cascade: each point a step across and a step down, along a band; the head opposite where the cascade ends
    let row = head(lead ? c0 : Math.max(c0, c1 - tSpan + 1), 1);
    if (leadPiece) F.put(leadPiece, Field.cell(lead ? Math.max(c0, c1 - 4) : c0, 5, Math.max(1, row - 1), 1));
    if (quote) {
      F.put(quote, Field.cell(c0 + 1, Math.min(9, width - 1), row, 2));
      if (by) F.put(by, Field.cell(lead ? c1 - 4 : c0, 4, row + 2, 1));
      row += 3;
    }
    if (body) {
      F.put(body, Field.cell(lead ? c0 + 2 : c0, Math.min(8, width - 2), row, body.t === 'flow' ? 3 : 2));
      row += body.t === 'flow' ? 3 : 2;
    }
    const n = units.length;
    const sp = n > 5 ? 3 : 4;
    const first = Math.max(row, 2);
    const reach = Math.max(1, width - sp);
    placeUnits((u, i) => {
      const t = n > 1 ? i / (n - 1) : 0;
      const col = lead ? c0 + Math.round(t * reach) : c1 - sp + 1 - Math.round(t * reach);
      const r0 = first + (n + first - 1 > ROWS ? Math.floor((i * (ROWS - first + 1)) / n) : i);
      return [Field.cell(col, Math.max(sp, u.span - 1), r0, 1), Field.cell(col, sp, r0 + 1, 1)];
    });
    if (n >= 2) F.put({ t: 'shape', form: diagonalBand(form, lead, seed % 97), tone: 'tint', z: 'under', morph: true }, Field.cell(c0, width, first, Math.min(ROWS - first + 1, n + 1)), 'none');
    if (pics.length) {
      const k = F.find(4, 3, (x) => (lead ? -x.col : x.col) * 0.5 + x.row, 'media');
      if (k) F.put(picture(pics[0]), k, 'media');
    }
    placeRest(F.lastRow());
  } else if (axis === 'radial') {
    // about a centre: the picture cut to a radial figure (or the figure itself), the head across or above it, the points
    // set around it at their angles
    const centre = Field.cell(4, 6, 2, 4);
    const centreForm = figure(form, pics.length ? 'mask' : 'mass', shapeK++, salt, ['rings', 'super', 'radial']);
    if (pics.length) F.put({ t: 'image', at: pics[0], ratio: '1:1', fill: true, mask: centreForm, morph: true }, centre, 'media');
    else F.put({ t: 'shape', form: centreForm, tone: opts.loud === 'colour-field' ? 'accent' : 'tint', z: 'under', keep: true, morph: true }, centre, 'media');
    // its echo: the same construction, another seed, a step behind — one silhouette behind another, not a second idea
    if (tr.depth) F.put({ t: 'shape', form: { ...centreForm, seed: centreForm.seed + 1, turn: Math.max(-180, Math.min(180, centreForm.turn + 18)) }, tone: 'line', z: 'under' }, Field.cell(5, 6, 1, 4), 'none');
    const crossing = (tr.role === 'structural' || tr.role === 'editorial') && st.overlap >= 40 && pics.length > 0;
    if (titlePiece && crossing) {
      F.put({ ...(titlePiece as Extract<Piece, { t: 'text' }>), over: 'lines' }, Field.cell(2, Math.min(10, width), 3, 1), 'words');
      if (words.length) F.put(words[0], Field.cell(c0, 4, 1, 1));
    } else head(c0, 1, Math.min(6, tSpan));
    if (leadPiece) F.put(leadPiece, F.find(4, 1, (x) => x.row * 2 - Math.abs(x.col - 1)) ?? Field.cell(1, 4, 8, 1));
    if (quote) {
      const k = F.find(5, 2, (x) => -Math.abs(x.row - 4) - (x.col > 3 && x.col < 9 ? 20 : 0)) ?? Field.cell(1, 5, 7, 2);
      F.put(quote, k);
      if (by) F.put(by, F.find(3, 1, (x) => -Math.abs(x.row - k.row - 2)) ?? Field.cell(9, 3, 8, 1));
    }
    if (body) F.put(body, F.find(body.t === 'flow' ? 6 : 4, body.t === 'flow' ? 3 : 2, (x) => x.row) ?? Field.cell(1, 6, 7, 2));
    const n = units.length;
    const turn = R() * Math.PI * 2;
    placeUnits((u, i) => {
      const a = turn + (i / Math.max(1, n)) * Math.PI * 2;
      const col = Math.round(6.5 + Math.cos(a) * 5 - u.span / 2);
      const row = Math.round(3.5 + Math.sin(a) * 2.6);
      // the nearest free places to that angle, outside the centre
      const out: Cell[] = [];
      for (const [dc, dr] of [[0, 0], [0, 1], [0, -1], [1, 0], [-1, 0], [2, 0], [-2, 0], [0, 2], [0, -2]]) out.push(Field.cell(Math.max(1, Math.min(COLS - u.span + 1, col + dc)), u.span, row + dr, u.rows));
      return out;
    });
    if (action) F.put(action, F.find(3, 1, (x) => x.row) ?? Field.cell(1, 3, 8, 1));
  } else if (axis === 'scattered') {
    // spread across the field: the head at a corner, then each piece where it is farthest from the rest; the places
    // are read in order (top to bottom, left to right) and given to the content in its order
    head(lead ? c0 : Math.max(c0, c1 - tSpan + 1), 1);
    const centres: [number, number][] = F.cells.map((k) => [k.col + k.span / 2, k.row + k.rows / 2]);
    const dist = (k: Cell) => Math.min(...centres.map(([x, y]) => Math.hypot((k.col + k.span / 2 - x) / 2, k.row + k.rows / 2 - y)), 9) + R() * 0.8;
    const spots: Cell[] = [];
    const pieces: { p: Piece; span: number; rows: number }[] = [
      ...(leadPiece ? [{ p: leadPiece, span: 5, rows: 1 }] : []),
      ...(quote ? [{ p: quote, span: 8, rows: 2 }] : []),
      ...(by ? [{ p: by, span: 4, rows: 1 }] : []),
      ...(body ? [{ p: body, span: body.t === 'flow' ? 8 : 5, rows: body.t === 'flow' ? 3 : 2 }] : []),
      ...units.map((u) => ({ p: u.piece, span: u.span, rows: u.rows })),
      ...(action ? [{ p: action, span: 3, rows: 1 }] : []),
    ];
    const ghost = new Field();
    F.cells.forEach((k, i) => ghost.put(F.children[i], k));
    const deep = Math.min(ROWS, 2 + Math.ceil(pieces.length * 0.85) + (pics.length ? 1 : 0));
    for (const x of pieces) {
      const k = ghost.find(x.span, x.rows, (kk) => dist(kk) - kk.row * 0.15, 'words', false, deep) ?? ghost.find(x.span, x.rows, (kk) => dist(kk) - kk.row * 0.15);
      if (!k) continue;
      ghost.put(x.p, Field.cell(Math.max(1, k.col - 1), Math.min(COLS, x.span + 2), k.row, k.rows));
      spots.push(k);
      centres.push([k.col + k.span / 2, k.row + k.rows / 2]);
    }
    spots.sort((a, b) => a.row - b.row || a.col - b.col);
    pieces.slice(0, spots.length).forEach((x, i) => F.put(x.p, spots[i]));
    pics.slice(0, 3).forEach((i, j) => {
      const big = j === 0;
      const k = F.find(big ? 5 : 3, big ? 3 : 2, (kk) => dist(kk) + (big ? kk.row * 0.3 : 0), 'media');
      if (k) {
        F.put(picture(i, big ? '4:3' : '1:1'), k, 'media');
        centres.push([k.col + k.span / 2, k.row + k.rows / 2]);
      }
    });
    for (let e = 0; e < (tr.depth ? 2 : 1); e++) {
      const k = F.find(2, 2, (kk) => dist(kk), 'media');
      if (k) F.put(shape('echo', e === 0 ? 'accent' : 'tint', 'under'), k, 'none');
    }
  } else {
    // layered: a mass as the ground of the field, a picture with its silhouette echoed behind it, the words over the mass
    F.put(shape('mass', 'tint', 'under', [], true), Field.cell(lead ? c0 : Math.max(c0, c1 - 9), Math.min(9, width), 1, 6), 'none');
    let row = head(lead ? c0 + 1 : Math.max(c0, c1 - tSpan), 1, Math.min(tSpan, 9));
    if (leadPiece) F.put(leadPiece, Field.cell(lead ? c0 + 1 : Math.max(c0, c1 - 6), 5, row++, 1));
    if (quote) {
      F.put(quote, Field.cell(lead ? c0 + 1 : c0, 8, row, 2));
      row += 2;
      if (by) F.put(by, Field.cell(lead ? c0 + 1 : c0, 4, row++, 1));
    }
    if (body) {
      F.put(body, Field.cell(lead ? c0 + 1 : c0, Math.min(7, width - 1), row, body.t === 'flow' ? 3 : 2));
      row += body.t === 'flow' ? 3 : 2;
    }
    if (pics.length) {
      const pc = lead ? Math.max(c0, c1 - 5) : c0;
      const k = F.find(5, 4, (x) => -Math.abs(x.col - pc) * 3 - Math.abs(x.row - 2), 'media');
      if (k) {
        F.put(shape('echo', 'accent', 'under'), Field.cell(k.col + (lead ? 1 : -1), k.span, k.row + 1, k.rows), 'none');
        F.put(picture(pics[0], '3:4'), k, 'media');
      }
    }
    placeUnits((u, i) => [Field.cell(lead ? c0 + 1 + (i % 2) * 4 : c0 + (i % 2) * 4, 4, Math.max(row, 3) + Math.floor(i / 2) * (u.rows + 1) + (i % 2), u.rows)]);
    placeRest(F.lastRow());
    if (opts.opening && pics.length && st.bleed >= 60) span = 'bleed';
  }
  if (opts.opening && st.bleed >= 70 && axis !== 'layered') tall = 'screen';
  const root: Piece = { t: 'field', rows, children: F.children, cells: F.cells };
  const said = [
    AXIS_LABEL[axis],
    tr.images === 'shaped' && b.images ? 'pictures cut to its shapes' : tr.images === 'fragmented' && b.images ? 'the picture broken into fragments' : tr.images === 'cropped' && b.images ? 'pictures cropped hard' : '',
    eyebrowDone ? 'a label standing upright' : '',
    size === 'giant' ? 'its title as structure' : '',
    body?.t === 'flow' ? 'words wrapping a shape' : '',
    tr.outline && b.figures.length ? 'numerals in outline' : '',
  ].filter(Boolean);
  return { root, ...(span ? { span } : {}), ...(tall ? { tall } : {}), axis, treatments: tr, label: said.join(' · ') };
}

// ── exploring: alternatives that differ in structure ──────────────────

export interface Alternative extends Composition {
  id: string;
  /** what differs from the part as it is, said plainly */
  differs: string[];
}

/** Nudges a designer can ask of an exploration. */
export const NUDGES = ['asymmetric', 'overlap', 'calmer', 'bolder-type', 'more-shape', 'less-shape'] as const;
export type Nudge = (typeof NUDGES)[number];
export const NUDGE_LABEL: Record<Nudge, string> = { asymmetric: 'More asymmetric', overlap: 'More overlap', calmer: 'Calmer', 'bolder-type': 'Bolder type', 'more-shape': 'More shape', 'less-shape': 'Less shape' };

/** A strategy and system moved by a designer's nudges. */
export function nudged(st: CompositionStrategy, form: FormSystem, nudges: readonly Nudge[]): { st: CompositionStrategy; form: FormSystem } {
  let s2 = { ...st, type: { ...st.type } };
  let f2 = { ...form };
  for (const n of nudges) {
    if (n === 'asymmetric') s2 = { ...s2, grid: 'free', balance: s2.balance === 'start' ? 'end' : 'start', overlap: Math.min(100, s2.overlap + 15) };
    if (n === 'overlap') s2 = { ...s2, overlap: Math.min(100, s2.overlap + 30) };
    if (n === 'calmer') {
      s2 = { ...s2, grid: 'strict', overlap: Math.max(0, s2.overlap - 25), type: { ...s2.type, rotate: 0, vary: false } };
      f2 = { ...f2, energy: Math.max(0, f2.energy - 30), fragment: Math.max(0, f2.fragment - 20) };
    }
    if (n === 'bolder-type') s2 = { ...s2, type: { ...s2.type, role: 'structural' } };
    if (n === 'more-shape') f2 = { ...f2, depth: Math.min(100, f2.depth + 30) };
    if (n === 'less-shape') {
      f2 = { ...f2, depth: Math.max(0, f2.depth - 40) };
      s2 = { ...s2, images: s2.images === 'shaped' || s2.images === 'fragmented' ? 'plain' : s2.images };
    }
  }
  return { st: s2, form: f2 };
}

/**
 * Alternatives for a part that differ in STRUCTURE (another spatial logic, other treatments), not in colour: the
 * strategy's own logic first, then the others in an order of the part's own; none the designer rejected, none the
 * part already is. `signatureOf` is the caller's measure of an arrangement (lib/ux-v0/compose.ts composeSignature).
 */
export function alternativesFor(
  b: Blocks,
  st: CompositionStrategy,
  form: FormSystem,
  opts: { salt: string; opening?: boolean; count?: number; rejected?: readonly string[]; current?: string; nudges?: readonly Nudge[]; round?: number; signatureOf: (p: Piece) => string },
): Alternative[] {
  const { st: s2, form: f2 } = nudged(st, form, opts.nudges ?? []);
  const R = rng(shapeSeed(st.seed, opts.salt, 'explore', opts.round ?? 0));
  const others = AXES.filter((a) => a !== s2.axis).sort(() => R() - 0.5);
  const order = [s2.axis, ...others];
  const variants: Partial<Treatments>[] = [{}, { vertical: !s2.type.vertical }, { images: s2.images === 'shaped' ? 'cropped' : 'shaped' }, { depth: f2.depth < 50 }];
  const out: Alternative[] = [];
  const seen = new Set([...(opts.rejected ?? []), ...(opts.current ? [opts.current] : [])]);
  const want = Math.max(1, Math.min(4, opts.count ?? 3));
  for (const axis of order) {
    for (const v of variants) {
      if (out.length >= want) break;
      const c = composeBlocks(b, s2, f2, { salt: `${opts.salt}|${opts.round ?? 0}|${out.length}`, opening: opts.opening, axis, treatments: v });
      const sig = opts.signatureOf(c.root);
      if (seen.has(sig)) continue;
      seen.add(sig);
      const differs = [axis !== st.axis ? `${AXIS_LABEL[axis]}, where the strategy said ${AXIS_LABEL[st.axis]}` : `${AXIS_LABEL[axis]}, as the strategy says`, ...Object.keys(v).map((k) => (k === 'vertical' ? (v.vertical ? 'a label standing upright' : 'labels set flat') : k === 'images' ? `pictures ${v.images === 'shaped' ? 'cut to its shapes' : 'cropped hard'}` : v.depth ? 'shapes layered behind' : 'no shapes behind'))];
      out.push({ ...c, id: `alt_${shapeSeed(sig).toString(36)}`, differs });
      break;
    }
    if (out.length >= want) break;
  }
  return out;
}

/** Two alternatives combined: where the first places things, with the second's treatments (pictures, labels, shapes). */
export function combineAlternatives(b: Blocks, st: CompositionStrategy, form: FormSystem, a: Alternative, c: Alternative, opts: { salt: string; opening?: boolean }): Composition {
  const out = composeBlocks(b, st, form, { salt: opts.salt, opening: opts.opening, axis: a.axis, treatments: c.treatments });
  return { ...out, label: `${AXIS_LABEL[a.axis]} with ${c.label.split(' · ').slice(1).join(', ') || 'the other’s treatments'}` };
}

/** The strongest construction a system draws with: for labels and tests. */
export const mainKind = (form: FormSystem): ShapeKind => vocabulary(form)[0].kind;

/**
 * A composed part's content read back from its tree (its title, points, figures, quote, words, action), so a part
 * that is already composed can be explored again: the composer rearranges what is there, it never invents copy.
 */
export function blocksOfTree(root: Piece, images: number): Blocks | null {
  const b: Blocks = { items: [], figures: [], bullets: [], images: Math.min(6, images) };
  const walk = (p: Piece) => {
    if (p.t === 'text') {
      if (p.role === 'eyebrow' && !b.eyebrow) b.eyebrow = p.text;
      else if (p.role === 'title' && !b.title) b.title = p.text;
      else if (p.role === 'lead' && !b.lead) b.lead = p.text;
      else if (p.role === 'quote' && !b.quote) b.quote = { text: p.text };
      else if (p.role === 'caption' && b.quote && !b.quote.by) b.quote.by = p.text;
      else if (p.role === 'heading') b.items.push({ title: p.text });
      else if (p.role === 'body') {
        const last = b.items[b.items.length - 1];
        if (last && !last.text) last.text = p.text;
        else b.body = b.body ? `${b.body} ${p.text}`.slice(0, 700) : p.text;
      }
      return;
    }
    if (p.t === 'figure') return void b.figures.push({ value: p.value, label: p.label });
    if (p.t === 'list') return void b.bullets.push(...p.items);
    if (p.t === 'button') return void (b.action ??= p.label);
    if ('children' in p) p.children.forEach(walk);
  };
  walk(root);
  // a heading set as a figure's value (a quiet figure) reads back as a figure
  b.items = b.items.filter((it) => {
    if (/^[\d.,%+£$€x×]+$/.test(it.title) && it.text && it.text.length <= 60 && !b.figures.length) return (b.figures.push({ value: it.title, label: it.text }), false);
    return true;
  });
  return b.title || b.items.length || b.figures.length || b.quote || b.body ? b : null;
}
