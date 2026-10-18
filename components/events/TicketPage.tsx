'use client';

// The saved confirmation: the secret arrives in the link's #fragment, which
// browsers never send to a server, and is posted to /api/events/ticket.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Ticket } from '@/lib/events/model';
import { TicketCard } from './TicketCard';

export function tokenFromHash(hash: string): string | null {
  const m = /(?:^#|&)t=([A-Za-z0-9_-]{43})(?:&|$)/.exec(hash);
  return m ? m[1] : null;
}

export function TicketPage({ eventId }: { eventId: string }) {
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'ok'; ticket: Ticket; token: string } | { kind: 'error'; text: string } | { kind: 'cancelled' }>({ kind: 'loading' });
  useEffect(() => {
    let token = tokenFromHash(window.location.hash);
    if (!token) {
      try {
        const t = localStorage.getItem(`socria.event.${eventId}`);
        if (t && /^[A-Za-z0-9_-]{43}$/.test(t)) token = t;
      } catch {}
    }
    if (!token) return setState({ kind: 'error', text: 'This link is missing its confirmation code. Open the link from your confirmation email, or just give your name at the door.' });
    const tok = token;
    void fetch('/api/events/ticket', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tok }) })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.ticket) {
          try {
            localStorage.setItem(`socria.event.${j.ticket.event.id}`, tok);
          } catch {}
          setState({ kind: 'ok', ticket: j.ticket, token: tok });
        } else setState({ kind: 'error', text: j.error || 'This confirmation link is not valid.' });
      })
      .catch(() => setState({ kind: 'error', text: 'Could not reach Socria. Check your connection and try again.' }));
  }, [eventId]);

  return (
    <section className="ev-card" aria-live="polite">
      {state.kind === 'loading' && <p className="ev-fine">Opening your confirmation…</p>}
      {state.kind === 'ok' && <TicketCard ticket={state.ticket} token={state.token} onCancelled={() => setState({ kind: 'cancelled' })} />}
      {state.kind === 'cancelled' && (
        <div className="stack" style={{ gap: 12 }}>
          <h2>Registration cancelled</h2>
          <p className="ev-fine">Your registration and its details have been deleted. Changed your mind? You can register again.</p>
          <Link className="ev-link" href={`/events/${eventId}`}>Back to the event</Link>
        </div>
      )}
      {state.kind === 'error' && (
        <div className="stack" style={{ gap: 12 }}>
          <h2>We couldn’t open that</h2>
          <p className="ev-fine">{state.text}</p>
          <Link className="ev-link" href={`/events/${eventId}`}>Go to the event page</Link>
        </div>
      )}
    </section>
  );
}
