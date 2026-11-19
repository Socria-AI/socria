// lib/ux-v0/compose.ts — layout pieces: a section composed from stacks, grids and proportions.
//
// The section library draws each kind of section in a handful of fixed layouts. A design that needs another
// arrangement (an opening at 5:7 with a figure beside it, three unequal columns, a caption set against a
// picture) used to have to pick the nearest variant. A COMPOSE section is built from pieces instead:
//
//   stack    a row or a column of pieces, with a gap and an alignment
//   grid     columns in proportion (say 5 : 7, or 2 : 1 : 1), a gap, an alignment
//   box      pieces set on a ground of their own (the page's, the alternate, the accent, inverted)
//   text     an eyebrow, a title, a heading, a lead, body text, a caption or a quote
//   figure   a value and its label (a number set large)
//   image    one of the section's pictures, at a proportion
//   button   a primary or secondary action, or a link
//   list     a few short items, plain, numbered or ruled
//   rule     a line
//   layer    pieces in one place, one over another: a ground (a picture, a box) and what sits over it, anchored
//            to a corner, an edge or the centre — words over a picture, a caption plate on a photograph
//   field    a twelve-column field on which each piece is placed by hand: its first column, how many it spans,
//            its row and how many rows — pieces may overlap, sit off-axis, leave columns empty; the arrangement
//            is the designer's or the model's own, not one of a list
//
// A title or heading can be set at display size (l, xl, giant) and aligned; a column can be pinned while the one
// beside it scrolls past; a picture can fill its cell. Where words placed on a field overlap a picture they are
// always drawn above it, on a plate of the page's ground (a title that asks is set line by line on strips of it instead), so an
// overlap is never an accident that hides text. Below 900 px a field reads as one column, in its written order.
//
// It is still no code: the model writes the pieces as data, this module holds them to their shape (known
// pieces only, at most four levels deep and 48 pieces, every text capped, pictures by their index among the
// section's own, proportions as small whole numbers), and the renderer turns them into markup from its own
// classes and numbers (lib/ux-v0/render.ts). Nothing the model wrote reaches the page as markup, style or URL.
//
// The engine composes openings from pieces too (composedOpening), its proportions and order drawn per
// project, so a direction can lay a page out in a way no fixed variant does.

export const PIECES = ['stack', 'grid', 'box', 'text', 'figure', 'image', 'button', 'list', 'rule', 'layer', 'field'] as const;
export type PieceKind = (typeof PIECES)[number];
export const TEXT_ROLES = ['eyebrow', 'title', 'heading', 'lead', 'body', 'caption', 'quote'] as const;
export type TextRole = (typeof TEXT_ROLES)[number];
export const GAPS = ['s', 'm', 'l'] as const;
export const PIECE_ALIGNS = ['start', 'center', 'end', 'stretch'] as const;
export const BOX_TONES = ['base', 'alt', 'accent', 'invert'] as const;
export const RATIOS = ['1:1', '4:3', '3:2', '16:9', '3:4', '2:3', '21:9'] as const;
export const PLACES = ['top-start', 'top', 'top-end', 'start', 'center', 'end', 'bottom-start', 'bottom', 'bottom-end'] as const;
export type Place = (typeof PLACES)[number];
export const TEXT_SIZES = ['l', 'xl', 'giant'] as const;
export const TEXT_ALIGNS = ['center', 'end'] as const;
/** where a piece sits on a field: its first column (1–12), the columns it spans, its first row (1–8), the rows it spans */
export interface Cell {
  col: number;
  span: number;
  row: number;
  rows: number;
}

export type Piece =
  | { t: 'stack'; dir: 'row' | 'col'; gap: (typeof GAPS)[number]; align: (typeof PIECE_ALIGNS)[number]; children: Piece[]; /** held in view while the column beside it scrolls */ pin?: true }
  | { t: 'grid'; cols: number[]; gap: (typeof GAPS)[number]; align: (typeof PIECE_ALIGNS)[number]; children: Piece[] }
  | { t: 'box'; tone: (typeof BOX_TONES)[number]; pad: (typeof GAPS)[number]; children: Piece[] }
  | { t: 'text'; role: TextRole; text: string; /** a title or heading at display size */ size?: (typeof TEXT_SIZES)[number]; align?: (typeof TEXT_ALIGNS)[number]; /** over a picture on a field: set line by line on strips of the ground, the picture showing between, rather than on one plate (a title only) */ over?: 'lines' }
  | { t: 'figure'; value: string; label: string }
  | { t: 'image'; at: number; ratio: (typeof RATIOS)[number]; /** fills the place it is given (a layer's ground, a field's cell) rather than keeping its ratio */ fill?: true }
  | { t: 'button'; label: string; style: 'primary' | 'secondary' | 'link' }
  | { t: 'list'; items: string[]; marker: 'none' | 'number' | 'rule' }
  | { t: 'rule' }
  | { t: 'layer'; place: Place; inset: (typeof GAPS)[number]; children: Piece[] }
  | { t: 'field'; rows: (typeof GAPS)[number]; children: Piece[]; cells: Cell[] };

/** How long each kind of words may be. */
export const TEXT_MAX: Record<TextRole, number> = { eyebrow: 48, title: 120, heading: 100, lead: 320, body: 700, caption: 160, quote: 320 };
const MAX_DEPTH = 4;
const MAX_PIECES = 48;
const MAX_CHILDREN = 8;

const o = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
const str = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const one = <T extends string>(xs: readonly T[], v: unknown, d: T): T => ((xs as readonly string[]).includes(v as string) ? (v as T) : d);

const int = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
};
/** A cell as written ([col, span, row, rows] or {col, span, row, rows}), held inside the twelve columns and eight rows. */
function cellOf(v: unknown, i: number): Cell {
  const a = Array.isArray(v) ? v : v && typeof v === 'object' ? [(v as any).col, (v as any).span, (v as any).row, (v as any).rows] : [];
  const col = int(a[0], 1, 12, 1);
  const span = int(a[1], 1, 13 - col, 13 - col);
  const row = int(a[2], 1, 8, i + 1);
  return { col, span, row, rows: int(a[3], 1, 9 - row, 1) };
}

const hasText = (p: Piece): boolean => p.t === 'text' || p.t === 'figure' || p.t === 'list' || p.t === 'button' || ('children' in p && p.children.some(hasText));
/** A piece that is a picture or a ground of its own: what words must never be hidden behind. */
const isMedia = (p: Piece): boolean => p.t === 'image' || p.t === 'box' || (p.t === 'layer' && isMedia(p.children[0])) || (p.t === 'stack' && p.children.every(isMedia));
const meet = (a: Cell, b: Cell) => a.col < b.col + b.span && b.col < a.col + a.span && a.row < b.row + b.rows && b.row < a.row + a.rows;

/**
 * How each piece of a field is drawn: `media` (a picture or a ground: beneath), and for words `over` — they share
 * columns and rows with a picture, so they are drawn above it, on a plate of the page's ground unless a title asks
 * to be set line by line. Words never end up behind a picture, whatever order the pieces were written in.
 */
export function fieldLayers(f: Extract<Piece, { t: 'field' }>): { media: boolean; over: boolean; lines: boolean }[] {
  return f.children.map((ch, i) => {
    const media = isMedia(ch);
    const over = !media && hasText(ch) && f.children.some((x, j) => j !== i && isMedia(x) && x.t !== 'box' && meet(f.cells[i], f.cells[j]));
    return { media, over, lines: over && ch.t === 'text' && ch.over === 'lines' };
  });
}

/** Whether a tree places pieces over one another (a layer, or a field whose cells meet): for the plan and the measures. */
export function overlapsIn(p: Piece): boolean {
  if (p.t === 'layer') return true;
  if (p.t === 'field' && p.cells.some((a, i) => p.cells.some((b, j) => j > i && meet(a, b)))) return true;
  return 'children' in p && p.children.some(overlapsIn);
}

/** A tree of pieces held to its shape, or null when nothing in it can be drawn. */
export function normalizeCompose(v: unknown): Piece | null {
  let count = 0;
  let titles = 0;
  const walk = (raw: unknown, depth: number): Piece | null => {
    if (count >= MAX_PIECES) return null;
    const r = o(raw);
    const t = r.t ?? r.type;
    count++;
    switch (t) {
      case 'stack':
      case 'grid':
      case 'box':
      case 'layer':
      case 'field': {
        if (depth >= MAX_DEPTH) return null;
        const raws: unknown[] = (Array.isArray(r.children) ? r.children : []).slice(0, MAX_CHILDREN);
        // each child with where it was written to sit (a field's cells are kept beside its children)
        const kept = raws.map((c) => [walk(c, depth + 1), c] as const).filter((x): x is readonly [Piece, unknown] => !!x[0]);
        const children = kept.map((x) => x[0]);
        if (!children.length) return null;
        if (t === 'layer') return children.length > 1 ? { t, place: one(PLACES, r.place, 'bottom-start'), inset: one(GAPS, r.inset, 'm'), children: children.slice(0, 4) } : children[0];
        if (t === 'field') {
          const storedCells: unknown[] = Array.isArray(r.cells) ? r.cells : [];
          const cells = kept.map(([, raw], i) => cellOf(o(raw).cell ?? storedCells[i], i));
          return { t, rows: one(GAPS, r.rows, 'm'), children, cells };
        }
        if (t === 'stack') return { t, dir: r.dir === 'row' ? 'row' : 'col', gap: one(GAPS, r.gap, 'm'), align: one(PIECE_ALIGNS, r.align, 'start'), children, ...(r.pin === true && r.dir !== 'row' ? { pin: true as const } : {}) };
        if (t === 'box') return { t, tone: one(BOX_TONES, r.tone, 'alt'), pad: one(GAPS, r.pad, 'm'), children };
        const cols = (Array.isArray(r.cols) ? r.cols : [1, 1])
          .map((n: unknown) => Math.round(Number(n)))
          .filter((n: number) => Number.isFinite(n) && n >= 1 && n <= 12)
          .slice(0, 4);
        return { t, cols: cols.length ? cols : [1, 1], gap: one(GAPS, r.gap, 'm'), align: one(PIECE_ALIGNS, r.align, 'start'), children };
      }
      case 'text': {
        let role = one(TEXT_ROLES, r.role, 'body');
        // one title per section: it is its heading; any other becomes a heading under it
        if (role === 'title' && titles++ > 0) role = 'heading';
        const text = str(r.text, TEXT_MAX[role]);
        const display = role === 'title' || role === 'heading' || role === 'quote';
        const size = display && (TEXT_SIZES as readonly string[]).includes(r.size) ? { size: r.size as (typeof TEXT_SIZES)[number] } : {};
        const align = (TEXT_ALIGNS as readonly string[]).includes(r.align) ? { align: r.align as (typeof TEXT_ALIGNS)[number] } : {};
        return text ? { t, role, text, ...size, ...align, ...((r.over === 'lines' || r.over === 'blend') && role === 'title' ? { over: 'lines' as const } : {}) } : null;
      }
      case 'figure': {
        const value = str(r.value, 16);
        return value ? { t, value, label: str(r.label, 60) } : null;
      }
      case 'image': {
        const at = Math.round(Number(r.at ?? 0));
        return Number.isFinite(at) && at >= 0 && at <= 5 ? { t, at, ratio: one(RATIOS, r.ratio, '4:3'), ...(r.fill === true ? { fill: true as const } : {}) } : null;
      }
      case 'button': {
        const label = str(r.label, 40);
        return label ? { t, label, style: one(['primary', 'secondary', 'link'] as const, r.style, 'primary') } : null;
      }
      case 'list': {
        const items = (Array.isArray(r.items) ? r.items : []).map((x: unknown) => str(x, 120)).filter(Boolean).slice(0, 8);
        return items.length ? { t, items, marker: one(['none', 'number', 'rule'] as const, r.marker, 'none') } : null;
      }
      case 'rule':
        return { t: 'rule' };
      default:
        return null;
    }
  };
  return walk(v, 0);
}

/** Every picture index a tree draws. */
export function imagesIn(p: Piece): number[] {
  if (p.t === 'image') return [p.at];
  return 'children' in p ? p.children.flatMap(imagesIn) : [];
}

/** A tree's structure, for the diversity measure: its pieces and proportions (lib/ux-v0/structure.ts). */
export function composeSignature(p: Piece): string {
  switch (p.t) {
    case 'grid':
      return `grid(${p.cols.join(':')})[${p.children.map(composeSignature).join(',')}]`;
    case 'stack':
      return `${p.dir}[${p.children.map(composeSignature).join(',')}]`;
    case 'box':
      return `box-${p.tone}[${p.children.map(composeSignature).join(',')}]`;
    case 'layer':
      return `layer-${p.place}[${p.children.map(composeSignature).join(',')}]`;
    case 'field':
      return `field[${p.children.map((c, i) => `${p.cells[i].col}+${p.cells[i].span}@${p.cells[i].row}:${composeSignature(c)}`).join(',')}]`;
    case 'text':
      return p.size ? `${p.role}-${p.size}` : p.role;
    case 'image':
      return `img${p.ratio.replace(':', 'x')}`;
    default:
      return p.t;
  }
}

/** The words at a path inside a tree ("children.1.text"), and how long they may be: for editing them in place. */
export function treeTextAt(root: unknown, parts: readonly string[]): { value: string; max: number } | null {
  let node: any = root;
  for (let i = 0; i < parts.length; i++) {
    const k = parts[i];
    if (node == null || typeof node !== 'object') return null;
    const last = i === parts.length - 1;
    if (last) {
      const v = node[k];
      if (typeof v !== 'string') return null;
      if (k === 'text' && TEXT_ROLES.includes(node.role)) return { value: v, max: TEXT_MAX[node.role as TextRole] };
      if (k === 'value' && node.t === 'figure') return { value: v, max: 16 };
      if (k === 'label' && (node.t === 'figure' || node.t === 'button')) return { value: v, max: node.t === 'figure' ? 60 : 40 };
      if (/^\d+$/.test(k) && Array.isArray(node) && parts[i - 1] === 'items') return { value: v, max: 120 };
      return null;
    }
    node = /^\d+$/.test(k) ? (Array.isArray(node) ? node[+k] : undefined) : node[k];
  }
  return null;
}

// ── the engine's own composed openings ────────────────────────────────

// two columns at a considered proportion; a sharply uneven one (a column a third wide) only when it is the plan's move
const PROPORTIONS: readonly number[][] = [[5, 7], [7, 5], [3, 2], [2, 3], [5, 4], [4, 5]];
const SHARP: readonly number[][] = [[1, 2], [2, 1]];

/** The narrower column's share when a tree opens as two columns side by side, else null: for the plan's measure. */
export function splitShare(p: unknown): number | null {
  const g = p && typeof p === 'object' ? (p as Record<string, any>) : null;
  if (!g || g.t !== 'grid' || !Array.isArray(g.cols) || g.cols.length !== 2) return null;
  const [a, b] = g.cols.map(Number);
  return a > 0 && b > 0 ? Math.min(a, b) / (a + b) : null;
}

export interface OpeningWords {
  eyebrow?: string;
  title: string;
  lead?: string;
  action?: string;
  /** a figure only this subject has (a value and its label), when there is one */
  figure?: { value: string; label: string };
  /** the subject's own detail, set as a caption */
  detail?: string;
}

/**
 * An opening composed from pieces, its arrangement drawn per project: words beside a picture at an uneven
 * proportion, either side; a figure set large beside the words; a caption set against the picture; words over
 * a box of their own. Different projects, different openings — not a variant picked from a list.
 */
export function composedOpening(w: OpeningWords, hasImage: boolean, r: () => number, move?: string): Piece {
  const pick = <T,>(xs: readonly T[]) => xs[Math.min(xs.length - 1, Math.floor(r() * xs.length))];
  const words: Piece[] = [
    ...(w.eyebrow ? [{ t: 'text', role: 'eyebrow', text: w.eyebrow } as Piece] : []),
    { t: 'text', role: 'title', text: w.title },
    ...(w.lead ? [{ t: 'text', role: 'lead', text: w.lead } as Piece] : []),
    ...(w.action ? [{ t: 'stack', dir: 'row', gap: 's', align: 'start', children: [{ t: 'button', label: w.action, style: 'primary' }] } as Piece] : []),
  ];
  const text: Piece = { t: 'stack', dir: 'col', gap: pick(['s', 'm'] as const), align: 'start', children: words };
  const cols = pick(move === 'uneven-split' ? SHARP : PROPORTIONS);
  const side = r() < 0.5;
  if (hasImage) {
    const picture: Piece = w.detail
      ? { t: 'stack', dir: 'col', gap: 's', align: 'stretch', children: [{ t: 'image', at: 0, ratio: pick(['4:3', '3:2', '3:4', '1:1'] as const) }, { t: 'text', role: 'caption', text: w.detail }] }
      : { t: 'image', at: 0, ratio: pick(['4:3', '3:2', '3:4', '1:1'] as const) };
    return { t: 'grid', cols, gap: pick(['m', 'l'] as const), align: pick(['end', 'start', 'center'] as const), children: side ? [text, picture] : [picture, text] };
  }
  if (w.figure) {
    const fig: Piece = { t: 'box', tone: pick(['alt', 'base'] as const), pad: 'l', children: [{ t: 'figure', value: w.figure.value, label: w.figure.label }] };
    return { t: 'grid', cols, gap: 'l', align: pick(['end', 'center'] as const), children: side ? [text, fig] : [fig, text] };
  }
  const aside: Piece = w.detail ? { t: 'stack', dir: 'col', gap: 's', align: 'start', children: [{ t: 'rule' }, { t: 'text', role: 'caption', text: w.detail }] } : { t: 'rule' };
  return { t: 'grid', cols, gap: 'l', align: 'end', children: side ? [text, aside] : [aside, text] };
}

/**
 * An opening in an arrangement a creative reading asked for (lib/ux-v0/interpret.ts), its particulars drawn per
 * project: LAYERED, the words laid over the picture; OVERLAP, a field with the title at display size crossing the
 * picture; OFFSET, a field with the title set off-axis and columns left empty on purpose. Without a picture a
 * layered or overlapping opening has nothing to cross, so it is set off-axis instead.
 */
export function arrangedOpening(w: OpeningWords, hasImage: boolean, r: () => number, arrange: 'layered' | 'overlap' | 'offset', display: 'xl' | 'giant' = 'xl'): Piece {
  const pick = <T,>(xs: readonly T[]) => xs[Math.min(xs.length - 1, Math.floor(r() * xs.length))];
  const side = r() < 0.5;
  // a display size is for few words: a long title steps down, so the opening still fits one screen
  const len = w.title.trim().length;
  const fitted: 'l' | 'xl' | 'giant' = len > 44 ? 'l' : len > 24 && display === 'giant' ? 'xl' : display;
  const title: Piece = { t: 'text', role: 'title', text: w.title, size: fitted };
  const rest: Piece[] = [
    ...(w.lead ? [{ t: 'text', role: 'lead', text: w.lead } as Piece] : []),
    ...(w.action ? [{ t: 'button', label: w.action, style: 'primary' } as Piece] : []),
  ];
  const below: Piece | null = rest.length ? { t: 'stack', dir: 'col', gap: 's', align: 'start', children: rest } : null;
  const detail: Piece | null = w.detail ? { t: 'text', role: 'caption', text: w.detail } : null;
  if (arrange === 'layered' && hasImage) {
    const words: Piece = { t: 'stack', dir: 'col', gap: 's', align: 'start', children: [...(w.eyebrow ? [{ t: 'text', role: 'eyebrow', text: w.eyebrow } as Piece] : []), title, ...rest] };
    return { t: 'layer', place: pick(['bottom-start', 'start', 'bottom-start'] as const), inset: 'l', children: [{ t: 'image', at: 0, ratio: pick(['21:9', '16:9'] as const), fill: true }, words] };
  }
  const children: Piece[] = [];
  const cells: Cell[] = [];
  const put = (p: Piece | null, col: number, span: number, row: number, rows: number) => {
    if (!p) return;
    children.push(p);
    cells.push({ col, span, row, rows });
  };
  if (arrange !== 'offset' && hasImage) {
    // the picture to one side, four rows tall; the title across its inner edge; the rest in the corner it leaves free
    const wide = pick([7, 6] as const);
    put({ t: 'image', at: 0, ratio: '4:3', fill: true }, side ? 13 - wide : 1, wide, 1, 4);
    put({ ...title, over: 'lines' } as Piece, side ? 1 : 4, 9, 2, 2);
    put(below, side ? 1 : 9, 4, 4, 1);
    put(detail, side ? 9 : 1, 4, 5, 1);
    return { t: 'field', rows: pick(['m', 'l'] as const), children, cells };
  }
  // off-axis: the title starts a few columns in; the rest sits low on the other side; a small picture, if any, holds a corner
  const start = pick([2, 3, 4] as const);
  put(title, side ? start : 1, 13 - start, 1, 2);
  if (hasImage) put({ t: 'image', at: 0, ratio: pick(['3:4', '1:1'] as const) }, side ? 1 : 10, 3, 3, 2);
  put(below, side ? 8 : 1, 5, 3, 1);
  put(detail, side ? (hasImage ? 5 : 1) : 7, 3, hasImage ? 4 : 3, 1);
  return { t: 'field', rows: 'm', children, cells };
}
