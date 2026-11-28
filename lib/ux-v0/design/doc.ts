// lib/ux-v0/design/doc.ts — a design project: artboards written as HTML and CSS, and everything said about them.
//
// THE DOCUMENT IS THE CODE. An artboard is an HTML fragment (its <style> and its markup) at a fixed size; a design is
// a set of artboards and one stylesheet of shared tokens (tokens.css). What the model writes is what renders, what
// the person edits on the canvas and what exports: nothing is translated in between.
//
// Every element carries a stable id (data-sx): the canvas selects by it, the inspector edits by it, comments pin to
// it and the model is told it, so "this" and "the subhead" mean one element across turns. Ids are given on saving
// (lib/ux-v0/design/elements.ts) and kept when an element survives a rewrite.
//
// Every change, the model's or the person's, is a version, and no version is ever thrown away by making another: a
// change made after going back to an earlier version branches from it (`from`), so the later work stays in the
// history to compare or return to. Undo moves to the version a version was made from, redo to its newest child. A
// version the person keeps (an approval) is never trimmed. The conversation is kept with the design, and so is what
// the person decided and turned down (memory), so the next request is read against the whole project.
//
// The person's authority is held here too: an artboard has a state (exploration, draft, in review, revision
// requested, approved, archived) and can be locked whole; single elements can be locked (`locks`, by data-sx id).
// What is locked is told to the designer and enforced where answers are carried out (apply.ts) — never left to the
// model's goodwill.

import { DEFAULT_FORMAT, formatOf, type Medium } from './formats';

/** Where an artboard stands. Absent: a draft. */
export const ARTBOARD_STATES = ['exploration', 'draft', 'review', 'revision', 'approved', 'archived'] as const;
export type ArtboardState = (typeof ARTBOARD_STATES)[number];
export const STATE_LABEL: Record<ArtboardState, string> = {
  exploration: 'Exploration',
  draft: 'Draft',
  review: 'In review',
  revision: 'Revision requested',
  approved: 'Approved',
  archived: 'Archived',
};

/** An element the person has protected: the designer may not change it, and the canvas shows it. */
export interface ElementLock {
  /** the element's data-sx id */
  id: string;
  /** what it is, in words ("the headline"), for the designer and the person */
  what: string;
  at: number;
}

export interface DesignArtboard {
  id: string;
  name: string;
  /** a format id (formats.ts), or 'custom' */
  format: string;
  width: number;
  height: number;
  medium: Medium;
  /** the fragment: a <style> block and the markup, inside one root element */
  html: string;
  /** artboards made together as variations share a group, shown side by side */
  group?: string;
  /** where it sits on the canvas */
  x: number;
  y: number;
  /** where it stands in review (absent: a draft) */
  state?: ArtboardState;
  /** the whole artboard is protected: nothing on it changes until it is unlocked */
  locked?: boolean;
  /** elements protected on it */
  locks?: ElementLock[];
  /** it moves: the length of its animation in seconds (its CSS animations play over this; absent: it is still) */
  seconds?: number;
}

export interface DesignDoc {
  artboards: DesignArtboard[];
  /** shared CSS: custom properties (:root) and classes every artboard can use; a design system arrives here */
  tokens: string;
}

export interface DesignVersion {
  at: number;
  /** what made it: the person's words, "Edited on the canvas", "Restored" */
  said: string;
  by: 'model' | 'person';
  doc: DesignDoc;
  /** the version it was made from (an index; absent for the first) */
  from?: number;
  /** kept whatever happens, with why ("Approved: Launch poster"): never trimmed from the history */
  kept?: string;
}

export interface DesignTurn {
  id: string;
  role: 'person' | 'designer';
  text: string;
  at: number;
  /** the version this turn produced (designer turns) */
  version?: number;
  /** artboards it touched */
  touched?: string[];
  /** what could not be done, said */
  failed?: string[];
  /** a question with choices, when the designer asked one */
  options?: string[];
  /** the element that was selected when the person spoke */
  selection?: { artboard: string; element: string | null; label: string } | null;
  /** a review's findings (designer turns), each applied or set aside by the person */
  findings?: DesignFinding[];
}

export interface DesignComment {
  id: string;
  artboard: string;
  element: string | null;
  text: string;
  at: number;
  resolved: boolean;
}

/** What the person has said to keep across the project, exactly: checked on everything made after (pins.ts). */
export interface DesignPins {
  /** the typefaces to stay with, by their names */
  faces?: string[];
  /** the colours to stay with (hex) — their tints and shades count as theirs */
  colours?: string[];
}

export interface DesignMemory {
  /** what is being made, in the person's words */
  brief: string;
  /** decisions that hold across turns ("keep the serif", "no gradients") */
  decisions: string[];
  /** proposals the person turned down */
  rejected: string[];
  /** kept typography and colour, enforced by check */
  pins?: DesignPins;
}

/** One thing a review found: what is happening, where, of what kind — and what could be done, if the person wants. */
export const FINDING_KINDS = ['technical', 'communication', 'brand', 'accessibility', 'opportunity'] as const;
export type FindingKind = (typeof FINDING_KINDS)[number];
export const FINDING_LABEL: Record<FindingKind, string> = {
  technical: 'Technical defect',
  communication: 'Communication',
  brand: 'Brand',
  accessibility: 'Accessibility',
  opportunity: 'Creative opportunity',
};
export interface DesignFinding {
  id: string;
  kind: FindingKind;
  artboard: string;
  element: string | null;
  /** what is happening on the sheet, and what it costs */
  text: string;
  /** the instruction that would address it (carried out only if the person applies it) */
  fix: string;
  status: 'open' | 'applied' | 'dismissed';
}

export interface DesignAsset {
  /** referenced in the HTML as asset:<id> */
  id: string;
  name: string;
  /** an upload (upload:<id>) or a data URL */
  src: string;
  width: number;
  height: number;
  /** what it is, for the designer ("the company's approved logo — use it as it is") */
  note?: string;
}

export interface DesignState {
  v: 1;
  doc: DesignDoc;
  versions: DesignVersion[];
  /** the version shown (an index into versions); undo moves it back */
  at: number;
  turns: DesignTurn[];
  memory: DesignMemory;
  comments: DesignComment[];
  assets: DesignAsset[];
  /** the kind of work the project began as (poster, logo, campaign, website …) */
  kind: string;
  /** the format new artboards are made in unless asked otherwise */
  format: string;
}

export const MAX_HTML = 300_000;
export const MAX_TOKENS_CSS = 60_000;
export const MAX_ARTBOARDS = 40;
export const MAX_VERSIONS = 80;
export const MAX_TURNS = 120;

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const idOk = (v: unknown, prefix = '') => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : `${prefix}${Math.random().toString(36).slice(2, 10)}`);

export const newId = (prefix: string) => `${prefix}${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 7)}`;

export function emptyDoc(): DesignDoc {
  return { artboards: [], tokens: '' };
}

export function emptyState(kind = 'graphic', format = DEFAULT_FORMAT, brief = ''): DesignState {
  return { v: 1, doc: emptyDoc(), versions: [], at: -1, turns: [], memory: { brief: brief.slice(0, 4000), decisions: [], rejected: [] }, comments: [], assets: [], kind, format: formatOf(format) ? format : DEFAULT_FORMAT };
}

export function normalizeArtboard(v: unknown): DesignArtboard | null {
  const r = obj(v);
  const f = formatOf(str(r.format, 40));
  // a size too small to be one is no size: the format's, or no artboard
  const side = (v: unknown, max: number, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 16 ? Math.min(max, Math.round(v)) : d);
  const width = side(r.width, 8000, f?.width ?? 0);
  const height = side(r.height, 20000, f?.height ?? 0);
  if (!width || !height) return null;
  const medium: Medium = r.medium === 'print' || r.medium === 'web' || r.medium === 'screen' ? r.medium : f?.medium ?? 'screen';
  return {
    id: idOk(r.id, 'ab'),
    name: str(r.name, 80) || f?.label || 'Artboard',
    format: f ? f.id : 'custom',
    width,
    height,
    medium,
    html: str(r.html, MAX_HTML),
    ...(typeof r.group === 'string' && /^[\w-]{1,40}$/.test(r.group) ? { group: r.group } : {}),
    x: Math.round(num(r.x, -1e6, 1e6, 0)),
    y: Math.round(num(r.y, -1e6, 1e6, 0)),
    ...((ARTBOARD_STATES as readonly string[]).includes(String(r.state)) && r.state !== 'draft' ? { state: r.state as ArtboardState } : {}),
    ...(r.locked === true ? { locked: true } : {}),
    ...(typeof r.seconds === 'number' && Number.isFinite(r.seconds) && r.seconds >= 0.5 ? { seconds: Math.min(60, Math.round(r.seconds * 10) / 10) } : {}),
    ...((() => {
      const locks = normalizeLocks(r.locks);
      return locks.length ? { locks } : {};
    })()),
  };
}

export function normalizeLocks(v: unknown): ElementLock[] {
  const seen = new Set<string>();
  const out: ElementLock[] = [];
  for (const x of Array.isArray(v) ? v.slice(0, 80) : []) {
    const o = obj(x);
    const id = typeof o.id === 'string' && /^e\d{1,6}$/.test(o.id) ? o.id : null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, what: str(o.what, 120) || 'an element', at: num(o.at, 0, 1e15, 0) });
  }
  return out;
}

export function normalizeDoc(v: unknown): DesignDoc {
  const r = obj(v);
  const seen = new Set<string>();
  const artboards: DesignArtboard[] = [];
  for (const a of Array.isArray(r.artboards) ? r.artboards.slice(0, MAX_ARTBOARDS) : []) {
    const n = normalizeArtboard(a);
    if (!n) continue;
    if (seen.has(n.id)) n.id = newId('ab');
    seen.add(n.id);
    artboards.push(n);
  }
  return { artboards, tokens: str(r.tokens, MAX_TOKENS_CSS) };
}

const list = (v: unknown, n: number, len: number) => (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, len)).slice(0, n);

export function normalizePins(v: unknown): DesignPins | null {
  const r = obj(v);
  const faces = [...new Set(list(r.faces, 8, 60).map((x) => x.trim()).filter(Boolean))];
  const colours = [...new Set(list(r.colours, 16, 9).map((x) => x.trim().toLowerCase()).filter((x) => /^#[0-9a-f]{6}$/.test(x)))];
  if (!faces.length && !colours.length) return null;
  return { ...(faces.length ? { faces } : {}), ...(colours.length ? { colours } : {}) };
}

export function normalizeFindings(v: unknown): DesignFinding[] {
  const out: DesignFinding[] = [];
  for (const x of Array.isArray(v) ? v.slice(0, 12) : []) {
    const o = obj(x);
    const text = str(o.text, 700).trim();
    if (!text) continue;
    out.push({
      id: idOk(o.id, 'f'),
      kind: (FINDING_KINDS as readonly string[]).includes(String(o.kind)) ? (o.kind as FindingKind) : 'opportunity',
      artboard: str(o.artboard, 40),
      element: typeof o.element === 'string' && /^e\d{1,6}$/.test(o.element) ? o.element : null,
      text,
      fix: str(o.fix, 500).trim(),
      status: o.status === 'applied' || o.status === 'dismissed' ? o.status : 'open',
    });
  }
  return out;
}

export function normalizeDesignState(v: unknown): DesignState | null {
  const r = obj(v);
  if (!r.doc && !r.versions) return null;
  const raw = Array.isArray(r.versions) ? r.versions : [];
  // (an older history, written before branches, has no `from`: each version was made from the one before it)
  const drop = Math.max(0, raw.length - MAX_VERSIONS);
  const versions: DesignVersion[] = raw.slice(drop).map((x, i) => {
    const o = obj(x);
    const from = typeof o.from === 'number' && Number.isInteger(o.from) ? o.from - drop : i - 1;
    return {
      at: num(o.at, 0, 1e15, 0),
      said: str(o.said, 300),
      by: o.by === 'person' ? 'person' : 'model',
      doc: normalizeDoc(o.doc),
      ...(from >= 0 && from < i ? { from } : {}),
      ...(typeof o.kept === 'string' && o.kept ? { kept: str(o.kept, 120) } : {}),
    } as DesignVersion;
  });
  const turns: DesignTurn[] = (Array.isArray(r.turns) ? r.turns.slice(-MAX_TURNS) : []).map((x) => {
    const o = obj(x);
    const sel = obj(o.selection);
    return {
      id: idOk(o.id, 't'),
      role: o.role === 'designer' ? 'designer' : 'person',
      text: str(o.text, 6000),
      at: num(o.at, 0, 1e15, 0),
      ...(typeof o.version === 'number' ? { version: Math.round(o.version) } : {}),
      ...(Array.isArray(o.touched) ? { touched: list(o.touched, 40, 40) } : {}),
      ...(Array.isArray(o.failed) ? { failed: list(o.failed, 20, 300) } : {}),
      ...(Array.isArray(o.options) ? { options: list(o.options, 6, 120) } : {}),
      ...(o.selection && typeof sel.artboard === 'string' ? { selection: { artboard: str(sel.artboard, 40), element: typeof sel.element === 'string' ? str(sel.element, 40) : null, label: str(sel.label, 120) } } : {}),
      ...((() => {
        const findings = normalizeFindings(o.findings);
        return findings.length ? { findings } : {};
      })()),
    } as DesignTurn;
  });
  const m = obj(r.memory);
  const comments: DesignComment[] = (Array.isArray(r.comments) ? r.comments.slice(-200) : []).map((x) => {
    const o = obj(x);
    return { id: idOk(o.id, 'c'), artboard: str(o.artboard, 40), element: typeof o.element === 'string' ? str(o.element, 40) : null, text: str(o.text, 2000), at: num(o.at, 0, 1e15, 0), resolved: o.resolved === true };
  });
  const assets: DesignAsset[] = (Array.isArray(r.assets) ? r.assets.slice(0, 60) : [])
    .map((x) => {
      const o = obj(x);
      const src = str(o.src, 2_000_000);
      if (!/^(upload:[\w-]{1,96}|data:image\/(png|jpeg|webp|gif|svg\+xml);base64,)/.test(src)) return null;
      const note = str(o.note, 300).trim();
      return { id: idOk(o.id, 'img'), name: str(o.name, 120) || 'image', src, width: Math.round(num(o.width, 1, 20000, 1000)), height: Math.round(num(o.height, 1, 20000, 1000)), ...(note ? { note } : {}) };
    })
    .filter((x): x is DesignAsset => !!x);
  const doc = normalizeDoc(r.doc ?? versions.at(-1)?.doc);
  const at = versions.length ? Math.round(num(r.at, 0, versions.length - 1, versions.length - 1)) : -1;
  return {
    v: 1,
    doc,
    versions,
    at,
    turns,
    memory: { brief: str(m.brief, 4000), decisions: list(m.decisions, 30, 300), rejected: list(m.rejected, 30, 300), ...((() => {
      const pins = normalizePins(m.pins);
      return pins ? { pins } : {};
    })()) },
    comments,
    assets,
    kind: str(r.kind, 40) || 'graphic',
    format: formatOf(str(r.format, 40)) ? str(r.format, 40) : DEFAULT_FORMAT,
  };
}

/** The version a version was made from, or -1. */
export const parentOf = (s: Pick<DesignState, 'versions'>, i: number): number => {
  const f = s.versions[i]?.from;
  return typeof f === 'number' && f >= 0 && f < i ? f : -1;
};

/** The newest version made from this one, or -1. */
export function newestChild(s: Pick<DesignState, 'versions'>, i: number): number {
  for (let j = s.versions.length - 1; j > i; j--) if (parentOf(s, j) === i) return j;
  return -1;
}

/**
 * The history held to its length: the oldest version that is neither kept nor shown goes first, and everything that
 * pointed at it is pointed past it (its children are made from its parent; a turn's version is forgotten).
 */
export function trimVersions(s: DesignState, max = MAX_VERSIONS): DesignState {
  let st = s;
  while (st.versions.length > max) {
    const k = st.versions.findIndex((v, i) => !v.kept && i !== st.at);
    if (k < 0) break;
    const parent = parentOf(st, k);
    const shift = (i: number) => (i > k ? i - 1 : i);
    const versions = st.versions
      .filter((_, i) => i !== k)
      .map((v) => {
        if (typeof v.from !== 'number') return v;
        const f = v.from === k ? parent : v.from;
        const { from: _f, ...rest } = v;
        void _f;
        return f >= 0 ? { ...rest, from: shift(f) } : rest;
      });
    const turns = st.turns.map((t) => (typeof t.version !== 'number' ? t : t.version === k ? (({ version: _v, ...rest }) => (void _v, rest))(t) : { ...t, version: shift(t.version) }));
    st = { ...st, versions, turns: turns as DesignTurn[], at: shift(st.at) };
  }
  return st;
}

/** A new version from a document, made from the one shown. Nothing is let go: after going back, it branches. */
export function commit(s: DesignState, doc: DesignDoc, said: string, by: DesignVersion['by'], now = Date.now()): DesignState {
  const v: DesignVersion = { at: now, said: said.slice(0, 300), by, doc, ...(s.at >= 0 && s.at < s.versions.length ? { from: s.at } : {}) };
  return trimVersions({ ...s, doc, versions: [...s.versions, v], at: s.versions.length });
}

/** The same version again, changed in place (edits on the canvas made in a quick run are one version) — only the
 * newest version, with nothing made from it and not kept; anything else becomes a new version. */
export function amend(s: DesignState, doc: DesignDoc, now = Date.now()): DesignState {
  const v = s.versions[s.at];
  if (s.at < 0 || !v || s.at !== s.versions.length - 1 || v.kept) return commit(s, doc, 'Edited on the canvas', 'person', now);
  const versions = [...s.versions];
  versions[s.at] = { ...v, doc, at: now };
  return { ...s, doc, versions };
}

export const canUndo = (s: DesignState) => s.at >= 0 && parentOf(s, s.at) >= 0;
export const canRedo = (s: DesignState) => s.at >= 0 && newestChild(s, s.at) >= 0;
/** Undo: the version this one was made from. */
export const undoTarget = (s: DesignState) => parentOf(s, s.at);
/** Redo: the newest version made from this one. */
export const redoTarget = (s: DesignState) => newestChild(s, s.at);
export function moveTo(s: DesignState, at: number): DesignState {
  if (at < 0 || at >= s.versions.length) return s;
  return { ...s, at, doc: s.versions[at].doc };
}

/** A version kept whatever happens (an approval), with why. */
export function keepVersion(s: DesignState, i: number, why: string): DesignState {
  if (i < 0 || i >= s.versions.length) return s;
  const versions = [...s.versions];
  versions[i] = { ...versions[i], kept: why.slice(0, 120) || 'Kept' };
  return { ...s, versions };
}

// ── the person's authority over artboards and elements (see the head of this file) ──

const mapArtboard = (doc: DesignDoc, id: string, fn: (a: DesignArtboard) => DesignArtboard): DesignDoc => ({ ...doc, artboards: doc.artboards.map((a) => (a.id === id ? fn(a) : a)) });

/**
 * Notes on the design that are not the design (states, locks): set on what is shown, with no new version — unless
 * what is shown is a kept version (an approval), which is never rewritten: the note then makes a version of its own.
 */
export function annotate(s: DesignState, doc: DesignDoc, said = 'Changed what is protected', now = Date.now()): DesignState {
  if (s.at < 0 || !s.versions[s.at]) return { ...s, doc };
  if (s.versions[s.at].kept) return commit(s, doc, said, 'person', now);
  const versions = [...s.versions];
  versions[s.at] = { ...versions[s.at], doc };
  return { ...s, doc, versions };
}

export function withState(doc: DesignDoc, id: string, state: ArtboardState): DesignDoc {
  return mapArtboard(doc, id, (a) => {
    const { state: _s, ...rest } = a;
    void _s;
    return state === 'draft' ? rest : { ...rest, state };
  });
}

export function withArtboardLock(doc: DesignDoc, id: string, locked: boolean): DesignDoc {
  return mapArtboard(doc, id, (a) => {
    const { locked: _l, ...rest } = a;
    void _l;
    return locked ? { ...rest, locked: true } : rest;
  });
}

export function withElementLock(doc: DesignDoc, id: string, element: string, what: string | null, now = Date.now()): DesignDoc {
  return mapArtboard(doc, id, (a) => {
    const others = (a.locks ?? []).filter((l) => l.id !== element);
    const locks = what === null ? others : [...others, { id: element, what: what.slice(0, 120) || 'an element', at: now }];
    const { locks: _k, ...rest } = a;
    void _k;
    return locks.length ? { ...rest, locks } : rest;
  });
}

export const isElementLocked = (a: Pick<DesignArtboard, 'locks' | 'locked'> | null | undefined, element: string | null | undefined) => !!a && (a.locked === true || (!!element && (a.locks ?? []).some((l) => l.id === element)));

/**
 * An artboard approved: marked, locked whole, and the version it is approved in kept for good (a later change
 * branches from it; the approval stays in the history to return to).
 */
export function approveArtboard(s: DesignState, id: string, now = Date.now()): DesignState {
  const a = artboardOf(s.doc, id);
  if (!a) return s;
  const doc = withArtboardLock(withState(s.doc, id, 'approved'), id, true);
  const next = commit(s, doc, `Approved “${a.name}”`, 'person', now);
  return keepVersion(next, next.at, `Approved: ${a.name}`);
}

/** An approved (or locked) artboard opened again for changes — only ever by the person. */
export function reopenArtboard(s: DesignState, id: string, state: ArtboardState = 'revision', now = Date.now()): DesignState {
  const a = artboardOf(s.doc, id);
  if (!a) return s;
  return annotate(s, withArtboardLock(withState(s.doc, id, state), id, false), `Reopened “${a.name}”`, now);
}

/** An artboard as it was in an earlier version, brought into what is shown (a new version; nothing else changes). */
export function restoreArtboard(s: DesignState, from: number, id: string, now = Date.now()): DesignState {
  const was = s.versions[from]?.doc.artboards.find((a) => a.id === id);
  if (!was) return s;
  const cur = artboardOf(s.doc, id);
  if (cur?.locked) return s;
  const artboards = cur ? s.doc.artboards.map((a) => (a.id === id ? { ...was, x: a.x, y: a.y } : a)) : [...s.doc.artboards, was];
  return commit(s, { ...s.doc, artboards }, `Brought back “${was.name}” from version ${from + 1}`, 'person', now);
}

/** Where a new artboard goes: to the right of everything (a variation: beside the one it varies). */
export function placeNew(doc: DesignDoc, w: number, _h: number, beside?: DesignArtboard | null): { x: number; y: number } {
  const gap = 120;
  if (!doc.artboards.length) return { x: 0, y: 0 };
  if (beside) {
    const row = doc.artboards.filter((a) => Math.abs(a.y - beside.y) < 1);
    const right = Math.max(...row.map((a) => a.x + a.width));
    return { x: right + gap, y: beside.y };
  }
  const right = Math.max(...doc.artboards.map((a) => a.x + a.width));
  void w;
  return { x: right + gap, y: 0 };
}

export const artboardOf = (doc: DesignDoc, id: string | null | undefined) => (id ? doc.artboards.find((a) => a.id === id) ?? null : null);
