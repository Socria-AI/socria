// app/api/generate-insight/route.ts
// POST /api/generate-insight
// Body: { messages: [...], memory: ConversationMemory }
// Returns: { insight: Insight | null }
//
// Called by the client when a Core 3 conversation reaches a meaningful
// depth threshold. Uses gpt-4o-mini in JSON mode with a strict prompt
// that produces exactly one insight — the single most meaningful
// realization / tension / shift / pattern that emerged. Not a summary.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import OpenAI from 'openai';
import {
  EMPTY_MEMORY,
  INSIGHT_HEADER_LABELS,
  buildInsightPrompt,
  sanitizeMemory,
  isValidAccessKey,
  type Insight,
} from '@/lib/socria-prompt';
import { enforceRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_MESSAGES = 30;

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
    return NextResponse.json(
      { error: 'OpenAI key not configured on server' },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  const messages = body?.messages;
  const memory = sanitizeMemory(body?.memory ?? EMPTY_MEMORY);
  const atTurn: number =
    typeof body?.atTurn === 'number' ? body.atTurn : 0;

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ insight: null });
  }

  const valid = messages.filter(
    (m: any) =>
      m &&
      (m.role === 'user' || m.role === 'assistant') &&
      typeof m.content === 'string'
  );

  const exchange = valid
    .slice(-MAX_MESSAGES)
    .map(
      (m: any) => `${m.role === 'user' ? 'User' : 'Socria'}: ${m.content}`
    )
    .join('\n\n');

  try {
    const openai = new OpenAI({ apiKey });
    const prompt = buildInsightPrompt(memory, exchange);
    const insightModel =
      process.env.OPENAI_INSIGHT_MODEL || 'gpt-4o-mini';

    const completion = await openai.chat.completions.create({
      model: insightModel,
      messages: [{ role: 'system', content: prompt }],
      temperature: 0.4,
      max_tokens: 400,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices?.[0]?.message?.content || '{}';
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ insight: null });
    }

    const text = typeof parsed?.text === 'string' ? parsed.text.trim() : '';
    if (!text) {
      return NextResponse.json({ insight: null });
    }

    const rawLabel =
      typeof parsed?.headerLabel === 'string'
        ? parsed.headerLabel.trim()
        : '';
    const headerLabel = (INSIGHT_HEADER_LABELS as readonly string[]).includes(
      rawLabel
    )
      ? rawLabel
      : INSIGHT_HEADER_LABELS[0];

    const insight: Insight = {
      id: `ins_${Math.random().toString(36).slice(2, 12)}`,
      headerLabel,
      text,
      generatedAt: Date.now(),
      atTurn,
    };

    return NextResponse.json({ insight });
  } catch (e: any) {
    console.error('generate-insight error:', e);
    return NextResponse.json({ insight: null });
  }
}
