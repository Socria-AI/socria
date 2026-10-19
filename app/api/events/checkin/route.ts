// app/api/events/checkin/route.ts — check in at the venue: how everyone comes in.
//
// Two ways in, from the page the QR code at the door opens:
//
//   POST { eventId, who, website, elapsedMs }
//     who: the name or the email the RSVP was made with → that RSVP is
//     checked in. 404 when there is none (the page then offers the full
//     form), 409 when two RSVPs share the name (use the email).
//
//   POST { eventId, fullName, email, interest?, interestOther?, source?,
//          marketingConsent?, website, elapsedMs }
//     "Didn't RSVP? Check in here": the RSVP's questions. An RSVP under that
//     email (or that exact name) is checked in; anyone else is added and
//     checked in there and then.
//
//   200 → { firstName, already }   403 → check-in isn't open Open only while an
// admin has switched self check-in on, so the link can't be used from home.
// Validated, rate limited, screened for bots; the answer names no one else.

import type { NextRequest } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { checkCheckinLookup, checkRsvp, spamSignal, EVENT_ID } from '@/lib/events/model';
import { getEvent, lookupCheckIn, selfCheckIn } from '@/lib/events/store';
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
  const lookup = typeof body.who === 'string';
  // a one-field lookup is quick to type; the full form takes longer
  if (spamSignal(body, lookup ? 800 : 2500)) return json({ error: 'Please take a moment to check the form, then send it again.', field: 'form' }, 400);
  try {
    const event = await getEvent(eventId);
    if (!event || event.status === 'draft') return json({ error: 'Unknown event.' }, 404);
    if (!event.self_checkin || event.status === 'cancelled') return json({ error: 'Check-in isn’t open right now. Please find a member of the Socria team at the door.', code: 'not-open' }, 403);
    if (lookup) {
      const q = checkCheckinLookup(body);
      if (!q.ok) return json({ error: q.error }, 400);
      const found = await lookupCheckIn(event, q.value);
      if (found.status === 'not-found')
        return json({ error: q.value.by === 'email' ? 'We couldn’t find an RSVP with that email.' : 'We couldn’t find an RSVP under that name.', code: 'not-found' }, 404);
      if (found.status === 'ambiguous') return json({ error: 'More than one person RSVP’d under that name. Please use the email you RSVP’d with.', code: 'ambiguous' }, 409);
      if (!('row' in found)) return json({ error: 'Something went wrong. Please try again.' }, 500);
      if (found.status === 'checked-in') afterChange(event.id);
      return json({ firstName: found.row.full_name.split(' ')[0] ?? found.row.full_name, already: found.status === 'already' });
    }
    const checked = checkRsvp(body);
    if (!checked.ok) return json({ error: checked.error, field: checked.field }, 400);
    const r = await selfCheckIn(event, checked.value);
    if (!r.already) afterChange(event.id);
    return json({ firstName: r.row.full_name.split(' ')[0] ?? r.row.full_name, already: r.already });
  } catch (e) {
    return storeFailure(e);
  }
}
