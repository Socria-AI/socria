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
  SOCRIA_PROMPT_VERSION,
  isValidAccessKey,
  buildConversationStatePrompt,
  sanitizeConversationState,
  renderTranscriptForState,
  type ConversationState,
} from '@/lib/socria-prompt';
import {
  computeGuidance,
  renderTurnDirective,
  renderStateDirective,
} from '@/lib/conversation-controller';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_INPUT_LEN = 8000;
const MAX_HISTORY = 30;
// Cap how long we wait for the semantic state pass before falling back to the
// deterministic directive, so a slow mini-call never stalls the reply.
const STATE_TIMEOUT_MS = 4500;

// Semantic living-understanding pass. Reads the thread with a cheap model and
// returns how the latest message updated the assistant's understanding. Any
// failure/timeout resolves null so the caller falls back gracefully.
async function computeConversationState(
  openai: OpenAI,
  messages: { role: string; content: string }[],
  priorUnderstanding: string | null
): Promise<ConversationState | null> {
  const model =
    process.env.OPENAI_STATE_MODEL ||
    process.env.OPENAI_MEMORY_MODEL ||
    'gpt-4o-mini';
  const run = openai.chat.completions
    .create({
      model,
      temperature: 0,
      max_tokens: 220,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildConversationStatePrompt(priorUnderstanding) },
        { role: 'user', content: renderTranscriptForState(messages) },
      ],
    })
    .then((c) => {
      const raw = c.choices?.[0]?.message?.content;
      if (!raw) return null;
      try {
        return sanitizeConversationState(JSON.parse(raw));
      } catch {
        return null;
      }
    })
    .catch(() => null);
  const timeout = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), STATE_TIMEOUT_MS)
  );
  return Promise.race([run, timeout]);
}

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

    // Server-side gate: models flagged requiresAuth need a Clerk session OR
    // a valid access key (typed by the user, sent via the x-socria-key
    // header). Even if the client UI is bypassed, anon users without either
    // can't hit Core 3.
    const { userId } = auth();
    const keyUnlocked = isValidAccessKey(
      req.headers.get('x-socria-key') ?? body?.accessKey
    );
    const requestedModelId = body?.model;
    const requestedConfig =
      requestedModelId === 'core-3'
        ? SOCRIA_MODELS['core-3']
        : SOCRIA_MODELS['core-2'];
    if (requestedConfig.requiresAuth && !userId && !keyUnlocked) {
      return NextResponse.json(
        {
          error: `Sign in to use ${requestedConfig.label}.`,
          requiresAuth: true,
        },
        { status: 401 }
      );
    }

    const { prompt: basePrompt, model, depth } = buildSystemPrompt(
      body?.model,
      body?.depth,
      body?.memory
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

    // Core 3.1 per-turn conversation controller: compute compact guidance from
    // the thread (what changed this turn, anti-loop "do not" list) and append
    // it to the END of the system prompt, where the model attends most. This
    // is the forcing function that keeps 3.1 from falling into the generic
    // reassure → paraphrase → broad-question loop. Deterministic — no extra
    // model call. Core 2 is untouched.
    // Dev-only A/B knob: the eval harness sends this to compare controller-on
    // vs controller-off replies against the same server. Ignored in production.
    const controllerDisabled =
      process.env.NODE_ENV !== 'production' &&
      req.headers.get('x-socria-no-controller') === '1';

    const openai = new OpenAI({ apiKey });

    let systemPrompt = basePrompt;
    let guidance: ReturnType<typeof computeGuidance> | null = null;
    let state: ConversationState | null = null;
    if (model === 'core-3' && !controllerDisabled) {
      guidance = computeGuidance(clean, body?.memory);

      // Living-understanding pass — the semantic layer. Runs from the 2nd
      // user turn on (nothing to compare against on turn 1), unless disabled.
      // Prior understanding seeds continuity from last turn's memory.
      const userTurns = clean.filter((m) => m.role === 'user').length;
      const stateEnabled =
        process.env.SOCRIA_DISABLE_STATE !== '1' &&
        !(
          process.env.NODE_ENV !== 'production' &&
          req.headers.get('x-socria-no-state') === '1'
        );
      if (stateEnabled && userTurns >= 2) {
        const priorUnderstanding =
          (Array.isArray(body?.memory?.emergingUnderstanding) &&
            body.memory.emergingUnderstanding[0]) ||
          null;
        state = await computeConversationState(openai, clean, priorUnderstanding);
      }

      const parts = [basePrompt];
      if (state) parts.push(renderStateDirective(state));
      parts.push(renderTurnDirective(guidance, { hasSemanticState: !!state }));
      systemPrompt = parts.join('\n\n');
    }

    if (process.env.NODE_ENV !== 'production') {
      const userTurns = clean.filter((m) => m.role === 'user').length;
      const assistantTurns = clean.filter((m) => m.role === 'assistant').length;
      // Dev-only. Never logs conversation content — only routing + shape.
      console.log('[socria/chat]', {
        socriaModel: model,
        openaiModel: resolveOpenAIModel(model),
        depth,
        promptVersion: model === 'core-3' ? SOCRIA_PROMPT_VERSION : 'core-2',
        promptChars: systemPrompt.length,
        approxPromptTokens: Math.round(systemPrompt.length / 4),
        memoryInjected: model === 'core-3' && !!body?.memory,
        userTurns,
        assistantTurns,
        stage: guidance?.stage ?? null,
        previousMove: guidance?.previousMove ?? null,
        avoidNext: guidance?.avoidNext ?? null,
        stateDelta: state?.delta ?? null,
        stateResolved: state?.resolved ?? null,
        stateActive: !!state,
      });
    }

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
