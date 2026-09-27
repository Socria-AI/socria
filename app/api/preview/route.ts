// app/api/preview/route.ts
// GET /api/preview?url=… → { image, title, site } for one linked page.
//
// WHAT IT IS FOR. A search disclosure used to be four URLs in a column. The
// cards that replaced them (components/SourceCards.tsx) show the cover the
// publisher itself declares, and this is where that declaration is read: the
// page's own og:image, from the page, at the moment the card appears.
//
// WHY IT IS A ROUTE AND NOT PART OF THE SEARCH. Two reasons, and the second
// is the one that decided it. A cover is a nicety beside a reply that has
// already been written, so it must never delay the reply — this runs after
// the answer, from the browser, and a publisher's slow server costs a card
// rather than a turn. And an old conversation reopened a month later gets its
// covers too, because they were never baked into what was stored.
//
// THE COST OF NOT PROXYING THE IMAGE ITSELF. The card loads the picture
// straight from the publisher, which means that publisher sees the reader's
// address — the same trade the Explore panel already makes for search images.
// Proxying every cover would hide that and put a stranger's bytes through our
// bandwidth on every message; if that trade is ever revisited, it is revisited
// for both surfaces at once.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { fetchPageHead } from '@/lib/logos-connect';
import { parsePreview, EMPTY_PREVIEW } from '@/lib/link-preview';
import { enforceRateLimit } from '@/lib/rate-limit';
import { mayUse } from '@/lib/route-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One memory of what each page said, for an hour.
 *
 * A conversation is re-read, scrolled back through and reopened; four sources
 * would otherwise be four fetches every time. Bounded and swept so a long-
 * lived instance cannot grow a map of the whole internet, and deliberately
 * per-instance: this is a cache, not a store, and nothing here is worth a
 * database row.
 */
const TTL_MS = 60 * 60 * 1000;
const MAX_KEYS = 500;
const seen = new Map<string, { at: number; value: unknown }>();

function remember(key: string, value: unknown) {
  if (seen.size >= MAX_KEYS) {
    // Oldest first. A Map iterates in insertion order, so this is the
    // cheapest eviction that is not random.
    const dead: string[] = [];
    for (const [k, v] of seen) {
      if (Date.now() - v.at > TTL_MS) dead.push(k);
      if (dead.length > 50) break;
    }
    for (const k of dead) seen.delete(k);
    if (seen.size >= MAX_KEYS) {
      const first = seen.keys().next().value;
      if (first) seen.delete(first);
    }
  }
  seen.set(key, { at: Date.now(), value });
}

export async function GET(req: NextRequest) {
  const { userId } = auth();
  // The same gate the rest of the product uses. Without one this is a service
  // that fetches any URL on anyone's behalf, which is somebody else's problem
  // until it is ours.
  if (!userId && !mayUse(req, userId)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const raw = req.nextUrl.searchParams.get('url') ?? '';
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return NextResponse.json({ error: 'A URL is required.' }, { status: 400 });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return NextResponse.json({ error: 'Only http and https.' }, { status: 400 });
  }

  const key = url.toString().slice(0, 600);
  const hit = seen.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json(hit.value, {
      headers: { 'Cache-Control': 'private, max-age=3600' },
    });
  }

  try {
    const { html, final } = await fetchPageHead(key, { bytes: 96_000, timeoutMs: 4_000 });
    const preview = parsePreview(html, final);
    remember(key, preview);
    return NextResponse.json(preview, {
      headers: { 'Cache-Control': 'private, max-age=3600' },
    });
  } catch {
    // A page that cannot be read has no cover, and that is a fine answer: the
    // card falls back to type. Remembered too, so a dead link is not fetched
    // again on every scroll — and never surfaced as an error, because nobody
    // asked for this and nothing is broken without it.
    remember(key, EMPTY_PREVIEW);
    // Always 200: "no cover" is the answer, not a failure of this request.
    return NextResponse.json(EMPTY_PREVIEW, {
      headers: { 'Cache-Control': 'private, max-age=600' },
    });
  }
}
