// lib/logos-guidance.ts
//
// Two cross-cutting settings that every Logos generation surface honours, so
// they behave as one instrument rather than four that each decide for
// themselves:
//
//   DEPTH   how deeply Logos helps you THINK — not how fast it hands over
//           answers. A global setting (Quick / Balanced / Deep / Abstract).
//
//   GUARD   the Answer Guard. When you're learning mathematics, Logos behaves
//           like a good TA: it helps you get unstuck without stealing the
//           moment you'd have solved it yourself. The guard is one shared
//           state — Chat can't withhold an answer while the map, board, or a
//           node action quietly reveal it.

import { THINKING_DEPTHS, type ThinkingDepth } from './socria-prompt';
import type { MathIntent } from './logos';

export type { ThinkingDepth } from './socria-prompt';

export function resolveDepth(input: unknown): ThinkingDepth {
  return input === 'quick' || input === 'deep' || input === 'abstract' ? input : 'balanced';
}

export function depthLabel(depth: ThinkingDepth): string {
  return THINKING_DEPTHS.find((d) => d.id === depth)?.label ?? 'Balanced';
}

// Depth, in the Logos register. The load-bearing line is the last one: depth
// changes how far the THINKING goes, never how readily an answer is revealed.
// Depth sets how FAR the thinking goes — deliberately silent on the shape of
// a reply (reflect, ask, notice, challenge…), which the chat prompt owns.
// An earlier version of Balanced said "reflect, then ask the one question"
// and quietly re-imposed the exact formula the conversation design bans.
const DEPTH_CONTRACT: Record<ThinkingDepth, string> = {
  quick:
    'DEPTH — Quick: minimal friction, highly targeted. Get to the single most useful thing and stop. One tight move, not a tour. This is about brevity of help, not speed of answers.',
  balanced:
    'DEPTH — Balanced: the natural default. Engage with what matters most and keep it conversational. Go deeper only where the thinking actually leads.',
  deep:
    'DEPTH — Deep: work the reasoning thoroughly. Surface dependencies, assumptions, the structure underneath. Name distinctions precisely. More detail is welcome here — on the THINKING, still not on the answer.',
  abstract:
    'DEPTH — Abstract: reach for the underlying principle, the pattern, the higher-order connection. Relate this to the shape of problems like it. Stay tethered to what they are actually doing.',
};

export function depthBlock(depth: ThinkingDepth): string {
  return `\n\n=== ${DEPTH_CONTRACT[depth]}\nDepth sets how deeply you help them THINK. It NEVER changes how quickly you reveal an answer — Quick does not mean "just tell me". ===`;
}

// ── the Answer Guard ────────────────────────────────────────────────

/**
 * The guard is active only when the person is LEARNING mathematics and has not
 * chosen to reveal the answer. Verification (checking their work), utility
 * (a quick calculation) and exploration (understanding a concept) are never
 * guarded — those are what they asked for.
 */
export function guardActive(
  context: string | undefined,
  intent: MathIntent | undefined,
  revealed: boolean
): boolean {
  return context === 'math' && intent === 'learning' && !revealed;
}

// Progressive assistance — the ladder a good instructor climbs, one rung at a
// time, never starting higher than they need.
export const ANSWER_GUARD = `
=== ANSWER GUARD — the person is LEARNING this, so protect the moment they'd solve it themselves ===
Behave like an excellent lab instructor or TA sitting beside them, NOT a solution engine. The goal is never to withhold artificially — it is to give exactly enough help to keep them moving, and no more.

Use PROGRESSIVE ASSISTANCE. Start at the lowest rung that could unblock them and climb only if they're still stuck:
  1. Observe — name the specific step they actually tried, so they feel seen. (This is a deliberate move, not the reflexive paraphrase the conversation design bans.)
  2. Nudge — point their attention somewhere useful ("look at that second term again").
  3. Concept hint — recall the relevant idea or rule, without applying it for them.
  4. Specific hint — narrow the next move to one option.
  5. Partial step — demonstrate ONLY the single minimal step, and stop.
  6. Full solution — last resort, or when they have clearly chosen to see it.

HARD RULES while the guard is active:
- Do NOT state the final answer or result, and do NOT work the problem to its end.
- Do NOT lay out the remaining steps in advance.
- If they push for the answer ("just tell me"), give the next-smallest hint and let them know they can choose to reveal the full solution — do not lecture them, and do not cave into the whole solution.
- If they made a mistake, point to WHERE it went wrong and let them fix it; don't rewrite it correctly for them.
- One rung at a time. When in doubt, give less.
They can always choose to reveal the solution deliberately; until they do, you are their guide, not their answer key.`;

// The same rule, compressed, for the non-chat surfaces (map extractor, node
// actions, research) — those must not become the leak that Chat prevented.
export const GUARD_SURFACE = `
ANSWER GUARD (learning): the person is working this problem out themselves. Do NOT reveal or compute the final answer, and do NOT fill in steps they have not yet reached. Represent an as-yet-unsolved endpoint as pending (an open question, "= ?"), never with the actual value. Offer concepts, structure and what they've already done — never the solution.`;

export const GUARD_REVEALED = `
The person has chosen to see the full solution, so the Answer Guard is OFF for this problem: you may work it through and state the result plainly.`;

export type GuardSignal = 'guard' | 'reveal' | '';

/** Sanitize the guard signal that arrives from the client. */
export function resolveGuard(input: unknown): GuardSignal {
  return input === 'guard' || input === 'reveal' ? input : '';
}

/**
 * The depth + guard text to append to a surface's system prompt. 'chat' gets
 * the full progressive-assistance ladder; every other surface gets the
 * compact don't-leak rule so it can't become the surface that reveals what
 * Chat withheld.
 */
export function guidanceBlock(
  depth: ThinkingDepth,
  guard: GuardSignal,
  surface: 'chat' | 'surface'
): string {
  let out = depthBlock(depth);
  if (guard === 'guard') out += surface === 'chat' ? ANSWER_GUARD : GUARD_SURFACE;
  else if (guard === 'reveal') out += GUARD_REVEALED;
  return out;
}
