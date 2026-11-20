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

/** What is beneath a point of an artboard, drawn before `before`: a colour, or a picture. */
function beneath(board: Artboard, before: Located, px: number, py: number): { color: string } | { image: true } {
  const order = walk(board);
  const at = order.findIndex((l) => l.node.id === before.node.id);
  for (let i = at - 1; i >= 0; i--) {
    const l = order[i];
    const n = l.node;
    if (n.hidden || n.opacity < 0.5 || n.type === 'group' || n.type === 'text' || n.type === 'chart') continue;
    // an object inside a group that is the text's own ancestor does not count as "beneath" it
    if (before.parents.some((g) => g.id === n.id)) continue;
    const b = boxOnBoard(l);
    if (px < b.x || px > b.x + b.w || py < b.y || py > b.y + b.h) continue;
    if (n.type === 'image') return { image: true };
    if (n.type === 'shape') {
      if (n.fill === null || n.shape === 'line') continue;
      if (typeof n.fill === 'string') return { color: n.fill.slice(0, 7) };
      return { color: middleOf(n.fill) };
    }
  }
  return { color: (board.background ?? '#ffffff').slice(0, 7) };
}

/** The colour a gradient shows at its middle (a mesh's centre): what words over it are read against. */
function middleOf(g: Exclude<Paint, string>): string {
  if (g.type === 'mesh') {
    const m = g.mesh ?? [];
    if (m.length === 9) return m[4].slice(0, 7);
    return m.length ? m.reduce((acc, c, i) => (i ? mixColor(acc, c, 1 / (i + 1)) : c)).slice(0, 7) : '#ffffff';
  }
  return g.stops.length ? colorAt(g.stops, 0.5).slice(0, 7) : '#ffffff';
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

/** The colour that reads best on every colour given: the text's own when it is enough, else the best of the inks. */
export function inkOnAll(own: string, under: readonly string[], need: number, palette: readonly string[] = []): { color: string; ratio: number } {
  const score = (c: string) => Math.min(...under.map((u) => contrastRatio(c, u)));
  if (score(own) >= need) return { color: own, ratio: score(own) };
  const cands = [...under.map((u) => ensureContrast(own, u, need)), ...palette, '#111111', '#ffffff'];
  const best = cands.reduce((a, c) => (score(c) > score(a) ? c : a), own);
  return { color: best, ratio: score(best) };
}

/** Every finding of a document (see the head of this file). */
export function checkDoc(doc: GraphicDoc, measure: Measure = approxMeasure): GFinding[] {
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
      const area = inkArea(t, b, L);
      // five across (the ends included: a line may cross onto a shape only with its last words) and three down
      const samples = [0.04, 0.27, 0.5, 0.73, 0.96].flatMap((fx) => [0.25, 0.5, 0.75].map((fy) => beneath(board, l, area.x + area.w * fx, area.y + area.h * fy)));
      const large = pxOf(board, t.size) >= 24 || (pxOf(board, t.size) >= 18.66 && t.weight >= 700);
      const need = large ? 3 : 4.5;
      const colours = [...new Set(samples.filter((u): u is { color: string } => 'color' in u).map((u) => u.color))];
      if (samples.some((u) => 'image' in u)) {
        // words straight on a photograph: said, for the designer (no colour is right everywhere on a picture)
        if (!t.stroke) add({ kind: 'contrast', severity: 'low', artboard: board.id, node: n.id, message: `“${name}” sits straight on a picture: check that it reads everywhere, or give it a ground.` });
      }
      if (colours.length && !(t.fill === null && !t.stroke)) {
        const own = t.fill === null && t.stroke ? t.stroke.color.slice(0, 7) : t.fill && typeof t.fill === 'object' ? middleOf(t.fill) : t.color.slice(0, 7);
        const ratio = Math.min(...colours.map((c) => contrastRatio(own, c)));
        if (ratio < need) {
          const best = inkOnAll(own, colours, need, [doc.tokens.colors.text, doc.tokens.colors.background, doc.tokens.colors.accentText]);
          add({
            kind: 'contrast',
            severity: 'high',
            artboard: board.id,
            node: n.id,
            message: `“${name}” reads at ${ratio.toFixed(1)}:1 against what is beneath it (${need}:1 needed).${best.ratio < need ? ' No one colour reads on everything beneath it: move it, or change what is behind it.' : ''}`,
            ...(locked || doc.locks?.colors ? { blocked: true } : best.ratio >= need ? { fix: [{ op: 'update', id: n.id, set: { color: best.color } }] } : {}),
          });
        }
      }
      for (const m of t.text.match(/\[[^\]]{1,40}\]/g) ?? []) add({ kind: 'placeholder', severity: 'low', artboard: board.id, node: n.id, message: `${m} is a placeholder: the brief did not say it.` });
    }
    // words on words: two texts whose set lines cross (turned and vertical texts are composed on purpose and left out)
    const inks = visible
      .filter((l) => l.node.type === 'text' && !l.node.rotation && !(l.node as TextNode).vertical && !(l.node as TextNode).path)
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
export function refineDoc(doc: GraphicDoc, measure: Measure = approxMeasure, rounds = 2): Refined {
  let cur = doc;
  let findings = checkDoc(cur, measure);
  const fixed: string[] = [];
  let r = 0;
  for (; r < rounds; r++) {
    const fixable = findings.filter((f) => f.fix && !f.blocked);
    if (!fixable.length) break;
    let next = cur;
    const did: string[] = [];
    for (const f of fixable) {
      const res = applyOps(next, f.fix!);
      if (res.ok) {
        next = res.doc;
        did.push(f.message);
      }
    }
    const after = checkDoc(next, measure);
    // a round that does not make it better is taken back
    if (weight(after) >= weight(findings)) break;
    cur = next;
    findings = after;
    fixed.push(...did);
  }
  return { doc: cur, fixed, remaining: findings, rounds: r };
}
