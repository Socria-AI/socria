// app/api/events/admin/route.ts — make a new event. Admins only.
//
// POST { id, title } → { event }   created as a draft (not public) until an
//                                   admin fills it in and opens it
// POST { action: 'purge' }        → { deleted } retention: registrations of
//                                   events that ended more than
//                                   EVENT_RETENTION_DAYS ago (default 365)

import type { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { checkNewEventId, clean, LIMITS, retentionDays } from '@/lib/events/model';
import { createEvent, purgeEndedBefore } from '@/lib/events/store';
import { syncEvent } from '@/lib/events/sheets';
import { currentRole } from '@/lib/events/staff';
import { json, sameOrigin, storeFailure } from '@/lib/events/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({ error: 'Not allowed.' }, 403);
  let uid: string | null = null;
  try {
    uid = auth().userId;
  } catch {}
  const limited = await enforceRateLimit(req, uid, 'staff');
  if (limited) return limited;
  const who = await currentRole();
  if (who?.role !== 'admin') return json({ error: 'Only Socria admins can do this.' }, 403);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  try {
    if (body?.action === 'purge') {
      const { deleted, events } = await purgeEndedBefore(Date.now() - retentionDays() * 86_400_000);
      for (const id of events) await syncEvent(id).catch(() => undefined);
      return json({ deleted });
    }
    const id = checkNewEventId(body?.id);
    const title = clean(body?.title, LIMITS.title);
    if (!id) return json({ error: 'Use lowercase letters, numbers and hyphens for the address (for example in-public-003).' }, 400);
    if (!title) return json({ error: 'Give the event a title.' }, 400);
    return json({ event: await createEvent(id, title) }, 201);
  } catch (e) {
    return storeFailure(e);
  }
}
