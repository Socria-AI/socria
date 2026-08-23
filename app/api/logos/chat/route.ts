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
import { renderMessageForModel, sanitizeAttachments } from '@/lib/logos-attachments';
import { renderContextsForNode, sanitizeNodeContextList } from '@/lib/logos-sources';
import { guidanceBlock, resolveDepth, resolveGuard } from '@/lib/logos-guidance';
import { styleBlock } from '@/lib/logos-style';
import { isValidAccessKey } from '@/lib/socria-prompt';
import { enforceRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Generous: people paste whole journal entries in here. Anything much longer
// arrives as a note attachment instead, which has its own budget.
const MAX_INPUT_LEN = 12_000;
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

    const kept = messages
      .filter(
        (m: any) =>
          m &&
          (m.role === 'user' || m.role === 'assistant') &&
          typeof m.content === 'string'
      )
      .slice(-MAX_HISTORY);

    // Attachments are flattened into the text the model reads. Only the turn
    // being answered carries a long note in full.
    const clean = kept
      .map((m: any, i: number) => ({
        role: m.role as 'user' | 'assistant',
        content: renderMessageForModel(
          { role: m.role, content: m.content, attachments: sanitizeAttachments(m.attachments) },
          i === kept.length - 1
        ),
      }))
      .filter((m) => m.content.trim());

    if (!clean.length) {
      return NextResponse.json({ error: 'Nothing to respond to.' }, { status: 400 });
    }

    // Optional: this turn belongs to a node the person opened, not to the
    // main thread. Same prompt, narrower aperture.
    const f = body?.focus;
    const trim = (v: any, n: number) =>
      typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '';
    const focusLabel = trim(f?.label, 120);
    const focusContexts = sanitizeNodeContextList(f?.contexts);
    const system = focusLabel
      ? buildFocusPrompt({
          label: focusLabel,
          type: NODE_TYPES.includes(f?.type) ? f.type : 'idea',
          concept: trim(f?.concept, 100) || undefined,
          framing: trim(f?.framing, 700) || undefined,
          grounded: focusContexts.length
            ? renderContextsForNode(focusContexts, 2_000)
            : undefined,
        })
      : LOGOS_CHAT_PROMPT;

    // Depth (how deeply to help them think) + the Answer Guard (learning math:
    // hints, not answers). The guard is the same one every surface honours.
    const guided =
      system +
      guidanceBlock(resolveDepth(body?.depth), resolveGuard(body?.guard), 'chat') +
      // Their custom instructions, last: the protected blocks above read
      // first, and the style block subordinates itself to them explicitly.
      styleBlock(body?.style);

    const openai = new OpenAI({ apiKey });
    const configured = process.env.OPENAI_MODEL_LOGOS || LOGOS_MODEL;

    const make = (model: string) =>
      openai.chat.completions.create({
        model,
        messages: [{ role: 'system', content: guided }, ...clean],
        temperature: 0.7,
        // Short is the prompt's default; the ceiling leaves room for the
        // people whose custom instructions ask for more than four sentences.
        max_tokens: 640,
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
