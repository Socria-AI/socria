'use client';

// components/StudentAccess.tsx
//
// Add and verify a university email address, in Socria's own UI.
//
// The copy names the institution when the configured domains are all one
// place — "your UTA email", not "a university address" — and falls back to
// the general wording when they are not. See eduSchool() for why that
// fallback matters more than the naming does.
//
// WHY THIS EXISTS RATHER THAN LEANING ON CLERK'S PROFILE CARD. The account
// page already embeds <UserProfile>, which has an "add email address" flow of
// its own — and that flow is not always there. Whether it appears depends on
// how the Clerk instance is configured, so on a deployment where the button is
// missing the student programme is simply unreachable: the plan card offers
// access by verified address and the site provides no way to add one. Every
// piece it needs is a public client method, so this asks for the address
// itself and does not depend on somebody else's card rendering a button.
//
// It is also the better surface even where that button does exist. Clerk's
// flow is a general one — any address, no idea what it is for. This one knows
// what it is for: it says which domains qualify, refuses the ones that do not
// before sending anything, and when the code lands it says what was gained
// rather than "email added".
//
// WHAT IT WILL NOT DO. It cannot grant anything. Verification happens at
// Clerk, entitlement is decided on the server from `verification.status`, and
// this component's only power is to start that exchange and then ask the
// server what it thinks. A person who tampers with everything here still ends
// up with an unverified address, which is worth nothing.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useClerk, useUser } from '@clerk/nextjs';
import type { EmailAddressResource } from '@clerk/types';
import {
  ReverifyCancelled,
  clerkMessage,
  looksUnreachable,
  needsReverification,
  withReverification,
} from '@/lib/clerk-errors';
import { emailMatchesHosts } from '@/lib/socria-edu';
import { priceWithPeriod } from '@/lib/socria-one';
import type { PlanState } from './usePlan';

/** A day as the panel says it: "9 November". */
const day = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
/** The offer's close, on the campus clock — "9 December" wherever the reader is. */
const closeDay = (closes: number) =>
  new Date(closes - 1).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'America/Chicago' });

export function StudentAccess({ state }: { state: PlanState }) {
  const { isLoaded, user } = useUser();
  const clerk = useClerk();
  const student = state.student;

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  // The address being verified, once Clerk has created it. Holding the
  // resource rather than the string is what lets the code be attempted
  // against the right one.
  const [pending, setPending] = useState<EmailAddressResource | null>(null);
  const [busy, setBusy] = useState<null | 'send' | 'check'>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const hosts = useMemo(() => student?.hosts ?? [], [student]);
  // How to name the place. When the domains are all one institution the copy
  // says so — "your UTA email" rather than "a university address", which the
  // only people who can use this had to decode. When they are not, every
  // phrase below falls back to the general wording rather than guessing.
  const school = student?.school ?? null;

  // An address at a qualifying domain that is already on the account but has
  // not been verified — someone who started this and did not finish, or who
  // added it in Clerk's own card. Resuming beats asking them to add it twice,
  // which Clerk would refuse anyway.
  const unverified = useMemo(() => {
    if (!user || !hosts.length) return null;
    return (
      user.emailAddresses.find(
        (e) =>
          emailMatchesHosts(e.emailAddress, hosts) && e.verification?.status !== 'verified',
      ) ?? null
    );
  }, [user, hosts]);

  useEffect(() => {
    if (unverified && !pending) setEmail(unverified.emailAddress);
  }, [unverified, pending]);

  /**
   * Run an operation, and if Clerk asks the person to prove themselves first,
   * let them, then run it again.
   *
   * This mirrors what clerk-js does inside its own components — open the
   * verification modal with no level (Clerk decides what it needs from the
   * account: password, code, passkey, second factor), wait, retry once. Once,
   * not in a loop: if a freshly verified session is still refused, that is a
   * real refusal and the person should see it rather than watch a modal
   * reopen for ever.
   */
  const reverify = useCallback(
    <T,>(op: () => Promise<T>): Promise<T> => withReverification(clerk, op),
    [clerk],
  );

  /** What to say when something failed, including the two cases of our own. */
  const failure = useCallback((e: unknown, fallback: string): string => {
    if (e instanceof ReverifyCancelled) {
      return 'Confirming it was you was cancelled, so nothing was sent. Try again when you are ready.';
    }
    if (looksUnreachable(e)) {
      // The request never left the page. On a preview domain that is almost
      // always a production Clerk key, which is bound to the production
      // domain and refuses everything else.
      return 'Could not reach Clerk, so nothing was sent. On a preview or dev domain this is usually a production Clerk key, which only works on the production domain.';
    }
    if (needsReverification(e)) {
      // The modal was unavailable. A fresh sign-in satisfies the same
      // requirement, so say that rather than leaving them at a dead end.
      return `${clerkMessage(e, fallback)} Signing out and back in, then trying again, will also clear this.`;
    }
    return clerkMessage(e, fallback);
  }, []);

  const send = useCallback(async () => {
    if (busy || !user) return;
    const address = email.trim().toLowerCase();
    if (!address) return;
    // Checked here so an address that cannot qualify never costs anybody an
    // email, and so the reason arrives instantly instead of after a round
    // trip and a code that would have been useless.
    if (hosts.length && !emailMatchesHosts(address, hosts)) {
      setErr(
        school
          ? `Student access needs your ${school.short} email, at ${student?.domains}.`
          : `Student access needs an address at ${student?.domains}.`,
      );
      return;
    }
    setBusy('send');
    setErr(null);
    setNote(null);
    try {
      // Reuse the one already on the account when there is one; Clerk refuses
      // a duplicate, and this is the same address either way.
      const resource = await reverify(async () =>
        unverified && unverified.emailAddress.toLowerCase() === address
          ? unverified
          : user.createEmailAddress({ email: address }),
      );
      await reverify(() => resource.prepareVerification({ strategy: 'email_code' }));
      setPending(resource);
      setNote(`Six-digit code sent to ${address}.`);
    } catch (e) {
      setErr(failure(e, 'Could not send the code. Try again.'));
    }
    setBusy(null);
  }, [busy, user, email, hosts, student, unverified, reverify, failure]);

  const check = useCallback(async () => {
    if (busy || !pending) return;
    const entered = code.trim();
    if (!entered) return;
    setBusy('check');
    setErr(null);
    try {
      await reverify(() => pending.attemptVerification({ code: entered }));
      // Clerk's local copy of the user still says unverified until it is
      // reloaded, and the server is the one that decides anyway — so reload,
      // then ask.
      await user?.reload();
      setPending(null);
      setCode('');
      setNote(null);
      state.refresh();
    } catch (e) {
      setErr(failure(e, 'That code was not accepted. Check it and try again.'));
    }
    setBusy(null);
  }, [busy, pending, code, user, state, reverify, failure]);

  const start = useCallback(() => {
    setPending(null);
    setCode('');
    setErr(null);
    setNote(null);
  }, []);

  // The programme is not running here, or Clerk has not spoken yet.
  if (!student?.on || !isLoaded || !user) return null;

  const month = student.month;
  const offer = student.offer;
  const eyebrow = school ? `${school.short} student access` : 'Student access';

  // THE FIRST MONTH, said as what it is (lib/socria-edu.ts STUDENT_OFFER): free
  // until a date, no card taken, nothing that renews — and, once it is over,
  // over, with the plain way to keep Socria One. Which address qualified is
  // said too: an address is something they can check against their own inbox.
  if (student.email && month) {
    return (
      <section className="edu-panel is-done" aria-labelledby="edu-title">
        <p className="edu-eyebrow">{eyebrow}</p>
        <h2 id="edu-title" className="edu-title">
          Verified as <span className="edu-addr">{student.email}</span>
        </h2>
        {month.active ? (
          <p className="edu-line">
            Your first month of Socria One is free, until {day(month.until)}. No card was
            taken and nothing renews — after that this account is on the free plan, unless
            you choose to subscribe.
          </p>
        ) : (
          <p className="edu-line">
            Your free month of Socria One ended on {day(month.until)} — it was this
            account&rsquo;s one month. Socria One continues at {priceWithPeriod()}.{' '}
            <Link href="/one">Continue with Socria One →</Link>
          </p>
        )}
      </section>
    );
  }

  // Verified, but no month began: the offer had closed by the time they did.
  if (student.email) {
    return (
      <section className="edu-panel is-done" aria-labelledby="edu-title">
        <p className="edu-eyebrow">{eyebrow}</p>
        <h2 id="edu-title" className="edu-title">
          Verified as <span className="edu-addr">{student.email}</span>
        </h2>
        <p className="edu-line">
          {offer
            ? `This semester’s free month for students closed on ${closeDay(offer.closes)}.`
            : 'There is no free month for students running just now.'}{' '}
          <Link href="/one">See Socria One →</Link>
        </p>
      </section>
    );
  }

  // A month already used on this account, and the address since removed. Over:
  // say so, rather than offer a second. Still running: the form below picks it
  // back up — the month is the account's, and only needs the address again.
  const pickUp = !!month && month.until > Date.now();
  if (month && !pickUp) {
    return (
      <section className="edu-panel is-done" aria-labelledby="edu-title">
        <p className="edu-eyebrow">{eyebrow}</p>
        <h2 id="edu-title" className="edu-title">Your free month</h2>
        <p className="edu-line">
          Your free month of Socria One ended on {day(month.until)} — it was this
          account&rsquo;s one month. <Link href="/one">Continue with Socria One →</Link>
        </p>
      </section>
    );
  }

  // Nothing to offer once the offer has closed.
  if (!pickUp && offer && !offer.open) return null;

  return (
    <section className="edu-panel" aria-labelledby="edu-title">
      <p className="edu-eyebrow">{eyebrow}</p>
      {pickUp && month ? (
        <>
          <h2 id="edu-title" className="edu-title">Pick your free month back up</h2>
          <p className="edu-line">
            Your free month of Socria One runs until {day(month.until)} while your{' '}
            {school ? school.short : 'university'} email ({student.domains}) is verified on
            this account. Verify it again to carry on.
          </p>
        </>
      ) : (
        <>
          <h2 id="edu-title" className="edu-title">
            Your first month of Socria <em>One</em>, free, for{' '}
            {school ? `${school.name} students` : 'students'}
          </h2>
          <p className="edu-line">
            Verify your {school ? school.short : 'university'} email ({student.domains})
            on this account{offer ? ` by ${closeDay(offer.closes)}` : ''} and your first{' '}
            {offer ? `${offer.days} days` : 'month'} of Socria One are free — no card, and
            nothing renews. You keep the account and the sign-in you already have — the{' '}
            {school ? school.short : 'university'} address is added alongside it.
          </p>
        </>
      )}

      {err && (
        <p className="edu-err" role="alert">
          {err}
        </p>
      )}
      {note && !err && (
        <p className="edu-note" role="status">
          {note}
        </p>
      )}

      {pending ? (
        <div className="edu-form">
          <label className="edu-label" htmlFor="edu-code">
            The code from that email
          </label>
          <input
            id="edu-code"
            className="edu-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') check();
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            disabled={busy === 'check'}
          />
          <div className="edu-actions">
            <button
              type="button"
              className="edu-go"
              onClick={check}
              disabled={!!busy || !code.trim()}
            >
              {busy === 'check' ? 'Checking…' : 'Verify'}
            </button>
            <button type="button" className="edu-not" onClick={start} disabled={!!busy}>
              Use a different address
            </button>
          </div>
        </div>
      ) : (
        <div className="edu-form">
          <label className="edu-label" htmlFor="edu-email">
            Your {school ? school.short : 'university'} email
          </label>
          <input
            id="edu-email"
            className="edu-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send();
            }}
            type="email"
            autoComplete="email"
            spellCheck={false}
            // From the host list, not the prose label: with two domains that
            // label reads "@a.edu or @b.edu", and slicing prose gave a
            // placeholder of "you@a.edu or @b.edu".
            placeholder={hosts.length ? `you@${hosts[0]}` : 'you@university.edu'}
            disabled={busy === 'send'}
          />
          <div className="edu-actions">
            <button
              type="button"
              className="edu-go"
              onClick={send}
              disabled={!!busy || !email.trim()}
            >
              {busy === 'send' ? 'Sending…' : unverified ? 'Send the code again' : 'Send me a code'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default StudentAccess;
