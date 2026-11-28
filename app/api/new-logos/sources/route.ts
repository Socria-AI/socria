// app/api/new-logos/sources/route.ts
// GET  /api/new-logos/sources → { sources (without readings), refs, placements }
// POST /api/new-logos/sources → bring a file into the library (or find it there): { source, existing }
//
// The library belongs to the account (lib/new-logos/sources.ts). A file arrives already read and kept by the existing
// machinery — its original in the account's private file storage (lib/preview/originals.ts keepOriginal), its reading
// from the existing reader (lib/docs, /api/files/read) — so what comes here is the record: a name, the original's id
// and the reading, checked again. The same file brought in twice is the same source.

import { NextRequest, NextResponse } from 'next/server';
import { bodyUpTo, reply, signedIn, unauthorized, withSources } from '@/lib/new-logos/http';
import { createSource } from '@/lib/new-logos/source-ops';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A reading and its record, as sent, may not be larger than this. */
const MAX_BODY = 2_600_000;

export async function GET() {
  const userId = signedIn();
  if (!userId) return unauthorized();
  return withSources(async (store) => {
    const [sources, refs, placements] = await Promise.all([store.sources(userId), store.refs(userId), store.placements(userId)]);
    return NextResponse.json({ ok: true, setup: true, sources, refs, placements });
  }, false);
}

export async function POST(req: NextRequest) {
  const userId = signedIn();
  if (!userId) return unauthorized();
  const b = await bodyUpTo(req, MAX_BODY);
  if (!b) return NextResponse.json({ ok: false, error: 'That reading is too large to keep. Nothing was changed.', code: 'limit' }, { status: 413 });
  const now = Date.now();
  return withSources(async (store) => {
    const r = await createSource(store, userId, b, now);
    if (!r.ok) return reply(r, 'source');
    return NextResponse.json({ ok: true, source: r.value.source, existing: r.value.existing });
  }, true);
}
