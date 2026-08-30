// app/sign-in/[[...sign-in]]/page.tsx
import type { Metadata } from 'next';
import { SignIn } from '@clerk/nextjs';
import { AuthShell } from '@/components/AuthShell';

export const metadata: Metadata = {
  title: 'Sign in — Socria',
  description:
    'Sign in to Socria to keep your thought sessions across every device.',
};

export default function SignInPage() {
  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Continue your thinking."
      subtitle="Sign in to pick up where you left off. Your saved sessions are synced across every device."
      quote={{
        text: "The goal isn't to think less. The goal is to think better.",
        source: 'From the Socria manifesto',
      }}
    >
      <SignIn
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/chat"
      />
    </AuthShell>
  );
}
