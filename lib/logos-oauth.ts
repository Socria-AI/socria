// lib/logos-oauth.ts — SERVER ONLY.
//
// The OAuth authorization-code flow behind the "Connect" buttons. Read-only,
// per user. The person clicks Connect, is sent to Google/Notion's own consent
// screen, approves read access, and is returned here with a code we exchange
// for tokens (stored encrypted, per lib/logos-connections.ts).
//
// Two security invariants:
//  1. The `state` parameter is HMAC-signed and bound to the user + provider +
//     an expiry, so a forged callback cannot attach someone else's grant.
//  2. The callback must be authenticated as the SAME user the state names.
//     (enforced in the route.)

import crypto from 'node:crypto';
import { ConnectError } from './logos-connect';
import {
  saveConnection,
  getConnection,
  type Provider,
} from './logos-connections';

// Read-only scopes only. Socria can list and read; it can never modify.
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

export interface ProviderConfig {
  provider: Provider;
  label: string;
  clientId?: string;
  clientSecret?: string;
  configured: boolean;
  /** the exact read access we ask for, shown to the user before they connect */
  grants: string[];
}

export function providerConfig(provider: Provider): ProviderConfig {
  if (provider === 'google') {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    return {
      provider,
      label: 'Google',
      clientId,
      clientSecret,
      configured: !!(clientId && clientSecret),
      grants: ['Read your Google Docs & Drive files', 'Read your Calendar', 'Read your Gmail'],
    };
  }
  const clientId = process.env.NOTION_OAUTH_CLIENT_ID;
  const clientSecret = process.env.NOTION_OAUTH_CLIENT_SECRET;
  return {
    provider,
    label: 'Notion',
    clientId,
    clientSecret,
    configured: !!(clientId && clientSecret),
    grants: ['Read the Notion pages you share with Socria'],
  };
}

// ── redirect URI ────────────────────────────────────────────────────
// Must exactly match what's registered with the OAuth app. Derived from a
// stable configured origin so it doesn't drift between preview URLs.

export function redirectUri(provider: Provider, reqOrigin: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || reqOrigin).replace(/\/$/, '');
  return `${base}/api/logos/connect/${provider}/callback`;
}

// ── signed state (CSRF) ─────────────────────────────────────────────

function stateKey(): Buffer {
  const secret = process.env.CONNECTION_SECRET;
  if (!secret || secret.length < 16) {
    throw new ConnectError('Connections are not configured (missing CONNECTION_SECRET).', 500);
  }
  return crypto.createHash('sha256').update(`state:${secret}`).digest();
}

const b64url = (b: Buffer) => b.toString('base64url');

export function signState(userId: string, provider: Provider): string {
  const payload = b64url(
    Buffer.from(JSON.stringify({ u: userId, p: provider, n: crypto.randomBytes(8).toString('hex'), e: Date.now() + 600_000 }))
  );
  const sig = b64url(crypto.createHmac('sha256', stateKey()).update(payload).digest());
  return `${payload}.${sig}`;
}

export function verifyState(
  state: string
): { userId: string; provider: Provider } | null {
  const [payload, sig] = String(state).split('.');
  if (!payload || !sig) return null;
  const expected = b64url(crypto.createHmac('sha256', stateKey()).update(payload).digest());
  // constant-time compare; lengths must match first or timingSafeEqual throws
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const obj = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof obj?.u !== 'string' || (obj.p !== 'google' && obj.p !== 'notion')) return null;
    if (typeof obj?.e !== 'number' || Date.now() > obj.e) return null;
    return { userId: obj.u, provider: obj.p };
  } catch {
    return null;
  }
}

// ── authorize URL ───────────────────────────────────────────────────

export function authorizeUrl(provider: Provider, userId: string, reqOrigin: string): string {
  const cfg = providerConfig(provider);
  if (!cfg.configured) throw new ConnectError(`${cfg.label} sign-in isn’t set up on this deployment.`, 400);
  const state = signState(userId, provider);
  const redirect = redirectUri(provider, reqOrigin);

  if (provider === 'google') {
    const params = new URLSearchParams({
      client_id: cfg.clientId!,
      redirect_uri: redirect,
      response_type: 'code',
      scope: GOOGLE_SCOPES.join(' '),
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent', // force a refresh_token every time
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }
  const params = new URLSearchParams({
    client_id: cfg.clientId!,
    redirect_uri: redirect,
    response_type: 'code',
    owner: 'user',
    state,
  });
  return `https://api.notion.com/v1/oauth/authorize?${params}`;
}

// ── code exchange (called from the callback) ────────────────────────

export async function exchangeAndStore(
  provider: Provider,
  code: string,
  userId: string,
  reqOrigin: string
): Promise<void> {
  const cfg = providerConfig(provider);
  if (!cfg.configured) throw new ConnectError('Not configured.', 400);
  const redirect = redirectUri(provider, reqOrigin);

  if (provider === 'google') {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: cfg.clientId!,
        client_secret: cfg.clientSecret!,
        redirect_uri: redirect,
        grant_type: 'authorization_code',
      }),
      cache: 'no-store',
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.access_token) {
      throw new ConnectError('Google did not complete the connection.', 502);
    }
    // No refresh_token means a prior grant is still live; keep the old one.
    const prior = json.refresh_token ? null : await getConnection(userId, 'google');
    const refreshToken = json.refresh_token || prior?.refreshToken;
    if (!refreshToken) {
      throw new ConnectError('Google didn’t return a refresh token — try again and click Allow.', 502);
    }
    let account: string | undefined;
    try {
      const who = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${json.access_token}` },
        cache: 'no-store',
      }).then((r) => (r.ok ? r.json() : null));
      account = who?.email;
    } catch {}
    await saveConnection(userId, 'google', {
      refreshToken,
      accessToken: json.access_token,
      accessExpiresAt: Date.now() + (Number(json.expires_in) || 3000) * 1000,
      account,
      scope: json.scope,
    });
    return;
  }

  // Notion — Basic auth, returns a long-lived access token (no refresh).
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
  const res = await fetch('https://api.notion.com/v1/oauth/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: redirect }),
    cache: 'no-store',
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.access_token) {
    throw new ConnectError('Notion did not complete the connection.', 502);
  }
  await saveConnection(userId, 'notion', {
    refreshToken: json.access_token, // notion has no separate refresh token
    account: json.workspace_name || undefined,
  });
}

// ── resolving a usable token at call time ───────────────────────────

/** A valid Google access token for this user, refreshing if needed. */
export async function googleAccessTokenFor(userId: string): Promise<string | null> {
  const conn = await getConnection(userId, 'google');
  if (!conn) return null;
  if (conn.accessToken && conn.accessExpiresAt && Date.now() < conn.accessExpiresAt - 60_000) {
    return conn.accessToken;
  }
  const cfg = providerConfig('google');
  if (!cfg.configured) return null;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId!,
      client_secret: cfg.clientSecret!,
      refresh_token: conn.refreshToken,
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.access_token) {
    throw new ConnectError('Google sign-in has expired — reconnect it.', 401);
  }
  const accessToken = json.access_token as string;
  await saveConnection(userId, 'google', {
    refreshToken: conn.refreshToken,
    accessToken,
    accessExpiresAt: Date.now() + (Number(json.expires_in) || 3000) * 1000,
    account: conn.account,
    scope: conn.scope,
  });
  return accessToken;
}

/** The Notion token for this user (long-lived), or null. */
export async function notionTokenFor(userId: string): Promise<string | null> {
  const conn = await getConnection(userId, 'notion');
  return conn?.refreshToken ?? null;
}
