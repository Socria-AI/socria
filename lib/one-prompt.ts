// lib/one-prompt.ts
//
// When Socria One is worth mentioning, and how it is said.
//
// The rule this file exists to enforce: a prompt about One is only ever shown
// because the PERSON did something that made it relevant. Never because time
// passed, never because they are new, never because a session started. If you
// cannot name the thing they just tried to do, there is no prompt.
//
// That rule is not politeness. Socria's whole claim is that it is a place to
// think, and a place to think cannot also be a place that interrupts you to
// sell. So the strongest moment — someone reaching for more of the thing they
// are already doing — is the only moment that earns an interruption, and the
// weakest ones are gated behind evidence that the product has already become
// useful to them.
//
// Everything here is pure: no React, no storage, no clock of its own. The
// decision is a function of (what happened, what we hold, what we already
// showed), which is what makes it testable and what keeps the rules in one
// place instead of scattered across the components that trigger them.
//
// Enforcement lives on the server and is unaffected by any of this. A prompt
// is UX. If this file were deleted, every limit would still hold.

import { boundaryNote, TIERED_COUNTERS, type Counter } from './entitlements';
import type { Plan } from './socria-one';
import type { ThinkingContext } from './logos';

// ── what kind of moment this is ─────────────────────────────────────

/**
 * Two categories, and the difference is consent.
 *
 * An ENTITLEMENT prompt answers a question the person just asked by acting:
 * "why did that stop?" It is allowed to appear immediately, because not
 * appearing would leave them staring at a thing that silently did nothing.
 *
 * A PROACTIVE prompt answers no question. Nobody asked. It is therefore
 * rationed hard, and everything below that looks like paranoia is aimed at it.
 */
export type PromptCategory = 'entitlement' | 'proactive';

/**
 * How strongly this moment suggests the person actually wants more room.
 * Used to pick between simultaneous triggers, never to justify showing one —
 * a high intent still has to pass every other rule.
 */
export type Intent = 'low' | 'medium' | 'high' | 'urgent';

export const INTENT_RANK: Record<Intent, number> = {
  low: 0,
  medium: 1,
  high: 2,
  urgent: 3,
};

/**
 * Every moment that may mention One. Adding a member here is the only way to
 * add a prompt to the product — there is no free-form call.
 *
 * NOTHING IS EVER REMOVED FROM THIS LIST. Several members below can no longer
 * fire: the free tier stopped being a clipped Socria, so there is no locked
 * depth, no locked lens, no locked Draft and no map that fills up. They stay
 * for two reasons. The small one is that a plan table can clip again, and the
 * vocabulary should not have to be reinvented. The large one is that these
 * strings are attribution: a subscription bought at 'map-full' in March has
 * that word in its Stripe metadata, and lib/checkout-attribution.ts
 * re-validates against this list on the way back. Delete a member and last
 * quarter's answer to "which moment sells" quietly becomes "unknown".
 */
export const TRIGGER_REASONS = [
  // urgent — a free counter ran out with work in progress
  'chats-spent',
  'explore-spent',
  'research-spent',
  'challenge-spent',
  'context-spent',
  'images-spent',
  'files-spent',
  // high — reached for something One holds. The first four are retired:
  // nothing can raise them any more (see the note above on why they stay).
  'map-full',
  'depth-locked',
  'lenses-locked',
  'draft-locked',
  'connections-locked',
  // high — a success, not a boundary: the map on screen just took a shape.
  // Nobody asked, so it clears the same engagement bar as returning-thinker,
  // and it is one boundary with map-full (see FAMILY below).
  'map-shaped',
  // medium — nobody asked; must clear the engagement bar as well
  'returning-thinker',
  // low — they pressed the button that says Socria One
  'asked',
] as const;
export type TriggerReason = (typeof TRIGGER_REASONS)[number];

export interface PromptCopy {
  /** four or five words, in the person's situation, not the product's */
  title: string;
  /** what stopped, then what One changes. Two sentences at most. */
  body: string;
  primary: string;
  secondary: string;
}

export interface TriggerSpec {
  category: PromptCategory;
  intent: Intent;
  /**
   * The counter this trigger is the boundary of, when it is one. Present so
   * the body can come from lib/entitlements — the boundary is worded once,
   * there, and this file does not get a second opinion about it.
   */
  counter?: Counter;
  title: string;
  /** Only for triggers with no counter; otherwise boundaryNote() supplies it. */
  body?: string;
}

/**
 * The table. Titles are the person's sentence, not ours: "Keep exploring",
 * not "Explore limit reached". The body says what happened and what changes,
 * and for the metered ones it is quite deliberately the SAME sentence the
 * allowance panel and the API's 402 already use.
 */
export const TRIGGERS: Record<TriggerReason, TriggerSpec> = {
  'chats-spent': {
    category: 'entitlement',
    intent: 'urgent',
    counter: 'chats',
    title: 'Keep this line of thinking',
  },
  'explore-spent': {
    category: 'entitlement',
    intent: 'urgent',
    counter: 'explore',
    title: 'Keep exploring',
  },
  'research-spent': {
    category: 'entitlement',
    intent: 'urgent',
    counter: 'research',
    title: 'Follow it to the evidence',
  },
  'challenge-spent': {
    category: 'entitlement',
    intent: 'urgent',
    counter: 'challenge',
    title: 'Keep being pushed back on',
  },
  'context-spent': {
    category: 'entitlement',
    intent: 'urgent',
    counter: 'context',
    title: 'Bring in more of your own work',
  },
  'images-spent': {
    category: 'entitlement',
    intent: 'urgent',
    counter: 'images',
    title: 'Keep reading what you bring',
  },
  'files-spent': {
    category: 'entitlement',
    intent: 'urgent',
    counter: 'files',
    title: 'Keep reading what you bring',
  },

  // ── retired, and kept ──────────────────────────────────────────
  // The four below are unreachable: maps do not fill, every depth and every
  // lens is open on both plans, and Draft Space is not sold. Their copy is
  // kept ACCURATE rather than frozen, because a plan table that clipped again
  // would put these on screen the same day, and stale copy is how a product
  // ends up offering somebody a thing they already have.

  'map-full': {
    category: 'entitlement',
    intent: 'high',
    title: 'This map has more in it',
    body:
      'This line of thinking has grown past what the map will hold. Everything ' +
      'here stays — Socria One simply lets it keep growing with you.',
  },
  'depth-locked': {
    category: 'entitlement',
    intent: 'high',
    title: 'Think at a different pace',
    body:
      'Quick, Deep and Abstract change how far Logos goes with you. ' +
      'Socria One opens all four registers.',
  },
  'lenses-locked': {
    category: 'entitlement',
    intent: 'high',
    title: 'See this another way',
    body:
      'Structure, Board and the other lenses read the same reasoning differently. ' +
      'Socria One opens all of them.',
  },
  'draft-locked': {
    category: 'entitlement',
    intent: 'high',
    title: 'Write beside your thinking',
    body:
      'Draft Space lets you write with the map still in view, so the reasoning ' +
      'stays next to the words. Socria One opens it.',
  },
  'connections-locked': {
    category: 'entitlement',
    intent: 'high',
    title: 'Think with your own material',
    body:
      'Socria One reads your own work — Drive, Docs, Notion and what you paste — ' +
      'into the thinking rather than around it.',
  },

  'map-shaped': {
    category: 'proactive',
    intent: 'high',
    title: 'This map has a shape now',
    // It promises MEMORY, deliberately. Growth is map-full's promise, three
    // nodes later, and one map must not be sold the same thing twice. What a
    // shaped map makes true is that there is now an assumption on it worth
    // recognising the next time it appears — which is the thing Socria One
    // carries into Logos.
    body:
      'The assumption this line of thinking leans on is the kind of thing Logos can ' +
      'recognise the next time it appears. Socria One remembers how you reason ' +
      'between lines of thinking, and carries it into Logos.',
  },

  'returning-thinker': {
    category: 'proactive',
    intent: 'medium',
    title: 'Go further with Socria One',
    // What it used to promise — lifted limits, maps that keep growing — is
    // what the free tier already does. What is actually still on the other
    // side of the price is the count and the continuity, so that is what it
    // says now. Selling somebody a feature they are using is how a product
    // teaches people to ignore it.
    body:
      'You have been coming back to think here. Socria One keeps as many lines ' +
      'of thinking as you have, and carries what it learns about how you reason ' +
      'from each one into the next.',
  },

  'asked': {
    category: 'proactive',
    intent: 'low',
    title: 'Socria One',
    body: 'Membership in the complete reasoning environment.',
  },
};

/**
 * The one place a trigger's numbers are filled in.
 *
 * There is nothing left to fill: the copy above no longer names a quantity,
 * because the only quantity the free tier now has is the month's lines of
 * thinking, and that sentence is written once in lib/entitlements and reached
 * through boundaryNote(). Kept as the seam it always was, so the next piece
 * of copy that does need a number has somewhere to get it from rather than
 * writing it down a second time.
 */
function fill(text: string): string {
  return text;
}

/** Title and body for a trigger, with the boundary worded in only one place. */
export function copyFor(reason: TriggerReason): PromptCopy {
  const spec = TRIGGERS[reason];
  return {
    title: spec.title,
    body: spec.counter ? boundaryNote(spec.counter) : fill(spec.body ?? ''),
    // One action. "Continue" rather than "Upgrade", because what they are
    // doing is continuing — the transaction is incidental to it.
    primary:
      spec.category === 'entitlement' ? 'Continue with Socria One' : 'Become a member',
    // The way out is the /one cover's own phrasing, and it is set in the same
    // quiet serif italic. It says what actually happens next rather than
    // deferring the question — "not now" implies we will ask again, and for
    // an entitlement prompt we will not.
    secondary:
      spec.category === 'entitlement' ? 'continue with the free tier' : 'maybe later',
  };
}

// ── how often, at most ──────────────────────────────────────────────

export const DAY_MS = 86_400_000;

/**
 * Cooldown after a proactive prompt is dismissed, by how many times they have
 * now dismissed one. Saying no once is an answer for a week; saying no three
 * times is an answer, and we should stop asking for a third of a year.
 *
 * The last value repeats for every dismissal beyond the list, so this cannot
 * wrap around to a short cooldown no matter how many times it is called.
 */
export const COOLDOWN_DAYS = [7, 14, 60, 180] as const;

export function cooldownMs(dismissals: number): number {
  if (dismissals <= 0) return 0;
  const i = Math.min(dismissals, COOLDOWN_DAYS.length) - 1;
  return COOLDOWN_DAYS[i] * DAY_MS;
}

/**
 * The evidence a proactive prompt needs before it is allowed to exist.
 *
 * Every one of these is measured from something the product already stores —
 * saved Logos sessions and their timestamps, and the size of the map on
 * screen. Nothing here is a new metric invented to make a number go up.
 *
 * Two sessions across two different days is the smallest honest reading of
 * "this person came back". One long afternoon is not evidence of return.
 */
export const PROACTIVE_MIN = {
  sessions: 2,
  activeDays: 2,
  mapNodes: 5,
} as const;

export interface Engagement {
  /** distinct saved Logos sessions */
  sessions: number;
  /** distinct calendar days those sessions were last touched on */
  activeDays: number;
  /** nodes on the map in front of them right now */
  mapNodes: number;
}

/**
 * Contexts where a proactive prompt is not welcome regardless of engagement.
 *
 * `reflecting` is the map's own reading that someone is working through
 * something personal. Interrupting that to sell a subscription is the single
 * most expensive thing this system could do, and it is cheap to avoid: the
 * extractor already labels it.
 *
 * Entitlement prompts are NOT suppressed here — if someone in a reflective
 * conversation presses Explore and it does nothing, silence is worse than an
 * explanation.
 */
export const SENSITIVE_CONTEXTS: readonly ThinkingContext[] = ['reflecting'];

/**
 * Triggers that are one boundary wearing two names.
 *
 * map-shaped (node 5) and map-full (node 8) were three nodes apart on the same
 * map. Whichever is said first has said it; the other is then 'said-already'
 * in that tab, exactly as pressing the same exhausted control twice is.
 *
 * map-full cannot fire now — maps have no ceiling — so in practice this pair
 * only ever protects map-shaped from a map-full raised before the caps
 * changed. The rule is kept because "one map, one promise" is the principle,
 * not the pair.
 */
export const FAMILY: Partial<Record<TriggerReason, readonly TriggerReason[]>> = {
  'map-shaped': ['map-full'],
  'map-full': ['map-shaped'],
};

function saidAlready(state: PromptState, reason: TriggerReason): boolean {
  if (state.shownTriggers.includes(reason)) return true;
  return (FAMILY[reason] ?? []).some((r) => state.shownTriggers.includes(r));
}

/** No proactive prompt within this of the last one, whatever tab showed it. */
export const PROACTIVE_FLOOR_MS = DAY_MS;

// ── the decision ────────────────────────────────────────────────────

export interface PromptState {
  /** proactive dismissals, all time */
  dismissals: number;
  /** when the last proactive dismissal happened */
  lastDismissedAt: number;
  /** when any prompt was last shown */
  lastShownAt: number;
  /**
   * When a PROACTIVE prompt was last shown, in any tab.
   *
   * The session cap is per tab by construction (sessionStorage), which meant
   * two tabs were two prompts. This is the floor under it: however many tabs
   * are open, nobody who was not asking is asked twice in a day.
   */
  lastProactiveAt: number;
  /** proactive prompts shown in this browser session */
  shownThisSession: number;
  /**
   * Which triggers have already been explained in this browser session.
   *
   * An entitlement prompt is the answer to "why did that stop?", and the
   * answer only has to be given once. Repeating it on every further press of
   * the same exhausted control is not an explanation any more, it is a
   * nag — and the surfaces all carry the same sentence inline, so nothing is
   * hidden by staying quiet the second time.
   */
  shownTriggers: readonly TriggerReason[];
}

export const EMPTY_PROMPT_STATE: PromptState = {
  dismissals: 0,
  lastDismissedAt: 0,
  lastShownAt: 0,
  lastProactiveAt: 0,
  shownThisSession: 0,
  shownTriggers: [],
};

export type SuppressReason =
  | 'has-one'
  | 'session-cap'
  /** a proactive prompt was shown in the last day, in some tab */
  | 'daily-floor'
  | 'cooldown'
  | 'sensitive-context'
  | 'not-engaged'
  | 'already-open'
  /** the counter that ran out is a fair-use ceiling One shares — nothing to sell */
  | 'shared-ceiling'
  /** this exact boundary has already been explained in this browser session */
  | 'said-already';

export interface DecideInput {
  reason: TriggerReason;
  plan: Plan;
  now: number;
  state: PromptState;
  /** a prompt is on screen already */
  open?: boolean;
  /** the map's reading of what this conversation is */
  context?: ThinkingContext;
  /** only consulted for proactive triggers */
  engagement?: Engagement;
}

export type Decision =
  | {
      show: true;
      reason: TriggerReason;
      category: PromptCategory;
      intent: Intent;
      copy: PromptCopy;
    }
  | { show: false; reason: TriggerReason; why: SuppressReason };

/**
 * Whether to show this prompt, now.
 *
 * The order of the checks is the policy. Plan first, because a subscriber
 * should never see any of this — including the entitlement prompts, which
 * they cannot trigger anyway. Then the cheap universal guard. Then, only for
 * proactive prompts, the rationing.
 */
export function decide(input: DecideInput): Decision {
  const { reason, plan, now, state } = input;
  const spec = TRIGGERS[reason];
  const no = (why: SuppressReason): Decision => ({ show: false, reason, why });

  // A member is never sold to. Nothing below this line can override it.
  if (plan === 'one') return no('has-one');

  // Never stack. Whatever is already on screen was triggered by something the
  // person did more recently than this.
  if (input.open) return no('already-open');

  if (spec.category === 'entitlement') {
    // Some ceilings are the same on both plans — Research, images and files
    // are fair-use guards against a runaway loop, not a boundary anybody is
    // meant to meet, and Socria One does not lift them. Opening a sales sheet
    // there would be offering somebody a thing they already have at the exact
    // moment they are annoyed, which is the most expensive lie available.
    // The surfaces still say what happened, inline, from boundaryNote().
    if (spec.counter && !(TIERED_COUNTERS as readonly Counter[]).includes(spec.counter)) {
      return no('shared-ceiling');
    }

    // They pressed something and it stopped. Explaining that is not
    // promotion, and it is not rationed by the cooldown, the session cap or
    // the engagement bar — the frequency IS their action.
    //
    // Once per boundary per tab, though. The original rule was "never
    // rationed", on the reasoning that silence would leave someone staring
    // at a control that did nothing; that reasoning is about the FIRST
    // press and does not survive the fourth. Someone who has been told the
    // month's chats are spent and types again has not asked a new question,
    // and answering it again with a sheet across the screen is the exact
    // behaviour the rest of this file exists to prevent. The allowance
    // panel and the boundary note say the same sentence, in place, for as
    // long as it is true.
    if (saidAlready(state, reason)) return no('said-already');
    return yes();
  }

  // 'asked' is proactive by category but is a button press: it bypasses the
  // rationing for the same reason entitlement prompts do, and it is not
  // subject to the once-per-tab rule either — pressing a button labelled
  // Socria One is a request, and a request is answered every time.
  if (reason === 'asked') return yes();

  // ── from here down: nobody asked ──────────────────────────────────

  // A family member already spoke in this tab: map-shaped after map-full is
  // the same map being sold twice.
  if (saidAlready(state, reason)) return no('said-already');

  if (state.shownThisSession >= 1) return no('session-cap');
  if (state.lastProactiveAt > 0 && now - state.lastProactiveAt < PROACTIVE_FLOOR_MS) {
    return no('daily-floor');
  }

  if (state.dismissals > 0) {
    const until = state.lastDismissedAt + cooldownMs(state.dismissals);
    if (now < until) return no('cooldown');
  }

  if (input.context && SENSITIVE_CONTEXTS.includes(input.context)) {
    return no('sensitive-context');
  }

  const e = input.engagement;
  if (
    !e ||
    e.sessions < PROACTIVE_MIN.sessions ||
    e.activeDays < PROACTIVE_MIN.activeDays ||
    e.mapNodes < PROACTIVE_MIN.mapNodes
  ) {
    return no('not-engaged');
  }

  return yes();

  function yes(): Decision {
    return {
      show: true,
      reason,
      category: spec.category,
      intent: spec.intent,
      copy: copyFor(reason),
    };
  }
}

/**
 * Of several triggers firing at once, the one worth showing.
 *
 * "Never spam a lower-intent prompt when a better contextual trigger is
 * available" — so a counter that just ran out beats a generic nudge, and ties
 * go to whichever was raised first, which is the one closest to what the
 * person actually pressed.
 */
export function bestTrigger(reasons: readonly TriggerReason[]): TriggerReason | null {
  let best: TriggerReason | null = null;
  for (const r of reasons) {
    if (best === null || INTENT_RANK[TRIGGERS[r].intent] > INTENT_RANK[TRIGGERS[best].intent]) {
      best = r;
    }
  }
  return best;
}

/**
 * Engagement from saved sessions. Kept here, beside the thresholds it feeds,
 * so "what counts as a day" is answered once.
 *
 * Days are counted in the viewer's local time. A person who thinks late on
 * Monday and again after midnight has come back, and a UTC boundary would
 * either agree or disagree with that by accident depending on where they live.
 */
export function engagementFrom(
  sessions: readonly { updatedAt: number }[],
  mapNodes: number
): Engagement {
  const days = new Set<string>();
  for (const s of sessions) {
    if (!Number.isFinite(s.updatedAt) || s.updatedAt <= 0) continue;
    const d = new Date(s.updatedAt);
    days.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  }
  return { sessions: sessions.length, activeDays: days.size, mapNodes };
}

/**
 * The trigger for a counter that has just run out.
 *
 * The return type is the template literal rather than a cast, so if a counter
 * is ever added to lib/entitlements without a matching trigger here, this
 * stops compiling instead of producing a reason that indexes TRIGGERS as
 * undefined at runtime.
 */
export function reasonForCounter(counter: Counter): `${Counter}-spent` & TriggerReason {
  return `${counter}-spent`;
}
