// lib/ux-v0/graphics/logo/record.ts — the logo record an artboard keeps: the brief as written and as read, every
// concept shown (bounded; each kept as the parameters that rebuild it: method, seed, weight, softness, transforms,
// lettering, palette, and its silhouette signature, never as a stored picture), which was selected, which rejected,
// which approved, the lockup and colour scheme in use, and a bounded creative memory of structures shown, chosen and
// turned down. Untrusted input is normalised field by field; anything malformed is dropped, never guessed at.

import { CLICHES, readLogoBrief, type LogoBrief } from './brief';
import type { LogoConcept, WordmarkSpec } from './concepts';
import type { LetteringStyle, Modification } from './glyphs';
import { COLOUR_SCHEMES, LOCKUPS, LOGO_CATEGORIES, METHOD_IDS, MODIFICATIONS, type ColourScheme, type LockupKind, type LogoCategory, type MethodId } from './constants';

export const LOGO_SCHEMA = 1;
export const MAX_CONCEPTS = 60;
export const MAX_MEMORY = 80;

export interface ConceptRecord {
  id: string;
  title: string;
  category: LogoCategory;
  method: MethodId | null;
  seed: string;
  sw: number;
  soft: number;
  ops: string[];
  wordmark: WordmarkSpec;
  palette: LogoConcept['palette'];
  lockup: LockupKind;
  status: LogoConcept['status'];
  parents?: string[];
  edit?: string;
  /** the silhouette signature, as digits 0–9 (tenths of coverage) */
  sig?: string;
  coreIdea: string;
  rationale: string;
  construction: string;
  typography: string;
  geometry: string;
  scalability: string;
  weaknesses: string[];
  addresses: string[];
}
export interface LogoRecord {
  schema: typeof LOGO_SCHEMA;
  briefText: string;
  brief: LogoBrief;
  concepts: ConceptRecord[];
  selected: string | null;
  approved: string | null;
  lockup: LockupKind;
  scheme: ColourScheme;
  round: number;
  memory: { sig: string; method: string; verdict: 'shown' | 'chosen' | 'rejected' }[];
  /** the person has edited the logo's paths directly (the drawn objects, not the record, are then the source) */
  edited?: boolean;
}

const HEX = /^#[0-9a-f]{6}$/i;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').slice(0, max) : '');
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const strs = (v: unknown, n: number, max: number) =>
  Array.isArray(v)
    ? v
        .filter((x) => typeof x === 'string')
        .slice(0, n)
        .map((x) => str(x, max))
    : [];
const pick = <T extends string>(v: unknown, list: readonly T[], d: T): T => ((list as readonly string[]).includes(v as string) ? (v as T) : d);

export const encodeSig = (s: readonly number[]) => s.map((v) => Math.max(0, Math.min(9, Math.round(v * 9)))).join('');
export const decodeSig = (s: string | undefined): number[] | undefined => (s && /^[0-9]{100}$/.test(s) ? [...s].map((ch) => Number(ch) / 9) : undefined);

function normStyle(v: unknown): LetteringStyle | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  return {
    weight: num(o.weight, 0.04, 0.26, 0.12),
    width: num(o.width, 0.7, 1.4, 1),
    tracking: num(o.tracking, 0.4, 3, 1),
    terminal: pick(o.terminal, ['round', 'square', 'butt'] as const, 'round'),
    join: pick(o.join, ['round', 'miter'] as const, 'round'),
    slant: num(o.slant, -20, 20, 0),
  };
}
function normMod(v: unknown): Modification {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  const kind = pick(o.kind, MODIFICATIONS, 'none');
  const at = Math.round(num(o.at, 0, 40, 0));
  if (kind === 'cut') return { kind, at, angle: num(o.angle, -45, 45, 0) };
  if (kind === 'ligature') return { kind, at, height: pick(o.height, ['cap', 'base'] as const, 'base') };
  if (kind === 'lift' || kind === 'accent') return { kind, at };
  if (kind === 'swash' || kind === 'inline') return { kind };
  return { kind: 'none' };
}
export function normalizeWordmark(v: unknown, name: string): WordmarkSpec {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  // the name is the brief's, exactly: a record cannot change its spelling
  const kind = o.kind === 'constructed' ? 'constructed' : 'typeset';
  if (kind === 'constructed') return { kind, text: name, style: normStyle(o.style) ?? { weight: 0.12, width: 1, tracking: 1, terminal: 'round', join: 'round', slant: 0 }, modification: normMod(o.modification), why: str(o.why, 400) };
  return {
    kind,
    text: name,
    font: str(o.font, 60) || 'Inter',
    weight: Math.round(num(o.weight, 100, 1000, 500) / 100) * 100,
    tracking: Math.round(num(o.tracking, -100, 900, 0)),
    case: pick(o.case, ['upper', 'lower', 'none'] as const, 'none'),
    why: str(o.why, 400),
  };
}
const normPalette = (v: unknown): LogoConcept['palette'] => {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  const c = (k: string, d: string) => (typeof o[k] === 'string' && HEX.test(o[k] as string) ? (o[k] as string).toLowerCase() : d);
  return { ink: c('ink', '#16181c'), paper: c('paper', '#f6f4ef'), primary: c('primary', '#2b4c6f'), secondary: c('secondary', '#6f8faf'), accent: c('accent', '#e0663a'), muted: c('muted', '#8a8d93') };
};

export function normalizeConceptRecord(v: unknown, name: string): ConceptRecord | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const id = str(o.id, 80);
  if (!/^lc_[a-z0-9_]+$/.test(id)) return null;
  const method = o.method === null ? null : pick(o.method, METHOD_IDS, 'convergence');
  return {
    id,
    title: str(o.title, 120),
    category: pick(o.category, LOGO_CATEGORIES, 'combination'),
    method,
    seed: str(o.seed, 80) || '0',
    sw: num(o.sw, 30, 240, 100),
    soft: num(o.soft, 0, 1, 0.5),
    ops: strs(o.ops, 8, 20).filter((x) => /^(simplify|balance|negative|thick:\d(\.\d+)?|cut:-?\d{1,2})$/.test(x)),
    wordmark: normalizeWordmark(o.wordmark, name),
    palette: normPalette(o.palette),
    lockup: pick(o.lockup, LOCKUPS, 'horizontal'),
    status: pick(o.status, ['proposed', 'selected', 'rejected', 'approved'] as const, 'proposed'),
    ...(Array.isArray(o.parents) ? { parents: strs(o.parents, 4, 80) } : {}),
    ...(typeof o.edit === 'string' ? { edit: str(o.edit, 160) } : {}),
    ...(typeof o.sig === 'string' && /^[0-9]{100}$/.test(o.sig) ? { sig: o.sig } : {}),
    coreIdea: str(o.coreIdea, 400),
    rationale: str(o.rationale, 500),
    construction: str(o.construction, 400),
    typography: str(o.typography, 400),
    geometry: str(o.geometry, 400),
    scalability: str(o.scalability, 300),
    weaknesses: strs(o.weaknesses, 6, 240),
    addresses: strs(o.addresses, 8, 40),
  };
}

export function normalizeLogoRecord(v: unknown): LogoRecord | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const briefText = str(o.briefText, 2400);
  // the brief is read again from its own words (a stored reading is never trusted as given)
  const name = o.brief && typeof (o.brief as Record<string, unknown>).name === 'string' ? str((o.brief as Record<string, unknown>).name, 40) : '';
  const brief = readLogoBrief(briefText || name || 'Brand', name ? { name } : {});
  const concepts = (Array.isArray(o.concepts) ? o.concepts : [])
    .slice(0, MAX_CONCEPTS)
    .map((c) => normalizeConceptRecord(c, brief.name))
    .filter((c): c is ConceptRecord => !!c);
  const ids = new Set(concepts.map((c) => c.id));
  const memory = (Array.isArray(o.memory) ? o.memory : [])
    .slice(-MAX_MEMORY)
    .map((m) => (m && typeof m === 'object' ? (m as Record<string, unknown>) : {}))
    .filter((m) => typeof m.sig === 'string' && /^[0-9]{100}$/.test(m.sig as string))
    .map((m) => ({ sig: m.sig as string, method: str(m.method, 20), verdict: pick(m.verdict, ['shown', 'chosen', 'rejected'] as const, 'shown') }));
  return {
    schema: LOGO_SCHEMA,
    briefText,
    brief,
    concepts,
    selected: typeof o.selected === 'string' && ids.has(o.selected) ? o.selected : null,
    approved: typeof o.approved === 'string' && ids.has(o.approved) ? o.approved : null,
    lockup: pick(o.lockup, LOCKUPS, 'horizontal'),
    scheme: pick(o.scheme, COLOUR_SCHEMES, 'full'),
    round: Math.round(num(o.round, 0, 999, 1)),
    memory,
    ...(o.edited === true ? { edited: true } : {}),
  };
}

/** A concept as its record (its mark becomes the parameters that rebuild it). */
export function conceptRecord(c: LogoConcept): ConceptRecord {
  const ops = String((c.mark?.params as Record<string, unknown> | undefined)?.ops ?? '')
    .split(',')
    .filter(Boolean);
  return {
    id: c.id,
    title: c.title,
    category: c.category,
    method: c.method,
    seed: c.seed,
    sw: c.sw,
    soft: c.soft,
    ops,
    wordmark: c.wordmark,
    palette: c.palette,
    lockup: c.lockup,
    status: c.status,
    ...(c.parents ? { parents: c.parents } : {}),
    ...(c.edit ? { edit: c.edit } : {}),
    ...(c.sig?.length === 100 ? { sig: encodeSig(c.sig) } : {}),
    coreIdea: c.coreIdea,
    rationale: c.rationale,
    construction: c.construction,
    typography: c.typography,
    geometry: c.geometry,
    scalability: c.scalability,
    weaknesses: c.weaknesses,
    addresses: c.addresses,
  };
}

/** A new record for a brief and its first concepts. */
export function newLogoRecord(briefText: string, brief: LogoBrief, concepts: readonly LogoConcept[]): LogoRecord {
  return {
    schema: LOGO_SCHEMA,
    briefText: briefText.slice(0, 2400),
    brief,
    concepts: concepts.slice(0, MAX_CONCEPTS).map(conceptRecord),
    selected: null,
    approved: null,
    lockup: concepts[0]?.lockup ?? 'horizontal',
    scheme: 'full',
    round: 1,
    memory: concepts.filter((c) => c.sig?.length === 100).map((c) => ({ sig: encodeSig(c.sig!), method: c.method ?? 'wordmark', verdict: 'shown' as const })),
  };
}

/** Concepts added (an edit's or an exploration's), the oldest proposed ones dropped first when the bound is reached;
 * selected, approved and rejected ones are kept. */
export function addConcepts(rec: LogoRecord, more: readonly LogoConcept[]): LogoRecord {
  let concepts = [...rec.concepts, ...more.map(conceptRecord)];
  while (concepts.length > MAX_CONCEPTS) {
    const i = concepts.findIndex((c) => c.status === 'proposed' && c.id !== rec.selected);
    if (i < 0) break;
    concepts = [...concepts.slice(0, i), ...concepts.slice(i + 1)];
  }
  const memory = [...rec.memory, ...more.filter((c) => c.sig?.length === 100).map((c) => ({ sig: encodeSig(c.sig!), method: c.method ?? 'wordmark', verdict: 'shown' as const }))].slice(-MAX_MEMORY);
  return { ...rec, concepts, memory, round: rec.round + 1 };
}

/** A concept's status set (selecting one unselects the last; approving holds it as the identity's source). */
export function setStatus(rec: LogoRecord, id: string, status: 'selected' | 'rejected' | 'approved' | 'proposed'): LogoRecord {
  const c = rec.concepts.find((x) => x.id === id);
  if (!c) return rec;
  const concepts = rec.concepts.map((x) => {
    if (x.id === id) return { ...x, status };
    if (status === 'selected' && x.status === 'selected') return { ...x, status: 'proposed' as const };
    if (status === 'approved' && x.status === 'approved') return { ...x, status: 'selected' as const };
    return x;
  });
  const verdict = status === 'rejected' ? 'rejected' : status === 'proposed' ? null : 'chosen';
  const memory = verdict && c.sig ? [...rec.memory, { sig: c.sig, method: c.method ?? 'wordmark', verdict: verdict as 'rejected' | 'chosen' }].slice(-MAX_MEMORY) : rec.memory;
  return {
    ...rec,
    concepts,
    memory,
    selected: status === 'selected' || status === 'approved' ? id : rec.selected === id && status === 'rejected' ? null : rec.selected,
    approved: status === 'approved' ? id : rec.approved === id ? null : rec.approved,
  };
}

export const clicheLabels = CLICHES.map((c) => c.label);
