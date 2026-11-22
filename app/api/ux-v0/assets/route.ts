// app/api/ux-v0/assets/route.ts
// GET  → { enabled, model, quality, prices: { square, wide }, dailyUsd, why }
// POST { projectId, brief, purpose, subject?, ratio, treatment?, colours?, mood? } → { image: { dataUrl, mime, prompt, model, quality, cost, size, createdAt }, usage }
//
// One picture from an image model (lib/ux-v0/image-gen-server.ts), asked for explicitly by the designer, for one
// part of one design. Off unless the server turns it on and has a key. Priced before it is made, held to its own
// daily cap, to the person's and organisation's budgets and to the trial gate (as every model route is), recorded
// in the call log as stage "image" so it is counted apart from text; its client is the tracked one. The prompt is written here from the brief and the direction, never from free text
// alone; the answer is checked to be a real picture before it is returned. Pictures SocriaUX draws in code
// (lib/ux-v0/assets.ts) need none of this: they are free and made in the browser.

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { PROC_RATIOS, type ProcRatio } from '@/lib/ux-v0/assets';
import { budgets } from '@/lib/ux-v0/budget';
import { checkImage, generateImage, imageGenConfig, imagePrice, imagePrompt, sizeFor } from '@/lib/ux-v0/image-gen-server';
import { bad, projectIdOf, readBody, signInFirst } from '@/lib/ux-v0/route-kit';
import { CALLS_TABLE, dayKey, recordUsage, spentFor, underCaps } from '@/lib/ux-v0/usage-server';
import { tracked } from '@/lib/openai-usage';
import { meterFor, sleepAnswer, sleepGate } from '@/lib/sleep-server';
import { withMeter } from '@/lib/token-meter';
import { normalizeBrief } from '@/lib/ux-v0/types';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const money = (n: number) => `US$${n.toFixed(2)}`;

/** What this person has spent on pictures today (US$, from the call log). */
async function imageSpentToday(userId: string): Promise<number> {
  try {
    const { data, error } = await supabaseAdmin().from(CALLS_TABLE).select('cost_usd').eq('user_id', userId).eq('day', dayKey()).eq('stage', 'image');
    if (error || !data) return 0;
    return (data as { cost_usd: number | null }[]).reduce((t, r) => t + (Number(r.cost_usd) || 0), 0);
  } catch {
    return 0;
  }
}

export async function GET() {
  const { userId } = auth();
  if (!userId) return signInFirst();
  const cfg = imageGenConfig();
  return NextResponse.json({ enabled: cfg.enabled, model: cfg.model, quality: cfg.quality, dailyUsd: cfg.dailyUsd, why: cfg.why, prices: { square: imagePrice(cfg, '1:1'), wide: imagePrice(cfg, '16:9') } });
}

// in a metering context of its own (lib/token-meter.ts), so an account on its trial can never reach another request
export const POST = withMeter(async function POST(req: NextRequest) {
  const t0 = Date.now();
  const a = auth() as { userId: string | null; orgId?: string | null };
  if (!a.userId) return signInFirst();
  const userId = a.userId;
  const orgId = typeof a.orgId === 'string' && /^[A-Za-z0-9_-]{1,96}$/.test(a.orgId) ? a.orgId : null;
  const limited = await enforceRateLimit(req, userId, 'uxmodel');
  if (limited) return limited;
  const cfg = imageGenConfig();
  if (!cfg.enabled) return NextResponse.json({ error: cfg.why, off: true }, { status: 403 });

  const body = await readBody(req, 200_000);
  if (!body) return bad('Which picture?');
  const ratio = ((PROC_RATIOS as readonly string[]).includes(body.ratio) ? body.ratio : '4:3') as ProcRatio;
  const purpose = typeof body.purpose === 'string' ? body.purpose.trim().slice(0, 120) : '';
  if (!purpose) return bad('What is the picture for?');
  const projectId = projectIdOf(body.projectId);
  const price = imagePrice(cfg, ratio);

  // the caps and budgets hold before anything is asked of the provider
  const caps = await underCaps(userId, 'image');
  if (!caps.ok) return NextResponse.json({ error: caps.error }, { status: 429 });
  const [images, spent] = await Promise.all([imageSpentToday(userId), spentFor(userId, projectId, Date.now(), orgId)]);
  if (images + price > cfg.dailyUsd) return NextResponse.json({ error: `This picture (about ${money(price)}) would pass today’s budget for pictures (${money(cfg.dailyUsd)}; ${money(images)} spent). It resets at midnight UTC.` }, { status: 429 });
  const b = budgets();
  if (spent.day + price > b.dailyUsd) return NextResponse.json({ error: `This picture would pass today’s SocriaUX budget (${money(b.dailyUsd)}).` }, { status: 429 });
  if (spent.org && b.orgDailyUsd && spent.org.day + price > b.orgDailyUsd) return NextResponse.json({ error: `This picture would pass your organisation’s budget for today (${money(b.orgDailyUsd)}).` }, { status: 429 });

  // the trial gate, as on every route that asks a model: an ended trial, a spent day or an unreadable trial is
  // refused before the provider is asked; an account on its trial is metered for the rest of the request
  const sleep = await sleepGate(req, userId);
  if (sleep.refuse) return sleep.refuse;
  if (sleep.meter) meterFor(sleep.meter);

  const prompt = imagePrompt({
    brief: normalizeBrief(body.brief),
    purpose,
    subject: typeof body.subject === 'string' ? body.subject : '',
    ratio,
    treatment: typeof body.treatment === 'string' ? body.treatment : '',
    colours: Array.isArray(body.colours) ? body.colours.filter((x: unknown): x is string => typeof x === 'string').slice(0, 5) : [],
    mood: Array.isArray(body.mood) ? body.mood.filter((x: unknown): x is string => typeof x === 'string').slice(0, 4) : [],
  });

  const ctl = new AbortController();
  const stop = () => ctl.abort();
  req.signal?.addEventListener?.('abort', stop);
  const timer = setTimeout(stop, 55_000);
  let b64 = '';
  try {
    b64 = (await generateImage(tracked(new OpenAI({ apiKey: process.env.OPENAI_API_KEY }), 'ux-v0/assets'), cfg, prompt, ratio, ctl.signal)).b64;
  } catch (e) {
    // a call the trial's meter refused mid-request is resting, never a failure
    const asleep = sleepAnswer(e);
    if (asleep) return asleep;
    const status = (e as { status?: number })?.status;
    if (ctl.signal.aborted) return NextResponse.json({ error: 'Making the picture took too long, so SocriaUX stopped it. Nothing was kept.' }, { status: 504 });
    if (status === 429) return NextResponse.json({ error: 'The image provider is busy just now. Nothing was kept; try again in a minute.' }, { status: 503 });
    if (status === 400) return NextResponse.json({ error: 'The image provider declined that picture. Say what it should show differently.' }, { status: 422 });
    return NextResponse.json({ error: 'The picture could not be made just now. Nothing was kept.' }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
  const ok = checkImage(b64);
  if (!ok.ok) return NextResponse.json({ error: ok.error }, { status: 502 });
  const usage = { model: cfg.model, input: 0, cached: 0, output: 0, cost: price, stage: 'image' as const, tier: 'economy' as const, ms: Date.now() - t0 };
  await recordUsage(userId, projectId, 'image', usage, Date.now(), { api: 'images', orgId });
  return NextResponse.json({ image: { dataUrl: `data:${ok.mime};base64,${b64.replace(/\s/g, '')}`, mime: ok.mime, prompt, model: cfg.model, quality: cfg.quality, cost: price, size: sizeFor(ratio), createdAt: Date.now() }, usage });
});
