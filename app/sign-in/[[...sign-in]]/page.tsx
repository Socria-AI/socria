// app/sign-in/[[...sign-in]]/page.tsx
import type { Metadata } from 'next';
import { AuthPlate } from '@/components/auth/AuthPlate';
import { AuthForm } from '@/components/auth/AuthForm';
import { isSafeRedirect } from '@/lib/auth-links';
import '../../app-shell.css';

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
    <AuthPlate
      kind="sign-in"
      redirectTo={back}
      eyebrow="Ask Socria"
      title="Pick up where your thinking"
      emphasis="left off."
      // The old subtitle spoke only to returning users on the page everyone
      // is sent to, including people with no account. This names both.
      lede="Sign in and the thread you started this morning is waiting tonight, on whatever you happen to be holding. New here? An account takes a moment and is free."
    >
      <AuthForm kind="sign-in" redirectTo={back} />
    </AuthPlate>
  );
}
