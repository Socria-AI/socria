// lib/first-run.ts
//
// ONE RECORD OF WHAT A PERSON HAS ALREADY LEARNED, for every surface.
//
// Socria teaches itself in three places — the universal premise once, Core's
// one difference once, Logos's new interaction once — and each used to keep
// its own flag in its own key: `socria.tour.v1`, `socria.firstmap.v1`,
// `socria.logos.guide.v1`, `socria.core4IntroDontShowAgain.v1`. Four booleans
// in four files is how a person who has used Core for months is greeted as a
// stranger by Logos, and how a Logos-first person is walked through Socria
// from scratch by the chat. This module is the one place that knows what has
// been learned, keyed by MILESTONE rather than by screen, so each surface can
// ask "have they met this idea?" rather than "have they seen my modal?".
//
// A MILESTONE IS REACHED BY DOING, NEVER BY TIME. Every entry here is the
// timestamp of something the person did — submitted a thought, got a reply,
// moved a value — and the first time it happens is the only time it counts.
// `reach()` says whether it was fresh, and that is the only moment an
// analytics event is sent, so a refresh cannot double-count anything.
//
// LOCAL FIRST, ACCOUNT SECOND. The record lives in this browser under one key
// (which the account sweep in lib/local-data.ts keeps, because it describes
// what this device has shown rather than who was here) and, for an account,
// is merged with the copy on the profile row. Merging is a union — the
// EARLIEST time per milestone wins — so two devices can never argue, a stale
// tab can never un-teach, and a guest's record is claimed by the account they
// make without a migration step: sign in, the local record uploads.
//
// Pure, apart from the two storage helpers, because what goes wrong here is
// never the markup: it is teaching twice, teaching the wrong person, or
// refusing to stop.

/** Everything a surface may ask about. Prefixed by the surface it belongs to. */
export const MILESTONES = [
  // ── Socria, once ──
  /** the premise was shown — "Most AI gives you an answer." — or skipped */
  'socria.intro',
  /** a first real thought was submitted, on any surface */
  'socria.thought',
  // ── Core ──
  /** Core's one line of guidance was shown, after a first reply */
  'core.first',
  /** they continued the conversation past the first reply */
  'core.aha',
  // ── Logos ──
  /** the Logos sequence began on their own first map */
  'logos.first',
  /** their language became a map or a model for the first time */
  'logos.model',
  /** they changed something on it — a value, a card, a view */
  'logos.manipulated',
  /** they opened an object to see what it is */
  'logos.inspected',
  /** they asked the conversation about an object by its identity */
  'logos.asked',
  /** the sequence released them */
  'logos.aha',
  // ── found along the way, each once, when its value was legible ──
  'found.trace',
  'found.views',
  'found.dependencies',
  'found.compare',
  'found.evidence',
] as const;
export type Milestone = (typeof MILESTONES)[number];

export interface FirstRun {
  v: 1;
  /** milestone → when it was first reached (ms since epoch) */
  at: Partial<Record<Milestone, number>>;
  /** milestones the person chose to skip rather than do; a skip still counts as reached */
  skipped?: Milestone[];
}

export const FIRST_RUN_KEY = 'socria.firstrun.v1';

export const EMPTY_FIRST_RUN: FirstRun = { v: 1, at: {} };

/**
 * Every browser key the first run is read from: the record, the older flags it
 * reads as legacy milestones, the first-map share note, and the hints. Clearing
 * all of them is what "start again as a new person" means on this device.
 */
export const FIRST_RUN_KEYS = [
  FIRST_RUN_KEY,
  'socria.tour.v1',
  'socria.firstmap.v1',
  'socria.firstMap.v1',
  'socria.logos.guide.v1',
  'socria.core4IntroDontShowAgain.v1',
  'socria.hints.seen.v1',
  // what they told onboarding they mostly think about, so a replay asks again
  'socria.role.v1',
] as const;

/**
 * WHAT CAN BE REPLAYED, for testing (Manage Account → Testing, never on
 * production). Each part names the milestones it takes back and the older
 * browser flags that would otherwise put them straight back (legacyMilestones).
 */
export const REPLAYS = {
  all: { milestones: [...MILESTONES] as Milestone[], keys: [...FIRST_RUN_KEYS] as string[] },
  core: { milestones: ['core.first', 'core.aha'] as Milestone[], keys: ['socria.core4IntroDontShowAgain.v1'] },
  logos: {
    milestones: MILESTONES.filter((m) => m.startsWith('logos.')) as Milestone[],
    keys: ['socria.firstmap.v1', 'socria.firstMap.v1', 'socria.logos.guide.v1'],
  },
  found: { milestones: MILESTONES.filter((m) => m.startsWith('found.')) as Milestone[], keys: ['socria.hints.seen.v1'] },
} as const;
export type ReplayPart = keyof typeof REPLAYS;

/** The record with these milestones taken back — as if they had never been reached. */
export function withoutMilestones(s: FirstRun, ms: readonly Milestone[]): FirstRun {
  const at = { ...s.at };
  for (const m of ms) delete at[m];
  const skipped = (s.skipped ?? []).filter((m) => !ms.includes(m));
  return { v: 1, at, ...(skipped.length ? { skipped } : {}) };
}

/** Forget, on this device, everything the first run has shown. */
export function forgetFirstRunLocal(store: Pick<Storage, 'removeItem'> | null | undefined): void {
  for (const k of FIRST_RUN_KEYS) {
    try {
      store?.removeItem(k);
    } catch {}
  }
}

const isMilestone = (v: unknown): v is Milestone =>
  typeof v === 'string' && (MILESTONES as readonly string[]).includes(v);

/** A record from anywhere — storage, the wire — trusted for nothing. */
export function parseFirstRun(raw: unknown): FirstRun {
  const out: FirstRun = { v: 1, at: {} };
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as { at?: unknown; skipped?: unknown };
  if (r.at && typeof r.at === 'object') {
    for (const [k, v] of Object.entries(r.at as Record<string, unknown>)) {
      if (isMilestone(k) && typeof v === 'number' && Number.isFinite(v) && v > 0) out.at[k] = v;
    }
  }
  if (Array.isArray(r.skipped)) {
    const s = r.skipped.filter(isMilestone);
    if (s.length) out.skipped = [...new Set(s)];
  }
  return out;
}

export function has(s: FirstRun, m: Milestone): boolean {
  return typeof s.at[m] === 'number';
}

/**
 * Reach a milestone. Idempotent: the first time is the only time, and `fresh`
 * says whether this call was it — which is the one moment to tell analytics.
 */
export function reach(
  s: FirstRun,
  m: Milestone,
  now: number = Date.now(),
  opts: { skipped?: boolean } = {}
): { state: FirstRun; fresh: boolean } {
  if (has(s, m)) return { state: s, fresh: false };
  const state: FirstRun = { ...s, at: { ...s.at, [m]: now } };
  if (opts.skipped) state.skipped = [...new Set([...(s.skipped ?? []), m])];
  return { state, fresh: true };
}

/** Both records, as one: the earliest time per milestone, the union of skips. */
export function mergeFirstRun(a: FirstRun, b: FirstRun): FirstRun {
  const at: FirstRun['at'] = { ...a.at };
  for (const [k, v] of Object.entries(b.at) as [Milestone, number][]) {
    at[k] = typeof at[k] === 'number' ? Math.min(at[k] as number, v) : v;
  }
  const skipped = [...new Set([...(a.skipped ?? []), ...(b.skipped ?? [])])];
  return { v: 1, at, ...(skipped.length ? { skipped } : {}) };
}

/** Does `local` know anything `remote` does not? (Then the account should be told.) */
export function aheadOf(local: FirstRun, remote: FirstRun): boolean {
  for (const [k, v] of Object.entries(local.at) as [Milestone, number][]) {
    const r = remote.at[k];
    if (typeof r !== 'number' || v < r) return true;
  }
  return (local.skipped ?? []).some((m) => !(remote.skipped ?? []).includes(m));
}

// ── the browser ───────────────────────────────────────────────────────

type ReadStore = Pick<Storage, 'getItem'>;
type WriteStore = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * The older flags, read once so nobody who finished the old sequences is
 * taught again by the new ones. They are not deleted: the surfaces that still
 * read them (the account sheet's "retake the tour") keep working.
 */
export function legacyMilestones(store: ReadStore | null | undefined, now: number = Date.now()): FirstRun {
  const out: FirstRun = { v: 1, at: {} };
  const get = (k: string) => {
    try {
      return store?.getItem(k) ?? null;
    } catch {
      return null;
    }
  };
  // The furniture tour ran only for people who had an account and a chat: they
  // have met Socria.
  if (get('socria.tour.v1') === '1') out.at['socria.intro'] = now;
  // The Core 4 announcement was dismissed for good: Core's difference was met.
  if (get('socria.core4IntroDontShowAgain.v1') === '1') {
    out.at['socria.intro'] = out.at['socria.intro'] ?? now;
    out.at['core.first'] = now;
  }
  // The Logos guide was seen: the Logos sequence started.
  if (get('socria.logos.guide.v1') === '1') out.at['logos.first'] = now;
  // The first-map coach marks were finished: the whole Logos sequence is done.
  if (get('socria.firstmap.v1') === 'done') {
    out.at['logos.first'] = out.at['logos.first'] ?? now;
    out.at['logos.model'] = now;
    out.at['logos.aha'] = now;
  }
  return out;
}

/**
 * Read the record from this browser, folding in the older flags.
 *
 * A store that throws reads as EVERYTHING LEARNED: in a private window or with
 * site data blocked we cannot know what this person has seen, and a product
 * that re-teaches somebody every time they open it is worse than one that
 * stays quiet. A corrupt value reads as nothing learned and is overwritten on
 * the next write — one bad key must not disable teaching forever.
 */
export function readFirstRun(store: ReadStore | null | undefined): FirstRun {
  let raw: string | null;
  try {
    raw = store?.getItem(FIRST_RUN_KEY) ?? null;
  } catch {
    const all: FirstRun = { v: 1, at: {} };
    for (const m of MILESTONES) all.at[m] = 1;
    return all;
  }
  let own: FirstRun = EMPTY_FIRST_RUN;
  if (raw) {
    try {
      own = parseFirstRun(JSON.parse(raw));
    } catch {
      own = EMPTY_FIRST_RUN;
    }
  }
  return mergeFirstRun(own, legacyMilestones(store));
}

export function writeFirstRun(store: WriteStore | null | undefined, s: FirstRun): void {
  try {
    store?.setItem(FIRST_RUN_KEY, JSON.stringify(s));
  } catch {
    // Out of quota, private mode — the record still holds for this session.
  }
}

// ── decisions ─────────────────────────────────────────────────────────
//
// Each surface asks one question. The answers are here, together, because the
// one thing they must agree on is that nobody is taught the same idea twice.

/**
 * Show the premise?
 *
 * Only to somebody with NOTHING yet — no conversation, no line of thinking,
 * nothing carried in from the page that just introduced Socria. A person with
 * work on screen has met the product, whatever the record says, and a person
 * arriving with a sentence from the introduction has just read it.
 */
export function wantsIntro(s: FirstRun, ctx: { work: number; carried: boolean; hydrated: boolean }): boolean {
  if (!ctx.hydrated) return false;
  if (has(s, 'socria.intro')) return false;
  if (ctx.carried) return false;
  return ctx.work === 0;
}

/**
 * Show Core's one line?
 *
 * After a first reply has landed — real, from the real engine — and before a
 * second message is sent: the one moment the difference is on screen to be
 * read against. Never while a reply is streaming, never twice.
 */
export function wantsCoreLine(s: FirstRun, ctx: { replies: number; streaming: boolean }): boolean {
  if (has(s, 'core.first')) return false;
  if (ctx.streaming) return false;
  return ctx.replies >= 1;
}

/** Which milestone a surface's own flag maps to, for the surfaces that keep one. */
export const ANALYTICS_FOR: Partial<Record<Milestone, string>> = {
  'socria.intro': 'socria_intro_completed',
  'socria.thought': 'first_thought_submitted',
  'core.first': 'core_first_experience_completed',
  'core.aha': 'core_aha_reached',
  'logos.first': 'logos_first_experience_started',
  'logos.model': 'logos_first_model_created',
  'logos.manipulated': 'logos_first_manipulation',
  'logos.inspected': 'logos_first_object_inspected',
  'logos.asked': 'logos_first_ask_this',
  'logos.aha': 'logos_first_experience_completed',
  'found.trace': 'progressive_trace_discovered',
  'found.views': 'progressive_view_discovered',
  'found.dependencies': 'progressive_dependencies_discovered',
  'found.compare': 'progressive_compare_discovered',
  'found.evidence': 'progressive_evidence_discovered',
};
