// app/api/logos/explore/route.ts
// POST /api/logos/explore → { explore } for a single clicked node.
//
// Three steps: turn the node into a research query, search the web, then
// compose a framing + connection + question from what came back. Never a
// recommendation — see lib/logos-explore.ts for the rule.

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { auth } from '@clerk/nextjs/server';
import { LOGOS_MODEL, LOGOS_FALLBACK_MODEL, NODE_TYPES } from '@/lib/logos';
import { isValidAccessKey } from '@/lib/socria-prompt';
import { enforceRateLimit } from '@/lib/rate-limit';
import {
  buildExplorePrompt,
  buildQueryPrompt,
  runSearch,
  sanitizeExplore,
  searchConfigured,
} from '@/lib/logos-explore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_HISTORY = 12;

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
  if (!label) {
    return NextResponse.json({ error: 'label required' }, { status: 400 });
  }

  const conversation = (Array.isArray(body?.messages) ? body.messages : [])
    .filter(
      (m: any) =>
        m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
    )
    .slice(-MAX_HISTORY)
    .map((m: any) => `${m.role === 'user' ? 'Thinker' : 'Logos'}: ${m.content.slice(0, 500)}`)
    .join('\n');

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
    // 1. What should we actually look up?
    let query = label;
    let concept = label;
    try {
      const q = await complete(
        buildQueryPrompt(),
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

    // 2. Look it up (no-op when no provider is configured).
    const search = await runSearch(query);

    // 3. Compose the lens.
    const composed = await complete(
      buildExplorePrompt(label, type, conversation || '(no conversation yet)', concept, search.results),
      'Compose the panel.',
      600
    );
    const parsed = JSON.parse(composed.choices?.[0]?.message?.content || '{}');
    const explore = sanitizeExplore(parsed, search, concept);
    if (!explore) {
      return NextResponse.json({ error: 'Could not compose' }, { status: 502 });
    }

    return NextResponse.json({
      explore,
      searchAvailable: searchConfigured(),
    });
  } catch (e) {
    console.error('logos explore error:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
