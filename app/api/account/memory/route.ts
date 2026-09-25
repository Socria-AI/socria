// app/api/account/memory/route.ts
// DELETE → forget what Socria worked out, without touching what you wrote.
//
// The distinction matters and is the reason this is its own endpoint. Your
// conversations are yours and stay. What goes is the layer Socria built ON TOP
// of them: the per-thread memory (goals, values, constraints, decisions), the
// cross-conversation Thinking Journey, everything Core 4 worked out (its
// Cognitive State, Reasoning Ledger, turn traces and capability evidence), and
// the Mind Graph. Someone who wants to be forgotten but keep their notes has,
// until now, had no way to say so.
//
// THE MIND GRAPH WAS MISSING FROM THIS LIST, and the panel describing this
// button describes the Mind Graph almost word for word — "goals, values,
// constraints, decisions and open uncertainties". Account deletion and export
// both covered mind_*; this route did not, so the reply said "Memory cleared.
// Socria starts fresh from here" and the very next turn still carried the
// person's name, school and goals in the standing profile. Being told you were
// forgotten and then greeted by name is worse than not having the button.
//
// What is KEPT, deliberately: the Project containers in mind_projects (their
// name, description and instructions are the person's own words and their own
// organisation of their work) and the anchor node each one hangs on, without
// which a Project would survive with nothing to attach a memory to. Every edge
// into that anchor goes: the neighbourhood is what Socria worked out.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase';
import { enforceRateLimit } from '@/lib/rate-limit';
import { CORE4_TABLES } from '@/lib/core4/store';
import { MIND_DERIVED_TABLES } from '@/lib/mind/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Keys that hold Socria's read of the person, rather than their own words. */
const DERIVED = [
  'goals', 'values', 'constraints', 'preferences', 'decisions',
  'uncertainties', 'insights', 'emergingUnderstanding', 'thinkingStyle',
  'latestInsight', 'lastInsightAtTurn', 'latestSynthesis', 'lastSynthesisAtTurn',
];

/** A table a migration has not created yet holds nothing of theirs to clear. */
function missingTable(error: { code?: string | null; message?: string | null }): boolean {
  return /42p01|pgrst205|relation .*does not exist/i.test(`${error.code ?? ''} ${error.message ?? ''}`);
}

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
      // Stamped, not empty: the clients sync newest-wins by `updatedAt`, and
      // an unstamped clear reads as older than any browser's copy — which
      // would then be pushed straight back up, undoing the clearing.
      .update({ profile: '', understanding: { updatedAt: Date.now() }, updated_at: Date.now() })
      .eq('user_id', userId);

    // Core 4's reasoning state is all Socria's reading, so all of it goes:
    // the per-conversation Cognitive State, the Reasoning Ledger, the turn
    // traces and the capability evidence. A table not yet created is
    // nothing to clear; any other failure is reported, not swallowed.
    const failed: string[] = [];
    for (const table of CORE4_TABLES) {
      const { error } = await db.from(table).delete().eq('user_id', userId);
      if (error && !missingTable(error)) failed.push(table);
    }
    // The Mind Graph. Same forgiveness for a table a migration has not
    // created yet, and the same refusal to report success on anything else.
    for (const table of MIND_DERIVED_TABLES) {
      const { error } = await db.from(table).delete().eq('user_id', userId);
      if (error && !missingTable(error)) failed.push(table);
    }

    // The nodes, minus the Project anchors. Deleting by explicit id rather than
    // by a negated filter: node ids carry ':' and '|', which is not worth
    // quoting into a PostgREST list when the cap is 5,000 rows.
    {
      const { data: projects, error: pErr } = await db.from('mind_projects').select('node_id').eq('user_id', userId);
      if (pErr && !missingTable(pErr)) failed.push('mind_projects');
      const anchors = new Set((projects ?? []).map((r) => (r as { node_id: string }).node_id));
      const { data: nodes, error: nErr } = await db.from('mind_nodes').select('id').eq('user_id', userId);
      if (nErr && !missingTable(nErr)) failed.push('mind_nodes');
      const doomed = (nodes ?? []).map((r) => (r as { id: string }).id).filter((id) => !anchors.has(id));
      for (let i = 0; i < doomed.length; i += 200) {
        const { error } = await db.from('mind_nodes').delete().eq('user_id', userId).in('id', doomed.slice(i, i + 200));
        if (error && !missingTable(error)) { failed.push('mind_nodes'); break; }
      }
    }

    if (failed.length) {
      return NextResponse.json({ error: 'Could not clear all of Socria\'s memory.', failed: [...new Set(failed)] }, { status: 500 });
    }

    return NextResponse.json({ ok: true, clearedThreads });
  } catch (e) {
    console.error('memory clear failed:', e);
    return NextResponse.json({ error: 'Could not clear memory.' }, { status: 500 });
  }
}
