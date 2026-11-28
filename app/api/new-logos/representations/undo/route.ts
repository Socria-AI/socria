// app/api/new-logos/representations/undo/route.ts — back to how a workspace's components were before a logged change.
//
// POST { key, entry } → every change from the newest back to `entry` reversed exactly (their before-images), as one
// new change that can itself be undone (which is redo). Signed in only; only the owner's workspaces.

import { NextRequest, NextResponse } from 'next/server';
import { body, signedIn, unauthorized, withRepresentations } from '@/lib/new-logos/http';
import { statusOf } from '@/lib/new-logos/ops';
import { logLines, undoBatch } from '@/lib/new-logos/representation-service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const userId = signedIn();
  if (!userId) return unauthorized();
  const b = await body(req);
  const key = typeof b.key === 'string' ? b.key : '';
  return withRepresentations(async (store) => {
    const r = await undoBatch(store, userId, key, b.entry, Date.now());
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error.message, code: r.error.code }, { status: statusOf(r.error.code) });
    const { loaded, entry } = r.value;
    return NextResponse.json({ ok: true, representation: loaded.record.rep, version: loaded.version, log: logLines(loaded.record.log), entry: entry ? { id: entry.id, summary: entry.summary } : null });
  }, true);
}
