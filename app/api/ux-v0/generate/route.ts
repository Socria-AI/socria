// app/api/ux-v0/generate/route.ts
// POST { brief, moodboard, direction?, version } → { spec, placeholders }
//
// The approved brief becomes a DesignSpec (lib/ux-v0/design.ts, spec.ts): tokens
// and sections from the library, real copy, moodboard images only. The client
// renders it (lib/ux-v0/render.ts) — the model never writes HTML. One call per
// generation; generations have their own daily cap.

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { auth } from '@clerk/nextjs/server';
import { tracked } from '@/lib/openai-usage';
import { enforceRateLimit } from '@/lib/rate-limit';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { meterFor, sleepAnswer, sleepGate } from '@/lib/sleep-server';
import { withMeter } from '@/lib/token-meter';
import { askJson } from '@/lib/ux-v0/ask';
import { generateSystem, generateUser, parseGenerate } from '@/lib/ux-v0/design';
import { pingUse } from '@/lib/ux-v0/images-server';
import { MAX_TOKENS, socriauxLadder } from '@/lib/ux-v0/model';
import { bad, failed, noModel, projectIdOf, readBody, signInFirst } from '@/lib/ux-v0/route-kit';
import { placeholdersIn } from '@/lib/ux-v0/spec';
import { normalizeBrief, normalizeMoodboard } from '@/lib/ux-v0/types';
import { recordUsage, underCaps } from '@/lib/ux-v0/usage-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = withMeter(async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return signInFirst();
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return noModel();

  const body = await readBody(req, 400_000);
  const moodboard = normalizeMoodboard(body?.moodboard);
  const kept = new Set(moodboard.refs.filter((r) => r.state === 'kept').map((r) => r.id));
  const brief = normalizeBrief(body?.brief, kept);
  if (!body || !brief) return bad('An approved brief is needed to generate a design.');
  const direction = typeof body.direction === 'string' ? body.direction.trim().slice(0, 400) : '';
  const version = Number.isFinite(body.version) ? Math.max(1, Math.round(body.version)) : 1;
  const projectId = projectIdOf(body.projectId);

  const caps = await underCaps(userId, 'generate');
  if (!caps.ok) return NextResponse.json({ error: caps.error, limit: true }, { status: 429 });

  const plan = await resolvePlanForRequest(req, userId);
  const sleep = await sleepGate(req, userId, plan);
  if (sleep.refuse) return sleep.refuse;
  if (sleep.meter) meterFor(sleep.meter);

  const openai = tracked(new OpenAI({ apiKey }), 'ux-v0/generate');
  try {
    const asked = await askJson(openai, socriauxLadder(), {
      system: generateSystem(brief),
      user: generateUser({ brief, moodboard, direction }),
      maxTokens: MAX_TOKENS.generate,
      temperature: 0.6,
      label: 'generate',
    });
    const spec = parseGenerate(asked.json, brief, moodboard, version, direction ? `Generated again: ${direction}` : 'Generated from the approved brief');
    await recordUsage(userId, projectId, 'generate', asked.usage);
    if (!spec) return NextResponse.json({ error: 'The model’s design did not hold together. Nothing changed; try again.', usage: asked.usage }, { status: 502 });
    // Unsplash asks to be told when a photo is used in a design
    const used = new Set(spec.sections.flatMap((s) => s.images));
    await Promise.all(moodboard.refs.filter((r) => used.has(r.id)).map((r) => pingUse(r)));
    return NextResponse.json({ spec, placeholders: placeholdersIn(spec), usage: asked.usage });
  } catch (e) {
    // the week's last tokens taken by another request first: said as Sleep Mode, never as a failure
    const resting = sleepAnswer(e);
    if (resting) return resting;
    console.error('ux-v0 generate failed:', e instanceof Error ? e.message : e);
    return failed();
  }
});
