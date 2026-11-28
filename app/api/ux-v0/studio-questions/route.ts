// app/api/ux-v0/studio-questions/route.ts
// POST { context, images? } → { plan } — the spatial creative brief updated, by the question model.
//
// The browser sends the brief as it stands (lib/ux-v0/studio/discover.ts spaceContextOf: their idea, each
// consideration with its status and answer, their notes, what changed last, the creative brief so far, which aids were
// shown) and, when the person brought pictures, up to two of them, so they are actually looked at. The model answers
// under a strict schema (lib/ux-v0/studio/discover-model.ts): the considerations worth showing now — each a question
// written for this work, sometimes with palettes, pairings of faces or moods — a short line on what it took from the
// change, whether anything essential is missing, and the brief in the person's own words. normalizePlan holds it to
// shape and to the brief's rules again. Nothing is stored here.
//
// When the model cannot be reached the browser's own reader plans (discover.ts readerPlan), so the brief never waits
// on this route answering.

import { NextRequest } from 'next/server';
import { withMeter } from '@/lib/token-meter';
import { formatFor } from '@/lib/ux-v0/schemas';
import { MAX_TOKENS } from '@/lib/ux-v0/model';
import { bad, imageDataUrl, projectIdOf, readBodyPrinted } from '@/lib/ux-v0/route-kit';
import { admit, refuse, runStage } from '@/lib/ux-v0/stage-server';
import { discoverSystem, discoverUser, normalizePlan, normalizeSpaceContext } from '@/lib/ux-v0/studio/discover-model';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = withMeter(async function POST(req: NextRequest) {
  const a = await admit(req);
  if (!a.ok) return a.res;

  const { body, print } = await readBodyPrinted(req, 1_500_000);
  if (!body) return refuse(req, bad('The brief is needed.'));
  const context = normalizeSpaceContext(body.context);
  if (!context) return refuse(req, bad('The brief is needed.'));
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
      const plan = normalizePlan(asked.json, context);
      if (!plan) return { status: 422, body: { error: 'The answer came back in a shape SocriaUX cannot use.', unreadable: true } };
      return { body: { plan } };
    },
  });
});
