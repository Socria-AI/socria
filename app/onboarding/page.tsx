// app/onboarding/page.tsx — where a new account begins.
//
// A server shell over a client sequence, like every other page here. The
// sequence itself calls no model: it is two beats of paper — the premise,
// and the person's own thought — and the only thing it leaves behind is the
// sentence they wrote, handed to the surface they are going to.
import type { Metadata } from 'next';
import { Suspense } from 'react';
import './onboarding.css';
import { Onboarding } from '@/components/onboarding/Onboarding';

export const metadata: Metadata = {
  title: 'Beginning — Socria',
  description: 'Most AI gives you an answer. Socria helps you build the thinking behind one.',
  // Not a landing page — every visit is somebody mid-signup.
  robots: { index: false, follow: false },
};

export default function OnboardingPage() {
  return (
    // useSearchParams needs a boundary to prerender under.
    <Suspense fallback={null}>
      <Onboarding />
    </Suspense>
  );
}
