// lib/events/staff.ts — WHO MAY SEE ATTENDEES, AND WHO MAY CHANGE THINGS.
//
// Two roles, both default-deny, both by signed-in Clerk identity (never by a
// shared code — the developer dashboard's two-step code does not open this):
//
//   admin — everyone in SOCRIA_DASHBOARD_ADMINS, the same list that opens the
//           developer dashboard. Sees the attendee list, edits events,
//           exports, deletes, resyncs the sheet.
//   staff — admins, plus SOCRIA_EVENT_STAFF: the people working the door.
//           They can look someone up, check them in and add walk-ins, and see
//           only what that needs (a name, a masked email, the code).
//
// Both lists take verified email addresses or Clerk user ids
// (lib/dashboard/gate.ts parseAdmins).

import 'server-only';
import { currentUser } from '@clerk/nextjs/server';
import { mayViewDashboard, type Viewer } from '@/lib/dashboard/gate';

export type Role = 'admin' | 'staff';

export function roleOf(viewer: Viewer | null, admins = process.env.SOCRIA_DASHBOARD_ADMINS, staff = process.env.SOCRIA_EVENT_STAFF): Role | null {
  if (!viewer) return null;
  if (mayViewDashboard(viewer, admins)) return 'admin';
  if (mayViewDashboard(viewer, staff)) return 'staff';
  return null;
}

export async function currentViewer(): Promise<Viewer | null> {
  try {
    const u = await currentUser();
    if (!u) return null;
    return { id: u.id, emails: (u.emailAddresses ?? []).map((e) => ({ address: e.emailAddress, verified: e.verification?.status === 'verified' })) };
  } catch {
    return null;
  }
}

/** The signed-in person's role and an id to record against what they do. */
export async function currentRole(): Promise<{ role: Role; by: string } | null> {
  const v = await currentViewer();
  const role = roleOf(v);
  return role && v ? { role, by: v.id } : null;
}
