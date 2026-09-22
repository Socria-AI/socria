import 'server-only';
// lib/cognition/engine.ts
//
// The two model calls the Cognitive State Engine needs, and nothing else.
//
// readState() runs before the reply and produces the state the router reads.
// guardDraft() runs after the draft and before anybody sees it.
//
// Both are cheap-model calls, both fail SOFT, and the direction each fails in
// is chosen rather than incidental:
//
//   A failed state read yields an empty state. The router then sees a person
//   who has shown nothing and attempted nothing, and asks rather than
//   answers. Erring toward asking is the recoverable mistake; erring toward
//   answering spends the thing the whole design protects.
//
//   A failed guard APPROVES. That is the uncomfortable one and it is
//   deliberate: the alternative is that an outage means nobody gets a reply.
//   A guard that blocks when it cannot think is a guard that takes the
//   product down, and the failure it prevents — one leaked answer — is
//   smaller than that. It is logged every time.

import OpenAI from 'openai';
import { sanitizeState, type CognitiveState } from './state';
import { buildGuardInput, checkStructure, sanitizeGuard, APPROVED, GUARD_SYSTEM, type GuardResult } from './guard';
import type { Move } from './router';

/** Cheap, and separate from whatever the conversation is running on. */
export const COGNITION_MODEL = process.env.OPENAI_MODEL_COGNITION || 'gpt-4o-mini';

const STATE_SYSTEM = `You read a conversation and report where it stands. You do not reply to it.

Return JSON with exactly these fields:

currentGoal   what the person is ultimately trying to do, one line
currentFocus  what is on the table this minute, one line
taskKind      learn | decide | create | lookup | debug | explore | vent
              learn  = building a skill; independence is the point
              decide = weighing something; their judgement is the point
              create = making something; their authorship is the point
              lookup = they want a fact
              debug  = something is broken
              explore= thinking out loud, no destination yet
              vent   = they want to be heard, not helped

demonstratedUnderstanding  none | partial | solid
              What they have SHOWN, not what they claim and not what they
              were told. Being told something clearly is not understanding it.

attempt       none | wrong | partial | right
              Did they try it themselves in this conversation, and how did it
              go? "none" if they only asked. Judge the attempt they made, not
              whether they seem capable.

confusions    the specific things they are stuck on, in their words
positions     what they have committed to — claims, choices, stances
assumptions   what they are taking for granted without having said so
tensions      where their own statements pull against each other
constraints   what bounds this: time, money, a person, a deadline
openThreads   raised and not resolved
recentChanges [{"what","from","to"}] — positions that MOVED during this
              conversation. Only real changes of position.

urgency       none | some | high
              "high" means real time pressure in the world — a deadline
              today, something broken in production. Not impatience, not a
              short message, not exclamation marks.

supportLevel  listen | question | hint | partial | explain | demonstrate
              How much help this conversation currently warrants, given what
              they have shown. Move it up when they repeatedly fail or lack a
              prerequisite; move it down as they demonstrate more.

Be conservative. An empty list is a fine answer, and so is "none". You are
not being asked to find something in every field.`;

export async function readState(
  apiKey: string,
  transcript: string,
  prior: CognitiveState | null
): Promise<CognitiveState> {
  try {
    const openai = new OpenAI({ apiKey });
    const res = await openai.chat.completions.create({
      model: COGNITION_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: STATE_SYSTEM },
        {
          role: 'user',
          content: prior
            ? `Where it stood last turn:\n${JSON.stringify(prior)}\n\nThe conversation:\n${transcript}`
            : `The conversation:\n${transcript}`,
        },
      ],
      max_tokens: 900,
    });
    return sanitizeState(JSON.parse(res.choices[0]?.message?.content ?? '{}'));
  } catch (e) {
    // An empty state routes toward asking. See the header. Logged because a
    // state that silently never reads looks exactly like a conversation where
    // nothing has been shown — the safe direction, but an invisible one, and
    // those need telling apart.
    console.error('[socria/cognition] state read failed; routing from an empty state', e);
    return sanitizeState(null);
  }
}

/**
 * Read a draft before the person does.
 *
 * Structure decides first and for free; the model only sees what structure
 * had no opinion about.
 */
export async function guardDraft(
  apiKey: string,
  move: Move,
  userMessage: string,
  draft: string
): Promise<GuardResult> {
  if (!move.guard) return APPROVED;

  const structural = checkStructure(move, draft);
  if (structural) return structural;

  try {
    const openai = new OpenAI({ apiKey });
    const res = await openai.chat.completions.create({
      model: COGNITION_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: GUARD_SYSTEM },
        { role: 'user', content: buildGuardInput(move, userMessage, draft) },
      ],
      max_tokens: 1400,
    });
    return sanitizeGuard(JSON.parse(res.choices[0]?.message?.content ?? '{}'));
  } catch (e) {
    console.error('[socria/cognition] answer guard unavailable; approving', e);
    return APPROVED;
  }
}
