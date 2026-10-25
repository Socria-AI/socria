// lib/mr/ledger.ts — WHAT MR WRITES DOWN, AND WHAT IT REFUSES TO.
//
// The intervention ledger (table mr_ledger, lib/mr/store.ts) is the record
// that makes MR attributable: which condition a turn ran under, what was
// decided, how it went, and what the integrity monitor caught. It is read by
// evaluation, by the account export, and by the person's own view of what MR
// adjusted (GET /api/mr). It is never read back into a prompt.
//
// IT HOLDS NO WORDS. Not theirs, not the reply's. The types already say so —
// evidence is a turn index and a code — but a type is a promise about the
// code that exists today, and the next person to add a field to MRDecision
// will not be thinking about this table. So every record passes through
// sanitizeRecord on the way in AND on the way out: only allow-listed keys, of
// the expected shape, survive; a string that is long, has a space in it, or
// is not plain ASCII is words, and a record holding one is refused whole
// rather than trimmed — something upstream is broken, and a partial row would
// hide that. (ASCII because a sentence in a language written without spaces,
// or words joined by a zero-width space, has no space for a space test to
// find. Every code MR writes is ASCII.)
//
// DETERMINISTIC IDS. A row's id is a hash of what it is (kind, conversation,
// turn, decision or finding), so the same turn written twice is one row, and
// the id of a decision can be recomputed from the conversation later. Core
// 4's ledger ids are random (lib/core4/ledger.ts); these must not be.
//
// A DECISION ROW IS A DECISION MADE THAT TURN, under its own id. Not the
// composition of everything in force (several adjustments at once merge into
// one decision for the runtime, with an id of its own that no later turn
// lists as active), not a preference carried in from another conversation
// (it was made there), and not hidden when it is a revert their words made
// while something else stayed in force — the revert is the record that they
// took something back.
//
// THE PERSON'S VIEW is summarize(): newest first, decision rows only, each
// with whether it is still in force. "Still in force" is read from the
// conversation's most recent exposure row (by time: an edited conversation
// leaves rows of turns it no longer has), which lists the interventions
// active then; without one it falls back to the decision's own expiry.
// Shadow and comparison-arm decisions, one the condition computes but does
// not enforce (IFR off), and one a higher layer took every control out of,
// are marked as not applied — recorded, but nothing about the reply changed. What is in force with no decision row to show for it
// (unlistedInForce) is counted, so the list never looks complete when it is
// not.
//
// A "FROM NOW ON" TAKEN BACK stays taken back. Every exposure row lists every
// rule their words have ended in that conversation, not only on the turn
// they said it, so one lost or deleted row cannot bring the preference back;
// and the store keeps the same fact in their settings (revokedStanding), so
// deleting the conversation it was said in cannot either.
//
// THEIR "OFF" STOPS THE RECORD TOO. A turn with MR off by their own setting
// (or with their settings unreadable, or shared) leaves only the bare
// exposure row — the condition, nothing MR would have decided about them.
//
// Pure. node:crypto for the hash, nothing else.

import { createHash } from 'node:crypto';
import {
  ACTIONS,
  ARMS,
  INTEGRITY_CODES,
  MR_STATE_VERSION,
  OUTCOME_DIMENSIONS,
  type Action,
  type Arm,
  type ExposureRecord,
  type LedgerKind,
  type LedgerRow,
  type MRDecision,
  type MRTurnResult,
  type Scope,
} from './types';

export const LEDGER_KINDS: readonly LedgerKind[] = ['exposure', 'decision', 'outcome', 'integrity'];

/** How long a standing decision may be shown as in force (and how long a row lives: lib/mr/store.ts MR_RETENTION_MS). */
export const LEDGER_RETENTION_MS = 180 * 86_400_000;

/** The longest code the ledger will hold. Every code MR writes is far shorter. */
const MAX_CODE = 80;
/** interventionIds active at one turn, as recorded on its exposure row */
const MAX_ACTIVE = 32;
/** a record bigger than this is not a record MR wrote */
const MAX_NODES = 1500;
const MAX_DEPTH = 6;

// ── ids ──────────────────────────────────────────────────────────────

/**
 * A row's id: the first 32 hex characters of sha256(`kind:conversation:turn:key`).
 * `key` is the interventionId for a decision or outcome, a finding's code for
 * an integrity row, 'exposure' for the turn's exposure.
 */
export function ledgerId(kind: LedgerKind, conversationKey: string | null, turn: number, key: string): string {
  return createHash('sha256').update(`${kind}:${conversationKey ?? '-'}:${turn}:${key}`).digest('hex').slice(0, 32);
}

// ── the shapes a record may have ─────────────────────────────────────

type Shape =
  | { t: 'code' }
  | { t: 'num' }
  | { t: 'int' }
  | { t: 'bool' }
  | { t: 'enum'; of: readonly string[] }
  | { t: 'arr'; of: Shape; max: number }
  | { t: 'obj'; keys: Readonly<Record<string, Shape>>; required: readonly string[] }
  | { t: 'nullable'; of: Shape }
  | { t: 'either'; of: readonly Shape[] };

const code: Shape = { t: 'code' };
const num: Shape = { t: 'num' };
const int: Shape = { t: 'int' };
const bool: Shape = { t: 'bool' };
const oneOf = (of: readonly string[]): Shape => ({ t: 'enum', of });
const list = (of: Shape, max = 32): Shape => ({ t: 'arr', of, max });
const obj = (keys: Record<string, Shape>, required: string[] = []): Shape => ({ t: 'obj', keys, required });
const nullable = (of: Shape): Shape => ({ t: 'nullable', of });
const either = (...of: Shape[]): Shape => ({ t: 'either', of });

const ref = obj({ turn: int, role: oneOf(['user', 'assistant']), code }, ['turn', 'role', 'code']);
const PROVENANCE = ['observed', 'explicit', 'estimate', 'hypothesis'] as const;
const dimension = (value: Shape): Shape =>
  obj({ value: either(oneOf(['unknown']), value), provenance: oneOf([...PROVENANCE, 'none']), refs: list(ref, 16), note: code }, ['value', 'provenance']);

const CONTROLS = obj({
  questionBudget: obj({ max: int, enforcement: oneOf(['hard', 'tail']) }, ['max', 'enforcement']),
  questionWindow: obj({ max: int, turns: int }, ['max', 'turns']),
  strategy: oneOf(['direct', 'execute', 'worked_example', 'guided', 'preserve_challenge', 'edit_as_asked']),
  scaffolding: oneOf(['less', 'more']),
  simplify: bool,
  verbosity: obj({ ceilingTokens: int }, ['ceilingTokens']),
  verification: oneOf(['explicit']),
  answerFirst: bool,
  noRevealAnswers: bool,
});

/** Every key a record of each kind may keep. Anything else is dropped; anything word-like anywhere refuses the record. */
const RECORD: Readonly<Record<LedgerKind, Shape>> = {
  // ExposureRecord, plus the decision in force (its action and id), the
  // interventions active this turn (so the person's view can say what is
  // still in force), and whether the deliberative loop ran (its cost).
  exposure: obj(
    {
      v: int,
      arm: oneOf(ARMS),
      ifr: bool,
      shadow: bool,
      source: oneOf(['deployment', 'experiment', 'user_off', 'unavailable', 'excluded']),
      experimentId: code,
      ms: num,
      action: oneOf(ACTIONS),
      interventionId: code,
      active: list(code, MAX_ACTIVE),
      // of those, the ones carried in from another conversation (made there, listed there)
      carriedIn: list(code, MAX_ACTIVE),
      // the rules whose adjustments their words have ended in this conversation —
      // how a "from now on" taken back in one conversation stops crossing into the next
      revoked: list(code),
      // of those, the ones ended at an EARLIER turn (said again here, so a lost row cannot lose them)
      reasserted: list(code),
      // what a higher layer took out of the decision in force (MRDecision.constrainedBy)
      constrainedBy: list(code),
      // the decision in force changed the reply (false: a higher layer took every control out)
      enforced: bool,
      deliberated: bool,
      // a model was actually asked — what the per-conversation deliberation budget counts
      modelDeliberated: bool,
      // how many times, in this conversation so far (so the count survives older rows leaving the read window)
      modelDeliberations: int,
      // a conversation kept to itself: nothing from it crosses into another
      local: bool,
      // the first turn of this conversation after their last reset
      resetTurn: int,
    },
    ['v', 'arm', 'ifr', 'shadow', 'source']
  ),
  // MRDecision, whole: it holds no text. `local` marks a decision from a
  // conversation-only conversation, which never crosses into another.
  decision: obj(
    {
      policyVersion: code,
      interventionId: code,
      action: oneOf(ACTIONS),
      trigger: code,
      evidenceRefs: list(ref, 64),
      target: list(oneOf(['acs', 'behavior', 'epistemic', 'orchestration']), 8),
      controls: CONTROLS,
      scope: obj({ kind: oneOf(['turn', 'turns', 'conversation', 'standing']), turns: int }, ['kind']),
      expiration: obj({ afterTurn: nullable(int), onRevoke: list(code) }, ['afterTurn']),
      confidence: num,
      uncertainty: list(code),
      evaluationPlan: obj({ primary: oneOf(OUTCOME_DIMENSIONS), expect: list(code), window: int }, ['primary']),
      rollback: obj({ revertTo: oneOf(['acs_default']), when: list(code) }, ['revertTo']),
      loop: oneOf(['fast', 'deliberative', 'longitudinal']),
      issuedAtTurn: int,
      carried: bool,
      constrainedBy: list(code),
      composedOf: list(code),
      local: bool,
    },
    ['policyVersion', 'interventionId', 'action', 'trigger', 'scope', 'expiration', 'issuedAtTurn']
  ),
  // OutcomeVector: six dimensions, never summed, 'unknown' a value.
  outcome: obj(
    {
      interventionId: code,
      turn: int,
      taskCompletion: dimension(oneOf(['delivered', 'partial', 'not_delivered'])),
      satisfaction: dimension(oneOf(['positive', 'negative', 'neutral'])),
      friction: dimension(obj({ questionsAsked: int, repeatRequests: int, complaints: int, turnsToUseful: nullable(int) }, ['questionsAsked', 'repeatRequests', 'complaints', 'turnsToUseful'])),
      independentPerformance: dimension(oneOf(['verified_correct', 'verified_incorrect'])),
      retention: dimension(oneOf(['retained', 'not_retained'])),
      autonomy: dimension(oneOf(['increased', 'decreased'])),
      regulation: oneOf(['keep', 'revert', 'inconclusive']),
    },
    ['interventionId', 'turn', 'regulation']
  ),
  // IntegrityFinding.
  integrity: obj(
    {
      code: oneOf(INTEGRITY_CODES),
      severity: oneOf(['info', 'warn', 'block']),
      turn: int,
      detail: code,
      action: oneOf(['none', 'freeze', 'revert', 'drop_sentence', 'block_write', 'reject_decision']),
    },
    ['code', 'severity', 'turn', 'action']
  ),
};

// ── refusing words ───────────────────────────────────────────────────

/**
 * A code is short, printable ASCII with no spaces ('ifr.explicit.stop_questions',
 * 'ms:52>40'). Anything else is words — a quote, a reply, a reason somebody
 * wrote out, a sentence in a script that puts no spaces between words — and
 * has no business in this table.
 */
const CODE_CHARS = /^[\x21-\x7e]*$/;
function wordLike(s: string): boolean {
  return s.length > MAX_CODE || !CODE_CHARS.test(s);
}

/** True when anything in the value is words, or the value is too big or too deep to be a record MR wrote. */
function holdsWords(v: unknown): boolean {
  let nodes = 0;
  const walk = (x: unknown, depth: number): boolean => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) return true;
    if (typeof x === 'string') return wordLike(x);
    if (Array.isArray(x)) return x.some((y) => walk(y, depth + 1));
    if (x && typeof x === 'object') {
      for (const [k, y] of Object.entries(x as Record<string, unknown>)) {
        if (wordLike(k) || walk(y, depth + 1)) return true;
      }
    }
    return false;
  };
  return walk(v, 0);
}

const DROP = Symbol('drop');
type Clean = unknown | typeof DROP;

function clean(shape: Shape, v: unknown): Clean {
  switch (shape.t) {
    case 'code':
      return typeof v === 'string' && v.length > 0 ? v : DROP;
    case 'num':
      return typeof v === 'number' && Number.isFinite(v) ? v : DROP;
    case 'int':
      return typeof v === 'number' && Number.isInteger(v) && Math.abs(v) <= 1e9 ? v : DROP;
    case 'bool':
      return typeof v === 'boolean' ? v : DROP;
    case 'enum':
      return typeof v === 'string' && shape.of.includes(v) ? v : DROP;
    case 'nullable':
      return v === null ? null : clean(shape.of, v);
    case 'either':
      for (const s of shape.of) {
        const c = clean(s, v);
        if (c !== DROP) return c;
      }
      return DROP;
    case 'arr': {
      if (!Array.isArray(v)) return DROP;
      const out: unknown[] = [];
      for (const x of v.slice(0, shape.max)) {
        const c = clean(shape.of, x);
        if (c !== DROP) out.push(c);
      }
      return out;
    }
    case 'obj': {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return DROP;
      const src = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [k, s] of Object.entries(shape.keys)) {
        if (!(k in src) || src[k] === undefined) continue;
        const c = clean(s, src[k]);
        if (c !== DROP) out[k] = c;
      }
      // a required part missing or malformed is not a smaller record, it is not one
      return shape.required.every((k) => k in out) ? out : DROP;
    }
  }
}

/**
 * The record as the ledger may keep it, or null. Only the allow-listed keys
 * of its kind, each of the expected shape; null when a required part is
 * missing or when ANY string in it — at an allowed key or not — is longer
 * than a code or has a space in it. Used on write and again on read.
 */
export function sanitizeRecord(kind: LedgerKind, record: unknown): Record<string, unknown> | null {
  const shape = RECORD[kind];
  if (!shape) return null;
  if (holdsWords(record)) return null;
  const c = clean(shape, record);
  return c === DROP ? null : (c as Record<string, unknown>);
}

const ID = /^[0-9a-f]{32}$/;
const CONVERSATION = /^[A-Za-z0-9_-]{1,120}$/;

/** A whole row as the ledger may keep it, or null: the columns checked, the record sanitized. */
export function sanitizeLedgerRow(row: unknown): LedgerRow | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const kind = r.kind as LedgerKind;
  if (!LEDGER_KINDS.includes(kind)) return null;
  if (typeof r.user_id !== 'string' || !r.user_id || wordLike(r.user_id)) return null;
  if (typeof r.id !== 'string' || !ID.test(r.id)) return null;
  const conversation = r.conversation_id ?? null;
  if (conversation !== null && (typeof conversation !== 'string' || !CONVERSATION.test(conversation))) return null;
  const turn = Number(r.turn);
  if (!Number.isInteger(turn) || turn < 0) return null;
  if (typeof r.policy_version !== 'string' || !r.policy_version || wordLike(r.policy_version)) return null;
  if (!(ARMS as readonly string[]).includes(r.arm as string)) return null;
  const created = Number(r.created_at);
  if (!Number.isFinite(created) || created < 0) return null;
  const record = sanitizeRecord(kind, r.record);
  if (!record) return null;
  return {
    user_id: r.user_id,
    id: r.id,
    conversation_id: conversation as string | null,
    turn,
    kind,
    policy_version: r.policy_version,
    arm: r.arm as Arm,
    record,
    created_at: created,
  };
}

// ── one turn's rows ──────────────────────────────────────────────────

export interface LedgerContext {
  userId: string;
  conversationKey: string | null;
  now: number;
  arm: Arm;
  /**
   * The conversation is conversation-only (a sensitive subject). Its
   * decisions and its exposure rows are marked `local`, and nothing decided
   * in it — before it became so, too — is carried into another
   * conversation, whatever the person's carry-across setting says.
   */
  conversationOnly?: boolean;
}

/** The exposure record as written: the contract's ExposureRecord, plus what the person's view and cost accounting need. */
export interface LedgerExposure extends ExposureRecord {
  /** the decision in force (absent when MR was off by their choice: nothing it would have done is kept) */
  action?: Action;
  interventionId?: string;
  /** interventionIds active at this turn */
  active?: string[];
  /** of `active`, the ones carried in from another conversation */
  carriedIn?: string[];
  /** triggers (rule ids) of every adjustment their words have ended in this conversation, at this turn or before */
  revoked?: string[];
  /** of `revoked`, the ones ended at an earlier turn than this one */
  reasserted?: string[];
  /** what a higher layer took out of the decision in force, as `layer:control` codes */
  constrainedBy?: string[];
  /** the decision in force changed the reply; false when a higher layer took every control out */
  enforced?: boolean;
  deliberated: boolean;
  /** a model was asked this turn (absent when not) */
  modelDeliberated?: boolean;
  /** the first user-turn index of this conversation after their last reset (MRState.resetTurn) */
  resetTurn?: number;
}

/**
 * Conditions under which MR may not keep anything it worked out about them:
 * their own "off", settings that could not be read (their "off" may be what
 * failed), and a shared conversation.
 */
const NOT_THEIRS_TO_KEEP: ReadonlySet<string> = new Set(['user_off', 'unavailable', 'excluded']);

/** The endReason the fold gives what their reset ended (lib/mr/state.ts applyReset). */
const RESET_REASON = 'revoke:reset';
/** The uncertainty code on a decision the condition computed but did not enforce (lib/mr/state.ts NOT_ENFORCED). */
const NOT_ENFORCED = 'not_enforced';

/**
 * A decision MADE at this turn — not 'none', not carried from an earlier
 * turn, and not a preference carried in from another conversation (loop
 * 'longitudinal'; lib/mr/state.ts makes those, and a composition at the
 * first turn of a conversation reports them as not carried).
 */
function madeAt(d: MRDecision | undefined, turn: number): d is MRDecision {
  return !!d && d.action !== 'none' && !d.carried && d.loop !== 'longitudinal' && d.issuedAtTurn === turn;
}

/**
 * The decisions this turn made, each as itself:
 *   • the decision in force, when it is one decision made now;
 *   • when it is a composition of several in force, the members made now
 *     (as recorded in the state) — never the composition, whose id no later
 *     turn lists as active and whose controls mix in older members';
 *   • a revert their words made now, which composition hides whenever
 *     another adjustment stays in force.
 * A composition none of whose members can be found is written whole rather
 * than lost.
 */
export function decisionsMade(r: Pick<MRTurnResult, 'decision' | 'state'>): MRDecision[] {
  const turn = r.state.turn;
  const records = r.state.interventions ?? [];
  const d = r.decision;
  const out: MRDecision[] = [];
  if (d.composedOf?.length) {
    for (const id of d.composedOf) {
      const m = records.find((x) => x.decision.interventionId === id && x.status === 'active')?.decision;
      if (madeAt(m, turn)) out.push(m);
    }
    if (!out.length && madeAt(d, turn)) out.push(d);
  } else if (d.action !== 'none' && !d.carried && d.loop !== 'longitudinal') {
    // The decision as their words (or MR's reading) made it — the controls
    // it asked for — with what a higher layer took out of it this turn in
    // constrainedBy: a safety turn on which they said "from now on, just
    // tell me" still records the preference, and its exposure row says
    // nothing was enforced (summarize: applied false).
    const made = records.find((x) => x.decision.interventionId === d.interventionId)?.decision;
    out.push(made && made !== d ? { ...made, ...(d.constrainedBy?.length ? { constrainedBy: d.constrainedBy } : {}) } : d);
  }
  for (const x of records) {
    if (x.status === 'active' && x.decision.action === 'revert' && madeAt(x.decision, turn) && !out.some((o) => o.interventionId === x.decision.interventionId)) {
      out.push(x.decision);
    }
    // a decision this condition computed and did not enforce (IFR off): recorded as such, for the comparison
    if (x.status === 'active' && madeAt(x.decision, turn) && (x.decision.uncertainty ?? []).includes(NOT_ENFORCED) && !out.some((o) => o.interventionId === x.decision.interventionId)) {
      out.push(x.decision);
    }
  }
  return out;
}

/**
 * The content-free rows one turn leaves:
 *   one exposure row     the condition, MR's time, the decision in force,
 *                        whether it changed the reply, what is active, and
 *                        every rule their words have ended in this
 *                        conversation (so a later row says it again)
 *   decision rows        each decision made this turn (decisionsMade)
 *   outcome rows         for each earlier decision whose outcome was read this turn
 *   integrity rows       one per finding
 * MR off by their choice (or unreadable settings, or a shared conversation):
 * the exposure row's condition only.
 * A record that will not sanitize is not written; an integrity row
 * (privacy_boundary, refused:<kind>) says that one was refused.
 * `enforced` is the regulation's own (lib/mr/index.ts MRRegulation); a result
 * without it records nothing about it.
 */
export function rowsForTurn(r: MRTurnResult & { enforced?: boolean }, ctx: LedgerContext): LedgerRow[] {
  const s = r.state;
  const turn = Number.isInteger(s.turn) && s.turn >= 0 ? s.turn : 0;
  const conv = ctx.conversationKey;
  // Turns with no conversation id cannot be told apart by (conversation,
  // turn), so their ids carry the time as well; otherwise turn 3 of one
  // id-less exchange would overwrite turn 3 of another.
  const salt = conv === null ? `@${ctx.now}` : '';
  const out = new Map<string, LedgerRow>();
  const refused = new Set<LedgerKind>();

  const put = (kind: LedgerKind, key: string, record: unknown, policyVersion: string) => {
    const clean = sanitizeRecord(kind, record);
    if (!clean) {
      refused.add(kind);
      return;
    }
    const id = ledgerId(kind, conv, turn, key + salt);
    out.set(id, {
      user_id: ctx.userId,
      id,
      conversation_id: conv,
      turn,
      kind,
      policy_version: policyVersion,
      arm: ctx.arm,
      record: clean,
      created_at: ctx.now,
    });
  };

  const c = r.condition;
  const ms = r.timing?.ms;
  // MRState.resetTurn, read as data: a state from before it existed has none
  const resetTurn = (s as { resetTurn?: unknown }).resetTurn;
  const condition: Partial<LedgerExposure> = {
    v: MR_STATE_VERSION,
    arm: c.arm,
    ifr: c.ifr,
    shadow: c.shadow,
    source: c.source,
    ...(c.experimentId ? { experimentId: c.experimentId } : {}),
    // unknown time is left out, not written as 0
    ...(typeof ms === 'number' && Number.isFinite(ms) ? { ms: Math.max(0, Math.round(ms)) } : {}),
    deliberated: !!r.timing?.deliberated,
    // a model call is a cost whatever the condition, so it is counted on every row
    ...(r.timing?.modelDeliberated === true ? { modelDeliberated: true } : {}),
    ...(typeof r.timing?.modelDeliberations === 'number' && Number.isInteger(r.timing.modelDeliberations) && r.timing.modelDeliberations > 0 ? { modelDeliberations: r.timing.modelDeliberations } : {}),
    // on every row of a conversation kept to itself, so whatever was decided in it
    // before it became so stops crossing too (standingInForce)
    ...(ctx.conversationOnly ? { local: true } : {}),
    ...(typeof resetTurn === 'number' && Number.isInteger(resetTurn) && resetTurn >= 0 ? { resetTurn } : {}),
  };
  // Their "off" is a user instruction (lib/mr/types.ts PRECEDENCE): MR still
  // folds the conversation, but what it would have decided about them, how
  // that would have gone and what its checks said are not theirs to keep.
  if (NOT_THEIRS_TO_KEEP.has(c.source)) {
    put('exposure', 'exposure', condition, s.policyVersion);
    for (const kind of refused) put('integrity', `refused:${kind}`, { code: 'privacy_boundary', severity: 'block', turn, detail: `refused:${kind}`, action: 'block_write' }, s.policyVersion);
    return [...out.values()];
  }

  const records = s.interventions ?? [];
  // Every rule their words have ended here, not only this turn's: the row of
  // the turn they said it may never be written (an incognito turn, a timeout)
  // or may be deleted, and each later row then says it again. Which of them
  // are said again is kept apart, because that row's time is not when they
  // said it (standingInForce). What their reset ended is not their words in
  // this conversation (and only ever MR's own readings): the reset itself
  // already keeps everything from before it from crossing.
  // Only their words taking it back ("you can ask me questions again") end a "from now on" beyond this conversation:
  // a quiz or questions asked for here override it here, and nowhere else.
  // (and only a "from now on" — said here or carried in: an instruction for this conversation alone taken back
  // here is this conversation's, and the rule it shares with a "from now on" elsewhere is not that one's; nor
  // anything said before their last reset, which the reset already keeps from crossing)
  const since = typeof resetTurn === 'number' && Number.isInteger(resetTurn) && resetTurn >= 0 ? resetTurn : null;
  const ended = records.filter(
    (i) =>
      i.status === 'revoked' &&
      i.endReason === 'revoke:explicit.revoke' &&
      (i.decision.carried || i.decision.scope.kind === 'standing') &&
      !(since !== null && (i.endedAtTurn ?? 0) < since)
  );
  const revoked = [...new Set(ended.map((i) => i.decision.trigger))];
  const reasserted = revoked.filter((t) => !ended.some((i) => i.decision.trigger === t && i.endedAtTurn === s.turn));
  const active = records.filter((i) => i.status === 'active');
  // every preference carried into this conversation so far, in force or lifted here: a carried one holds from the
  // first turn a row lists it (the fold, MRTurnInput.carriedIn), so a lift here stays a lift here
  const carriedIn = records.filter((i) => i.decision.loop === 'longitudinal').map((i) => i.decision.interventionId).slice(-MAX_ACTIVE);
  const constrainedBy = r.decision.constrainedBy ?? [];
  put(
    'exposure',
    'exposure',
    {
      ...condition,
      action: r.decision.action,
      interventionId: r.decision.interventionId,
      ...(typeof r.enforced === 'boolean' ? { enforced: r.enforced } : {}),
      active: active.map((i) => i.decision.interventionId).slice(-MAX_ACTIVE),
      ...(carriedIn.length ? { carriedIn } : {}),
      // left out when empty, so the rows that record a revocation can be found by its presence
      ...(revoked.length ? { revoked } : {}),
      ...(reasserted.length ? { reasserted } : {}),
      ...(constrainedBy.length ? { constrainedBy } : {}),
    } satisfies Partial<LedgerExposure>,
    s.policyVersion
  );

  for (const d of decisionsMade(r)) {
    put('decision', d.interventionId, ctx.conversationOnly ? { ...d, local: true } : d, d.policyVersion);
  }

  for (const o of s.outcomes ?? []) {
    if (o.turn === s.turn) put('outcome', o.interventionId, o, s.policyVersion);
  }

  for (const f of r.integrity ?? []) {
    put('integrity', `${f.code}:${f.detail}:${f.action}`, f, s.policyVersion);
  }

  for (const kind of refused) {
    put('integrity', `refused:${kind}`, { code: 'privacy_boundary', severity: 'block', turn, detail: `refused:${kind}`, action: 'block_write' }, s.policyVersion);
  }
  return [...out.values()];
}

// ── the person's view ────────────────────────────────────────────────

export interface AdjustmentSummary {
  /** user-turn index it was made at */
  turn: number;
  /** epoch ms it was recorded */
  at: number;
  action: Action;
  /** the rule that fired, as a code */
  trigger: string;
  status: 'active' | 'ended';
  /** how far it reaches: this reply, the next few, the rest of the conversation, or across conversations */
  scope: Scope['kind'];
  /** belongs to a conversation (recorded with a conversation id) — NOT its reach; that is `scope` */
  conversation: boolean;
  /** one of their "from now on" preferences */
  standing: boolean;
  /**
   * Whether it changed the reply: false in shadow and in a comparison arm
   * that does not enforce decisions; null when the turn's exposure row is
   * not there to say.
   */
  applied: boolean | null;
}

const MAX_SUMMARY = 50;

interface DecisionView {
  interventionId: string;
  action: Action;
  trigger: string;
  scope: { kind: Scope['kind'] };
  expiration: { afterTurn: number | null };
  composedOf?: string[];
  controls?: Record<string, unknown>;
  constrainedBy?: string[];
  uncertainty?: string[];
}

/** The id an exposure's `active` list knows a decision by: itself, or (a composed row from an older build) its newest member. */
function trackedId(d: { interventionId: string; composedOf?: string[] }): string {
  return d.composedOf?.length ? d.composedOf[d.composedOf.length - 1] : d.interventionId;
}

/**
 * Each conversation's most recent exposure row, by the time it was recorded
 * (then by turn). Not by turn first: a conversation edited back to an earlier
 * message keeps the rows of the turns it abandoned, and those are not what
 * is in force now.
 */
function latestExposures(rows: readonly LedgerRow[]): Map<string, LedgerRow> {
  const out = new Map<string, LedgerRow>();
  for (const r of rows) {
    if (r.kind !== 'exposure' || r.conversation_id === null) continue;
    const cur = out.get(r.conversation_id);
    if (!cur || r.created_at > cur.created_at || (r.created_at === cur.created_at && r.turn > cur.turn)) out.set(r.conversation_id, r);
  }
  return out;
}

/** A revocation of a "from now on", kept in their settings (MRSettings.revokedStanding). */
export interface StandingTombstone {
  trigger: string;
  at: number;
}

const codesIn = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/**
 * When their words ended an adjustment of each rule, read off exposure rows'
 * `revoked`, as [time, rule] pairs. A rule ended at the row's own turn was
 * ended when the row was recorded. One the row only says AGAIN (`reasserted`)
 * was ended at some earlier turn of that conversation, so its time is taken
 * from the earliest row of that conversation that records it — just before
 * that row, when it too is only saying it again. (Taking the later row's time
 * would let every later turn of that conversation end a "from now on" they
 * said again since, somewhere else.) So the rows given must include each
 * conversation's EARLIEST rows that record a revocation, not only those
 * after a candidate (lib/mr/store.ts loadForTurn reads them). A row from
 * before `reasserted` existed records only what ended at its own turn.
 */
function endsOf(revocations: readonly LedgerRow[]): [number, string][] {
  const rows = revocations.filter((e) => e.kind === 'exposure' && Array.isArray(e.record.revoked));
  const first = new Map<string, number>();
  const at = (e: LedgerRow, rule: string, again: boolean) => {
    const k = `${e.conversation_id ?? '-'}\u0000${rule}`;
    const t = again ? e.created_at - 1 : e.created_at;
    const cur = first.get(k);
    if (cur === undefined || t < cur) first.set(k, t);
  };
  for (const e of rows) {
    const again = new Set(codesIn(e.record.reasserted));
    for (const rule of codesIn(e.record.revoked)) at(e, rule, again.has(rule));
  }
  const out: [number, string][] = [];
  for (const e of rows) {
    const again = new Set(codesIn(e.record.reasserted));
    for (const rule of codesIn(e.record.revoked)) {
      out.push([again.has(rule) ? first.get(`${e.conversation_id ?? '-'}\u0000${rule}`)! : e.created_at, rule]);
    }
  }
  return out;
}

/**
 * The revocations these rows record, for their settings (lib/mr/store.ts
 * writeRows → MRSettings.revokedStanding): each rule ended at its row's own
 * turn at that row's time, and each one a row only says again at just
 * before it, marked as said again — its true time is earlier, and the
 * settings never move an existing stamp forward on its word. Pure.
 */
export function revocationsOf(rows: readonly LedgerRow[]): { trigger: string; at: number; reasserted?: boolean }[] {
  const out: { trigger: string; at: number; reasserted?: boolean }[] = [];
  for (const e of rows ?? []) {
    if (!e || e.kind !== 'exposure' || !Array.isArray(e.record?.revoked)) continue;
    const again = new Set(codesIn(e.record.reasserted));
    for (const trigger of codesIn(e.record.revoked)) {
      out.push(again.has(trigger) ? { trigger, at: e.created_at - 1, reasserted: true } : { trigger, at: e.created_at });
    }
  }
  return out;
}

/**
 * Whether a standing decision's reach beyond its own conversation has ended,
 * whatever its own conversation says:
 *   • an exposure row recorded after it, in ANY conversation, says their
 *     words ended an adjustment of the same rule (`revoked`, timed by
 *     endsOf): "you can ask me questions again", said where the preference
 *     had been carried, ends it everywhere;
 *   • their settings hold a revocation of that rule (`tombstones`) at or
 *     after it — the same, kept after the conversation it was said in is gone;
 *   • its own conversation became one kept to itself (a `local` exposure row
 *     at or after it): what was said there no longer crosses.
 * Carrying less is the safe direction.
 */
function reachEnded(r: LedgerRow, ends: readonly [number, string][], tombstones: readonly StandingTombstone[], exposures: readonly LedgerRow[]): boolean {
  const trigger = r.record.trigger;
  if (typeof trigger !== 'string') return true;
  if (ends.some(([at, rule]) => at > r.created_at && rule === trigger)) return true;
  if (tombstones.some((t) => t && t.trigger === trigger && typeof t.at === 'number' && t.at >= r.created_at)) return true;
  return exposures.some((e) => e.kind === 'exposure' && e.conversation_id === r.conversation_id && e.record.local === true && e.created_at >= r.created_at);
}

/**
 * Which standing decisions from other conversations may still be carried.
 * A candidate is carried only when ALL of these hold:
 *   • the most recent exposure row of its own conversation, recorded at or
 *     after it, lists it as active — a "from now on" revoked there, rolled
 *     back or expired is not carried, and without that row nothing says it
 *     is still in force, so it is not carried either (unknown is a no);
 *   • its reach has not ended (reachEnded): no revocation of its rule since,
 *     in any conversation's rows or in their settings (`tombstones`), and its
 *     conversation has not become one kept to itself.
 * One row per interventionId. Pure.
 */
export function standingInForce(
  candidates: readonly LedgerRow[],
  ownExposures: readonly LedgerRow[],
  revocations: readonly LedgerRow[],
  tombstones: readonly StandingTombstone[] = []
): LedgerRow[] {
  const latest = latestExposures(ownExposures);
  const ends = endsOf(revocations);
  const seen = new Set<string>();
  return candidates.filter((r) => {
    if (r.kind !== 'decision' || r.conversation_id === null) return false;
    const id = typeof r.record.interventionId === 'string' ? r.record.interventionId : '';
    if (!id || seen.has(id)) return false;
    // its own conversation's rows from then on are there (unknown is a no) — but what holds there now does not
    // decide what crosses: a quiz, "more detail" or the same words again lift or replace it THERE; only their
    // take-back, a reset, or that conversation kept to itself or deleted ends it everywhere
    const e = latest.get(r.conversation_id);
    if (!e || e.created_at < r.created_at) return false;
    if (reachEnded(r, ends, tombstones, ownExposures)) return false;
    seen.add(id);
    return true;
  });
}

/**
 * This conversation's exposure rows as (turn, ids carried in at that turn),
 * for the fold (MRTurnInput.carriedIn): a carried preference holds from the
 * first turn it was carried in. Rows at or before their last reset are not
 * read. Pure.
 */
export function carriedInOf(rows: readonly LedgerRow[], resetAt: number | null = null): { turn: number; ids: string[] }[] {
  return (rows ?? [])
    .filter((r) => r && r.kind === 'exposure' && Number.isInteger(r.turn) && r.turn >= 0 && !(typeof resetAt === 'number' && r.created_at <= resetAt))
    .map((r) => ({ turn: r.turn, ids: codesIn(r.record?.carriedIn) }))
    .filter((x) => x.ids.length > 0);
}

/**
 * The first user-turn index of this conversation after their last reset, for
 * the fold (MRState.resetTurn), from this conversation's rows. Null when they
 * never reset. Otherwise, in order: the resetTurn an exposure row recorded
 * since the reset already says; else the earliest turn of an exposure row
 * since the reset (a row written before resetTurn was recorded); else `turn` —
 * nothing has been recorded here since the reset, so this turn is the first.
 * Rows at or before the reset are not read. Pure.
 */
export function resetTurnOf(rows: readonly LedgerRow[], resetAt: number | null, turn: number): number | null {
  if (typeof resetAt !== 'number' || !Number.isFinite(resetAt)) return null;
  const since = (rows ?? []).filter((r) => r && r.kind === 'exposure' && typeof r.created_at === 'number' && r.created_at > resetAt);
  const said = since.map((r) => r.record?.resetTurn).filter((t): t is number => typeof t === 'number' && Number.isInteger(t) && t >= 0);
  if (said.length) return Math.min(...said);
  const turns = since.map((r) => r.turn).filter((t) => Number.isInteger(t) && t >= 0);
  return turns.length ? Math.min(...turns) : turn;
}

/**
 * How many times a model was actually asked to deliberate, among these rows
 * (one conversation's, for its budget): exposure rows that say so. A
 * deterministic deliberation, and one whose answer was 'none', are no row of
 * their own, so decision rows cannot count this. Pure.
 */
export function modelDeliberationsIn(rows: readonly LedgerRow[]): number {
  const exposures = (rows ?? []).filter((r) => r && r.kind === 'exposure');
  const flagged = exposures.filter((r) => r.record?.modelDeliberated === true).length;
  // the running total an exposure row carries outlives the rows that leave the 60-row read
  const total = exposures.reduce((m, r) => (typeof r.record?.modelDeliberations === 'number' ? Math.max(m, r.record.modelDeliberations as number) : m), 0);
  return Math.max(flagged, total);
}

/**
 * Adjustments in force that the person's view has no entry for: ids that a
 * conversation's most recent exposure row lists as active, on a turn that
 * changed replies (the full arm, not shadow), with no decision row among
 * these rows — not counting preferences carried in from another conversation
 * (their decision row is the other conversation's). These are, for example,
 * what they asked for before a reset, which still holds in that conversation
 * while its decision row is gone, or a decision older than the rows read.
 * The view says how many there are rather than presenting a list that
 * looks complete. Pure.
 */
export function unlistedInForce(rows: readonly LedgerRow[]): number {
  const clean = rows.map((r) => sanitizeLedgerRow(r)).filter((r): r is LedgerRow => !!r);
  const known = new Set<string>();
  for (const r of clean) {
    if (r.kind !== 'decision') continue;
    const d = r.record as { interventionId?: unknown; composedOf?: unknown };
    if (typeof d.interventionId === 'string') known.add(d.interventionId);
    for (const id of codesIn(d.composedOf)) known.add(id);
  }
  const unlisted = new Set<string>();
  for (const e of latestExposures(clean).values()) {
    // a turn that enforced nothing (IFR off, a higher layer took it all) lists would-be adjustments: not in force
    if (e.record.arm !== 'full' || e.record.shadow !== false || e.record.ifr === false || e.record.enforced === false) continue;
    const carried = new Set(codesIn(e.record.carriedIn));
    for (const id of codesIn(e.record.active)) if (!known.has(id) && !carried.has(id)) unlisted.add(`${e.conversation_id}\u0000${id}`);
  }
  return unlisted.size;
}

/**
 * What MR adjusted, newest first, at most 50: decision rows only, each with
 * whether it is still in force.
 *
 * In force, read in this order:
 *   • an outcome row said to revert it → ended;
 *   • a standing preference older than the retention window → ended;
 *   • the conversation's most recent exposure row (recorded at or after the
 *     decision) lists it, or it is the decision in force there → active;
 *     that row does not → ended;
 *   • no such row: its own expiry, against the newest turn recorded for the
 *     conversation.
 *
 * How far it reaches is its scope — except a standing one whose reach beyond
 * its conversation has ended by the rule standingInForce applies (their
 * words took it back in another conversation, `revokedStanding` in their
 * settings says so, or its conversation became one kept to itself): it is
 * then shown as reaching its own conversation only, never "every
 * conversation", because it is no longer carried.
 *
 * Applied: the turn it was made on ran the full arm, not in shadow, and the
 * decision in force changed the reply. Not applied:
 *   • the condition computed it but never enforces it (`not_enforced` among
 *     its uncertainty: an IFR rule with IFR off) — whatever later turns say;
 *   • that turn's exposure row says the decision in force changed nothing
 *     (`enforced` false), or a higher layer took every control out of this
 *     decision itself (`constrainedBy` names each one it set) — safety
 *     does that — unless a later turn of the same conversation that did
 *     change the reply still lists it as active: then it changed replies.
 * Unknown (null) when its own exposure row is not there to say.
 */
export function summarize(rows: readonly LedgerRow[], now: number, o: { revokedStanding?: readonly StandingTombstone[] } = {}): AdjustmentSummary[] {
  const clean = rows.map((r) => sanitizeLedgerRow(r)).filter((r): r is LedgerRow => !!r);
  const newer = (a: LedgerRow, b: LedgerRow) => b.created_at - a.created_at || b.turn - a.turn;

  const latestExposure = latestExposures(clean);
  const exposureAt = new Map<string, LedgerRow>();
  const newestTurn = new Map<string, number>();
  const reverted = new Set<string>();
  for (const r of clean) {
    if (r.conversation_id !== null) newestTurn.set(r.conversation_id, Math.max(newestTurn.get(r.conversation_id) ?? -1, r.turn));
    if (r.kind === 'exposure') exposureAt.set(`${r.conversation_id ?? '-'}:${r.turn}:${r.conversation_id === null ? r.created_at : ''}`, r);
    if (r.kind === 'outcome' && r.record.regulation === 'revert') reverted.add(String(r.record.interventionId));
  }
  const ends = endsOf(clean);
  const tombstones = Array.isArray(o.revokedStanding) ? o.revokedStanding : [];
  const exposures = clean.filter((r) => r.kind === 'exposure');
  /** a later turn of its conversation changed replies while it was in force */
  const enforcedLater = (r: LedgerRow, ids: readonly string[]) =>
    exposures.some(
      (e) =>
        e.conversation_id === r.conversation_id &&
        e.conversation_id !== null &&
        (e.created_at > r.created_at || (e.created_at === r.created_at && e.turn > r.turn)) &&
        e.record.arm === 'full' &&
        e.record.shadow === false &&
        e.record.enforced !== false &&
        codesIn(e.record.active).some((id) => ids.includes(id))
    );

  return clean
    .filter((r) => r.kind === 'decision')
    .sort(newer)
    .slice(0, MAX_SUMMARY)
    .map((r) => {
      const d = r.record as unknown as DecisionView;
      const standing = d.scope.kind === 'standing';
      const tracked = trackedId(d);
      let ended: boolean;
      if (reverted.has(d.interventionId) || reverted.has(tracked)) ended = true;
      else if (standing && now - r.created_at > LEDGER_RETENTION_MS) ended = true;
      else {
        const latest = r.conversation_id !== null ? latestExposure.get(r.conversation_id) : undefined;
        const active = latest && latest.created_at >= r.created_at && Array.isArray(latest.record.active) ? (latest.record.active as string[]) : null;
        if (latest && active) {
          ended = !(active.includes(d.interventionId) || active.includes(tracked) || latest.record.interventionId === d.interventionId);
        } else {
          const until = d.expiration.afterTurn;
          const newest = r.conversation_id !== null ? newestTurn.get(r.conversation_id) ?? r.turn : r.turn;
          ended = until !== null && newest > until;
        }
      }
      const own = exposureAt.get(`${r.conversation_id ?? '-'}:${r.turn}:${r.conversation_id === null ? r.created_at : ''}`);
      const ran = own ? own.record.shadow === false && own.record.arm === 'full' : null;
      // every control taken out of it by a higher layer (`layer:control` for each one it set,
      // or none left): as made, it changed nothing
      const by = codesIn(d.constrainedBy);
      const keys = d.controls ? Object.keys(d.controls) : [];
      const emptied = by.length > 0 && keys.every((k) => by.some((c) => c.endsWith(`:${k}`)));
      const applied = codesIn(d.uncertainty).includes(NOT_ENFORCED)
        ? false
        : own && ran === true && (own.record.enforced === false || emptied)
          ? enforcedLater(r, [d.interventionId, tracked])
          : ran;
      // still held where it was said, but no longer carried anywhere else
      const scope = standing && reachEnded(r, ends, tombstones, exposures) ? 'conversation' : d.scope.kind;
      return {
        turn: r.turn,
        at: r.created_at,
        action: d.action,
        trigger: d.trigger,
        status: ended ? 'ended' : 'active',
        scope,
        conversation: r.conversation_id !== null,
        standing,
        applied,
      } satisfies AdjustmentSummary;
    });
}

// ── whether a turn may be written at all ─────────────────────────────

/**
 * The ledger is written only for a signed-in person's own conversation, on
 * the record, not incognito, with the store on. Every unknown is a no:
 * an incognito flag that could not be read (null) is treated as incognito,
 * because the read that failed is the only thing that could have said
 * otherwise.
 */
export function persistAllowed(w: {
  userId: string | null;
  shared: boolean;
  persistPolicy: 'full' | 'conversation_only' | 'none';
  incognito: boolean | null;
  storeOn: boolean;
}): boolean {
  return (
    typeof w.userId === 'string' &&
    w.userId.length > 0 &&
    w.shared === false &&
    (w.persistPolicy === 'full' || w.persistPolicy === 'conversation_only') &&
    w.incognito === false &&
    w.storeOn === true
  );
}
