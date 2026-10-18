'use client';

// One event, for Socria admins: the numbers (confirmed apart from estimated),
// where people came from, the attendee list with search, filters and manual
// check-in, the Google Sheet's state, the event's own details, and links to
// share with tracking tags. Data arrives from the server page; every change
// goes through the admin and staff routes, which check the role again.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { INTERESTS, SOURCES, utcToZoned, zonedToUtc, type EventRow, type EventStats, type RegistrationRow } from '@/lib/events/model';
import type { Acquisition } from '@/lib/events/acquisition';
import type { SyncState } from '@/lib/events/sheets';

export type AdminRow = Omit<RegistrationRow, 'token_hash'>;

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 1000) / 10}%`);
const num = (v: number | null | undefined) => (v === null || v === undefined ? '—' : String(v));
const when = (ms: number | null, tz: string) => (ms ? new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz }) : '—');
const labelOf = (list: readonly { id: string; label: string }[], id: string | null) => list.find((x) => x.id === id)?.label ?? '—';

async function call(url: string, method: string, body: unknown) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: r.ok, status: r.status, j: await r.json().catch(() => ({})) };
}

function Kpi({ label, value, sub, tag }: { label: string; value: string; sub?: string; tag: 'conf' | 'est' }) {
  return (
    <div className="ev-kpi">
      <em className={tag}>{tag === 'conf' ? 'Confirmed' : 'Estimate'}</em>
      <b>{value}</b>
      <span>
        {label}
        {sub ? ` · ${sub}` : ''}
      </span>
    </div>
  );
}

function Bars({ items }: { items: { label: string; n: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.n));
  if (!items.length) return <p className="ev-fine">Nothing yet.</p>;
  return (
    <ul className="ev-bars">
      {items.map((i) => (
        <li key={i.label}>
          <span>{i.label}</span>
          <i style={{ width: `${(i.n / max) * 100}%` }} aria-hidden="true" />
          <b>{i.n}</b>
        </li>
      ))}
    </ul>
  );
}

/** RSVPs per day: columns on one scale, with the count on hover and in a table for screen readers. */
function Trend({ daily }: { daily: EventStats['daily'] }) {
  if (!daily.length) return <p className="ev-fine">No registrations yet.</p>;
  const W = 640, H = 160, L = 28, B = 22, T = 8;
  const max = Math.max(1, ...daily.map((d) => d.n));
  const step = max <= 5 ? 1 : Math.ceil(max / 4);
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
  const bw = (W - L) / daily.length;
  const y = (v: number) => T + (1 - v / (ticks[ticks.length - 1] || 1)) * (H - T - B);
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="ev-spark" role="img" aria-label={`RSVPs per day, ${daily.length} days`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W} y1={y(t)} y2={y(t)} stroke="rgba(31,31,31,.08)" />
            <text x={L - 6} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="rgba(31,31,31,.6)">{t}</text>
          </g>
        ))}
        {daily.map((d, i) => (
          <g key={d.day}>
            <rect x={L + i * bw + 2} y={y(d.n)} width={Math.max(2, bw - 4)} height={y(0) - y(d.n)} rx="3" fill="var(--moss)">
              <title>{`${d.day}: ${d.n}`}</title>
            </rect>
            {(daily.length <= 10 || i % Math.ceil(daily.length / 8) === 0) && (
              <text x={L + i * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="rgba(31,31,31,.6)">
                {d.day.slice(5)}
              </text>
            )}
          </g>
        ))}
      </svg>
      <table className="ev-hp">
        <tbody>
          {daily.map((d) => (
            <tr key={d.day}>
              <td>{d.day}</td>
              <td>{d.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function AdminEvent({ event: initial, rows: initialRows, stats, acq, sync: initialSync }: { event: EventRow; rows: AdminRow[]; stats: EventStats; acq: Acquisition; sync: SyncState }) {
  const [event, setEvent] = useState(initial);
  const [rows, setRows] = useState(initialRows);
  const [sync, setSync] = useState(initialSync);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'registered' | 'attended' | 'walk-in' | 'consented'>('all');
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const tz = event.timezone;

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      if (filter === 'registered' && r.attendance !== 'registered') return false;
      if (filter === 'attended' && r.attendance !== 'attended') return false;
      if (filter === 'walk-in' && r.registered_via !== 'walk-in') return false;
      if (filter === 'consented' && !r.marketing_consent) return false;
      const hay = `${r.full_name} ${r.email ?? ''} ${r.code}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [rows, q, filter]);

  async function checkIn(r: AdminRow, undo = false) {
    const { ok, j } = await call('/api/events/staff', 'POST', { action: undo ? 'undo' : 'checkin', eventId: event.id, registrationId: r.id });
    if (!ok) return setMsg(j.error || 'That did not work.');
    setRows((list) => list.map((x) => (x.id === r.id ? { ...x, attendance: j.person.attendance, checked_in_at: j.person.checkedInAt } : x)));
    setMsg(undo ? `Check-in undone for ${r.full_name}.` : j.already ? `${r.full_name} was already checked in.` : `${r.full_name} checked in.`);
  }

  async function remove(r: AdminRow) {
    const { ok, j } = await call(`/api/events/admin/${event.id}`, 'POST', { action: 'delete', registrationId: r.id });
    setConfirmDelete(null);
    if (!ok) return setMsg(j.error || 'Could not delete.');
    setRows((list) => list.filter((x) => x.id !== r.id));
    setMsg(`${r.full_name}’s registration was deleted, here and in the sheet.`);
  }

  async function resync() {
    setMsg('Syncing the sheet…');
    const { j } = await call(`/api/events/admin/${event.id}`, 'POST', { action: 'sync' });
    if (j.status === 'synced') {
      setSync((s) => ({ ...s, lastOkAt: Date.now(), lastRows: j.rows, lastError: null, pending: false }));
      setMsg(`Sheet synced: ${j.rows} registrations.`);
    } else if (j.status === 'unconfigured') setMsg('Google Sheets is not connected on this deployment. See docs/EVENTS.md.');
    else if (j.status === 'queued') setMsg('A sync is already running; it will include the latest changes.');
    else {
      setSync((s) => ({ ...s, lastError: j.error, lastErrorAt: Date.now(), pending: true }));
      setMsg(`Sync failed: ${j.error}`);
    }
  }

  // ── the event's own details ──
  const [form, setForm] = useState(() => ({
    title: event.title,
    summary: event.summary,
    description: event.description,
    location: event.location,
    start: event.starts_at ? utcToZoned(event.starts_at, tz) ?? '' : '',
    end: event.ends_at ? utcToZoned(event.ends_at, tz) ?? '' : '',
    confirmed: event.date_confirmed,
    note: event.tentative_note ?? '',
    status: event.status,
    capacity: event.capacity ? String(event.capacity) : '',
    expectations: event.expectations.join('\n'),
  }));
  const [saving, setSaving] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const starts = form.start ? zonedToUtc(form.start, tz) : null;
    const ends = form.end ? zonedToUtc(form.end, tz) : null;
    const { ok, j } = await call(`/api/events/admin/${event.id}`, 'PATCH', {
      title: form.title,
      summary: form.summary,
      description: form.description,
      location: form.location,
      starts_at: starts,
      ends_at: ends,
      date_confirmed: form.confirmed,
      tentative_note: form.note,
      status: form.status,
      capacity: form.capacity ? Number(form.capacity) : null,
      expectations: form.expectations.split('\n'),
    });
    setSaving(false);
    if (!ok) return setMsg(j.error || 'Could not save.');
    setEvent(j.event);
    setMsg('Saved. The public page updates within a minute.');
  }

  const base = typeof window !== 'undefined' ? window.location.origin : 'https://socria.app';
  const [linkSource, setLinkSource] = useState('instagram');
  const [linkRef, setLinkRef] = useState('');
  const tagged = `${base}/events/${event.id}?utm_source=${encodeURIComponent(linkSource || 'direct')}&utm_medium=${linkSource === 'instagram' ? 'social' : 'referral'}&utm_campaign=${event.id}${linkRef ? `&ref=${encodeURIComponent(linkRef)}` : ''}`;

  const c = acq.confirmed;
  return (
    <div className="ev-admin">
      <header className="stack" style={{ gap: 8 }}>
        <Link href="/events/admin" className="ev-fine">← All events</Link>
        <div className="ev-toolbar" style={{ justifyContent: 'space-between' }}>
          <h1 className="ev-h2" style={{ fontSize: 'clamp(1.6rem,3vw,2.2rem)' }}>{event.title}</h1>
          <div className="ev-actions">
            <span className="ev-badge">{event.status}</span>
            <Link className="ev-ghost" href={`/events/${event.id}`} target="_blank">Public page</Link>
            <Link className="ev-ghost" href={`/events/admin/${event.id}/door`}>Door check-in</Link>
            <a className="ev-ghost" href={`/api/events/admin/${event.id}/export`}>Export CSV</a>
          </div>
        </div>
        {!event.date_confirmed && <p className="ev-note warn">The date isn’t confirmed, so the public page says “To be announced”. {event.tentative_note ? `Planning note: ${event.tentative_note}` : ''}</p>}
      </header>

      {msg && (
        <p className="ev-note" role="status">
          {msg}
        </p>
      )}

      <section className="ev-kpis" aria-label="Key numbers">
        <Kpi tag="conf" label="RSVPs" value={String(rows.filter((r) => r.registered_via === 'web').length)} />
        <Kpi tag="conf" label="Checked in" value={String(rows.filter((r) => r.attendance === 'attended').length)} sub={`${rows.filter((r) => r.registered_via === 'walk-in').length} walk-in`} />
        <Kpi tag="conf" label="RSVP → attended" value={pct(stats.showRate)} />
        <Kpi tag="conf" label="Marketing opt-ins" value={String(rows.filter((r) => r.marketing_consent).length)} />
        <Kpi tag="est" label="Page views" value={num(acq.estimated.pageViews)} />
        <Kpi tag="est" label="RSVPs per view" value={pct(acq.estimated.rsvpPerView)} />
      </section>

      <div className="ev-cols">
        <section className="ev-panel">
          <h3>Registrations by day</h3>
          <Trend daily={stats.daily} />
        </section>
        <section className="ev-panel">
          <h3>How they heard</h3>
          <Bars items={stats.bySource.map((s) => ({ label: s.label, n: s.n }))} />
        </section>
        <section className="ev-panel">
          <h3>What interests them</h3>
          <Bars items={stats.byInterest.map((s) => ({ label: s.label, n: s.n }))} />
        </section>
        <section className="ev-panel">
          <h3>Links they came by</h3>
          <Bars items={stats.byCampaign.map((s) => ({ label: s.id, n: s.n }))} />
          <p className="ev-fine">Page views by link (estimate): {acq.estimated.viewsBySource.length ? acq.estimated.viewsBySource.map((v) => `${v.source} ${v.n}`).join(' · ') : '—'}</p>
        </section>
      </div>

      <section className="ev-panel" aria-labelledby="acq-h">
        <h3 id="acq-h">Did the event bring people to Socria?</h3>
        <div className="ev-kpis">
          <Kpi tag="conf" label="Registrants with a Socria account" value={num(c.matchedAccounts)} />
          <Kpi tag="conf" label="Signed up after RSVP" value={num(c.signedUpAfterRsvp)} sub={`${num(c.attendeesSignedUp)} attended`} />
          <Kpi tag="conf" label="Of those, used Socria" value={num(c.firstUse)} sub="saved a conversation" />
          <Kpi tag="conf" label="Back after 7+ days" value={c.eligibleFor7d ? `${c.returnedAfter7d}/${c.eligibleFor7d}` : '—'} />
          <Kpi tag="est" label="Sign-ups from this event’s links" value={num(acq.estimated.signupsTagged)} />
        </div>
        <p className="ev-fine">
          Confirmed numbers match a registration’s email to a <em>verified</em> email on a Socria account, in aggregate only. Estimates come from anonymous counters,
          which miss blocked scripts and count devices rather than people.
        </p>
        {acq.notes.map((n) => (
          <p key={n} className="ev-fine">{n}</p>
        ))}
      </section>

      <section className="ev-panel" aria-labelledby="sheet-h">
        <h3 id="sheet-h">Google Sheet</h3>
        {!sync.configured ? (
          <p className="ev-note warn">Not connected. Registrations are safe in the database; set the Google credentials described in docs/EVENTS.md, then press Resync.</p>
        ) : sync.lastOkAt ? (
          <p className="ev-fine">
            Last synced {when(sync.lastOkAt, tz)} · {num(sync.lastRows)} rows{sync.pending ? ' · changes waiting' : ' · up to date'}
          </p>
        ) : (
          <p className="ev-note warn">Credentials are set, but no sync has succeeded yet. Press Resync to test the connection.</p>
        )}
        {sync.lastError && (
          <p className="ev-err">
            Last error ({when(sync.lastErrorAt, tz)}): {sync.lastError}
          </p>
        )}
        <button type="button" className="ev-ghost" style={{ width: 'fit-content' }} onClick={resync}>
          Resync now
        </button>
      </section>

      <section className="ev-panel" aria-labelledby="list-h">
        <h3 id="list-h">Attendees ({shown.length} of {rows.length})</h3>
        <div className="ev-toolbar">
          <label htmlFor="adm-q" className="ev-hp">Search</label>
          <input id="adm-q" className="ev-input" placeholder="Search name, email or code" value={q} onChange={(e) => setQ(e.target.value)} />
          <label htmlFor="adm-f" className="ev-hp">Filter</label>
          <select id="adm-f" className="ev-select" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="all">Everyone</option>
            <option value="registered">Not yet checked in</option>
            <option value="attended">Checked in</option>
            <option value="walk-in">Walk-ins</option>
            <option value="consented">Marketing opt-in</option>
          </select>
        </div>
        <div className="ev-table-wrap">
          <table className="ev-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Interest</th>
                <th>Heard via</th>
                <th>RSVP</th>
                <th>Status</th>
                <th>Opt-in</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.full_name}
                    <div className="ev-fine">{r.code}{r.registered_via === 'walk-in' ? ' · walk-in' : ''}</div>
                  </td>
                  <td>{r.email ?? '—'}</td>
                  <td>{r.interest === 'other' && r.interest_other ? `Other: ${r.interest_other}` : labelOf(INTERESTS, r.interest)}</td>
                  <td>{labelOf(SOURCES, r.source)}</td>
                  <td className="num">{when(r.registered_at, tz)}</td>
                  <td className="num">{r.attendance === 'attended' ? `In · ${when(r.checked_in_at, tz)}` : 'Registered'}</td>
                  <td>{r.marketing_consent ? 'Yes' : 'No'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {r.attendance === 'attended' ? (
                      r.registered_via === 'web' && (
                        <button type="button" className="ev-ghost" onClick={() => checkIn(r, true)}>
                          Undo
                        </button>
                      )
                    ) : (
                      <button type="button" className="ev-ghost" onClick={() => checkIn(r)}>
                        Check in
                      </button>
                    )}{' '}
                    {confirmDelete === r.id ? (
                      <>
                        <button type="button" className="ev-ghost danger" onClick={() => remove(r)}>
                          Delete for good
                        </button>{' '}
                        <button type="button" className="ev-ghost" onClick={() => setConfirmDelete(null)}>
                          Keep
                        </button>
                      </>
                    ) : (
                      <button type="button" className="ev-ghost danger" onClick={() => setConfirmDelete(r.id)} aria-label={`Delete ${r.full_name}`}>
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!shown.length && (
                <tr>
                  <td colSpan={8} className="ev-fine">
                    {rows.length ? 'No one matches.' : 'No registrations yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ev-panel" aria-labelledby="links-h">
        <h3 id="links-h">Links to share</h3>
        <p className="ev-fine">Tag each link with where you’re posting it, so RSVPs and page views can be traced to it. Tags never carry anyone’s identity.</p>
        <div className="ev-toolbar">
          <label htmlFor="ln-src" className="ev-legend">Source</label>
          <input id="ln-src" className="ev-input" value={linkSource} onChange={(e) => setLinkSource(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40))} />
          <label htmlFor="ln-ref" className="ev-legend">Referral code (optional)</label>
          <input id="ln-ref" className="ev-input" placeholder="e.g. acm-chapter" value={linkRef} onChange={(e) => setLinkRef(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40))} />
        </div>
        <code style={{ wordBreak: 'break-all', fontSize: '.86rem' }}>{tagged}</code>
        <button
          type="button"
          className="ev-ghost"
          style={{ width: 'fit-content' }}
          onClick={() =>
            navigator.clipboard?.writeText(tagged).then(
              () => setMsg('Link copied.'),
              () => setMsg('Copy the link above.')
            )
          }
        >
          Copy link
        </button>
      </section>

      <form className="ev-panel" onSubmit={save} aria-labelledby="edit-h">
        <h3 id="edit-h">Event details</h3>
        <div className="ev-cols">
          <div className="ev-field">
            <label htmlFor="ed-title">Title</label>
            <input id="ed-title" className="ev-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="ev-field">
            <label htmlFor="ed-loc">Location</label>
            <input id="ed-loc" className="ev-input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
        </div>
        <div className="ev-field">
          <label htmlFor="ed-sum">Summary</label>
          <input id="ed-sum" className="ev-input" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
        </div>
        <div className="ev-field">
          <label htmlFor="ed-desc">About (blank line between paragraphs)</label>
          <textarea id="ed-desc" className="ev-input" rows={6} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="ev-field">
          <label htmlFor="ed-exp">What to expect (one per line — only what is confirmed)</label>
          <textarea id="ed-exp" className="ev-input" rows={4} value={form.expectations} onChange={(e) => setForm({ ...form, expectations: e.target.value })} />
        </div>
        <div className="ev-cols">
          <div className="ev-field">
            <label htmlFor="ed-start">Starts ({tz})</label>
            <input id="ed-start" className="ev-input" type="datetime-local" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value, confirmed: e.target.value ? form.confirmed : false })} />
          </div>
          <div className="ev-field">
            <label htmlFor="ed-end">Ends ({tz})</label>
            <input id="ed-end" className="ev-input" type="datetime-local" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
          </div>
        </div>
        <label className="ev-check">
          <input type="checkbox" checked={form.confirmed} disabled={!form.start} onChange={(e) => setForm({ ...form, confirmed: e.target.checked })} />
          <span>The date and time are confirmed — show them on the public page.</span>
        </label>
        <div className="ev-cols">
          <div className="ev-field">
            <label htmlFor="ed-note">Planning note (staff only)</label>
            <input id="ed-note" className="ev-input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <div className="ev-field">
            <label htmlFor="ed-status">Registration</label>
            <select id="ed-status" className="ev-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as EventRow['status'] })}>
              <option value="draft">Draft — not public</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="ev-field">
            <label htmlFor="ed-cap">Capacity (optional)</label>
            <input id="ed-cap" className="ev-input" inputMode="numeric" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value.replace(/\D/g, '') })} />
          </div>
        </div>
        <button type="submit" className="ev-btn" style={{ width: 'fit-content' }} disabled={saving}>
          {saving ? 'Saving…' : 'Save details'}
        </button>
      </form>
    </div>
  );
}
