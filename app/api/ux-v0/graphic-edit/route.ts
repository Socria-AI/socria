// app/api/ux-v0/graphic-edit/route.ts
// POST → { plan } — a creative change asked in words, read by the model into a plan of design decisions.
//
// The browser sends the words, a compact reading of the design (lib/ux-v0/graphics/creative/model.ts readingOf: the
// artboard, its objects' roles, words, faces and colours, the palette and type, each creative decision and where it
// came from, what is locked, the concepts kept), the question it asked last and the turns before. The model writes a
// plan in the engine's vocabulary under a strict schema; normalizePlan holds it to its shape again (a colour that is
// not a colour, a font off the list, words the designer did not write are dropped). The plan is carried out in the
// browser, by the engine, and previewed before anything is applied. Nothing is stored here.
//
// When the model cannot be reached the browser reads the words itself (creative/interpret.ts), so a creative change
// never depends on this route answering.

import { NextRequest } from 'next/server';
import { withMeter } from '@/lib/token-meter';
import { formatFor } from '@/lib/ux-v0/schemas';
import { MAX_TOKENS } from '@/lib/ux-v0/model';
import { bad, projectIdOf, readBodyPrinted } from '@/lib/ux-v0/route-kit';
import { admit, refuse, runStage } from '@/lib/ux-v0/stage-server';
import { creativeSystem, creativeUser, normalizeReading } from '@/lib/ux-v0/graphics/creative/model';
import { normalizePlan, normalizeQuestion } from '@/lib/ux-v0/graphics/creative/plan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const text = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');

export const POST = withMeter(async function POST(req: NextRequest) {
  const a = await admit(req);
  if (!a.ok) return a.res;

  const { body, print } = await readBodyPrinted(req, 200_000);
  if (!body) return refuse(req, bad('The words and the design are needed.'));
  const words = text(body.words, 600);
  const reading = normalizeReading(body.reading);
  if (!words || !reading) return refuse(req, bad('The words and the design are needed.'));
  const asked = normalizeQuestion(body.asked);
  const recent = (Array.isArray(body.recent) ? body.recent : [])
    .slice(-4)
    .map((t: Record<string, unknown>) => ({ said: text(t?.said, 160), did: text(t?.did, 200) }))
    .filter((t: { said: string }) => t.said);

  return runStage(req, { userId: a.userId, orgId: a.orgId, projectId: projectIdOf(body.projectId), fingerprint: print }, {
    stage: 'creative-edit',
    operation: 'plan',
    label: 'ux-v0/graphic-edit',
    prompt: {
      system: creativeSystem(),
      user: creativeUser(words, reading, asked, recent),
      maxTokens: MAX_TOKENS['creative-edit'],
      temperature: 0.3,
      format: formatFor('creative-edit'),
      cacheScope: 'creative-edit',
    },
    finish: (asked) => {
      const plan = normalizePlan(asked.json, words, 'model');
      if (!plan) return { status: 422, body: { error: 'The reading came back without a change SocriaUX can make.', unreadable: true } };
      return { body: { plan } };
    },
  });
});
