// lib/ux-v0/graphics/director/journal.ts — what a change did to an artboard, measured, and kept as a turn.
//
// Whoever made a change (the director's edits, the precise reader, a hand on the canvas through words), the same
// measurement says what it did: the artboard before and after are compared object by object, by stable id, property
// by property. That comparison is the truth told to the person ("the headline: size" — or "nothing changed"), the
// scope check of the benchmark, and — kept as a snapshot of the values replaced — what lets a later turn put an
// earlier state back exactly (record.ts). Nothing here interprets; it only compares.

import { walk, type Artboard, type GraphicDoc, type Node, type Tokens } from '../doc';
import { withTurn, type DirectedRecord, type JournalEntry, type Snapshot } from './record';

export interface NodeChange {
  id: string;
  /** what it is, for a sentence */
  what: string;
  role: string;
  keys: string[];
}
export interface BoardDiff {
  changed: NodeChange[];
  added: { id: string; what: string }[];
  removed: { id: string; what: string }[];
  ground: boolean;
  tokens: boolean;
  /** objects that are exactly as they were */
  same: number;
  /** nothing at all is different */
  none: boolean;
}

const J = JSON.stringify;
const label = (n: Node) => {
  const role = n.role && n.role !== 'motif' ? n.role : n.type === 'shape' ? 'shape' : n.type;
  const names: Record<string, string> = { headline: 'the headline', subhead: 'the supporting line', meta: 'the details', cta: 'the call to action', logo: 'the logo', background: 'the background', image: 'a picture', body: 'the body text', caption: 'a caption', label: 'a label', shape: 'a shape', pattern: 'a pattern', group: 'a group', text: 'a text', chart: 'the chart', data: 'the chart' };
  return n.type === 'text' && n.decorative ? 'the decorative lettering' : names[role] ?? `a ${role}`;
};
const own = (n: Node): Record<string, unknown> => {
  const { children: _c, ...rest } = n as Node & { children?: unknown };
  return rest as Record<string, unknown>;
};

/** One artboard against another, object by object (ids are stable across a change). */
export function diffBoards(before: Artboard, after: Artboard, tokensBefore?: Tokens, tokensAfter?: Tokens): BoardDiff {
  const A = new Map(walk(before).map((l) => [l.node.id, l.node]));
  const B = new Map(walk(after).map((l) => [l.node.id, l.node]));
  const changed: NodeChange[] = [];
  const removed: BoardDiff['removed'] = [];
  const added: BoardDiff['added'] = [];
  let same = 0;
  for (const [id, a] of A) {
    const b = B.get(id);
    if (!b) {
      removed.push({ id, what: label(a) });
      continue;
    }
    const x = own(a);
    const y = own(b);
    const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((k) => J(x[k]) !== J(y[k]));
    if (keys.length) changed.push({ id, what: label(b), role: b.role ?? 'none', keys });
    else same++;
  }
  for (const [id, b] of B) if (!A.has(id)) added.push({ id, what: label(b) });
  const ground = (before.background ?? null) !== (after.background ?? null);
  const tokens = !!tokensBefore && !!tokensAfter && J(tokensBefore) !== J(tokensAfter);
  return { changed, added, removed, ground, tokens, same, none: !changed.length && !added.length && !removed.length && !ground && !tokens };
}

/** What a diff replaced, kept so it can be put back: the old values of exactly the properties that changed. */
export function snapshotOf(before: Artboard, after: Artboard, tokensBefore: Tokens, tokensAfter: Tokens): Snapshot {
  const d = diffBoards(before, after, tokensBefore, tokensAfter);
  const A = new Map(walk(before).map((l) => [l.node.id, l]));
  const snap: Snapshot = {};
  if (J(tokensBefore.colors) !== J(tokensAfter.colors)) snap.colors = { ...tokensBefore.colors };
  if ((tokensBefore.accent2 ?? null) !== (tokensAfter.accent2 ?? null)) snap.accent2 = tokensBefore.accent2 ?? null;
  if (J(tokensBefore.fonts) !== J(tokensAfter.fonts)) snap.fonts = { ...tokensBefore.fonts };
  if (d.ground) snap.ground = before.background ?? null;
  if (d.changed.length) {
    snap.nodes = {};
    for (const c of d.changed.slice(0, 40)) {
      const was = own(A.get(c.id)!.node);
      // a property the change added is restored by taking it away again (null)
      snap.nodes[c.id] = Object.fromEntries(c.keys.map((k) => [k, was[k] === undefined ? null : was[k]]));
    }
  }
  const top = d.removed.map((r) => A.get(r.id)!).filter((l) => l.parents.length === 0);
  if (top.length) snap.removed = top.slice(0, 40).map((l) => ({ node: l.node as unknown as Record<string, unknown>, index: l.index }));
  if (d.added.length) snap.added = d.added.map((a) => a.id).slice(0, 120);
  return snap;
}

/** The diff as a sentence for the person (what really changed; never more than that). */
export function saidOfDiff(d: BoardDiff): string {
  if (d.none) return 'nothing changed';
  const parts: string[] = [];
  const by = new Map<string, Set<string>>();
  for (const c of d.changed) by.set(c.what, new Set([...(by.get(c.what) ?? []), ...c.keys]));
  const words: Record<string, string> = { x: 'position', y: 'position', w: 'size of its box', h: 'size of its box', size: 'size', font: 'face', weight: 'weight', color: 'colour', fill: 'colour', stroke: 'outline', case: 'case', tracking: 'spacing', lineHeight: 'leading', align: 'alignment', rotation: 'angle', opacity: 'opacity', effects: 'effects', text: 'wording', italic: 'italic', blend: 'blend', radius: 'corners', runs: 'accent word', hidden: 'visibility' };
  for (const [what, keys] of [...by].slice(0, 6)) parts.push(`${what} (${[...new Set([...keys].map((k) => words[k] ?? k))].slice(0, 4).join(', ')})`);
  if (by.size > 6) parts.push(`${by.size - 6} more object${by.size - 6 === 1 ? '' : 's'}`);
  if (d.added.length) parts.push(`${d.added.length} new object${d.added.length === 1 ? '' : 's'}`);
  if (d.removed.length) parts.push(`${d.removed.length} removed`);
  if (d.ground) parts.push('the ground');
  if (d.tokens && !d.changed.length) parts.push('the palette or faces');
  return parts.join('; ');
}

const boardOf = (doc: GraphicDoc, id: string) => doc.artboards.find((b) => b.id === id);
const tokensOf = (doc: GraphicDoc, b: Artboard) => b.tokens ?? doc.tokens;

/**
 * A turn written into the artboard's record: what was said and done, with what it replaced when it was applied
 * (measured between the two documents). Returns the later document with the record on its artboard.
 */
export function recordTurn(before: GraphicDoc, after: GraphicDoc, boardId: string, turn: { said: string; did: string; level?: string; status?: JournalEntry['status']; at?: number; idea?: string; rationale?: string[] }): GraphicDoc {
  const b0 = boardOf(before, boardId);
  const b1 = boardOf(after, boardId);
  if (!b1) return after;
  const status = turn.status ?? 'applied';
  const snap = status === 'applied' && b0 ? snapshotOf(b0, b1, tokensOf(before, b0), tokensOf(after, b1)) : undefined;
  const entry: JournalEntry = { said: turn.said.slice(0, 600), did: turn.did.slice(0, 400), at: turn.at ?? Date.now(), status, ...(turn.level ? { level: turn.level } : {}), ...(snap && Object.keys(snap).length ? { before: snap } : {}) };
  const rec: DirectedRecord = { ...withTurn(b1.directed, entry), ...(turn.idea ? { idea: turn.idea.slice(0, 300) } : {}), ...(turn.rationale?.length ? { rationale: turn.rationale.slice(0, 8) } : {}) };
  return { ...after, artboards: after.artboards.map((x) => (x.id === boardId ? { ...x, directed: rec } : x)) };
}
