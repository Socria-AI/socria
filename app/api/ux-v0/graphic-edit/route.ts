// app/api/ux-v0/graphic-edit/route.ts
// POST { words, sheet, … } → { edit } — a change asked in words, read against the design by the creative director.
//
// The browser sends the person's words exactly as written, the design as a sheet (lib/ux-v0/graphics/director/sheet.ts:
// every object by its stable id with what it is, its words, face, size, colour and place; the palette by role; the two
// faces; the reading order), the project's memory (the brief, the idea, the journal of earlier turns with what was
// kept and what was turned down, an attached brand's constraints) and, when it could draw one, a picture of the
// design as rendered. The director answers with what it understood (the level of the request, what it affects, what
// it preserves), then edits by object id — or one question when two readings would give different designs. What the
// person said to keep is read from their words here as well (protect.ts) and told to the director; the browser
// enforces it again when the edits are carried out (apply.ts). The answer is held to its shape (schema.ts): an id
// that is not on the design, a face off the library, a value that is not one are dropped and said.
//
// When this route cannot answer, the browser's own reader carries on (creative/interpret.ts), and says so.

import { NextRequest } from 'next/server';
import { withMeter } from '@/lib/token-meter';
import { MAX_TOKENS, editTier } from '@/lib/ux-v0/model';
import { bad, imageDataUrl, projectIdOf, readBodyPrinted } from '@/lib/ux-v0/route-kit';
import { admit, refuse, runStage } from '@/lib/ux-v0/stage-server';
import { normalizeQuestion } from '@/lib/ux-v0/graphics/creative/plan';
import { directorSystem } from '@/lib/ux-v0/graphics/director/principles';
import { editUser } from '@/lib/ux-v0/graphics/director/prompts';
import { protectionsIn } from '@/lib/ux-v0/graphics/director/protect';
import { normalizeEdit } from '@/lib/ux-v0/graphics/director/schema';
import { normalizeMemory, normalizeSheet } from '@/lib/ux-v0/graphics/director/sheet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const text = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, n) : '');

export const POST = withMeter(async function POST(req: NextRequest) {
  const a = await admit(req);
  if (!a.ok) return a.res;

  const { body, print } = await readBodyPrinted(req, 900_000);
  if (!body) return refuse(req, bad('The words and the design are needed.'));
  const words = text(body.words, 900);
  const sheet = normalizeSheet(body.sheet);
  if (!words || !sheet) return refuse(req, bad('The words and the design are needed.'));
  const asked = normalizeQuestion(body.asked);
  const picture = imageDataUrl(body.picture, 700_000);
  const ids = new Set(sheet.objects.map((o) => o.id));
  const protection = protectionsIn(words);
  const tier = editTier(words);

  return runStage(req, { userId: a.userId, orgId: a.orgId, projectId: projectIdOf(body.projectId), fingerprint: print }, {
    stage: 'creative-edit',
    operation: 'edit',
    label: 'ux-v0/graphic-edit',
    prompt: {
      system: directorSystem(),
      user: editUser({ words, sheet, memory: normalizeMemory(body.memory), asked: asked ? { text: asked.text, options: asked.options.map((o) => o.label) } : null, protectedSaid: protection.said, hasPicture: !!picture }),
      maxTokens: MAX_TOKENS['creative-edit'],
      temperature: 0.4,
      tier: tier.tier,
      ...(picture ? { images: [{ url: picture, detail: 'high' as const }], extraChars: 6000 } : {}),
      cacheScope: 'director',
    },
    finish: (answered) => {
      const edit = normalizeEdit(answered.json, { ids, given: words });
      if (!edit) return { status: 422, body: { error: answered.incomplete ? 'The change was cut short before it was complete.' : 'The reading came back without a change SocriaUX can make.', unreadable: true } };
      return { body: { edit, complexity: tier } };
    },
  });
});
