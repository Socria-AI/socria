// lib/ux-v0/graphics/logo/contexts.ts — a logo seen where it will live: on a light ground and a dark one, as an app
// icon, in a web header, as a social avatar (a circular crop), on a business card and printed on a product; and at the
// sizes it must hold (16, 24, 32, 64, 128 and 512 px) and in every colour scheme. Each is a small document the
// renderer draws, so what the panel and the benchmark show is the logo itself, not a picture of it.

import type { Artboard, GraphicDoc, GroupNode, Node, ShapeNode, TextNode } from '../doc';
import { mix } from '../../color';
import { coloursFor, fitLockup, initialMark, smallMark, symbolNodes, type ColourScheme } from './build';
import type { LogoConcept } from './concepts';

const doc = (c: LogoConcept, board: Artboard): GraphicDoc => ({
  schema: 1,
  id: `ctx_${c.id}`,
  name: c.title,
  tokens: {
    colors: { background: c.palette.paper, surface: c.palette.paper, text: c.palette.ink, muted: c.palette.muted, accent: c.palette.primary, accentText: c.palette.paper, line: c.palette.muted },
    fonts: { display: c.wordmark.font ?? 'Inter', body: 'Inter' },
  },
  artboards: [board],
  assets: [],
  revision: 0,
  updatedAt: 0,
});
const ab = (id: string, W: number, H: number, background: string | null, children: Node[]): Artboard => ({ id, name: id, width: W, height: H, unit: 'px', dpi: 72, format: 'custom', background, bleed: 0, safe: 0, children });
const rect = (id: string, x: number, y: number, w: number, h: number, fill: string, o: Partial<ShapeNode> = {}): ShapeNode => ({ id, type: 'shape', name: id, x, y, w, h, rotation: 0, opacity: 1, shape: 'rect', fill, ...o });
const words = (id: string, text: string, x: number, y: number, w: number, size: number, color: string, o: Partial<TextNode> = {}): TextNode => ({
  id,
  type: 'text',
  name: id,
  x,
  y,
  w,
  h: size * 1.4,
  rotation: 0,
  opacity: 1,
  text,
  font: 'Inter',
  weight: 500,
  size,
  lineHeight: 1.3,
  tracking: 0,
  align: 'left',
  valign: 'top',
  color,
  ...o,
});

export const CONTEXT_LABEL: Record<string, string> = {
  light: 'Light ground',
  dark: 'Dark ground',
  'app icon': 'App icon',
  'web header': 'Web header',
  'social avatar': 'Social avatar',
  'business card': 'Business card',
  'product mockup': 'Printed on a product',
};

/** The seven contexts, each a document (see the head of this file). */
export function contextDocs(c: LogoConcept): { context: string; doc: GraphicDoc }[] {
  const p = c.palette;
  const sym = c.mark ?? initialMark(c);
  const lock = c.lockup === 'symbol' || c.lockup === 'emblem' ? 'stacked' : c.lockup;
  const out: { context: string; doc: GraphicDoc }[] = [];
  out.push({ context: 'light', doc: doc(c, ab('light', 480, 300, p.paper, [fitLockup(c, lock, { x: 60, y: 60, w: 360, h: 180 }, coloursFor(c, 'full'))])) });
  out.push({ context: 'dark', doc: doc(c, ab('dark', 480, 300, '#111111', [fitLockup(c, lock, { x: 60, y: 60, w: 360, h: 180 }, coloursFor(c, 'white'))])) });
  const tile = symbolNodes(c, smallMark(sym), 106, 66, 108, coloursFor(c, 'reversed', p.primary));
  out.push({
    context: 'app icon',
    doc: doc(
      c,
      ab('app icon', 320, 240, mix(p.paper, p.ink, 0.08), [
        rect('tile', 100, 60, 120, 120, p.primary, { radius: 27 }),
        { id: 'icon', type: 'group', name: 'icon', role: 'logo', x: 0, y: 0, w: 320, h: 240, rotation: 0, opacity: 1, children: tile.nodes } as GroupNode,
        words('label', c.wordmark.text.slice(0, 14), 60, 190, 200, 13, p.ink, { align: 'center', weight: 500 }),
      ]),
    ),
  });
  const head: Node[] = [
    rect('bar', 0, 0, 640, 64, p.paper),
    rect('rule', 0, 63, 640, 1, mix(p.ink, p.paper, 0.85)),
    fitLockup(c, 'horizontal', { x: 24, y: 16, w: 300, h: 32 }, coloursFor(c, 'full')),
    ...['Work', 'About', 'Contact'].map((t, i) => words(`nav${i}`, t, 420 + i * 72, 22, 70, 14, p.ink)),
  ];
  out.push({
    context: 'web header',
    doc: doc(c, ab('web header', 640, 160, mix(p.paper, '#ffffff', 0.4), [...head, rect('content', 24, 92, 400, 16, mix(p.ink, p.paper, 0.9), { radius: 4 }), rect('content2', 24, 120, 280, 12, mix(p.ink, p.paper, 0.92), { radius: 4 })])),
  });
  const av = symbolNodes(c, smallMark(sym), 104, 44, 112, coloursFor(c, 'reversed', p.primary));
  out.push({
    context: 'social avatar',
    doc: doc(
      c,
      ab('social avatar', 320, 240, mix(p.paper, p.ink, 0.05), [
        { id: 'circle', type: 'shape', name: 'Avatar', x: 70, y: 10, w: 180, h: 180, rotation: 0, opacity: 1, shape: 'ellipse', fill: p.primary } as ShapeNode,
        { id: 'av', type: 'group', name: 'avatar mark', role: 'logo', x: 0, y: 0, w: 320, h: 240, rotation: 0, opacity: 1, children: av.nodes } as GroupNode,
        words('handle', `@${c.wordmark.text.toLowerCase().replace(/[^a-z0-9]+/g, '')}`, 60, 200, 200, 13, p.ink, { align: 'center' }),
      ]),
    ),
  });
  out.push({
    context: 'business card',
    doc: doc(
      c,
      ab('business card', 480, 300, mix(p.paper, p.ink, 0.1), [
        rect('card', 60, 45, 360, 210, p.paper, { radius: 6 }),
        fitLockup(c, lock === 'stacked' ? 'stacked' : 'horizontal', { x: 84, y: 69, w: 200, h: lock === 'stacked' ? 110 : 48 }, coloursFor(c, 'full')),
        words('person', 'Name Surname', 84, 196, 240, 12, p.ink, { weight: 600 }),
        words('role', 'Role · email@example.com', 84, 214, 300, 10, p.muted),
      ]),
    ),
  });
  const bag: Node[] = [
    { id: 'handle', type: 'shape', name: 'Handle', x: 190, y: 30, w: 100, h: 90, rotation: 0, opacity: 1, shape: 'path', path: 'M0 100 C0 0 100 0 100 100', fill: null, stroke: { color: mix(p.paper, p.ink, 0.35), width: 8 } } as ShapeNode,
    rect('bag', 150, 80, 180, 200, mix(p.paper, '#ffffff', 0.3), { radius: 6, stroke: { color: mix(p.paper, p.ink, 0.2), width: 2 } }),
    fitLockup(c, 'symbol', { x: 195, y: 130, w: 90, h: 90 }, coloursFor(c, 'single')),
  ];
  out.push({ context: 'product mockup', doc: doc(c, ab('product mockup', 480, 300, mix(p.secondary, p.paper, 0.75), bag)) });
  return out;
}

/** The symbol (the small version at 24 px and below) drawn at a size in px, transparent. */
export function sizeDoc(c: LogoConcept, px: number): GraphicDoc {
  const sym = c.mark ?? initialMark(c);
  const s = symbolNodes(c, px <= 24 ? smallMark(sym) : sym, px * 0.04, px * 0.04, px * 0.92, coloursFor(c, 'full'));
  return doc(c, ab(`size${px}`, px, px, null, s.nodes));
}

/** The lockup in a colour scheme, on that scheme's ground. */
export function schemeDoc(c: LogoConcept, scheme: ColourScheme): GraphicDoc {
  const col = coloursFor(c, scheme);
  const lock = c.lockup === 'symbol' || c.lockup === 'emblem' ? 'stacked' : c.lockup;
  return doc(c, ab(`scheme-${scheme}`, 400, 240, col.ground, [fitLockup(c, lock, { x: 40, y: 40, w: 320, h: 160 }, col)]));
}
