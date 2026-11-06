// app/api/logos/read/route.ts
// POST /api/logos/read → { reading } for one attached image.
//
// Called once, when the image is attached. Everything downstream works from
// the text this returns, so a photo costs one vision call for the whole
// session rather than one per turn per surface.

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { tracked } from '@/lib/openai-usage';
import { chooseAuxModel, firstAccepted, tierOf } from '@/lib/model-router';
import { cannotSee } from '@/lib/model-params';
import { auth } from '@clerk/nextjs/server';
import { LOGOS_MODEL } from '@/lib/logos';
import { IMAGE_READ_PROMPT, MAX_READING_CHARS } from '@/lib/logos-attachments';
import { enforceRateLimit } from '@/lib/rate-limit';
import { meterFor, sleepAnswer, sleepGate } from '@/lib/sleep-server';
import { withMeter } from '@/lib/token-meter';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { boundaryNote } from '@/lib/entitlements';
import { spend } from '@/lib/usage';
import { mayUse } from '@/lib/route-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A 1400px JPEG lands well under this; the cap is here to stop a hand-rolled
// request posting something enormous.
const MAX_DATA_URL = 9_000_000;
const DATA_URL = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/;

export const POST = withMeter(async function POST(req: NextRequest) {
  const { userId } = auth();
  const keyUnlocked = mayUse(req, userId);
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
  // attaching one is free and the ceiling is met at the moment Logos would
  // actually look. That ceiling is fair use rather than a plan boundary —
  // identical on both plans and set where serious work does not reach it —
  // so the 402 explains itself and never offers a subscription as the fix.
  const plan = await resolvePlanForRequest(req, userId);
  // THE WEEK'S TOKENS (lib/sleep-server.ts): a free account whose week is spent rests until Monday
  // 00:00 UTC, before anything is spent and before any model is asked; one that is awake is metered
  // from here, so every call this request makes is held against its week and settled at what it cost.
  const sleep = await sleepGate(req, userId, plan);
  if (sleep.refuse) return sleep.refuse;
  if (sleep.meter) meterFor(sleep.meter);
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

  const openai = tracked(new OpenAI({ apiKey }), 'logos/read');
  // by tier (lib/model-router.ts): Socria One on GPT-6.1 Terra, the free plan on GPT-6 Luna, a guest on
  // GPT-4o mini; a refused model steps down within the tier. LOGOS_ROUTER=off: as before.
  const routed = chooseAuxModel(tierOf(userId, plan), 'standard', process.env, process.env.OPENAI_MODEL_LOGOS || LOGOS_MODEL);

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
    // a refused or failing model steps down the tier's whole ladder (lib/model-router.ts firstAccepted) — and one that cannot read an image steps down too
    const { result: completion } = await firstAccepted(routed.ladder, make, (from, to, why) => console.warn('logos read: %s refused (%s); asking %s', from, why, to), cannotSee);

    const reading = (completion.choices?.[0]?.message?.content || '')
      .trim()
      .slice(0, MAX_READING_CHARS);
    if (!reading) {
      return NextResponse.json({ error: 'Could not read that image.' }, { status: 502 });
    }
    return NextResponse.json({ reading });
  } catch (e) {
    // the week's last tokens taken by another request first: said as Sleep Mode, never as a failure
    const resting = sleepAnswer(e);
    if (resting) return resting;
    console.error('logos read error:', e);
    return NextResponse.json({ error: 'Could not read that image.' }, { status: 500 });
  }
});
