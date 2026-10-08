import 'server-only';
// lib/share/turn.ts
//
// ONE QUESTION BOTH CHAT ROUTES ASK BEFORE A TURN: is this conversation
// shared, and if so, what changes?
//
//   PERSONAL MEMORY GOES QUIET. In a conversation more than one person can
//   read, nobody's Mind graph is recalled into the reply and nothing is
//   remembered from it — a reply is something the others will see, and it
//   must not carry what Socria knows about any one of them. This holds for the
//   owner too: their own shared chat does not surface their memories to their
//   guests.
//
//   THE PROJECT'S CONTEXT STAYS. Its name, description, goals and file names
//   are the Project's own, and are what makes a shared Project useful.
//
//   A GUEST NEEDS `ask`. Viewers and commenters read; only an editor (or the
//   owner) can send Socria a turn. Checked here, on the server.
//
//   A FREE GUEST IS COUNTED. Joining is free; their turns inside someone
//   else's space are capped per day (FREE_GUEST_TURNS_PER_DAY), so a host's
//   plan is never what a guest spends.

import { supabaseAdmin } from '@/lib/supabase';
import { getProject, listSources, loadGraph } from '@/lib/mind/store';
import { renderProjectContext } from '@/lib/mind/projects';
import { FREE_GUEST_TURNS_PER_DAY, can, type Role } from './roles';
import { isShared, resourceInfo, shareAccess } from './server';

export interface SharedTurn {
  /** more than one person can read this conversation */
  shared: boolean;
  /** the caller is not its owner */
  guest: boolean;
  role: Role | null;
  ownerId: string | null;
  /** the Project frame for a shared conversation in a Project, '' otherwise */
  projectBlock: string;
  refuse?: { status: number; error: string; upgrade?: string };
}

const NONE: SharedTurn = { shared: false, guest: false, role: null, ownerId: null, projectBlock: '' };

export async function sharedTurn(userId: string | null, conversationId: unknown, plan: 'free' | 'one' | string): Promise<SharedTurn> {
  const id = typeof conversationId === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(conversationId) ? conversationId : null;
  if (!userId || !id) return NONE;
  let info;
  try {
    info = await resourceInfo('conversation', id);
  } catch {
    return NONE;
  }
  // Not saved yet: a new conversation, and it is theirs.
  if (!info) return NONE;
  const guest = info.ownerId !== userId;
  let role: Role | null = guest ? null : 'owner';
  if (guest) {
    const access = await shareAccess(userId, 'conversation', id).catch(() => null);
    if (!access) return { ...NONE, refuse: { status: 404, error: 'No such conversation.' } };
    role = access.role;
    if (!can(role, 'ask')) return { ...NONE, role, refuse: { status: 403, error: 'You can read this conversation, but not add to it.' } };
  }
  const shared = guest || (await isShared('conversation', id).catch(() => false));
  if (!shared) return { ...NONE, role };

  if (guest && plan !== 'one') {
    const day = new Date().toISOString().slice(0, 10);
    const { data } = await supabaseAdmin().rpc('bump_logos_usage', {
      p_user: userId, p_scope: `guest:${day}`, p_counter: 'turns', p_by: 1, p_at: Date.now(),
    });
    if (typeof data === 'number' && data > FREE_GUEST_TURNS_PER_DAY) {
      return {
        ...NONE, shared, guest, role, ownerId: info.ownerId,
        refuse: {
          status: 402,
          error: `That is today's ${FREE_GUEST_TURNS_PER_DAY} turns in other people's shared spaces. You can still read and comment, and Socria One lifts the limit.`,
          upgrade: 'chats',
        },
      };
    }
  }

  let projectBlock = '';
  if (info.projectId) {
    try {
      const project = await getProject(info.ownerId, info.projectId);
      if (project) {
        const [graph, files] = await Promise.all([
          loadGraph(info.ownerId).catch(() => null),
          listSources(info.ownerId, { projectId: project.id }).catch(() => []),
        ]);
        const tied = new Set<string>();
        for (const e of graph?.edges ?? []) {
          if (e.sourceId === project.nodeId) tied.add(e.targetId);
          if (e.targetId === project.nodeId) tied.add(e.sourceId);
        }
        // the Project's goals and nothing else of the owner's graph
        const goals = (graph?.nodes ?? []).filter(
          (n) => tied.has(n.id) && (n.type === 'Goal' || n.type === 'Plan') && !n.private && ['active', 'tentative', 'uncertain'].includes(n.status)
        );
        // instructions are the owner's notes to Socria: theirs to use, not a guest's to steer by
        projectBlock = renderProjectContext(guest ? { ...project, instructions: '' } : project, goals, files);
      }
    } catch {
      projectBlock = '';
    }
  }
  return { shared, guest, role, ownerId: info.ownerId, projectBlock };
}
