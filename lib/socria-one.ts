// lib/socria-one.ts
//
// Socria One — the subscription that opens the complete reasoning
// environment. Logos is the premium product; Core stays available on its own.
//
// The shape of the free tier matters more than its size. INSIDE a line of
// thinking it is not a trial at all — it is the product, at full strength:
// every depth, every lens, a map that grows as far as the thinking does. What
// Socria One sells is how MANY lines of thinking you get, and the memory that
// runs between them. See the long note at the top of lib/entitlements.ts for
// why the axis is that one and not the other.
//
// Where a boundary is still met it is a BOUNDARY, not a wall — the map you
// built stays on screen, stays interactive, and stays yours. Nothing you have
// thought is ever taken back.
//
// Two things are never gated, at any tier: TRACE (where a thought came from)
// and CORRECTION (telling Logos it read you wrong). Charging for the ability
// to see your own reasoning, or to fix it, would make the product dishonest.

export const SOCRIA_ONE = {
  name: 'Socria One',
  price: 15,
  currency: '$',
  period: 'month',
} as const;

export type Plan = 'free' | 'one';

/**
 * The price as a string, from the one place the number lives.
 *
 * Every rendering of the price — the /one page, the Logos landing page, the
 * terms, the docs, the marks in the chrome — goes through this or
 * priceWithPeriod(). There used to be nine literal "$15"s beside it; they
 * were migrated when the in-chrome mentions were added, so that adding
 * four more places to say the price did not mean writing it thirteen times.
 * Keep it that way: a price written twice disagrees with itself the first
 * time it changes.
 */
export function priceLabel(): string {
  return `${SOCRIA_ONE.currency}${SOCRIA_ONE.price}`;
}

/** The price with its period, e.g. "$15/month". */
export function priceWithPeriod(): string {
  return `${priceLabel()}/${SOCRIA_ONE.period}`;
}

// Imported for the map cap's default; entitlements imports only the TYPE
// above, so this edge is one-directional at runtime.
import { PLANS } from './entitlements';

// The numbers that used to live here are in lib/entitlements.ts now — one
// table, both plans, read by the UI and the routes alike. A limit written in
// two places disagrees with itself the first time it changes, and these are
// meant to change as we learn what they should be.

// Typed codes that open One without billing attached, mirroring the Core 3
// access key already in the product. Soft gates, not secrets — like that key,
// they ship in the client bundle. A signed-in redemption is ALSO written to
// the account (see /api/logos/redeem) so it follows the person across devices.
//
// There used to be a second, shorter code here — 'ONE' — as a dev/test gate.
// It came out for the paid launch: three letters, and the first three anyone
// would try against a product called Socria One, handing over a $15/month
// subscription to whoever guessed. A soft gate is one a determined person can
// step over, not one nobody has to.
export const SOCRIA_ONE_CODES = ['MAVERICKS26LONGHORNS27'];

/**
 * The code the client echoes in `x-socria-one` to assert it already holds One.
 * Any accepted code satisfies the server; this is simply the one the bundle
 * carries. NOT a secret and not a security boundary — see resolvePlanForRequest,
 * where it is the last fallback behind Stripe and the account grant.
 */
export const SOCRIA_ONE_KEY = SOCRIA_ONE_CODES[0];

export function isValidOneKey(key: unknown): boolean {
  return (
    typeof key === 'string' && SOCRIA_ONE_CODES.includes(key.trim().toUpperCase())
  );
}

export function resolvePlan(input: unknown): Plan {
  return input === 'one' ? 'one' : 'free';
}

export function isOne(plan: Plan): boolean {
  return plan === 'one';
}

// ── what One opens ──────────────────────────────────────────────────
// Written as capabilities of a thinking environment, not as quantities of
// AI. Nobody is buying tokens here.
//
// WHAT IS DELIBERATELY ABSENT. This list used to lead with Full Thinking
// Maps, all four depth modes, Research as often as needed and Draft Space.
// The free tier has every one of those now, so naming them here would be
// selling somebody a thing they are already using — the fastest way to teach
// a person that the pricing page is not to be believed. What is left is what
// is actually on the other side of the price: how MANY lines of thinking, and
// what Socria carries between them.

export type OneFeature =
  | 'map'
  | 'lenses'
  | 'research'
  | 'depth'
  | 'draft'
  | 'connections'
  | 'images'
  | 'conversations'
  | 'history';

export const ONE_FEATURES: { id: OneFeature; title: string; blurb: string }[] = [
  {
    id: 'conversations',
    title: 'Every line of thinking',
    blurb: 'as many in a month as you have, kept with their history.',
  },
  {
    id: 'history',
    title: 'It remembers how you reason',
    blurb: 'the durable things about your thinking, carried into each new one.',
  },
  {
    id: 'map',
    title: 'The thread between them',
    blurb: 'what you are working through, held across conversations.',
  },
  {
    id: 'connections',
    title: 'Connected context',
    blurb: 'Drive, Docs, and Notion, when available.',
  },
];

// ── the free boundary ───────────────────────────────────────────────

interface MapLike {
  nodes: { id: string }[];
  edges: { from: string; to: string }[];
}

/**
 * How much thinking a map actually holds. Every node the extractor keeps is a
 * piece of reasoning someone can act on, so all of them count — there is no
 * hidden second class of node used to make the limit look larger than it is.
 */
export function meaningfulNodes(map: MapLike | null | undefined): number {
  return map?.nodes?.length ?? 0;
}

/**
 * Hold a map at its plan's boundary.
 *
 * As of the free tier's reshaping there is no such boundary on either plan —
 * `PLANS.free.mapNodes` is null and this returns the map untouched. It is kept
 * whole, and still covered by its suite, because "how the map behaves when it
 * is full" is a question a future plan table can ask again, and the answer
 * below is the careful one: it took several passes to get right and should not
 * have to be rediscovered.
 *
 * The rule is "stop taking on NEW thinking", not "throw thinking away". Nodes
 * already on the map are kept — including any refinement of what they say,
 * since correcting the record is never the thing being sold. Only nodes the
 * extractor has newly invented are dropped, and only once the map is full.
 *
 * Edges are dropped when they point at something that didn't survive,
 * otherwise the map renders arrows into empty space.
 */
export function capMapForFree<T extends MapLike>(
  next: T,
  current: MapLike | null | undefined,
  limit: number | null = PLANS.free.mapNodes
): { map: T; capped: boolean } {
  const nodes = next?.nodes ?? [];
  if (limit === null || nodes.length <= limit) return { map: next, capped: false };

  const known = new Set((current?.nodes ?? []).map((n) => n.id));
  // Everything they already had, in the order the new extraction puts it…
  const kept = nodes.filter((n) => known.has(n.id));
  // …then new arrivals, only while there is still room.
  for (const n of nodes) {
    if (kept.length >= limit) break;
    if (!known.has(n.id)) kept.push(n);
  }
  const live = new Set(kept.map((n) => n.id));

  return {
    map: {
      ...next,
      // `kept` is already bounded: existing nodes are never dropped (someone
      // whose subscription lapsed keeps the larger map they built), and new
      // ones were only added while under the limit.
      nodes: kept,
      edges: (next.edges ?? []).filter((e) => live.has(e.from) && live.has(e.to)),
    },
    capped: nodes.length > kept.length,
  };
}

/** Where thinking happens when a plan does not open the other registers. */
export const FREE_DEPTH = 'balanced';

/**
 * The depth a plan will actually think at.
 *
 * Both plans now open all four — clipping the free tier to Balanced was the
 * single clearest way to make Socria look mediocre to somebody deciding
 * whether to pay for it. This stays table-driven rather than being deleted so
 * that the answer lives in one place if that ever changes back.
 */
export function depthForPlan<T extends string>(depth: T, plan: Plan): T | 'balanced' {
  return PLANS[plan].allDepths ? depth : FREE_DEPTH;
}
