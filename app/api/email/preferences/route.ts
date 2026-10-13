// app/api/email/preferences/route.ts
// GET → { lifecycle: boolean, newsletter: boolean }
// PUT → { lifecycle?: boolean, newsletter?: boolean }   set either, or both.
//
// Two switches, for the signed-in person, each backed by its own row in the
// lifecycle ledger:
//
//   lifecycle   whether Socria may send the occasional note. Backed by the
//               'unsubscribed' row — the same row the unsubscribe link
//               writes, so the two never disagree about who said stop.
//   newsletter  whether they get the newsletter (lib/newsletter.ts). Backed
//               by the 'newsletter' row: there means asked for. The sign-up
//               form's box writes it through this route, once the new
//               account is signed in; the switch under Data & Privacy writes
//               and removes it; any unsubscribe link removes it.
//
// Both read "off" when the store cannot answer. A switch that shows "on"
// for a person whose choice is unreadable would be showing them a promise
// the sender is not keeping — and the senders, for their part, treat
// silence from the store as "do not send" (lib/lifecycle-store.ts).

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { readNewsletter, readUnsubscribed, setNewsletter, setUnsubscribed } from '@/lib/lifecycle-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const [unsubscribed, newsletter] = await Promise.all([readUnsubscribed(userId), readNewsletter(userId)]);
  return NextResponse.json({ lifecycle: unsubscribed === false, newsletter: newsletter === true });
}

export async function PUT(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const lifecycle = body?.lifecycle;
  const newsletter = body?.newsletter;
  const said = (v: unknown) => typeof v === 'boolean';
  if ((!said(lifecycle) && lifecycle !== undefined) || (!said(newsletter) && newsletter !== undefined) || (!said(lifecycle) && !said(newsletter))) {
    return NextResponse.json({ error: 'Say whether the notes or the newsletter are on or off.' }, { status: 400 });
  }

  const out: { lifecycle?: boolean; newsletter?: boolean } = {};
  let ok = true;
  if (said(lifecycle)) {
    ok = (await setUnsubscribed(userId, !lifecycle)) && ok;
    out.lifecycle = lifecycle;
  }
  if (said(newsletter)) {
    ok = (await setNewsletter(userId, newsletter)) && ok;
    out.newsletter = newsletter;
  }
  if (!ok) {
    return NextResponse.json(
      { error: 'Could not save that just now. Try again in a moment.' },
      { status: 500 }
    );
  }
  return NextResponse.json(out);
}
