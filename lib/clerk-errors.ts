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
 * THE OBJECT THAT ACTUALLY HAS THE METHOD, not the one that forwards to it.
 *
 * `useClerk()` does not return clerk-js. It returns IsomorphicClerk, a wrapper
 * that exists so a component can call `openSignIn` before the browser bundle
 * has finished loading — and it defines EVERY method as its own property in
 * its constructor, whether or not the loaded build has it:
 *
 *     this.__experimental_openUserVerification = (props) => {
 *       if (this.clerkjs && loaded) this.clerkjs.__experimental_openUserVerification(props);
 *       else this.preopenUserVerification = props;
 *     };
 *
 * So `typeof clerk.__experimental_openUserVerification === 'function'` is TRUE
 * on a wrapper whose inner clerk-js renamed that method a year ago, every
 * feature check passes, and the failure arrives at the call:
 *
 *     TypeError: this.clerkjs.__experimental_openUserVerification is not a function
 *
 * which is what a person hit trying to verify their email address. The pinned
 * SDK (@clerk/nextjs 5.7, which knows only the old name) and the CDN bundle
 * (which knows only the new one) are two versions of one API, and the wrapper
 * hides the disagreement behind a property that always exists.
 *
 * The fix is to resolve the name against the LOADED instance. The wrapper is
 * kept, last, because before clerk-js loads it is the only thing there and
 * queueing the call is the right behaviour.
 */
function instancesOf(clerk: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const push = (v: unknown) => {
    if (v && typeof v === 'object' && !out.includes(v as Record<string, unknown>)) {
      out.push(v as Record<string, unknown>);
    }
  };
  const c = clerk && typeof clerk === 'object' ? (clerk as Record<string, unknown>) : null;
  push(c?.clerkjs);
  if (typeof window !== 'undefined') push((window as unknown as { Clerk?: unknown }).Clerk);
  push(c);
  return out;
}

/** Every opener this object exposes, best first, each bound to its own owner. */
function openersOn(c: Record<string, unknown>): ((p: ReverifyProps) => void)[] {
  const out: ((p: ReverifyProps) => void)[] = [];
  const bound = (v: unknown) =>
    typeof v === 'function'
      ? ((v as (p: ReverifyProps) => void).bind(c) as (p: ReverifyProps) => void)
      : null;

  for (const name of REVERIFY_OPENERS) {
    const fn = bound(c[name]);
    if (fn) out.push(fn);
  }

  // Nothing we have a name for. Look for the shape instead: a private method
  // that OPENS something ending in "verification". `__internal_close…` and
  // `handleEmailLinkVerification` are both excluded by that, deliberately —
  // closing the box or handling a magic link are not this.
  for (const key of Object.keys(c)) {
    if (/^__[a-z]+_open[A-Za-z]*erification$/.test(key)) {
      const fn = bound(c[key]);
      if (fn && !out.includes(fn)) out.push(fn);
    }
  }
  return out;
}

/** The exact shape of a wrapper forwarding to a method its inner build dropped. */
function isMissingMethod(e: unknown): boolean {
  return (
    e instanceof TypeError && /is not a function/i.test(typeof e.message === 'string' ? e.message : '')
  );
}

/**
 * Bound so it can be called detached; null when no build in reach has such a
 * thing, which is the caller's cue to show the refusal instead.
 *
 * The returned function tries the candidates in order and moves on ONLY when
 * one fails with "is not a function" — the forwarding failure above, and
 * nothing else. A refusal Clerk throws for a real reason is not retried
 * against a different method; it is the answer.
 */
export function reverificationOpener(
  clerk: unknown
): ((props: ReverifyProps) => void) | null {
  const all: ((p: ReverifyProps) => void)[] = [];
  for (const inst of instancesOf(clerk)) all.push(...openersOn(inst));
  if (!all.length) return null;
  if (all.length === 1) return all[0];

  return (props: ReverifyProps) => {
    let last: unknown = null;
    for (const fn of all) {
      try {
        fn(props);
        return;
      } catch (e) {
        if (!isMissingMethod(e)) throw e;
        last = e;
      }
    }
    throw last;
  };
}

/** The person closed the reverification box rather than completing it. */
export class ReverifyCancelled extends Error {
  constructor(message = 'verification cancelled') {
    super(message);
    this.name = 'ReverifyCancelled';
  }
}

/**
 * RUN IT; IF CLERK ASKS THE PERSON TO PROVE THEMSELVES, LET THEM, THEN RUN IT
 * AGAIN. One implementation, because there were two.
 *
 * The account panels and the student panel each had their own copy of this,
 * and they had already drifted: one settled its promise once however Clerk
 * called back, the other could settle twice and leave a button spinning; one
 * went through `reverificationOpener` and the other reached for a method name
 * by hand — and it was the hand-written one that broke. A rule kept in two
 * places is a rule that is right in one of them.
 *
 * Retried ONCE, not in a loop: a freshly verified session that is still
 * refused is a real refusal, and the person should read it rather than watch a
 * box reopen for ever.
 */
export async function withReverification<T>(
  clerk: unknown,
  op: () => Promise<T>
): Promise<T> {
  try {
    return await op();
  } catch (e) {
    if (!needsReverification(e)) throw e;
    const open = reverificationOpener(clerk);
    // Genuinely absent. The original refusal is the honest thing to show, and
    // describeFailure names the way out (sign out and back in).
    if (!open) throw e;
    await new Promise<void>((resolve, reject) => {
      // Clerk calls exactly one of these, but a build that called both — or
      // neither and then one late — would settle twice and leave the button
      // spinning for ever. Settle once, whatever it does.
      let done = false;
      const once = (f: () => void) => () => {
        if (done) return;
        done = true;
        f();
      };
      const cancel = once(() => reject(new ReverifyCancelled()));
      try {
        open({ afterVerification: once(resolve), afterVerificationCancelled: cancel });
      } catch {
        // Every opener in reach failed to open anything. Not a cancellation
        // and not a reason to hang: give the caller back Clerk's own refusal.
        if (!done) {
          done = true;
          reject(e);
        }
      }
    });
    return await op();
  }
}
