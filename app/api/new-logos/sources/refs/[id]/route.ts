// app/api/new-logos/sources/refs/[id]/route.ts
// DELETE → remove one reference. The source, and every other component's reference to it, stay as they are.

import { NextRequest } from 'next/server';
import { reply, signedIn, unauthorized, withSources } from '@/lib/new-logos/http';
import { removeRef } from '@/lib/new-logos/source-ops';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = signedIn();
  if (!userId) return unauthorized();
  return withSources(async (store) => reply(await removeRef(store, userId, params.id), 'removed'), true);
}
