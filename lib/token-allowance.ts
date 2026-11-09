// lib/token-allowance.ts — THE WEEK'S TOKENS, HELD BEFORE A CALL AND SETTLED AFTER.
//
// Store-agnostic: the database is a TokenStore (lib/sleep-server.ts gives the
// Supabase one; the suite gives an in-memory one), so the rules below can be
// held to account without a network.
//
// THE RULE FOR ONE MODEL CALL, made for a free account:
//
//   1. HOLD before the model is asked. The call may cost its input (estimated
//      from what it sends, with a margin) plus the most it may write. The store
//      holds up to that much ATOMICALLY — never more than the week has free
//      (the limit, less what is settled, less what calls still running hold)
//      — in one locked step, so two tabs, two devices or two requests at once
//      can never both be given the same last tokens. Anything free at all lets
//      the call start; nothing free and nothing held is Sleep Mode; nothing
//      free while other calls of theirs still hold tokens is a short wait for
//      those calls to settle (one of their own replies is usually what holds
//      them), then Sleep if the week is spent, or "busy" if they are still
//      running.
//   2. CAP what it may write by what the week has left, where the call can be
//      shortened (plain text: a reply, a reading). A call that answers in JSON
//      keeps its own cap, which is bounded: a cut-off JSON answer is no answer.
//   3. SETTLE when it ends, with what it really cost (lib/sleep.ts
//      countedTokens): the hold is released and the real cost added. Less
//      than held gives the rest back; more than held (it read more than the
//      week had left) is recorded as it was — the week may end a little past
//      its limit, never by more than that one call, and Socria then sleeps. A
//      call that failed costs nothing. A call whose provider never reported
//      its usage (a stream stopped early) is settled at an estimate of what it
//      read and wrote, so stopping a reply is never a way round the count.
//
// If the store cannot be reached the call is refused (`unavailable`): free
// accounts' paid model work fails closed, plainly said, rather than being
// given away uncounted.
//
// PURE apart from the store it is handed and the clock and timer it is given.

import { sleepState, weekKey, type SleepState } from './sleep';

/** What a store answers for a hold. */
export interface Reserved {
  /** tokens held for this call; 0 when nothing could be */
  granted: number;
  /** the week's settled tokens when it was asked */
  used: number;
  /** tokens held by calls still running, this one included */
  held: number;
  /**
   * whether the store keeps holds apart from the week's total (the database
   * functions in supabase/weekly-tokens.sql) — false for the older counter it
   * falls back to, where a hold is part of the total
   */
  holds: boolean;
}

export interface TokenStore {
  /** Hold up to `want` tokens (none when fewer than `min` are free), atomically. Throws when the store cannot answer. */
  reserve(a: { user: string; week: string; hold: string; want: number; min: number; limit: number; ttl: number; at: number }): Promise<Reserved>;
  /** Release a hold and add what the call really cost. Throws when the store cannot answer. */
  settle(a: { user: string; week: string; hold: string; reserved: number; tokens: number; at: number; holds: boolean }): Promise<number>;
  /** The week's settled tokens. Throws when the store cannot answer. */
  read(user: string, week: string): Promise<number>;
}

export type Refusal = { kind: 'sleep'; state: SleepState } | { kind: 'busy' } | { kind: 'unavailable'; detail?: string };

/** A model call that could not be held: the route answers it as Sleep Mode, busy, or the allowance unreadable. */
export class TokenRefusal extends Error {
  readonly tokenRefusal = true;
  constructor(readonly refusal: Refusal) {
    super(refusal.kind === 'sleep' ? 'the period’s tokens are spent' : refusal.kind === 'busy' ? 'the period’s tokens are held by calls still running' : 'the period’s tokens cannot be checked');
    this.name = 'TokenRefusal';
  }
}

export function isTokenRefusal(e: unknown): e is TokenRefusal {
  return !!e && typeof e === 'object' && (e as { tokenRefusal?: unknown }).tokenRefusal === true;
}

/** A hold: what the call may write, and how it settles. */
export interface Hold {
  /** tokens held */
  granted: number;
  /** what the call may write at most, when the week has less left than it asked for and it can be shortened; null leaves its cap as asked */
  outputCap: number | null;
  /** The call ended, having cost `tokens` (0: it never answered). Settles once; never throws. */
  end(tokens: number): Promise<void>;
}

export interface HoldOptions {
  user: string;
  limit: number;
  /** the input the call sends, estimated (requestTokens) */
  input: number;
  /** the most the call may write, as asked (reasoning included) */
  output: number;
  /** may its output be shortened to fit what the week has left */
  cappable: boolean;
  /** the least a shortened call is left to write (an answer, and any reasoning room) */
  floor: number;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
  /** how long to wait for other calls' holds to settle before answering busy */
  waitMs?: number;
  pollMs?: number;
  /** how long a hold counts if its call never settles (ms) */
  ttl?: number;
  id?: () => string;
  /** told when a settle could not be written, after its retry */
  onLost?: (tokens: number, why: unknown) => void;
  /**
   * The period the call is counted in — its key in the store. The week holding the call when absent;
   * the seven-day trial passes its day (lib/trial.ts dayKey).
   */
  scope?: string;
  /** The state a refused call reports, given what the period has settled. Sleep Mode's week when absent. */
  stateOf?: (used: number, limit: number, at: number) => SleepState;
}

/** The margin on an estimated input: the estimate is bytes ÷ 4, and a tokenizer can read some text closer. */
export const INPUT_MARGIN = 1.2;
/** A call that never settles stops holding tokens after this long. */
export const HOLD_TTL_MS = 10 * 60_000;
/** How long a call waits for the person's other calls to settle before it is told busy. */
export const WAIT_MS = 8_000;

const sleepFor = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const newId = () => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
};

/** What a call may hold: its input with the margin, plus the most it may write. */
export function wantFor(input: number, output: number): number {
  return Math.max(1, Math.ceil(Math.max(0, input) * INPUT_MARGIN) + Math.max(0, Math.ceil(output)));
}

/**
 * Hold tokens for one model call. Resolves with the hold, or throws a
 * TokenRefusal: Sleep (the week is spent), busy (every token left is held by
 * calls still running, past the wait), or unavailable (the store cannot be
 * reached). Never asks the model anything.
 */
export async function holdTokens(store: TokenStore, o: HoldOptions): Promise<Hold> {
  const now = o.now ?? Date.now;
  const wait = o.wait ?? sleepFor;
  const waitMs = Math.max(0, o.waitMs ?? WAIT_MS);
  const pollMs = Math.max(1, o.pollMs ?? Math.min(400, Math.max(25, Math.round(waitMs / 10))));
  const ttl = o.ttl ?? HOLD_TTL_MS;
  const hold = (o.id ?? newId)();
  const want = wantFor(o.input, o.output);
  // the period the call began in is the one it settles into, even if it ends after the reset
  const week = o.scope ?? weekKey(now());
  const deadline = now() + waitMs;
  for (;;) {
    let r: Reserved;
    try {
      r = await store.reserve({ user: o.user, week, hold, want, min: 1, limit: o.limit, ttl, at: now() });
    } catch (e) {
      throw new TokenRefusal({ kind: 'unavailable', detail: e instanceof Error ? e.message.slice(0, 160) : undefined });
    }
    if (r.granted > 0) {
      // what was free before this call took its share: the most it may write, if it can be shortened
      const free = Math.max(0, o.limit - r.used - (r.held - r.granted));
      const outputCap = o.cappable && o.output > free ? Math.max(o.floor, free) : null;
      return { granted: r.granted, outputCap, end: settler(store, { user: o.user, week, hold, reserved: r.granted, holds: r.holds, now, wait, onLost: o.onLost }) };
    }
    // nothing free: the week is spent — or every token left is held by calls of theirs still running
    const othersHold = r.holds && r.held > 0 && r.used < o.limit;
    if (!othersHold) throw new TokenRefusal({ kind: 'sleep', state: { ...(o.stateOf ? o.stateOf(r.used, o.limit, now()) : sleepState(r.used, o.limit, now())), asleep: true, left: 0 } });
    if (now() >= deadline) throw new TokenRefusal({ kind: 'busy' });
    await wait(pollMs);
  }
}

function settler(
  store: TokenStore,
  x: { user: string; week: string; hold: string; reserved: number; holds: boolean; now: () => number; wait: (ms: number) => Promise<void>; onLost?: (tokens: number, why: unknown) => void }
): (tokens: number) => Promise<void> {
  let done = false;
  return async (tokens: number) => {
    if (done) return;
    done = true;
    const t = Math.max(0, Math.floor(Number.isFinite(tokens) ? tokens : 0));
    const write = () => store.settle({ user: x.user, week: x.week, hold: x.hold, reserved: x.reserved, tokens: t, at: x.now(), holds: x.holds });
    try {
      await write();
    } catch (first) {
      // Once more, a moment later — but only where settling is idempotent (a hold is released once, and the
      // cost added only with it). The older counter adds and refunds blindly, so a retry there could count twice.
      if (!x.holds) return x.onLost?.(t, first);
      try {
        await x.wait(250);
        await write();
      } catch (e) {
        x.onLost?.(t, e);
      }
    }
  };
}

// ── estimates ────────────────────────────────────────────────────────

/** UTF-8 bytes in a string, counted without allocating. */
export function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

/** Tokens in some text, estimated: about four bytes of UTF-8 a token. */
export function estimateTokens(text: string | null | undefined): number {
  return text ? Math.ceil(utf8Length(text) / 4) : 0;
}

/** What one image is held at: the provider reads a large photo at detail 'high' as up to about this many. */
export const IMAGE_TOKENS = 1_500;

/**
 * The input a chat request will be read as, estimated: the text of its
 * messages, a fixed allowance for each image, and a few tokens each for the
 * message framing. Used to hold enough before the call, and to settle a call
 * whose provider never reported its usage.
 */
export function requestTokens(params: unknown): number {
  const p = params as { messages?: unknown; input?: unknown; tools?: unknown; functions?: unknown } | null;
  let n = 3;
  const part = (c: unknown): number => {
    if (typeof c === 'string') return estimateTokens(c);
    if (!c || typeof c !== 'object') return 0;
    const x = c as { type?: string; text?: unknown; image_url?: { detail?: string } };
    if (x.type === 'image_url' || x.type === 'input_image') return x.image_url?.detail === 'low' ? 100 : IMAGE_TOKENS;
    return typeof x.text === 'string' ? estimateTokens(x.text) : 0;
  };
  for (const m of Array.isArray(p?.messages) ? p!.messages : []) {
    const content = (m as { content?: unknown })?.content;
    n += 4 + (Array.isArray(content) ? content.reduce((s: number, c) => s + part(c), 0) : part(content));
  }
  if (typeof p?.input === 'string') n += estimateTokens(p.input);
  for (const extra of [p?.tools, p?.functions]) if (extra) n += estimateTokens(JSON.stringify(extra));
  return n;
}
