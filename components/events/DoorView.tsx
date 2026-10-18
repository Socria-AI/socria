'use client';

// The door: built to check someone in within a few seconds on a phone.
// Type a name, an email or a code; tap Check in. No smartphone? The code or
// the name is enough. Someone who never registered? Add them as a walk-in —
// a name, and an email only if they want to give one.

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
  const [walk, setWalk] = useState(false);
  const [wName, setWName] = useState('');
  const [wEmail, setWEmail] = useState('');
  const [wErr, setWErr] = useState('');
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

  async function addWalkIn(e: React.FormEvent) {
    e.preventDefault();
    setWErr('');
    setBusy('walkin');
    const { status, j } = await post({ action: 'walkin', eventId, fullName: wName, email: wEmail }).catch(() => ({ status: 0, j: {} as any }));
    setBusy(null);
    if (status === 201) {
      setMsg({ text: `${j.person.name} added and checked in.`, tone: 'ok' });
      setCounts((c) => (c ? { total: c.total + 1, attended: c.attended + 1 } : c));
      setWName('');
      setWEmail('');
      setWalk(false);
      return;
    }
    if (j.code === 'duplicate' && j.person) {
      setWalk(false);
      setPeople([j.person]);
      setMsg({ text: 'They already registered — check them in below.', tone: 'warn' });
      return;
    }
    setWErr(j.error || 'Could not add them.');
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
                {p.via === 'walk-in' ? ' · walk-in' : ''}
              </span>
            </div>
            {p.attendance === 'attended' ? (
              <div className="stack" style={{ gap: 4, alignItems: 'flex-end' }}>
                <span className="ev-badge attended">In · {time(p.checkedInAt)}</span>
                {p.via === 'web' && (
                  <button type="button" className="ev-fine" style={{ textDecoration: 'underline' }} onClick={() => undo(p)} disabled={busy === p.id}>
                    Undo
                  </button>
                )}
              </div>
            ) : (
              <button type="button" className="ev-btn moss" onClick={() => checkIn(p)} disabled={busy === p.id}>
                {busy === p.id ? '…' : 'Check in'}
              </button>
            )}
          </li>
        ))}
        {q.trim().length >= 2 && people.length === 0 && <li className="ev-fine">No one by that name, email or code. Add them as a walk-in below.</li>}
      </ul>

      {!walk ? (
        <button type="button" className="ev-ghost" style={{ width: 'fit-content' }} onClick={() => setWalk(true)}>
          + Add a walk-in
        </button>
      ) : (
        <form className="ev-panel" onSubmit={addWalkIn}>
          <h3>Walk-in</h3>
          <div className="ev-field">
            <label htmlFor="walk-name">Full name</label>
            <input id="walk-name" className="ev-input" value={wName} onChange={(e) => setWName(e.target.value)} autoFocus required maxLength={100} />
          </div>
          <div className="ev-field">
            <label htmlFor="walk-email">
              Email <span className="opt">(optional)</span>
            </label>
            <input id="walk-email" className="ev-input" type="email" inputMode="email" autoCapitalize="off" value={wEmail} onChange={(e) => setWEmail(e.target.value)} maxLength={254} />
          </div>
          {wErr && <p className="ev-err">{wErr}</p>}
          <p className="ev-fine">Walk-ins aren’t added to any mailing list.</p>
          <div className="ev-actions">
            <button type="submit" className="ev-btn moss" disabled={busy === 'walkin'}>
              {busy === 'walkin' ? 'Adding…' : 'Add and check in'}
            </button>
            <button type="button" className="ev-ghost" onClick={() => setWalk(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      <p className="ev-fine">Scanning an attendee’s QR code with your phone camera opens their record here to confirm.</p>
    </div>
  );
}
