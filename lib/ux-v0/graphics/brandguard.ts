// lib/ux-v0/graphics/brandguard.ts — a design system's hard rules resolved in a composed document, before it is shown.
//
//   palette only   a colour the composition made that is not in the system (a tint, a mix) goes to the system colour
//                  nearest it; a text colour to the nearest one that still reads on its ground
//   clear space    an approved logo with something inside its clear space is first scaled down (never below its
//                  minimum size); if that is not enough, a panel of the ground is set behind it, the logo on top
//
// Only identity is touched: positions, sizes and every other composition decision stay as the engine made them, and
// the approved logo itself is never recoloured or distorted. Kept free of the design-system modules, so boards and
// graphics can call it alike.

import { contrastRatio } from '../../ux/audit';
import type { Artboard, GraphicDoc, ImageNode, Node, ShapeNode, TextNode } from './doc';

const hex7 = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{6}/i.test(v) ? v.slice(0, 7).toLowerCase() : null);
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const dist = (a: string, b: string) => {
  const [p, q] = [rgb(a), rgb(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};
const nearest = (h: string, palette: readonly string[]) => palette.reduce((best, p) => (dist(p, h) < dist(best, h) ? p : best), palette[0]);

/** The colour under a node's centre: the topmost filled shape drawn before it that covers that point, else the ground. */
export function backdropAt(b: Pick<Artboard, 'children' | 'background'>, node: Node): string {
  const cx = node.x + node.w / 2;
  const cy = node.y + node.h / 2;
  const idx = b.children.findIndex((n) => n.id === node.id);
  for (let i = (idx < 0 ? b.children.length : idx) - 1; i >= 0; i--) {
    const n = b.children[i];
    if (n.type !== 'shape' || (n.opacity ?? 1) < 0.6 || n.rotation) continue;
    const f = hex7((n as ShapeNode).fill);
    if (f && cx >= n.x && cx <= n.x + n.w && cy >= n.y && cy <= n.y + n.h) return f;
  }
  return hex7(b.background) ?? '#ffffff';
}

/** Off-palette colours moved to the system's (see the head of this file); linked logos and pictures untouched. */
export function snapToPalette(doc: GraphicDoc, palette: readonly string[], opts: { tolerance?: number; minContrast?: number } = {}): { doc: GraphicDoc; changed: number } {
  const pal = [...new Set(palette.map(hex7).filter((x): x is string => !!x))];
  if (!pal.length) return { doc, changed: 0 };
  const tol = opts.tolerance ?? 10;
  const minC = opts.minContrast ?? 4.5;
  let changed = 0;
  const near = (h: string) => pal.some((p) => dist(p, h) <= tol);
  const fixNodes = (nodes: Node[], ground: string, board?: Pick<Artboard, 'children' | 'background'>, texts = true, shapes = true): Node[] =>
    nodes.map((n): Node => {
      if (n.link) return n;
      if (n.type === 'group') return { ...n, children: fixNodes(n.children, ground, undefined, texts, shapes) };
      if (n.type === 'text') {
        if (!texts) return n;
        const t = n as TextNode;
        const c = hex7(t.color);
        if (!c || near(c)) return n;
        const need = t.size >= 24 ? 3 : minC;
        // readable on what is really under the words (a shape, else the ground)
        const under = board ? backdropAt(board, n) : ground;
        const readable = pal.filter((p) => contrastRatio(p, under) >= need);
        const to = readable.length ? nearest(c, readable) : pal.reduce((b, p) => (contrastRatio(p, under) > contrastRatio(b, under) ? p : b), pal[0]);
        changed++;
        return { ...t, color: to };
      }
      if (n.type === 'shape') {
        if (!shapes) return n;
        const s = n as ShapeNode;
        const next: ShapeNode = { ...s };
        let touched = false;
        const f = hex7(s.fill);
        if (f && !near(f)) {
          next.fill = nearest(f, pal);
          touched = true;
        }
        const st = hex7(s.stroke?.color);
        if (s.stroke && st && !near(st)) {
          next.stroke = { ...s.stroke, color: nearest(st, pal) };
          touched = true;
        }
        if (touched) changed++;
        return touched ? next : n;
      }
      return n;
    });
  const artboards = doc.artboards.map((b) => {
    const ground = hex7(b.background) ?? '#ffffff';
    let bg = b.background;
    if (hex7(b.background) && !near(hex7(b.background)!)) {
      bg = nearest(hex7(b.background)!, pal);
      changed++;
    }
    // shapes first (so the words are judged on the colours they will really sit on), then the words
    const shapesFixed = fixNodes(b.children, hex7(bg) ?? ground, undefined, false, true);
    const withShapes = { ...b, background: bg, children: shapesFixed };
    return { ...withShapes, children: fixNodes(shapesFixed, hex7(bg) ?? ground, withShapes, true, false) };
  });
  return changed ? { doc: { ...doc, artboards, revision: doc.revision + 1 }, changed } : { doc, changed };
}

const boxOf = (n: { x: number; y: number; w: number; h: number }) => ({ x: n.x, y: n.y, w: n.w, h: n.h });
const intersects = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const covers = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x <= b.x && a.y <= b.y && a.x + a.w >= b.x + b.w && a.y + a.h >= b.y + b.h;
const opaquePanel = (n: Node) => n.type === 'shape' && typeof (n as ShapeNode).fill === 'string' && (n.opacity ?? 1) >= 0.99 && !n.rotation;

/** What sits inside a logo's clear space (drawn above whatever opaque panel covers the zone), as a board's children see it. */
export function clearSpaceIntruders(b: Pick<Artboard, 'children'>, logo: ImageNode, ratio: number): Node[] {
  const m = ratio * logo.h;
  const zone = { x: logo.x - m, y: logo.y - m, w: logo.w + 2 * m, h: logo.h + 2 * m };
  const idx = b.children.findIndex((n) => n.id === logo.id);
  // the last opaque panel below the logo that covers the whole zone hides everything drawn before it
  let floor = -1;
  b.children.forEach((n, i) => {
    if (i < idx && opaquePanel(n) && covers(boxOf(n), zone)) floor = i;
  });
  return b.children.filter((o, i) => i > floor && o.id !== logo.id && !o.decorative && o.role !== 'background' && intersects(boxOf(o), zone) && !covers(boxOf(o), boxOf(logo)));
}

/** Linked approved logos given their clear space (see the head of this file). */
export function respectClearSpace(doc: GraphicDoc, ratio: number, minPx = 0): { doc: GraphicDoc; scaled: number; panels: number } {
  if (!(ratio > 0)) return { doc, scaled: 0, panels: 0 };
  let scaled = 0;
  let panels = 0;
  const artboards = doc.artboards.map((b) => {
    let children = [...b.children];
    for (const logo0 of b.children.filter((n): n is ImageNode => n.type === 'image' && !!n.link?.startsWith('brand:'))) {
      let logo = children.find((n) => n.id === logo0.id) as ImageNode;
      if (!clearSpaceIntruders({ children }, logo, ratio).length) continue;
      // scale down about the logo's centre, never below its minimum width
      for (let k = 0.9; k >= 0.6; k -= 0.1) {
        const w = logo0.w * k;
        if (w < minPx) break;
        const cand = { ...logo0, w, h: logo0.h * k, x: logo0.x + (logo0.w - w) / 2, y: logo0.y + (logo0.h - logo0.h * k) / 2 };
        const trial = children.map((n) => (n.id === logo0.id ? cand : n));
        if (!clearSpaceIntruders({ children: trial }, cand, ratio).length) {
          children = trial;
          logo = cand;
          scaled++;
          break;
        }
      }
      if (!clearSpaceIntruders({ children }, logo, ratio).length) continue;
      // a panel of the ground behind it, the logo on top of everything
      const m = ratio * logo.h;
      const ground = hex7(b.background) ?? '#ffffff';
      const panel: ShapeNode = { id: `${logo.id}P`, type: 'shape', name: 'Logo clear space', role: 'background', x: logo.x - m, y: logo.y - m, w: logo.w + 2 * m, h: logo.h + 2 * m, rotation: 0, opacity: 1, shape: 'rect', fill: ground };
      children = [...children.filter((n) => n.id !== logo.id && n.id !== panel.id), panel, logo];
      panels++;
    }
    return { ...b, children };
  });
  return scaled || panels ? { doc: { ...doc, artboards, revision: doc.revision + 1 }, scaled, panels } : { doc, scaled, panels };
}
