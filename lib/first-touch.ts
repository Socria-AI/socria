// lib/first-touch.ts
//
// How somebody first arrived, so that when they make an account the sign-up
// can be traced back to what brought them — a search, a post, a campaign —
// and the work that brings people in can be measured instead of guessed at.
//
// SHAPE ONLY, LIKE EVERY OTHER EVENT (lib/analytics.ts). What is kept is a
// kind of page ('docs', 'blog', 'home'), a kind of site ('google',
// 'perplexity', 'reddit' — or 'other', never a hostname nobody listed) and
// the campaign tags a link of ours carried. Never a full address, never a
// search phrase, never who they are.
//
// ASKED BEFORE IT IS KEPT. Keeping it means writing to the visitor's device,
// and in the EU, the EEA, the UK and Switzerland that needs their consent; so
// the note is written only after the server has said this visitor is outside
// those places (app/api/first-touch, by the same country list as the
// newsletter box). Anywhere else, and wherever the country is unknown,
// nothing is written — their sign-up still counts, just without a source.
//
// Pure apart from the two small store helpers, which take the store as an
// argument and never throw.

export const FIRST_TOUCH_KEY = 'socria.first-touch.v1';
/** A note older than this is not a first touch for today's sign-up. */
export const FIRST_TOUCH_MAX_AGE = 90 * 86_400_000;

export interface FirstTouch {
  /** the kind of page they arrived on */
  landing: string;
  /** the kind of site that sent them */
  referrer: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  /** when, ms */
  at: number;
}

const LANDINGS: [RegExp, string][] = [
  [/^\/$/, 'home'],
  [/^\/docs(\/|$)/, 'docs'],
  [/^\/blog(\/|$)/, 'blog'],
  [/^\/explore(\/|$)/, 'explore'],
  [/^\/one(\/|$)/, 'one'],
  [/^\/(logos|logos2|surfaces|core4model)(\/|$)/, 'logos'],
  [/^\/students(\/|$)/, 'students'],
  [/^\/support(\/|$)/, 'support'],
  [/^\/sign-up(\/|$)/, 'sign-up'],
  [/^\/sign-in(\/|$)/, 'sign-in'],
  [/^\/chat(\/|$)/, 'chat'],
  [/^\/(privacy|terms|security|subprocessors)(\/|$)/, 'legal'],
  [/^\/s\//, 'share'],
];

/** The kind of page a path is. */
export function landingBucket(pathname: string, search = ''): string {
  if (/^\/sign-up(\/|$)/.test(pathname) && /(^|[?&])invited=1(&|$)/.test(search)) return 'invite';
  for (const [re, name] of LANDINGS) if (re.test(pathname)) return name;
  return 'other';
}

// Most specific first: a mail client on a Google host is email, not search;
// Gemini is an answer engine, not Google search.
const REFERRERS: [RegExp, string][] = [
  [/(^|\.)mail\.google\.com$|(^|\.)outlook\.(live|office|office365)\.com$|(^|\.)mail\.yahoo\.com$/, 'email'],
  [/(^|\.)gemini\.google\.com$/, 'gemini'],
  // a Google search domain ends in google.<tld>, google.co.<cc> or
  // google.com.<cc>; "google.evil.com" is somebody else's site
  [/(^|\.)google\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/, 'google'],
  [/(^|\.)bing\.com$/, 'bing'],
  [/(^|\.)duckduckgo\.com$/, 'duckduckgo'],
  [/(^|\.)yahoo\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/, 'yahoo'],
  [/(^|\.)ecosia\.org$/, 'ecosia'],
  [/(^|\.)search\.brave\.com$/, 'brave'],
  [/(^|\.)(chatgpt\.com|openai\.com)$/, 'chatgpt'],
  [/(^|\.)perplexity\.ai$/, 'perplexity'],
  [/(^|\.)claude\.ai$/, 'claude'],
  [/(^|\.)copilot\.microsoft\.com$/, 'copilot'],
  [/(^|\.)(x\.com|twitter\.com|t\.co)$/, 'x'],
  [/(^|\.)(linkedin\.com|lnkd\.in)$/, 'linkedin'],
  [/(^|\.)reddit\.com$/, 'reddit'],
  [/(^|\.)(facebook\.com|fb\.com)$/, 'facebook'],
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)threads\.net$/, 'threads'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)news\.ycombinator\.com$/, 'hackernews'],
  [/(^|\.)producthunt\.com$/, 'producthunt'],
  [/(^|\.)github\.com$/, 'github'],
  [/(^|\.)(discord\.com|discordapp\.com|discord\.gg)$/, 'discord'],
  [/(^|\.)uta\.edu$/, 'uta'],
];

/** Every kind a referrer can be, for anything that must check one (lib/product-event-kinds.ts). */
export const REFERRER_KINDS: readonly string[] = [...new Set([...REFERRERS.map(([, k]) => k), 'direct', 'other', 'unknown'])];

/** Every kind a landing page can be, likewise. */
export const LANDING_KINDS: readonly string[] = [...new Set([...LANDINGS.map(([, k]) => k), 'invite', 'other', 'unknown'])];

/** The kind of site a referrer is: 'direct' with none, 'other' when unlisted. */
export function referrerBucket(referrer: string | null | undefined, selfHost: string): string {
  if (!referrer) return 'direct';
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return 'other';
  }
  const self = selfHost.toLowerCase();
  if (host === self || host === `www.${self}` || self === `www.${host}`) return 'direct';
  for (const [re, name] of REFERRERS) if (re.test(host)) return name;
  return 'other';
}

/** A campaign tag, as a short token — or nothing. */
export function utmToken(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return t || undefined;
}

/** The first touch a page view would be, from its own address and referrer. */
export function firstTouchFrom(href: string, referrer: string | null | undefined, now: number): FirstTouch | null {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  const ft: FirstTouch = {
    landing: landingBucket(u.pathname, u.search),
    referrer: referrerBucket(referrer, u.hostname),
    at: now,
  };
  const src = utmToken(u.searchParams.get('utm_source'));
  const med = utmToken(u.searchParams.get('utm_medium'));
  const cmp = utmToken(u.searchParams.get('utm_campaign'));
  if (src) ft.utm_source = src;
  if (med) ft.utm_medium = med;
  if (cmp) ft.utm_campaign = cmp;
  return ft;
}

function valid(v: unknown, now: number): v is FirstTouch {
  if (!v || typeof v !== 'object') return false;
  const f = v as Partial<FirstTouch>;
  return (
    typeof f.landing === 'string' &&
    typeof f.referrer === 'string' &&
    typeof f.at === 'number' &&
    now - f.at >= 0 &&
    now - f.at <= FIRST_TOUCH_MAX_AGE
  );
}

/** The stored first touch, if there is a current one. */
export function recallFirstTouch(store: Pick<Storage, 'getItem'> | null | undefined, now: number): FirstTouch | null {
  try {
    const raw = store?.getItem(FIRST_TOUCH_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!valid(v, now)) return null;
    return {
      landing: utmToken(v.landing) ?? 'other',
      referrer: utmToken(v.referrer) ?? 'other',
      at: v.at,
      ...(utmToken(v.utm_source) ? { utm_source: utmToken(v.utm_source) } : {}),
      ...(utmToken(v.utm_medium) ? { utm_medium: utmToken(v.utm_medium) } : {}),
      ...(utmToken(v.utm_campaign) ? { utm_campaign: utmToken(v.utm_campaign) } : {}),
    };
  } catch {
    return null;
  }
}

/** Keep it — once. A current note is never overwritten: first means first. */
export function rememberFirstTouch(
  store: Pick<Storage, 'getItem' | 'setItem'> | null | undefined,
  ft: FirstTouch
): boolean {
  try {
    if (!store || recallFirstTouch(store, ft.at)) return false;
    store.setItem(FIRST_TOUCH_KEY, JSON.stringify(ft));
    return true;
  } catch {
    return false;
  }
}

export function forgetFirstTouch(store: Pick<Storage, 'removeItem'> | null | undefined): void {
  try {
    store?.removeItem(FIRST_TOUCH_KEY);
  } catch {
    // nothing to do
  }
}

/** What the sign-up event carries: the note, or 'unknown' where there is none. */
export function signupProps(ft: FirstTouch | null): {
  landing: string;
  referrer: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
} {
  if (!ft) return { landing: 'unknown', referrer: 'unknown' };
  return {
    landing: ft.landing,
    referrer: ft.referrer,
    ...(ft.utm_source ? { utm_source: ft.utm_source } : {}),
    ...(ft.utm_medium ? { utm_medium: ft.utm_medium } : {}),
    ...(ft.utm_campaign ? { utm_campaign: ft.utm_campaign } : {}),
  };
}
