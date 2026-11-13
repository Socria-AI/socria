// lib/logos6/vocab.ts — THE WORDS LOGOS 6 COUNTS IN.
//
// Every value a Logos 6 event may carry, as fixed vocabularies, in one place:
// the browser sends them (lib/logos6/track6.ts), the server refuses anything
// else before it becomes a counter key (lib/product-event-kinds.ts), and the
// dashboard names them (app/dev/logos6). A token here is a door or a kind —
// never a label, a quote, a title or a document.
//
// PURE.

/** What a finding is about (lib/challenge/challenge.ts). */
export const FINDING_KINDS = ['assumption', 'gap', 'unsupported', 'contradiction', 'evidence', 'risk', 'alternative', 'consequence'] as const;
export type FindingKind = (typeof FINDING_KINDS)[number];

/** What the person did with a finding. 'more' is "Show more". */
export const FINDING_ACTIONS = ['kept', 'considered', 'dismissed', 'talked', 'resolved', 'more'] as const;
export type FindingAction = (typeof FINDING_ACTIONS)[number];

/** Where a challenge was asked for. */
export const CHALLENGE_FROM = ['words', 'chip', 'card', 'selection', 'document', 'flag', 'explore', 'focus'] as const;
export type ChallengeFrom = (typeof CHALLENGE_FROM)[number];

/** What a challenge covered. */
export const CHALLENGE_SCOPES = ['line', 'card', 'selection', 'document'] as const;
export type ChallengeScopeKind = (typeof CHALLENGE_SCOPES)[number];

/** Where a conversation, an idea, Focus or a passage was opened from. */
export const OPEN_FROM = [
  'disc', 'double', 'pinch', 'enter', 'pickup', 'waiting', 'sessions', 'search', 'memory', 'project', 'link',
  'chip', 'new', 'focus', 'finding', 'map', 'card', 'space', 'menu', 'check', 'compare', 'reply', 'idea',
] as const;
export type OpenFrom = (typeof OPEN_FROM)[number];

/** The levels of docs/LOGOS-6-PLAN.md §4.B, macro to micro. */
export const LEVELS = ['everything', 'project', 'line', 'idea', 'passage'] as const;
export type Level = (typeof LEVELS)[number];

/** How a level was changed. */
export const LEVEL_HOW = ['press', 'escape', 'crumb', 'pinch', 'link', 'back'] as const;
export type LevelHow = (typeof LEVEL_HOW)[number];

/** The capabilities a checkout may follow (H5): the last one used in the seven days before it. */
export const CAPABILITIES = ['challenge', 'focus', 'sources', 'compare', 'explain', 'idea', 'none'] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** What came of a Logos 6 moment. */
export const L6_OUTCOMES = ['found', 'held', 'structural', 'started', 'checked', 'taken', 'skipped', 'hit', 'miss', 'none', 'ok'] as const;
export type L6Outcome = (typeof L6_OUTCOMES)[number];

/** The Logos 6 events, as lib/analytics.ts lists them. */
export const L6_EVENTS = [
  'challenge_requested',
  'challenge_shown',
  'finding_action',
  'focus_opened',
  'idea_opened',
  'conversation_opened',
  'level_changed',
  'idea_added',
  'evidence_opened',
  'source_check',
  'compare_run',
  'simpler_deeper',
  'explain_back',
  'guess_first',
  'one_checkout_context',
] as const;
export type L6Event = (typeof L6_EVENTS)[number];
