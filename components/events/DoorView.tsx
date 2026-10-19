'use client';

// The door: built to check someone in within a few seconds on a phone.
// Type a name, an email or a code; tap Check in. No smartphone? The code or
// the name is enough. Someone who never RSVP'd RSVPs on the spot, then checks in.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DoorRow } from '@/lib/events/model';

async function post(body: unknown) {
  const r = await fetch('/api/events/staff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, j: await r.json().catch(() => ({})) };
}
const time = (ms: number | null) => (ms ? new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '');

export function DoorView({ eventId, title }: { eventId: string; title: string }) {
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<DoorRow[]>([]);
  const [counts, setCounts] = useState<{ total: number; attended: number } | null>(null);
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const seq = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  const search = useCallback(
    async (text: string) => {
      const n = ++seq.current;
      const { status, j } = await post({ action: 'lookup', eventId, q: text }).catch(() => ({ status: 0, j: {} as any }));
      if (n !== seq.current) return;
      if (status === 200) {
        setPeople(j.people);
        setCounts({ total: j.total, attended: j.attended });
      } else setMsg({ text: j.error || 'Could not search. Check the connection.', tone: 'warn' });
    },
    [eventId]
  );

  useEffect(() => {
    void search('');
  }, [search]);
  useEffect(() => {
    const t = setTimeout(() => q.trim().length >= 2 && search(q), 180);
    return () => clearTimeout(t);
  }, [q, search]);

  async function checkIn(p: DoorRow) {
    setBusy(p.id);
    const { status, j } = await post({ action: 'checkin', eventId, registrationId: p.id }).catch(() => ({ status: 0, j: {} as any }));
    setBusy(null);
    if (status !== 200) return setMsg({ text: j.error || 'Could not check them in.', tone: 'warn' });
    setPeople((list) => list.map((x) => (x.id === p.id ? j.person : x)));
    setCounts((c) => (c && !j.already ? { ...c, attended: c.attended + 1 } : c));
    setMsg(j.already ? { text: `${p.name} was already checked in at ${time(j.person.checkedInAt)}.`, tone: 'warn' } : { text: `${p.name} is checked in.`, tone: 'ok' });
    setQ('');
    input.current?.focus();
  }

  async function undo(p: DoorRow) {
    setBusy(p.id);
    const { status, j } = await post({ action: 'undo', eventId, registrationId: p.id }).catch(() => ({ status: 0, j: {} as any }));
    setBusy(null);
    if (status !== 200) return setMsg({ text: j.error || 'Could not undo.', tone: 'warn' });
    setPeople((list) => list.map((x) => (x.id === p.id ? j.person : x)));
    setCounts((c) => (c ? { ...c, attended: Math.max(0, c.attended - 1) } : c));
    setMsg({ text: `Check-in undone for ${p.name}.`, tone: 'ok' });
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="stack" style={{ gap: 6 }}>
        <span className="ev-fine">Door · {title}</span>
        <h1 className="ev-h2">Check-in</h1>
        {counts && (
          <p className="ev-fine" aria-live="polite">
            <strong>{counts.attended}</strong> checked in of {counts.total} registered
          </p>
        )}
      </div>

      <label htmlFor="door-q" className="ev-legend">
        Name, email or code
      </label>
      <input ref={input} id="door-q" className="ev-input" autoFocus autoComplete="off" autoCapitalize="words" spellCheck={false} placeholder="e.g. Maya, or K7P4QX" value={q} onChange={(e) => setQ(e.target.value)} />

      {msg && (
        <p className={`ev-note${msg.tone === 'warn' ? ' warn' : ''}`} role="status">
          {msg.text}
        </p>
      )}

      <ul className="stack" style={{ gap: 8, listStyle: 'none', margin: 0, padding: 0 }}>
        {people.map((p) => (
          <li key={p.id} className="ev-door-row">
            <div className="who">
              <strong>{p.name}</strong>
              <span>
                {p.emailHint} · {p.code}
              </span>
            </div>
            {p.attendance === 'attended' ? (
              <div className="stack" style={{ gap: 4, alignItems: 'flex-end' }}>
                <span className="ev-badge attended">In · {time(p.checkedInAt)}</span>
                <button type="button" className="ev-fine" style={{ textDecoration: 'underline' }} onClick={() => undo(p)} disabled={busy === p.id}>
                  Undo
                </button>
              </div>
            ) : (
              <button type="button" className="ev-btn moss" onClick={() => checkIn(p)} disabled={busy === p.id}>
                {busy === p.id ? '…' : 'Check in'}
              </button>
            )}
          </li>
        ))}
        {q.trim().length >= 2 && people.length === 0 && (
          <li className="ev-fine">
            No RSVP by that name, email or code. They can RSVP on the spot at <a className="ev-link" href={`/events/${eventId}`}>the event page</a>, then check in.
          </li>
        )}
      </ul>

      <p className="ev-fine">Attendees normally check themselves in by scanning the QR code at the door. Use this list for anyone who can’t.</p>
    </div>
  );
}
