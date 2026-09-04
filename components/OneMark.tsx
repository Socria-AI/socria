'use client';

// components/OneMark.tsx
//
// Socria One, mentioned in passing.
//
// The prompt sheet (OnePrompt) is the /one cover at the scale of an
// interruption. This is the same cover at the scale of a piece of chrome: a
// plate in the same Prussian blue, the italic monogram in its ring, the
// serif name, the price with its tracked period. It sits still. It never
// animates in, never counts down, never changes what it says from one visit
// to the next — which is the whole difference between something people stop
// noticing and something people start resenting.
//
// Three sizes, one voice:
//
//   foot   the sidebar's last item: monogram, name, what it opens, price.
//          The subtitle says what you get rather than what it is like —
//          "the whole instrument" was a line, and a line in a sidebar row is
//          a line nobody asked for.
//   strip  the line under the model menu: "Logos in full is Socria One".
//   card   the account page's plan block, with the action on it.
//
// A member sees the mark turn into a statement of what they hold, never a
// price. The parent decides whether to render at all; this only decides how.

import { useCallback, useState } from 'react';
import { priceLabel, SOCRIA_ONE } from '@/lib/socria-one';
import { billingError, billingLine } from '@/lib/billing-message';
import type { PlanState } from './usePlan';

function Monogram() {
  return (
    <span className="one-mark-mono" aria-hidden="true">
      <span>I</span>
    </span>
  );
}

function Price() {
  return (
    <span className="one-mark-price">
      <span className="one-mark-amt">{priceLabel()}</span>
      <span className="one-mark-per">/ {SOCRIA_ONE.period}</span>
    </span>
  );
}

/** The sidebar foot. A link, not a button: it goes to the page, quietly. */
export function OneFoot({ state }: { state: PlanState }) {
  if (state.plan === 'one') {
    return (
      <a className="one-mark is-foot is-member" href="/account#plan">
        <Monogram />
        <span className="one-mark-text">
          <span className="one-mark-name">
            Socria <em>One</em>
          </span>
          <span className="one-mark-sub">member</span>
        </span>
      </a>
    );
  }
  return (
    <a className="one-mark is-foot" href="/one">
      <Monogram />
      <span className="one-mark-text">
        <span className="one-mark-name">
          Socria <em>One</em>
        </span>
        <span className="one-mark-sub">Unlimited maps, research and depth</span>
      </span>
      <Price />
    </a>
  );
}

/** The line under the model menu. Only ever shown to someone without One. */
export function OneStrip() {
  return (
    <a className="one-mark is-strip" href="/one">
      <Monogram />
      <span className="one-mark-text">
        <span className="one-mark-name">
          Logos in full is Socria <em>One</em>
        </span>
      </span>
      <Price />
    </a>
  );
}

/**
 * The account page's plan block.
 *
 * Checkout is started here rather than sent to /one, because someone on
 * their account page asking "what am I on?" has already found the answer and
 * the next question is "and how do I change it" — one press, not a page.
 * The link to /one stays for the ledger of what One opens.
 */
export function OneCard({ state }: { state: PlanState }) {
  const [busy, setBusy] = useState<null | 'checkout' | 'portal'>(null);
  const [err, setErr] = useState<string | null>(null);

  const subscribe = useCallback(async () => {
    if (busy) return;
    setBusy('checkout');
    setErr(null);
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.url) {
        window.location.href = json.url;
        return;
      }
      setErr(billingLine(billingError(json)));
    } catch {
      setErr('Could not reach checkout. Try again.');
    }
    setBusy(null);
  }, [busy]);

  const manage = useCallback(async () => {
    if (busy) return;
    setBusy('portal');
    setErr(null);
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.url) {
        window.location.href = json.url;
        return;
      }
      setErr(billingLine(billingError(json, 'Could not open billing. Try again.')));
    } catch {
      setErr('Could not open billing. Try again.');
    }
    setBusy(null);
  }, [busy]);

  const member = state.plan === 'one';
  const student = state.student;
  // Access that came from a verified university address rather than a card.
  const byStudy = member && !!student?.email;

  return (
    <section className={`one-mark is-card${member ? ' is-member' : ''}`} id="plan" aria-labelledby="one-card-title">
      <p className="one-mark-eyebrow">{member ? 'Your plan' : 'The complete reasoning environment'}</p>
      <Monogram />
      <h2 id="one-card-title" className="one-mark-title">
        Socria <em>One</em>
      </h2>
      {member ? (
        <p className="one-mark-line">
          {byStudy
            ? 'Student access. Everything Socria does, without the ceiling, free while that address stays verified.'
            : state.manageable
              ? 'You are a member. Everything Socria does, without the ceiling.'
              : 'You hold a complimentary membership. Everything Socria does, without the ceiling.'}
        </p>
      ) : (
        <>
          <Price />
          <p className="one-mark-line">
            Full Thinking Maps, all four depth modes, Research as often as it is needed, Draft
            Space, and your reasoning kept.
          </p>
        </>
      )}

      {err && (
        <p className="one-mark-err" role="alert">
          {err}
        </p>
      )}

      <div className="one-mark-actions">
        {member ? (
          <>
            <a className="one-mark-go" href="/chat?model=logos">
              Open Logos <span aria-hidden="true">→</span>
            </a>
            {state.manageable && (
              <button type="button" className="one-mark-not" onClick={manage} disabled={!!busy}>
                {busy === 'portal' ? 'Opening billing…' : 'Manage billing'}
              </button>
            )}
          </>
        ) : (
          <>
            <button type="button" className="one-mark-go" onClick={subscribe} disabled={!!busy}>
              {busy === 'checkout' ? 'Opening checkout…' : 'Become a member'}
              {!busy && <span aria-hidden="true">→</span>}
            </button>
            <a className="one-mark-not" href="/one">
              everything One opens
            </a>
          </>
        )}
      </div>
      {/* Say WHICH address qualified. "You have student access" is something
          they have to take on trust; naming the address is a fact they can
          check, and it is also the thing to look at when it stops working. */}
      {byStudy && (
        <p className="one-mark-foot">Verified as {student!.email}.</p>
      )}

      {/* The offer, to somebody who has not taken it up. Shown only where the
          programme actually runs — a deployment that has not switched it on
          says nothing about it. */}
      {!member && student?.on && (
        <p className="one-mark-foot">
          Studying somewhere with a {student.domains} address? Add and verify it in
          your account and Socria One is free.
        </p>
      )}

      {!member && !student?.on && (
        <p className="one-mark-foot">Cancel anytime. Your maps stay yours.</p>
      )}
    </section>
  );
}
