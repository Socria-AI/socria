'use client';
// components/site/OneJoin.tsx — "Become a member", the one action on /one.
//
// The design links every one of these back to the page itself — a
// prototype's placeholder. This product has a real checkout, so the cover's
// button and the join band's go through it: the route knows who is asking,
// refuses to sell One twice, and records which surface led to the payment.
// The masthead's takes you down to the join band, where the price is said
// beside the button.
//
// (The 2026 page has no join band: the price is in the headline, so the
// masthead's button goes through the checkout too.)
//
// THE BUTTON TELLS THE TRUTH ABOUT WHAT YOU HOLD. A member is shown the way
// in, not sold what they already have. (Socria One from a reward, a code or
// a student month is no longer given, so there is no third case to explain.)

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { usePlan } from '@/components/usePlan';
import { billingError, billingLine } from '@/lib/billing-message';
import { START } from './chrome';

export function OneJoin({ place }: { place: 'mast' | 'cover' }) {
  const plan = usePlan();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isOne = plan.known && plan.plan === 'one';

  const subscribe = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surface: 'one-page' }),
      });
      // Signed out is not a fault — take them to sign in and bring them back
      // to finish, rather than refusing with "sign in to subscribe".
      if (res.status === 401) {
        const back = window.location.pathname + window.location.search;
        window.location.href = '/sign-in?redirect_url=' + encodeURIComponent(back);
        return;
      }
      // They already hold it. The server will not sell it twice, and that is
      // not an error: open the thing they are paying for.
      if (res.status === 409) {
        window.location.href = START;
        return;
      }
      const json = await res.json().catch(() => null);
      if (res.ok && json?.url) {
        window.location.href = json.url;
        return;
      }
      setErr(billingLine(billingError(json)));
    } catch {
      setErr('Could not reach checkout. Try again.');
    }
    setBusy(false);
  }, [busy]);

  const size = place === 'mast' ? 's-pill is-deep' : 's-pill is-blue';

  if (isOne) {
    if (place === 'mast') {
      return (
        <Link className="s-pill is-deep" href={START}>
          Open Logos
        </Link>
      );
    }
    return (
      <div>
        <Link className={size} href={START}>
          Open Logos <span className="s-ar" aria-hidden="true">→</span>
        </Link>
        <p className="s-one-note">
          You hold Socria One. Manage or cancel it any time from <Link href="/account#plan">your account</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="s-join-btn">
      <button type="button" className={size} onClick={subscribe} disabled={busy}>
        {busy ? 'Opening checkout…' : 'Become a member'}
        {place !== 'mast' && (
          <span className="s-ar" aria-hidden="true">
            →
          </span>
        )}
      </button>
      {err && (
        <p className="s-pill-err" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
