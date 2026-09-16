// app/sign-up/[[...sign-up]]/page.tsx
import type { Metadata } from 'next';
import { AuthPlate } from '@/components/auth/AuthPlate';
import { AuthForm } from '@/components/auth/AuthForm';
import { isSafeRedirect } from '@/lib/auth-links';
import '../../app-shell.css';

export const metadata: Metadata = {
  title: 'Create your account — Socria',
  description:
    'Create a free Socria account to save your thought sessions and unlock Core 3.',
};

export default function SignUpPage({
  searchParams,
}: {
  searchParams?: { redirect_url?: string };
}) {
  const back = isSafeRedirect(searchParams?.redirect_url)
    ? searchParams!.redirect_url!
    : undefined;
  return (
    <AuthPlate
      kind="sign-up"
      redirectTo={back}
      eyebrow="Create your account"
      title="Think with Socria across"
      emphasis="every device."
      lede="Free account. Socria Core 3.1 with adjustable thinking depth, and Logos — the map of your own reasoning — drawn beside the conversation."
    >
      {/* A NEW account lands on the beginning, not in an empty composer.
          Someone who came here from a specific page still goes back to it —
          an interrupted errand is not a first run. AuthForm makes that call;
          see `land()` there. */}
      <AuthForm kind="sign-up" redirectTo={back} />
    </AuthPlate>
  );
}
