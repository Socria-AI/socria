// lib/ux-v0/graphics/capabilities.ts — everything a graphic can be made of, in one registry: what a model may ask for,
// what a search finds, what an inspector offers.
//
// The AI never writes drawing code. It may name only what is here: a primitive with its parameters, a pattern
// generator with its controls, an effect, a gradient kind, a type treatment, a blend mode, a mask, a composition, a
// style, a document operation. Anything it returns is held to this registry (validateVisualPlan, validateOps) before
// it touches a design: unknown names are dropped and said, numbers are clamped, and operations are tried on a copy
// first, so a malformed answer changes nothing. The same registry answers searches in words ("dense radial lines",
// "an irregular ribbon", "halftone"), which is how edits in words find their capability without a model.

import { applyOps, type GraphicDoc, type Op } from './doc';
import { EFFECTS, EFFECT_BY_KIND } from './effects';
import { PRIMITIVES, PRIMITIVE_BY_KIND, type ParamSpec } from './geometry';
import { GRADIENT_PRESETS } from './paint';
import { PATTERNS, PATTERN_BY_KIND, patternParams } from './patterns';
import { NEW_ARCHETYPES, STYLES, normalizeVocabulary, type VisualVocabulary } from './vocabulary';

export type CapabilityKind = 'primitive' | 'pattern' | 'effect' | 'gradient' | 'type' | 'blend' | 'mask' | 'operation' | 'composition' | 'style';
export interface Capability {
  kind: CapabilityKind;
  id: string;
  label: string;
  keywords: string[];
  params?: ParamSpec[];
  says?: string;
}

const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'soft-light', 'hard-light', 'difference', 'exclusion'];
const TYPE: readonly [string, string, string[]][] = [
  ['plain', 'Plain', ['plain', 'simple type']],
  ['oversized', 'Oversized', ['oversized', 'huge', 'giant type', 'bigger headline']],
  ['stacked', 'Stacked', ['stacked', 'one word per line', 'stack']],
  ['echo', 'Echo', ['echo', 'repeated', 'repeat', 'layered type', 'stacked copies']],
  ['outline', 'Outlined', ['outline', 'outlined', 'hollow', 'stroked type']],
  ['arc', 'On an arc', ['arc', 'curved', 'curve', 'arched', 'bent']],
  ['circle', 'Round a circle', ['circle', 'circular', 'round', 'seal', 'badge']],
  ['wave-path', 'Along a wave', ['wave path', 'wavy line', 'along a wave']],
  ['perspective', 'Perspective', ['perspective', 'receding', 'depth', '3d type']],
  ['rise', 'Rising', ['rise', 'rising', 'diagonal type', 'slanted baseline']],
  ['wave', 'Wave warp', ['wave', 'wavy', 'undulating type']],
  ['stagger', 'Staggered', ['stagger', 'staggered', 'bouncing', 'jumbled']],
  ['vertical', 'Vertical', ['vertical', 'sideways', 'rotated type']],
  ['gradient', 'Gradient type', ['gradient type', 'gradient text']],
  ['spaced', 'Spaced', ['spaced', 'letterspaced', 'wide tracking', 'tracked out']],
  ['italic-mix', 'Italic accent', ['italic', 'mixed styles', 'one word italic']],
];
const OPS: readonly [string, string, string[]][] = [
  ['boolean', 'Boolean (union, subtract, intersect, exclude)', ['boolean', 'union', 'merge', 'subtract', 'cut out', 'intersect', 'exclude']],
  ['flatten', 'Convert to path', ['convert to path', 'flatten', 'outline shape', 'editable path']],
  ['outline-stroke', 'Outline stroke', ['outline stroke', 'stroke to path', 'expand stroke']],
  ['offset', 'Offset path', ['offset', 'inset', 'grow', 'shrink outline']],
  ['path', 'Path: simplify, smooth, reverse, roughen, close, open', ['simplify', 'smooth', 'reverse', 'roughen', 'distort', 'close path', 'open path']],
  ['combine', 'Combine into one path', ['combine', 'compound path', 'join shapes']],
  ['blend', 'Blend between two shapes', ['blend', 'interpolate', 'morph steps', 'tween']],
  ['repeat', 'Repeat (linear, radial, grid)', ['repeat', 'step and repeat', 'radial repeat', 'grid of copies', 'duplicate around']],
  ['mirror', 'Mirror', ['mirror', 'flip', 'reflect', 'symmetry']],
  ['align', 'Align', ['align', 'line up', 'centre', 'center']],
  ['distribute', 'Distribute', ['distribute', 'space evenly', 'equal spacing']],
  ['mask', 'Mask (alpha, luminance, inverted)', ['mask', 'clip', 'clipping mask', 'cut out', 'knock out', 'text mask']],
];
const MASKS: readonly [string, string, string[]][] = [
  ['alpha', 'Silhouette mask', ['mask', 'clip', 'silhouette', 'vector mask', 'text mask', 'image mask']],
  ['luminance', 'Brightness mask', ['gradient mask', 'luminance mask', 'fade mask', 'soft mask']],
  ['inverted', 'Inverted mask', ['inverted mask', 'cut-out', 'knockout', 'hole']],
];

/** Every capability, in one list. */
export const CAPABILITIES: readonly Capability[] = [
  ...PRIMITIVES.map((p): Capability => ({ kind: 'primitive', id: p.kind, label: p.label, keywords: p.keywords, params: p.params })),
  ...PATTERNS.map((p): Capability => ({ kind: 'pattern', id: p.kind, label: p.label, keywords: p.keywords, params: patternParams(p.kind), says: p.says })),
  ...EFFECTS.map((e): Capability => ({ kind: 'effect', id: e.kind, label: e.label, keywords: e.keywords, params: e.params, says: e.says })),
  ...(['linear', 'radial', 'conic', 'mesh'] as const).map((t): Capability => ({ kind: 'gradient', id: t, label: `${t.charAt(0).toUpperCase()}${t.slice(1)} gradient`, keywords: [t, `${t} gradient`, ...(t === 'conic' ? ['holographic', 'sweep', 'angular gradient'] : t === 'mesh' ? ['mesh', 'aurora', 'soft gradient'] : [])] })),
  ...GRADIENT_PRESETS.map((g): Capability => ({ kind: 'gradient', id: `preset:${g.id}`, label: g.label, keywords: [g.id, g.label.toLowerCase()] })),
  ...TYPE.map(([id, label, keywords]): Capability => ({ kind: 'type', id, label, keywords })),
  ...BLEND_MODES.map((b): Capability => ({ kind: 'blend', id: b, label: b.replace('-', ' '), keywords: [b, b.replace('-', ' ')] })),
  ...MASKS.map(([id, label, keywords]): Capability => ({ kind: 'mask', id, label, keywords })),
  ...OPS.map(([id, label, keywords]): Capability => ({ kind: 'operation', id, label, keywords })),
  ...NEW_ARCHETYPES.map((a): Capability => ({ kind: 'composition', id: a, label: a, keywords: [a] })),
  ...STYLES.map((s): Capability => ({ kind: 'style', id: s, label: s, keywords: [s] })),
];

/** Capabilities that answer some words, best first: a keyword or label found whole in them scores most. */
export function searchCapabilities(words: string, kinds?: readonly CapabilityKind[], limit = 8): Capability[] {
  const w = ` ${words.toLowerCase().replace(/[^a-z0-9 -]+/g, ' ').replace(/\s+/g, ' ')} `;
  const scored: { c: Capability; s: number }[] = [];
  for (const c of CAPABILITIES) {
    if (kinds && !kinds.includes(c.kind)) continue;
    let s = 0;
    for (const k of [...c.keywords, c.label.toLowerCase(), c.id]) {
      const kk = k.toLowerCase();
      if (!kk) continue;
      if (w.includes(` ${kk} `)) s = Math.max(s, 10 + kk.length);
      else if (kk.length > 4 && w.includes(kk)) s = Math.max(s, 4 + kk.length / 2);
      else if (kk.includes(' ') && kk.split(' ').every((part) => part.length > 2 && w.includes(` ${part}`))) s = Math.max(s, 6 + kk.length / 3);
    }
    if (s) scored.push({ c, s });
  }
  return scored.sort((p, q) => q.s - p.s).slice(0, limit).map((x) => x.c);
}

/** The registry as a compact menu for a model: one line per capability, its parameters with their ranges. */
export function capabilityMenu(kinds: readonly CapabilityKind[] = ['primitive', 'pattern', 'effect', 'type', 'composition', 'style']): string {
  const lines: string[] = [];
  for (const k of kinds) {
    lines.push(`## ${k}`);
    for (const c of CAPABILITIES.filter((x) => x.kind === k)) lines.push(`${c.id}${c.params?.length ? ` (${c.params.map((p) => `${p.key} ${p.min}..${p.max}`).join(', ')})` : ''}`);
  }
  return lines.join('\n');
}

/** A visual plan from a model (a vocabulary: style, composition, shapes, pattern, treatments, effects) held to the
 * registry. Unknown names are dropped and said; nothing unknown reaches a design. */
export function validateVisualPlan(v: unknown): { vocabulary: VisualVocabulary | null; notes: string[] } {
  const notes: string[] = [];
  return { vocabulary: normalizeVocabulary(v, notes), notes };
}

const KNOWN_OPS = new Set(['add', 'update', 'move', 'resize', 'remove', 'reorder', 'group', 'ungroup', 'duplicate', 'asset', 'artboard-add', 'artboard-update', 'artboard-duplicate', 'artboard-remove', 'artboard-reorder', 'tokens', 'locks', 'boolean', 'flatten', 'outline-stroke', 'offset', 'path', 'combine', 'blend', 'repeat', 'mirror', 'align', 'distribute', 'mask', 'swatches', 'vocabulary']);

/** Operations from a model, tried before anything is applied: each must be a known operation, and all of them
 * together must apply to the document (applyOps is all-or-nothing). Returns what may be applied, or nothing. */
export function validateOps(doc: GraphicDoc, ops: unknown): { ok: true; ops: Op[]; doc: GraphicDoc; notes: string[] } | { ok: false; error: string; refused: string[] } {
  if (!Array.isArray(ops)) return { ok: false, error: 'The answer was not a list of operations.', refused: [] };
  if (ops.length > 200) return { ok: false, error: 'Too many operations in one change (at most 200).', refused: [] };
  const refused: string[] = [];
  const kept: Op[] = [];
  for (const raw of ops) {
    const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
    if (!r || typeof r.op !== 'string' || !KNOWN_OPS.has(r.op)) {
      refused.push(`An operation SocriaUX does not know (“${String(r?.op ?? raw).slice(0, 24)}”).`);
      continue;
    }
    kept.push(r as unknown as Op);
  }
  if (refused.length) return { ok: false, error: 'The change asked for operations SocriaUX does not know; nothing was applied.', refused };
  const tried = applyOps(doc, kept);
  if (!tried.ok) return { ok: false, error: `The change could not be applied as a whole (${tried.error}); nothing was applied.`, refused: [tried.error] };
  return { ok: true, ops: kept, doc: tried.doc, notes: tried.notes };
}

/** The capability counts, for the record and the report. */
export function capabilityCounts(): Record<CapabilityKind, number> {
  const out = {} as Record<CapabilityKind, number>;
  for (const c of CAPABILITIES) out[c.kind] = (out[c.kind] ?? 0) + 1;
  return out;
}

export const hasPrimitive = (k: string) => PRIMITIVE_BY_KIND.has(k);
export const hasPattern = (k: string) => PATTERN_BY_KIND.has(k);
export const hasEffect = (k: string) => EFFECT_BY_KIND.has(k);
