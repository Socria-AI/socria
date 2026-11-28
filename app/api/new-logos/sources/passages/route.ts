// app/api/new-logos/sources/passages/route.ts
// POST { ids?, docIds?, query } → { docs, sources }
//
// What a question draws from the sources it mentions: for each, its outline and the passages that bear on the
// question (the main app's own retrieval, lib/docs/ground.ts selectPassages), within a budget — never whole documents.
// The result travels with the question to the existing chat endpoint as `docs`, which letters, shows and cites them as
// it does any attached document.

import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { body, reply, signedIn, unauthorized, withSources } from '@/lib/new-logos/http';
import { passagesFor } from '@/lib/new-logos/source-ops';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const userId = signedIn();
  if (!userId) return unauthorized();
  const b = await body(req);
  return withSources(async (store) => {
    const r = await passagesFor(store, userId, b);
    if (!r.ok) return reply(r, 'docs');
    return NextResponse.json({ ok: true, docs: r.value.docs, sources: r.value.sources });
  }, false);
}
