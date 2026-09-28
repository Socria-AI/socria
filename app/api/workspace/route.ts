// app/api/workspace/route.ts
// GET  → the workspace as one object: everything durable, projected into the
//        shared vocabulary and handed back as a portable document.
// POST → a structured question over it.
//
// WHY THIS ROUTE EXISTS AT ALL. The three stores each have their own surface —
// the Memory page, the map, the model bench — and there was no way to hold the
// whole thing at once: to take it somewhere else, to keep a copy, or to ask it
// something that crosses a surface boundary ("everything I assumed that nothing
// has confirmed, whatever it came from"). A workspace you cannot hold is not an
// object; it is a view.
//
// WHAT IT IS NOT. Not a second store: it assembles a projection on each call
// and writes nothing (lib/workspace/adapters.ts). Nothing here can change the
// person's thinking, which is why it needs no confirmation and no undo.
//
// PRIVATE MATERIAL DOES NOT LEAVE. The export drops anything marked private and
// says how many it dropped — not because the caller is untrusted (it is the
// person themselves) but because a file outlives the moment it was made, and
// the one thing that must never end up in a file somebody forwards is material
// from a conversation they had in confidence.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { loadGraph, loadStale, MindStoreError } from '@/lib/mind/store';
import { projectMind } from '@/lib/workspace/adapters';
import { emptyWorkspace, update, type Workspace } from '@/lib/workspace/store';
import { exportWorkspace, query, type Query } from '@/lib/workspace/portable';
import { health, tensions, gaps } from '@/lib/workspace/trace';
import { EPISTEMIC_STATES, OBJECT_TYPES, ORIGINS, RELATION_TYPES } from '@/lib/workspace/object';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Everything durable, plus the marks saying what is waiting on a change. */
async function assemble(userId: string): Promise<Workspace> {
  const graph = await loadGraph(userId);
  let ws = projectMind(emptyWorkspace(), graph);
  const waiting = await loadStale(userId).catch(() => []);
  for (const w of waiting) {
    const id = `mind:${w.nodeId}`;
    if (!ws.objects.has(id)) continue;
    ws = update(
      ws,
      id,
      {
        stale: {
          because: `mind:${w.becauseId}`,
          label: w.becauseLabel,
          at: w.at,
          kind: w.kind,
          distance: w.distance,
        },
      },
      'system',
      w.at
    );
  }
  return ws;
}

export async function GET(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  let ws: Workspace;
  try {
    ws = await assemble(userId);
  } catch (e) {
    if (e instanceof MindStoreError) {
      return NextResponse.json({ error: 'Your workspace could not be read.', reason: e.reason }, { status: 503 });
    }
    throw e;
  }

  const title = req.nextUrl.searchParams.get('title') || 'My workspace';
  const doc = exportWorkspace(ws, { at: Date.now(), title });

  // A download when asked for one, so "keep a copy" is one click and the file
  // has a name somebody can find again.
  if (req.nextUrl.searchParams.get('download') === '1') {
    const day = new Date().toISOString().slice(0, 10);
    return new NextResponse(JSON.stringify(doc, null, 2), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="socria-workspace-${day}.json"`,
        'cache-control': 'no-store',
      },
    });
  }

  // Structure, alongside the document: what disagrees with what, and what a lot
  // rests on with nothing behind it. Counts and lists — never a score.
  return NextResponse.json({
    workspace: doc,
    structure: {
      health: health(ws),
      tensions: tensions(ws).slice(0, 12),
      gaps: gaps(ws, 12),
    },
    vocabulary: {
      types: OBJECT_TYPES,
      relations: RELATION_TYPES,
      standings: EPISTEMIC_STATES,
      origins: ORIGINS,
    },
  });
}

/**
 * Ask the workspace something.
 *
 * A POST because a query is a structured object rather than a string, and
 * squeezing arrays of types and standings into a query string would mean
 * inventing an encoding for them. It reads and writes nothing.
 */
export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Ask what?' }, { status: 400 });

  // Only the fields the query understands, taken one at a time: an unchecked
  // object from a request body reaching a filter is how a query turns into an
  // injection.
  const pick = <T extends string>(v: unknown, allowed: readonly T[]): T[] | undefined => {
    if (!Array.isArray(v)) return undefined;
    const kept = v.filter((x): x is T => typeof x === 'string' && (allowed as readonly string[]).includes(x));
    return kept.length ? kept : undefined;
  };
  const q: Query = {
    ...(typeof body.text === 'string' ? { text: body.text.slice(0, 200) } : {}),
    ...(pick(body.type, OBJECT_TYPES) ? { type: pick(body.type, OBJECT_TYPES) } : {}),
    ...(pick(body.epistemic, EPISTEMIC_STATES) ? { epistemic: pick(body.epistemic, EPISTEMIC_STATES) } : {}),
    ...(pick(body.origin, ORIGINS) ? { origin: pick(body.origin, ORIGINS) } : {}),
    ...(pick(body.by, RELATION_TYPES) ? { by: pick(body.by, RELATION_TYPES) } : {}),
    ...(body.yours === true ? { yours: true } : {}),
    ...(body.unsettled === true ? { unsettled: true } : {}),
    ...(body.stale === true ? { stale: true } : {}),
    ...(typeof body.connectedTo === 'string' ? { connectedTo: body.connectedTo.slice(0, 200) } : {}),
    ...(body.direction === 'in' || body.direction === 'out' ? { direction: body.direction } : {}),
    ...(typeof body.since === 'number' ? { since: body.since } : {}),
    ...(typeof body.limit === 'number' ? { limit: body.limit } : {}),
  };

  let ws: Workspace;
  try {
    ws = await assemble(userId);
  } catch (e) {
    if (e instanceof MindStoreError) {
      return NextResponse.json({ error: 'Your workspace could not be read.', reason: e.reason }, { status: 503 });
    }
    throw e;
  }

  const result = query(ws, q);
  return NextResponse.json({
    say: result.say,
    total: result.total,
    objects: result.objects,
  });
}
