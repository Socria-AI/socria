// lib/events/store.ts — the event tables, read and written with the service
// role. Every function here is server-only; the routes decide who may call
// which (lib/events/staff.ts).
//
// The attendee's secret is generated here and returned once, to them: only
// its SHA-256 is stored, so a leaked table cannot be turned into tickets.

import 'server-only';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { CODE_ALPHABET, EVENT_ID, REG_ID, TOKEN, matchCheckin, type CheckinLookup, type EventPatch, type EventRow, type RegistrationRow, type RsvpInput } from './model';

/** An error the routes turn into a status; never the database's own message. */
export class EventStoreError extends Error {
  constructor(public kind: 'unavailable' | 'not-found' | 'duplicate' | 'closed' | 'full' | 'conflict', message: string = kind) {
    super(message);
  }
}

const missingTable = (e: { code?: string } | null | undefined) => !!e && ['42P01', 'PGRST205'].includes(String(e.code));

function fail(e: { code?: string; message?: string } | null): never {
  if (missingTable(e)) throw new EventStoreError('unavailable', 'The events tables are not set up on this deployment.');
  console.error('[events] database error', e?.code);
  throw new EventStoreError('unavailable');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}
export function newRegistrationId(): string {
  return `rsvp_${randomBytes(12).toString('hex')}`;
}
export function newCode(): string {
  let c = '';
  for (let i = 0; i < 6; i++) c += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return c;
}

const EVENT_COLS = 'id, title, summary, description, location, starts_at, ends_at, timezone, date_confirmed, tentative_note, status, capacity, expectations, self_checkin, created_at, updated_at';
const REG_COLS =
  'id, event_id, full_name, email, email_norm, interest, interest_other, source, utm_source, utm_medium, utm_campaign, ref, registered_at, registered_via, attendance, checked_in_at, checked_in_by, marketing_consent, consent_at, token_hash, code';

function toEvent(r: any): EventRow {
  return {
    ...r,
    starts_at: r.starts_at == null ? null : Number(r.starts_at),
    ends_at: r.ends_at == null ? null : Number(r.ends_at),
    created_at: Number(r.created_at),
    updated_at: Number(r.updated_at),
    expectations: Array.isArray(r.expectations) ? r.expectations : [],
    self_checkin: r.self_checkin === true,
  };
}
function toReg(r: any): RegistrationRow {
  return {
    ...r,
    registered_at: Number(r.registered_at),
    checked_in_at: r.checked_in_at == null ? null : Number(r.checked_in_at),
    consent_at: r.consent_at == null ? null : Number(r.consent_at),
    marketing_consent: r.marketing_consent === true,
  };
}

// ── events ────────────────────────────────────────────────────────────

export async function getEvent(id: string): Promise<EventRow | null> {
  if (!EVENT_ID.test(id)) return null;
  const { data, error } = await supabaseAdmin().from('events').select(EVENT_COLS).eq('id', id).maybeSingle();
  if (error) {
    if (missingTable(error)) return null;
    fail(error);
  }
  return data ? toEvent(data) : null;
}

export async function listEvents(): Promise<EventRow[]> {
  const { data, error } = await supabaseAdmin().from('events').select(EVENT_COLS).order('created_at', { ascending: false });
  if (error) fail(error);
  return (data ?? []).map(toEvent);
}

export async function createEvent(id: string, title: string, now = Date.now()): Promise<EventRow> {
  const row = { id, title, summary: '', description: '', location: '', timezone: 'America/Chicago', date_confirmed: false, status: 'draft', expectations: [], created_at: now, updated_at: now };
  const { error } = await supabaseAdmin().from('events').insert(row);
  if (error) {
    if (error.code === '23505') throw new EventStoreError('duplicate', 'An event with that id already exists.');
    fail(error);
  }
  return toEvent({ ...row, starts_at: null, ends_at: null, tentative_note: null, capacity: null, self_checkin: false });
}

export async function updateEvent(id: string, patch: EventPatch, now = Date.now()): Promise<void> {
  const { error, count } = await supabaseAdmin().from('events').update({ ...patch, updated_at: now }, { count: 'exact' }).eq('id', id);
  if (error) fail(error);
  if (!count) throw new EventStoreError('not-found');
}

// ── registrations ─────────────────────────────────────────────────────

export async function listRegistrations(eventId: string): Promise<RegistrationRow[]> {
  const out: RegistrationRow[] = [];
  const PAGE = 1000;
  for (let from = 0; from < 20_000; from += PAGE) {
    const { data, error } = await supabaseAdmin()
      .from('event_registrations')
      .select(REG_COLS)
      .eq('event_id', eventId)
      .order('registered_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) fail(error);
    out.push(...(data ?? []).map(toReg));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export async function countRegistrations(eventId: string): Promise<number> {
  const { count, error } = await supabaseAdmin().from('event_registrations').select('id', { count: 'exact', head: true }).eq('event_id', eventId);
  if (error) fail(error);
  return count ?? 0;
}

/**
 * A new RSVP. Returns the registration and its secret token (the only time
 * the token exists outside the attendee's hands). A second RSVP for the same
 * event and email is refused as a duplicate — never a second row.
 */
export async function register(event: EventRow, input: RsvpInput, now = Date.now()): Promise<{ row: RegistrationRow; token: string }> {
  if (event.status !== 'open') throw new EventStoreError('closed');
  if (event.capacity && (await countRegistrations(event.id)) >= event.capacity) throw new EventStoreError('full');
  const token = newToken();
  for (let attempt = 0; attempt < 4; attempt++) {
    const row: RegistrationRow = {
      id: newRegistrationId(),
      event_id: event.id,
      full_name: input.fullName,
      email: input.email,
      email_norm: input.emailNorm,
      interest: input.interest,
      interest_other: input.interestOther,
      source: input.source,
      utm_source: input.utm.source,
      utm_medium: input.utm.medium,
      utm_campaign: input.utm.campaign,
      ref: input.ref,
      registered_at: now,
      registered_via: 'web',
      attendance: 'registered',
      checked_in_at: null,
      checked_in_by: null,
      marketing_consent: input.marketingConsent,
      consent_at: input.marketingConsent ? now : null,
      token_hash: hashToken(token),
      code: newCode(),
    };
    const { error } = await supabaseAdmin().from('event_registrations').insert(row);
    if (!error) return { row, token };
    if (error.code !== '23505') fail(error);
    // one email per event: is it the email, or a one-in-a-billion code collision?
    if (await findByEmail(event.id, input.emailNorm)) throw new EventStoreError('duplicate');
  }
  throw new EventStoreError('unavailable');
}

/** A walk-in, registered and checked in at once by staff. Email optional. */
export async function registerWalkIn(event: EventRow, fullName: string, emailNorm: string | null, email: string | null, staff: string, now = Date.now()): Promise<RegistrationRow> {
  if (emailNorm) {
    const existing = await findByEmail(event.id, emailNorm);
    if (existing) throw new EventStoreError('duplicate', existing.id);
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const row: RegistrationRow = {
      id: newRegistrationId(),
      event_id: event.id,
      full_name: fullName,
      email,
      email_norm: emailNorm,
      interest: null,
      interest_other: null,
      source: null,
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      ref: null,
      registered_at: now,
      registered_via: 'walk-in',
      attendance: 'attended',
      checked_in_at: now,
      checked_in_by: staff,
      marketing_consent: false,
      consent_at: null,
      // a walk-in gets no link, so no usable token: a hash of fresh random bytes nobody holds
      token_hash: hashToken(newToken()),
      code: newCode(),
    };
    const { error } = await supabaseAdmin().from('event_registrations').insert(row);
    if (!error) return row;
    if (error.code !== '23505') fail(error);
    if (emailNorm && (await findByEmail(event.id, emailNorm))) throw new EventStoreError('duplicate');
  }
  throw new EventStoreError('unavailable');
}

/**
 * Check in at the venue, by the attendee: the QR code at the door opens the
 * check-in page, where they type the name or the email they RSVP'd with.
 * Only an existing RSVP can be checked in this way — once — and the
 * check-in is recorded as 'self'. Open only while an admin has switched
 * self check-in on.
 */
export async function selfCheckIn(event: EventRow, q: CheckinLookup, now = Date.now()): Promise<{ status: 'checked-in' | 'already'; row: RegistrationRow } | { status: 'not-found' | 'ambiguous' }> {
  const hits = matchCheckin(await listRegistrations(event.id), q);
  if (!hits.length) return { status: 'not-found' };
  if (hits.length > 1) return { status: 'ambiguous' };
  const r = await checkIn(hits[0].id, 'self', now);
  return r.ok ? { status: 'checked-in', row: r.row } : { status: 'already', row: r.already };
}

export async function findByEmail(eventId: string, emailNorm: string): Promise<RegistrationRow | null> {
  const { data, error } = await supabaseAdmin().from('event_registrations').select(REG_COLS).eq('event_id', eventId).eq('email_norm', emailNorm).maybeSingle();
  if (error) fail(error);
  return data ? toReg(data) : null;
}

export async function findByToken(token: string): Promise<RegistrationRow | null> {
  if (!TOKEN.test(token)) return null;
  const { data, error } = await supabaseAdmin().from('event_registrations').select(REG_COLS).eq('token_hash', hashToken(token)).maybeSingle();
  if (error) fail(error);
  return data ? toReg(data) : null;
}

export async function findById(id: string): Promise<RegistrationRow | null> {
  if (!REG_ID.test(id)) return null;
  const { data, error } = await supabaseAdmin().from('event_registrations').select(REG_COLS).eq('id', id).maybeSingle();
  if (error) fail(error);
  return data ? toReg(data) : null;
}

/**
 * Mark attended — once. The update only matches a row that is still
 * 'registered', so two staff confirming at the same moment cannot both
 * succeed, and a second scan reports the first check-in instead of moving it.
 */
export async function checkIn(id: string, staff: string, now = Date.now()): Promise<{ ok: true; row: RegistrationRow } | { ok: false; already: RegistrationRow }> {
  const { error, count } = await supabaseAdmin()
    .from('event_registrations')
    .update({ attendance: 'attended', checked_in_at: now, checked_in_by: staff }, { count: 'exact' })
    .eq('id', id)
    .eq('attendance', 'registered');
  if (error) fail(error);
  const row = await findById(id);
  if (!row) throw new EventStoreError('not-found');
  return count ? { ok: true, row } : { ok: false, already: row };
}

/** Undo a mistaken check-in (staff). */
export async function undoCheckIn(id: string): Promise<void> {
  const { error, count } = await supabaseAdmin()
    .from('event_registrations')
    .update({ attendance: 'registered', checked_in_at: null, checked_in_by: null }, { count: 'exact' })
    .eq('id', id)
    .eq('attendance', 'attended')
    .eq('registered_via', 'web');
  if (error) fail(error);
  if (!count) throw new EventStoreError('conflict');
}

export async function deleteRegistration(id: string): Promise<boolean> {
  const { error, count } = await supabaseAdmin().from('event_registrations').delete({ count: 'exact' }).eq('id', id);
  if (error) fail(error);
  return !!count;
}

/** Retention: every registration of an event that ended before `before`. Returns how many went, and from which events. */
export async function purgeEndedBefore(before: number): Promise<{ deleted: number; events: string[] }> {
  const events = (await listEvents()).filter((e) => {
    const end = e.ends_at ?? e.starts_at;
    return end !== null && end < before;
  });
  let n = 0;
  const touched: string[] = [];
  for (const e of events) {
    const { error, count } = await supabaseAdmin().from('event_registrations').delete({ count: 'exact' }).eq('event_id', e.id);
    if (error) fail(error);
    if (count) touched.push(e.id);
    n += count ?? 0;
  }
  return { deleted: n, events: touched };
}

/** Every registration under these verified addresses — for account export and deletion. */
export async function registrationsForEmails(emails: string[]): Promise<RegistrationRow[]> {
  const list = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
  if (!list.length) return [];
  const { data, error } = await supabaseAdmin().from('event_registrations').select(REG_COLS).in('email_norm', list);
  if (error) {
    if (missingTable(error)) return [];
    fail(error);
  }
  return (data ?? []).map(toReg);
}
