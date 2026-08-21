// app/api/logos/redeem/route.ts
// POST { code } → { ok, account } — redeem a Socria One access code.
//
// Anyone with a valid code gets a yes (the client then holds it locally, the
// same soft gate the header uses). What this route ADDS is permanence: a
// signed-in redemption is written to the account as a complimentary grant,
// so One follows the person to their next device instead of living in one
// browser's storage.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { isValidOneKey } from '@/lib/socria-one';
import { grantComplimentary } from '@/lib/subscriptions';
import { enforceRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId } = auth();
  // Rate-limited hard: this is the only surface a code can be guessed against.
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const code = typeof body?.code === 'string' ? body.code : '';
  if (!isValidOneKey(code)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  let account = false;
  if (userId) {
    try {
      await grantComplimentary(userId);
      account = true;
    } catch (e) {
      // Supabase down or unconfigured: the code still works locally; say so
      // honestly rather than failing the redemption outright.
      console.error('redeem: could not persist grant', e);
    }
  }
  return NextResponse.json({ ok: true, account });
}
