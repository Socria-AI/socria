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
// `known` is the thing callers branch on, and WHO is asking decides what it
// takes to know.
//
//   Signed in — wait for the server. An account can hold One through Stripe,
//   through a grant, or through a redeemed code, and none of those are
//   visible from the browser. Showing a price to a member for the
//   half-second before the answer arrives is a small insult, and a small
//   insult on every page load adds up.
//
//   Signed out — there is nothing to wait for. A visitor with no account
//   cannot hold a subscription; the only way they hold One is the typed code
//   in localStorage, which is read synchronously right here. Making them wait
//   for a round trip meant that when the round trip did not arrive — a first
//   visit that meets an auth handshake, a blocked request, a cold start —
//   they saw no mention of Socria One anywhere on the site at all. That is
//   the audience the marks exist for, and they were the one audience the
//   caution was not protecting.

import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import type { Plan } from '@/lib/socria-one';

const ONE_KEY_STORAGE = 'socria.one.v1';

/** Student access, when the deployment runs the programme at all. */
export interface StudentState {
  /** the programme is switched on here */
  on: boolean;
  /** how to describe the qualifying domains, e.g. "@mavs.uta.edu" */
  domains: string;
  /** the verified address that qualified, or null if none does yet */
  email: string | null;
}

export interface PlanState {
  plan: Plan;
  /** `plan` can be trusted — see the note above on what that takes */
  known: boolean;
  /** a Stripe customer stands behind it, so billing can be managed */
  manageable: boolean;
  /** absent where the deployment does not run a student programme */
  student?: StudentState;
}

/** The typed code, if one was redeemed in this browser. */
function localBelief(): Plan {
  try {
    return localStorage.getItem(ONE_KEY_STORAGE) === '1' ? 'one' : 'free';
  } catch {
    return 'free';
  }
}

export function usePlan(): PlanState {
  const { isLoaded, isSignedIn } = useAuth();
  const [state, setState] = useState<PlanState>(() => ({
    plan: 'free',
    known: false,
    manageable: false,
  }));

  useEffect(() => {
    let live = true;
    const belief = localBelief();

    // Signed out and Clerk has said so: that is the whole answer.
    if (isLoaded && !isSignedIn) {
      setState({ plan: belief, known: true, manageable: false });
    } else if (belief === 'one') {
      setState((s) => (s.plan === 'one' ? s : { ...s, plan: 'one' }));
    }

    fetch('/api/logos/plan')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!live || !j) return;
        const plan: Plan = j.plan === 'one' ? 'one' : 'free';
        const student =
          j.student && typeof j.student === 'object'
            ? {
                on: !!j.student.on,
                domains: typeof j.student.domains === 'string' ? j.student.domains : '',
                email: typeof j.student.email === 'string' ? j.student.email : null,
              }
            : undefined;
        setState({ plan, known: true, manageable: !!j.manageable, ...(student ? { student } : {}) });
        try {
          if (plan === 'one') localStorage.setItem(ONE_KEY_STORAGE, '1');
        } catch {}
      })
      .catch(() => {
        // Unreachable. A signed-out visitor already has their answer above;
        // a signed-in one keeps waiting rather than risk pricing a member.
      });
    return () => {
      live = false;
    };
  }, [isLoaded, isSignedIn]);

  return state;
}
