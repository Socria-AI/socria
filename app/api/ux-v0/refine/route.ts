// app/api/ux-v0/refine/route.ts
// POST { spec, brief, moodboard, selection?, comment, force, locks?, dna? } → { patch, applies, understood, challenge, question, regenerate, locked, dnaMoved }
//
// A comment on part of a generated design becomes ONE typed patch
// (lib/ux-v0/design.ts, spec.ts). The patch is checked here against the spec
// it was made for; the client applies the same deterministic function, so the
// page changes only where the patch says. When SocriaUX has a concern about
// the change, it says so and the designer decides — the patch travels with
// the concern, so "apply anyway" needs no second call. A change to something
// the designer locked in the art direction is always such a concern: it is
// checked here in code (lockedChanges), not left to the model to notice. So is a
// change that moves the page away from a dimension the designer locked in the
// Creative DNA (lib/ux-v0/dna.ts lockedDnaMoves): read from the page before and
// after, in code.
//
// The everyday small changes (a colour, a typeface, the corners, new words for
// a field, the headline's size) are read in code first (lib/ux-v0/quick-edit.ts)
// and answered at once, with no model and no charge; the browser does the same
// before it ever calls here. Everything else is one model call, run by
// lib/ux-v0/stage-server.ts. Nothing here regenerates the page.

import { NextRequest, NextResponse } from 'next/server';
import { withMeter } from '@/lib/token-meter';
import { parseRefine, refineSystem, refineUser } from '@/lib/ux-v0/design';
import { LOCK_GROUPS, LOCK_LABEL, lockedChanges, type LockGroup } from '@/lib/ux-v0/direction';
import { MAX_TOKENS, refineTier } from '@/lib/ux-v0/model';
import { bad, projectIdOf, readBodyPrinted } from '@/lib/ux-v0/route-kit';
import { lockedTouched } from '@/lib/ux-v0/edit';
import { offSystem } from '@/lib/ux-v0/design-system';
import { readQuickEdit } from '@/lib/ux-v0/quick-edit';
import { DNA_META, lockedDnaMoves, normalizeDNA, type CreativeDNA } from '@/lib/ux-v0/dna';
import { applyPatch, kindDef, normalizeSpec, type DesignSpec, type Patch } from '@/lib/ux-v0/spec';
import { admit, refuse, respondOnce, runStage } from '@/lib/ux-v0/stage-server';
import { normalizeBrief, normalizeMoodboard, normalizeSelection, type DesignBrief, type Moodboard } from '@/lib/ux-v0/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** A patch's concerns before it is applied: what the designer locked, their Creative DNA, their design system, a locked section. */
function concerns(spec: DesignSpec, patch: Patch, locks: LockGroup[], brief: DesignBrief | null, force: boolean, challenge: string, moodboard: Moodboard, dna: CreativeDNA | null) {
  const locked = lockedChanges(spec, patch, locks);
  let said = challenge;
  // a change that moves the page away from a dimension locked in the Creative DNA is asked about first
  const trial = dna && patch.op !== 'none' ? applyPatch(spec, patch, moodboard) : null;
  const dnaMoved = trial?.ok ? lockedDnaMoves(spec, trial.spec, dna) : [];
  if (dnaMoved.length && !force) {
    const what = dnaMoved.map((k) => DNA_META[k].label.toLowerCase()).join(' and ');
    said = `This moves the ${what} away from where you locked it in the Creative DNA. ${said ? `${said} ` : ''}Make the change anyway?`.trim();
  }
  if (locked.length && !force) {
    const what = locked.map((g) => LOCK_LABEL[g].toLowerCase()).join(' and ');
    said = `This changes the ${what}, which you locked in the art direction. ${said ? `${said} ` : ''}Make the change anyway?`.trim();
  }
  // a change that takes the design outside the designer's design system is asked about first, like a lock
  const ds = brief?.system;
  const outside = ds ? offSystem(patch, ds) : [];
  if (outside.length && !force) said = `This uses ${outside.join(' and ')}, which ${outside.length > 1 ? 'are' : 'is'} not in your design system (${ds!.name}). ${said ? `${said} ` : ''}Make the change anyway?`.trim();
  // …and neither is a section the designer locked on the canvas
  const lockedSections = lockedTouched(spec, patch);
  if (lockedSections.length && !force) {
    const sec = spec.sections.find((s) => s.id === lockedSections[0]);
    const what = (sec && kindDef(sec.kind)?.label.toLowerCase()) || 'section';
    said = `This changes the ${what}, which you locked. ${said && !locked.length ? `${said} ` : ''}Make the change anyway?`.trim();
  }
  return { locked, lockedSections, dnaMoved, challenge: said };
}

function trialOf(spec: DesignSpec, patch: Patch, moodboard: Moodboard) {
  const trial = patch.op === 'none' ? null : applyPatch(spec, patch, moodboard);
  return { applies: !!trial?.ok, error: trial && !trial.ok ? trial.error : '' };
}

export const POST = withMeter(async function POST(req: NextRequest) {
  const a = await admit(req);
  if (!a.ok) return a.res;

  const { body, print } = await readBodyPrinted(req, 600_000);
  const moodboard = normalizeMoodboard(body?.moodboard);
  const spec = normalizeSpec(body?.spec, moodboard);
  const comment = typeof body?.comment === 'string' ? body.comment.trim().slice(0, 2000) : '';
  if (!body || !spec || !comment) return refuse(req, bad('A design and a comment are needed.'));
  const selection = body.selection ? normalizeSelection({ ...body.selection, crop: null }) : null;
  const force = body.force === true;
  const locks: LockGroup[] = Array.isArray(body.locks) ? [...new Set(body.locks.filter((x: unknown): x is LockGroup => typeof x === 'string' && (LOCK_GROUPS as readonly string[]).includes(x)))] : [];
  const brief = normalizeBrief(body.brief);
  const dna = normalizeDNA(body.dna) ?? null;
  const stream = /application\/x-ndjson/.test(req.headers.get('accept') ?? '');

  // the everyday small changes: read in code, answered at once — no model, no charge, nothing regenerated
  const quick = readQuickEdit(comment, spec, selection);
  if (quick && quick.patches.length === 0) {
    // already so: nothing to change, and no model asked to find that out
    const said = `Nothing to change: ${quick.label}.`;
    const out = { understood: said, challenge: '', question: '', regenerate: '', patch: { op: 'none', summary: '' }, locked: [], lockedSections: [], applies: false, error: said, usage: null, complexity: { tier: null, why: 'done in code: nothing to change' }, deterministic: true };
    return stream ? respondOnce(true, { status: 200, body: out }) : NextResponse.json(out);
  }
  if (quick && quick.patches.length === 1) {
    const patch = quick.patches[0];
    const c = concerns(spec, patch, locks, brief, force, force ? '' : quick.concern ?? '', moodboard, dna);
    const t = trialOf(spec, patch, moodboard);
    const out = { understood: quick.label.charAt(0).toUpperCase() + quick.label.slice(1), challenge: c.challenge, question: '', regenerate: '', patch, locked: c.locked, lockedSections: c.lockedSections, dnaMoved: c.dnaMoved, applies: t.applies, error: t.error, usage: null, complexity: { tier: null, why: 'done in code: a small change SocriaUX reads exactly' }, deterministic: true };
    return stream ? respondOnce(true, { status: 200, body: out }) : NextResponse.json(out);
  }

  // a small change to the selected part is economy work; a change to the whole, its structure or its feel is premium
  const complexity = refineTier(comment, selection);
  return runStage(req, { userId: a.userId, orgId: a.orgId, projectId: projectIdOf(body.projectId), fingerprint: print }, {
    stage: 'refine',
    operation: 'patch',
    label: 'ux-v0/refine',
    prompt: { system: refineSystem(), user: refineUser({ brief, spec, moodboard, selection, comment, force, locks, dna }), maxTokens: MAX_TOKENS.refine, temperature: 0.4, tier: complexity.tier },
    finish: (asked) => {
      const r = parseRefine(asked.json, force);
      // a locked decision, the design system, a locked section: never changed silently — the designer is asked first
      const c = concerns(spec, r.patch, locks, brief, force, r.challenge, moodboard, dna);
      const t = trialOf(spec, r.patch, moodboard);
      return { body: { understood: r.understood, challenge: c.challenge, question: r.question, regenerate: r.regenerate, patch: r.patch, locked: c.locked, lockedSections: c.lockedSections, dnaMoved: c.dnaMoved, applies: t.applies, error: t.error, complexity: { tier: asked.tier ?? complexity.tier, why: complexity.why } } };
    },
  });
});
