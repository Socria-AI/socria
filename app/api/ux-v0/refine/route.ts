// app/api/ux-v0/refine/route.ts
// POST { spec, brief, moodboard, selection?, comment, force } → { patch, applies, understood, challenge, question, regenerate }
//
// A comment on part of a generated design becomes ONE typed patch
// (lib/ux-v0/design.ts, spec.ts). The patch is checked here against the spec
// it was made for; the client applies the same deterministic function, so the
// page changes only where the patch says. When SocriaUX has a concern about
// the change, it says so and the designer decides — the patch travels with
// the concern, so "apply anyway" needs no second call.

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { auth } from '@clerk/nextjs/server';
import { tracked } from '@/lib/openai-usage';
import { enforceRateLimit } from '@/lib/rate-limit';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { meterFor, sleepAnswer, sleepGate } from '@/lib/sleep-server';
import { withMeter } from '@/lib/token-meter';
import { askJson } from '@/lib/ux-v0/ask';
import { parseRefine, refineSystem, refineUser } from '@/lib/ux-v0/design';
import { MAX_TOKENS, socriauxLadder } from '@/lib/ux-v0/model';
import { bad, failed, noModel, projectIdOf, readBody, signInFirst } from '@/lib/ux-v0/route-kit';
import { applyPatch, normalizeSpec } from '@/lib/ux-v0/spec';
import { normalizeBrief, normalizeMoodboard, normalizeSelection } from '@/lib/ux-v0/types';
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

  const body = await readBody(req, 600_000);
  const moodboard = normalizeMoodboard(body?.moodboard);
  const spec = normalizeSpec(body?.spec, moodboard);
  const comment = typeof body?.comment === 'string' ? body.comment.trim().slice(0, 2000) : '';
  if (!body || !spec || !comment) return bad('A design and a comment are needed.');
  const selection = body.selection ? normalizeSelection({ ...body.selection, crop: null }) : null;
  const force = body.force === true;
  const projectId = projectIdOf(body.projectId);

  const caps = await underCaps(userId, 'refine');
  if (!caps.ok) return NextResponse.json({ error: caps.error, limit: true }, { status: 429 });

  const plan = await resolvePlanForRequest(req, userId);
  const sleep = await sleepGate(req, userId, plan);
  if (sleep.refuse) return sleep.refuse;
  if (sleep.meter) meterFor(sleep.meter);

  const openai = tracked(new OpenAI({ apiKey }), 'ux-v0/refine');
  try {
    const asked = await askJson(openai, socriauxLadder(), {
      system: refineSystem(),
      user: refineUser({ brief: normalizeBrief(body.brief), spec, moodboard, selection, comment, force }),
      maxTokens: MAX_TOKENS.refine,
      temperature: 0.4,
      label: 'refine',
    });
    const r = parseRefine(asked.json, force);
    await recordUsage(userId, projectId, 'refine', asked.usage);
    const trial = r.patch.op === 'none' ? null : applyPatch(spec, r.patch, moodboard);
    return NextResponse.json({
      understood: r.understood,
      challenge: r.challenge,
      question: r.question,
      regenerate: r.regenerate,
      patch: r.patch,
      applies: !!trial?.ok,
      error: trial && !trial.ok ? trial.error : '',
      usage: asked.usage,
    });
  } catch (e) {
    // the week's last tokens taken by another request first: said as Sleep Mode, never as a failure
    const resting = sleepAnswer(e);
    if (resting) return resting;
    console.error('ux-v0 refine failed:', e instanceof Error ? e.message : e);
    return failed();
  }
});
