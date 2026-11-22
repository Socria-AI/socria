// lib/ux-v0/graphics/logo/session.ts — what the Logo panel and the ask bar do to a document, as pure functions: an edit
// in words applied (its new concepts added to the record, the targeted one put on the artboard, an exploration's
// concepts only added), a concept from the record put back on the artboard, the lockup or colour scheme changed, the
// lettering or the symbol's weight adjusted (a new concept derived, the old kept), a concept approved, and the
// identity built from the approved one (an identity sheet and the responsive variants as artboards). Each returns a
// new document and what happened, said plainly; nothing here mutates its input.

import { normalizeDoc, type Artboard, type GraphicDoc } from '../doc';
import { hash32 } from '../styles/hash';
import type { ColourScheme } from './build';
import { combineConcepts, applyLogoEdit, readLogoEdit, rebuildMark, type LogoEditId, LOGO_VARIATIONS } from './edits';
import type { LockupKind, LogoConcept, WordmarkSpec } from './concepts';
import { applyConcept, variantBoards } from './compose';
import { identityFor, identitySheet, identitySystem } from './identity';
import { addConcepts, setStatus } from './record';
import { conceptFrom, conceptsOf, selectedConcept } from './rebuild';
import type { LetteringStyle, Modification } from './glyphs';

export interface SessionResult {
  doc: GraphicDoc;
  said: string;
  /** concepts the step added to the record */
  added: LogoConcept[];
  ok: boolean;
}

const boardOf = (doc: GraphicDoc, boardId: string) => doc.artboards.find((b) => b.id === boardId && b.logo) ?? null;
const withRecord = (doc: GraphicDoc, boardId: string, rec: NonNullable<Artboard['logo']>): GraphicDoc => ({
  ...doc,
  artboards: doc.artboards.map((b) => (b.id === boardId ? { ...b, logo: rec } : b)),
  revision: doc.revision + 1,
  updatedAt: Date.now(),
});
const fail = (doc: GraphicDoc, said: string): SessionResult => ({ doc, said, added: [], ok: false });

/** A logo edit applied to a logo artboard (see the head of this file). */
export function logoEdit(doc: GraphicDoc, boardId: string, id: LogoEditId): SessionResult {
  const board = boardOf(doc, boardId);
  if (!board?.logo) return fail(doc, 'This artboard has no logo to edit.');
  const rec = board.logo;
  const current = selectedConcept(rec);
  if (!current) return fail(doc, 'The logo record has no concept to work from.');
  const all = conceptsOf(rec);
  const r = applyLogoEdit(current, rec.brief, id, all, rec.round + 1);
  if (!r.concepts.length) return { doc, said: r.said, added: [], ok: false };
  const exploration = (LOGO_VARIATIONS as readonly { id: string; scope: string }[]).some((v) => v.id === id && v.scope === 'exploration');
  if (exploration) return { doc: withRecord(doc, boardId, addConcepts(rec, r.concepts)), said: `${r.said} They are in the concepts list; nothing on the artboard changed.`, added: r.concepts, ok: r.met };
  const next = applyConcept(doc, boardId, r.concepts[0], { add: r.concepts });
  return { doc: next, said: `${r.said} The previous concept is kept in the list.`, added: r.concepts, ok: r.met };
}

/** An edit read from words, if they ask for a logo edit. */
export function logoEditFromWords(doc: GraphicDoc, boardId: string, words: string): SessionResult | null {
  const e = readLogoEdit(words);
  return e ? logoEdit(doc, boardId, e.id) : null;
}

/** A concept of the record put on the artboard. */
export function putConcept(doc: GraphicDoc, boardId: string, conceptId: string): SessionResult {
  const board = boardOf(doc, boardId);
  const r = board?.logo?.concepts.find((c) => c.id === conceptId);
  if (!board?.logo || !r) return fail(doc, 'That concept is not in this logo’s record.');
  const c = conceptFrom(r, board.logo.brief);
  return { doc: applyConcept(doc, boardId, c, { lockup: r.lockup }), said: `“${c.title}” is on the artboard; every other concept is kept.`, added: [], ok: true };
}

/** A concept rejected (kept in the record, set aside) or restored. */
export function rejectConcept(doc: GraphicDoc, boardId: string, conceptId: string, restore = false): SessionResult {
  const board = boardOf(doc, boardId);
  if (!board?.logo) return fail(doc, 'This artboard has no logo.');
  if (!restore && board.logo.selected === conceptId) return fail(doc, 'The concept on the artboard cannot be rejected; put another one on it first.');
  return {
    doc: withRecord(doc, boardId, setStatus(board.logo, conceptId, restore ? 'proposed' : 'rejected')),
    said: restore ? 'Restored to the list.' : 'Set aside (kept, never deleted); its structure is remembered as one not to repeat.',
    added: [],
    ok: true,
  };
}

/** Two concepts combined: the first's symbol with the second's wordmark and colour, put on the artboard. */
export function combine(doc: GraphicDoc, boardId: string, a: string, b: string): SessionResult {
  const board = boardOf(doc, boardId);
  const ra = board?.logo?.concepts.find((c) => c.id === a);
  const rb = board?.logo?.concepts.find((c) => c.id === b);
  if (!board?.logo || !ra || !rb) return fail(doc, 'Choose two concepts of this logo to combine.');
  const c = combineConcepts(conceptFrom(ra, board.logo.brief), conceptFrom(rb, board.logo.brief), board.logo.brief);
  return { doc: applyConcept(doc, boardId, c), said: c.edit ?? 'Combined.', added: [c], ok: true };
}

/** The lockup or the colour scheme changed (the same concept). */
export function setPresentation(doc: GraphicDoc, boardId: string, set: { lockup?: LockupKind; scheme?: ColourScheme }): SessionResult {
  const board = boardOf(doc, boardId);
  const c = board?.logo ? selectedConcept(board.logo) : null;
  if (!board?.logo || !c) return fail(doc, 'This artboard has no logo.');
  return { doc: applyConcept(doc, boardId, c, { ...set, status: board.logo.approved === c.id ? 'approved' : 'selected' }), said: set.lockup ? `The ${set.lockup} lockup.` : `The ${set.scheme} version.`, added: [], ok: true };
}

const derivedId = (base: LogoConcept, what: string) => `${base.id}_${(hash32(`${base.id}|${what}`) >>> 0).toString(36).slice(0, 6)}`;

/** The lettering adjusted by hand (a derived concept; the symbol untouched). */
export function adjustLettering(doc: GraphicDoc, boardId: string, patch: { style?: Partial<LetteringStyle>; modification?: Modification; font?: string; weight?: number; tracking?: number; case?: WordmarkSpec['case'] }): SessionResult {
  const board = boardOf(doc, boardId);
  const c = board?.logo ? selectedConcept(board.logo) : null;
  if (!board?.logo || !c) return fail(doc, 'This artboard has no logo.');
  const w = c.wordmark;
  const wordmark: WordmarkSpec =
    w.kind === 'constructed'
      ? { ...w, style: { ...w.style!, ...(patch.style ?? {}) }, ...(patch.modification ? { modification: patch.modification } : {}) }
      : { ...w, ...(patch.font ? { font: patch.font } : {}), ...(patch.weight ? { weight: patch.weight } : {}), ...(patch.tracking !== undefined ? { tracking: patch.tracking } : {}), ...(patch.case ? { case: patch.case } : {}) };
  const next: LogoConcept = { ...c, id: derivedId(c, JSON.stringify(wordmark)), wordmark, status: 'proposed', parents: [c.id], edit: 'Lettering adjusted by hand' };
  return { doc: applyConcept(doc, boardId, next), said: 'The lettering is adjusted; the symbol’s geometry is unchanged, the previous version kept in the list.', added: [next], ok: true };
}

/** The symbol's stroke weight or softness adjusted (rebuilt from the same method and seed). */
export function adjustSymbol(doc: GraphicDoc, boardId: string, patch: { sw?: number; soft?: number }): SessionResult {
  const board = boardOf(doc, boardId);
  const c = board?.logo ? selectedConcept(board.logo) : null;
  if (!board?.logo || !c?.method) return fail(doc, 'This logo has no constructed symbol to adjust.');
  const b = board.logo.brief;
  const sw = Math.round(Math.max(30, Math.min(240, patch.sw ?? c.sw)));
  const soft = Math.round(Math.max(0, Math.min(1, patch.soft ?? c.soft)) * 100) / 100;
  const ops = String((c.mark?.params as Record<string, unknown> | undefined)?.ops ?? '')
    .split(',')
    .filter(Boolean);
  const mark = rebuildMark(c.method, c.seed, { name: b.name, initials: b.initials, sw, soft, avoid: new Set(b.avoid), ...(b.creature ? { creature: b.creature } : {}) }, ops);
  const next: LogoConcept = { ...c, id: derivedId(c, `${sw}|${soft}`), sw, soft, mark, status: 'proposed', parents: [c.id], edit: 'Symbol weight adjusted by hand' };
  return { doc: applyConcept(doc, boardId, next), said: `The symbol rebuilt at stroke ${sw} and softness ${soft}; the wordmark is unchanged.`, added: [next], ok: true };
}

/** The concept on the artboard approved: the identity's source. */
export function approve(doc: GraphicDoc, boardId: string): SessionResult {
  const board = boardOf(doc, boardId);
  const c = board?.logo ? selectedConcept(board.logo) : null;
  if (!board?.logo || !c) return fail(doc, 'This artboard has no logo to approve.');
  return { doc: withRecord(doc, boardId, setStatus(board.logo, c.id, 'approved')), said: `“${c.title}” is approved. The identity can be built from it; other concepts stay in the list, none treated as approved.`, added: [], ok: true };
}

/** The identity built from the approved concept: an identity sheet and the responsive variants, added as artboards
 * after the logo (ones already there are replaced, so building twice does not duplicate). */
export function buildIdentity(doc: GraphicDoc, boardId: string): SessionResult & { system?: ReturnType<typeof identitySystem> } {
  const board = boardOf(doc, boardId);
  const rec = board?.logo;
  const r = rec?.concepts.find((c) => c.id === rec.approved);
  if (!board || !rec || !r) return fail(doc, 'Approve a concept first: the identity is built from the approved logo only.');
  const c = conceptFrom(r, rec.brief);
  const ident = identityFor(c, rec.brief);
  const made = [identitySheet(c, rec.brief, ident), ...variantBoards(c, rec)];
  const ids = new Set(made.map((m) => m.id));
  const kept = doc.artboards.filter((b) => !ids.has(b.id));
  const at = kept.findIndex((b) => b.id === boardId) + 1;
  const artboards = [...kept.slice(0, at), ...made, ...kept.slice(at)];
  return {
    doc: { ...doc, artboards, revision: doc.revision + 1, updatedAt: Date.now() },
    said: `The identity of “${c.title}”: an identity sheet and ${made.length - 1} variants (primary, horizontal, vertical, symbol, wordmark, black, reversed, small, app icon, favicon), each an artboard you can export.`,
    added: [],
    ok: true,
    system: identitySystem(c, rec.brief, ident),
  };
}

/** Whether the logo on an artboard has been edited by hand (its drawn objects differ from the selected concept's,
 * both held to the document's shape first, positions rounded). */
export function editedByHand(board: Artboard): boolean {
  if (!board.logo) return false;
  const c = selectedConcept(board.logo);
  if (!c) return false;
  const base: GraphicDoc = {
    schema: 1,
    id: 'x',
    name: 'x',
    tokens: { colors: { background: '#ffffff', surface: '#ffffff', text: '#000000', muted: '#777777', accent: '#000000', accentText: '#ffffff', line: '#dddddd' }, fonts: { display: 'Inter', body: 'Inter' } },
    artboards: [{ ...board }],
    assets: [],
    revision: 0,
    updatedAt: 0,
  };
  const fresh = applyConcept({ ...base, artboards: [{ ...board, children: [] }] }, board.id, c, { lockup: board.logo.lockup, scheme: board.logo.scheme });
  const now = normalizeDoc(JSON.parse(JSON.stringify(base)));
  const want = normalizeDoc(JSON.parse(JSON.stringify(fresh)));
  const pick = (d: GraphicDoc | null) => d?.artboards[0].children.find((n) => n.role === 'logo' && n.type === 'group');
  const fp = (n: unknown): string => JSON.stringify(n, (k, v) => (k === 'id' || k === 'x' || k === 'y' ? undefined : typeof v === 'number' ? Math.round(v * 2) / 2 : v));
  const g = pick(now);
  if (!g) return true;
  return fp(g) !== fp(pick(want));
}
