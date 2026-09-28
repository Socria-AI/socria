// app/api/mind/edge/route.ts
// POST → connect two objects, by hand, with a reason.
//
// The other half of a workspace somebody can build in. Adding objects was
// already possible (../node POST); this is the part that makes them reasoning
// rather than a list — "the lease is why we moved" is a fact about two objects
// and belongs between them, not in a note on one.
//
// Deleting an edge is not here: it already exists as DELETE ../node with
// kind:'edge', and moving it would break every caller for no gain.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { loadGraph, persistGraph } from '@/lib/mind/store';
import { relateNodes } from '@/lib/workspace/write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const sourceId = typeof body?.sourceId === 'string' ? body.sourceId : '';
  const targetId = typeof body?.targetId === 'string' ? body.targetId : '';
  const relationship = typeof body?.relationship === 'string' ? body.relationship : '';
  if (!sourceId || !targetId || !relationship) {
    return NextResponse.json({ error: 'Which two, and how?' }, { status: 400 });
  }

  const before = await loadGraph(userId);
  const now = Date.now();
  let n = 0;
  const written = relateNodes(
    before,
    {
      sourceId,
      targetId,
      relationship,
      note: typeof body?.note === 'string' ? body.note : undefined,
    },
    {
      now,
      nextId: () => `e_${now.toString(36)}_h${(n++).toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    }
  );

  // A refusal is information, not a failure — see the note on POST ../node.
  if (!written.ok) {
    return NextResponse.json({ ok: false, refused: written.reason, say: written.say });
  }

  const saved = await persistGraph(userId, before, written.graph);
  if (!saved.ok) return NextResponse.json({ error: 'Could not save that.' }, { status: 500 });
  return NextResponse.json({ ok: true, edge: written.it, say: written.say });
}
