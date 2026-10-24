// app/logos/page.tsx — "Start a conversation".
//
// Every call to action on the public site points here (components/site,
// START), and this address opens Logos: the product the site is about. Logos
// is a MODEL, not a route — selecting it swaps the experience into /chat —
// so this page only sends people on, carrying anything in the query (an old
// bookmark, a deep-link to a session, a return from Stripe) with them.
//
// It used to be a page explaining Logos. The homepage does that now, with
// the product itself framed on its cover, so the explanation went with the
// rest of the old journal pages.
//
// A temporary redirect, not a permanent one: what "start a conversation"
// opens is the product's to change, and one address for it means the site
// never has to.

import { redirect } from 'next/navigation';

export default function LogosPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams ?? {})) {
    if (typeof v === 'string') q.set(k, v);
  }
  q.set('model', 'logos');
  redirect(`/chat?${q.toString()}`);
}
