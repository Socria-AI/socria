// app/api/logos/explore/route.ts
// POST /api/logos/explore → { explore } for one action on one node.
//
// Four modes, one pipeline. Explore and Research look the idea up on the web;
// Challenge and Trace work purely from the person's own reasoning. None of
// them are allowed to hand back a verdict — see lib/logos-explore.ts.

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { auth } from '@clerk/nextjs/server';
import {
  LOGOS_MODEL,
  LOGOS_FALLBACK_MODEL,
  NODE_TYPES,
  describeLineage,
  sanitizeMap,
} from '@/lib/logos';
import { renderMessageForModel, sanitizeAttachments } from '@/lib/logos-attachments';
import { renderContextsForNode, sanitizeNodeContextList } from '@/lib/logos-sources';
import { guidanceBlock, resolveDepth, resolveGuard } from '@/lib/logos-guidance';
import { styleBlock } from '@/lib/logos-style';
import { personalityBlock } from '@/lib/logos-personality';
import { isValidAccessKey } from '@/lib/socria-prompt';
import { depthForPlan } from '@/lib/socria-one';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { boundaryNote, type Counter } from '@/lib/entitlements';
import { spend } from '@/lib/usage';
import { enforceRateLimit } from '@/lib/rate-limit';
import {
  MODE_META,
  NODE_MODES,
  buildChallengePrompt,
  buildExplorePrompt,
  buildQueryPrompt,
  buildResearchPrompt,
  buildTracePrompt,
  runSearch,
  sanitizeExplore,
  searchConfigured,
  type NodeMode,
} from '@/lib/logos-explore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_HISTORY = 12;
// Trace looks further back than the others — the point is finding where an
// idea entered, which is usually not in the last handful of messages.
const MAX_TRACE_HISTORY = 30;

type Turn = { role: 'user' | 'assistant'; content: string };

export async function POST(req: NextRequest) {
  const { userId } = auth();
  const keyUnlocked = isValidAccessKey(req.headers.get('x-socria-key'));
  if (!userId && !keyUnlocked) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OpenAI key not configured' }, { status: 500 });
  }

  const body = await req.json().catch(() => null);
  const label =
    typeof body?.label === 'string' ? body.label.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
  const type = NODE_TYPES.includes(body?.type) ? body.type : 'idea';
  const mode: NodeMode = NODE_MODES.includes(body?.mode) ? body.mode : 'explore';
  if (!label) {
    return NextResponse.json({ error: 'label required' }, { status: 400 });
  }

  const plan = await resolvePlanForRequest(req, userId);

  // Every node action a free reader gets to TRY once, per line of thinking —
  // Explore, Challenge and Research — and then meets a boundary. Trace is
  // never metered at any tier: seeing where your own thought came from is not
  // a paid feature, and neither is correcting it.
  //
  // The count comes from the usage store, not from the request. This route
  // used to read `body.researchUsed`, which meant a client posting a zero
  // bought itself unlimited Research.
  if (mode !== 'trace') {
    const counter = mode as Counter;
    const chatId = typeof body?.sessionId === 'string' ? body.sessionId : null;
    const allowance = await spend(userId, plan, counter, chatId);
    if (!allowance.ok) {
      return NextResponse.json(
        {
          error: boundaryNote(counter),
          upgrade: counter,
          used: allowance.used,
          limit: allowance.limit,
        },
        { status: 402 }
      );
    }
  }

  const window = mode === 'trace' ? MAX_TRACE_HISTORY : MAX_HISTORY;
  const turns: Turn[] = (Array.isArray(body?.messages) ? body.messages : [])
    .filter(
      (m: any) =>
        m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
    )
    .slice(-window)
    .map((m: any) => ({
      role: m.role,
      // Attachments flattened in, so a node drawn from a pasted page can still
      // be traced back to the words that produced it.
      content: renderMessageForModel({
        role: m.role,
        content: m.content,
        attachments: sanitizeAttachments(m.attachments),
      }).slice(0, 700),
    }))
    .filter((m: Turn) => m.content.trim());

  const conversation = turns
    .map((m) => `${m.role === 'user' ? 'User' : 'Logos'}: ${m.content}`)
    .join('\n');
  // Trace picks moments by number, so it needs the same numbering we hold.
  const indexed = turns
    .map((m, i) => `[${i}] ${m.role === 'user' ? 'User' : 'Logos'}: ${m.content}`)
    .join('\n');

  // Material the person attached to this node — context, not authority.
  const nodeContexts = sanitizeNodeContextList(body?.contexts);
  const grounded = nodeContexts.length ? renderContextsForNode(nodeContexts) : '';

  const openai = new OpenAI({ apiKey });
  const configured = process.env.OPENAI_MODEL_LOGOS || LOGOS_MODEL;

  const complete = async (system: string, user: string, maxTokens: number) => {
    const make = (model: string) =>
      openai.chat.completions.create({
        model,
        temperature: 0.4,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });
    try {
      return await make(configured);
    } catch (e: any) {
      const status = e?.status ?? e?.response?.status;
      const isModelError =
        status === 404 || /model|not found|does not exist|unknown/i.test(e?.message || '');
      if (isModelError && configured !== LOGOS_FALLBACK_MODEL) return make(LOGOS_FALLBACK_MODEL);
      throw e;
    }
  };

  try {
    let concept = label;
    let search = { results: [], images: [], provider: null } as Awaited<
      ReturnType<typeof runSearch>
    >;

    // 1. Only the modes that look outward pay for a query + a search.
    if (MODE_META[mode].searches) {
      let query = label;
      try {
        const q = await complete(
          buildQueryPrompt(mode),
          `${type}: "${label}"\n\nContext:\n${conversation || '(none)'}`,
          160
        );
        const parsed = JSON.parse(q.choices?.[0]?.message?.content || '{}');
        if (typeof parsed?.query === 'string' && parsed.query.trim()) query = parsed.query.trim();
        if (typeof parsed?.concept === 'string' && parsed.concept.trim())
          concept = parsed.concept.trim();
      } catch {
        // Fall back to searching the raw label.
      }
      search = await runSearch(query);
    }

    // 2. Compose the panel for this mode.
    const convoOrNone = conversation || '(no conversation yet)';
    let system: string;
    if (mode === 'challenge') {
      system = buildChallengePrompt(label, type, convoOrNone, grounded);
    } else if (mode === 'trace') {
      const lineage = describeLineage(sanitizeMap(body?.map), String(body?.nodeId ?? ''))
        .map((l) => `  - ${l}`)
        .join('\n');
      system = buildTracePrompt(label, type, indexed || '(no conversation yet)', lineage, grounded);
    } else if (mode === 'research') {
      system = buildResearchPrompt(label, type, convoOrNone, concept, search.results, grounded);
    } else {
      system = buildExplorePrompt(label, type, convoOrNone, concept, search.results, grounded);
    }

    const guided =
      system +
      guidanceBlock(
        depthForPlan(resolveDepth(body?.depth), plan),
        resolveGuard(body?.guard),
        'surface'
      ) +
      personalityBlock(body?.persona) +
      styleBlock(body?.style);
    const composed = await complete(guided, 'Compose the panel.', 700);
    const parsed = JSON.parse(composed.choices?.[0]?.message?.content || '{}');
    const explore = sanitizeExplore(parsed, search, concept, mode, turns);
    if (!explore) {
      return NextResponse.json({ error: 'Could not compose' }, { status: 502 });
    }

    return NextResponse.json({
      explore,
      searchAvailable: MODE_META[mode].searches ? searchConfigured() : true,
    });
  } catch (e) {
    console.error('logos explore error:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
