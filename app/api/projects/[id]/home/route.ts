// app/api/projects/[id]/home/route.ts
// GET → everything Project Home draws, in one read: the Project, its goals and
//       files, every conversation in it with what its map holds, the part of
//       the Mind graph tied to it (as an atlas), and the overview, visual,
//       continue-working pick and resources computed from those
//       (lib/project-home.ts).
//
// Owner or collaborator, through one gate (lib/project-access.ts). What a
// collaborator receives is the Project's own content and nothing of the
// owner: no memories beyond the goals set on the Project (projectGraph), no
// conversation outside it, and never an email address.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { listProjectChats, listSources, loadGraph, MindStoreError } from '@/lib/mind/store';
import { atlasMapOf, buildAtlas, projectGraph } from '@/lib/mind/atlas';
import { buildHome, type HomeChat, type HomeGoal } from '@/lib/project-home';
import { projectAccess } from '@/lib/project-access';
import type { MindGraph } from '@/lib/mind/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/** Goals and plans tied to the anchor — open ones, and the ones the person marked done. */
function goalsOf(graph: MindGraph, anchorId: string): HomeGoal[] {
  const tied = new Set<string>();
  for (const e of graph.edges) {
    if (e.sourceId === anchorId) tied.add(e.targetId);
    if (e.targetId === anchorId) tied.add(e.sourceId);
  }
  return graph.nodes
    .filter((n) => tied.has(n.id) && (n.type === 'Goal' || n.type === 'Plan') && !n.private)
    .filter((n) => ['active', 'tentative', 'uncertain', 'historical'].includes(n.status))
    .sort((a, b) => Number(a.status === 'historical') - Number(b.status === 'historical') || b.importance - a.importance)
    .map((n) => ({ id: n.id, label: n.label, content: n.content, status: n.status }));
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  let access;
  try {
    access = await projectAccess(userId, params.id);
  } catch (e) {
    if (e instanceof MindStoreError) return NextResponse.json({ error: 'Projects are not set up on this deployment yet.' }, { status: 503 });
    throw e;
  }
  if (!access) return NextResponse.json({ error: 'No such Project.' }, { status: 404 });
  const { project, ownerId, role } = access;
  const personal = role === 'owner';

  const [graph, rawChats, files] = await Promise.all([
    loadGraph(ownerId).catch(() => ({ nodes: [], edges: [], tombstones: [], pending: [] }) as MindGraph),
    listProjectChats(ownerId, project.id).catch(() => []),
    listSources(ownerId, { projectId: project.id }).catch(() => []),
  ]);
  const chats: HomeChat[] = rawChats.map((c) => ({ ...c, map: atlasMapOf(c.map) }));
  const goals = goalsOf(graph, project.nodeId);
  const now = Date.now();
  const atlas = buildAtlas({
    graph: projectGraph(graph, project.nodeId, personal),
    chats: chats.map((c) => ({ id: c.id, title: c.title, kind: c.kind, projectId: project.id, updatedAt: c.updatedAt, map: c.map })),
    projects: [{ id: project.id, nodeId: project.nodeId, name: project.name }],
    scope: 'all',
  });
  const home = buildHome({ chats, goals, files: files.map((f) => ({ id: f.id, name: f.name, bytes: f.bytes, createdAt: f.createdAt })), createdAt: project.createdAt }, now);

  return NextResponse.json({
    role,
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      // instructions are the owner's working notes to Socria
      ...(personal ? { instructions: project.instructions } : {}),
      icon: project.icon ?? null,
      color: project.color ?? null,
      archived: project.archived,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      anchor: atlas.nodes.find((n) => n.kind === 'project')?.id ?? null,
    },
    goals,
    files: files.map((f) => ({ id: f.id, name: f.name, bytes: f.bytes, createdAt: f.createdAt })),
    chats: chats.map((c) => ({
      id: c.id,
      title: c.title,
      kind: c.kind,
      updatedAt: c.updatedAt,
      createdAt: c.createdAt,
      nodes: c.map?.nodes?.length ?? 0,
      hasDraft: !!c.hasDraft,
      plot: !!c.map?.viz,
      models: c.map?.models?.docs?.length ?? 0,
    })),
    atlas,
    home,
  });
}
