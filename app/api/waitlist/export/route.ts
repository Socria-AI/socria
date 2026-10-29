// app/api/waitlist/export/route.ts
// GET → waitlist.txt: every address on the relaunch's waitlist, one per line,
// with when it joined. Behind the developer dashboard's gate — a named admin
// (SOCRIA_DASHBOARD_ADMINS), or this browser holding the dashboard's pass —
// and a 404 to everybody else, as if there were nothing here.

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { mayViewDashboard, type Viewer } from '@/lib/dashboard/gate';
import { PASS_COOKIE, holds } from '@/lib/dashboard/codes';
import { waitlistText } from '@/lib/waitlist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function viewer(): Promise<Viewer | null> {
  try {
    const u = await currentUser();
    if (!u) return null;
    return { id: u.id, emails: (u.emailAddresses ?? []).map((e) => ({ address: e.emailAddress, verified: e.verification?.status === 'verified' })) };
  } catch {
    return null;
  }
}

export async function GET() {
  const allowed = mayViewDashboard(await viewer()) || holds('pass', cookies().get(PASS_COOKIE)?.value, Date.now());
  if (!allowed) return new NextResponse('Not found', { status: 404 });
  try {
    const { text } = await waitlistText();
    return new NextResponse(text, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': 'attachment; filename="waitlist.txt"', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return new NextResponse(`Could not read the waitlist: ${e instanceof Error ? e.message : 'unknown'}\n`, { status: 503 });
  }
}
