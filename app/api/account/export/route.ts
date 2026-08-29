// app/api/account/export/route.ts
// GET → everything we hold about you, as one JSON file.
//
// Portability is a right in both the GDPR and the CCPA, and it is also the
// honest counterpart to "your thinking stays yours": a claim that means little
// if the only way to read your own record is through our interface.
//
// Deliberately complete. Not a summary, not the parts we think are
// interesting — every row keyed to this account, including the memory and the
// journey the product built ABOUT you, which are the parts people least expect
// to exist and most deserve to see.

import { NextRequest, NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const db = supabaseAdmin();
  const out: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    note:
      'Everything Socria holds for this account. "memory" and "understanding" ' +
      'are what Socria worked out about your thinking, not what you typed.',
  };

  try {
    const user = await currentUser();
    out.account = {
      id: userId,
      emails: user?.emailAddresses?.map((e) => e.emailAddress) ?? [],
      createdAt: user?.createdAt ?? null,
    };
  } catch {
    out.account = { id: userId };
  }

  // Conversations carry their own messages, memory, map, draft and contexts.
  const { data: convos } = await db
    .from('conversations')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  out.conversations = convos ?? [];

  // The cross-conversation profile and Thinking Journey.
  const { data: profile } = await db
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  out.profile = profile ?? null;

  // Subscription state — the projection of Stripe, not the billing details
  // themselves, which never reach us.
  const { data: sub } = await db
    .from('socria_subscriptions')
    .select('user_id, status, price_id, current_period_end, cancel_at_period_end, created_at')
    .eq('user_id', userId)
    .maybeSingle();
  out.subscription = sub ?? null;

  // Connected accounts: report THAT one exists, never the token itself.
  const { data: conns } = await db
    .from('logos_connections')
    .select('provider, account, updated_at')
    .eq('user_id', userId);
  out.connections = conns ?? [];

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(out, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="socria-export-${stamp}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
