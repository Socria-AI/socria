// app/events/[id]/checkin/page.tsx — check in at the door.
//
// Where the QR code at the venue points — how everyone comes in. People who
// RSVP'd type the name or email they used; anyone who didn't presses
// "Didn't RSVP? Check in here" and answers the RSVP's questions. Takes
// check-ins only while an admin has switched self check-in on.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Label } from '@/components/ds';
import { NOINDEX } from '@/lib/seo';
import { getEvent } from '@/lib/events/store';
import { publicEvent, type PublicEvent } from '@/lib/events/model';
import { CheckinFlow } from '@/components/events/CheckinFlow';
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
          <CheckinFlow eventId={e.id} open={e.selfCheckin && e.status !== 'cancelled'} />
        </div>
      </main>
    </div>
  );
}
