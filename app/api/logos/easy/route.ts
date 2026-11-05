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
import { chooseAuxModel, firstAccepted, tierOf } from '@/lib/model-router';
import { cannotSee } from '@/lib/model-params';
import { LOGOS_MODEL } from '@/lib/logos';
import { enforceRateLimit } from '@/lib/rate-limit';
import { meterFor, sleepGate } from '@/lib/sleep-server';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { boundaryNote } from '@/lib/entitlements';
import { spend } from '@/lib/usage';
import { mayUse } from '@/lib/route-guard';
import { EASY_PROMPT, EASY_UNREAD, easyAsk } from '@/lib/easy-view';
import { sanitizeEasy } from '@/lib/objects/display-easy';
import { parseDraft } from '@/lib/objects/display-propose';

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
  // Sleep Mode (lib/sleep-server.ts): a free account whose day of tokens is spent rests until tomorrow;
  // one that is awake is metered from here, so every call this request makes is counted.
  const sleep = await sleepGate(req, userId, plan);
  if (sleep.refuse) return sleep.refuse;
  if (sleep.meter) meterFor(sleep.meter);
  // by tier (lib/model-router.ts): Socria One on GPT-6.1 Terra, the free plan on GPT-6 Luna, a guest on
  // GPT-4o mini; a refused model steps down within the tier. LOGOS_ROUTER=off: as before.
  const routed = chooseAuxModel(tierOf(userId, plan), 'standard', process.env, process.env.OPENAI_MODEL_LOGOS || LOGOS_MODEL);
  const call =
    (extra: { role: 'assistant' | 'user'; content: string }[] = [], cap = 2600) =>
    (model: string) =>
      openai.chat.completions.create({
        model,
        temperature: 0,
        max_tokens: cap,
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
          ...extra,
        ],
      });
  const step = (from: string, to: string, why: string) => console.warn('logos easy: %s refused (%s); asking %s', from, why, to);

  try {
    // a refused or failing model steps down the tier's whole ladder (lib/model-router.ts firstAccepted) — and one that cannot read an image steps down too
    const first = await firstAccepted(routed.ladder, call(), step, cannotSee);
    const text = first.result.choices?.[0]?.message?.content ?? '';
    let easy = sanitizeEasy(parseDraft(text));
    // A READING THE KIND CANNOT HOLD (not JSON, cut off, the wrong shape): read once more, told why — the
    // photo is not sent to a model a third time
    if (!easy) {
      const cut = first.result.choices?.[0]?.finish_reason === 'length';
      const again = await firstAccepted(
        routed.ladder.slice(Math.max(0, routed.ladder.indexOf(first.model))),
        call(
          [
            { role: 'assistant', content: text.slice(0, 6000) || '{}' },
            { role: 'user', content: cut ? 'That was cut off before it finished. Read it again, complete and shorter: ONLY JSON in the shape given.' : 'That could not be read as the shape asked for. Read the photo again: ONLY JSON, exactly the shape given.' },
          ],
          cut ? 4000 : 2600
        ),
        step,
        cannotSee
      ).catch(() => null);
      if (again) easy = sanitizeEasy(parseDraft(again.result.choices?.[0]?.message?.content ?? ''));
    }
    if (!easy) return NextResponse.json({ error: EASY_UNREAD }, { status: 422 });
    return NextResponse.json({ easy });
  } catch (e) {
    console.error('logos easy error:', e);
    return NextResponse.json({ error: 'That photo could not be read just now — try again in a moment.' }, { status: 500 });
  }
}
