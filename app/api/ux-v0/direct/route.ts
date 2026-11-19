// app/api/ux-v0/direct/route.ts
// POST { brief, notes?, avoid?, base?, round?, seen? } → { options, usage }
//
// Art direction, before anything is drawn (lib/ux-v0/direction.ts). The engine
// chooses three visual languages for fit and for difference — deterministic
// and free, so the browser shows them at once without asking anyone — and
// this route has the model write each one's concept, rationale, voice,
// composition and imagery for THIS brand, and refine its faces from the list.
// Everything the model returns is laid back over the engine's directions by
// parseDirections: an unknown language, a font off the list or a change to a
// group the designer locked never reaches them. One small call. The operation
// itself is lib/ux-v0/stage-server.ts.

import { NextRequest } from 'next/server';
import { withMeter } from '@/lib/token-meter';
import { formatFor } from '@/lib/ux-v0/schemas';
import { directSystem, directUser, normalizeDirection, parseDirections, proposeDirections, saltOf, type DirectionAsk } from '@/lib/ux-v0/direction';
import { MAX_TOKENS } from '@/lib/ux-v0/model';
import { bad, projectIdOf, readBodyPrinted } from '@/lib/ux-v0/route-kit';
import { normalizeBrief } from '@/lib/ux-v0/types';
import { normalizeReading } from '@/lib/ux-v0/references';
import { admit, refuse, runStage } from '@/lib/ux-v0/stage-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export const POST = withMeter(async function POST(req: NextRequest) {
  const a = await admit(req);
  if (!a.ok) return a.res;

  const { body, print } = await readBodyPrinted(req, 200_000);
  const brief = normalizeBrief(body?.brief);
  if (!body || !brief) return refuse(req, bad('An approved brief is needed before choosing a direction.'));
  const ask: DirectionAsk = {
    brief,
    notes: text(body.notes, 1200),
    avoid: text(body.avoid, 400),
    base: body.base ? normalizeDirection(body.base) : null,
    round: Number.isFinite(body.round) ? Math.max(0, Math.min(99, Math.round(body.round))) : 0,
    seen: Array.isArray(body.seen) ? body.seen.filter((x: unknown): x is string => typeof x === 'string').slice(0, 24) : [],
    board: normalizeReading(body.board),
    // the project's own salt, as the browser drew them: the same directions on both sides
    salt: saltOf(body.projectId),
  };
  const options = proposeDirections(ask);

  // when it cannot be reached, the browser already shows the direction engine's three, and says the written concepts could not be fetched
  return runStage(req, { userId: a.userId, orgId: a.orgId, projectId: projectIdOf(body.projectId), fingerprint: print }, {
    stage: 'art-direction',
    operation: 'propose',
    label: 'ux-v0/direct',
    prompt: { system: directSystem(), user: directUser(ask, options), maxTokens: MAX_TOKENS['art-direction'], temperature: 0.8, format: formatFor('art-direction') },
    finish: (asked) => ({ body: { options: parseDirections(asked.json, ask, options) } }),
  });
});
