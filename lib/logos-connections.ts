// lib/logos-connections.ts — SERVER ONLY. Never import from a client component.
//
// Per-user connections to Google and Notion, stored encrypted. A signed-in
// person authorizes Socria once (read-only), and the resulting tokens live in
// Supabase — encrypted at rest with a deployment secret — so the connection
// survives, refreshes itself, and is theirs to revoke.
//
// This replaces the old "one deployment-wide env token" model. Env credentials
// (GOOGLE_ACCESS_TOKEN / GOOGLE_REFRESH_TOKEN / NOTION_API_KEY) are still read
// as a fallback so existing deployments keep working, but the real path is a
// per-user OAuth grant.

import crypto from 'node:crypto';
import { supabaseAdmin } from './supabase';
import { ConnectError } from './logos-connect';

export type Provider = 'google' | 'notion';

export interface StoredConnection {
  provider: Provider;
  /** google: refresh token; notion: the long-lived access token */
  refreshToken: string;
  /** google: last access token + when it expires (ms). notion: unused. */
  accessToken?: string;
  accessExpiresAt?: number;
  /** display only — which account/workspace this is */
  account?: string;
  scope?: string;
  updatedAt: number;
}

// ── encryption ──────────────────────────────────────────────────────
// AES-256-GCM. The key is derived from CONNECTION_SECRET; without it, no
// connection can be stored or read, and the connect flow says so plainly
// rather than writing plaintext tokens to a database.

function key(): Buffer {
  const secret = process.env.CONNECTION_SECRET;
  if (!secret || secret.length < 16) {
    throw new ConnectError(
      'Connections are not configured on this deployment (missing CONNECTION_SECRET).',
      500
    );
  }
  return crypto.createHash('sha256').update(secret).digest();
}

export function connectionsConfigured(): boolean {
  const s = process.env.CONNECTION_SECRET;
  return !!(s && s.length >= 16);
}

function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64')}.${tag.toString('base64')}.${ct.toString('base64')}`;
}

function decrypt(blob: string): string {
  const parts = blob.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new ConnectError('Corrupt connection.', 500);
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const ct = Buffer.from(parts[3], 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

// ── the encrypted payload shape stored in one jsonb column ──────────

interface Payload {
  refreshToken: string;
  accessToken?: string;
  accessExpiresAt?: number;
  account?: string;
  scope?: string;
}

// ── store ───────────────────────────────────────────────────────────

export async function saveConnection(
  userId: string,
  provider: Provider,
  data: Payload
): Promise<void> {
  const secret = encrypt(JSON.stringify(data));
  const { error } = await supabaseAdmin()
    .from('logos_connections')
    .upsert(
      {
        user_id: userId,
        provider,
        secret,
        account: data.account ?? null,
        updated_at: Date.now(),
      },
      { onConflict: 'user_id,provider' }
    );
  if (error) {
    console.error('saveConnection error:', error);
    throw new ConnectError('Could not save that connection.', 500);
  }
}

export async function getConnection(
  userId: string,
  provider: Provider
): Promise<StoredConnection | null> {
  const { data, error } = await supabaseAdmin()
    .from('logos_connections')
    .select('secret, account, updated_at')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();
  if (error || !data?.secret) return null;
  try {
    const p = JSON.parse(decrypt(data.secret)) as Payload;
    return {
      provider,
      refreshToken: p.refreshToken,
      accessToken: p.accessToken,
      accessExpiresAt: p.accessExpiresAt,
      account: p.account ?? data.account ?? undefined,
      scope: p.scope,
      updatedAt: Number(data.updated_at) || 0,
    };
  } catch {
    return null;
  }
}

export async function deleteConnection(userId: string, provider: Provider): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('logos_connections')
    .delete()
    .eq('user_id', userId)
    .eq('provider', provider);
  if (error) {
    console.error('deleteConnection error:', error);
    throw new ConnectError('Could not disconnect that.', 500);
  }
}

/** Which providers this user has connected — one cheap existence read. */
export async function connectionStatus(
  userId: string | null
): Promise<{ google: boolean; notion: boolean; accounts: Partial<Record<Provider, string>> }> {
  const accounts: Partial<Record<Provider, string>> = {};
  if (!userId || !connectionsConfigured()) return { google: false, notion: false, accounts };
  const { data } = await supabaseAdmin()
    .from('logos_connections')
    .select('provider, account')
    .eq('user_id', userId);
  const set = new Set<string>();
  for (const row of data ?? []) {
    set.add(row.provider);
    if (row.account) accounts[row.provider as Provider] = row.account;
  }
  return { google: set.has('google'), notion: set.has('notion'), accounts };
}
