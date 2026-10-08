import 'server-only';
// lib/project-access.ts
//
// WHO MAY OPEN A PROJECT, AND AS WHAT. One gate every Project Home route goes
// through, so the answer is given in one place and enforced on the server.
//
// A Project belongs to the person who made it (mind_projects is keyed by
// user_id). Anybody else reads its id as absent — the same 404 a wrong id
// gets, so a guess learns nothing. Sharing (lib/share/) extends this gate;
// it never loosens the owner-scoped reads underneath it.

import { getProject } from '@/lib/mind/store';
import type { ProjectContainer } from '@/lib/mind/projects';
import type { Role } from '@/lib/share/roles';
import { shareAccess } from '@/lib/share/server';

export interface ProjectAccess {
  project: ProjectContainer;
  /** whose rows these are: the owner's id, for every read underneath */
  ownerId: string;
  role: Role;
}

export async function projectAccess(userId: string, projectId: string): Promise<ProjectAccess | null> {
  const own = await getProject(userId, projectId);
  if (own) return { project: own, ownerId: userId, role: 'owner' };
  const shared = await shareAccess(userId, 'project', projectId).catch(() => null);
  if (!shared) return null;
  const project = await getProject(shared.ownerId, projectId).catch(() => null);
  return project ? { project, ownerId: shared.ownerId, role: shared.role } : null;
}
