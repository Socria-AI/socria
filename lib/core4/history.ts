// lib/core4/history.ts
//
// Arithmetic over the record. The one place Core 4 holds information the reply
// model does not.
//
// WHY EVERYTHING BEFORE THIS FAILED, stated plainly because it decided the
// design. Three audits reached the same verdict: the detectors, the problem
// model, the ablation and the sampled disagreement all hand a model something
// it could already see. A premise ablation asks "does X still follow without
// P?" — but P is in the transcript, and the model doing the reasoning is the
// same model writing the reply, so a strong prompt told to stress-test its own
// reasoning arrives in the same place. It was measured arriving in the same
// place, twice, on the two turns built to make that hardest.
//
// So surplus information needs one of three things a single forward pass
// cannot do: search a space too large to enumerate, generate without anchoring
// on its own first idea, or COMPUTE OVER HISTORY THAT IS NOT IN THE CONTEXT.
// This module is the third, and it is the cheapest by a wide margin: no model
// call at all.
//
// WHAT IT CAN SEE THAT NOTHING ELSE CAN. The ledger keeps, per entry, a
// revision log (`at`, `by`, `change`, `from`, `to`, `reason`), a confidence
// that rises each time the person restates the position, a status that records
// rejection and supersession, and the conversation and turn it came from. None
// of that is in the reply model's context: not the counters, not the
// timestamps, not the prior sessions once the archive outgrows the window, and
// not the fact that a number moved. A transcript shows what someone believes.
// This shows what they USED to believe, how many times it changed, in which
// direction, and whether anything new arrived to justify the change.
//
// THE TEST EVERY FINDING HERE MUST PASS: could a frontier model with the
// current transcript produce this sentence? If yes, it does not belong in this
// file. "You have revised this estimate three times, 6 → 13 → 9 weeks, each
// time upward by about 2x" passes, because the first two figures are gone from
// the conversation. "Your assumption is unchecked" fails, and lives elsewhere.

import type { LedgerEntry } from './types';

export const HISTORY_KINDS = [
  /** a number they have restated, with the trajectory computed */
  'ESTIMATE_DRIFT',
  /** confidence climbed on restatement while no new evidence arrived */
  'CONFIDENCE_WITHOUT_EVIDENCE',
  /** something they ruled out is back, in the same words */
  'REJECTED_RESURFACING',
  /** a belief still standing on something they later withdrew */
  'SUPPORT_WITHDRAWN',
  /** the same shape of revision, repeatedly, unnoticed */
  'REPEATED_REVISION',
] as const;
export type HistoryKind = (typeof HISTORY_KINDS)[number];

export interface HistoricalFinding {
  kind: HistoryKind;
  /** ledger ids, so any claim here can be audited against the record */
  ids: string[];
  /** what the record says, in Socria's words — never shown verbatim */
  what: string;
  /** why it bears on what they are doing now */
  whyItMatters: string;
  /**
   * The point of the whole file: what makes this unavailable from the
   * transcript. Written per finding so a reviewer can check the claim rather
   * than trust it.
   */
  notInTranscript: string;
  /** how far back it reaches, in days — 0 when within one sitting */
  spanDays: number;
}

const DAY = 86_400_000;

// WORDS COUNT AS NUMBERS, because people write them. "nine weeks" and "9
// weeks" are the same estimate, and an extractor that only reads digits misses
// whichever half of the time someone is writing prose rather than a table —
// silently, with no symptom, because a missing figure looks exactly like a
// figure that did not move. Caught by the first test written against this
// module, which used the spelled-out form without thinking about it.
const WORD_NUMBERS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000,
};

/**
 * Numbers in a string, digits or words, in the order they appear.
 *
 * Deliberately simple: no compound parsing ("twenty-three" yields 20 then 3).
 * A wrong compound would corrupt a trajectory, and a trajectory is the one
 * thing here that has to be exactly right — so the ratio test downstream
 * discards a series that does not move monotonically, which is what an
 * mis-parsed compound produces.
 */
const nums = (s: string): number[] => {
  const out: { at: number; v: number }[] = [];
  const digits = s.replace(/(\d),(?=\d{3}\b)/g, '$1');
  for (const m of digits.matchAll(/-?\d+(?:\.\d+)?/g)) {
    const v = Number(m[0]);
    if (Number.isFinite(v)) out.push({ at: m.index ?? 0, v });
  }
  for (const m of digits.toLowerCase().matchAll(/[a-z]+/g)) {
    const v = WORD_NUMBERS[m[0]];
    if (v !== undefined) out.push({ at: m.index ?? 0, v });
  }
  return out.sort((a, b) => a.at - b.at).map((x) => x.v);
};

const firstNum = (s: string): number | null => {
  const n = nums(s);
  return n.length ? n[0] : null;
};

/** Text revisions of ONE entry, oldest first, with the numbers they carried. */
function revisionsOf(e: LedgerEntry): { at: number; text: string; value: number | null }[] {
  const out: { at: number; text: string; value: number | null }[] = [];
  for (const r of e.revisions) {
    if (r.change !== 'text' || !r.from) continue;
    out.push({ at: r.at, text: r.from, value: firstNum(r.from) });
  }
  out.push({ at: e.updatedAt, text: e.text, value: firstNum(e.text) });
  return out;
}

export interface Series {
  /** every entry the series is built from — one per conversation it appeared in */
  ids: string[];
  conversations: number;
  points: { at: number; text: string; value: number }[];
}

/**
 * THE SERIES SPANS CONVERSATIONS, and it has to.
 *
 * A trajectory built only from one entry's revision log cannot reach across
 * sessions, because `mergeEntries` deliberately does NOT merge a restatement
 * made in a different conversation — that scoping exists to stop a premise
 * restated in a new conversation being absorbed by an old one's row, which was
 * a real leak. Correct for attribution, fatal here: the finding that most needs
 * to span sessions was the one guaranteed not to.
 *
 * Caught by running the mechanism on a realistic three-session restatement and
 * watching it return nothing. Assuming it worked would have shipped a module
 * whose headline finding could not fire.
 *
 * So a series is assembled the other way round: group the entries that are
 * plainly about the same thing, concatenate each one's revisions with its final
 * value, order the whole lot by time, and drop consecutive duplicates.
 */
export function seriesOf(entries: readonly LedgerEntry[], min = 3): Series[] {
  const mine = entries.filter((e) => e.owner === 'user' && e.status !== 'retracted');
  const groups: LedgerEntry[][] = [];
  for (const e of mine) {
    const g = groups.find((x) => overlap(x[0].text, e.text) >= 0.6);
    if (g) g.push(e);
    else groups.push([e]);
  }
  const out: Series[] = [];
  for (const g of groups) {
    const points = g
      .flatMap((e) => revisionsOf(e))
      .filter((p): p is { at: number; text: string; value: number } => p.value !== null)
      .sort((a, b) => a.at - b.at);
    // The same figure restated is not a movement.
    const dedup = points.filter((p, i) => i === 0 || p.value !== points[i - 1].value);
    // `min` differs by caller, and the difference is the point. One figure that
    // moved once is a correction, so a DRIFT needs three points. But three
    // separate figures that each moved once is a pattern about how this person
    // estimates, and holding that to three points each would mean it could only
    // fire for someone who had already revised nine times.
    if (dedup.length < min) continue;
    out.push({
      ids: g.map((e) => e.id),
      conversations: new Set(g.map((e) => e.conversationId)).size,
      points: dedup,
    });
  }
  return out;
}

/**
 * A figure they have moved, and which way.
 *
 * The earlier values are gone from the conversation — they exist only in the
 * revision log — so the trajectory and its multiplier are not recoverable from
 * the transcript at any length. Two revisions minimum: one change is a
 * correction, a series is a pattern.
 */
function estimateDrift(entries: readonly LedgerEntry[]): HistoricalFinding[] {
  const out: HistoricalFinding[] = [];
  for (const ser of seriesOf(entries)) {
    const vals = ser.points.map((p) => p.value);
    const steps: number[] = [];
    for (let i = 1; i < vals.length; i++) if (vals[i - 1] !== 0) steps.push(vals[i] / vals[i - 1]);
    if (!steps.length) continue;
    const allUp = steps.every((r) => r > 1.15);
    const allDown = steps.every((r) => r < 0.87);
    if (!allUp && !allDown) continue;
    const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
    const span = Math.round((ser.points[ser.points.length - 1].at - ser.points[0].at) / DAY);
    out.push({
      kind: 'ESTIMATE_DRIFT',
      ids: ser.ids,
      what: `They have moved this figure ${vals.length - 1} times: ${vals.join(' → ')}, every step ${allUp ? 'upward' : 'downward'} by about ${mean.toFixed(1)}×.`,
      whyItMatters: allUp
        ? `The current figure is the next in a series, not an independent estimate. On the same pattern the true value is nearer ${(vals[vals.length - 1] * mean).toFixed(1)}.`
        : 'Each revision has cut it, which usually means the original scope is still being discovered rather than that the work is shrinking.',
      notInTranscript: ser.conversations > 1
        ? `Only the latest figure (${vals[vals.length - 1]}) is in this conversation; the earlier ones were said in ${ser.conversations - 1} other conversation${ser.conversations > 2 ? 's' : ''}.`
        : `Only the latest figure (${vals[vals.length - 1]}) is in the conversation. The earlier ones exist solely in the revision log, so the direction and the multiplier cannot be read off the transcript.`,
      spanDays: span,
    });
  }
  return out;
}

/**
 * Certainty that grew while the evidence did not.
 *
 * `mergeEntries` raises confidence by 0.05 every time the person restates a
 * position. That counter is the useful part: a belief restated five times
 * feels settled to the person and to any model reading the transcript, and the
 * record can say whether anything actually arrived in between. Nothing in the
 * conversation carries a count of restatements.
 */
function confidenceWithoutEvidence(entries: readonly LedgerEntry[]): HistoricalFinding[] {
  const out: HistoricalFinding[] = [];
  const evidence = entries.filter((e) => e.kind === 'evidence' && e.status !== 'retracted');
  for (const e of entries) {
    if (e.owner !== 'user' || e.status === 'retracted') continue;
    if (e.kind !== 'claim' && e.kind !== 'conclusion' && e.kind !== 'assumption') continue;
    const restatements = e.revisions.filter((r) => r.change === 'text' || r.change === 'status').length;
    if (restatements < 2 || e.confidence < 0.8) continue;
    const since = e.revisions.find((r) => r.change === 'text')?.at ?? e.createdAt;
    const arrived = evidence.filter((v) => v.createdAt >= since);
    if (arrived.length) continue;
    const span = Math.round((e.updatedAt - e.createdAt) / DAY);
    out.push({
      kind: 'CONFIDENCE_WITHOUT_EVIDENCE',
      ids: [e.id],
      what: `They have restated this ${restatements} times and it now reads as settled, and no evidence has been added since the first time they said it.`,
      whyItMatters: 'Repetition is doing the work certainty should be doing, and it is load-bearing enough that nobody is checking it any more.',
      notInTranscript: 'The count of restatements and the fact that no evidence arrived between them are properties of the record over time, not of any message in it.',
      spanDays: span,
    });
  }
  return out;
}

/**
 * Something they ruled out, back on the table.
 *
 * The rejection and its stated reason may be weeks and several sessions back,
 * outside anything the reply model is given. The reason matters more than the
 * rejection: "we ruled this out because it needs a ministerial order" is the
 * sentence that makes the return a problem rather than a change of mind.
 */
function rejectedResurfacing(entries: readonly LedgerEntry[], now: number): HistoricalFinding[] {
  const out: HistoricalFinding[] = [];
  const rejected = entries.filter((e) => (e.status === 'rejected' || e.stance === 'rejects') && e.owner === 'user');
  const live = entries.filter((e) => e.status === 'active' && e.stance !== 'rejects');
  for (const r of rejected) {
    const back = live.find((l) => l.id !== r.id && overlap(l.text, r.text) >= 0.5 && l.turn > r.turn);
    if (!back) continue;
    out.push({
      kind: 'REJECTED_RESURFACING',
      ids: [r.id, back.id],
      what: `This is the thing they ruled out${r.reason ? ` because ${r.reason}` : ''}, and it is back on the table without that reason being addressed.`,
      whyItMatters: r.reason
        ? 'The reason they gave then either still applies, in which case this fails the same way, or it has changed, which is worth saying out loud.'
        : 'They decided against this once; re-deciding it by default is different from re-deciding it deliberately.',
      notInTranscript: `The rejection is from turn ${r.turn}${r.conversationId ? ' of an earlier conversation' : ''} and the reason for it is in the record, not in the current thread.`,
      spanDays: Math.round((now - r.updatedAt) / DAY),
    });
  }
  return out;
}

/**
 * A belief still resting on something they later withdrew.
 *
 * Not the same as an unchecked assumption. This is an assumption that WAS
 * supported, and whose support the person themselves later rejected or
 * superseded — so the belief has quietly become unsupported without anybody
 * revisiting it. The withdrawal is a status change in the record.
 */
function supportWithdrawn(entries: readonly LedgerEntry[], links: readonly { from: string; to: string; rel: string }[]): HistoricalFinding[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const out: HistoricalFinding[] = [];
  for (const l of links) {
    if (l.rel !== 'depends_on' && l.rel !== 'supports' && l.rel !== 'assumes') continue;
    const holder = byId.get(l.rel === 'supports' ? l.to : l.from);
    const base = byId.get(l.rel === 'supports' ? l.from : l.to);
    if (!holder || !base) continue;
    if (holder.status !== 'active') continue;
    const dropped = base.status === 'rejected' || base.status === 'superseded' || base.status === 'disputed';
    if (!dropped) continue;
    const when = base.revisions.filter((r) => r.change === 'status').slice(-1)[0];
    out.push({
      kind: 'SUPPORT_WITHDRAWN',
      ids: [holder.id, base.id],
      what: `"${holder.text}" still stands on something they have since ${base.status === 'rejected' ? 'ruled out' : base.status === 'disputed' ? 'disputed' : 'replaced'}${when?.reason ? ` (${when.reason})` : ''}.`,
      whyItMatters: 'It was a reasonable position when the support was live. Nothing has revisited it since the support went.',
      notInTranscript: 'That the support was withdrawn is a status transition in the record; the current thread shows the belief and not what it used to rest on.',
      spanDays: when ? Math.round((holder.updatedAt - when.at) / DAY) : 0,
    });
  }
  return out;
}

/**
 * The same correction, over and over, unnoticed.
 *
 * Distinct from ESTIMATE_DRIFT on one entry: this is the pattern ACROSS
 * entries — three separate estimates each revised upward is a fact about how
 * this person estimates, and it is invisible in any single thread because the
 * three live in different conversations.
 */
function repeatedRevision(entries: readonly LedgerEntry[]): HistoricalFinding[] {
  const upward = seriesOf(entries, 2).filter((ser) => {
    const v = ser.points.map((p) => p.value);
    return v[v.length - 1] > v[0] * 1.15;
  });
  if (upward.length < 3) return [];
  const ratios = upward.map((ser) => {
    const v = ser.points.map((p) => p.value);
    return v[v.length - 1] / v[0];
  });
  const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  const convos = new Set(upward.flatMap((ser) => ser.ids)).size;
  const at = upward.flatMap((ser) => ser.points.map((p) => p.at));
  return [{
    kind: 'REPEATED_REVISION',
    ids: upward.flatMap((ser) => ser.ids).slice(0, 5),
    what: `${upward.length} separate estimates have each been revised upward, by ${ratios.map((r) => r.toFixed(1) + '×').join(', ')} — about ${mean.toFixed(1)}× on average.`,
    whyItMatters: `This is a property of how the estimates are made, not of any one of them. Whatever they quote next is, on their own record, about ${mean.toFixed(1)}× short.`,
    notInTranscript: `The ${upward.length} revisions are spread across ${convos} separate threads of reasoning; no single conversation contains more than one of them.`,
    spanDays: Math.round((Math.max(...at) - Math.min(...at)) / DAY),
  }];
}

/** Content-word overlap, for matching a rejected item against a live one. */
const STOP = new Set(['the', 'and', 'that', 'this', 'with', 'from', 'about', 'into', 'over', 'than', 'then', 'they', 'them', 'what', 'when', 'will', 'would', 'have', 'has', 'was', 'are', 'for', 'our', 'their', 'not', 'but']);
const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOP.has(w)));
function overlap(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return 0;
  let n = 0;
  for (const w of x) if (y.has(w)) n += 1;
  return n / Math.min(x.size, y.size);
}

/**
 * Everything the record can say that the conversation cannot.
 *
 * Pure: no model call, no I/O. Runs on every turn where there is a ledger,
 * which is what makes it affordable to run at all — the expensive mechanisms
 * had to be gated to roughly 15% of turns, and a gate is one more thing that
 * can be wrong.
 */
export function discoverFromHistory(
  entries: readonly LedgerEntry[],
  links: readonly { from: string; to: string; rel: string }[],
  now: number
): HistoricalFinding[] {
  const usable = entries.filter((e) => e.status !== 'retracted');
  const all = [
    ...estimateDrift(usable),
    ...confidenceWithoutEvidence(usable),
    ...rejectedResurfacing(usable, now),
    ...supportWithdrawn(usable, links),
    ...repeatedRevision(usable),
  ];
  // One per kind, the one reaching furthest back — a finding that spans
  // sessions is the one the person is least able to make for themselves.
  const best = new Map<HistoryKind, HistoricalFinding>();
  for (const f of all) {
    const prev = best.get(f.kind);
    if (!prev || f.spanDays > prev.spanDays) best.set(f.kind, f);
  }
  return [...best.values()].sort((a, b) => b.spanDays - a.spanDays);
}

/**
 * What the record earned the right to say.
 *
 * Renders at most two, because this is a reply to a person and not a report
 * about them. The instruction is deliberately about ARITHMETIC rather than
 * observation: these findings are worth saying precisely because they are
 * computed, and a reply that presents one as a vague impression throws away
 * the only thing that made it worth computing.
 */
export function renderHistory(found: readonly HistoricalFinding[]): string {
  if (!found.length) return '';
  const top = found.slice(0, 2);
  const lines = top.map((f) => `  - ${f.what} ${f.whyItMatters}${f.spanDays > 0 ? ` (spanning ${f.spanDays} days)` : ''}`);
  return (
    `\n=== From the record, not from this conversation ===\n${lines.join('\n')}\n` +
    `These are counted from what they have actually said over time — the earlier figures, the number of restatements and the withdrawn support are in Socria's record and NOT in this thread, which is why they are worth raising at all. ` +
    `Raise at most ONE, where it bears on what they are deciding now, with the specific numbers. ` +
    `Give the figures plainly — a trajectory stated as "you have revised this a few times" throws away the only part that helps. ` +
    `Never say "my records show", never mention a ledger, history or tracking, and never imply surveillance: this is the memory of someone who has been paying attention.\n`
  );
}
