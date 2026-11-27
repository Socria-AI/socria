// app/api/new-logos/relations/route.ts
// POST /api/new-logos/relations → relate two of the person's nodes ({ fromId, toId, kind, note })

import { NextRequest } from 'next/server';
import { body, reply, signedIn, unauthorized, withStore } from '@/lib/new-logos/http';
import { linkNodes } from '@/lib/new-logos/ops';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const userId = signedIn();
  if (!userId) return unauthorized();
  const b = await body(req);
  return withStore(async (store) => reply(await linkNodes(store, userId, b, Date.now()), 'relation'), true);
}
