// app/api/new-logos/sources/refs/route.ts
// POST { sourceId, nodeId, passage?, quote?, note?, ground?, origin? } → { ref }
//
// A component refers to a source (at a passage, when given). The same reference twice is the one already there; the
// source is never copied.

import { NextRequest } from 'next/server';
import { body, reply, signedIn, unauthorized, withSources } from '@/lib/new-logos/http';
import { addRef } from '@/lib/new-logos/source-ops';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const userId = signedIn();
  if (!userId) return unauthorized();
  const b = await body(req);
  const now = Date.now();
  return withSources(async (store) => reply(await addRef(store, userId, b, now), 'ref'), true);
}
