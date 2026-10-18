// app/api/events/checkin/route.ts — check in at the venue, by the attendee.
//
// POST { eventId, who, website (honeypot), elapsedMs }
//   who: the email the attendee RSVP'd with, or the name they RSVP'd under
//   200 → { firstName, already }   checked in (or already was)
//   404 → no RSVP under that name or email
//   409 → two RSVPs share that name: use the email instead
//   403 → check-in isn't open (an admin opens it at the event)
//
// The page the QR code at the door opens. Only an existing RSVP can be
// checked in, once; nothing new is registered here. Open only while an admin
// has switched self check-in on, so the link can't be used from home.
// Rate limited and screened for bots; the answer names no one else.

import type { NextRequest } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { checkCheckinLookup, spamSignal, EVENT_ID } from '@/lib/events/model';
import { getEvent, selfCheckIn } from '@/lib/events/store';
import { afterChange, json, sameOrigin, storeFailure } from '@/lib/events/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({ error: 'Not allowed.' }, 403);
  const limited = await enforceRateLimit(req, null, 'rsvp');
  if (limited) return limited;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return json({ error: 'Something went wrong. Please try again.' }, 400);
  const eventId = typeof body.eventId === 'string' && EVENT_ID.test(body.eventId) ? body.eventId : null;
  if (!eventId) return json({ error: 'Unknown event.' }, 404);
  // one short field: the hidden one must be empty, and no one types a name in under 0.8 s
  if (spamSignal(body, 800)) return json({ error: 'Please try that again.' }, 400);
  const checked = checkCheckinLookup(body);
  if (!checked.ok) return json({ error: checked.error }, 400);
  try {
    const event = await getEvent(eventId);
    if (!event || event.status === 'draft') return json({ error: 'Unknown event.' }, 404);
    if (!event.self_checkin || event.status === 'cancelled') return json({ error: 'Check-in isn’t open right now. Please find a member of the Socria team at the door.', code: 'not-open' }, 403);
    const r = await selfCheckIn(event, checked.value);
    if (r.status === 'not-found')
      return json({ error: checked.value.by === 'email' ? 'We couldn’t find an RSVP with that email. Check the spelling, or try the name you RSVP’d under.' : 'We couldn’t find an RSVP under that name. Check the spelling, or try the email you RSVP’d with.', code: 'not-found' }, 404);
    if (r.status === 'ambiguous') return json({ error: 'More than one person RSVP’d under that name. Please use the email you RSVP’d with.', code: 'ambiguous' }, 409);
    if (!('row' in r)) return json({ error: 'Something went wrong. Please try again.' }, 500);
    if (r.status === 'checked-in') afterChange(event.id);
    return json({ firstName: r.row.full_name.split(' ')[0] ?? r.row.full_name, already: r.status === 'already' });
  } catch (e) {
    return storeFailure(e);
  }
}
