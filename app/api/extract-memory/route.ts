// app/api/extract-memory/route.ts
// POST /api/extract-memory
// Body: { messages: [{role, content}, ...], currentMemory: ConversationMemory, titleOnly?: boolean, titleStyle?: 'topic' }
// Returns: { memory: ConversationMemory, suggestedTitle: string | null }
// With titleOnly (Core 4), only a title is produced and memory comes back unchanged;
// titleStyle 'topic' (Logos 5) names the topic as a concept rather than the request.
//
// Uses a cheap model (gpt-4o-mini regardless of the user's chat model) to
// distill the most recent exchange into an updated thread memory. Only
// signed-in users can hit this route; anon users don't have Core 3 access
// so they don't need memory extraction either.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import OpenAI from 'openai';
import { tracked } from '@/lib/openai-usage';
import {
  EMPTY_MEMORY,
  buildMemoryExtractorPrompt,
  sanitizeMemory,
  sanitizeSuggestedTitle,
} from '@/lib/socria-prompt';
import { enforceRateLimit } from '@/lib/rate-limit';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { memoryCaps, memoryFrozen } from '@/lib/person-memory';
import { mayUse } from '@/lib/route-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


export async function POST(req: NextRequest) {
  const { userId } = auth();
  const keyUnlocked = mayUse(req, userId);
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

  // What this plan carries. No plan freezes a thread's memory any more —
  // `memoryTurns` is null on both, so this never returns early. It stays
  // because the answer belongs in one place: a conversation that quietly
  // stopped remembering itself halfway through read as a broken product
  // rather than as a boundary, which is exactly why the cap came out.
  const plan = userId ? await resolvePlanForRequest(req, userId) : 'free';
  const caps = memoryCaps(plan);
  if (memoryFrozen(plan, userTurnCount)) {
    return NextResponse.json({
      memory: currentMemory,
      suggestedTitle: null,
      frozen: true,
      limit: caps.threadTurns,
    });
  }

  // Core 4 asks for a TITLE only. Its continuity is the Cognitive State and
  // the Reasoning Ledger, written server-side each turn, and it no longer
  // reads the thread memory — extracting one anyway would be a fourth
  // memory of the same conversation, unread, that the person could still
  // see and correct as though it mattered (docs/CORE-4-COGNITIVE-DESIGN.md,
  // D14). The title is the only thing this call still does for it.
  if (body?.titleOnly === true) {
    const opening = validMessages
      .slice(0, 6)
      .map((m: any) => `${m.role === 'user' ? 'User' : 'Socria'}: ${String(m.content).slice(0, 800)}`)
      .join('\n\n');
    // Logos 5 (Alex Tran): a node on the Universal Map names the TOPIC, as a
    // concept — "Anatomy – Nervous System Review" — never the request itself
    // ("Help me study for this big bio test tomorrow night please").
    const topic = body?.titleStyle === 'topic';
    try {
      const openai = tracked(new OpenAI({ apiKey }), topic ? 'logos/title' : 'core/extract-memory');
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MEMORY_MODEL || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: topic
              ? 'Name the topic of this conversation as a concise academic or conceptual title of 3–7 words — e.g. "Anatomy – Nervous System Review", "Thermodynamics – Carnot Cycle", "Pricing a Bakery in Austin". ' +
                'Use "Subject – Topic" when a subject is clear. Name what it is ABOUT, never the request ("Help me…", "Can you…"), never the deadline or the mood. ' +
                'No quotes, no trailing punctuation, never generic ("New chat", "Discussion", "Question"). Return JSON: {"suggestedTitle":"..."}'
              : 'Give this conversation a short, specific title (3–7 words) naming what it is about, in the person\'s terms. ' +
                'No quotes, no trailing punctuation, never generic ("New chat", "Discussion"). Return JSON: {"suggestedTitle":"..."}',
          },
          { role: 'user', content: opening },
        ],
        temperature: 0.2,
        max_tokens: 40,
        response_format: { type: 'json_object' },
      });
      const parsed = JSON.parse(completion.choices?.[0]?.message?.content || '{}');
      return NextResponse.json({ memory: currentMemory, suggestedTitle: sanitizeSuggestedTitle(parsed?.suggestedTitle) });
    } catch (e) {
      console.error('extract-memory (title) error:', e);
      return NextResponse.json({ memory: currentMemory, suggestedTitle: null });
    }
  }

  // Format the most recent turns for the extractor.
  const recent = validMessages
    .slice(-caps.extractorMessages)
    .map(
      (m: any) =>
        `${m.role === 'user' ? 'User' : 'Socria'}: ${m.content}`
    )
    .join('\n\n');

  try {
    const openai = tracked(new OpenAI({ apiKey }), 'core/extract-memory');
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
    const extracted = sanitizeMemory(parsed, caps.items);
    // Preserve insight + synthesis state — the extractor never touches them.
    const memory: typeof extracted = {
      ...extracted,
      latestInsight: currentMemory.latestInsight ?? null,
      lastInsightAtTurn: currentMemory.lastInsightAtTurn ?? 0,
      latestSynthesis: currentMemory.latestSynthesis ?? null,
      lastSynthesisAtTurn: currentMemory.lastSynthesisAtTurn ?? 0,
      // The client's note about the freeze, if it has already been shown.
      ...(currentMemory.frozenAt ? { frozenAt: currentMemory.frozenAt } : {}),
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
