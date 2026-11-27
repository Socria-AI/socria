// app/api/new-logos/relations/[id]/route.ts
// DELETE /api/new-logos/relations/:id → remove a relation (the nodes it joined are untouched)

import { NextRequest } from 'next/server';
import { reply, signedIn, unauthorized, withStore } from '@/lib/new-logos/http';
import { unlinkNodes } from '@/lib/new-logos/ops';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = signedIn();
  if (!userId) return unauthorized();
  return withStore(async (store) => reply(await unlinkNodes(store, userId, params.id), 'removed'), true);
}
