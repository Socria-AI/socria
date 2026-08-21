// lib/socria-one-server.ts
//
// Who is on Socria One, decided server-side.
//
// This is the seam a real subscription check drops into. Today it answers from
// two places — a typed access key (the same soft-gate pattern Core 3.1 uses)
// and an explicit allowlist of user ids in the environment — so the tier can
// be exercised end to end before billing exists. When billing does exist, only
// this function changes; every route already asks it rather than trusting the
// client.
//
// The client is never the authority. It sends what it BELIEVES it has, and the
// routes clamp against what this returns.

import type { NextRequest } from 'next/server';
import { isValidOneKey, type Plan } from './socria-one';

export function resolvePlanForRequest(req: NextRequest, userId: string | null): Plan {
  if (isValidOneKey(req.headers.get('x-socria-one'))) return 'one';

  const allow = (process.env.SOCRIA_ONE_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (userId && allow.includes(userId)) return 'one';

  return 'free';
}
