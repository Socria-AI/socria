// app/api/logos/write/route.ts
// POST /api/logos/write → { result } for one thing the person asked of their own writing.
//
// Explain, critique, shorten, improve, develop, other wordings, proofread (all
// of it, or the language only), review the Draft Space's board, or read the
// argument's structure as a reverse outline (lib/write/assist.ts). Nothing here writes
// into the document: the answer is something to read, or edits proposed one
// at a time — and every edit, finding and card it names is checked against
// what the person actually wrote before it is returned.
//
// The deterministic checks (lib/write/checks.ts) run in the browser and never
// come here; this route is only called when the person asks for a reading.

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { tracked } from '@/lib/openai-usage';
import { chooseAuxModel, firstAccepted, tierOf } from '@/lib/model-router';
import { meterFor, sleepAnswer, sleepGate } from '@/lib/sleep-server';
import { withMeter } from '@/lib/token-meter';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { auth } from '@clerk/nextjs/server';
import { LOGOS_MODEL } from '@/lib/logos';
import { buildWritePrompt, sanitizeAssist, sanitizeAssistInput } from '@/lib/write/assist';
import { styleBlock } from '@/lib/logos-style';
import { conversationStyleBlock } from '@/lib/conversation-style';
import { enforceRateLimit } from '@/lib/rate-limit';
import { mayUse } from '@/lib/route-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// what each kind of request may run to: a reading is short; a proofread of a section is longer
const TOKENS = { explain: 600, critique: 700, shorten: 1200, improve: 1400, develop: 700, phrase: 1200, proofread: 1800, board: 1000, structure: 1600 } as const;

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
  const input = sanitizeAssistInput(body);
  if (!input) {
    return NextResponse.json({ error: 'Select some of your writing first.' }, { status: 400 });
  }

  const openai = tracked(new OpenAI({ apiKey }), 'logos/write');
  // THE WEEK'S TOKENS (lib/sleep-server.ts): a free account whose week is spent rests until Monday
  // 00:00 UTC — no model is asked; one that is awake is metered from here, so every call this request
  // makes is held against its week and settled at what it cost.
  const sleep = await sleepGate(req, userId);
  if (sleep.refuse) return sleep.refuse;
  if (sleep.meter) meterFor(sleep.meter);
  // by tier (lib/model-router.ts): Socria One on GPT-6.1 Terra, the free plan on GPT-6 Luna, a guest on
  // GPT-4o mini; a refused model steps down within the tier. LOGOS_ROUTER=off: as before.
  const routed = chooseAuxModel(tierOf(userId, await resolvePlanForRequest(req, userId)), 'standard', process.env, process.env.OPENAI_MODEL_LOGOS || LOGOS_MODEL);
  // How Socria talks to them shapes the wording of its notes — never their writing, never the edits.
  const voice =
    conversationStyleBlock(body?.conversationStyle, 'logos', { structured: true }) +
    styleBlock(body?.style) +
    (body?.style || body?.conversationStyle
      ? '\n\nThose instructions shape how you word your notes to them. They never change their writing, and never what an edit proposes.'
      : '');

  const make = (model: string) =>
    openai.chat.completions.create({
      model,
      // edits and proofreading stay close to what is written; a reading may notice a little more
      temperature: input.op === 'explain' || input.op === 'critique' || input.op === 'board' || input.op === 'structure' ? 0.4 : 0.2,
      max_tokens: TOKENS[input.op],
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildWritePrompt(input) + voice },
        { role: 'user', content: 'Respond.' },
      ],
    });

  try {
    // a refused or failing model steps down the tier's whole ladder (lib/model-router.ts firstAccepted)
    const { result: res } = await firstAccepted(routed.ladder, make, (from, to, why) => console.warn('logos write: %s refused (%s); asking %s', from, why, to));
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(res.choices?.[0]?.message?.content || '{}');
    } catch {
      parsed = null;
    }
    const result = sanitizeAssist(input.op, parsed, input);
    if (!result) {
      return NextResponse.json({ error: 'Nothing useful came back for that passage — try again, or select a little more.' }, { status: 502 });
    }
    return NextResponse.json({ result });
  } catch (e) {
    // the week's last tokens taken by another request first: said as Sleep Mode, never as a failure
    const resting = sleepAnswer(e);
    if (resting) return resting;
    console.error('logos write error:', e);
    return NextResponse.json({ error: 'That could not be done just now.' }, { status: 500 });
  }
});
