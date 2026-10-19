// app/api/events/staff/route.ts — the door. Staff and admins only.
//
// POST { action, eventId, ... }
//   lookup   { q }              → matches by name, email or code
//   checkin  { registrationId } → mark attended, once; a second time reports the first
//   undo     { registrationId } → revert a mistaken check-in
//
// Attendees check themselves in at the venue (app/api/events/checkin); this is
// the staff fallback. Answers carry what the door needs (a name, a masked
// email, the code, the status) and nothing else.

import type { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { clean, doorRow, EVENT_ID, LIMITS, normalizeEmail, REG_ID, searchRegistrations, } from '@/lib/events/model';
import { checkIn, findById, getEvent, listRegistrations, undoCheckIn } from '@/lib/events/store';
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

    return json({ error: 'Unknown action.' }, 400);
  } catch (e) {
    return storeFailure(e);
  }
}
