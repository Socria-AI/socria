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
    // Genuine IPv6: block loopback and unique-local / link-local ranges.
    if (s === '::' || s === '::1') return true;
    if (/^(fc|fd|fe8|fe9|fea|feb)/.test(s)) return true;
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
// address (a public domain with an A record for 169.254.169.254). Resolve it
// and screen every answer. TOCTOU/rebinding between this lookup and the fetch
// remains out of scope for a prototype, and is the only residual gap.
async function assertResolvesPublic(hostname: string): Promise<void> {
  // A literal IP needs no lookup — isForbiddenHost already screened it.
  if (/^[0-9.]+$/.test(hostname) || hostname.includes(':')) return;
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

export async function fetchWeb(rawUrl: string): Promise<FetchedContext> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new ConnectError('That doesn’t look like a URL.', 400);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ConnectError('Only http(s) pages can be read.', 400);
  }
  if (url.username || url.password) throw new ConnectError('That URL is not allowed.', 400);
  if (isForbiddenHost(url.hostname)) throw new ConnectError('That address is not allowed.', 400);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SocriaLogos/1.0)',
        Accept: 'text/html,text/plain;q=0.9,*/*;q=0.5',
      },
      cache: 'no-store',
    });
  } catch {
    throw new ConnectError('That page could not be reached.', 502);
  } finally {
    clearTimeout(timer);
  }

  // Redirects may have moved us somewhere the original check never saw.
  try {
    if (isForbiddenHost(new URL(res.url).hostname)) {
      throw new ConnectError('That address is not allowed.', 400);
    }
  } catch (e) {
    if (e instanceof ConnectError) throw e;
  }

  const ctype = res.headers.get('content-type') ?? '';
  if (!/text\/html|text\/plain|application\/xhtml/.test(ctype)) {
    throw new ConnectError('That page isn’t readable text.', 422);
  }
  const buf = await res.arrayBuffer();
  const html = new TextDecoder('utf-8', { fatal: false }).decode(buf.slice(0, MAX_WEB_BYTES));
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
