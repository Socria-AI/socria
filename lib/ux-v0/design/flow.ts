// lib/ux-v0/design/flow.ts — one request, start to finish: written, drawn as it streams, carried out, looked at once.
//
//   the person's words ──► the designer writes (streamed) ──► drawn as it grows (applyAnswer, partial)
//                                   │ complete
//                                   ▼
//                       carried out (applyAnswer): cleaned, ids given, what failed listed
//                                   │ an artboard made or rewritten?
//                                   ▼
//                       one look at the rendered pictures ──► precise edits to those artboards only, or "ok"
//                                   ▼
//                       a version, and a turn that says what really changed
//
// The transport is the browser's route call (components/ux-v0/design/useDesigner.ts) or the benchmark's; the bench
// is whatever can draw an artboard as a picture and say what it measured. No loop: at most one look per request.

import { applyAnswer, changedSentence, type Applied } from './apply';
import { annotate, artboardOf, commit, newId, normalizeFindings, type DesignDoc, type DesignFinding, type DesignState, type DesignTurn } from './doc';
import { earlierFor, type EarlierVersion } from './history';
import { mergePins, pinNotes, pinsFrom } from './pins';
import type { Parse } from './elements';
import { parseAnswer, type Answer } from './protocol';
import { requestTier } from './request';
import { unservedFaces } from './frame';

export interface WriteBody {
  mode: 'write' | 'look' | 'review';
  words: string;
  doc: DesignDoc;
  kind: string;
  format: string;
  memory: DesignState['memory'];
  turns: DesignTurn[];
  comments: DesignState['comments'];
  assets: { id: string; name: string; width: number; height: number; note?: string }[];
  selection?: DesignTurn['selection'];
  answering?: { text: string; options: string[] } | null;
  system?: { name: string; rules: string[] } | null;
  measured?: Record<string, string[]>;
  /** look: the artboards looked at, their pictures in the same order, and what was done */
  artboards?: string[];
  pictures?: string[];
  made?: string;
  picture?: string | null;
  /** the earlier versions the words point at, with the artboards in question as they were */
  earlier?: EarlierVersion[];
  /** the company the project belongs to, as the designer is told of it (lib/ux-v0/company) */
  company?: unknown;
}

export type Sent = { ok: true; text: string; model: string | null; usage: Record<string, unknown> | null } | { ok: false; error: string; cancelled?: boolean; signIn?: boolean; limit?: boolean };

export interface Transport {
  send(body: WriteBody, onText: (delta: string, reset?: boolean) => void, signal?: AbortSignal): Promise<Sent>;
}

export interface Bench {
  /** the artboard as a picture (a data URL), or null */
  picture(a: DesignDoc['artboards'][number], tokens: string): Promise<string | null>;
  /** what was measured on these artboards as drawn (cut text, things outside), said */
  measure(doc: DesignDoc, ids: string[]): Promise<Record<string, string[]>>;
}

export interface Request {
  words: string;
  selection?: DesignTurn['selection'];
  answering?: { text: string; options: string[] } | null;
  system?: { name: string; rules: string[] } | null;
  /** send a picture of the selected artboard with the request (a change of look) */
  withPicture?: boolean;
  /** no look after (variations made in bulk, the benchmark's control) */
  noLook?: boolean;
  /** the company the project belongs to, as the designer is told of it */
  company?: unknown;
  /** pictures the project may use beyond its own (the company's library), told to the designer with how each may be used */
  library?: { id: string; name: string; width: number; height: number; note?: string }[];
}

export type Outcome =
  | { kind: 'done'; state: DesignState; turn: DesignTurn; applied: Applied; looked: Looked | null; usage: Record<string, unknown>[] }
  | { kind: 'question'; state: DesignState; turn: DesignTurn; question: { text: string; options: string[] }; usage: Record<string, unknown>[] }
  | { kind: 'failed'; error: string; cancelled?: boolean; signIn?: boolean; limit?: boolean };

export interface Looked {
  ok: boolean;
  said: string;
  /** edits the look made, carried out */
  fixed: number;
  /** edits it made to artboards it was not shown, set aside */
  held: number;
  failed: string[];
}

const now = () => Date.now();

function bodyOf(s: DesignState, r: Request, extra: Partial<WriteBody> = {}): WriteBody {
  return {
    mode: 'write',
    words: r.words,
    doc: s.doc,
    kind: s.kind,
    format: s.format,
    memory: s.memory,
    turns: s.turns.slice(-12),
    comments: s.comments.filter((c) => !c.resolved).slice(-20),
    assets: [...s.assets.map((a) => ({ id: a.id, name: a.name, width: a.width, height: a.height, ...(a.note ? { note: a.note } : {}) })), ...(r.library ?? []).filter((l) => !s.assets.some((a) => a.id === l.id)).map((l) => ({ id: l.id, name: l.name, width: l.width, height: l.height, ...(l.note ? { note: l.note } : {}) }))].slice(0, 40),
    selection: r.selection ?? null,
    answering: r.answering ?? null,
    system: r.system ?? null,
    ...(r.company ? { company: r.company } : {}),
    ...extra,
  };
}

/** What each artboard does against what the person said to keep (pins.ts), in words, by artboard. */
function pinFacts(doc: DesignDoc, ids: readonly string[], pins: DesignState['memory']['pins']): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!pins) return out;
  for (const id of ids) {
    const a = doc.artboards.find((x) => x.id === id);
    const notes = a && !a.locked ? pinNotes(a, doc.tokens, pins) : [];
    if (notes.length) out[id] = notes;
  }
  return out;
}

const mergeFacts = (...all: Record<string, string[]>[]): Record<string, string[]> => {
  const out: Record<string, string[]> = {};
  for (const m of all) for (const [k, v] of Object.entries(m)) out[k] = [...(out[k] ?? []), ...v];
  return out;
};

/** A request in words, carried out (see the head of this file). */
export async function runRequest(
  s0: DesignState,
  r: Request,
  t: Transport,
  b: Bench,
  o: { parse: Parse; onDraft?: (doc: DesignDoc, answer: Answer) => void; onPhase?: (p: 'writing' | 'looking' | 'fixing') => void; signal?: AbortSignal; now?: number }
): Promise<Outcome> {
  const at = o.now ?? now();
  const person: DesignTurn = { id: newId('t'), role: 'person', text: r.words, at, ...(r.selection ? { selection: r.selection } : {}) };
  // measured facts and a picture of the selected artboard travel with a request about it
  const sel = artboardOf(s0.doc, r.selection?.artboard);
  const measured = sel ? mergeFacts(withFaces(await b.measure(s0.doc, [sel.id]).catch(() => ({})), s0.doc, [sel.id]), pinFacts(s0.doc, [sel.id], s0.memory.pins)) : {};
  const picture = sel && r.withPicture ? await b.picture(sel, s0.doc.tokens).catch(() => null) : null;
  // the earlier versions the words point at ("the colours from before", "the type from version 3")
  const earlier = earlierFor(s0, r.words, sel ? [sel.id] : s0.doc.artboards.length <= 2 ? s0.doc.artboards.map((a) => a.id) : []);
  let raw = '';
  let lastDraw = 0;
  // one id for each new artboard, from its first drawn line to the answer's end
  const names: Record<string, string> = {};
  const draw = () => {
    if (!o.onDraft) return;
    const ans = parseAnswer(raw);
    o.onDraft(applyAnswer(s0.doc, ans, { parse: o.parse, format: s0.format, partial: true, names }).doc, ans);
  };
  o.onPhase?.('writing');
  const sent = await t.send(
    bodyOf(s0, r, { measured, ...(picture ? { picture } : {}), ...(earlier.length ? { earlier } : {}) }),
    (d, reset) => {
      raw = reset ? '' : raw + d;
      if (Date.now() - lastDraw > 350) {
        lastDraw = Date.now();
        draw();
      }
    },
    o.signal
  );
  if (!sent.ok) return { kind: 'failed', error: sent.error, cancelled: sent.cancelled, signIn: sent.signIn, limit: sent.limit };
  const usage: Record<string, unknown>[] = sent.usage ? [sent.usage] : [];
  const answer = parseAnswer(sent.text);
  const applied = applyAnswer(s0.doc, answer, { parse: o.parse, format: s0.format, names });
  let memory = applied.remember.length ? { ...s0.memory, decisions: [...new Set([...s0.memory.decisions, ...applied.remember])].slice(-30) } : s0.memory;
  // typography or colour the person said to keep: taken from the artboard named, as it is, and held from now on
  for (const k of applied.keep) {
    const a = artboardOf(applied.doc, k.artboard) ?? artboardOf(s0.doc, k.artboard);
    if (a) memory = { ...memory, pins: mergePins(memory.pins, pinsFrom(a, applied.doc.tokens, k.what)) };
  }

  // an exception to the brand the person authorized: held for this project, and no longer reported
  for (const x of applied.allow) {
    const had = memory.allowed?.[x.what] ?? [];
    if (!had.some((v) => v.toLowerCase() === x.value.toLowerCase())) memory = { ...memory, allowed: { ...(memory.allowed ?? {}), [x.what]: [...had, x.value].slice(-12) } };
  }

  // a question, and nothing made: asked as a question
  if (applied.question && !applied.touched.length && !applied.removed.length && !applied.tokensChanged) {
    const turn: DesignTurn = { id: newId('t'), role: 'designer', text: [answer.say, applied.question.text].filter(Boolean).join('\n\n'), at: at + 1, options: applied.question.options };
    return { kind: 'question', state: { ...s0, memory, turns: [...s0.turns, person, turn] }, turn, question: applied.question, usage };
  }

  let doc = applied.doc;
  let looked: Looked | null = null;
  // one look, at the artboards made or rewritten whole — and at those edited for a change of feel or of the whole
  // (premium work: is the change there to see?). An exact edit to something named is not looked at.
  const rewritten = answer.blocks.filter((x) => x.kind === 'artboard').map((x) => applied.ids[(x as { id: string }).id] ?? (x as { id: string }).id);
  const broad = requestTier(r.words, s0.doc.artboards.length > 0).tier === 'premium';
  const edited = broad ? applied.touched.filter((id) => s0.doc.artboards.some((a) => a.id === id)) : [];
  const lookAt = [...new Set([...rewritten, ...edited])].filter((id) => doc.artboards.some((a) => a.id === id)).slice(0, 3);
  if (lookAt.length && !r.noLook && !o.signal?.aborted) {
    o.onPhase?.('looking');
    const l = await lookOnce(doc, lookAt, r.words, changedSentence(applied, doc), { ...s0, memory }, t, b, { ...o, system: r.system, company: r.company, library: r.library });
    if (l) {
      looked = l.looked;
      doc = l.doc;
      if (l.usage) usage.push(l.usage);
    }
  }

  const changed = changedSentence(applied, doc);
  // what was made against what the person said to keep, as it stands after the look: said, never hidden
  const offPins = Object.entries(pinFacts(doc, [...new Set([...applied.touched, ...applied.made])], memory.pins)).map(([id, notes]) => `“${artboardOf(doc, id)?.name ?? 'An artboard'}” is ${notes.join('; and ')}.`);
  const failed = [...applied.failed, ...(looked?.failed ?? []), ...offPins];
  const designChanged = applied.touched.length > 0 || applied.removed.length > 0 || applied.tokensChanged;
  const noted = applied.locked.length > 0 || applied.keep.length > 0 || applied.allow.length > 0;
  const said = designChanged || noted ? answer.say || changed : `${answer.say ? `${answer.say}\n\n` : ''}Nothing on the design changed.`;
  // (a lock or a kept decision alone is a note on the design, not a new version of it)
  const s1 = designChanged ? commit({ ...s0, memory }, doc, r.words, 'model', at + 2) : applied.locked.length ? annotate({ ...s0, memory }, doc) : { ...s0, memory };
  const turn: DesignTurn = {
    id: newId('t'),
    role: 'designer',
    text: said,
    at: at + 2,
    ...(s1.at !== s0.at ? { version: s1.at } : {}),
    touched: [...new Set([...applied.touched, ...applied.made])],
    ...(failed.length ? { failed } : {}),
  };
  return { kind: 'done', state: { ...s1, turns: [...s1.turns, person, turn] }, turn, applied, looked, usage };
}

/** What was measured, with any face the artboard asks for that the library cannot serve (drawn in a fallback). */
function withFaces(measured: Record<string, string[]>, doc: DesignDoc, ids: string[]): Record<string, string[]> {
  const out = { ...measured };
  for (const id of ids) {
    const a = doc.artboards.find((x) => x.id === id);
    const missing = a ? unservedFaces(a, doc.tokens) : [];
    if (missing.length) out[id] = [...(out[id] ?? []), `not in the font library, so drawn in a fallback face: ${missing.join(', ')} — use a library face`];
  }
  return out;
}

async function lookOnce(
  doc: DesignDoc,
  ids: string[],
  words: string,
  made: string,
  s: DesignState,
  t: Transport,
  b: Bench,
  o: { parse: Parse; signal?: AbortSignal; onPhase?: (p: 'writing' | 'looking' | 'fixing') => void; system?: Request['system']; company?: unknown; library?: Request['library'] }
): Promise<{ looked: Looked; doc: DesignDoc; usage: Record<string, unknown> | null } | null> {
  const boards = ids.map((id) => doc.artboards.find((a) => a.id === id)!).filter(Boolean);
  const pictures: string[] = [];
  for (const a of boards) {
    const p = await b.picture(a, doc.tokens).catch(() => null);
    if (!p) return null;
    pictures.push(p);
  }
  const measured = mergeFacts(withFaces(await b.measure(doc, ids).catch(() => ({})), doc, ids), pinFacts(doc, ids, s.memory.pins));
  const sent = await t.send(bodyOf({ ...s, doc }, { words, system: o.system ?? null, company: o.company, library: o.library }, { mode: 'look', artboards: ids, pictures, made, measured }), () => {}, o.signal);
  if (!sent.ok) return null;
  const ans = parseAnswer(sent.text);
  // a look corrects what was just made: edits to the artboards it was shown, nothing else
  const kept = ans.blocks.filter((x) => x.kind === 'edit' && ids.includes(x.artboard));
  const held = ans.blocks.length - kept.length - ans.blocks.filter((x) => x.kind === 'remember').length;
  if (!kept.length) return { looked: { ok: ans.ok || !ans.blocks.length, said: ans.say, fixed: 0, held: Math.max(0, held), failed: [] }, doc, usage: sent.usage };
  o.onPhase?.('fixing');
  const fixed = applyAnswer(doc, { ...ans, blocks: kept }, { parse: o.parse, format: s.format });
  return { looked: { ok: false, said: ans.say, fixed: fixed.touched.length, held: Math.max(0, held), failed: fixed.failed }, doc: fixed.doc, usage: sent.usage };
}

// ── a review: what a critical eye finds, for the person to act on or set aside ──

export type ReviewOutcome = { kind: 'done'; state: DesignState; turn: DesignTurn; findings: DesignFinding[]; usage: Record<string, unknown>[] } | { kind: 'failed'; error: string; cancelled?: boolean; signIn?: boolean; limit?: boolean };

/**
 * The artboards looked at critically (at most three, with their pictures and what was measured on them), against
 * what the person asked for, the brief, the brand and what they said to keep. Nothing on the design changes: the
 * findings are kept on the designer's turn, each to be applied or set aside by the person.
 */
export async function runReview(
  s0: DesignState,
  r: { words: string; artboards: string[]; system?: Request['system']; company?: unknown; library?: Request['library']; facts?: Record<string, string[]> },
  t: Transport,
  b: Bench,
  o: { signal?: AbortSignal; now?: number; onPhase?: (p: 'writing' | 'looking' | 'fixing') => void }
): Promise<ReviewOutcome> {
  const at = o.now ?? now();
  const ids = r.artboards.filter((id) => s0.doc.artboards.some((a) => a.id === id)).slice(0, 3);
  if (!ids.length) return { kind: 'failed', error: 'Select the artboard to review.' };
  const words = r.words.trim() || 'Review this design.';
  const pictures: string[] = [];
  for (const id of ids) {
    const p = await b.picture(artboardOf(s0.doc, id)!, s0.doc.tokens).catch(() => null);
    if (!p) return { kind: 'failed', error: 'The design could not be drawn to be looked at.' };
    pictures.push(p);
  }
  o.onPhase?.('looking');
  const measured = mergeFacts(withFaces(await b.measure(s0.doc, ids).catch(() => ({})), s0.doc, ids), pinFacts(s0.doc, ids, s0.memory.pins), r.facts ?? {});
  const sent = await t.send(bodyOf(s0, { words, system: r.system ?? null, company: r.company, library: r.library }, { mode: 'review', artboards: ids, pictures, measured }), () => {}, o.signal);
  if (!sent.ok) return { kind: 'failed', error: sent.error, cancelled: sent.cancelled, signIn: sent.signIn, limit: sent.limit };
  const answer = parseAnswer(sent.text);
  // (a review changes nothing: only what it found is read, and only about artboards it was shown)
  const found = answer.blocks.filter((x): x is Extract<typeof x, { kind: 'finding' }> => x.kind === 'finding');
  const findings = normalizeFindings(
    found
      .map((f) => ({ id: newId('f'), kind: f.type, artboard: ids.includes(f.artboard) ? f.artboard : ids.length === 1 ? ids[0] : '', element: f.element, text: f.text, fix: f.fix, status: 'open' }))
      .filter((f) => f.artboard)
      .map((f) => ({ ...f, element: f.element && artboardOf(s0.doc, f.artboard)?.html.includes(`data-sx="${f.element}"`) ? f.element : null }))
  );
  const person: DesignTurn = { id: newId('t'), role: 'person', text: words, at, selection: { artboard: ids[0], element: null, label: `“${artboardOf(s0.doc, ids[0])?.name ?? 'the design'}”` } };
  const turn: DesignTurn = { id: newId('t'), role: 'designer', text: answer.say || (findings.length ? 'Here is what I see.' : 'I found nothing that needs changing.'), at: at + 1, ...(findings.length ? { findings } : {}) };
  return { kind: 'done', state: { ...s0, turns: [...s0.turns, person, turn] }, turn, findings, usage: sent.usage ? [sent.usage] : [] };
}

/** A finding marked as applied or set aside, on the turn that holds it. */
export function markFinding(s: DesignState, id: string, status: DesignFinding['status']): DesignState {
  return { ...s, turns: s.turns.map((t) => (t.findings?.some((f) => f.id === id) ? { ...t, findings: t.findings.map((f) => (f.id === id ? { ...f, status } : f)) } : t)) };
}
