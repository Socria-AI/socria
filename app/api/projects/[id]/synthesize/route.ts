// app/api/projects/[id]/synthesize/route.ts
// POST → a reading of the whole Project: what is established, what is still
//        open, what pulls against what, and what could be better — each with
//        the conversations it was read from.
//
// READ-ONLY. Nothing here is written to the graph or to any conversation; a
// synthesis is Socria's reading, offered, and labelled as such. The model is
// given the Project's own structure (lib/project-home.ts synthesisDigest) —
// never a memory, never a conversation outside the Project — and its answer
// is held to the shape and to conversations that exist (sanitizeSynthesis).
// No model, or a model that fails: the reading the structure alone supports.

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { LOGOS_FALLBACK_MODEL, LOGOS_MODEL } from '@/lib/logos';
import { listProjectChats, listSources, loadGraph } from '@/lib/mind/store';
import { atlasMapOf } from '@/lib/mind/atlas';
import { sanitizeSynthesis, synthesisDigest, synthesizeFromStructure, type HomeChat, type HomeGoal } from '@/lib/project-home';
import { projectAccess } from '@/lib/project-access';
import type { MindGraph } from '@/lib/mind/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

const PROMPT = `You read a person's Project — the conversations inside it and the maps of their thinking — and say what it amounts to.

Return JSON: {"summary": string, "established": Item[], "unresolved": Item[], "contradictions": Item[], "improvements": Item[]}
where Item is {"text": string, "chats": string[]} and "chats" lists the ids (in square brackets in the input) of the conversations the item is read from.

Rules:
- "established": ideas the person has settled or returned to and supported. Only what the material shows — never treat a suggestion as a decision.
- "unresolved": questions still open.
- "contradictions": things that pull against each other, in their own material.
- "improvements": concrete ways the Project could be strengthened — gaps, untested assumptions, goals nothing has touched.
- Quote their own labels where you can. Do not invent progress, results or decisions. Do not mention anything not in the input.
- summary: two or three sentences, plain, in the second person.
- At most 6 items per list. Short items.`;

export async function POST(req: NextRequest, { params }: Ctx) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'chat');
  if (limited) return limited;

  const access = await projectAccess(userId, params.id).catch(() => null);
  if (!access) return NextResponse.json({ error: 'No such Project.' }, { status: 404 });
  const { project, ownerId } = access;

  const [graph, rawChats, files] = await Promise.all([
    loadGraph(ownerId).catch(() => ({ nodes: [], edges: [], tombstones: [], pending: [] }) as MindGraph),
    listProjectChats(ownerId, project.id).catch(() => []),
    listSources(ownerId, { projectId: project.id }).catch(() => []),
  ]);
  const chats: HomeChat[] = rawChats.map((c) => ({ ...c, map: atlasMapOf(c.map) }));
  const tied = new Set<string>();
  for (const e of graph.edges) {
    if (e.sourceId === project.nodeId) tied.add(e.targetId);
    if (e.targetId === project.nodeId) tied.add(e.sourceId);
  }
  const goals: HomeGoal[] = graph.nodes
    .filter((n) => tied.has(n.id) && (n.type === 'Goal' || n.type === 'Plan') && !n.private)
    .map((n) => ({ id: n.id, label: n.label, content: n.content, status: n.status }));
  const now = Date.now();
  const floor = synthesizeFromStructure(chats, goals, now);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !chats.length) return NextResponse.json({ synthesis: floor, at: now });

  const digest = synthesisDigest(
    { name: project.name, description: project.description },
    chats,
    goals,
    files.map((f) => ({ id: f.id, name: f.name, bytes: f.bytes, createdAt: f.createdAt }))
  );
  const openai = new OpenAI({ apiKey });
  const configured = process.env.OPENAI_MODEL_LOGOS || LOGOS_MODEL;
  const ask = (model: string) =>
    openai.chat.completions.create({
      model,
      messages: [{ role: 'system', content: PROMPT }, { role: 'user', content: digest }],
      temperature: 0.3,
      max_tokens: 1400,
      response_format: { type: 'json_object' },
    });
  try {
    let completion;
    try {
      completion = await ask(configured);
    } catch (e: any) {
      const status = e?.status ?? e?.response?.status;
      if ((status === 404 || /model/i.test(e?.message || '')) && configured !== LOGOS_FALLBACK_MODEL) completion = await ask(LOGOS_FALLBACK_MODEL);
      else throw e;
    }
    const raw = JSON.parse(completion.choices?.[0]?.message?.content || '{}');
    const read = sanitizeSynthesis(raw, new Set(chats.map((c) => c.id)));
    return NextResponse.json({ synthesis: read ?? floor, at: now });
  } catch (e) {
    console.error('[projects/synthesize] model reading failed; giving the structural one', e);
    return NextResponse.json({ synthesis: floor, at: now });
  }
}
