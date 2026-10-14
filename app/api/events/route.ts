// app/api/events/route.ts — count one product event, anonymously.
//
// POST { e: event, p: props } → 204, always (or 429 when rate limited).
//
// The first-party half of lib/analytics.ts: a small set of events
// (lib/product-events.ts COUNTED_EVENTS) is also counted in Socria's own
// database so the developer dashboard can show what people choose on the
// onboarding screen. What is stored is one integer per (environment, day,
// event, kind); the kind is validated against fixed vocabularies
// (lib/product-event-kinds.ts) before anything is written, so this endpoint
// cannot be used to put text into the table. Nothing about the caller is
// kept — not their id, not their address, not a session.
//
// It never fails loudly. A missing table, a missing key or a refused write
// is a count not taken, and the person on the onboarding screen is never
// told about it.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit } from '@/lib/rate-limit';
import { currentEnv } from '@/lib/environment';
import { dayOf, kindsFor } from '@/lib/product-event-kinds';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Bigger than any real event; a beacon is a few dozen bytes. */
const MAX_BODY = 2048;

const done = () => new NextResponse(null, { status: 204 });

/**
 * The states of a database the migration has not reached yet: the function
 * or the table not there. Expected for a while after a deploy, so quiet.
 * By code, never by wording — "permission denied for function
 * bump_product_event" names the function too, and that one is a fault
 * someone has to hear about, or nothing is ever counted and nobody knows.
 */
const NOT_MIGRATED = new Set(['PGRST202', '42883', '42P01', 'PGRST205']);

export async function POST(req: NextRequest) {
  let raw = '';
  try {
    raw = await req.text();
  } catch {
    return done();
  }
  if (!raw || raw.length > MAX_BODY) return done();
  let body: { e?: unknown; p?: unknown } | null = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return done();
  }
  const kinds = kindsFor(body?.e, body?.p);
  if (!kinds) return done();

  // Who is asking matters only to the rate limit; it is not stored.
  let userId: string | null = null;
  try {
    userId = auth().userId ?? null;
  } catch {
    userId = null;
  }
  const limited = await enforceRateLimit(req, userId, 'count');
  if (limited) return limited;

  const now = Date.now();
  const env = currentEnv();
  const day = dayOf(now);
  for (const kind of kinds) {
    try {
      const { error } = await supabaseAdmin().rpc('bump_product_event', {
        p_env: env,
        p_day: day,
        p_event: body!.e as string,
        p_kind: kind,
        p_by: 1,
      });
      const code = (error as { code?: string } | null)?.code ?? '';
      if (error && !NOT_MIGRATED.has(code)) console.warn('[events] count not taken', code || error.message);
    } catch {
      // Supabase not configured here: nothing to count into.
      break;
    }
  }
  return done();
}
