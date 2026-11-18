// app/api/ux-v0/discover/route.ts
// POST { action: 'turn' } → the next question(s), the understanding, moodboard queries, ready
// POST { action: 'direction', aspect } → a contrasting direction for one aspect of the moodboard
//
// Socratic discovery (lib/ux-v0/discovery.ts): a question or two at a time,
// never a topic twice, moodboard queries only when the visual direction moved.
// Text only — no images are sent — so a turn is cheap. Nothing is stored here.

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { auth } from '@clerk/nextjs/server';
import { tracked } from '@/lib/openai-usage';
import { enforceRateLimit } from '@/lib/rate-limit';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { meterFor, sleepAnswer, sleepGate } from '@/lib/sleep-server';
import { withMeter } from '@/lib/token-meter';
import { askJson } from '@/lib/ux-v0/ask';
import { formatFor } from '@/lib/ux-v0/schemas';
import { ASPECTS, directionSystem, directionUser, discoverSystem, discoverUser, parseDirection, parseDiscover, type Aspect, type DiscoverInput } from '@/lib/ux-v0/discovery';
import { MAX_TOKENS, socriauxLadder } from '@/lib/ux-v0/model';
import { bad, failed, noModel, projectIdOf, readBody, signInFirst } from '@/lib/ux-v0/route-kit';
import { normalizeDiscovery, normalizeMoodboard } from '@/lib/ux-v0/types';
import { recordUsage, underCaps } from '@/lib/ux-v0/usage-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withMeter(async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return signInFirst();
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return noModel();

  const body = await readBody(req, 400_000);
  const intent = typeof body?.intent === 'string' ? body.intent.trim().slice(0, 1200) : '';
  if (!body || !intent) return bad('Say what you want to make first.');
  const action = body.action === 'direction' ? 'direction' : 'turn';
  const aspect: Aspect = ASPECTS.includes(body.aspect) ? body.aspect : 'imagery';
  const discovery = normalizeDiscovery({ questions: body.questions, understanding: body.understanding });
  const input: DiscoverInput = {
    intent,
    questions: discovery.questions,
    understanding: discovery.understanding,
    moodboard: normalizeMoodboard(body.moodboard),
    remark: typeof body.remark === 'string' ? body.remark.trim().slice(0, 800) : '',
  };
  const kind = action === 'direction' ? 'direction' : 'discover';
  const projectId = projectIdOf(body.projectId);

  const caps = await underCaps(userId, kind);
  if (!caps.ok) return NextResponse.json({ error: caps.error, limit: true }, { status: 429 });

  const plan = await resolvePlanForRequest(req, userId);
  const sleep = await sleepGate(req, userId, plan);
  if (sleep.refuse) return sleep.refuse;
  if (sleep.meter) meterFor(sleep.meter);

  const openai = tracked(new OpenAI({ apiKey }), `ux-v0/${kind}`);
  try {
    const asked = await askJson(openai, socriauxLadder(), {
      system: action === 'direction' ? directionSystem() : discoverSystem(),
      user: action === 'direction' ? directionUser(input, aspect) : discoverUser(input),
      maxTokens: MAX_TOKENS[kind],
      temperature: action === 'direction' ? 0.8 : 0.5,
      label: kind,
      format: formatFor(kind),
    });
    await recordUsage(userId, projectId, kind, asked.usage);
    if (action === 'direction') return NextResponse.json({ ...parseDirection(asked.json, input, aspect), usage: asked.usage });
    return NextResponse.json({ ...parseDiscover(asked.json, input), usage: asked.usage });
  } catch (e) {
    // the week's last tokens taken by another request first: said as Sleep Mode, never as a failure
    const resting = sleepAnswer(e);
    if (resting) return resting;
    console.error('ux-v0 discover failed:', e instanceof Error ? e.message : e);
    return failed();
  }
});
