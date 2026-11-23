// lib/ux-v0/graphics/director/flow.ts — one creative request, start to finish: understand, decide, execute, evaluate.
//
// The orchestration is here, once, for whoever carries it (the browser through SocriaUX's routes; the benchmark
// straight to the provider): the transport only asks and answers, and the bench only measures type and draws
// pictures. Everything that decides what happens to the document is the same code in both.
//
//   a design   the director is asked → its answer is composed (design.ts) → what is measurable is measured
//              (evaluate.ts) → the rendered picture is shown to the director once (review), its corrections applied
//              unless they would make the measurable state worse.
//   a change   what the person said to keep is read (protect.ts) → the design is read into a sheet with the project's
//              memory (sheet.ts) → the director is asked, with the picture for anything beyond an exact change →
//              a question is passed on as a question; edits are carried out under the protections (apply.ts) → a
//              change of feel, composition or the whole is reviewed once from its picture → the turn is written to
//              the journal with what it replaced (journal.ts).
// At most three provider calls for one request (ask, one review; never a loop), and one for an exact change.
// Nothing here falls back silently: when the director cannot be reached, the caller is told, and decides.

import type { Artboard, GraphicDoc } from '../doc';
import type { Measure } from '../text';
import { contentOf, type GraphicBrief, type GraphicDirection, type GraphicKind } from '../compose';
import type { PlanQuestion } from '../creative/plan';
import { applyEdit, type Outcome } from './apply';
import { composeDirected, type Decided } from './design';
import { measure as measureBoard, type Measured } from './evaluate';
import { recordTurn } from './journal';
import { protectionsIn, type Protection } from './protect';
import type { DirectedDesign, DirectedEdit, DirectedReview, EditOp } from './schema';
import { memoryOfRecord, sheetOf, type ProjectMemory, type Sheet } from './sheet';
import { editTier } from './tier';

export type Answer<T> = { ok: true; value: T } | { ok: false; reason: 'unreachable' | 'cancelled' | 'unreadable'; error?: string };

export interface Transport {
  design(body: { brief: GraphicBrief; memory?: ProjectMemory; decided?: Decided & { avoid?: string[] }; avoid?: string[]; another?: boolean }): Promise<Answer<DirectedDesign>>;
  edit(body: { words: string; sheet: Sheet; memory: ProjectMemory; asked?: PlanQuestion | null; picture?: string | null }): Promise<Answer<DirectedEdit>>;
  review(body: { sheet: Sheet; memory: ProjectMemory; made: string; measured: string[]; protectedSaid: string[]; picture: string }): Promise<Answer<DirectedReview>>;
}

export interface Bench {
  /** run a composition with real type widths (the faces it uses loaded and measured first) */
  settle<T>(fn: (m: Measure) => T): Promise<T>;
  /** the artboard as a picture (a data URL), or null when it cannot be drawn here */
  picture(doc: GraphicDoc, boardId: string): Promise<string | null>;
  measure: Measure;
}

export interface Reviewed {
  verdict: 'ship' | 'revise' | null;
  seen: string[];
  /** the corrections were applied */
  applied: boolean;
  /** the corrections made something measurably worse and were not kept */
  reverted: boolean;
  failed: string[];
  /** corrections that reached past what the change touched, and were not applied */
  held?: string[];
}

/** What a look at the render may correct after a change that was not a redesign. */
export interface ReviewScope {
  /** objects the change addressed by id, and those it added: these may be restyled, moved, reordered or removed */
  addressed: ReadonlySet<string>;
  /** objects the change altered at all (a new palette repaints many): these may be restyled, nothing more */
  changed: ReadonlySet<string>;
  /** the change moved the ground */
  ground: boolean;
}

/**
 * Corrections held to what the change touched. A person who asked for one thing did not ask for the rest of their
 * design to be tidied: a look at the render fixes what the change did, and what it reaches for beyond that is listed
 * and left alone.
 */
export function withinScope(edits: readonly EditOp[], scope: ReviewScope): { edits: EditOp[]; held: string[] } {
  const kept: EditOp[] = [];
  const held: string[] = [];
  for (const e of edits) {
    const ok = e.do === 'set' ? scope.addressed.has(e.id) || scope.changed.has(e.id) : e.do === 'place' || e.do === 'remove' || e.do === 'order' || e.do === 'words' ? scope.addressed.has(e.id) : e.do === 'ground' ? scope.ground : false;
    if (ok) kept.push(e);
    else held.push(e.do === 'add' ? 'an addition that was not asked for' : e.do === 'ground' ? 'a change of ground that was not asked for' : e.do === 'restore' ? 'a restore that was not asked for' : `${e.do === 'set' ? 'a restyle of' : e.do === 'place' ? 'a move of' : e.do === 'remove' ? 'the removal of' : e.do === 'order' ? 'a reorder of' : 'new words for'} an object the change did not touch (${e.id})`);
  }
  return { edits: kept, held };
}

const boardOf = (doc: GraphicDoc, id: string): Artboard => doc.artboards.find((b) => b.id === id) ?? doc.artboards[0];

/** One bounded look at the rendered result (never a loop; never kept when it makes the measurable state worse). */
async function reviewOnce(t: Transport, b: Bench, doc: GraphicDoc, boardId: string, made: string, o: { memory: ProjectMemory; protection?: Protection; kind?: GraphicKind; scope?: ReviewScope }): Promise<{ doc: GraphicDoc; review: Reviewed | null }> {
  const sheet = sheetOf(doc, boardId);
  const url = sheet ? await b.picture(doc, boardId).catch(() => null) : null;
  if (!sheet || !url) return { doc, review: null };
  const content = contentOf(boardOf(doc, boardId)).content;
  const before = measureBoard(doc, boardId, { measure: b.measure, content });
  const a = await t.review({ sheet, memory: o.memory, made, measured: before.findings, protectedSaid: o.protection?.said ?? [], picture: url });
  if (!a.ok) return { doc, review: null };
  const rv = a.value;
  if (rv.verdict === 'ship' || !rv.edits.length) return { doc, review: { verdict: rv.verdict, seen: rv.seen, applied: false, reverted: false, failed: [] } };
  const scoped = o.scope ? withinScope(rv.edits, o.scope) : { edits: rv.edits, held: [] };
  const held = scoped.held.length ? { held: scoped.held } : {};
  if (!scoped.edits.length) return { doc, review: { verdict: rv.verdict, seen: rv.seen, applied: false, reverted: false, failed: [], ...held } };
  const edit: DirectedEdit = { understanding: { level: 'element', goal: 'corrections after looking at the rendered design', affects: [], preserves: [] }, summary: rv.seen.join('; '), edits: scoped.edits, dropped: rv.dropped };
  const out = await b.settle((m) => applyEdit(doc, edit, { board: boardId, measure: m, kind: o.kind, given: '', protection: o.protection }));
  const after = measureBoard(out.doc, boardId, { measure: b.measure, content });
  if (!out.changed || after.high > before.high) return { doc, review: { verdict: rv.verdict, seen: rv.seen, applied: false, reverted: out.changed, failed: out.failed, ...held } };
  return { doc: out.doc, review: { verdict: rv.verdict, seen: rv.seen, applied: true, reverted: false, failed: out.failed, ...held } };
}

export type DesignResult =
  | { ok: true; doc: GraphicDoc; dir: GraphicDirection; design: DirectedDesign; problems: string[]; measured: Measured; review: Reviewed | null }
  | { ok: false; reason: 'unreachable' | 'cancelled' | 'unreadable'; error?: string };

/** A design from a brief (see the head of this file). */
export async function designFlow(
  t: Transport,
  b: Bench,
  brief: GraphicBrief,
  base: GraphicDirection,
  o: { memory?: ProjectMemory; decided?: Decided & { avoid?: string[] }; avoid?: string[]; another?: boolean; review?: boolean; assets?: GraphicDoc['assets']; name?: string; seed?: number; now?: number } = {},
): Promise<DesignResult> {
  const a = await t.design({ brief, memory: o.memory, decided: o.decided, avoid: o.avoid, another: o.another });
  if (!a.ok) return a;
  const design = a.value;
  const made = await b.settle((m) => composeDirected(brief, design, base, { measure: m, seed: o.seed, assets: o.assets, name: o.name, decided: o.decided, now: o.now }));
  if (!made) return { ok: false, reason: 'unreadable', error: 'The design’s program had nothing SocriaUX could build.' };
  let doc = made.doc;
  const boardId = doc.artboards[0].id;
  let review: Reviewed | null = null;
  if (o.review !== false) {
    const r = await reviewOnce(t, b, doc, boardId, `a new ${brief.kind}: ${design.concept.idea}`, { memory: { ...(o.memory ?? {}), idea: design.concept.idea, rationale: design.concept.decisions }, kind: brief.kind });
    doc = r.doc;
    review = r.review;
  }
  const problems = [...made.problems, ...made.unresolved.map((u) => `tight at this size: ${u}`), ...(made.placed.length ? [`the design had no place for ${made.placed.join(', ')}, so SocriaUX set ${made.placed.length === 1 ? 'it' : 'them'} in free space`] : [])];
  return { ok: true, doc, dir: made.dir, design, problems, measured: measureBoard(doc, boardId, { measure: b.measure, content: brief.content }), review };
}

export type EditResult =
  | { kind: 'done'; doc: GraphicDoc; edit: DirectedEdit; outcome: Outcome; review: Reviewed | null; protection: Protection }
  | { kind: 'question'; question: PlanQuestion; edit: DirectedEdit }
  /** understood, but nothing changed: said with why (already so, kept as asked, or every edit failed) */
  | { kind: 'nothing'; edit: DirectedEdit; outcome: Outcome; protection: Protection }
  | { kind: 'unreachable' | 'cancelled' | 'unreadable'; error?: string };

/** Levels whose result is looked at once after it is made. */
const REVIEWED = new Set(['aesthetic', 'conceptual', 'global', 'composition']);

/** A change asked in words, carried out by the director (see the head of this file). */
export async function editFlow(
  t: Transport,
  b: Bench,
  doc: GraphicDoc,
  boardId: string,
  words: string,
  o: { kind?: GraphicKind; memory?: ProjectMemory; asked?: PlanQuestion | null; selection?: readonly string[]; review?: boolean; now?: number } = {},
): Promise<EditResult> {
  const board = boardOf(doc, boardId);
  const sheet = sheetOf(doc, board.id, { selection: o.selection });
  if (!sheet) return { kind: 'unreadable', error: 'There is nothing on this artboard to change yet.' };
  const protection = protectionsIn(words);
  const memory: ProjectMemory = { ...(o.memory ?? {}), ...(o.kind ? { kind: o.kind } : {}), ...memoryOfRecord(board.directed) };
  // the picture travels with anything beyond an exact change to something named
  const url = editTier(words).tier === 'premium' ? await b.picture(doc, board.id).catch(() => null) : null;
  const a = await t.edit({ words, sheet, memory, asked: o.asked ?? null, picture: url });
  if (!a.ok) return { kind: a.reason, error: a.error };
  const edit = a.value;
  if (edit.question) return { kind: 'question', question: edit.question, edit };
  const out = await b.settle((m) => applyEdit(doc, edit, { board: board.id, measure: m, kind: o.kind, given: words, protection }));
  if (!out.changed) return { kind: 'nothing', edit, outcome: out, protection };
  let next = out.doc;
  let review: Reviewed | null = null;
  if (o.review !== false && REVIEWED.has(edit.understanding.level)) {
    // a redesign is looked at whole; anything less is corrected only where the change reached
    const whole = edit.understanding.level === 'global' || edit.understanding.level === 'conceptual';
    const scope: ReviewScope | undefined = whole ? undefined : { addressed: new Set([...edit.edits.flatMap((e) => ('id' in e ? [e.id] : [])), ...out.diff.added.map((x) => x.id)]), changed: new Set(out.diff.changed.map((c) => c.id)), ground: out.diff.ground };
    const r = await reviewOnce(t, b, next, board.id, edit.summary, { memory, protection, kind: o.kind, scope });
    next = r.doc;
    review = r.review;
  }
  next = recordTurn(doc, next, board.id, { said: words, did: edit.summary || out.did, level: edit.understanding.level, at: o.now });
  return { kind: 'done', doc: next, edit, outcome: out, review, protection };
}

/** What a finished change is said to have done: the director's sentence, held to what really changed. */
export function saidOfEdit(r: Extract<EditResult, { kind: 'done' | 'nothing' }>): string {
  const o = r.outcome;
  const kept = o.kept.length ? ` Kept as you asked: ${o.kept.join(', ')}.` : '';
  const failed = o.failed.length ? ` Not done: ${o.failed.slice(0, 3).join('; ')}${o.failed.length > 3 ? `; and ${o.failed.length - 3} more` : ''}.` : '';
  if (r.kind === 'nothing') return `${r.edit.summary ? `${r.edit.summary} ` : ''}Nothing on the design changed.${kept}${failed}`.trim();
  const notes = o.notes.length ? ` (${o.notes.slice(0, 2).join('; ')})` : '';
  const looked = r.review?.applied ? ` After looking at the result, SocriaUX corrected: ${r.review.seen.slice(0, 2).join('; ')}.` : '';
  return `${r.edit.summary || `Changed: ${o.did}.`}${notes}${kept}${failed}${looked}`;
}
