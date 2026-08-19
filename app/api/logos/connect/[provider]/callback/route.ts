// GET /api/logos/connect/:provider/callback
// Finishes the OAuth flow: verifies the signed state, confirms it belongs to
// the CURRENT signed-in user, exchanges the code for tokens, stores them
// encrypted, and returns the person to /logos.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { exchangeAndStore, verifyState } from '@/lib/logos-oauth';
import { ConnectError } from '@/lib/logos-connect';

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
  const url = new URL(req.url);
  const origin = url.origin;
  const provider = params.provider;
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state') ?? '';
  const oauthError = url.searchParams.get('error');

  if (oauthError) return back(origin, { connect: 'denied', provider });
  if (provider !== 'google' && provider !== 'notion') {
    return back(origin, { connect: 'error', msg: 'Unknown provider' });
  }

  // The state must verify, name this provider, and belong to the person whose
  // session is making the callback — three independent checks.
  const verified = verifyState(state);
  const { userId } = auth();
  if (!verified || verified.provider !== provider) {
    return back(origin, { connect: 'error', msg: 'That connection link was invalid or expired.' });
  }
  if (!userId || userId !== verified.userId) {
    return back(origin, { connect: 'error', msg: 'Please sign in and try connecting again.' });
  }
  if (!code) return back(origin, { connect: 'error', msg: 'No authorization code returned.' });

  try {
    await exchangeAndStore(provider, code, userId, origin);
    return back(origin, { connect: 'ok', provider });
  } catch (e: any) {
    const msg = e instanceof ConnectError ? e.message : 'Could not finish the connection.';
    return back(origin, { connect: 'error', msg });
  }
}
