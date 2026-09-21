// lib/logos-connect.ts — SERVER ONLY. Never import from a client component.
//
// The connectors behind "Add context". Each one does exactly two things:
// search (turn a query into a short list of the person's own items) and
// fetch (turn one chosen item into normalized text). Nothing is pulled in
// silently — every byte that reaches a prompt was individually chosen by the
// person, for a specific node.
//
// Auth model: each signed-in person authorizes Google/Notion themselves
// (read-only) via the OAuth flow in lib/logos-oauth.ts; the tokens are stored
// encrypted per user (lib/logos-connections.ts). Deployment-wide env
// credentials are still honoured as a fallback so older setups keep working.
// Every call resolves a token for the acting user, so one person's connection
// never reads another's material.

import type { SourceKind } from './logos-sources';
import { MAX_CONTEXT_TEXT, MAX_CONTEXT_TITLE } from './logos-sources';
import { Agent } from 'undici';
import { lookup as dnsLookup } from 'node:dns';

export interface SourceStatus {
  kind: SourceKind;
  connected: boolean;
  /** true when the user can start an OAuth connect for this source right here */
  canConnect?: boolean;
  /** which provider a Connect button would authorize */
  provider?: 'google' | 'notion';
  /** the connected account/workspace, for display */
  account?: string;
  /** shown in the picker when not connected */
  hint?: string;
}

export interface SourceItem {
  id: string;
  title: string;
  detail?: string;
}

export interface FetchedContext {
  title: string;
  ref?: string;
  text: string;
}

export class ConnectError extends Error {
  constructor(
    message: string,
    public status = 502
  ) {
    super(message);
  }
}

// ── Google auth ─────────────────────────────────────────────────────
// Either a raw access token (quick local testing) or client credentials plus
// a refresh token (survives the hour). Cached in module scope per instance.

// The acting user. Passed to every search/fetch so a token is resolved for the
// person making the request, never shared.
export type Auth = { userId: string | null };

let gEnvCache: { token: string; exp: number } | null = null;

// A Google access token for the acting user: their stored OAuth grant first,
// then deployment env credentials as a fallback.
async function googleToken(auth: Auth): Promise<string> {
  if (auth.userId) {
    const { googleAccessTokenFor } = await import('./logos-oauth');
    const t = await googleAccessTokenFor(auth.userId);
    if (t) return t;
  }
  // Fallback: deployment-wide env credentials.
  if (process.env.GOOGLE_ACCESS_TOKEN) return process.env.GOOGLE_ACCESS_TOKEN;
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refresh = process.env.GOOGLE_REFRESH_TOKEN;
  if (!id || !secret || !refresh) throw new ConnectError('Google is not connected.', 400);
  if (gEnvCache && Date.now() < gEnvCache.exp - 60_000) return gEnvCache.token;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      refresh_token: refresh,
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
  });
  if (!res.ok) throw new ConnectError('Google sign-in has expired — reconnect it.', 502);
  const json = await res.json();
  if (!json?.access_token) throw new ConnectError('Google sign-in has expired — reconnect it.', 502);
  gEnvCache = { token: json.access_token, exp: Date.now() + (Number(json.expires_in) || 3000) * 1000 };
  return gEnvCache.token;
}

async function notionToken(auth: Auth): Promise<string> {
  if (auth.userId) {
    const { notionTokenFor } = await import('./logos-oauth');
    const t = await notionTokenFor(auth.userId);
    if (t) return t;
  }
  if (process.env.NOTION_API_KEY) return process.env.NOTION_API_KEY;
  throw new ConnectError('Notion is not connected.', 400);
}

async function gGet(url: string, auth: Auth): Promise<any> {
  const token = await googleToken(auth);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (res.status === 401 || res.status === 403) {
    throw new ConnectError('Google said no — the connection may need broader scopes.', 502);
  }
  if (!res.ok) throw new ConnectError('Google did not answer.', 502);
  return res.json();
}

async function gGetText(url: string, auth: Auth): Promise<string> {
  const token = await googleToken(auth);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new ConnectError('That file could not be read.', 502);
  return res.text();
}

// ── which sources exist right now ───────────────────────────────────

/**
 * Are the OAuth-backed sources (Drive, Sheets, Calendar, Gmail, Notion) offered?
 *
 * Off by default. Google puts `drive.readonly` and every Gmail read scope in
 * its RESTRICTED tier, which cannot be published to the public without a paid
 * third-party security assessment — so while these are on, only emails added
 * to the Cloud Console test-user list can connect, and their tokens expire
 * weekly. Rather than gate Socria behind that, the connectors are dormant and
 * everyone gets the whole product.
 *
 * Nothing is deleted: the routes, token store and connectors all still exist.
 * Set SOCRIA_CONNECTORS=on to bring them back — ideally alongside a move to
 * `drive.file` (picker-only, needs no verification) and dropping Gmail, which
 * is what makes public publishing free.
 *
 * The web / paste / upload sources are unaffected and always available.
 */
export function connectorsEnabled(): boolean {
  return process.env.SOCRIA_CONNECTORS === 'on';
}

export async function listSources(auth: Auth): Promise<SourceStatus[]> {
  // Dormant: offer only what needs no third-party authorization.
  if (!connectorsEnabled()) {
    return [
      { kind: 'web', connected: true },
      { kind: 'paste', connected: true },
      { kind: 'upload', connected: true },
    ];
  }

  const { connectionStatus } = await import('./logos-connections');
  const { providerConfig } = await import('./logos-oauth');
  const status = await connectionStatus(auth.userId);

  // Connected if the user has authorized it OR the deployment set env creds.
  const envGoogle = !!(
    process.env.GOOGLE_ACCESS_TOKEN ||
    (process.env.GOOGLE_OAUTH_CLIENT_ID &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN)
  );
  const google = status.google || envGoogle;
  const notion = status.notion || !!process.env.NOTION_API_KEY;
  // Can the user START a connection here? (OAuth app configured + signed in.)
  const canConnectGoogle = providerConfig('google').configured && !!auth.userId;
  const canConnectNotion = providerConfig('notion').configured && !!auth.userId;

  const gHint = auth.userId
    ? 'Connect your Google account to bring in Docs, Sheets, Calendar and Gmail.'
    : 'Sign in, then connect your Google account.';
  const nHint = auth.userId
    ? 'Connect your Notion workspace to bring in pages you share.'
    : 'Sign in, then connect your Notion workspace.';

  return [
    { kind: 'drive', connected: google, canConnect: canConnectGoogle, provider: 'google', account: status.accounts.google, hint: google ? undefined : gHint },
    { kind: 'sheets', connected: google, canConnect: canConnectGoogle, provider: 'google', account: status.accounts.google, hint: google ? undefined : gHint },
    { kind: 'calendar', connected: google, canConnect: canConnectGoogle, provider: 'google', account: status.accounts.google, hint: google ? undefined : gHint },
    { kind: 'gmail', connected: google, canConnect: canConnectGoogle, provider: 'google', account: status.accounts.google, hint: google ? undefined : gHint },
    { kind: 'notion', connected: notion, canConnect: canConnectNotion, provider: 'notion', account: status.accounts.notion, hint: notion ? undefined : nHint },
    // These three always work — the interaction is never locked behind OAuth.
    { kind: 'web', connected: true },
    { kind: 'paste', connected: true },
    { kind: 'upload', connected: true },
  ];
}

// ── search ──────────────────────────────────────────────────────────

const esc = (q: string) => q.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function searchDrive(query: string, sheetsOnly: boolean, auth: Auth): Promise<SourceItem[]> {
  const mime = sheetsOnly ? ` and mimeType='application/vnd.google-apps.spreadsheet'` : '';
  const base = 'https://www.googleapis.com/drive/v3/files';
  const fields = 'files(id,name,mimeType,modifiedTime)';
  // fullText search forbids orderBy, so recent-files browsing and searching
  // take different shapes.
  const url = query.trim()
    ? `${base}?q=${encodeURIComponent(
        `trashed=false${mime} and (name contains '${esc(query)}' or fullText contains '${esc(query)}')`
      )}&pageSize=12&fields=${encodeURIComponent(fields)}`
    : `${base}?q=${encodeURIComponent(`trashed=false${mime}`)}&orderBy=modifiedTime desc&pageSize=12&fields=${encodeURIComponent(fields)}`;
  const json = await gGet(url, auth);
  return (json?.files ?? []).map((f: any) => ({
    id: String(f.id),
    title: String(f.name ?? 'Untitled'),
    detail: `${mimeLabel(String(f.mimeType ?? ''))}${f.modifiedTime ? ` · ${String(f.modifiedTime).slice(0, 10)}` : ''}`,
  }));
}

function mimeLabel(m: string): string {
  if (m === 'application/vnd.google-apps.document') return 'Doc';
  if (m === 'application/vnd.google-apps.spreadsheet') return 'Sheet';
  if (m === 'application/pdf') return 'PDF';
  if (m.startsWith('text/')) return 'Text';
  return 'File';
}

async function searchCalendar(query: string, auth: Auth): Promise<SourceItem[]> {
  const now = new Date();
  const timeMin = new Date(now.getTime() - 7 * 86400_000).toISOString();
  const timeMax = new Date(now.getTime() + 60 * 86400_000).toISOString();
  const url =
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime` +
    `&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&maxResults=15` +
    (query.trim() ? `&q=${encodeURIComponent(query)}` : '');
  const json = await gGet(url, auth);
  return (json?.items ?? []).map((e: any) => ({
    id: String(e.id),
    title: String(e.summary ?? '(no title)'),
    detail: fmtEventTime(e),
  }));
}

function fmtEventTime(e: any): string {
  const start = e?.start?.dateTime ?? e?.start?.date ?? '';
  const end = e?.end?.dateTime ?? e?.end?.date ?? '';
  return [String(start).replace('T', ' ').slice(0, 16), String(end).replace('T', ' ').slice(0, 16)]
    .filter(Boolean)
    .join(' → ');
}

async function searchGmail(query: string, auth: Auth): Promise<SourceItem[]> {
  const url =
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10` +
    (query.trim() ? `&q=${encodeURIComponent(query)}` : '');
  const json = await gGet(url, auth);
  const ids: string[] = (json?.messages ?? []).slice(0, 8).map((m: any) => String(m.id));
  const metas = await Promise.all(
    ids.map((id) =>
      gGet(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        auth
      ).catch(() => null)
    )
  );
  return metas
    .map((m, i) => {
      if (!m) return null;
      const h = (name: string) =>
        (m.payload?.headers ?? []).find((x: any) => x?.name === name)?.value ?? '';
      return {
        id: ids[i],
        title: String(h('Subject') || '(no subject)').slice(0, 140),
        detail: `${String(h('From')).slice(0, 60)}${h('Date') ? ` · ${String(h('Date')).slice(0, 22)}` : ''}`,
      };
    })
    .filter(Boolean) as SourceItem[];
}

async function searchNotion(query: string, auth: Auth): Promise<SourceItem[]> {
  const key = await notionToken(auth);
  const res = await fetch('https://api.notion.com/v1/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      page_size: 12,
      filter: { property: 'object', value: 'page' },
    }),
    cache: 'no-store',
  });
  if (!res.ok) throw new ConnectError('Notion did not answer — is the token valid?', 502);
  const json = await res.json();
  return (json?.results ?? []).map((p: any) => ({
    id: String(p.id),
    title: notionTitle(p),
    detail: p.last_edited_time ? String(p.last_edited_time).slice(0, 10) : undefined,
  }));
}

function notionTitle(page: any): string {
  const props = page?.properties ?? {};
  for (const v of Object.values<any>(props)) {
    if (v?.type === 'title' && Array.isArray(v.title) && v.title.length) {
      return v.title.map((t: any) => t?.plain_text ?? '').join('').slice(0, 140) || 'Untitled';
    }
  }
  return 'Untitled';
}

export async function searchSource(
  kind: SourceKind,
  query: string,
  auth: Auth
): Promise<SourceItem[]> {
  switch (kind) {
    case 'drive':
      return searchDrive(query, false, auth);
    case 'sheets':
      return searchDrive(query, true, auth);
    case 'calendar':
      return searchCalendar(query, auth);
    case 'gmail':
      return searchGmail(query, auth);
    case 'notion':
      return searchNotion(query, auth);
    default:
      throw new ConnectError('That source is not searchable.', 400);
  }
}

// ── fetch one chosen item ───────────────────────────────────────────

const cap = (s: string) => s.replace(/\r\n/g, '\n').trim().slice(0, MAX_CONTEXT_TEXT);

async function fetchDriveFile(id: string, auth: Auth): Promise<FetchedContext> {
  const meta = await gGet(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType,webViewLink`,
    auth
  );
  const name = String(meta?.name ?? 'Untitled');
  const mime = String(meta?.mimeType ?? '');
  const ref = meta?.webViewLink ? String(meta.webViewLink) : undefined;
  const base = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`;

  if (mime === 'application/vnd.google-apps.document') {
    const text = await gGetText(`${base}/export?mimeType=${encodeURIComponent('text/plain')}`, auth);
    return { title: name, ref, text: cap(text) };
  }
  if (mime === 'application/vnd.google-apps.spreadsheet') {
    const text = await gGetText(`${base}/export?mimeType=${encodeURIComponent('text/csv')}`, auth);
    return { title: name, ref, text: cap(text) };
  }
  if (mime.startsWith('text/') || mime === 'application/json') {
    const text = await gGetText(`${base}?alt=media`, auth);
    return { title: name, ref, text: cap(text) };
  }
  throw new ConnectError(
    `“${name}” is a ${mimeLabel(mime)} — only Docs, Sheets and plain-text files can be read for now.`,
    422
  );
}

async function fetchCalendarEvent(id: string, auth: Auth): Promise<FetchedContext> {
  const e = await gGet(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`,
    auth
  );
  const parts = [
    `Event: ${e?.summary ?? '(no title)'}`,
    `When: ${fmtEventTime(e)}`,
    e?.location ? `Where: ${e.location}` : '',
    Array.isArray(e?.attendees) && e.attendees.length
      ? `Attendees (${e.attendees.length}): ${e.attendees
          .slice(0, 12)
          .map((a: any) => a?.displayName || a?.email || '')
          .filter(Boolean)
          .join(', ')}`
      : '',
    e?.description ? `Notes: ${String(e.description)}` : '',
  ].filter(Boolean);
  return {
    title: String(e?.summary ?? '(no title)').slice(0, 140),
    ref: e?.htmlLink ? String(e.htmlLink) : undefined,
    text: cap(parts.join('\n')),
  };
}

function b64url(s: string): string {
  try {
    return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function gmailBody(payload: any): string {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) return b64url(payload.body.data);
  for (const part of payload.parts ?? []) {
    const found = gmailBody(part);
    if (found) return found;
  }
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return htmlToText(b64url(payload.body.data)).text;
  }
  return '';
}

async function fetchGmailMessage(id: string, auth: Auth): Promise<FetchedContext> {
  const m = await gGet(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`,
    auth
  );
  const h = (name: string) =>
    (m?.payload?.headers ?? []).find((x: any) => x?.name === name)?.value ?? '';
  const body = gmailBody(m?.payload) || String(m?.snippet ?? '');
  const text = [
    `From: ${h('From')}`,
    `To: ${h('To')}`,
    `Date: ${h('Date')}`,
    `Subject: ${h('Subject')}`,
    '',
    body,
  ].join('\n');
  return { title: String(h('Subject') || '(no subject)').slice(0, 140), text: cap(text) };
}

async function notionBlocks(id: string, depth: number, budget: { left: number }, key: string): Promise<string[]> {
  if (depth > 2 || budget.left <= 0) return [];
  const res = await fetch(
    `https://api.notion.com/v1/blocks/${encodeURIComponent(id)}/children?page_size=100`,
    {
      headers: { Authorization: `Bearer ${key}`, 'Notion-Version': '2022-06-28' },
      cache: 'no-store',
    }
  );
  if (!res.ok) return [];
  const json = await res.json();
  const lines: string[] = [];
  for (const b of json?.results ?? []) {
    if (budget.left-- <= 0) break;
    const t = b?.type;
    const rich = b?.[t]?.rich_text;
    if (Array.isArray(rich) && rich.length) {
      const text = rich.map((r: any) => r?.plain_text ?? '').join('');
      if (text.trim()) {
        const prefix =
          t === 'heading_1' || t === 'heading_2' || t === 'heading_3'
            ? '\n'
            : t === 'bulleted_list_item' || t === 'numbered_list_item'
              ? '- '
              : '';
        lines.push(prefix + text);
      }
    }
    if (b?.has_children && b?.id) {
      lines.push(...(await notionBlocks(String(b.id), depth + 1, budget, key)));
    }
  }
  return lines;
}

async function fetchNotionPage(id: string, auth: Auth): Promise<FetchedContext> {
  const key = await notionToken(auth);
  const pageRes = await fetch(`https://api.notion.com/v1/pages/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${key}`, 'Notion-Version': '2022-06-28' },
    cache: 'no-store',
  });
  const page = pageRes.ok ? await pageRes.json() : null;
  const lines = await notionBlocks(id, 0, { left: 300 }, key);
  if (!lines.length) throw new ConnectError('That page has no readable text.', 422);
  return {
    title: page ? notionTitle(page) : 'Notion page',
    ref: page?.url ? String(page.url) : undefined,
    text: cap(lines.join('\n')),
  };
}

// ── the web: fetch a page the person is reading ─────────────────────
//
// This is the one connector that fetches an arbitrary URL server-side, which
// makes it an SSRF hole unless the destination is checked — before the
// request AND after redirects. Hostname screening blocks the obvious internal
// surfaces (loopback, RFC1918, link-local/cloud metadata, .internal). DNS
// rebinding is out of scope for a prototype and noted here so nobody
// mistakes this for a hardened proxy.

/** A decoded IPv4 dotted-quad in a private, loopback, link-local or otherwise
 *  non-public range. Used both for literal hostnames and for resolved DNS. */
function isForbiddenV4(a: number, b: number): boolean {
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  // Documentation ranges (RFC 5737). Not routable, so a name resolving to one
  // is a misconfiguration or a probe, never a page somebody meant to read.
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 + 192.0.2.0/24
  if (a === 198 && b === 51) return true; // 198.51.100.0/24
  if (a === 203 && b === 0) return true; // 203.0.113.0/24
  if (a === 192 && b === 88) return true; // 6to4 relay anycast
  // Multicast and reserved: 224.0.0.0/4 and 240.0.0.0/4, which together are
  // everything from 224 up — including the 255.255.255.255 broadcast.
  if (a >= 224) return true;
  return false;
}

/** Screen a concrete IP string (from DNS or a literal) for private ranges. */
export function isForbiddenIp(ip: string): boolean {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, '');
  // IPv4-mapped/embedded IPv6 → pull the v4 out and screen it.
  const mapped = s.match(/^(?:::ffff:|::)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (s.startsWith('::ffff:') || s.startsWith('::')) {
    const dotted = s.replace(/^::(?:ffff:)?/, '');
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(dotted)) {
      const p = dotted.split('.').map(Number);
      return isForbiddenV4(p[0], p[1]);
    }
    if (mapped) {
      const hi = parseInt(mapped[1], 16);
      const lo = parseInt(mapped[2], 16);
      return isForbiddenV4((hi >> 8) & 255, hi & 255) || isForbiddenV4((lo >> 8) & 255, lo & 255);
    }
  }
  if (s.includes(':')) {
    // NAT64 (64:ff9b::/96 and the local 64:ff9b:1::/48) carries a v4 address
    // in its low bits — on a NAT64 network that reaches the v4 internet,
    // including the v4 addresses this function exists to keep us off. Pull
    // the embedded address out and screen it like any other.
    const nat64 = s.match(/^64:ff9b(?::1)?:(?::)?(?:.*:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
    if (nat64) {
      const hi = parseInt(nat64[1], 16);
      const lo = parseInt(nat64[2], 16);
      return isForbiddenV4((hi >> 8) & 255, hi & 255) || isForbiddenV4((lo >> 8) & 255, lo & 255);
    }
    if (/^64:ff9b:/i.test(s)) return true; // any other NAT64 form: refuse
    // Genuine IPv6: block loopback, unspecified, unique-local, link-local,
    // and the reserved/documentation ranges that have no business being a
    // page somebody asked us to read.
    if (s === '::' || s === '::1') return true;
    if (/^(fc|fd|fe8|fe9|fea|feb)/.test(s)) return true;
    if (/^(2001:db8|100::|2002:)/.test(s)) return true;
    if (/^ff/.test(s)) return true; // multicast
    return false;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) {
    const p = s.split('.').map(Number);
    if (p.some((n) => n > 255)) return true;
    return isForbiddenV4(p[0], p[1]);
  }
  return false;
}

export function isForbiddenHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan')) return true;
  // bare-digit hostnames are integer-encoded IPs (2130706433 = 127.0.0.1)
  if (/^\d+$/.test(h)) return true;
  if (h.includes(':')) return isForbiddenIp(h);
  // IPv4 literals, including octal/hex octets — matched strictly as four
  // dot-separated numeric octets so ordinary hostnames never trip this.
  if (/^(\d+|0x[0-9a-f]+)(\.(\d+|0x[0-9a-f]+)){3}$/i.test(h)) {
    const parts = h.split('.').map((p) => {
      if (/^0x[0-9a-f]+$/i.test(p)) return parseInt(p, 16);
      if (/^0\d+$/.test(p)) return parseInt(p, 8);
      return parseInt(p, 10);
    });
    // Shaped like an IP but not a valid one — refuse rather than guess.
    if (parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    return isForbiddenV4(parts[0], parts[1]);
  }
  return false;
}

// A hostname can pass the literal screen and still resolve to an internal
// address: `127.0.0.1.nip.io` is a perfectly ordinary public domain with an A
// record for loopback, and one attacker-controlled DNS record generalises
// that to any address at all. So the name is resolved and EVERY answer is
// screened.
//
// This function existed before and was never called — the literal-hostname
// check was the whole of the destination screening, and a name pointing at
// 169.254.169.254 was fetched and its body handed back to the caller. It is
// called now, from the one place that matters (fetchWeb), and the addresses
// it approves are checked again on every redirect hop — and, crucially, the
// address that is APPROVED is the address that is DIALLED. See safeAgent
// below: screening a name and then letting fetch() resolve it a second time
// is a rebinding hole, because the second answer need not match the first.
async function resolvePublicAddresses(hostname: string): Promise<string[]> {
  // A literal IP needs no lookup — isForbiddenHost already screened it.
  if (/^[0-9.]+$/.test(hostname) || hostname.includes(':')) return [];
  let addrs: { address: string }[];
  try {
    const dns = await import('node:dns');
    addrs = await dns.promises.lookup(hostname, { all: true });
  } catch {
    throw new ConnectError('That page could not be reached.', 502);
  }
  if (!addrs.length || addrs.some((a) => isForbiddenIp(a.address))) {
    throw new ConnectError('That address is not allowed.', 400);
  }
  return addrs.map((a) => a.address);
}

/**
 * Screen a destination completely: the literal host, then every address it
 * resolves to. Throws ConnectError on anything internal.
 */
async function assertDestinationAllowed(url: URL): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ConnectError('Only http(s) pages can be read.', 400);
  }
  if (url.username || url.password) throw new ConnectError('That URL is not allowed.', 400);
  if (isForbiddenHost(url.hostname)) throw new ConnectError('That address is not allowed.', 400);
  await resolvePublicAddresses(url.hostname);
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–',
  hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
};

function codePoint(n: number): string {
  // String.fromCodePoint throws past U+10FFFF (and on surrogates) — a hostile
  // page must not be able to crash a read. Fall back to a space.
  if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return ' ';
  try {
    return String.fromCodePoint(n);
  } catch {
    return ' ';
  }
}

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, code: string) => {
    if (code.startsWith('#x') || code.startsWith('#X')) return codePoint(parseInt(code.slice(2), 16));
    if (code.startsWith('#')) return codePoint(parseInt(code.slice(1), 10));
    return ENTITIES[code.toLowerCase()] ?? ' ';
  });
}

export function htmlToText(html: string): { title: string; text: string } {
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CONTEXT_TITLE);
  let s = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|iframe|head|nav|footer|form)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  const text = s
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  return { title, text };
}

const MAX_WEB_BYTES = 1_500_000;

/**
 * The dispatcher every outbound page fetch uses.
 *
 * THE POINT: the screen runs inside the socket's own DNS lookup, so the
 * address that was approved is the address that is connected to. Resolving a
 * name to check it and then handing the NAME to fetch() leaves a window —
 * the classic DNS rebinding attack: answer with a public address for the
 * check, then with 127.0.0.1 a moment later for the connection. An attacker
 * who controls authoritative DNS for a name needs only to time a flip.
 *
 * Here there is no second resolution to poison. Every address the resolver
 * returns is screened, and if ANY of them is internal the connection is
 * refused outright rather than falling back to a sibling address — a name
 * that answers with both a public and a private address is not a name we
 * have any business fetching.
 */
export type ResolvedAddress = { address: string; family: number };

/**
 * The decision the socket's own lookup makes. Exported so it can be tested
 * directly: the security property is entirely in this function, and a test
 * that drives fetch() end to end cannot easily control what DNS says between
 * two calls.
 *
 * ALL-OR-NOTHING on purpose. A name that answers with both a public and a
 * private address is refused rather than connected to the public one: that
 * shape is the signature of a rebinding setup, and there is no legitimate
 * page that needs it.
 */
export function screenResolved(addresses: unknown): ResolvedAddress[] | null {
  const list = Array.isArray(addresses) ? (addresses as ResolvedAddress[]) : [];
  if (!list.length) return null;
  if (list.some((a) => !a || typeof a.address !== 'string')) return null;
  if (list.some((a) => isForbiddenIp(a.address))) return null;
  return list;
}

const safeAgent = new Agent({
  connect: {
    lookup(hostname, options, callback) {
      dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
        if (err) return callback(err, '', 4);
        const safe = screenResolved(addresses);
        if (!safe) return callback(new Error('blocked address'), '', 4);
        // `all` was requested, so undici is handed the whole list — every
        // entry of which has just been screened.
        return (callback as unknown as (e: Error | null, a: ResolvedAddress[]) => void)(null, safe);
      });
    },
  },
  connectTimeout: 8_000,
});

/** How many hops a page may redirect through before we stop following. */
const MAX_REDIRECTS = 5;

/**
 * Read at most `max` bytes of a response body, stopping the moment the
 * ceiling is reached rather than after the whole thing has arrived.
 */
async function readCapped(res: Response, max: number): Promise<string> {
  const body = res.body;
  if (!body) return '';
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const room = max - total;
      if (value.byteLength >= room) {
        chunks.push(value.subarray(0, room));
        total = max;
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* the peer went away; nothing to do */
    }
  }
  const joined = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    joined.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(joined);
}

export async function fetchWeb(rawUrl: string): Promise<FetchedContext> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new ConnectError('That doesn’t look like a URL.', 400);
  }
  await assertDestinationAllowed(url);

  // Redirects are followed BY HAND, one hop at a time, so every hop is
  // screened before the request is made rather than after. `redirect:
  // 'follow'` did the opposite: the internal request was issued and only the
  // response body was withheld, which still reaches internal services, still
  // has side effects, and still times differently depending on what is there.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  let res: Response;
  let current = url;
  try {
    for (let hop = 0; ; hop++) {
      if (hop > MAX_REDIRECTS) {
        throw new ConnectError('That page redirected too many times.', 502);
      }
      // `dispatcher` is undici's, and Node's fetch IS undici — but the DOM
      // RequestInit type does not know about it, so the cast is the honest
      // way to say "this runs on Node". The pinned dispatcher is what makes
      // the screened address the dialled one.
      res = await fetch(current.toString(), {
        dispatcher: safeAgent,
        signal: ctrl.signal,
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SocriaLogos/1.0)',
          Accept: 'text/html,text/plain;q=0.9,*/*;q=0.5',
        },
        cache: 'no-store',
      } as RequestInit & { dispatcher: unknown });
      if (res.status < 300 || res.status > 399) break;
      const loc = res.headers.get('location');
      if (!loc) break;
      let next: URL;
      try {
        next = new URL(loc, current);
      } catch {
        throw new ConnectError('That address is not allowed.', 400);
      }
      // The screen runs on the hop we are ABOUT to make.
      await assertDestinationAllowed(next);
      current = next;
    }
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof ConnectError) throw e;
    throw new ConnectError('That page could not be reached.', 502);
  }

  const ctype = res.headers.get('content-type') ?? '';
  if (!/text\/html|text\/plain|application\/xhtml/.test(ctype)) {
    clearTimeout(timer);
    throw new ConnectError('That page isn’t readable text.', 422);
  }

  // Read with a ceiling instead of buffering the whole body and slicing
  // afterwards: `arrayBuffer()` on a hostile endpoint that streams forever
  // fills memory before the cap is ever applied. The abort timer stays armed
  // until the body is done, for the same reason.
  let html: string;
  try {
    html = await readCapped(res, MAX_WEB_BYTES);
  } catch (e) {
    if (e instanceof ConnectError) throw e;
    throw new ConnectError('That page could not be reached.', 502);
  } finally {
    clearTimeout(timer);
  }
  const { title, text } = ctype.includes('text/plain')
    ? { title: '', text: html }
    : htmlToText(html);
  if (!text.trim()) throw new ConnectError('Nothing readable came back from that page.', 422);
  return {
    title: title || url.hostname,
    ref: url.toString(),
    text: cap(text),
  };
}

export async function fetchSource(
  kind: SourceKind,
  ref: { id?: string; url?: string },
  auth: Auth
): Promise<FetchedContext> {
  switch (kind) {
    case 'drive':
    case 'sheets':
      if (!ref.id) throw new ConnectError('Pick a file first.', 400);
      return fetchDriveFile(ref.id, auth);
    case 'calendar':
      if (!ref.id) throw new ConnectError('Pick an event first.', 400);
      return fetchCalendarEvent(ref.id, auth);
    case 'gmail':
      if (!ref.id) throw new ConnectError('Pick a message first.', 400);
      return fetchGmailMessage(ref.id, auth);
    case 'notion':
      if (!ref.id) throw new ConnectError('Pick a page first.', 400);
      return fetchNotionPage(ref.id, auth);
    case 'web':
      if (!ref.url) throw new ConnectError('Give it a URL first.', 400);
      return fetchWeb(ref.url);
    default:
      throw new ConnectError('Paste and upload happen in the browser.', 400);
  }
}
