// app/events/admin/[id]/page.tsx — one event's dashboard, for admins only.
// Read fresh on every request; never cached, never indexed.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NOINDEX } from '@/lib/seo';
import { currentRole } from '@/lib/events/staff';
import { getEvent, listRegistrations } from '@/lib/events/store';
import { statsOf } from '@/lib/events/model';
import { acquisitionFor } from '@/lib/events/acquisition';
import { syncState } from '@/lib/events/sheets';
import { AdminEvent } from '@/components/events/AdminEvent';
import '../../../app-shell.css';
import '../../events.css';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata: Metadata = { ...NOINDEX, title: 'Event dashboard' };

export default async function Page({ params }: { params: { id: string } }) {
  const who = await currentRole();
  if (who?.role !== 'admin') notFound();
  const event = await getEvent(params.id);
  if (!event) notFound();
  const regs = await listRegistrations(event.id);
  const [acq, sync] = await Promise.all([acquisitionFor(event.id, regs), syncState(event.id)]);
  const rows = regs.map(({ token_hash: _t, ...r }) => r);
  return (
    <div className="app-root">
      <main className="ev-page">
        <AdminEvent event={event} rows={rows} stats={statsOf(regs, event.timezone)} acq={acq} sync={sync} />
      </main>
    </div>
  );
}
