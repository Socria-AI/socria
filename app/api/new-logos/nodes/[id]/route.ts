// app/api/new-logos/nodes/[id]/route.ts
// GET    /api/new-logos/nodes/:id → the node and its kept versions
// PATCH  /api/new-logos/nodes/:id → one action: update | move | reorder | archive | restore | accept | reject | reopen | restore-version
// DELETE /api/new-logos/nodes/:id → delete for good (archived and empty only; a conversation node at any time —
//                                   the conversation itself is never touched). An artifact's pictures that nothing
//                                   else shows are released with it.

import { NextRequest, NextResponse } from 'next/server';
import { body, reply, signedIn, unauthorized, withStore } from '@/lib/new-logos/http';
import { releaseArtifactMedia } from '@/lib/new-logos/media-store';
import { cleanId } from '@/lib/new-logos/model';
import {
  archiveNode,
  decide,
  deleteNode,
  moveNode,
  reorderNode,
  restoreNode,
  restoreVersion,
  updateNode,
} from '@/lib/new-logos/ops';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const userId = signedIn();
  if (!userId) return unauthorized();
  const id = cleanId(params.id);
  if (!id) return NextResponse.json({ ok: false, error: 'Invalid node.', code: 'invalid' }, { status: 400 });
  return withStore(async (store) => {
    const node = (await store.nodes(userId)).find((n) => n.id === id);
    if (!node) return NextResponse.json({ ok: false, error: 'That node was not found.', code: 'not_found' }, { status: 404 });
    return NextResponse.json({ ok: true, node, versions: await store.versions(userId, id) });
  }, false);
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const userId = signedIn();
  if (!userId) return unauthorized();
  const b = await body(req);
  const now = Date.now();
  return withStore(async (store) => {
    switch (b.action) {
      case 'update':
        return reply(await updateNode(store, userId, params.id, b, now), 'node');
      case 'move':
        return reply(await moveNode(store, userId, params.id, b.parentId, b.version, now), 'node');
      case 'reorder':
        return reply(await reorderNode(store, userId, params.id, b.before, b.version, now), 'node');
      case 'archive':
        return reply(await archiveNode(store, userId, params.id, b.version, now), 'node');
      case 'restore':
        return reply(await restoreNode(store, userId, params.id, b.version, now), 'node');
      case 'accept':
      case 'reject':
      case 'reopen':
        return reply(await decide(store, userId, params.id, b.action, b.version, now), 'node');
      case 'restore-version':
        return reply(await restoreVersion(store, userId, params.id, b.versionNo, b.version, now), 'node');
      default:
        return NextResponse.json({ ok: false, error: 'Unknown action.', code: 'invalid' }, { status: 400 });
    }
  }, true);
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const userId = signedIn();
  if (!userId) return unauthorized();
  return withStore(async (store) => {
    const id = cleanId(params.id);
    const before = id ? (await store.nodes(userId)).find((n) => n.id === id) : undefined;
    const versions = before?.type === 'artifact' ? await store.versions(userId, before.id) : [];
    const r = await deleteNode(store, userId, params.id);
    if (r.ok && before?.type === 'artifact') await releaseArtifactMedia(store, userId, before, versions);
    return reply(r, 'deleted');
  }, true);
}
