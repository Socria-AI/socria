// lib/ux-v0/boards/layout.ts — a board arranged as a presentation: sections with headings, materials at sizes that
// suit their formats, the notes under what they explain, the design system beside it all.
//
// Materials are shown at presentation sizes on the board (a poster 640 units tall, a post 560 square, a website
// 1100 wide); this never changes a material's own dimensions or composition. Layouts: an editorial campaign overview
// (a title, sections for print, social, digital and mockups, the system beside them), plain sections, a grid, a
// given number of rows, one sequence. Locked nodes stay exactly where they are and nothing is placed over them.

import { aspectOf, bounds, overlaps, ARRANGEMENTS, type Arrangement, type BoardNode, type BoardOp, type BoardState, type HeadingNode, type Material, type NoteNode } from './model';

export { ARRANGEMENTS, type Arrangement };

const GAP = 72;
const LABEL = 56;
const SECTION_GAP = 150;
const MAX_ROW = 3600;
const NOTE_W = 300;

/** A material's size on the board (not its own size). `scale` makes them larger or smaller on the board only. */
export function presentSize(m: Material, scale = 1): { w: number; h: number } {
  const ar = aspectOf(m);
  let w: number;
  let h: number;
  if (m.type === 'website') (w = m.view === 'mobile' ? 360 : 1100), (h = w / ar);
  else if (m.type === 'mockup') (h = 700), (w = h * ar);
  else if (ar < 0.9) (h = 640), (w = h * ar);
  else if (ar <= 1.15) (w = 560), (h = w / ar);
  else (w = Math.min(1100, 520 * Math.sqrt(ar) * 1.35)), (h = w / ar);
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

/** Which section a material belongs to. */
export function sectionOf(m: Material): 'print' | 'social' | 'digital' | 'mockups' {
  if (m.type === 'mockup') return 'mockups';
  if (m.type === 'website') return 'digital';
  if (['social', 'carousel', 'ad', 'announcement'].includes(m.brief.kind)) return 'social';
  if (['banner', 'presentation'].includes(m.brief.kind)) return 'digital';
  return 'print';
}
const SECTION_TITLE = { print: 'Print', social: 'Social', digital: 'Digital', mockups: 'In use' } as const;

/** A note's height for its words at its width (about 8.4 units a character at 15-unit type, 22-unit lines). */
export const noteHeight = (text: string, w: number) => Math.max(64, Math.ceil(text.length / Math.max(12, (w - 32) / 8.4)) * 22 + 34);

/**
 * The operations that arrange a board (see the head of this file). `only` limits it to some material nodes (the
 * others stay); `rows` is for the rows arrangement; `scale` sets the materials' sizes on the board.
 */
export function arrange(b: BoardState, how: Arrangement, opts: { rows?: number; only?: readonly string[]; scale?: Record<string, number>; keepSizes?: boolean; sizes?: Record<string, { w: number; h: number }> } = {}): BoardOp[] {
  const ops: BoardOp[] = [{ op: 'arrangement', how }];
  const locked = b.nodes.filter((n) => n.locked);
  const materialNodes = b.nodes.filter((n) => n.type === 'material' && !n.locked && (!opts.only || opts.only.includes(n.id)));
  const mOf = (n: BoardNode) => (n.type === 'material' ? b.materials.find((m) => m.id === n.material) : undefined);
  // the notes that travel with each material: generated ones and the designer's, placed under it
  const notesFor = (nodeId: string) => b.nodes.filter((n): n is NoteNode => n.type === 'note' && n.about === nodeId && !n.locked);
  const sized = materialNodes
    .map((n) => {
      const m = mOf(n)!;
      const s = opts.sizes?.[n.id] ?? (opts.keepSizes ? { w: n.w, h: n.h } : presentSize(m, opts.scale?.[n.id] ?? 1));
      return { n, m, ...s };
    })
    .filter((x) => !!x.m);
  const editorial = how === 'editorial' || how === 'sections';
  const heads = new Map<string, HeadingNode>(b.nodes.filter((n): n is HeadingNode => n.type === 'heading').map((n) => [n.id, n]));
  const heading = (id: string, text: string, level: 1 | 2, x: number, y: number, w: number) => {
    const h = level === 1 ? 92 : 52;
    const cur = heads.get(id);
    if (cur && cur.locked) return;
    if (cur) {
      ops.push({ op: 'node-set', id, x, y, w, h });
      if (cur.text !== text) ops.push({ op: 'node-update', id, set: { text } });
    } else ops.push({ op: 'node-add', node: { id, type: 'heading', text, level, x, y, w, h } });
  };
  const notesH = (x: { n: BoardNode; w: number }) => notesFor(x.n.id).reduce((s, note) => s + noteHeight(note.text, Math.max(NOTE_W, x.w)) + 20, 0);
  const span = (it: (typeof sized)[number]) => Math.max(it.w, notesFor(it.n.id).length ? NOTE_W : 0);
  const placeRow = (items: typeof sized, x0: number, y0: number, maxW = MAX_ROW) => {
    let x = x0;
    let y = y0;
    let rowH = 0;
    let widest = 0;
    for (const it of items) {
      if (x > x0 && x + it.w > x0 + maxW) {
        y += rowH + GAP;
        x = x0;
        rowH = 0;
      }
      ops.push({ op: 'node-set', id: it.n.id, x, y, w: it.w, h: it.h });
      let ny = y + it.h + LABEL;
      for (const note of notesFor(it.n.id)) {
        const nw = Math.max(NOTE_W, it.w);
        const nh = noteHeight(note.text, nw);
        ops.push({ op: 'node-set', id: note.id, x, y: ny, w: nw, h: nh });
        ny += nh + 20;
      }
      rowH = Math.max(rowH, it.h + LABEL + notesH(it));
      x += span(it) + GAP;
      widest = Math.max(widest, x - GAP - x0);
    }
    return { bottom: y + rowH, widest };
  };

  let y = 0;
  let widest = 0;
  if (editorial) {
    const title = b.brief?.name ?? b.system?.name ?? 'Board';
    heading('hTitle', title, 1, 0, 0, 1800);
    const count = b.materials.length;
    heading('hSub', `${count} material${count === 1 ? '' : 's'} in one design system${b.system ? ` · direction: ${b.system.direction.name}` : ''}`, 2, 0, 104, 1800);
    y = 230;
    // the sections side by side on shelves no wider than MAX_ROW (a section too wide for one shelf wraps within itself)
    let sx0 = 0;
    let shelfH = 0;
    for (const sec of ['print', 'social', 'digital', 'mockups'] as const) {
      const items = sized.filter((s) => sectionOf(s.m) === sec);
      if (!items.length) continue;
      const natural = Math.min(MAX_ROW, items.reduce((w, it) => w + span(it) + GAP, -GAP));
      if (sx0 > 0 && sx0 + natural > MAX_ROW) {
        y += shelfH + SECTION_GAP;
        sx0 = 0;
        shelfH = 0;
      }
      heading(`hSec${sec}`, SECTION_TITLE[sec], 2, sx0, y, Math.max(320, Math.min(900, natural)));
      const r = placeRow(items, sx0, y + 84, natural);
      shelfH = Math.max(shelfH, r.bottom - y);
      widest = Math.max(widest, sx0 + r.widest);
      sx0 += r.widest + SECTION_GAP;
    }
    y += shelfH + SECTION_GAP;
    // the design system beside it all, its notes under it
    const sys = b.nodes.find((n) => n.type === 'system');
    if (sys && !sys.locked) {
      const sx = Math.max(widest, 1800) + 220;
      ops.push({ op: 'node-set', id: sys.id, x: sx, y: 230, w: 960, h: 640 });
      heading('hSecsystem', 'The design system', 2, sx, 146, 960);
      let ny = 230 + 640 + LABEL;
      for (const note of notesFor(sys.id)) {
        const nh = noteHeight(note.text, 960);
        ops.push({ op: 'node-set', id: note.id, x: sx, y: ny, w: 960, h: nh });
        ny += nh + 20;
      }
    }
  } else {
    // the title stays at the top; section headings belong to the sectioned arrangements and are put away
    const title = heads.get('hTitle');
    const sub = heads.get('hSub');
    if (title && !title.locked) ops.push({ op: 'node-set', id: title.id, x: 0, y: 0 });
    if (sub && !sub.locked) ops.push({ op: 'node-set', id: sub.id, x: 0, y: 104 });
    const sections = [...heads.values()].filter((h) => h.id.startsWith('hSec') && !h.locked).map((h) => h.id);
    if (sections.length) ops.push({ op: 'node-remove', ids: sections });
    y = title || sub ? 230 : 0;
    const n = sized.length;
    if (how === 'sequence') widest = placeRow(sized, 0, y, Infinity).widest;
    else {
      const rows = how === 'rows' ? Math.max(1, Math.min(n, opts.rows ?? 2)) : Math.max(1, Math.round(Math.sqrt(n)));
      const per = Math.ceil(n / rows);
      for (let r = 0; r < rows; r++) {
        const items = sized.slice(r * per, r * per + per);
        if (!items.length) break;
        // each row in one line (no wrapping), its height the tallest of it
        let x = 0;
        let rowH = 0;
        for (const it of items) {
          ops.push({ op: 'node-set', id: it.n.id, x, y, w: it.w, h: it.h });
          let ny = y + it.h + LABEL;
          for (const note of notesFor(it.n.id)) {
            const nw = Math.max(NOTE_W, it.w);
            const nh = noteHeight(note.text, nw);
            ops.push({ op: 'node-set', id: note.id, x, y: ny, w: nw, h: nh });
            ny += nh + 20;
          }
          rowH = Math.max(rowH, it.h + LABEL + notesH(it));
          x += Math.max(it.w, notesFor(it.n.id).length ? NOTE_W : 0) + GAP;
        }
        widest = Math.max(widest, x - GAP);
        y += rowH + GAP * 1.5;
      }
    }
    // the design system beside them, its notes under it
    const sys = b.nodes.find((nd) => nd.type === 'system');
    if (sys && !sys.locked && (!opts.only || opts.only.includes(sys.id))) {
      const sx = Math.max(widest, 1200) + 220;
      const top = title || sub ? 230 : 0;
      ops.push({ op: 'node-set', id: sys.id, x: sx, y: top, w: 960, h: 640 });
      let ny = top + 640 + LABEL;
      for (const note of notesFor(sys.id)) {
        const nh = noteHeight(note.text, 960);
        ops.push({ op: 'node-set', id: note.id, x: sx, y: ny, w: 960, h: nh });
        ny += nh + 20;
      }
    }
  }
  // nothing placed over what is locked: if the arrangement meets a locked node, it moves clear below everything locked
  if (locked.length) {
    const placed = ops.filter((op): op is Extract<BoardOp, { op: 'node-set' }> => op.op === 'node-set').map((op) => ({ x: op.x ?? 0, y: op.y ?? 0, w: op.w ?? 0, h: op.h ?? 0 }));
    if (placed.some((p) => locked.some((l) => overlaps(p, l, 24)))) {
      const lb = bounds(locked);
      const dy = lb.y + lb.h + 200 - Math.min(...placed.map((p) => p.y));
      for (const op of ops) if (op.op === 'node-set' && op.y !== undefined) op.y += dy;
      for (const op of ops) if (op.op === 'node-add') (op.node as { y: number }).y += dy;
    }
  }
  return ops;
}

/** Overlaps between the things on a board (a material over a material, a note over a material…). */
export function collisions(b: BoardState): [BoardNode, BoardNode][] {
  const out: [BoardNode, BoardNode][] = [];
  const ns = b.nodes.filter((n) => n.type !== 'heading' || n.level === 1);
  for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) if (overlaps(ns[i], ns[j], -2) && !(ns[i].group && ns[i].group === ns[j].group)) out.push([ns[i], ns[j]]);
  return out;
}
