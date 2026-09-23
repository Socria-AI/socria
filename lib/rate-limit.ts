// lib/rate-limit.ts
//
// Rate limiting for the OpenAI-backed routes — the primary defense against
// cost-amplification / financial DoS (there is no per-call cost cap otherwise).
//
// Backend: Upstash Redis via its REST API when UPSTASH_REDIS_REST_URL +
// UPSTASH_REDIS_REST_TOKEN are set (distributed, correct across serverless
// instances — no npm dependency, just fetch). Falls back to an in-memory
// fixed-window counter otherwise, which is best-effort on serverless (per
// warm instance) but still caps a single attacker and keeps local/preview
// working with zero setup.
//
// Identity: the Clerk userId when signed in, else the client IP. Anonymous
// callers (open Core 2 path or the SMART access key) get a stricter budget.

import { NextRequest, NextResponse } from 'next/server';

type RLResult = { ok: boolean; remaining: number; retryAfter: number; limit: number };

// --- in-memory fallback (per instance) -----------------------------------
const mem = new Map<string, { count: number; resetAt: number }>();
function memLimit(key: string, limit: number, windowSec: number): RLResult {
  const now = Date.now();
  const e = mem.get(key);
  if (!e || now >= e.resetAt) {
    mem.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    if (mem.size > 10000) {
      for (const [k, v] of mem) if (now >= v.resetAt) mem.delete(k);
    }
    return { ok: true, remaining: limit - 1, retryAfter: 0, limit };
  }
  e.count += 1;
  const ok = e.count <= limit;
  return {
    ok,
    remaining: Math.max(0, limit - e.count),
    retryAfter: ok ? 0 : Math.ceil((e.resetAt - now) / 1000),
    limit,
  };
}

// --- Upstash REST fixed window -------------------------------------------
async function upstashLimit(key: string, limit: number, windowSec: number): Promise<RLResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  // Pipeline: INCR, set TTL only on first hit (fixed window), read remaining TTL.
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([
      ['INCR', key],
      ['EXPIRE', key, String(windowSec), 'NX'],
      ['PTTL', key],
    ]),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`upstash ${res.status}`);
  const data = (await res.json()) as Array<{ result: number }>;
  const count = Number(data?.[0]?.result ?? 1);
  const pttl = Number(data?.[2]?.result ?? windowSec * 1000);
  const ok = count <= limit;
  return {
    ok,
    remaining: Math.max(0, limit - count),
    retryAfter: ok ? 0 : Math.ceil((pttl > 0 ? pttl : windowSec * 1000) / 1000),
    limit,
  };
}

async function check(bucket: string, id: string, limit: number, windowSec: number): Promise<RLResult> {
  const key = `rl:${bucket}:${id}`;
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      return await upstashLimit(key, limit, windowSec);
    } catch {
      // Upstash unreachable — degrade to in-memory rather than fail open.
    }
  }
  return memLimit(key, limit, windowSec);
}

function clientId(req: NextRequest, userId: string | null): { id: string; authed: boolean } {
  if (userId) return { id: `u:${userId}`, authed: true };
  const fwd = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const ip = fwd || (req as any).ip || req.headers.get('x-real-ip') || 'unknown';
  return { id: `ip:${ip}`, authed: false };
}

// Per-route-group budgets. 'chat' is the expensive main model; 'aux' covers
// the cheap background gpt-4o-mini passes (memory/insight/synthesis/journey),
// which fire automatically alongside chat so they get their own pool.
type Kind = 'chat' | 'aux';
const LIMITS: Record<Kind, { authed: { minute: number; day: number }; anon: { minute: number; day: number } }> = {
  chat: { authed: { minute: 20, day: 400 }, anon: { minute: 8, day: 80 } },
  aux: { authed: { minute: 40, day: 1200 }, anon: { minute: 20, day: 300 } },
};

function tooMany(r: RLResult): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests — please slow down for a moment.' },
    { status: 429, headers: { 'Retry-After': String(Math.max(1, r.retryAfter || 60)) } }
  );
}

/**
 * Enforce rate limits for an OpenAI-backed route. Returns a 429 NextResponse
 * when the caller is over budget (minute OR day window), or null when allowed.
 * Drop-in at the top of a handler:
 *   const limited = await enforceRateLimit(req, userId, 'chat');
 *   if (limited) return limited;
 */
export async function enforceRateLimit(
  req: NextRequest,
  userId: string | null,
  kind: Kind
): Promise<NextResponse | null> {
  if (process.env.RATE_LIMIT_DISABLED === '1') return null;
  const { id, authed } = clientId(req, userId);
  const lim = LIMITS[kind][authed ? 'authed' : 'anon'];
  const minute = await check(`${kind}:m`, id, lim.minute, 60);
  if (!minute.ok) return tooMany(minute);
  const day = await check(`${kind}:d`, id, lim.day, 86400);
  if (!day.ok) return tooMany(day);
  return null;
}
