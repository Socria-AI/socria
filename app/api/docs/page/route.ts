// app/api/docs/page/route.ts
// POST { image, kind: 'page' | 'figure', sessionId? } → { blocks } | { figure }
//
// One page of a document — a scan, a photograph, a page whose text could not
// be decoded — or one figure, read by a vision model from a picture of it.
// The browser renders the picture (it has the file; this route never does),
// sends it here once, and merges what comes back into its document
// (lib/docs/vision.ts mergePageReading), where every block is marked as read
// by vision, with its confidence and anything that could not be read.
//
// Stateless, like the file reader: nothing is kept. A page read is an image
// read, so it counts against the same per-conversation allowance as any
// image Logos reads (lib/usage.ts), and the same 402 says so when it is met.

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { auth } from '@clerk/nextjs/server';
import { LOGOS_FALLBACK_MODEL, LOGOS_MODEL } from '@/lib/logos';
import { enforceRateLimit } from '@/lib/rate-limit';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { boundaryNote } from '@/lib/entitlements';
import { spend } from '@/lib/usage';
import { mayUse } from '@/lib/route-guard';
import { FIGURE_READ_PROMPT, PAGE_READ_PROMPT, parseFigureReply, parsePageReply } from '@/lib/docs/vision';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// A page rendered at ~1600px as a JPEG is well under this.
const MAX_DATA_URL = 9_000_000;
const DATA_URL = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/;

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId && !mayUse(req, userId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'OpenAI key not configured' }, { status: 500 });

  const body = (await req.json().catch(() => null)) as { image?: unknown; kind?: unknown; sessionId?: unknown } | null;
  const image = typeof body?.image === 'string' ? body.image.trim() : '';
  if (!image || image.length > MAX_DATA_URL || !DATA_URL.test(image)) return NextResponse.json({ error: 'A base64 image data URL is required.' }, { status: 400 });
  const kind = body?.kind === 'figure' ? 'figure' : 'page';

  const plan = await resolvePlanForRequest(req, userId);
  const allowance = await spend(userId, plan, 'images', typeof body?.sessionId === 'string' ? body.sessionId.slice(0, 80) : null);
  if (!allowance.ok) return NextResponse.json({ error: boundaryNote('images'), upgrade: 'images', used: allowance.used, limit: allowance.limit }, { status: 402 });

  const openai = new OpenAI({ apiKey });
  const configured = process.env.OPENAI_MODEL_LOGOS || LOGOS_MODEL;
  const make = (model: string) =>
    openai.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: kind === 'page' ? 4000 : 900,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: kind === 'page' ? PAGE_READ_PROMPT : FIGURE_READ_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: kind === 'page' ? 'Transcribe this page.' : 'Read this figure.' },
            { type: 'image_url', image_url: { url: image, detail: 'high' } },
          ],
        },
      ],
    });

  try {
    let completion;
    try {
      completion = await make(configured);
    } catch (e: unknown) {
      const err = e as { status?: number; message?: string };
      const modelProblem = err?.status === 404 || err?.status === 400 || /model|not found|does not exist|unknown|vision|image|response_format/i.test(err?.message || '');
      if (configured !== LOGOS_FALLBACK_MODEL && modelProblem) completion = await make(LOGOS_FALLBACK_MODEL);
      else throw e;
    }
    const raw = completion.choices?.[0]?.message?.content || '';
    const truncated = completion.choices?.[0]?.finish_reason === 'length';
    if (kind === 'figure') {
      const figure = parseFigureReply(raw);
      if (!figure) return NextResponse.json({ error: 'The figure could not be read.' }, { status: 502 });
      return NextResponse.json({ figure });
    }
    const blocks = parsePageReply(raw);
    if (!blocks) return NextResponse.json({ error: 'The page could not be read.' }, { status: 502 });
    // a reading cut off at the model's length limit is a partial page, and says so
    return NextResponse.json({ blocks, ...(truncated ? { partial: true } : {}) });
  } catch (e) {
    console.error('[socria/docs] page read failed', e);
    return NextResponse.json({ error: 'The page could not be read.' }, { status: 500 });
  }
}
