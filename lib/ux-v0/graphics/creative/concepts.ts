// lib/ux-v0/graphics/creative/concepts.ts — concepts kept, compared, revisited and combined.
//
// A concept is a starting point to work from, not a proposal to accept or turn down: each artboard is one (its
// creative record travels with it, decisions.ts), and any of them can be kept as it stands to come back to later
// (doc.concepts, at most MAX_CONCEPTS). Keeping one copies the artboard and its palette and type; coming back to one
// puts it on the artboard in place of what is there — what was there is kept first, so nothing is ever lost. Another
// concept's decisions can be taken one at a time (its typography, its colours, its forms) by the executor
// (execute.ts takeFrom), so two concepts combine without starting again.

import { boardTokens, idMap, MAX_CONCEPTS, newId, walk, type Artboard, type GraphicDoc, type Op, type SavedConcept } from '../doc';
import type { ConceptRef } from './execute';
import { boardOf } from './decisions';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** The next free name ("Concept 3"). */
export function nextConceptName(doc: GraphicDoc): string {
  const used = new Set((doc.concepts ?? []).map((c) => c.name.toLowerCase()));
  let n = (doc.concepts?.length ?? 0) + 1;
  while (used.has(`concept ${n}`)) n++;
  return `Concept ${n}`;
}

/** An artboard kept as it stands, without the history of how it got there (that belongs to the working copy). */
function snapshot(doc: GraphicDoc, board: Artboard, name: string, extra: { said?: string; from?: string; now?: number } = {}): SavedConcept {
  const b = clone(board);
  if (b.creative) delete b.creative.history;
  // the board's own colours and faces are the concept's (kept beside it, not inside the copy)
  delete b.tokens;
  return { id: newId('cc'), name: name.slice(0, 60), at: extra.now ?? Date.now(), board: b, tokens: clone(boardTokens(doc, board)), ...(extra.said ? { said: extra.said.slice(0, 240) } : {}), ...(extra.from ? { from: extra.from } : {}) };
}

/** Keeping the artboard as a concept: the operation that does it, and the concept kept. The oldest goes past the limit. */
export function saveConcept(doc: GraphicDoc, boardId: string, opts: { name?: string; said?: string; now?: number } = {}): { op: Op; concept: SavedConcept; dropped: SavedConcept | null } {
  const board = boardOf(doc, boardId);
  const concept = snapshot(doc, board, opts.name?.trim() || nextConceptName(doc), opts);
  const list = [...(doc.concepts ?? []), concept];
  const dropped = list.length > MAX_CONCEPTS ? list[0] : null;
  return { op: { op: 'concepts', concepts: list.slice(-MAX_CONCEPTS) }, concept, dropped };
}

/** Two artboards that look the same (the same objects, colours, words and places): nothing new to keep. */
function sameBoard(a: Artboard, b: Artboard): boolean {
  const strip = (x: Artboard) => JSON.stringify({ ...x, id: '', name: '', creative: undefined, children: x.children });
  return strip(a) === strip(b);
}

/**
 * Coming back to a kept concept: it takes the artboard's place (the artboard's id and name kept, so it stays where it
 * is on the canvas), its palette and type with it. What was on the artboard is kept as a concept first, unless it is
 * already kept as it is — so going back is never a loss. Null when there is no such concept.
 */
export function revisitConcept(doc: GraphicDoc, boardId: string, conceptId: string, now = Date.now()): { doc: GraphicDoc; label: string; keptAs: string | null } | null {
  const c = (doc.concepts ?? []).find((x) => x.id === conceptId);
  const board = boardOf(doc, boardId);
  if (!c || !board) return null;
  let concepts = [...(doc.concepts ?? [])];
  let keptAs: string | null = null;
  if (!concepts.some((x) => sameBoard(x.board, board))) {
    const kept = snapshot(doc, board, `${nextConceptName(doc)} (before going back)`, { now });
    keptAs = kept.name;
    concepts = [...concepts, kept].slice(-MAX_CONCEPTS);
  }
  // its objects keep their ids unless another artboard already uses one; the creative record follows any that change
  const taken = new Set(doc.artboards.filter((b) => b.id !== boardId).flatMap((b) => walk(b).map((l) => l.node.id)));
  const restored: Artboard = { ...clone(c.board), id: board.id, name: board.name };
  if (walk(restored).some((l) => taken.has(l.node.id))) {
    const before = clone(restored);
    const reid = (n: Artboard['children'][number]): Artboard['children'][number] => {
      const id = taken.has(n.id) ? newId(n.id.charAt(0) || 'n') : n.id;
      taken.add(id);
      return n.type === 'group' ? { ...n, id, children: n.children.map(reid) } : { ...n, id };
    };
    restored.children = restored.children.map(reid);
    const map = idMap(before, restored);
    if (restored.creative?.forms) restored.creative.forms.ids = restored.creative.forms.ids.map((id) => map.get(id) ?? id);
    if (restored.creative?.background?.id) restored.creative.background.id = map.get(restored.creative.background.id) ?? restored.creative.background.id;
  }
  // its colours and faces come back with it: on the artboard alone when there are others beside it (or it already had
  // a language of its own), for the whole design when it is the only one
  const own = !!board.tokens || doc.artboards.length > 1;
  if (own) restored.tokens = clone(c.tokens);
  else delete restored.tokens;
  return {
    doc: { ...doc, tokens: own ? doc.tokens : clone(c.tokens), artboards: doc.artboards.map((b) => (b.id === boardId ? restored : b)), concepts, revision: (doc.revision ?? 0) + 1, updatedAt: now },
    label: `back to “${c.name}”`,
    keptAs,
  };
}

/** A kept concept let go. */
export function forgetConcept(doc: GraphicDoc, conceptId: string): Op {
  return { op: 'concepts', concepts: (doc.concepts ?? []).filter((c) => c.id !== conceptId) };
}

/** A kept concept renamed. */
export function renameConcept(doc: GraphicDoc, conceptId: string, name: string): Op {
  return { op: 'concepts', concepts: (doc.concepts ?? []).map((c) => (c.id === conceptId ? { ...c, name: name.trim().slice(0, 60) || c.name } : c)) };
}

/**
 * Every concept a change can take decisions from, as a document of its own: the kept ones first (so “concept 2” is
 * the second kept), then the other artboards of this design by name.
 */
export function conceptRefs(doc: GraphicDoc, boardId?: string): ConceptRef[] {
  const kept = (doc.concepts ?? []).map((c) => ({ id: c.id, name: c.name, doc: { ...doc, name: c.name, tokens: c.tokens, artboards: [c.board], concepts: undefined } as GraphicDoc }));
  const others = doc.artboards.filter((b) => b.id !== boardId).map((b) => ({ id: b.id, name: b.name, doc: { ...doc, name: b.name, tokens: boardTokens(doc, b), artboards: [b], concepts: undefined } as GraphicDoc }));
  return [...kept, ...others];
}
