// app/api/events/rsvp/route.ts — the public RSVP.
//
// POST { eventId, fullName, email, interest?, interestOther?, source?,
//        marketingConsent?, utm?, ref?, website (honeypot), elapsedMs }
//   201 → { ticket, token } the attendee's own confirmation and its secret,
//         returned once; the page keeps it only in the link's #fragment
//   409 → already registered (the confirmation link is emailed again, with
//         a fresh secret, when email is on), closed, or full
//
// Validated (lib/events/model.ts checkRsvp), rate limited ('rsvp'), and
// screened for bots with a hidden field and a minimum fill time. Nothing here
// reads anyone else's registration, makes an account, or subscribes anyone.

import type { NextRequest } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { emailBaseUrl, sendEmail, withTimeout } from '@/lib/email';
import { checkRsvp, spamSignal, ticketOf, EVENT_ID } from '@/lib/events/model';
import { EventStoreError, findByEmail, getEvent, hashToken, newToken, register } from '@/lib/events/store';
import { afterChange, json, sameOrigin, storeFailure } from '@/lib/events/http';
import { confirmationEmail, ticketUrl } from '@/lib/events/email';
import { supabaseAdmin } from '@/lib/supabase';

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

  // A bot gets what a person would: a calm refusal that teaches it nothing.
  if (spamSignal(body)) return json({ error: 'Please take a moment to check the form, then send it again.', field: 'form' }, 400);

  const checked = checkRsvp(body);
  if (!checked.ok) return json({ error: checked.error, field: checked.field }, 400);

  try {
    const event = await getEvent(eventId);
    if (!event || event.status === 'draft') return json({ error: 'Unknown event.' }, 404);
    const { row, token } = await register(event, checked.value);
    afterChange(event.id);
    const link = ticketUrl(emailBaseUrl(), event.id, token);
    const firstName = row.full_name.split(' ')[0] ?? row.full_name;
    // the confirmation, if this deployment sends email; never holds up the answer for long
    await withTimeout(sendEmail({ to: row.email!, stream: 'event', ...confirmationEmail({ event, firstName, code: row.code, link }) }), 2500, { ok: false, reason: 'network' as const });
    return json({ ticket: ticketOf(row, event), token }, 201);
  } catch (e) {
    if (e instanceof EventStoreError && e.kind === 'duplicate') return duplicate(eventId, checked.value.emailNorm);
    return storeFailure(e);
  }
}

/**
 * Already registered. If email is on, their confirmation link is sent again —
 * with a fresh secret, since only its hash was kept — to the address itself,
 * never to this screen. Without email, they check in at the event by name.
 */
async function duplicate(eventId: string, emailNorm: string) {
  const emailOn = (process.env.EVENT_EMAILS || '').trim().toLowerCase() === 'on' && !!process.env.RESEND_API_KEY;
  if (emailOn) {
    try {
      const [event, row] = await Promise.all([getEvent(eventId), findByEmail(eventId, emailNorm)]);
      if (event && row?.email) {
        const token = newToken();
        await supabaseAdmin().from('event_registrations').update({ token_hash: hashToken(token) }).eq('id', row.id);
        const link = ticketUrl(emailBaseUrl(), event.id, token);
        await withTimeout(sendEmail({ to: row.email, stream: 'event', ...confirmationEmail({ event, firstName: row.full_name.split(' ')[0] ?? row.full_name, code: row.code, link }) }), 2500, { ok: false, reason: 'network' as const });
      }
    } catch {
      /* the answer below is still true */
    }
  }
  return json(
    {
      error: emailOn
        ? 'This email is already registered. We’ve sent your confirmation link to it again.'
        : 'This email is already registered. At the event, check in with your name or this email.',
      code: 'duplicate',
    },
    409
  );
}
