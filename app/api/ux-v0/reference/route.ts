// app/api/ux-v0/reference/route.ts
// POST { url } → { read, preview } — a website the person pointed to in the conversation, read for reference
// (lib/ux-v0/studio/reference-server.ts): its colours, its typefaces and what its pages are like, and the page drawn
// without its scripts for a sealed frame.
//
// Open signed out as well as in (the conversation is), rate-limited by account or address ('uxref'). The address is
// checked before any network use and every hop again, with the connection's own address checked at connect time: no
// private, loopback, link-local or reserved address is ever reached. Only the page and the stylesheets it names are
// fetched, each size-capped and time-limited; nothing fetched is run or kept. No model is asked.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { readSiteReference } from '@/lib/ux-v0/studio/reference-server';
import { bad, readBody } from '@/lib/ux-v0/route-kit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 40;

export async function POST(req: NextRequest) {
  let userId: string | null = null;
  try {
    userId = auth().userId;
  } catch {
    userId = null;
  }
  const limited = await enforceRateLimit(req, userId, 'uxref');
  if (limited) return limited;
  const body = await readBody(req, 4000);
  if (!body || typeof body.url !== 'string') return bad('Which website?');
  try {
    const r = await readSiteReference(body.url);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ read: r.read, preview: r.preview });
  } catch (e) {
    console.error('ux-v0 reference read failed:', e instanceof Error ? e.name : 'unknown');
    return NextResponse.json({ error: 'That site could not be read just now.' }, { status: 502 });
  }
}
