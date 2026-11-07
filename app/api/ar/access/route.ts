// app/api/ar/access/route.ts
// GET → { tester, signedIn, email, waitlisted } — may this person use AR Mode
// (lib/ar-access.ts), and if not, are they already on its waitlist. Asked only
// when somebody opens AR Mode, never on load. Answers a stranger too: a
// visitor is never a tester (except where `*` opens it, off production), and
// sees the preview and the waitlist.

import { NextResponse } from 'next/server';
import { waitlistAddress, type ArAccess } from '@/lib/ar-access';
import { arTester, arViewer } from '@/lib/ar-server';
import { onWaitlist } from '@/lib/waitlist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const v = await arViewer();
  const tester = arTester(v);
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
