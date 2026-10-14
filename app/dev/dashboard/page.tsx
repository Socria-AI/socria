// app/dev/dashboard/page.tsx — the developer dashboard.
//
// Who signs up, how far they get through onboarding, what they choose on the
// onboarding screen, who they are (in kinds, never identities), where they
// came from and whether they stay. Read on every request, from Clerk and the
// database (lib/dashboard/collect.ts), and computed in one pure place
// (lib/dashboard/aggregate.ts). docs/DASHBOARD.md has what each number means.
//
// PRIVATE BY DEFAULT. Two ways in: being named in SOCRIA_DASHBOARD_ADMINS
// (lib/dashboard/gate.ts), or the two-step code, when SOCRIA_DASHBOARD_CODE_1
// and _2 are both set (lib/dashboard/codes.ts). With codes set, everyone else
// is asked for them and nothing is read until both are right; without them,
// everyone else gets the same 404 as a page that does not exist. It is never
// indexed and never cached.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { currentUser } from '@clerk/nextjs/server';
import { NOINDEX } from '@/lib/seo';
import { mayViewDashboard, type Viewer } from '@/lib/dashboard/gate';
import { collect } from '@/lib/dashboard/collect';
import { aggregate } from '@/lib/dashboard/aggregate';
import { parseRange } from '@/lib/dashboard/types';
import { HALF_COOKIE, PASS_COOKIE, dashboardCodesConfigured, holds } from '@/lib/dashboard/codes';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { DashboardCodeGate } from '@/components/dashboard/DashboardCodeGate';
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
  const now = Date.now();
  const jar = cookies();
  if (!mayViewDashboard(await viewer()) && !holds('pass', jar.get(PASS_COOKIE)?.value, now)) {
    if (!dashboardCodesConfigured()) notFound();
    return <DashboardCodeGate step={holds('half', jar.get(HALF_COOKIE)?.value, now) ? 2 : 1} />;
  }
  const model = aggregate(await collect(), parseRange(searchParams?.range));
  return <Dashboard model={model} />;
}
