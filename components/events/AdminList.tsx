'use client';

// All events, for staff (door links) and admins (plus a new event and the retention sweep).

import { useState } from 'react';
import Link from 'next/link';

export interface ListedEvent {
  id: string;
  title: string;
  status: string;
  dateConfirmed: boolean;
  startsAt: number | null;
  timezone: string;
  rsvps: number | null;
  attended: number | null;
}

export function AdminList({ events, admin, retention }: { events: ListedEvent[]; admin: boolean; retention: number }) {
  const [id, setId] = useState('');
  const [title, setTitle] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch('/api/events/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, title }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(j.error || 'Could not create it.');
    window.location.href = `/events/admin/${j.event.id}`;
  }
  async function purge() {
    const r = await fetch('/api/events/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'purge' }) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? `Deleted ${j.deleted} registration${j.deleted === 1 ? '' : 's'} from events that ended more than ${retention} days ago.` : j.error || 'Could not run it.');
  }

  return (
    <div className="ev-admin">
      <header className="stack" style={{ gap: 6 }}>
        <span className="ev-fine">Socria · {admin ? 'Admin' : 'Event staff'}</span>
        <h1 className="ev-h2" style={{ fontSize: 'clamp(1.6rem,3vw,2.2rem)' }}>Events</h1>
      </header>
      {msg && <p className="ev-note" role="status">{msg}</p>}
      <div className="ev-table-wrap ev-panel">
        <table className="ev-table">
          <thead>
            <tr>
              <th>Event</th>
              <th>Date</th>
              <th>Status</th>
              {admin && <th>RSVPs</th>}
              {admin && <th>Checked in</th>}
              <th aria-label="Open" />
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td>
                  {e.title}
                  <div className="ev-fine">/events/{e.id}</div>
                </td>
                <td className="num">{e.startsAt && e.dateConfirmed ? new Date(e.startsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: e.timezone }) : 'Not confirmed'}</td>
                <td>{e.status}</td>
                {admin && <td className="num">{e.rsvps ?? '—'}</td>}
                {admin && <td className="num">{e.attended ?? '—'}</td>}
                <td style={{ whiteSpace: 'nowrap' }}>
                  {admin && (
                    <Link className="ev-ghost" href={`/events/admin/${e.id}`}>
                      Manage
                    </Link>
                  )}{' '}
                  <Link className="ev-ghost" href={`/events/admin/${e.id}/door`}>
                    Door
                  </Link>
                </td>
              </tr>
            ))}
            {!events.length && (
              <tr>
                <td colSpan={6} className="ev-fine">
                  No events yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {admin && (
        <div className="ev-cols">
          <form className="ev-panel" onSubmit={create}>
            <h3>New event</h3>
            <div className="ev-field">
              <label htmlFor="new-title">Title</label>
              <input id="new-title" className="ev-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Socria: In Public 003" />
            </div>
            <div className="ev-field">
              <label htmlFor="new-id">Address</label>
              <input id="new-id" className="ev-input" value={id} onChange={(e) => setId(e.target.value.toLowerCase())} placeholder="in-public-003" />
              <span className="ev-fine">/events/{id || 'in-public-003'} — starts as a draft, not public.</span>
            </div>
            <button type="submit" className="ev-btn" style={{ width: 'fit-content' }}>
              Create draft
            </button>
          </form>
          <section className="ev-panel">
            <h3>Retention</h3>
            <p className="ev-fine">
              Registrations are deleted {retention} days after their event ends, automatically each day. Run the sweep now if you need to.
            </p>
            <button type="button" className="ev-ghost" style={{ width: 'fit-content' }} onClick={purge}>
              Run retention sweep
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
