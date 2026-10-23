// app/api/logos/experience/route.ts
// POST /api/logos/experience → { ops: [{ op, args }], refused?: string[] }
//
// ONE THING ASKED OF A MODEL FOR ONE EXPERIENCE — suggestions for sorting an
// untangled dump, questions and unknowns for a decision, hypothetical scenarios,
// possible common ground. lib/objects/experience-asks.ts builds the prompt
// from that experience's own state alone and reads the answer into
// operations; every operation is applied AS SOCRIA to a scratch copy, so the
// kind decides what may stand. Nothing is applied here — the browser applies
// what comes back, as Socria's, under the same rules again.
//
// Who may ask: a signed-in account, or the typed access key, like every Logos
// route. Suggestions count against the rate limit.
// When no model answers, it says so — nothing is made up in its place.

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { tracked } from '@/lib/openai-usage';
import { auth } from '@clerk/nextjs/server';
import { LOGOS_FALLBACK_MODEL, LOGOS_MODEL } from '@/lib/logos';
import '@/lib/objects';
import { buildPrompt, precheck, readAnswer, readAsk, readState, vetOps } from '@/lib/objects/experience-asks';
import { enforceRateLimit } from '@/lib/rate-limit';
import { mayUse } from '@/lib/route-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId && !mayUse(req, userId)) return NextResponse.json({ error: 'Logos requires an access key.', requiresKey: true }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const ask = readAsk(body);
  if (!ask) return NextResponse.json({ error: 'That is not something this can be asked.' }, { status: 400 });
  const state = readState(ask.kind, body?.state);
  if (state === null) return NextResponse.json({ error: 'That could not be read.' }, { status: 400 });
  const refusedFirst = precheck(ask, state);
  if (refusedFirst) return NextResponse.json({ error: refusedFirst }, { status: 409 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Socria cannot answer this just now.' }, { status: 503 });

  const prompted = buildPrompt(ask, state);
  try {
    const openai = tracked(new OpenAI({ apiKey }), 'logos/experience');
    const configured = process.env.OPENAI_MODEL_LOGOS_EXPERIENCE || process.env.OPENAI_MODEL_LOGOS || LOGOS_MODEL;
    const call = (model: string) =>
      openai.chat.completions.create({
        model,
        temperature: prompted.temperature,
        max_tokens: 900,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: prompted.system }, ...prompted.messages],
      });
    let completion;
    try {
      completion = await call(configured);
    } catch (e: any) {
      const status = e?.status ?? e?.response?.status;
      if ((status === 404 || /model/i.test(e?.message || '')) && configured !== LOGOS_FALLBACK_MODEL) completion = await call(LOGOS_FALLBACK_MODEL);
      else throw e;
    }
    const text = completion.choices?.[0]?.message?.content;
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    const vetted = vetOps(ask.kind, state, readAnswer(ask, state, parsed));
    if (!vetted.ops.length) return NextResponse.json({ error: 'Nothing came back that could be used — try again.', refused: vetted.refused.slice(0, 3) }, { status: 422 });
    return NextResponse.json({ ops: vetted.ops, ...(vetted.refused.length ? { refused: vetted.refused.slice(0, 3) } : {}) });
  } catch (e) {
    console.warn('logos experience: the model did not answer', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Socria could not answer just now — try again in a moment.' }, { status: 502 });
  }
}
