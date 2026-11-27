// app/api/ux-v0/studio-questions/route.ts
// POST { context, images? } → { decision } — the next turn of creative discovery, decided by the question model.
//
// The browser sends the conversation as it stands (lib/ux-v0/studio/discover.ts discoverContextOf: every turn in words,
// the brief so far, how many questions were asked, which aids were shown) and, when the person brought pictures, up to
// two of them, so they are actually looked at. The model answers under a strict schema (lib/ux-v0/studio/discover-
// model.ts): one question — written for this work, with a palette, type or mood aid only when seeing would help — or
// "make it", and the brief, updated in the person's own words. normalizeDecision holds it to shape and to the
// conversation's rules again. Nothing is stored here.
//
// When the model cannot be reached the browser's own reader decides (discover.ts readerDecision), so a conversation
// never waits on this route answering.

import { NextRequest } from 'next/server';
import { withMeter } from '@/lib/token-meter';
import { formatFor } from '@/lib/ux-v0/schemas';
import { MAX_TOKENS } from '@/lib/ux-v0/model';
import { bad, imageDataUrl, projectIdOf, readBodyPrinted } from '@/lib/ux-v0/route-kit';
import { admit, refuse, runStage } from '@/lib/ux-v0/stage-server';
import { discoverSystem, discoverUser, normalizeDecision, normalizeDiscoverContext } from '@/lib/ux-v0/studio/discover-model';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = withMeter(async function POST(req: NextRequest) {
  const a = await admit(req);
  if (!a.ok) return a.res;

  const { body, print } = await readBodyPrinted(req, 1_500_000);
  if (!body) return refuse(req, bad('The conversation is needed.'));
  const context = normalizeDiscoverContext(body.context);
  if (!context) return refuse(req, bad('The conversation is needed.'));
  const images = (Array.isArray(body.images) ? body.images : [])
    .slice(0, 2)
    .map((v: unknown) => imageDataUrl(v, 600_000))
    .filter((u: string | null): u is string => !!u);

  return runStage(req, { userId: a.userId, orgId: a.orgId, projectId: projectIdOf(body.projectId), fingerprint: print }, {
    stage: 'studio-questions',
    operation: 'question',
    label: 'ux-v0/studio-questions',
    prompt: {
      system: discoverSystem(),
      user: discoverUser(context),
      maxTokens: MAX_TOKENS['studio-questions'],
      temperature: 0.6,
      format: formatFor('studio-questions'),
      cacheScope: 'studio-questions',
      ...(images.length ? { images: images.map((url) => ({ url, detail: 'low' as const })), extraChars: 3000 * images.length } : {}),
    },
    finish: (asked) => {
      const decision = normalizeDecision(asked.json, context);
      if (!decision) return { status: 422, body: { error: 'The answer came back in a shape SocriaUX cannot use.', unreadable: true } };
      return { body: { decision } };
    },
  });
});
