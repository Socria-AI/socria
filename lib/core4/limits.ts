// lib/core4/limits.ts
//
// How much Core 4 a free account gets.
//
// THREE CHATS A DAY, NOT THREE MESSAGES. The unit people think in is the
// conversation: somebody who opens Core 4, works a problem for twenty turns and
// closes it has used one of their three, and coming back to that thread tomorrow
// does not cost another. A per-message cap would end a conversation mid-thought,
// which is the one thing this product should never do.
//
// WHY THERE IS A CAP AT ALL. Core 4 is three model calls on a typical turn and
// up to seventeen on an expert, high-stakes one, on the frontier model, with
// attachments up to ~120k characters. The audit found the only server-side gate
// was "are you signed in", so one free signup had 400 frontier turns a day with
// no spend ceiling — named there as the budget risk most worth closing before
// opening the doors. This closes it.
//
// Pure: the policy is here and the counting is in store.ts, so the rule can be
// read and tested without a database.

/** Distinct Core 4 conversations a free account may start in one day. */
export const FREE_CORE4_CHATS_PER_DAY = 3;

export type Core4Plan = 'free' | 'one';

/**
 * Midnight for the person's day, in UTC.
 *
 * UTC AND NOT THEIR ZONE, deliberately: the client's offset is caller-supplied
 * and a cap that resets whenever the browser says so is not a cap. The cost of
 * being honest about it is that the reset lands at a different local hour for
 * different people, which is the ordinary behaviour of every quota they already
 * live with.
 */
export function dayStart(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export interface ChatAllowance {
  allowed: boolean;
  /** conversations already used today */
  used: number;
  limit: number;
  /** true when this exact conversation is already one of the used ones */
  continuing: boolean;
}

/**
 * May this account send this Core 4 turn?
 *
 * CONTINUING A CHAT IS ALWAYS FREE, including the fourth one of the day: the
 * limit is on how many conversations are STARTED, and a thread already counted
 * stays open. Somebody halfway through working something out does not hit a wall
 * because the clock rolled past their third chat.
 *
 * A failed count is not a refusal. `ok: false` from the store means the database
 * could not answer, and the direction that fails closed for cost is the one that
 * fails open for the person — so a read error lets the turn through and is
 * logged. A cap that eats somebody's conversation during a database blip is
 * worse than a few turns of overage.
 */
export function core4ChatAllowed(input: {
  plan: Core4Plan;
  /** distinct conversation ids that already used Core 4 today */
  usedToday: readonly string[];
  conversationId: string | null;
  countOk?: boolean;
}): ChatAllowance {
  const limit = FREE_CORE4_CHATS_PER_DAY;
  const used = new Set(input.usedToday).size;
  const continuing = !!input.conversationId && input.usedToday.includes(input.conversationId);
  if (input.plan === 'one' || input.countOk === false) {
    return { allowed: true, used, limit, continuing };
  }
  return { allowed: continuing || used < limit, used, limit, continuing };
}

/** What the person is told, in their words, when the day's chats are gone. */
export function limitMessage(a: ChatAllowance): string {
  return (
    `You have used your ${a.limit} Core 4 conversations for today. ` +
    `Core 3.1 and Core 2 are open — or come back tomorrow, or upgrade for unlimited Core 4. ` +
    `Conversations you have already started with Core 4 stay open.`
  );
}
