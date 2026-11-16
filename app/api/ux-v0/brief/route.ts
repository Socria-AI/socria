// app/api/ux-v0/brief/route.ts
// POST { action: 'synthesize' } → { brief } from the understanding and the kept references
// POST { action: 'refine', current, instruction } → { brief, queries } changed as asked (queries: new searches
//   for the board, only when the change moved the visual direction)
//
// The brief (lib/ux-v0/design.ts) is the designer's to review, edit and approve;
// direct edits never come here. Fonts outside the allowlist, invalid colours
// and references that were not kept are corrected by the normaliser.

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { auth } from '@clerk/nextjs/server';
import { tracked } from '@/lib/openai-usage';
import { enforceRateLimit } from '@/lib/rate-limit';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { meterFor, sleepAnswer, sleepGate } from '@/lib/sleep-server';
import { withMeter } from '@/lib/token-meter';
import { askJson } from '@/lib/ux-v0/ask';
import { briefSystem, briefUser, parseBrief, type BriefInput, briefQueries } from '@/lib/ux-v0/design';
import { MAX_TOKENS, socriauxLadder } from '@/lib/ux-v0/model';
import { bad, failed, noModel, projectIdOf, readBody, signInFirst } from '@/lib/ux-v0/route-kit';
import { normalizeBrief, normalizeDiscovery, normalizeMoodboard } from '@/lib/ux-v0/types';
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
  const refining = body.action === 'refine';
  const moodboard = normalizeMoodboard(body.moodboard);
  const discovery = normalizeDiscovery({ questions: body.questions, understanding: body.understanding });
  const current = refining ? normalizeBrief(body.current) : null;
  const instruction = typeof body.instruction === 'string' ? body.instruction.trim().slice(0, 800) : '';
  if (refining && (!current || !instruction)) return bad('Say what to change in the brief.');
  const input: BriefInput = { intent, understanding: discovery.understanding, questions: discovery.questions, moodboard, current, instruction };
  const kind = refining ? 'refine-brief' : 'brief';
  const projectId = projectIdOf(body.projectId);

  const caps = await underCaps(userId, kind);
  if (!caps.ok) return NextResponse.json({ error: caps.error, limit: true }, { status: 429 });

  const plan = await resolvePlanForRequest(req, userId);
  const sleep = await sleepGate(req, userId, plan);
  if (sleep.refuse) return sleep.refuse;
  if (sleep.meter) meterFor(sleep.meter);

  const openai = tracked(new OpenAI({ apiKey }), `ux-v0/${kind}`);
  try {
    const asked = await askJson(openai, socriauxLadder(), { system: briefSystem(refining), user: briefUser(input), maxTokens: MAX_TOKENS[kind], temperature: 0.4, label: kind });
    const brief = parseBrief(asked.json, moodboard);
    await recordUsage(userId, projectId, kind, asked.usage);
    if (!brief) return NextResponse.json({ error: 'SocriaUX could not write a usable brief from that. Try again, or write it yourself.', usage: asked.usage }, { status: 502 });
    // a refinement that moved the visual direction brings new searches for the board
    return NextResponse.json({ brief, queries: refining ? briefQueries(asked.json, moodboard) : [], usage: asked.usage });
  } catch (e) {
    // the week's last tokens taken by another request first: said as Sleep Mode, never as a failure
    const resting = sleepAnswer(e);
    if (resting) return resting;
    console.error('ux-v0 brief failed:', e instanceof Error ? e.message : e);
    return failed();
  }
});
