import 'server-only';
// lib/route-guard.ts
//
// One place every gated route asks "may this request proceed?".
//
// Before, each of 14 routes wrote the question out by hand:
//
//   const keyUnlocked = isValidAccessKey(req.headers.get('x-socria-key'));
//   if (!userId && !keyUnlocked) return 401;
//
// — and `isValidAccessKey` compared against a constant the browser also had.
// Fourteen copies of a check is fourteen chances to get it wrong, and one
// shared constant in a client module is why the check was worthless. Both
// problems have the same fix: ask in one place, on the server, against a
// secret the client never sees.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  ACCESS_COOKIE,
  grantedScope,
  scopeSatisfies,
  type AccessScope,
} from './access-codes-server';

/**
 * The unlock this request actually carries, verified.
 *
 * Read from an httpOnly cookie the server itself minted and signed, never
 * from a header the caller composed. A caller cannot mint one without the
 * environment's code, and the signature is checked every time.
 */
export function requestScope(req: NextRequest): AccessScope | null {
  return grantedScope(req.cookies.get(ACCESS_COOKIE)?.value);
}

/**
 * May this request use a gated surface?
 *
 * A real Clerk session always may. An unlock grant may, when one is
 * configured and presented. With no codes configured — the default — this is
 * exactly "is there a session", which is the behaviour to want.
 */
export function mayUse(
  req: NextRequest,
  userId: string | null,
  need: AccessScope = 'core'
): boolean {
  if (userId) return true;
  return scopeSatisfies(requestScope(req), need);
}

/** The refusal, in one shape, so no route invents its own. */
export function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

// Routes that must have a REAL account behind them — anything that reads a
// person's connected accounts, and anything that makes the server fetch a URL
// on the caller's behalf — write `if (!userId) return unauthorized();`
// directly rather than calling a helper. A helper returning a response cannot
// narrow `userId` for the code after it, so every such route would then need
// a second non-null assertion: a guard you have to repeat is a guard somebody
// eventually forgets. The plain `if` narrows, and `unauthorized()` above
// keeps the refusal itself in one place.
