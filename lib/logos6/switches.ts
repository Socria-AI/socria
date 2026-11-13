// lib/logos6/switches.ts — LOGOS 6, EACH PART SWITCHABLE (docs/LOGOS-6.md).
//
// Every part of Logos 6 can be turned on or off for a deployment without a
// code change: NEXT_PUBLIC_LOGOS6_<PART>=on|off, or NEXT_PUBLIC_LOGOS6=on|off
// for all of them at once.
//
// THE DEFAULT IS THE PLAN'S (docs/LOGOS-6-PLAN.md §6.E): every part ships
// behind a switch until its exit criterion is met, so a part is ON on dev,
// previews and a local server, and OFF in production until someone turns it
// on there. The one exception is the proactive flag, which is off everywhere
// until it is asked for by name: it waits for the benchmark (H1, H3).
//
// A FEATURE EXPERIMENT can narrow this further for one person
// (lib/logos6/arms-server.ts): somebody in an experiment's control arm sees
// Logos 5.5's behaviour for the parts that experiment covers. An arm never
// turns on a part the deployment has off.
//
// Read with literal `process.env.NEXT_PUBLIC_…` property names: Next.js
// inlines those into the client bundle at build time, and only those.
//
// PURE apart from reading the environment once, at load.

import { currentEnv, type Env } from '../environment';

export const L6_PARTS = [
  /** one challenge engine: words, the card's "Challenge it", a selection, a document (Phase 1) */
  'challenge',
  /** the "What am I missing?" chip above the composer (Phase 1) */
  'chip',
  /** one line under a reply when something high-stakes is worth checking — off until H1 and H3 hold */
  'proactive',
  /** one idea: what it rests on, what rests on it, what pulls against it (Phase 2) */
  'focus',
  /** links to an idea (?n=), idea chips that open it, the way into Project Home (Phase 2) */
  'links',
  /** "Add as idea": the person's own card, no reply, no tokens (Phase 2) */
  'addIdea',
  /** what a Project rests on, kept (Phase 2) */
  'projectRests',
  /** evidence links and "Check against my sources" (Phase 3) */
  'sources',
  /** "Where do these disagree?" across documents (Phase 3) */
  'compare',
  /** Simpler / Deeper on a reply or an idea (Phase 4) */
  'simpler',
  /** Explain it back: the Feynman technique, theirs to try (Phase 4) */
  'explainBack',
  /** Guess first: before a challenge opens, their own guess at the weakest part (Phase 4) */
  'guessFirst',
] as const;
export type L6Part = (typeof L6_PARTS)[number];
export type L6Flags = Record<L6Part, boolean>;

/** Off unless asked for by name, everywhere — production or not, and whatever NEXT_PUBLIC_LOGOS6 says. */
const BY_NAME_ONLY: ReadonlySet<L6Part> = new Set<L6Part>(['proactive']);

/** A part that only means something when another is on. */
const NEEDS: Partial<Record<L6Part, L6Part>> = { chip: 'challenge', proactive: 'challenge', guessFirst: 'challenge', compare: 'sources' };

const on = (v: string | undefined) => /^(on|1|true|yes)$/i.test((v ?? '').trim());
const off = (v: string | undefined) => /^(off|0|false|no)$/i.test((v ?? '').trim());

/** The parts, from the environment's words and the kind of deployment. `all` is NEXT_PUBLIC_LOGOS6. */
export function readL6(env: Partial<Record<L6Part | 'all', string | undefined>>, where: Env): L6Flags {
  const out = {} as L6Flags;
  for (const p of L6_PARTS) {
    const own = env[p];
    if (on(own)) out[p] = true;
    else if (off(own)) out[p] = false;
    else if (BY_NAME_ONLY.has(p)) out[p] = false;
    else if (on(env.all)) out[p] = true;
    else if (off(env.all)) out[p] = false;
    else out[p] = where !== 'production';
  }
  for (const p of L6_PARTS) {
    const need = NEEDS[p];
    if (need && !out[need]) out[p] = false;
  }
  return out;
}

export const LOGOS6: L6Flags = readL6(
  {
    all: process.env.NEXT_PUBLIC_LOGOS6,
    challenge: process.env.NEXT_PUBLIC_LOGOS6_CHALLENGE,
    chip: process.env.NEXT_PUBLIC_LOGOS6_CHIP,
    proactive: process.env.NEXT_PUBLIC_LOGOS6_PROACTIVE,
    focus: process.env.NEXT_PUBLIC_LOGOS6_FOCUS,
    links: process.env.NEXT_PUBLIC_LOGOS6_LINKS,
    addIdea: process.env.NEXT_PUBLIC_LOGOS6_ADD_IDEA,
    projectRests: process.env.NEXT_PUBLIC_LOGOS6_PROJECT_RESTS,
    sources: process.env.NEXT_PUBLIC_LOGOS6_SOURCES,
    compare: process.env.NEXT_PUBLIC_LOGOS6_COMPARE,
    simpler: process.env.NEXT_PUBLIC_LOGOS6_SIMPLER,
    explainBack: process.env.NEXT_PUBLIC_LOGOS6_EXPLAIN_BACK,
    guessFirst: process.env.NEXT_PUBLIC_LOGOS6_GUESS_FIRST,
  },
  currentEnv()
);

// ── feature arms, as the browser receives them ──────────────────────────────────────────────────────────────────

/** The arms a person is in, by experiment id, as /api/logos/plan reports them. Absent: no experiment runs. */
export type L6Arms = Partial<Record<string, 'control' | 'treatment'>>;

/** Which parts each experiment covers: its control arm sees Logos 5.5 for these. */
export const EXPERIMENT_PARTS: Readonly<Record<string, readonly L6Part[]>> = {
  // the field test of docs/LOGOS-6-PLAN.md §7.D: challenge with findings on the map, against Logos 5.5
  'l6-challenge': ['challenge', 'chip', 'proactive', 'guessFirst'],
};

/** The parts this person sees: the deployment's, narrowed by any control arm they are in. */
export function withArms(flags: L6Flags, arms: L6Arms | null | undefined): L6Flags {
  if (!arms) return flags;
  const out = { ...flags };
  for (const [id, arm] of Object.entries(arms)) {
    if (arm !== 'control') continue;
    for (const p of EXPERIMENT_PARTS[id] ?? []) out[p] = false;
  }
  return out;
}

/** The arm a person's events carry, for the one experiment that is running (counts only, never who). */
export function armToken(arms: L6Arms | null | undefined): 'control' | 'treatment' | undefined {
  if (!arms) return undefined;
  for (const a of Object.values(arms)) if (a === 'control' || a === 'treatment') return a;
  return undefined;
}

/** Arms off the wire, trusted for nothing. */
export function cleanArms(raw: unknown): L6Arms | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: L6Arms = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (/^[a-z0-9-]{1,40}$/.test(k) && (v === 'control' || v === 'treatment')) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}
