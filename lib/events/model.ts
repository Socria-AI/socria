// lib/events/model.ts — SOCRIA EVENTS: the shapes, and the rules about them.
//
// An event is a row in `events`; a person's place at one is a row in
// `event_registrations`. RSVP and attendance are separate facts: a
// registration is `registered` until a member of staff confirms the person is
// at the door, and only then `attended`, with the time and who confirmed it.
//
// What a registration holds is only what the event needs: a name, an email,
// two optional answers (what interests them, how they heard), a separate
// marketing-consent choice with its time, and campaign tags from the link
// they came by (utm_* and an event referral code — never a referrer address).
// No account is made and nothing subscribes them.
//
// PURE: no database, no network, no clock except what callers pass in.

export const INTERESTS = [
  { id: 'business', label: 'Business' },
  { id: 'ai', label: 'AI and technology' },
  { id: 'networking', label: 'Networking' },
  { id: 'learning', label: 'Learning and studying' },
  { id: 'other', label: 'Other' },
] as const;
export type InterestId = (typeof INTERESTS)[number]['id'];

export const SOURCES = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'friend', label: 'Friend / personal invitation' },
  { id: 'campus', label: 'Campus outreach' },
  { id: 'student-org', label: 'Student organization' },
  { id: 'other', label: 'Other' },
] as const;
export type SourceId = (typeof SOURCES)[number]['id'];

export const MARKETING_CONSENT_TEXT =
  'I’d like to receive occasional emails about Socria products, events, and updates. I can unsubscribe at any time.';

export const EVENT_STATUSES = ['draft', 'open', 'closed', 'cancelled'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const LIMITS = { name: 100, email: 254, other: 120, utm: 40, title: 120, summary: 300, description: 4000, location: 200, expectation: 160 } as const;

/** An event as the database holds it. */
export interface EventRow {
  id: string;
  title: string;
  summary: string;
  description: string;
  location: string;
  /** ms; null until the date is confirmed */
  starts_at: number | null;
  ends_at: number | null;
  timezone: string;
  /** a date is shown publicly only when this is true and starts_at is set */
  date_confirmed: boolean;
  /** staff-only planning note ("tentatively Nov 4") — never rendered publicly */
  tentative_note: string | null;
  status: EventStatus;
  capacity: number | null;
  expectations: string[];
  /** the at-the-door check-in page takes check-ins only while this is on (an admin opens it at the event) */
  self_checkin: boolean;
  created_at: number;
  updated_at: number;
}

/** What the public page may show. No planning notes, no counts. */
export interface PublicEvent {
  id: string;
  title: string;
  summary: string;
  description: string;
  location: string;
  when: { confirmed: true; startsAt: number; endsAt: number | null; timezone: string } | { confirmed: false };
  status: EventStatus;
  expectations: string[];
  /** the check-in page is open right now */
  selfCheckin: boolean;
}

export function publicEvent(e: EventRow): PublicEvent {
  const confirmed = e.date_confirmed && typeof e.starts_at === 'number' && e.starts_at > 0;
  return {
    id: e.id,
    title: e.title,
    summary: e.summary,
    description: e.description,
    location: e.location,
    when: confirmed ? { confirmed: true, startsAt: e.starts_at as number, endsAt: e.ends_at ?? null, timezone: e.timezone } : { confirmed: false },
    status: e.status,
    expectations: Array.isArray(e.expectations) ? e.expectations.filter((x) => typeof x === 'string') : [],
    selfCheckin: e.self_checkin === true,
  };
}

/** How a check-in finds an RSVP: by email, or by full name. */
export type CheckinLookup = { by: 'email'; emailNorm: string } | { by: 'name'; name: string };

/** Names compared the way people type them: case, accents and extra spaces ignored. */
export const foldName = (s: string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * The registrations a check-in entry points at: by email exactly, or by full
 * name. Two people can share a name; then the caller asks for the email.
 */
export function matchCheckin(rows: readonly RegistrationRow[], q: CheckinLookup): RegistrationRow[] {
  if (q.by === 'email') return rows.filter((r) => r.email_norm === q.emailNorm);
  const want = foldName(q.name);
  return rows.filter((r) => foldName(r.full_name) === want);
}

/** "Tuesday, November 4, 2026" and "6:00 – 7:30 PM CST", in the event's own timezone. */
export function whenSaid(w: PublicEvent['when']): { date: string; time: string } | null {
  if (!w.confirmed) return null;
  const tz = w.timezone || 'America/Chicago';
  const date = new Date(w.startsAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: tz });
  const t = (ms: number, zone: boolean) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz, ...(zone ? { timeZoneName: 'short' } : {}) });
  const time = w.endsAt ? `${t(w.startsAt, false)} – ${t(w.endsAt, true)}` : t(w.startsAt, true);
  return { date, time };
}

// ── registrations ─────────────────────────────────────────────────────

export type Attendance = 'registered' | 'attended';

export interface RegistrationRow {
  id: string;
  event_id: string;
  full_name: string;
  email: string | null;
  email_norm: string | null;
  interest: InterestId | null;
  interest_other: string | null;
  source: SourceId | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  ref: string | null;
  registered_at: number;
  registered_via: 'web' | 'walk-in';
  attendance: Attendance;
  checked_in_at: number | null;
  checked_in_by: string | null;
  marketing_consent: boolean;
  consent_at: number | null;
  token_hash: string;
  code: string;
}

export const EVENT_ID = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/;
export const REG_ID = /^rsvp_[A-Za-z0-9]{16,40}$/;
/** the token in a confirmation link and its QR: 32 random bytes, base64url */
export const TOKEN = /^[A-Za-z0-9_-]{43}$/;
/** the short code staff can type: 6 characters with no look-alikes (0/O, 1/I/L) */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE = new RegExp(`^[${CODE_ALPHABET}]{6}$`);
const EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

/** One line, no control characters, at most `max`. */
export function clean(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Any valid address — personal or .edu alike. Lowercased for matching; shown as typed. */
export function normalizeEmail(v: unknown): string | null {
  const e = clean(v, LIMITS.email);
  if (!e || !EMAIL.test(e)) return null;
  const tld = e.split('.').pop() ?? '';
  if (!/^[A-Za-z]{2,24}$/.test(tld)) return null;
  return e.toLowerCase();
}

/** A campaign tag from a link: lowercase token, or nothing. Never free text. */
export function utmToken(v: unknown): string | null {
  const t = clean(v, 80).toLowerCase().replace(/\s+/g, '-');
  return /^[a-z0-9][a-z0-9._-]{0,39}$/.test(t) ? t : null;
}

export interface RsvpInput {
  fullName: string;
  email: string;
  emailNorm: string;
  interest: InterestId | null;
  interestOther: string | null;
  source: SourceId | null;
  marketingConsent: boolean;
  utm: { source: string | null; medium: string | null; campaign: string | null };
  ref: string | null;
}

export type RsvpCheck = { ok: true; value: RsvpInput } | { ok: false; field: 'fullName' | 'email' | 'form'; error: string };

/**
 * A registration from the wire, checked. Name and email are required;
 * everything else is optional and outside the vocabularies becomes nothing.
 * Marketing consent is true only when the box was explicitly ticked.
 */
export function checkRsvp(raw: unknown): RsvpCheck {
  if (!raw || typeof raw !== 'object') return { ok: false, field: 'form', error: 'Something went wrong with the form. Please try again.' };
  const r = raw as Record<string, unknown>;
  const fullName = clean(r.fullName, LIMITS.name);
  if (fullName.length < 2) return { ok: false, field: 'fullName', error: 'Please enter your full name.' };
  const email = clean(r.email, LIMITS.email);
  const emailNorm = normalizeEmail(email);
  if (!emailNorm) return { ok: false, field: 'email', error: 'Please enter a valid email address.' };
  const interest = INTERESTS.some((i) => i.id === r.interest) ? (r.interest as InterestId) : null;
  const interestOther = interest === 'other' ? clean(r.interestOther, LIMITS.other) || null : null;
  const source = SOURCES.some((s) => s.id === r.source) ? (r.source as SourceId) : null;
  const u = r.utm && typeof r.utm === 'object' ? (r.utm as Record<string, unknown>) : {};
  return {
    ok: true,
    value: {
      fullName,
      email,
      emailNorm,
      interest,
      interestOther,
      source,
      marketingConsent: r.marketingConsent === true,
      utm: { source: utmToken(u.source), medium: utmToken(u.medium), campaign: utmToken(u.campaign) },
      ref: utmToken(r.ref),
    },
  };
}

/**
 * Bot signals, cheap and invisible to people: a filled hidden field, or a form
 * sent faster than anyone could read it. Returns why, or null.
 */
export function spamSignal(raw: unknown, minMs = 2500): string | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (typeof r.website === 'string' && r.website.trim()) return 'honeypot';
  const ms = typeof r.elapsedMs === 'number' ? r.elapsedMs : NaN;
  if (!Number.isFinite(ms) || ms < minMs) return 'too-fast';
  return null;
}

// ── what the attendee's own link shows ────────────────────────────────

export interface Ticket {
  event: PublicEvent;
  firstName: string;
  code: string;
  attendance: Attendance;
  checkedInAt: number | null;
}

export function ticketOf(r: RegistrationRow, e: EventRow): Ticket {
  return { event: publicEvent(e), firstName: r.full_name.split(' ')[0] ?? r.full_name, code: r.code, attendance: r.attendance, checkedInAt: r.checked_in_at };
}

// ── what staff see at the door ────────────────────────────────────────

export interface DoorRow {
  id: string;
  name: string;
  /** "m•••@gmail.com" — enough to tell two people with one name apart */
  emailHint: string;
  code: string;
  attendance: Attendance;
  checkedInAt: number | null;
}

export function emailHint(email: string | null): string {
  if (!email) return '—';
  const [local, domain] = email.split('@');
  return `${local.slice(0, 1)}•••@${domain ?? ''}`;
}

export function doorRow(r: RegistrationRow): DoorRow {
  return { id: r.id, name: r.full_name, emailHint: emailHint(r.email_norm ?? r.email), code: r.code, attendance: r.attendance, checkedInAt: r.checked_in_at };
}

/** Lookup at the door: by code, or by name or email words. Case- and accent-insensitive. */
export function searchRegistrations(rows: readonly RegistrationRow[], q: string, limit = 12): RegistrationRow[] {
  const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const query = fold(clean(q, 120));
  if (!query) return [];
  const code = query.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (CODE.test(code)) {
    const hit = rows.find((r) => r.code === code);
    if (hit) return [hit];
  }
  const words = query.split(' ').filter(Boolean);
  return rows
    .filter((r) => {
      const hay = fold(`${r.full_name} ${r.email ?? ''}`);
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name))
    .slice(0, limit);
}

// ── the sheet ─────────────────────────────────────────────────────────

export const SHEET_HEADER = [
  'Registration ID',
  'Event',
  'Full Name',
  'Email',
  'Interest',
  'Other Interest',
  'Acquisition Source',
  'RSVP Timestamp',
  'Attendance Status',
  'Check-in Timestamp',
  'Marketing Consent',
  'Consent Timestamp',
] as const;

const iso = (ms: number | null) => (typeof ms === 'number' && ms > 0 ? new Date(ms).toISOString() : '');
const labelOf = <T extends { id: string; label: string }>(list: readonly T[], id: string | null) => list.find((x) => x.id === id)?.label ?? '';

/** One sheet row, in SHEET_HEADER order. Text that would start a formula is defused. */
export function sheetRow(r: RegistrationRow, eventTitle: string): string[] {
  const cells = [
    r.id,
    eventTitle,
    r.full_name,
    r.email ?? '',
    labelOf(INTERESTS, r.interest),
    r.interest_other ?? '',
    labelOf(SOURCES, r.source),
    iso(r.registered_at),
    r.attendance === 'attended' ? 'Attended' : 'Registered',
    iso(r.checked_in_at),
    r.marketing_consent ? 'Yes' : 'No',
    iso(r.consent_at),
  ];
  return cells.map(defuse);
}

/** A cell a spreadsheet would run as a formula (=, +, -, @, tab, CR) is prefixed with an apostrophe. */
export function defuse(cell: string): string {
  return /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
}

/** CSV for the admin export: the same columns as the sheet, RFC 4180 quoting. */
export function toCsv(rows: readonly RegistrationRow[], eventTitle: string): string {
  const q = (c: string) => (/[",\n\r]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  return [SHEET_HEADER.map(q).join(','), ...rows.map((r) => sheetRow(r, eventTitle).map(q).join(','))].join('\r\n') + '\r\n';
}

// ── the numbers ───────────────────────────────────────────────────────

export interface EventStats {
  rsvps: number;
  attended: number;
  /** attended ÷ RSVPs */
  showRate: number | null;
  consented: number;
  bySource: { id: string; label: string; n: number }[];
  byInterest: { id: string; label: string; n: number }[];
  byCampaign: { id: string; n: number }[];
  /** RSVPs per day, on the event's clock */
  daily: { day: string; n: number }[];
}

export function statsOf(rows: readonly RegistrationRow[], timezone = 'America/Chicago'): EventStats {
  const attended = rows.filter((r) => r.attendance === 'attended').length;
  const count = <T extends { id: string; label: string }>(list: readonly T[], key: (r: RegistrationRow) => string | null) =>
    [
      ...list.map((x) => ({ id: x.id, label: x.label, n: rows.filter((r) => key(r) === x.id).length })),
      { id: 'none', label: 'Not answered', n: rows.filter((r) => !key(r)).length },
    ].filter((x) => x.n > 0);
  const camp = new Map<string, number>();
  for (const r of rows) {
    const k = r.ref ? `ref:${r.ref}` : r.utm_campaign || r.utm_source ? `${r.utm_source ?? '—'} / ${r.utm_campaign ?? '—'}` : 'direct';
    camp.set(k, (camp.get(k) ?? 0) + 1);
  }
  const days = new Map<string, number>();
  for (const r of rows) {
    const d = new Date(r.registered_at).toLocaleDateString('en-CA', { timeZone: timezone });
    days.set(d, (days.get(d) ?? 0) + 1);
  }
  return {
    rsvps: rows.length,
    attended,
    showRate: rows.length ? attended / rows.length : null,
    consented: rows.filter((r) => r.marketing_consent).length,
    bySource: count(SOURCES, (r) => r.source),
    byInterest: count(INTERESTS, (r) => r.interest),
    byCampaign: [...camp].map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n),
    daily: [...days].map(([day, n]) => ({ day, n })).sort((a, b) => a.day.localeCompare(b.day)),
  };
}

// ── editing an event (admins) ─────────────────────────────────────────

export type EventPatch = Partial<Pick<EventRow, 'title' | 'summary' | 'description' | 'location' | 'starts_at' | 'ends_at' | 'timezone' | 'date_confirmed' | 'tentative_note' | 'status' | 'capacity' | 'expectations' | 'self_checkin'>>;

/** An admin's edit, checked field by field. A date can be confirmed only with a start time. */
export function checkEventPatch(raw: unknown, current?: Pick<EventRow, 'starts_at'>): { ok: true; patch: EventPatch } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Nothing to change.' };
  const r = raw as Record<string, unknown>;
  const p: EventPatch = {};
  const text = (k: 'title' | 'summary' | 'description' | 'location', max: number, min = 1) => {
    if (r[k] === undefined) return null;
    const v = k === 'description' ? String(r[k] ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max) : clean(r[k], max);
    if (v.length < min) return `The ${k} cannot be empty.`;
    p[k] = v;
    return null;
  };
  for (const err of [text('title', LIMITS.title), text('summary', LIMITS.summary), text('description', LIMITS.description, 0), text('location', LIMITS.location)]) if (err) return { ok: false, error: err };
  const time = (k: 'starts_at' | 'ends_at') => {
    if (r[k] === undefined) return;
    if (r[k] === null || r[k] === '') p[k] = null;
    else if (typeof r[k] === 'number' && Number.isFinite(r[k]) && (r[k] as number) > 0) p[k] = Math.floor(r[k] as number);
  };
  time('starts_at');
  time('ends_at');
  if (r.timezone !== undefined) {
    const tz = clean(r.timezone, 60);
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      p.timezone = tz;
    } catch {
      return { ok: false, error: 'That timezone is not recognised.' };
    }
  }
  if (r.tentative_note !== undefined) p.tentative_note = clean(r.tentative_note, 200) || null;
  if (r.status !== undefined) {
    if (!(EVENT_STATUSES as readonly string[]).includes(String(r.status))) return { ok: false, error: 'Unknown status.' };
    p.status = r.status as EventStatus;
  }
  if (r.self_checkin !== undefined) p.self_checkin = r.self_checkin === true;
  if (r.capacity !== undefined) p.capacity = typeof r.capacity === 'number' && r.capacity > 0 ? Math.floor(r.capacity) : null;
  if (r.expectations !== undefined) {
    if (!Array.isArray(r.expectations)) return { ok: false, error: 'Expectations must be a list.' };
    p.expectations = r.expectations.map((x) => clean(x, LIMITS.expectation)).filter(Boolean).slice(0, 8);
  }
  const starts = p.starts_at !== undefined ? p.starts_at : current?.starts_at ?? null;
  if (r.date_confirmed !== undefined) {
    if (r.date_confirmed === true && !starts) return { ok: false, error: 'Set a start time before confirming the date.' };
    p.date_confirmed = r.date_confirmed === true;
  }
  if (p.starts_at === null) p.date_confirmed = false;
  if (p.ends_at && starts && p.ends_at <= starts) return { ok: false, error: 'The end must be after the start.' };
  return { ok: true, patch: p };
}

/** A new event's id from its title: "Socria: In Public 003" → "in-public-003"-style slugs, checked. */
const RESERVED = new Set(['rsvp', 'ticket', 'staff', 'admin', 'check', 'new']);
export function checkNewEventId(v: unknown): string | null {
  const id = clean(v, 60).toLowerCase();
  return EVENT_ID.test(id) && !RESERVED.has(id) ? id : null;
}

/** How long registrations are kept after an event ends: EVENT_RETENTION_DAYS, at least 30, default 365. */
export function retentionDays(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.EVENT_RETENTION_DAYS);
  return Number.isFinite(n) && n >= 30 ? Math.floor(n) : 365;
}

/** "2026-11-04T18:00" on the wall clock of `tz` → epoch ms (for the admin's date fields). */
export function zonedToUtc(local: string, tz: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // the zone's offset at that moment, found by asking how the guess reads there (twice, for DST edges)
  let t = guess;
  for (let i = 0; i < 2; i++) {
    const shown = utcToZoned(t, tz);
    if (!shown) return null;
    const [sy, smo, sd, sh, smi] = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(shown)!.slice(1).map(Number);
    t += guess - Date.UTC(sy, smo - 1, sd, sh, smi);
  }
  return t;
}

/** epoch ms → "2026-11-04T18:00" on the wall clock of `tz`. */
export function utcToZoned(ms: number, tz: string): string | null {
  try {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date(ms))
        .map((x) => [x.type, x.value])
    );
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  } catch {
    return null;
  }
}
