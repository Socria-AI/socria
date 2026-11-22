// lib/ux-v0/targeted.ts — the targeted changes a designer asks for by naming a part, done at once in code.
//
// "Replace the picture in the second section." "Change this organic shape into a sharp angular one." "Make the
// mobile navigation more compact." "Reduce the animation intensity." Each names a part (by the selection, its order
// or its kind, read by lib/ux-v0/scope.ts) and one kind of change, and each is one typed patch to that part: no model,
// nothing regenerated, a version Undo takes back, checked against what the designer locked like every other change.
// Anything it is not sure of returns null and goes on to the quick edits and, after them, the model.

import { adjust } from './refine-local';
import { normalizeRecipe, type ShapeRecipe } from './shape';
import type { Piece } from './compose';
import { usableImages, type DesignSpec, type Patch, type Section } from './spec';
import type { Scope } from './scope';
import type { Moodboard } from './types';

export interface Targeted {
  patches: Patch[];
  /** what was done, or why nothing could be, in a few words */
  label: string;
}

const lower = (s: string) => s.toLowerCase().replace(/[’']/g, "'");

/** An angular recipe from an organic one (or the reverse), keeping its seed and turn: the same place, another language. */
export function reshape(form: ShapeRecipe, to: 'angular' | 'organic'): ShapeRecipe {
  const f = normalizeRecipe(form) ?? form;
  const next = to === 'angular'
    ? normalizeRecipe({ kind: 'poly', seed: f.seed, n: Math.max(4, Math.min(7, f.n || 5)), irregular: 38, curve: 0, turn: f.turn, cut: 0, warp: 0 })
    : normalizeRecipe({ kind: 'organic', seed: f.seed, n: Math.max(3, Math.min(6, f.n || 4)), irregular: 46, curve: 88, turn: f.turn, cut: 0, warp: 18 });
  return next ?? f;
}

/** The pieces of a composed tree that are shapes, by their paths. */
function shapePaths(root: Piece, path = 'root'): string[] {
  const out: string[] = [];
  if (root.t === 'shape') out.push(path);
  if ('children' in root && Array.isArray(root.children)) root.children.forEach((ch, i) => out.push(...shapePaths(ch, `${path}.children.${i}`)));
  return out;
}

/** The tree with the shape at each path given another recipe. */
function withShapes(root: Piece, paths: readonly string[], to: 'angular' | 'organic', path = 'root'): Piece {
  let p = root;
  if (p.t === 'shape' && paths.includes(path)) p = { ...p, form: reshape(p.form, to) };
  if ('children' in p && Array.isArray(p.children)) p = { ...p, children: p.children.map((ch, i) => withShapes(ch, paths, to, `${path}.children.${i}`)) } as Piece;
  return p;
}

/** The targeted change the words ask for, or null (see the head of this file). */
export function readTargeted(words: string, spec: DesignSpec, moodboard: Moodboard | null | undefined, selection: { element?: { ux?: { section?: string; path?: string } | null } | null } | null | undefined, scope: Scope): Targeted | null {
  const n = lower(words || '');
  if (!n || n.length > 220) return null;
  const target = (pred: (s: Section) => boolean): Section | null => {
    for (const id of scope.sections) {
      const s = spec.sections.find((x) => x.id === id);
      if (s && pred(s)) return s;
    }
    return null;
  };

  // another picture for a part: the next kept picture on the moodboard that the page does not use yet
  if (/\b(replace|change|swap|another|different|new)\b/.test(n) && /\b(image|picture|photo|photograph|background image)\b/.test(n)) {
    const sec = target((s) => s.images.length > 0);
    if (!sec) return null;
    const used = new Set(spec.sections.flatMap((s) => s.images));
    const ids = usableImages(moodboard ?? null);
    const fresh = [...(ids ?? [])].find((id) => !used.has(id));
    if (!fresh) return { patches: [], label: 'there is no other picture on the moodboard to put there: keep or add one first' };
    return { patches: [{ op: 'images', sectionId: sec.id, images: [fresh, ...sec.images.slice(1)], summary: 'Another picture' }], label: `another picture in the ${sec.kind === 'compose' ? 'part' : sec.kind}` };
  }

  // a shape language: organic into angular, or the reverse — the selected shape, a part's shapes, or the page's system
  const ANG = '(angular|sharp|geometric|faceted|polygonal|hard-edged)';
  const ORG = '(organic|fluid|soft|curved|rounded|flowing)';
  const toAngular = new RegExp(`\\b(into|to|more|make (it|them))\\b[^.]{0,40}\\b${ANG}\\b`).test(n);
  const toOrganic = new RegExp(`\\b(into|to|more|make (it|them))\\b[^.]{0,40}\\b${ORG}\\b`).test(n);
  const saysAngular = new RegExp(`\\b${ANG}\\b`).test(n);
  const saysOrganic = new RegExp(`\\b${ORG}\\b`).test(n);
  const wants: 'angular' | 'organic' | null = toAngular && !toOrganic ? 'angular' : toOrganic && !toAngular ? 'organic' : saysAngular && !saysOrganic ? 'angular' : saysOrganic && !saysAngular ? 'organic' : null;
  if (wants && /\b(shapes?|composition|geometry|forms?|planes?)\b/.test(n) && /\b(make|change|turn|into|more|use)\b/.test(n)) {
    const to = wants;
    const selPath = selection?.element?.ux?.path ?? '';
    const selSec = selection?.element?.ux?.section ?? '';
    const sec = target((s) => s.kind === 'compose' && !!s.content.root) ?? (selSec ? spec.sections.find((s) => s.id === selSec && s.kind === 'compose') ?? null : null);
    if (sec) {
      const root = sec.content.root as Piece;
      const all = shapePaths(root);
      const paths = all.includes(selPath) ? [selPath] : all;
      if (!paths.length) return { patches: [], label: 'that part has no shapes to change' };
      return { patches: [{ op: 'content', sectionId: sec.id, content: { ...sec.content, root: withShapes(root, paths, to) }, summary: `${paths.length === 1 ? 'The shape' : 'Its shapes'} made ${to}` }], label: `${paths.length === 1 ? 'the shape' : 'the part’s shapes'} made ${to === 'angular' ? 'sharp and angular' : 'organic'}` };
    }
    // no part named: the page's shape system leans that way (frames, edges, marks follow it), and every shape a
    // composed part placed is given the same language
    if (scope.sections.length) return null;
    const patches: Patch[] = [];
    const form = spec.look.form;
    if (form) patches.push({ op: 'look', look: { form: to === 'angular' ? { ...form, curvature: Math.min(form.curvature, 10), orthogonal: Math.max(form.orthogonal, 62) } : { ...form, curvature: Math.max(form.curvature, 82), orthogonal: Math.min(form.orthogonal, 30) } }, summary: `Shapes made ${to}` });
    for (const s of spec.sections) {
      if (s.kind !== 'compose' || !s.content.root) continue;
      const root = s.content.root as Piece;
      const paths = shapePaths(root);
      if (paths.length) patches.push({ op: 'content', sectionId: s.id, content: { ...s.content, root: withShapes(root, paths, to) }, summary: `Shapes made ${to}` });
    }
    if (!patches.length) return { patches: [], label: 'the page has no shapes to change' };
    return { patches, label: `every shape made ${to === 'angular' ? 'sharp and angular' : 'organic'}` };
  }

  // the navigation on a phone, more compact (or roomier): its own phone rule, nothing at other widths
  if (/\b(mobile|phone|small screen)\b/.test(n) && /\b(nav|navigation|menu|header)\b/.test(n) && /\b(compact|smaller|tighter|slimmer|less space|roomier|more space)\b/.test(n)) {
    const nav = spec.sections.find((s) => s.kind === 'nav');
    if (!nav) return null;
    const roomier = /\b(roomier|more space)\b/.test(n);
    const pad = roomier ? 'm' : 's';
    if ((nav.responsive?.mobile?.pad ?? '') === pad) return { patches: [], label: `the phone navigation is already as ${roomier ? 'roomy' : 'compact'} as it goes` };
    return { patches: [{ op: 'responsive', sectionId: nav.id, breakpoint: 'mobile', rule: { pad }, summary: roomier ? 'A roomier navigation on phones' : 'A more compact navigation on phones' }], label: roomier ? 'a roomier navigation on phones' : 'a more compact navigation on phones' };
  }

  // the motion's intensity, a step at a time, nothing else
  if (/\b(animation|animations|motion|movement|transitions?)\b/.test(n) && /\b(intensity|intense|less|reduce|lower|tone down|calm(er)?|soften|dial down|subtler|more|livelier|stronger|increase)\b/.test(n)) {
    const less = /\b(less|reduce|lower|tone down|calm(er)?|soften|dial down|subtler)\b/.test(n);
    const r = adjust(spec, less ? 'motion-calmer' : 'motion-livelier');
    if (!r) return { patches: [], label: less ? 'the motion is already as calm as it goes' : 'the motion is already as lively as it goes' };
    return { patches: r.patches, label: r.label };
  }
  return null;
}
