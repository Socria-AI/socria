'use client';

// components/StudentAccess.tsx
//
// Add and verify a university email address, in Socria's own UI.
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
import { useUser } from '@clerk/nextjs';
import type { EmailAddressResource } from '@clerk/types';
import { emailMatchesHosts } from '@/lib/socria-edu';
import type { PlanState } from './usePlan';

/**
 * Clerk's reason, in Clerk's words.
 *
 * Deliberately not replaced with something friendlier. The failures here are
 * mostly configuration ("you cannot add email addresses to this account") or
 * plain fact ("that email address is taken"), and a person who is stuck needs
 * the actual reason far more than they need a soft one.
 */
function clerkMessage(err: unknown, fallback: string): string {
  const e = err as { errors?: Array<{ longMessage?: string; message?: string }> };
  const first = Array.isArray(e?.errors) ? e.errors[0] : null;
  return first?.longMessage || first?.message || fallback;
}

export function StudentAccess({ state }: { state: PlanState }) {
  const { isLoaded, user } = useUser();
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

  const send = useCallback(async () => {
    if (busy || !user) return;
    const address = email.trim().toLowerCase();
    if (!address) return;
    // Checked here so an address that cannot qualify never costs anybody an
    // email, and so the reason arrives instantly instead of after a round
    // trip and a code that would have been useless.
    if (hosts.length && !emailMatchesHosts(address, hosts)) {
      setErr(`Student access needs an address at ${student?.domains}.`);
      return;
    }
    setBusy('send');
    setErr(null);
    setNote(null);
    try {
      // Reuse the one already on the account when there is one; Clerk refuses
      // a duplicate, and this is the same address either way.
      const resource =
        unverified && unverified.emailAddress.toLowerCase() === address
          ? unverified
          : await user.createEmailAddress({ email: address });
      await resource.prepareVerification({ strategy: 'email_code' });
      setPending(resource);
      setNote(`Six-digit code sent to ${address}.`);
    } catch (e) {
      setErr(clerkMessage(e, 'Could not send the code. Try again.'));
    }
    setBusy(null);
  }, [busy, user, email, hosts, student, unverified]);

  const check = useCallback(async () => {
    if (busy || !pending) return;
    const entered = code.trim();
    if (!entered) return;
    setBusy('check');
    setErr(null);
    try {
      await pending.attemptVerification({ code: entered });
      // Clerk's local copy of the user still says unverified until it is
      // reloaded, and the server is the one that decides anyway — so reload,
      // then ask.
      await user?.reload();
      setPending(null);
      setCode('');
      setNote(null);
      state.refresh();
    } catch (e) {
      setErr(clerkMessage(e, 'That code was not accepted. Check it and try again.'));
    }
    setBusy(null);
  }, [busy, pending, code, user, state]);

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
        <p className="edu-eyebrow">Student access</p>
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
      <p className="edu-eyebrow">Student access</p>
      <h2 id="edu-title" className="edu-title">
        Socria <em>One</em>, free, with a university address
      </h2>
      <p className="edu-line">
        Verify an address at {student.domains} on this account and Socria One
        turns on. You keep the account and the sign-in you already have — the
        university address is added alongside it.
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
            Your university email
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
