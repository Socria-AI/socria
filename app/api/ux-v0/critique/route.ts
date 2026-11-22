// app/api/ux-v0/critique/route.ts
// POST → { reasoning, artifactSummary, usage } — a comment on a selection, reasoned about.
//
// The selection (lib/ux-v0/selection.ts), the comment, the card's earlier turns
// and the design around it go to the model (lib/ux-v0/critique.ts); images go
// as the selected crop, plus — once per imported image — a small thumbnail of
// the whole design, whose reading is returned and kept so it is never sent
// again. What comes back is held to evidence by the critique gate before the
// designer sees it. Nothing is stored here: the card lives in the project.
//
// A short question about one selected part is economy work; a question about the whole design, or an image of
// a whole page, is premium (lib/ux-v0/model.ts critiqueTier). The operation itself is lib/ux-v0/stage-server.ts.

import { NextRequest } from 'next/server';
import { withMeter } from '@/lib/token-meter';
import { formatFor } from '@/lib/ux-v0/schemas';
import { critiqueSystem, critiqueUser, gateReasoning, type CritiqueInput } from '@/lib/ux-v0/critique';
import { MAX_TOKENS, critiqueTier } from '@/lib/ux-v0/model';
import { bad, imageDataUrl, projectIdOf, readBodyPrinted } from '@/lib/ux-v0/route-kit';
import { admit, refuse, runStage } from '@/lib/ux-v0/stage-server';
import { normalizeBrief, normalizeCard, normalizeSelection, VIEWPORTS, type CardTurn } from '@/lib/ux-v0/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = withMeter(async function POST(req: NextRequest) {
  const a = await admit(req);
  if (!a.ok) return a.res;

  const { body, print } = await readBodyPrinted(req);
  if (!body) return refuse(req, bad('A selection and a comment are needed.'));
  const selection = normalizeSelection(body.selection);
  const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 2000) : '';
  if (!selection || !comment) return refuse(req, bad('A selection and a comment are needed.'));
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
  const images: { url: string; detail: 'low' | 'high' }[] = [];
  if (selection.crop) images.push({ url: selection.crop.dataUrl, detail: 'high' });
  if (thumb) images.push({ url: thumb, detail: 'low' });
  const complexity = critiqueTier(comment, selection, !!thumb);

  return runStage(req, { userId: a.userId, orgId: a.orgId, projectId: projectIdOf(body.projectId), fingerprint: print }, {
    stage: 'critique',
    operation: 'critique',
    label: 'ux-v0/critique',
    prompt: {
      system: critiqueSystem(),
      user: critiqueUser(input),
      maxTokens: MAX_TOKENS.critique,
      temperature: 0.4,
      images,
      format: formatFor('critique'),
      tier: complexity.tier,
      extraChars: (selection.crop ? 3000 : 0) + (thumb ? 400 : 0),
    },
    finish: (asked) => {
      const gated = gateReasoning(asked.json, input);
      return { body: { reasoning: gated.reasoning, artifactSummary: gated.artifactSummary, demoted: gated.demoted, complexity } };
    },
  });
});
