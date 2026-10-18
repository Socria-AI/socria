// app/api/events/ticket/route.ts — an attendee's own confirmation, by its secret.
//
// POST   { token } → { ticket }   their event, first name, code and status
// DELETE { token } → { deleted }  cancel: the registration is deleted outright
//
// The secret is the only key: whoever holds the link sees that one
// registration and nothing else. It arrives in a request body (the page reads
// it from the #fragment), never in a URL a server or analytics tool would log.
// Marking someone attended is not possible here — only staff can do that.

import type { NextRequest } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { ticketOf, TOKEN } from '@/lib/events/model';
import { deleteRegistration, findByToken, getEvent } from '@/lib/events/store';
import { afterChange, json, sameOrigin, storeFailure } from '@/lib/events/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function read(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  return typeof body?.token === 'string' && TOKEN.test(body.token) ? body.token : null;
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, null, 'rsvp');
  if (limited) return limited;
  const token = await read(req);
  if (!token) return json({ error: 'This confirmation link is not valid.' }, 404);
  try {
    const row = await findByToken(token);
    const event = row ? await getEvent(row.event_id) : null;
    if (!row || !event) return json({ error: 'This confirmation link is not valid, or the registration was cancelled.' }, 404);
    return json({ ticket: ticketOf(row, event) });
  } catch (e) {
    return storeFailure(e);
  }
}

export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return json({ error: 'Not allowed.' }, 403);
  const limited = await enforceRateLimit(req, null, 'rsvp');
  if (limited) return limited;
  const token = await read(req);
  if (!token) return json({ error: 'This confirmation link is not valid.' }, 404);
  try {
    const row = await findByToken(token);
    if (!row) return json({ error: 'This registration was already cancelled.' }, 404);
    if (row.attendance === 'attended') return json({ error: 'You’ve already checked in, so this registration can’t be cancelled here. Email hellosocria@gmail.com to have it deleted.' }, 409);
    await deleteRegistration(row.id);
    afterChange(row.event_id);
    return json({ deleted: true });
  } catch (e) {
    return storeFailure(e);
  }
}
