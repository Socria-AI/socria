// app/events/[id]/ticket/page.tsx — an attendee's saved confirmation.
// The page itself holds nothing personal; the confirmation is fetched by the
// secret in the link's #fragment (components/events/TicketPage.tsx).

import type { Metadata } from 'next';
import Link from 'next/link';
import { NOINDEX } from '@/lib/seo';
import { EVENT_ID } from '@/lib/events/model';
import { notFound } from 'next/navigation';
import { TicketPage } from '@/components/events/TicketPage';
import '../../../app-shell.css';
import '../../events.css';

export const metadata: Metadata = { ...NOINDEX, title: 'Your confirmation', referrer: 'no-referrer' };

export default function Page({ params }: { params: { id: string } }) {
  if (!EVENT_ID.test(params.id)) notFound();
  return (
    <div className="app-root">
      <main className="ev-page">
        <div className="ev-wrap" style={{ width: 'min(520px,100%)' }}>
          <header className="ev-top">
            <Link href="/" className="auth-mark" aria-label="Socria home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/socria-logo.png" alt="" width={30} height={30} />
              <span>Socria</span>
            </Link>
          </header>
          <TicketPage eventId={params.id} />
        </div>
      </main>
    </div>
  );
}
