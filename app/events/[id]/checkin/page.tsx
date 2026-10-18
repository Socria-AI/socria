// app/events/[id]/checkin/page.tsx — check in at the door.
//
// Where the QR code at the venue points. The attendee gives their name, a
// personal email (not a UTA one) and the RSVP's optional answers, and is
// checked in — matched to their RSVP by email if they made one. Takes
// check-ins only while an admin has switched self check-in on; otherwise it
// says so and points them to the team at the door.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Label } from '@/components/journal/ds';
import { NOINDEX } from '@/lib/seo';
import { getEvent } from '@/lib/events/store';
import { publicEvent, type PublicEvent } from '@/lib/events/model';
import { RsvpForm } from '@/components/events/RsvpForm';
import '../../../app-shell.css';
import '../../events.css';

// Read on every visit, so switching check-in on or off takes effect at once.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { ...NOINDEX, title: 'Check in' };

async function load(id: string): Promise<PublicEvent | null> {
  try {
    const row = await getEvent(id);
    return row && row.status !== 'draft' ? publicEvent(row) : null;
  } catch {
    return null;
  }
}

export default async function CheckinPage({ params }: { params: { id: string } }) {
  const e = await load(params.id);
  if (!e) notFound();
  return (
    <div className="app-root">
      <main className="ev-page">
        <div className="ev-wrap" style={{ width: 'min(560px,100%)' }}>
          <header className="ev-top">
            <Link href="/" className="auth-mark" aria-label="Socria home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/socria-logo.png" alt="" width={30} height={30} />
              <span>Socria</span>
            </Link>
          </header>
          <div className="stack" style={{ gap: 10 }}>
            <Label tone="moss">Check-in</Label>
            <h1 className="ev-h2" style={{ fontSize: 'clamp(1.8rem,5vw,2.4rem)' }}>{e.title}</h1>
            <p className="ev-fine">{e.location}</p>
          </div>
          <RsvpForm eventId={e.id} open={e.selfCheckin && e.status !== 'cancelled'} mode="checkin" />
        </div>
      </main>
    </div>
  );
}
