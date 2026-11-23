// lib/ux-v0/graphics/director/sheet.ts — the design as the creative director reads it.
//
// Before anything is changed, the design in front of the person is read into a sheet: every object by its stable id,
// what it IS in the design (the main headline, the supporting line, the details, the call to action, the brand, a
// picture, the ground, a form with its kind and what it sits behind), its words, face, size, weight and colour, where
// it sits and how large, in the frame's units (frame.ts), in drawing order; the palette by role and which objects use
// each role; the two faces; the reading order as it is now; what is locked. With it travels the project: the brief,
// the idea the design was made from, the journal of earlier turns (what was asked, done, turned down), anything the
// person said must always hold, and an attached brand's constraints. The sheet never carries pictures' contents,
// path data or anything the director does not need to decide.

import { walk, type Artboard, type GraphicDoc, type Node, type Paint, type TextNode, type Tokens } from '../doc';
import { frameOf, toFrame, type Frame } from './frame';
import type { DirectedRecord } from './record';

export interface SheetObject {
  id: string;
  /** what it is in the design, in words */
  is: string;
  role: string;
  kind: string;
  /** x, y, w, h in frame units */
  box: [number, number, number, number];
  text?: string;
  font?: string;
  weight?: number;
  size?: number;
  case?: string;
  tracking?: number;
  lineHeight?: number;
  align?: string;
  italic?: true;
  outline?: true;
  vertical?: true;
  /** a palette role when the colour is one of the palette's, else the hex */
  color?: string;
  fill?: string;
  stroke?: string;
  opacity?: number;
  rotation?: number;
  blend?: string;
  fx?: string[];
  decorative?: true;
  locked?: true;
  /** the group it is inside */
  in?: string;
  /** a group: how many objects it holds */
  holds?: number;
}

export interface Sheet {
  artboard: { name: string; format: string | null; frame: { w: number; h: number }; safe: number; minText: number; ground: string };
  palette: Record<string, string>;
  fonts: { display: string; body: string };
  /** in drawing order: the first is at the back */
  objects: SheetObject[];
  /** objects left out because there were too many (small marks inside groups) */
  more?: number;
  readingOrder: string[];
  locked?: string[];
  /** ids the person has selected on the canvas, when any */
  selection?: string[];
  pictures?: number;
}

export interface ProjectMemory {
  /** what the work is for, in the person's words */
  brief?: string;
  kind?: string;
  /** the idea the design was made from, and why */
  idea?: string;
  rationale?: string[];
  /** what the person said must always hold */
  standing?: string[];
  /** earlier turns, oldest first, numbered from 1 */
  journal?: { turn: number; said: string; did: string; status: 'applied' | 'rejected'; restorable?: boolean }[];
  /** an attached brand: constraints that hold unless the person overrides them */
  system?: { name: string; colours: string[]; fonts: string[]; rules: string[]; logo?: string };
  /** references the person chose, and what they took from each */
  references?: string[];
  /** comments still open on objects */
  comments?: string[];
}

export const MAX_SHEET_OBJECTS = 70;
const hex7 = (c: string) => c.slice(0, 7).toLowerCase();
const round = (v: number, p = 0) => Math.round(v * 10 ** p) / 10 ** p;

/** The palette by role, as the director names it. */
export function paletteOf(tokens: Tokens, ground: string | null): Record<string, string> {
  const c = tokens.colors;
  return { ground: hex7(ground ?? c.background), ink: hex7(c.text), accent: hex7(c.accent), ...(tokens.accent2 ? { accent2: hex7(tokens.accent2) } : {}), muted: hex7(c.muted), paper: hex7(c.surface), line: hex7(c.line) };
}

/** A colour as the sheet says it: the palette role it is, else its hex (with its alpha when it has one). */
export function colourName(c: string, palette: Record<string, string>): string {
  const h = hex7(c);
  const alpha = c.length === 9 && c.slice(7).toLowerCase() !== 'ff';
  if (alpha) return c.toLowerCase();
  for (const role of ['ground', 'ink', 'accent', 'accent2', 'muted'] as const) if (palette[role] === h) return role;
  return h;
}

function paintName(p: Paint | null | undefined, palette: Record<string, string>): string | undefined {
  if (p === null) return 'none';
  if (p === undefined) return undefined;
  if (typeof p === 'string') return colourName(p, palette);
  const g = p as { type?: string; angle?: number; stops?: { color: string }[]; kind?: string };
  if (Array.isArray(g.stops)) return `${g.type === 'radial' ? 'radial' : `linear ${Math.round(g.angle ?? 0)}°`} ${g.stops.map((s) => colourName(s.color, palette)).join(' → ')}`;
  return 'a fill';
}

const WORDS: Record<string, string> = { headline: 'main headline', subhead: 'supporting line', meta: 'details (date, place, facts)', cta: 'call to action', logo: 'brand name / logo', body: 'body text', caption: 'caption', label: 'label', data: 'data' };

function what(n: Node, board: Artboard): string {
  const share = (n.w * n.h) / (board.width * board.height);
  if (n.type === 'text') return n.decorative ? `decorative lettering (the words used as a graphic${n.stroke && n.fill === null ? ', outlined' : ''})` : WORDS[n.role ?? ''] ?? 'text';
  if (n.type === 'image') return n.role === 'logo' ? 'logo (a picture)' : n.role === 'background' ? 'background picture' : 'picture';
  if (n.type === 'chart') return `chart (${n.chart})`;
  if (n.type === 'pattern') return `pattern field (${n.gen})`;
  if (n.type === 'group') return n.role === 'logo' ? 'logo (a group)' : `group${n.mask ? ' (masked)' : n.clip ? ' (clipped)' : ''}`;
  const kind = n.shape === 'prim' ? n.prim?.kind ?? 'shape' : n.shape === 'recipe' ? 'figure' : n.shape;
  const name = (n.name ?? '').toLowerCase();
  if (n.role === 'cta') return 'button behind the call to action';
  if (name === 'plate') return 'plate behind words (keeps them readable)';
  if (n.role === 'background' || share > 0.85) return `ground field (${kind})`;
  if (n.role === 'logo') return 'logo mark';
  return `${share > 0.2 ? 'large form' : share < 0.01 ? 'small mark' : 'form'} (${kind}${n.name && !/^(shape|block|field)$/i.test(n.name) ? `, “${n.name.slice(0, 30)}”` : ''})`;
}

/** The design read into a sheet (see the head of this file). */
export function sheetOf(doc: GraphicDoc, boardId: string | undefined, opts: { selection?: readonly string[] } = {}): Sheet | null {
  const board = doc.artboards.find((b) => b.id === boardId) ?? doc.artboards[0];
  if (!board) return null;
  const tokens = board.tokens ?? doc.tokens;
  const f = frameOf(board);
  const palette = paletteOf(tokens, board.background);
  const all = walk(board).filter((l) => !l.node.hidden);
  // inside a large group only the group is listed (it is moved, restyled or removed as one)
  const crowded = new Set(all.filter((l) => l.node.type === 'group' && (l.node as { children: Node[] }).children.length > 8).map((l) => l.node.id));
  const insideCrowded = (l: (typeof all)[number]) => l.parents.some((p) => crowded.has(p.id));
  const listed = all.filter((l) => !insideCrowded(l));
  const objects = listed.slice(0, MAX_SHEET_OBJECTS).map((l): SheetObject => {
    const n = l.node;
    const ox = l.parents.reduce((s, p) => s + p.x, 0);
    const oy = l.parents.reduce((s, p) => s + p.y, 0);
    const base: SheetObject = {
      id: n.id,
      is: what(n, board),
      role: n.role ?? 'none',
      kind: n.type === 'shape' ? (n.shape === 'prim' ? `prim:${n.prim?.kind ?? ''}` : n.shape) : n.type,
      box: [toFrame(n.x + ox, f), toFrame(n.y + oy, f), toFrame(n.w, f), toFrame(n.h, f)],
      ...(n.opacity < 1 ? { opacity: round(n.opacity, 2) } : {}),
      ...(n.rotation ? { rotation: round(n.rotation) } : {}),
      ...(n.blend && n.blend !== 'normal' ? { blend: n.blend } : {}),
      ...(n.effects?.length ? { fx: n.effects.filter((e) => e.on !== false).map((e) => e.kind) } : {}),
      ...(n.decorative ? { decorative: true as const } : {}),
      ...(n.locked ? { locked: true as const } : {}),
      ...(l.parents.length ? { in: l.parents[l.parents.length - 1].id } : {}),
    };
    if (n.type === 'text')
      return {
        ...base,
        text: n.text.replace(/\s*\n\s*/g, ' / ').slice(0, 160),
        font: n.font,
        weight: n.weight,
        size: toFrame(n.size, f),
        ...(n.case && n.case !== 'none' ? { case: n.case } : {}),
        ...(n.tracking ? { tracking: Math.round(n.tracking) } : {}),
        lineHeight: round(n.lineHeight, 2),
        align: n.align,
        ...(n.italic ? { italic: true as const } : {}),
        ...(n.fill === null && n.stroke ? { outline: true as const } : {}),
        ...(n.vertical ? { vertical: true as const } : {}),
        color: n.fill && typeof n.fill === 'object' ? paintName(n.fill, palette) : colourName(n.color, palette),
      };
    if (n.type === 'shape') return { ...base, ...(paintName(n.fill, palette) ? { fill: paintName(n.fill, palette) } : {}), ...(n.stroke ? { stroke: `${colourName(n.stroke.color, palette)} ${round(n.stroke.width / f.k, 1)}` } : {}) };
    if (n.type === 'group') return { ...base, holds: n.children.length };
    return base;
  });
  const texts = all.filter((l): l is (typeof all)[number] & { node: TextNode } => l.node.type === 'text' && !l.node.decorative);
  const readingOrder = [...texts].sort((a, b) => b.node.size * (b.node.weight >= 600 ? 1.1 : 1) - a.node.size * (a.node.weight >= 600 ? 1.1 : 1)).slice(0, 8).map((l) => `${WORDS[l.node.role ?? ''] ?? 'text'} (${toFrame(l.node.size, f)})`);
  const locked = [...(doc.locks?.colors ? ['the colours'] : []), ...(doc.locks?.fonts ? ['the typefaces'] : [])];
  const selection = (opts.selection ?? []).filter((id) => all.some((l) => l.node.id === id)).slice(0, 12);
  return {
    artboard: { name: board.name.slice(0, 60), format: board.format ?? null, frame: { w: f.w, h: f.h }, safe: f.safe, minText: f.minText, ground: palette.ground },
    palette,
    fonts: { display: tokens.fonts.display, body: tokens.fonts.body },
    objects,
    ...(all.length > objects.length ? { more: all.length - objects.length } : {}),
    readingOrder,
    ...(locked.length ? { locked } : {}),
    ...(selection.length ? { selection } : {}),
    ...(doc.assets.length ? { pictures: doc.assets.length } : {}),
  };
}

/** What the artboard's own record gives the project memory. */
export function memoryOfRecord(rec: DirectedRecord | undefined): Pick<ProjectMemory, 'idea' | 'rationale' | 'standing' | 'journal'> {
  if (!rec) return {};
  return {
    ...(rec.idea ? { idea: rec.idea } : {}),
    ...(rec.rationale?.length ? { rationale: rec.rationale } : {}),
    ...(rec.standing?.length ? { standing: rec.standing } : {}),
    ...(rec.journal?.length ? { journal: rec.journal.map((e, i) => ({ turn: i + 1, said: e.said.slice(0, 200), did: e.did.slice(0, 240), status: e.status, ...(e.before ? { restorable: true } : {}) })) } : {}),
  };
}

// ── what the browser sends, held to its shape before it reaches a prompt ──

const s = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]+/g, ' ').slice(0, n) : '');
const arr = (v: unknown, n: number): unknown[] => (Array.isArray(v) ? v.slice(0, n) : []);
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const ID = /^[A-Za-z][\w-]{0,47}$/;
const HEXA = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

export function normalizeSheet(v: unknown): Sheet | null {
  const r = rec(v);
  const a = rec(r.artboard);
  const fr = rec(a.frame);
  if (!a.frame || !Array.isArray(r.objects)) return null;
  const palette = Object.fromEntries(Object.entries(rec(r.palette)).filter(([k, c]) => /^[a-z0-9]{1,12}$/i.test(k) && typeof c === 'string' && HEXA.test(c)).slice(0, 10)) as Record<string, string>;
  const objects = arr(r.objects, MAX_SHEET_OBJECTS)
    .map((x) => rec(x))
    .filter((x) => typeof x.id === 'string' && ID.test(x.id))
    .map((x): SheetObject => {
      const b = arr(x.box, 4).map((n) => Math.round(num(n, -20000, 40000, 0)));
      return {
        id: x.id as string,
        is: s(x.is, 90),
        role: s(x.role, 16),
        kind: s(x.kind, 40),
        box: [b[0] ?? 0, b[1] ?? 0, b[2] ?? 0, b[3] ?? 0],
        ...(typeof x.opacity === 'number' ? { opacity: num(x.opacity, 0, 1, 1) } : {}),
        ...(typeof x.rotation === 'number' ? { rotation: num(x.rotation, -360, 360, 0) } : {}),
        ...(s(x.blend, 16) ? { blend: s(x.blend, 16) } : {}),
        ...(arr(x.fx, 6).length ? { fx: arr(x.fx, 6).map((e) => s(e, 24)).filter(Boolean) } : {}),
        ...(x.decorative === true ? { decorative: true as const } : {}),
        ...(x.locked === true ? { locked: true as const } : {}),
        ...(typeof x.in === 'string' && ID.test(x.in) ? { in: x.in } : {}),
        ...(s(x.text, 160) ? { text: s(x.text, 160) } : {}),
        ...(s(x.font, 60) ? { font: s(x.font, 60) } : {}),
        ...(typeof x.weight === 'number' ? { weight: num(x.weight, 100, 900, 400) } : {}),
        ...(typeof x.size === 'number' ? { size: num(x.size, 0, 20000, 0) } : {}),
        ...(s(x.case, 8) ? { case: s(x.case, 8) } : {}),
        ...(typeof x.tracking === 'number' ? { tracking: num(x.tracking, -500, 1000, 0) } : {}),
        ...(typeof x.lineHeight === 'number' ? { lineHeight: num(x.lineHeight, 0.4, 4, 1.2) } : {}),
        ...(s(x.align, 8) ? { align: s(x.align, 8) } : {}),
        ...(x.italic === true ? { italic: true as const } : {}),
        ...(x.outline === true ? { outline: true as const } : {}),
        ...(x.vertical === true ? { vertical: true as const } : {}),
        ...(s(x.color, 80) ? { color: s(x.color, 80) } : {}),
        ...(s(x.fill, 120) ? { fill: s(x.fill, 120) } : {}),
        ...(s(x.stroke, 40) ? { stroke: s(x.stroke, 40) } : {}),
        ...(typeof x.holds === 'number' ? { holds: num(x.holds, 0, 999, 0) } : {}),
      };
    });
  if (!objects.length) return null;
  const f = rec(r.fonts);
  return {
    artboard: { name: s(a.name, 60), format: a.format ? s(a.format, 40) : null, frame: { w: num(fr.w, 16, 4000, 1000), h: num(fr.h, 16, 40000, 1000) }, safe: num(a.safe, 0, 400, 50), minText: num(a.minText, 1, 200, 14), ground: HEXA.test(String(a.ground)) ? String(a.ground).slice(0, 7) : '#ffffff' },
    palette,
    fonts: { display: s(f.display, 60), body: s(f.body, 60) },
    objects,
    ...(typeof r.more === 'number' ? { more: num(r.more, 0, 9999, 0) } : {}),
    readingOrder: arr(r.readingOrder, 8).map((x) => s(x, 60)).filter(Boolean),
    ...(arr(r.locked, 4).length ? { locked: arr(r.locked, 4).map((x) => s(x, 30)).filter(Boolean) } : {}),
    ...(arr(r.selection, 12).length ? { selection: arr(r.selection, 12).filter((x): x is string => typeof x === 'string' && ID.test(x)) } : {}),
    ...(typeof r.pictures === 'number' ? { pictures: num(r.pictures, 0, 200, 0) } : {}),
  };
}

export function normalizeMemory(v: unknown): ProjectMemory {
  const r = rec(v);
  const sys = rec(r.system);
  const journal = arr(r.journal, 12)
    .map((x) => rec(x))
    .filter((x) => s(x.said, 200))
    .map((x, i) => ({ turn: Math.round(num(x.turn, 1, 99, i + 1)), said: s(x.said, 200), did: s(x.did, 240), status: x.status === 'rejected' ? ('rejected' as const) : ('applied' as const), ...(x.restorable === true ? { restorable: true } : {}) }));
  const list = (x: unknown, n: number, len: number) => arr(x, n).map((y) => s(y, len)).filter(Boolean);
  return {
    ...(s(r.brief, 900) ? { brief: s(r.brief, 900) } : {}),
    ...(s(r.kind, 24) ? { kind: s(r.kind, 24) } : {}),
    ...(s(r.idea, 300) ? { idea: s(r.idea, 300) } : {}),
    ...(list(r.rationale, 8, 240).length ? { rationale: list(r.rationale, 8, 240) } : {}),
    ...(list(r.standing, 6, 200).length ? { standing: list(r.standing, 6, 200) } : {}),
    ...(journal.length ? { journal } : {}),
    ...(s(sys.name, 80) ? { system: { name: s(sys.name, 80), colours: list(sys.colours, 12, 40), fonts: list(sys.fonts, 6, 60), rules: list(sys.rules, 8, 200), ...(s(sys.logo, 120) ? { logo: s(sys.logo, 120) } : {}) } } : {}),
    ...(list(r.references, 6, 160).length ? { references: list(r.references, 6, 160) } : {}),
    ...(list(r.comments, 6, 200).length ? { comments: list(r.comments, 6, 200) } : {}),
  };
}
