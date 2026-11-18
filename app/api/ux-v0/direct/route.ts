// app/api/ux-v0/direct/route.ts
// POST { brief, notes?, avoid?, base?, round?, seen? } → { options, usage }
//
// Art direction, before anything is drawn (lib/ux-v0/direction.ts). The engine
// chooses three visual languages for fit and for difference — deterministic
// and free, so the browser shows them at once without asking anyone — and
// this route has the model write each one's concept, rationale, voice,
// composition and imagery for THIS brand, and refine its faces from the list.
// Everything the model returns is laid back over the engine's directions by
// parseDirections: an unknown language, a font off the list or a change to a
// group the designer locked never reaches them. One small call.

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { auth } from '@clerk/nextjs/server';
import { tracked } from '@/lib/openai-usage';
import { enforceRateLimit } from '@/lib/rate-limit';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { meterFor, sleepAnswer, sleepGate } from '@/lib/sleep-server';
import { withMeter } from '@/lib/token-meter';
import { askRouted } from '@/lib/ux-v0/ask';
import { budgets } from '@/lib/ux-v0/budget';
import { formatFor } from '@/lib/ux-v0/schemas';
import { directSystem, directUser, normalizeDirection, parseDirections, proposeDirections, saltOf, type DirectionAsk } from '@/lib/ux-v0/direction';
import { MAX_TOKENS, economyRoute } from '@/lib/ux-v0/model';
import { bad, failed, noModel, projectIdOf, readBody, signInFirst } from '@/lib/ux-v0/route-kit';
import { normalizeBrief } from '@/lib/ux-v0/types';
import { normalizeReading } from '@/lib/ux-v0/references';
import { gate, noticeOf, recordUsage } from '@/lib/ux-v0/usage-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export const POST = withMeter(async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return signInFirst();
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return noModel();

  const body = await readBody(req, 200_000);
  const brief = normalizeBrief(body?.brief);
  if (!body || !brief) return bad('An approved brief is needed before choosing a direction.');
  const ask: DirectionAsk = {
    brief,
    notes: text(body.notes, 1200),
    avoid: text(body.avoid, 400),
    base: body.base ? normalizeDirection(body.base) : null,
    round: Number.isFinite(body.round) ? Math.max(0, Math.min(99, Math.round(body.round))) : 0,
    seen: Array.isArray(body.seen) ? body.seen.filter((x: unknown): x is string => typeof x === 'string').slice(0, 24) : [],
    board: normalizeReading(body.board),
    // the project's own salt, as the browser drew them: the same directions on both sides
    salt: saltOf(body.projectId),
  };
  const projectId = projectIdOf(body.projectId);
  const options = proposeDirections(ask);

  const system = directSystem();
  const user = directUser(ask, options);
  const g = await gate(userId, projectId, 'art-direction', system.length + user.length);
  if (!g.ok) return NextResponse.json({ error: g.error, limit: true }, { status: 429 });

  const plan = await resolvePlanForRequest(req, userId);
  const sleep = await sleepGate(req, userId, plan);
  if (sleep.refuse) return sleep.refuse;
  if (sleep.meter) meterFor(sleep.meter);

  const openai = tracked(new OpenAI({ apiKey }), 'ux-v0/direct');
  try {
    const asked = await askRouted(openai, g.route, { system, user, maxTokens: MAX_TOKENS['art-direction'], temperature: 0.8, label: 'art-direction', format: formatFor('art-direction'), maxRetries: budgets().maxRetries }, economyRoute('art-direction'));
    await recordUsage(userId, projectId, 'art-direction', asked.usage, Date.now(), { api: asked.api, downgraded: !!g.downgraded || !!asked.fellBack });
    return NextResponse.json({ options: parseDirections(asked.json, ask, options), usage: asked.usage, ...noticeOf(g, asked) });
  } catch (e) {
    // the week's last tokens taken by another request first: said as Sleep Mode, never as a failure
    const resting = sleepAnswer(e);
    if (resting) return resting;
    console.error('ux-v0 direct failed:', e instanceof Error ? e.message : e);
    // the browser already shows the direction engine's three, and says the written concepts could not be fetched
    return failed();
  }
});
