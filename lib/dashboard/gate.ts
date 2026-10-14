// lib/dashboard/gate.ts
//
// WHO MAY SEE THE DEVELOPER DASHBOARD. Nobody, unless named.
//
// The dashboard reads every account's sign-up date, sign-in method and email
// DOMAIN, and every conversation's timestamps — never their content, but still
// nothing the public should reach. So the rule is default-deny and lives in
// one environment variable, set per Vercel environment (Production, Preview),
// because Production and Preview use different Clerk instances and the same
// person has a different user id in each:
//
//   SOCRIA_DASHBOARD_ADMINS="you@example.com, user_2abc…"
//
// An entry with an @ is an email address and matches only a VERIFIED address
// on the account — an address can be added to an account before it is
// confirmed, so the string alone proves nothing. An entry starting user_ is a
// Clerk user id. Anything else is ignored. Unset or empty: nobody, and the
// page is a 404 exactly like a page that does not exist.
//
// PURE.

export interface Viewer {
  id: string;
  emails: { address: string; verified: boolean }[];
}

export interface Admins {
  ids: Set<string>;
  emails: Set<string>;
}

export function parseAdmins(raw: string | null | undefined): Admins {
  const ids = new Set<string>();
  const emails = new Set<string>();
  for (const part of (raw ?? '').split(/[\s,;]+/)) {
    const t = part.trim();
    if (!t) continue;
    if (/^user_[A-Za-z0-9]+$/.test(t)) ids.add(t);
    else if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t)) emails.add(t.toLowerCase());
  }
  return { ids, emails };
}

/** May this signed-in person see the dashboard? Default deny. */
export function mayViewDashboard(viewer: Viewer | null, raw: string | null | undefined = process.env.SOCRIA_DASHBOARD_ADMINS): boolean {
  if (!viewer?.id) return false;
  const admins = parseAdmins(raw);
  if (admins.ids.has(viewer.id)) return true;
  return viewer.emails.some((e) => e.verified && admins.emails.has(e.address.toLowerCase()));
}
