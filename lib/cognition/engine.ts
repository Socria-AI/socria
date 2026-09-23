import 'server-only';
// lib/cognition/engine.ts
//
// The cheap-model calls Core 4's cognition needs, and nothing else:
//
//   readState()   before the reply — the state reader (one call carries the
//                 inferred state, what the person just raised, and how
//                 Socria's last move landed, so the already-considered record
//                 and the outcome loop cost no extra call)
//   guardModel()  after the draft, ONLY when deterministic checks leave a
//                 question open (a semantic leak, a paraphrased redundancy)
//   checkWork()   Verify Mode's private checker — its solution never reaches
//                 the model that writes the reply
//
// All fail SOFT, in chosen directions: a failed state read carries last
// turn's state forward (never an empty state that routes to asking); a failed
// guard model call keeps the deterministic verdict; a failed check means no
// verdict is claimed.

import { modelClient } from '../core4/model';
import { sanitizeState, type CognitiveState } from './state';
import { GUARD2_SYSTEM, buildGuard2Input, sanitizeGuard2, type GuardInput } from '../core4/guard2';
import { CHECK_SYSTEM, buildCheckInput, sanitizeCheck, type CheckResult } from '../core4/verify';
import type { GuardOutcome } from '../core4/types';

/** Cheap, and separate from whatever the conversation is running on. */
export const COGNITION_MODEL = process.env.OPENAI_MODEL_COGNITION || 'gpt-4o-mini';

export const STATE_SYSTEM = `You read a conversation and report where it stands. You do not reply to it. You report EVIDENCE about the person's current task and reasoning — never traits, personality, intelligence or mental health.

Return JSON with exactly these fields:

currentGoal   what the person is ultimately trying to do, one line
currentFocus  what is on the table this minute, one line
taskKind      learn | decide | create | lookup | debug | explore | vent
work          what THEIR LATEST MESSAGE asks for, as a cognitive operation:
              information  a fact, a definition, what something means
              execution    do/compute/convert/write/run something
              explanation  how or why something works
              practice     they are producing it themselves and that is the point
              verification check my work / is this right
              diagnosis    why is this broken
              judgment     weigh this / decide
              creation     make or improve something
              research     find out / gather evidence
              reflection   thinking out loud or wanting to be heard
              conversation acknowledgement, small talk, a reaction

learningGoal  {"value":"yes|no|unknown","confidence":0-1,"evidence":"<their words>"}
              Is building THIS capability the point for them? "yes" only on real
              evidence (they said so, or they are clearly doing practice problems
              for a course). Asking a question is NOT evidence of wanting to learn.
expertise     {"value":"novice|intermediate|expert|unknown","confidence":0-1,"evidence":"..."}
              In what is on the table, from what they have SHOWN (vocabulary used
              correctly, the objections they anticipate, what they take for granted).
stakes        {"value":"low|medium|high","confidence":0-1,"evidence":"..."}
authorship    {"value":"theirs|shared|none","confidence":0-1,"evidence":"..."}
              "theirs" when the product must remain their own work (their essay,
              their thesis argument, their decision).

demonstratedUnderstanding  none | partial | solid   (what they have SHOWN)
attempt       none | wrong | partial | right        (their attempt in the LATEST message only)
stuck         no | stalled | looping | frustrated
masteryEvidence  short observations of what they have shown they can do
confusions    specific things they are stuck on, in their words
positions     what they have committed to
assumptions   what they take for granted without saying so
tensions      where their own statements pull against each other
constraints   what bounds this
openThreads   raised and not resolved
recentChanges [{"what","from","to"}] — positions that MOVED
latest        answer | information | question | attempt | reaction | request | other
resolved      true | false — does their latest message resolve what Socria last asked?
newRelation   "A → how → B": a connection their latest message makes between things already on the table, or ""
blockingUnknown  the ONE thing that genuinely blocks any useful reply, or "" (usually "")
practice      none | retrieval | prediction | self-explanation | application
urgency       none | some | high   ("high" = real time pressure in the world)
supportLevel  listen | question | hint | partial | explain | demonstrate

consideredNow [{"kind":"question|objection|assumption|alternative|claim|hypothesis|evidence|decision|uncertainty|conclusion","text":"<tight paraphrase>","quote":"<their EXACT words from their latest message, copied verbatim>","stance":"asserts|entertains|asks|rejects|accepts|resolved","reason":"<why, if they rejected or changed it>"}]
              Considerations THE PERSON raised IN THEIR LATEST MESSAGE: questions
              they asked themselves, objections they anticipated, alternatives
              they named, assumptions they examined, checks they ran, approaches
              they rejected (and why). "quote" must be copied character for
              character from their latest message — an item without one is not
              recorded as theirs. stance: "asserts" only if they plainly hold
              it; raising or wondering is "entertains"; asking is "asks";
              ruling it out is "rejects". NEVER include anything Socria said.
              Empty if none.

lastOutcome   {"label":"HELPED|PARTIALLY_HELPED|WAS_REDUNDANT|CONFUSED_USER|FRUSTRATED_USER|WAS_TOO_DIRECT|WAS_TOO_INDIRECT|UNLOCKED_PROGRESS|REVEALED_MASTERY|REVEALED_MISUNDERSTANDING|UNKNOWN","confidence":0-1,"evidence":"..."}
              How Socria's PREVIOUS reply landed, judged ONLY from their latest
              message. One turn is weak evidence: keep confidence modest unless
              they said so outright. UNKNOWN when there was no previous reply or
              no signal.

Be conservative. Empty lists and "unknown" are good answers.`;

export interface ReadContext {
  transcript: string;
  prior: CognitiveState | null;
  /** what the person has already considered, from the ledger, for continuity */
  considered?: string[];
  /** the person's standing instructions (Project) */
  instructions?: string;
}

function compactPrior(p: CognitiveState): Record<string, unknown> {
  return {
    currentGoal: p.currentGoal,
    currentFocus: p.currentFocus,
    taskKind: p.taskKind,
    learningGoal: p.learningGoal,
    expertise: p.expertise,
    stakes: p.stakes,
    authorship: p.authorship,
    demonstratedUnderstanding: p.demonstratedUnderstanding,
    positions: p.positions,
    tensions: p.tensions,
    openThreads: p.openThreads,
    masteryEvidence: p.masteryEvidence,
  };
}

export async function readState(apiKey: string, ctx: ReadContext): Promise<{ state: CognitiveState; ok: boolean }> {
  const parts: string[] = [];
  if (ctx.instructions?.trim()) parts.push(`Their standing instructions for this Project:\n${ctx.instructions.trim().slice(0, 1200)}`);
  if (ctx.prior) parts.push(`Where it stood last turn:\n${JSON.stringify(compactPrior(ctx.prior))}`);
  if (ctx.considered?.length) parts.push(`Already recorded as considered by them:\n${ctx.considered.slice(0, 20).map((c) => `- ${c}`).join('\n')}`);
  parts.push(`The conversation:\n${ctx.transcript}`);
  try {
    const res = await modelClient(apiKey).complete({
      role: 'state',
      model: COGNITION_MODEL,
      temperature: 0,
      json: true,
      system: STATE_SYSTEM,
      messages: [{ role: 'user', content: parts.join('\n\n') }],
      maxTokens: 1100,
    });
    return { state: sanitizeState(JSON.parse(res.text || '{}')), ok: true };
  } catch (e) {
    console.error('[socria/cognition] state read failed; carrying the prior state forward', e);
    return { state: sanitizeState(null), ok: false };
  }
}

/** The cheap-model half of Answer Guard 2.0. */
export async function guardModel(apiKey: string, input: GuardInput, userMessage: string): Promise<(GuardOutcome & { redundant: string[] }) | null> {
  try {
    const res = await modelClient(apiKey).complete({
      role: 'guard',
      model: COGNITION_MODEL,
      temperature: 0,
      json: true,
      system: GUARD2_SYSTEM,
      messages: [{ role: 'user', content: buildGuard2Input(input, userMessage) }],
      maxTokens: 1400,
    });
    return sanitizeGuard2(JSON.parse(res.text || '{}'), input.draft);
  } catch (e) {
    console.error('[socria/cognition] guard model unavailable; keeping the deterministic verdict', e);
    return null;
  }
}

/** Verify Mode's private checker. Its reasoning never reaches the reply model. */
export async function checkWork(apiKey: string, problem: string, attempt: string): Promise<CheckResult | null> {
  try {
    const res = await modelClient(apiKey).complete({
      role: 'verify',
      model: COGNITION_MODEL,
      temperature: 0,
      json: true,
      system: CHECK_SYSTEM,
      messages: [{ role: 'user', content: buildCheckInput(problem, attempt) }],
      maxTokens: 900,
    });
    return sanitizeCheck(JSON.parse(res.text || '{}'));
  } catch (e) {
    console.error('[socria/cognition] verify checker unavailable', e);
    return null;
  }
}
