// GET /api/logos/connect/:provider
// Starts the OAuth authorization flow: builds a signed-state authorize URL and
// redirects the person to Google/Notion's own consent screen. Read-only.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { authorizeUrl } from '@/lib/logos-oauth';
import { connectionsConfigured } from '@/lib/logos-connections';
import { ConnectError, connectorsEnabled } from '@/lib/logos-connect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function back(origin: string, params: Record<string, string>) {
  const u = new URL('/logos', origin);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return NextResponse.redirect(u);
}

export async function GET(
  req: NextRequest,
  { params }: { params: { provider: string } }
) {
  const provider = params.provider;
  const origin = new URL(req.url).origin;
  // Connections are per account, so this genuinely requires a signed-in user;
  // the access key alone has no stable identity to attach a grant to.
  // Dormant: never send anyone to a consent screen they would be blocked at.
  if (!connectorsEnabled()) {
    return back(origin, { connect: 'error', msg: 'Connected sources are turned off for now.' });
  }
  const { userId } = auth();
  if (!userId) return back(origin, { connect: 'signin' });
  if (provider !== 'google' && provider !== 'notion') {
    return back(origin, { connect: 'error', msg: 'Unknown provider' });
  }
  if (!connectionsConfigured()) {
    return back(origin, { connect: 'error', msg: 'Connections are not configured on this deployment.' });
  }
  try {
    return NextResponse.redirect(authorizeUrl(provider, userId, origin));
  } catch (e: any) {
    const msg = e instanceof ConnectError ? e.message : 'Could not start the connection.';
    return back(origin, { connect: 'error', msg });
  }
}
