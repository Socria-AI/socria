// lib/ux-v0/graphics/director/apply.ts — the director's edits carried out on the document.
//
// The director answers with edits by object id (schema.ts). Nothing is trusted on the way to the document:
//   1. what the person said to keep is enforced first (protect.ts): an edit that would touch it is not made, and said;
//   2. every edit becomes validated operations of the document's own (doc.ts applyOp: the same gate a hand on the
//      canvas goes through) — a palette change repaints by role, a change of faces resets by role, a restyle sets only
//      checked properties in the artboard's own units, new material is compiled by the program compiler, an earlier
//      state is restored from the journal's exact values;
//   3. words that changed are refitted (never broken mid-word, never cut by their box, never off the safe area), and
//      words whose ground changed are held to contrast — only objects this change touched, so an object-level change
//      stays an object-level change;
//   4. the result is compared with what was there (journal.ts): the outcome says what really changed, object by
//      object, what was kept because it was asked, and every edit that could not be carried out with why. A change
//      that changed nothing is reported as that, never as done.
// Objects no edit names are never touched: the comparison proves it, and the benchmark checks it.

import { contrastRatio } from '../../../ux/audit';
import { graphicFont, nearestWeight } from '../../fonts';
import { ensureContrast } from '../../spec';
import { applyOp, boardView, fromBoardView, walk, withOwnTokens, type Artboard, type GraphicDoc, type Node, type Op, type Paint, type TextNode, type Tokens } from '../doc';
import { effectDefaults } from '../effects';
import { mixColor, type Gradient } from '../paint';
import { fitSize, layoutText, approxMeasure, type Measure } from '../text';
import { compileOnBoard, type GraphicKind } from '../compose';
import { frameOf, scaleInstruction, type Frame } from './frame';
import { diffBoards, saidOfDiff, type BoardDiff } from './journal';
import { guard, NO_PROTECTION, type Protection } from './protect';
import type { DirectedEdit, EditOp, PaintWord, PaletteRole, RestoreScope, SetProps } from './schema';

export interface ApplyContext {
  board: string;
  measure?: Measure;
  kind?: GraphicKind;
  /** the person's words (decides, with the protections, what may be removed) */
  given: string;
  protection?: Protection;
}

export interface Outcome {
  doc: GraphicDoc;
  /** something is different */
  changed: boolean;
  diff: BoardDiff;
  /** what really changed, in a sentence */
  did: string;
  /** edits that could not be carried out, each with why */
  failed: string[];
  /** what was kept because the person said to */
  kept: string[];
  /** adjustments the engine made so the result holds (words refitted, an ink changed to read) */
  notes: string[];
}

const hex7 = (c: string) => c.slice(0, 7).toLowerCase();
const PX_EFFECT_KEYS = new Set(['dx', 'dy', 'blur', 'spread', 'size', 'width', 'radius', 'distance', 'depth', 'offset', 'amplitude', 'wavelength']);
const REMOVAL = /\b(remove|delete|drop|lose|get rid of|take (?:out|away|off)|without|no more|strip|hide|cut)\b/i;

/** The palette roles as hexes, from the tokens the artboard is drawn in. */
function rolesOf(tokens: Tokens, board: Artboard): Record<string, string> {
  const c = tokens.colors;
  const accent2 = tokens.accent2 ?? mixColor(c.accent, c.text, 0.45).slice(0, 7);
  return { ground: hex7(board.background ?? c.background), ink: hex7(c.text), accent: hex7(c.accent), accent2: hex7(accent2), accent3: hex7(mixColor(c.accent, c.background, 0.5).slice(0, 7)), muted: hex7(c.muted), paper: hex7(c.surface), line: hex7(c.line) };
}
const colourOf = (w: string, roles: Record<string, string>): string => (w.startsWith('#') ? w : roles[w] ?? roles.ink);
function paintOf(p: Exclude<PaintWord, null>, roles: Record<string, string>): Paint {
  if (typeof p === 'string') return colourOf(p, roles);
  const stops = (list: string[]) => list.map((s, i, all) => ({ at: Math.round((i / Math.max(1, all.length - 1)) * 100), color: colourOf(s, roles) }));
  if ('linear' in p) return { type: 'linear', angle: p.linear.angle, stops: stops(p.linear.stops) } as Gradient;
  return { type: 'radial', angle: 0, cx: 0.5, cy: 0.5, stops: stops(p.radial.stops) } as Gradient;
}

/** A colour mapped through a palette change (exact role matches only: a colour that is not the palette's stays). */
function remap(c: unknown, map: Map<string, string>): string | null {
  if (typeof c !== 'string' || !/^#[0-9a-f]{6}/i.test(c)) return null;
  const to = map.get(hex7(c));
  return to ? to + c.slice(7) : null;
}
function repaintSet(n: Node, map: Map<string, string>): Record<string, unknown> {
  const set: Record<string, unknown> = {};
  const paint = (p: unknown): unknown | undefined => {
    if (typeof p === 'string') return remap(p, map) ?? undefined;
    const g = p as { stops?: { at: number; color: string }[] } | null;
    if (g && Array.isArray(g.stops)) {
      let moved = false;
      const stops = g.stops.map((s) => {
        const c = remap(s.color, map);
        if (c) moved = true;
        return c ? { ...s, color: c } : s;
      });
      return moved ? { ...g, stops } : undefined;
    }
    return undefined;
  };
  const stroke = (s: unknown) => {
    const st = s as { color?: string } | undefined;
    const c = st ? remap(st.color, map) : null;
    return c ? { ...st, color: c } : undefined;
  };
  if (n.type === 'text') {
    const c = remap(n.color, map);
    if (c) set.color = c;
    if (n.fill && paint(n.fill)) set.fill = paint(n.fill);
    if (stroke(n.stroke)) set.stroke = stroke(n.stroke);
    if (n.runs?.some((r) => r.color && remap(r.color, map))) set.runs = n.runs.map((r) => (r.color && remap(r.color, map) ? { ...r, color: remap(r.color, map) } : r));
  } else if (n.type === 'shape') {
    if (n.fill && paint(n.fill)) set.fill = paint(n.fill);
    if (stroke(n.stroke)) set.stroke = stroke(n.stroke);
    if (n.strokes?.some((s) => remap(s.color, map))) set.strokes = n.strokes.map((s) => stroke(s) ?? s);
  } else if (n.type === 'chart') {
    const ch = n as unknown as { colors?: string[]; color?: string };
    if (ch.colors?.some((c) => remap(c, map))) set.colors = ch.colors.map((c) => remap(c, map) ?? c);
    if (remap(ch.color, map)) set.color = remap(ch.color, map);
  } else if (n.type === 'pattern') {
    const pt = n as unknown as { color?: string; color2?: string; color3?: string };
    for (const k of ['color', 'color2', 'color3'] as const) if (remap(pt[k], map)) set[k] = remap(pt[k], map);
  }
  return set;
}

/** Words refitted to their box after a change: the box grows to its lines (inside the safe area), a word never breaks. */
function refit(t: TextNode, board: Artboard, measure: Measure, minText: number): { set: Record<string, unknown>; note?: string } | null {
  if (t.path || t.rotation || t.vertical || t.decorative) return null;
  const safe = board.safe;
  const maxW = board.width - safe * 2;
  const maxH = board.height - safe * 2;
  const next: TextNode = { ...t };
  let note: string | undefined;
  let l = layoutText({ ...next, autoHeight: false }, measure);
  if (l.brokenWord) {
    // wider about its alignment, as far as the safe area allows; then smaller
    const want = Math.min(maxW, l.widest + next.size * 0.2);
    const grow = Math.max(0, want - next.w);
    next.x -= next.align === 'center' ? grow / 2 : next.align === 'right' ? grow : 0;
    next.w += grow;
    l = layoutText({ ...next, autoHeight: false }, measure);
    if (l.brokenWord) {
      next.size = Math.max(minText, fitSize({ ...next, h: maxH }, measure, minText));
      note = 'set a little smaller so no word breaks';
      l = layoutText({ ...next, autoHeight: false }, measure);
    }
  }
  if (l.height > next.h + 0.5 || l.overflow) {
    if (l.height <= maxH) next.h = l.height + next.size * 0.08;
    else {
      next.h = maxH;
      next.size = Math.max(minText, fitSize(next, measure, minText));
      note = 'set smaller so the words fit the artboard';
    }
  }
  next.x = Math.max(safe, Math.min(next.x, board.width - safe - next.w));
  next.y = Math.max(safe, Math.min(next.y, board.height - safe - next.h));
  const set: Record<string, unknown> = {};
  for (const k of ['x', 'y', 'w', 'h', 'size'] as const) if (Math.abs(next[k] - t[k]) > 0.01) set[k] = Math.round(next[k] * 100) / 100;
  return Object.keys(set).length ? { set, ...(note ? { note } : {}) } : null;
}

const TYPE_KEYS = ['font', 'weight', 'italic', 'case', 'tracking', 'lineHeight', 'stroke', 'fill', 'axes', 'features'];
const COLOUR_KEYS = ['color', 'fill', 'stroke', 'strokes', 'runs', 'colors', 'color2', 'color3', 'effects', 'opacity', 'blend'];
const LAYOUT_KEYS = ['x', 'y', 'w', 'h', 'rotation', 'size', 'align', 'valign'];
const keysFor = (scope: RestoreScope, type: Node['type']): string[] | null => (scope === 'everything' ? null : scope === 'colours' ? COLOUR_KEYS : scope === 'layout' ? LAYOUT_KEYS : type === 'text' ? TYPE_KEYS : []);

/** The director's edit carried out (see the head of this file). */
export function applyEdit(doc0: GraphicDoc, edit0: DirectedEdit, ctx: ApplyContext): Outcome {
  const measure = ctx.measure ?? approxMeasure;
  const base = doc0.artboards.find((b) => b.id === ctx.board) ?? doc0.artboards[0];
  const boardId = base.id;
  const failed: string[] = [...edit0.dropped];
  const notes: string[] = [];
  // an artboard that shares the document's palette gets its own before a change to it, so no other artboard moves
  const changesTokens = !!edit0.palette || !!edit0.fonts || edit0.edits.some((e) => e.do === 'restore');
  const start = changesTokens && doc0.artboards.length > 1 && !base.tokens ? withOwnTokens(doc0, boardId) : doc0;
  let doc = boardView(start, boardId);
  const board = () => doc.artboards.find((b) => b.id === boardId)!;
  const f: Frame = frameOf(board());
  const g = guard(edit0, board(), ctx.protection ?? NO_PROTECTION, { mayRemoveWords: REMOVAL.test(ctx.given) });
  const edit = g.edit;
  const touched = new Set<string>();
  const run = (op: Op, what: string): boolean => {
    const r = applyOp(doc, op);
    if (!r.ok) {
      failed.push(`${what}: ${r.error}`);
      return false;
    }
    doc = r.doc;
    r.touched.forEach((id) => touched.add(id));
    return true;
  };
  const nodeOf = (id: string) => walk(board()).find((l) => l.node.id === id) ?? null;
  const free = (id: string) => !g.frozen.has(id) && !nodeOf(id)?.node.locked;

  // ── the palette, by role: the tokens, the ground, and every object coloured by a role that moved ──
  if (edit.palette && Object.keys(edit.palette).length) {
    const before = rolesOf(doc.tokens, board());
    const c = doc.tokens.colors;
    const p = edit.palette;
    const ground = p.ground ?? before.ground;
    const ink = ensureContrast(p.ink ?? (p.ground ? [c.text, c.background, '#111111', '#ffffff'].sort((a, b) => contrastRatio(b, ground) - contrastRatio(a, ground))[0] : c.text), ground, 4.5);
    const accent = p.accent ?? c.accent;
    const colors = {
      ...c,
      background: ground,
      text: ink,
      accent,
      muted: p.muted ?? (p.ground || p.ink ? ensureContrast(mixColor(ink, ground, 0.42).slice(0, 7), ground, 4.5) : c.muted),
      ...(p.ground || p.ink ? { surface: mixColor(ground, ink, 0.06).slice(0, 7), line: mixColor(ground, ink, 0.18).slice(0, 7) } : {}),
      ...(p.accent ? { accentText: contrastRatio('#ffffff', accent) >= contrastRatio('#111111', accent) ? '#ffffff' : '#111111' } : {}),
    };
    if (run({ op: 'tokens', set: { colors, ...(p.accent2 ? { accent2: p.accent2 } : {}) } }, 'the palette')) {
      const after = rolesOf(doc.tokens, { ...board(), background: board().background && hex7(board().background!) === before.ground ? ground : board().background });
      const map = new Map<string, string>();
      for (const role of ['ground', 'ink', 'accent', 'accent2', 'muted', 'paper', 'line'] as const) if (before[role] !== after[role] && !map.has(before[role])) map.set(before[role], after[role]);
      if (board().background && map.has(hex7(board().background!))) run({ op: 'artboard-update', id: boardId, set: { background: map.get(hex7(board().background!)) } }, 'the ground');
      for (const l of walk(board())) {
        if (!free(l.node.id)) continue;
        const set = repaintSet(l.node, map);
        if (Object.keys(set).length) run({ op: 'update', id: l.node.id, set }, 'repainting');
      }
    }
  }

  // ── the two faces, by role ──
  if (edit.fonts && (edit.fonts.display || edit.fonts.body)) {
    const was = doc.tokens.fonts;
    const now = { display: edit.fonts.display ?? was.display, body: edit.fonts.body ?? was.body };
    if (run({ op: 'tokens', set: { fonts: now } }, 'the faces')) {
      for (const l of walk(board())) {
        const n = l.node;
        if (n.type !== 'text' || !free(n.id)) continue;
        const to = n.font === was.display && now.display !== was.display ? now.display : n.font === was.body && now.body !== was.body ? now.body : null;
        if (to) run({ op: 'update', id: n.id, set: { font: to, weight: nearestWeight(to, n.weight), ...(n.italic && !graphicFont(to)?.italic ? { italic: null } : {}) } }, 'resetting the type');
      }
    }
  }

  // ── each edit, in order ──
  const resolveFont = (w: string) => (w === 'display' ? doc.tokens.fonts.display : w === 'body' ? doc.tokens.fonts.body : w);
  const fxOf = (list: NonNullable<SetProps['fx']>) =>
    list
      .map((e) => {
        const d = effectDefaults(e.kind);
        return d ? { ...d, params: { ...d.params, ...Object.fromEntries(Object.entries(e.params ?? {}).map(([k, v]) => [k, PX_EFFECT_KEYS.has(k) ? v * f.k : v])) } } : null;
      })
      .filter(Boolean);
  const one = (e: EditOp, i: number) => {
    const where = `edit ${i + 1}`;
    const roles = rolesOf(doc.tokens, board());
    switch (e.do) {
      case 'set': {
        const l = nodeOf(e.id);
        if (!l) return void failed.push(`${where}: that object is no longer on the design`);
        const n = l.node;
        const p = e.props;
        const set: Record<string, unknown> = {};
        if (p.opacity !== undefined) set.opacity = p.opacity;
        if (p.rotation !== undefined) set.rotation = p.rotation;
        if (p.blend !== undefined) set.blend = p.blend === 'normal' ? null : p.blend;
        if (p.fx !== undefined) set.effects = p.fx.length ? fxOf(p.fx) : null;
        if (p.hidden !== undefined) set.hidden = p.hidden ? true : null;
        const ignored: string[] = [];
        if (n.type === 'text') {
          if (p.size !== undefined) set.size = Math.max(f.minText * f.k, p.size * f.k);
          const font = p.font !== undefined ? resolveFont(p.font) : n.font;
          if (p.font !== undefined) set.font = font;
          if (p.weight !== undefined || p.font !== undefined) set.weight = nearestWeight(font, p.weight ?? n.weight);
          if (p.italic !== undefined) set.italic = p.italic && graphicFont(font)?.italic !== false ? true : null;
          if (p.case !== undefined) set.case = p.case === 'none' ? null : p.case;
          if (p.tracking !== undefined) set.tracking = p.tracking;
          if (p.lineHeight !== undefined) set.lineHeight = p.lineHeight;
          if (p.align !== undefined) set.align = p.align;
          if (p.valign !== undefined) set.valign = p.valign;
          const colour = p.color !== undefined ? colourOf(p.color, roles) : n.color;
          if (p.color !== undefined) {
            set.color = colour;
            if (n.fill && typeof n.fill === 'object') set.fill = undefined;
            if (n.stroke && n.fill === null) set.stroke = { ...n.stroke, color: colour };
          }
          if (p.outline === true) Object.assign(set, { fill: null, stroke: { color: colour, width: Math.max(0.8, (typeof set.size === 'number' ? set.size : n.size) * 0.025) } });
          else if (p.outline === false && n.fill === null) Object.assign(set, { fill: undefined, stroke: null });
          if (p.accentWord !== undefined) {
            if (p.accentWord === null) set.runs = null;
            else {
              const words = [...n.text.matchAll(/\S+/g)];
              const w = words[p.accentWord];
              if (w && w.index !== undefined) set.runs = [{ start: w.index, end: w.index + w[0].length, color: roles.accent }];
              else ignored.push('accentWord');
            }
          }
          for (const k of ['fill', 'stroke', 'radius'] as const) if (p[k] !== undefined && !('outline' in p)) k === 'fill' && typeof p.fill === 'string' && p.color === undefined ? ((set.color = colourOf(p.fill, roles)), n.fill && typeof n.fill === 'object' ? (set.fill = undefined) : 0) : ignored.push(k);
        } else {
          if (n.type === 'shape') {
            if (p.fill !== undefined) set.fill = p.fill === null ? null : paintOf(p.fill, roles);
            if (p.color !== undefined && p.fill === undefined) n.fill === null && n.stroke ? (set.stroke = { ...n.stroke, color: colourOf(p.color, roles) }) : (set.fill = colourOf(p.color, roles));
            if (p.stroke !== undefined) set.stroke = p.stroke === null ? null : { color: colourOf(p.stroke.color, roles), width: Math.max(0.25, p.stroke.width * f.k), ...(p.stroke.dash ? { dash: p.stroke.dash.map((d) => d * f.k) } : {}), ...(p.stroke.cap ? { cap: p.stroke.cap } : {}) };
            if (p.radius !== undefined) n.shape === 'rect' ? (set.radius = p.radius * f.k) : ignored.push('radius');
          } else for (const k of ['fill', 'stroke', 'radius', 'color'] as const) if (p[k] !== undefined) ignored.push(k);
          for (const k of ['size', 'font', 'weight', 'case', 'tracking', 'lineHeight', 'align', 'valign', 'italic', 'outline', 'accentWord'] as const) if (p[k] !== undefined) ignored.push(k);
        }
        if (ignored.length) failed.push(`${where}: ${[...new Set(ignored)].join(', ')} cannot be set on ${n.type === 'text' ? 'words' : `a ${n.type}`}, so that part was left`);
        if (!Object.keys(set).length) return;
        if (!run({ op: 'update', id: e.id, set }, where)) return;
        const t = nodeOf(e.id)?.node;
        if (t?.type === 'text' && ['size', 'font', 'weight', 'case', 'tracking', 'lineHeight', 'italic'].some((k) => k in set)) {
          const r = refit(t, board(), measure, f.minText * f.k);
          if (r && run({ op: 'update', id: e.id, set: r.set }, 'refitting') && r.note) notes.push(`${t.role ?? 'the words'}: ${r.note}`);
        }
        return;
      }
      case 'place': {
        const l = nodeOf(e.id);
        if (!l) return void failed.push(`${where}: that object is no longer on the design`);
        const ox = l.parents.reduce((s, p) => s + p.x, 0);
        const oy = l.parents.reduce((s, p) => s + p.y, 0);
        if (!run({ op: 'resize', id: e.id, x: e.box.x * f.k - ox, y: e.box.y * f.k - oy, w: Math.max(1, e.box.w * f.k), h: Math.max(1, e.box.h * f.k) }, where)) return;
        const t = nodeOf(e.id)?.node;
        if (t?.type === 'text') {
          const r = refit(t, board(), measure, f.minText * f.k);
          if (r && run({ op: 'update', id: e.id, set: r.set }, 'refitting') && r.note) notes.push(`${t.role ?? 'the words'}: ${r.note}`);
        }
        return;
      }
      case 'remove':
        return void run({ op: 'remove', id: e.id }, where);
      case 'order': {
        const l = nodeOf(e.id);
        if (!l) return void failed.push(`${where}: that object is no longer on the design`);
        const list = l.parents.length ? l.parents[l.parents.length - 1].children : board().children;
        // "back" is just above the ground fields: nothing goes beneath the ground
        const floor = l.parents.length ? 0 : list.filter((n, idx) => idx < list.length && n.id !== e.id && n.role === 'background' && n.w * n.h >= board().width * board().height * 0.9).length;
        return void run({ op: 'reorder', id: e.id, to: e.to === 'front' ? list.length : floor }, where);
      }
      case 'add': {
        const made = compileOnBoard(doc, boardId, [scaleInstruction(e.element, f.k, Math.min(board().width, board().height) / 100)], { measure, kind: ctx.kind });
        made.problems.forEach((p) => failed.push(`${where}: ${p}`));
        if (!made.nodes.length) return void (made.problems.length || failed.push(`${where}: nothing could be drawn from that instruction`));
        const list = board().children;
        const floor = list.filter((n) => n.role === 'background' && n.w * n.h >= board().width * board().height * 0.9).length;
        // new material sits above the forms already there and beneath the words (never over what must be read),
        // unless it was asked to sit beneath something in particular
        const firstWords = list.findIndex((n) => n.type === 'text' && !n.decorative);
        let at = e.under === 'bottom' ? floor : e.under ? list.findIndex((n) => n.id === e.under) : firstWords >= 0 ? firstWords : list.length;
        if (at < 0) at = list.length;
        for (const node of made.nodes) if (run({ op: 'add', artboard: boardId, node, index: at }, where)) at++;
        return;
      }
      case 'ground': {
        const paint = paintOf(e.paint, roles);
        const first = typeof paint === 'string' ? paint : ((paint as Gradient).stops[0]?.color ?? roles.ground);
        const b = board();
        const field = b.children.find((n) => n.type === 'shape' && n.role === 'background' && n.w * n.h >= b.width * b.height * 0.9 && free(n.id));
        if (!run({ op: 'artboard-update', id: boardId, set: { background: hex7(first) } }, where)) return;
        if (field) run({ op: 'update', id: field.id, set: { fill: paint } }, where);
        else if (typeof paint !== 'string') run({ op: 'add', artboard: boardId, index: 0, node: { type: 'shape', shape: 'rect', role: 'background', name: 'Ground', fill: paint, x: 0, y: 0, w: b.width, h: b.height, rotation: 0, opacity: 1 } }, where);
        return;
      }
      case 'words':
        return void run({ op: 'update', id: e.id, set: { text: e.text } }, where);
      case 'restore': {
        const entry = board().directed?.journal?.[e.turn - 1];
        const snap = entry?.status === 'applied' ? entry.before : undefined;
        if (!snap) return void failed.push(`${where}: turn ${e.turn} has nothing kept to go back to (the version history may)`);
        const colours = e.scope === 'colours' || e.scope === 'everything';
        const type = e.scope === 'type' || e.scope === 'everything';
        if (colours && (snap.colors || snap.accent2 !== undefined)) {
          const before = rolesOf(doc.tokens, board());
          if (run({ op: 'tokens', set: { ...(snap.colors ? { colors: snap.colors } : {}), ...(typeof snap.accent2 === 'string' ? { accent2: snap.accent2 } : {}) } }, where)) {
            // every object follows the palette back, role for role: those made since, and those a later turn
            // recoloured on purpose (the room it lit stays lit, in the colour that role had before)
            const after = rolesOf(doc.tokens, { ...board(), background: snap.ground ?? board().background });
            const map = new Map<string, string>();
            for (const role of ['ground', 'ink', 'accent', 'accent2', 'muted', 'paper', 'line'] as const) if (before[role] !== after[role] && !map.has(before[role])) map.set(before[role], after[role]);
            for (const l of walk(board())) {
              if (!free(l.node.id)) continue;
              const set = repaintSet(l.node, map);
              if (Object.keys(set).length) run({ op: 'update', id: l.node.id, set }, where);
            }
          }
        }
        if (colours && snap.ground !== undefined) run({ op: 'artboard-update', id: boardId, set: { background: snap.ground } }, where);
        if (type && snap.fonts) run({ op: 'tokens', set: { fonts: snap.fonts } }, where);
        // What later turns decided stands. Putting back one side of an earlier turn (its colours, its type, its
        // layout) does not undo what was asked for after it: a property a later kept turn changed on purpose is left
        // as that turn made it (its colour has already followed the palette back, above).
        const later = (board().directed?.journal ?? []).slice(e.turn).filter((j) => j.status === 'applied');
        const sinceChanged = (id: string, k: string) => e.scope !== 'everything' && later.some((j) => !!j.before?.nodes?.[id] && k in j.before.nodes[id]);
        for (const [id, was] of Object.entries(snap.nodes ?? {})) {
          const l = nodeOf(id);
          if (!l || !free(id)) continue;
          const keys = keysFor(e.scope, l.node.type);
          const set = Object.fromEntries(Object.entries(was).filter(([k]) => (!keys || keys.includes(k)) && !sinceChanged(id, k)).filter(([k]) => e.scope === 'everything' || !(e.scope === 'type' && (k === 'stroke' || k === 'fill') && l.node.type !== 'text')));
          if (!Object.keys(set).length) continue;
          if (run({ op: 'update', id, set }, where) && e.scope === 'type') {
            const t = nodeOf(id)?.node;
            const r = t?.type === 'text' ? refit(t, board(), measure, f.minText * f.k) : null;
            if (r) run({ op: 'update', id, set: r.set }, 'refitting');
          }
        }
        if (e.scope === 'everything' || e.scope === 'layout') {
          for (const id of snap.added ?? []) if (nodeOf(id) && free(id) && e.scope === 'everything') run({ op: 'remove', id }, where);
          for (const r of [...(snap.removed ?? [])].sort((a, b) => a.index - b.index)) if (!nodeOf(String(r.node.id))) run({ op: 'add', artboard: boardId, node: r.node, index: r.index }, where);
        }
        return;
      }
    }
  };
  edit.edits.forEach(one);

  // ── words this change touched must still read on what is beneath them (only those: scope is kept; an earlier
  // state put back is put back exactly, as it was) ──
  const exact = edit.edits.length > 0 && edit.edits.every((e) => e.do === 'restore') && !edit.palette && !edit.fonts;
  const b1 = board();
  const groundNow = hex7(b1.background ?? doc.tokens.colors.background);
  const groundMoved = hex7(base.background ?? doc0.tokens.colors.background) !== groundNow;
  for (const l of walk(b1)) {
    const n = l.node;
    if (exact || n.type !== 'text' || n.decorative || !free(n.id) || (n.fill && typeof n.fill === 'object') || n.fill === null) continue;
    if (!touched.has(n.id) && !groundMoved) continue;
    // what the words sit on: the nearest opaque flat shape beneath that holds them, else the ground
    const ox = l.parents.reduce((s, p) => s + p.x, 0);
    const oy = l.parents.reduce((s, p) => s + p.y, 0);
    const mine = { x: n.x + ox, y: n.y + oy, w: n.w, h: n.h };
    const top = b1.children.slice(0, l.parents.length ? b1.children.indexOf(l.parents[0]) : l.index).reverse().find((s) => s.type === 'shape' && typeof s.fill === 'string' && s.opacity >= 0.9 && !s.rotation && s.x <= mine.x + mine.w * 0.1 && s.y <= mine.y + mine.h * 0.1 && s.x + s.w >= mine.x + mine.w * 0.9 && s.y + s.h >= mine.y + mine.h * 0.9);
    const under = top && top.type === 'shape' && typeof top.fill === 'string' ? hex7(top.fill) : groundNow;
    const need = n.size >= b1.width * 0.045 ? 3 : 4.5;
    if (contrastRatio(hex7(n.color), under) >= need) continue;
    const better = ensureContrast(hex7(n.color), under, need);
    if (run({ op: 'update', id: n.id, set: { color: better } }, 'contrast')) notes.push(`${n.role ?? 'words'}: the colour was adjusted so it reads on its ground`);
  }

  const out = fromBoardView(start, doc, boardId);
  const after = out.artboards.find((b) => b.id === boardId)!;
  const diff = diffBoards(base, after, base.tokens ?? doc0.tokens, after.tokens ?? out.tokens);
  return { doc: diff.none ? doc0 : out, changed: !diff.none, diff, did: saidOfDiff(diff), failed, kept: g.kept, notes: [...new Set(notes)] };
}

/** The roles of a palette change, for a sentence. */
export const paletteSaid = (p: Partial<Record<PaletteRole, string>>) => Object.entries(p).map(([k, v]) => `${k} ${v}`).join(', ');
