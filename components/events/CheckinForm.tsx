'use client';

// The venue check-in: one field — the name or the email used at RSVP — and
// a welcome. Nothing new is asked; check-in only finds the RSVP.

import { useRef, useState } from 'react';

export function CheckinForm({ eventId, open }: { eventId: string; open: boolean }) {
  const [who, setWho] = useState('');
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (who.trim().length < 2) return setError('Enter the name or email you RSVP’d with.');
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
      else setError(j.error || 'Something went wrong. Please try again.');
    } catch {
      setError('Could not reach Socria. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ev-card" aria-labelledby="ck-h">
      <div className="stack" style={{ gap: 6 }}>
        <h2 id="ck-h">Check in</h2>
        <p className="ev-fine">Enter the name or the email you used when you RSVP’d.</p>
      </div>
      <form onSubmit={submit} noValidate className="stack" style={{ gap: 14 }}>
        <div className="ev-field">
          <label htmlFor="ck-who">Your name or RSVP email</label>
          <input id="ck-who" className="ev-input" autoComplete="email" autoCapitalize="words" spellCheck={false} value={who} onChange={(e) => setWho(e.target.value)} maxLength={254} aria-invalid={!!error} aria-describedby={error ? 'ck-err' : undefined} placeholder="e.g. Maya Patel or maya@gmail.com" />
        </div>
        <div className="ev-hp" aria-hidden="true">
          <label htmlFor="ck-website">Website</label>
          <input id="ck-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>
        {error && (
          <p id="ck-err" className="ev-err" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="ev-btn ev-submit" disabled={busy}>
          {busy ? 'Checking you in…' : 'Check in'}
        </button>
        <p className="ev-fine">
          Didn’t RSVP? <a className="ev-link" href={`/events/${eventId}`}>RSVP now</a> — it takes a minute — then check in here.
        </p>
      </form>
    </section>
  );
}
