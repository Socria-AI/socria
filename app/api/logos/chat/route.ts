// app/api/logos/chat/route.ts
// POST /api/logos/chat  → streaming plain-text conversational reply.
//
// Gated like Core 3.1: a Clerk session OR the typed access key (sent as
// x-socria-key), so it stays demoable on preview URLs where sign-in is
// unavailable. Rate limited either way.

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { auth } from '@clerk/nextjs/server';
import {
  LOGOS_CHAT_PROMPT,
  LOGOS_MODEL,
  LOGOS_FALLBACK_MODEL,
  NODE_TYPES,
  buildFocusPrompt,
} from '@/lib/logos';
import { isValidAccessKey } from '@/lib/socria-prompt';
import { enforceRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_INPUT_LEN = 4000;
const MAX_HISTORY = 24;

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI key not configured' }, { status: 500 });
    }

    const { userId } = auth();
    // Same gate as Core 3.1: a Clerk session or the typed access key.
    const keyUnlocked = isValidAccessKey(req.headers.get('x-socria-key'));
    if (!userId && !keyUnlocked) {
      return NextResponse.json(
        { error: 'Logos requires an access key.', requiresKey: true },
        { status: 401 }
      );
    }

    const limited = await enforceRateLimit(req, userId, 'chat');
    if (limited) return limited;

    const body = await req.json().catch(() => null);
    const messages = body?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'messages array required' }, { status: 400 });
    }
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'user' || typeof last.content !== 'string') {
      return NextResponse.json({ error: 'last message must be from user' }, { status: 400 });
    }
    if (last.content.length > MAX_INPUT_LEN) {
      return NextResponse.json(
        { error: `Message too long (max ${MAX_INPUT_LEN} chars).` },
        { status: 400 }
      );
    }

    const clean = messages
      .filter(
        (m: any) =>
          m &&
          (m.role === 'user' || m.role === 'assistant') &&
          typeof m.content === 'string'
      )
      .slice(-MAX_HISTORY)
      .map((m: any) => ({ role: m.role, content: m.content }));

    // Optional: this turn belongs to a node the person opened, not to the
    // main thread. Same prompt, narrower aperture.
    const f = body?.focus;
    const trim = (v: any, n: number) =>
      typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '';
    const focusLabel = trim(f?.label, 120);
    const system = focusLabel
      ? buildFocusPrompt({
          label: focusLabel,
          type: NODE_TYPES.includes(f?.type) ? f.type : 'idea',
          concept: trim(f?.concept, 100) || undefined,
          framing: trim(f?.framing, 700) || undefined,
        })
      : LOGOS_CHAT_PROMPT;

    const openai = new OpenAI({ apiKey });
    const configured = process.env.OPENAI_MODEL_LOGOS || LOGOS_MODEL;

    const make = (model: string) =>
      openai.chat.completions.create({
        model,
        messages: [{ role: 'system', content: system }, ...clean],
        temperature: 0.7,
        max_tokens: 300,
        stream: true,
      });

    let completion;
    try {
      completion = await make(configured);
    } catch (e: any) {
      const status = e?.status ?? e?.response?.status;
      const isModelError =
        status === 404 ||
        /model/i.test(e?.code || '') ||
        /model|not found|does not exist|unknown/i.test(e?.message || '');
      if (isModelError && configured !== LOGOS_FALLBACK_MODEL) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[logos] model "${configured}" rejected; falling back to ${LOGOS_FALLBACK_MODEL}`
          );
        }
        completion = await make(LOGOS_FALLBACK_MODEL);
      } else {
        throw e;
      }
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of completion) {
            const delta = chunk.choices?.[0]?.delta?.content ?? '';
            if (delta) controller.enqueue(encoder.encode(delta));
          }
        } catch {
          controller.enqueue(encoder.encode('\n\n[Connection interrupted.]'));
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
    console.error('logos chat error:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
