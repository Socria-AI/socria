'use client';

// The venue check-in, two ways in:
//   1. Find your RSVP — one field, the name or email it was made with.
//   2. Didn't RSVP? — one button opens the RSVP's questions, and answering
//      them checks you in.

import { useRef, useState } from 'react';
import { RsvpForm } from './RsvpForm';

export function CheckinFlow({ eventId, open }: { eventId: string; open: boolean }) {
  const [mode, setMode] = useState<'find' | 'new'>('find');
  const [who, setWho] = useState('');
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; notFound: boolean } | null>(null);
  const [done, setDone] = useState<{ firstName: string; already: boolean } | null>(null);
  const started = useRef(Date.now());

  if (!open) {
    return (
      <section className="ev-card">
        <h2>Check-in isn’t open yet</h2>
        <p className="ev-fine">It opens at the door when the event starts. If you’re here now, find a member of the Socria team.</p>
      </section>
    );
  }

  if (done) {
    return (
      <section className="ev-card" aria-live="polite">
        <span className="ev-badge attended">{done.already ? 'Already checked in' : 'Checked in'}</span>
        <h2>{done.already ? `You’re already checked in, ${done.firstName}.` : `Welcome, ${done.firstName}.`}</h2>
        <p className="ev-fine">{done.already ? 'No need to do anything else — head on in.' : 'You’re checked in. Head on in, and enjoy it.'}</p>
      </section>
    );
  }

  if (mode === 'new') {
    return (
      <div className="stack" style={{ gap: 12 }}>
        <button type="button" className="ev-link" style={{ width: 'fit-content', fontSize: '.92rem' }} onClick={() => setMode('find')}>
          ← I did RSVP
        </button>
        <RsvpForm eventId={eventId} open mode="checkin" />
      </div>
    );
  }

  async function find(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (who.trim().length < 2) return setError({ text: 'Enter the name or email you RSVP’d with.', notFound: false });
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/events/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, who, website, elapsedMs: Date.now() - started.current }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) setDone({ firstName: j.firstName, already: !!j.already });
      else setError({ text: j.error || 'Something went wrong. Please try again.', notFound: j.code === 'not-found' });
    } catch {
      setError({ text: 'Could not reach Socria. Check your connection and try again.', notFound: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ev-card" aria-labelledby="ck-h">
      <div className="stack" style={{ gap: 6 }}>
        <h2 id="ck-h">Check in</h2>
        <p className="ev-fine">Enter the name or email you RSVP’d with.</p>
      </div>
      <form onSubmit={find} noValidate className="stack" style={{ gap: 14 }}>
        <div className="ev-field">
          <label htmlFor="ck-who">Name or email you RSVP’d with</label>
          <input id="ck-who" className="ev-input" autoComplete="email" autoCapitalize="words" spellCheck={false} value={who} onChange={(e) => setWho(e.target.value)} maxLength={254} aria-invalid={!!error} aria-describedby={error ? 'ck-err' : undefined} placeholder="e.g. Madison Carby or madison@gmail.com" />
        </div>
        <div className="ev-hp" aria-hidden="true">
          <label htmlFor="ck-website">Website</label>
          <input id="ck-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>
        {error && (
          <p id="ck-err" className="ev-err" role="alert">
            {error.text}
            {error.notFound ? ' Check the spelling, or check in below if you didn’t RSVP.' : ''}
          </p>
        )}
        <button type="submit" className="ev-btn ev-submit" disabled={busy}>
          {busy ? 'Checking you in…' : 'Check in'}
        </button>
      </form>
      <hr className="rule" />
      <div className="stack" style={{ gap: 8 }}>
        <button type="button" className={error?.notFound ? 'ev-btn moss ev-submit' : 'ev-ghost'} style={error?.notFound ? undefined : { justifyContent: 'center' }} onClick={() => setMode('new')}>
          Didn’t RSVP? Check in here
        </button>
      </div>
    </section>
  );
}
