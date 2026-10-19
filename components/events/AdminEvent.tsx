'use client';

// One event, for Socria admins and analysts. Organised as five tabs, each with
// one job, so nobody has to scroll past settings to read a number:
//
//   Overview   a plain-English summary, four headline numbers, and where
//              people came from — every figure labelled Confirmed or Estimate
//   Attendees  search, one-tap filters with counts, check in, export
//   Check-in   the self check-in switch and the link for the venue QR code
//   Share      tagged links for each place the event is promoted
//   Settings   the event's details and the Google Sheet
//
// Data arrives from the server page; every change goes through the admin and
// staff routes, which check the role again.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { INTERESTS, SOURCES, utcToZoned, zonedToUtc, type EventRow, type EventStats, type RegistrationRow } from '@/lib/events/model';
import type { Acquisition } from '@/lib/events/acquisition';
import type { SyncState } from '@/lib/events/sheets';

export type AdminRow = Omit<RegistrationRow, 'token_hash'>;
type Tab = 'overview' | 'attendees' | 'checkin' | 'share' | 'settings';
type Filter = 'all' | 'attended' | 'registered' | 'consented';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'attendees', label: 'Attendees' },
  { id: 'checkin', label: 'Check-in' },
  { id: 'share', label: 'Share links' },
  { id: 'settings', label: 'Settings' },
];

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
const num = (v: number | null | undefined) => (v === null || v === undefined ? '—' : String(v));
const when = (ms: number | null, tz: string) => (ms ? new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz }) : '—');
const labelOf = (list: readonly { id: string; label: string }[], id: string | null) => list.find((x) => x.id === id)?.label ?? '—';
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

async function call(url: string, method: string, body: unknown) {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: r.ok, status: r.status, j: await r.json().catch(() => ({})) };
}

/** One headline number: big value, what it is, and whether it is a fact or an estimate. */
function Stat({ label, value, help, tag }: { label: string; value: string; help: string; tag: 'conf' | 'est' }) {
  return (
    <div className="ev-kpi" title={help}>
      <span>{label}</span>
      <b>{value}</b>
      <span className="ev-fine">
        {help} · <em className={tag}>{tag === 'conf' ? 'confirmed' : 'estimate'}</em>
      </span>
    </div>
  );
}

function Bars({ items, empty = 'Nothing yet.' }: { items: { label: string; n: number }[]; empty?: string }) {
  const max = Math.max(1, ...items.map((i) => i.n));
  const total = items.reduce((a, i) => a + i.n, 0);
  if (!items.length) return <p className="ev-fine">{empty}</p>;
  return (
    <ul className="ev-bars">
      {items.map((i) => (
        <li key={i.label}>
          <span>{i.label}</span>
          <i style={{ width: `${(i.n / max) * 100}%` }} aria-hidden="true" />
          <b title={`${Math.round((i.n / total) * 100)}% of answers`}>{i.n}</b>
        </li>
      ))}
    </ul>
  );
}

/** RSVPs per day: columns on one scale, the count on hover and in a hidden table for screen readers. */
function Trend({ daily }: { daily: EventStats['daily'] }) {
  if (!daily.length) return <p className="ev-fine">No RSVPs yet. Share the event page to get the first ones.</p>;
  const W = 640, H = 170, L = 28, B = 24, T = 10;
  const max = Math.max(1, ...daily.map((d) => d.n));
  const step = max <= 5 ? 1 : Math.ceil(max / 4);
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
  const top = ticks[ticks.length - 1] || 1;
  const bw = (W - L) / daily.length;
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const label = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="ev-spark" role="img" aria-label={`RSVPs per day over ${plural(daily.length, 'day')}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W} y1={y(t)} y2={y(t)} stroke="rgba(31,31,31,.08)" />
            <text x={L - 6} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="rgba(31,31,31,.6)">{t}</text>
          </g>
        ))}
        {daily.map((d, i) => (
          <g key={d.day}>
            <rect x={L + i * bw + 2} y={y(d.n)} width={Math.max(2, bw - 4)} height={y(0) - y(d.n)} rx="3" fill="var(--moss)">
              <title>{`${label(d.day)}: ${plural(d.n, 'RSVP')}`}</title>
            </rect>
            {(daily.length <= 10 || i % Math.ceil(daily.length / 8) === 0) && (
              <text x={L + i * bw + bw / 2} y={H - 7} textAnchor="middle" fontSize="10" fill="rgba(31,31,31,.6)">
                {label(d.day)}
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

function Copy({ text, onDone }: { text: string; onDone: (m: string) => void }) {
  return (
    <button
      type="button"
      className="ev-ghost"
      onClick={() =>
        navigator.clipboard?.writeText(text).then(
          () => onDone('Copied.'),
          () => onDone('Select the link above and copy it.')
        )
      }
    >
      Copy
    </button>
  );
}

export function AdminEvent({ event: initial, rows: initialRows, stats, acq, sync: initialSync }: { event: EventRow; rows: AdminRow[]; stats: EventStats; acq: Acquisition; sync: SyncState }) {
  const [event, setEvent] = useState(initial);
  const [rows, setRows] = useState(initialRows);
  const [sync, setSync] = useState(initialSync);
  const [tab, setTab] = useState<Tab>('overview');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showWhy, setShowWhy] = useState(false);
  const tz = event.timezone;
  const base = typeof window !== 'undefined' ? window.location.origin : 'https://socria.app';

  // the open tab survives a reload (#attendees), so a link can point at it
  useEffect(() => {
    const h = window.location.hash.slice(1) as Tab;
    if (TABS.some((t) => t.id === h)) setTab(h);
  }, []);
  const go = (t: Tab) => {
    setTab(t);
    setMsg(null);
    try {
      window.history.replaceState(null, '', `#${t}`);
    } catch {}
  };

  // ── the numbers, from the rows as they stand now ──
  const n = useMemo(() => {
    const attended = rows.filter((r) => r.attendance === 'attended');
    return {
      rsvps: rows.length,
      attended: attended.length,
      self: attended.filter((r) => r.checked_in_by === 'self').length,
      notYet: rows.length - attended.length,
      showRate: rows.length ? attended.length / rows.length : null,
      consented: rows.filter((r) => r.marketing_consent).length,
    };
  }, [rows]);
  const topSource = stats.bySource.filter((s) => s.id !== 'none').sort((a, b) => b.n - a.n)[0];
  const summary = [
    `${plural(n.rsvps, 'person has', 'people have')} RSVP’d`,
    n.attended ? `${n.attended} checked in` : 'no one has checked in yet',
  ].join(' and ') + '.' + (topSource ? ` Most heard about it through ${topSource.label.toLowerCase()}.` : '') + (n.showRate !== null && n.attended ? ` ${pct(n.showRate)} of people who RSVP’d showed up.` : '');

  const counts: Record<Filter, number> = {
    all: rows.length,
    attended: n.attended,
    registered: rows.filter((r) => r.attendance === 'registered').length,
    consented: n.consented,
  };
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      if (filter === 'registered' && r.attendance !== 'registered') return false;
      if (filter === 'attended' && r.attendance !== 'attended') return false;
      if (filter === 'consented' && !r.marketing_consent) return false;
      const hay = `${r.full_name} ${r.email ?? ''} ${r.code}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [rows, q, filter]);

  // ── actions ──
  async function checkIn(r: AdminRow, undo = false) {
    const { ok, j } = await call(`/api/events/admin/${event.id}`, 'POST', { action: undo ? 'undo' : 'checkin', registrationId: r.id });
    if (!ok) return setMsg(j.error || 'That did not work.');
    setRows((list) => list.map((x) => (x.id === r.id ? { ...x, attendance: j.attendance, checked_in_at: j.checkedInAt } : x)));
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
      setMsg(`Sheet synced: ${plural(j.rows, 'registration')}.`);
    } else if (j.status === 'unconfigured') setMsg('Google Sheets isn’t connected on this deployment. See docs/EVENTS.md.');
    else if (j.status === 'queued') setMsg('A sync is already running; it will include the latest changes.');
    else {
      setSync((s) => ({ ...s, lastError: j.error, lastErrorAt: Date.now(), pending: true }));
      setMsg(`Sync failed: ${j.error}`);
    }
  }
  async function patch(body: Record<string, unknown>, done: string) {
    const { ok, j } = await call(`/api/events/admin/${event.id}`, 'PATCH', body);
    if (!ok) {
      setMsg(j.error || 'Could not save.');
      return false;
    }
    setEvent(j.event);
    setMsg(done);
    return true;
  }

  // ── settings form ──
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
    await patch(
      {
        title: form.title,
        summary: form.summary,
        description: form.description,
        location: form.location,
        starts_at: form.start ? zonedToUtc(form.start, tz) : null,
        ends_at: form.end ? zonedToUtc(form.end, tz) : null,
        date_confirmed: form.confirmed,
        tentative_note: form.note,
        status: form.status,
        capacity: form.capacity ? Number(form.capacity) : null,
        expectations: form.expectations.split('\n'),
      },
      'Saved. The public page updates within a minute.'
    );
    setSaving(false);
  }

  // ── share links ──
  const [linkSource, setLinkSource] = useState('instagram');
  const [linkRef, setLinkRef] = useState('');
  const tagged = `${base}/events/${event.id}?utm_source=${encodeURIComponent(linkSource || 'direct')}&utm_medium=${linkSource === 'instagram' ? 'social' : 'referral'}&utm_campaign=${event.id}${linkRef ? `&ref=${encodeURIComponent(linkRef)}` : ''}`;
  const checkinUrl = `${base}/events/${event.id}/checkin`;
  const c = acq.confirmed;

  return (
    <div className="ev-admin">
      <header className="stack" style={{ gap: 10 }}>
        <Link href="/events/admin" className="ev-fine">← All events</Link>
        <div className="ev-toolbar" style={{ justifyContent: 'space-between' }}>
          <div className="stack" style={{ gap: 4 }}>
            <h1 className="ev-h2" style={{ fontSize: 'clamp(1.6rem,3vw,2.2rem)' }}>{event.title}</h1>
            <span className="ev-fine">
              {event.date_confirmed && event.starts_at ? when(event.starts_at, tz) : 'Date not confirmed'} · RSVPs {event.status === 'open' ? 'open' : event.status} · Self check-in {event.self_checkin ? 'open' : 'closed'}
            </span>
          </div>
          <div className="ev-actions">
            <Link className="ev-ghost" href={`/events/${event.id}`} target="_blank">View public page ↗</Link>
            <Link className="ev-btn moss" href={`/events/${event.id}/checkin`} target="_blank">Check-in page ↗</Link>
          </div>
        </div>
        <nav className="ev-tabs" role="tablist" aria-label="Event sections">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : undefined} onClick={() => go(t.id)}>
              {t.label}
              {t.id === 'attendees' && <span className="ev-count">{rows.length}</span>}
            </button>
          ))}
        </nav>
      </header>

      {msg && (
        <p className="ev-note" role="status">
          {msg}
        </p>
      )}

      {tab === 'overview' && (
        <>
          <p className="ev-summary">{summary}</p>
          <section className="ev-kpis" aria-label="Headline numbers">
            <Stat tag="conf" label="RSVPs" value={String(n.rsvps)} help="registered online" />
            <Stat tag="conf" label="Checked in" value={String(n.attended)} help="at the event" />
            <Stat tag="conf" label="Show-up rate" value={pct(n.showRate)} help="of RSVPs who came" />
            <Stat tag="est" label="Page visits" value={num(acq.estimated.pageViews)} help={acq.estimated.rsvpPerView !== null ? `${pct(acq.estimated.rsvpPerView)} went on to RSVP` : 'views of the event page'} />
          </section>

          <div className="ev-cols">
            <section className="ev-panel">
              <h3>RSVPs by day</h3>
              <Trend daily={stats.daily} />
            </section>
            <section className="ev-panel">
              <h3>How they heard about it</h3>
              <Bars items={stats.bySource.map((s) => ({ label: s.label, n: s.n }))} empty="No answers yet." />
            </section>
            <section className="ev-panel">
              <h3>What interests them</h3>
              <Bars items={stats.byInterest.map((s) => ({ label: s.label, n: s.n }))} empty="No answers yet." />
            </section>
          </div>

          <section className="ev-panel" aria-labelledby="acq-h">
            <h3 id="acq-h">Did it bring people to Socria?</h3>
            <div className="ev-kpis">
              <Stat tag="conf" label="Already use Socria" value={num(c.matchedAccounts)} help="attendees with an account" />
              <Stat tag="conf" label="Signed up after" value={num(c.signedUpAfterRsvp)} help={`${num(c.attendeesSignedUp)} of them attended`} />
              <Stat tag="conf" label="Tried it" value={num(c.firstUse)} help="saved a conversation" />
              <Stat tag="conf" label="Came back" value={c.eligibleFor7d ? `${c.returnedAfter7d} of ${c.eligibleFor7d}` : '—'} help="a week or more later" />
            </div>
            <button type="button" className="ev-link" style={{ width: 'fit-content', fontSize: '.88rem' }} onClick={() => setShowWhy((v) => !v)} aria-expanded={showWhy}>
              {showWhy ? 'Hide' : 'What’s confirmed vs. estimate?'}
            </button>
            {showWhy && (
              <div className="ev-fine stack" style={{ gap: 6 }}>
                <p>
                  <strong>Confirmed</strong> numbers come from real records: registrations and check-ins, and Socria accounts whose <em>verified</em> email matches a
                  registration (counted only in total, never shown per person).
                </p>
                <p>
                  <strong>Estimates</strong> come from anonymous counters. They miss visitors who block scripts, count visits rather than people, and are best read as
                  trends.{acq.estimated.signupsTagged !== null ? ` ${plural(acq.estimated.signupsTagged, 'sign-up')} began on one of this event’s tagged links.` : ''}
                </p>
                {acq.notes.map((x) => (
                  <p key={x}>{x}</p>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {tab === 'attendees' && (
        <section className="ev-panel" aria-label="Attendees">
          <div className="ev-toolbar" style={{ justifyContent: 'space-between' }}>
            <label htmlFor="adm-q" className="ev-hp">Search</label>
            <input id="adm-q" className="ev-input" placeholder="Search by name, email or code" value={q} onChange={(e) => setQ(e.target.value)} />
            <a className="ev-ghost" href={`/api/events/admin/${event.id}/export`}>Download CSV</a>
          </div>
          <div className="ev-chips" role="group" aria-label="Show">
            {(
              [
                ['all', 'Everyone'],
                ['attended', 'Checked in'],
                ['registered', 'Not here yet'],
                ['consented', 'Emails OK'],
              ] as [Filter, string][]
            ).map(([id, label]) => (
              <label key={id} className="ev-chip">
                <input type="radio" name="adm-filter" checked={filter === id} onChange={() => setFilter(id)} />
                <span>
                  {label} · {counts[id]}
                </span>
              </label>
            ))}
          </div>
          <div className="ev-table-wrap">
            <table className="ev-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Interest</th>
                  <th>Heard via</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong style={{ fontWeight: 600 }}>{r.full_name}</strong>
                      <div className="ev-fine">
                        RSVP {when(r.registered_at, tz)}
                        {r.marketing_consent ? ' · emails OK' : ''}
                      </div>
                    </td>
                    <td>{r.email ?? '—'}</td>
                    <td>
                      {r.attendance === 'attended' ? (
                        <span className="ev-badge attended">
                          In · {when(r.checked_in_at, tz).split(', ').pop()}
                          {r.checked_in_by === 'self' ? ' · self' : ''}
                        </span>
                      ) : (
                        <span className="ev-badge">Registered</span>
                      )}
                    </td>
                    <td>{r.interest === 'other' && r.interest_other ? r.interest_other : labelOf(INTERESTS, r.interest)}</td>
                    <td>{labelOf(SOURCES, r.source)}</td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {r.attendance === 'attended' ? (
                        <button type="button" className="ev-ghost" onClick={() => checkIn(r, true)}>
                          Undo
                        </button>
                      ) : (
                        <button type="button" className="ev-btn moss" style={{ minHeight: 36, padding: '6px 14px' }} onClick={() => checkIn(r)}>
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
                        <button type="button" className="ev-fine" style={{ textDecoration: 'underline', marginLeft: 10 }} onClick={() => setConfirmDelete(r.id)} aria-label={`Delete ${r.full_name}`}>
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!shown.length && (
                  <tr>
                    <td colSpan={6} className="ev-fine">
                      {rows.length ? 'No one matches. Try another search or filter.' : 'No registrations yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'checkin' && (
        <div className="ev-cols">
          <section className="ev-panel">
            <h3>Self check-in</h3>
            <p className="ev-fine">
              Everyone checks in by scanning the QR code at the venue and answering the same questions as the RSVP. If they RSVP’d, their RSVP is matched by
              email or name and checked in; if not, they’re added and checked in on the spot.
            </p>
            <div className={`ev-note${event.self_checkin ? '' : ' warn'}`} role="status">
              Self check-in is <strong>{event.self_checkin ? 'open' : 'closed'}</strong>.{' '}
              {event.self_checkin ? 'Close it when the event ends.' : 'Open it when doors open — until then the page tells people it isn’t open yet.'}
            </div>
            <button type="button" className={event.self_checkin ? 'ev-ghost' : 'ev-btn moss'} style={{ width: 'fit-content' }} onClick={() => patch({ self_checkin: !event.self_checkin }, event.self_checkin ? 'Self check-in closed.' : 'Self check-in is open.')}>
              {event.self_checkin ? 'Close self check-in' : 'Open self check-in'}
            </button>
          </section>
          <section className="ev-panel">
            <h3>Link for your QR code</h3>
            <p className="ev-fine">Make a QR code from this link and put it at the entrance.</p>
            <code style={{ wordBreak: 'break-all', fontSize: '.9rem' }}>{checkinUrl}</code>
            <div className="ev-actions">
              <Copy text={checkinUrl} onDone={setMsg} />
              <Link className="ev-ghost" href={`/events/${event.id}/checkin`} target="_blank">Preview page ↗</Link>
            </div>
          </section>
          <section className="ev-panel">
            <h3>Who’s here</h3>
            <div className="ev-kpis">
              <Stat tag="conf" label="Checked in" value={String(n.attended)} help={`${n.self} by themselves`} />
              <Stat tag="conf" label="Not here yet" value={String(n.notYet)} help="RSVP’d, not checked in" />
            </div>
            <p className="ev-fine">Someone can’t use their phone? Check them in from the Attendees tab.</p>
            <button type="button" className="ev-ghost" style={{ width: 'fit-content' }} onClick={() => go('attendees')}>Open attendees</button>
          </section>
        </div>
      )}

      {tab === 'share' && (
        <section className="ev-panel" aria-labelledby="links-h">
          <h3 id="links-h">A link for each place you promote it</h3>
          <p className="ev-fine">
            Pick where the link will go. RSVPs and visits from it show up under “How they heard” and in the attendee list, so you can see which posts work. Links
            never identify anyone.
          </p>
          <div className="ev-chips">
            {['instagram', 'flyer', 'email', 'class', 'student-org', 'friend'].map((s) => (
              <label key={s} className="ev-chip">
                <input type="radio" name="ln-src-pick" checked={linkSource === s} onChange={() => setLinkSource(s)} />
                <span>{s}</span>
              </label>
            ))}
          </div>
          <div className="ev-toolbar">
            <label htmlFor="ln-src" className="ev-legend">Or type your own</label>
            <input id="ln-src" className="ev-input" value={linkSource} onChange={(e) => setLinkSource(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40))} />
            <label htmlFor="ln-ref" className="ev-legend">Group or person (optional)</label>
            <input id="ln-ref" className="ev-input" placeholder="e.g. acm-chapter" value={linkRef} onChange={(e) => setLinkRef(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40))} />
          </div>
          <code style={{ wordBreak: 'break-all', fontSize: '.86rem' }}>{tagged}</code>
          <Copy text={tagged} onDone={setMsg} />
        </section>
      )}

      {tab === 'settings' && (
        <>
          <form className="ev-panel" onSubmit={save} aria-labelledby="edit-h">
            <h3 id="edit-h">Event details</h3>
            {!event.date_confirmed && <p className="ev-note warn">The date isn’t confirmed, so the public page says “To be announced”.{event.tentative_note ? ` Planning note: ${event.tentative_note}` : ''}</p>}
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
                <label htmlFor="ed-status">RSVPs</label>
                <select id="ed-status" className="ev-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as EventRow['status'] })}>
                  <option value="draft">Draft — page hidden</option>
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                  <option value="cancelled">Event cancelled</option>
                </select>
              </div>
              <div className="ev-field">
                <label htmlFor="ed-cap">Capacity (optional)</label>
                <input id="ed-cap" className="ev-input" inputMode="numeric" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value.replace(/\D/g, '') })} />
              </div>
            </div>
            <details className="stack" style={{ gap: 12 }}>
              <summary className="ev-link" style={{ width: 'fit-content', cursor: 'pointer', fontSize: '.92rem' }}>Edit the page text</summary>
              <div className="ev-field">
                <label htmlFor="ed-title">Title</label>
                <input id="ed-title" className="ev-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="ev-field">
                <label htmlFor="ed-loc">Location</label>
                <input id="ed-loc" className="ev-input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </div>
              <div className="ev-field">
                <label htmlFor="ed-sum">One-line summary</label>
                <input id="ed-sum" className="ev-input" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
              </div>
              <div className="ev-field">
                <label htmlFor="ed-desc">About (blank line between paragraphs)</label>
                <textarea id="ed-desc" className="ev-input" rows={6} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="ev-field">
                <label htmlFor="ed-exp">What to expect (one per line — only what’s confirmed)</label>
                <textarea id="ed-exp" className="ev-input" rows={4} value={form.expectations} onChange={(e) => setForm({ ...form, expectations: e.target.value })} />
              </div>
              <div className="ev-field">
                <label htmlFor="ed-note">Planning note (staff only)</label>
                <input id="ed-note" className="ev-input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>
            </details>
            <button type="submit" className="ev-btn" style={{ width: 'fit-content' }} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </form>

          <section className="ev-panel" aria-labelledby="sheet-h">
            <h3 id="sheet-h">Google Sheet</h3>
            {!sync.configured ? (
              <p className="ev-note warn">Not connected. Registrations are safe in the database; add the Google settings in docs/EVENTS.md, then press Sync now.</p>
            ) : sync.lastOkAt ? (
              <p className="ev-fine">
                Last synced {when(sync.lastOkAt, tz)} · {plural(sync.lastRows ?? 0, 'row')} · {sync.pending ? 'changes waiting' : 'up to date'}
              </p>
            ) : (
              <p className="ev-note warn">Connected, but no sync has worked yet. Press Sync now to test it.</p>
            )}
            {sync.lastError && <p className="ev-err">Last error ({when(sync.lastErrorAt, tz)}): {sync.lastError}</p>}
            <button type="button" className="ev-ghost" style={{ width: 'fit-content' }} onClick={resync}>
              Sync now
            </button>
          </section>
        </>
      )}
    </div>
  );
}
