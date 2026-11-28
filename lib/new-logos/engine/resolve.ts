// lib/new-logos/engine/resolve.ts — WHAT "THIS", "THESE", "THE REVENUE MODEL" AND "@PRICING" MEAN, here and now.
//
// Every object a person can act on is addressed by a persistent ref, never by its words: r:<component id>,
// n:<node id>, s:<source id>, g:<group id>, x:<exchange key>. A reference written in a command resolves to refs from:
//   • the selection ("this", "it", "that" → the one selected, or the one last touched; "these", "them" → all selected);
//   • explicit mentions (@… chosen from the Omnibox: exact ids — renaming or moving the object never breaks them);
//   • names, matched over everything addressable here (components' words, variables' names and labels, groups'
//     names, nodes' titles, sources' names), only when one match is clearly best;
//   • kinds ("the plot", "the open questions", "the previous model");
//   • "everything related to pricing": what matches, and what it is connected to.
// What cannot be resolved reliably is said so, with the candidates, rather than guessed. Pure: no I/O.

import { KIND_WORD, otherEnd, type RepItem, type Representation } from '../representation';
import type { CanvasLayout } from '../canvas';
import { hiddenBy } from '../groups';

export interface Target {
  ref: string;
  /** what it is called */
  label: string;
  /** a component's kind, a node's type, 'group', 'source', 'exchange' */
  kind: string;
  /** other names it answers to (a variable's name, a group's name) */
  also?: string[];
  /** when it was made */
  at?: number;
}

export interface WorkspaceCtx {
  /** c:<conversation id> or o:<objective node id> */
  key: string;
  rep: Representation;
  layout: CanvasLayout;
  /** refs selected, the primary one first */
  selection: string[];
  /** refs touched lately, newest last */
  recent: string[];
  /** nodes placed on this canvas, and every objective (workspaces), with what they are called */
  nodes: { id: string; type: string; title: string; created_at?: number }[];
  sources: { id: string; name: string; created_at?: number }[];
  /** exchanges shown here (said elsewhere, not yet represented) */
  exchanges?: { key: string; text: string }[];
  sizeOf: (ref: string) => { w: number; h: number };
  now: number;
  /** mentions chosen in the Omnibox: their words, and the ref each is */
  mentions?: { label: string; ref: string }[];
}

const STOP = new Set(['the', 'a', 'an', 'my', 'our', 'your', 'this', 'that', 'these', 'those', 'of', 'for', 'in', 'on', 'to', 'and', 'with', 'about', 'thing', 'things', 'one', 'item', 'items', 'component', 'components', 'card', 'object']);
const stem = (w: string) => w.replace(/(ings|ing|ies|es|s|ed)$/, (m) => (m === 'ies' ? 'y' : '')).replace(/e$/, '');
export const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/[@“”"'’‘]/g, '')
    .replace(/[^a-z0-9£$€%.\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w && !STOP.has(w))
    .map(stem);

/** Everything here that can be acted on. */
export function catalogue(ctx: WorkspaceCtx): Target[] {
  const out: Target[] = [];
  for (const it of ctx.rep.items) {
    const also: string[] = [];
    if (it.kind === 'variable' && it.prim.type === 'control') also.push(it.prim.data.variable);
    if (it.kind === 'equation' && it.prim.type === 'equation' && it.prim.data.name) also.push(it.prim.data.name);
    out.push({ ref: `r:${it.id}`, label: it.text || KIND_WORD[it.kind], kind: it.kind, ...(also.length ? { also } : {}), at: it.at });
  }
  for (const [gid, g] of Object.entries(ctx.layout.groups ?? {})) out.push({ ref: `g:${gid}`, label: g.name || 'a group', kind: 'group' });
  for (const n of ctx.nodes) out.push({ ref: `n:${n.id}`, label: n.title || n.type, kind: n.type, ...(n.created_at ? { at: n.created_at } : {}) });
  for (const s of ctx.sources) out.push({ ref: `s:${s.id}`, label: s.name, kind: 'source', ...(s.created_at ? { at: s.created_at } : {}) });
  for (const x of ctx.exchanges ?? []) out.push({ ref: `x:${x.key}`, label: x.text, kind: 'exchange' });
  return out;
}

/** Objects on view: placed on this canvas and not hidden in a collapsed group (collapsed groups by their tiles). */
export function visibleRefs(ctx: WorkspaceCtx): string[] {
  const hidden = hiddenBy(ctx.layout);
  const out = Object.keys(ctx.layout.items).filter((r) => !hidden.has(r) && (r.startsWith('r:') ? ctx.rep.items.some((i) => `r:${i.id}` === r) : true));
  for (const g of new Set(hidden.values())) out.push(`g:${g}`);
  return out;
}

function score(phrase: string, t: Target): number {
  const p = tokens(phrase);
  if (!p.length) return 0;
  const names = [t.label, ...(t.also ?? [])];
  let best = 0;
  for (const n of names) {
    const exact = n.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === phrase.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (exact) return 1;
    const w = new Set(tokens(n));
    if (!w.size) continue;
    const hit = p.filter((x) => w.has(x) || [...w].some((y) => y.length > 3 && x.length > 3 && (y.startsWith(x) || x.startsWith(y)))).length;
    // what is said must be mostly found; long names partly said still count
    best = Math.max(best, (hit / p.length) * (0.75 + 0.25 * Math.min(1, hit / w.size)));
  }
  return best;
}

export type Resolution = { refs: string[]; how: 'selection' | 'recent' | 'mention' | 'name' | 'kind' | 'related' | 'all' } | { refs: []; how: 'none'; why: string; candidates?: Target[] };

const KIND_WORDS: [RegExp, string[]][] = [
  [/^(?:possibilit(?:y|ies)|hypothes[ie]s|explanations?)$/, ['hypothesis']],
  [/^(?:observations?|facts? (?:you|i) (?:said|gave)|evidence)$/, ['observation']],
  [/^(?:open questions?|unknowns?|missing information|what (?:is|we) do(?:n't| not) know)$/, ['unknown']],
  [/^(?:questions?)$/, ['question']],
  [/^(?:statements?|answers?|points?|thoughts?|notes?)$/, ['statement']],
  [/^(?:caveats?|warnings?|risks?)$/, ['caveat']],
  [/^(?:metrics?|measures?|numbers?|figures?)$/, ['metric']],
  [/^(?:timelines?)$/, ['timeline']],
  [/^(?:steps|sequences?|procedures?)$/, ['sequence']],
  [/^(?:plots?|graphs?|charts?)$/, ['plot']],
  [/^(?:tables?|comparisons?|matri(?:x|ces)|datasets?)$/, ['matrix']],
  [/^(?:equations?|formulas?|formulae)$/, ['equation']],
  [/^(?:variables?|sliders?|inputs?|assumptions?)$/, ['variable']],
  [/^(?:models?|financial models?|revenue models?)$/, ['variable', 'equation', 'plot', 'matrix', 'metric']],
  [/^(?:diagrams?)$/, ['diagram']],
  [/^(?:documents?|sources?|files?)$/, ['document', 'source']],
  [/^(?:people|persons?|entities)$/, ['entity']],
  [/^(?:groups?)$/, ['group']],
];

/** What the words mean among what is here, after the selection and mentions have had their say. */
export function resolve(phrase: string, ctx: WorkspaceCtx, opts: { many?: boolean } = {}): Resolution {
  const p = phrase
    .trim()
    .replace(/[.?!]+$/, '')
    .replace(/^(?:the|a|an)\s+/i, '')
    .trim();
  const low = p.toLowerCase();
  const sel = ctx.selection;
  // explicit mentions: exact
  const mentioned = (ctx.mentions ?? []).filter((m) => low.includes(m.label.toLowerCase()) || low === `@${m.label.toLowerCase()}`);
  if (mentioned.length) return { refs: [...new Set(mentioned.map((m) => m.ref))], how: 'mention' };
  if (/^(?:this|it|that|this one|that one|here|the selected one|the selection|selected)(?: \w+)?$/.test(low) && !/^(?:this|that) (?:workspace|canvas|space|page)$/.test(low)) {
    // "this group": the group the selection is in when the selection is not a group itself
    if (/ group$/.test(low)) {
      const g = sel.find((r) => r.startsWith('g:')) ?? (sel[0] && ctx.layout.items[sel[0]]?.group ? `g:${ctx.layout.items[sel[0]].group}` : null);
      if (g) return { refs: [g], how: 'selection' };
    }
    if (sel.length === 1) return { refs: [sel[0]], how: 'selection' };
    if (sel.length > 1) return opts.many ? { refs: [...sel], how: 'selection' } : { refs: [], how: 'none', why: 'Several things are selected: say which one.' };
    const last = ctx.recent[ctx.recent.length - 1];
    if (last) return { refs: [last], how: 'recent' };
    return { refs: [], how: 'none', why: 'Nothing is selected. Select it first, or name it.' };
  }
  if (/^(?:these|those|them|they|all of these|all of them|both|both of them|the selected(?: ones)?|these (?:two|three|four|\w+))(?: \w+)?$/.test(low)) {
    if (sel.length) return { refs: [...sel], how: 'selection' };
    return { refs: [], how: 'none', why: 'Nothing is selected. Select them first, or name them.' };
  }
  if (/^(?:everything|all|all of it|it all|the whole (?:workspace|canvas|thing)|this (?:workspace|canvas|space))$/.test(low)) return { refs: visibleRefs(ctx), how: 'all' };
  const related = /^(?:everything|all|anything|things|items|stuff)(?: (?:that is|that's|which is))? (?:related to|about|to do with|connected to|concerning|on) (.+)$/.exec(low);
  if (related) {
    const r = relatedTo(related[1], ctx);
    return r.length ? { refs: r, how: 'related' } : { refs: [], how: 'none', why: `Nothing here is about “${related[1]}”.` };
  }
  // kinds: "the plot", "the open questions", "the previous model", "the last table"
  const kindPhrase = /^(?:(previous|last|latest|first|earlier|other|new|newest|older|second) )?(.+)$/.exec(low);
  if (kindPhrase) {
    const k = KIND_WORDS.find(([re]) => re.test(kindPhrase[2]));
    if (k) {
      const items = catalogue(ctx).filter((t) => k[1].includes(t.kind));
      if (items.length) {
        const byTime = [...items].sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
        const plural = /s$/.test(kindPhrase[2]) && !/^(?:analysis|process|series)$/.test(kindPhrase[2]);
        if (plural || (opts.many && !kindPhrase[1])) return { refs: byTime.map((t) => t.ref), how: 'kind' };
        if (items.length === 1) return { refs: [items[0].ref], how: 'kind' };
        const which = kindPhrase[1];
        if (which === 'previous' || which === 'earlier' || which === 'older' || which === 'other') {
          const selT = byTime.findIndex((t) => sel.includes(t.ref));
          const t = selT > 0 ? byTime[selT - 1] : byTime[byTime.length - 2];
          if (t) return { refs: [t.ref], how: 'kind' };
        }
        if (which === 'last' || which === 'latest' || which === 'new' || which === 'newest') return { refs: [byTime[byTime.length - 1].ref], how: 'kind' };
        if (which === 'first') return { refs: [byTime[0].ref], how: 'kind' };
        // "the model" with several model parts: all of them, when many are welcome
        if (opts.many && k[1].length > 1) return { refs: byTime.map((t) => t.ref), how: 'kind' };
      }
    }
  }
  // names: only a clear best
  const ranked = catalogue(ctx)
    .map((t) => ({ t, s: score(p, t) }))
    .filter((x) => x.s >= 0.5)
    .sort((a, b) => b.s - a.s);
  if (!ranked.length) return { refs: [], how: 'none', why: `Nothing here is called “${p}”.` };
  const top = ranked[0];
  const tied = ranked.filter((x) => top.s - x.s < 0.12);
  if (tied.length === 1 || top.s === 1) return { refs: [top.t.ref], how: 'name' };
  if (opts.many && tied.length <= 6) return { refs: tied.map((x) => x.t.ref), how: 'name' };
  return { refs: [], how: 'none', why: `More than one thing here could be “${p}”.`, candidates: tied.slice(0, 5).map((x) => x.t) };
}

/** What a topic touches here: what is about it by its words, and what that is directly connected to. */
export function relatedTo(topic: string, ctx: WorkspaceCtx): string[] {
  const want = tokens(topic);
  if (!want.length) return [];
  const matches = catalogue(ctx).filter((t) => {
    const w = new Set([...tokens(t.label), ...(t.also ?? []).flatMap(tokens)]);
    const item = t.ref.startsWith('r:') ? ctx.rep.items.find((i) => i.id === t.ref.slice(2)) : undefined;
    const detail = item?.detail ? new Set(tokens(item.detail)) : new Set<string>();
    return want.every((x) => w.has(x) || detail.has(x) || [...w].some((y) => y.length > 3 && x.length > 3 && (y.startsWith(x) || x.startsWith(y))));
  });
  const refs = new Set(matches.map((m) => m.ref));
  // one step along the connections of the components found
  for (const m of matches) {
    if (!m.ref.startsWith('r:')) continue;
    const id = m.ref.slice(2);
    for (const r of ctx.rep.relations) if (r.from === id || r.to === id) refs.add(`r:${otherEnd(r, id)}`);
  }
  // a variable's dependents count as related: the equations, plots and measures that use it
  return [...refs];
}

/** The components an item reads aloud as — for confirmation and preview words. */
export function nameOf(ref: string, ctx: WorkspaceCtx): string {
  const t = catalogue(ctx).find((x) => x.ref === ref);
  return t ? `‘${t.label.length > 48 ? `${t.label.slice(0, 47)}…` : t.label}’` : 'it';
}

export type { RepItem };
