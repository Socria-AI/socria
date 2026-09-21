// app/api/logos/sources/search/route.ts
// POST { kind, query } → { items } — a short list of the person's own items
// in one source. Search is how context stays chosen rather than dumped.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { ConnectError, searchSource } from '@/lib/logos-connect';
import { SOURCE_KINDS, type SourceKind } from '@/lib/logos-sources';
import { enforceRateLimit } from '@/lib/rate-limit';
import { unauthorized } from '@/lib/route-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId } = auth();
  // No unlock path here: this route reads a person's connected accounts
  // (or fetches a URL on their behalf), so it needs a real account.
  if (!userId) return unauthorized();
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const kind = SOURCE_KINDS.includes(body?.kind) ? (body.kind as SourceKind) : null;
  const query = typeof body?.query === 'string' ? body.query.trim().slice(0, 200) : '';
  if (!kind) return NextResponse.json({ error: 'Unknown source.' }, { status: 400 });

  try {
    const items = await searchSource(kind, query, { userId });
    return NextResponse.json({ items });
  } catch (e: any) {
    if (e instanceof ConnectError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error('logos source search error:', e);
    return NextResponse.json({ error: 'That source did not answer.' }, { status: 502 });
  }
}
