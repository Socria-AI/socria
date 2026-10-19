// lib/events/staff.ts — WHO MAY SEE ATTENDEES AND CHANGE THINGS.
//
// One role, default-deny, by signed-in Clerk identity (never by a shared
// code — the developer dashboard's two-step code does not open this):
//
//   admin — everyone in SOCRIA_DASHBOARD_ADMINS, the same list that opens the
//           developer dashboard. Sees the attendee list, edits events,
//           checks people in by hand, exports, deletes, resyncs the sheet.
//
// There is no separate door role: attendees check themselves in at the venue
// (app/events/[id]/checkin), and an admin can check someone in from the
// dashboard's attendee list. The list takes verified email addresses or
// Clerk user ids (lib/dashboard/gate.ts parseAdmins).

import 'server-only';
import { currentUser } from '@clerk/nextjs/server';
import { mayViewDashboard, type Viewer } from '@/lib/dashboard/gate';

export type Role = 'admin';

export function roleOf(viewer: Viewer | null, admins = process.env.SOCRIA_DASHBOARD_ADMINS): Role | null {
  if (!viewer) return null;
  return mayViewDashboard(viewer, admins) ? 'admin' : null;
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
