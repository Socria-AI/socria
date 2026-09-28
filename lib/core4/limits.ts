// lib/core4/limits.ts
//
// How much Core 4 a free account gets.
//
// TWO CONVERSATIONS A MONTH, NOT TWO MESSAGES. The unit people think in is the
// conversation: somebody who opens Core 4, works a problem for twenty turns and
// closes it has used one of their two, and coming back to that same thread next
// week does not cost another. A per-message cap would end a conversation
// mid-thought, which is the one thing this product should never do.
//
// WHY A MONTH, AND WHY TWO. It matches the free tier the rest of the product
// already sells past — `chats: 2` in lib/entitlements.ts, per calendar month,
// which is how many lines of thinking a free account gets in Logos. Two numbers
// for the same idea would disagree with each other the first time either one
// moved, and a person who has met the Logos boundary should meet the same one
// here rather than a second, differently shaped one. It used to be three a day,
// which was a spend ceiling rather than a boundary the product sells past: it
// closed the budget risk and asked nobody for anything.
//
// WHY THERE IS A CAP AT ALL. Core 4 is three model calls on a typical turn and
// up to seventeen on an expert, high-stakes one, on the frontier model, with
// attachments up to ~120k characters. The audit found the only server-side gate
// was "are you signed in", so one free signup had 400 frontier turns a day with
// no spend ceiling — named there as the budget risk most worth closing before
// opening the doors. This closes it, and now also draws the line the plan is
// sold across.
//
// Pure: the policy is here and the counting is in store.ts, so the rule can be
// read and tested without a database.

/** Distinct Core 4 conversations a free account may start in one month. */
export const FREE_CORE4_CHATS_PER_MONTH = 2;

export type Core4Plan = 'free' | 'one';

/**
 * The first instant of the person's month, in UTC.
 *
 * UTC AND NOT THEIR ZONE, deliberately: the client's offset is caller-supplied
 * and a cap that resets whenever the browser says so is not a cap. The cost of
 * being honest about it is that the reset lands at a different local hour for
 * different people, which is the ordinary behaviour of every quota they already
 * live with.
 */
export function monthStart(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

/**
 * Midnight for the person's day, in UTC. Kept because the turns table is still
 * read by day elsewhere, and because a window function is cheaper to keep than
 * to re-derive.
 */
export function dayStart(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export interface ChatAllowance {
  allowed: boolean;
  /** conversations already used this month */
  used: number;
  limit: number;
  /** true when this exact conversation is already one of the used ones */
  continuing: boolean;
}

/**
 * May this account send this Core 4 turn?
 *
 * CONTINUING A CHAT IS ALWAYS FREE, including the third one of the month: the
 * limit is on how many conversations are STARTED, and a thread already counted
 * stays open, for as long as it runs and whenever they come back to it.
 * Somebody halfway through working something out does not hit a wall because
 * their second conversation was a fortnight ago.
 *
 * A failed count is not a refusal. `ok: false` from the store means the database
 * could not answer, and the direction that fails closed for cost is the one that
 * fails open for the person — so a read error lets the turn through and is
 * logged. A cap that eats somebody's conversation during a database blip is
 * worse than a few turns of overage.
 */
export function core4ChatAllowed(input: {
  plan: Core4Plan;
  /** distinct conversation ids that already used Core 4 this month */
  usedThisMonth: readonly string[];
  conversationId: string | null;
  countOk?: boolean;
}): ChatAllowance {
  const limit = FREE_CORE4_CHATS_PER_MONTH;
  const used = new Set(input.usedThisMonth).size;
  const continuing = !!input.conversationId && input.usedThisMonth.includes(input.conversationId);
  if (input.plan === 'one' || input.countOk === false) {
    return { allowed: true, used, limit, continuing };
  }
  return { allowed: continuing || used < limit, used, limit, continuing };
}

/**
 * What the person is told when the month's conversations are gone.
 *
 * Three facts and no countdown: what has been used, what stays open, and what
 * Socria One changes. The conversations they already started are the first of
 * those on purpose — the commonest fear at a boundary is that the work is gone,
 * and it is not.
 */
export function limitMessage(a: ChatAllowance): string {
  return (
    `That is ${a.limit === 2 ? 'both' : `all ${a.limit}`} of your free Core 4 conversations this month. ` +
    `The ones you have started stay open, and stay yours — keep going in any of them. ` +
    `Socria One opens as many as you have; Core 3.1 is here either way.`
  );
}
