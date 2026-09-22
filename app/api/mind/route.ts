// app/api/mind/route.ts
// GET → the whole Mind Graph, for the Memory page.
//
// THE SAME ROWS CORE READS. There is no view model and no second
// representation: this hands back mind_nodes and mind_edges as they are, so
// what is on screen is what the prompt was built from. If a node is visible
// here, Core can reach it; if it is not here, Core does not know it. That
// equivalence is the whole design, and it should be true of the code rather
// than merely claimed.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { loadGraph, listSources, MindStoreError } from '@/lib/mind/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  // A page about memory that renders "Nothing yet" when the tables do not
  // exist is telling somebody they have no memories when the truth is that
  // nothing was ever able to store one. Those need different words, so the
  // store's failure is carried here rather than flattened into an empty
  // graph — which is what this route did until now, because loadGraph
  // discarded the error before this code could ever see it.
  let graph;
  try {
    graph = await loadGraph(userId);
  } catch (e) {
    if (e instanceof MindStoreError) {
      return NextResponse.json({
        nodes: [], edges: [], sources: [], pending: [], forgotten: 0,
        storage: { ok: false, reason: e.reason },
      });
    }
    throw e;
  }
  const sources = await listSources(userId);

  return NextResponse.json({
    storage: { ok: true },
    nodes: graph.nodes,
    edges: graph.edges,
    sources,
    // Shown, not hidden. A claim noticed once and not yet believed is still
    // something Socria is holding about someone, and a page about memory that
    // conceals part of it is not the page it says it is.
    pending: graph.pending,
    forgotten: graph.tombstones.length,
  });
}
