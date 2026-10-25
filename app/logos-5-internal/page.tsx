// app/logos-5-internal/page.tsx — the internal architecture page, behind the new Socria's access code.
//
// The page itself is Architecture.tsx. Here is only who sees it: a visit with
// a pass (lib/internal-pass.ts, earned by typing the code at
// /api/logos-5-internal) gets the page; any other visit gets the code form and
// nothing of the page. Unlisted as well: never indexed, disallowed in
// robots.ts, not in the sitemap, linked from nowhere.

import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { NOINDEX } from '@/lib/seo';
import { INTERNAL_PASS_COOKIE, holdsInternalPass } from '@/lib/internal-pass';
import { Architecture } from './Architecture';
import { InternalCodeForm } from './InternalCodeForm';
import './logos5-internal.css';

export const metadata: Metadata = {
  ...NOINDEX,
  title: 'Logos 5 architecture (internal)',
  description: 'How Logos 5 works: the turn, the runtime, allocation, Metacognitive Regulation, evidence, memory and data.',
};

// a pass is read on every request, never served from a cache
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function Logos5InternalPage() {
  const pass = cookies().get(INTERNAL_PASS_COOKIE)?.value;
  return holdsInternalPass(pass, Date.now()) ? <Architecture /> : <InternalCodeForm />;
}
