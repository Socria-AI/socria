// app/api/logos/sources/route.ts
// GET /api/logos/sources → which context sources exist and how to connect
// the ones that don't. Nothing here touches a provider — it only reads env.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { listSources } from '@/lib/logos-connect';
import { SOURCE_META } from '@/lib/logos-sources';
import { isValidAccessKey } from '@/lib/socria-prompt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId } = auth();
  const keyUnlocked = isValidAccessKey(req.headers.get('x-socria-key'));
  if (!userId && !keyUnlocked) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const sources = listSources().map((s) => ({
    ...s,
    label: SOURCE_META[s.kind].label,
    blurb: SOURCE_META[s.kind].blurb,
    searches: SOURCE_META[s.kind].searches,
  }));
  return NextResponse.json({ sources });
}
