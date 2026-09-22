// app/api/projects/[id]/goals/route.ts
// POST { text } → add a goal to a Project
//
// A goal is a Goal node in the one Mind Graph, tied to the Project's node —
// not a list on the Project. So a goal Core already knows about (from a
// conversation, or from another Project) is REUSED rather than duplicated,
// and a goal added here can surface in a conversation anywhere it is
// relevant. Marking one done goes through /api/mind/node like any other
// status change, which keeps the history of it having been a goal.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { MindStoreError, getProject, loadGraph, persistGraph } from '@/lib/mind/store';
import { addGoal } from '@/lib/mind/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  let project;
  try {
    project = await getProject(userId, params.id);
  } catch (e) {
    if (e instanceof MindStoreError) {
      return NextResponse.json({ error: 'Projects are not set up on this deployment yet.' }, { status: 503 });
    }
    throw e;
  }
  if (!project) return NextResponse.json({ error: 'No such Project.' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === 'string' ? body.text : '';
  if (!text.trim()) return NextResponse.json({ error: 'What is the goal?' }, { status: 400 });

  const now = Date.now();
  let seq = 0;
  const nextId = () => `m_${now.toString(36)}_G${(seq++).toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const before = await loadGraph(userId).catch(() => null);
  if (!before) return NextResponse.json({ error: 'Memory is not reachable just now.' }, { status: 503 });
  const added = addGoal(before, project.nodeId, text, { now, nextId });
  if (!added) return NextResponse.json({ error: 'Could not add that goal.' }, { status: 400 });

  const saved = await persistGraph(userId, before, added.graph);
  if (!saved.ok) return NextResponse.json({ error: 'Could not add that goal.' }, { status: 500 });
  return NextResponse.json({ ok: true, id: added.nodeId, reused: added.reused });
}
