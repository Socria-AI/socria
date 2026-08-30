// app/logos/page.tsx — the page that explains Logos.
//
// Logos itself is a MODEL, not a route: selecting it swaps the experience into
// /chat. So this address is free to be what a link to "socria.app/logos"
// should actually give someone — an explanation of what Logos is.
//
// Anyone arriving with the app's own query strings (an old bookmark, a
// deep-link to a session, a return from Stripe) is sent on to /chat, where
// those now belong.

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import './logos.css';
import { LogosStory } from './LogosStory';

export const metadata: Metadata = {
  title: 'Logos — think out loud, watch it take shape',
  description:
    'Logos reads how you reason and draws it live beside the conversation: claims, assumptions, tensions and open questions, as a Thinking Map that reorganizes while you think.',
};

const APP_PARAMS = ['s', 'one', 'connect', 'session_id'];

export default function LogosPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const carried = APP_PARAMS.filter((k) => searchParams?.[k] !== undefined);
  if (carried.length) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams ?? {})) {
      if (typeof v === 'string') q.set(k, v);
    }
    q.set('model', 'logos');
    redirect(`/chat?${q.toString()}`);
  }
  return <LogosStory />;
}
