// app/api/mind/atlas/route.ts
// GET → everything Socria remembers, connected: the Mind graph joined to every
//       chat, every Thinking Map, every plot, model, object and Project
//       (lib/mind/atlas.ts).
//       ?scope=logos leaves out every private memory AND every chat that made
//       one — for a surface whose maps can be exported as images.
//
// Built here, on the server, for the same reason /api/mind?scope=logos is:
// a filter the browser applies is a filter that has already been sent.
//
// READ-ONLY. The atlas is a projection; nothing it shows is written back.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase';
import { listProjects, loadGraph, MindStoreError } from '@/lib/mind/store';
import { atlasMapOf, buildAtlas, MAX_CHATS, type AtlasChat } from '@/lib/mind/atlas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A column this database does not have yet — the same test the conversations route uses. */
const missingColumn = (e: { code?: string; message?: string }) =>
  e.code === '42703' || e.code === 'PGRST204' || /column .* does not exist/i.test(e.message ?? '');

/**
 * The person's chats, newest first, with each Logos chat's map.
 *
 * Messages are NOT read: the atlas needs what each chat is called, where it is
 * filed and what its map holds — never what was said in it.
 */
async function loadChats(userId: string): Promise<AtlasChat[]> {
  const db = supabaseAdmin();
  const tries = [
    'id, title, kind, map, project_id, updated_at',
    'id, title, kind, map, updated_at',
    'id, title, updated_at',
  ];
  for (const cols of tries) {
    const { data, error } = await db
      .from('conversations')
      .select(cols)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(MAX_CHATS + 50);
    if (error) {
      if (missingColumn(error)) continue;
      throw error;
    }
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
      const logos = r.kind === 'logos';
      return {
        id: String(r.id),
        title: typeof r.title === 'string' ? r.title : '',
        kind: logos ? 'logos' : 'chat',
        projectId: typeof r.project_id === 'string' ? r.project_id : null,
        updatedAt: Number(r.updated_at) || 0,
        // Only what the atlas reads, bounded and typed (lib/mind/atlas.ts).
        map: logos ? atlasMapOf(r.map) : null,
      } satisfies AtlasChat;
    });
  }
  return [];
}

export async function GET(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const scope = req.nextUrl.searchParams.get('scope') === 'logos' ? 'logos' : 'all';

  let graph;
  try {
    graph = await loadGraph(userId);
  } catch (e) {
    // No memory tables yet is not "no memories": the chats can still be drawn.
    if (!(e instanceof MindStoreError)) throw e;
    graph = { nodes: [], edges: [], tombstones: [], pending: [] };
  }
  const [chats, projects] = await Promise.all([
    loadChats(userId).catch((e) => {
      console.error('[mind/atlas] chats could not be read', e);
      return [] as AtlasChat[];
    }),
    listProjects(userId).catch(() => []),
  ]);

  const atlas = buildAtlas({
    graph,
    chats,
    projects: projects.map((p) => ({ id: p.id, nodeId: p.nodeId, name: p.name, archived: p.archived })),
    scope,
  });
  return NextResponse.json({ scope, ...atlas });
}
