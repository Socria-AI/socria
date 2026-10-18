// app/api/events/admin/[id]/export/route.ts — the attendee list as CSV. Admins only.
// The same columns as the Google Sheet; never cached.

import { getEvent, listRegistrations } from '@/lib/events/store';
import { EVENT_ID, toCsv } from '@/lib/events/model';
import { currentRole } from '@/lib/events/staff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const who = await currentRole();
  if (who?.role !== 'admin') return new Response('Not found', { status: 404 });
  if (!EVENT_ID.test(params.id)) return new Response('Not found', { status: 404 });
  const event = await getEvent(params.id);
  if (!event) return new Response('Not found', { status: 404 });
  const csv = toCsv(await listRegistrations(event.id), event.title);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${event.id}-registrations-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
