'use client';

// Where a scanned QR code lands (/events/check#t=…). Scanning only
// IDENTIFIES the person: a signed-in member of staff sees who it is and
// presses Confirm, and only that records attendance. Anyone else — including
// the attendee scanning their own code — is told to show it at the door, and
// learns nothing from it.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { DoorRow } from '@/lib/events/model';
import { tokenFromHash } from './TicketPage';

type State =
  | { kind: 'loading' }
  | { kind: 'not-staff' }
  | { kind: 'error'; text: string }
  | { kind: 'found'; person: DoorRow; event: { id: string; title: string } | null; token: string }
  | { kind: 'done'; person: DoorRow; already: boolean; event: { id: string; title: string } | null };

async function post(body: unknown) {
  const r = await fetch('/api/events/staff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, j: await r.json().catch(() => ({})) };
}

const time = (ms: number | null) => (ms ? new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '');

export function CheckScan() {
  const [s, setS] = useState<State>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const token = tokenFromHash(window.location.hash);
    // the secret is not left in the address bar or the history
    try {
      window.history.replaceState(null, '', window.location.pathname);
    } catch {}
    if (!token) return setS({ kind: 'error', text: 'This QR code didn’t carry a check-in code. Look the person up by name instead.' });
    void post({ action: 'resolve', token })
      .then(({ status, j }) => {
        if (status === 403 || status === 401) setS({ kind: 'not-staff' });
        else if (status === 200) setS({ kind: 'found', person: j.person, event: j.event, token });
        else setS({ kind: 'error', text: j.error || 'Could not find this registration.' });
      })
      .catch(() => setS({ kind: 'error', text: 'Could not reach Socria. Check the connection and try again.' }));
  }, []);

  async function confirm() {
    if (s.kind !== 'found' || !s.event) return;
    setBusy(true);
    const { status, j } = await post({ action: 'checkin', eventId: s.event.id, registrationId: s.person.id }).catch(() => ({ status: 0, j: {} as any }));
    setBusy(false);
    if (status === 200) setS({ kind: 'done', person: j.person, already: !!j.already, event: s.event });
    else setS({ kind: 'error', text: j.error || 'Could not check them in. Try again, or use the door list.' });
  }

  return (
    <section className="ev-card" aria-live="polite">
      {s.kind === 'loading' && <p className="ev-fine">Reading the code…</p>}
      {s.kind === 'not-staff' && (
        <div className="stack" style={{ gap: 12 }}>
          <span className="ev-badge">Your check-in code</span>
          <h2>Show this at the door</h2>
          <p className="ev-fine">This QR code is for Socria staff to scan when you arrive. If you work the door, sign in with your staff account and scan again.</p>
          <Link className="ev-link" href="/sign-in?redirect_url=%2Fevents%2Fadmin">Staff sign-in</Link>
        </div>
      )}
      {s.kind === 'error' && (
        <div className="stack" style={{ gap: 12 }}>
          <h2>Couldn’t check this code</h2>
          <p className="ev-fine">{s.text}</p>
          <Link className="ev-link" href="/events/admin">Open the door list</Link>
        </div>
      )}
      {s.kind === 'found' && (
        <div className="stack" style={{ gap: 14 }}>
          <span className="ev-fine">{s.event?.title}</span>
          <h2>{s.person.name}</h2>
          <p className="ev-fine">
            {s.person.emailHint} · code {s.person.code}
          </p>
          {s.person.attendance === 'attended' ? (
            <p className="ev-note warn">Already checked in at {time(s.person.checkedInAt)}.</p>
          ) : (
            <button type="button" className="ev-btn moss" onClick={confirm} disabled={busy}>
              {busy ? 'Checking in…' : 'Confirm check-in'}
            </button>
          )}
          {s.event && <Link className="ev-link" href={`/events/admin/${s.event.id}/door`}>Door list</Link>}
        </div>
      )}
      {s.kind === 'done' && (
        <div className="stack" style={{ gap: 14 }}>
          <span className="ev-badge attended">{s.already ? 'Already checked in' : 'Checked in'}</span>
          <h2>{s.person.name}</h2>
          <p className="ev-fine">{s.already ? `They were checked in at ${time(s.person.checkedInAt)}.` : `Checked in at ${time(s.person.checkedInAt)}. Welcome them in.`}</p>
          {s.event && <Link className="ev-link" href={`/events/admin/${s.event.id}/door`}>Door list</Link>}
        </div>
      )}
    </section>
  );
}
