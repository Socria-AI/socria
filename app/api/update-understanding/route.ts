// app/api/update-understanding/route.ts
// POST /api/update-understanding
// Body: { understanding, memory, title, messages }
// Returns: { understanding } — the user's updated cross-conversation
// thinking journey (narrative + open threads + timeline).
//
// Called by the client every few Core 3.1 turns, after memory extraction.
// Uses a cheap model; timestamps are stamped server-side so the model can
// never invent dates. Auth matches the other Core 3 routes: Clerk session
// OR the typed access key.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import OpenAI from 'openai';
import {
  EMPTY_UNDERSTANDING,
  buildJourneyExtractorPrompt,
  sanitizeUserUnderstanding,
  sanitizeMemory,
  renderMemoryForPrompt,
  isValidAccessKey,
  type UserUnderstanding,
} from '@/lib/socria-prompt';
import { enforceRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_RECENT_MESSAGES = 8;

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
  const current = sanitizeUserUnderstanding(body?.understanding);
  const memory = sanitizeMemory(body?.memory);
  const title =
    typeof body?.title === 'string' ? body.title.slice(0, 120) : null;
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const recent = messages
    .filter(
      (m: any) =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string'
    )
    .slice(-MAX_RECENT_MESSAGES)
    .map(
      (m: any) =>
        `${m.role === 'user' ? 'User' : 'Socria'}: ${m.content.slice(0, 800)}`
    )
    .join('\n');

  if (!recent) {
    return NextResponse.json({ understanding: current });
  }

  try {
    const openai = new OpenAI({ apiKey });
    const model =
      process.env.OPENAI_JOURNEY_MODEL ||
      process.env.OPENAI_MEMORY_MODEL ||
      'gpt-4o-mini';
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: buildJourneyExtractorPrompt(
            current,
            title,
            renderMemoryForPrompt(memory),
            recent
          ),
        },
      ],
    });

    if (completion.choices?.[0]?.finish_reason === 'length') {
      console.warn('update-understanding: output truncated (length)');
    }
    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) return NextResponse.json({ understanding: current });

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ understanding: current });
    }

    // Shape precondition for accepting a full replacement: a valid extractor
    // response always carries a narrative array. Anything else (wrong keys,
    // wrong types, {}) must NOT be allowed to wipe the accumulated journey —
    // a single bad model response would otherwise propagate an empty journey
    // to every device via newest-wins sync.
    if (!Array.isArray(parsed?.narrative)) {
      return NextResponse.json({ understanding: current });
    }

    const now = Date.now();

    const draft = sanitizeUserUnderstanding({
      narrative: parsed.narrative,
      openThreads: parsed?.openThreads,
      // A full replacement, deliberately: these are proposals about what is
      // pending NOW, and a stale one is worse than none. If this pass has
      // nothing to suggest, the chips fall back to the written openings
      // rather than offering a question the person has already answered.
      nextQuestions: parsed?.nextQuestions,
      timeline: current.timeline,
      updatedAt: now,
    });

    // Regression guard: never replace real content with emptiness.
    if (
      (current.narrative.length > 0 || current.openThreads.length > 0) &&
      draft.narrative.length === 0 &&
      draft.openThreads.length === 0
    ) {
      return NextResponse.json({ understanding: current });
    }

    // Open threads: only threads this conversation actually engaged
    // ("touched") get restamped; untouched carried-over threads keep their
    // previous wording and lastTouched so relative ages ("12 days ago")
    // stay honest instead of collapsing to "earlier today".
    const rawThreads = Array.isArray(parsed?.openThreads) ? parsed.openThreads : [];
    draft.openThreads = draft.openThreads.map((t, i) => {
      const touched = rawThreads[i]?.touched !== false;
      const prev = current.openThreads.find(
        (p) => p.topic.trim().toLowerCase() === t.topic.trim().toLowerCase()
      );
      if (prev && !touched) {
        return { ...prev };
      }
      return { ...t, lastTouched: now };
    });

    // Timeline: append at most one new server-stamped event, deduped.
    const ev =
      typeof parsed?.newTimelineEvent === 'string'
        ? parsed.newTimelineEvent.replace(/\s+/g, ' ').trim().slice(0, 160)
        : '';
    if (
      ev &&
      !/^null$/i.test(ev) &&
      !current.timeline.some(
        (e) => e.event.toLowerCase() === ev.toLowerCase()
      )
    ) {
      draft.timeline = [...current.timeline, { at: now, event: ev }].slice(-14);
    }

    const understanding: UserUnderstanding = { ...draft, updatedAt: now };
    return NextResponse.json({ understanding });
  } catch (e) {
    console.error('update-understanding error:', e);
    return NextResponse.json({ understanding: current ?? EMPTY_UNDERSTANDING });
  }
}
