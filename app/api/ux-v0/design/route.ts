// app/api/ux-v0/design/route.ts
// POST { mode: 'write', words, … the design … }  → streamed: the designer's answer as it is written ({ type: 'text' })
//                                                   and, at the end, { text } — the whole answer.
// POST { mode: 'look', words, made, artboards, pictures, … } → the same, for one look at the rendered artboards.
//
// The designer writes the design itself, as HTML and CSS, in the tags of lib/ux-v0/design/protocol.ts. Nothing it
// writes is run here or trusted: the browser parses it, cleans every artboard (lib/ux-v0/design/elements.ts), and
// draws it in a sandboxed frame with no network (lib/ux-v0/design/frame.ts). This route reads what the browser sends
// into the designer's call (lib/ux-v0/design/request.ts, held to shapes and sizes there), asks the model through the
// shared stage runner (sign-in, budgets, concurrency, the call log, cancellation) and passes the answer on as it
// comes. A short, exact change goes to the economy tier; a design, a change of feel or a look, the premium or the
// look's own. Nothing is stored here.

import { NextRequest } from 'next/server';
import { withMeter } from '@/lib/token-meter';
import { MAX_TOKENS } from '@/lib/ux-v0/model';
import { bad, imageDataUrl, projectIdOf, readBodyPrinted } from '@/lib/ux-v0/route-kit';
import { admit, refuse, runStage } from '@/lib/ux-v0/stage-server';
import { readDesignRequest } from '@/lib/ux-v0/design/request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// a design is written in tens of seconds; a campaign of several artboards can take a few minutes
export const maxDuration = 300;

const budgetMs = () => {
  const n = parseInt(process.env.SOCRIAUX_DESIGN_BUDGET_MS ?? '', 10);
  return Number.isFinite(n) && n >= 20_000 ? Math.min(n, 290_000) : 280_000;
};

export const POST = withMeter(async function POST(req: NextRequest) {
  const a = await admit(req);
  if (!a.ok) return a.res;
  const { body, print } = await readBodyPrinted(req, 4_000_000);
  if (!body) return refuse(req, bad('The request is needed.'));
  const r = readDesignRequest(body, (v) => imageDataUrl(v, 900_000));
  if (!r.ok) return refuse(req, bad(r.error));
  const ctx = { userId: a.userId, orgId: a.orgId, projectId: projectIdOf(body.projectId), fingerprint: print };
  const look = r.mode === 'look';
  // a review is the designer's stage at its premium tier (judgement about the whole), answered briefly: findings only
  const review = r.mode === 'review';
  return runStage(req, ctx, {
    stage: look ? 'design-look' : 'design-write',
    operation: look ? 'look' : review ? 'review' : 'design',
    label: look ? 'ux-v0/design-look' : review ? 'ux-v0/design-review' : 'ux-v0/design-write',
    budgetMs: look || review ? Math.min(budgetMs(), 120_000) : budgetMs(),
    prompt: {
      system: r.system,
      user: r.user,
      maxTokens: review ? Math.min(MAX_TOKENS['design-write'], 4000) : MAX_TOKENS[look ? 'design-look' : 'design-write'],
      temperature: look || review ? 0.3 : 0.7,
      ...(r.images.length ? { images: r.images.map((url) => ({ url, detail: 'high' as const })), extraChars: 8000 * r.images.length } : {}),
      ...(look ? {} : { tier: r.tier }),
      cacheScope: 'design',
      plainText: true,
    },
    finish: (asked) => ({ body: { text: asked.raw, incomplete: asked.incomplete, model: asked.model, usage: asked.usage, tier: r.tier } }),
  });
});
