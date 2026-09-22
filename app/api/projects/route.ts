// app/api/projects/route.ts
// GET  → every Project, with how many conversations and files each holds
// POST → create one { name, description? }
//
// A Project is a region of the one Mind Graph (lib/mind/projects.ts). This
// route manages the CONTAINER — the workspace row — and the one node that
// anchors it in the graph. It never copies a memory anywhere.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase';
import {
  MindStoreError, insertProject, listProjects, listSources, loadGraph, persistGraph,
} from '@/lib/mind/store';
import {
  MAX_PROJECTS, MAX_PROJECT_DESCRIPTION, cleanProjectName, createAnchor, type ProjectContainer,
} from '@/lib/mind/projects';
import { clip, normalize } from '@/lib/mind/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  let projects: ProjectContainer[];
  try {
    projects = await listProjects(userId);
  } catch (e) {
    // The same honesty as the Memory page: a missing table is a fault of the
    // deployment, not an empty list, and the page says which.
    if (e instanceof MindStoreError) {
      return NextResponse.json({ projects: [], storage: { ok: false, reason: e.reason } });
    }
    throw e;
  }

  // Counts in two reads, not one per Project.
  const [convos, files] = await Promise.all([
    supabaseAdmin().from('conversations').select('project_id').eq('user_id', userId).not('project_id', 'is', null),
    listSources(userId).catch(() => []),
  ]);
  const convoCount = new Map<string, number>();
  for (const r of (convos.data ?? []) as { project_id: string }[]) {
    convoCount.set(r.project_id, (convoCount.get(r.project_id) ?? 0) + 1);
  }
  const fileCount = new Map<string, number>();
  for (const f of files) if (f.projectId) fileCount.set(f.projectId, (fileCount.get(f.projectId) ?? 0) + 1);

  return NextResponse.json({
    storage: { ok: true },
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      archived: p.archived,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      conversations: convoCount.get(p.id) ?? 0,
      files: fileCount.get(p.id) ?? 0,
    })),
  });
}

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const name = cleanProjectName(body?.name);
  const description = typeof body?.description === 'string'
    ? clip(body.description.trim(), MAX_PROJECT_DESCRIPTION)
    : '';
  if (!name) return NextResponse.json({ error: 'A Project needs a name.' }, { status: 400 });

  let projects: ProjectContainer[];
  try {
    projects = await listProjects(userId);
  } catch (e) {
    if (e instanceof MindStoreError) {
      return NextResponse.json({ error: 'Projects are not set up on this deployment yet.' }, { status: 503 });
    }
    throw e;
  }
  if (projects.some((p) => normalize(p.name) === normalize(name))) {
    return NextResponse.json({ error: `You already have a Project called “${name}”.` }, { status: 409 });
  }
  if (projects.length >= MAX_PROJECTS) {
    return NextResponse.json({ error: `You can keep ${MAX_PROJECTS} Projects. Delete or merge one first.` }, { status: 409 });
  }

  const now = Date.now();
  let seq = 0;
  const nextId = () => `m_${now.toString(36)}_P${(seq++).toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  // The graph first, then the container. If the second write fails, what is
  // left behind is a Project node in the graph — which is true (they are
  // working on it) and which the next attempt adopts rather than duplicates.
  // The other order would leave a container pointing at a node that does
  // not exist.
  const before = await loadGraph(userId).catch(() => null);
  if (!before) return NextResponse.json({ error: 'Memory is not reachable just now.' }, { status: 503 });
  const anchors = new Set(projects.map((p) => p.nodeId));
  const { graph: after, nodeId, adopted } = createAnchor(before, name, description, anchors, { now, nextId });
  const saved = await persistGraph(userId, before, after);
  if (!saved.ok) return NextResponse.json({ error: 'Could not create that Project.' }, { status: 500 });

  const project: ProjectContainer = {
    id: `p_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    nodeId,
    name,
    description,
    instructions: '',
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
  if (!(await insertProject(userId, project))) {
    return NextResponse.json({ error: 'Could not create that Project.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    project: { id: project.id, name, description, archived: false, createdAt: now, updatedAt: now },
    // Said, because it is the one surprising thing: the Project already knew
    // things before it existed.
    adopted,
  });
}
