// lib/visual/actions.ts — WHAT CAN BE DONE TO A PICTURE, CHECKED BEFORE IT IS DONE (Logos 6, November 2026).
//
// A visual action is data, never code: an operation (highlight, focus, animate a parameter, go to a step…), the parts
// it is done to (./elements.ts ids), and its numbers. It comes from three places — a reply's words ("[the demand
// curve](vis:highlight/curve:demand)"), a person's request ("highlight the demand curve", ./intent.ts), a press — and
// every one is checked here against the artifact as it now stands before anything moves:
//   • the operation is one of VISUAL_OPS and the artifact or the part supports it;
//   • every part named exists (an id, or the words of its name: ./elements.ts findElement);
//   • a number is a number, inside the parameter's range, on its step — and the change is a change;
//   • a transition is meaningful: a secant's two ends never meet (the slope there is not defined), a step exists.
// What fails is said, and nothing happens. Nothing here can reach another artifact, the network or the page.
//
// Ephemeral or kept: emphasis, focus, zoom, a trace, pause and replay change how it is SHOWN, for a while, and never
// the artifact; a parameter moved (update_parameter, animate, reset, a step) changes what it IS, and is kept with it
// like a slider moved by hand (KEPT_OPS says which is which).
//
// Pure: no React, no DOM, no clock.

import { fmtVal } from '../inline-math';
import { VIS_LINK, withoutMarkers } from '../rich-text';
import { VISUAL_OPS, findElement, ordinal, type VisualArtifact, type VisualElement, type VisualOp } from './elements';

export interface VisualAction {
  op: VisualOp;
  /** the parts it is done to (element ids); none: the artifact as a whole */
  targets: string[];
  /** a parameter's new value */
  to?: number;
  /** …or how far to move it */
  by?: number;
  /** a step to go to, from 1 */
  step?: number;
  /** how much closer, for a zoom (1.25–8) */
  k?: number;
  /** how long the motion takes, ms (300–6000); the renderer picks when absent */
  ms?: number;
  /** emphasis that stays until something else is pointed at (a person's own request), not a moment's */
  hold?: boolean;
}

/** Operations that change what the artifact is, not only how it is shown: kept like a hand on a slider. */
export const KEPT_OPS: readonly VisualOp[] = ['update_parameter', 'animate', 'reset', 'step'];
export const isKept = (a: VisualAction) => KEPT_OPS.includes(a.op);

// ── the marker in a reply's words ────────────────────────────────────

/**
 * A reply points with a link it cannot follow anywhere: [words](vis:<op>/<target>[+<target>][?to=…&by=…&step=…&k=…]).
 *   [the demand curve](vis:highlight/curve:demand)
 *   [shifts right](vis:animate/param:d?to=14)
 *   [the second step](vis:step?step=2)
 *   [MR and MC](vis:highlight/curve:mr+curve:mc)
 * Read strictly: anything else is not a marker (and the words are drawn as words).
 */
const HREF = /^vis:([a-z_]{3,18})(?:\/([a-z0-9:+>.\-/=]{1,160}))?(?:\?([a-z0-9=&.\-]{1,80}))?$/;

export function parseVisHref(href: string): VisualAction | null {
  const m = HREF.exec(String(href ?? '').trim().toLowerCase());
  if (!m) return null;
  const op = m[1] as VisualOp;
  if (!(VISUAL_OPS as readonly string[]).includes(op)) return null;
  const targets = m[2] ? m[2].split('+').map((t) => t.trim()).filter((t) => /^[a-z]+:[a-z0-9\-.>/=]+$/.test(t)).slice(0, 4) : [];
  const out: VisualAction = { op, targets };
  for (const kv of (m[3] ?? '').split('&')) {
    const [k, v] = kv.split('=');
    const n = Number(v);
    if (!v || !Number.isFinite(n)) continue;
    if (k === 'to') out.to = n;
    else if (k === 'by') out.by = n;
    else if (k === 'step' && Number.isInteger(n)) out.step = n;
    else if (k === 'k') out.k = n;
    else if (k === 'ms') out.ms = n;
  }
  return out;
}

/** The marker an action is written as (the inverse of parseVisHref). */
export function visHref(a: VisualAction): string {
  const q = [a.to !== undefined ? `to=${a.to}` : '', a.by !== undefined ? `by=${a.by}` : '', a.step !== undefined ? `step=${a.step}` : '', a.k !== undefined ? `k=${a.k}` : ''].filter(Boolean).join('&');
  return `vis:${a.op}${a.targets.length ? `/${a.targets.join('+')}` : ''}${q ? `?${q}` : ''}`;
}

/** The markers in a reply, in order, with the words each is on (the syntax is read in lib/rich-text.ts). */
export { VIS_LINK, withoutMarkers };
export function markersIn(text: string): { words: string; href: string; action: VisualAction | null }[] {
  return [...String(text ?? '').matchAll(VIS_LINK)].map((m) => ({ words: m[1], href: m[2], action: parseVisHref(m[2]) }));
}


// ── checking an action against the artifact as it is ─────────────────

export type Checked = { ok: true; action: VisualAction; parts: VisualElement[]; note?: string } | { ok: false; why: string };

/** Operations that need a part named (the others act on the artifact as a whole). */
const NEEDS_TARGET: readonly VisualOp[] = ['highlight', 'update_parameter', 'reveal'];

const num = (e: VisualElement, k: string): number | null => {
  const v = e.meta?.[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};

/** A value on a parameter's step, inside its range. */
export function onStep(v: number, p: VisualElement): number {
  const min = num(p, 'min') ?? -Infinity, max = num(p, 'max') ?? Infinity, step = num(p, 'step') ?? 0;
  const snapped = step > 0 && Number.isFinite(min) ? Math.round((v - min) / step) * step + min : v;
  return Number(Math.min(max, Math.max(min, snapped)).toFixed(6));
}

/**
 * Whether an action can be done to this artifact as it now stands, and the action as it will be done (its targets as
 * ids, its numbers on their steps). `values` are the parameters now, when they are not in the elements' meta.
 */
export function checkAction(a: VisualAction | null, art: VisualArtifact, values?: Record<string, number>): Checked {
  if (!a || !(VISUAL_OPS as readonly string[]).includes(a.op)) return { ok: false, why: 'not an action Socria can take on a picture' };
  const parts: VisualElement[] = [];
  for (const t of a.targets) {
    const e = findElement(art, t);
    if (!e) return { ok: false, why: `there is no ${t.replace(/^[a-z]+:/, '').replace(/-/g, ' ')} on “${art.title}”` };
    if (!e.ops.includes(a.op) && !(a.op === 'focus' && e.ops.includes('highlight'))) return { ok: false, why: `${e.label} cannot be ${a.op === 'step' ? 'stepped to' : `${a.op.replace('_', ' ')}ed`}` };
    if (!parts.includes(e)) parts.push(e);
  }
  if (!parts.length && NEEDS_TARGET.includes(a.op)) return { ok: false, why: `nothing named to ${a.op.replace('_', ' ')}` };
  if (!parts.length && !art.ops.includes(a.op) && !['unhighlight', 'focus'].includes(a.op)) return { ok: false, why: `“${art.title}” cannot be ${a.op}ed` };
  // a point or a tangent moved is its parameter moved: "animate the tangent to x = 1" moves where it touches
  if ((a.op === 'animate' || a.op === 'update_parameter') && (a.to !== undefined || a.by !== undefined)) {
    for (let i = 0; i < parts.length; i++) {
      const via = parts[i].meta?.param ?? parts[i].meta?.at;
      const p = typeof via === 'string' ? art.elements.find((e) => e.id === `param:${via}`) : undefined;
      if (p) parts[i] = p;
    }
  }
  const action: VisualAction = { ...a, targets: parts.map((p) => p.id) };
  if (a.ms !== undefined) action.ms = Math.min(6000, Math.max(300, a.ms));
  if (a.k !== undefined) action.k = Math.min(8, Math.max(1.25, a.k));

  // a parameter changed: a number, in range, on its step, and a change
  if (a.op === 'update_parameter' || (a.op === 'animate' && parts.some((p) => p.kind === 'param'))) {
    const p = parts.find((x) => x.kind === 'param');
    if (!p) return { ok: false, why: 'no number named to change' };
    const now = values?.[String(p.meta?.name)] ?? num(p, 'value') ?? 0;
    const want = a.to ?? (a.by !== undefined ? now + a.by : undefined);
    if (want === undefined || !Number.isFinite(want)) return { ok: false, why: `no value given for ${p.label}` };
    let to = onStep(want, p);
    const note = to !== Number(want.toFixed(6)) ? `${p.label} goes from ${fmtVal(num(p, 'min') ?? 0)} to ${fmtVal(num(p, 'max') ?? 0)}: kept inside` : undefined;
    // a secant's ends never meet: one step short of the other end, where its slope is still defined
    const other = typeof art.elements.find((e) => e.id === 'line:secant')?.meta?.from === 'string' ? art.elements.find((e) => e.id === 'line:secant')! : null;
    if (other) {
      const [ea, eb] = [String(other.meta?.from), String(other.meta?.to)];
      const mate = p.meta?.name === ea ? eb : p.meta?.name === eb ? ea : null;
      const mv = mate ? values?.[mate] ?? num(art.elements.find((e) => e.id === `param:${mate}`) ?? p, 'value') : null;
      if (mate && mv !== null && Math.abs(to - mv) < 1e-9) {
        const step = num(p, 'step') || 0.01;
        to = onStep(mv + (now >= mv ? step : -step), p);
      }
    }
    if (Math.abs(to - now) < 1e-9) return { ok: false, why: `${p.label} is already ${fmtVal(now)}` };
    action.to = to;
    delete action.by;
    return { ok: true, action, parts, ...(note ? { note } : {}) };
  }
  if (a.op === 'step') {
    const steps = art.elements.filter((e) => e.kind === 'step' || e.kind === 'item');
    const n = a.step ?? num(parts[0] ?? ({} as VisualElement), 'n') ?? (parts[0] ? Number(parts[0].id.split(':')[1]) : NaN);
    if (!Number.isInteger(n) || n < 1 || n > steps.length) return { ok: false, why: steps.length ? `there are ${steps.length} steps` : 'there are no steps to go to' };
    action.step = n;
    action.targets = [`${steps[0].kind === 'item' ? 'item' : 'step'}:${n}`];
    return { ok: true, action, parts: [steps[n - 1]] };
  }
  return { ok: true, action, parts };
}

// ── motion that follows the model ────────────────────────────────────

/**
 * The value a parameter has at time t (0–1) of its move from `from` to `to`: on the parameter's own step, so every
 * frame drawn is a state the model can be in (a count of rectangles is a whole number at every frame). A count that
 * grows many-fold grows by ratios (4, 6, 8, 12, 16…), so each doubling takes as long as the last; anything else eases
 * in and out — and an approach (to a point it can never reach) slows as it closes, as a limit does.
 */
export function tweenAt(t: number, from: number, to: number, p: { step?: number | null; min?: number | null }, approach = false): number {
  const u = Math.min(1, Math.max(0, t));
  const step = p.step && p.step > 0 ? p.step : 0;
  const ease = approach ? 1 - Math.pow(1 - u, 3) : u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  let v: number;
  const counting = step >= 1 && Number.isInteger(step) && from > 0 && to > 0 && Math.max(from, to) / Math.min(from, to) >= 3;
  if (counting) v = from * Math.pow(to / from, ease);
  else v = from + (to - from) * ease;
  if (u >= 1) return to;
  if (step) {
    const base = p.min ?? 0;
    v = Math.round((v - base) / step) * step + base;
  }
  return Number(v.toFixed(6));
}

/** How long a move takes: long enough to see, never long enough to wait for; none at all for reduced motion. */
export function tweenMs(from: number, to: number, p: { min?: number | null; max?: number | null; step?: number | null }, opts: { reduced?: boolean; ms?: number } = {}): number {
  if (opts.reduced) return 0;
  if (opts.ms) return Math.min(6000, Math.max(300, opts.ms));
  const span = (p.max ?? 1) - (p.min ?? 0) || 1;
  const counting = (p.step ?? 0) >= 1 && from > 0 && to > 0;
  const size = counting ? Math.abs(Math.log2(to / from)) / 3 : Math.abs(to - from) / span;
  return Math.round(Math.min(3200, Math.max(900, 900 + 1800 * Math.min(1, size))));
}

/** Whether a move is an approach: toward the other end of a secant, a hole, or a tangent's point. */
export function isApproach(art: VisualArtifact, param: string, to: number): boolean {
  const sec = art.elements.find((e) => e.id === 'line:secant');
  if (!sec) return false;
  const [a, b] = [String(sec.meta?.from), String(sec.meta?.to)];
  const mate = param === a ? b : param === b ? a : null;
  const mv = mate ? art.elements.find((e) => e.id === `param:${mate}`)?.meta?.value : null;
  return typeof mv === 'number' && Math.abs(to - mv) < Math.abs((art.elements.find((e) => e.id === `param:${param}`)?.meta?.value as number) - mv);
}

// ── said ─────────────────────────────────────────────────────────────

/** An action in words, past tense, as the person is told it was done (and Socria with their next message). */
export function actionSaid(a: VisualAction, art: VisualArtifact, before?: Record<string, number>): string {
  const parts = a.targets.map((t) => findElement(art, t)).filter((e): e is VisualElement => !!e);
  const names = parts.map((p) => p.label).join(' and ') || `“${art.title}”`;
  const on = ` on “${art.title}”`;
  switch (a.op) {
    case 'highlight':
      return `Highlighted ${names}${on}.`;
    case 'unhighlight':
      return `Cleared the highlight${on}.`;
    case 'focus':
      return `Focused on ${names}${on}.`;
    case 'zoom':
      return `Zoomed in on ${names}${on}.`;
    case 'pan':
      return `Moved the view${on}.`;
    case 'trace':
      return `Traced ${names}${on}.`;
    case 'animate':
    case 'update_parameter': {
      const p = parts.find((x) => x.kind === 'param');
      if (p && a.to !== undefined) {
        const was = before?.[String(p.meta?.name)] ?? (p.meta?.value as number);
        return `${a.op === 'animate' ? 'Animated' : 'Set'} ${p.label} from ${fmtVal(was)} to ${fmtVal(a.to)}${on}.`;
      }
      return `Played${on}.`;
    }
    case 'pause':
      return `Paused${on}.`;
    case 'resume':
      return `Played on${on}.`;
    case 'replay':
      return `Replayed${on}.`;
    case 'step':
      return `Went to the ${ordinal(a.step ?? 1)} step${on}${parts[0] && parts[0].label.length < 120 ? `: ${parts[0].label}` : ''}.`;
    case 'compare':
      return `Showed where it started beside where it is now${on}.`;
    case 'reveal':
      return `Showed ${names}${on}.`;
    case 'reset':
      return `Put${on.replace(' on ', ' ')} back as it started.`;
  }
}
