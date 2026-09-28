// app/api/mind/route.ts
// GET → the whole Mind Graph, for the Memory page.
//       ?scope=logos leaves out private nodes, for a surface that can export
//       itself as an image.
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
import { loadGraph, listSources, loadStale, MindStoreError } from '@/lib/mind/store';
import { privateElsewhere } from '@/lib/mind/types';

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
  // What is waiting on a change they made. Best-effort: marks that cannot be
  // read mean an emptier page, never a broken one.
  const waiting = await loadStale(userId).catch(() => []);

  // A scoped read for Logos, whose map can be exported as an image and shared.
  // Invariant 3 in lib/mind/types.ts: private nodes never reach it. Done here
  // rather than in the client, because a filter the browser applies is a filter
  // that has already been sent.
  const scope = req.nextUrl.searchParams.get('scope');
  if (scope === 'logos') {
    const open = graph.nodes.filter((n) => !privateElsewhere(n, undefined, true));
    const ids = new Set(open.map((n) => n.id));
    return NextResponse.json({
      storage: { ok: true },
      scope: 'logos',
      nodes: open,
      // An edge to something left out goes with it, rather than pointing at
      // nothing and telling the reader that something is there.
      edges: graph.edges.filter((e) => ids.has(e.sourceId) && ids.has(e.targetId)),
      waiting: waiting.filter((w) => ids.has(w.nodeId)),
    });
  }

  return NextResponse.json({
    storage: { ok: true },
    nodes: graph.nodes,
    edges: graph.edges,
    sources,
    waiting,
    // Shown, not hidden. A claim noticed once and not yet believed is still
    // something Socria is holding about someone, and a page about memory that
    // conceals part of it is not the page it says it is.
    pending: graph.pending,
    forgotten: graph.tombstones.length,
  });
}
