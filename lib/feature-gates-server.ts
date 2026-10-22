// lib/feature-gates-server.ts — which typed code opens which feature gate.
//
// Server only: the codes never reach the browser. Separate from
// lib/access-codes-server.ts on purpose — that module guards the auth-gated
// models and Socria One with signed cookies and refuses short codes; a feature
// gate only decides what a menu lists to someone already signed in, so it can
// be a short word the team hands out. Each code can be replaced by an
// environment variable without a code deploy. The new Socria's is kept as a
// fingerprint only (NEW_SOCRIA_FINGERPRINT, below).
import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { normalizeCode, type GateId } from './feature-gates';

/**
 * THE NEW SOCRIA'S CODE (lib/new-socria.ts), BY ITS FINGERPRINT. It is handed
 * to the people let in early, and this repository is public — so the code is
 * not written here, only the SHA-256 of it as compared (normalizeCode: upper
 * case, no spaces). Whoever types it matches the fingerprint; nobody reads the
 * code off it. NEW_SOCRIA_ACCESS_CODE replaces it without a deploy.
 */
const NEW_SOCRIA_FINGERPRINT = '8e4cbc698ab2557bab0fb8c97170c6d380f70db8cb698c3892a071d972fc2355';

const fingerprint = (code: string) => createHash('sha256').update(code).digest('hex');

/** Each gate, with the fingerprint of the code that opens it. */
function gates(): [GateId, string][] {
  const fromEnv = (v: string | undefined) => (v ? normalizeCode(v) : '');
  const socria = fromEnv(process.env.NEW_SOCRIA_ACCESS_CODE);
  return [
    ['logos3', fingerprint(fromEnv(process.env.LOGOS3_ACCESS_CODE) || 'LOGOS3')],
    ['socria', socria ? fingerprint(socria) : NEW_SOCRIA_FINGERPRINT],
  ];
}

/** The gate a typed code opens, or null. Compared in constant time, fingerprint to fingerprint. */
export function gateForCode(raw: unknown): GateId | null {
  const code = normalizeCode(raw);
  if (!code || code.length > 64) return null;
  const typed = Buffer.from(fingerprint(code), 'hex');
  for (const [gate, expected] of gates()) {
    const want = Buffer.from(expected, 'hex');
    if (want.length === typed.length && timingSafeEqual(typed, want)) return gate;
  }
  return null;
}
