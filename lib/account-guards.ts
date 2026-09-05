// lib/account-guards.ts
//
// The rules that stop somebody locking themselves out of their own account.
//
// Socria manages the account itself now, which means the settings page can
// offer to remove the last way in. Clerk refuses some of these server-side,
// but a page that offers a button and only explains afterwards has already
// failed the person who pressed it: the damage is done, and "you cannot do
// that" arrives too late to be useful. So the offer is withheld instead, with
// the reason attached to the row.
//
// They live here rather than inside the panels for one reason: a rule you can
// only exercise by clicking through a signed-in browser is a rule that gets
// verified once, by hand, and then quietly rots. These are pure functions
// over a snapshot, so the suite can put every account shape through them.
//
// WHAT COUNTS AS A WAY IN. A first factor is anything that gets somebody from
// signed out to signed in on its own:
//
//   a password
//   a passkey
//   a connected account (Google and the like)
//   a verified email address, which can receive a sign-in code
//
// Two-factor is NOT one. It is a second step after a first factor, so it can
// never stand in for one — an account whose only "credential" is an
// authenticator app is an account nobody can get into. That distinction is
// the whole reason this file is careful.

/** Everything the rules need to know about an account. */
export interface FactorSnapshot {
  passwordEnabled: boolean;
  passkeyCount: number;
  /** connected accounts that actually completed their OAuth handshake */
  verifiedExternalAccounts: number;
  verifiedEmails: number;
}

/** How many independent ways in this account has, ignoring one of them. */
function waysIn(s: FactorSnapshot): number {
  return (
    (s.passwordEnabled ? 1 : 0) +
    Math.max(0, s.passkeyCount) +
    Math.max(0, s.verifiedExternalAccounts) +
    Math.max(0, s.verifiedEmails)
  );
}

/** Could this account still be signed into without its password? */
export function canRemovePassword(s: FactorSnapshot): boolean {
  return waysIn(s) - (s.passwordEnabled ? 1 : 0) > 0;
}

/** Could it still be signed into after disconnecting one social account? */
export function canDisconnectAccount(s: FactorSnapshot): boolean {
  return waysIn(s) - 1 > 0;
}

/** Could it still be signed into after removing one passkey? */
export function canRemovePasskey(s: FactorSnapshot): boolean {
  return waysIn(s) - 1 > 0;
}

/** The narrow shape the email rules need. */
export interface EmailSnapshot {
  id: string;
  verified: boolean;
}

/**
 * Why this address cannot be removed, or null when it can.
 *
 * Two refusals, deliberately worded differently, because they are different
 * situations and a person needs to know which one they are in:
 *
 *   The last verified address is a hard stop. Removing it can leave nowhere
 *   to send a sign-in code, and no way back into the account.
 *
 *   The primary is a soft one — make another primary first — and saying so is
 *   the difference between an instruction and a wall.
 *
 * Checked in that order: an account with one address that is both primary and
 * the only verified one must hear the serious reason, not the fixable one.
 */
export function emailRemovalBlock(
  emails: readonly EmailSnapshot[],
  primaryId: string | null | undefined,
  target: EmailSnapshot,
): string | null {
  const verified = emails.filter((e) => e.verified);
  if (target.verified && verified.length <= 1) {
    return 'This is the only verified address on the account. Add and verify another one first — removing this could leave you unable to sign in.';
  }
  if (primaryId && target.id === primaryId) {
    return 'This is your primary address. Make another one primary first.';
  }
  return null;
}
