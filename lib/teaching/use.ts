// lib/teaching/use.ts — A COURSE PROFILE AT WORK IN A CONVERSATION.
//
// Retrieval, then use, every turn, without a model call:
//
//   1. WHICH COURSE (courseFor, in the browser). One the person linked to this
//      conversation; else the course whose materials are in it; else the course
//      their message names ("for ECO 304K"); else, when it is unmistakable, the
//      course whose concepts the message is about. Nothing, when none applies or
//      the person turned it off for this conversation.
//   2. WHAT TRAVELS (packOf). Not the profile: its typed codes (what the course
//      does, with confidence and basis), its terms and abbreviations, the
//      concepts it keeps coming back to, and hashes of its past questions'
//      five-word runs (to measure copied wording — never the wording). Only
//      observations the student has not marked wrong.
//   3. ON THE SERVER (behind the same gate as the learning ledger): the pack is
//      read again (sanitizeCoursePack), set against this student's ledger —
//      the concepts they got wrong, are due to review, have not practised, and
//      the ways in that left them lost (learnerOf) — and used:
//        · by the explanation planner, as a typed lean (courseLean): open with an
//          example where the course does, draw where the course draws, contrast
//          where its questions turn on telling ideas apart;
//        · in the turn's guidance (renderCourseGuidance): the course's terms, and
//          on a practice turn the course's assessment demands — formats, graphs,
//          numbers, traps, difficulty — aimed at this student's gaps
//          (practiceSpec). New questions with the same reasoning demands; never
//          the course's wording; never a claim about what an exam will ask;
//        · and by the reply gate, which drops any sentence that claims to know
//          what will be on an exam (predictsExam).
//
// PURE.

import type { Approach, CourseLean, LedgerEntry } from '@/lib/runtime/explain';
import { courseCodeIn, phrasesIn } from './materials';
import { inForce, profileLabel } from './profile';
import { SIDE_OF, type Basis, type Confidence, type CourseProfile } from './types';

export type CourseWhy = 'linked' | 'materials' | 'named' | 'topic';

/** What travels with a turn. */
export interface CoursePack {
  id: string;
  label: string;
  why: CourseWhy;
  /** what the course does, as codes, with how sure and on what basis (s: a share, where one is meant) */
  codes: { code: string; c: Confidence; b: Basis; s?: number }[];
  /** the course's own terms, most used first */
  terms: string[];
  abbr: [string, string][];
  /** concepts it keeps coming back to: term, weight, in how many past questions */
  concepts: { t: string; w: number; a: number }[];
  /** hashes of its past questions' five-word runs */
  avoid: number[];
}

export const PACK_LIMITS = { codes: 32, terms: 12, abbr: 6, concepts: 12, avoid: 600 } as const;

// ── which course ─────────────────────────────────────────────────────

const words = (s: string) => new Set(phrasesIn(s));

/** How strongly a message is about a course: the course's telling concepts it mentions. */
export function topicScore(p: Pick<CourseProfile, 'concepts' | 'digests'>, text: string): number {
  const said = words(text);
  const defined = new Set(p.digests.flatMap((d) => [...d.defined, ...d.abbreviations.map(([, x]) => x)]));
  let n = 0;
  for (const c of p.concepts.slice(0, 10)) {
    if (!said.has(c.term)) continue;
    n += c.term.includes(' ') || defined.has(c.term) ? 1 : 0.34;
  }
  return Math.round(n * 100) / 100;
}

/**
 * The course a turn is in, if any. `linked` is the person's own choice for this conversation ('off' turns
 * courses off in it); `docs` the documents in the conversation; `text` their message.
 */
export function courseFor(
  profiles: readonly CourseProfile[],
  ctx: { linked?: string | null; docs?: readonly string[]; text?: string }
): { profile: CourseProfile; why: CourseWhy } | null {
  if (!profiles.length || ctx.linked === 'off') return null;
  if (ctx.linked) {
    const p = profiles.find((x) => x.id === ctx.linked);
    if (p) return { profile: p, why: 'linked' };
  }
  const docs = new Set(ctx.docs ?? []);
  if (docs.size) {
    const p = profiles.find((x) => x.digests.some((d) => docs.has(d.material.doc)));
    if (p) return { profile: p, why: 'materials' };
  }
  const text = ctx.text ?? '';
  const code = courseCodeIn(text.toUpperCase().replace(/([A-Z]{2,5})\s*(\d{3,4})/g, '$1 $2'));
  if (code) {
    const named = profiles.filter((x) => x.course.replace(/\s+/g, '').toLowerCase() === code.replace(/\s+/g, '').toLowerCase());
    if (named.length === 1) return { profile: named[0], why: 'named' };
  }
  // the concepts alone: only when one course is clearly what the message is about
  const scored = profiles.map((p) => ({ p, s: topicScore(p, text) })).sort((a, b) => b.s - a.s);
  if (scored[0] && scored[0].s >= 2 && (!scored[1] || scored[0].s - scored[1].s >= 1)) return { profile: scored[0].p, why: 'topic' };
  return null;
}

/** What travels with a turn: never the materials, never an observation the student marked wrong. */
export function packOf(p: CourseProfile, why: CourseWhy): CoursePack {
  const codes = inForce(p)
    .filter((o) => o.basis !== 'stated' || o.confidence !== 'low' || o.code.startsWith('stated.format'))
    .slice(0, PACK_LIMITS.codes)
    .map((o) => ({ code: o.code, c: o.confidence, b: o.basis, ...(o.share !== undefined ? { s: o.share } : {}) }));
  const avoid: number[] = [];
  for (const d of p.digests) {
    if (SIDE_OF[d.material.kind] !== 'assessment') continue;
    for (const u of d.units) for (const h of u.shingles ?? []) if (avoid.length < PACK_LIMITS.avoid) avoid.push(h);
  }
  return {
    id: p.id,
    label: profileLabel(p),
    why,
    codes,
    terms: p.vocabulary.terms.slice(0, PACK_LIMITS.terms),
    abbr: p.vocabulary.abbreviations.slice(0, PACK_LIMITS.abbr),
    concepts: p.concepts.slice(0, PACK_LIMITS.concepts).map((c) => ({ t: c.term, w: c.weight, a: c.inAssessment })),
    avoid,
  };
}

// ── on the server: read again ────────────────────────────────────────

const CODE = /^[a-z][a-z0-9.\-]{1,60}$/;
const CONFS: Confidence[] = ['low', 'moderate', 'high'];
const BASES: Basis[] = ['observed', 'stated', 'inferred'];
const WHYS: CourseWhy[] = ['linked', 'materials', 'named', 'topic'];
const cleanText = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');

/** The pack a client sent, read again: only what holds together. Null when nothing does. */
export function sanitizeCoursePack(raw: unknown): CoursePack | null {
  const o = (raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null;
  if (!o) return null;
  const id = typeof o.id === 'string' && /^[a-z0-9\-~]{1,90}$/.test(o.id) ? o.id : null;
  const label = cleanText(o.label, 80);
  if (!id || !label) return null;
  const codes = Array.isArray(o.codes)
    ? o.codes
        .slice(0, PACK_LIMITS.codes)
        .map((x) => {
          const r = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
          if (typeof r.code !== 'string' || !CODE.test(r.code) || !CONFS.includes(r.c as Confidence) || !BASES.includes(r.b as Basis)) return null;
          const s = typeof r.s === 'number' && Number.isFinite(r.s) ? Math.max(-1, Math.min(1, r.s)) : undefined;
          return { code: r.code, c: r.c as Confidence, b: r.b as Basis, ...(s !== undefined ? { s } : {}) };
        })
        .filter((x): x is NonNullable<typeof x> => !!x)
    : [];
  const terms = Array.isArray(o.terms) ? o.terms.map((t) => cleanText(t, 48)).filter((t) => t.length >= 3).slice(0, PACK_LIMITS.terms) : [];
  const abbr = Array.isArray(o.abbr)
    ? o.abbr
        .filter((x): x is [string, string] => Array.isArray(x) && typeof x[0] === 'string' && /^[A-Z]{2,6}$/.test(x[0]) && typeof x[1] === 'string')
        .map(([a, p]) => [a, cleanText(p, 60)] as [string, string])
        .filter(([, p]) => p.length >= 3)
        .slice(0, PACK_LIMITS.abbr)
    : [];
  const concepts = Array.isArray(o.concepts)
    ? o.concepts
        .slice(0, PACK_LIMITS.concepts)
        .map((x) => {
          const r = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
          const t = cleanText(r.t, 48);
          const w = typeof r.w === 'number' && Number.isFinite(r.w) ? Math.max(0, Math.min(1, r.w)) : 0;
          const a = typeof r.a === 'number' && Number.isFinite(r.a) ? Math.max(0, Math.min(999, Math.round(r.a))) : 0;
          return t.length >= 3 ? { t, w, a } : null;
        })
        .filter((x): x is NonNullable<typeof x> => !!x)
    : [];
  const avoid = Array.isArray(o.avoid) ? o.avoid.filter((h): h is number => Number.isInteger(h) && h >= 0 && h <= 0xffffffff).slice(0, PACK_LIMITS.avoid) : [];
  return { id, label, why: WHYS.includes(o.why as CourseWhy) ? (o.why as CourseWhy) : 'linked', codes, terms, abbr, concepts, avoid };
}

// ── the student, against the course ──────────────────────────────────

const DAY = 86_400_000;
const INTERVALS = [1, 3, 7, 16, 35];

const keyWords = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4);

/** The same concept, roughly: a phrase's words all in the topic, or a one-word concept as a word of it. */
export function sameConcept(concept: string, topic: string): boolean {
  const c = keyWords(concept);
  const t = new Set(keyWords(topic));
  if (!c.length || !t.size) return false;
  return c.every((w) => t.has(w)) || (c.length >= 2 && c.filter((w) => t.has(w)).length >= 2);
}

export interface CourseLearner {
  /** concepts the course stresses that they have got wrong more often than right */
  weak: string[];
  /** due for review, by the ledger's own clock */
  due: string[];
  /** stressed by the course and not met yet */
  unseen: string[];
  /** stressed by the course and held: right, and boxed up */
  strong: string[];
  /** ways in that left them lost, on a course concept */
  lostWith: { term: string; approaches: Approach[] }[];
}

/** This student's standing on the concepts the course keeps coming back to (the ledger is theirs, from their browser). */
export function learnerOf(pack: Pick<CoursePack, 'concepts'>, ledger: readonly LedgerEntry[], now: number): CourseLearner {
  const out: CourseLearner = { weak: [], due: [], unseen: [], strong: [], lostWith: [] };
  for (const c of pack.concepts) {
    const met = ledger.filter((e) => sameConcept(c.t, e.topic));
    if (!met.length) {
      out.unseen.push(c.t);
      continue;
    }
    const right = met.reduce((t, e) => t + e.right, 0);
    const wrong = met.reduce((t, e) => t + e.wrong, 0);
    const box = Math.max(...met.map((e) => e.box));
    if (wrong > right) out.weak.push(c.t);
    else if (box >= 3 && wrong <= right) out.strong.push(c.t);
    if (met.some((e) => now - e.last >= (INTERVALS[Math.max(0, Math.min(4, e.box))] ?? 35) * DAY)) out.due.push(c.t);
    const failed = [...new Set(met.flatMap((e) => e.failed ?? []))];
    if (failed.length) out.lostWith.push({ term: c.t, approaches: failed as Approach[] });
  }
  return out;
}

// ── for the explanation planner ──────────────────────────────────────

/** What the explanation planner takes from a course (its contract lives with the planner, lib/runtime/explain.ts). */
export type { CourseLean } from '@/lib/runtime/explain';

const sure = (x: { c: Confidence }) => x.c !== 'low';

export function courseLean(pack: CoursePack, text = ''): CourseLean {
  const has = (code: string) => pack.codes.find((x) => x.code === code && sure(x));
  const lean: CourseLean = {};
  if (has('intro.example-first')) lean.opens = 'example';
  else if (has('intro.definition-first')) lean.opens = 'definition';
  else if (has('intro.question-first')) lean.opens = 'question';
  if (has('graphs.frequent') || has('structure.diagrams')) lean.draws = true;
  if (has('trap.contrast')) lean.contrasts = true;
  const terms = relevantTerms(pack, text);
  if (terms.length) lean.terms = terms;
  return lean;
}

/** The course's terms that bear on a message: those it mentions, then the course's own phrases that share a word with it. */
export function relevantTerms(pack: Pick<CoursePack, 'terms' | 'abbr'>, text: string, n = 6): string[] {
  const said = words(text);
  const t = keyWords(text);
  const direct = pack.terms.filter((x) => said.has(x));
  const near = pack.terms.filter((x) => !direct.includes(x) && x.includes(' ') && keyWords(x).some((w) => t.includes(w)));
  return [...direct, ...near].slice(0, n);
}

// ── practice in the course's style ───────────────────────────────────

export interface PracticeSpec {
  /** the share of each format the course's past questions show */
  formats: { mcq: number; free: number; tf: number };
  parts: boolean;
  graphs: number;
  numbers: number;
  scenario: boolean;
  justify: boolean;
  traps: string[];
  difficulty: 'direct' | 'mixed' | 'multistep' | null;
  /** concepts to aim at, in order, each with why */
  targets: { term: string; why: string }[];
  /** ways in to avoid, by concept */
  avoid: { term: string; approaches: Approach[] }[];
}

const TRAP_SAID: Record<string, string> = {
  'trap.negation': 'a NOT or EXCEPT in the question',
  'trap.allabove': '“all of the above” or combined options',
  'trap.absolute': 'options that say always, never or only',
  'trap.contrast': 'two related ideas to tell apart',
  'trap.best': 'several plausible options, one best',
  'trap.scale': 'units or scale that change the answer',
};

export function practiceSpec(pack: CoursePack, learner: CourseLearner, focus: string[] = []): PracticeSpec {
  const share = (code: string) => pack.codes.find((x) => x.code === code)?.s ?? 0;
  const has = (code: string) => pack.codes.some((x) => x.code === code && x.b !== 'stated');
  const mcq = share('format.mcq');
  const free = share('format.free');
  const tf = share('format.tf');
  const targets: PracticeSpec['targets'] = [];
  const add = (term: string, why: string) => {
    if (!targets.some((t) => t.term === term) && targets.length < 3) targets.push({ term, why });
  };
  const asked = (t: string) => pack.concepts.find((c) => c.t === t)?.a ?? 0;
  const said = (t: string) => (asked(t) >= 2 ? `the course has asked about it in ${asked(t)} past questions` : 'the course keeps coming back to it');
  for (const f of focus) add(f, 'what they asked to practise');
  for (const t of learner.weak) add(t, `they have got it wrong before; ${said(t)}`);
  for (const t of learner.due) add(t, `due for review; ${said(t)}`);
  for (const t of learner.unseen) if (asked(t) >= 2) add(t, `not practised yet; ${said(t)}`);
  for (const c of pack.concepts) add(c.t, said(c.t));
  const difficulty = (['direct', 'mixed', 'multistep'] as const).find((d) => has(`difficulty.${d}`)) ?? null;
  return {
    formats: { mcq, free, tf },
    parts: has('parts') || has('format.parts') || share('parts') > 0,
    graphs: Math.max(share('graphs.frequent'), share('graphs.some')),
    numbers: Math.max(share('numeric.frequent'), share('numeric.some')),
    scenario: has('scenario'),
    justify: has('justify'),
    traps: Object.keys(TRAP_SAID).filter((t) => has(t)),
    difficulty,
    targets,
    avoid: learner.lostWith.filter((l) => targets.some((t) => t.term === l.term)),
  };
}

const inFive = (s: number) => Math.max(0, Math.min(5, Math.round(s * 5)));

/** The practice lines of the turn's guidance. */
export function renderPractice(spec: PracticeSpec, weakFirst: boolean): string[] {
  const lines: string[] = [];
  const f = spec.formats;
  if (f.mcq || f.free || f.tf) {
    const parts: string[] = [];
    if (f.mcq) parts.push(`about ${inFive(f.mcq)} in 5 multiple choice (four options, one best answer)`);
    if (f.free) parts.push(`${f.mcq ? 'the rest' : 'mostly'} free response${spec.parts ? ', in parts that build on each other' : ''}`);
    if (f.tf && !f.mcq) parts.push('some true or false');
    lines.push(`Formats, as the course's past questions run: ${parts.join('; ')}. Put one question at a time unless they ask for a set.`);
  }
  const demands: string[] = [];
  if (spec.graphs >= 0.15) demands.push(`reading or drawing a graph or diagram (${Math.round(spec.graphs * 100)}% of past questions)`);
  if (spec.numbers >= 0.15) demands.push(`working with numbers (${Math.round(spec.numbers * 100)}%)`);
  if (spec.scenario) demands.push('a short scenario to reason about before the question');
  if (spec.justify) demands.push('a reason or working to justify the answer');
  if (demands.length) lines.push(`What the questions demand: ${demands.join('; ')}.`);
  if (spec.traps.length) lines.push(`The course's questions use ${spec.traps.map((t) => TRAP_SAID[t]).join(', ')}: use them fairly, and when you give feedback, name the trap.`);
  if (spec.difficulty) {
    const at = spec.difficulty === 'direct' ? 'direct, one-step questions' : spec.difficulty === 'multistep' ? 'multi-step questions' : 'a mix of direct and multi-step questions';
    lines.push(`Difficulty: the course's level is ${at}${weakFirst ? '; on a concept they have got wrong, start one step easier and build up to it' : ''}.`);
  }
  if (spec.targets.length) lines.push(`Aim first at: ${spec.targets.map((t) => `${t.term} (${t.why})`).join('; ')}.`);
  for (const a of spec.avoid) lines.push(`On ${a.term}, they were lost after ${a.approaches.map((x) => APPROACH_SAID[x]).join(' and ')} before: explain mistakes another way.`);
  lines.push('Write new questions that make the same reasoning demands — never the wording of the course’s own questions — and never say or suggest that a question will be on their exam.');
  return lines;
}

const APPROACH_SAID: Record<Approach, string> = { example: 'a worked example', picture: 'a picture', analogy: 'an analogy', contrast: 'a comparison', stepback: 'the idea underneath' };

// ── the turn's guidance ──────────────────────────────────────────────

export interface CourseTurn {
  text: string;
  /** the explanation plan's concept, when it has one */
  topic?: string | null;
  /** the turn is practice: the person asked to be quizzed or for problems */
  practice: boolean;
  /** the turn is learning: an explanation, not small talk */
  learning: boolean;
  ledger: readonly LedgerEntry[];
  now: number;
}

/** The course block for the turn: '' when the course has nothing to say to this turn. */
export function renderCourseGuidance(pack: CoursePack, t: CourseTurn): string {
  const about = `${t.text} ${t.topic ?? ''}`;
  // a turn about one of the course's concepts gets its terms even when answered directly; small talk gets nothing
  const aboutCourse = pack.concepts.some((c) => sameConcept(c.t, about) || (t.topic && sameConcept(c.t, t.topic)));
  if (!t.practice && !t.learning && !aboutCourse) return '';
  const learner = learnerOf(pack, t.ledger, t.now);
  const terms = relevantTerms(pack, about);
  const lines: string[] = [];
  if (terms.length) lines.push(`Use the course's own terms where they fit: ${terms.join(', ')}.`);
  const aboutWords = new Set(keyWords(about));
  const abbr = pack.abbr.filter(([a, p]) => new RegExp(`\\b${a}\\b`).test(about) || keyWords(p).filter((w) => aboutWords.has(w)).length >= Math.min(2, keyWords(p).length));
  if (abbr.length) lines.push(`The course writes ${abbr.map(([a, p]) => `${a} for ${p}`).join(', ')}.`);
  const lean = courseLean(pack, about);
  if (!t.practice && t.learning) {
    if (lean.opens === 'example') lines.push('The course opens a topic with a concrete example before the general idea: do the same here.');
    else if (lean.opens === 'question') lines.push('The course opens a topic with a question or a puzzle: start from the question it answers.');
    else if (lean.opens === 'definition') lines.push('The course states a definition first, then works from it: give the definition in its terms early.');
    if (lean.draws) lines.push('The course reasons with graphs and diagrams; where a picture fits, use the kind it uses.');
    if (pack.codes.some((x) => x.code === 'depth.formal' && sure(x))) lines.push('The course explains formally, with equations: keep the precision; do not water it down.');
    else if (pack.codes.some((x) => x.code === 'depth.compact' && sure(x))) lines.push('The course explains compactly: short, clear steps over long derivations.');
  }
  const here = pack.concepts.filter((c) => sameConcept(c.t, about) || (t.topic && sameConcept(c.t, t.topic)));
  for (const c of here.slice(0, 2)) if (c.a >= 2) lines.push(`${cap(c.t)} is one the course keeps coming back to (${c.a} past questions).`);
  const weakHere = learner.weak.filter((w) => here.some((c) => c.t === w));
  if (weakHere.length && !t.practice) lines.push(`They have got ${weakHere.join(' and ')} wrong before: check the step they usually miss, plainly.`);
  for (const l of learner.lostWith.filter((x) => here.some((c) => c.t === x.term)).slice(0, 1)) if (!t.practice) lines.push(`On ${l.term} they were lost after ${l.approaches.map((x) => APPROACH_SAID[x]).join(' and ')}: come at it another way.`);
  if (t.practice) lines.push(...renderPractice(practiceSpec(pack, learner, here.map((c) => c.t).slice(0, 1)), learner.weak.length > 0));
  if (!lines.length) return '';
  return `\n\nTHIS COURSE — ${pack.label} (from materials the student added: how the course has taught and asked, never what it will ask)\n${lines.map((l) => `- ${l}`).join('\n')}\n`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Content-free, for the response header and the log line: which course was in play, why, and what it shaped. */
export function courseTrace(pack: CoursePack | null, shaped: { guidance: boolean; practice: boolean }): string {
  if (!pack) return 'off';
  return [`why=${pack.why}`, `codes=${pack.codes.length}`, shaped.guidance ? 'g=1' : 'g=0', shaped.practice ? 'p=1' : 'p=0'].join(';');
}

// ── the reply gate ───────────────────────────────────────────────────

/**
 * A sentence claiming to know what an exam will ask. Socria can say how a course has asked questions; it cannot
 * know what the next exam holds, and never says so. (Quoted material is left to the gate's own quote handling.)
 */
const PREDICTS = new RegExp(
  [
    // "this will be on your exam", "it's likely to come up on the midterm", "these are bound to appear in the final"
    String.raw`\b(?:this|that|it|these|those|they|one|which)(?:'s|’s|'re|’re)?\s+(?:(?:is|are)\s+)?(?:will|won['’]t|will not|is going to|are going to|going to|sure to|certain to|bound to|guaranteed to|definitely will|will definitely|will probably|will likely|likely to)\s+(?:be\s+)?(?:on|in|appear (?:on|in)|come up (?:on|in)|show up (?:on|in))\s+(?:your|the|this|next|an?)\s+(?:\w+\s+){0,2}(?:exam|midterm|final|test|quiz)\b`,
    // "your professor will ask", "the exam is going to test"
    String.raw`\b(?:your|the)\s+(?:professor|instructor|teacher|lecturer|exam|midterm|final)\s+(?:will|is going to|is sure to|is likely to|will probably|will definitely|will likely)\s+(?:ask|test|include|put|set)\b`,
    // "you'll see this on the exam", "you will be asked this in the final"
    String.raw`\byou(?:'ll|’ll| will)\s+(?:definitely\s+|probably\s+|likely\s+|surely\s+)?(?:see|get|be asked|meet|face)\s+(?:this|these|it|that|a question like this|questions like these)\s+(?:on|in)\s+(?:your|the)\s+(?:\w+\s+)?(?:exam|midterm|final|test|quiz)\b`,
    // "expect this on the final", "guaranteed questions like these in your test"
    String.raw`\b(?:expect|guaranteed)\s+(?:this|these|a question like this|questions like these)\s+(?:on|in)\s+(?:your|the)\s+(?:\w+\s+)?(?:exam|midterm|final|test)\b`,
    // "predicted exam questions", "likely test questions"
    String.raw`\b(?:predicted|likely)\s+(?:exam|test|midterm|final)\s+questions?\b`,
  ].join('|'),
  'i'
);

/** Saying that it cannot be known is the opposite of a prediction: "I can't tell you whether this will be on your exam". */
const DISCLAIMS = /\b(?:never|not|cannot|can['’]?t|no(?:body| one)?|unable to|no way to)\b(?:\W+\w+){0,4}?\W+(?:know|tell|say|predict|promise|guarantee|claim|sure)\b/i;

export function predictsExam(sentence: string): boolean {
  return PREDICTS.test(sentence) && !DISCLAIMS.test(sentence);
}

/** How many of a reply's five-word runs a past question of the course also has: a measure of copied wording. */
export function copiedWording(reply: string, avoid: readonly number[], shingle: (text: string) => number[]): number {
  if (!avoid.length) return 0;
  const set = new Set(avoid);
  return shingle(reply).filter((h) => set.has(h)).length;
}

// ── for the profile view: what the profile does, said truthfully ─────

/** What a profile changes in Socria, in the words the profile view shows — from the same codes and spec the turn uses. */
export function effectsOf(p: CourseProfile): { explain: string[]; practice: string[] } {
  const pack = packOf(p, 'linked');
  const lean = courseLean(pack);
  const explain: string[] = [];
  if (pack.terms.length) explain.push(`Uses the course’s own terms — ${pack.terms.slice(0, 4).join(', ')}${pack.abbr.length ? `; writes ${pack.abbr.slice(0, 2).map(([a, x]) => `${a} for ${x}`).join(', ')}` : ''}.`);
  if (lean.opens === 'example') explain.push('Opens a new idea with a concrete example first, as the course does.');
  if (lean.opens === 'question') explain.push('Starts from the question an idea answers, as the course does.');
  if (lean.opens === 'definition') explain.push('Gives the definition in the course’s terms early, as the course does.');
  if (lean.draws) explain.push('Reaches for a graph or diagram where one fits, as the course does.');
  if (lean.contrasts) explain.push('When you are lost, sets an idea beside the one it is confused with — the course’s questions turn on that.');
  explain.push('Notes when a topic is one the course keeps coming back to, and where you have struggled with it before.');
  // the same spec a practice turn is given, said to the student
  const spec = practiceSpec(pack, learnerOf(pack, [], 0));
  const practice: string[] = [];
  const f = spec.formats;
  if (f.mcq || f.free || f.tf) {
    const parts = [f.mcq ? `about ${inFive(f.mcq)} in 5 multiple choice` : '', f.free ? `${f.mcq ? 'the rest' : 'mostly'} free response${spec.parts ? ' in parts' : ''}` : '', f.tf && !f.mcq ? 'some true or false' : ''].filter(Boolean);
    practice.push(`Question formats like the course’s: ${parts.join(', ')}.`);
  }
  const demands = [spec.graphs >= 0.15 ? `graphs or diagrams (${Math.round(spec.graphs * 100)}% of past questions)` : '', spec.numbers >= 0.15 ? `numbers (${Math.round(spec.numbers * 100)}%)` : '', spec.scenario ? 'a short scenario first' : '', spec.justify ? 'a reason to justify the answer' : ''].filter(Boolean);
  if (demands.length) practice.push(`The same demands: ${demands.join(', ')}.`);
  if (spec.traps.length) practice.push(`The course’s kinds of traps — ${spec.traps.map((t) => TRAP_SAID[t]).join(', ')} — named in the feedback.`);
  if (spec.difficulty) practice.push(`At the course’s level (${spec.difficulty === 'direct' ? 'direct, one-step questions' : spec.difficulty === 'multistep' ? 'multi-step questions' : 'a mix of direct and multi-step questions'}), a step easier where you have struggled.`);
  practice.push('Aims first at what you have got wrong or not practised among what the course stresses.');
  practice.push('New questions with the same reasoning demands — never copied wording, and never a claim about what your exam will ask.');
  return { explain, practice };
}
