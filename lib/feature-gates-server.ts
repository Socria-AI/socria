// lib/feature-gates-server.ts — which typed code opens which feature gate.
//
// Server only: the codes never reach the browser. Separate from
// lib/access-codes-server.ts on purpose — that module guards the auth-gated
// models and Socria One with signed cookies and refuses short codes; a feature
// gate only decides what a menu lists to someone already signed in, so it can
// be a short word the team hands out. Each code can be replaced by an
// environment variable without a code deploy.
import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { normalizeCode, type GateId } from './feature-gates';

function codes(): [GateId, string][] {
  return [['logos3', normalizeCode(process.env.LOGOS3_ACCESS_CODE || 'LOGOS3')]];
}

const same = (a: string, b: string) =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

/** The gate a typed code opens, or null. Compared in constant time. */
export function gateForCode(raw: unknown): GateId | null {
  const code = normalizeCode(raw);
  if (!code || code.length > 64) return null;
  for (const [gate, expected] of codes()) if (expected && same(code, expected)) return gate;
  return null;
}
