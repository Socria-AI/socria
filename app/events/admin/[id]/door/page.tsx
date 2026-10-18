// app/events/admin/[id]/door/page.tsx — check-in at the door, for staff and admins.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NOINDEX } from '@/lib/seo';
import { currentRole } from '@/lib/events/staff';
import { getEvent } from '@/lib/events/store';
import { DoorView } from '@/components/events/DoorView';
import '../../../../app-shell.css';
import '../../../events.css';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata: Metadata = { ...NOINDEX, title: 'Door check-in' };

export default async function Page({ params }: { params: { id: string } }) {
  const who = await currentRole();
  if (!who) notFound();
  const event = await getEvent(params.id);
  if (!event) notFound();
  return (
    <div className="app-root">
      <main className="ev-page">
        <div className="ev-wrap" style={{ width: 'min(560px,100%)' }}>
          <Link href={who.role === 'admin' ? `/events/admin/${event.id}` : '/events/admin'} className="ev-fine">
            ← {who.role === 'admin' ? 'Event dashboard' : 'All events'}
          </Link>
          <DoorView eventId={event.id} title={event.title} />
        </div>
      </main>
    </div>
  );
}
