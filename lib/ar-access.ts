// lib/ar-access.ts — WHO MAY USE AR MODE while it is in early access.
//
// AR Mode (components/logos5/ARMode.tsx) turns the Logic Map into something a
// person moves with their hands, through their own webcam. It is early: it
// asks for the camera, it runs a hand-tracking model in the browser, and it
// has only been tried on a handful of machines. So it opens for approved
// testers, and everybody else sees a preview of it and the waitlist.
//
// The rule is default-deny, decided on the server, and reads the same kinds
// of name the developer dashboard does (lib/dashboard/gate.ts), so nobody has
// to learn a second format:
//
//   SOCRIA_AR_TESTERS="you@example.com, user_2abc…"
//
//   · an entry with an @ is an email address and matches only a VERIFIED
//     address on the account — an address can be added before it is
//     confirmed, so the string alone proves nothing;
//   · an entry starting user_ is a Clerk user id (per deployment: Production
//     and Preview are different Clerk instances);
//   · `*` opens AR Mode to everyone — honoured only off production, for
//     trying it on a preview or locally, and ignored on production.
//
// Beside that list, whoever may see the developer dashboard
// (SOCRIA_DASHBOARD_ADMINS) is a tester, and so is the owner's account by
// its permanent grant (lib/socria-one-grant.ts OPERATOR_GRANTS — a hash of a
// verified address, injected here as `granted`). Joining the waitlist never
// makes anybody a tester: being let in is a decision, made by adding a name
// to the list above.
//
// PURE. The route reads the person and the environment and hands them in.

import { parseAdmins, type Viewer } from './dashboard/gate';

export type { Viewer };

export interface ArRule {
  /** SOCRIA_AR_TESTERS */
  testers?: string | null;
  /** SOCRIA_DASHBOARD_ADMINS */
  admins?: string | null;
  /** is this the production deployment — where `*` means nothing */
  production: boolean;
  /** whether a verified address on the account carries the owner's permanent grant */
  granted?: (emails: Viewer['emails']) => boolean;
}

/** Does the list open AR Mode to everyone (and is that allowed here)? */
export function openToAll(rule: Pick<ArRule, 'testers' | 'production'>): boolean {
  if (rule.production) return false;
  return (rule.testers ?? '').split(/[\s,;]+/).some((t) => t.trim() === '*');
}

function listed(viewer: Viewer, raw: string | null | undefined): boolean {
  const names = parseAdmins(raw);
  if (names.ids.has(viewer.id)) return true;
  return viewer.emails.some((e) => e.verified && names.emails.has(e.address.toLowerCase()));
}

/** May this person use AR Mode? Default deny. A visitor with no account is never a tester (except `*` off production). */
export function mayUseAr(viewer: Viewer | null, rule: ArRule): boolean {
  if (openToAll(rule)) return true;
  if (!viewer?.id) return false;
  if (listed(viewer, rule.testers)) return true;
  if (listed(viewer, rule.admins)) return true;
  return !!rule.granted?.(viewer.emails);
}

/** The address a signed-in person would join the waitlist with: their first verified one. */
export function waitlistAddress(viewer: Viewer | null): string | null {
  const e = viewer?.emails.find((x) => x.verified)?.address;
  return e ? e.trim().toLowerCase() : null;
}

/** What the page is told: enough to choose between AR Mode and its preview, and to prefill the waitlist. */
export interface ArAccess {
  tester: boolean;
  signedIn: boolean;
  /** the person's own verified address, to prefill the waitlist field; null when signed out */
  email: string | null;
  /** already on the AR waitlist (looked up by that address) */
  waitlisted: boolean;
}
