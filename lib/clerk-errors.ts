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
  return (
    e?.name === 'TypeError' ||
    /failed to fetch|networkerror|load failed|network request failed|err_/.test(m)
  );
}
