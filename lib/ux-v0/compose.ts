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
//
// It is still no code: the model writes the pieces as data, this module holds them to their shape (known
// pieces only, at most four levels deep and 48 pieces, every text capped, pictures by their index among the
// section's own, proportions as small whole numbers), and the renderer turns them into markup from its own
// classes and numbers (lib/ux-v0/render.ts). Nothing the model wrote reaches the page as markup, style or URL.
//
// The engine composes openings from pieces too (composedOpening), its proportions and order drawn per
// project, so a direction can lay a page out in a way no fixed variant does.

export const PIECES = ['stack', 'grid', 'box', 'text', 'figure', 'image', 'button', 'list', 'rule'] as const;
export type PieceKind = (typeof PIECES)[number];
export const TEXT_ROLES = ['eyebrow', 'title', 'heading', 'lead', 'body', 'caption', 'quote'] as const;
export type TextRole = (typeof TEXT_ROLES)[number];
export const GAPS = ['s', 'm', 'l'] as const;
export const PIECE_ALIGNS = ['start', 'center', 'end', 'stretch'] as const;
export const BOX_TONES = ['base', 'alt', 'accent', 'invert'] as const;
export const RATIOS = ['1:1', '4:3', '3:2', '16:9', '3:4', '2:3'] as const;

export type Piece =
  | { t: 'stack'; dir: 'row' | 'col'; gap: (typeof GAPS)[number]; align: (typeof PIECE_ALIGNS)[number]; children: Piece[] }
  | { t: 'grid'; cols: number[]; gap: (typeof GAPS)[number]; align: (typeof PIECE_ALIGNS)[number]; children: Piece[] }
  | { t: 'box'; tone: (typeof BOX_TONES)[number]; pad: (typeof GAPS)[number]; children: Piece[] }
  | { t: 'text'; role: TextRole; text: string }
  | { t: 'figure'; value: string; label: string }
  | { t: 'image'; at: number; ratio: (typeof RATIOS)[number] }
  | { t: 'button'; label: string; style: 'primary' | 'secondary' | 'link' }
  | { t: 'list'; items: string[]; marker: 'none' | 'number' | 'rule' }
  | { t: 'rule' };

/** How long each kind of words may be. */
export const TEXT_MAX: Record<TextRole, number> = { eyebrow: 48, title: 120, heading: 100, lead: 320, body: 700, caption: 160, quote: 320 };
const MAX_DEPTH = 4;
const MAX_PIECES = 48;
const MAX_CHILDREN = 8;

const o = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
const str = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const one = <T extends string>(xs: readonly T[], v: unknown, d: T): T => ((xs as readonly string[]).includes(v as string) ? (v as T) : d);

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
      case 'box': {
        if (depth >= MAX_DEPTH) return null;
        const children = (Array.isArray(r.children) ? r.children : [])
          .slice(0, MAX_CHILDREN)
          .map((c: unknown) => walk(c, depth + 1))
          .filter((c: Piece | null): c is Piece => !!c);
        if (!children.length) return null;
        if (t === 'stack') return { t, dir: r.dir === 'row' ? 'row' : 'col', gap: one(GAPS, r.gap, 'm'), align: one(PIECE_ALIGNS, r.align, 'start'), children };
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
        return text ? { t, role, text } : null;
      }
      case 'figure': {
        const value = str(r.value, 16);
        return value ? { t, value, label: str(r.label, 60) } : null;
      }
      case 'image': {
        const at = Math.round(Number(r.at ?? 0));
        return Number.isFinite(at) && at >= 0 && at <= 5 ? { t, at, ratio: one(RATIOS, r.ratio, '4:3') } : null;
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
    case 'text':
      return p.role;
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
