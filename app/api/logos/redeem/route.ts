// POST /api/logos/redeem — retired (October 31, 2026).
//
// A typed code used to be redeemed here into a permanent, complimentary Socria
// One on the account. Socria One is paid for or it is not held now, so nothing
// is redeemed: the route answers, plainly, that codes are no longer offered —
// a page from before this change that still calls it is told so instead of
// failing silently. Grants written before are left where they are, and no
// longer entitle anyone (lib/entitlement-rule.ts RETIRED_STATUSES,
// lib/socria-one-grant.ts).

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json({ error: 'Codes for Socria One are no longer offered. Socria One is $15 a month.', retired: true }, { status: 410 });
}
