'use client';

// The RSVP: two required fields, two optional questions, a separate and
// unticked marketing choice, and a plain note on how the answers are used.
// On success the same card becomes the confirmation, and the secret is kept
// on this device (and in the saved link's #fragment) — never in a URL a
// server or analytics tool would record.

import { useEffect, useRef, useState } from 'react';
import { INTERESTS, MARKETING_CONSENT_TEXT, SOURCES, type Ticket } from '@/lib/events/model';
import { TicketCard } from './TicketCard';

type Field = 'fullName' | 'email' | 'form';

/** The campaign tags and referral code a link of ours carried, as tokens; read once on load. */
function linkTags(): { utm: Record<string, string>; ref: string | null } {
  try {
    const q = new URLSearchParams(window.location.search);
    const utm: Record<string, string> = {};
    for (const k of ['source', 'medium', 'campaign']) {
      const v = q.get(`utm_${k}`);
      if (v) utm[k] = v.slice(0, 40);
    }
    return { utm, ref: q.get('ref')?.slice(0, 40) ?? null };
  } catch {
    return { utm: {}, ref: null };
  }
}

export function RsvpForm({ eventId, open }: { eventId: string; open: boolean }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [interest, setInterest] = useState('');
  const [interestOther, setInterestOther] = useState('');
  const [source, setSource] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: Field; text: string } | null>(null);
  const [done, setDone] = useState<{ ticket: Ticket; token: string } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const started = useRef(Date.now());
  const key = `socria.event.${eventId}`;

  // Registered on this device before? Offer the confirmation instead of the form.
  useEffect(() => {
    try {
      const t = localStorage.getItem(key);
      if (t && /^[A-Za-z0-9_-]{43}$/.test(t)) setSaved(t);
    } catch {}
  }, [key]);

  useEffect(() => {
    if (!saved) return;
    let off = false;
    void fetch('/api/events/ticket', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: saved }) })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (off) return;
        if (r.ok && j.ticket) setDone({ ticket: j.ticket, token: saved });
        else {
          try {
            localStorage.removeItem(key);
          } catch {}
          setSaved(null);
        }
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [saved, key]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (fullName.trim().length < 2) return setError({ field: 'fullName', text: 'Please enter your full name.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setError({ field: 'email', text: 'Please enter a valid email address.' });
    setBusy(true);
    const { utm, ref } = linkTags();
    try {
      const res = await fetch('/api/events/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          fullName,
          email,
          interest: interest || undefined,
          interestOther: interest === 'other' ? interestOther : undefined,
          source: source || undefined,
          marketingConsent: consent,
          utm,
          ref,
          website,
          elapsedMs: Date.now() - started.current,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError({ field: (j.field as Field) || 'form', text: j.error || 'Something went wrong. Please try again.' });
        return;
      }
      try {
        localStorage.setItem(key, j.token);
      } catch {}
      setDone({ ticket: j.ticket, token: j.token });
      requestAnimationFrame(() => document.getElementById('rsvp')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch {
      setError({ field: 'form', text: 'Could not reach Socria. Check your connection and try again.' });
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className="ev-card" id="rsvp" aria-live="polite">
        <TicketCard
          ticket={done.ticket}
          token={done.token}
          onCancelled={() => {
            setDone(null);
            setSaved(null);
            setCancelled(true);
          }}
        />
      </section>
    );
  }

  if (!open) {
    return (
      <section className="ev-card" id="rsvp">
        <h2>Registration is closed</h2>
        <p className="ev-fine">Registration for this event isn’t open right now.</p>
      </section>
    );
  }

  const invalid = (f: Field) => error?.field === f;
  return (
    <section className="ev-card" id="rsvp" aria-labelledby="rsvp-h">
      <div className="stack" style={{ gap: 6 }}>
        <h2 id="rsvp-h">Save your place</h2>
        <p className="ev-fine">Free. Takes under a minute. No account needed.</p>
      </div>
      {cancelled && <p className="ev-note" role="status">Your registration was cancelled and deleted. You’re welcome to register again.</p>}
      <form onSubmit={submit} noValidate className="stack" style={{ gap: 16 }}>
        <div className="ev-field">
          <label htmlFor="rsvp-name">Full name</label>
          <input id="rsvp-name" className="ev-input" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={100} required aria-invalid={invalid('fullName')} aria-describedby={invalid('fullName') ? 'rsvp-err' : undefined} />
        </div>
        <div className="ev-field">
          <label htmlFor="rsvp-email">Email</label>
          <input id="rsvp-email" className="ev-input" type="email" inputMode="email" autoComplete="email" autoCapitalize="off" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} required aria-invalid={invalid('email')} aria-describedby={invalid('email') ? 'rsvp-err' : 'rsvp-email-note'} />
          <span id="rsvp-email-note" className="ev-fine">Any address works — personal or school.</span>
        </div>

        <fieldset className="ev-field">
          <legend className="ev-legend">
            What interests you most? <span className="opt">(optional)</span>
          </legend>
          <div className="ev-chips" style={{ marginTop: 8 }}>
            {INTERESTS.map((i) => (
              <label key={i.id} className="ev-chip">
                <input type="radio" name="interest" value={i.id} checked={interest === i.id} onChange={() => setInterest(i.id)} onClick={() => interest === i.id && setInterest('')} />
                <span>{i.label}</span>
              </label>
            ))}
          </div>
          {interest === 'other' && (
            <input className="ev-input" style={{ marginTop: 8 }} aria-label="What interests you" placeholder="Tell us in a few words" value={interestOther} onChange={(e) => setInterestOther(e.target.value)} maxLength={120} />
          )}
        </fieldset>

        <fieldset className="ev-field">
          <legend className="ev-legend">
            How did you hear about it? <span className="opt">(optional)</span>
          </legend>
          <div className="ev-chips" style={{ marginTop: 8 }}>
            {SOURCES.map((s) => (
              <label key={s.id} className="ev-chip">
                <input type="radio" name="source" value={s.id} checked={source === s.id} onChange={() => setSource(s.id)} onClick={() => source === s.id && setSource('')} />
                <span>{s.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="ev-check">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            {MARKETING_CONSENT_TEXT} <span className="ev-fine">(optional)</span>
          </span>
        </label>

        {/* left empty by people; filled by bots */}
        <div className="ev-hp" aria-hidden="true">
          <label htmlFor="rsvp-website">Website</label>
          <input id="rsvp-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>

        {error && (
          <p id="rsvp-err" className="ev-err" role="alert">
            {error.text}
          </p>
        )}
        <button type="submit" className="ev-btn ev-submit" disabled={busy}>
          {busy ? 'Saving your place…' : 'RSVP — it’s free'}
        </button>

        <p className="ev-fine">
          <strong>How we use this:</strong> your name and email are used to run this event — your confirmation, check-in, and updates about this
          event, such as its date and time. Your answers to the optional questions help us plan. Only Socria event staff can see your registration, which may also be
          copied to a private spreadsheet only they can open. If you have or later create a Socria account with the same verified email, it may be counted in
          event totals, never shown individually. We don’t create an account for you, sell your information, or email you about anything else unless you
          tick the box above. You can cancel and delete your registration from your confirmation at any time; otherwise it’s deleted within a year of
          the event. <a href="/privacy">Privacy policy</a>
        </p>
      </form>
    </section>
  );
}
