'use client';

// The attendee's confirmation: the event, how check-in works (scan the QR
// code at the door, then type the name or email used here), and what they
// can do with it — keep it, add it to a calendar, or cancel. Shared by the
// RSVP form's success state and the saved confirmation page.

import { useState } from 'react';
import { whenSaid, type Ticket } from '@/lib/events/model';

export function TicketCard({ ticket, token, onCancelled }: { ticket: Ticket; token: string; onCancelled?: () => void }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://socria.app';
  const when = whenSaid(ticket.event.when);
  const saveUrl = `${origin}/events/${ticket.event.id}/ticket#t=${token}`;
  const [copied, setCopied] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [cancelState, setCancelState] = useState<'idle' | 'busy' | 'error'>('idle');
  const [cancelError, setCancelError] = useState('');

  async function copy() {
    try {
      await navigator.clipboard.writeText(saveUrl);
      setCopied('Link copied. Keep it somewhere you’ll find it — your email has it too.');
    } catch {
      setCopied('Copy this link to keep your confirmation: ' + saveUrl);
    }
  }

  async function cancel() {
    setCancelState('busy');
    try {
      const res = await fetch('/api/events/ticket', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCancelState('error');
        setCancelError(j.error || 'Could not cancel. Please try again.');
        return;
      }
      try {
        localStorage.removeItem(`socria.event.${ticket.event.id}`);
      } catch {}
      onCancelled?.();
    } catch {
      setCancelState('error');
      setCancelError('Could not reach Socria. Check your connection and try again.');
    }
  }

  const attended = ticket.attendance === 'attended';
  return (
    <div className="ev-ticket">
      <div className="stack" style={{ gap: 8 }}>
        <span className={`ev-badge${attended ? ' attended' : ''}`}>{attended ? 'Checked in' : 'You’re registered'}</span>
        <h2>{ticket.firstName ? `See you there, ${ticket.firstName}.` : 'See you there.'}</h2>
      </div>

      {!attended && (
        <div className="ev-note stack" style={{ gap: 4 }}>
          <strong>Checking in at the event</strong>
          <span>Scan the QR code at the door, then enter the name or the email you just used. That’s it.</span>
        </div>
      )}

      <dl className="ev-facts">
        <div className="ev-fact wide">
          <dt>Event</dt>
          <dd>{ticket.event.title}</dd>
        </div>
        <div className="ev-fact">
          <dt>Date</dt>
          <dd>{when ? when.date : 'To be announced'}</dd>
        </div>
        <div className="ev-fact">
          <dt>Time</dt>
          <dd>{when ? when.time : 'To be announced'}</dd>
        </div>
        <div className="ev-fact wide">
          <dt>Location</dt>
          <dd>{ticket.event.location}</dd>
        </div>
      </dl>
      {!when && <p className="ev-fine">We’ll email you the date and time as soon as they’re confirmed.</p>}

      <div className="ev-actions">
        <button type="button" className="ev-ghost" onClick={copy}>
          Save my confirmation link
        </button>
        {when && (
          <a className="ev-ghost" href={`/api/events/${ticket.event.id}/ics`}>
            Add to calendar
          </a>
        )}
      </div>
      {copied && (
        <p className="ev-fine" role="status" style={{ wordBreak: 'break-all' }}>
          {copied}
        </p>
      )}

      {!attended && (
        <div className="stack" style={{ gap: 8 }}>
          {!confirming ? (
            <button type="button" className="ev-link" style={{ width: 'fit-content', fontSize: '.92rem' }} onClick={() => setConfirming(true)}>
              Can’t make it? Cancel my registration
            </button>
          ) : (
            <div className="ev-note warn stack" style={{ gap: 10 }}>
              <p>Cancel and delete your registration? Your name and email are removed from our records and the attendee sheet.</p>
              <div className="ev-actions">
                <button type="button" className="ev-ghost danger" onClick={cancel} disabled={cancelState === 'busy'}>
                  {cancelState === 'busy' ? 'Cancelling…' : 'Yes, cancel'}
                </button>
                <button type="button" className="ev-ghost" onClick={() => setConfirming(false)}>
                  Keep my place
                </button>
              </div>
              {cancelState === 'error' && <p className="ev-err">{cancelError}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
