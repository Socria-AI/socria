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

import { danglingCitations } from './web';
import type {
  Allocation,
  GuardAction,
  GuardFinding,
  GuardOutcome,
  InterventionDecision,
  NoveltyVerdict,
} from './types';
import { questionLoad, stripInterrogatives, hasSycophanticOpener, stripSycophanticOpener, hasFillerOpener, stripFillerOpener, sentencesOf, interrogatives, deleteSentences } from './questions';
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
  /** the person's own problem text: a worked solution is overreach only if it works THIS problem (council D8) */
  target?: string;
  /**
   * The sources this turn was actually given, if any.
   *
   * Two things turn on it. A reply may say it looked something up only when
   * something was looked up — the tool-claim strip below is unchanged for
   * every turn that searched nothing, which is still almost all of them. And
   * a citation may only point at a source that exists: [4] beside three
   * sources is an invented reference, and inventing references is the
   * failure mode that makes a cited answer worse than an uncited one.
   */
  sources?: { n: number }[];
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

/**
 * Does a worked draft work THEIR problem (council D8, target-aware)? Only if
 * it reuses at least half of the problem's specific givens — its numbers
 * and code identifiers. An analogous worked example, or a general method
 * ("print lo, hi and mid each iteration"), is not their problem worked.
 * Without a target, assume it is (the old, stricter behaviour).
 */
export function worksTarget(draft: string, target?: string): boolean {
  if (!target) return true;
  const givens = new Set<string>([
    ...(target.match(/\b\d+(?:\.\d+)?\b/g) ?? []).filter((n) => n.length >= 2 || Number(n) > 1),
    ...(target.match(/\b[A-Za-z_][A-Za-z0-9_]*(?=\()|\b[a-z]+_[a-z0-9_]+\b|\b[a-z]+[A-Z][A-Za-z0-9]*\b/g) ?? []),
  ]);
  if (givens.size < 2) return true;
  let used = 0;
  for (const g of givens) if (new RegExp(`(^|[^A-Za-z0-9_.])${g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^A-Za-z0-9_])`).test(draft)) used++;
  return used / givens.size >= 0.5;
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

/**
 * Sentences containing any hidden value — matched as a VALUE, not a
 * substring (council D8): a hidden 4.2 is not in 14.2 or 4.25, and a hidden
 * word must stand as a whole word.
 */
export function leaksHidden(draft: string, hidden: string[]): string[] {
  const vals = hidden.map((v) => v.trim()).filter((v) => v.length >= 1);
  if (!vals.length) return [];
  const matchers = vals.map((v) => {
    const n = Number(v.replace(/,/g, ''));
    if (Number.isFinite(n) && /^-?[\d,]*\.?\d+$/.test(v.replace(/\s/g, ''))) {
      return (s: string) =>
        (s.replace(/(\d),(?=\d{3}\b)/g, '$1').match(/-?\d+(?:\.\d+)?/g) ?? []).some((x) => Math.abs(Number(x) - n) <= Math.max(1e-9, Math.abs(n) * 1e-9));
    }
    if (v.length < 3) return () => false;
    const nv = norm(v);
    return (s: string) => norm(s).includes(nv) && new RegExp(`(^|[^a-z0-9])${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*')}($|[^a-z0-9])`, 'i').test(s);
  });
  return sentencesOf(draft).filter((s) => matchers.some((m) => m(s)));
}

/** Claims of tools Socria does not have in this path (council D7/D8). */
const TOOL_CLAIM = /\bi(?:'ve| have)? (?:just )?(?:searched|googled|looked (?:it |this |that )?up|ran (?:the|your|this|that) (?:code|script|query|numbers)|browsed|checked (?:online|the web|the internet|(?:it|this|that) numerically|(?:it|this|that) in (?:python|code|a script)))\b/i;

/** An inference about the person stated as fact (council D8). */
const TRAIT_AS_FACT = /\byou(?:'re| are) (?:clearly |obviously )?(?:a beginner|an expert|anxious|insecure|defensive|overwhelmed)\b|\byou tend to\b|\byou seem (?:anxious|stressed|upset|frustrated|overwhelmed)\b/i;

/** Coherence floor (council D8): an edit that guts the reply is not shipped. */
export function coherent(original: string, edited: string, sizeMatters = true): boolean {
  if (!edited.trim()) return false;
  if (sizeMatters && edited.length < original.length * 0.75) return false;
  if (/(^|\n)\s*(?:\d+[.)]|[-*•])\s*$/m.test(edited)) return false;
  const first = (sentencesOf(edited)[0] ?? '').trim();
  if (/^(?:here are|the following|the (?:two|three|four|five)\b)/i.test(first) && sentencesOf(edited).length < 2) return false;
  if (/^(?:because|so|that|this|which|and|but)\b/i.test(first) && !/^(?:because|so|that|this|which|and|but)\b/i.test((sentencesOf(original)[0] ?? '').trim())) return false;
  return true;
}

/** A draft with some sentences removed; null if nothing of substance is left. */
/**
 * The draft with those sentences gone — or null when it cannot be done.
 *
 * The re-check is the point. deleteSentences shields fenced code so it never
 * mangles a snippet, and leaksHidden reads THROUGH fences, so a withheld
 * value written inside ``` was detected, "removed" by a delete that refused
 * to touch it, and shipped: the guard recorded a hidden_value finding, set
 * MODIFY_FOR_MORE_AGENCY, and passed the unchanged draft on. A removal that
 * is not verified is not a removal. Returning null here sends the turn to
 * regeneration or to fallbackReply instead, which is the behaviour the
 * withhold guarantee is supposed to have.
 */
function without(draft: string, drop: string[], recheck: string[] = drop): string | null {
  const kept = deleteSentences(draft, drop);
  if (!kept) return null;
  if (leaksHidden(kept, recheck).length) return null;
  return sentencesOf(kept).some((s) => s.trim().split(/\s+/).length >= 4) ? kept : null;
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
  // Did an edit remove SUBSTANCE (a statement), rather than a trailing
  // question, an offer, an opener or a withheld value? Only then does the
  // 25% size floor apply (council D4/D8).
  let substantive = false;

  if (!draft) {
    return { action: 'MODIFY_FOR_MORE_HELP', findings: [{ side: 'underhelp', code: 'empty', detail: 'The draft is empty.' }], retryNote: 'Write the reply.', by: 'structure', needsModel: false, novelty: [] };
  }

  // ── OVERREACH ──
  if (a.withhold) {
    const leaked = leaksHidden(draft, input.hidden ?? []);
    if (leaked.length) {
      findings.push({ side: 'overreach', code: 'hidden_value', detail: 'The draft states the value verify mode kept private.' });
      // Re-check against the VALUES, not against the sentences just deleted.
      // `leaksHidden` returns sentences, so passing `leaked` asked "does the
      // kept text still contain one of the sentences I removed?" — which is
      // only equivalent to the question that matters while deletion leaves
      // sentence boundaries untouched, an invariant nothing states or tests.
      // Found by an adversarial audit. It could not be made to leak (the
      // fenced case this function exists for is caught either way, because
      // the shielded fence line is itself one of the leaked sentences), so
      // this is correctness, not a fix for an observed failure — but a
      // withhold guarantee should not rest on an accident of segmentation.
      const rest = without(draft, leaked, input.hidden ?? []);
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
    if (!retryNote && (dec.type === 'HINT' || dec.type === 'VERIFY' || dec.type === 'QUESTION') && looksWorked(draft) && worksTarget(draft, input.target)) {
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
    // Word overlap may DELETE only a re-asked question. A statement that
    // overlaps a considered item is sent to the model check instead: in the
    // pilot, lexical deletion removed the correct formula because it named
    // the function the person had ruled out, and the key computation of a
    // reply because it used their own figures (docs/CORE-4-EVALS.md, pilot
    // findings 2 and 4; CORE-4-EXPERIMENTS.md E5, reversal applied).
    novelty = gateCandidates(draft, whole).map((s) => {
      const v = classify(s, considered);
      return v.verdict === 'REDUNDANT' && !/\?["'’”)\]]*\s*$/.test(s.trim()) ? { ...v, verdict: 'UNCERTAIN' as const } : v;
    });
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
        substantive = substantive || redundant.some((r) => !/\?["'’”)\]]*\s*$/.test(r.sentence.trim()));
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
  // Deflection only when NO sentence commits to anything (council D8): "it
  // depends on X; for your case, A" is an answer.
  const commits = sentencesOf(draft).some((s) => !DEFLECT.test(s) && !/\?\s*$/.test(s.trim()) && s.trim().split(/\s+/).length >= 6);
  if (!retryNote && !commits && MACHINE_DOES.has(a.mode) && DEFLECT.test(draft) && (dec.type === 'ANSWER' || dec.type === 'EXPLAIN' || dec.type === 'EXECUTE' || dec.type === 'CALCULATE')) {
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

  // Generic reassurance, on a turn that asked for one or two sentences.
  //
  // The move block already forbids it, and a prompt is a probability: someone
  // who gets "it's completely natural to feel uncertain at this stage" is not
  // consoled by the instruction having existed. Gated to `proportion === 'brief'`
  // and to the OPENING sentence only — mid-reply the same words can be a real
  // caveat, and council D4 forbids cutting from the middle of a reply anyway.
  if (dec.proportion === 'brief' && hasFillerOpener(draft)) {
    findings.push({ side: 'voice', code: 'filler', detail: 'Opens with generic reassurance or a hedge.' });
    const rest = stripFillerOpener(draft);
    if (rest) {
      draft = rest;
      changed = true;
    } else {
      // Nothing substantive survived it: the reply WAS the reassurance.
      action = 'MODIFY_FOR_MORE_HELP';
      retryNote = 'Drop the reassurance and the general advice. Say the one true, specific thing about their situation — or, if there is nothing yet, ask for the single piece of information that would change that.';
    }
  }

  // ── no verdict where one is owed (council D8) ──
  if (!retryNote && (dec.type === 'CORRECT' || dec.type === 'VERIFY') && !/\b(right|correct|wrong|incorrect|not quite|mistake|error|exactly|yes|no,|slip|off|close|almost|nearly|isn'?t|doesn'?t (?:hold|work))\b/i.test(draft)) {
    findings.push({ side: 'underhelp', code: 'no_verdict', detail: 'A check with no verdict.' });
    action = 'MODIFY_FOR_MORE_HELP';
    retryNote = 'Say plainly, in the first sentence, whether their attempt is right.';
  }

  // ── claims Socria cannot back; inferences about them stated as fact ──
  // A tool claim is only unbacked when there was no tool. When the turn
  // carries sources, "I looked this up" is a true sentence and stripping it
  // would leave the reply quoting pages it refuses to admit reading.
  const searched = (input.sources?.length ?? 0) > 0;
  const unbacked = sentencesOf(draft).filter((s) => (!searched && TOOL_CLAIM.test(s)) || TRAIT_AS_FACT.test(s));
  if (unbacked.length && !retryNote) {
    const rest = deleteSentences(draft, unbacked.map((s) => s.trim()));
    findings.push({ side: 'voice', code: 'unbacked_claim', detail: 'A tool claim or a trait stated as fact.' });
    if (rest) {
      // A voice strip (council D8's always-strip list), not lost substance.
      draft = rest;
      changed = true;
    }
  }

  // ── a citation that points at nothing (web evidence) ──
  //
  // Checked rather than trusted, and checkable because the block asks for
  // numbers instead of URLs: a fabricated [4] is one comparison, where a
  // fabricated link is a network request nobody is going to make. The marker
  // is removed rather than the sentence — the claim may well be right, and
  // deleting a sentence over its footnote loses more than it protects.
  if (searched) {
    const dangling = danglingCitations(draft, input.sources ?? []);
    if (dangling.length) {
      findings.push({ side: 'voice', code: 'dangling_citation', detail: `Cited ${dangling.map((n) => `[${n}]`).join(', ')}, which was never given.` });
      const cleaned = draft.replace(/\s*\[(\d{1,2})\]/g, (m, d) => (dangling.includes(Number(d)) ? '' : m));
      if (cleaned.trim()) {
        draft = cleaned;
        changed = true;
      }
    }
  }

  // ── the coherence floor: never ship an edit that guts the reply ──
  if (changed && !retryNote && !coherent(input.draft.trim(), draft, substantive)) {
    findings.push({ side: 'underhelp', code: 'coherence_floor', detail: 'Edits would remove too much or leave the reply dangling.' });
    action = 'MODIFY_FOR_MORE_HELP';
    retryNote = 'Rewrite the reply so it keeps all its substance and contains no questions beyond what is allowed; state claims instead of asking them.';
    draft = input.draft.trim();
    changed = false;
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

REDUNDANCY: a sentence PROPOSES, as if new, something listed under ALREADY CONSIDERED — the same suggestion, objection, alternative or question, even in different words. A sentence is NOT redundant if it uses, applies, quantifies, contrasts with or builds past a considered item ("you ruled out NETWORKDAYS; NETWORKDAYS.INTL takes the weekend as an argument", "against your $40M pledge that leaves $12M"). Mentioning a considered thing is not raising it. If you are not sure a sentence is redundant, do not list it: deleting a useful sentence is worse than keeping a repeated one.

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
