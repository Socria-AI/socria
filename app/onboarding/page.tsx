// app/onboarding/page.tsx — where a new account begins.
//
// A server shell over a client sequence, like every other page here. The
// sequence itself calls no model and reads no account: it is four beats of
// paper, and the only thing it leaves behind is the sentence the person
// wrote, handed to the chat through session storage.
import type { Metadata } from 'next';
import './onboarding.css';
import { Onboarding } from '@/components/onboarding/Onboarding';

export const metadata: Metadata = {
  title: 'Beginning — Socria',
  description:
    'Four beats: what you came to do, one real thing you are working through, the question Socria asks back, and the same thinking drawn.',
  // Not a landing page — every visit is somebody mid-signup.
  robots: { index: false, follow: false },
};

export default function OnboardingPage() {
  return <Onboarding />;
}
