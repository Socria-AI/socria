// lib/gifts.ts — NOW AND THEN, A TASTE OF SOCRIA ONE.
//
// Someone on the trial is handed, occasionally, something Socria One has, with
// one small note saying so — so what they would be paying for is something
// they have seen, not a line on a pricing page. Two gifts:
//
//   · A DEEP ANSWER. When a question genuinely needs depth (the router reads
//     it as `deep`: a proof, a pushback, a document to reason over…), the
//     first such question in each GIFT_DEEP_WINDOW is answered by Socria One's
//     deep model instead of the trial's. Decided on the server, claimed once
//     per window in logos_usage (createOnce: two requests at once, one gift),
//     and said in the X-Socria-Gift header so the app can show its note.
//     Never for a guest, never for a member (who has it anyway), never for a
//     light or ordinary turn — a gift on "thanks" would be a gift nobody sees.
//   · ONE TRY OF CELESTIAL. A couple of days in, the Celestial theme is offered
//     once — ever — to try for the rest of that visit. After it the theme is
//     Socria One's again: the reader is put back on the theme they had, and told
//     once, quietly, next time they come. Kept in this browser, like the theme
//     itself (lib/theme.ts); the visit is this tab's session.
//
// NOT ANNOYING. At most one gift note a day (GIFT_NOTE_GAP_MS), never over
// another sheet, never during onboarding, always dismissible, never modal.
// Nothing made with a gift is taken away: a deep answer stays the answer.
//
// SOCRIA_GIFTS=off turns both off without a code change.
//
// Pure, apart from the small localStorage readers at the end (which never throw).

import type { ThemeId } from './theme';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whether gifts are on (SOCRIA_GIFTS=off, 0, false or no turns them off). */
export function giftsOn(env: Record<string, string | undefined> = {}): boolean {
  return !['off', '0', 'false', 'no'].includes((env.SOCRIA_GIFTS ?? '').trim().toLowerCase());
}

// ── the deep answer ──────────────────────────────────────────────────

/** At most one deep answer in each window of this length. */
export const GIFT_DEEP_WINDOW_MS = 4 * DAY_MS;

/** The window `now` falls in: the claim's scope carries it, so each window has its own one gift. */
export function deepGiftWindow(now: number): number {
  return Math.floor(now / GIFT_DEEP_WINDOW_MS);
}

/** The usage row a window's gift is claimed in. */
export function deepGiftRow(userId: string, now: number): { user: string; scope: string; counter: string } {
  return { user: userId, scope: `gift:deep:${deepGiftWindow(now)}`, counter: 'deep' };
}

/** Whether this turn may be offered the deep answer at all (the claim then decides whether it is). */
export function deepGiftWanted(a: { tier: 'guest' | 'free' | 'one'; level: 'light' | 'standard' | 'deep'; on: boolean; unrouted?: boolean }): boolean {
  return a.on && !a.unrouted && a.tier === 'free' && a.level === 'deep';
}

/** The response header the app reads; its only value is 'deep'. */
export const GIFT_HEADER = 'X-Socria-Gift';

// ── the theme pass ───────────────────────────────────────────────────

export const THEME_GIFT = {
  /** Celestial — its key is still 'night' (lib/theme.ts) */
  theme: 'night' as ThemeId,
  /** not before this many days after this browser first opened the app */
  afterDays: 2,
} as const;

export const THEME_GIFT_KEY = 'socria.gift.theme.v2';
/** Set in sessionStorage while the one try runs: this visit, this tab. */
export const THEME_TRY_KEY = 'socria.gift.theme.try';

export interface ThemeGift {
  /** when this browser first opened the app (ms) */
  firstSeen: number;
  /** when the try was offered — once, ever */
  offeredAt?: number;
  /** when it was taken up */
  triedAt?: number;
  /** the theme they had before, put back when the try is over */
  before?: ThemeId;
  /** the end of the try has been said */
  endSaid?: boolean;
}

const THEME_KEYS = ['paper', 'white', 'dark', 'night', 'one'];

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);

/** A stored pass, cleaned: anything malformed is as if it were not there. */
export function parseThemeGift(raw: unknown, now: number): ThemeGift {
  let v: Record<string, unknown> = {};
  try {
    v = typeof raw === 'string' ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {}
  if (!v || typeof v !== 'object') v = {};
  const before = typeof v.before === 'string' && THEME_KEYS.includes(v.before) && v.before !== THEME_GIFT.theme ? (v.before as ThemeId) : undefined;
  return {
    firstSeen: Math.min(now, num(v.firstSeen) ?? now),
    ...(num(v.offeredAt) ? { offeredAt: num(v.offeredAt) } : {}),
    ...(num(v.triedAt) ? { triedAt: num(v.triedAt) } : {}),
    ...(before ? { before } : {}),
    ...(v.endSaid === true ? { endSaid: true } : {}),
  };
}

/** Whether the one try is running: taken up, and this is still the visit it was taken up in. */
export function themeTryActive(g: ThemeGift, inVisit: boolean): boolean {
  return !!g.triedAt && inVisit;
}

/** The theme the try opens while it runs, else null. */
export function passTheme(g: ThemeGift, inVisit: boolean): ThemeId | null {
  return themeTryActive(g, inVisit) ? THEME_GIFT.theme : null;
}

/** Whether to offer the try now (to someone who may receive gifts: signed in, not a member). Once, ever. */
export function themeGiftDue(g: ThemeGift, now: number): boolean {
  if (g.offeredAt || g.triedAt) return false;
  return now - g.firstSeen >= THEME_GIFT.afterDays * DAY_MS;
}

/** Whether the try is over (a later visit) and that has not yet been said. */
export function themeTryEnded(g: ThemeGift, inVisit: boolean): boolean {
  return !!g.triedAt && !inVisit && !g.endSaid;
}

export const offered = (g: ThemeGift, now: number): ThemeGift => ({ ...g, offeredAt: now });
export const accepted = (g: ThemeGift, now: number, before: ThemeId | null): ThemeGift => ({
  ...g,
  offeredAt: g.offeredAt ?? now,
  triedAt: now,
  ...(before && before !== THEME_GIFT.theme ? { before } : {}),
  endSaid: false,
});
export const endSaid = (g: ThemeGift): ThemeGift => ({ ...g, endSaid: true });

// ── the notes ────────────────────────────────────────────────────────

export type GiftNoteKind = 'deep' | 'theme-offer' | 'theme-ended';

/** No more than one gift note a day. */
export const GIFT_NOTE_GAP_MS = DAY_MS;
export const GIFT_NOTE_KEY = 'socria.gift.note.v1';

/** Whether a note may show now, given when the last one did. A deep answer's note always may: the answer is on screen. */
export function noteAllowed(kind: GiftNoteKind, lastAt: number | null, now: number): boolean {
  if (kind === 'deep') return true;
  return lastAt === null || now - lastAt >= GIFT_NOTE_GAP_MS;
}

export const GIFT_NOTES: Record<GiftNoteKind, { title: string; body: string; action: string; dismiss: string }> = {
  deep: {
    title: 'Socria One’s deepest model, on us',
    body: 'That question needed more thought, so this answer came from the model Socria One members get. Now and then, a trial gets one.',
    action: 'See Socria One',
    dismiss: 'Got it',
  },
  'theme-offer': {
    title: 'Try Celestial, once',
    body: 'Socria One’s deep-space theme, with your map as a star chart. It’s yours for this visit; after that it comes with Socria One.',
    action: 'Try it',
    dismiss: 'Not now',
  },
  'theme-ended': {
    title: 'That was your look at Celestial',
    body: 'You’re back on your own theme. Celestial comes with Socria One, along with its other themes.',
    action: 'See Socria One',
    dismiss: 'OK',
  },
};

// ── this browser's ledger (never throws) ─────────────────────────────

type Store = Pick<Storage, 'getItem' | 'setItem'> | null | undefined;
const local = (): Store => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};
const session = (): Store => {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
};

/** Whether this visit is the one the try was taken up in. */
export function inTryVisit(store: Store = session()): boolean {
  try {
    return store?.getItem(THEME_TRY_KEY) === '1';
  } catch {
    return false;
  }
}

/** Mark this visit as the try's. */
export function beginTryVisit(store: Store = session()): void {
  try {
    store?.setItem(THEME_TRY_KEY, '1');
  } catch {}
}

export function readThemeGift(now: number, store: Store = local()): ThemeGift {
  try {
    return parseThemeGift(store?.getItem(THEME_GIFT_KEY) ?? null, now);
  } catch {
    return parseThemeGift(null, now);
  }
}

export function writeThemeGift(g: ThemeGift, store: Store = local()): void {
  try {
    store?.setItem(THEME_GIFT_KEY, JSON.stringify(g));
  } catch {}
}

/** The theme the running try opens in this browser, else null — what lib/theme.ts's callers pass as `granted`. */
export function giftedTheme(now = Date.now(), store: Store = local(), visit: Store = session()): ThemeId | null {
  return passTheme(readThemeGift(now, store), inTryVisit(visit));
}

export function lastNoteAt(store: Store = local()): number | null {
  try {
    const n = Number(store?.getItem(GIFT_NOTE_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function noteShown(now: number, store: Store = local()): void {
  try {
    store?.setItem(GIFT_NOTE_KEY, String(now));
  } catch {}
}
