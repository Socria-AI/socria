// app/events/admin/page.tsx — Socria events, for staff and admins only.
// Anyone else gets the same 404 as a page that does not exist.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NOINDEX } from '@/lib/seo';
import { currentRole } from '@/lib/events/staff';
import { listEvents, listRegistrations } from '@/lib/events/store';
import { retentionDays } from '@/lib/events/model';
import { AdminList, type ListedEvent } from '@/components/events/AdminList';
import '../../app-shell.css';
import '../events.css';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata: Metadata = { ...NOINDEX, title: 'Events admin' };

export default async function Page() {
  const who = await currentRole();
  if (!who) notFound();
  const admin = who.role === 'admin';
  const events = await listEvents().catch(() => []);
  const listed: ListedEvent[] = await Promise.all(
    events.map(async (e) => {
      const regs = admin ? await listRegistrations(e.id).catch(() => null) : null;
      return {
        id: e.id,
        title: e.title,
        status: e.status,
        dateConfirmed: e.date_confirmed,
        startsAt: e.starts_at,
        timezone: e.timezone,
        rsvps: regs ? regs.filter((r) => r.registered_via === 'web').length : null,
        attended: regs ? regs.filter((r) => r.attendance === 'attended').length : null,
      };
    })
  );
  return (
    <div className="app-root">
      <main className="ev-page">
        <AdminList events={listed} admin={admin} retention={retentionDays()} />
      </main>
    </div>
  );
}
