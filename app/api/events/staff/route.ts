// app/api/events/staff/route.ts — the door. Staff and admins only.
//
// POST { action, eventId, ... }
//   resolve  { token }          → the person a scanned QR code belongs to (does NOT check them in)
//   lookup   { q }              → matches by name, email or code
//   checkin  { registrationId } → mark attended, once; a second time reports the first
//   undo     { registrationId } → revert a mistaken check-in
//   walkin   { fullName, email? } → register and check in at once
//
// A QR code only identifies; attendance is recorded by a signed-in member of
// staff pressing Confirm. Answers carry what the door needs (a name, a masked
// email, the code, the status) and nothing else.

import type { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { clean, doorRow, EVENT_ID, LIMITS, normalizeEmail, REG_ID, searchRegistrations, TOKEN } from '@/lib/events/model';
import { EventStoreError, checkIn, findById, findByToken, getEvent, listRegistrations, registerWalkIn, undoCheckIn } from '@/lib/events/store';
import { currentRole } from '@/lib/events/staff';
import { afterChange, json, sameOrigin, storeFailure } from '@/lib/events/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function userId(): string | null {
  try {
    return auth().userId;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({ error: 'Not allowed.' }, 403);
  const uid = userId();
  const limited = await enforceRateLimit(req, uid, 'staff');
  if (limited) return limited;
  const who = await currentRole();
  if (!who) return json({ error: 'Only Socria event staff can do this. Sign in with a staff account.' }, 403);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = typeof body?.action === 'string' ? body.action : '';
  const eventId = typeof body?.eventId === 'string' && EVENT_ID.test(body.eventId) ? body.eventId : null;

  try {
    if (action === 'resolve') {
      const token = typeof body?.token === 'string' && TOKEN.test(body.token) ? body.token : null;
      const row = token ? await findByToken(token) : null;
      if (!row) return json({ error: 'This code doesn’t match a registration. It may have been cancelled — look the person up by name.' }, 404);
      const event = await getEvent(row.event_id);
      return json({ person: doorRow(row), event: event ? { id: event.id, title: event.title } : null });
    }

    if (!eventId) return json({ error: 'Unknown event.' }, 404);
    const event = await getEvent(eventId);
    if (!event) return json({ error: 'Unknown event.' }, 404);

    if (action === 'lookup') {
      const q = clean(body?.q, 120);
      const rows = await listRegistrations(eventId);
      return json({ people: searchRegistrations(rows, q).map(doorRow), total: rows.length, attended: rows.filter((r) => r.attendance === 'attended').length });
    }

    if (action === 'checkin' || action === 'undo') {
      const id = typeof body?.registrationId === 'string' && REG_ID.test(body.registrationId) ? body.registrationId : null;
      const row = id ? await findById(id) : null;
      if (!row || row.event_id !== eventId) return json({ error: 'That registration isn’t for this event.' }, 404);
      if (action === 'undo') {
        await undoCheckIn(row.id);
        afterChange(eventId);
        return json({ person: doorRow((await findById(row.id))!) });
      }
      const r = await checkIn(row.id, who.by);
      afterChange(eventId);
      return r.ok ? json({ person: doorRow(r.row), checkedIn: true }) : json({ person: doorRow(r.already), checkedIn: false, already: true });
    }

    if (action === 'walkin') {
      const fullName = clean(body?.fullName, LIMITS.name);
      if (fullName.length < 2) return json({ error: 'Enter their full name.', field: 'fullName' }, 400);
      const rawEmail = clean(body?.email, LIMITS.email);
      const emailNorm = rawEmail ? normalizeEmail(rawEmail) : null;
      if (rawEmail && !emailNorm) return json({ error: 'That email address doesn’t look right. Leave it empty if they’d rather not give one.', field: 'email' }, 400);
      try {
        const row = await registerWalkIn(event, fullName, emailNorm, emailNorm ? rawEmail : null, who.by);
        afterChange(eventId);
        return json({ person: doorRow(row), checkedIn: true }, 201);
      } catch (e) {
        if (e instanceof EventStoreError && e.kind === 'duplicate') {
          const existing = emailNorm ? (await listRegistrations(eventId)).find((r) => r.email_norm === emailNorm) : null;
          return json({ error: 'They already registered — check them in instead.', code: 'duplicate', person: existing ? doorRow(existing) : null }, 409);
        }
        throw e;
      }
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (e) {
    return storeFailure(e);
  }
}
