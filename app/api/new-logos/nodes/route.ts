// app/api/new-logos/nodes/route.ts
// GET  /api/new-logos/nodes → every node and relation the signed-in person owns ({ setup: false } before the migration)
// POST /api/new-logos/nodes → create a node (a conversation node places a canonical conversation; see lib/new-logos/ops.ts)

import { NextRequest, NextResponse } from 'next/server';
import { body, reply, signedIn, unauthorized, withStore } from '@/lib/new-logos/http';
import { createNode } from '@/lib/new-logos/ops';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const userId = signedIn();
  if (!userId) return unauthorized();
  return withStore(async (store) => {
    const [nodes, relations] = await Promise.all([store.nodes(userId), store.relations(userId)]);
    return NextResponse.json({ ok: true, setup: true, nodes, relations });
  }, false);
}

export async function POST(req: NextRequest) {
  const userId = signedIn();
  if (!userId) return unauthorized();
  const b = await body(req);
  return withStore(async (store) => reply(await createNode(store, userId, b, Date.now()), 'node'), true);
}
