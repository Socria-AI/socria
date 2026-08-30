// app/sign-up/[[...sign-up]]/page.tsx
import type { Metadata } from 'next';
import { SignUp } from '@clerk/nextjs';
import { AuthShell } from '@/components/AuthShell';

export const metadata: Metadata = {
  title: 'Create your account — Socria',
  description:
    'Create a free Socria account to save your thought sessions and unlock Core 3.',
};

export default function SignUpPage() {
  return (
    <AuthShell
      eyebrow="Create your account"
      title="Think with Socria across every device."
      subtitle="Free account. Unlimited thought sessions. Access to Socria Core 3 with adjustable thinking depth."
      quote={{
        text: 'AI should multiply human thinking, not automate it.',
      }}
    >
      <SignUp
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        fallbackRedirectUrl="/chat"
      />
    </AuthShell>
  );
}
