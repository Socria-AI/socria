// lib/inline-ui.ts — ADAPTIVE RESPONSE RENDERING: what may be drawn inside a reply.
//
// Most replies are prose and stay prose. Now and then a small, interactive
// thing says it better than a paragraph: a little chart of the numbers they
// gave, a slider over a formula, two options side by side, the reasoning folded
// under its conclusion, a few choices to tap, a draft they can edit in place,
// the parts of a subject to explore one at a time, steps or events in order.
// Those are drawn INSIDE the conversation, from a structured description the
// reply writes in a fenced block:
//
//   ```ui
//   {"type":"compare","options":["Rent","Buy"],"rows":[{"label":"Monthly","values":["$1,900","$2,350"]}]}
//   ```
//
// A DESCRIPTION, NEVER CODE. Eight kinds, each with a fixed shape and limits;
// anything else is not drawn. Every string is cleaned and capped, every number
// is finite, a formula is compiled by the same safe parser the math engine
// uses (lib/logos-math.ts compileExpr — no eval), and nothing in a spec can run.
// The renderer (components/inline/InlineUI.tsx) knows these eight and no others.
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
//     out is theirs.
//
// PURE: the route, the parser (lib/rich-text.ts), the renderer and the tests
// share it.

import { compileExpr, freeNames } from './logos-math';

export const INLINE_KINDS = ['chart', 'slider', 'compare', 'reasoning', 'options', 'draft', 'concepts', 'sequence'] as const;
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
export type InlineSpec = ChartSpec | SliderSpec | CompareSpec | ReasoningSpec | OptionsSpec | DraftSpec | ConceptsSpec | SequenceSpec;

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
  /** inline blocks in one reply: more than two is a dashboard */
  perReply: 2,
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

/** Anything at all in, one of the eight canonical shapes out — or null, and nothing is drawn. */
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
  /** blocks already shown in this reply (mutated as the reply streams) */
  shown: { n: number };
}

export type InlineVerdict = { ok: true; spec: InlineSpec } | { ok: false; why: string; notice?: string };

/** The line a reply carries in place of a chart that could not be shown honestly. */
export const UNSUPPORTED_CHART =
  '_A chart was left out: its numbers weren’t in anything you gave me or in a source I checked this turn._';

export function checkInlineSpec(spec: InlineSpec, ctx: InlineContext): InlineVerdict {
  if (ctx.shown.n >= L.perReply) return { ok: false, why: 'too-many' };
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
  }
  ctx.shown.n++;
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
  }
}

const UI_FENCE = /```[ \t]*ui[ \t]*\n([\s\S]*?)```/gi;

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
    return spec && spec.type !== 'slider' ? `\n${inlinePlainText(spec)}\n` : '';
  });
}

/**
 * A reply as the model reads it back on a later turn: each block a short line
 * saying what was shown. Cheaper than the JSON, and it keeps the model from
 * re-emitting a stale chart because it saw one in the transcript.
 */
export function contentForHistory(content: string): string {
  if (!content.includes('```')) return content;
  return content.replace(UI_FENCE, (_m, body: string) => {
    const spec = parseInlineSpec(body);
    return spec ? `[shown inline — ${spec.type}: ${inlinePlainText(spec).replace(/\s+/g, ' ').slice(0, 240)}]` : '';
  });
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

// ── into the Artifacts view ──────────────────────────────────────────

export type InlineArtifact = { kind: 'data'; state: Record<string, unknown> } | { kind: 'compare'; state: Record<string, unknown> };

/**
 * A spec as a full artifact for the Artifacts view — a chart as a data display,
 * a comparison as a comparison — built from exactly what was shown, nothing
 * added. A comparison's cells become the notes behind each pair, with no score:
 * a score nobody gave stays empty (lib/objects/display-compare.ts). Null for the
 * kinds that have no larger form there: a slider is already the calculator
 * (Artifacts has no view of a lone function with its parameters), and
 * reasoning, choices, a draft, an overview and a sequence belong to the reply
 * they are in (an overview's larger form is the Logic Map, asked for in words).
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
  return null;
}
