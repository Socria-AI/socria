// lib/mr/research.ts — RESEARCH READINESS: WHAT A CONSENTED EXPORT MAY HOLD.
//
// This module collects nothing. MR's ledger is already content-free (codes,
// counts, turn indices); a study still needs less than the ledger holds, and
// needs it in a form that cannot be walked back to a person by anybody who
// does not hold the study's secret. `toResearchEvents` is the one door:
//
//   • NOTHING WITHOUT CONSENT TO THAT STUDY. A person's rows leave only when
//     their settings name this study (MRSettings.research, set only by an
//     approved study's consent flow), and only rows written at or after the
//     moment they consented — and after their last reset.
//   • NO IDS. User, conversation and intervention ids become HMAC pseudonyms
//     under the study's secret, scoped per study and per kind, so the same
//     person is unlinkable across two studies and a pseudonym cannot be
//     reversed without the secret. Time is coarsened to the day.
//   • AN ALLOW-LIST, NOT A DENY-LIST. Each record is flattened to scalar
//     codes, and only paths named in RECORD_FIELDS survive. Values that should
//     come from a fixed vocabulary are checked against it; every other string
//     must be shaped like a code (no spaces, at most 64 characters). A string
//     that is not a code is dropped, whatever key it arrived under, so a
//     sentence or a quote cannot leave even if a record somehow held one.
//     What this cannot catch is words written AS a code ('i_hate_this'): a
//     code-shaped field is only as clean as the MR code that wrote it, which
//     is why the vocabularies are used wherever one exists.
//
// VALIDITY_LIMITS says plainly what the data cannot show; it belongs in every
// analysis plan that uses it.
//
// Pure, apart from HMAC (node:crypto).

import { createHmac } from 'node:crypto';
import { LEDGER_RETENTION_MS } from './ledger';
import { ACTIONS, ARMS, INTEGRITY_CODES, OBSERVATION_CODES, OUTCOME_DIMENSIONS, type Arm, type LedgerKind, type LedgerRow, type MRSettings } from './types';

export const RESEARCH_EVENT_VERSION = 1 as const;

export interface ResearchEvent {
  v: 1;
  study: string;
  /** pseudonym */
  participant: string;
  /** pseudonym */
  conversation: string;
  /** YYYY-MM-DD, UTC, coarsened */
  day: string;
  turn: number;
  kind: LedgerKind;
  arm: Arm;
  ifr?: boolean;
  policyVersion: string;
  /** flattened content-free fields */
  codes: Record<string, string | number | boolean | null>;
}

/** The shortest study secret accepted: 32 characters (an HMAC key a person could not guess). */
const MIN_SECRET = 32;

/** HMAC-SHA256(secret, scope + ':' + id), hex, first 24 characters. Throws on a secret shorter than 32 characters. */
export function pseudonym(id: string, secret: string, scope: string): string {
  if (typeof secret !== 'string' || secret.length < MIN_SECRET) throw new Error(`research secret must be at least ${MIN_SECRET} characters`);
  return createHmac('sha256', secret).update(`${scope}:${id}`).digest('hex').slice(0, 24);
}

// ── the allow-list ───────────────────────────────────────────────────

/** A code: no whitespace, no quotes, at most 64 characters. */
const CODE = /^[A-Za-z0-9_][\w.:/=+<>#,@|-]{0,63}$/;
const STUDY_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
/** Array entries kept per array (with its length as `<path>.n`). */
const MAX_ITEMS = 8;

type Vocabulary = readonly string[] | 'code' | 'number' | 'boolean' | 'pseudonym';
const PROVENANCE = ['observed', 'explicit', 'estimate', 'hypothesis', 'none'];
const SOURCES = ['deployment', 'experiment', 'user_off', 'unavailable', 'excluded'];
const CONTROL_STRATEGIES = ['direct', 'execute', 'worked_example', 'guided', 'preserve_challenge', 'edit_as_asked'];

/** dimension.value, dimension.provenance, dimension.note, dimension.refs.n for each outcome dimension */
function dimension(name: string, values: readonly string[]): [string, Vocabulary][] {
  return [
    [`${name}.value`, [...values, 'unknown']],
    [`${name}.provenance`, PROVENANCE],
    [`${name}.note`, 'code'],
    [`${name}.refs.n`, 'number'],
  ];
}

/**
 * Every path a record may contribute, per ledger kind, with what its value
 * must be. '#' stands for an array index. Anything else in a record is not
 * exported.
 */
const RECORD_FIELDS: Readonly<Record<LedgerKind, ReadonlyMap<string, Vocabulary>>> = Object.freeze({
  exposure: new Map<string, Vocabulary>([
    ['v', 'number'],
    ['arm', ARMS],
    ['ifr', 'boolean'],
    ['shadow', 'boolean'],
    ['source', SOURCES],
    ['experimentId', 'code'],
    ['ms', 'number'],
    // what the ledger adds to an exposure (lib/mr/ledger.ts LedgerExposure): the decision in force
    // on every turn (not only the turns something new was decided) and the model-call cost
    ['action', ACTIONS],
    ['interventionId', 'pseudonym'],
    ['active.n', 'number'],
    // whether the decision in force changed the reply (false: a higher layer took every control out),
    // so a turn that changed nothing is not counted as exposure to the treatment
    ['enforced', 'boolean'],
    ['deliberated', 'boolean'],
    ['modelDeliberated', 'boolean'],
    // NOT `local`: that a conversation was kept to itself says it touched a sensitive subject
  ]),
  decision: new Map<string, Vocabulary>([
    ['interventionId', 'pseudonym'],
    ['action', ACTIONS],
    ['trigger', 'code'],
    ['evidenceRefs.n', 'number'],
    ['evidenceRefs.#.turn', 'number'],
    ['evidenceRefs.#.role', ['user', 'assistant']],
    ['evidenceRefs.#.code', 'code'],
    ['target.n', 'number'],
    ['target.#', ['acs', 'behavior', 'epistemic', 'orchestration']],
    ['controls.questionBudget.max', 'number'],
    ['controls.questionBudget.enforcement', ['hard', 'tail']],
    ['controls.questionWindow.max', 'number'],
    ['controls.questionWindow.turns', 'number'],
    ['controls.strategy', CONTROL_STRATEGIES],
    ['controls.scaffolding', ['less', 'more']],
    ['controls.simplify', 'boolean'],
    ['controls.verbosity.ceilingTokens', 'number'],
    ['controls.verification', ['explicit']],
    ['controls.answerFirst', 'boolean'],
    ['controls.noRevealAnswers', 'boolean'],
    ['scope.kind', ['turn', 'turns', 'conversation', 'standing']],
    ['scope.turns', 'number'],
    ['expiration.afterTurn', 'number'],
    ['expiration.onRevoke.n', 'number'],
    ['expiration.onRevoke.#', OBSERVATION_CODES],
    ['confidence', 'number'],
    ['uncertainty.n', 'number'],
    ['uncertainty.#', 'code'],
    ['evaluationPlan.primary', OUTCOME_DIMENSIONS],
    ['evaluationPlan.window', 'number'],
    ['evaluationPlan.expect.n', 'number'],
    ['evaluationPlan.expect.#', 'code'],
    ['rollback.revertTo', ['acs_default']],
    ['rollback.when.n', 'number'],
    ['rollback.when.#', 'code'],
    ['loop', ['fast', 'deliberative', 'longitudinal']],
    ['issuedAtTurn', 'number'],
    ['carried', 'boolean'],
    ['constrainedBy.n', 'number'],
    ['constrainedBy.#', 'code'],
    ['composedOf.n', 'number'],
  ]),
  outcome: new Map<string, Vocabulary>([
    ['interventionId', 'pseudonym'],
    ['turn', 'number'],
    ...dimension('taskCompletion', ['delivered', 'partial', 'not_delivered']),
    ...dimension('satisfaction', ['positive', 'negative', 'neutral']),
    ['friction.value', ['unknown']],
    ['friction.value.questionsAsked', 'number'],
    ['friction.value.repeatRequests', 'number'],
    ['friction.value.complaints', 'number'],
    ['friction.value.turnsToUseful', 'number'],
    ['friction.provenance', PROVENANCE],
    ['friction.note', 'code'],
    ['friction.refs.n', 'number'],
    ...dimension('independentPerformance', ['verified_correct', 'verified_incorrect']),
    ...dimension('retention', ['retained', 'not_retained']),
    ...dimension('autonomy', ['increased', 'decreased']),
    ['regulation', ['keep', 'revert', 'inconclusive']],
  ]),
  integrity: new Map<string, Vocabulary>([
    ['code', INTEGRITY_CODES],
    ['severity', ['info', 'warn', 'block']],
    ['turn', 'number'],
    ['detail', 'code'],
    ['action', ['none', 'freeze', 'revert', 'drop_sentence', 'block_write', 'reject_decision']],
  ]),
});

const KINDS = Object.keys(RECORD_FIELDS) as LedgerKind[];

/**
 * Everything a research event may contain: its own fields, then every
 * `codes.<path>` a record may contribute ('#' = an array index, at most 8).
 * The data dictionary for a consent form or an ethics review — the export
 * cannot hold a field that is not on this list.
 */
export const MINIMAL_FIELDS: readonly string[] = Object.freeze([
  'v',
  'study',
  'participant',
  'conversation',
  'day',
  'turn',
  'kind',
  'arm',
  'ifr',
  'policyVersion',
  ...[...new Set(KINDS.flatMap((k) => [...RECORD_FIELDS[k].keys()]))].map((p) => `codes.${p}`),
]);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Every scalar leaf of a record as [path, value], arrays as their length plus their first MAX_ITEMS entries. Depth-bounded. */
function leaves(v: unknown, path: string, out: [string, unknown][], depth = 0): void {
  if (depth > 5) return;
  if (Array.isArray(v)) {
    out.push([`${path}.n`, v.length]);
    v.slice(0, MAX_ITEMS).forEach((x, k) => leaves(x, `${path}.${k}`, out, depth + 1));
    return;
  }
  if (isObj(v)) {
    for (const k of Object.keys(v)) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(k)) continue;
      leaves(v[k], path ? `${path}.${k}` : k, out, depth + 1);
    }
    return;
  }
  out.push([path, v]);
}

/** A value that passes its vocabulary, or undefined (dropped). */
function admit(vocab: Vocabulary, v: unknown, secret: string, study: string): string | number | boolean | null | undefined {
  if (v === null) return null;
  if (vocab === 'number') return typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1000) / 1000 : undefined;
  if (vocab === 'boolean') return typeof v === 'boolean' ? v : undefined;
  if (typeof v !== 'string') return undefined;
  if (vocab === 'pseudonym') return CODE.test(v) ? pseudonym(v, secret, `${study}:intervention`) : undefined;
  if (vocab === 'code') return CODE.test(v) ? v : undefined;
  return vocab.includes(v) ? v : undefined;
}

/** A record's allowed fields as flat codes. */
function codesOf(kind: LedgerKind, record: Record<string, unknown>, secret: string, study: string): ResearchEvent['codes'] {
  const allowed = RECORD_FIELDS[kind];
  const flat: [string, unknown][] = [];
  leaves(record, '', flat);
  const codes: ResearchEvent['codes'] = {};
  for (const [path, value] of flat) {
    const vocab = allowed.get(path.replace(/\.\d+(?=\.|$)/g, '.#'));
    if (!vocab) continue;
    const v = admit(vocab, value, secret, study);
    if (v !== undefined) codes[path] = v;
  }
  return codes;
}

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * One person's ledger rows as research events for one study. [] unless their
 * settings name this study; only rows written at or after they consented (and
 * after their last reset); with `now`, none older than the ledger's retention
 * window (a row past it is due to be purged, and nothing else reads it);
 * rows with an unknown kind, arm or turn are dropped whole. Rows from more
 * than one person are refused (throws): one person's consent never covers
 * another's rows.
 */
export function toResearchEvents(rows: readonly LedgerRow[], p: { studyId: string; secret: string; settings: MRSettings; now?: number }): ResearchEvent[] {
  if (typeof p?.secret !== 'string' || p.secret.length < MIN_SECRET) throw new Error(`research secret must be at least ${MIN_SECRET} characters`);
  const consent = p.settings?.research;
  if (!consent || typeof p.studyId !== 'string' || !STUDY_ID.test(p.studyId) || consent.studyId !== p.studyId) return [];
  if (typeof consent.consentedAt !== 'number' || !Number.isFinite(consent.consentedAt) || consent.consentedAt <= 0) return [];
  const list = Array.isArray(rows) ? rows.filter((r): r is LedgerRow => isObj(r)) : [];
  const people = new Set(list.map((r) => r.user_id));
  if (people.size > 1) throw new Error('research export: rows from more than one person');

  const since = Math.max(consent.consentedAt, typeof p.now === 'number' && Number.isFinite(p.now) ? p.now - LEDGER_RETENTION_MS : 0);
  const resetAt = typeof p.settings.resetAt === 'number' && Number.isFinite(p.settings.resetAt) ? p.settings.resetAt : 0;
  const study = p.studyId;
  const out: ResearchEvent[] = [];
  for (const r of list) {
    if (typeof r.created_at !== 'number' || !Number.isFinite(r.created_at) || r.created_at < since || r.created_at <= resetAt) continue;
    if (!KINDS.includes(r.kind) || !(ARMS as readonly string[]).includes(r.arm)) continue;
    if (typeof r.turn !== 'number' || !Number.isInteger(r.turn) || r.turn < 0) continue;
    if (typeof r.user_id !== 'string' || !r.user_id) continue;
    const record = isObj(r.record) ? r.record : {};
    const ev: ResearchEvent = {
      v: RESEARCH_EVENT_VERSION,
      study,
      participant: pseudonym(r.user_id, p.secret, `${study}:participant`),
      conversation: r.conversation_id ? pseudonym(r.conversation_id, p.secret, `${study}:conversation`) : 'none',
      day: day(r.created_at),
      turn: r.turn,
      kind: r.kind,
      arm: r.arm,
      policyVersion: typeof r.policy_version === 'string' && CODE.test(r.policy_version) ? r.policy_version : 'unknown',
      codes: codesOf(r.kind, record, p.secret, study),
    };
    if (r.kind === 'exposure' && typeof record.ifr === 'boolean') ev.ifr = record.ifr;
    out.push(ev);
  }
  return out;
}

/**
 * What this data cannot show. Every analysis that uses the export states
 * these, and none of them is fixed by collecting more of the same.
 */
export const VALIDITY_LIMITS: readonly string[] = Object.freeze([
  'Detectors are English-only regular expressions: requests, confusion and complaints phrased otherwise are missed, and misses read as no signal, not as no friction.',
  'Outcomes are structural, not semantic: "delivered" means the reply had the shape of what was asked (steps, an answer first, no question), not that it was correct or understood.',
  'Satisfaction is not learning: "thanks, that helped" is recorded as satisfaction and never as evidence of capability.',
  'Independent performance is a single, in-session observation: one engine-verified attempt in mathematics, made without the answer in between; most domains have no verdict at all.',
  'Retention and autonomy are unknown inside the product: they need a delayed, independent check or a study instrument, and the export marks them unknown rather than estimating them.',
  'Participants are not blind to their arm: the help visibly changes, so expectation and demand effects are possible.',
  'Novelty effects: early differences between arms may fade as people get used to either condition.',
  'Consent selects: people who opt in to a study differ from people who do not, so effects may not transfer to everyone.',
  'Units are accounts, not people: shared devices and several accounts per person are not detected.',
  'Shared conversations, guests, incognito and off-the-record conversations are excluded by design, so the data under-represents them.',
  'Turn indices count their messages within the window the route sends; very long conversations are read only in their recent part.',
  'Policy versions change rules; comparisons across versions are not like for like unless an experiment held the version fixed.',
]);
