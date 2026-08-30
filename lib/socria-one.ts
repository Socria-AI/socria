// lib/socria-one.ts
//
// Socria One — the subscription that opens the complete reasoning
// environment. Logos is the premium product; Core stays available on its own.
//
// The shape of the free tier matters more than its size. It is a real trial,
// not a demo: you get the whole Chat → Map → Explore loop, you get to see your
// thinking become a map, and you get to research something. What you run into
// is a BOUNDARY, not a wall — the map you built stays on screen, stays
// interactive, and stays yours. Nothing you have thought is ever taken back.
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
 * There are nine other places in this repository that write "$15" as a
 * literal — the /one page, the Logos landing page, the terms, the docs. Each
 * is a copy that will not change when this constant does. Use this wherever
 * the price is rendered, and migrate those when they are next touched.
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
    id: 'depth',
    title: 'Deeper thinking',
    blurb: 'all four depth modes, at your pace.',
  },
  {
    id: 'map',
    title: 'Full Thinking Maps',
    blurb: 'unbounded branching and every view.',
  },
  {
    id: 'research',
    title: 'Research',
    blurb: 'across the whole map, as often as it\u2019s needed.',
  },
  {
    id: 'draft',
    title: 'Advanced Logos tools',
    blurb: 'Draft Space, long-form, multimodal.',
  },
  {
    id: 'history',
    title: 'Persistent reasoning',
    blurb: 'your history and personalization, kept.',
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
 * Hold a free map at its boundary.
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
  limit: number = PLANS.free.mapNodes ?? 8
): { map: T; capped: boolean } {
  const nodes = next?.nodes ?? [];
  if (nodes.length <= limit) return { map: next, capped: false };

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

/** Free thinking happens at Balanced; the other registers are One's. */
export const FREE_DEPTH = 'balanced';

export function depthForPlan<T extends string>(depth: T, plan: Plan): T | 'balanced' {
  return plan === 'one' ? depth : FREE_DEPTH;
}
