// lib/ar-server.ts — WHO THIS REQUEST IS, FOR AR MODE'S EARLY ACCESS (server only).
//
// The signed-in person as lib/ar-access.ts reads them (an id and their
// addresses, each marked verified or not), and whether they may use AR Mode
// and Live Guidance — decided by the same rule everywhere it is asked:
// GET /api/ar/access, and POST /api/logos/guide before any frame is read.

import { auth, currentUser } from '@clerk/nextjs/server';
import { mayUseAr, type Viewer } from './ar-access';
import { operatorGranted } from './socria-one-grant';
import { isProduction } from './environment';

export async function arViewer(): Promise<Viewer | null> {
  try {
    if (!auth().userId) return null;
    const u = await currentUser();
    if (!u) return null;
    return {
      id: u.id,
      emails: (u.emailAddresses ?? []).map((e) => ({ address: e.emailAddress, verified: e.verification?.status === 'verified' })),
    };
  } catch {
    return null;
  }
}

/** May this viewer use AR Mode (and Live Guidance)? Default deny. */
export function arTester(v: Viewer | null): boolean {
  return mayUseAr(v, {
    testers: process.env.SOCRIA_AR_TESTERS,
    admins: process.env.SOCRIA_DASHBOARD_ADMINS,
    production: isProduction(),
    granted: (emails) => operatorGranted(emails.map((e) => ({ emailAddress: e.address, verification: { status: e.verified ? 'verified' : 'unverified' } }))),
  });
}
