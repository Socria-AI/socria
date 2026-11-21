// lib/ux-v0/graphics/logo/edits.ts — logo edits in words, each scoped and goal-checked. The nine commands (more
// distinctive, less complex, better balanced, a different conceptual direction, a new wordmark under the same symbol,
// more recognisable small, negative space used on purpose, the generic technology look removed, a more expressive
// wordmark) and the variation requests (five completely different concepts, a new visual direction, less
// conventional, not the previous composition, a symbol instead of a wordmark, a new geometric idea). A targeted edit
// changes only its part (a wordmark edit leaves the symbol's geometry exactly as it was); every edit makes new concepts
// beside the old ones (nothing shown is lost); an edit that cannot meet its goal says so and keeps its closest try.
// Every mark an edit makes is rebuildable from its method, seed and a list of named transforms (ops).

import { languageFor, looksTech, isTechFace } from '../generative/language';
import type { LogoBrief } from './brief';
import { exploreLogos, letteringFor, makeConcept, type LogoConcept, type WordmarkSpec } from './concepts';
import { bar as barCut, boundsOfParts, circle, fitMark, mapMark, squircleOf, strokeArea, type Mark, type MarkPart } from './geom';
import { evaluateLogo } from './evaluate';
import { rng } from '../generative/util';
import { buildMark, METHODS, refineMark, type MethodId } from './symbols';
import { inkOf, likeness, occupancy, rasterize } from './raster';

export const LOGO_COMMANDS = [
  { id: 'distinctive', label: 'Make the symbol more distinctive.', scope: 'symbol' },
  { id: 'simpler', label: 'Reduce the complexity.', scope: 'symbol' },
  { id: 'balanced', label: 'Make the geometry more balanced.', scope: 'symbol' },
  { id: 'direction', label: 'Try a different conceptual direction.', scope: 'concept' },
  { id: 'wordmark', label: 'Keep the symbol but redesign the wordmark.', scope: 'wordmark' },
  { id: 'small', label: 'Make the mark more recognizable at small sizes.', scope: 'symbol' },
  { id: 'negative', label: 'Use negative space more intentionally.', scope: 'symbol' },
  { id: 'untech', label: 'Remove the generic technology aesthetic.', scope: 'concept' },
  { id: 'expressive', label: 'Create a more expressive wordmark.', scope: 'wordmark' },
] as const;
export const LOGO_VARIATIONS = [
  { id: 'five', label: 'Give me five completely different concepts', scope: 'exploration' },
  { id: 'new-direction', label: 'Explore a new visual direction', scope: 'exploration' },
  { id: 'unconventional', label: 'Make this less conventional', scope: 'exploration' },
  { id: 'no-reuse', label: 'Don’t reuse the previous composition', scope: 'concept' },
  { id: 'symbol', label: 'Try a symbol instead of a wordmark', scope: 'concept' },
  { id: 'geometric', label: 'Develop a new geometric idea', scope: 'exploration' },
] as const;
export type LogoEditId = (typeof LOGO_COMMANDS)[number]['id'] | (typeof LOGO_VARIATIONS)[number]['id'];

const READ: readonly [RegExp, LogoEditId][] = [
  [/\b(five|5)\b.*\b(different|new)\b.*\bconcepts?\b|\bcompletely different concepts\b/, 'five'],
  [/\bnew (visual )?direction\b|\bexplore (a )?(new|different) (visual )?direction/, 'new-direction'],
  [/\bless conventional\b|\bunconventional\b|\bless (safe|obvious|expected)\b/, 'unconventional'],
  [/\b(don'?t|do not|never) reuse\b|\bnot the (same|previous) (composition|structure)\b/, 'no-reuse'],
  [/\bsymbol instead of (a |the )?word ?mark\b|\btry a symbol\b/, 'symbol'],
  [/\bnew geometric idea\b|\bgeometric (idea|direction|concept)\b/, 'geometric'],
  [/\bkeep the symbol\b.*\bword ?mark\b|\bredesign the word ?mark\b|\bnew word ?mark\b/, 'wordmark'],
  [/\bmore expressive word ?mark\b|\bexpressive (word ?mark|lettering|type)\b/, 'expressive'],
  [/\bmore distinctive\b|\bmore unique\b|\bless generic\b|\bstand out more\b/, 'distinctive'],
  [/\breduce (the )?complexity\b|\bsimpler\b|\bsimplify\b|\bless (complex|busy|detail)/, 'simpler'],
  [/\bmore balanced\b|\bbalance the\b|\bbetter balance\b/, 'balanced'],
  [/\bdifferent (conceptual )?direction\b|\bdifferent concept\b|\bnew concept\b|\banother idea\b/, 'direction'],
  [/\bsmall sizes?\b|\brecogni[sz]able (when )?small\b|\bat 16\b|\bfavicon\b/, 'small'],
  [/\bnegative space\b/, 'negative'],
  [/\b(generic )?tech(nology)? (aesthetic|look|feel)\b|\bless techy\b|\bnot so tech/, 'untech'],
];

/** The edit a sentence asks for, if it is one of the logo edits. */
export function readLogoEdit(words: string): { id: LogoEditId; label: string; scope: string } | null {
  const w = words.toLowerCase();
  const hit = READ.find(([re]) => re.test(w));
  if (!hit) return null;
  const spec = [...LOGO_COMMANDS, ...LOGO_VARIATIONS].find((x) => x.id === hit[1])!;
  return { id: spec.id, label: spec.label, scope: spec.scope };
}

// ── named transforms on a mark (the ops a concept records, so it can be rebuilt) ──

/** Details and accents dropped, strokes heavier: the simpler mark. */
function opSimplify(m: Mark): Mark {
  const keep = m.parts.filter((p) => !p.detail);
  const parts = (keep.length ? keep : m.parts).map((p) => ({ ...p, tone: p.tone === 2 ? (0 as const) : p.tone }));
  return { ...m, parts, notes: [...m.notes, 'simplified: details dropped, the accent folded into the main ink'] };
}
/** Strokes thickened by a factor. */
const opThick = (m: Mark, k: number): Mark => ({ ...m, parts: m.parts.map((p) => (p.stroke ? { ...p, stroke: { ...p.stroke, width: Math.round(p.stroke.width * k) } } : p)), notes: [...m.notes, `strokes ${Math.round((k - 1) * 100)}% heavier`] });
/** One weight for every stroke (the median), centred exactly. */
function opBalance(m: Mark): Mark {
  const ws = m.parts
    .filter((p) => p.stroke)
    .map((p) => p.stroke!.width)
    .sort((a, b) => a - b);
  const med = ws.length ? ws[Math.floor(ws.length / 2)] : 0;
  const even = { ...m, parts: m.parts.map((p) => (p.stroke ? { ...p, stroke: { ...p.stroke, width: med } } : p)) };
  const ink = inkOf(rasterize(even, 128, { x: 0, y: 0, w: 1000, h: 1000 }));
  let sx = 0;
  let sy = 0;
  let c = 0;
  for (let j = 0; j < 128; j++)
    for (let i = 0; i < 128; i++)
      if (ink[j * 128 + i]) {
        sx += i;
        sy += j;
        c++;
      }
  const dx = c ? (64 - sx / c) * (1000 / 128) : 0;
  const dy = c ? (62.5 - sy / c) * (1000 / 128) : 0;
  return { ...mapMark(even, (x, y) => [x + dx, y + dy], 1), notes: [...m.notes, 'strokes made one weight; the visual centre placed on the optical centre'] };
}
/** The symbol turned into negative space: cut out of a solid form. */
function opNegative(m: Mark): Mark {
  const inner = fitMark({ ...m, parts: m.parts.filter((p) => !p.ringText) }, 520);
  const cutters = inner.parts.map((p: MarkPart) => (p.stroke ? strokeArea(p.path, p.stroke.width) : p.path));
  const b = boundsOfParts(inner.parts);
  const round = b.w / Math.max(1, b.h) > 0.8 && b.w / Math.max(1, b.h) < 1.25;
  const base = round ? circle(500, 500, 420) : squircleOf(500, 500, 420);
  return { method: m.method, params: { ...m.params, negative: true }, parts: [{ name: 'Solid', path: base, cuts: cutters, tone: 0 }], notes: [...m.notes, 'the symbol cut out of a solid form: its meaning held in the space'] };
}

/** One decisive cut through the whole mark (a gap of the ground at an angle): the move that makes a familiar form
 * its own. */
function opCut(m: Mark, angle: number): Mark {
  const w = 46;
  const cut = barCut(500, 500, angle, w);
  return { ...m, parts: m.parts.map((p) => (p.ringText ? p : { ...p, cuts: [...(p.cuts ?? []), cut] })), notes: [...m.notes, `one cut through the whole mark at ${Math.round(angle)}°`] };
}

/** A mark rebuilt from its method, seed and ops (see the head of this file). */
export function rebuildMark(method: MethodId, seed: string, ctx: Parameters<typeof buildMark>[2], ops: readonly string[] = []): Mark {
  let m = buildMark(method, seed, ctx);
  for (const op of ops) {
    if (op === 'simplify') m = opSimplify(m);
    else if (op === 'balance') m = opBalance(m);
    else if (op === 'negative') m = refineMark(opNegative(m));
    else if (op.startsWith('thick:')) m = opThick(m, Math.max(1, Math.min(2, Number(op.slice(6)) || 1)));
    else if (op.startsWith('cut:')) m = opCut(m, Math.max(-90, Math.min(90, Number(op.slice(4)) || 0)));
  }
  return { ...m, params: { ...m.params, ...(ops.length ? { ops: ops.join(',') } : {}) } };
}

const sigOf = (m: Mark) => occupancy(inkOf(rasterize(m, 64, { x: 0, y: 0, w: 1000, h: 1000 })), 64, 10);
const markCtx = (b: LogoBrief, c: LogoConcept) => ({ name: b.name, initials: b.initials, sw: c.sw, soft: c.soft, avoid: new Set(b.avoid), ...(b.creature ? { creature: b.creature } : {}) });
const derived = (b: LogoBrief, base: LogoConcept, patch: Partial<LogoConcept>, edit: string): LogoConcept => {
  const id = `${base.id}_${(Math.abs([...`${edit}|${patch.seed ?? base.seed}|${(patch.mark?.params as Record<string, unknown> | undefined)?.ops ?? ''}|${patch.wordmark?.font ?? patch.wordmark?.style?.weight ?? ''}`].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7)) % 1e8).toString(36)}`;
  const next: LogoConcept = { ...base, ...patch, id, status: 'proposed', parents: [base.id], edit };
  if (patch.mark) next.sig = sigOf(patch.mark);
  return next;
};

export interface LogoEditResult {
  /** new concepts (the old ones are kept by the caller) */
  concepts: LogoConcept[];
  said: string;
  /** what changed: the symbol, the wordmark, the palette, a new concept */
  changed: ('symbol' | 'wordmark' | 'palette' | 'concept')[];
  /** the goal was met (false: the closest try is kept and said) */
  met: boolean;
}

const score = (c: LogoConcept, b: LogoBrief, all: readonly LogoConcept[], key: string) => evaluateLogo(c, b, all).criteria.find((x) => x.key === key)?.score ?? 0;

/** An edit applied to a concept (see the head of this file). `all` is every concept shown so far. */
export function applyLogoEdit(c: LogoConcept, b: LogoBrief, id: LogoEditId, all: readonly LogoConcept[], round = 1): LogoEditResult {
  const label = [...LOGO_COMMANDS, ...LOGO_VARIATIONS].find((x) => x.id === id)?.label ?? id;
  const used = all.map((x) => x.method).filter((m): m is MethodId => !!m);
  const ops = String((c.mark?.params as Record<string, unknown> | undefined)?.ops ?? '')
    .split(',')
    .filter(Boolean);
  // symbol edits on a wordmark-only concept make the symbol first
  if (!c.method && ['distinctive', 'simpler', 'balanced', 'small', 'negative'].includes(id)) id = 'symbol';

  if (id === 'distinctive' || id === 'balanced' || id === 'small' || id === 'simpler') {
    const key = id === 'distinctive' ? 'distinctiveness' : id === 'balanced' ? 'balance' : id === 'small' ? 'small' : 'simplicity';
    const before = score(c, b, all, key);
    // the moves each goal is tried with, best result kept: new parameters of the same method, a decisive cut, fewer
    // and larger forms, heavier strokes
    const tries: { seed: string; ops: string[]; sw: number }[] = [];
    if (id === 'distinctive') {
      for (let k = 0; k < 4; k++) tries.push({ seed: `${c.seed}.d${round}.${k}`, ops, sw: c.sw });
      tries.push({ seed: c.seed, ops: [...ops, `cut:${[-38, 52, 24][round % 3]}`], sw: c.sw }, { seed: c.seed, ops: [...ops, 'negative'], sw: c.sw });
    } else if (id === 'small') {
      for (let k = 0; k < 5; k++) tries.push({ seed: k ? `${c.seed}.s${round}.${k}` : c.seed, ops: [...ops, 'simplify', 'thick:1.25'], sw: Math.round(c.sw * (1.15 + k * 0.07)) });
    } else tries.push({ seed: c.seed, ops: [...ops, id === 'balanced' ? 'balance' : 'simplify'], sw: c.sw });
    if (id === 'simpler') for (let k = 0; k < 3; k++) tries.push({ seed: `${c.seed}.m${round}.${k}`, ops: [...ops, 'simplify'], sw: c.sw });
    let best: LogoConcept | null = null;
    let bestScore = -1;
    for (const t of tries) {
      const mark = rebuildMark(c.method!, t.seed, { ...markCtx(b, c), sw: t.sw }, t.ops);
      const cand = derived(b, c, { mark, seed: t.seed, sw: t.sw }, label);
      const s = score(cand, b, all, key);
      if (s > bestScore) {
        bestScore = s;
        best = cand;
      }
    }
    const already = id === 'balanced' && before >= 0.85;
    const met = bestScore > before + 0.02 || bestScore >= 0.98 || already;
    const word = { distinctiveness: 'distinctiveness', balance: 'balance', small: 'small-size performance', simplicity: 'simplicity' }[key];
    return {
      concepts: [best!],
      said: already
        ? `${label} It was already balanced (${before.toFixed(2)}); its strokes are now one weight and its visual centre sits exactly on the optical centre (${bestScore.toFixed(2)}).`
        : met
          ? `${label} ${capitalise(word)} ${before.toFixed(2)} → ${bestScore.toFixed(2)}; the idea, the wordmark and the palette are as they were.`
          : `${label} ${capitalise(word)} could not be raised beyond ${before.toFixed(2)} with this construction (closest try ${bestScore.toFixed(2)}, kept beside the original); a different direction may serve better.`,
      changed: ['symbol'],
      met,
    };
  }

  if (id === 'negative') {
    const mark = c.method === 'negative' ? rebuildMark('negative', `${c.seed}.n${round}`, markCtx(b, c), ops) : rebuildMark(c.method!, c.seed, markCtx(b, c), [...ops, 'negative']);
    const cand = derived(b, c, { mark, category: 'negative' }, label);
    return { concepts: [cand], said: `${label} The ${METHODS[c.method!].label.toLowerCase()} is now cut out of a solid form, so the idea is held by the space; the wordmark is unchanged.`, changed: ['symbol'], met: true };
  }

  if (id === 'wordmark' || id === 'expressive') {
    const r = rng('wordmark-edit', c.id, round);
    let wm: WordmarkSpec | null = null;
    for (let k = 0; k < 6 && !wm; k++) {
      const next = letteringFor(b, r.fork(k), id === 'expressive' ? { prefer: 'constructed', expressive: true } : { prefer: c.wordmark.kind === 'constructed' ? 'typeset' : 'constructed' });
      const same = next.kind === c.wordmark.kind && (next.font ?? '') === (c.wordmark.font ?? '') && JSON.stringify(next.style ?? {}) === JSON.stringify(c.wordmark.style ?? {});
      if (!same && (id !== 'expressive' || next.kind === 'typeset' || (next.modification && next.modification.kind !== 'none'))) wm = next;
    }
    const cand = derived(b, c, { wordmark: wm ?? c.wordmark, typography: (wm ?? c.wordmark).why }, label);
    cand.mark = c.mark;
    cand.sig = c.sig;
    return { concepts: [cand], said: `${label} The symbol’s geometry is kept exactly; the name is now ${wm ? wm.why.charAt(0).toLowerCase() + wm.why.slice(1) : 'set as before (no different setting found)'}`, changed: ['wordmark'], met: !!wm };
  }

  if (id === 'untech') {
    const traits = b.personality.filter((t) => !['precise', 'clever', 'modern'].includes(t));
    const palette = looksTech(c.palette) ? languageFor(traits.length ? [...traits, 'warm'] : ['warm', 'natural'], `${c.id}|untech|${round}`, { avoidTech: true }).palette : c.palette;
    const techMethod = !!c.method && (METHODS[c.method].tech || ['grid', 'modular', 'pixel', 'aperture'].includes(c.method));
    const method: MethodId | null = techMethod ? ((['organic', 'trace', 'wave', 'fold', 'letter'] as MethodId[]).find((m) => !used.includes(m)) ?? 'organic') : c.method;
    const wm = c.wordmark.kind === 'typeset' && isTechFace(c.wordmark.font ?? '') ? letteringFor({ ...b, avoid: [...b.avoid, 'tech'] }, rng('untech', c.id, round), { prefer: 'typeset' }) : c.wordmark;
    const next =
      method !== c.method
        ? makeConcept({ ...b, avoid: [...b.avoid, 'tech'] }, c.category === 'modular' ? 'organic' : c.category, method, `${c.seed}.u${round}`, { palette, lettering: wm, lockup: c.lockup, parents: [c.id], edit: label })
        : derived(b, c, { palette, wordmark: wm }, label);
    const changes = [
      looksTech(c.palette) ? 'the electric blue or violet palette replaced by warmer colour' : '',
      techMethod ? `the ${METHODS[c.method!].label.toLowerCase()} replaced by a ${METHODS[method!].label.toLowerCase()}` : '',
      wm !== c.wordmark ? `the technical face replaced by ${wm.font}` : '',
    ].filter(Boolean);
    return {
      concepts: [next],
      said: `${label} ${changes.length ? capitalise(changes.join('; ')) + '.' : 'Nothing in it read as a generic technology look; it is kept as it was.'}`,
      changed: changes.length ? ['palette', 'symbol', 'wordmark'] : [],
      met: true,
    };
  }

  if (id === 'direction' || id === 'no-reuse' || id === 'symbol') {
    const cats = id === 'symbol' ? (['combination', 'abstract', 'geometric', 'organic', 'negative'] as const) : undefined;
    const list = exploreLogos(b, { count: 1, seed: `${c.seed}|${id}|${round}`, prior: all, notMethods: used, exclude: c.method ? [c.method] : [], ...(cats ? { only: cats, symbolLed: true } : {}) });
    const next = list[0] ? { ...list[0], palette: c.palette, parents: [c.id], edit: label, ...(id === 'symbol' ? { lockup: 'stacked' as const } : {}) } : null;
    if (!next) return { concepts: [], said: `${label} No unused direction is left for this brief; the concepts already shown cover every method that answers it.`, changed: [], met: false };
    const alike = c.sig?.length && next.sig?.length ? likeness(c.sig, next.sig) : 0;
    return { concepts: [next], said: `${label} A new idea: ${next.coreIdea} (structure ${alike.toFixed(2)} alike to the previous one).`, changed: ['concept'], met: alike < 0.84 };
  }

  // explorations
  const notMethods = [...new Set(used)];
  if (id === 'five') {
    const list = exploreLogos(b, { count: 5, seed: `five|${round}`, prior: all, notMethods });
    return { concepts: list, said: `${label}: ${list.length} new concepts, none of them repeating a method or a structure already shown.`, changed: ['concept'], met: list.length >= 5 };
  }
  if (id === 'new-direction') {
    const lang = languageFor(b.personality.length ? b.personality : ['modern'], `direction|${round}|${c.id}`, {});
    const list = exploreLogos(b, { count: 4, seed: `dir|${round}`, prior: all, notMethods }).map((x) => ({ ...x, palette: lang.palette }));
    return { concepts: list, said: `${label}: ${list.length} concepts in a new visual language (${lang.said[0]})`, changed: ['concept', 'palette'], met: list.length > 0 };
  }
  if (id === 'unconventional') {
    const list = exploreLogos(b, { count: 4, seed: `odd|${round}`, prior: all, notMethods, unconventional: true });
    return { concepts: list, said: `${label}: ${list.length} concepts from less expected methods, with expressive lettering.`, changed: ['concept'], met: list.length > 0 };
  }
  const list = exploreLogos(b, { count: 3, seed: `geo|${round}`, prior: all, notMethods, geometric: true, only: ['geometric', 'abstract', 'modular', 'combination', 'minimal'] });
  return { concepts: list, said: `${label}: ${list.length} geometric concepts, each a construction not yet shown.`, changed: ['concept'], met: list.length > 0 };
}

const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Two concepts combined: the first's symbol with the second's wordmark and palette. */
export function combineConcepts(a: LogoConcept, b2: LogoConcept, b: LogoBrief): LogoConcept {
  const c = derived(b, a, { wordmark: b2.wordmark, typography: b2.typography, palette: b2.palette }, `Combined: the symbol of “${a.title}” with the wordmark and colour of “${b2.title}”`);
  c.mark = a.mark;
  c.sig = a.sig;
  c.parents = [a.id, b2.id];
  return c;
}
