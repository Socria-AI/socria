// lib/clerk-errors.ts
//
// Reading Clerk's refusals, in the two places it matters.
//
// Clerk reports failures as an array of coded errors on the thrown object.
// Most of them only need showing to somebody; one of them needs acting on,
// and that is the whole reason this file exists rather than an inline check.

/**
 * "Prove it is you again before I do this."
 *
 * Adding an email address is a sensitive operation, so Clerk refuses it on a
 * session that has not proved itself recently. That refusal is what the first
 * version of the student panel walked into — "You need to provide additional
 * verification to perform this operation", and no way past it. Nothing was
 * misconfigured; the step simply was never offered.
 *
 * `session_step_up_verification_required` is the code clerk-js itself watches
 * for inside its own components. `session_reverification_*` is matched
 * alongside it because that is the name the same condition goes by in later
 * versions of the API — this is precisely the check that would otherwise
 * start failing silently the day the package is upgraded, and failing
 * silently here means a dead end for the person on the page.
 */
export function needsReverification(err: unknown): boolean {
  const e = err as { errors?: Array<{ code?: unknown }> };
  const list = Array.isArray(e?.errors) ? e.errors : [];
  return list.some(
    (x) => typeof x?.code === 'string' && /^session_(step_up|reverification)/.test(x.code),
  );
}

/**
 * Clerk's reason, in Clerk's words.
 *
 * Deliberately not replaced with something friendlier. The failures here are
 * mostly configuration ("you cannot add email addresses to this account") or
 * plain fact ("that email address is taken"), and somebody who is stuck needs
 * the actual reason far more than they need a soft one.
 */
export function clerkMessage(err: unknown, fallback: string): string {
  const e = err as { errors?: Array<{ longMessage?: unknown; message?: unknown }>; message?: unknown };
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const first = Array.isArray(e?.errors) ? e.errors[0] : null;
  const coded = str(first?.longMessage) || str(first?.message);
  if (coded) return coded;

  // Not every Clerk failure is a coded API refusal, and assuming they all
  // were is how "Could not send the code. Try again." ended up on screen in
  // place of the actual reason. clerk-js throws ClerkRuntimeError for its own
  // problems, and the browser throws a bare TypeError when the request never
  // left the page — neither carries an `errors` array, so both fell through
  // to the caller's fallback and the one useful sentence was discarded.
  const own = str(e?.message);
  return own || fallback;
}

/**
 * Did the request fail to reach Clerk at all?
 *
 * Worth separating because the fix is completely different. A coded refusal
 * is Clerk saying no and the message explains it; an unreachable Frontend API
 * is configuration — most often a PRODUCTION publishable key on a domain that
 * is not the production domain, which is exactly what a preview deployment
 * has — and the message the browser gives for it ("Failed to fetch") tells
 * somebody nothing about that.
 */
export function looksUnreachable(err: unknown): boolean {
  const e = err as { errors?: unknown; message?: unknown; name?: unknown };
  if (Array.isArray(e?.errors) && e.errors.length) return false;
  const m = typeof e?.message === 'string' ? e.message.toLowerCase() : '';
  if (!m) return false;

  // What every browser says when the request never left the page. Chrome
  // "Failed to fetch", Firefox "NetworkError when attempting to fetch
  // resource", Safari "Load failed", React Native "Network request failed",
  // and the net::ERR_* family for the rest.
  if (/failed to fetch|networkerror|load failed|network request failed|err_/.test(m)) {
    return true;
  }

  // A TypeError is USUALLY that same thing under a phrasing we have not
  // listed. But it is also what a plain bug looks like — a property read on
  // undefined — and calling one of those "could not reach Clerk, this is
  // usually a production key on a preview domain" sends somebody after a
  // configuration problem that does not exist. That cost an evening once.
  // So: a TypeError counts, unless it reads like a programming mistake.
  return (
    e?.name === 'TypeError' &&
    !/(cannot read|cannot access|is not a function|is not defined|undefined is not|null is not|is not iterable|assignment to constant)/.test(
      m
    )
  );
}

/**
 * The function that opens Clerk's "prove it is you" box, whatever it is
 * called this month.
 *
 * clerk-js loads from Clerk's CDN at whatever version they are shipping, and
 * it is nobody's job here to keep pace with it: `@clerk/nextjs` is pinned in
 * package.json but the browser bundle is not, so a rename lands on production
 * with no deploy. This is not hypothetical. The method arrived as
 * `__experimental_openUserVerification`, which is what the pinned types still
 * describe, and by clerk-js 5.127 it was `__internal_openReverification`.
 * Everything in between still worked, so nothing failed until the day it did
 * — and it failed as a 403 with no way past it, on the one screen where a
 * student is trying to prove they are a student.
 *
 * So: the names we know, newest first, then anything of the same SHAPE. A
 * rename we have never seen should cost a person nothing.
 */
const REVERIFY_OPENERS = [
  /** clerk-js ~5.5x onward */
  '__internal_openReverification',
  /** clerk-js ~5.2x–5.4x, and what @clerk/types 4.26 still declares */
  '__experimental_openUserVerification',
] as const;

/** Opens with no level: Clerk decides what the account owes — password, code, passkey, second factor. */
export interface ReverifyProps {
  afterVerification?: () => void;
  afterVerificationCancelled?: () => void;
}

/**
 * Bound so it can be called detached; null when this build of clerk-js has
 * no such thing, which is the caller's cue to show the refusal instead.
 */
export function reverificationOpener(
  clerk: unknown
): ((props: ReverifyProps) => void) | null {
  if (!clerk || typeof clerk !== 'object') return null;
  const c = clerk as Record<string, unknown>;

  const bound = (v: unknown) =>
    typeof v === 'function'
      ? ((v as (p: ReverifyProps) => void).bind(c) as (p: ReverifyProps) => void)
      : null;

  for (const name of REVERIFY_OPENERS) {
    const fn = bound(c[name]);
    if (fn) return fn;
  }

  // Nothing we have a name for. Look for the shape instead: a private method
  // that OPENS something ending in "verification". `__internal_close…` and
  // `handleEmailLinkVerification` are both excluded by that, deliberately —
  // closing the box or handling a magic link are not this.
  for (const key of Object.keys(c)) {
    if (/^__[a-z]+_open[A-Za-z]*erification$/.test(key)) {
      const fn = bound(c[key]);
      if (fn) return fn;
    }
  }
  return null;
}
