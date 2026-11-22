// app/api/ux-v0/design-system/site/route.ts
// POST { url } → { result, fetched } — a public web page's design system, reconstructed (lib/ux-v0/dsi/site.ts)
//
// Signed in only, rate-limited. The address is checked before any network use and every hop is checked again, with
// the connection's own address checked at connect time (lib/ux-v0/dsi/site-server.ts): no private, loopback, link-local
// or reserved address is ever reached. Only the page, the stylesheets it names (eight at most) and its logo candidates
// (three at most) are fetched, each size-capped and time-limited; nothing fetched is run. No model is asked. Every
// token that comes back is marked inferred: a page shows what a design system made, not the system itself.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { extractSite } from '@/lib/ux-v0/dsi/site-server';
import { readBody, signInFirst } from '@/lib/ux-v0/route-kit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 40;

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return signInFirst();
  const limited = await enforceRateLimit(req, userId, 'uxsync');
  if (limited) return limited;
  const body = await readBody(req, 4000);
  try {
    const r = await extractSite(body?.url);
    if (!r.ok) return NextResponse.json({ error: r.error, fetched: r.fetched }, { status: r.status });
    const { page, ...result } = r.result;
    return NextResponse.json({ result, page: { title: page.title, stylesheets: page.stylesheets.length, logos: r.assets.length }, fetched: r.fetched });
  } catch (e) {
    console.error('ux-v0 site extraction failed:', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'That site could not be read just now.' }, { status: 502 });
  }
}
