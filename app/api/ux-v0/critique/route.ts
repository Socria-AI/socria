// app/api/ux-v0/critique/route.ts
// POST → { reasoning, artifactSummary, usage } — a comment on a selection, reasoned about.
//
// The selection (lib/ux-v0/selection.ts), the comment, the card's earlier turns
// and the design around it go to the model (lib/ux-v0/critique.ts); images go
// as the selected crop, plus — once per imported image — a small thumbnail of
// the whole design, whose reading is returned and kept so it is never sent
// again. What comes back is held to evidence by the critique gate before the
// designer sees it. Nothing is stored here: the card lives in the project.

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
import { critiqueSystem, critiqueUser, gateReasoning, type CritiqueInput } from '@/lib/ux-v0/critique';
import { MAX_TOKENS, socriauxLadder } from '@/lib/ux-v0/model';
import { bad, failed, imageDataUrl, noModel, projectIdOf, readBody, signInFirst } from '@/lib/ux-v0/route-kit';
import { normalizeBrief, normalizeCard, normalizeSelection, VIEWPORTS, type CardTurn } from '@/lib/ux-v0/types';
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

  const body = await readBody(req);
  if (!body) return bad('A selection and a comment are needed.');
  const selection = normalizeSelection(body.selection);
  const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 2000) : '';
  if (!selection || !comment) return bad('A selection and a comment are needed.');
  // the card's earlier turns, through the card normaliser so nothing unshaped reaches the prompt
  const card = normalizeCard({ selection, turns: Array.isArray(body.history) && body.history.length ? body.history : [{ comment }] });
  const history: CardTurn[] = Array.isArray(body.history) && body.history.length ? card?.turns ?? [] : [];
  const kind = ['html', 'png', 'jpg', 'svg', 'generated'].includes(body.kind) ? body.kind : 'png';
  const thumb = imageDataUrl(body.thumb, 140_000);
  const input: CritiqueInput = {
    selection,
    comment,
    history: history.slice(-6),
    brief: normalizeBrief(body.brief),
    summary: typeof body.summary === 'string' ? body.summary.slice(0, 2400) : '',
    section: typeof body.section === 'string' ? body.section.slice(0, 1200) : '',
    kind,
    name: typeof body.name === 'string' ? body.name.slice(0, 120) : 'Design',
    viewport: VIEWPORTS.includes(body.viewport) ? body.viewport : null,
    wantsSummary: !!thumb,
  };
  const projectId = projectIdOf(body.projectId);

  const caps = await underCaps(userId, 'critique');
  if (!caps.ok) return NextResponse.json({ error: caps.error, limit: true }, { status: 429 });

  const plan = await resolvePlanForRequest(req, userId);
  const sleep = await sleepGate(req, userId, plan);
  if (sleep.refuse) return sleep.refuse;
  if (sleep.meter) meterFor(sleep.meter);

  const openai = tracked(new OpenAI({ apiKey }), 'ux-v0/critique');
  const images: { url: string; detail: 'low' | 'high' }[] = [];
  if (selection.crop) images.push({ url: selection.crop.dataUrl, detail: 'high' });
  if (thumb) images.push({ url: thumb, detail: 'low' });

  try {
    const asked = await askJson(openai, socriauxLadder(), {
      system: critiqueSystem(),
      user: critiqueUser(input),
      maxTokens: MAX_TOKENS.critique,
      temperature: 0.4,
      images,
      label: 'critique',
      format: formatFor('critique'),
    });
    const gated = gateReasoning(asked.json, input);
    await recordUsage(userId, projectId, 'critique', asked.usage);
    return NextResponse.json({ reasoning: gated.reasoning, artifactSummary: gated.artifactSummary, demoted: gated.demoted, usage: asked.usage });
  } catch (e) {
    // the week's last tokens taken by another request first: said as Sleep Mode, never as a failure
    const resting = sleepAnswer(e);
    if (resting) return resting;
    console.error('ux-v0 critique failed:', e instanceof Error ? e.message : e);
    return failed();
  }
});
