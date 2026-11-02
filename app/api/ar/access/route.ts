// app/api/ar/access/route.ts
// GET → { tester, signedIn, email, waitlisted } — may this person use AR Mode
// (lib/ar-access.ts), and if not, are they already on its waitlist. Asked only
// when somebody opens AR Mode, never on load. Answers a stranger too: a
// visitor is never a tester (except where `*` opens it, off production), and
// sees the preview and the waitlist.

import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { mayUseAr, waitlistAddress, type ArAccess, type Viewer } from '@/lib/ar-access';
import { operatorGranted } from '@/lib/socria-one-grant';
import { isProduction } from '@/lib/environment';
import { onWaitlist } from '@/lib/waitlist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function viewer(): Promise<Viewer | null> {
  try {
    if (!auth().userId) return null;
    const u = await currentUser();
    if (!u) return null;
    return {
      id: u.id,
      emails: (u.emailAddresses ?? []).map((e) => ({ address: e.emailAddress, verified: e.verification?.status === 'verified' })),
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const v = await viewer();
  const tester = mayUseAr(v, {
    testers: process.env.SOCRIA_AR_TESTERS,
    admins: process.env.SOCRIA_DASHBOARD_ADMINS,
    production: isProduction(),
    granted: (emails) => operatorGranted(emails.map((e) => ({ emailAddress: e.address, verification: { status: e.verified ? 'verified' : 'unverified' } }))),
  });
  const email = waitlistAddress(v);
  let waitlisted = false;
  if (!tester && email) {
    try {
      waitlisted = await onWaitlist(email, 'ar');
    } catch {
      // the list cannot be read just now: the page offers the waitlist, and joining twice is harmless
    }
  }
  const body: ArAccess = { tester, signedIn: !!v, email, waitlisted };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}
