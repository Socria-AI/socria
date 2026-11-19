// app/api/ux-v0/discover/route.ts
// POST { action: 'turn' } → the next question(s), the understanding, moodboard queries, ready
// POST { action: 'direction', aspect } → a contrasting direction for one aspect of the moodboard
//
// Socratic discovery (lib/ux-v0/discovery.ts): a question or two at a time,
// never a topic twice, moodboard queries only when the visual direction moved.
// Text only — no images are sent — so a turn is cheap. Nothing is stored here.
// The one layout question (what leads) is added here, not written by the model.
// The operation itself — once, on a deadline, streamed, cancellable, recorded —
// is lib/ux-v0/stage-server.ts.

import { NextRequest } from 'next/server';
import { withMeter } from '@/lib/token-meter';
import { formatFor } from '@/lib/ux-v0/schemas';
import { ASPECTS, directionSystem, directionUser, discoverSystem, discoverUser, parseDirection, parseDiscover, withLayoutQuestion, type Aspect, type DiscoverInput } from '@/lib/ux-v0/discovery';
import { MAX_TOKENS } from '@/lib/ux-v0/model';
import { bad, projectIdOf, readBodyPrinted } from '@/lib/ux-v0/route-kit';
import { admit, refuse, runStage } from '@/lib/ux-v0/stage-server';
import { normalizeDiscovery, normalizeMoodboard } from '@/lib/ux-v0/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = withMeter(async function POST(req: NextRequest) {
  const a = await admit(req);
  if (!a.ok) return a.res;

  const { body, print } = await readBodyPrinted(req, 400_000);
  const intent = typeof body?.intent === 'string' ? body.intent.trim().slice(0, 1200) : '';
  if (!body || !intent) return refuse(req, bad('Say what you want to make first.'));
  const action = body.action === 'direction' ? 'direction' : 'turn';
  const aspect: Aspect = ASPECTS.includes(body.aspect) ? body.aspect : 'imagery';
  const discovery = normalizeDiscovery({ questions: body.questions, understanding: body.understanding });
  const input: DiscoverInput = {
    intent,
    questions: discovery.questions,
    understanding: discovery.understanding,
    moodboard: normalizeMoodboard(body.moodboard),
    remark: typeof body.remark === 'string' ? body.remark.trim().slice(0, 800) : '',
  };
  const kind = action === 'direction' ? 'direction' : 'discover';

  return runStage(req, { userId: a.userId, orgId: a.orgId, projectId: projectIdOf(body.projectId), fingerprint: print }, {
    stage: kind,
    operation: action,
    label: `ux-v0/${kind}`,
    prompt: {
      system: action === 'direction' ? directionSystem() : discoverSystem(),
      user: action === 'direction' ? directionUser(input, aspect) : discoverUser(input),
      maxTokens: MAX_TOKENS[kind],
      temperature: action === 'direction' ? 0.8 : 0.5,
      format: formatFor(kind, aspect),
      cacheScope: action === 'direction' ? aspect : '',
    },
    // the one layout question is SocriaUX's own, drawn as sketches from the designer's words (lib/ux-v0/layout.ts)
    finish: (asked) => ({ body: action === 'direction' ? { ...parseDirection(asked.json, input, aspect) } : { ...withLayoutQuestion(parseDiscover(asked.json, input), input) } }),
  });
});
