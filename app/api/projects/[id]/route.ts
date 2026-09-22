// app/api/projects/[id]/route.ts
// GET    → one Project: its goals, conversations, files, and how much memory
//          is connected to it
// PATCH  → rename, describe, instruct, archive or restore
// DELETE → delete the Project { files: 'keep' | 'delete' }
//
// DELETE is the one to read carefully. It removes the workspace, and never
// the memories: see planDeletion in lib/mind/projects.ts for the four things
// "delete a Project" could mean and why only three of them happen here.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import {
  MindStoreError, deleteProjectRow, detachFromProject, getProject, listProjectConversations,
  listProjects, listSources, loadGraph, persistGraph, updateProject,
} from '@/lib/mind/store';
import {
  MAX_PROJECT_DESCRIPTION, MAX_PROJECT_INSTRUCTIONS, cleanProjectName, planDeletion,
  projectGoals, projectIndex, syncAnchor, type ProjectContainer,
} from '@/lib/mind/projects';
import { clip, normalize } from '@/lib/mind/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/** The Project, if it is this person's. Anybody else's id reads as absent. */
async function owned(userId: string, id: string): Promise<ProjectContainer | NextResponse> {
  try {
    const p = await getProject(userId, id);
    return p ?? NextResponse.json({ error: 'No such Project.' }, { status: 404 });
  } catch (e) {
    if (e instanceof MindStoreError) {
      return NextResponse.json({ error: 'Projects are not set up on this deployment yet.' }, { status: 503 });
    }
    throw e;
  }
}

export async function GET(req: NextRequest, { params }: Ctx) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const project = await owned(userId, params.id);
  if (project instanceof NextResponse) return project;

  const [graph, conversations, files] = await Promise.all([
    loadGraph(userId).catch(() => null),
    listProjectConversations(userId, project.id).catch(() => []),
    listSources(userId, { projectId: project.id }).catch(() => []),
  ]);

  const goals = graph ? projectGoals(graph, project.nodeId) : [];
  // How much of their memory is connected here — a count, not a list. The
  // graph itself is on the Memory page; this page is a workspace.
  const connected = graph
    ? [...projectIndex(graph, new Set([project.nodeId]))].filter(([, a]) => a.has(project.nodeId)).length
    : 0;

  return NextResponse.json({
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      instructions: project.instructions,
      archived: project.archived,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
    goals: goals.map((g) => ({ id: g.id, label: g.label, content: g.content, status: g.status })),
    conversations,
    files: files.map((f) => ({ id: f.id, name: f.name, bytes: f.bytes, createdAt: f.createdAt })),
    connected,
  });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const project = await owned(userId, params.id);
  if (project instanceof NextResponse) return project;

  const body = await req.json().catch(() => null);
  const patch: { name?: string; description?: string; instructions?: string; archived?: boolean } = {};
  if (body?.name !== undefined) {
    const name = cleanProjectName(body.name);
    if (!name) return NextResponse.json({ error: 'A Project needs a name.' }, { status: 400 });
    if (normalize(name) !== normalize(project.name)) {
      const all = await listProjects(userId);
      if (all.some((p) => p.id !== project.id && normalize(p.name) === normalize(name))) {
        return NextResponse.json({ error: `You already have a Project called “${name}”.` }, { status: 409 });
      }
    }
    patch.name = name;
  }
  if (typeof body?.description === 'string') patch.description = clip(body.description.trim(), MAX_PROJECT_DESCRIPTION);
  if (typeof body?.instructions === 'string') patch.instructions = clip(body.instructions.trim(), MAX_PROJECT_INSTRUCTIONS);
  if (typeof body?.archived === 'boolean') patch.archived = body.archived;
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });

  const now = Date.now();

  // The anchor follows its container: the node's name is the Project's name
  // (the old one kept as an alias, so a conversation using it still arrives
  // here), and an archived Project's node fades from retrieval without being
  // removed. Instructions are workspace configuration and stay off the node.
  if (patch.name !== undefined || patch.description !== undefined || patch.archived !== undefined) {
    const before = await loadGraph(userId).catch(() => null);
    if (before && before.nodes.some((n) => n.id === project.nodeId)) {
      const after = syncAnchor(before, project.nodeId, {
        name: patch.name,
        description: patch.description,
        status: patch.archived === undefined ? undefined : patch.archived ? 'archived' : 'active',
      }, now);
      const saved = await persistGraph(userId, before, after);
      if (!saved.ok) return NextResponse.json({ error: 'Could not save that.' }, { status: 500 });
    }
  }

  const ok = await updateProject(userId, project.id, { ...patch, updatedAt: now });
  if (!ok) return NextResponse.json({ error: 'Could not save that.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const project = await owned(userId, params.id);
  if (project instanceof NextResponse) return project;

  const body = await req.json().catch(() => null);
  // Keeping is the default. Deleting stored text is the one irreversible
  // part of this, so it has to be asked for.
  const files: 'keep' | 'delete' = body?.files === 'delete' ? 'delete' : 'keep';
  const now = Date.now();

  // In an order that is safe to retry at every step. If the graph cannot be
  // written, nothing has changed. If the conversations cannot be detached,
  // the container is still there to try again from. The container goes last,
  // because while it exists the person can still see what is left to do.
  const before = await loadGraph(userId).catch(() => null);
  if (!before) return NextResponse.json({ error: 'Memory is not reachable just now.' }, { status: 503 });
  const plan = planDeletion(before, project.nodeId, now);
  const saved = await persistGraph(userId, before, plan.graph);
  if (!saved.ok) return NextResponse.json({ error: 'Could not delete that Project.' }, { status: 500 });

  const detached = await detachFromProject(userId, project.id, files);
  if (!detached.ok) return NextResponse.json({ error: 'Could not delete that Project.' }, { status: 500 });

  if (!(await deleteProjectRow(userId, project.id))) {
    return NextResponse.json({ error: 'Could not delete that Project.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    conversationsMoved: detached.conversations,
    files: detached.files,
    filesDeleted: files === 'delete',
    memoriesKept: plan.memoriesKept,
  });
}
