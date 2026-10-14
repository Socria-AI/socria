// app/dev/dashboard/page.tsx — the developer dashboard.
//
// Who signs up, how far they get through onboarding, what they choose on the
// onboarding screen, who they are (in kinds, never identities), where they
// came from and whether they stay. Read on every request, from Clerk and the
// database (lib/dashboard/collect.ts), and computed in one pure place
// (lib/dashboard/aggregate.ts). docs/DASHBOARD.md has what each number means.
//
// PRIVATE BY DEFAULT. Anyone not named in SOCRIA_DASHBOARD_ADMINS — and
// anyone signed out — gets the same 404 as a page that does not exist, so the
// page cannot even be confirmed to be here (lib/dashboard/gate.ts). It is
// never indexed and never cached.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { currentUser } from '@clerk/nextjs/server';
import { NOINDEX } from '@/lib/seo';
import { mayViewDashboard, type Viewer } from '@/lib/dashboard/gate';
import { collect } from '@/lib/dashboard/collect';
import { aggregate } from '@/lib/dashboard/aggregate';
import { parseRange } from '@/lib/dashboard/types';
import { Dashboard } from '@/components/dashboard/Dashboard';
import './dashboard.css';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata: Metadata = { ...NOINDEX, title: 'Developer dashboard' };

async function viewer(): Promise<Viewer | null> {
  try {
    const u = await currentUser();
    if (!u) return null;
    return {
      id: u.id,
      emails: (u.emailAddresses ?? []).map((e) => ({ address: e.emailAddress, verified: e.verification?.status === 'verified' })),
    };
  } catch {
    // No Clerk on this deployment, or it could not be reached: nobody is anybody.
    return null;
  }
}

export default async function DeveloperDashboard({ searchParams }: { searchParams?: { range?: string } }) {
  if (!mayViewDashboard(await viewer())) notFound();
  const model = aggregate(await collect(), parseRange(searchParams?.range));
  return <Dashboard model={model} />;
}
