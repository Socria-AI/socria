// app/api/ux-v0/generate/route.ts
// POST { brief, moodboard, artDirection?, direction?, version, dna? } → { spec, artDirection, placeholders, dnaHeld }
//
// The approved brief becomes a DesignSpec (lib/ux-v0/design.ts, spec.ts): tokens
// and sections from the library, real copy, moodboard images only. The client
// renders it (lib/ux-v0/render.ts) — the model never writes HTML. One call per
// generation; generations have their own daily cap.
//
// The page follows an art direction (lib/ux-v0/direction.ts): the one the
// designer approved, or — when they left it to SocriaUX — the engine's most
// faithful reading of the brief. Its tokens and look are applied in code,
// whatever the model writes; the model chooses sections, variants and copy
// that serve it. A new direction in words revises the approved one and keeps
// every group the designer locked.
//
// The project's Creative DNA (lib/ux-v0/dna.ts) shapes SocriaUX's own direction when none was approved, tells the
// model what sections and copy it asks for, and is held in code afterwards: a dimension the designer locked that
// the generated page drifted from is moved back (fitDNA), and the answer says which.
//
// A design that does not hold together never replaces the one on the canvas: the
// answer is refused, and the browser keeps what it had. The operation itself —
// once, on a deadline, streamed, cancellable, recorded — is lib/ux-v0/stage-server.ts.

import { NextRequest } from 'next/server';
import { withMeter } from '@/lib/token-meter';
import { generateSystem, generateUser, parseGenerate } from '@/lib/ux-v0/design';
import { autoDirection, languageOf, normalizeDirection, reviseDirection, saltOf } from '@/lib/ux-v0/direction';
import { fitDNA, normalizeDNA } from '@/lib/ux-v0/dna';
import { pingUse } from '@/lib/ux-v0/images-server';
import { pageTypeFor, intentOf } from '@/lib/ux-v0/intent';
import { MAX_TOKENS } from '@/lib/ux-v0/model';
import { bad, projectIdOf, readBodyPrinted } from '@/lib/ux-v0/route-kit';
import { applyPatch, placeholdersIn, type DesignSpec } from '@/lib/ux-v0/spec';
import { admit, refuse, runStage } from '@/lib/ux-v0/stage-server';
import { normalizeBrief, normalizeMoodboard } from '@/lib/ux-v0/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = withMeter(async function POST(req: NextRequest) {
  const a = await admit(req);
  if (!a.ok) return a.res;

  const { body, print } = await readBodyPrinted(req, 400_000);
  const moodboard = normalizeMoodboard(body?.moodboard);
  const kept = new Set(moodboard.refs.filter((r) => r.state === 'kept').map((r) => r.id));
  const brief = normalizeBrief(body?.brief, kept);
  if (!body || !brief) return refuse(req, bad('An approved brief is needed to generate a design.'));
  const direction = typeof body.direction === 'string' ? body.direction.trim().slice(0, 400) : '';
  const approved = body.artDirection ? normalizeDirection(body.artDirection) : null;
  // the approved direction; revised in words when the designer asked for a new one; else SocriaUX's own choice
  // (composed for this project: the same brief in another project is laid out differently)
  const salt = saltOf(body.projectId);
  const dna = normalizeDNA(body.dna) ?? null;
  const art = approved ? (direction ? reviseDirection(approved, brief, direction, '', salt, dna) : approved) : autoDirection(brief, direction, '', salt, dna);
  const version = Number.isFinite(body.version) ? Math.max(1, Math.round(body.version)) : 1;
  const pageType = pageTypeFor(intentOf(brief), brief.pageType);

  return runStage(req, { userId: a.userId, orgId: a.orgId, projectId: projectIdOf(body.projectId), fingerprint: print }, {
    stage: 'generate',
    operation: 'generate',
    label: 'ux-v0/generate',
    // the generator's prompt opens with what every project at this kind of page shares, so a provider can read it
    // from its cache (lib/ux-v0/design.ts generateSystem)
    prompt: { system: generateSystem(brief, art), user: generateUser({ brief, moodboard, direction, dna }), maxTokens: MAX_TOKENS.generate, temperature: 0.6, cacheScope: `${pageType}:${art ? 'directed' : 'free'}` },
    finish: (asked) => {
      const made = parseGenerate(asked.json, brief, moodboard, version, direction ? `Generated again: ${direction}` : `Generated in the “${art.name}” direction`, art);
      if (!made) return { status: 502, body: { error: 'The model’s design did not hold together. Nothing changed; try again.' } };
      // what the designer locked in the Creative DNA holds, whatever the model wrote
      const held = fitDNA(made, dna, (s, p) => {
        const r = applyPatch(s, p, moodboard);
        return r.ok ? r.spec : null;
      }, { lang: languageOf(art.language) ?? null, kind: intentOf(brief).kind, hasImages: (brief.references ?? []).length > 0, locks: art.locks, keepColours: art.locks.includes('palette') || !!brief.system, keepType: art.locks.includes('type') || !!brief.system });
      const spec = held.spec;
      return { body: { spec, artDirection: art, placeholders: placeholdersIn(spec), dnaHeld: held.held } };
    },
    // Unsplash asks to be told when a photo is used in a design: after the design is on its way
    after: async (answer) => {
      const spec = answer.body.spec as DesignSpec | undefined;
      if (!spec) return;
      const used = new Set(spec.sections.flatMap((s) => s.images));
      await Promise.all(moodboard.refs.filter((r) => used.has(r.id)).map((r) => pingUse(r)));
    },
  });
});
