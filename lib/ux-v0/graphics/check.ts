// lib/ux-v0/graphics/check.ts — what is wrong with a graphic, found deterministically, and repaired within bounds.
//
// Before a model is ever asked for an opinion, the document is read for what can be decided: words that do not fit
// their box (or a word wider than its box), words and logos outside the safe area, text that does not read against
// what is beneath it, text too small for its format, pictures whose file is missing, placeholders left to fill,
// objects lost outside the artboard, empty artboards. Each finding names the artboard and the object, and where a
// change fixes it without taking anything away, carries that change as operations (lib/ux-v0/graphics/doc.ts).
//
// refineDoc() applies those fixes, checks again, and stops after a bounded number of rounds, or as soon as a round
// does not make things better (its changes are then taken back). Locked objects are never changed: what is wrong with
// them is said, and left to the designer.

import { contrastRatio } from '../../ux/audit';
import { ensureContrast } from '../spec';
import { applyOps, boxOnBoard, isLocked, walk, type Artboard, type GraphicDoc, type Located, type Op, type TextNode } from './doc';
import { approxMeasure, fitSize, fitToPath, layoutText, shownText, textPathLength, type Measure } from './text';
import { colorAt, mixColor } from './paint';
import type { Paint } from './doc';
import { flatten } from './geometry';
import { apply as applyMat, invert, nodeMatrix, shapeBezier } from './vectorops';

/** What a check may be held to: `palette` — a design held to a system's palette takes its readability repairs (inks and
 * grounds for words) from that palette only, never pure white or black unless the palette has them. */
export interface CheckOpts {
  palette?: readonly string[];
}

export type GKind = 'overflow' | 'broken-word' | 'safe' | 'contrast' | 'tiny' | 'missing' | 'placeholder' | 'outside' | 'empty' | 'collision';

export interface GFinding {
  id: string;
  kind: GKind;
  severity: 'high' | 'medium' | 'low';
  artboard: string;
  node?: string;
  message: string;
  /** operations that fix it, when nothing is taken away */
  fix?: Op[];
  /** the object is locked: said, not repaired */
  blocked?: boolean;
}

/** The px a size in the artboard's units stands for (print points are 1.333 px). */
const pxOf = (b: Artboard, v: number) => (b.unit === 'pt' ? v * (96 / 72) : v);
/** The smallest text a format should carry: 6 pt in print; on screens, relative to the width (12 px at least). */
export const minSize = (b: Artboard) => (b.unit === 'pt' ? 6 : Math.max(12, b.width * 0.011));

/** A shape's filled region in its own box, as rings (even-odd), cached by the node's geometry: what is really beneath a
 * point is its outline, not its box (a frame is hollow, a star has gaps between its points). */
const ringCache = new Map<string, [number, number][][] | null>();
function ringsOf(n: Extract<Located['node'], { type: 'shape' }>): [number, number][][] | null {
  if (n.shape === 'rect' && !n.radius) return null;
  const key = `${n.shape}|${n.w.toFixed(1)}|${n.h.toFixed(1)}|${n.radius ?? ''}|${n.sides ?? ''}|${n.inner ?? ''}|${n.path ?? ''}|${JSON.stringify(n.prim ?? n.recipe ?? n.bez ?? null)}`;
  if (ringCache.has(key)) return ringCache.get(key)!;
  let rings: [number, number][][] | null = null;
  try {
    const p = shapeBezier(n);
    if (p) rings = flatten(p, Math.max(1, Math.max(n.w, n.h) / 80)).rings as [number, number][][];
  } catch {
    rings = null;
  }
  if (ringCache.size > 600) ringCache.clear();
  ringCache.set(key, rings);
  return rings;
}
const insideRings = (rings: readonly (readonly [number, number])[][], x: number, y: number): boolean => {
  let inside = false;
  for (const r of rings)
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i];
      const [xj, yj] = r[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi) inside = !inside;
    }
  return inside;
};

/** The colour a fill shows at a point of its box (0–1 across and down): a gradient read where the words are. */
function paintAt(f: Exclude<Paint, string>, u: number, v: number, w: number, h: number): string {
  if (f.type === 'linear' && f.stops.length) {
    const a = (f.angle * Math.PI) / 180;
    const dx = Math.sin(a);
    const dy = -Math.cos(a);
    const len = Math.abs(w * dx) + Math.abs(h * dy) || 1;
    return colorAt(f.stops, Math.max(0, Math.min(1, ((u - 0.5) * w * dx + (v - 0.5) * h * dy) / len + 0.5))).slice(0, 7);
  }
  if (f.type === 'radial' && f.stops.length) {
    const r = f.r ?? 0.5;
    const d = Math.hypot(u - (f.cx ?? 0.5), v - (f.cy ?? 0.5)) / Math.max(1e-6, r);
    return colorAt(f.stops, Math.max(0, Math.min(1, d))).slice(0, 7);
  }
  return middleOf(f);
}

/** What is beneath a point of an artboard, drawn before `before`: a colour, or a picture. Shapes are read by their
 * outlines (turned, slanted and mirrored as drawn), a clipping group hides what lies outside it, a mask's own cut is
 * not drawn, and a gradient is read at the point. */
function beneath(board: Artboard, before: Located, px: number, py: number): { color: string } | { image: true } {
  const order = walk(board);
  const at = order.findIndex((l) => l.node.id === before.node.id);
  for (let i = at - 1; i >= 0; i--) {
    const l = order[i];
    const n = l.node;
    if (n.hidden || n.opacity < 0.5 || n.type === 'group' || n.type === 'text' || n.type === 'chart') continue;
    // an object inside a group that is the text's own ancestor does not count as "beneath" it
    if (before.parents.some((g) => g.id === n.id)) continue;
    const parent = l.parents[l.parents.length - 1];
    if (parent?.mask && parent.children[0]?.id === n.id) continue;
    // a clipping (or masking) group shows nothing outside its box
    let ox = 0;
    let oy = 0;
    let clipped = false;
    for (const g of l.parents) {
      if ((g.clip || g.mask) && (px < ox + g.x || px > ox + g.x + g.w || py < oy + g.y || py > oy + g.y + g.h)) clipped = true;
      ox += g.x;
      oy += g.y;
    }
    if (clipped) continue;
    const b = boxOnBoard(l);
    const turned = !!(n.rotation || n.skewX || n.skewY);
    if (!turned && (px < b.x || px > b.x + b.w || py < b.y || py > b.y + b.h)) continue;
    const [lx, ly] = applyMat(invert(nodeMatrix(n)), px - ox, py - oy);
    if (lx < 0 || lx > n.w || ly < 0 || ly > n.h) continue;
    if (n.type === 'image') return { image: true };
    if (n.type === 'shape') {
      if (n.fill === null || n.shape === 'line') continue;
      const rings = ringsOf(n);
      if (rings && !insideRings(rings, lx, ly)) continue;
      if (typeof n.fill === 'string') return { color: n.fill.slice(0, 7) };
      return { color: paintAt(n.fill, lx / Math.max(1e-6, n.w), ly / Math.max(1e-6, n.h), n.w, n.h) };
    }
    if (n.type === 'pattern') continue;
  }
  return { color: (board.background ?? '#ffffff').slice(0, 7) };
}

/** The colour a gradient shows at its middle (a mesh's centre). */
function middleOf(g: Exclude<Paint, string>): string {
  if (g.type === 'mesh') {
    const m = g.mesh ?? [];
    if (m.length === 9) return m[4].slice(0, 7);
    return m.length ? m.reduce((acc, c, i) => (i ? mixColor(acc, c, 1 / (i + 1)) : c)).slice(0, 7) : '#ffffff';
  }
  return g.stops.length ? colorAt(g.stops, 0.5).slice(0, 7) : '#ffffff';
}
/** The colour a gradient shows on the whole (its mean along its length): what words filled with it read as. */
function meanOf(g: Exclude<Paint, string>): string {
  if (g.type === 'mesh' || !g.stops.length) return middleOf(g);
  const samples = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1].map((t) => colorAt(g.stops, t));
  return samples.reduce((acc, c, i) => (i ? mixColor(acc, c, 1 / (i + 1)) : c)).slice(0, 7);
}

const WORDS_ROLES = new Set(['headline', 'subhead', 'body', 'cta', 'meta', 'logo', 'label', 'caption']);

/** Where the words of a text really are within its box (its lines, aligned), not the whole box. */
function inkArea(t: TextNode, b: { x: number; y: number; w: number; h: number }, L: { widest: number; height: number }): { x: number; y: number; w: number; h: number } {
  if (t.vertical || t.rotation) return b;
  const w = Math.min(b.w, L.widest || b.w);
  const h = Math.min(b.h, L.height || b.h);
  const x = t.align === 'center' ? b.x + (b.w - w) / 2 : t.align === 'right' ? b.x + b.w - w : b.x;
  const y = t.valign === 'middle' ? b.y + (b.h - h) / 2 : t.valign === 'bottom' ? b.y + b.h - h : b.y;
  return { x, y, w, h };
}

/** The colour that reads best on every colour given: the text's own when it is enough, else the best of the inks (only
 * the palette's, when `only` is set: a design held to a system's palette). */
export function inkOnAll(own: string, under: readonly string[], need: number, palette: readonly string[] = [], only = false): { color: string; ratio: number } {
  const score = (c: string) => Math.min(...under.map((u) => contrastRatio(c, u)));
  if (score(own) >= need) return { color: own, ratio: score(own) };
  const cands = only ? [...palette] : [...under.map((u) => ensureContrast(own, u, need)), ...palette, '#111111', '#ffffff'];
  const best = cands.reduce((a, c) => (score(c) > score(a) ? c : a), own);
  return { color: best, ratio: score(best) };
}

/** Every finding of a document (see the head of this file). */
export function checkDoc(doc: GraphicDoc, measure: Measure = approxMeasure, opts: CheckOpts = {}): GFinding[] {
  const out: GFinding[] = [];
  const add = (f: Omit<GFinding, 'id'>) => out.push({ ...f, id: `${f.kind}:${f.artboard}:${f.node ?? ''}:${out.length}` });
  const assets = new Set(doc.assets.map((a) => a.id));
  for (const board of doc.artboards) {
    const all = walk(board);
    const visible = all.filter((l) => !l.node.hidden);
    if (!visible.length) add({ kind: 'empty', severity: 'medium', artboard: board.id, message: `“${board.name}” is empty.` });
    for (const l of visible) {
      const n = l.node;
      const locked = isLocked(l);
      const b = boxOnBoard(l);
      const name = n.name ?? n.role ?? n.type;
      // lost outside the artboard
      if (b.x + b.w < 0 || b.y + b.h < 0 || b.x > board.width || b.y > board.height) add({ kind: 'outside', severity: 'medium', artboard: board.id, node: n.id, message: `“${name}” is outside “${board.name}” and will not show.` });
      if (n.type === 'image' && !assets.has(n.asset)) add({ kind: 'missing', severity: 'high', artboard: board.id, node: n.id, message: `The picture of “${name}” is missing.` });
      if (n.type !== 'text') continue;
      const t = n as TextNode;
      // decorative words (a cropped echo of the headline, set again in full elsewhere): composed to run off the frame
      // and to sit back, so not read for fit, the safe area, size or contrast
      if (t.decorative) continue;
      const L = layoutText(t, measure);
      // words along a path: one line, read against the path's own length (their box does not apply)
      if (t.path) {
        const words = shownText(t).replace(/\s+/g, ' ');
        const width = measure(words, t.font, t.weight, t.size, !!t.italic) + (t.tracking / 1000) * t.size * words.length;
        if (width > textPathLength(t) * 1.02) {
          const size = fitToPath(t, measure, minSize(board));
          add({ kind: 'overflow', severity: 'high', artboard: board.id, node: n.id, message: `The words of “${name}” are longer than the path they are set along.`, ...(locked ? { blocked: true } : { fix: [{ op: 'update', id: n.id, set: { size } }] }) });
        }
      } else if (L.overflow || L.brokenWord) {
        const size = fitSize(t, measure, minSize(board));
        const fits = size >= minSize(board) && !layoutText({ ...t, size }, measure).overflow && !layoutText({ ...t, size }, measure).brokenWord;
        add({
          kind: L.brokenWord ? 'broken-word' : 'overflow',
          severity: 'high',
          artboard: board.id,
          node: n.id,
          message: L.brokenWord ? `A word in “${name}” is wider than its box and breaks mid-word.` : `The words of “${name}” do not fit their box.`,
          ...(locked ? { blocked: true } : { fix: fits ? [{ op: 'update', id: n.id, set: { size } }] : [{ op: 'update', id: n.id, set: { size: Math.max(minSize(board), size), autoHeight: true } }] }),
        });
      }
      // the safe area: words and logos keep inside it
      if (WORDS_ROLES.has(n.role ?? '') && !n.rotation) {
        const s = board.safe;
        const dx = b.x < s - 0.5 ? s - b.x : b.x + b.w > board.width - s + 0.5 ? board.width - s - (b.x + b.w) : 0;
        const dy = b.y < s - 0.5 ? s - b.y : b.y + b.h > board.height - s + 0.5 ? board.height - s - (b.y + b.h) : 0;
        if (dx || dy) {
          const fitsW = b.w <= board.width - s * 2 + 0.5;
          const fitsH = b.h <= board.height - s * 2 + 0.5;
          add({
            kind: 'safe',
            severity: 'medium',
            artboard: board.id,
            node: n.id,
            message: `“${name}” reaches outside the safe area of “${board.name}”.`,
            ...(locked ? { blocked: true } : fitsW && fitsH ? { fix: [{ op: 'move', id: n.id, dx, dy }] } : {}),
          });
        }
      }
      // too small for its format
      if (t.size < minSize(board) - 0.01) add({ kind: 'tiny', severity: 'medium', artboard: board.id, node: n.id, message: `“${name}” is set at ${Math.round(t.size * 10) / 10}${board.unit}: too small to read in this format.`, ...(locked ? { blocked: true } : { fix: [{ op: 'update', id: n.id, set: { size: Math.ceil(minSize(board) * 10) / 10, autoHeight: true } }] }) });
      // contrast against everything beneath the words: sampled across where the lines really are (a headline that
      // crosses from the ground onto a shape must read on both)
      // where the lines are, in the text's own box, then carried onto the board as the text is drawn (turned words are
      // read along their turned band, not across the box they were turned from)
      const area = inkArea({ ...t, rotation: 0 }, { x: 0, y: 0, w: b.w, h: b.h }, L);
      const m = nodeMatrix(t);
      const ox = b.x - t.x;
      const oy = b.y - t.y;
      // five across (the ends included: a line may cross onto a shape only with its last words) and three down
      const samples = [0.04, 0.27, 0.5, 0.73, 0.96].flatMap((fx) =>
        [0.25, 0.5, 0.75].map((fy) => {
          const [bx, by] = applyMat(m, area.x + area.w * fx, area.y + area.h * fy);
          return beneath(board, l, ox + bx, oy + by);
        }),
      );
      const large = pxOf(board, t.size) >= 24 || (pxOf(board, t.size) >= 18.66 && t.weight >= 700);
      const need = large ? 3 : 4.5;
      const colours = [...new Set(samples.filter((u): u is { color: string } => 'color' in u).map((u) => u.color))];
      if (samples.some((u) => 'image' in u)) {
        // words straight on a photograph: said, for the designer (no colour is right everywhere on a picture)
        if (!t.stroke) add({ kind: 'contrast', severity: 'low', artboard: board.id, node: n.id, message: `“${name}” sits straight on a picture: check that it reads everywhere, or give it a ground.` });
      }
      if (colours.length && !(t.fill === null && !t.stroke)) {
        const own = t.fill === null && t.stroke ? t.stroke.color.slice(0, 7) : t.fill && typeof t.fill === 'object' ? meanOf(t.fill) : t.color.slice(0, 7);
        // letters outlined firmly (a stroke of at least 3% of the size) read by their outline as well as their fill
        const outlined = t.stroke && t.fill !== null && t.stroke.width >= t.size * 0.03 ? t.stroke.color.slice(0, 7) : null;
        const ratio = Math.max(Math.min(...colours.map((c) => contrastRatio(own, c))), outlined ? Math.min(...colours.map((c) => contrastRatio(outlined, c))) : 0);
        if (ratio < need) {
          const best = opts.palette?.length ? inkOnAll(own, colours, need, opts.palette, true) : inkOnAll(own, colours, need, [doc.tokens.colors.text, doc.tokens.colors.background, doc.tokens.colors.accentText]);
          // when no one colour reads on everything beneath the words, the last resort is a ground of their own: a plate
          // of a palette colour the words already read on, just beneath them in their own group, turned with them
          const plate = (): Op[] | undefined => {
            const fill = [doc.tokens.colors.background, doc.tokens.colors.text, doc.tokens.colors.surface, ...(opts.palette?.length ? opts.palette : ['#ffffff', '#111111'])].find((c) => /^#[0-9a-f]{6}$/i.test(c) && contrastRatio(own, c) >= need + 0.2);
            if (!fill) return undefined;
            const pad = Math.max(t.size * 0.22, 4);
            const w = area.w + pad * 2;
            const h = area.h + pad * 2;
            const th = ((t.rotation ?? 0) * Math.PI) / 180;
            const dx = area.x + area.w / 2 - t.w / 2;
            const dy = area.y + area.h / 2 - t.h / 2;
            const cx = t.x + t.w / 2 + dx * Math.cos(th) - dy * Math.sin(th);
            const cy = t.y + t.h / 2 + dx * Math.sin(th) + dy * Math.cos(th);
            const parent = l.parents[l.parents.length - 1];
            const index = (parent ? parent.children : board.children).findIndex((x) => x.id === n.id);
            return [{ op: 'add', artboard: board.id, ...(parent ? { parent: parent.id } : {}), index: Math.max(0, index), node: { type: 'shape', shape: 'rect', name: `Ground for “${name}”`, x: cx - w / 2, y: cy - h / 2, w, h, rotation: t.rotation ?? 0, fill } }];
          };
          // a gradient drawn in the letters is what is seen: the colour that reads replaces it (setting the colour alone would
          // change nothing on screen)
          const fix = best.ratio >= need ? [{ op: 'update', id: n.id, set: { color: best.color, ...(t.fill && typeof t.fill === 'object' ? { fill: best.color } : {}) } } as Op] : !t.path && !t.warp ? plate() : undefined;
          add({
            kind: 'contrast',
            severity: 'high',
            artboard: board.id,
            node: n.id,
            message: `“${name}” reads at ${ratio.toFixed(1)}:1 against what is beneath it (${need}:1 needed).${best.ratio < need ? (fix ? ' No one colour reads on everything beneath it: it is given a ground of its own.' : ' No one colour reads on everything beneath it: move it, or change what is behind it.') : ''}`,
            ...(locked || doc.locks?.colors ? { blocked: true } : fix ? { fix } : {}),
          });
        }
      }
      for (const m of t.text.match(/\[[^\]]{1,40}\]/g) ?? []) add({ kind: 'placeholder', severity: 'low', artboard: board.id, node: n.id, message: `${m} is a placeholder: the brief did not say it.` });
    }
    // words on words: two texts whose set lines cross (turned and vertical texts are composed on purpose and left out)
    const inks = visible
      .filter((l) => l.node.type === 'text' && !l.node.rotation && !(l.node as TextNode).vertical && !(l.node as TextNode).path && !l.node.decorative)
      .map((l) => ({ l, a: inkArea(l.node as TextNode, boxOnBoard(l), layoutText(l.node as TextNode, measure)) }));
    for (let i = 0; i < inks.length; i++)
      for (let j = i + 1; j < inks.length; j++) {
        const p = inks[i].a;
        const q = inks[j].a;
        const ox = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x);
        const oy = Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y);
        if (ox <= 1 || oy <= 1) continue;
        const a = inks[i].l.node;
        const b = inks[j].l.node;
        add({ kind: 'collision', severity: 'high', artboard: board.id, node: b.id, message: `“${b.name ?? b.role ?? 'Text'}” is set over “${a.name ?? a.role ?? 'text'}”: move one of them.`, ...(isLocked(inks[j].l) ? { blocked: true } : {}) });
      }
  }
  return out;
}

const weight = (fs: readonly GFinding[]) => fs.reduce((s, f) => s + (f.severity === 'high' ? 3 : f.severity === 'medium' ? 1 : 0), 0);

export interface Refined {
  doc: GraphicDoc;
  /** what was fixed, said */
  fixed: string[];
  /** what is left */
  remaining: GFinding[];
  rounds: number;
}

/** The fixes applied, checked again, at most `rounds` times, never making it worse (see the head of this file). */
export function refineDoc(doc: GraphicDoc, measure: Measure = approxMeasure, rounds = 2, opts: CheckOpts = {}): Refined {
  let cur = doc;
  let findings = checkDoc(cur, measure, opts);
  const fixed: string[] = [];
  let r = 0;
  for (; r < rounds; r++) {
    const fixable = findings.filter((f) => f.fix && !f.blocked);
    if (!fixable.length) break;
    // every fix at once (the usual case: they are independent, and it takes one check)
    let next = cur;
    let did: string[] = [];
    for (const f of fixable) {
      const res = applyOps(next, f.fix!);
      if (res.ok) {
        next = res.doc;
        did.push(f.message);
      }
    }
    let after = checkDoc(next, measure, opts);
    if (!better(findings, after)) {
      // together they made something worse (a word moved onto another): each fix on its own, kept only when it helps
      // and brings no new high finding
      next = cur;
      after = findings;
      did = [];
      for (const f of fixable) {
        const res = applyOps(next, f.fix!);
        if (!res.ok) continue;
        const trial = checkDoc(res.doc, measure, opts);
        if (!better(after, trial)) continue;
        next = res.doc;
        after = trial;
        did.push(f.message);
      }
      if (!did.length) break;
    }
    cur = next;
    findings = after;
    fixed.push(...did);
  }
  return { doc: cur, fixed, remaining: findings, rounds: r };
}

/** A repair is kept only when it makes the design better and brings no high finding it did not have. */
function better(before: readonly GFinding[], after: readonly GFinding[]): boolean {
  if (weight(after) >= weight(before)) return false;
  const key = (f: GFinding) => `${f.kind}|${f.artboard}|${f.node ?? ''}`;
  const had = new Set(before.filter((f) => f.severity === 'high').map(key));
  return !after.some((f) => f.severity === 'high' && !had.has(key(f)));
}
