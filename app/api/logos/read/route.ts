// app/api/logos/read/route.ts
// POST /api/logos/read → { reading } for one attached image.
//
// Called once, when the image is attached. Everything downstream works from
// the text this returns, so a photo costs one vision call for the whole
// session rather than one per turn per surface.

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { auth } from '@clerk/nextjs/server';
import { LOGOS_MODEL, LOGOS_FALLBACK_MODEL } from '@/lib/logos';
import { IMAGE_READ_PROMPT, MAX_READING_CHARS } from '@/lib/logos-attachments';
import { isValidAccessKey } from '@/lib/socria-prompt';
import { enforceRateLimit } from '@/lib/rate-limit';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { boundaryNote } from '@/lib/entitlements';
import { spend } from '@/lib/usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A 1400px JPEG lands well under this; the cap is here to stop a hand-rolled
// request posting something enormous.
const MAX_DATA_URL = 9_000_000;
const DATA_URL = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/;

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
  const image = typeof body?.image === 'string' ? body.image.trim() : '';
  if (!image || image.length > MAX_DATA_URL || !DATA_URL.test(image)) {
    return NextResponse.json({ error: 'A base64 image data URL is required.' }, { status: 400 });
  }

  // Reading an image is where the cost is, so it is where the count is —
  // attaching one is free and the boundary is met at the moment Logos would
  // actually look. A free reader gets one per line of thinking, so they see
  // what reading an image DOES before they meet the limit.
  const plan = await resolvePlanForRequest(req, userId);
  const allowance = await spend(
    userId,
    plan,
    'images',
    typeof body?.sessionId === 'string' ? body.sessionId : null
  );
  if (!allowance.ok) {
    return NextResponse.json(
      { error: boundaryNote('images'), upgrade: 'images', used: allowance.used, limit: allowance.limit },
      { status: 402 }
    );
  }

  const openai = new OpenAI({ apiKey });
  const configured = process.env.OPENAI_MODEL_LOGOS || LOGOS_MODEL;

  const make = (model: string) =>
    openai.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 420,
      messages: [
        { role: 'system', content: IMAGE_READ_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Read this image.' },
            { type: 'image_url', image_url: { url: image, detail: 'auto' } },
          ],
        },
      ],
    });

  try {
    let completion;
    try {
      completion = await make(configured);
    } catch (e: any) {
      const status = e?.status ?? e?.response?.status;
      const isModelError =
        status === 404 ||
        /model|not found|does not exist|unknown|vision|image/i.test(e?.message || '');
      if (configured !== LOGOS_FALLBACK_MODEL && isModelError) {
        completion = await make(LOGOS_FALLBACK_MODEL);
      } else {
        throw e;
      }
    }

    const reading = (completion.choices?.[0]?.message?.content || '')
      .trim()
      .slice(0, MAX_READING_CHARS);
    if (!reading) {
      return NextResponse.json({ error: 'Could not read that image.' }, { status: 502 });
    }
    return NextResponse.json({ reading });
  } catch (e) {
    console.error('logos read error:', e);
    return NextResponse.json({ error: 'Could not read that image.' }, { status: 500 });
  }
}
