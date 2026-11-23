// app/api/ux-v0/research/route.ts
// POST { query, kind: 'websites' | 'images', count? } → ResearchResponse (lib/ux-v0/research/schema.ts)
//
// References found on the internet through the search provider this workspace configured (lib/ux-v0/research/
// providers-server.ts). Open signed out as in (the conversation is), held tightly by account or address ('uxsearch'):
// every search spends the workspace's provider quota. The server never fetches a result: only the provider's API is
// called, and what it returns is held to its shape before it is sent on. No model is asked. With no provider, the
// answer says so (status 'not-configured') — never an empty list passed off as a search.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { research } from '@/lib/ux-v0/research/providers-server';
import { bad, readBody } from '@/lib/ux-v0/route-kit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

export async function POST(req: NextRequest) {
  let userId: string | null = null;
  try {
    userId = auth().userId;
  } catch {
    userId = null;
  }
  const limited = await enforceRateLimit(req, userId, 'uxsearch');
  if (limited) return limited;
  const body = await readBody(req, 2000);
  const query = typeof body?.query === 'string' ? body.query.replace(/\s+/g, ' ').trim() : '';
  if (!query || query.length > 160) return bad('What should be searched for?');
  const kind = body?.kind === 'images' ? 'images' : 'websites';
  const count = typeof body?.count === 'number' ? body.count : 8;
  try {
    return NextResponse.json(await research({ query, kind, count }));
  } catch (e) {
    console.error('ux-v0 research failed:', e instanceof Error ? e.name : 'unknown');
    return NextResponse.json({ status: 'unavailable', query, kind, provider: null, results: [], message: 'The search did not happen just now. Nothing was found, so nothing is shown.' }, { status: 502 });
  }
}
