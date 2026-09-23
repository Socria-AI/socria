// lib/core4/guard2.ts
//
// Answer Guard 2.0: the last thing between a draft and the person, and it
// looks in BOTH directions.
//
//   OVERREACH — the draft performs cognitive work that was valuable for THIS
//   person to do, in THIS situation: it states the answer they are practising
//   toward, rewrites the essay they are writing, reveals the value verify
//   mode kept private, hands over the solution and then asks them to find it.
//
//   UNDERHELP — the draft withholds or deflects when direct help was the
//   right move: questions beyond the budget, a reply that is only questions,
//   "it depends on your goals" to somebody who asked for the answer, a hint
//   to someone who said "just tell me".
//
//   NOVELTY — the draft raises, as if new, something the person has already
//   considered (or that Socria already said).
//
//   VOICE — a sycophantic opener; a closing offer to keep the conversation
//   going.
//
// Deterministic first: most failures are decidable without understanding —
// counting questions, spotting a hidden number, matching a considered item —
// and deterministic fixes (removing sentences) are applied directly. A cheap
// model is asked only about what structure cannot decide: a semantic leak of
// withheld work, and paraphrased redundancy the lexical matcher left
// UNCERTAIN. A retry is always re-checked; nothing ships unchecked.
//
// Pure (the model call is in guard-engine.ts).

import type {
  Allocation,
  GuardAction,
  GuardFinding,
  GuardOutcome,
  InterventionDecision,
  NoveltyVerdict,
} from './types';
import { questionLoad, stripInterrogatives, hasSycophanticOpener, stripSycophanticOpener, sentencesOf, interrogatives } from './questions';
import { classify, gateCandidates } from './considered';
import { noveltyGated, THINKING_MODES } from './intervene';

export interface GuardInput {
  decision: InterventionDecision;
  allocation: Allocation;
  draft: string;
  /** considered items (the person's and Socria's earlier ones) the draft must not re-raise */
  considered: string[];
  /** values verify mode computed privately; none may appear in the reply */
  hidden?: string[];
}

/** Deflection: talking about the question instead of answering it. */
const DEFLECT = /\b(it (?:really )?depends on (?:your|what you)|what do you think|how would you (?:approach|tackle|handle)|what(?:'s| is) your (?:intuition|instinct|take)|i(?:'d| would) encourage you to|only you can (?:decide|answer)|there(?:'s| is) no (?:single|one) (?:right )?answer)\b/i;

/** A worked solution: a procedure, several displays, or a chain of derivation. */
export function looksWorked(text: string): boolean {
  const steps = (text.match(/^\s*(?:step\s*)?\(?\d+[.)]/gim) ?? []).length;
  if (steps >= 3) return true;
  const displays = (text.match(/```|\$\$|\\\[/g) ?? []).length;
  if (displays >= 2) return true;
  const chain = (text.match(/\b(therefore|so we get|which gives|hence|thus|substituting)\b/gi) ?? []).length;
  return chain >= 3;
}

/** Hand the thing over, then invite them to produce it. */
export function givesThenAsks(text: string): boolean {
  const invitation =
    /\b(now (?:you|try)|can you (?:recall|remember|derive|apply|work|state)|try (?:it|this|that) (?:yourself|now)|your turn|apply (?:it|this|that) yourself|see if you can|have a go)\b/i;
  const m = invitation.exec(text);
  if (!m) return false;
  const before = text.slice(0, m.index);
  if (!before.trim()) return false;
  const identity = /[^\s=][^=\n]{0,80}=\s*[^\s=][^\n]{0,80}/.test(before);
  const defines = /\b(is defined as|means that|the \w+ rule (?:is|says|states)|formula is)\b/i.test(before);
  return identity || defines || looksWorked(before);
}

function norm(v: string): string {
  return v.toLowerCase().replace(/\s+/g, '').replace(/[,]/g, '');
}

/** Sentences containing any hidden value. */
function leaksHidden(draft: string, hidden: string[]): string[] {
  const vals = hidden.map(norm).filter((v) => v.length >= 2);
  if (!vals.length) return [];
  return sentencesOf(draft).filter((s) => vals.some((v) => norm(s).includes(v)));
}

/** A draft with some sentences removed; null if nothing of substance is left. */
function without(draft: string, drop: string[]): string | null {
  const gone = new Set(drop.map((s) => s.trim()));
  const kept = sentencesOf(draft).filter((s) => !gone.has(s.trim())).join('').trim();
  return kept && sentencesOf(kept).some((s) => s.trim().split(/\s+/).length >= 4) ? kept : null;
}

const MACHINE_DOES = new Set(['AI_EXECUTES', 'AI_EXPLAINS', 'AI_ASSISTS']);

/**
 * The deterministic guard. Returns the outcome, and whether the cheap-model
 * pass should still be consulted (`needsModel`) for what structure cannot
 * decide.
 */
export function guardStructure(input: GuardInput): GuardOutcome & { needsModel: boolean; novelty: NoveltyVerdict[] } {
  const { decision: dec, allocation: a, considered } = input;
  let draft = input.draft.trim();
  const findings: GuardFinding[] = [];
  let action: GuardAction = 'ALLOW';
  let retryNote: string | undefined;
  let changed = false;

  if (!draft) {
    return { action: 'MODIFY_FOR_MORE_HELP', findings: [{ side: 'underhelp', code: 'empty', detail: 'The draft is empty.' }], retryNote: 'Write the reply.', by: 'structure', needsModel: false, novelty: [] };
  }

  // ── OVERREACH ──
  if (a.withhold) {
    const leaked = leaksHidden(draft, input.hidden ?? []);
    if (leaked.length) {
      findings.push({ side: 'overreach', code: 'hidden_value', detail: 'The draft states the value verify mode kept private.' });
      const rest = without(draft, leaked);
      if (rest) {
        draft = rest;
        changed = true;
        action = 'MODIFY_FOR_MORE_AGENCY';
      } else {
        action = 'MODIFY_FOR_MORE_AGENCY';
        retryNote = `Do not state the result. ${a.withhold.what} stays with them; say where their work goes wrong instead.`;
      }
    }
    if (!retryNote && givesThenAsks(draft)) {
      findings.push({ side: 'overreach', code: 'gives_then_asks', detail: 'The draft hands over the withheld work and then invites them to produce it.' });
      action = 'MODIFY_FOR_MORE_AGENCY';
      retryNote = `The draft supplied ${a.withhold.what} and then invited them to produce it. Remove it; keep everything else useful.`;
    }
    if (!retryNote && (dec.type === 'HINT' || dec.type === 'VERIFY' || dec.type === 'QUESTION') && looksWorked(draft)) {
      findings.push({ side: 'overreach', code: 'worked_solution', detail: `A ${dec.type} that contains a worked solution.` });
      action = 'MODIFY_FOR_MORE_AGENCY';
      retryNote = `This was a ${dec.type}; the draft works the problem. Point at the step, do not perform it.`;
    }
  }

  // ── NOVELTY (perspective moves, or any draft when there is a considered record) ──
  let novelty: NoveltyVerdict[] = [];
  if (considered.length && (noveltyGated(dec.type, a.mode, considered.length) || questionLoad(draft) > 0)) {
    // A contribution or a thinking-together answer: every sentence is a
    // candidate. Anything else: its questions and perspective sentences.
    const whole = dec.type === 'CONTRIBUTE' || (dec.type === 'ANSWER' && THINKING_MODES.has(a.mode));
    novelty = gateCandidates(draft, whole).map((s) => classify(s, considered));
    const redundant = novelty.filter((v) => v.verdict === 'REDUNDANT');
    if (redundant.length) {
      findings.push({
        side: 'novelty',
        code: 'already_considered',
        detail: `Re-raises what they already considered: ${redundant.map((r) => `"${r.match}"`).join('; ')}`,
      });
      const rest = without(draft, redundant.map((r) => r.sentence));
      if (rest && !retryNote) {
        draft = rest;
        changed = true;
        if (action === 'ALLOW') action = 'MODIFY_FOR_MORE_HELP';
      } else if (!retryNote) {
        action = 'MODIFY_FOR_MORE_HELP';
        retryNote = `Everything this draft raises they have already considered (${redundant.map((r) => r.match).join('; ')}). Acknowledge that in a clause, then contribute what they have NOT considered — or, if there is nothing, pull their thinking together. Do not re-raise any of it.`;
      }
    }
  }

  // ── UNDERHELP ──
  const load = questionLoad(draft);
  if (load > dec.maxQuestions || interrogatives(draft).offers.length) {
    const stripped = stripInterrogatives(draft, dec.maxQuestions);
    if (load > dec.maxQuestions) {
      findings.push({ side: 'underhelp', code: 'over_budget', detail: `${load} question(s) where ${dec.maxQuestions} were allowed.` });
    }
    if (stripped.text) {
      draft = stripped.text;
      changed = true;
      if (action === 'ALLOW') action = 'MODIFY_FOR_MORE_HELP';
    } else if (!retryNote) {
      action = MACHINE_DOES.has(a.mode) ? 'OVERRIDE_WITH_DIRECT_ANSWER' : 'MODIFY_FOR_MORE_HELP';
      retryNote = MACHINE_DOES.has(a.mode)
        ? 'The draft only asked questions. Give the answer directly — no questions.'
        : 'The draft was only questions. Make the move as statements: say the thing, do not ask it.';
    }
  }
  if (!retryNote && MACHINE_DOES.has(a.mode) && DEFLECT.test(draft) && (dec.type === 'ANSWER' || dec.type === 'EXPLAIN' || dec.type === 'EXECUTE' || dec.type === 'CALCULATE')) {
    findings.push({ side: 'underhelp', code: 'deflection', detail: 'The draft deflects instead of answering.' });
    action = 'OVERRIDE_WITH_DIRECT_ANSWER';
    retryNote = 'They need the answer, not a discussion of how it depends. Give the answer directly; state the one condition that changes it, if any.';
  }

  // ── VOICE ──
  if (hasSycophanticOpener(draft)) {
    findings.push({ side: 'voice', code: 'sycophancy', detail: 'Sycophantic opener.' });
    const rest = stripSycophanticOpener(draft);
    if (rest) {
      draft = rest;
      changed = true;
    }
  }

  // The model is consulted only for what structure cannot decide.
  const needsModel =
    !retryNote &&
    ((!!a.withhold && !findings.some((f) => f.side === 'overreach')) || novelty.some((v) => v.verdict === 'UNCERTAIN'));

  return {
    action: retryNote ? action : changed ? (action === 'ALLOW' ? 'MODIFY_FOR_MORE_HELP' : action) : 'ALLOW',
    findings,
    ...(changed && !retryNote ? { revised: draft } : {}),
    ...(retryNote ? { retryNote } : {}),
    by: findings.length ? 'structure' : 'none',
    needsModel,
    novelty,
  };
}

// ── the cheap-model pass ─────────────────────────────────────────────

export const GUARD2_SYSTEM = `You check one reply before a person sees it. You look for two opposite failures.

OVERREACH: the reply performs cognitive work the person should do themselves in this situation — stated in KEEP WITH THEM. It counts if the reply states it, works it inside an example, or gives it away inside a "hint". It does NOT count if the reply only points at where to look, names the kind of error, or supplies other things they need.

UNDERHELP: the reply withholds, deflects or creates friction where direct help was the right move — questions they did not need, "it depends" without saying on what, a hint to someone who needed the answer.

REDUNDANCY: a sentence raises, as if new, something listed under ALREADY CONSIDERED (the same idea, even in different words). A sentence that explicitly builds past a considered item ("you've already covered X; the part that's still open is Y") is NOT redundant.

Return JSON only:
{"action":"ALLOW"|"MODIFY_FOR_MORE_AGENCY"|"MODIFY_FOR_MORE_HELP"|"OVERRIDE_WITH_DIRECT_ANSWER"|"REQUEST_CLARIFICATION",
 "findings":[{"side":"overreach"|"underhelp"|"novelty","detail":"<one line: what is wrong and what the reply should do instead>"}],
 "redundant":["<exact sentence copied from the reply that is redundant>"]}

Use ALLOW when the reply is fine. Do not rewrite the reply: you report, the reply's author fixes. Do not fail a reply for being helpful — fail it for doing the person's work when they needed to do it, or for withholding when they needed help.`;

export function buildGuard2Input(input: GuardInput, userMessage: string): string {
  const { decision: dec, allocation: a } = input;
  return [
    `MOVE: ${dec.type}`,
    `OBJECTIVE: ${dec.objective}`,
    `ALLOCATION: ${a.mode} — ${a.rationale}`,
    `KEEP WITH THEM: ${a.withhold ? `${a.withhold.what} (${a.withhold.reason})` : '(nothing — direct help is fine)'}`,
    `QUESTIONS ALLOWED: ${dec.maxQuestions}`,
    '',
    'ALREADY CONSIDERED:',
    ...(input.considered.length ? input.considered.slice(0, 20).map((c) => `- ${c}`) : ['(none)']),
    '',
    'WHAT THEY SAID:',
    userMessage.slice(0, 2000),
    '',
    'REPLY:',
    input.draft.slice(0, 8000),
  ].join('\n');
}

export function sanitizeGuard2(raw: unknown, draft: string): GuardOutcome & { redundant: string[] } {
  const ok: GuardOutcome & { redundant: string[] } = { action: 'ALLOW', findings: [], by: 'model', redundant: [] };
  if (!raw || typeof raw !== 'object') return { ...ok, by: 'none' };
  const r = raw as Record<string, unknown>;
  const actions = ['ALLOW', 'MODIFY_FOR_MORE_AGENCY', 'MODIFY_FOR_MORE_HELP', 'OVERRIDE_WITH_DIRECT_ANSWER', 'REQUEST_CLARIFICATION'];
  const action = (actions.includes(r.action as string) ? r.action : 'ALLOW') as GuardAction;
  const findings: GuardFinding[] = Array.isArray(r.findings)
    ? (r.findings as unknown[])
        .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
        .map((f) => ({
          side: (['overreach', 'underhelp', 'novelty'].includes(f.side as string) ? f.side : 'underhelp') as GuardFinding['side'],
          code: 'model',
          detail: String(f.detail ?? '').slice(0, 300),
        }))
        .slice(0, 6)
    : [];
  // Only sentences that are really in the draft: the model's output is used
  // to DELETE text, never to supply it (council D8 — a cheap model's prose
  // never reaches the person).
  const redundant = Array.isArray(r.redundant) ? (r.redundant as unknown[]).map(String).filter((s) => s.trim().length > 0 && draft.includes(s.trim())).slice(0, 6) : [];
  return { action, findings, by: 'model', redundant };
}
