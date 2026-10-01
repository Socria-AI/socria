'use client';
// components/auth/AuthForm.tsx
//
// Socria's own sign-in and sign-up, on Clerk's headless hooks.
//
// WHY NOT CLERK'S COMPONENTS. <SignIn> is a good component that is not this
// product's component. It arrives as an iframe-adjacent island with its own
// type, its own spacing, its own copy and its own idea of the order to ask
// things in, and the only way to change any of that is a list of class-name
// overrides in app/layout.tsx that has to be kept in step with Clerk's
// internal element names. The page around it says "Pick up where your
// thinking left off" in Instrument Serif at 3rem, and then there is a card.
//
// WHAT IS UNCHANGED. Clerk still does the authentication — every credential,
// every code, every session goes through the same API the component used.
// This is the form, not the auth. Nothing here stores a password, and the
// only thing it holds in state is what somebody is currently typing.
//
// WHAT THIS MUST NOT BREAK. The university flow (components/account/
// StudentAccess.tsx) adds and verifies a second email address on an existing
// signed-in user through user.createEmailAddress + prepareVerification, with
// reverification when Clerk asks. It does not touch sign-in at all, so
// replacing this form leaves it alone — but the shared pieces it relies on,
// lib/clerk-errors.ts above all, are used here too rather than reimplemented,
// so the two screens cannot start disagreeing about what a Clerk refusal says.
//
// The branching lives in lib/auth-flow.ts, tested without a browser. This
// file is the rendering and the calls.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSignIn, useSignUp } from '@clerk/nextjs';
import { Button } from '@/components/journal/ds';
import { clerkMessage } from '@/lib/clerk-errors';
import {
  AFTER_AUTH,
  chooseFactor,
  chooseSecondFactor,
  cleanCode,
  cleanEmail,
  resendIn,
  signInStep,
  signUpStep,
  type AuthStep,
  type ChosenFactor,
} from '@/lib/auth-flow';
import type { AuthKind } from '@/lib/auth-links';

export function AuthForm({
  kind,
  redirectTo,
}: {
  kind: AuthKind;
  /** already validated by isSafeRedirect at the page */
  redirectTo?: string;
}) {
  const router = useRouter();
  const { isLoaded: inLoaded, signIn, setActive: setInActive } = useSignIn();
  const { isLoaded: upLoaded, signUp, setActive: setUpActive } = useSignUp();
  // The RESOURCE, not just the flag. `isLoaded` says clerk-js has booted; it
  // does not promise the sign-in resource exists, and a form that trusted it
  // reached `signIn.create` on null and put "Cannot read properties of null"
  // on the screen. Nothing is pressable until there is something to press it
  // against.
  const ready = kind === 'sign-in' ? inLoaded && !!signIn : upLoaded && !!signUp;

  const [step, setStep] = useState<AuthStep>('identify');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** which first factor sign-in settled on; null until we have asked */
  const [factor, setFactor] = useState<ChosenFactor | null>(null);
  /** which second factor Clerk offered, once the first one has passed */
  const [second, setSecond] = useState<'totp' | 'backup_code' | 'phone_code' | null>(null);
  /** when the current code was sent, for the resend hold */
  const [sentAt, setSentAt] = useState(0);
  const [hold, setHold] = useState(0);

  const box = useRef<HTMLInputElement>(null);

  // A new step means a new box, and the cursor belongs in it. Without this,
  // somebody who has just been told to check their email has to find the
  // field with a mouse after typing their address with a keyboard.
  useEffect(() => {
    box.current?.focus();
  }, [step]);

  // The resend hold, ticked here rather than stored, so it survives a
  // re-render and never has to be cleared on success.
  useEffect(() => {
    if (!sentAt) return;
    const tick = () => setHold(resendIn(sentAt, Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [sentAt]);

  const land = useCallback(
    (sessionId: string | null | undefined, made: boolean) => {
      const to = redirectTo ?? (made ? '/onboarding' : AFTER_AUTH);
      const activate = kind === 'sign-in' ? setInActive : setUpActive;
      if (!sessionId || !activate) {
        // Clerk said complete but handed back no session. Rather than sit on
        // a dead form, send them to where they were going — whatever state
        // the session is in, the next page's own auth check is the honest
        // arbiter of it.
        router.push(to);
        return;
      }
      void activate({ session: sessionId }).then(() => router.push(to));
    },
    [kind, redirectTo, router, setInActive, setUpActive]
  );

  const fail = (e: unknown, fallback: string) => {
    setErr(clerkMessage(e, fallback));
    setBusy(false);
  };

  // ── GOOGLE IS NOT OFFERED HERE ────────────────────────────────────
  //
  // The button and its handler are gone: the flow was not completing, and a
  // sign-in button that does not sign anyone in is worse than one fewer way
  // in — it is the first thing somebody presses and the last thing they try.
  // Email is the whole of it now, and it was always the path most people
  // took anyway.
  //
  // WHAT IS DELIBERATELY LEFT STANDING. /sso-callback stays a real route, so
  // anybody who was mid-redirect when this shipped still lands and finishes
  // rather than meeting a 404 holding a valid session. An account that was
  // CREATED with Google still signs in by email code, because Clerk holds the
  // verified address — and the one case where it cannot is answered below,
  // with something a person can actually act on.
  //
  // Bringing it back is this block, the button, and taking `oauth_google` out
  // of WITHHELD_OAUTH in lib/auth-flow.ts, which is what also keeps it out of
  // the account page's "connect an account" row.

  // ── the email step ────────────────────────────────────────────────
  // NOTE ON HOW THESE ARE FIRED. The design system's <Button> renders
  // `type="button"` — correct for a component that is used far more often
  // outside forms than in one, and the reason the first version of this page
  // had a Continue that did nothing at all. So each handler is wired twice:
  // to the form's onSubmit, which is what Enter in the field triggers, and to
  // the Button's onClick, which is the press. The event is optional because
  // only one of those two paths has one.
  async function identify(e?: React.FormEvent) {
    e?.preventDefault();
    if (!ready || busy) return;
    const addr = cleanEmail(email);
    if (!addr) {
      setErr('That does not look like an email address.');
      return;
    }
    setBusy(true);
    setErr(null);

    try {
      if (kind === 'sign-in') {
        const res = await signIn!.create({ identifier: addr });
        const chosen = chooseFactor(res.supportedFirstFactors as never);
        setFactor(chosen);
        if (!chosen) {
          // No password and no mailable address: an account made with Google,
          // back when that was offered. There is no button to point at any
          // more, so this must point at a person instead — telling somebody
          // their account signs in with a method the page no longer has is
          // the exact shape of being stranded.
          setErr(
            'This account was made with Google sign-in, which Socria no longer ' +
              'offers. Email hellosocria@gmail.com and we will move it to email sign-in.'
          );
          setBusy(false);
          return;
        }
        const next = signInStep(res.status, chosen);
        if (next === 'code') {
          await signIn!.prepareFirstFactor({
            strategy: 'email_code',
            emailAddressId: chosen.emailAddressId!,
          });
          setSentAt(Date.now());
        }
        if (next === 'done') {
          land(res.createdSessionId, false);
          return;
        }
        setStep(next);
      } else {
        const res = await signUp!.create({ emailAddress: addr });
        const next = signUpStep(res.status, res.missingFields, res.unverifiedFields);
        if (next === 'code') {
          await signUp!.prepareEmailAddressVerification({ strategy: 'email_code' });
          setSentAt(Date.now());
        }
        if (next === 'done') {
          land(res.createdSessionId, true);
          return;
        }
        setStep(next);
      }
      setBusy(false);
    } catch (e) {
      fail(
        e,
        kind === 'sign-in'
          ? 'Could not start sign-in. Try again.'
          : 'Could not create the account. Try again.'
      );
    }
  }

  // ── the password step ─────────────────────────────────────────────
  async function submitPassword(e?: React.FormEvent) {
    e?.preventDefault();
    if (!ready || busy) return;
    if (!password) {
      setErr('Enter your password.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      if (kind === 'sign-in') {
        const res = await signIn!.attemptFirstFactor({ strategy: 'password', password });
        if (res.status === 'complete') {
          land(res.createdSessionId, false);
          return;
        }
        const next = signInStep(res.status, factor);
        if (next === 'second-factor') {
          const how = chooseSecondFactor(
            (res as { supportedSecondFactors?: unknown }).supportedSecondFactors as never
          );
          setSecond(how);
          if (how === 'phone_code') {
            await signIn!.prepareSecondFactor({ strategy: 'phone_code' });
            setSentAt(Date.now());
          }
          setCode('');
        }
        setStep(next);
      } else {
        const res = await signUp!.update({ password });
        const next = signUpStep(res.status, res.missingFields, res.unverifiedFields);
        if (next === 'code') {
          await signUp!.prepareEmailAddressVerification({ strategy: 'email_code' });
          setSentAt(Date.now());
        }
        if (next === 'done') {
          land(res.createdSessionId, true);
          return;
        }
        setStep(next);
      }
      setBusy(false);
    } catch (e) {
      fail(e, 'That did not work. Check it and try again.');
    }
  }

  // ── the code step ─────────────────────────────────────────────────
  async function submitCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (!ready || busy) return;
    const c = cleanCode(code);
    if (!c) {
      setErr('The code is the six digits in the email.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      if (kind === 'sign-in') {
        const res = await signIn!.attemptFirstFactor({ strategy: 'email_code', code: c });
        if (res.status === 'complete') {
          land(res.createdSessionId, false);
          return;
        }
        // The code may have been RIGHT and the account simply have a second
        // factor. Reporting that as a bad code is how 2FA users were locked
        // out entirely — see signInStep.
        const next = signInStep(res.status, factor);
        if (next === 'second-factor') {
          const how = chooseSecondFactor(
            (res as { supportedSecondFactors?: unknown }).supportedSecondFactors as never
          );
          setSecond(how);
          if (how === 'phone_code') {
            await signIn!.prepareSecondFactor({ strategy: 'phone_code' });
            setSentAt(Date.now());
          }
          setCode('');
          setStep('second-factor');
          setBusy(false);
          return;
        }
        if (next === 'new-password') {
          setErr(
            'This account needs a new password before it can be used. Use "Forgot password" on the sign-in page to set one.'
          );
          setBusy(false);
          return;
        }
        setErr('That code was not accepted. Check it, or send a new one.');
      } else {
        const res = await signUp!.attemptEmailAddressVerification({ code: c });
        if (res.status === 'complete') {
          land(res.createdSessionId, true);
          return;
        }
        setErr('That code was not accepted. Check it, or send a new one.');
      }
      setBusy(false);
    } catch (e) {
      fail(e, 'That code was not accepted.');
    }
  }

  // ── the second factor ─────────────────────────────────────────────
  async function submitSecond(e?: React.FormEvent) {
    e?.preventDefault();
    if (!ready || busy) return;
    const c = cleanCode(code);
    if (!c) {
      setErr(
        second === 'backup_code'
          ? 'A backup code, exactly as it was given to you.'
          : 'The six digits from your authenticator app.'
      );
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await signIn!.attemptSecondFactor({
        strategy: (second ?? 'totp') as 'totp',
        code: c,
      });
      if (res.status === 'complete') {
        land(res.createdSessionId, false);
        return;
      }
      setErr('That code was not accepted.');
      setBusy(false);
    } catch (e) {
      fail(e, 'That code was not accepted.');
    }
  }

  async function resend() {
    if (!ready || busy || hold > 0) return;
    setBusy(true);
    setErr(null);
    try {
      if (kind === 'sign-in') {
        await signIn!.prepareFirstFactor({
          strategy: 'email_code',
          emailAddressId: factor!.emailAddressId!,
        });
      } else {
        await signUp!.prepareEmailAddressVerification({ strategy: 'email_code' });
      }
      setSentAt(Date.now());
      setCode('');
    } catch (e) {
      fail(e, 'Could not send another code.');
      return;
    }
    setBusy(false);
  }

  // Going back has to clear the code as well as the step: a stale code in a
  // box that now belongs to a different address is a failure nobody can read.
  function back() {
    setStep('identify');
    setCode('');
    setPassword('');
    setErr(null);
    setSentAt(0);
    setSecond(null);
  }

  const cta = kind === 'sign-in' ? 'Continue' : 'Create my account';

  return (
    <div className="stack">
      {step === 'identify' && (
        <>
          <form className="stack" onSubmit={identify}>
            <div className="field">
              <label htmlFor="auth-email">Your email</label>
              <input
                ref={box}
                id="auth-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
              />
            </div>
            <Button variant="primary" size="lg" arrow disabled={!ready || busy} onClick={() => void identify()}>
              {busy ? 'One moment…' : cta}
            </Button>
          </form>
        </>
      )}

      {step === 'password' && (
        <form className="stack" onSubmit={submitPassword}>
          <div className="field">
            <label htmlFor="auth-password">
              {kind === 'sign-in' ? 'Your password' : 'Choose a password'}
            </label>
            <input
              ref={box}
              id="auth-password"
              type="password"
              autoComplete={kind === 'sign-in' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
            />
          </div>
          <Button variant="primary" size="lg" arrow disabled={!ready || busy} onClick={() => void submitPassword()}>
            {busy ? 'One moment…' : cta}
          </Button>
          <p className="opt-note">
            {email} — <button type="button" onClick={back}>use a different address</button>
          </p>
        </form>
      )}

      {step === 'code' && (
        <form className="stack" onSubmit={submitCode}>
          <div className="field">
            <label htmlFor="auth-code">The code we emailed you</label>
            <input
              ref={box}
              id="auth-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              value={code}
              onChange={(ev) => setCode(ev.target.value)}
            />
          </div>
          <Button variant="primary" size="lg" arrow disabled={!ready || busy} onClick={() => void submitCode()}>
            {busy ? 'One moment…' : 'Continue'}
          </Button>
          <p className="opt-note">
            Sent to {email}.{' '}
            {hold > 0 ? (
              <span>Another can be sent in {hold}s.</span>
            ) : (
              <button type="button" onClick={resend}>
                Send it again
              </button>
            )}{' '}
            <button type="button" onClick={back}>
              Use a different address
            </button>
          </p>
        </form>
      )}

      {step === 'second-factor' && (
        <form className="stack" onSubmit={submitSecond}>
          <div className="field">
            <label htmlFor="auth-2fa">
              {second === 'backup_code'
                ? 'One of your backup codes'
                : second === 'phone_code'
                  ? 'The code we texted you'
                  : 'Your authenticator code'}
            </label>
            <input
              ref={box}
              id="auth-2fa"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              value={code}
              onChange={(ev) => setCode(ev.target.value)}
            />
          </div>
          <Button variant="primary" size="lg" arrow disabled={!ready || busy} onClick={() => void submitSecond()}>
            {busy ? 'One moment…' : 'Continue'}
          </Button>
          <p className="opt-note">
            {second === 'totp'
              ? 'From the app you set up when you turned on two-factor.'
              : second === 'backup_code'
                ? 'The one-time codes you saved when you turned on two-factor.'
                : `Sent to the number on your account.`}{' '}
            <button type="button" onClick={back}>
              Start again
            </button>
          </p>
        </form>
      )}

      {step === 'new-password' && (
        <p className="auth-err" role="alert">
          This account needs a new password before it can be used.{' '}
          <button type="button" onClick={back}>
            Start again
          </button>
        </p>
      )}

      {/* Clerk's reason, in Clerk's words — see lib/clerk-errors.ts for why
          it is not softened. Somebody stuck needs the actual reason far more
          than they need a friendly one. */}
      {err && (
        <p className="auth-err" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}
