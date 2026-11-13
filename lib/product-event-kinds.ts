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
import { PATH_IDS } from './onboarding-paths';
import { LANDING_KINDS, REFERRER_KINDS } from './first-touch';
import { isCounted } from './product-events';
import {
  CAPABILITIES, CHALLENGE_FROM, CHALLENGE_SCOPES, FINDING_ACTIONS, FINDING_KINDS, L6_EVENTS, L6_OUTCOMES, LEVELS, LEVEL_HOW, OPEN_FROM,
} from './logos6/vocab';

/** The steps of the onboarding screen, in order, plus pressing an example. */
export const ONBOARDING_STEPS = ['premise', 'name', 'who', 'how', 'thought', 'example'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

const ROLE_IDS = new Set<string>(ROLES.map((r) => r.id));
/** what brings them (lib/onboarding-paths.ts) — the onboarding's third beat since November 2026; roles before it */
const PATHS_ = new Set<string>(PATH_IDS);
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
      return PATHS_.has(kind) || ROLE_IDS.has(kind) || kind === 'skipped' || kind === 'skip_all';
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
  if (L6.has(event)) return l6Kinds(event, p);
  // A first-run milestone: counted by surface when it names one.
  const surface = typeof p.surface === 'string' && SURFACES.has(p.surface) ? p.surface : 'any';
  return [surface];
}

/** The UTC day a count lands on: 'YYYY-MM-DD'. */
export function dayOf(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

// ── Logos 6 (lib/logos6/vocab.ts) ───────────────────────────────────────────────────────────────────────────────

const L6 = new Set<string>(L6_EVENTS);
const set = (xs: readonly string[]) => new Set<string>(xs);
const KINDS_ = set(FINDING_KINDS);
const ACTIONS_ = set(FINDING_ACTIONS);
const CFROM = set(CHALLENGE_FROM);
const SCOPES_ = set(CHALLENGE_SCOPES);
const OFROM = set(OPEN_FROM);
const LEVELS_ = set(LEVELS);
const HOW_ = set(LEVEL_HOW);
const CAPS = set(CAPABILITIES);
const OUTS = set(L6_OUTCOMES);
const TRIGGER = /^[a-z0-9][a-z0-9-]{0,39}$/;

/**
 * The counter keys a Logos 6 event increments. Each value is checked against its vocabulary; one that is
 * not in it makes the whole event uncounted (null) rather than counted as something else. While a feature
 * test runs, every key is counted again with its arm, so the two arms can be read side by side.
 */
function l6Kinds(event: string, p: Record<string, unknown>): string[] | null {
  const tok = (v: unknown, s: Set<string>) => (typeof v === 'string' && s.has(v) ? v : null);
  const arm = p.arm === 'control' || p.arm === 'treatment' ? p.arm : null;
  const armed = (keys: string[]) => (arm ? [...keys, ...keys.map((k) => `${k}|arm:${arm}`)] : keys);
  const count = typeof p.count === 'number' && Number.isFinite(p.count) ? String(Math.max(0, Math.min(9, Math.round(p.count)))) : null;
  switch (event) {
    case 'challenge_requested': {
      const from = tok(p.door, CFROM);
      const scope = tok(p.scope, SCOPES_);
      return from ? armed([`from:${from}`, ...(scope ? [`scope:${scope}`] : [])]) : null;
    }
    case 'challenge_shown': {
      const out = tok(p.outcome, OUTS) ?? 'found';
      return armed([`outcome:${out}`, ...(count ? [`count:${count}`] : [])]);
    }
    case 'finding_action': {
      const kind = tok(p.kind, KINDS_);
      const act = tok(p.outcome, ACTIONS_);
      return kind && act ? armed([`${kind}:${act}`]) : null;
    }
    case 'focus_opened':
    case 'idea_opened':
    case 'conversation_opened':
    case 'evidence_opened': {
      const from = tok(p.door, OFROM);
      return from ? armed([`from:${from}`]) : null;
    }
    case 'level_changed': {
      const a = tok(p.door, LEVELS_);
      const b = tok(p.level, LEVELS_);
      const how = tok(p.kind, HOW_);
      return a && b && a !== b ? [`${a}>${b}`, ...(how ? [`how:${how}`] : [])] : null;
    }
    case 'idea_added':
      return armed(['any']);
    case 'simpler_deeper': {
      const which = p.kind === 'simpler' || p.kind === 'deeper' ? p.kind : null;
      const from = tok(p.door, OFROM);
      return which ? armed([`which:${which}`, ...(from ? [`from:${from}`] : [])]) : null;
    }
    case 'source_check':
    case 'compare_run':
    case 'explain_back':
    case 'guess_first': {
      const out = tok(p.outcome, OUTS);
      return out ? armed([`outcome:${out}`, ...(count ? [`count:${count}`] : [])]) : null;
    }
    case 'one_checkout_context': {
      const cap = tok(p.kind, CAPS) ?? 'none';
      const trig = typeof p.trigger === 'string' && TRIGGER.test(p.trigger) ? p.trigger : 'unknown';
      return [`cap:${cap}`, `trigger:${trig}`];
    }
    default:
      return null;
  }
}
