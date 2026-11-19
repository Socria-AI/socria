// lib/ux-v0/telemetry.ts — what one SocriaUX AI operation took: time, tokens, money, and how it ended.
//
// Every model stage (lib/ux-v0/stage-server.ts) produces one OperationRecord. It is written to ux_v0_calls
// (lib/ux-v0/usage-server.ts), logged as one line without prompts or the designer's words, and sent back to
// the browser with the answer, where the cost panel's diagnostics read it beside what the browser itself
// measured (the request's whole round trip). It holds numbers and labels only: never a prompt, an answer, an
// API key or anything the designer wrote.
//
// Times, all in milliseconds:
//   queuedMs  before the model was asked: the checks, the budgets, the operation's slot
//   ttftMs    from asking the model to its first output (streamed calls only; null when not measured)
//   modelMs   from asking the model to its last answer, fallbacks and retries included
//   totalMs   the whole operation on the server, from the request to the answer
// The browser adds `networkMs`: its own round trip less the server's totalMs.
//
// Tokens, as the provider bills them:
//   input     every input token, the cached ones included; `cached` is the part read from the prompt cache
//   output    every output token, the reasoning included; `reasoning` is the part spent reasoning

import type { CallKind, Usage } from './types';

export const OUTCOMES = ['ok', 'fallback', 'deterministic', 'coalesced', 'invalid', 'timeout', 'cancelled', 'limited', 'busy', 'provider-limit', 'failed'] as const;
export type Outcome = (typeof OUTCOMES)[number];

export interface OperationRecord {
  /** the operation's id: the browser's (one per action, for idempotency) or the server's own */
  op: string;
  stage: CallKind;
  /** what the operation was, in a word: turn, direction, synthesize, revise, propose, generate, patch, critique */
  operation: string;
  provider: 'openai' | 'none';
  model: string | null;
  api: 'chat' | 'responses' | null;
  tier: 'economy' | 'premium' | null;
  effort: string | null;
  input: number;
  cached: number;
  output: number;
  reasoning: number;
  /** US$, measured from the provider's usage at the published price; null when unpriced or nothing came back */
  cost: number | null;
  /** epoch ms the request arrived */
  startedAt: number;
  queuedMs: number;
  ttftMs: number | null;
  modelMs: number | null;
  totalMs: number;
  /** model calls beyond the first: a model that refused or failed and the next one asked, a JSON-mode retry, a fallback */
  retries: number;
  outcome: Outcome;
  cancelled: boolean;
  /** why it ended as it did, in SocriaUX's words (never the designer's or the model's) */
  note?: string;
}

const num = (v: unknown, max = 1e9) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0);
const nul = (v: unknown, max = 1e9) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : null);
const word = (v: unknown, n = 40) => (typeof v === 'string' && /^[\w.:\-]{1,80}$/.test(v) ? v.slice(0, n) : null);

/** A record from anywhere (a stored project, a response), held to its shape; null when it is not one. */
export function normalizeRecord(v: unknown): OperationRecord | null {
  const r = v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  if (!r || typeof r.stage !== 'string' || !(OUTCOMES as readonly string[]).includes(r.outcome as string)) return null;
  return {
    op: word(r.op, 96) ?? 'unknown',
    stage: r.stage as CallKind,
    operation: word(r.operation) ?? r.stage,
    provider: r.provider === 'openai' ? 'openai' : 'none',
    model: word(r.model, 60),
    api: r.api === 'chat' || r.api === 'responses' ? r.api : null,
    tier: r.tier === 'economy' || r.tier === 'premium' ? r.tier : null,
    effort: word(r.effort, 12),
    input: num(r.input),
    cached: num(r.cached),
    output: num(r.output),
    reasoning: num(r.reasoning),
    cost: typeof r.cost === 'number' && Number.isFinite(r.cost) && r.cost >= 0 ? Math.round(r.cost * 1e6) / 1e6 : null,
    startedAt: num(r.startedAt, 1e14),
    queuedMs: num(r.queuedMs, 1e7),
    ttftMs: nul(r.ttftMs, 1e7),
    modelMs: nul(r.modelMs, 1e7),
    totalMs: num(r.totalMs, 1e7),
    retries: num(r.retries, 50),
    outcome: r.outcome as Outcome,
    cancelled: r.cancelled === true,
    ...(typeof r.note === 'string' && r.note ? { note: r.note.replace(/\s+/g, ' ').slice(0, 200) } : {}),
  };
}

/** The record's tokens and price, from the provider's usage. */
export function usageFields(u: Usage | null | undefined): Pick<OperationRecord, 'model' | 'input' | 'cached' | 'output' | 'reasoning' | 'cost' | 'tier' | 'effort'> {
  return {
    model: u?.model ?? null,
    input: u?.input ?? 0,
    cached: u?.cached ?? 0,
    output: u?.output ?? 0,
    reasoning: u?.reasoning ?? 0,
    cost: u?.cost ?? null,
    tier: u?.tier ?? null,
    effort: u?.effort ?? null,
  };
}

/** One log line for the record: numbers and labels only, never a prompt or the designer's words. */
export function logLine(r: OperationRecord, userId: string, projectId: string): string {
  const fields: [string, unknown][] = [
    ['op', r.op],
    ['stage', r.stage],
    ['outcome', r.outcome],
    ['model', r.model ?? '-'],
    ['tier', r.tier ?? '-'],
    ['in', r.input],
    ['cached', r.cached],
    ['out', r.output],
    ['reasoning', r.reasoning],
    ['usd', r.cost == null ? '-' : r.cost.toFixed(5)],
    ['queued', r.queuedMs],
    ['ttft', r.ttftMs ?? '-'],
    ['model_ms', r.modelMs ?? '-'],
    ['total_ms', r.totalMs],
    ['retries', r.retries],
    // who and which project, hashed: enough to group a person's calls in the logs, nothing to identify them by
    ['user', shortHash(userId)],
    ['project', shortHash(projectId)],
  ];
  return `[ux-v0 op] ${fields.map(([k, v]) => `${k}=${v}`).join(' ')}`;
}

/** FNV-1a, 32 bits, base 36: a stable, non-reversible tag. */
export function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (const ch of String(s ?? '')) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export interface StageSummary {
  stage: CallKind;
  calls: number;
  failures: number;
  cost: number;
  input: number;
  cached: number;
  output: number;
  reasoning: number;
  medianTotalMs: number | null;
  medianTtftMs: number | null;
  slowestMs: number | null;
}

const median = (xs: number[]) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null;
};

/** Totals per stage, most expensive first: where the time and the money went. */
export function summarizeRecords(records: readonly OperationRecord[]): StageSummary[] {
  const by = new Map<CallKind, OperationRecord[]>();
  for (const r of records) by.set(r.stage, [...(by.get(r.stage) ?? []), r]);
  return [...by.entries()]
    .map(([stage, rs]) => ({
      stage,
      calls: rs.length,
      failures: rs.filter((r) => !['ok', 'fallback', 'deterministic', 'coalesced'].includes(r.outcome)).length,
      cost: Math.round(rs.reduce((s, r) => s + (r.cost ?? 0), 0) * 1e6) / 1e6,
      input: rs.reduce((s, r) => s + r.input, 0),
      cached: rs.reduce((s, r) => s + r.cached, 0),
      output: rs.reduce((s, r) => s + r.output, 0),
      reasoning: rs.reduce((s, r) => s + r.reasoning, 0),
      medianTotalMs: median(rs.map((r) => r.totalMs)),
      medianTtftMs: median(rs.map((r) => r.ttftMs ?? NaN)),
      slowestMs: rs.length ? Math.max(...rs.map((r) => r.totalMs)) : null,
    }))
    .sort((a, b) => b.cost - a.cost || (b.medianTotalMs ?? 0) - (a.medianTotalMs ?? 0));
}
