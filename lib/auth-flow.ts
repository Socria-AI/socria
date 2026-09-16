// lib/auth-flow.ts
//
// The decisions behind Socria's own sign-in and sign-up forms.
//
// WHY THERE IS A MODULE AT ALL. Replacing Clerk's <SignIn> with our own form
// means taking over its state machine, and that machine has more states than
// it looks: an instance can ask for a password or a mailed code or both, it
// can complete in one step or three, and it can come back needing a field
// nobody asked about. Every one of those branches is a chance to strand
// somebody on a screen with no next thing to press. So the branching lives
// here, where it can be tested without a browser or a Clerk instance, and the
// components below it only render what these functions decide.
//
// WHAT IS DELIBERATELY NOT HERE. No list of which factors this instance
// supports, and no assumption about whether accounts have passwords. Clerk
// reports both, per attempt, in `supportedFirstFactors` and `missingFields`,
// and a form that decided in advance would be wrong the first time the
// instance's settings changed — silently, and only for the people who signed
// up under the other setting.

/** Where a form currently is. One of these is on screen at a time. */
export type AuthStep =
  /** asking who they are */
  | 'identify'
  /** asking for the password of an account we now know exists */
  | 'password'
  /** asking for the code we just mailed */
  | 'code'
  /**
   * Asking for the authenticator code, AFTER the first factor succeeded.
   *
   * This did not exist, and `needs_second_factor` fell through to
   * 'identify' — so anybody with an authenticator app typed the right
   * mailed code, was told "That code was not accepted", and could never
   * get in however many times they tried. A state that is not modelled is
   * not handled gracefully; it is a dead end wearing an error message.
   */
  | 'second-factor'
  /** Clerk will not proceed until they choose a new password */
  | 'new-password'
  /** Clerk says the session is ready; the caller activates it */
  | 'done';

/**
 * An email address, or null if it is not one.
 *
 * The check is deliberately loose — something, an @, something with a dot —
 * because the authoritative answer comes from the mail that either arrives or
 * does not, and a strict local regex's only real effect is to reject the
 * unusual-but-valid addresses of people who are used to being rejected.
 * Lower-cased because a person who signed up as Sam@ and returns as sam@
 * should not be told no account exists.
 */
export function cleanEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  if (v.length < 6 || v.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return null;
  return v;
}

/**
 * A mailed code, or null.
 *
 * Spaces and dashes are stripped first: the code arrives in an email that
 * often renders it as "123 456", and refusing the exact string somebody
 * copied out of the message they were sent is a self-inflicted wound.
 */
export function cleanCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.replace(/[\s-]/g, '');
  return /^\d{4,8}$/.test(v) ? v : null;
}

/** What Clerk's first factors look like, reduced to what we read. */
export interface FirstFactor {
  strategy?: unknown;
  emailAddressId?: unknown;
}

/** The one we will use, or null if there is no way in we can drive. */
export interface ChosenFactor {
  strategy: 'email_code' | 'password';
  /** which address to mail; absent for password */
  emailAddressId?: string;
}

/**
 * Which second factor to attempt.
 *
 * TOTP is preferred over a mailed backup code for the same reason a mailed
 * code beats a password on the first factor: it is the one the person
 * actually has to hand. `backup_code` is the fallback for an account that
 * only ever generated those.
 */
export function chooseSecondFactor(
  factors: readonly FirstFactor[] | null | undefined
): 'totp' | 'backup_code' | 'phone_code' | null {
  const list = Array.isArray(factors) ? factors : [];
  for (const want of ['totp', 'phone_code', 'backup_code'] as const) {
    if (list.some((f) => f?.strategy === want)) return want;
  }
  return null;
}

/**
 * Which first factor to use.
 *
 * A mailed code is preferred over a password wherever the instance offers
 * both, and that is a product decision rather than a technical one: the
 * design's form asks for an email address and nothing else, most people do
 * not have a password for a product they used twice, and "check your email"
 * has no failure mode that ends in a reset flow. Password is the fallback for
 * instances — or accounts — where a code is not on offer.
 *
 * Returns null when neither is available. The caller must then say so rather
 * than showing an empty form: an OAuth-only account reaching a password box
 * is somebody who will try three passwords and leave.
 */
export function chooseFactor(factors: readonly FirstFactor[] | null | undefined): ChosenFactor | null {
  const list = Array.isArray(factors) ? factors : [];
  const code = list.find(
    (f) => f?.strategy === 'email_code' && typeof f.emailAddressId === 'string'
  );
  if (code) {
    return { strategy: 'email_code', emailAddressId: code.emailAddressId as string };
  }
  if (list.some((f) => f?.strategy === 'password')) return { strategy: 'password' };
  return null;
}

/**
 * The step a sign-in attempt has left us on.
 *
 * `complete` is the only status that means done. Everything else — including
 * a status this code has never heard of — keeps the person on a screen that
 * asks them for something, because the alternative is a form that believes it
 * succeeded and hands the caller an id that is not there.
 */
export function signInStep(
  status: unknown,
  factor: ChosenFactor | null
): AuthStep {
  if (status === 'complete') return 'done';
  if (status === 'needs_first_factor') {
    return factor?.strategy === 'password' ? 'password' : 'code';
  }
  if (status === 'needs_second_factor') return 'second-factor';
  if (status === 'needs_new_password') return 'new-password';
  // needs_identifier, or something added after this was written. Back to the
  // top, which always has a next thing to press.
  return 'identify';
}

/**
 * What a sign-up attempt still needs from the person.
 *
 * `missingFields` is Clerk's own list, so an instance that requires a name, or
 * does not require a password, is handled by reading it rather than by
 * guessing. Only the fields this form can actually collect are returned;
 * anything else means we cannot finish here and the caller says so.
 */
export const COLLECTABLE = ['email_address', 'password', 'first_name', 'last_name'] as const;
export type Collectable = (typeof COLLECTABLE)[number];

export function signUpNeeds(missing: unknown): {
  fields: Collectable[];
  /** a required field this form has no box for */
  blocked: boolean;
} {
  const list = Array.isArray(missing) ? missing : [];
  const fields: Collectable[] = [];
  let blocked = false;
  for (const f of list) {
    if (typeof f !== 'string') continue;
    if ((COLLECTABLE as readonly string[]).includes(f)) {
      fields.push(f as Collectable);
    } else {
      blocked = true;
    }
  }
  return { fields, blocked };
}

/**
 * The step a sign-up attempt has left us on.
 *
 * The order matters: a sign-up that still needs a password AND has an
 * unverified email must ask for the password first, because Clerk will not
 * accept the code until the account is otherwise complete. Asking in the
 * wrong order produces a verification that keeps failing for a reason the
 * screen does not mention.
 */
export function signUpStep(
  status: unknown,
  missing: unknown,
  unverified: unknown
): AuthStep {
  if (status === 'complete') return 'done';
  const { fields } = signUpNeeds(missing);
  if (fields.length) return fields.includes('password') ? 'password' : 'identify';
  const pending = Array.isArray(unverified) ? unverified : [];
  if (status === 'missing_requirements' && pending.includes('email_address')) return 'code';
  if (status === 'missing_requirements') return 'identify';
  return 'code';
}

/**
 * How long before the "send it again" link is offered.
 *
 * Long enough that somebody who presses it has genuinely waited, short enough
 * that somebody whose mail never arrived is not stuck. Codes take a few
 * seconds; thirty is the point where waiting stops feeling like the answer.
 */
export const RESEND_AFTER_SECONDS = 30;

/** Seconds left on the resend hold, floored at zero. */
export function resendIn(sentAt: number, now: number): number {
  if (!Number.isFinite(sentAt) || !Number.isFinite(now)) return 0;
  const left = Math.ceil((sentAt + RESEND_AFTER_SECONDS * 1000 - now) / 1000);
  return left > 0 ? left : 0;
}

/**
 * Where to send somebody after they get in.
 *
 * Validated by isSafeRedirect at the call site; this only supplies the
 * default, in one place, so the two forms and the OAuth callback cannot
 * disagree about where a person ends up.
 */
export const AFTER_AUTH = '/chat';
