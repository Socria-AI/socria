'use client';
// components/useMRSettings.ts
//
// The person's Metacognitive Regulation settings, and the latest things it
// adjusted, for Manage Account → Personalization (components/account/MRSettings.tsx).
//
// The account is the only authority (user_profiles.mr, through /api/mr):
// unlike the Conversation Style there is no browser copy, because the server
// reads these settings itself on every turn and nothing on the client needs
// them at send time. A copy here could only ever be stale.
//
//   GET    /api/mr  → { active, settings | null, stamp?, adjustments, unlisted?, incomplete?, settingsUnsupported? }   401 signed out
//   PUT    /api/mr  { enabled?, carryAcross? } → { ok, settings?, stamp? }
//   DELETE /api/mr  → reset: { ok: true }; the rows removed but the reset not
//                     saved: { ok: false, deleted: true } — its own outcome
//                     ('partial'), never "nothing was cleared"
//
// A switch moves at once and the account is asked after; a change the
// account does not take is put back to what the account is known to hold —
// not to whatever the sheet showed before, which may itself have been a flip
// that never landed. A switch shows the newest flip while that flip is on
// its way, and the account's last answer otherwise, so two quick flips settle
// on the last one, and two that both fail settle on the account.
//
// ANSWERS ARRIVE OUT OF ORDER. Two flips can be answered by two servers, the
// later write's answer first. Each answer carries the stamp its write (or
// read) left on the account (user_profiles.updated_at), and an answer is the
// account's value only when its stamp is newer than every answer already
// adopted: the older one, arriving last, is the account as it WAS. (An
// answer with no stamp, from an older server, falls back to the per-switch
// rules above.)
//
// `active` is the deployment's answer to "does MR run here at all". Anything
// but a plain `true` reads as no, and so does an answer that did not arrive:
// the sheet then shows no control, rather than one that changes nothing.
// Settings the account could not read (`settings: null`) are not filled in
// with the defaults either: their "off" may be exactly what could not be
// read, and the server runs that turn as baseline, so the sheet shows nothing
// rather than a guess.
//
// The list is what Socria DID. A decision made in shadow, or in a comparison
// arm that does not enforce decisions (`applied: false`), changed nothing and
// is not listed; how far one reaches comes from its `scope`, never from
// `conversation` (which only says it was recorded with a conversation id).
//
// The state machine is a plain object (mrSettingsClient) with the fetch
// passed in, so test/mr-settings-ui.test.mjs drives it without a browser; the
// hook only holds its snapshot.

import { useEffect, useState } from 'react';
import { ACTIONS, DEFAULT_MR_SETTINGS, type Action, type MRSettings, type Scope } from '@/lib/mr/types';

/** One adjustment as GET /api/mr lists it: codes and indices, never words. */
export interface AdjustmentSummary {
  /** the user-turn index it was made at */
  turn: number;
  /** epoch ms */
  at: number;
  action: Action;
  /** the rule that fired, e.g. 'ifr.observed.unproductive_questions' (lib/mr/words.ts says it) */
  trigger: string;
  status: 'active' | 'ended';
  /** how far it reaches (this reply, a few, the conversation, across conversations); null when the answer did not say */
  scope: Scope['kind'] | null;
  /** it was recorded with a conversation id — NOT how far it reaches; that is `scope` */
  conversation: boolean;
  /** one of their "from now on" preferences (carried across conversations only with their consent) */
  standing: boolean;
}

export type MRLoadState = 'loading' | 'ready' | 'failed' | 'signed-out';

export interface MRSettingsSnapshot {
  state: MRLoadState;
  /** MR runs on this deployment (and so the settings mean something) */
  active: boolean;
  settings: MRSettings;
  /** newest first */
  adjustments: AdjustmentSummary[];
  /** the account could not read all of the adjustments: an empty list is not "nothing adjusted" */
  adjustmentsIncomplete: boolean;
  /**
   * Adjustments in force that the list has no entry for (GET's `unlisted`) —
   * what they asked for before their last reset, which still holds in that
   * conversation, say. The list never looks complete when it is not.
   */
  unlisted: number;
  /** the account cannot keep MR settings yet (its database lacks the column): a change would not be kept */
  settingsUnsupported: boolean;
  /** a reset on its way to the account */
  resetting: boolean;
}

/** What the client needs of fetch — window.fetch fits, and so does a test's fake. */
export type MRFetch = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; cache?: RequestCache }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const MR_URL = '/api/mr';
/** the list on the sheet shows five; a few more are kept so a reset's rollback has them */
const KEEP = 50;
const SWITCHES = ['enabled', 'carryAcross'] as const;
type Switch = (typeof SWITCHES)[number];

const SCOPES: ReadonlySet<string> = new Set(['turn', 'turns', 'conversation', 'standing']);
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const ACTION_SET: ReadonlySet<string> = new Set(ACTIONS);

/**
 * The account's settings, read strictly. A field of the wrong type is the
 * default; consent to carry is only ever a plain `true`. Null when there is
 * no settings object at all.
 */
export function mrSettingsFrom(x: unknown): MRSettings | null {
  if (!isObj(x)) return null;
  const r = x.research;
  const research =
    isObj(r) && typeof r.studyId === 'string' && typeof r.consentedAt === 'number' && Number.isFinite(r.consentedAt)
      ? { studyId: r.studyId, consentedAt: r.consentedAt }
      : null;
  return {
    version: 1,
    enabled: typeof x.enabled === 'boolean' ? x.enabled : DEFAULT_MR_SETTINGS.enabled,
    carryAcross: x.carryAcross === true,
    research,
    resetAt: typeof x.resetAt === 'number' && Number.isFinite(x.resetAt) ? x.resetAt : null,
  };
}

/**
 * The adjustments list, read strictly: an entry that is not one is dropped,
 * 'none' included, and so is one that changed nothing (`applied: false` — a
 * shadow or comparison-arm decision). Newest first.
 */
export function mrAdjustmentsFrom(x: unknown): AdjustmentSummary[] {
  if (!Array.isArray(x)) return [];
  const out: AdjustmentSummary[] = [];
  for (const a of x) {
    if (!isObj(a)) continue;
    const { turn, at, action, trigger, scope } = a;
    if (typeof action !== 'string' || !ACTION_SET.has(action) || action === 'none') continue;
    if (typeof turn !== 'number' || !Number.isInteger(turn) || turn < 0) continue;
    if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0) continue;
    // Not applied: decided and recorded, but the reply was never changed by it.
    // Unknown (null, or an older answer without the field) is kept: the
    // decision was recorded under MR, and hiding it would hide what was done.
    if (a.applied === false) continue;
    out.push({
      turn,
      at,
      action: action as Action,
      // a code, bounded; lib/mr/words.ts never shows it, only what it means
      trigger: typeof trigger === 'string' ? trigger.slice(0, 80) : '',
      status: a.status === 'active' ? 'active' : 'ended',
      scope: typeof scope === 'string' && SCOPES.has(scope) ? (scope as Scope['kind']) : null,
      conversation: a.conversation === true,
      standing: a.standing === true,
    });
  }
  return out.sort((p, q) => q.at - p.at || q.turn - p.turn).slice(0, KEEP);
}

/** The account's stamp on an answer (when its write or read left one), or null. */
export function mrStampFrom(j: unknown): number | null {
  return isObj(j) && typeof j.stamp === 'number' && Number.isFinite(j.stamp) ? j.stamp : null;
}

/** GET /api/mr's answer, read strictly. Null when it is not an answer at all; `settings` null when the account could not read them. */
export function mrResponseFrom(
  j: unknown
): (Pick<MRSettingsSnapshot, 'active' | 'adjustments' | 'adjustmentsIncomplete' | 'settingsUnsupported' | 'unlisted'> & { settings: MRSettings | null; stamp: number | null }) | null {
  if (!isObj(j)) return null;
  const incomplete = Array.isArray(j.incomplete) ? j.incomplete : [];
  const unlisted = j.unlisted;
  return {
    active: j.active === true,
    // never the defaults in place of an answer: their "off" may be what could not be read
    settings: mrSettingsFrom(j.settings),
    stamp: mrStampFrom(j),
    adjustments: mrAdjustmentsFrom(j.adjustments),
    adjustmentsIncomplete: incomplete.includes('adjustments'),
    settingsUnsupported: j.settingsUnsupported === true,
    unlisted: typeof unlisted === 'number' && Number.isInteger(unlisted) && unlisted > 0 ? Math.min(unlisted, 999) : 0,
  };
}

export function initialMRSnapshot(signedIn: boolean): MRSettingsSnapshot {
  return {
    state: signedIn ? 'loading' : 'signed-out',
    active: false,
    settings: { ...DEFAULT_MR_SETTINGS },
    adjustments: [],
    adjustmentsIncomplete: false,
    unlisted: 0,
    settingsUnsupported: false,
    resetting: false,
  };
}

/**
 * What a reset came to: true (done), false (refused — nothing was cleared),
 * or 'partial': what MR recorded was removed, but the reset itself could not
 * be saved, so it should be tried again.
 */
export type MRResetOutcome = boolean | 'partial';

export interface MRSettingsClient {
  snapshot(): MRSettingsSnapshot;
  load(signedIn: boolean): Promise<void>;
  /** true when the account took it; false when it was put back */
  setEnabled(on: boolean): Promise<boolean>;
  setCarryAcross(on: boolean): Promise<boolean>;
  reset(): Promise<MRResetOutcome>;
  /** forget any load still on its way (the sheet closed) */
  stop(): void;
}

export function mrSettingsClient(io: { fetch: MRFetch; emit: (s: MRSettingsSnapshot) => void }, signedIn = true): MRSettingsClient {
  let snap = initialMRSnapshot(signedIn);
  let loadSeq = 0;
  /** what the account is known to hold: the last answer that said so */
  let account: MRSettings = { ...snap.settings };
  /** the stamp of the newest answer adopted as `account` (null: none carried one) */
  let newest: number | null = null;
  /**
   * An answer stamped `s` is older than the account the sheet already holds:
   * its stamp is not newer than the newest adopted — or it has none (no
   * profile row, as read before the write that made one) once one was.
   */
  const stale = (s: number | null) => newest !== null && (s === null || s <= newest);
  /** per switch: flips made, flips still on their way, and the newest flip's value while it is on its way */
  const seq: Record<Switch, number> = { enabled: 0, carryAcross: 0 };
  const out: Record<Switch, number> = { enabled: 0, carryAcross: 0 };
  const wanted: Record<Switch, boolean | null> = { enabled: null, carryAcross: null };

  const set = (patch: Partial<MRSettingsSnapshot>) => {
    snap = { ...snap, ...patch };
    io.emit(snap);
  };
  /** what a switch shows: its newest flip while that is on its way, the account otherwise */
  const shown = (): MRSettings => {
    const s: MRSettings = { ...account };
    for (const k of SWITCHES) {
      const w = wanted[k];
      if (w !== null) s[k] = w;
    }
    return s;
  };
  const signedOut = () => {
    account = { ...DEFAULT_MR_SETTINGS };
    newest = null;
    wanted.enabled = wanted.carryAcross = null;
    set({ ...initialMRSnapshot(false) });
  };
  // A first load that fails shows nothing (no answer is not a yes). A later
  // one — after a reset — keeps what the sheet already shows.
  const failed = () => {
    if (snap.state !== 'ready') set({ state: 'failed', active: false });
  };

  async function load(isSignedIn: boolean): Promise<void> {
    const my = ++loadSeq;
    if (!isSignedIn) return signedOut();
    // A flip on its way when this read starts, or made while it is out, may
    // be newer than what the read sees: for that switch the PUT's own answer
    // is the one to believe.
    const seqAtStart = { ...seq };
    const outAtStart = { ...out };
    if (snap.state !== 'ready') set({ state: 'loading' });
    try {
      const res = await io.fetch(MR_URL, { cache: 'no-store' });
      if (my !== loadSeq) return;
      if (res.status === 401) return signedOut();
      if (!res.ok) return failed();
      const j = mrResponseFrom(await res.json().catch(() => null));
      if (my !== loadSeq) return;
      if (!j) return failed();
      if (j.settings) {
        if (j.stamp !== null && !stale(j.stamp)) {
          // newer than every answer adopted: this is the account
          account = { ...j.settings };
          newest = j.stamp;
        } else if (j.stamp === null && newest === null) {
          const next: MRSettings = { ...j.settings };
          for (const k of SWITCHES) if (outAtStart[k] > 0 || seq[k] !== seqAtStart[k]) next[k] = account[k];
          account = next;
        }
        // otherwise read before a write whose answer is already in: the account as it was
      } else if (snap.state !== 'ready') {
        // the account could not say what they chose: show no switch rather than a guess
        return failed();
      }
      set({
        state: 'ready',
        active: j.active,
        adjustments: j.adjustments,
        adjustmentsIncomplete: j.adjustmentsIncomplete,
        unlisted: j.unlisted,
        settingsUnsupported: j.settingsUnsupported,
        settings: shown(),
      });
    } catch {
      if (my === loadSeq) failed();
    }
  }

  async function flip(which: Switch, on: boolean): Promise<boolean> {
    const my = ++seq[which];
    out[which]++;
    wanted[which] = on;
    set({ settings: shown() });
    try {
      const res = await io.fetch(MR_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [which]: on }),
      });
      if (res.status === 401) {
        signedOut();
        return false;
      }
      const j = res.ok ? await res.json().catch(() => null) : null;
      if (!isObj(j) || j.ok !== true) throw new Error('not saved');
      const theirs = mrSettingsFrom(j.settings);
      const stamp = mrStampFrom(j);
      if (stale(stamp)) {
        // taken — but another write has landed since, and its answer is already in
      } else if (theirs && stamp !== null) {
        // the account as of this write, newer than anything adopted
        account = { ...theirs };
        newest = stamp;
      } else if (theirs) {
        // The account's answer — except for the other switch while a flip of
        // its own is out: that flip's answer is newer than this one.
        const next: MRSettings = { ...theirs };
        for (const k of SWITCHES) if (k !== which && out[k] > 0) next[k] = account[k];
        account = next;
      } else {
        account = { ...account, [which]: on };
      }
      if (my === seq[which]) wanted[which] = null;
      set({ settings: shown() });
      return true;
    } catch {
      // the newest flip failed: show what the account holds (an older flip
      // still out may change that, and its answer will say so)
      if (my === seq[which]) wanted[which] = null;
      set({ settings: shown() });
      return false;
    } finally {
      out[which]--;
    }
  }

  async function reset(): Promise<MRResetOutcome> {
    const before = { adjustments: snap.adjustments, unlisted: snap.unlisted };
    // a load already out would bring the old list back
    loadSeq++;
    set({ adjustments: [], unlisted: 0, resetting: true });
    try {
      const res = await io.fetch(MR_URL, { method: 'DELETE' });
      if (res.status === 401) {
        signedOut();
        return false;
      }
      const j = await res.json().catch(() => null);
      // The rows are gone and the reset is not saved: the list stays clear
      // (putting it back would claim nothing was cleared), and the account
      // is read again for what it does hold.
      if (isObj(j) && j.deleted === true && j.ok !== true) {
        set({ resetting: false });
        await load(true);
        return 'partial';
      }
      if (!res.ok || (isObj(j) && j.ok === false)) throw new Error('not reset');
      set({ resetting: false });
      // the account's settings after a reset (its resetAt, and anything else it put back)
      await load(true);
      return true;
    } catch {
      set({ ...before, resetting: false });
      return false;
    }
  }

  return {
    snapshot: () => snap,
    load,
    setEnabled: (on) => flip('enabled', on),
    setCarryAcross: (on) => flip('carryAcross', on),
    reset,
    stop: () => {
      loadSeq++;
    },
  };
}

export interface MRSettingsHook extends MRSettingsSnapshot {
  setEnabled(on: boolean): Promise<boolean>;
  setCarryAcross(on: boolean): Promise<boolean>;
  reset(): Promise<MRResetOutcome>;
}

export function useMRSettings(signedIn: boolean): MRSettingsHook {
  const [snap, setSnap] = useState<MRSettingsSnapshot>(() => initialMRSnapshot(signedIn));
  // one client for the life of the sheet: it holds the flip counters
  const [client] = useState(() => mrSettingsClient({ fetch: (u, i) => fetch(u, i), emit: setSnap }, signedIn));

  useEffect(() => {
    void client.load(signedIn);
    // a load still out when the sheet closes (or signs out) is not adopted
    return () => client.stop();
  }, [client, signedIn]);

  return { ...snap, setEnabled: client.setEnabled, setCarryAcross: client.setCarryAcross, reset: client.reset };
}
