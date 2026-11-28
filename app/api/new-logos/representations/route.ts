// app/api/new-logos/representations/route.ts — a workspace's components (lib/new-logos/representation.ts).
//
// A workspace is a conversation's space (key c:<conversation id>) or an objective's (key o:<objective node id>).
//
// GET  ?key=… → { representation, version, log }     empty (version 0) for a workspace with no components yet
// POST { key, ops, version, summary? } → the person's own changes, through the one operation system
//      (lib/new-logos/representation-ops.ts) — made directly on the canvas, by a command, or from the Smart Omnibox:
//      added, reworded, weighed, answered, connected, merged, removed, shown another way, a variable moved, an item
//      kept as a node. Made on the version the page saw; a stale one is refused with the current state (409), for the
//      page to merge and resend.
//
// The assistant's turns are POST /api/new-logos/represent. Signed in only; only the owner's workspaces; a database
// without the table answers { setup: false }.

import { NextRequest, NextResponse } from 'next/server';
import { bodyUpTo, signedIn, unauthorized, withRepresentations } from '@/lib/new-logos/http';
import { statusOf } from '@/lib/new-logos/ops';
import { loadRepresentation, logLines, personBatch } from '@/lib/new-logos/representation-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const userId = signedIn();
  if (!userId) return unauthorized();
  const key = new URL(req.url).searchParams.get('key') ?? '';
  return withRepresentations(async (store) => {
    const r = await loadRepresentation(store, userId, key);
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error.message, code: r.error.code }, { status: statusOf(r.error.code) });
    return NextResponse.json({ ok: true, setup: true, representation: r.value.record.rep, version: r.value.version, log: logLines(r.value.record.log) });
  }, false);
}

export async function POST(req: NextRequest) {
  const userId = signedIn();
  if (!userId) return unauthorized();
  const b = await bodyUpTo(req, 600_000);
  if (!b) return NextResponse.json({ ok: false, error: 'That is too large to change at once.', code: 'limit' }, { status: 413 });
  const key = typeof b.key === 'string' ? b.key : '';
  return withRepresentations(async (store) => {
    const r = await personBatch(store, userId, key, b.ops, b.version, Date.now(), typeof b.summary === 'string' ? b.summary : undefined);
    if (!r.ok) {
      if (r.error.code === 'conflict') {
        const now = await loadRepresentation(store, userId, key);
        if (now.ok) return NextResponse.json({ ok: false, code: 'conflict', error: r.error.message, representation: now.value.record.rep, version: now.value.version, log: logLines(now.value.record.log) }, { status: 409 });
      }
      return NextResponse.json({ ok: false, error: r.error.message, code: r.error.code }, { status: statusOf(r.error.code) });
    }
    const { loaded, entry, result } = r.value;
    return NextResponse.json({
      ok: true,
      representation: loaded.record.rep,
      version: loaded.version,
      log: logLines(loaded.record.log),
      entry: entry ? { id: entry.id, summary: entry.summary } : null,
      skipped: result.skipped,
      ids: result.ids,
    });
  }, true);
}
