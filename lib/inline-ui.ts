// lib/inline-ui.ts — ADAPTIVE RESPONSE RENDERING: what may be drawn inside a reply.
//
// Most replies are prose and stay prose. Now and then a small, interactive
// thing says it better than a paragraph: a little chart of the numbers they
// gave, a slider over a formula, two options side by side, the reasoning folded
// under its conclusion, a few choices to tap, a draft they can edit in place,
// the parts of a subject to explore one at a time, steps or events in order,
// the ways an open piece of work could go next, a decision they weigh
// themselves — and, to reason WITH rather than read: a graph whose numbers
// they drag, a small simulation, the working laid out with their numbers, a
// question whose answer they work out and check. Those are drawn INSIDE the
// conversation, from a structured description the reply writes in a fenced
// block:
//
//   ```ui
//   {"type":"compare","options":["Rent","Buy"],"rows":[{"label":"Monthly","values":["$1,900","$2,350"]}]}
//   ```
//
// A DESCRIPTION, NEVER CODE. Fourteen kinds, each with a fixed shape and limits;
// anything else is not drawn. Every string is cleaned and capped, every number
// is finite, a formula is compiled by the same safe parser the math engine
// uses (lib/logos-math.ts compileExpr — no eval), and nothing in a spec can run.
// The renderer (components/inline/InlineUI.tsx) knows these fourteen and no others.
//
// WHAT THEY DO REACHES SOCRIA. What the person does with an element — a number
// dragged, a prediction made, an answer checked — is kept with the message
// (`ui`), read back in the history as the element now stands
// (contentForHistory), and said once with their next message as what they did
// (`did`, describeInline): shown to them first, on the box, and theirs to take
// off before it goes.
//
// CHECKED BEFORE IT IS SHOWN (Epistemic Control). The route runs every block
// through `checkInlineSpec` as it streams (lib/core4/stream-gate.ts `block`):
//   • a chart's numbers must be the person's own (basis "given") or come from a
//     source this turn (basis "source"); otherwise it is not drawn and the reply
//     says so in a line. Example numbers are allowed only as "illustrative",
//     and are labelled as examples wherever they are shown;
//   • a comparison's figures that appear in nothing they gave and no source are
//     marked as unchecked, cell by cell;
//   • a slider computes from a formula shown under it, never from a number the
//     reply asserts;
//   • choices are a question, so they go only where a question may;
//   • a draft is never offered for writing that is theirs to write;
//   • under the Answer Guard, no steps laid out and no overview to read
//     instead of working (concepts, sequence), and no steps when working it
//     out is theirs;
//   • a decision drawn to be weighed carries no weights from the reply: how
//     much each thing matters is theirs to say, so the leaning it shows is
//     arithmetic on THEIR weights, never a verdict handed to them;
//   • a graph, a simulation and a question compute what they show — a turning
//     point found on the curve, a range evaluated, an answer worked out from
//     its formula (lib/inline-math.ts) — never a number the reply asserts;
//   • one thing to work with in a reply: a second graph, simulation, slider,
//     decision or working is not drawn;
//   • under the Answer Guard, the person's own work is what is drawn: a
//     question to answer (its explanation held back), a graph with nothing
//     marked on it, a simulation without its readings — never the working.
//
// PURE: the route, the parser (lib/rich-text.ts), the renderer and the tests
// share it.

import { compileExpr, freeNames } from './logos-math';
import { answerOf, checkTyped, compileOver, compileOverT, crossingsOf, curveFeatures, exprWithValues, fmtPoint, fmtVal, meanValue, sampleCurve, slopeAt, timeAt, type Feature } from './inline-math';

export const INLINE_KINDS = ['chart', 'slider', 'compare', 'reasoning', 'options', 'draft', 'concepts', 'sequence', 'paths', 'decide', 'graph', 'sim', 'check', 'steps', 'claim'] as const;
export type InlineKind = (typeof INLINE_KINDS)[number];

export type ChartBasis = 'given' | 'source' | 'illustrative';
export interface ChartSpec {
  type: 'chart';
  kind: 'bar' | 'line' | 'pie';
  title?: string;
  /** a label for each point, in order */
  x: string[];
  series: { name?: string; values: number[] }[];
  unit?: string;
  /** where the numbers came from — the person, a source this turn, or examples */
  basis: ChartBasis;
}
export interface SliderVar {
  name: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit?: string;
}
export interface SliderSpec {
  type: 'slider';
  title?: string;
  /** what is computed, over the variables' names: "p*r/(1-(1+r)^(-n))" */
  formula: string;
  result: { label: string; unit?: string; digits?: number };
  vars: SliderVar[];
}
export interface CompareSpec {
  type: 'compare';
  title?: string;
  options: string[];
  rows: { label: string; values: string[]; unchecked?: number[] }[];
  /** the option the reply leans to, when it said which and why */
  pick?: number;
}
export interface ReasoningSpec {
  type: 'reasoning';
  /** the conclusion, in a line — what shows while the steps are folded */
  summary: string;
  steps: string[];
}
export interface OptionsSpec {
  type: 'options';
  prompt?: string;
  options: { label: string; reply?: string }[];
}
export interface DraftSpec {
  type: 'draft';
  title?: string;
  kind?: 'email' | 'message' | 'note' | 'paragraph' | 'post';
  text: string;
}
/**
 * THE PARTS OF A SUBJECT, TO EXPLORE. An overview of something with several
 * parts that bear on each other ("give me an overview of microeconomics"):
 * each part named with a line on what it is, more on it when it is opened,
 * and which of the others it connects to. Read one at a time, followed from
 * one to the next, and taken further in the conversation when they want.
 */
export interface ConceptsSpec {
  type: 'concepts';
  title?: string;
  items: { name: string; gist: string; detail?: string; links?: string[] }[];
}
/** Steps to follow in order, or events in time: the order is the point. */
export interface SequenceSpec {
  type: 'sequence';
  kind: 'steps' | 'timeline';
  title?: string;
  /** `when` on every item of a timeline ("1789", "Week 3"); never on steps */
  items: { label: string; when?: string; detail?: string }[];
}
/**
 * WAYS DEEPER. Where an open piece of work could go next: two to four
 * directions, each a few words and a line on what opening it would give them.
 * Opened, one becomes their next message in this same conversation — so going
 * deeper never loses what was said — and is marked as explored; the others
 * stay there to come back to. An offer, not a question and not a menu the
 * reply hides behind: the useful part is already said in the prose above it.
 */
export interface PathsSpec {
  type: 'paths';
  title?: string;
  items: { label: string; gist?: string }[];
}
/**
 * A DECISION, WEIGHED BY THEM. Two to four options against what the decision
 * rests on, with Socria's first reading of how each option does on each thing
 * (0 poor – 3 strong, `scores` in option order). They say how much each thing
 * matters and can change any reading; the leaning is computed from their
 * weights, live. `weights` is never taken from a reply (sanitizeInlineSpec
 * drops it): it rides only on the spec handed to Artifacts, carrying the
 * weights THEY set.
 */
export interface DecideSpec {
  type: 'decide';
  title?: string;
  options: string[];
  rows: { label: string; scores: number[]; note?: string; /** options whose reading they changed — set only when it is opened in Artifacts */ theirs?: number[] }[];
  /** the person's own weights (0–3, one per row) — set only when it is opened in Artifacts */
  weights?: number[];
}
/** A number the person can change: a parameter of a graph or a simulation. */
export interface ParamSpec {
  name: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit?: string;
}
/** A question asked before anything is moved: committed to first, compared with what happens after. */
export interface PredictSpec {
  prompt: string;
  options: string[];
}
/** A reading: a formula in the parameters, computed live as they change. */
export interface ReadoutSpec {
  label: string;
  expr: string;
  unit?: string;
  digits?: number;
}
/**
 * A GRAPH TO CHANGE. y as an expression of x and up to three parameters
 * ("a*x^2 + b*x + c"), drawn across a window. The parameters are the numbers
 * in the equation the person drags (and sliders under it); what is marked on
 * the curve — its turning points, where it crosses zero, where it meets the
 * y-axis — is found on the curve as it is now, never written by the reply.
 * The curve it started as stays, faintly, once it has been changed.
 *
 * AN IDEA, NOT ONLY A SHAPE (November 2026). The relationship a person asked
 * to understand is often not the curve but something on it: the slope at a
 * point against the average slope over an interval (the mean value theorem,
 * what a derivative is), or where two curves meet as one shifts (a tax on
 * sellers). So a parameter can be an x position on the curve — a point they
 * drag along it ("at") — two of them a chord whose slope is the average rate,
 * one a tangent whose slope is the rate there; "mean-value" marks where a
 * tangent runs parallel to the chord, or says why none does; more curves meet
 * at "crossings"; readings are formulas in the parameters. Every number on it
 * is computed on the curve as it is now (lib/inline-math.ts).
 */
export interface GraphSpec {
  type: 'graph';
  title?: string;
  expr: string;
  /** what the first curve is called, when there are several ("demand") */
  label?: string;
  /** one or two more curves over the same x and parameters ("supply") */
  curves?: { expr: string; label?: string }[];
  /** the window: x from–to; y from–to, or fitted to the curve as it starts */
  x: [number, number];
  y?: [number, number];
  params: ParamSpec[];
  features: GraphFeature[];
  /** parameters that are x positions on the first curve: points they drag along it */
  at?: string[];
  /** two such positions: the chord between them and its slope — the average rate over the interval */
  chord?: [string, string];
  /** one such position: the tangent there and its slope — the rate at that point */
  tangent?: string;
  /** formulas in the parameters, computed live */
  readouts?: ReadoutSpec[];
  /** under the Answer Guard: the lines are drawn, the numbers that would answer it are not */
  quiet?: true;
  predict?: PredictSpec;
}
export type GraphFeature = 'turning' | 'roots' | 'intercept' | 'crossings' | 'mean-value';
/**
 * A SIMULATION, SMALL. A path traced over time — x(t) and y(t) over up to
 * three parameters (a throw: the angle, the speed) — from t0 to t1, either an
 * end a formula gives ("when it lands"). Its readings are computed from
 * formulas too. Each setting the person tries stays on the picture, faintly,
 * so what they tried can be compared.
 */
export interface SimSpec {
  type: 'sim';
  title?: string;
  x: string;
  y: string;
  t: [number | string, number | string];
  view: { x: [number, number]; y: [number, number] };
  params: ParamSpec[];
  readouts?: ReadoutSpec[];
  predict?: PredictSpec;
}
/** A question with an answer they work out: the answer is a formula the engine evaluates, never a number asserted. */
export interface CheckPart {
  prompt: string;
  /** "-(-8)/(2*2)": worked out, then compared with what they type */
  answer: string;
  /** what the answer is called: "x", "the area" */
  label?: string;
  unit?: string;
  /** how far off still counts as right, in the answer's own units */
  tolerance?: number;
  /** how it comes out, said after they try (may hold $…$) */
  explain?: string;
}
export interface CheckSpec extends CheckPart {
  type: 'check';
}
/**
 * THE WORKING, WITH THEIR NUMBERS. Lines of maths (TeX), each with why it
 * follows folded under it, and their turn at the end — a question of the same
 * kind to work out and check. Never under the Answer Guard, and never the
 * working that is theirs to do.
 */
export interface StepsSpec {
  type: 'steps';
  title?: string;
  lines: { tex: string; why?: string }[];
  check?: CheckPart;
}
/**
 * A CLAIM, INSPECTED. Somebody's claim, or the world's, put up to be checked:
 * the verdict, and the parts it rests on, each marked as holding or not, with
 * what that rests on — opened one at a time. They can say which part they
 * doubt, and that goes to Socria with their next message. The basis is the
 * kind of evidence, never a study or a figure the reply is not sure of.
 */
export interface ClaimSpec {
  type: 'claim';
  claim: string;
  verdict: ClaimVerdict;
  parts: { text: string; holds: ClaimHolds; basis?: string }[];
}
export type ClaimVerdict = 'holds' | 'fails' | 'partly' | 'unsettled';
export type ClaimHolds = 'yes' | 'no' | 'partly' | 'unclear';
export const CLAIM_VERDICTS: readonly ClaimVerdict[] = ['holds', 'fails', 'partly', 'unsettled'];
export const CLAIM_HOLDS: readonly ClaimHolds[] = ['yes', 'no', 'partly', 'unclear'];

export type InlineSpec = ChartSpec | SliderSpec | CompareSpec | ReasoningSpec | OptionsSpec | DraftSpec | ConceptsSpec | SequenceSpec | PathsSpec | DecideSpec | GraphSpec | SimSpec | CheckSpec | StepsSpec | ClaimSpec;

/** The kinds a person works with — one to a reply: more than one is a dashboard. */
export const LIVE_KINDS: readonly InlineKind[] = ['graph', 'sim', 'slider', 'decide', 'steps', 'claim'];

export const INLINE_LIMITS = {
  points: 24,
  series: 3,
  label: 40,
  title: 80,
  unit: 12,
  vars: 3,
  formula: 200,
  compareOptions: 4,
  rows: 8,
  cell: 80,
  steps: 8,
  step: 400,
  summary: 160,
  choices: 5,
  choice: 60,
  reply: 200,
  draft: 4000,
  /** an overview's parts: fewer than three is a sentence, more than seven a syllabus */
  concepts: 7,
  conceptName: 48,
  gist: 160,
  detail: 600,
  links: 3,
  /** steps or events in order */
  sequence: 8,
  when: 24,
  /** ways deeper: one is not a choice, more than four is a syllabus */
  paths: 4,
  pathLabel: 60,
  pathGist: 140,
  /** a decision weighed: options across, what it rests on down */
  decideOptions: 4,
  decideRows: 6,
  /** a reading of an option on one thing: 0 poor, 1 weak, 2 good, 3 strong */
  maxScore: 3,
  note: 120,
  /** inline blocks in one reply: more than two is a dashboard */
  perReply: 2,
  /** a graph's or a simulation's numbers to change */
  params: 3,
  readouts: 3,
  /** more curves on one graph: supply beside demand */
  curves: 2,
  /** a claim inspected: what it rests on */
  claim: 200,
  claimParts: 5,
  claimPart: 180,
  basis: 240,
  /** what may be answered before anything is moved */
  predictOptions: 4,
  prompt: 200,
  explain: 500,
  /** the working: lines of maths */
  lines: 8,
  tex: 240,
  why: 400,
} as const;
const L = INLINE_LIMITS;

// ── cleaning ─────────────────────────────────────────────────────────

/** One line of text, safe to keep: control characters out, whitespace collapsed, capped. */
function line(v: unknown, max: number): string {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  // eslint-disable-next-line no-control-regex
  const s = String(v).replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length <= max ? s : s.slice(0, max).replace(/\s+\S*$/, '').trim() || s.slice(0, max);
}
/** Text that keeps its paragraphs (a draft): control characters out, at most one blank line in a row, capped. */
function prose(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const NAME = /^[A-Za-z][A-Za-z0-9_]{0,15}$/;

function sanitizeChart(r: Record<string, unknown>): ChartSpec | null {
  const kind = r.kind === 'line' || r.kind === 'pie' ? r.kind : 'bar';
  const x = (Array.isArray(r.x) ? r.x : []).slice(0, L.points).map((v) => line(v, L.label));
  if (x.length < 2 || x.some((v) => !v)) return null;
  const series: ChartSpec['series'] = [];
  for (const s of (Array.isArray(r.series) ? r.series : []).slice(0, L.series)) {
    const o = s && typeof s === 'object' ? (s as Record<string, unknown>) : null;
    const values = Array.isArray(o?.values) ? (o!.values as unknown[]).slice(0, x.length) : [];
    if (values.length !== x.length || !values.every(fin)) return null;
    const name = line(o?.name, L.label);
    series.push({ ...(name ? { name } : {}), values: (values as number[]).map(r6) });
  }
  if (!series.length) return null;
  // a pie is shares of one whole: one series, nothing below zero, something above it
  if (kind === 'pie' && (series.length > 1 || series[0].values.some((v) => v < 0) || !series[0].values.some((v) => v > 0))) return null;
  const basis: ChartBasis = r.basis === 'given' || r.basis === 'source' ? r.basis : 'illustrative';
  const title = line(r.title, L.title);
  const unit = line(r.unit, L.unit);
  return { type: 'chart', kind, ...(title ? { title } : {}), x, series, ...(unit ? { unit } : {}), basis };
}

function sanitizeSlider(r: Record<string, unknown>): SliderSpec | null {
  const formula = typeof r.formula === 'string' ? r.formula.trim() : '';
  if (!formula || formula.length > L.formula) return null;
  const vars: SliderVar[] = [];
  for (const v of (Array.isArray(r.vars) ? r.vars : []).slice(0, L.vars)) {
    const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
    const name = typeof o?.name === 'string' && NAME.test(o.name) ? o.name.toLowerCase() : null;
    // a variable may not be called what a function or a constant is called ("log", "e")
    if (!name || freeNames(name).length !== 1 || vars.some((x) => x.name === name)) return null;
    const min = o!.min, max = o!.max;
    if (!fin(min) || !fin(max) || !(min < max) || max - min > 1e9) return null;
    const step = fin(o!.step) && o!.step > 0 ? o!.step : (max - min) / 100;
    // a slider of more than two thousand stops is a text field pretending
    if ((max - min) / step > 2000) return null;
    const value = fin(o!.value) ? Math.min(max, Math.max(min, o!.value)) : min;
    const unit = line(o!.unit, L.unit);
    vars.push({ name, label: line(o!.label, L.label) || name, min: r6(min), max: r6(max), step: r6(step), value: r6(value), ...(unit ? { unit } : {}) });
  }
  if (!vars.length) return null;
  // compiled by the math engine's parser over exactly these names, or not drawn
  const c = compileExpr(formula, vars.map((v) => v.name));
  if (!c || !c.vars.length) return null;
  const at = c.eval(Object.fromEntries(vars.map((v) => [v.name, v.value])));
  if (!Number.isFinite(at)) return null;
  const res = r.result && typeof r.result === 'object' ? (r.result as Record<string, unknown>) : {};
  const digits = fin(res.digits) && res.digits >= 0 && res.digits <= 6 ? Math.round(res.digits) : 2;
  const unit = line(res.unit, L.unit);
  const title = line(r.title, L.title);
  return { type: 'slider', ...(title ? { title } : {}), formula, result: { label: line(res.label, L.label) || 'Result', ...(unit ? { unit } : {}), digits }, vars };
}

function sanitizeCompare(r: Record<string, unknown>): CompareSpec | null {
  const options = (Array.isArray(r.options) ? r.options : []).slice(0, L.compareOptions).map((v) => line(v, L.label));
  if (options.length < 2 || options.some((v) => !v)) return null;
  const rows: CompareSpec['rows'] = [];
  for (const row of (Array.isArray(r.rows) ? r.rows : []).slice(0, L.rows)) {
    const o = row && typeof row === 'object' ? (row as Record<string, unknown>) : null;
    const label = line(o?.label, L.label);
    const values = Array.isArray(o?.values) ? (o!.values as unknown[]).slice(0, options.length).map((v) => line(v, L.cell)) : [];
    if (!label || values.length !== options.length) continue;
    const unchecked = Array.isArray(o!.unchecked) ? [...new Set((o!.unchecked as unknown[]).filter((i): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < options.length))] : [];
    rows.push({ label, values, ...(unchecked.length ? { unchecked } : {}) });
  }
  if (!rows.length) return null;
  const pick = Number.isInteger(r.pick) && (r.pick as number) >= 0 && (r.pick as number) < options.length ? (r.pick as number) : undefined;
  const title = line(r.title, L.title);
  return { type: 'compare', ...(title ? { title } : {}), options, rows, ...(pick !== undefined ? { pick } : {}) };
}

function sanitizeReasoning(r: Record<string, unknown>): ReasoningSpec | null {
  const summary = line(r.summary, L.summary);
  const steps = (Array.isArray(r.steps) ? r.steps : []).slice(0, L.steps).map((v) => line(v, L.step)).filter(Boolean);
  return summary && steps.length ? { type: 'reasoning', summary, steps } : null;
}

function sanitizeOptions(r: Record<string, unknown>): OptionsSpec | null {
  const options: OptionsSpec['options'] = [];
  for (const o of (Array.isArray(r.options) ? r.options : []).slice(0, L.choices)) {
    const x = typeof o === 'string' ? { label: o } : o && typeof o === 'object' ? (o as Record<string, unknown>) : null;
    const label = line(x?.label, L.choice);
    if (!label || options.some((y) => y.label === label)) continue;
    const reply = line(x?.reply, L.reply);
    options.push({ label, ...(reply && reply !== label ? { reply } : {}) });
  }
  if (options.length < 2) return null;
  const prompt = line(r.prompt, L.title);
  return { type: 'options', ...(prompt ? { prompt } : {}), options };
}

const DRAFT_KINDS = ['email', 'message', 'note', 'paragraph', 'post'] as const;
function sanitizeDraft(r: Record<string, unknown>): DraftSpec | null {
  const text = prose(r.text, L.draft);
  if (text.length < 2) return null;
  const kind = DRAFT_KINDS.includes(r.kind as DraftSpec['kind'] & string) ? (r.kind as DraftSpec['kind']) : undefined;
  const title = line(r.title, L.title);
  return { type: 'draft', ...(title ? { title } : {}), ...(kind ? { kind } : {}), text };
}

function sanitizeConcepts(r: Record<string, unknown>): ConceptsSpec | null {
  const items: ConceptsSpec['items'] = [];
  for (const it of (Array.isArray(r.items) ? r.items : []).slice(0, L.concepts)) {
    const o = it && typeof it === 'object' ? (it as Record<string, unknown>) : null;
    const name = line(o?.name, L.conceptName);
    const gist = line(o?.gist, L.gist);
    if (!name || !gist || items.some((x) => x.name.toLowerCase() === name.toLowerCase())) continue;
    const detail = line(o?.detail, L.detail);
    items.push({ name, gist, ...(detail && detail !== gist ? { detail } : {}), ...(Array.isArray(o?.links) ? { links: (o!.links as unknown[]).map((v) => line(v, L.conceptName)) } : {}) });
  }
  if (items.length < 3) return null;
  // a connection is to another part of this overview, named as it is named here — anything else is dropped
  const named = new Map(items.map((x) => [x.name.toLowerCase(), x.name]));
  for (const x of items) {
    if (!x.links) continue;
    const links = [...new Set(x.links.map((l) => named.get(l.toLowerCase())).filter((l): l is string => !!l && l !== x.name))].slice(0, L.links);
    if (links.length) x.links = links;
    else delete x.links;
  }
  const title = line(r.title, L.title);
  return { type: 'concepts', ...(title ? { title } : {}), items };
}

function sanitizeSequence(r: Record<string, unknown>): SequenceSpec | null {
  const raw: { label: string; when: string; detail: string }[] = [];
  for (const it of (Array.isArray(r.items) ? r.items : []).slice(0, L.sequence)) {
    const o = typeof it === 'string' ? { label: it } : it && typeof it === 'object' ? (it as Record<string, unknown>) : null;
    const label = line(o?.label, L.step);
    if (!label) continue;
    raw.push({ label, when: line(o?.when, L.when), detail: line(o?.detail, L.detail) });
  }
  if (raw.length < 3) return null;
  // a timeline dates every event; one that does not is steps, in the order given
  const kind: SequenceSpec['kind'] = r.kind === 'timeline' && raw.every((x) => x.when) ? 'timeline' : 'steps';
  const items = raw.map((x) => ({ label: x.label, ...(kind === 'timeline' ? { when: x.when } : {}), ...(x.detail && x.detail !== x.label ? { detail: x.detail } : {}) }));
  const title = line(r.title, L.title);
  return { type: 'sequence', kind, ...(title ? { title } : {}), items };
}

function sanitizePaths(r: Record<string, unknown>): PathsSpec | null {
  const items: PathsSpec['items'] = [];
  for (const it of (Array.isArray(r.items) ? r.items : []).slice(0, L.paths + 2)) {
    const o = typeof it === 'string' ? { label: it } : it && typeof it === 'object' ? (it as Record<string, unknown>) : null;
    const label = line(o?.label, L.pathLabel).replace(/[.:;,]+$/, '');
    if (!label || items.some((x) => x.label.toLowerCase() === label.toLowerCase())) continue;
    const gist = line(o?.gist, L.pathGist);
    items.push({ label, ...(gist && gist.toLowerCase() !== label.toLowerCase() ? { gist } : {}) });
    if (items.length === L.paths) break;
  }
  if (items.length < 2) return null;
  const title = line(r.title, L.title);
  return { type: 'paths', ...(title ? { title } : {}), items };
}

/** A reading on the 0–3 scale, or null: a whole number, a half rounded away, nothing outside it clamped into it. */
function score(v: unknown): number | null {
  if (!fin(v) || v < 0 || v > L.maxScore) return null;
  return Math.round(v);
}

function sanitizeDecide(r: Record<string, unknown>): DecideSpec | null {
  const options = (Array.isArray(r.options) ? r.options : []).slice(0, L.decideOptions).map((v) => line(v, L.label));
  if (options.length < 2 || options.some((v) => !v) || new Set(options.map((v) => v.toLowerCase())).size !== options.length) return null;
  const rows: DecideSpec['rows'] = [];
  for (const row of (Array.isArray(r.rows) ? r.rows : []).slice(0, L.decideRows)) {
    const o = row && typeof row === 'object' ? (row as Record<string, unknown>) : null;
    const label = line(o?.label, L.label);
    const scores = Array.isArray(o?.scores) ? (o!.scores as unknown[]).slice(0, options.length).map(score) : [];
    if (!label || scores.length !== options.length || scores.some((v) => v === null) || rows.some((x) => x.label.toLowerCase() === label.toLowerCase())) continue;
    const note = line(o!.note, L.note);
    rows.push({ label, scores: scores as number[], ...(note ? { note } : {}) });
  }
  // one thing to weigh is not a framework; it is a sentence
  if (rows.length < 2) return null;
  const title = line(r.title, L.title);
  // `weights` is theirs to set: whatever a reply wrote there is not read
  return { type: 'decide', ...(title ? { title } : {}), options, rows };
}

/** A pair of finite numbers, low then high, within a sensible span — a window's side. */
function range(v: unknown, span = 1e6): [number, number] | null {
  if (!Array.isArray(v) || v.length !== 2 || !fin(v[0]) || !fin(v[1]) || !(v[0] < v[1]) || v[1] - v[0] > span) return null;
  return [r6(v[0]), r6(v[1])];
}

/** A number to change: named as a single word that is no function or constant, and none of `reserved` (the graph's x, the simulation's t). */
function sanitizeParam(v: unknown, reserved: readonly string[]): ParamSpec | null {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  const name = typeof o?.name === 'string' && NAME.test(o.name) ? o.name.toLowerCase() : null;
  if (!name || reserved.includes(name) || freeNames(name).length !== 1) return null;
  const min = o!.min, max = o!.max;
  if (!fin(min) || !fin(max) || !(min < max) || max - min > 1e9) return null;
  const step = fin(o!.step) && o!.step > 0 ? o!.step : (max - min) / 100;
  if ((max - min) / step > 2000) return null;
  const value = fin(o!.value) ? Math.min(max, Math.max(min, o!.value)) : min;
  const unit = line(o!.unit, L.unit);
  return { name, label: line(o!.label, L.label) || name, min: r6(min), max: r6(max), step: r6(step), value: r6(value), ...(unit ? { unit } : {}) };
}
function sanitizeParams(raw: unknown, reserved: readonly string[], least: number): ParamSpec[] | null {
  const out: ParamSpec[] = [];
  for (const v of (Array.isArray(raw) ? raw : []).slice(0, L.params)) {
    const p = sanitizeParam(v, reserved);
    if (!p || out.some((x) => x.name === p.name)) return null;
    out.push(p);
  }
  return out.length >= least ? out : null;
}
function sanitizePredict(raw: unknown): PredictSpec | undefined {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const prompt = line(o?.prompt, L.prompt);
  const options = [...new Set((Array.isArray(o?.options) ? (o!.options as unknown[]) : []).slice(0, L.predictOptions).map((v) => line(v, L.choice)).filter(Boolean))];
  return prompt && options.length >= 2 ? { prompt, options } : undefined;
}
const valuesOf = (params: readonly ParamSpec[]): Record<string, number> => Object.fromEntries(params.map((p) => [p.name, p.value]));
const FEATURES: readonly GraphFeature[] = ['turning', 'roots', 'intercept', 'crossings', 'mean-value'];
/** What a graph marks when the reply named nothing: its shape, and where its curves meet. Never the mean value point unasked. */
const DEFAULT_FEATURES: readonly GraphFeature[] = ['turning', 'roots', 'intercept', 'crossings'];

/** Readings that are formulas in the parameters: compiled by the engine's parser, finite as it starts — or left off. */
function sanitizeReadouts(raw: unknown, names: readonly string[], vals: Record<string, number>): ReadoutSpec[] {
  const out: ReadoutSpec[] = [];
  for (const ro of (Array.isArray(raw) ? raw : []).slice(0, L.readouts)) {
    const o = ro && typeof ro === 'object' ? (ro as Record<string, unknown>) : null;
    const label = line(o?.label, L.label);
    const expr = typeof o?.expr === 'string' ? o.expr.trim() : '';
    const c = expr && expr.length <= L.formula ? compileExpr(expr, [...names]) : null;
    if (!label || !c || !Number.isFinite(c.eval(vals))) continue;
    const unit = line(o!.unit, L.unit);
    const digits = fin(o!.digits) && o!.digits >= 0 && o!.digits <= 6 ? Math.round(o!.digits) : undefined;
    out.push({ label, expr, ...(unit ? { unit } : {}), ...(digits !== undefined ? { digits } : {}) });
  }
  return out;
}

function sanitizeGraph(r: Record<string, unknown>): GraphSpec | null {
  const expr = typeof r.expr === 'string' ? r.expr.trim() : '';
  if (!expr || expr.length > L.formula) return null;
  const x = range(r.x);
  if (!x) return null;
  const params = sanitizeParams(r.params, ['x', 'y'], 0);
  if (!params) return null;
  const names = params.map((p) => p.name);
  const vals = valuesOf(params);
  // compiled by the math engine's parser over x and exactly these names, and drawable as it starts — or not drawn
  const c = compileOver(expr, names);
  if (!c || !c.vars.includes('x')) return null;
  if (!sampleCurve(c, vals, x[0], x[1], 120)) return null;
  // more curves over the same x and parameters: each drawable, or left off
  const curves: NonNullable<GraphSpec['curves']> = [];
  for (const v of (Array.isArray(r.curves) ? r.curves : []).slice(0, L.curves)) {
    const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
    const e = typeof o?.expr === 'string' ? o.expr.trim() : '';
    const cc = e && e.length <= L.formula ? compileOver(e, names) : null;
    if (!cc || !sampleCurve(cc, vals, x[0], x[1], 120)) continue;
    const lab = line(o!.label, L.label);
    curves.push({ expr: e, ...(lab ? { label: lab } : {}) });
  }
  // positions on the curve: parameters named, each at most once
  const isParam = (v: unknown): v is string => typeof v === 'string' && names.includes(v.toLowerCase());
  const chordRaw = Array.isArray(r.chord) && r.chord.length === 2 && r.chord.every(isParam) ? (r.chord as string[]).map((v) => v.toLowerCase()) : null;
  const chord = chordRaw && chordRaw[0] !== chordRaw[1] ? (chordRaw as [string, string]) : null;
  const tangent = isParam(r.tangent) ? r.tangent.toLowerCase() : null;
  const at = [...new Set([...(Array.isArray(r.at) ? (r.at as unknown[]).filter(isParam).map((v) => (v as string).toLowerCase()) : []), ...(chord ?? []), ...(tangent ? [tangent] : [])])].slice(0, L.params);
  const y = r.y === undefined ? null : range(r.y);
  const asked = Array.isArray(r.features) ? FEATURES.filter((f) => (r.features as unknown[]).includes(f)) : [...DEFAULT_FEATURES];
  // crossings need a second curve; the mean value point needs a chord
  const features = asked.filter((f) => (f !== 'crossings' || curves.length > 0) && (f !== 'mean-value' || !!chord));
  const readouts = sanitizeReadouts(r.readouts, names, vals);
  const predict = sanitizePredict(r.predict);
  const title = line(r.title, L.title);
  const label = curves.length ? line(r.label, L.label) : '';
  return {
    type: 'graph',
    ...(title ? { title } : {}),
    expr,
    ...(label ? { label } : {}),
    ...(curves.length ? { curves } : {}),
    x,
    ...(y ? { y } : {}),
    params,
    features,
    ...(at.length ? { at } : {}),
    ...(chord ? { chord } : {}),
    ...(tangent ? { tangent } : {}),
    ...(readouts.length ? { readouts } : {}),
    ...(r.quiet === true ? { quiet: true as const } : {}),
    ...(predict ? { predict } : {}),
  };
}

/** A claim inspected: the claim, a verdict, and two to five parts it rests on — no links (a source comes from a search, cited). */
function sanitizeClaim(r: Record<string, unknown>): ClaimSpec | null {
  const claim = line(r.claim, L.claim);
  const verdict = CLAIM_VERDICTS.find((v) => v === r.verdict);
  if (!claim || !verdict) return null;
  const parts: ClaimSpec['parts'] = [];
  for (const v of (Array.isArray(r.parts) ? r.parts : []).slice(0, L.claimParts)) {
    const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
    const text = line(o?.text, L.claimPart);
    const holds = CLAIM_HOLDS.find((h) => h === o?.holds);
    if (!text || !holds) continue;
    const basis = line(String(o!.basis ?? '').replace(/\bhttps?:\/\/\S+/gi, '').replace(/\bwww\.\S+/gi, ''), L.basis);
    parts.push({ text, holds, ...(basis ? { basis } : {}) });
  }
  return parts.length >= 2 ? { type: 'claim', claim, verdict, parts } : null;
}

function sanitizeSim(r: Record<string, unknown>): SimSpec | null {
  const xe = typeof r.x === 'string' ? r.x.trim() : '';
  const ye = typeof r.y === 'string' ? r.y.trim() : '';
  if (!xe || !ye || xe.length > L.formula || ye.length > L.formula) return null;
  const params = sanitizeParams(r.params, ['t', 'x', 'y'], 1);
  if (!params) return null;
  const names = params.map((p) => p.name);
  const cx = compileOverT(xe, names);
  const cy = compileOverT(ye, names);
  if (!cx || !cy || (!cx.vars.includes('t') && !cy.vars.includes('t'))) return null;
  // the time it runs for: numbers, or formulas over the parameters ("when it lands")
  const tr = Array.isArray(r.t) && r.t.length === 2 ? (r.t as unknown[]) : null;
  if (!tr) return null;
  const end = (v: unknown): number | string | null => (fin(v) ? r6(v) : typeof v === 'string' && v.trim() && v.length <= L.formula && compileExpr(v, names) ? v.trim() : null);
  const t0 = end(tr[0]), t1 = end(tr[1]);
  if (t0 === null || t1 === null) return null;
  const vals = valuesOf(params);
  const a = timeAt(t0, names, vals), b = timeAt(t1, names, vals);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !(b > a) || b - a > 1e6) return null;
  const vo = r.view && typeof r.view === 'object' ? (r.view as Record<string, unknown>) : null;
  const vx = range(vo?.x), vy = range(vo?.y);
  if (!vx || !vy) return null;
  const readouts = sanitizeReadouts(r.readouts, names, vals);
  const predict = sanitizePredict(r.predict);
  const title = line(r.title, L.title);
  return { type: 'sim', ...(title ? { title } : {}), x: xe, y: ye, t: [t0, t1], view: { x: vx, y: vy }, params, ...(readouts.length ? { readouts } : {}), ...(predict ? { predict } : {}) };
}

function sanitizeCheckPart(raw: unknown): CheckPart | null {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (!r) return null;
  const prompt = line(r.prompt, L.prompt);
  const answer = fin(r.answer) ? String(r6(r.answer)) : typeof r.answer === 'string' ? r.answer.trim() : '';
  // the answer is worked out by the engine, from a formula with no unknowns in it — or there is no question
  if (!prompt || !answer || answer.length > L.formula || answerOf(answer) === null) return null;
  const label = line(r.label, L.label);
  const unit = line(r.unit, L.unit);
  const tolerance = fin(r.tolerance) && r.tolerance >= 0 ? r6(r.tolerance) : undefined;
  const explain = line(r.explain, L.explain);
  return { prompt, answer, ...(label ? { label } : {}), ...(unit ? { unit } : {}), ...(tolerance !== undefined ? { tolerance } : {}), ...(explain ? { explain } : {}) };
}

const TEX_UNSAFE = /\\(?:href|url|includegraphics|html\w*|class|id|data|style)\b/;
function sanitizeSteps(r: Record<string, unknown>): StepsSpec | null {
  const lines: StepsSpec['lines'] = [];
  for (const it of (Array.isArray(r.lines) ? r.lines : []).slice(0, L.lines)) {
    const o = typeof it === 'string' ? { tex: it } : it && typeof it === 'object' ? (it as Record<string, unknown>) : null;
    const tex = line(o?.tex, L.tex);
    if (!tex || TEX_UNSAFE.test(tex)) continue;
    const why = line(o?.why, L.why);
    lines.push({ tex, ...(why ? { why } : {}) });
  }
  if (lines.length < 2) return null;
  const check = r.check === undefined ? null : sanitizeCheckPart(r.check);
  const title = line(r.title, L.title);
  return { type: 'steps', ...(title ? { title } : {}), lines, ...(check ? { check } : {}) };
}

/** Anything at all in, one of the fourteen canonical shapes out — or null, and nothing is drawn. */
export function sanitizeInlineSpec(raw: unknown): InlineSpec | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  switch (r.type) {
    case 'chart':
      return sanitizeChart(r);
    case 'slider':
      return sanitizeSlider(r);
    case 'compare':
      return sanitizeCompare(r);
    case 'reasoning':
      return sanitizeReasoning(r);
    case 'options':
      return sanitizeOptions(r);
    case 'draft':
      return sanitizeDraft(r);
    case 'concepts':
      return sanitizeConcepts(r);
    case 'sequence':
      return sanitizeSequence(r);
    case 'paths':
      return sanitizePaths(r);
    case 'decide':
      return sanitizeDecide(r);
    case 'graph':
      return sanitizeGraph(r);
    case 'sim':
      return sanitizeSim(r);
    case 'check': {
      const part = sanitizeCheckPart(r);
      return part ? { type: 'check', ...part } : null;
    }
    case 'steps':
      return sanitizeSteps(r);
    case 'claim':
      return sanitizeClaim(r);
    default:
      return null;
  }
}

/** The body of a ```ui block, parsed and sanitised; null for anything that is not a valid spec. */
export function parseInlineSpec(body: string): InlineSpec | null {
  if (typeof body !== 'string' || body.length > 12_000) return null;
  try {
    return sanitizeInlineSpec(JSON.parse(body));
  } catch {
    return null;
  }
}

/** A spec as the fenced block it travels in. */
export const fenceOf = (spec: InlineSpec): string => '```ui\n' + JSON.stringify(spec) + '\n```';

// ── the numbers they gave ────────────────────────────────────────────

const SCALE: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, mn: 1e6, b: 1e9, bn: 1e9, billion: 1e9 };

/**
 * Every number written in a text, as people write them: "1200", "1,200",
 * "$1,200.50", "12%", "−3", "1.2k", "3.5 million". The value, scaled; signs kept.
 */
export function numbersIn(text: string): number[] {
  const out: number[] = [];
  const re = /(^|[^\w.])([-−]?)[$£€¥₹]?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(?:\s?(thousand|million|billion|mn|bn|k|m|b)\b)?/gi;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const v = Number(m[3].replace(/,/g, ''));
    if (!Number.isFinite(v)) continue;
    out.push(m[2] ? -v : v);
    // "5k" is five thousand, or five kilometres; "3.5m" millions or metres: both readings count
    if (m[4]) {
      const scaled = v * (SCALE[m[4].toLowerCase()] ?? 1);
      out.push(m[2] ? -scaled : scaled);
    }
  }
  return out;
}

/** Is this value one of these, to the precision people write numbers in? Magnitude counts, not sign ("lost 300" is −300). */
function supported(v: number, pool: readonly number[]): boolean {
  const a = Math.abs(v);
  return pool.some((p) => Math.abs(Math.abs(p) - a) <= Math.max(1e-9, a * 1e-9));
}
/** A figure worth checking: anything but a small whole count ("2 options", "3 steps"). */
const notable = (v: number) => !Number.isInteger(v) || Math.abs(v) >= 10;

// ── checking a spec against what the turn knows ──────────────────────

export interface InlineContext {
  /** everything the person has written in this conversation */
  theirs: string;
  /** what was given this turn as evidence: document passages, pages read, results computed */
  sources: string;
  /** questions the reply may put to them this turn — choices are one */
  questions: number;
  /** the Answer Guard is up: nothing that works the problem for them */
  guard?: boolean;
  /** what they are writing is theirs to write: no draft of it */
  ownWriting?: boolean;
  /** the decision is theirs (Core 4's split): a comparison leans no way for them */
  ownJudgment?: boolean;
  /** working it out is theirs (Core 4's split): no reasoning laid out for them */
  ownReasoning?: boolean;
  /** blocks already shown in this reply, and how many of them are things to work with (mutated as the reply streams) */
  shown: { n: number; live?: number };
}

export type InlineVerdict = { ok: true; spec: InlineSpec } | { ok: false; why: string; notice?: string };

/** The line a reply carries in place of a chart that could not be shown honestly. */
export const UNSUPPORTED_CHART =
  '_A chart was left out: its numbers weren’t in anything you gave me or in a source I checked this turn._';

export function checkInlineSpec(spec: InlineSpec, ctx: InlineContext): InlineVerdict {
  if (ctx.shown.n >= L.perReply) return { ok: false, why: 'too-many' };
  // one thing to work with in a reply: a second graph, simulation, slider, decision or working is a dashboard
  if (LIVE_KINDS.includes(spec.type) && (ctx.shown.live ?? 0) >= 1) return { ok: false, why: 'one-at-a-time' };
  const theirs = numbersIn(ctx.theirs);
  const sources = numbersIn(ctx.sources);
  let out: InlineSpec = spec;
  if (spec.type === 'chart') {
    if (spec.basis !== 'illustrative') {
      const pool = spec.basis === 'given' ? theirs : [...theirs, ...sources];
      const all = spec.series.flatMap((s) => s.values);
      if (!all.every((v) => supported(v, pool))) return { ok: false, why: 'unsupported-figures', notice: UNSUPPORTED_CHART };
    }
  } else if (spec.type === 'compare') {
    const pool = [...theirs, ...sources];
    const { pick: _pick, ...unpicked } = spec;
    out = {
      ...(ctx.ownJudgment ? unpicked : spec),
      rows: spec.rows.map((row) => {
        const unchecked = row.values.map((cell, i) => (numbersIn(cell).some((n) => notable(n) && !supported(n, pool)) ? i : -1)).filter((i) => i >= 0);
        const { unchecked: _old, ...rest } = row;
        return unchecked.length ? { ...rest, unchecked } : rest;
      }),
    };
  } else if (spec.type === 'options') {
    if (ctx.questions <= 0) return { ok: false, why: 'no-questions' };
  } else if (spec.type === 'reasoning' || spec.type === 'slider') {
    if (ctx.guard) return { ok: false, why: 'guarded' };
    if (spec.type === 'reasoning' && ctx.ownReasoning) return { ok: false, why: 'their-reasoning' };
  } else if (spec.type === 'draft') {
    if (ctx.ownWriting) return { ok: false, why: 'their-writing' };
  } else if (spec.type === 'concepts' || spec.type === 'sequence') {
    // under the guard nothing is laid out to read instead of working it; steps that are theirs to find stay theirs
    if (ctx.guard) return { ok: false, why: 'guarded' };
    if (spec.type === 'sequence' && spec.kind === 'steps' && ctx.ownReasoning) return { ok: false, why: 'their-reasoning' };
  } else if (spec.type === 'steps') {
    // the working is the thing a guarded problem asks them to do
    if (ctx.guard) return { ok: false, why: 'guarded' };
    if (ctx.ownReasoning) return { ok: false, why: 'their-reasoning' };
  } else if (spec.type === 'graph') {
    // a graph is theirs to explore; under the guard nothing is marked on it that would be the answer:
    // no features, no readings, and the chord and tangent drawn without their slopes
    if (ctx.guard) {
      const { readouts: _r, ...rest } = spec;
      out = { ...rest, features: [], ...(spec.chord || spec.tangent ? { quiet: true as const } : {}) };
    }
  } else if (spec.type === 'sim') {
    // the same: the picture to try things in, without the readings that would answer it
    if (ctx.guard) {
      const { readouts: _r, ...rest } = spec;
      out = rest;
    }
  } else if (spec.type === 'check') {
    // a question to answer is a question: only where one may go. Their own work, so the guard allows it — with how it comes out held back
    if (ctx.questions <= 0) return { ok: false, why: 'no-questions' };
    if (ctx.guard && spec.explain) {
      const { explain: _e, ...rest } = spec;
      out = rest;
    }
  }
  ctx.shown.n++;
  if (LIVE_KINDS.includes(spec.type)) ctx.shown.live = (ctx.shown.live ?? 0) + 1;
  return { ok: true, spec: out };
}

/**
 * The stream gate's hook: a finished fenced block in, what the person sees out.
 * Anything that is not ```ui passes untouched; a ui block that is not a valid
 * spec, or is cut off, is dropped; one that fails its check becomes its notice
 * (or nothing); one that passes goes out in its canonical form.
 */
export function gateInlineBlock(chunk: string, ctx: InlineContext, open = false): string {
  const m = /^```[ \t]*([\w-]*)[ \t]*\n?([\s\S]*?)(?:```\s*)?$/.exec(chunk.trim());
  if (!m || m[1].toLowerCase() !== 'ui') return chunk;
  if (open) return '';
  const spec = parseInlineSpec(m[2]);
  if (!spec) return '';
  const v = checkInlineSpec(spec, ctx);
  if (!v.ok) return v.notice ? `${v.notice}\n\n` : '';
  return `${fenceOf(v.spec)}\n\n`;
}

// ── as words, where a picture cannot go ──────────────────────────────

/** A claim's verdict and a part's standing, as words: what is copied and read back, and what a screen reader hears. */
export const CLAIM_SAID: Record<ClaimVerdict, string> = { holds: 'holds', fails: 'does not hold', partly: 'partly holds', unsettled: 'not settled' };
export const HOLDS_SAID: Record<ClaimHolds, string> = { yes: 'Holds', no: 'Does not hold', partly: 'Partly', unclear: 'Unclear' };

const num = (v: number) => (Number.isInteger(v) ? v.toLocaleString('en-US') : String(r6(v)));

/** A spec in plain words: what is copied, what the model reads back, what memory sees. */
export function inlinePlainText(spec: InlineSpec): string {
  switch (spec.type) {
    case 'chart': {
      const head = spec.title ? `${spec.title}: ` : '';
      const one = spec.series.length === 1;
      const pts = spec.x.map((x, i) => `${x} ${spec.series.map((s) => (one ? '' : `${s.name ?? ''} `) + num(s.values[i])).join(', ')}`);
      return `${head}${pts.join('; ')}${spec.unit ? ` (${spec.unit})` : ''}${spec.basis === 'illustrative' ? ' — example numbers' : ''}`;
    }
    case 'slider':
      return `${spec.title ? `${spec.title}: ` : ''}${spec.result.label} = ${spec.formula}, with ${spec.vars.map((v) => `${v.label} ${num(v.value)}${v.unit ? ` ${v.unit}` : ''}`).join(', ')}`;
    case 'compare':
      return [
        spec.title ?? `${spec.options.join(' vs ')}`,
        ...spec.rows.map((r) => `${r.label}: ${r.values.map((v, i) => `${spec.options[i]} ${v}`).join('; ')}`),
      ].join('\n');
    case 'reasoning':
      return [spec.summary, ...spec.steps.map((s, i) => `${i + 1}. ${s}`)].join('\n');
    case 'options':
      return `${spec.prompt ? `${spec.prompt} ` : ''}${spec.options.map((o) => o.label).join(' / ')}`;
    case 'draft':
      return spec.text;
    case 'concepts':
      return [spec.title ?? '', ...spec.items.map((x) => `${x.name}: ${x.gist}${x.detail ? ` ${x.detail}` : ''}${x.links ? ` (connects to ${x.links.join(', ')})` : ''}`)].filter(Boolean).join('\n');
    case 'sequence':
      return [spec.title ?? '', ...spec.items.map((x, i) => `${spec.kind === 'timeline' ? x.when : i + 1}${spec.kind === 'timeline' ? ':' : '.'} ${x.label}${x.detail ? ` — ${x.detail}` : ''}`)].filter(Boolean).join('\n');
    case 'paths':
      return [spec.title ?? 'Where it could go next', ...spec.items.map((x) => `- ${x.label}${x.gist ? ` — ${x.gist}` : ''}`)].join('\n');
    case 'decide':
      return [
        spec.title ?? `Deciding: ${spec.options.join(' or ')}`,
        ...spec.rows.map((r, ri) => `${r.label}${spec.weights ? ` (matters ${spec.weights[ri] ?? 2}/3)` : ''}: ${r.scores.map((v, i) => `${spec.options[i]} ${v}/3`).join(', ')}${r.note ? ` — ${r.note}` : ''}`),
      ].join('\n');
    case 'graph': {
      const vals = valuesOf(spec.params);
      const curves = spec.curves?.length ? `${spec.label ? `${spec.label}: ` : ''}y = ${exprWithValues(spec.expr, vals)}; ${spec.curves.map((c) => `${c.label ? `${c.label}: ` : ''}y = ${exprWithValues(c.expr, vals)}`).join('; ')}` : `y = ${exprWithValues(spec.expr, vals)}`;
      const marks = [spec.chord ? `the chord from x = ${spec.chord[0]} to x = ${spec.chord[1]} and its slope` : '', spec.tangent ? `the tangent at x = ${spec.tangent} and its slope` : '', spec.features.includes('mean-value') ? 'where a tangent runs parallel to the chord' : '', spec.features.includes('crossings') ? 'where the curves cross' : '', ...(spec.readouts ?? []).map((ro) => `${ro.label} = ${ro.expr}`)].filter(Boolean);
      return `${spec.title ? `${spec.title}: ` : ''}${curves}${spec.params.length ? ` (${spec.params.map((p) => `${p.label} = ${num(p.value)}`).join(', ')})` : ''}, x from ${num(spec.x[0])} to ${num(spec.x[1])}${marks.length ? `; showing ${marks.join(', ')}` : ''}${spec.predict ? `\n${spec.predict.prompt} ${spec.predict.options.join(' / ')}` : ''}`;
    }
    case 'sim':
      return `${spec.title ? `${spec.title}: ` : 'A simulation: '}x(t) = ${spec.x}, y(t) = ${spec.y}; ${spec.params.map((p) => `${p.label} ${num(p.value)}${p.unit ?? ''}`).join(', ')}${spec.predict ? `\n${spec.predict.prompt} ${spec.predict.options.join(' / ')}` : ''}`;
    case 'check':
      // the question, never its answer: this is what is copied, and what a reader would see
      return spec.prompt;
    case 'claim':
      return [`The claim: “${spec.claim}” — ${CLAIM_SAID[spec.verdict]}`, ...spec.parts.map((x) => `- ${HOLDS_SAID[x.holds]}: ${x.text}${x.basis ? ` (${x.basis})` : ''}`)].join('\n');
    case 'steps':
      return [spec.title ?? '', ...spec.lines.map((l, i) => `${i + 1}. ${l.tex}${l.why ? ` — ${l.why}` : ''}`), spec.check ? `Your turn: ${spec.check.prompt}` : ''].filter(Boolean).join('\n');
  }
}

const UI_FENCE = /```[ \t]*ui[ \t]*\n([\s\S]*?)```/gi;

/** A reply's inline blocks in order, numbered as the renderer numbers them (every ```ui block counts, drawn or not). */
export function specsIn(content: string): (InlineSpec | null)[] {
  if (!content.includes('```')) return [];
  return [...content.matchAll(UI_FENCE)].map((m) => parseInlineSpec(m[1]));
}

/** A reply with each inline block written out in words — for copying, and for anything that reads text. */
export function contentAsText(content: string): string {
  return content.replace(UI_FENCE, (_m, body: string) => {
    const spec = parseInlineSpec(body);
    return spec ? inlinePlainText(spec) : '';
  }).replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * A reply as the math engine checks it (lib/accuracy checkDraft): each block
 * as the words it stands for, so a reasoning step's arithmetic is checked like
 * any sentence — except a slider's, whose formula is what its result is
 * computed from, live, and not a value it claims.
 */
export function contentForCheck(content: string): string {
  if (!content.includes('```')) return content;
  return content.replace(UI_FENCE, (_m, body: string) => {
    const spec = parseInlineSpec(body);
    return spec && !['slider', 'graph', 'sim', 'check'].includes(spec.type) ? `\n${inlinePlainText(spec)}\n` : '';
  });
}

/**
 * A reply as the model reads it back on a later turn: each block a short line
 * saying what was shown — and, when the person did something with it, how it
 * stands now (inlineNow): a slider where they left it, a graph as they changed
 * it, an answer they checked. Cheaper than the JSON, and it keeps the model
 * from re-emitting a stale chart because it saw one in the transcript.
 */
export function contentForHistory(content: string, ui?: Record<string, InlineState>): string {
  if (!content.includes('```')) return content;
  let n = 0;
  return content.replace(UI_FENCE, (_m, body: string) => {
    const spec = parseInlineSpec(body);
    const at = n++;
    if (!spec) return '';
    const was = `[shown inline — ${spec.type}: ${historyText(spec).replace(/\s+/g, ' ').slice(0, 240)}`;
    const now = ui?.[String(at)] ? inlineNow(spec, ui[String(at)]) : null;
    return now ? `${was} — now: ${now.slice(0, 280)}]` : `${was}]`;
  });
}

/** What the model reads of a block: its plain words, with a question's answer (the person's copy never shows it). */
function historyText(spec: InlineSpec): string {
  if (spec.type === 'check') return `${spec.prompt} (answer: ${spec.answer} = ${fmtVal(answerOf(spec.answer) ?? NaN, 4)})`;
  if (spec.type === 'steps' && spec.check) return `${inlinePlainText(spec)} (answer: ${spec.check.answer} = ${fmtVal(answerOf(spec.check.answer) ?? NaN, 4)})`;
  return inlinePlainText(spec);
}

// ── what the person did with it, kept with the message ───────────────

export interface InlineState {
  /** a slider's current values, by variable */
  values?: Record<string, number>;
  /** the choice they tapped */
  chosen?: number;
  /** a draft as they edited it */
  text?: string;
  /** reasoning unfolded */
  open?: boolean;
  /** the part of an overview, or the step, they opened */
  picked?: number;
  /** the steps they ticked off */
  done?: number[];
  /** the artifact it was opened as, in this line of thinking's workspace — pressed again, that opens */
  artifact?: string;
  /** a decision's weights as they set them, one per thing it rests on (0–3) */
  weights?: number[];
  /** a decision's readings as they changed them: [row][option], 0–3 */
  scores?: number[][];
  /** what they predicted before moving anything (a graph's or a simulation's question), or that they skipped it */
  predicted?: number;
  skipped?: boolean;
  /** the settings of a simulation they tried, oldest first (the last few) */
  tries?: Record<string, number>[];
  /** a question's answer as they typed it, whether it was right, and how many times they checked */
  answer?: string;
  right?: boolean;
  attempts?: number;
  /** the lines of the working whose why they opened */
  whys?: number[];
  /** the parts of a claim they said they doubt */
  doubted?: number[];
}

/** One block's state, cleaned; null when nothing usable is left. */
export function sanitizeInlineStateOne(raw: unknown): InlineState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const out: InlineState = {};
  if (r.values && typeof r.values === 'object') {
    const values: Record<string, number> = {};
    for (const [k, v] of Object.entries(r.values as Record<string, unknown>).slice(0, L.vars)) if (NAME.test(k) && fin(v)) values[k.toLowerCase()] = r6(v);
    if (Object.keys(values).length) out.values = values;
  }
  if (Number.isInteger(r.chosen) && (r.chosen as number) >= 0 && (r.chosen as number) < L.choices) out.chosen = r.chosen as number;
  if (typeof r.text === 'string') {
    const t = prose(r.text, L.draft);
    if (t) out.text = t;
  }
  if (r.open === true) out.open = true;
  if (Number.isInteger(r.picked) && (r.picked as number) >= 0 && (r.picked as number) < Math.max(L.concepts, L.sequence)) out.picked = r.picked as number;
  if (Array.isArray(r.done)) {
    const done = [...new Set(r.done.filter((i): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < L.sequence))].sort((a, b) => a - b);
    if (done.length) out.done = done;
  }
  // an object id as lib/objects/core.ts keeps them
  if (typeof r.artifact === 'string' && /^[A-Za-z0-9_]{1,16}$/.test(r.artifact)) out.artifact = r.artifact;
  if (Array.isArray(r.weights)) {
    const weights = r.weights.slice(0, L.decideRows).map(score);
    if (weights.length && weights.every((v) => v !== null)) out.weights = weights as number[];
  }
  if (Array.isArray(r.scores)) {
    const rows = r.scores.slice(0, L.decideRows).map((row) => (Array.isArray(row) ? row.slice(0, L.decideOptions).map(score) : []));
    if (rows.length && rows.every((row) => row.length >= 2 && row.every((v) => v !== null))) out.scores = rows as number[][];
  }
  if (Number.isInteger(r.predicted) && (r.predicted as number) >= 0 && (r.predicted as number) < L.predictOptions) out.predicted = r.predicted as number;
  if (r.skipped === true) out.skipped = true;
  if (Array.isArray(r.tries)) {
    const tries = r.tries
      .slice(-4)
      .map((t) => (t && typeof t === 'object' ? Object.fromEntries(Object.entries(t as Record<string, unknown>).slice(0, L.params).filter(([k, v]) => NAME.test(k) && fin(v)).map(([k, v]) => [k.toLowerCase(), r6(v as number)])) : {}))
      .filter((t) => Object.keys(t).length);
    if (tries.length) out.tries = tries;
  }
  if (typeof r.answer === 'string') {
    const a = line(r.answer, 60);
    if (a) out.answer = a;
  }
  if (typeof r.right === 'boolean') out.right = r.right;
  if (Number.isInteger(r.attempts) && (r.attempts as number) > 0) out.attempts = Math.min(99, r.attempts as number);
  if (Array.isArray(r.whys)) {
    const whys = [...new Set(r.whys.filter((i): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < L.lines))].sort((a, b) => a - b);
    if (whys.length) out.whys = whys;
  }
  if (Array.isArray(r.doubted)) {
    const doubted = [...new Set(r.doubted.filter((i): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < L.claimParts))].sort((a, b) => a - b);
    if (doubted.length) out.doubted = doubted;
  }
  return Object.keys(out).length ? out : null;
}

/** A message's inline states, keyed by the block's position in it ("0", "1"). */
export function sanitizeInlineState(raw: unknown): Record<string, InlineState> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, InlineState> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 4)) {
    if (!/^[0-9]$/.test(k)) continue;
    const s = sanitizeInlineStateOne(v);
    if (s) out[k] = s;
  }
  return Object.keys(out).length ? out : undefined;
}


// ── going deeper, and a decision weighed ─────────────────────────────

/**
 * What opening a way deeper says, as their next message: plain words in their
 * voice, which the planner reads as a request to go deeper on that thread
 * (lib/runtime/presentation.ts) — the conversation comes with it.
 */
export const pathAsk = (item: { label: string }): string => `Go deeper: ${item.label}`;

/** How much a thing matters (0–3), and a reading of an option on it (0–3), in words. */
export const WEIGHT_SAID = ['doesn’t count', 'matters a little', 'matters', 'matters most'] as const;
export const SCORE_SAID = ['poor', 'weak', 'good', 'strong'] as const;

/** The arithmetic of a decision as they have weighed it: totals, who leads, and what puts them there. Pure. */
export function decideTally(spec: DecideSpec, state?: InlineState) {
  const weights = spec.rows.map((_r, ri) => state?.weights?.[ri] ?? 2);
  const scores = spec.rows.map((r, ri) => r.scores.map((v, oi) => state?.scores?.[ri]?.[oi] ?? v));
  const totals = spec.options.map((_o, oi) => spec.rows.reduce((t, _r, ri) => t + weights[ri] * scores[ri][oi], 0));
  const most = spec.rows.reduce((t, _r, ri) => t + weights[ri] * 3, 0);
  const top = Math.max(...totals);
  const leaders = totals.map((t, i) => (t === top ? i : -1)).filter((i) => i >= 0);
  let driver: number | null = null;
  if (most > 0 && leaders.length === 1) {
    const lead = leaders[0];
    const next = totals.map((t, i) => (i === lead ? -1 : t)).reduce((b, t, i, a) => (t > a[b] ? i : b), lead === 0 ? 1 : 0);
    let best = 0;
    spec.rows.forEach((_r, ri) => {
      const pull = weights[ri] * (scores[ri][lead] - scores[ri][next]);
      if (pull > best) {
        best = pull;
        driver = ri;
      }
    });
  }
  return { weights, scores, totals, most, leaders, driver: driver as number | null, weighed: !!state?.weights };
}

/** The leaning, said: arithmetic on their weights, never a verdict. */
export function decideLeaning(spec: DecideSpec, t: ReturnType<typeof decideTally>): string {
  if (t.most === 0) return 'Give at least one thing some weight to see where it leans.';
  const how = t.weighed ? 'With your weights' : 'Weighted evenly';
  if (t.leaders.length > 1) return `${how}, it’s even between ${t.leaders.map((i) => spec.options[i]).join(' and ')}.`;
  const lead = spec.options[t.leaders[0]];
  const why = t.driver !== null ? ` — mostly on ${spec.rows[t.driver].label.charAt(0).toLowerCase()}${spec.rows[t.driver].label.slice(1)}` : '';
  return `${how}, ${lead} comes out ahead${why}.${t.weighed ? '' : ' Say what matters more and it may change.'}`;
}

// ── into the Artifacts view ──────────────────────────────────────────

export type InlineArtifact = { kind: 'data'; state: Record<string, unknown> } | { kind: 'compare'; state: Record<string, unknown> };

/**
 * A spec as a full artifact for the Artifacts view — a chart as a data display,
 * a comparison as a comparison — built from exactly what was shown, nothing
 * added. A comparison's cells become the notes behind each pair, with no score:
 * a score nobody gave stays empty (lib/objects/display-compare.ts). Null for the
 * kinds that have no larger form there: a slider is already the calculator
 * (Artifacts has no view of a lone function with its parameters), and
 * reasoning, choices, a draft, an overview, a sequence and the ways deeper
 * belong to the reply they are in (an overview's larger form is the Logic Map,
 * asked for in words). A decision weighed opens as a comparison with its
 * scores and THEIR weights — on the comparison's 0–10 scale, each marked as
 * whose it is — so the ranking and the sensitivity view can take it further.
 */
export function artifactFromSpec(spec: InlineSpec): InlineArtifact | null {
  if (spec.type === 'chart') {
    const cols = [{ id: 'c1', name: 'Item', type: 'category' }, ...spec.series.map((s, i) => ({ id: `c${i + 2}`, name: s.name || spec.unit || 'Value', type: 'number', ...(spec.unit ? { unit: spec.unit } : {}) }))];
    const rows = spec.x.map((label, r) => [label, ...spec.series.map((s) => s.values[r])]);
    return {
      kind: 'data',
      state: { title: spec.title ?? 'Chart', columns: cols, rows, x: 'c1', y: spec.series.map((_s, i) => `c${i + 2}`), view: spec.kind, basis: spec.basis },
    };
  }
  if (spec.type === 'compare') {
    const options = spec.options.map((name, i) => ({ id: `o${i + 1}`, name }));
    const criteria = spec.rows.map((r, i) => ({ id: `c${i + 1}`, name: r.label }));
    const scores = spec.rows.flatMap((r, ci) => r.values.map((note, oi) => ({ option: `o${oi + 1}`, criterion: `c${ci + 1}`, value: null, note })).filter((s) => s.note));
    return { kind: 'compare', state: { title: spec.title ?? 'Comparison', options, criteria, scores, view: 'matrix' } };
  }
  if (spec.type === 'decide') {
    // 0–3 onto the comparison's 0–10: 0, 3, 7, 10
    const ten = (v: number) => Math.round((v * 10) / 3);
    const options = spec.options.map((name, i) => ({ id: `o${i + 1}`, name }));
    const criteria = spec.rows.map((r, i) => ({ id: `c${i + 1}`, name: r.label, weight: ten(spec.weights?.[i] ?? 2), by: spec.weights ? 'person' : 'socria' }));
    const scores = spec.rows.flatMap((r, ci) => r.scores.map((v, oi) => ({ option: `o${oi + 1}`, criterion: `c${ci + 1}`, value: ten(v), by: r.theirs?.includes(oi) ? 'person' : 'socria' })));
    return { kind: 'compare', state: { title: spec.title ?? 'Decision', options, criteria, scores, view: 'ranking' } };
  }
  return null;
}


// ── what they did with it, said to Socria ────────────────────────────

/** What an element is called when what was done with it is said: "the graph", "the question". */
export function inlineFrom(spec: InlineSpec): string {
  switch (spec.type) {
    case 'graph':
      return 'the graph';
    case 'sim':
      return 'the simulation';
    case 'slider':
      return spec.title ? `“${spec.title}”` : 'the slider';
    case 'check':
      return 'the question';
    case 'steps':
      return 'the working';
    case 'decide':
      return 'the decision';
    case 'draft':
      return 'the draft';
    case 'sequence':
      return spec.kind === 'timeline' ? 'the timeline' : 'the steps';
    case 'concepts':
      return 'the overview';
    case 'claim':
      return 'the claim';
    default:
      return 'the element';
  }
}

const unitAfter = (v: number, unit?: string) => (unit ? (/^(?:%|°|‰)$/.test(unit) ? `${fmtVal(v)}${unit}` : /^[$£€¥₹]$/.test(unit) ? `${unit}${fmtVal(v)}` : `${fmtVal(v)} ${unit}`) : fmtVal(v));
/** The parameters they moved, from where they started: "b 2 → 4". */
function moved(params: readonly ParamSpec[], values?: Record<string, number>): string[] {
  if (!values) return [];
  return params.filter((p) => values[p.name] !== undefined && values[p.name] !== p.value).map((p) => `${p.label} ${unitAfter(p.value, p.unit)} → ${unitAfter(values[p.name], p.unit)}`);
}
function turningOf(spec: GraphSpec, values: Record<string, number>): Feature | null {
  const c = compileOver(spec.expr, spec.params.map((p) => p.name));
  return c ? curveFeatures(c, values, spec.x[0], spec.x[1], ['turning'])[0] ?? null : null;
}

/** What a graph shows at a setting, beyond its shape: the chord and where a tangent matches it, a tangent, where its curves meet, its readings. */
export interface GraphReadings {
  chord?: { a: number; b: number; ya: number; yb: number; slope: number };
  mean?: import('./inline-math').MeanValue;
  tangent?: { x: number; y: number; slope: number | null };
  crossings: Feature[];
  readouts: { label: string; value: number; unit?: string; digits?: number }[];
}
/** All of it computed on the curve as it is at these values (lib/inline-math.ts) — the same numbers the page draws and Socria is told. */
export function graphReadings(spec: GraphSpec, values: Record<string, number>): GraphReadings {
  const names = spec.params.map((p) => p.name);
  const c = compileOver(spec.expr, names);
  const out: GraphReadings = { crossings: [], readouts: [] };
  if (!c) return out;
  const span = spec.x[1] - spec.x[0];
  const f = (x: number) => c.eval({ ...values, x });
  if (spec.chord) {
    const a = values[spec.chord[0]], b = values[spec.chord[1]];
    const ya = f(a), yb = f(b);
    if (Number.isFinite(a) && Number.isFinite(b) && a !== b && Number.isFinite(ya) && Number.isFinite(yb)) {
      out.chord = { a, b, ya, yb, slope: (yb - ya) / (b - a) };
      if (spec.features.includes('mean-value')) out.mean = meanValue(c, values, a, b) ?? undefined;
    }
  }
  if (spec.tangent) {
    const x = values[spec.tangent];
    const y = f(x);
    if (Number.isFinite(x) && Number.isFinite(y)) out.tangent = { x, y, slope: slopeAt(c, values, x, span) };
  }
  if (spec.features.includes('crossings')) {
    for (const g of spec.curves ?? []) {
      const cg = compileOver(g.expr, names);
      if (cg) out.crossings.push(...crossingsOf(c, cg, values, spec.x[0], spec.x[1]));
    }
  }
  for (const ro of spec.readouts ?? []) {
    const cr = compileExpr(ro.expr, names);
    const v = cr ? cr.eval(values) : NaN;
    if (Number.isFinite(v)) out.readouts.push({ label: ro.label, value: v, ...(ro.unit ? { unit: ro.unit } : {}), ...(ro.digits !== undefined ? { digits: ro.digits } : {}) });
  }
  return out;
}
const fmtAt = (v: number) => fmtVal(v, Math.abs(v) >= 100 ? 0 : 2);
/** Where a tangent matches the chord, or why none does — said the way the page says it. */
export function meanSaid(m: import('./inline-math').MeanValue): string {
  if (m.fails === 'break') return 'the curve breaks between the ends, so no point is promised';
  if (m.fails === 'corner') return 'no tangent between the ends matches it — the curve turns a corner, where it has no single slope';
  if (m.everywhere) return 'every point between the ends matches it — the curve is straight there';
  if (!m.at.length) return 'no tangent between the ends matches it';
  return `the tangent matches that slope at x = ${m.at.map(fmtAt).join(' and x = ')}`;
}
/** A graph's readings, said — the numbers left out under the Answer Guard (quiet). */
function readingsSaid(spec: GraphSpec, start: Record<string, number>, now: Record<string, number>): string[] {
  const was = graphReadings(spec, start);
  const r = graphReadings(spec, now);
  const out: string[] = [];
  if (r.chord) out.push(spec.quiet ? `the chord runs from x = ${fmtAt(r.chord.a)} to x = ${fmtAt(r.chord.b)}` : `the chord from x = ${fmtAt(r.chord.a)} to x = ${fmtAt(r.chord.b)} has slope ${fmtAt(r.chord.slope)} (the average rate${was.chord && was.chord.slope !== r.chord.slope ? `; it was ${fmtAt(was.chord.slope)}` : ''})`);
  if (r.mean && !spec.quiet) out.push(meanSaid(r.mean));
  if (r.tangent) out.push(spec.quiet || r.tangent.slope === null ? (r.tangent.slope === null ? `at x = ${fmtAt(r.tangent.x)} the curve has no single slope (a corner)` : `the tangent is at x = ${fmtAt(r.tangent.x)}`) : `the tangent at x = ${fmtAt(r.tangent.x)} has slope ${fmtAt(r.tangent.slope)}`);
  if (r.crossings.length && !spec.quiet) {
    const pts = r.crossings.map(fmtPoint).join(' and ');
    const before = was.crossings.map(fmtPoint).join(' and ');
    out.push(`the curves cross at ${pts}${before && before !== pts ? ` (they crossed at ${before})` : ''}`);
  }
  if (!spec.quiet) for (const ro of r.readouts) out.push(`${ro.label} is ${fmtVal(ro.value, ro.digits)}${ro.unit ? ` ${ro.unit}` : ''}`);
  return out;
}
/** A simulation's readings at a setting: "range 8.8 m". */
function readingsAt(spec: SimSpec, values: Record<string, number>): string {
  const names = spec.params.map((p) => p.name);
  return (spec.readouts ?? [])
    .slice(0, 2)
    .map((ro) => {
      const c = compileExpr(ro.expr, names);
      const v = c ? c.eval(values) : NaN;
      return Number.isFinite(v) ? `${ro.label} ${unitAfter(Number(v.toFixed(ro.digits ?? 2)), ro.unit)}` : '';
    })
    .filter(Boolean)
    .join(', ');
}
/** A setting as it is said: the numbers that were changed ("angle 30°"), not the ones left as they were. */
const settingOf = (spec: SimSpec, t: Record<string, number>, only?: readonly ParamSpec[]) =>
  (only?.length ? only : spec.params).filter((p) => t[p.name] !== undefined).map((p) => `${p.label} ${unitAfter(t[p.name], p.unit)}`).join(', ');
/** The parameters someone actually moved across their tries; the first when none were. */
const varied = (spec: SimSpec, tries: readonly Record<string, number>[]) => {
  const v = spec.params.filter((p) => tries.some((t) => t[p.name] !== undefined && t[p.name] !== p.value));
  return v.length ? v : spec.params.slice(0, 1);
};

/**
 * WHAT THEY DID with an element, in a line, from where it started to how it
 * stands — what goes to Socria with their next message, and what the box shows
 * them first. Null when there is nothing worth saying (nothing moved, a fold
 * opened, a choice that is already their message).
 */
export function describeInline(spec: InlineSpec, state?: InlineState): string | null {
  if (!state) return null;
  const parts: string[] = [];
  const predicted = (p?: PredictSpec) => (p && state.predicted !== undefined && p.options[state.predicted] ? `predicted “${p.options[state.predicted]}” (asked: ${p.prompt})` : null);
  switch (spec.type) {
    case 'slider': {
      const changed = spec.vars.filter((v) => state.values?.[v.name] !== undefined && state.values[v.name] !== v.value);
      if (!changed.length) return null;
      const c = compileExpr(spec.formula, spec.vars.map((v) => v.name));
      const at = Object.fromEntries(spec.vars.map((v) => [v.name, state.values?.[v.name] ?? v.value]));
      const res = c ? c.eval(at) : NaN;
      parts.push(changed.map((v) => `set ${v.label} from ${unitAfter(v.value, v.unit)} to ${unitAfter(state.values![v.name], v.unit)}`).join(', '));
      if (Number.isFinite(res)) parts.push(`${spec.result.label} is now ${unitAfter(Number(res.toFixed(spec.result.digits ?? 2)), spec.result.unit)}`);
      break;
    }
    case 'graph': {
      const p = predicted(spec.predict);
      if (p) parts.push(p);
      const m = moved(spec.params, state.values);
      if (m.length) {
        parts.push(`changed ${m.join(', ')}`);
        const start = valuesOf(spec.params);
        const now = { ...start, ...state.values };
        // a point moved along the curve changes no curve: only the parameters in an equation reshape it
        const reshaped = spec.params.some((q) => !(spec.at ?? []).includes(q.name) && now[q.name] !== start[q.name]);
        if (reshaped) {
          parts.push(spec.curves?.length ? `the curves are now ${[spec.expr, ...spec.curves.map((c) => c.expr)].map((e, i) => `${(i === 0 ? spec.label : spec.curves![i - 1].label) ?? ''}${(i === 0 ? spec.label : spec.curves![i - 1].label) ? ' ' : ''}y = ${exprWithValues(e, now)}`).join(', ')}` : `the curve is now y = ${exprWithValues(spec.expr, now)}`);
          if (spec.features.includes('turning')) {
            const before = turningOf(spec, start);
            const after = turningOf(spec, now);
            if (before && after && (before.x !== after.x || before.y !== after.y)) parts.push(`its turning point moved from ${fmtPoint(before)} to ${fmtPoint(after)}`);
            else if (after) parts.push(`turning point ${fmtPoint(after)}`);
          }
        }
        parts.push(...readingsSaid(spec, start, now));
      }
      break;
    }
    case 'claim':
      if (state.doubted?.length) {
        const doubted = state.doubted.map((i) => spec.parts[i]).filter(Boolean);
        if (doubted.length) parts.push(`doubted ${doubted.map((x) => `“${x.text}” (marked ${HOLDS_SAID[x.holds].toLowerCase()})`).join(' and ')} — on the claim “${spec.claim}”`);
      }
      break;
    case 'sim': {
      const p = predicted(spec.predict);
      if (p) parts.push(p);
      // every setting they left long enough to look at — the starting one included, when they came back to it
      const tries = (state.tries ?? []).filter((t) => Object.keys(t).length > 0);
      const moving = varied(spec, tries);
      if (tries.length) parts.push(`tried ${tries.map((t) => { const r = readingsAt(spec, { ...valuesOf(spec.params), ...t }); return `${settingOf(spec, t, moving)}${r ? ` (${r})` : ''}`; }).join('; ')}`);
      const m = moved(spec.params, state.values);
      if (m.length && !tries.length) parts.push(`changed ${m.join(', ')}`);
      break;
    }
    case 'check':
    case 'steps': {
      const q = spec.type === 'check' ? spec : spec.check;
      if (!q || !state.answer) return null;
      parts.push(`answered ${state.answer}${q.label ? ` for ${q.label}` : ''} to “${q.prompt}” — ${state.right ? 'right' : 'not right'}${state.attempts && state.attempts > 1 ? ` (after ${state.attempts} tries)` : ''}`);
      break;
    }
    case 'decide': {
      const t = decideTally(spec, state);
      if (state.weights) parts.push(`weighed it: ${spec.rows.map((r, i) => `${r.label} ${WEIGHT_SAID[t.weights[i]]}`).join('; ')}`);
      const changes = state.scores ? spec.rows.flatMap((r, ri) => r.scores.map((v, oi) => (state.scores![ri]?.[oi] !== undefined && state.scores![ri][oi] !== v ? `${spec.options[oi]} on ${r.label} to ${SCORE_SAID[state.scores![ri][oi]]}` : null)).filter(Boolean)) : [];
      if (changes.length) parts.push(`changed ${changes.slice(0, 3).join(', ')}`);
      if (parts.length) parts.push(decideLeaning(spec, t));
      break;
    }
    case 'draft':
      if (state.text && state.text !== spec.text) parts.push(`edited the draft to: “${state.text.replace(/\s+/g, ' ').slice(0, 200)}${state.text.length > 200 ? '…' : ''}”`);
      break;
    case 'sequence':
      if (state.done?.length && spec.kind === 'steps') parts.push(`ticked off ${state.done.length} of ${spec.items.length} steps`);
      break;
    case 'concepts':
      if (state.picked !== undefined && spec.items[state.picked]) parts.push(`opened “${spec.items[state.picked].name}”`);
      break;
    default:
      return null;
  }
  return parts.length ? parts.join('; ') : null;
}

/**
 * How an element stands now, for the history Socria reads back: what the
 * person left it at — not where it started. Null when nothing was done with it.
 */
export function inlineNow(spec: InlineSpec, state: InlineState): string | null {
  if (spec.type === 'sim' && state.values) {
    const now = { ...valuesOf(spec.params), ...state.values };
    const d = describeInline(spec, state);
    const r = readingsAt(spec, now);
    return `${d ? `${d}; ` : ''}set to ${settingOf(spec, now)}${r ? ` (${r})` : ''}`;
  }
  return describeInline(spec, state);
}

/** One thing they did, as it travels with their message: which element, and what. */
export interface DidItem {
  from: string;
  said: string;
}

/** What they did, as it came from a browser: shaped, clipped, four at most — display and context, trusted for nothing else. */
export function sanitizeDid(raw: unknown): DidItem[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: DidItem[] = [];
  for (const v of raw.slice(0, 12)) {
    const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
    const from = line(o?.from, 48);
    const said = line(o?.said, 400);
    if (from && said) out.push({ from, said });
    if (out.length === 4) break;
  }
  return out.length ? out : undefined;
}

/**
 * What they did, as the model reads it with their message: one bracketed line,
 * so it can never read as their words — said after they did it, before what
 * they wrote, and what the reply should take into account.
 */
export function didLine(did: readonly DidItem[]): string {
  return `[What they did with the elements in your replies before writing this — ${did.map((d) => `${d.from}: ${d.said}`).join(' · ')}. Take it into account.]`;
}
