// lib/ux-v0/quality.ts — a design's quality said as dimensions with weights, and release gates that no score can buy.
//
// The evaluation (lib/ux-v0/evaluate.ts) reads the drawn page at three widths and finds what is wrong. This says
// what the findings add up to, two ways that are kept apart:
//
//   dimensions  visual quality, creative originality, fidelity to the direction, editing precision, function,
//               responsiveness: each 0–100 from what was measured, weighted (the weights are hypotheses the
//               designer or a workshop can change; a dimension with nothing measured yet is left out and the others
//               share its weight). One score, for comparing versions.
//   gates       accessibility, security, critical function: pass, attention (the designer's to do: a destination,
//               a form service) or fail. A failing gate holds the release whatever the score: a beautiful page that
//               a screen reader cannot use, or whose booking does not work, is not finished.
//
// And every finding is either a FAILURE (deterministic: overflow, contrast, a broken link, a script error, a
// missing label) or a JUDGEMENT (hierarchy, rhythm, an empty band, a lone shape, a habit): judgements are
// specific and actionable, but they are opinions about a design, and said as such.

import type { Evaluation, Finding, PageAudit } from './evaluate';
import type { Originality } from './originality';
import type { DesignSpec } from './spec';

export const DIMENSIONS = ['visual', 'originality', 'fidelity', 'editing', 'function', 'responsive'] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const DIMENSION_LABEL: Record<Dimension, string> = {
  visual: 'Visual quality',
  originality: 'Creative originality',
  fidelity: 'Fidelity to the direction',
  editing: 'Editing precision',
  function: 'Function',
  responsive: 'Responsive',
};

/** The starting weights (percent): hypotheses, not truths about design. */
export const DEFAULT_WEIGHTS: Record<Dimension, number> = { visual: 25, originality: 20, fidelity: 20, editing: 15, function: 10, responsive: 10 };

export type GateId = 'accessibility' | 'security' | 'function';
export const GATE_LABEL: Record<GateId, string> = { accessibility: 'Accessibility', security: 'Security', function: 'Critical function' };

export interface Gate {
  id: GateId;
  state: 'pass' | 'attention' | 'fail';
  /** what holds it, or what is the designer's to do */
  items: string[];
}

export interface DimensionScore {
  id: Dimension;
  label: string;
  /** null: nothing measured yet (it does not count) */
  score: number | null;
  weight: number;
  /** what the score stands on, in a few words */
  basis: string;
}

export interface QualityReport {
  /** the weighted score of the measured dimensions */
  score: number;
  dimensions: DimensionScore[];
  gates: Gate[];
  /** every gate passes or waits on the designer: nothing fails */
  releasable: boolean;
  failures: Finding[];
  judgements: Finding[];
}

/** What scoped edits did: how many were applied, how many tried to change more than was asked (put back). */
export interface EditRecord {
  edits: number;
  confined: number;
}

const DETERMINISTIC: ReadonlySet<Finding['kind']> = new Set(['overflow', 'contrast', 'target', 'image', 'function', 'performance', 'access', 'link', 'placeholder', 'length']);

/** A finding is a judgement unless a measurement alone decides it (a collision of words is measured: a failure). */
export function isJudgement(f: Finding): boolean {
  if (DETERMINISTIC.has(f.kind)) return false;
  if (f.kind === 'composition' && /runs into/.test(f.message)) return false;
  return true;
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Weights held to their shape: whole percentages, the defaults where one is missing. */
export function normalizeWeights(w: unknown): Record<Dimension, number> {
  const r = w && typeof w === 'object' ? (w as Record<string, unknown>) : {};
  const out = { ...DEFAULT_WEIGHTS };
  for (const d of DIMENSIONS) {
    const v = Number(r[d]);
    if (Number.isFinite(v)) out[d] = Math.max(0, Math.min(100, Math.round(v)));
  }
  return out;
}

/** The page's quality as dimensions and gates (see the head of this file). */
export function qualityReport(input: {
  spec: DesignSpec;
  ev: Evaluation;
  audits: { desktop?: PageAudit | null; tablet?: PageAudit | null; phone?: PageAudit | null };
  originality?: Originality | null;
  edits?: EditRecord | null;
  weights?: Partial<Record<Dimension, number>> | null;
  /** the rendered page's markup, for the security gate (what it runs and where it sends) */
  html?: string;
}): QualityReport {
  const { spec, ev, audits } = input;
  const weights = normalizeWeights(input.weights ?? {});
  const all = ev.findings;
  const failures = all.filter((f) => !isJudgement(f));
  const judgements = all.filter(isJudgement);
  const d = audits.desktop;
  const count = (k: Finding['kind'], sev?: Finding['severity']) => all.filter((f) => f.kind === k && (!sev || f.severity === sev)).length;

  // visual: the evaluation's own reading, less the compositional slips
  const slips = all.filter((f) => f.kind === 'composition' && !/runs into/.test(f.message));
  const visual = clamp(ev.quality - slips.reduce((n, f) => n + (f.severity === 'medium' ? 6 : f.severity === 'high' ? 10 : 3), 0));
  // originality: the originality audit where it ran, else the evaluation's distinctiveness
  const originality = input.originality ? clamp(input.originality.overall) : clamp(ev.distinctiveness);
  const fidelity = clamp(ev.fidelity);
  const editing = input.edits && input.edits.edits > 0 ? clamp(100 - (100 * input.edits.confined) / input.edits.edits / 2) : null;
  // function: what was tried in place and failed weighs most; links going nowhere lower completeness
  const broken = count('function') + count('link', 'high');
  const unlinked = d?.a11y?.unlinked.length ?? 0;
  const fn = d ? clamp(100 - 25 * broken - 4 * unlinked) : null;
  // responsive: what overflows or collides at a tablet and a phone, and targets too small to tap
  const responsive = audits.phone || audits.tablet ? clamp(100 - 18 * all.filter((f) => f.kind === 'overflow').length - 12 * all.filter((f) => f.kind === 'composition' && /runs into/.test(f.message)).length - 4 * count('target')) : null;

  const scores: Record<Dimension, { score: number | null; basis: string }> = {
    visual: { score: visual, basis: slips.length ? `the evaluation, less ${slips.length} compositional slip${slips.length > 1 ? 's' : ''}` : 'the evaluation of hierarchy, type, rhythm and contrast' },
    originality: { score: originality, basis: input.originality ? 'the originality audit (habits, justified or not)' : 'distinctiveness from the generic look' },
    fidelity: { score: fidelity, basis: 'what the approved direction, the brief and the locks ask, kept' },
    editing: { score: editing, basis: editing === null ? 'no scoped edit yet' : `${input.edits!.edits} scoped edit${input.edits!.edits > 1 ? 's' : ''}, ${input.edits!.confined} confined to what was asked` },
    function: { score: fn, basis: fn === null ? 'not drawn yet' : `${broken} part${broken === 1 ? '' : 's'} that failed when tried, ${unlinked} link${unlinked === 1 ? '' : 's'} going nowhere` },
    responsive: { score: responsive, basis: responsive === null ? 'not drawn at a tablet or phone yet' : 'overflow, collisions and small targets at 834 and 390 px' },
  };
  const measured = DIMENSIONS.filter((k) => scores[k].score !== null && weights[k] > 0);
  const totalW = measured.reduce((n, k) => n + weights[k], 0) || 1;
  const score = clamp(measured.reduce((n, k) => n + (scores[k].score as number) * weights[k], 0) / totalW);

  // ── the gates ──
  const a = d?.a11y;
  const contrastFails = all.filter((f) => f.kind === 'contrast' && f.severity !== 'low');
  const access: string[] = [
    ...contrastFails.slice(0, 3).map((f) => f.message),
    ...(a?.noAlt.length ? [`${a.noAlt.length} picture${a.noAlt.length > 1 ? 's have' : ' has'} no text alternative.`] : []),
    ...(a?.noName.length ? [`${a.noName.length} control${a.noName.length > 1 ? 's have' : ' has'} no name.`] : []),
    ...(a?.noLabel.length ? [`${a.noLabel.length} field${a.noLabel.length > 1 ? 's have' : ' has'} no label.`] : []),
  ];
  const accessNotes = [...(a && spec.pageType === 'website' && a.h1 !== 1 ? [`${a.h1} page titles (one expected).`] : []), ...(a?.skips.length ? ['Headings skip a level.'] : [])];
  const accessGate: Gate = { id: 'accessibility', state: !d ? 'attention' : access.length ? 'fail' : accessNotes.length ? 'attention' : 'pass', items: !d ? ['Not checked in a browser yet.'] : [...access, ...accessNotes] };

  // security: the page runs only SocriaUX's own runtime, no handler written into the markup, no script address,
  // every destination a safe one, forms sending only to https or an email address
  const html = input.html ?? '';
  const sec: string[] = [];
  if (html) {
    if (/<[a-z][^>]*\son[a-z]+\s*=/i.test(html)) sec.push('Markup carries an inline event handler.');
    if (/<script[^>]+src=/i.test(html)) sec.push('The page loads a script from an address.');
    if (/href="\s*(javascript|vbscript|data):/i.test(html)) sec.push('A link runs code.');
    if (/<form[^>]+action="(?!#|https:|mailto:)[^"]+"/i.test(html)) sec.push('A form sends somewhere that is not https or an email address.');
  }
  const securityGate: Gate = { id: 'security', state: !html ? 'attention' : sec.length ? 'fail' : 'pass', items: !html ? ['The markup was not read.'] : sec };

  // critical function: what was tried in place and failed, links to nowhere on the page, scripts that failed;
  // and, the designer's to do, links with no destination yet and a form with nowhere to send
  const fnFail = all.filter((f) => f.kind === 'function' || (f.kind === 'link' && f.severity === 'high')).map((f) => f.message);
  const forms = spec.sections.filter((s) => s.kind === 'form').length;
  const fnTodo = [...(unlinked ? [`${unlinked} link${unlinked > 1 ? 's go' : ' goes'} nowhere yet.`] : []), ...(forms && !spec.site?.formAction ? ['The form has nowhere to send yet.'] : [])];
  const functionGate: Gate = { id: 'function', state: !d ? 'attention' : fnFail.length ? 'fail' : fnTodo.length ? 'attention' : 'pass', items: !d ? ['Not tried in a browser yet.'] : [...fnFail.slice(0, 4), ...fnTodo] };

  const gates = [accessGate, securityGate, functionGate];
  return {
    score,
    dimensions: DIMENSIONS.map((k) => ({ id: k, label: DIMENSION_LABEL[k], score: scores[k].score, weight: weights[k], basis: scores[k].basis })),
    gates,
    releasable: gates.every((g) => g.state !== 'fail'),
    failures,
    judgements,
  };
}

/**
 * A repair round checked for what it broke: the sections where, after the fixes, a failure appears that was not
 * there before, or the high and medium findings grew. Their fixes are taken back (lib/ux-v0 workspace inspect).
 */
export function regressions(before: Evaluation, after: Evaluation): string[] {
  const weight = (ev: Evaluation) => {
    const m = new Map<string, number>();
    for (const f of ev.findings) if (f.section && f.severity !== 'low') m.set(f.section, (m.get(f.section) ?? 0) + (f.severity === 'high' ? 3 : 1));
    return m;
  };
  const kinds = (ev: Evaluation, sec: string) => new Set(ev.findings.filter((f) => f.section === sec && !isJudgement(f) && f.severity !== 'low').map((f) => f.kind));
  const b = weight(before);
  const a = weight(after);
  const out: string[] = [];
  for (const [sec, w] of a) {
    const was = b.get(sec) ?? 0;
    const fresh = [...kinds(after, sec)].some((k) => !kinds(before, sec).has(k));
    if (w > was || fresh) out.push(sec);
  }
  return out;
}
