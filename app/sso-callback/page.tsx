'use client';
// app/sso-callback/page.tsx
//
// Where Google sends somebody back to.
//
// Clerk's own components used to own this hop invisibly. Driving the flow
// ourselves means the return leg needs a landing strip, and this is it:
// <AuthenticateWithRedirectCallback> reads the parameters Clerk put in the
// URL, finishes the handshake, and navigates on — so the only thing this page
// renders is a line to look at for the half-second it takes.
//
// It has to be a real route rather than a query parameter on /sign-in,
// because `redirectUrl` is matched against Clerk's allowlist by path.
//
// NOTHING LINKS HERE ANY MORE, and it stays anyway. Google sign-in was taken
// off the form (components/auth/AuthForm.tsx) because the flow was not
// completing; anybody who was mid-redirect at the moment that shipped comes
// back to this path holding a valid handshake, and a 404 would strand them
// with a session they cannot land. It is also the landing strip any future
// provider would need, and it costs a page that renders one line.

import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';
import { AFTER_AUTH } from '@/lib/auth-flow';
import '../app-shell.css';

export default function SsoCallback() {
  return (
    <div className="app-root">
      <div className="plate-wrap">
        <div className="plate">
          <p className="lede">Signing you in…</p>
        </div>
      </div>
      <AuthenticateWithRedirectCallback
        signInFallbackRedirectUrl={AFTER_AUTH}
        signUpFallbackRedirectUrl="/onboarding"
      />
    </div>
  );
}
