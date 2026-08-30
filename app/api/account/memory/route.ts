// app/api/account/memory/route.ts
// DELETE → forget what Socria worked out, without touching what you wrote.
//
// The distinction matters and is the reason this is its own endpoint. Your
// conversations are yours and stay. What goes is the layer Socria built ON TOP
// of them: the per-thread memory (goals, values, constraints, decisions) and
// the cross-conversation Thinking Journey. Someone who wants to be forgotten
// but keep their notes has, until now, had no way to say so.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Keys that hold Socria's read of the person, rather than their own words. */
const DERIVED = [
  'goals', 'values', 'constraints', 'preferences', 'decisions',
  'uncertainties', 'insights', 'emergingUnderstanding', 'thinkingStyle',
  'latestInsight', 'lastInsightAtTurn', 'latestSynthesis', 'lastSynthesisAtTurn',
];

export async function DELETE(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const db = supabaseAdmin();
  let clearedThreads = 0;

  try {
    // Strip the derived keys from every conversation's memory, leaving the
    // messages, the map and the draft — and leaving the __logos sidecar, which
    // holds a Logos session's map rather than anything worked out about them.
    const { data: rows } = await db
      .from('conversations')
      .select('id, memory')
      .eq('user_id', userId);

    for (const row of rows ?? []) {
      const memory = (row as { memory?: Record<string, unknown> }).memory;
      if (!memory || typeof memory !== 'object') continue;
      const kept: Record<string, unknown> = {};
      let touched = false;
      for (const [k, v] of Object.entries(memory)) {
        if (DERIVED.includes(k)) { touched = true; continue; }
        kept[k] = v;
      }
      if (!touched) continue;
      const { error } = await db
        .from('conversations')
        .update({ memory: kept })
        .eq('id', (row as { id: string }).id)
        .eq('user_id', userId);
      if (!error) clearedThreads++;
    }

    // The cross-conversation journey and the imported background profile.
    await db
      .from('user_profiles')
      .update({ profile: '', understanding: {}, updated_at: Date.now() })
      .eq('user_id', userId);

    return NextResponse.json({ ok: true, clearedThreads });
  } catch (e) {
    console.error('memory clear failed:', e);
    return NextResponse.json({ error: 'Could not clear memory.' }, { status: 500 });
  }
}
