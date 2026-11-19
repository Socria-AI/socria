// app/api/ux-v0/refine/route.ts
// POST { spec, brief, moodboard, selection?, comment, force, locks? } → { patch, applies, understood, challenge, question, regenerate, locked }
//
// A comment on part of a generated design becomes ONE typed patch
// (lib/ux-v0/design.ts, spec.ts). The patch is checked here against the spec
// it was made for; the client applies the same deterministic function, so the
// page changes only where the patch says. When SocriaUX has a concern about
// the change, it says so and the designer decides — the patch travels with
// the concern, so "apply anyway" needs no second call. A change to something
// the designer locked in the art direction is always such a concern: it is
// checked here in code (lockedChanges), not left to the model to notice.

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { auth } from '@clerk/nextjs/server';
import { tracked } from '@/lib/openai-usage';
import { enforceRateLimit } from '@/lib/rate-limit';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import { meterFor, sleepAnswer, sleepGate } from '@/lib/sleep-server';
import { withMeter } from '@/lib/token-meter';
import { askRouted } from '@/lib/ux-v0/ask';
import { budgets } from '@/lib/ux-v0/budget';
import { parseRefine, refineSystem, refineUser } from '@/lib/ux-v0/design';
import { LOCK_GROUPS, LOCK_LABEL, lockedChanges, type LockGroup } from '@/lib/ux-v0/direction';
import { MAX_TOKENS, economyRoute, refineTier } from '@/lib/ux-v0/model';
import { bad, failed, noModel, projectIdOf, readBody, signInFirst } from '@/lib/ux-v0/route-kit';
import { lockedTouched } from '@/lib/ux-v0/edit';
import { offSystem } from '@/lib/ux-v0/design-system';
import { applyPatch, kindDef, normalizeSpec } from '@/lib/ux-v0/spec';
import { normalizeBrief, normalizeMoodboard, normalizeSelection } from '@/lib/ux-v0/types';
import { gate, noticeOf, recordUsage } from '@/lib/ux-v0/usage-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withMeter(async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return signInFirst();
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return noModel();

  const body = await readBody(req, 600_000);
  const moodboard = normalizeMoodboard(body?.moodboard);
  const spec = normalizeSpec(body?.spec, moodboard);
  const comment = typeof body?.comment === 'string' ? body.comment.trim().slice(0, 2000) : '';
  if (!body || !spec || !comment) return bad('A design and a comment are needed.');
  const selection = body.selection ? normalizeSelection({ ...body.selection, crop: null }) : null;
  const force = body.force === true;
  const locks: LockGroup[] = Array.isArray(body.locks) ? [...new Set(body.locks.filter((x: unknown): x is LockGroup => typeof x === 'string' && (LOCK_GROUPS as readonly string[]).includes(x)))] : [];
  const projectId = projectIdOf(body.projectId);

  const system = refineSystem();
  const user = refineUser({ brief: normalizeBrief(body.brief), spec, moodboard, selection, comment, force, locks });
  // a small change to the selected part is economy work; a change to the whole, its structure or its feel is premium
  const complexity = refineTier(comment, selection);
  const g = await gate(userId, projectId, 'refine', system.length + user.length, { tier: complexity.tier });
  if (!g.ok) return NextResponse.json({ error: g.error, limit: true }, { status: 429 });

  const plan = await resolvePlanForRequest(req, userId);
  const sleep = await sleepGate(req, userId, plan);
  if (sleep.refuse) return sleep.refuse;
  if (sleep.meter) meterFor(sleep.meter);

  const openai = tracked(new OpenAI({ apiKey }), 'ux-v0/refine');
  try {
    const asked = await askRouted(openai, g.route, { system, user, maxTokens: MAX_TOKENS.refine, temperature: 0.4, label: 'refine', maxRetries: budgets().maxRetries }, economyRoute('refine'));
    const r = parseRefine(asked.json, force);
    // a locked decision is never changed silently: the designer is asked first
    const locked = lockedChanges(spec, r.patch, locks);
    if (locked.length && !force) {
      const what = locked.map((g) => LOCK_LABEL[g].toLowerCase()).join(' and ');
      r.challenge = `This changes the ${what}, which you locked in the art direction. ${r.challenge ? `${r.challenge} ` : ''}Make the change anyway?`.trim();
    }
    // …and neither is a section the designer locked on the canvas
    // a change that takes the design outside the designer's design system is asked about first, like a lock
    const ds = normalizeBrief(body.brief)?.system;
    const outside = ds ? offSystem(r.patch, ds) : [];
    if (outside.length && !force) r.challenge = `This uses ${outside.join(' and ')}, which ${outside.length > 1 ? 'are' : 'is'} not in your design system (${ds!.name}). ${r.challenge ? `${r.challenge} ` : ''}Make the change anyway?`.trim();
    const lockedSections = lockedTouched(spec, r.patch);
    if (lockedSections.length && !force) {
      const sec = spec.sections.find((s) => s.id === lockedSections[0]);
      const what = (sec && kindDef(sec.kind)?.label.toLowerCase()) || 'section';
      r.challenge = `This changes the ${what}, which you locked. ${r.challenge && !locked.length ? `${r.challenge} ` : ''}Make the change anyway?`.trim();
    }
    await recordUsage(userId, projectId, 'refine', asked.usage, Date.now(), { api: asked.api, downgraded: !!g.downgraded || !!asked.fellBack });
    const trial = r.patch.op === 'none' ? null : applyPatch(spec, r.patch, moodboard);
    return NextResponse.json({
      understood: r.understood,
      challenge: r.challenge,
      question: r.question,
      regenerate: r.regenerate,
      patch: r.patch,
      locked,
      lockedSections,
      applies: !!trial?.ok,
      error: trial && !trial.ok ? trial.error : '',
      usage: asked.usage,
      complexity: { tier: g.route.tier, why: complexity.why },
      ...noticeOf(g, asked),
    });
  } catch (e) {
    // the week's last tokens taken by another request first: said as Sleep Mode, never as a failure
    const resting = sleepAnswer(e);
    if (resting) return resting;
    console.error('ux-v0 refine failed:', e instanceof Error ? e.message : e);
    return failed();
  }
});
