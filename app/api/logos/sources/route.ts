// app/api/logos/sources/route.ts
// GET /api/logos/sources → which context sources exist and how to connect
// the ones that don't. Nothing here touches a provider — it only reads env.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { listSources } from '@/lib/logos-connect';
import { SOURCE_META } from '@/lib/logos-sources';
import { unauthorized } from '@/lib/route-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId } = auth();
  // No unlock path here: this route reads a person's connected accounts
  // (or fetches a URL on their behalf), so it needs a real account.
  if (!userId) return unauthorized();
  const sources = (await listSources({ userId })).map((s) => ({
    ...s,
    label: SOURCE_META[s.kind].label,
    blurb: SOURCE_META[s.kind].blurb,
    searches: SOURCE_META[s.kind].searches,
  }));
  return NextResponse.json({ sources });
}
