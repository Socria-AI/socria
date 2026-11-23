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
// Every change, the model's or the person's, is a version: undo and redo move between them, and "go back to the
// colours from before" is a version the model is told about. The conversation is kept with the design, and so is
// what the person decided and turned down (memory), so the next request is read against the whole project.

import { DEFAULT_FORMAT, formatOf, type Medium } from './formats';

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
}

export interface DesignComment {
  id: string;
  artboard: string;
  element: string | null;
  text: string;
  at: number;
  resolved: boolean;
}

export interface DesignMemory {
  /** what is being made, in the person's words */
  brief: string;
  /** decisions that hold across turns ("keep the serif", "no gradients") */
  decisions: string[];
  /** proposals the person turned down */
  rejected: string[];
}

export interface DesignAsset {
  /** referenced in the HTML as asset:<id> */
  id: string;
  name: string;
  /** an upload (upload:<id>) or a data URL */
  src: string;
  width: number;
  height: number;
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
export const MAX_VERSIONS = 60;
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
  };
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

export function normalizeDesignState(v: unknown): DesignState | null {
  const r = obj(v);
  if (!r.doc && !r.versions) return null;
  const versions: DesignVersion[] = (Array.isArray(r.versions) ? r.versions.slice(-MAX_VERSIONS) : []).map((x) => {
    const o = obj(x);
    return { at: num(o.at, 0, 1e15, 0), said: str(o.said, 300), by: o.by === 'person' ? 'person' : 'model', doc: normalizeDoc(o.doc) } as DesignVersion;
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
      return { id: idOk(o.id, 'img'), name: str(o.name, 120) || 'image', src, width: Math.round(num(o.width, 1, 20000, 1000)), height: Math.round(num(o.height, 1, 20000, 1000)) };
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
    memory: { brief: str(m.brief, 4000), decisions: list(m.decisions, 30, 300), rejected: list(m.rejected, 30, 300) },
    comments,
    assets,
    kind: str(r.kind, 40) || 'graphic',
    format: formatOf(str(r.format, 40)) ? str(r.format, 40) : DEFAULT_FORMAT,
  };
}

/** A new version from a document: anything after the one shown is let go (a new branch replaces the redo). */
export function commit(s: DesignState, doc: DesignDoc, said: string, by: DesignVersion['by'], now = Date.now()): DesignState {
  const kept = s.versions.slice(0, s.at + 1);
  const versions = [...kept, { at: now, said: said.slice(0, 300), by, doc }].slice(-MAX_VERSIONS);
  return { ...s, doc, versions, at: versions.length - 1 };
}

/** The same version again, changed in place (edits on the canvas made in a quick run are one version). */
export function amend(s: DesignState, doc: DesignDoc, now = Date.now()): DesignState {
  if (s.at < 0) return commit(s, doc, 'Edited on the canvas', 'person', now);
  const versions = s.versions.slice(0, s.at + 1);
  versions[versions.length - 1] = { ...versions[versions.length - 1], doc, at: now };
  return { ...s, doc, versions, at: versions.length - 1 };
}

export const canUndo = (s: DesignState) => s.at > 0;
export const canRedo = (s: DesignState) => s.at >= 0 && s.at < s.versions.length - 1;
export function moveTo(s: DesignState, at: number): DesignState {
  if (at < 0 || at >= s.versions.length) return s;
  return { ...s, at, doc: s.versions[at].doc };
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
