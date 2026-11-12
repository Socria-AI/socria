// lib/teaching/profile.ts — A COURSE PROFILE: BUILT, UPDATED, CORRECTED, AND KEPT HONEST.
//
// A profile is the digests of the materials added to it (lib/teaching/
// materials.ts) and what they show (lib/teaching/observe.ts). Everything in
// it is worked out again from the digests whenever a material comes or goes,
// so it is never a summary that drifts from its sources; what changed is
// recorded (history), so a student can see the picture move as materials come
// in — "graph questions: 20% → 45% of questions", "new: questions turn on a
// NOT or EXCEPT".
//
// ONE PROFILE PER COURSE AND INSTRUCTOR. Two instructors' sections of ECO 304K
// teach and examine differently, so they are two profiles; a file that names
// no instructor joins the course's profile when there is one.
//
// THE STUDENT HAS THE LAST WORD. An observation they mark wrong is kept,
// marked, and never used; one they confirm is shown as confirmed. Either can
// be taken back.
//
// PURE. Sanitisers here read anything stored or sent and keep only what holds
// together.

import { clip, isMaterialKind } from './materials';
import { observe } from './observe';
import {
  DIMENSIONS,
  NEEDS_PERMISSION,
  type Basis,
  type Confidence,
  type CourseConcept,
  type CourseProfile,
  type Correction,
  type Dimension,
  type Evidence,
  type Material,
  type MaterialDigest,
  type Observation,
  type ProfileChange,
  type Unit,
} from './types';

export const MAX_PROFILES = 12;
export const MAX_MATERIALS = 24;
const MAX_HISTORY = 40;

/** The key two materials share when they are the same course with the same instructor. */
export function profileKey(course: string, instructor?: string | null): string {
  const c = course.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, '-') || 'course';
  const last = (instructor ?? '').trim().split(/\s+/).pop()?.toLowerCase().replace(/[^a-z]+/g, '') ?? '';
  return last ? `${c}~${last}` : c;
}

/** A change with its fields in one order. */
const orderedChange = (c: ProfileChange): ProfileChange => ({ at: c.at, kind: c.kind, ...(c.obs ? { obs: c.obs } : {}), ...(c.material ? { material: c.material } : {}), said: c.said });

/** A profile with its fields in one order, and its key from its course and instructor — so a stored copy reads back the same. */
export function canon(p: CourseProfile): CourseProfile {
  return {
    v: 1,
    id: profileKey(p.course, p.instructor),
    course: p.course,
    ...(p.title ? { title: p.title } : {}),
    ...(p.instructor ? { instructor: p.instructor } : {}),
    ...(p.term ? { term: p.term } : {}),
    digests: p.digests,
    observations: p.observations,
    concepts: p.concepts,
    vocabulary: p.vocabulary,
    corrections: p.corrections,
    history: p.history.map(orderedChange),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export function newProfile(seed: { course: string; title?: string; instructor?: string; term?: string }, now: number): CourseProfile {
  return canon({
    v: 1,
    id: '',
    course: clip(seed.course || 'My course', 60),
    ...(seed.title ? { title: clip(seed.title, 90) } : {}),
    ...(seed.instructor ? { instructor: clip(seed.instructor, 60) } : {}),
    ...(seed.term ? { term: clip(seed.term, 30) } : {}),
    digests: [],
    observations: [],
    concepts: [],
    vocabulary: { terms: [], abbreviations: [] },
    corrections: {},
    history: [],
    createdAt: now,
    updatedAt: now,
  });
}

/** Which profile a newly read material belongs to: the same course, and the same instructor when both name one. */
export function matchProfile(profiles: readonly CourseProfile[], m: Pick<Material, 'course' | 'instructor'>): CourseProfile | null {
  if (!m.course) return null;
  const course = profileKey(m.course);
  const same = profiles.filter((p) => profileKey(p.course) === course);
  if (!same.length) return null;
  if (m.instructor) {
    const key = profileKey(m.course, m.instructor);
    return same.find((p) => p.id === key) ?? same.find((p) => !p.instructor) ?? null;
  }
  return same.length === 1 ? same[0] : null;
}

const CONF_RANK: Record<Confidence, number> = { low: 0, moderate: 1, high: 2 };

/** What changed between two sets of observations: at most six lines, the most telling first. */
export function changesBetween(before: readonly Observation[], after: readonly Observation[], now: number, material?: string): ProfileChange[] {
  const was = new Map(before.map((o) => [o.id, o]));
  const is = new Map(after.map((o) => [o.id, o]));
  const out: (ProfileChange & { rank: number })[] = [];
  for (const o of after) {
    const p = was.get(o.id);
    if (!p) {
      if (o.confidence !== 'low' || before.length === 0) out.push({ at: now, kind: 'new', obs: o.id, said: o.said, rank: 3 + CONF_RANK[o.confidence], ...(material ? { material } : {}) });
      continue;
    }
    if (p.share !== undefined && o.share !== undefined && Math.abs(o.share - p.share) >= 0.2) {
      out.push({ at: now, kind: 'shifted', obs: o.id, said: `${DIMENSIONS[o.dimension]}: ${Math.round(p.share * 100)}% → ${Math.round(o.share * 100)}%. ${o.said}`, rank: 4, ...(material ? { material } : {}) });
    } else if (CONF_RANK[o.confidence] !== CONF_RANK[p.confidence]) {
      const up = CONF_RANK[o.confidence] > CONF_RANK[p.confidence];
      out.push({ at: now, kind: up ? 'stronger' : 'weaker', obs: o.id, said: `${up ? 'Surer' : 'Less sure'} now (${p.confidence} → ${o.confidence}): ${o.said}`, rank: 2, ...(material ? { material } : {}) });
    }
  }
  for (const p of before) if (!is.has(p.id) && p.confidence !== 'low') out.push({ at: now, kind: 'gone', obs: p.id, said: `No longer shown: ${p.said}`, rank: 3, ...(material ? { material } : {}) });
  return out
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 6)
    .map(({ rank: _rank, ...c }) => c);
}

/** Everything worked out again from the digests; what changed is recorded. */
/** Whether a material may be used: past exams and quizzes only with the person's word that they are allowed to use them. */
export const usable = (d: MaterialDigest) => !NEEDS_PERMISSION.has(d.material.kind) || d.material.allowed === true;

export function rebuild(p: CourseProfile, now: number, why?: ProfileChange): CourseProfile {
  const seen = observe(p.digests.filter(usable));
  const changes = changesBetween(p.observations, seen.observations, now, why?.material);
  // the course's own name and instructor, when the materials say and the person did not
  const named = p.digests.map((d) => d.material).find((m) => m.course);
  const titled = p.digests.map((d) => d.material).find((m) => m.title);
  const taught = p.digests.map((d) => d.material).find((m) => m.instructor);
  return canon({
    ...p,
    ...(p.course === 'My course' && named?.course ? { course: named.course } : {}),
    ...(!p.title && titled?.title ? { title: titled.title } : {}),
    ...(!p.instructor && taught?.instructor ? { instructor: taught.instructor } : {}),
    observations: seen.observations,
    concepts: seen.concepts,
    vocabulary: seen.vocabulary,
    history: [...(why ? [why] : []), ...changes, ...p.history].slice(0, MAX_HISTORY),
    updatedAt: now,
  });
}

/** A material added (or read again: the same document replaces its old digest). */
export function addMaterial(p: CourseProfile, d: MaterialDigest, now: number): CourseProfile {
  const again = p.digests.some((x) => x.material.doc === d.material.doc);
  const digests = [...p.digests.filter((x) => x.material.doc !== d.material.doc), d].slice(-MAX_MATERIALS);
  return rebuild({ ...p, digests }, now, { at: now, kind: 'added', material: d.material.doc, said: `${again ? 'Read again' : 'Added'}: ${d.material.name}` });
}

/** The person's word that a past exam or quiz may be used (or no longer may). */
export function allowMaterial(p: CourseProfile, doc: string, allowed: boolean, now: number): CourseProfile {
  const d = p.digests.find((x) => x.material.doc === doc);
  if (!d || !!d.material.allowed === allowed) return p;
  const material: Material = { ...d.material, ...(allowed ? { allowed: true } : {}) };
  if (!allowed) delete material.allowed;
  const digests = p.digests.map((x) => (x.material.doc === doc ? { ...x, material } : x));
  return rebuild({ ...p, digests }, now, { at: now, kind: allowed ? 'added' : 'removed', material: doc, said: `${allowed ? 'Now used' : 'No longer used'}: ${d.material.name}` });
}

export function removeMaterial(p: CourseProfile, doc: string, now: number): CourseProfile {
  const gone = p.digests.find((x) => x.material.doc === doc);
  if (!gone) return p;
  return rebuild({ ...p, digests: p.digests.filter((x) => x.material.doc !== doc) }, now, { at: now, kind: 'removed', material: doc, said: `Removed: ${gone.material.name}` });
}

/** The person's word on an observation: wrong (never used), or right (shown as confirmed). */
export function correct(p: CourseProfile, obs: string, verdict: Correction['verdict'], now: number, note?: string): CourseProfile {
  const o = p.observations.find((x) => x.id === obs);
  if (!o) return p;
  const c: Correction = { verdict, at: now, ...(note?.trim() ? { note: clip(note, 200) } : {}) };
  return canon({
    ...p,
    corrections: { ...p.corrections, [obs]: c },
    history: [{ at: now, kind: 'corrected' as const, obs, said: `${verdict === 'wrong' ? 'You said this is not right' : 'You confirmed'}: ${o.said}` }, ...p.history].slice(0, MAX_HISTORY),
    updatedAt: now,
  });
}

/** A correction taken back. */
export function restore(p: CourseProfile, obs: string, now: number): CourseProfile {
  if (!p.corrections[obs]) return p;
  const { [obs]: _gone, ...rest } = p.corrections;
  const o = p.observations.find((x) => x.id === obs);
  return canon({ ...p, corrections: rest, history: [{ at: now, kind: 'restored' as const, obs, said: `Your correction taken back${o ? `: ${o.said}` : ''}` }, ...p.history].slice(0, MAX_HISTORY), updatedAt: now });
}

/** The observations the runtime may use: everything not marked wrong. */
export function inForce(p: Pick<CourseProfile, 'observations' | 'corrections'>): Observation[] {
  return p.observations.filter((o) => p.corrections[o.id]?.verdict !== 'wrong');
}

/** A one-line name for a profile: "ECO 304K · Smith". */
export function profileLabel(p: Pick<CourseProfile, 'course' | 'instructor'>): string {
  const last = p.instructor?.trim().split(/\s+/).pop();
  return last ? `${p.course} · ${last}` : p.course;
}

// ── reading back what was stored ─────────────────────────────────────

const str = (v: unknown, n: number): string | undefined => (typeof v === 'string' && v.trim() ? clip(v, n) : undefined);
const num = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : undefined);
const CODE = /^[a-z][a-z0-9.\-]{1,60}$/;
const BLOCK = /^p\d{1,4}\.\d{1,5}$/;
const DOC = /^[0-9a-f]{16}$/;

function cleanEvidence(v: unknown): Evidence | null {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const doc = typeof o.doc === 'string' && DOC.test(o.doc) ? o.doc : null;
  const block = typeof o.block === 'string' && BLOCK.test(o.block) ? o.block : null;
  const quote = str(o.quote, 160);
  if (!doc || !block || !quote) return null;
  const unit = str(o.unit, 90);
  return { doc, block, page: Math.round(num(o.page, 1, 9999) ?? 1), quote, ...(unit ? { unit } : {}) };
}

const cleanList = <T>(v: unknown, f: (x: unknown) => T | null, cap: number): T[] => (Array.isArray(v) ? v.slice(0, cap).map(f).filter((x): x is T => x !== null) : []);

function cleanUnit(v: unknown): Unit | null {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const label = str(o.label, 90);
  const block = typeof o.block === 'string' && BLOCK.test(o.block) ? o.block : null;
  const quote = str(o.quote, 160);
  if (!label || !block || !quote || (o.kind !== 'item' && o.kind !== 'section')) return null;
  const codes = Array.isArray(o.codes) ? o.codes.filter((c): c is string => typeof c === 'string' && CODE.test(c)).slice(0, 30) : [];
  const terms = Array.isArray(o.terms) ? o.terms.filter((t): t is string => typeof t === 'string' && t.length <= 60).slice(0, 30) : [];
  const shingles = Array.isArray(o.shingles) ? o.shingles.filter((x): x is number => Number.isInteger(x) && x >= 0 && x <= 0xffffffff).slice(0, 80) : undefined;
  const points = num(o.points, 1, 500);
  return { label, kind: o.kind, block, page: Math.round(num(o.page, 1, 9999) ?? 1), quote, codes, terms, ...(points ? { points } : {}), ...(shingles?.length ? { shingles } : {}) };
}

function cleanMaterial(v: unknown): Material | null {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const doc = typeof o.doc === 'string' && DOC.test(o.doc) ? o.doc : null;
  const name = str(o.name, 120);
  if (!doc || !name || !isMaterialKind(o.kind)) return null;
  const course = str(o.course, 60);
  const title = str(o.title, 90);
  const instructor = str(o.instructor, 60);
  const term = str(o.term, 30);
  const order = num(o.order, 0, 3000);
  return {
    doc,
    name,
    kind: o.kind,
    kindFrom: o.kindFrom === 'person' ? 'person' : 'read',
    ...(course ? { course } : {}),
    ...(title ? { title } : {}),
    ...(instructor ? { instructor } : {}),
    ...(term ? { term } : {}),
    ...(order ? { order } : {}),
    pages: Math.round(num(o.pages, 1, 9999) ?? 1),
    addedAt: num(o.addedAt, 0, 9e15) ?? 0,
    ...(o.allowed === true ? { allowed: true } : {}),
    ...(typeof o.file === 'string' && /^[0-9a-f]{32}$/.test(o.file) ? { file: o.file } : {}),
  };
}

const STAT_KEYS = ['sentences', 'words', 'longWords', 'equations', 'definitions', 'examples', 'analogies', 'applications', 'links', 'objectives', 'recaps', 'checks', 'worked', 'why'] as const;

function cleanDigest(v: unknown): MaterialDigest | null {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const material = cleanMaterial(o.material);
  if (!material) return null;
  const s = (o.stats && typeof o.stats === 'object' ? o.stats : {}) as Record<string, unknown>;
  const stats = Object.fromEntries(STAT_KEYS.map((k) => [k, Math.round(num(s[k], 0, 1e7) ?? 0)])) as unknown as MaterialDigest['stats'];
  const pair = (x: unknown): [string, string] | null => (Array.isArray(x) && typeof x[0] === 'string' && typeof x[1] === 'string' && x[0].length <= 8 && x[1].length <= 80 ? [x[0], x[1]] : null);
  const term = (x: unknown): [string, number] | null => (Array.isArray(x) && typeof x[0] === 'string' && x[0].length <= 60 && Number.isFinite(x[1]) ? [x[0], Math.max(0, Math.round(Number(x[1])))] : null);
  return {
    material,
    units: cleanList(o.units, cleanUnit, 60),
    terms: cleanList(o.terms, term, 60),
    abbreviations: cleanList(o.abbreviations, pair, 24),
    defined: Array.isArray(o.defined) ? o.defined.filter((t): t is string => typeof t === 'string' && t.length <= 40).slice(0, 40) : [],
    stats,
    stated: cleanList(
      o.stated,
      (x) => {
        const r = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
        const ev = cleanEvidence(r.evidence);
        return typeof r.code === 'string' && CODE.test(r.code) && ev ? { code: r.code, evidence: ev } : null;
      },
      20
    ),
  };
}

const BASES: Basis[] = ['observed', 'stated', 'inferred'];
const CONFS: Confidence[] = ['low', 'moderate', 'high'];

function cleanObservation(v: unknown): Observation | null {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const id = typeof o.id === 'string' && /^[a-z]+:[a-z0-9.\-]{1,60}$/.test(o.id) ? o.id : null;
  const dimension = typeof o.dimension === 'string' && o.dimension in DIMENSIONS ? (o.dimension as Dimension) : null;
  const code = typeof o.code === 'string' && CODE.test(o.code) ? o.code : null;
  const said = str(o.said, 280);
  if (!id || !dimension || !code || !said || !BASES.includes(o.basis as Basis) || !CONFS.includes(o.confidence as Confidence)) return null;
  const sup = (o.support && typeof o.support === 'object' ? o.support : {}) as Record<string, unknown>;
  const share = num(o.share, -1, 1);
  const caveat = str(o.caveat, 200);
  return {
    id,
    dimension,
    code,
    said,
    basis: o.basis as Basis,
    confidence: o.confidence as Confidence,
    score: num(o.score, 0, 1) ?? 0,
    support: {
      units: Math.round(num(sup.units, 0, 9999) ?? 0),
      of: Math.round(num(sup.of, 0, 9999) ?? 0),
      materials: Math.round(num(sup.materials, 0, 99) ?? 0),
      kinds: Array.isArray(sup.kinds) ? sup.kinds.filter(isMaterialKind).slice(0, 8) : [],
    },
    evidence: cleanList(o.evidence, cleanEvidence, 6),
    ...(share !== undefined ? { share } : {}),
    ...(Array.isArray(o.terms) ? { terms: o.terms.filter((t): t is string => typeof t === 'string' && t.length <= 60).slice(0, 16) } : {}),
    ...(caveat ? { caveat } : {}),
  };
}

function cleanConcept(v: unknown): CourseConcept | null {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const term = str(o.term, 60);
  if (!term) return null;
  return {
    term,
    weight: num(o.weight, 0, 1) ?? 0,
    inAssessment: Math.round(num(o.inAssessment, 0, 9999) ?? 0),
    inTeaching: Math.round(num(o.inTeaching, 0, 9999) ?? 0),
    evidence: cleanList(o.evidence, cleanEvidence, 3),
  };
}

const CHANGE_KINDS: ProfileChange['kind'][] = ['added', 'removed', 'new', 'gone', 'stronger', 'weaker', 'shifted', 'corrected', 'restored'];

/** A stored profile, read back: only what holds together. Null when nothing does. */
export function sanitizeProfile(v: unknown): CourseProfile | null {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const course = str(o.course, 60);
  if (o.v !== 1 || !course) return null;
  const instructor = str(o.instructor, 60);
  const title = str(o.title, 90);
  const term = str(o.term, 30);
  const corr = (o.corrections && typeof o.corrections === 'object' ? o.corrections : {}) as Record<string, unknown>;
  const corrections: Record<string, Correction> = {};
  for (const [k, c] of Object.entries(corr).slice(0, 200)) {
    const r = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
    if (!/^[a-z]+:[a-z0-9.\-]{1,60}$/.test(k) || (r.verdict !== 'wrong' && r.verdict !== 'right')) continue;
    const note = str(r.note, 200);
    corrections[k] = { verdict: r.verdict, at: num(r.at, 0, 9e15) ?? 0, ...(note ? { note } : {}) };
  }
  const vocab = (o.vocabulary && typeof o.vocabulary === 'object' ? o.vocabulary : {}) as Record<string, unknown>;
  const digests = cleanList(o.digests, cleanDigest, MAX_MATERIALS);
  return {
    v: 1,
    id: profileKey(course, instructor),
    course,
    ...(title ? { title } : {}),
    ...(instructor ? { instructor } : {}),
    ...(term ? { term } : {}),
    digests,
    observations: cleanList(o.observations, cleanObservation, 80),
    concepts: cleanList(o.concepts, cleanConcept, 16),
    vocabulary: {
      terms: Array.isArray(vocab.terms) ? vocab.terms.filter((t): t is string => typeof t === 'string' && t.length <= 60).slice(0, 12) : [],
      abbreviations: Array.isArray(vocab.abbreviations)
        ? vocab.abbreviations.filter((x): x is [string, string] => Array.isArray(x) && typeof x[0] === 'string' && typeof x[1] === 'string' && x[0].length <= 8 && x[1].length <= 80).slice(0, 12)
        : [],
    },
    corrections,
    history: cleanList(
      o.history,
      (x) => {
        const r = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
        const said = str(r.said, 280);
        if (!said || !CHANGE_KINDS.includes(r.kind as ProfileChange['kind'])) return null;
        const obs = typeof r.obs === 'string' && r.obs.length <= 80 ? r.obs : undefined;
        const material = typeof r.material === 'string' && DOC.test(r.material) ? r.material : undefined;
        return orderedChange({ at: num(r.at, 0, 9e15) ?? 0, kind: r.kind as ProfileChange['kind'], said, ...(obs ? { obs } : {}), ...(material ? { material } : {}) });
      },
      MAX_HISTORY
    ),
    createdAt: num(o.createdAt, 0, 9e15) ?? 0,
    updatedAt: num(o.updatedAt, 0, 9e15) ?? 0,
  };
}

export function sanitizeProfiles(v: unknown): CourseProfile[] {
  const list = Array.isArray(v) ? v : [];
  const out: CourseProfile[] = [];
  for (const x of list.slice(0, MAX_PROFILES * 2)) {
    const p = sanitizeProfile(x);
    if (p && !out.some((q) => q.id === p.id)) out.push(p);
    if (out.length >= MAX_PROFILES) break;
  }
  return out;
}
