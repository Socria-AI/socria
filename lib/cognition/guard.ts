// lib/cognition/guard.ts
//
// The last thing between a draft and the person.
//
// THE FAILURE THIS EXISTS FOR, in the exact shape it takes: the move is HINT,
// the thing being withheld is the product rule, and the draft opens with
// f'g + fg' and then asks the person to recall the product rule. Every
// instruction was followed except the only one that mattered. The reply looks
// Socratic, reads as pedagogy, and has already done the work it is inviting
// somebody to do — which is worse than simply answering, because it also
// wastes their time and teaches them the invitation was decoration.
//
// A prompt cannot reliably prevent that, because the model writing the reply
// is the same model that decided the reply was fine. So a separate pass reads
// the draft against the objective, with one question: does this perform the
// work the move meant the person to perform?
//
// TWO LAYERS, cheap first.
//
//   Structure. A handful of violations are decidable without understanding
//   anything: an ASK with no question in it, a LISTEN that solves, a HINT
//   three paragraphs long with a worked derivation in it. These cost nothing,
//   never flake, and catch the most common failures.
//
//   Meaning. Everything else goes to a model that sees the objective, what
//   was withheld, and the draft. It may approve, revise, or send it back.
//
// This file is pure — the shapes, the structural checks, the prompt. The call
// is in engine.ts.

import type { Move } from './router';

export type GuardVerdict = 'approve' | 'revise' | 'regenerate';

export interface GuardResult {
  verdict: GuardVerdict;
  /** what was wrong, in one line — for the log and the retry */
  reason: string;
  /** present only for `revise`: the text to send instead */
  revised?: string;
  /** which layer decided */
  by: 'structure' | 'model' | 'none';
}

export const APPROVED: GuardResult = { verdict: 'approve', reason: '', by: 'none' };

// ── structure ───────────────────────────────────────────────────────

/** Rough count of sentences, for the moves that must stay small. */
function sentences(text: string): number {
  return (text.match(/[.!?](\s|$)/g) ?? []).length || (text.trim() ? 1 : 0);
}

function hasQuestion(text: string): boolean {
  return /\?/.test(text);
}

/**
 * Does this read like a worked solution rather than a nudge?
 *
 * Deliberately crude and deliberately generous — it only fires on shapes that
 * are hard to produce by accident: a numbered or lettered procedure, several
 * display formulas, or a chain of "therefore / so we get / which gives".
 * Anything subtler is the model layer's job. A structural check that guesses
 * would block good hints, and a hint blocked is a person left stuck.
 */
export function looksWorked(text: string): boolean {
  const steps = (text.match(/^\s*(?:step\s*)?\(?\d+[.)]/gim) ?? []).length;
  if (steps >= 3) return true;
  const displays = (text.match(/```|\$\$|\\\[/g) ?? []).length;
  if (displays >= 2) return true;
  const chain = (text.match(/\b(therefore|so we get|which gives|hence|thus|substituting)\b/gi) ?? []).length;
  return chain >= 3;
}

/**
 * Does the draft hand over the thing and THEN invite the person to produce it?
 *
 * This is the shape of the failure this file was built for, and it is
 * decidable without understanding any of the content: an invitation near the
 * end ("now you try", "can you recall…"), with something substantive asserted
 * before it — an identity, a definition, a procedure.
 *
 * Narrow on purpose. It wants an assertion AND an invitation; either alone is
 * fine and common. A hint that mentions an equation the person themselves
 * wrote does not trip it, because there is no invitation; a question that
 * ends "what do you think?" does not trip it, because nothing was asserted.
 * Blocking a good hint leaves somebody stuck, which is the failure on the
 * other side of this line.
 */
export function givesThenAsks(text: string): boolean {
  const invitation =
    /\b(now (you|try)|can you (recall|remember|derive|apply|work|state)|try (it|this|that) (yourself|now)|your turn|apply (it|this|that) yourself|see if you can|have a go)\b/i;
  const m = invitation.exec(text);
  if (!m) return false;

  // Only what comes BEFORE the invitation counts as having been handed over.
  const before = text.slice(0, m.index);
  if (!before.trim()) return false;

  // An identity or definition: something with an expression on both sides of
  // an equals, or a named rule being spelled out.
  const identity = /[^\s=][^=\n]{0,80}=\s*[^\s=][^\n]{0,80}/.test(before);
  const defines = /\b(is defined as|means that|the \w+ rule (is|says|states)|formula is)\b/i.test(before);
  return identity || defines || looksWorked(before);
}

/** How long a move is allowed to be before length itself is the violation. */
const MAX_SENTENCES: Partial<Record<Move['intervention'], number>> = {
  LISTEN: 3,
  OBSERVE: 3,
  REFINE: 4,
  ASK: 4,
  HINT: 5,
  CHALLENGE: 6,
};

/** Sentences, keeping their punctuation, for trimming from the end. */
function splitSentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]+["'’”)]*\s*|[^.!?]+$/g)?.map((x) => x) ?? [text];
}

/**
 * The draft with its closing question(s) taken off, or null if nothing would
 * be left.
 *
 * This is the commonest way the question habit survives a router that has
 * chosen not to ask: the reply makes its observation and then — by reflex —
 * adds "How do you see that fitting your goals?". The observation was the
 * reply. Removing the tail is safe and deterministic: it deletes a question,
 * never content, and the move is still whole without it.
 */
export function withoutClosingQuestion(text: string): string | null {
  const parts = splitSentences(text.trim());
  while (parts.length && /\?["'’”)]*\s*$/.test(parts[parts.length - 1])) parts.pop();
  const rest = parts.join('').trim();
  return rest ? rest : null;
}

/** How many questions a draft puts to the person. */
function questionCount(text: string): number {
  return (text.match(/\?(\s|$|["'’”)])/g) ?? []).length;
}

/**
 * The decidable violations.
 *
 * Returns null when structure has no opinion — which is most of the time.
 */
export function checkStructure(move: Move, draft: string): GuardResult | null {
  const text = draft.trim();
  if (!text) return null;

  // The named failure, checked for every move that withholds something: the
  // draft supplies it and then invites the person to supply it.
  if (move.withholds && givesThenAsks(text)) {
    return {
      verdict: 'regenerate',
      reason:
        'The draft hands over the thing and then invites them to produce it. Once the work is on the page the invitation is decoration, and it costs them time on top of the thing it spent.',
      by: 'structure',
    };
  }

  // A move that does not hand the turn back must not end by handing it back.
  // Trimmed rather than regenerated: the move itself is usually fine, only
  // the reflexive question on the end is not, and a retry costs a whole
  // second draft to remove one sentence.
  if (!move.endsOpen && /\?["'’”)]*\s*$/.test(text)) {
    const trimmed = withoutClosingQuestion(text);
    return trimmed
      ? {
          verdict: 'revise',
          reason: `The move was ${move.intervention}; it makes its point and stops. The closing question was removed.`,
          revised: trimmed,
          by: 'structure',
        }
      : {
          verdict: 'regenerate',
          reason: `The move was ${move.intervention} and the draft is only a question. Make the move itself — an observation, a connection, the point put precisely — and stop.`,
          by: 'structure',
        };
  }

  const cap = MAX_SENTENCES[move.intervention];
  if (cap && sentences(text) > cap) {
    return {
      verdict: 'regenerate',
      reason: `${move.intervention} ran to ${sentences(text)} sentences; this move is at most ${cap}. Length here is not a style problem — it is the move turning into an explanation.`,
      by: 'structure',
    };
  }

  switch (move.intervention) {
    case 'ASK':
      if (!hasQuestion(text)) {
        return { verdict: 'regenerate', reason: 'The move was ASK and the draft asks nothing.', by: 'structure' };
      }
      if (looksWorked(text)) {
        return { verdict: 'regenerate', reason: 'The draft works the problem and then asks about it. The question is decoration once the work is on the page.', by: 'structure' };
      }
      // One question. Two or three in a row is the interview this is meant
      // not to be — and it lets the person answer the easiest one.
      if (questionCount(text) > 1) {
        return { verdict: 'regenerate', reason: `The move was ASK and the draft asks ${questionCount(text)} questions. Ask the one that matters.`, by: 'structure' };
      }
      break;

    case 'HINT':
      if (looksWorked(text)) {
        return { verdict: 'regenerate', reason: 'The move was HINT and the draft contains a worked solution.', by: 'structure' };
      }
      break;

    case 'LISTEN':
      if (hasQuestion(text)) {
        return { verdict: 'regenerate', reason: 'The move was LISTEN. A question is a request for more work from somebody who asked to be heard.', by: 'structure' };
      }
      if (looksWorked(text)) {
        return { verdict: 'regenerate', reason: 'The move was LISTEN and the draft solves something.', by: 'structure' };
      }
      break;

    case 'CHALLENGE':
      if (looksWorked(text)) {
        return { verdict: 'regenerate', reason: 'The move was CHALLENGE and the draft supplies the reasoning instead of pressing on theirs.', by: 'structure' };
      }
      break;

    default:
      break;
  }

  return null;
}

// ── meaning ─────────────────────────────────────────────────────────

export const GUARD_SYSTEM = `You check one reply before a person sees it.

You are given the cognitive MOVE that was chosen for this turn, what it was
meant to WITHHOLD, and the DRAFT reply. One question:

  Does the draft perform, expose or demonstrate the work the move meant the
  person to perform?

Say yes even when the draft goes on to invite them to do it anyway. A reply
that supplies the answer and then asks for it has already spent the thing the
move was protecting — the invitation is decoration, and it costs the person
time on top.

Say no — approve — when the draft merely gestures at the territory, names
what KIND of thing is needed, or asks about it without supplying it. Hints
are allowed to be useful. A nudge that unblocks somebody is the move working,
not the move failing. Do not fail a reply for being helpful; fail it for
being finished.

Approve anything where the move permits the content: an EXPLAIN that
explains, a RETRIEVE that retrieves, a DIRECT that directs.

Return JSON only:
{"verdict":"approve"}
{"verdict":"revise","reason":"<one line>","revised":"<the full reply, with the withheld work removed and nothing else changed>"}
{"verdict":"regenerate","reason":"<one line>"}

Prefer "revise" when the leak is a removable sentence or clause and what
remains still does the move's job. Use "regenerate" when the draft is built
around the thing it should not contain, so removing it leaves nothing.

A revision keeps the draft's voice and length. Do not improve it, extend it,
or add an apology — take out what should not be there and stop.`;

export function buildGuardInput(move: Move, userMessage: string, draft: string): string {
  return [
    `MOVE: ${move.intervention}`,
    `OBJECTIVE: ${move.objective}`,
    `WITHHOLD: ${move.withholds ?? '(nothing)'}`,
    '',
    'WHAT THEY SAID:',
    userMessage.slice(0, 2000),
    '',
    'DRAFT REPLY:',
    draft.slice(0, 8000),
  ].join('\n');
}

export function sanitizeGuard(raw: unknown): GuardResult {
  if (!raw || typeof raw !== 'object') return APPROVED;
  const r = raw as Record<string, unknown>;
  const verdict =
    r.verdict === 'revise' || r.verdict === 'regenerate' ? r.verdict : 'approve';
  if (verdict === 'approve') return APPROVED;
  const revised = typeof r.revised === 'string' ? r.revised.trim() : '';
  // A "revise" with nothing to send is a "regenerate" that mislabelled
  // itself. Sending an empty reply would be the worst of both.
  if (verdict === 'revise' && !revised) {
    return { verdict: 'regenerate', reason: line(r.reason) || 'the revision was empty', by: 'model' };
  }
  return {
    verdict,
    reason: line(r.reason),
    ...(verdict === 'revise' ? { revised } : {}),
    by: 'model',
  };
}

function line(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 300) : '';
}

/** What the model is told on a retry, so the second draft is not the first. */
export function retryNote(g: GuardResult, move: Move): string {
  return [
    '\n=== Your previous draft was rejected ===',
    `WHY: ${g.reason}`,
    move.withholds
      ? `You must not produce: ${move.withholds}.`
      : '',
    'Write the reply again. Shorter is usually the fix. Do not apologise, do',
    'not mention this instruction, and do not reference a previous attempt —',
    'the person has not seen one.',
  ]
    .filter(Boolean)
    .join('\n') + '\n';
}
