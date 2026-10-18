// app/api/events/checkin/route.ts — check in at the door, by the attendee.
//
// POST { eventId, fullName, email, interest?, interestOther?, source?,
//        marketingConsent?, website (honeypot), elapsedMs }
//   200 → { firstName, already }   checked in (or already was)
//   403 → check-in is not open     (an admin opens it at the event)
//
// The form an attendee reaches by scanning the QR code at the venue. It asks
// what the RSVP asks, with a personal email (not a UTA one). Open only while
// an admin has switched self check-in on, so the link cannot be used from
// home before the event. Validated, rate limited, screened for bots; the
// answer says nothing about anyone else.

import type { NextRequest } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { checkCheckin, spamSignal, EVENT_ID } from '@/lib/events/model';
import { getEvent, selfCheckIn } from '@/lib/events/store';
import { afterChange, json, sameOrigin, storeFailure } from '@/lib/events/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({ error: 'Not allowed.' }, 403);
  const limited = await enforceRateLimit(req, null, 'rsvp');
  if (limited) return limited;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return json({ error: 'Something went wrong with the form. Please try again.' }, 400);
  const eventId = typeof body.eventId === 'string' && EVENT_ID.test(body.eventId) ? body.eventId : null;
  if (!eventId) return json({ error: 'Unknown event.' }, 404);
  if (spamSignal(body)) return json({ error: 'Please take a moment to check the form, then send it again.', field: 'form' }, 400);
  const checked = checkCheckin(body);
  if (!checked.ok) return json({ error: checked.error, field: checked.field }, 400);
  try {
    const event = await getEvent(eventId);
    if (!event || event.status === 'draft') return json({ error: 'Unknown event.' }, 404);
    if (!event.self_checkin || event.status === 'cancelled') return json({ error: 'Check-in isn’t open right now. Please find a member of the Socria team at the door.', code: 'not-open' }, 403);
    const r = await selfCheckIn(event, checked.value);
    if (!r.already) afterChange(event.id);
    return json({ firstName: r.row.full_name.split(' ')[0] ?? r.row.full_name, already: r.already });
  } catch (e) {
    return storeFailure(e);
  }
}
