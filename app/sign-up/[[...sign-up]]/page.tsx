// app/sign-up/[[...sign-up]]/page.tsx
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { AuthPlate } from '@/components/auth/AuthPlate';
import { AuthForm } from '@/components/auth/AuthForm';
import { isSafeRedirect } from '@/lib/auth-links';
import { rewardsConfig } from '@/lib/rewards/rewards-config';
import { newsletterTickedByDefault } from '@/lib/newsletter-consent';
import { pageMetadata } from '@/lib/seo';
import '../../app-shell.css';

// A friend's referral link (app/r/[code]) lands here with ?invited=1, and the
// card a shared link shows is drawn from this page — so an invitation gets
// the invitation's card, and only while referrals are running.
export function generateMetadata({ searchParams }: { searchParams?: { invited?: string } }): Metadata {
  const cfg = rewardsConfig();
  const invited = searchParams?.invited === '1' && cfg.enabled;
  return pageMetadata({
    path: '/sign-up',
    title: 'Create your account',
    description: invited
      ? 'A friend invited you to Socria. Create your free account — no card needed. Think for yourself.'
      : 'Create a free Socria account and keep your thinking across every device. Think for yourself.',
    og: invited ? 'invited' : 'sign-up',
  });
}

export default function SignUpPage({
  searchParams,
}: {
  searchParams?: { redirect_url?: string; invited?: string };
}) {
  const back = isSafeRedirect(searchParams?.redirect_url)
    ? searchParams!.redirect_url!
    : undefined;
  // Arrived through a friend's referral link (app/r/[code]). Only the copy changes here: whether the
  // seven days are given is decided by the server once the account exists (lib/rewards/), so this
  // promises what a new account receives and nothing on the friend's behalf.
  const cfg = rewardsConfig();
  const invited = searchParams?.invited === '1' && cfg.enabled;
  // The newsletter box starts ticked only where the law allows a ticked box,
  // and unticked in the EU, the UK, Canada and the rest of the list in
  // lib/newsletter-consent.ts — by the country Vercel's edge reads from the
  // visitor's IP. With no header (a local run) it starts unticked.
  const newsletterDefault = newsletterTickedByDefault(headers().get('x-vercel-ip-country'));
  const days = cfg.referral.signupDays;
  return (
    <AuthPlate
      kind="sign-up"
      redirectTo={back}
      eyebrow={invited ? 'A friend invited you' : 'Create your account'}
      title="Think with Socria across"
      emphasis="every device."
      lede={
        invited
          ? `Create your free account and get ${days === 7 ? 'seven' : days} days of Socria One — the complete environment, no card needed. Logos 5: the conversation, and the map of your own reasoning drawn beside it.`
          : 'Free account. Logos 5: the conversation, and the map of your own reasoning drawn beside it.'
      }
    >
      {/* A NEW account lands on the beginning, not in an empty composer.
          Someone who came here from a specific page still goes back to it —
          an interrupted errand is not a first run. AuthForm makes that call;
          see `land()` there. */}
      <AuthForm kind="sign-up" redirectTo={back} newsletterDefault={newsletterDefault} />
    </AuthPlate>
  );
}
