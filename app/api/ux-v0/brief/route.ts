// app/api/ux-v0/brief/route.ts
// POST { action: 'synthesize' } → { brief } from the understanding and the kept references
// POST { action: 'refine', current, instruction } → { brief, queries } changed as asked (queries: new searches
//   for the board, only when the change moved the visual direction)
//
// The brief (lib/ux-v0/design.ts) is the designer's to review, edit and approve;
// direct edits never come here. Fonts outside the allowlist, invalid colours
// and references that were not kept are corrected by the normaliser. The layout decisions
// (what leads, the arrangement, the alignment, the pictures) are settled in code, never by the model.
// The operation itself is lib/ux-v0/stage-server.ts.

import { NextRequest } from 'next/server';
import { withMeter } from '@/lib/token-meter';
import { formatFor } from '@/lib/ux-v0/schemas';
import { designerWords, pageTypeFor, settleIntent } from '@/lib/ux-v0/intent';
import { briefSystem, briefUser, parseBrief, type BriefInput, briefQueries } from '@/lib/ux-v0/design';
import { readLayout, settleLayout } from '@/lib/ux-v0/layout';
import { briefTells, tellQuestion } from '@/lib/ux-v0/tells';
import { briefWithSystem } from '@/lib/ux-v0/design-system';
import { MAX_TOKENS } from '@/lib/ux-v0/model';
import { bad, projectIdOf, readBodyPrinted } from '@/lib/ux-v0/route-kit';
import { admit, refuse, runStage } from '@/lib/ux-v0/stage-server';
import { normalizeBrief, normalizeDiscovery, normalizeMoodboard } from '@/lib/ux-v0/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = withMeter(async function POST(req: NextRequest) {
  const a = await admit(req);
  if (!a.ok) return a.res;

  const { body, print } = await readBodyPrinted(req, 400_000);
  const intent = typeof body?.intent === 'string' ? body.intent.trim().slice(0, 1200) : '';
  if (!body || !intent) return refuse(req, bad('Say what you want to make first.'));
  const refining = body.action === 'refine';
  const moodboard = normalizeMoodboard(body.moodboard);
  const discovery = normalizeDiscovery({ questions: body.questions, understanding: body.understanding });
  const current = refining ? normalizeBrief(body.current) : null;
  const instruction = typeof body.instruction === 'string' ? body.instruction.trim().slice(0, 800) : '';
  if (refining && (!current || !instruction)) return refuse(req, bad('Say what to change in the brief.'));
  const input: BriefInput = { intent, understanding: discovery.understanding, questions: discovery.questions, moodboard, current, instruction };
  const kind = refining ? 'refine-brief' : 'brief';

  return runStage(req, { userId: a.userId, orgId: a.orgId, projectId: projectIdOf(body.projectId), fingerprint: print }, {
    stage: kind,
    operation: refining ? 'revise' : 'synthesize',
    label: `ux-v0/${kind}`,
    prompt: { system: briefSystem(refining), user: briefUser(input), maxTokens: MAX_TOKENS[kind], temperature: 0.4, format: formatFor(kind), cacheScope: refining ? 'revise' : 'synthesize' },
    finish: (asked) => {
      const parsed = parseBrief(asked.json, moodboard);
      if (!parsed) return { status: 502, body: { error: 'SocriaUX could not write a usable brief from that. Try again, or write it yourself.' } };
      // WHAT IS BEING MADE, from the designer's own words (lib/ux-v0/intent.ts): a booking screen stays a booking
      // screen whatever the prose says, and a correction the designer made survives the rewrite
      const intentNow = settleIntent(designerWords(intent, discovery.questions, instruction), { briefKind: (asked.json as any)?.experienceKind, current: current?.intent ?? null, override: body.experience });
      // THE LAYOUT DECISIONS (lib/ux-v0/layout.ts): read from the designer's words and their answer to the layout
      // question; what they set in the brief stays set, and this rewrite's own instruction is the newest word
      const prior = (current ?? normalizeBrief(body.current))?.layout;
      const words = designerWords(intent, discovery.questions, instruction);
      const layout = settleLayout(words, discovery.questions, prior, intentNow, instruction);
      const density = readLayout(words).density;
      const spec = !parsed.spec?.density && density ? { ...(parsed.spec ?? {}), density } : parsed.spec;
      const { layout: _fromModel, system: _alsoNot, ...prose } = parsed; // never the model's to decide
      // a proposed palette that falls into a look generated pages share, which the designer's words did not ask for, is
      // said as a question still open (lib/ux-v0/tells.ts): the brief is theirs to approve, so it is not changed behind them
      const flagged = (current ?? normalizeBrief(body.current))?.system ? [] : briefTells(prose, words).map(tellQuestion).filter((q) => !prose.openQuestions.includes(q));
      const drafted = { ...prose, openQuestions: [...prose.openQuestions, ...flagged].slice(-6), intent: intentNow, pageType: pageTypeFor(intentNow, parsed.pageType), ...(layout ? { layout } : {}), ...(spec ? { spec } : {}) };
      // the designer's design system, when one is attached, stays attached and the brief stays built within it
      const ds = (current ?? normalizeBrief(body.current))?.system;
      const brief = ds ? briefWithSystem(drafted, ds) : drafted;
      // a refinement that moved the visual direction brings new searches for the board
      return { body: { brief, queries: refining ? briefQueries(asked.json, moodboard) : [] } };
    },
  });
});
