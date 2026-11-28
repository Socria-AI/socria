// app/api/new-logos/sources/[id]/route.ts
// GET    /api/new-logos/sources/:id → { source, reading }
// PATCH  /api/new-logos/sources/:id { name } → rename
// DELETE /api/new-logos/sources/:id → delete the source for good: its record and every reference to it. Its original
//        file is released too, unless one of the person's conversations still shows it (then it stays, for that
//        conversation). The interface asks before this; removing a reference or taking a source off a canvas never
//        comes here.

import { NextRequest, NextResponse } from 'next/server';
import { body, reply, signedIn, unauthorized, withSources } from '@/lib/new-logos/http';
import { deleteSource, renameSource } from '@/lib/new-logos/source-ops';
import { metaOf } from '@/lib/new-logos/sources';
import { releaseOriginals } from '@/lib/file-originals-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const userId = signedIn();
  if (!userId) return unauthorized();
  return withSources(async (store) => {
    const s = await store.source(userId, params.id);
    if (!s) return NextResponse.json({ ok: false, error: 'That source was not found.', code: 'not_found' }, { status: 404 });
    return NextResponse.json({ ok: true, source: metaOf(s), reading: s.reading });
  }, false);
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const userId = signedIn();
  if (!userId) return unauthorized();
  const b = await body(req);
  const now = Date.now();
  return withSources(async (store) => reply(await renameSource(store, userId, params.id, b.name, now), 'source'), true);
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const userId = signedIn();
  if (!userId) return unauthorized();
  return withSources(async (store) => {
    const r = await deleteSource(store, userId, params.id);
    if (!r.ok) return reply(r, 'deleted');
    // the original goes only when nothing else holds it (a conversation, another record); a failed check keeps it
    const released = r.value.file_id ? (await releaseOriginals(userId, [r.value.file_id]).catch(() => 0)) > 0 : false;
    return NextResponse.json({ ok: true, deleted: { id: r.value.id, references: r.value.references, originalReleased: released } });
  }, true);
}
