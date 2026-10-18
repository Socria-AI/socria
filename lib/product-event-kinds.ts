// lib/product-event-kinds.ts
//
// What a counted event may write, decided on the server.
//
// The beacon (lib/product-events.ts) is called from a browser, so anything in
// it could have been typed by anyone. Every value that becomes part of a
// counter key is therefore checked against a fixed vocabulary here — the
// onboarding's own role, model and starting-point ids, the surfaces, and the
// kinds lib/first-touch.ts already reduces a referrer and a landing page to.
// Anything else is refused, so the table can only ever hold the tokens the
// dashboard knows how to name.
//
// PURE.

import { ROLES } from './onboarding-roles';
import { INTENTS, START_MODELS } from './onboarding-intents';
import { LANDING_KINDS, REFERRER_KINDS } from './first-touch';
import { isCounted } from './product-events';

/** The steps of the onboarding screen, in order, plus pressing an example. */
export const ONBOARDING_STEPS = ['premise', 'name', 'who', 'how', 'thought', 'example'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

const ROLE_IDS = new Set<string>(ROLES.map((r) => r.id));
const INTENT_IDS = new Set<string>(INTENTS.map((i) => i.id));
const MODELS = new Set<string>(START_MODELS);
const SURFACES = new Set(['core', 'logos']);
const REFERRERS = new Set(REFERRER_KINDS);
const LANDINGS = new Set(LANDING_KINDS);
/** A campaign tag as lib/first-touch.ts utmToken leaves one: lowercase, at most 40 characters, no spaces. */
const UTM = /^[a-z0-9][a-z0-9._-]{0,39}$/;

/** Whether `kind` is a possible answer to `step`. 'skip_all' is the Skip button, pressed on that step. */
export function answerAllowed(step: string, kind: string): boolean {
  switch (step) {
    case 'premise':
      return kind === 'continued' || kind === 'skip_all';
    case 'name':
      // never the name itself: whether one was given
      return kind === 'given' || kind === 'skipped' || kind === 'skip_all';
    case 'who':
      return ROLE_IDS.has(kind) || kind === 'skipped' || kind === 'skip_all';
    case 'how':
      return MODELS.has(kind) || kind === 'skipped' || kind === 'skip_all';
    case 'thought':
      return INTENT_IDS.has(kind) || kind === 'none' || kind === 'skip_all';
    case 'example':
      return INTENT_IDS.has(kind);
    default:
      return false;
  }
}

/**
 * The counter keys one event increments, or null when the event is not
 * counted or anything in it is outside the vocabularies.
 */
export function kindsFor(event: unknown, props: unknown): string[] | null {
  if (typeof event !== 'string' || !isCounted(event)) return null;
  const p = (props && typeof props === 'object' && !Array.isArray(props) ? props : {}) as Record<string, unknown>;
  if (event === 'onboarding_answered') {
    const step = typeof p.step === 'string' ? p.step : '';
    const kind = typeof p.kind === 'string' ? p.kind : '';
    return answerAllowed(step, kind) ? [`${step}:${kind}`] : null;
  }
  if (event === 'signup_completed') {
    const ref = typeof p.referrer === 'string' && REFERRERS.has(p.referrer) ? p.referrer : 'unknown';
    const land = typeof p.landing === 'string' && LANDINGS.has(p.landing) ? p.landing : 'unknown';
    const utm = typeof p.utm_source === 'string' && UTM.test(p.utm_source) ? p.utm_source : null;
    // the campaign tag too, so a sign-up that began on an event's link can be counted against that event
    const camp = typeof p.utm_campaign === 'string' && UTM.test(p.utm_campaign) ? p.utm_campaign : null;
    return [`ref:${ref}`, `land:${land}`, ...(utm ? [`utm:${utm}`] : []), ...(camp ? [`camp:${camp}`] : [])];
  }
  if (event === 'event_page_viewed') {
    // an event id has the shape of one (lib/events/model.ts EVENT_ID); the dashboard reads only events that exist
    const ev = typeof p.event === 'string' && /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(p.event) ? p.event : null;
    if (!ev) return null;
    const src = typeof p.ref === 'string' && UTM.test(p.ref) ? `ref:${p.ref}` : typeof p.utm_source === 'string' && UTM.test(p.utm_source) ? `utm:${p.utm_source}` : 'direct';
    return [`ev:${ev}`, `ev:${ev}|${src}`];
  }
  // A first-run milestone: counted by surface when it names one.
  const surface = typeof p.surface === 'string' && SURFACES.has(p.surface) ? p.surface : 'any';
  return [surface];
}

/** The UTC day a count lands on: 'YYYY-MM-DD'. */
export function dayOf(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}
