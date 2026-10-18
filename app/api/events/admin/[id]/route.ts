// app/api/events/admin/[id]/route.ts — one event, for admins.
//
// PATCH { ...fields }                    → edit (lib/events/model.ts checkEventPatch)
// POST  { action: 'sync' }               → resync the Google Sheet tab now
// POST  { action: 'delete', registrationId } → delete one registration outright

import type { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { checkEventPatch, EVENT_ID, REG_ID } from '@/lib/events/model';
import { deleteRegistration, findById, getEvent, updateEvent } from '@/lib/events/store';
import { syncEvent } from '@/lib/events/sheets';
import { currentRole } from '@/lib/events/staff';
import { afterChange, json, sameOrigin, storeFailure } from '@/lib/events/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function gate(req: NextRequest) {
  if (!sameOrigin(req)) return json({ error: 'Not allowed.' }, 403);
  let uid: string | null = null;
  try {
    uid = auth().userId;
  } catch {}
  const limited = await enforceRateLimit(req, uid, 'staff');
  if (limited) return limited;
  const who = await currentRole();
  if (who?.role !== 'admin') return json({ error: 'Only Socria admins can do this.' }, 403);
  return null;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await gate(req);
  if (denied) return denied;
  if (!EVENT_ID.test(params.id)) return json({ error: 'Not found.' }, 404);
  try {
    const event = await getEvent(params.id);
    if (!event) return json({ error: 'Not found.' }, 404);
    const checked = checkEventPatch(await req.json().catch(() => null), event);
    if (!checked.ok) return json({ error: checked.error }, 400);
    await updateEvent(event.id, checked.patch);
    if (checked.patch.title) afterChange(event.id);
    return json({ event: await getEvent(event.id) });
  } catch (e) {
    return storeFailure(e);
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const denied = await gate(req);
  if (denied) return denied;
  if (!EVENT_ID.test(params.id)) return json({ error: 'Not found.' }, 404);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  try {
    if (body?.action === 'sync') {
      const r = await syncEvent(params.id);
      return json(r, r.status === 'failed' ? 502 : 200);
    }
    if (body?.action === 'delete') {
      const id = typeof body.registrationId === 'string' && REG_ID.test(body.registrationId) ? body.registrationId : null;
      const row = id ? await findById(id) : null;
      if (!row || row.event_id !== params.id) return json({ error: 'Not found.' }, 404);
      await deleteRegistration(row.id);
      afterChange(params.id);
      return json({ deleted: true });
    }
    return json({ error: 'Unknown action.' }, 400);
  } catch (e) {
    return storeFailure(e);
  }
}
