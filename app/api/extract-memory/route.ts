// app/api/extract-memory/route.ts
// POST /api/extract-memory
// Body: { messages: [{role, content}, ...], currentMemory: ConversationMemory }
// Returns: { memory: ConversationMemory }
//
// Uses a cheap model (gpt-4o-mini regardless of the user's chat model) to
// distill the most recent exchange into an updated thread memory. Only
// signed-in users can hit this route; anon users don't have Core 3 access
// so they don't need memory extraction either.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import OpenAI from 'openai';
import {
  EMPTY_MEMORY,
  buildMemoryExtractorPrompt,
  sanitizeMemory,
  sanitizeSuggestedTitle,
} from '@/lib/socria-prompt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_MESSAGES_CONSIDERED = 8;

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) {
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
  const currentMemory = sanitizeMemory(body?.currentMemory ?? EMPTY_MEMORY);

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ memory: currentMemory });
  }

  const validMessages = messages.filter(
    (m: any) =>
      m &&
      (m.role === 'user' || m.role === 'assistant') &&
      typeof m.content === 'string'
  );
  const userTurnCount = validMessages.filter(
    (m: any) => m.role === 'user'
  ).length;

  // Format the most recent turns for the extractor.
  const recent = validMessages
    .slice(-MAX_MESSAGES_CONSIDERED)
    .map(
      (m: any) =>
        `${m.role === 'user' ? 'User' : 'Socria'}: ${m.content}`
    )
    .join('\n\n');

  try {
    const openai = new OpenAI({ apiKey });
    const extractorPrompt = buildMemoryExtractorPrompt(
      currentMemory,
      recent,
      userTurnCount
    );
    const extractorModel = process.env.OPENAI_MEMORY_MODEL || 'gpt-4o-mini';

    const completion = await openai.chat.completions.create({
      model: extractorModel,
      messages: [{ role: 'system', content: extractorPrompt }],
      temperature: 0.2,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices?.[0]?.message?.content || '{}';
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = currentMemory;
    }
    const extracted = sanitizeMemory(parsed);
    // Preserve insight state — the extractor never touches it.
    const memory: typeof extracted = {
      ...extracted,
      latestInsight: currentMemory.latestInsight ?? null,
      lastInsightAtTurn: currentMemory.lastInsightAtTurn ?? 0,
    };
    const suggestedTitle = sanitizeSuggestedTitle(parsed?.suggestedTitle);

    return NextResponse.json({ memory, suggestedTitle });
  } catch (e: any) {
    console.error('extract-memory error:', e);
    // Fail soft: return the current memory rather than 500'ing. Losing an
    // extraction is fine; blocking the flow isn't.
    return NextResponse.json({ memory: currentMemory, suggestedTitle: null });
  }
}
