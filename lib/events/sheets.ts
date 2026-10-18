// lib/events/sheets.ts — THE GOOGLE SHEET MIRROR.
//
// The database is the source of truth; the sheet is a copy for the people
// who run events. Each event has one tab (named by the event id), and a sync
// rewrites that tab from the database — header, then every registration in
// registration order — and clears anything below. So a check-in updates the
// person's existing row, nothing is ever appended twice, and a sheet someone
// edited by hand is put right by the next sync.
//
// Authentication is a Google Cloud service account, server-side only: a JWT
// signed with its private key (RS256, node:crypto) is exchanged for a
// short-lived access token at Google's OAuth endpoint, then the Sheets API v4
// is called over HTTPS. No Google library is needed, and the credentials live
// only in environment variables (docs/EVENTS.md, "Google Sheets").
//
// Two syncs never write at once: a short lease in event_sheet_sync. A change
// made while a sync runs sets `dirty`, and the running sync goes round again.
// A failure is recorded (last_error) and leaves `dirty` set, so the next
// change — or an admin's Resync — catches the sheet up.

import 'server-only';
import { createSign } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { SHEET_HEADER, sheetRow, type EventRow } from './model';
import { getEvent, listRegistrations } from './store';

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://sheets.googleapis.com/v4/spreadsheets';
const LEASE_MS = 90_000;

export interface SheetCredentials {
  email: string;
  key: string;
  spreadsheetId: string;
}

/**
 * The credentials, from the environment, or null when any piece is missing.
 * Either the whole key file (GOOGLE_SERVICE_ACCOUNT_JSON, raw or base64) or
 * the two fields on their own; the spreadsheet id is always EVENTS_SHEET_ID.
 */
export function sheetCredentials(env: Record<string, string | undefined> = process.env): SheetCredentials | null {
  const spreadsheetId = (env.EVENTS_SHEET_ID || '').trim();
  let email = (env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim();
  let key = (env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').trim();
  const json = (env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim();
  if (json) {
    try {
      const text = json.startsWith('{') ? json : Buffer.from(json, 'base64').toString('utf8');
      const parsed = JSON.parse(text) as { client_email?: string; private_key?: string };
      email = email || String(parsed.client_email ?? '');
      key = key || String(parsed.private_key ?? '');
    } catch {
      return null;
    }
  }
  key = key.replace(/\\n/g, '\n');
  if (!spreadsheetId || !/^[A-Za-z0-9_-]{20,100}$/.test(spreadsheetId) || !email.includes('@') || !key.includes('PRIVATE KEY')) return null;
  return { email, key, spreadsheetId };
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString('base64url');

/** The signed assertion Google exchanges for an access token. */
export function signedAssertion(c: Pick<SheetCredentials, 'email' | 'key'>, now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: c.email, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${head}.${claim}`);
  return `${head}.${claim}.${b64url(signer.sign(c.key))}`;
}

type Fetch = typeof fetch;
let cached: { token: string; until: number; email: string } | null = null;

/** fetch, retried on 429 and 5xx with backoff; a refusal for any other reason is returned as is. */
async function call(f: Fetch, url: string, init: RequestInit, tries = 3): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await f(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(15_000) });
      if (res.status !== 429 && res.status < 500) return res;
      last = res;
    } catch (e) {
      if (i === tries - 1) throw e;
    }
    await new Promise((r) => setTimeout(r, 400 * 2 ** i));
  }
  return last as Response;
}

async function accessToken(c: SheetCredentials, f: Fetch, now = Date.now()): Promise<string> {
  if (cached && cached.email === c.email && cached.until > now + 60_000) return cached.token;
  const res = await call(f, TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signedAssertion(c, now) }).toString(),
  });
  if (!res.ok) throw new Error(`Google sign-in refused (${res.status}). Check the service account key.`);
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error('Google sign-in returned no token.');
  cached = { token: j.access_token, until: now + (j.expires_in ?? 3600) * 1000, email: c.email };
  return j.access_token;
}

const tabRange = (tab: string, range: string) => encodeURIComponent(`'${tab.replace(/'/g, "''")}'!${range}`);
const COLS = String.fromCharCode(64 + SHEET_HEADER.length); // 'M'

/** Write one event's tab from the given rows: the whole picture, then clear below it. */
export async function writeTab(c: SheetCredentials, event: Pick<EventRow, 'id' | 'title'>, rows: string[][], f: Fetch = fetch): Promise<void> {
  const token = await accessToken(c, f);
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const base = `${API}/${encodeURIComponent(c.spreadsheetId)}`;

  // the tab, made the first time
  const meta = await call(f, `${base}?fields=sheets.properties.title`, { headers: auth });
  if (meta.status === 403 || meta.status === 404) throw new Error(`The spreadsheet is not shared with ${c.email}, or EVENTS_SHEET_ID is wrong (${meta.status}).`);
  if (!meta.ok) throw new Error(`Could not read the spreadsheet (${meta.status}).`);
  const titles = (((await meta.json()) as { sheets?: { properties?: { title?: string } }[] }).sheets ?? []).map((s) => s.properties?.title);
  if (!titles.includes(event.id)) {
    const add = await call(f, `${base}:batchUpdate`, { method: 'POST', headers: auth, body: JSON.stringify({ requests: [{ addSheet: { properties: { title: event.id } } }] }) });
    if (!add.ok) throw new Error(`Could not add the "${event.id}" tab (${add.status}).`);
  }

  const values = [[...SHEET_HEADER], ...rows];
  const put = await call(f, `${base}/values/${tabRange(event.id, `A1:${COLS}${values.length}`)}?valueInputOption=RAW`, {
    method: 'PUT',
    headers: auth,
    body: JSON.stringify({ range: `'${event.id}'!A1:${COLS}${values.length}`, majorDimension: 'ROWS', values }),
  });
  if (!put.ok) throw new Error(`Could not write the rows (${put.status}).`);
  const clear = await call(f, `${base}/values/${tabRange(event.id, `A${values.length + 1}:${COLS}`)}:clear`, { method: 'POST', headers: auth, body: '{}' });
  if (!clear.ok) throw new Error(`Could not clear old rows (${clear.status}).`);
}

export interface SyncState {
  configured: boolean;
  lastOkAt: number | null;
  lastRows: number | null;
  lastError: string | null;
  lastErrorAt: number | null;
  pending: boolean;
}

export async function syncState(eventId: string): Promise<SyncState> {
  const configured = !!sheetCredentials();
  const { data } = await supabaseAdmin().from('event_sheet_sync').select('last_ok_at, last_rows, last_error, last_error_at, dirty').eq('event_id', eventId).maybeSingle();
  const r = data as any;
  return {
    configured,
    lastOkAt: r?.last_ok_at ? Number(r.last_ok_at) : null,
    lastRows: r?.last_rows ?? null,
    lastError: r?.last_error ?? null,
    lastErrorAt: r?.last_error_at ? Number(r.last_error_at) : null,
    pending: r ? r.dirty === true : true,
  };
}

export type SyncResult = { status: 'synced'; rows: number } | { status: 'queued' } | { status: 'unconfigured' } | { status: 'failed'; error: string };

/**
 * Bring an event's tab up to date with the database. Safe to call after every
 * change and from several requests at once: one writes, the rest leave a note.
 */
export async function syncEvent(eventId: string, f: Fetch = fetch, now = () => Date.now()): Promise<SyncResult> {
  const db = supabaseAdmin();
  // the change is recorded first, whether or not the sheet is reachable
  await db.from('event_sheet_sync').upsert({ event_id: eventId, lease_until: 0, dirty: true }, { onConflict: 'event_id', ignoreDuplicates: true });
  await db.from('event_sheet_sync').update({ dirty: true }).eq('event_id', eventId);
  const c = sheetCredentials();
  if (!c) return { status: 'unconfigured' };

  const t = now();
  const { count } = await db.from('event_sheet_sync').update({ lease_until: t + LEASE_MS }, { count: 'exact' }).eq('event_id', eventId).lt('lease_until', t);
  if (!count) return { status: 'queued' };

  try {
    let rows = 0;
    for (let round = 0; round < 3; round++) {
      await db.from('event_sheet_sync').update({ dirty: false }).eq('event_id', eventId);
      const event = await getEvent(eventId);
      if (!event) throw new Error('The event no longer exists.');
      const regs = await listRegistrations(eventId);
      await writeTab(c, event, regs.map((r) => sheetRow(r, event.title)), f);
      rows = regs.length;
      const { data } = await db.from('event_sheet_sync').select('dirty').eq('event_id', eventId).maybeSingle();
      if (!(data as any)?.dirty) break;
    }
    await db.from('event_sheet_sync').update({ lease_until: 0, last_ok_at: now(), last_rows: rows, last_error: null }).eq('event_id', eventId);
    return { status: 'synced', rows };
  } catch (e) {
    const error = (e instanceof Error ? e.message : 'Sync failed.').slice(0, 300);
    console.warn('[events] sheet sync failed', eventId);
    await db.from('event_sheet_sync').update({ lease_until: 0, dirty: true, last_error: error, last_error_at: now() }).eq('event_id', eventId);
    return { status: 'failed', error };
  }
}
