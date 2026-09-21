// GET    /api/logos/connections  → this user's connection status
// DELETE /api/logos/connections?provider=google  → disconnect (revoke locally)

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { connectionStatus, deleteConnection, connectionsConfigured } from '@/lib/logos-connections';
import { providerConfig } from '@/lib/logos-oauth';
import { unauthorized } from '@/lib/route-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId } = auth();
  // No unlock path here: this route reads a person's connected accounts
  // (or fetches a URL on their behalf), so it needs a real account.
  if (!userId) return unauthorized();
  const status = await connectionStatus(userId);
  return NextResponse.json({
    // Only a signed-in user with a configured OAuth app can connect.
    canConnect: !!userId && connectionsConfigured(),
    signedIn: !!userId,
    providers: [
      {
        provider: 'google',
        label: 'Google',
        configured: providerConfig('google').configured,
        connected: status.google,
        account: status.accounts.google,
        grants: providerConfig('google').grants,
      },
      {
        provider: 'notion',
        label: 'Notion',
        configured: providerConfig('notion').configured,
        connected: status.notion,
        account: status.accounts.notion,
        grants: providerConfig('notion').grants,
      },
    ],
  });
}

export async function DELETE(req: NextRequest) {
  const { userId } = auth();
  // No unlock path here: this route reads a person's connected accounts
  // (or fetches a URL on their behalf), so it needs a real account.
  if (!userId) return unauthorized();
  const provider = new URL(req.url).searchParams.get('provider');
  if (provider !== 'google' && provider !== 'notion') {
    return NextResponse.json({ error: 'Unknown provider' }, { status: 400 });
  }
  await deleteConnection(userId, provider);
  return NextResponse.json({ ok: true });
}
