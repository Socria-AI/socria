// lib/new-logos/represent-model.ts — READING WHAT THE ASSISTANT SENDS BACK.
//
// The assistant answers a turn with one JSON object: how it read the turn, the operations that change the
// representation, and (rarely) other ways the problem could be shown. Models write JSON imperfectly: in a code fence,
// with a sentence before it, with trailing commas, cut off at the end, with near-synonyms for the vocabulary. This
// reads all of that leniently and turns it into the operations of lib/new-logos/representation-ops.ts, which then
// check every one strictly. Nothing here trusts what it reads: it only reshapes it.
//
// Pure: no I/O.

import type { ArtifactOp } from './artifact-ops';
import type { RepOp } from './representation-ops';
import { REL_KINDS, clip, type HypothesisStatus, type RelKind, type RepKind } from './representation';

export interface ModelTurn {
  /** how the assistant read the turn, in a few words ("interpersonal: why she left her partner") */
  read: string;
  ops: RepOp[];
  /** other ways of showing the problem, offered quietly: a label and what asking for it says */
  alternatives: { label: string; ask: string }[];
  /** workspace commands asked for (grouping, moving, showing another way…), raw: the operation engine plans them by
   *  its own rules, refusing what names nothing here (lib/new-logos/engine/commands.ts planFromModel) */
  commands: unknown[];
  /** parts of the output that could not be read at all */
  dropped: number;
  /** whether any JSON was found */
  parsed: boolean;
}

/** A lookup table with no prototype: a word like "constructor" finds nothing. */
const table = <T,>(o: Record<string, T>): Record<string, T> => Object.assign(Object.create(null) as Record<string, T>, o);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

// ── finding the JSON ─────────────────────────────────────────────────

/** The end of the JSON value starting at `start` ({ or [), respecting strings; -1 when it never closes. */
function closeOf(s: string, start: number): number {
  let depth = 0;
  let inStr = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const relaxed = (s: string) => s.replace(/,\s*([}\]])/g, '$1').replace(/[“”]/g, '"');

function tryParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    try {
      return JSON.parse(relaxed(s));
    } catch {
      return undefined;
    }
  }
}

/** Each complete element of the array that starts at `start`, parsed on its own (an array cut short keeps its whole elements). */
function salvageArray(s: string, start: number): { items: unknown[]; dropped: number } {
  const items: unknown[] = [];
  let dropped = 0;
  let i = start + 1;
  while (i < s.length) {
    while (i < s.length && /[\s,]/.test(s[i])) i++;
    if (i >= s.length || s[i] === ']') break;
    if (s[i] !== '{') {
      // a bare value: skip to the next comma
      const next = s.indexOf(',', i);
      if (next < 0) break;
      i = next + 1;
      continue;
    }
    const end = closeOf(s, i);
    if (end < 0) {
      dropped++;
      break;
    }
    const v = tryParse(s.slice(i, end + 1));
    if (v === undefined) dropped++;
    else items.push(v);
    i = end + 1;
  }
  return { items, dropped };
}

/** The object the assistant meant to send: whole when it parses, otherwise its readable parts. */
export function extractTurn(text: string): { value: Record<string, unknown> | null; dropped: number } {
  const s = String(text ?? '').replace(/^﻿/, '');
  const fenced = /```(?:json)?\s*([\s\S]*?)(?:```|$)/i.exec(s);
  const body = fenced && fenced[1].includes('{') ? fenced[1] : s;
  const start = body.indexOf('{');
  const a = body.indexOf('[');
  if (start < 0 || (a >= 0 && a < start)) {
    // an array of operations alone
    if (a < 0) return { value: null, dropped: 0 };
    const end = closeOf(body, a);
    const whole = end >= 0 ? tryParse(body.slice(a, end + 1)) : undefined;
    if (Array.isArray(whole)) return { value: { ops: whole }, dropped: 0 };
    const { items, dropped } = salvageArray(body, a);
    return { value: items.length ? { ops: items } : null, dropped };
  }
  const end = closeOf(body, start);
  if (end >= 0) {
    const v = obj(tryParse(body.slice(start, end + 1)));
    if (v) return { value: v, dropped: 0 };
  }
  // cut short or malformed: take what can be read
  const out: Record<string, unknown> = {};
  let dropped = 0;
  const opsAt = /"(ops|operations|changes)"\s*:\s*\[/.exec(body);
  if (opsAt) {
    const r = salvageArray(body, opsAt.index + opsAt[0].length - 1);
    out.ops = r.items;
    dropped += r.dropped;
  }
  const readAt = /"read"\s*:\s*\{/.exec(body);
  if (readAt) {
    const b = readAt.index + readAt[0].length - 1;
    const e = closeOf(body, b);
    if (e >= 0) out.read = tryParse(body.slice(b, e + 1));
  }
  return { value: Object.keys(out).length ? out : null, dropped };
}

// ── words the assistant may use for the vocabulary ───────────────────

const KIND_SYN: Record<string, RepKind> = table({
  question: 'question', central_question: 'question', focus: 'question',
  statement: 'statement', answer: 'statement', fact: 'statement', claim: 'statement', point: 'statement', finding: 'statement', conclusion: 'statement', support: 'statement', empathy: 'statement', note: 'statement', explanation_text: 'statement',
  hypothesis: 'hypothesis', possibility: 'hypothesis', explanation: 'hypothesis', theory: 'hypothesis', interpretation: 'hypothesis', candidate: 'hypothesis',
  observation: 'observation', evidence: 'observation', given: 'observation', stated: 'observation', datum: 'observation',
  entity: 'entity', person: 'entity', actor: 'entity', party: 'entity', thing: 'entity', agent: 'entity', character: 'entity',
  unknown: 'unknown', missing: 'unknown', gap: 'unknown', open_question: 'unknown', clarify: 'unknown', clarifying_question: 'unknown', missing_information: 'unknown',
  caveat: 'caveat', warning: 'caveat', limit: 'caveat', limitation: 'caveat', risk: 'caveat', uncertainty: 'caveat', safety: 'caveat',
  metric: 'metric', measure: 'metric', number: 'metric', stat: 'metric', statistic: 'metric', figure: 'metric', kpi: 'metric', value: 'metric',
  timeline: 'timeline', chronology: 'timeline', events: 'timeline', history: 'timeline',
  sequence: 'sequence', steps: 'sequence', process: 'sequence', procedure: 'sequence', plan: 'sequence', method: 'sequence',
  document: 'document', source: 'document',
  equation: 'equation', formula: 'equation', definition: 'equation',
  variable: 'variable', slider: 'variable', parameter: 'variable', input: 'variable', control: 'variable',
  plot: 'plot', graph: 'plot', chart: 'plot', curve: 'plot', function_plot: 'plot',
  matrix: 'matrix', table: 'matrix', comparison: 'matrix', decision_matrix: 'matrix', comparison_matrix: 'matrix', dataset: 'matrix', data: 'matrix',
  diagram: 'diagram', flowchart: 'diagram', flow: 'diagram', schematic: 'diagram',
  media: 'media', image: 'media', picture: 'media',
});
const OP_SYN: Record<string, RepOp['op'] | 'set'> = table({
  add: 'add', create: 'add', new: 'add', insert: 'add',
  update: 'update', edit: 'update', revise: 'update', rewrite: 'update', rename: 'update', reword: 'update',
  status: 'status', assess: 'status', reassess: 'status', rate: 'status', weigh: 'status',
  answer: 'answer', resolve: 'answer',
  remove: 'remove', delete: 'remove', drop: 'remove',
  merge: 'merge', consolidate: 'merge', combine: 'merge',
  relate: 'relate', connect: 'relate', link: 'relate',
  unrelate: 'unrelate', disconnect: 'unrelate', unlink: 'unrelate',
  set: 'set', set_variable: 'set',
});
const STATUS_SYN: Record<string, HypothesisStatus> = table({
  open: 'open', unknown: 'open', undecided: 'open', possible: 'open',
  stronger: 'stronger', more_likely: 'stronger', likely: 'stronger', supported: 'stronger', strengthened: 'stronger', plausible: 'stronger',
  weaker: 'weaker', less_likely: 'weaker', unlikely: 'weaker', weakened: 'weaker', doubtful: 'weaker',
  ruled_out: 'ruled_out', rejected: 'ruled_out', eliminated: 'ruled_out', excluded: 'ruled_out', false: 'ruled_out', disproved: 'ruled_out',
});
const BASIS_SYN: Record<string, string> = table({
  known: 'known', fact: 'known', established: 'known', general_knowledge: 'known', well_established: 'known',
  derived: 'derived', calculated: 'derived', computed: 'derived', worked_out: 'derived', deduced: 'derived', logic: 'derived',
  sourced: 'sourced', source: 'sourced', document: 'sourced', cited: 'sourced',
  interpretation: 'interpretation', inference: 'interpretation', inferred: 'interpretation', opinion: 'interpretation', judgement: 'interpretation', judgment: 'interpretation', estimate: 'interpretation',
});
const FROM_SYN: Record<string, string> = table({ person: 'person', user: 'person', you: 'person', stated: 'person', told: 'person', source: 'source', document: 'source', record: 'record', public: 'record', history: 'record', known: 'record' });
const REL_SYN: Record<string, RelKind> = table({
  supports: 'supports', support: 'supports', supported_by: 'supports', evidence_for: 'supports', consistent_with: 'supports',
  contradicts: 'contradicts', contradict: 'contradicts', against: 'contradicts', undermines: 'contradicts', conflicts: 'contradicts', inconsistent_with: 'contradicts', evidence_against: 'contradicts',
  explains: 'explains', explain: 'explains', would_explain: 'explains', accounts_for: 'explains',
  causes: 'causes', cause: 'causes', caused: 'causes', produces: 'causes',
  leads_to: 'leads_to', precedes: 'leads_to', then: 'leads_to', results_in: 'leads_to', next: 'leads_to',
  part_of: 'part_of', belongs_to: 'part_of', member_of: 'part_of', in: 'part_of',
  answers: 'answers', answer: 'answers', resolves: 'answers', addresses: 'answers',
  depends_on: 'depends_on', depends: 'depends_on', requires: 'depends_on', needs: 'depends_on',
  derives: 'derives', derived_from: 'derives', based_on: 'derives', derived: 'derives', comes_from: 'derives',
  references: 'references', refers_to: 'references', cites: 'references', mentions: 'references',
  about: 'about', concerns: 'about', regarding: 'about',
  relates: 'relates', related: 'relates', relates_to: 'relates', linked: 'relates', involves: 'relates', relationship: 'relates',
});
const key = (v: unknown) => str(v).trim().toLowerCase().replace(/[\s-]+/g, '_');

const FIELD_SYN: [string, string[]][] = [
  ['text', ['text', 'label', 'title', 'statement', 'claim', 'content', 'question', 'name', 'summary']],
  ['detail', ['detail', 'details', 'explanation', 'reasoning', 'why', 'elaboration', 'more']],
  ['because', ['because', 'reason', 'rationale']],
  ['near', ['near', 'anchor', 'parent', 'beside', 'attach_to']],
];

/** An add's item, in the vocabulary: kind and words under the names the operations use. */
function itemOf(raw: Record<string, unknown>): Record<string, unknown> | null {
  const src = obj(raw.item) ?? raw;
  const kindWord = key(src.kind ?? src.type ?? raw.kind ?? raw.type);
  const kind = KIND_SYN[kindWord];
  if (!kind) return null;
  const out: Record<string, unknown> = { ...src, kind };
  for (const [name, syns] of FIELD_SYN) {
    if (out[name] !== undefined && out[name] !== '') continue;
    for (const s of syns) if (src[s] !== undefined && src[s] !== '' && typeof src[s] !== 'object') {
      out[name] = src[s];
      break;
    }
  }
  if (kind === 'statement') {
    if (kindWord === 'answer' || kindWord === 'conclusion') out.role = out.role ?? 'answer';
    if (kindWord === 'support' || kindWord === 'empathy') out.role = out.role ?? 'support';
    if (kindWord === 'fact') out.basis = out.basis ?? 'known';
  }
  if (out.basis !== undefined) out.basis = BASIS_SYN[key(out.basis)] ?? out.basis;
  if (out.from !== undefined) out.from = FROM_SYN[key(out.from)] ?? out.from;
  if (out.status !== undefined) out.status = STATUS_SYN[key(out.status)] ?? out.status;
  if (kind === 'entity' && !out.text && src.name) out.text = src.name;
  // a variable's name is its name, not its words
  if (kind === 'variable' && typeof src.name === 'string') out.name = src.name;
  if (kind === 'equation' && typeof src.name === 'string') out.name = src.name;
  return out;
}

function relationOf(raw: Record<string, unknown>, from?: string): RepOp | null {
  const f = str(raw.from ?? from).trim();
  const t = str(raw.to ?? raw.target).trim();
  const kind = REL_SYN[key(raw.kind ?? raw.type ?? raw.relation ?? 'relates')] ?? ((REL_KINDS as readonly string[]).includes(str(raw.kind)) ? (raw.kind as RelKind) : 'relates');
  if (!f || !t) return null;
  const st = key(raw.status);
  const status = st === 'established' || st === 'solid' || st === 'known' || st === 'certain' || raw.established === true ? 'established' : 'unverified';
  const label = clip(raw.label ?? raw.words, 60);
  return { op: 'relate', from: f, to: t, kind, status, ...(label ? { label } : {}) };
}

/** One operation, reshaped into the vocabulary (and any connections an add carried with it). */
export function normalizeOp(raw: unknown): RepOp[] {
  const o = obj(raw);
  if (!o) return [];
  const name = OP_SYN[key(o.op ?? o.action ?? o.type_of_change)] ?? (o.kind || o.item ? 'add' : null);
  switch (name) {
    case 'add': {
      const item = itemOf(o);
      if (!item) return [];
      const out: RepOp[] = [{ op: 'add', item, ...(item.near ? { near: str(item.near) } : {}) }];
      const links = Array.isArray(item.links) ? item.links : Array.isArray(item.relations) ? item.relations : Array.isArray(item.relate) ? item.relate : [];
      const id = str(item.id);
      if (id) for (const l of links) {
        const lo = obj(l);
        const r = lo ? relationOf(lo, id) : null;
        if (r) out.push(r);
      }
      return out;
    }
    case 'update': {
      const id = str(o.id ?? o.target).trim();
      if (!id) return [];
      const set = obj(o.set) ?? obj(o.changes) ?? { ...o };
      delete set.op;
      delete set.id;
      for (const [nm, syns] of FIELD_SYN) if (set[nm] === undefined) for (const s of syns) if (set[s] !== undefined && typeof set[s] !== 'object') {
        set[nm] = set[s];
        break;
      }
      if (set.basis !== undefined) set.basis = BASIS_SYN[key(set.basis)] ?? set.basis;
      const out: RepOp[] = [{ op: 'update', id, set }];
      // a status sent with an update is a status change
      if (set.status !== undefined) {
        const s = STATUS_SYN[key(set.status)];
        if (s) out.push({ op: 'status', id, status: s, ...(set.because ? { because: str(set.because) } : {}) });
      }
      if (typeof set.answer === 'string') out.push({ op: 'answer', id, answer: set.answer });
      return out;
    }
    case 'status': {
      const id = str(o.id ?? o.target).trim();
      const s = STATUS_SYN[key(o.status ?? o.to ?? o.value)];
      return id && s ? [{ op: 'status', id, status: s, ...(o.because ?? o.reason ? { because: str(o.because ?? o.reason) } : {}) }] : [];
    }
    case 'answer': {
      const id = str(o.id ?? o.target).trim();
      const answer = str(o.answer ?? o.text ?? o.value);
      return id && answer ? [{ op: 'answer', id, answer }] : [];
    }
    case 'remove': {
      const id = str(o.id ?? o.target).trim();
      return id ? [{ op: 'remove', id }] : [];
    }
    case 'merge': {
      const ids = (Array.isArray(o.ids) ? o.ids : Array.isArray(o.items) ? o.items : []).map(str).filter(Boolean);
      const into = str(o.into ?? o.keep ?? ids[0]).trim();
      return into && ids.length ? [{ op: 'merge', ids, into, ...(o.text ? { text: str(o.text) } : {}) }] : [];
    }
    case 'relate': {
      const r = relationOf(o);
      return r ? [r] : [];
    }
    case 'unrelate': {
      const f = str(o.from).trim(), t = str(o.to).trim();
      const kind = o.kind ? REL_SYN[key(o.kind)] : undefined;
      return f && t ? [{ op: 'unrelate', from: f, to: t, ...(kind ? { kind } : {}) }] : [];
    }
    case 'set': {
      // a variable set to a value: the model's own operation
      const nm = str(o.name ?? o.variable).trim();
      const value = typeof o.value === 'number' ? o.value : Number(o.value);
      if (!nm || !Number.isFinite(value)) return [];
      const a: ArtifactOp = { op: 'var.set', name: nm, value };
      return [{ op: 'model', ops: [a] }];
    }
    default:
      return [];
  }
}

/** The assistant's whole answer to a turn, read. */
export function readModelOutput(text: string): ModelTurn {
  const { value, dropped } = extractTurn(text);
  if (!value) return { read: '', ops: [], alternatives: [], commands: [], dropped, parsed: false };
  const r = obj(value.read);
  const read = r ? clip([str(r.kind), str(r.goal ?? r.intent ?? r.summary)].filter(Boolean).join(': '), 200) : clip(value.read, 200);
  const rawOps: unknown[] = Array.isArray(value.ops) ? value.ops : Array.isArray(value.operations) ? value.operations : Array.isArray(value.changes) ? value.changes : [];
  const ops: RepOp[] = [];
  let bad = dropped;
  for (const x of rawOps) {
    const n = normalizeOp(x);
    if (!n.length) bad++;
    ops.push(...n);
  }
  const alternatives: ModelTurn['alternatives'] = [];
  for (const a of Array.isArray(value.alternatives) ? value.alternatives : []) {
    const ao = obj(a);
    const label = clip(ao?.label ?? a, 40);
    const ask = clip(ao?.ask ?? ao?.label ?? a, 160);
    if (label && ask && alternatives.length < 3) alternatives.push({ label, ask });
  }
  const commands = (Array.isArray(value.commands) ? value.commands : []).filter((c) => obj(c) && typeof (c as Record<string, unknown>).command === 'string').slice(0, 12);
  return { read, ops, alternatives, commands, dropped: bad, parsed: true };
}
