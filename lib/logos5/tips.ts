// lib/logos5/tips.ts — TIPS FOR NEW PEOPLE, AND NOW AND THEN A FEATURE.
//
// Two kinds of small card, pointing at the thing they are about
// (components/logos5/L5Tip.tsx draws them):
//
//   tip      the few things a new person needs once they have started —
//            the Logic Map their words are making, Make, the Universal Map,
//            search. Only in their first fortnight, one at a time, each once.
//   feature  now and then, something worth knowing they have not used —
//            List, the tutorials, Quick capture, Voice. At most
//            one a visit, days apart, each once, with a "Show me".
//
// Never two at once, never over anything else (an onboarding, a sheet, a
// tour, an answer arriving), never twice. What has been seen is kept with the
// hints (lib/hints.ts), so Manage Account's "Show hints again" brings them back.
//
// PURE. Which card, if any, given where they are and what they have seen.

export type TipKind = 'tip' | 'feature';
/** what a feature's "Show me" does — the app knows how */
export type TipAction = 'list' | 'guide' | 'capture' | 'voice' | 'search';

export interface Tip {
  id: string;
  kind: TipKind;
  title: string;
  body: string;
  /** the element it points at, as a selector; the first visible match */
  anchor: string;
  /** what the card must not cover when it sits above (the box someone types in): it sits above that instead */
  avoid?: string;
  /** what the card must never cover from below (the box at the foot of the map): it sits above its target instead */
  clear?: string;
  /** what "Show me" does — features only */
  action?: TipAction;
  /** when it can be said at all */
  when: (c: TipContext) => boolean;
}

export interface TipContext {
  /** what is on screen */
  where: 'line' | 'home' | 'other';
  /** Socria's replies in the line of thinking on screen */
  replies: number;
  /** their lines of thinking with something in them */
  lines: number;
  /** a Logic Map card is on the canvas */
  mapCard: boolean;
  /** within a fortnight of starting */
  newUser: boolean;
  /** a mac says ⌘K */
  mac: boolean;
  /** the first-reply tour has already pointed at the composer and Make */
  toured: boolean;
  /** what this person can use */
  can: { split: boolean; capture: boolean; voice: boolean };
  /** signed out: a guest, who gets no welcome — the map, and one hint about it, first */
  guest?: boolean;
}

export const TIPS: readonly Tip[] = [
  // ── a guest's one hint, on arriving: what the map is made of and how to move about it. Optional ("Got it"),
  // once, never in the way; everything else is said where they come to it (the tips below) ──
  {
    id: 'g.nodes',
    kind: 'tip',
    title: 'Your thinking, as a map',
    body: 'Start in the box below. What you think through lands here as nodes: press one to see it, press again to open it, and drag the empty space to look around.',
    // beside a node, once there is one: over an empty map it explained pressing nodes that were not there yet, and
    // said again what the empty map's own line says
    anchor: '.l5b-hub',
    clear: '.l5h-find',
    when: (c) => !!c.guest && c.where === 'home',
  },
  // ── tips: the few things a new person needs, once they have started ──
  {
    id: 'l5.map',
    kind: 'tip',
    title: 'Your thinking, drawn',
    body: 'As you talk, Socria draws your ideas as a Logic Map. Open it to move them, question them and see what connects.',
    // the canvas's map card, or the board's, pinned (Logos 5 One view)
    anchor: '.ls-idea, .lcv-card.is-map, .lp-map',
    when: (c) => c.where === 'line' && c.replies >= 1 && c.mapCard,
  },
  {
    id: 'l5.make',
    kind: 'tip',
    title: 'Make something of it',
    body: 'Make turns the conversation into something you can use: a plot, a table, a plan, a worked answer.',
    anchor: '[data-tour="make"]',
    avoid: '.l5-dock',
    when: (c) => c.where === 'line' && c.replies >= 1 && !c.toured,
  },
  {
    id: 'l5.home',
    kind: 'tip',
    title: 'Everything you start',
    body: 'Every line of thinking lives on your Universal Map. Go back to it any time — nothing is lost.',
    anchor: '.l5v-home, .lcv-home',
    when: (c) => c.where === 'line' && c.replies >= 2,
  },
  {
    id: 'l5.search',
    kind: 'tip',
    title: 'Find anything',
    body: 'Search looks through every conversation, idea and artifact.',
    anchor: '.l5v-search, .l5-searchbtn',
    when: (c) => c.lines >= 2,
  },
  // ── features: now and then, something worth knowing ──
  {
    id: 'f.list',
    kind: 'feature',
    title: 'Every conversation, as a list',
    body: 'List lays out all your conversations — starred first, then by subject — so any of them is one press away.',
    anchor: '.l5-unibtn.is-list',
    action: 'list',
    when: (c) => c.where === 'home' && c.lines >= 2,
  },
  {
    id: 'f.guide',
    kind: 'feature',
    title: 'What Socria does',
    body: 'Short tutorials for everything here, one at a time, each with something to try.',
    anchor: '.l5-menuhost',
    action: 'guide',
    when: (c) => c.lines >= 1,
  },
  {
    id: 'f.capture',
    kind: 'feature',
    title: 'Keep a thought for later',
    body: 'Quick capture holds a thought without starting a conversation. Find it again when you are ready.',
    anchor: '.l5-menuhost',
    action: 'capture',
    when: (c) => c.can.capture && c.lines >= 1,
  },
  {
    id: 'f.voice',
    kind: 'feature',
    title: 'Say it instead',
    body: 'Socria Voice: talk it through, and it goes to Socria when you pause. Anything that cannot be undone asks first.',
    anchor: '.sv-btn:not(.is-locked)',
    action: 'voice',
    when: (c) => c.can.voice && c.where === 'line' && c.replies >= 1,
  },
];

/** What has been shown, and when, kept in this browser. */
export interface TipLedger {
  /** ids seen (from lib/hints.ts: shared with the other hints, so "Show hints again" brings these back) */
  seen: readonly string[];
  /** when the last tip and the last feature were shown (ms) */
  lastTipAt: number;
  lastFeatureAt: number;
}

export const TIP_LEDGER_KEY = 'socria.tips.v1';
/** a tip waits this long after the last one: one thing at a time, and a moment to use it */
export const TIP_GAP_MS = 25_000;
/** features are now and then: this long apart at least */
export const FEATURE_GAP_MS = 2 * 24 * 60 * 60 * 1000;
/** a feature waits this long into a visit: never the first thing anyone sees */
export const FEATURE_SETTLE_MS = 20_000;
/** how long somebody is new for */
export const NEW_FOR_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * The card to show now, or null.
 *
 * `visit` says what this visit has already had: a feature at most once a
 * visit, and never on a visit that has had tips (a new person is learning the
 * basics; the extras can wait). Tips come before features, in order; each is
 * shown once, ever.
 */
export function pickTip(
  c: TipContext,
  ledger: TipLedger,
  now: number,
  visit: { tips: number; features: number }
): Tip | null {
  const seen = new Set(ledger.seen);
  if (c.newUser && now - ledger.lastTipAt >= TIP_GAP_MS) {
    const tip = TIPS.find((t) => t.kind === 'tip' && !seen.has(t.id) && t.when(c));
    if (tip) return tip;
  }
  if (visit.features > 0 || visit.tips > 0) return null;
  if (now - ledger.lastFeatureAt < FEATURE_GAP_MS) return null;
  return TIPS.find((t) => t.kind === 'feature' && !seen.has(t.id) && t.when(c)) ?? null;
}

/** Search's shortcut, as this keyboard says it. */
export const searchKeys = (mac: boolean) => (mac ? '⌘K' : 'Ctrl K');

/** The words a card says, with anything that depends on the device filled in. */
export function tipBody(t: Tip, c: Pick<TipContext, 'mac'>): string {
  return t.id === 'l5.search' ? `${t.body} ${searchKeys(c.mac)} works from anywhere.` : t.body;
}

/** The ledger as stored, read safely: anything unreadable is a fresh ledger. */
export function parseLedger(raw: string | null | undefined): Omit<TipLedger, 'seen'> {
  try {
    const j = JSON.parse(raw ?? '{}') as Partial<TipLedger>;
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
    return { lastTipAt: n(j.lastTipAt), lastFeatureAt: n(j.lastFeatureAt) };
  } catch {
    return { lastTipAt: 0, lastFeatureAt: 0 };
  }
}
