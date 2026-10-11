// app/api/mind/changes/route.ts
// GET  → { changes, proposed }            every change the person's memory records, newest first
// GET  ?node=<id> → { evolution }         one memory's history, from the record alone
// POST { id, decision } → { ok, say }     confirm a change, or reject it (restoring what it displaced)
//
// THE PERSON'S SAY OVER HOW SOCRIA'S UNDERSTANDING OF THEM CHANGES. A change
// read from a conversation — a new position replacing an old one, two claims
// in tension, better words for a claim, a possible contradiction — is proposed
// until they look (lib/mind/evolve.ts). Nothing here is shared or visible to
// anyone else: it is their own account, read and written as them.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { loadGraph, persistGraph } from '@/lib/mind/store';
import { changesOf, evolutionOf, reviewChange, type Decision } from '@/lib/mind/evolve';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;
  const graph = await loadGraph(userId).catch(() => null);
  if (!graph) return NextResponse.json({ error: 'Your memory could not be read just now.' }, { status: 503 });
  const node = req.nextUrl.searchParams.get('node');
  if (node) return NextResponse.json({ evolution: evolutionOf(graph, node.slice(0, 120)) });
  const changes = changesOf(graph, { withAffected: true, limit: 80 });
  return NextResponse.json({ changes, proposed: changes.filter((c) => c.review === 'proposed').length });
}

const DECISIONS: Decision[] = ['confirm', 'reject', 'forget'];

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === 'string' ? body.id.slice(0, 200) : '';
  const decision = DECISIONS.includes(body?.decision) ? (body.decision as Decision) : null;
  if (!id || !decision) return NextResponse.json({ error: 'Which change, and what do you decide?' }, { status: 400 });
  const before = await loadGraph(userId).catch(() => null);
  if (!before) return NextResponse.json({ error: 'Your memory could not be read just now.' }, { status: 503 });
  const r = reviewChange(before, id, decision, Date.now());
  if (!r.ok) return NextResponse.json({ ok: false, error: r.why }, { status: 409 });
  const saved = await persistGraph(userId, before, r.graph);
  if (!saved.ok) return NextResponse.json({ error: 'Could not save that.' }, { status: 500 });
  return NextResponse.json({ ok: true, say: r.say });
}
