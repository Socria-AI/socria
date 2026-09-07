// app/sign-in/[[...sign-in]]/page.tsx
import type { Metadata } from 'next';
import { SignIn } from '@clerk/nextjs';
import { AuthShell } from '@/components/AuthShell';
import { authUrl, isSafeRedirect } from '@/lib/auth-links';

export const metadata: Metadata = {
  title: 'Sign in — Socria',
  description:
    'Sign in to Socria to keep your thought sessions across every device.',
};

export default function SignInPage({
  searchParams,
}: {
  searchParams?: { redirect_url?: string };
}) {
  // Where they were going before they hit the wall, if it is a place on this
  // site. Carried onward so crossing to sign-up does not lose it.
  const back = isSafeRedirect(searchParams?.redirect_url)
    ? searchParams!.redirect_url!
    : undefined;
  return (
    <AuthShell
      kind="sign-in"
      redirectTo={back}
      eyebrow="Welcome back"
      title="Continue your thinking."
      // The old subtitle spoke only to returning users — "pick up where you
      // left off" — on the page everyone was sent to, including people with
      // no account. Now it names both.
      subtitle="Sign in to pick up where you left off, synced across every device. New here? Creating an account takes a moment and is free."
      quote={{
        text: "The goal isn't to think less. The goal is to think better.",
        source: 'From the Socria manifesto',
      }}
    >
      <SignIn
        routing="path"
        path="/sign-in"
        signUpUrl={authUrl('sign-up', back)}
        fallbackRedirectUrl={back ?? '/chat'}
        signUpFallbackRedirectUrl={back ?? '/chat'}
      />
    </AuthShell>
  );
}
