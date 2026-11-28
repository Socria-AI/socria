// app/api/new-logos/nodes/[id]/ops/route.ts
// POST /api/new-logos/nodes/:id/ops  { ops: ArtifactOp[] } → { ok, node, skipped }
//
// The one way an artifact's composition changes (lib/new-logos/artifact-ops.ts): a batch of validated operations,
// applied to what is stored when it arrives. A person's edits come here; so will the assistant's, through the same
// checks. No version is needed from the browser: operations name what they change, so two edits to different
// primitives never refuse each other. A batch that would make the artifact too large, or that is malformed, changes
// nothing.

import { NextRequest, NextResponse } from 'next/server';
import { reply, signedIn, unauthorized, withStore } from '@/lib/new-logos/http';
import { applyArtifactOps } from '@/lib/new-logos/ops';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A batch, as sent, may not be larger than this. */
const MAX_BODY = 400_000;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = signedIn();
  if (!userId) return unauthorized();
  const text = await req.text().catch(() => '');
  if (text.length > MAX_BODY) return NextResponse.json({ ok: false, error: 'Too much at once. Nothing was changed.', code: 'limit' }, { status: 413 });
  let b: Record<string, unknown> = {};
  try {
    const j = JSON.parse(text || '{}');
    if (j && typeof j === 'object' && !Array.isArray(j)) b = j as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'Not a batch of operations.', code: 'invalid' }, { status: 400 });
  }
  const now = Date.now();
  return withStore(async (store) => {
    const r = await applyArtifactOps(store, userId, params.id, b.ops, now);
    if (!r.ok) return reply(r, 'node');
    return NextResponse.json({ ok: true, node: r.value.node, skipped: r.value.skipped });
  }, true);
}
