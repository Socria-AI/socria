// app/api/ux-v0/images/route.ts
// POST { queries: [{category, query, page}], seen: [ids], per } → { libraries, results: [{ category, query, page, next, left, refs, providers, error }] }
// POST { action: 'used', refs: [{provider, downloadPing}] } → { ok } (Unsplash's "a photo was used")
//
// Moodboard images from the licensed libraries that need a key (Unsplash,
// Pexels; lib/ux-v0/images-server.ts), never scraped; each with its source,
// creator and licence. Openverse is asked by the browser itself. `libraries`
// says which keyed libraries are set, so the browser need not ask when none
// are. No model is asked here. Signed-in only: it spends the libraries' rate
// limits on the person's behalf.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { pingUse, providerOrder, searchImages } from '@/lib/ux-v0/images-server';
import { bad, readBody, signInFirst } from '@/lib/ux-v0/route-kit';
import { MOOD_CATEGORIES, type MoodCategory } from '@/lib/ux-v0/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return signInFirst();
  const limited = await enforceRateLimit(req, userId, 'uxsync');
  if (limited) return limited;
  const body = await readBody(req, 200_000);
  if (!body) return bad('Which images?');

  if (body.action === 'used') {
    const refs = (Array.isArray(body.refs) ? body.refs : []).slice(0, 12).filter((r: any) => r && typeof r.provider === 'string' && typeof r.downloadPing === 'string');
    await Promise.all(refs.map((r: any) => pingUse({ provider: r.provider, downloadPing: r.downloadPing })));
    return NextResponse.json({ ok: true });
  }

  const queries = (Array.isArray(body.queries) ? body.queries : [])
    .slice(0, 6)
    .map((q: any) => ({
      category: (MOOD_CATEGORIES as readonly string[]).includes(q?.category) ? (q.category as MoodCategory) : 'imagery',
      query: typeof q?.query === 'string' ? q.query.replace(/\s+/g, ' ').trim().slice(0, 100) : '',
      page: Number.isFinite(q?.page) ? Math.min(50, Math.max(1, Math.round(q.page))) : 1,
    }))
    .filter((q: { query: string }) => q.query);
  if (!queries.length) return bad('Which images?');
  const seen = new Set<string>((Array.isArray(body.seen) ? body.seen : []).filter((x: unknown): x is string => typeof x === 'string').slice(0, 2000));
  const per = Number.isFinite(body.per) ? Math.min(12, Math.max(1, Math.round(body.per))) : 6;
  const libraries = providerOrder();

  const results = [];
  for (const q of queries) {
    const r = await searchImages(q, seen, { per });
    for (const ref of r.refs) seen.add(ref.id);
    results.push({ ...q, next: r.next, left: r.left, refs: r.refs, providers: r.providers, error: r.error });
  }
  return NextResponse.json({ libraries, results });
}
