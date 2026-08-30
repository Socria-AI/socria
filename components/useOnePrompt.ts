'use client';

// components/useOnePrompt.ts
//
// The one way anything in the product asks to mention Socria One.
//
// Components do not open a modal. They call `ask('explore-spent')` and this
// decides — against the plan, the cooldown, what has already been shown, and
// what kind of conversation is on screen — whether anything appears at all.
// That indirection is the whole point: an upgrade modal opened directly from
// a component is one nobody can rate-limit, count, or switch off.
//
// Where state lives, and why it is split:
//
//   sessionStorage  how many proactive prompts this TAB has shown. Clears by
//                   itself when the tab closes, which is exactly the lifetime
//                   "once per session" means.
//   localStorage    dismissals and when, so a cooldown survives a reload even
//                   signed out.
//   the server      the same two values per ACCOUNT, so the cooldown also
//                   survives a different device. Authoritative when it
//                   answers; the local copy is the fallback, not a race.
//
// The server value wins by being the maximum, never the newest: dismissals
// only ever go up, so taking the larger of the two can only make us ask less
// often. A merge that could lower the count would turn a second device into a
// way to reset the cooldown.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  decide,
  engagementFrom,
  EMPTY_PROMPT_STATE,
  TRIGGERS,
  type Decision,
  type PromptState,
  type TriggerReason,
} from '@/lib/one-prompt';
import { track } from '@/lib/analytics';
import type { Plan } from '@/lib/socria-one';
import type { ThinkingContext } from '@/lib/logos';

const LOCAL_KEY = 'socria.one.prompt.v1';
const SESSION_KEY = 'socria.one.prompt.session.v1';

function readLocal(): PromptState {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return { ...EMPTY_PROMPT_STATE };
    const j = JSON.parse(raw) as Partial<PromptState>;
    return {
      dismissals: Number(j.dismissals) || 0,
      lastDismissedAt: Number(j.lastDismissedAt) || 0,
      lastShownAt: Number(j.lastShownAt) || 0,
      shownThisSession: 0, // never persisted here; sessionStorage owns it
    };
  } catch {
    return { ...EMPTY_PROMPT_STATE };
  }
}

function writeLocal(s: PromptState) {
  try {
    localStorage.setItem(
      LOCAL_KEY,
      JSON.stringify({
        dismissals: s.dismissals,
        lastDismissedAt: s.lastDismissedAt,
        lastShownAt: s.lastShownAt,
      })
    );
  } catch {
    // Private window, or storage full. The session guard still holds.
  }
}

function readSessionCount(): number {
  try {
    return Number(sessionStorage.getItem(SESSION_KEY)) || 0;
  } catch {
    // No sessionStorage means we cannot prove we have not already asked, so
    // count it as asked. Erring toward silence is the correct direction.
    return 1;
  }
}

function writeSessionCount(n: number) {
  try {
    sessionStorage.setItem(SESSION_KEY, String(n));
  } catch {}
}

export interface OnePromptView {
  open: boolean;
  reason: TriggerReason | null;
  title: string;
  body: string;
  primary: string;
  secondary: string;
  category: string;
  intent: string;
}

export interface UseOnePromptArgs {
  plan: Plan;
  signedIn: boolean;
  /** the map's reading of this conversation, for the sensitive-context rule */
  context?: ThinkingContext;
  /** saved Logos sessions, for the proactive engagement bar */
  sessions: readonly { updatedAt: number }[];
  /** nodes on the map right now */
  mapNodes: number;
  /** which surface this is, for analytics only */
  surface?: string;
}

export function useOnePrompt({
  plan,
  signedIn,
  context,
  sessions,
  mapNodes,
  surface = 'logos',
}: UseOnePromptArgs) {
  const [view, setView] = useState<OnePromptView | null>(null);
  const state = useRef<PromptState>({ ...EMPTY_PROMPT_STATE });
  const loaded = useRef(false);

  /**
   * The live inputs, held in a ref so `ask`, `dismiss` and `accept` keep a
   * stable identity for the life of the component.
   *
   * This is not a micro-optimisation. `mapNodes` changes on every extraction,
   * so a callback that depended on it would change identity constantly; an
   * effect that calls `ask` would then either restart on every map edit (and
   * so never fire) or exclude it from its dependencies (and call a stale
   * copy). Reading through a ref removes the choice: callers get one `ask`
   * that always sees current values.
   */
  const live = useRef({ plan, signedIn, context, sessions, mapNodes, surface });
  live.current = { plan, signedIn, context, sessions, mapNodes, surface };

  /** What is on screen, readable from a stable callback. */
  const openRef = useRef<OnePromptView | null>(null);
  openRef.current = view;

  // Load what we already know: local first, so a decision is possible
  // immediately, then reconciled with the account.
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    const local = readLocal();
    local.shownThisSession = readSessionCount();
    state.current = local;

    if (!signedIn) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/logos/one-prompt');
        if (!res.ok) return;
        const j = await res.json();
        if (cancelled || !j?.known) return;
        // Max, not newest — see the note at the top of this file.
        state.current = {
          ...state.current,
          dismissals: Math.max(state.current.dismissals, Number(j.dismissals) || 0),
          lastDismissedAt: Math.max(
            state.current.lastDismissedAt,
            Number(j.lastDismissedAt) || 0
          ),
        };
        writeLocal(state.current);
      } catch {
        // Offline. The local copy is what we have, and it is enough.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  /**
   * Ask to show a prompt. Returns whether one opened, so a caller that needs
   * to do something else when it did not — say, show an inline note instead —
   * can tell.
   */
  const ask = useCallback((reason: TriggerReason): boolean => {
    const cur = live.current;
    const spec = TRIGGERS[reason];
    const proactive = spec.category === 'proactive' && reason !== 'asked';

    const d: Decision = decide({
      reason,
      plan: cur.plan,
      now: Date.now(),
      state: state.current,
      open: openRef.current !== null,
      context: cur.context,
      engagement: engagementFrom(cur.sessions, cur.mapNodes),
    });

    if (!d.show) {
      // Suppressions are the most useful thing this system records: they say
      // how often the rules are doing their job, and whether a trigger is
      // being starved by them.
      track('one_prompt_suppressed', {
        trigger: reason,
        category: spec.category,
        intent: spec.intent,
        surface: cur.surface,
        plan: cur.plan,
        suppressed: d.why,
        signed_in: cur.signedIn,
      });
      return false;
    }

    state.current = {
      ...state.current,
      lastShownAt: Date.now(),
      shownThisSession: state.current.shownThisSession + (proactive ? 1 : 0),
    };
    if (proactive) writeSessionCount(state.current.shownThisSession);
    writeLocal(state.current);

    setView({
      open: true,
      reason,
      title: d.copy.title,
      body: d.copy.body,
      primary: d.copy.primary,
      secondary: d.copy.secondary,
      category: d.category,
      intent: d.intent,
    });

    track('one_prompt_shown', {
      trigger: reason,
      category: d.category,
      intent: d.intent,
      surface: cur.surface,
      plan: cur.plan,
      counter: spec.counter,
      hard_limit: !!spec.counter,
      dismissals: state.current.dismissals,
      signed_in: cur.signedIn,
    });
    return true;
  }, []);

  /** They closed it. Only a proactive close counts toward the cooldown. */
  const dismiss = useCallback(() => {
    const cur = live.current;
    const v = openRef.current;
    setView(null);
    if (!v?.reason) return;
    const spec = TRIGGERS[v.reason];

    track('one_prompt_dismissed', {
      trigger: v.reason,
      category: spec.category,
      intent: spec.intent,
      surface: cur.surface,
      plan: cur.plan,
      counter: spec.counter,
      hard_limit: !!spec.counter,
      signed_in: cur.signedIn,
    });

    // Closing an entitlement prompt is not a "no" to Socria One — it is a
    // "not right now" to the thing they were doing. Counting it would let
    // ordinary use of the free tier silence a prompt nobody ever rejected.
    if (spec.category !== 'proactive' || v.reason === 'asked') return;

    state.current = {
      ...state.current,
      dismissals: state.current.dismissals + 1,
      lastDismissedAt: Date.now(),
    };
    writeLocal(state.current);

    if (cur.signedIn) {
      void fetch('/api/logos/one-prompt', { method: 'POST' }).catch(() => {});
    }
  }, []);

  /** They pressed the primary action. Reported before checkout navigates. */
  const accept = useCallback(() => {
    const cur = live.current;
    const v = openRef.current;
    if (!v?.reason) return;
    const spec = TRIGGERS[v.reason];
    track('one_prompt_clicked', {
      trigger: v.reason,
      category: spec.category,
      intent: spec.intent,
      surface: cur.surface,
      plan: cur.plan,
      counter: spec.counter,
      hard_limit: !!spec.counter,
      signed_in: cur.signedIn,
    });
  }, []);

  return { prompt: view, ask, dismiss, accept };
}
