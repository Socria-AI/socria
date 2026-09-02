'use client';

// components/usePlan.ts
//
// What this person holds, for the surfaces that mention Socria One in
// passing — the sidebar foot, the model picker, the account page.
//
// The same two-step LogosApp does, pulled out so three places do not each
// reinvent it: a local belief first, so a member never sees "become a
// member" flash on load, then the server's answer, which wins. The local
// belief is the same key the Logos code redemption writes, so a typed code
// is honoured here the moment it is typed.
//
// `known` is the thing callers actually branch on. Until the server has
// answered, the honest state is "not sure", and a mark that sells One should
// hold back rather than guess — a member shown a price for half a second is
// a small insult, and a small insult on every page load adds up.

import { useEffect, useState } from 'react';
import type { Plan } from '@/lib/socria-one';

const ONE_KEY_STORAGE = 'socria.one.v1';

export interface PlanState {
  plan: Plan;
  /** the server has answered, so `plan` is the real one */
  known: boolean;
  /** a Stripe customer stands behind it, so billing can be managed */
  manageable: boolean;
}

export function usePlan(): PlanState {
  const [state, setState] = useState<PlanState>(() => ({
    plan: 'free',
    known: false,
    manageable: false,
  }));

  useEffect(() => {
    let live = true;
    try {
      if (localStorage.getItem(ONE_KEY_STORAGE) === '1') {
        setState((s) => ({ ...s, plan: 'one' }));
      }
    } catch {}

    fetch('/api/logos/plan')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!live) return;
        const plan: Plan = j?.plan === 'one' ? 'one' : 'free';
        setState({ plan, known: !!j, manageable: !!j?.manageable });
        try {
          if (plan === 'one') localStorage.setItem(ONE_KEY_STORAGE, '1');
        } catch {}
      })
      .catch(() => {
        // Unreachable: keep the local belief, and say we do not know.
      });
    return () => {
      live = false;
    };
  }, []);

  return state;
}
