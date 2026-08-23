// app/api/logos/draft/route.ts
// POST /api/logos/draft → { result } for one action on a selected passage.
//
// Five actions over the person's own writing. None of them write into the
// draft; the response is something to read, and Refine's proposal only lands
// on the page if the person applies it themselves.

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { auth } from '@clerk/nextjs/server';
import { LOGOS_MODEL, LOGOS_FALLBACK_MODEL, sanitizeMap } from '@/lib/logos';
import {
  DRAFT_ACTIONS,
  DRAFT_ACTION_META,
  MAX_SELECTION,
  buildDraftPrompt,
  sanitizeDraftResponse,
  type DraftAction,
} from '@/lib/logos-draft';
import { guidanceBlock, resolveDepth, resolveGuard } from '@/lib/logos-guidance';
import { styleBlock } from '@/lib/logos-style';
import { buildQueryPrompt, runSearch } from '@/lib/logos-explore';
import { isValidAccessKey } from '@/lib/socria-prompt';
import { enforceRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_AROUND = 2_500;

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
  const action: DraftAction = DRAFT_ACTIONS.includes(body?.action) ? body.action : 'clarify';
  const selection =
    typeof body?.selection === 'string' ? body.selection.trim().slice(0, MAX_SELECTION) : '';
  const around =
    typeof body?.around === 'string' ? body.around.trim().slice(0, MAX_AROUND) : '';
  if (!selection) {
    return NextResponse.json({ error: 'Select some text first.' }, { status: 400 });
  }
  const map = sanitizeMap(body?.map);

  const openai = new OpenAI({ apiKey });
  const configured = process.env.OPENAI_MODEL_LOGOS || LOGOS_MODEL;

  const complete = async (system: string, user: string, maxTokens: number) => {
    const make = (model: string) =>
      openai.chat.completions.create({
        model,
        // Refine has to stay close to what they wrote; the others are allowed
        // a little more room to notice things.
        temperature: action === 'refine' ? 0.25 : 0.45,
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
    let search = { results: [], images: [], provider: null } as Awaited<
      ReturnType<typeof runSearch>
    >;

    if (DRAFT_ACTION_META[action].searches) {
      let query = selection.slice(0, 300);
      try {
        const q = await complete(
          buildQueryPrompt('research'),
          `A claim from someone's draft: "${selection.slice(0, 600)}"`,
          160
        );
        const parsed = JSON.parse(q.choices?.[0]?.message?.content || '{}');
        if (typeof parsed?.query === 'string' && parsed.query.trim()) query = parsed.query.trim();
      } catch {
        // Fall back to searching the passage itself.
      }
      search = await runSearch(query);
    }

    const guide =
      guidanceBlock(resolveDepth(body?.depth), resolveGuard(body?.guard), 'surface') +
      styleBlock(body?.style);
    const composed = await complete(
      buildDraftPrompt(action, selection, around, map, search.results) + guide,
      'Respond.',
      action === 'refine' ? 1400 : 800
    );
    const parsed = JSON.parse(composed.choices?.[0]?.message?.content || '{}');
    const result = sanitizeDraftResponse(
      parsed,
      action,
      map,
      search.results.slice(0, 5).map((s) => ({ title: s.title, url: s.url, site: s.site }))
    );
    if (!result) {
      return NextResponse.json({ error: 'Could not work with that passage.' }, { status: 502 });
    }
    return NextResponse.json({ result });
  } catch (e) {
    console.error('logos draft error:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
