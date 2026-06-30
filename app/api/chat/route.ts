// app/api/chat/route.ts
// POST /api/chat
// Body: { messages: [{role, content}, ...] }
// Returns a streaming plain-text response.

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { auth } from '@clerk/nextjs/server';
import {
  buildSystemPrompt,
  resolveOpenAIModel,
  SOCRIA_MODELS,
} from '@/lib/socria-prompt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_INPUT_LEN = 8000;
const MAX_HISTORY = 30;

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI key not configured on server' },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => null);
    const messages = body?.messages;

    // Server-side gate: models flagged requiresAuth need a Clerk session.
    // Even if the client UI is bypassed, anon users can't hit Core 3.
    const { userId } = auth();
    const requestedModelId = body?.model;
    const requestedConfig =
      requestedModelId === 'core-3'
        ? SOCRIA_MODELS['core-3']
        : SOCRIA_MODELS['core-2'];
    if (requestedConfig.requiresAuth && !userId) {
      return NextResponse.json(
        {
          error: `Sign in to use ${requestedConfig.label}.`,
          requiresAuth: true,
        },
        { status: 401 }
      );
    }

    const { prompt: systemPrompt, model } = buildSystemPrompt(
      body?.model,
      body?.depth
    );

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'messages array required' },
        { status: 400 }
      );
    }

    // Validate the last user message
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'user' || typeof last.content !== 'string') {
      return NextResponse.json(
        { error: 'last message must be from user' },
        { status: 400 }
      );
    }
    if (last.content.length > MAX_INPUT_LEN) {
      return NextResponse.json(
        { error: `Message too long (max ${MAX_INPUT_LEN} chars).` },
        { status: 400 }
      );
    }

    // Clean / clip the message history
    const clean = messages
      .filter(
        (m: any) =>
          m &&
          (m.role === 'user' || m.role === 'assistant') &&
          typeof m.content === 'string'
      )
      .slice(-MAX_HISTORY)
      .map((m: any) => ({ role: m.role, content: m.content }));

    const openai = new OpenAI({ apiKey });
    const openaiModel = resolveOpenAIModel(model);

    const completion = await openai.chat.completions.create({
      model: openaiModel,
      messages: [
        { role: 'system', content: systemPrompt },
        ...clean,
      ],
      temperature: 0.7,
      max_tokens: 500,
      stream: true,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of completion) {
            const delta = chunk.choices?.[0]?.delta?.content ?? '';
            if (delta) controller.enqueue(encoder.encode(delta));
          }
        } catch (e) {
          console.error('stream error:', e);
          controller.enqueue(
            encoder.encode('\n\n[Connection interrupted. Please try again.]')
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e: any) {
    console.error('chat route error:', e);
    return NextResponse.json(
      { error: e?.message || 'Internal error' },
      { status: 500 }
    );
  }
}
