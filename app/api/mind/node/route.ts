// app/api/mind/node/route.ts
// PATCH  → edit, re-type, re-status, archive or challenge one node
// DELETE → forget a node, or an edge, for good
//
// This is where the Memory page stops being a visualization. A graph you can
// only look at is a report; a graph you can correct is memory.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { listProjects, loadGraph, persistGraph } from '@/lib/mind/store';
import { challengeNode, forgetEdge, forgetNode } from '@/lib/mind/apply';
import { NODE_STATUSES, MAX_CONTENT, MAX_LABEL, clip, fingerprintNode, type NodeStatus } from '@/lib/mind/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'Which node?' }, { status: 400 });

  const before = await loadGraph(userId);
  const node = before.nodes.find((n) => n.id === id);
  if (!node) return NextResponse.json({ error: 'No such node.' }, { status: 404 });

  const now = Date.now();
  let after = before;

  // Challenging is not editing and not deleting. The claim stays, marked, with
  // the person's disagreement attached — because a claim Socria got wrong is
  // part of the history of getting it wrong, and erasing it loses that. They
  // can still delete it outright if they want it gone.
  if (typeof body?.challenge === 'string' && body.challenge.trim()) {
    after = challengeNode(before, id, now, body.challenge);
  } else {
    const label = typeof body?.label === 'string' ? clip(body.label, MAX_LABEL) : null;
    const content = typeof body?.content === 'string' ? clip(body.content, MAX_CONTENT) : null;
    const type = typeof body?.type === 'string' ? clip(body.type, 40) : null;
    const status =
      typeof body?.status === 'string' && (NODE_STATUSES as readonly string[]).includes(body.status)
        ? (body.status as NodeStatus)
        : null;

    after = {
      ...before,
      nodes: before.nodes.map((n) =>
        n.id !== id
          ? n
          : {
              ...n,
              label: label || n.label,
              content: content ?? n.content,
              type: type || n.type,
              status: status ?? n.status,
              // Their correction is a first-class ground, recorded like any
              // other — so the node's history says a person changed it, and
              // when, rather than simply showing different words than before.
              provenance: [
                ...n.provenance,
                { kind: 'stated' as const, surface: 'user' as const, at: now, note: 'edited by hand' },
              ].slice(-20),
              updatedAt: now,
            }
      ),
    };
  }

  const saved = await persistGraph(userId, before, after);
  if (!saved.ok) return NextResponse.json({ error: 'Could not save that.' }, { status: 500 });
  return NextResponse.json({ ok: true, node: after.nodes.find((n) => n.id === id) ?? null });
}

export async function DELETE(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === 'string' ? body.id : '';
  const kind = body?.kind === 'edge' ? 'edge' : body?.kind === 'pending' ? 'pending' : 'node';
  if (!id) return NextResponse.json({ error: 'Which one?' }, { status: 400 });

  const before = await loadGraph(userId);

  // A claim noticed once and not yet believed. It is shown on the Memory
  // page, so it has to be dismissible there — a page that displays something
  // Socria is holding about somebody and gives them no way to say "no" is
  // showing them a thing they cannot act on.
  //
  // Dismissing writes a tombstone as well as clearing the sighting, because
  // otherwise the next conversation proposes it again and they dismiss it
  // again, for ever.
  if (kind === 'pending') {
    const claim = before.pending.find((p) => p.fingerprint === id);
    if (!claim) return NextResponse.json({ error: 'No such claim.' }, { status: 404 });
    const fp = fingerprintNode(claim.type, claim.label);
    const after = {
      ...before,
      pending: before.pending.filter((p) => p.fingerprint !== id),
      tombstones: before.tombstones.includes(fp)
        ? before.tombstones
        : [...before.tombstones, fp],
    };
    const saved = await persistGraph(userId, before, after);
    if (!saved.ok) return NextResponse.json({ error: 'Could not save that.' }, { status: 500 });
    return NextResponse.json({ ok: true, forgotten: true });
  }
  // A Project's own node cannot be forgotten from here. Forgetting it would
  // leave the Project pointing at a node that no longer exists — its
  // conversations and files still filed under it, nothing new ever tied to
  // it again, and a tombstone stopping Socria from re-learning that the
  // person works on it at all. Deleting a Project is its own act, with its
  // own account of what goes and what stays; it lives in the folder's settings.
  if (kind === 'node') {
    const projects = await listProjects(userId).catch(() => []);
    const owner = projects.find((p) => p.nodeId === id);
    if (owner) {
      return NextResponse.json(
        { error: `This is your Project “${owner.name}”. Archive or delete it from its folder instead.` },
        { status: 409 }
      );
    }
  }

  // Both write a tombstone. Without one, deletion is theatre: the next
  // extraction notices the same thing and puts it back, and the person
  // concludes — correctly — that deleting does not work here.
  const after = kind === 'edge' ? forgetEdge(before, id) : forgetNode(before, id, Date.now());
  if (after === before) return NextResponse.json({ error: 'No such thing.' }, { status: 404 });

  const saved = await persistGraph(userId, before, after);
  if (!saved.ok) return NextResponse.json({ error: 'Could not save that.' }, { status: 500 });
  return NextResponse.json({ ok: true, forgotten: true });
}
