// app/api/logos/easy/route.ts
// POST /api/logos/easy { image, said?, sessionId? } → { easy } — a photo made an EASY VIEW.
//
// A menu, a label, a timetable, photographed on a phone: read once by the
// vision model into what it says (lib/easy-view.ts), and held to the kind's
// own sanitizer (lib/objects/display-easy.ts) before anything is returned, so
// what reaches the person is only what the kind keeps. It costs what reading
// any photo costs — one image from the same allowance as /api/logos/read — and
// the reading is the only one: the conversation is given its text, not a second
// look at the picture.

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { auth } from '@clerk/nextjs/server';
import { tracked } from '@/lib/openai-usage';
import { LOGOS_MODEL, LOGOS_FALLBACK_MODEL } from '@/lib/logos';
import { enforceRateLimit } from '@/lib/rate-limit';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { boundaryNote } from '@/lib/entitlements';
import { spend } from '@/lib/usage';
import { mayUse } from '@/lib/route-guard';
import { EASY_PROMPT, EASY_UNREAD, easyAsk } from '@/lib/easy-view';
import { sanitizeEasy } from '@/lib/objects/display-easy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A 2048px JPEG of a menu is well under this; the cap stops a hand-rolled request posting something enormous.
const MAX_DATA_URL = 9_000_000;
const DATA_URL = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/;

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId && !mayUse(req, userId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'OpenAI key not configured' }, { status: 500 });

  const body = await req.json().catch(() => null);
  const image = typeof body?.image === 'string' ? body.image.trim() : '';
  if (!image || image.length > MAX_DATA_URL || !DATA_URL.test(image)) {
    return NextResponse.json({ error: 'A photo is needed — a base64 image data URL.' }, { status: 400 });
  }

  // a photo read is a photo counted, from the same allowance as any other
  const plan = await resolvePlanForRequest(req, userId);
  const allowance = await spend(userId, plan, 'images', typeof body?.sessionId === 'string' ? body.sessionId : null);
  if (!allowance.ok) {
    return NextResponse.json({ error: boundaryNote('images'), upgrade: 'images', used: allowance.used, limit: allowance.limit }, { status: 402 });
  }

  const openai = tracked(new OpenAI({ apiKey: process.env.OPENAI_API_KEY }), 'logos/easy');
  const configured = process.env.OPENAI_MODEL_LOGOS || LOGOS_MODEL;
  const call = (model: string) =>
    openai.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 2600,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: EASY_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: easyAsk(body?.said) },
            // small print needs the full picture
            { type: 'image_url', image_url: { url: image, detail: 'high' } },
          ],
        },
      ],
    });

  try {
    let completion;
    try {
      completion = await call(configured);
    } catch (e: any) {
      const status = e?.status ?? e?.response?.status;
      const isModelError = status === 404 || /model|not found|does not exist|unknown|vision|image/i.test(e?.message || '');
      if (configured !== LOGOS_FALLBACK_MODEL && isModelError) completion = await call(LOGOS_FALLBACK_MODEL);
      else throw e;
    }
    let raw: unknown = null;
    try {
      raw = JSON.parse(completion.choices?.[0]?.message?.content || 'null');
    } catch {
      raw = null;
    }
    const easy = sanitizeEasy(raw);
    if (!easy) return NextResponse.json({ error: EASY_UNREAD }, { status: 422 });
    return NextResponse.json({ easy });
  } catch (e) {
    console.error('logos easy error:', e);
    return NextResponse.json({ error: 'That photo could not be read just now — try again in a moment.' }, { status: 500 });
  }
}
