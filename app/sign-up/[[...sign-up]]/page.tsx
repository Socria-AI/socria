// app/sign-up/[[...sign-up]]/page.tsx
import type { Metadata } from 'next';
import { SignUp } from '@clerk/nextjs';
import { AuthShell } from '@/components/AuthShell';
import { authUrl, isSafeRedirect } from '@/lib/auth-links';

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
    <AuthShell
      kind="sign-up"
      redirectTo={back}
      eyebrow="Create your account"
      title="Think with Socria across every device."
      subtitle="Free account. Socria Core 3 with adjustable thinking depth, and two full lines of thinking in Logos every month."
      quote={{
        text: 'AI should multiply human thinking, not automate it.',
      }}
    >
      <SignUp
        routing="path"
        path="/sign-up"
        signInUrl={authUrl('sign-in', back)}
        fallbackRedirectUrl={back ?? '/chat'}
        signInFallbackRedirectUrl={back ?? '/chat'}
      />
    </AuthShell>
  );
}
