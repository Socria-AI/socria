// app/api/logos/map/route.ts
// POST /api/logos/map  → { map } — the rebuilt Thinking Map.
//
// Runs INDEPENDENTLY of the conversational reply (the client fires both in
// parallel), so the map grows while the answer is still streaming.

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { auth } from '@clerk/nextjs/server';
import {
  buildMapPrompt,
  sanitizeMap,
  LOGOS_MODEL,
  LOGOS_FALLBACK_MODEL,
  EMPTY_MAP,
} from '@/lib/logos';
import { renderMessageForModel, sanitizeAttachments } from '@/lib/logos-attachments';
import { renderContextsForMap, sanitizeContexts } from '@/lib/logos-sources';
import { isValidAccessKey } from '@/lib/socria-prompt';
import { enforceRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_HISTORY = 16;

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
  const current = sanitizeMap(body?.map);
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  // Grounded material attached to nodes — the extractor sees what is attached
  // and to which node, tagged with whose thinking it is.
  const grounded = renderContextsForMap(sanitizeContexts(body?.contexts));

  const kept = messages
    .filter(
      (m: any) =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string'
    )
    .slice(-MAX_HISTORY);

  // The extractor sees attachments too — a pasted page of notes or a photo of
  // a whiteboard is structural material, and a map blind to it would be a map
  // of half the conversation. The newest turn gets more room than the rest.
  const transcript = kept
    .map((m: any, i: number) => {
      const rendered = renderMessageForModel(
        { role: m.role, content: m.content, attachments: sanitizeAttachments(m.attachments) },
        i === kept.length - 1
      );
      const room = i === kept.length - 1 ? 6_000 : 700;
      return rendered.trim()
        ? `${m.role === 'user' ? 'Thinker' : 'Logos'}: ${rendered.slice(0, room)}`
        : '';
    })
    .filter(Boolean)
    .join('\n');

  // Nothing to extract from — hand back what we already have.
  if (!transcript) return NextResponse.json({ map: current });

  try {
    const openai = new OpenAI({ apiKey });
    const configured =
      process.env.OPENAI_MODEL_LOGOS_MAP || process.env.OPENAI_MODEL_LOGOS || LOGOS_MODEL;

    const make = (model: string) =>
      openai.chat.completions.create({
        model,
        temperature: 0,
        max_tokens: 900,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildMapPrompt(current, grounded) },
          { role: 'user', content: transcript },
        ],
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
        completion = await make(LOGOS_FALLBACK_MODEL);
      } else {
        throw e;
      }
    }

    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) return NextResponse.json({ map: current });

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ map: current });
    }

    const next = sanitizeMap(parsed);
    // Never let a malformed extraction blank a map the user has built up.
    if (next.nodes.length === 0 && current.nodes.length > 0) {
      return NextResponse.json({ map: current });
    }
    return NextResponse.json({ map: next });
  } catch (e) {
    console.error('logos map error:', e);
    return NextResponse.json({ map: current ?? EMPTY_MAP });
  }
}
