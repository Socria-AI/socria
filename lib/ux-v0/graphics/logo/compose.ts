// lib/ux-v0/graphics/logo/compose.ts — logos inside Graphics: a graphic brief that asks for a logo becomes a logo
// brief, an exploration of concepts (logo/concepts.ts), and a logo artboard: the selected concept's lockup on its
// ground, carrying the record of every concept shown. A concept chosen later replaces the lockup in place (the
// artboard, its size and its other objects kept). The responsive variants (primary, horizontal, stacked, symbol only,
// wordmark only, black, reversed, small, app icon, favicon) come out as artboards of their own, each exportable;
// most are transparent, so a PNG or SVG export has no ground unless one is part of the variant (an app icon's tile).

import type { GraphicBrief } from '../compose';
import type { Artboard, GraphicDoc, GroupNode, Node, ShapeNode } from '../doc';
import { hash32 } from '../styles/hash';
import { readLogoBrief, type LogoBrief } from './brief';
import { coloursFor, fitLockup, initialMark, smallMark, symbolNodes, type ColourScheme } from './build';
import { exploreLogos, type LockupKind, type LogoConcept } from './concepts';
import { evaluateLogo, scalabilityLine } from './evaluate';
import { addConcepts, conceptRecord, newLogoRecord, setStatus, type LogoRecord } from './record';
import { selectedConcept } from './rebuild';

/** The logo brief a graphic brief carries (its words; its brand or headline as the name when one was corrected). */
export function logoBriefOf(brief: GraphicBrief): LogoBrief {
  const named = brief.content.brand?.trim() || (brief.content.headline && !/^\[/.test(brief.content.headline) ? brief.content.headline.trim() : '');
  return readLogoBrief(brief.purpose || brief.content.headline, named ? { name: named.slice(0, 40) } : {});
}

/** An exploration's concepts with their scalability written from their measures. */
export function explore(b: LogoBrief, opts: Parameters<typeof exploreLogos>[1] = {}): LogoConcept[] {
  const list = exploreLogos(b, opts);
  return list.map((c) => {
    const e = evaluateLogo(c, b, list);
    const weak = e.criteria.filter((x) => !x.pass && x.key !== 'memorability').map((x) => `${x.label}: ${x.notes[0]}`);
    return { ...c, scalability: scalabilityLine(e), weaknesses: [...c.weaknesses, ...weak].slice(0, 5) };
  });
}

const lid = (k: string) => `lo${(hash32(k) >>> 0).toString(36)}`;

/** The lockup of a concept on a logo artboard: a group named for the logo, filling about half the artboard. */
export function lockupOnBoard(c: LogoConcept, board: { width: number; height: number }, lockup: LockupKind, scheme: ColourScheme): GroupNode {
  const W = board.width;
  const H = board.height;
  const wide = lockup === 'horizontal' || lockup === 'wordmark';
  const box = wide ? { x: W * 0.16, y: H * 0.3, w: W * 0.68, h: H * 0.4 } : { x: W * 0.3, y: H * 0.18, w: W * 0.4, h: H * 0.64 };
  const g = fitLockup(c, lockup, box, coloursFor(c, scheme));
  return { ...g, id: lid(`${c.id}|board|${lockup}|${scheme}`), name: `Logo — ${c.title}` };
}

/** A logo artboard for a concept and its record. */
export function logoArtboard(c: LogoConcept, rec: LogoRecord, opts: { id?: string; width?: number; height?: number; name?: string } = {}): Artboard {
  const W = opts.width ?? 1600;
  const H = opts.height ?? 1000;
  const col = coloursFor(c, rec.scheme);
  return {
    id: opts.id ?? `ab${lid(c.id).slice(2)}`,
    name: opts.name ?? `${rec.brief.name} — logo`,
    width: W,
    height: H,
    unit: 'px',
    dpi: 72,
    format: 'logo-sheet',
    background: col.ground,
    bleed: 0,
    safe: 80,
    children: [lockupOnBoard(c, { width: W, height: H }, rec.lockup, rec.scheme)],
    logo: rec,
  };
}

/** A logo composed from a graphic brief: the exploration, the record, the artboard of the first (or selected)
 * concept. */
export function composeLogo(brief: GraphicBrief, opts: { seed?: number; record?: LogoRecord | null } = {}): { board: Artboard; record: LogoRecord; concept: LogoConcept; said: string[] } {
  let rec = opts.record ?? null;
  if (!rec) {
    const b = logoBriefOf(brief);
    const concepts = explore(b, { count: 10, seed: opts.seed ?? 1 });
    rec = newLogoRecord(brief.purpose || brief.content.headline, b, concepts);
  }
  if (!rec.selected && rec.concepts[0]) rec = setStatus(rec, rec.concepts[0].id, 'selected');
  rec = { ...rec, lockup: rec.concepts.find((x) => x.id === rec!.selected)?.lockup ?? rec.lockup };
  const c = selectedConcept(rec)!;
  const board = logoArtboard(c, rec);
  return { board, record: rec, concept: c, said: [...rec.brief.said, `Concept: ${c.title}. ${c.coreIdea}`, `${rec.concepts.length} concepts explored; none taken from a library of logos.`] };
}

/** A concept put on a logo artboard in place of the one there (the artboard's size, ground and other objects kept,
 * the record told which is selected). New concepts not yet in the record are added to it. */
export function applyConcept(doc: GraphicDoc, boardId: string, c: LogoConcept, opts: { lockup?: LockupKind; scheme?: ColourScheme; status?: 'selected' | 'approved'; add?: readonly LogoConcept[] } = {}): GraphicDoc {
  const board = doc.artboards.find((b) => b.id === boardId);
  if (!board?.logo) return doc;
  let rec = board.logo;
  const more = [...(opts.add ?? []), ...(rec.concepts.some((x) => x.id === c.id) ? [] : [c])].filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i && !rec.concepts.some((y) => y.id === x.id));
  if (more.length) rec = addConcepts(rec, more);
  rec = setStatus({ ...rec, lockup: opts.lockup ?? rec.lockup, scheme: opts.scheme ?? rec.scheme }, c.id, opts.status ?? 'selected');
  const old = board.children.findIndex((n) => n.role === 'logo' && n.type === 'group');
  const lock = lockupOnBoard(c, board, rec.lockup, rec.scheme);
  const children = old >= 0 ? board.children.map((n, i) => (i === old ? lock : n)) : [...board.children, lock];
  const col = coloursFor(c, rec.scheme);
  const nextBoard: Artboard = { ...board, children, background: col.ground, logo: { ...rec, edited: false } };
  return { ...doc, artboards: doc.artboards.map((b) => (b.id === boardId ? nextBoard : b)), revision: doc.revision + 1, updatedAt: Date.now() };
}

export const VARIANTS = ['primary', 'horizontal', 'stacked', 'symbol', 'wordmark', 'black', 'reversed', 'small', 'app-icon', 'favicon'] as const;
export type Variant = (typeof VARIANTS)[number];
export const VARIANT_LABEL: Record<Variant, string> = {
  primary: 'Primary',
  horizontal: 'Horizontal',
  stacked: 'Vertical',
  symbol: 'Symbol only',
  wordmark: 'Wordmark only',
  black: 'Black (one colour)',
  reversed: 'Reversed',
  small: 'Small, simplified',
  'app-icon': 'App icon',
  favicon: 'Favicon',
};

/** The responsive variants of one identity, each an artboard (see the head of this file). */
export function variantBoards(c: LogoConcept, rec: LogoRecord): Artboard[] {
  const name = rec.brief.name;
  const one = (v: Variant, W: number, H: number, kids: Node[], background: string | null): Artboard => ({
    id: `ab${lid(`${c.id}|${v}`).slice(2)}`,
    name: `${name} — ${VARIANT_LABEL[v]}`,
    width: W,
    height: H,
    unit: 'px',
    dpi: 72,
    format: 'custom',
    background,
    bleed: 0,
    safe: 0,
    children: kids,
  });
  const lock = (kind: LockupKind, scheme: ColourScheme, W: number, H: number, pad: number, small = false) => fitLockup(c, kind, { x: pad, y: pad, w: W - pad * 2, h: H - pad * 2 }, coloursFor(c, scheme, null), { small });
  const sym = c.mark ?? initialMark(c);
  const tile = (W: number, r: number): Node[] => {
    const bg: ShapeNode = { id: lid(`${c.id}|tile|${W}`), type: 'shape', name: 'Tile', x: 0, y: 0, w: W, h: W, rotation: 0, opacity: 1, shape: 'rect', radius: r, fill: c.palette.primary };
    const s = symbolNodes(c, smallMark(sym), W * 0.2, W * 0.2, W * 0.6, coloursFor(c, 'reversed', c.palette.primary));
    return [bg, { id: lid(`${c.id}|tilemark|${W}`), type: 'group', name: 'Symbol', role: 'logo', x: 0, y: 0, w: W, h: W, rotation: 0, opacity: 1, children: s.nodes } as GroupNode];
  };
  return [
    one('primary', 1200, 700, [lock(rec.lockup === 'symbol' ? 'stacked' : rec.lockup, 'full', 1200, 700, 120)], null),
    one('horizontal', 1400, 500, [lock('horizontal', 'full', 1400, 500, 90)], null),
    one('stacked', 900, 1000, [lock('stacked', 'full', 900, 1000, 120)], null),
    one('symbol', 800, 800, [lock('symbol', 'full', 800, 800, 120)], null),
    one('wordmark', 1400, 420, [lock('wordmark', 'full', 1400, 420, 90)], null),
    one('black', 1200, 700, [lock(rec.lockup === 'symbol' ? 'stacked' : rec.lockup, 'black', 1200, 700, 120)], null),
    one('reversed', 1200, 700, [lock(rec.lockup === 'symbol' ? 'stacked' : rec.lockup, 'reversed', 1200, 700, 120)], c.palette.primary),
    one('small', 256, 256, [lock('symbol', 'full', 256, 256, 32, true)], null),
    one('app-icon', 1024, 1024, tile(1024, 224), null),
    one('favicon', 64, 64, [lock('symbol', 'full', 64, 64, 4, true)], null),
  ];
}

export { conceptRecord };
