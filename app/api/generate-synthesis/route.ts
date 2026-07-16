// app/api/generate-synthesis/route.ts
// POST /api/generate-synthesis
// Body: { messages: [...], memory, depth, atTurn }
// Returns: { synthesis: SynthesisData | null }
//
// Called by the client on a depth-paced cadence to auto-generate a
// structured synthesis of the conversation so far. Signed-in Core 3 only.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import OpenAI from 'openai';
import {
  EMPTY_MEMORY,
  THINKING_DEPTHS,
  buildSynthesisPrompt,
  sanitizeMemory,
  sanitizeSynthesisData,
  isValidAccessKey,
  type ThinkingDepth,
} from '@/lib/socria-prompt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_MESSAGES = 40;

export async function POST(req: NextRequest) {
  const { userId } = auth();
  const keyUnlocked = isValidAccessKey(req.headers.get('x-socria-key'));
  if (!userId && !keyUnlocked) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
  const depth: ThinkingDepth =
    body?.depth === 'quick' ||
    body?.depth === 'deep' ||
    body?.depth === 'abstract'
      ? body.depth
      : 'balanced';
  const depthLabel =
    THINKING_DEPTHS.find((d) => d.id === depth)?.label || 'Balanced';

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ synthesis: null });
  }

  const exchange = messages
    .filter(
      (m: any) =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string'
    )
    .slice(-MAX_MESSAGES)
    .map((m: any) => `${m.role === 'user' ? 'User' : 'Socria'}: ${m.content}`)
    .join('\n\n');

  try {
    const openai = new OpenAI({ apiKey });
    const prompt = buildSynthesisPrompt(memory, exchange, depthLabel);
    const model = process.env.OPENAI_SYNTHESIS_MODEL || 'gpt-4o-mini';

    const completion = await openai.chat.completions.create({
      model,
      messages: [{ role: 'system', content: prompt }],
      temperature: 0.3,
      max_tokens: 700,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices?.[0]?.message?.content || '{}';
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ synthesis: null });
    }

    const synthesis = sanitizeSynthesisData(parsed);
    return NextResponse.json({ synthesis });
  } catch (e: any) {
    console.error('generate-synthesis error:', e);
    return NextResponse.json({ synthesis: null });
  }
}
