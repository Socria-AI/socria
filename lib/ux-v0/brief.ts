// lib/ux-v0/brief.ts — the Living Brief's rules: what is decided stays decided.
//
// A brief is the designer's creative specification. Parts of it can be
// approved (agreed), locked (rules SocriaUX never changes) or delegated (left
// to SocriaUX). This keeps those promises:
//
//   - a revised brief (the model rewrote it on request) keeps every locked part
//     exactly as it was, and an approved part the model changed goes back to
//     "suggested", so nothing decided is overwritten in silence;
//   - questions the designer delegated become delegated parts;
//   - a change to the brief reaches an existing design without regenerating it:
//     only the visual parts that changed (colour, type, layout, motion,
//     contrast) are applied, as a new version that can be undone.

import { briefColors } from './direction';
import { intentOf, requiredComponents } from './intent';
import { honourLayout, sameLayout } from './layout';
import { nearestWeight } from './fonts';
import { ensureContrast, normalizeLook, normalizeTokens, type DesignSpec } from './spec';
import { BRIEF_PARTS, type BriefPart, type Decision, type DesignBrief, type DiscoveryQuestion, type Topic } from './types';

export const PART_LABEL: Record<BriefPart, string> = {
  audience: 'Audience',
  experience: 'Experience',
  personality: 'Personality',
  colour: 'Colour',
  typography: 'Typography',
  layout: 'Layout',
  imagery: 'Imagery',
  motion: 'Motion',
  function: 'What it must do',
  accessibility: 'Accessibility',
  responsive: 'Smaller screens',
  rules: 'Rules',
};
export const DECISION_LABEL: Record<Decision, string> = { proposed: 'Suggested', approved: 'Approved', locked: 'Locked', delegated: 'SocriaUX decides' };

/** The fields each part is written in. */
const FIELDS: Record<BriefPart, (keyof DesignBrief)[]> = {
  audience: ['audience'],
  experience: ['experience'],
  personality: ['personality'],
  colour: ['palette'],
  typography: ['typography'],
  layout: ['layoutDirection'],
  imagery: ['visualDirection', 'references'],
  motion: [],
  function: ['functionalRequirements', 'userGoals'],
  accessibility: ['accessibility'],
  responsive: ['responsive'],
  rules: ['rules'],
};

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * A revised brief that keeps what the designer decided. Statuses and exact
 * specifications always carry over; a locked part keeps its words; an approved
 * part the model changed is kept as changed but goes back to "suggested".
 */
export function mergeDecided(next: DesignBrief, prev: DesignBrief | null): { brief: DesignBrief; kept: BriefPart[]; reopened: BriefPart[] } {
  if (!prev) return { brief: next, kept: [], reopened: [] };
  const decisions = { ...(prev.decisions ?? {}) };
  const out: DesignBrief = { ...next, ...(prev.spec ? { spec: prev.spec } : {}), ...(prev.parts ? { parts: prev.parts } : {}) };
  for (const f of ['experience', 'accessibility', 'responsive', 'rules'] as const) if (out[f] === undefined && prev[f] !== undefined) (out as any)[f] = prev[f];
  const kept: BriefPart[] = [];
  const reopened: BriefPart[] = [];
  for (const part of BRIEF_PARTS) {
    const st = decisions[part];
    if (st !== 'approved' && st !== 'locked') continue;
    const changed = FIELDS[part].filter((f) => !same(out[f], prev[f]));
    if (!changed.length) continue;
    if (st === 'locked') {
      for (const f of changed) (out as any)[f] = prev[f];
      kept.push(part);
    } else {
      delete decisions[part];
      reopened.push(part);
    }
  }
  if (Object.keys(decisions).length) out.decisions = decisions;
  else delete out.decisions;
  return { brief: out, kept, reopened };
}

const TOPIC_PARTS: Partial<Record<Topic, BriefPart[]>> = {
  audience: ['audience'],
  brand: ['personality'],
  visual: ['colour', 'typography', 'imagery'],
  hierarchy: ['layout'],
  platform: ['responsive'],
  functionality: ['function'],
  needs: ['function'],
  content: ['function'],
  objective: ['experience'],
  constraints: ['rules'],
};

/** The parts the designer left to SocriaUX by delegating a question. */
export function delegatedParts(questions: readonly DiscoveryQuestion[]): Partial<Record<BriefPart, Decision>> {
  const out: Partial<Record<BriefPart, Decision>> = {};
  for (const q of questions) if (q.delegated) for (const p of TOPIC_PARTS[q.topic] ?? []) out[p] = 'delegated';
  return out;
}

/** The visual parts that differ between two briefs: what an existing design would need to follow. */
export function changedVisualParts(prev: DesignBrief | null, next: DesignBrief): BriefPart[] {
  if (!prev) return [];
  const a = prev.spec ?? {};
  const b = next.spec ?? {};
  const out: BriefPart[] = [];
  if (!same(prev.palette, next.palette)) out.push('colour');
  if (!same(prev.typography.display, next.typography.display) || !same(prev.typography.body, next.typography.body) || !same(a.ratio, b.ratio)) out.push('typography');
  if (!same(a.density, b.density) || !same(a.grid, b.grid) || !same(a.width, b.width) || !same(a.corners, b.corners) || !sameLayout(prev.layout, next.layout)) out.push('layout');
  if (!same(a.motion, b.motion)) out.push('motion');
  if (!same(a.contrast, b.contrast)) out.push('accessibility');
  return out;
}

/**
 * The brief's visual decisions, applied to a design in place: only the parts
 * named, so a change to the type does not undo a palette the direction chose.
 * Copy is untouched. The structure changes only as far as the layout
 * decisions require (what leads, the compositions they allow, how the booking
 * and the opening are set: lib/ux-v0/layout.ts honourLayout); anything more
 * needs a new generation.
 */
export function briefToDesign(spec: DesignSpec, brief: DesignBrief, parts: readonly BriefPart[]): DesignSpec {
  const sp = brief.spec ?? {};
  const notes: string[] = [];
  const has = (p: BriefPart) => parts.includes(p);
  let sections = spec.sections;
  if (has('layout') && brief.layout) {
    const intent = intentOf(brief);
    const honoured = honourLayout(spec.sections, brief.layout, { pageType: spec.pageType, screen: intent.screen, needs: requiredComponents(intent), kind: intent.kind, language: spec.look?.language ?? '' });
    sections = honoured.sections;
    notes.push(...honoured.changes);
  }
  let colors = { ...spec.tokens.colors };
  if (has('colour') && brief.palette.length) colors = { ...colors, ...briefColors(brief) };
  if (has('accessibility') && sp.contrast === 'AAA') colors = { ...colors, text: ensureContrast(colors.text, colors.background, 7), muted: ensureContrast(colors.muted, colors.background, 7), accentText: ensureContrast(colors.accentText, colors.accent, 7) };
  const tokens = normalizeTokens(
    {
      ...spec.tokens,
      colors,
      fonts: has('typography') ? { display: brief.typography.display, body: brief.typography.body } : spec.tokens.fonts,
      ...(has('layout') && sp.density ? { scale: sp.density } : {}),
      ...(has('layout') && sp.corners ? { radius: sp.corners } : {}),
    },
    notes
  );
  const look = normalizeLook(
    {
      ...spec.look,
      ...(has('typography') ? { weight: nearestWeight(tokens.fonts.display, spec.look.weight), ...(sp.ratio ? { ratio: sp.ratio } : {}) } : {}),
      ...(has('layout') && sp.grid ? { grid: sp.grid } : {}),
      ...(has('layout') && sp.width ? { width: sp.width } : {}),
      ...(has('motion') && sp.motion ? { motion: sp.motion } : {}),
    },
    spec.look
  );
  return { ...spec, sections, tokens, look, notes: [...spec.notes, ...notes].slice(-8), version: spec.version + 1, reason: `The brief, applied: ${parts.map((p) => PART_LABEL[p].toLowerCase()).join(', ')}`, createdAt: Date.now() };
}
