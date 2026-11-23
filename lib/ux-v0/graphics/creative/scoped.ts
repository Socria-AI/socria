// lib/ux-v0/graphics/creative/scoped.ts — a creative instruction about some objects, carried out on those objects alone.
//
// A comment pinned on the headline that says "this should feel more premium", or "make this warmer" on a shape, is
// about those objects and nothing else: the rest of the design is not repainted or re-set because of it. The precise
// reader (edit.ts) takes what it knows first (bigger, bolder, red, centred, these words); what is left is read here
// for the qualities and colour moves it names and applied to the objects named — a text's face from the character the
// quality calls for (premium → luxury, editorial, technical…), its weight and case, every colour of the objects moved
// by the shifts said (warmer, darker, more muted…) — each text refitted so nothing overflows. Null when the words name
// nothing that can be done to an object.

import { walk, type GraphicDoc, type Node, type Op, type Paint, type TextNode } from '../doc';
import { approxMeasure, fitSize, type Measure } from '../text';
import { characterIn, nudgeColour, qualitiesIn, typeSetFor, CHARACTER_LABEL, type PaletteShift, type TypeCharacter } from './lexicon';
import { weightFor } from './execute';
import { shiftsIn } from './interpret';

export interface ScopedEdit {
  ops: Op[];
  /** what was done, in a few words */
  label: string;
}

const paintNudged = (p: Paint | null | undefined, shifts: readonly PaletteShift[]): Paint | null | undefined => {
  if (typeof p === 'string') return shifts.reduce((c, sh) => nudgeColour(c, sh), p);
  if (p && typeof p === 'object' && Array.isArray((p as { stops?: unknown }).stops)) {
    const g = p as unknown as Record<string, unknown> & { stops: { at: number; color: string }[] };
    return { ...g, stops: g.stops.map((x) => ({ ...x, color: shifts.reduce((c, sh) => nudgeColour(c, sh), x.color.slice(0, 7)) + x.color.slice(7) })) } as unknown as Paint;
  }
  return p;
};

/** The words carried out on the objects named alone, or null when they name nothing that can be done to them. */
export function readScoped(words: string, doc: GraphicDoc, boardId: string, nodeIds: readonly string[], measure: Measure = approxMeasure): ScopedEdit | null {
  const board = doc.artboards.find((b) => b.id === boardId);
  if (!board || !nodeIds.length) return null;
  const w = words.toLowerCase();
  const ids = new Set(nodeIds);
  // the objects, and what is inside a group named
  const targets: Node[] = [];
  for (const l of walk(board)) if ((ids.has(l.node.id) || l.parents.some((p) => ids.has(p.id))) && !l.node.locked && !l.node.hidden && l.node.type !== 'group') targets.push(l.node);
  if (!targets.length) return null;
  const qs = qualitiesIn(w);
  const shifts = [...new Set([...shiftsIn(w), ...qs.flatMap((q) => q.palette ?? [])])].slice(0, 3) as PaletteShift[];
  const character: TypeCharacter | null = characterIn(w) ?? ((qs.find((q) => q.type)?.type as TypeCharacter | undefined) ?? null);
  const heavier = /\b(heavier|bolder|thicker|stronger)\b/.test(w);
  const lighterWeight = /\b(thinner|finer|more delicate|lighter weight|less bold)\b/.test(w);
  const upper = /\b(capitals|caps|uppercase|all caps)\b/.test(w);
  const lowerCase = /\b(lowercase|sentence case|no caps|no capitals)\b/.test(w);
  const ops: Op[] = [];
  const said: string[] = [];
  const texts = targets.filter((n): n is TextNode => n.type === 'text');
  if (texts.length && (character || heavier || lighterWeight || upper || lowerCase)) {
    for (const n of texts) {
      const next: Partial<TextNode> = {};
      if (character) {
        const set = typeSetFor(character, { display: n.font, body: n.font }, 0);
        const big = n.size >= 28 || n.role === 'headline' || n.role === 'logo';
        next.font = big ? set.display : set.body;
        next.weight = weightFor(next.font, big ? set.weight : n.weight);
        if (big && set.case) next.case = set.case;
      }
      if (heavier) next.weight = weightFor(next.font ?? n.font, Math.min(900, (next.weight ?? n.weight) + 200));
      if (lighterWeight) next.weight = weightFor(next.font ?? n.font, Math.max(200, (next.weight ?? n.weight) - 200));
      if (upper) next.case = 'upper';
      if (lowerCase) next.case = 'none';
      if (!n.autoHeight) {
        const fit = fitSize({ ...n, ...next } as TextNode, measure);
        if (fit < n.size) next.size = Math.round(fit * 10) / 10;
      }
      ops.push({ op: 'update', id: n.id, set: next as Record<string, unknown> });
    }
    said.push(character ? `set ${CHARACTER_LABEL[character].toLowerCase()}` : heavier ? 'heavier' : lighterWeight ? 'lighter in weight' : upper ? 'in capitals' : 'in sentence case');
  }
  if (shifts.length) {
    for (const n of targets) {
      const set: Record<string, unknown> = {};
      if (n.type === 'text') {
        set.color = shifts.reduce((c, sh) => nudgeColour(c, sh), n.color);
        if (n.fill) set.fill = paintNudged(n.fill, shifts);
      }
      if (n.type === 'shape') {
        if (n.fill !== undefined) set.fill = paintNudged(n.fill, shifts);
        if (n.stroke?.color) set.stroke = { ...n.stroke, color: shifts.reduce((c, sh) => nudgeColour(c, sh), n.stroke.color) };
      }
      if (n.type === 'chart') set.colors = n.colors.map((c) => shifts.reduce((x, sh) => nudgeColour(x, sh), c));
      if (Object.keys(set).length) {
        // a text changed twice (its face and its colour) is one update
        const prev = ops.find((o) => o.op === 'update' && o.id === n.id) as Extract<Op, { op: 'update' }> | undefined;
        if (prev) Object.assign(prev.set, set);
        else ops.push({ op: 'update', id: n.id, set });
      }
    }
    said.push(`its colour ${shifts.join(', ')}`);
  }
  if (!ops.length) return null;
  const name = targets.length === 1 ? (targets[0].name ?? targets[0].role ?? targets[0].type).toLowerCase() : `${targets.length} objects`;
  return { ops, label: `${name}: ${said.join('; ')}` };
}
