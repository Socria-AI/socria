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
import { useClerk, useUser } from '@clerk/nextjs';
import type { EmailAddressResource } from '@clerk/types';
import { clerkMessage, looksUnreachable, needsReverification } from '@/lib/clerk-errors';
import { emailMatchesHosts } from '@/lib/socria-edu';
import type { PlanState } from './usePlan';

/** The person closed the reverification modal rather than completing it. */
class ReverifyCancelled extends Error {}

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
  const withReverification = useCallback(
    async <T,>(op: () => Promise<T>): Promise<T> => {
      try {
        return await op();
      } catch (e) {
        if (!needsReverification(e)) throw e;
        const open = (
          clerk as unknown as {
            __experimental_openUserVerification?: (p: {
              afterVerification?: () => void;
              afterVerificationCancelled?: () => void;
            }) => void;
          }
        ).__experimental_openUserVerification;
        // Still flagged experimental in the SDK, and absent from older
        // clerk-js builds. Where it is missing the original refusal is the
        // honest thing to show — with the way out named, below.
        if (typeof open !== 'function') throw e;
        await new Promise<void>((resolve, reject) => {
          open({
            afterVerification: () => resolve(),
            afterVerificationCancelled: () =>
              reject(new ReverifyCancelled('verification cancelled')),
          });
        });
        return await op();
      }
    },
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
      const resource = await withReverification(async () =>
        unverified && unverified.emailAddress.toLowerCase() === address
          ? unverified
          : user.createEmailAddress({ email: address }),
      );
      await withReverification(() => resource.prepareVerification({ strategy: 'email_code' }));
      setPending(resource);
      setNote(`Six-digit code sent to ${address}.`);
    } catch (e) {
      setErr(failure(e, 'Could not send the code. Try again.'));
    }
    setBusy(null);
  }, [busy, user, email, hosts, student, unverified, withReverification, failure]);

  const check = useCallback(async () => {
    if (busy || !pending) return;
    const entered = code.trim();
    if (!entered) return;
    setBusy('check');
    setErr(null);
    try {
      await withReverification(() => pending.attemptVerification({ code: entered }));
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
  }, [busy, pending, code, user, state, withReverification, failure]);

  const start = useCallback(() => {
    setPending(null);
    setCode('');
    setErr(null);
    setNote(null);
  }, []);

  // The programme is not running here, or Clerk has not spoken yet.
  if (!student?.on || !isLoaded || !user) return null;

  // Already qualified. Say which address did it — "you have student access" is
  // something they have to take on trust, and an address is something they can
  // check against their own inbox.
  if (student.email) {
    return (
      <section className="edu-panel is-done" aria-labelledby="edu-title">
        <p className="edu-eyebrow">
          {school ? `${school.short} student access` : 'Student access'}
        </p>
        <h2 id="edu-title" className="edu-title">
          Verified as <span className="edu-addr">{student.email}</span>
        </h2>
        <p className="edu-line">
          Socria One is on this account, free, for as long as that address stays
          verified on it.
        </p>
      </section>
    );
  }

  return (
    <section className="edu-panel" aria-labelledby="edu-title">
      <p className="edu-eyebrow">
        {school ? `${school.short} student access` : 'Student access'}
      </p>
      <h2 id="edu-title" className="edu-title">
        Socria <em>One</em>, free, for{' '}
        {school ? `${school.name} students` : 'students'}
      </h2>
      <p className="edu-line">
        Verify your {school ? school.short : 'university'} email ({student.domains})
        on this account and Socria One turns on. You keep the account and the
        sign-in you already have — the {school ? school.short : 'university'}{' '}
        address is added alongside it.
      </p>

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
