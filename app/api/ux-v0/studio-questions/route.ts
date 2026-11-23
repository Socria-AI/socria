// app/api/ux-v0/studio-questions/route.ts
// POST → { ready, question } — the studio's next creative question, written by the model for this brief.
//
// The browser sends the conversation as it stands, compact and in words (lib/ux-v0/studio/discovery-model.ts
// questionContextOf: what the person asked for and has said since, what is already known and decided, the questions
// asked with their answers, what SocriaUX's own reader would ask next, how many questions are left). The model answers
// under a strict schema: one question with options generated for this brief — palettes, pairings of faces from the
// font library, moods in the engine's vocabulary, or suggested answers — or "ready" when the brief is enough.
// normalizeQuestionAnswer holds it to its shape and to the conversation's rules again (nothing asked twice, nothing
// the brief already says, never past the budget, never a third visual question). Nothing is stored here.
//
// When the model cannot be reached the browser asks the reader's question (studio/discovery.ts discoveryQuestion), so
// the conversation never depends on this route answering.

import { NextRequest } from 'next/server';
import { withMeter } from '@/lib/token-meter';
import { formatFor } from '@/lib/ux-v0/schemas';
import { MAX_TOKENS } from '@/lib/ux-v0/model';
import { bad, projectIdOf, readBodyPrinted } from '@/lib/ux-v0/route-kit';
import { admit, refuse, runStage } from '@/lib/ux-v0/stage-server';
import { normalizeQuestionAnswer, normalizeQuestionContext, questionsSystem, questionsUser } from '@/lib/ux-v0/studio/discovery-model';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = withMeter(async function POST(req: NextRequest) {
  const a = await admit(req);
  if (!a.ok) return a.res;

  const { body, print } = await readBodyPrinted(req, 60_000);
  if (!body) return refuse(req, bad('The conversation is needed.'));
  const context = normalizeQuestionContext(body.context);
  if (!context) return refuse(req, bad('The conversation is needed.'));
  // nothing left to ask: the work is made, without a model call
  if (context.remaining <= 0) return Response.json({ ready: true, question: null });

  return runStage(req, { userId: a.userId, orgId: a.orgId, projectId: projectIdOf(body.projectId), fingerprint: print }, {
    stage: 'studio-questions',
    operation: 'question',
    label: 'ux-v0/studio-questions',
    prompt: {
      system: questionsSystem(),
      user: questionsUser(context),
      maxTokens: MAX_TOKENS['studio-questions'],
      temperature: 0.7,
      format: formatFor('studio-questions'),
      cacheScope: 'studio-questions',
    },
    finish: (asked) => {
      const answer = normalizeQuestionAnswer(asked.json, context);
      if (!answer.ready && !answer.question) return { status: 422, body: { error: 'The question came back in a shape SocriaUX cannot use.', unreadable: true } };
      return { body: answer };
    },
  });
});
