// lib/new-logos/engine/commands.ts — THE UNIFIED OPERATION ENGINE: every operation on a workspace, defined once.
//
// The Smart Omnibox (plain English and / commands), direct manipulation on the canvas, the floating toolbar, the
// context menu, keyboard shortcuts and the assistant all invoke these commands, so the same operation makes the same
// change however it was asked for. Each command says what it needs (nothing, one object, some, two), when it is
// offered (for the current selection), and its PLAN: one transaction over
//   • components (representation operations: lib/new-logos/representation-ops.ts, validated on the server),
//   • the layout (positions, groups — lib/new-logos/groups.ts patches, saved with the canvas),
//   • nodes (new workspaces, keeping a component in the workspace), and
//   • the interface (selection, focus, filter, navigation, the library, inspection),
// plus, for an analytical transformation, a question for the intelligence layer about the objects named. A plan that
// is destructive or consequential carries the words to confirm it with; everything else runs at once and is
// reversible (lib/new-logos/engine via the page's executor keeps the undo history).
//
// Compound instructions are planned in order against the state each step leaves ("group these and collapse them":
// "them" is the new group), and run as one change. The assistant never touches persistent state directly: what it
// asks for is planned here, by the same rules, and saved through the same validated routes. Pure: no I/O.

import { GAP, placeNear } from '../canvas';
import { renameIn } from '../expr';
import { KIND_WORD, REL_KINDS, REL_WORD, clip, freshId, isModelKind, itemById, relationId, type RelKind, type RepItem, type Representation } from '../representation';
import { applyRepOps, type RepOp } from '../representation-ops';
import { estimateSize } from '../rep-layout';
import {
  applyPatch,
  arrangePatch,
  besidePatch,
  collapsePatch,
  groupPatch,
  isGroupRef,
  joinPatches,
  membersOf,
  movePatch,
  newGroupId,
  renamePatch,
  ungroupPatch,
  type LayoutPatch,
} from '../groups';
import { analyticalFor, viewNamed, viewsFor } from './transforms';
import { nameOf, relatedTo, resolve, visibleRefs, type WorkspaceCtx } from './resolve';
import { readIntent, type Step } from './intent';

// ── what a command does ──────────────────────────────────────────────

export type UiIntent =
  | { do: 'select'; refs: string[] }
  | { do: 'focus'; ref: string }
  | { do: 'filter'; refs: string[] | null; label?: string }
  | { do: 'navigate'; href: string }
  | { do: 'library'; query?: string; since?: number }
  | { do: 'viewer'; sourceId: string; passage?: string }
  | { do: 'inspect'; ref: string; section?: 'backlinks' }
  | { do: 'history' }
  | { do: 'connect'; from: string; to: string }
  | { do: 'transform'; ref: string };

export type NodeIntent =
  | { do: 'create'; type: 'objective'; title: string; then?: 'navigate' }
  | { do: 'link'; from: string; to: string; kind: string }
  | { do: 'unlink'; from: string; to: string }
  | { do: 'archive'; id: string }
  | { do: 'rename'; id: string; title: string }
  /** a node already made as part of this change (keeping a component in the workspace): undoing archives it */
  | { do: 'adopt'; id: string };

export interface Plan {
  /** the change in words, for the note and the history */
  label: string;
  rep?: RepOp[];
  layout?: LayoutPatch;
  nodes?: NodeIntent[];
  ui?: UiIntent[];
  /** for the intelligence layer: what to think about, and the objects it is about (an analytical transformation) */
  ask?: { text: string; refs: string[] };
  /** say this and wait for yes: it removes several things, or things outside this workspace's components */
  confirm?: string;
  /** the engine's own history */
  history?: { undo?: number | 'burst'; redo?: boolean };
  /** refs the plan made or acted on: what "them" means to the next step */
  result?: string[];
}

export type Args = Record<string, unknown> & {
  refs?: string[];
  target?: string;
  from?: string;
  to?: string;
  kind?: string;
  name?: string;
  text?: string;
  as?: string;
  value?: number;
};

export interface SelInfo {
  refs: string[];
  items: RepItem[];
  groups: string[];
}

export interface CommandDef {
  id: string;
  title: string;
  /** typed after / in the Omnibox */
  slash?: string;
  hint: string;
  needs: 'none' | 'one' | 'some' | 'two';
  /** offered for this selection, here */
  available: (ctx: WorkspaceCtx, sel: SelInfo) => boolean;
  plan: (ctx: WorkspaceCtx, args: Args) => Plan | { error: string };
  /** offered first in the toolbar for a selection like this */
  primary?: (sel: SelInfo) => boolean;
}

const items = (ctx: WorkspaceCtx, refs: readonly string[]) => refs.filter((r) => r.startsWith('r:')).map((r) => itemById(ctx.rep, r.slice(2))).filter((x): x is RepItem => !!x);
export const selInfo = (ctx: WorkspaceCtx): SelInfo => ({ refs: ctx.selection, items: items(ctx, ctx.selection), groups: ctx.selection.filter(isGroupRef).map((r) => r.slice(2)) });
const plural = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);
const err = (error: string) => ({ error });

/** Where something new goes: beside the selection, or at the centre of the view. */
function placeFor(ctx: WorkspaceCtx, size: { w: number; h: number }, at?: { x: number; y: number }): { x: number; y: number } {
  const sel = ctx.selection.find((r) => ctx.layout.items[r]);
  const base = at ?? (sel ? { x: ctx.layout.items[sel].x + ctx.sizeOf(sel).w + GAP * 1.5, y: ctx.layout.items[sel].y } : centreOf(ctx));
  return placeNear(ctx.layout, base, size, ctx.sizeOf);
}
function centreOf(ctx: WorkspaceCtx): { x: number; y: number } {
  const v = ctx.layout.view;
  if (!v) return { x: 0, y: 0 };
  return { x: Math.round((640 - v.x) / v.k), y: Math.round((360 - v.y) / v.k) };
}

// ── making components from a few words ───────────────────────────────

const LIST = (s: string) =>
  s
    .split(/\s*(?:;|\n|,(?![^(]*\)))\s*/)
    .map((x) => x.trim())
    .filter(Boolean);

/** A new component of a kind from a few words: what /thought, "add a table", "create a model of …" make. */
export function itemsFor(kind: string, text: string, taken: Set<string>, variables: readonly string[]): { ops: RepOp[]; first: string } | { error: string } {
  const id = (k: Parameters<typeof freshId>[0], words: string) => {
    const i = freshId(k, words, taken);
    taken.add(i);
    return i;
  };
  const words = (s: string) => s.toLowerCase().split(/\s+/).slice(0, 3).join('_');
  const t = text.trim();
  const add = (item: Record<string, unknown>): RepOp => ({ op: 'add', item });
  switch (kind) {
    case 'thought':
    case 'text': {
      if (!t) return err(kind === 'thought' ? 'What is the thought?' : 'What should it say?');
      const i = id('statement', `t_${words(t)}`);
      return { ops: [add({ id: i, kind: 'statement', role: 'point', basis: kind === 'thought' ? 'interpretation' : 'known', text: t })], first: i };
    }
    case 'question':
    case 'unknown':
    case 'hypothesis':
    case 'observation':
    case 'caveat': {
      if (!t) return err(`What is the ${KIND_WORD[kind as 'question'].toLowerCase()}?`);
      const prefix = { question: 'q', unknown: 'u', hypothesis: 'h', observation: 'o', caveat: 'c' }[kind];
      const i = id(kind as 'question', `${prefix}_${words(t)}`);
      return { ops: [add({ id: i, kind, text: t, ...(kind === 'observation' ? { from: 'person' } : {}), ...(kind === 'caveat' ? { weight: 'note' } : {}) })], first: i };
    }
    case 'table': {
      const cols = t ? LIST(t.replace(/^(?:with|of)\s+/i, '').replace(/\s+(?:and)\s+/gi, ', ')) : [];
      const columns = cols.length >= 2 ? cols.slice(0, 8) : ['Item', 'Value'];
      const i = id('matrix', 'table');
      return { ops: [add({ id: i, kind: 'matrix', text: cols.length >= 2 ? '' : t, columns, rows: [columns.map(() => ''), columns.map(() => ''), columns.map(() => '')] })], first: i };
    }
    case 'plot': {
      const expr = t.replace(/^y\s*=\s*/, '') || 'x^2';
      const i = id('plot', 'plot');
      return { ops: [add({ id: i, kind: 'plot', text: '', series: [{ expr }], x: { min: -10, max: 10 } })], first: i };
    }
    case 'equation': {
      const i = id('equation', 'equation');
      return { ops: [add({ id: i, kind: 'equation', text: '', expr: t || 'y = 2x + 1' })], first: i };
    }
    case 'variable': {
      const m = /^([A-Za-z_][A-Za-z0-9_]{0,30})\s*(?:=|is|of)?\s*(-?\d[\d,]*(?:\.\d+)?)?/.exec(t);
      const name = m?.[1] ?? 'x';
      const value = m?.[2] ? Number(m[2].replace(/,/g, '')) : 1;
      const i = id('variable', name);
      return { ops: [add({ id: i, kind: 'variable', name, value, min: value >= 0 ? 0 : value * 2, max: Math.max(10, Math.abs(value) * 2), text: name })], first: i };
    }
    case 'metric': {
      const m = /^(.+?)\s*(?:=|:)\s*(.+)$/.exec(t);
      if (!m) return err('Say the measure as “label = value” or “label = an expression”.');
      const i = id('metric', `m_${words(m[1])}`);
      const isNumberLike = /^[£$€]?-?\d[\d,.]*\s*[%a-zA-Z]{0,3}$/.test(m[2].trim());
      return { ops: [add({ id: i, kind: 'metric', text: m[1].trim(), ...(isNumberLike ? { value: m[2].trim() } : { expr: m[2].trim() }), basis: 'derived' })], first: i };
    }
    case 'model': {
      // "revenue = price * customers": the equation, a variable for every name it uses that is not yet defined, and
      // the result as a measure — one live model, changed by moving its variables
      const line = t.includes('=') ? t : 'revenue = price * customers';
      const eq = /^\s*([A-Za-z_][A-Za-z0-9_]{0,30})\s*=\s*(.+)$/.exec(line.replace(/×/g, '*').replace(/÷/g, '/'));
      if (!eq) return err('Say the model as “result = an expression”, for example “revenue = price * customers”.');
      const names = [...new Set((eq[2].match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []).filter((n) => !/^(?:sin|cos|tan|exp|log|ln|sqrt|abs|min|max|pi|e|round|floor|ceil|pow)$/.test(n)))];
      const ops: RepOp[] = [];
      for (const n of names.filter((n) => !variables.includes(n)).slice(0, 8)) ops.push(add({ id: id('variable', n), kind: 'variable', name: n, value: 10, min: 0, max: 100, text: n }));
      const e = id('equation', eq[1]);
      ops.push(add({ id: e, kind: 'equation', text: eq[1], expr: `${eq[1]} = ${eq[2]}` }));
      ops.push(add({ id: id('metric', `m_${eq[1]}`), kind: 'metric', text: eq[1], expr: eq[1], basis: 'derived' }));
      return { ops, first: e };
    }
    case 'timeline': {
      const events = LIST(t).map((e) => {
        const m = /^(.+?)\s*[:—–-]\s+(.+)$/.exec(e);
        return m ? { when: m[1], text: m[2] } : { when: '', text: e };
      });
      const i = id('timeline', 'timeline');
      return { ops: [add({ id: i, kind: 'timeline', text: '', events: events.length ? events : [{ when: 'First', text: 'What happened first' }] })], first: i };
    }
    case 'steps': {
      const steps = LIST(t);
      const i = id('sequence', 'steps');
      return { ops: [add({ id: i, kind: 'sequence', text: '', steps: steps.length ? steps : ['The first step'] })], first: i };
    }
    case 'diagram': {
      const parts = t.split(/\s*(?:->|→|=>|,)\s*/).filter(Boolean);
      const labels = parts.length >= 2 ? parts : ['Start', 'Step', 'End'];
      const i = id('diagram', 'diagram');
      return { ops: [add({ id: i, kind: 'diagram', text: '', shapes: labels.map((l, k) => ({ id: `s${k + 1}`, label: l })), connectors: labels.slice(1).map((_, k) => ({ from: `s${k + 1}`, to: `s${k + 2}` })) })], first: i };
    }
    default:
      return err('That cannot be made here.');
  }
}

/** An independent copy of components: new ids, the model's names made new (so the copy does not move with the
 *  original), connections among the copied kept, placed beside the originals. */
export function copyOf(ctx: WorkspaceCtx, refs: readonly string[]): { ops: RepOp[]; layout: LayoutPatch; made: string[] } {
  const src = items(ctx, refs);
  const taken = new Set(ctx.rep.items.map((i) => i.id));
  const ids = new Map<string, string>();
  const names = new Map<string, string>();
  const used = new Set([...ctx.rep.variables.map((v) => v.name), ...ctx.rep.items.flatMap((i) => (i.kind === 'equation' && i.prim.type === 'equation' && i.prim.data.name ? [i.prim.data.name] : []))]);
  const fresh = (n: string) => {
    for (let k = 2; k < 100; k++) if (!used.has(`${n}_${k}`)) return (used.add(`${n}_${k}`), `${n}_${k}`);
    return `${n}_x`;
  };
  for (const it of src) {
    if (it.kind === 'variable' && it.prim.type === 'control') names.set(it.prim.data.variable, fresh(it.prim.data.variable));
    if (it.kind === 'equation' && it.prim.type === 'equation' && it.prim.data.name) names.set(it.prim.data.name, fresh(it.prim.data.name));
  }
  const rename = (expr: string) => [...names].reduce((e, [a, b]) => renameIn(e, a, b), expr);
  const ops: RepOp[] = [];
  for (const it of src) {
    const nid = freshId(it.kind, it.id, taken);
    taken.add(nid);
    ids.set(it.id, nid);
    const base = { id: nid, kind: it.kind, text: it.text, ...(it.detail ? { detail: it.detail } : {}), ...(it.cites ? { cites: it.cites } : {}), ...(it.view ? { view: it.view } : {}) };
    if (it.kind === 'variable' && it.prim.type === 'control') {
      const vname = it.prim.data.variable;
      const v = ctx.rep.variables.find((x) => x.name === vname);
      ops.push({ op: 'add', item: { ...base, name: names.get(vname), value: v?.value ?? 0, min: v?.min ?? 0, max: v?.max ?? 10, step: v?.step, unit: v?.unit, label: v?.label } });
    } else if (it.kind === 'equation' && it.prim.type === 'equation') {
      const d = it.prim.data;
      const nm = d.name ? names.get(d.name) ?? d.name : '';
      ops.push({ op: 'add', item: { ...base, name: nm, params: d.params, expr: rename(d.expr) } });
    } else if ('prim' in it) {
      const prim = JSON.parse(JSON.stringify(it.prim));
      if (prim.type === 'plot') for (const s of prim.data.series) if (s.kind === 'fn') s.expr = rename(s.expr);
      if (prim.type === 'table') for (const c of prim.data.columns) if (c.expr) c.expr = rename(c.expr);
      ops.push({ op: 'add', item: { ...base, prim } });
    } else if (it.kind === 'metric') {
      ops.push({ op: 'add', item: { ...base, basis: it.basis, ...(it.value ? { value: it.value } : {}), ...(it.expr ? { expr: rename(it.expr) } : {}), ...(it.unit ? { unit: it.unit } : {}) } });
    } else {
      const { id: _i, by: _b, at: _a, turn: _t, was: _w, kept: _k, edited: _e, ...rest } = it as RepItem & Record<string, unknown>;
      void _i, _b, _a, _t, _w, _k, _e;
      ops.push({ op: 'add', item: { ...rest, id: nid } });
    }
  }
  for (const r of ctx.rep.relations) if (ids.has(r.from) && ids.has(r.to)) ops.push({ op: 'relate', from: ids.get(r.from)!, to: ids.get(r.to)!, kind: r.kind, status: r.status, ...(r.label ? { label: r.label } : {}) });
  // placed as the originals are placed, beside them
  const placed = refs.filter((r) => ctx.layout.items[r]);
  const minX = placed.length ? Math.min(...placed.map((r) => ctx.layout.items[r].x)) : 0;
  const maxX = placed.length ? Math.max(...placed.map((r) => ctx.layout.items[r].x + ctx.sizeOf(r).w)) : 0;
  const items2: LayoutPatch['items'] = {};
  for (const [old, nid] of ids) {
    const at = ctx.layout.items[`r:${old}`];
    if (at) items2[`r:${nid}`] = { x: Math.round(at.x + (maxX - minX) + GAP * 2), y: at.y };
  }
  return { ops, layout: { items: items2 }, made: [...ids.values()].map((i) => `r:${i}`) };
}

const NODE_REL: Partial<Record<RelKind, string>> = { supports: 'supports', contradicts: 'contradicts', answers: 'answers', depends_on: 'depends_on', derives: 'derived_from', references: 'references', relates: 'related_to', explains: 'informs', causes: 'informs', leads_to: 'informs', part_of: 'related_to', about: 'related_to' };

// ── the commands ─────────────────────────────────────────────────────

const always = () => true;
const someSelected = (_: WorkspaceCtx, s: SelInfo) => s.refs.length > 0;

export const COMMANDS: CommandDef[] = [
  {
    id: 'create',
    title: 'Add',
    hint: 'Add a component here',
    needs: 'none',
    available: always,
    plan(ctx, a) {
      const kind = String(a.kind ?? 'text');
      const taken = new Set(ctx.rep.items.map((i) => i.id));
      const made = itemsFor(kind, String(a.text ?? ''), taken, ctx.rep.variables.map((v) => v.name));
      if ('error' in made) return made;
      const after = applyRepOps(ctx.rep, made.ops, { by: 'person', at: ctx.now }).rep;
      const added = after.items.filter((i) => !ctx.rep.items.some((o) => o.id === i.id));
      // the first beside the selection (or where asked), the rest of a model below it
      const layout: LayoutPatch = { items: {} };
      let l = ctx.layout;
      added.forEach((it, k) => {
        const size = estimateSize(it);
        const p = k === 0 ? placeFor({ ...ctx, layout: l }, size, a.at as { x: number; y: number } | undefined) : placeNear(l, { x: l.items[`r:${added[0].id}`].x, y: l.items[`r:${added[k - 1].id}`].y + estimateSize(added[k - 1]).h + GAP }, size, ctx.sizeOf);
        layout.items![`r:${it.id}`] = p;
        l = applyPatch(l, { items: { [`r:${it.id}`]: p } });
      });
      return { label: added.length > 1 ? `Added a ${kind}` : `Added ${KIND_WORD[added[0]?.kind ?? 'statement'].toLowerCase()}`, rep: made.ops, layout, ui: [{ do: 'select', refs: [`r:${made.first}`] }], result: added.map((i) => `r:${i.id}`) };
    },
  },
  {
    id: 'rename',
    title: 'Rename',
    hint: 'Give it other words',
    needs: 'one',
    available: (_, s) => s.refs.length === 1,
    plan(ctx, a) {
      const ref = a.target ?? ctx.selection[0];
      const name = clip(a.name, 300);
      if (!ref || !name) return err('Rename what, to what?');
      if (isGroupRef(ref)) {
        const p = renamePatch(ctx.layout, ref.slice(2), name);
        return p ? { label: `Named the group ‘${name}’`, layout: p, result: [ref] } : err('That group is no longer here.');
      }
      if (ref.startsWith('r:')) return { label: `Reworded ${nameOf(ref, ctx)}`, rep: [{ op: 'update', id: ref.slice(2), set: { text: name } }], result: [ref] };
      if (ref.startsWith('n:')) return { label: `Renamed ${nameOf(ref, ctx)}`, nodes: [{ do: 'rename', id: ref.slice(2), title: name }], result: [ref] };
      return err('That cannot be renamed here.');
    },
  },
  {
    id: 'delete',
    title: 'Remove',
    hint: 'Remove it (it can be undone)',
    needs: 'some',
    available: someSelected,
    plan(ctx, a) {
      const refs = a.refs ?? ctx.selection;
      if (!refs.length) return err('Remove what?');
      const rep: RepOp[] = [];
      const nodes: NodeIntent[] = [];
      const layoutItems: LayoutPatch['items'] = {};
      let groups = 0;
      let removed = 0;
      for (const r of refs) {
        if (r.startsWith('r:')) (rep.push({ op: 'remove', id: r.slice(2) }), removed++);
        else if (r.startsWith('n:')) (nodes.push({ do: 'archive', id: r.slice(2) }), removed++);
        // a source taken off this canvas only: the library keeps it, and every reference to it
        else if (r.startsWith('s:')) (layoutItems[r] = null, removed++);
        else if (isGroupRef(r)) {
          groups++;
          for (const m of membersOf(ctx.layout, r.slice(2))) if (m.startsWith('r:')) (rep.push({ op: 'remove', id: m.slice(2) }), removed++);
        }
      }
      if (!removed) return err('There is nothing there that can be removed.');
      const many = removed > 3 || nodes.length > 0 || groups > 0;
      const g = refs.filter(isGroupRef).map((r) => ({ [r.slice(2)]: null }));
      return {
        label: `Removed ${removed === 1 ? nameOf(refs[0], ctx) : `${removed} things`}`,
        ...(rep.length ? { rep } : {}),
        ...(nodes.length ? { nodes } : {}),
        layout: { items: layoutItems, ...(g.length ? { groups: Object.assign({}, ...g) } : {}) },
        ...(many ? { confirm: `Remove ${removed === 1 ? nameOf(refs[0], ctx) : `${removed} things`}${nodes.length ? ` (${plural(nodes.length, 'one is kept in the workspace and will be archived', 'are kept in the workspace and will be archived')})` : ''}? You can undo it.` } : {}),
        ui: [{ do: 'select', refs: [] }],
      };
    },
  },
  {
    id: 'duplicate',
    title: 'Duplicate',
    hint: 'An independent copy (it does not change with the original)',
    needs: 'some',
    available: (_, s) => s.items.length > 0,
    plan(ctx, a) {
      const refs = (a.refs ?? ctx.selection).flatMap((r) => (isGroupRef(r) ? membersOf(ctx.layout, r.slice(2)) : [r])).filter((r) => r.startsWith('r:'));
      if (!refs.length) return err('Duplicate what?');
      const c = copyOf(ctx, refs);
      return { label: `Copied ${refs.length === 1 ? nameOf(refs[0], ctx) : `${refs.length} components`}`, rep: c.ops, layout: c.layout, ui: [{ do: 'select', refs: c.made }], result: c.made };
    },
  },
  {
    id: 'move',
    title: 'Move',
    hint: 'Put it somewhere else',
    needs: 'some',
    available: someSelected,
    plan(ctx, a) {
      const refs = a.refs ?? ctx.selection;
      if (!refs.length) return err('Move what?');
      let p: LayoutPatch | null = null;
      if (a.beside) p = besidePatch(ctx.layout, refs, String(a.beside), ctx.sizeOf);
      else if (a.below) {
        const t = ctx.layout.items[String(a.below)];
        if (t) {
          const minX = Math.min(...refs.filter((r) => ctx.layout.items[r]).map((r) => ctx.layout.items[r].x));
          const minY = Math.min(...refs.filter((r) => ctx.layout.items[r]).map((r) => ctx.layout.items[r].y));
          p = movePatch(ctx.layout, refs, t.x - minX, t.y + ctx.sizeOf(String(a.below)).h + GAP - minY);
        }
      } else if (typeof a.dx === 'number' || typeof a.dy === 'number') p = movePatch(ctx.layout, refs, Number(a.dx) || 0, Number(a.dy) || 0);
      if (!p) return err('Move it where?');
      return { label: `Moved ${refs.length === 1 ? nameOf(refs[0], ctx) : `${refs.length} things`}${a.beside ? ` next to ${nameOf(String(a.beside), ctx)}` : ''}`, layout: p, result: refs };
    },
  },
  {
    id: 'select',
    title: 'Select',
    hint: 'Select it',
    needs: 'none',
    available: always,
    plan: (ctx, a) => ({ label: 'Selected', ui: [{ do: 'select', refs: a.refs ?? [] }], result: a.refs ?? [] }),
  },
  {
    id: 'group',
    title: 'Group',
    slash: 'group',
    hint: 'Keep these together',
    needs: 'some',
    available: (_, s) => s.refs.length > 1 || (s.refs.length === 1 && !isGroupRef(s.refs[0])),
    primary: (s) => s.refs.length > 1,
    plan(ctx, a) {
      const refs = a.refs ?? ctx.selection;
      if (!refs.length) return err('Group what?');
      const gid = newGroupId(new Set(Object.keys(ctx.layout.groups ?? {})));
      const name = a.name ? clip(a.name, 60) : undefined;
      const p = groupPatch(ctx.layout, refs, { gid, name });
      if (!p) return err('Those cannot be grouped (too deep, or not here).');
      return { label: `Grouped ${plural(refs.length, nameOf(refs[0], ctx), 'things')}${name ? ` as ‘${name}’` : ''}`, layout: p, ui: [{ do: 'select', refs: [`g:${gid}`] }], result: [`g:${gid}`] };
    },
  },
  {
    id: 'ungroup',
    title: 'Ungroup',
    hint: 'Undo the group; what was in it stays',
    needs: 'one',
    available: (_, s) => s.groups.length === 1,
    plan(ctx, a) {
      const ref = a.target ?? ctx.selection.find(isGroupRef);
      const p = ref && isGroupRef(ref) ? ungroupPatch(ctx.layout, ref.slice(2)) : null;
      if (!ref || !p) return err('Ungroup which group?');
      return { label: `Ungrouped ${nameOf(ref, ctx)}`, layout: p, ui: [{ do: 'select', refs: membersOf(ctx.layout, ref.slice(2), false) }], result: membersOf(ctx.layout, ref.slice(2), false) };
    },
  },
  ...(['collapse', 'expand'] as const).map(
    (k): CommandDef => ({
      id: k,
      title: k === 'collapse' ? 'Collapse' : 'Expand',
      hint: k === 'collapse' ? 'Fold the group into one tile' : 'Show what the group holds',
      needs: 'one',
      available: (ctx, s) => s.groups.length === 1 && !!ctx.layout.groups?.[s.groups[0]] && !!ctx.layout.groups[s.groups[0]].collapsed === (k === 'expand'),
      plan(ctx, a) {
        let ref = a.target ?? ctx.selection[0];
        if (ref && !isGroupRef(ref) && ctx.layout.items[ref]?.group) ref = `g:${ctx.layout.items[ref].group}`;
        const p = ref && isGroupRef(ref) ? collapsePatch(ctx.layout, ref.slice(2), k === 'collapse') : null;
        if (!ref || !isGroupRef(ref)) return err(`${k === 'collapse' ? 'Collapse' : 'Expand'} which group?`);
        if (!p) return { label: `It is already ${k === 'collapse' ? 'collapsed' : 'expanded'}`, result: [ref] };
        return { label: `${k === 'collapse' ? 'Collapsed' : 'Expanded'} ${nameOf(ref, ctx)}`, layout: p, result: [ref] };
      },
    })
  ),
  {
    id: 'connect',
    title: 'Connect',
    slash: 'connect',
    hint: 'Say how two things relate',
    needs: 'two',
    available: (_, s) => s.refs.length === 2,
    primary: (s) => s.refs.length === 2,
    plan(ctx, a) {
      const [from, to] = a.from && a.to ? [a.from, a.to] : ctx.selection;
      if (!from || !to || from === to) return err('Connect which two?');
      const kind = (REL_KINDS as readonly string[]).includes(String(a.kind)) ? (a.kind as RelKind) : null;
      // from the toolbar with no meaning said: ask what it means
      if (!kind && !a.direct) return { label: 'Connect', ui: [{ do: 'connect', from, to }] };
      const k = kind ?? 'relates';
      if (from.startsWith('r:') && to.startsWith('r:')) return { label: `Connected ${nameOf(from, ctx)} to ${nameOf(to, ctx)} (${REL_WORD[k]})`, rep: [{ op: 'relate', from: from.slice(2), to: to.slice(2), kind: k, status: a.status === 'unverified' ? 'unverified' : 'established' }], result: [from, to] };
      if (from.startsWith('n:') && to.startsWith('n:')) return { label: `Connected ${nameOf(from, ctx)} to ${nameOf(to, ctx)}`, nodes: [{ do: 'link', from: from.slice(2), to: to.slice(2), kind: NODE_REL[k] ?? 'related_to' }], result: [from, to] };
      return err('These two cannot be connected directly: keep the component in the workspace first.');
    },
  },
  {
    id: 'disconnect',
    title: 'Disconnect',
    hint: 'Remove the connection between two things',
    needs: 'two',
    available: (ctx, s) => s.refs.length === 2 && s.refs.every((r) => r.startsWith('r:')) && ctx.rep.relations.some((r) => (`r:${r.from}` === s.refs[0] && `r:${r.to}` === s.refs[1]) || (`r:${r.from}` === s.refs[1] && `r:${r.to}` === s.refs[0])),
    plan(ctx, a) {
      const [from, to] = a.from && a.to ? [a.from, a.to] : ctx.selection;
      if (!from || !to) return err('Disconnect which two?');
      if (from.startsWith('r:') && to.startsWith('r:')) return { label: `Disconnected ${nameOf(from, ctx)} and ${nameOf(to, ctx)}`, rep: [{ op: 'unrelate', from: from.slice(2), to: to.slice(2) }], result: [from, to] };
      if (from.startsWith('n:') && to.startsWith('n:')) return { label: `Disconnected ${nameOf(from, ctx)} and ${nameOf(to, ctx)}`, nodes: [{ do: 'unlink', from: from.slice(2), to: to.slice(2) }], result: [from, to] };
      return err('Those are not connected.');
    },
  },
  {
    id: 'transform',
    title: 'Show as…',
    slash: 'transform',
    hint: 'Show it another way, or make something from it',
    needs: 'some',
    available: (_, s) => s.items.some((i) => viewsFor(i).length > 0) || analyticalFor(s.items).length > 0,
    plan(ctx, a) {
      const refs = a.refs ?? (a.target ? [a.target] : ctx.selection);
      const its = items(ctx, refs);
      if (!its.length) return err('Show what another way?');
      if (!a.as) return { label: 'Show as…', ui: [{ do: 'transform', ref: refs[0] }] };
      const want = String(a.as);
      // a change of representation: the same information, another way, at once
      if (its.length === 1) {
        const v = viewNamed(its[0], want);
        if (v) {
          const usual = viewsFor(its[0])[0]?.as;
          const asNow = its[0].view?.as ?? usual;
          if (asNow === v.as) return { label: `It is already shown as ${want}`, result: refs };
          return { label: `Showed ${nameOf(refs[0], ctx)} as ${v.label.replace(/^As /, '')}`, rep: [{ op: 'view', id: its[0].id, as: v.as, ...(v.x ? { x: v.x } : {}), ...(v.y ? { y: v.y } : {}) }], result: refs };
        }
      }
      // otherwise it takes reasoning: made new, from these, kept apart from them
      return { label: `Making ${want} from ${its.length === 1 ? nameOf(refs[0], ctx) : `${its.length} components`}`, ask: { text: `Make ${/^(?:a|an|the)\s/.test(want) ? want : `a ${want}`} from ${its.map((i) => `“${i.text}”`).join(', ')}. Keep the originals as they are and mark what you make as derived from them.`, refs } };
    },
  },
  {
    id: 'set',
    title: 'Set',
    hint: 'Set a variable’s value',
    needs: 'one',
    available: (_, s) => s.items.length === 1 && s.items[0].kind === 'variable',
    plan(ctx, a) {
      const ref = a.target ?? ctx.selection[0];
      const it = ref?.startsWith('r:') ? itemById(ctx.rep, ref.slice(2)) : undefined;
      const value = Number(a.value);
      if (!it || it.kind !== 'variable' || it.prim.type !== 'control' || !Number.isFinite(value)) return err('Set which variable, to what?');
      const name = it.prim.data.variable;
      const v = ctx.rep.variables.find((x) => x.name === name);
      const widen = v && (value < v.min || value > v.max) ? [{ op: 'var.update' as const, name, patch: { min: Math.min(v.min, value), max: Math.max(v.max, value) } }] : [];
      return { label: `Set ${name} to ${value}`, rep: [{ op: 'model', ops: [...widen, { op: 'var.set', name, value }] }], result: [ref] };
    },
  },
  {
    id: 'filter',
    title: 'Show only…',
    hint: 'Show only what relates to something (nothing is removed)',
    needs: 'none',
    available: always,
    plan(ctx, a) {
      if (a.clear) return { label: 'Showing everything', ui: [{ do: 'filter', refs: null }] };
      const refs = a.refs ?? [];
      if (!refs.length) return err('Nothing here relates to that.');
      const keep = new Set(refs);
      // what is kept shows the groups it sits in, so nothing floats free of its frame
      return { label: `Showing ${refs.length} related thing${refs.length === 1 ? '' : 's'}`, ui: [{ do: 'filter', refs: [...keep], label: String(a.label ?? '') }] };
    },
  },
  {
    id: 'focus',
    title: 'Focus',
    hint: 'Bring it into view',
    needs: 'one',
    available: (_, s) => s.refs.length === 1,
    plan: (ctx, a) => (a.target ? { label: `Showing ${nameOf(a.target, ctx)}`, ui: [{ do: 'focus', ref: a.target }, { do: 'select', refs: [a.target] }], result: [a.target] } : err('Show what?')),
  },
  {
    id: 'inspect',
    title: 'Inspect',
    hint: 'What it rests on, and what can be done with it',
    needs: 'one',
    available: (_, s) => s.refs.length === 1,
    plan: (ctx, a) => (a.target ? { label: `Inspecting ${nameOf(a.target, ctx)}`, ui: [{ do: 'focus', ref: a.target }, { do: 'inspect', ref: a.target }], result: [a.target] } : err('Inspect what?')),
  },
  {
    id: 'backlinks',
    title: 'Where it is used',
    hint: 'What refers to it, depends on it, or was made from it',
    needs: 'one',
    available: (_, s) => s.refs.length === 1,
    plan: (ctx, a) => (a.target ? { label: `Where ${nameOf(a.target, ctx)} is used`, ui: [{ do: 'focus', ref: a.target }, { do: 'inspect', ref: a.target, section: 'backlinks' }], result: [a.target] } : err('Where is what used?')),
  },
  {
    id: 'enter',
    title: 'Enter group',
    hint: 'Look at what the group holds, and nothing else',
    needs: 'one',
    available: (_, s) => s.groups.length === 1,
    plan(ctx, a) {
      const ref = a.target ?? ctx.selection.find(isGroupRef);
      if (!ref || !isGroupRef(ref)) return err('Enter which group?');
      const g = ref.slice(2);
      const p = collapsePatch(ctx.layout, g, false);
      const members = membersOf(ctx.layout, g);
      return { label: `Inside ${nameOf(ref, ctx)}`, ...(p ? { layout: p } : {}), ui: [{ do: 'filter', refs: members, label: ctx.layout.groups?.[g]?.name ?? 'the group' }, { do: 'focus', ref: members[0] }], result: members };
    },
  },
  {
    id: 'open',
    title: 'Open',
    hint: 'Open it',
    needs: 'one',
    available: (_, s) => s.refs.length === 1 && (s.refs[0].startsWith('n:') || s.refs[0].startsWith('s:')),
    plan(ctx, a) {
      const ref = a.target;
      if (!ref) return err('Open what?');
      if (ref.startsWith('s:')) return { label: `Opened ${nameOf(ref, ctx)}`, ui: [{ do: 'viewer', sourceId: ref.slice(2) }] };
      if (ref.startsWith('n:')) {
        const n = ctx.nodes.find((x) => x.id === ref.slice(2));
        const href = !n ? '' : n.type === 'objective' ? `/new-logos/w/${encodeURIComponent(n.id)}` : n.type === 'artifact' ? `/new-logos/a/${encodeURIComponent(n.id)}` : `/new-logos/n/${encodeURIComponent(n.id)}`;
        return href ? { label: `Opened ${nameOf(ref, ctx)}`, ui: [{ do: 'navigate', href }] } : err('That is no longer here.');
      }
      if (isGroupRef(ref)) return COMMANDS.find((c) => c.id === 'enter')!.plan(ctx, { target: ref });
      return { label: `Showing ${nameOf(ref, ctx)}`, ui: [{ do: 'focus', ref }, { do: 'inspect', ref }] };
    },
  },
  {
    id: 'find-source',
    title: 'Find a document',
    slash: 'source',
    hint: 'Find or bring in a document (the library)',
    needs: 'none',
    available: always,
    plan(ctx, a) {
      const when = String(a.when ?? '');
      const day = 86_400_000;
      const start = new Date(ctx.now);
      start.setHours(0, 0, 0, 0);
      const since = when === 'today' || when === 'this morning' || when === 'earlier today' ? start.getTime() : when === 'yesterday' ? start.getTime() - day : when === 'this week' ? ctx.now - 7 * day : when === 'last week' ? ctx.now - 14 * day : when === 'recently' || when === 'earlier' ? ctx.now - 3 * day : undefined;
      const until = when === 'yesterday' ? start.getTime() : undefined;
      const query = a.query ? String(a.query) : '';
      const hits = ctx.sources.filter((s) => (since === undefined || (s.created_at ?? 0) >= since) && (until === undefined || (s.created_at ?? 0) < until) && (!query || s.name.toLowerCase().includes(query.toLowerCase())));
      if (hits.length === 1) return { label: `Opened ${nameOf(`s:${hits[0].id}`, ctx)}`, ui: [{ do: 'viewer', sourceId: hits[0].id }] };
      return { label: hits.length ? `${hits.length} documents match` : 'No document matches; the library is open', ui: [{ do: 'library', ...(query ? { query } : {}), ...(since !== undefined ? { since } : {}) }] };
    },
  },
  {
    id: 'new-workspace',
    title: 'New workspace',
    hint: 'Start a workspace for something',
    needs: 'none',
    available: always,
    plan(_, a) {
      const title = clip(String(a.title ?? '').replace(/^(?:the|a|an)\s+/i, ''), 200);
      if (!title) return err('A workspace for what?');
      const t = title.charAt(0).toUpperCase() + title.slice(1);
      return { label: `Made the workspace ‘${t}’`, nodes: [{ do: 'create', type: 'objective', title: t, then: 'navigate' }] };
    },
  },
  {
    id: 'organise',
    title: 'Organise',
    hint: 'Arrange what is loose here into tidy rows, by kind',
    needs: 'none',
    available: always,
    plan(ctx) {
      const order = ['question', 'statement', 'hypothesis', 'observation', 'entity', 'unknown', 'caveat', 'metric', 'variable', 'equation', 'plot', 'matrix', 'timeline', 'sequence', 'diagram', 'document', 'media'];
      const loose = visibleRefs(ctx).filter((r) => r.startsWith('r:') && !ctx.layout.items[r]?.group);
      const rank = (r: string) => order.indexOf(itemById(ctx.rep, r.slice(2))?.kind ?? 'statement');
      const sorted = [...loose].sort((x, y) => rank(x) - rank(y) || (itemById(ctx.rep, x.slice(2))?.at ?? 0) - (itemById(ctx.rep, y.slice(2))?.at ?? 0));
      const p = arrangePatch(ctx.layout, sorted, ctx.sizeOf, 3);
      return p ? { label: `Arranged ${sorted.length} things by kind`, layout: p, result: sorted } : err('There is nothing loose to arrange.');
    },
  },
  {
    id: 'compare',
    title: 'Compare',
    hint: 'What is the same, what differs, and what that means',
    needs: 'two',
    available: (_, s) => s.refs.length === 2,
    plan(ctx, a) {
      const refs = a.refs ?? ctx.selection;
      if (refs.length < 2) return err('Compare which two?');
      return { label: `Comparing ${refs.map((r) => nameOf(r, ctx)).join(' and ')}`, ask: { text: `Compare ${refs.map((r) => nameOf(r, ctx)).join(' and ')}: what is the same, what differs, and what that means. Keep both as they are.`, refs } };
    },
  },
  {
    id: 'version',
    title: 'Another version',
    hint: 'An independent copy to change under another assumption',
    needs: 'some',
    available: (_, s) => s.items.some((i) => isModelKind(i.kind) || i.kind === 'metric'),
    plan(ctx, a) {
      const refs = (a.refs ?? ctx.selection).filter((r) => r.startsWith('r:'));
      if (!refs.length) return err('A version of what?');
      const c = copyOf(ctx, refs);
      const assuming = String(a.assuming ?? '').trim();
      return {
        label: `Made another version${assuming ? ` assuming ${assuming}` : ''}`,
        rep: c.ops,
        layout: c.layout,
        ui: [{ do: 'select', refs: c.made }],
        result: c.made,
        ...(assuming ? { ask: { text: `In the copy just made (${c.made.map((r) => r.slice(2)).join(', ')}), change what needs changing so that it assumes ${assuming}. Change only the copy; keep the original as it is; say what you changed.`, refs: c.made } } : {}),
      };
    },
  },
  {
    id: 'library',
    title: 'Library',
    hint: 'The documents of this account',
    needs: 'none',
    available: always,
    plan: () => ({ label: 'The library', ui: [{ do: 'library' }] }),
  },
  { id: 'history', title: 'History', hint: 'Every change, each reversible', needs: 'none', available: always, plan: () => ({ label: 'History', ui: [{ do: 'history' }] }) },
  { id: 'undo', title: 'Undo', slash: 'undo', hint: 'Undo the last change', needs: 'none', available: always, plan: (_, a) => ({ label: 'Undo', history: { undo: a.burst ? 'burst' : Number(a.steps) || 1 } }) },
  { id: 'redo', title: 'Redo', hint: 'Redo what was undone', needs: 'none', available: always, plan: () => ({ label: 'Redo', history: { redo: true } }) },
];

export const commandById = (id: string) => COMMANDS.find((c) => c.id === id);

// ── slash commands: accelerators for the same commands ───────────────

export interface Slash {
  name: string;
  hint: string;
  /** the command and its arguments, from what follows the name */
  to: (rest: string, ctx: WorkspaceCtx) => Step;
  /** offered here, for this selection */
  available?: (ctx: WorkspaceCtx, sel: SelInfo) => boolean;
}

const makeSlash = (name: string, kind: string, hint: string): Slash => ({ name, hint, to: (rest) => ({ command: 'create', args: { kind, text: rest } }) });
export const SLASH: Slash[] = [
  makeSlash('thought', 'thought', 'A thought of yours'),
  makeSlash('question', 'question', 'A question to work on'),
  makeSlash('text', 'text', 'A line of text'),
  makeSlash('table', 'table', 'A table: name its columns'),
  {
    name: 'plot',
    hint: 'A plot of y = …, or the selection drawn as a plot',
    to: (rest, ctx) => (!rest && selInfo(ctx).items.some((i) => viewNamed(i, 'plot')) ? { command: 'transform', args: { target: 'this', to: 'plot' } } : { command: 'create', args: { kind: 'plot', text: rest } }),
  },
  makeSlash('equation', 'equation', 'An equation: y = …'),
  makeSlash('model', 'model', 'A live model: result = expression'),
  {
    name: 'timeline',
    hint: 'A timeline (when: what; …), or the selected steps as one',
    to: (rest, ctx) => (!rest && selInfo(ctx).items.some((i) => viewNamed(i, 'timeline')) ? { command: 'transform', args: { target: 'this', to: 'timeline' } } : { command: 'create', args: { kind: 'timeline', text: rest } }),
  },
  makeSlash('diagram', 'diagram', 'A diagram: A -> B -> C'),
  { name: 'document', hint: 'Place a document from the library', to: (rest) => ({ command: 'find-source', args: { query: rest } }) },
  { name: 'group', hint: 'Group the selection', to: (rest) => ({ command: 'group', args: { targets: 'these', name: rest || undefined } }), available: (_, s) => s.refs.length > 0 },
  { name: 'connect', hint: 'Connect the two selected', to: () => ({ command: 'connect', args: { from: '__sel0', to: '__sel1' } }), available: (_, s) => s.refs.length === 2 },
  { name: 'transform', hint: 'Show the selection another way', to: (rest) => ({ command: 'transform', args: { target: 'this', to: rest || undefined } }), available: (_, s) => s.items.length > 0 },
  { name: 'source', hint: 'Find or bring in a document', to: (rest) => ({ command: 'find-source', args: { query: rest } }) },
  { name: 'undo', hint: 'Undo the last change', to: () => ({ command: 'undo', args: {} }) },
];

/** "/table Price, Cost" → the slash command and the words after it; null when it is not one. */
export function readSlash(text: string): { slash: Slash; rest: string } | null {
  const m = /^\/([a-z]+)\b\s*(.*)$/is.exec(text.trim());
  if (!m) return null;
  const slash = SLASH.find((s) => s.name === m[1].toLowerCase());
  return slash ? { slash, rest: m[2].trim() } : null;
}

// ── binding words to objects, and planning ───────────────────────────

/** A step's words resolved to objects here. What cannot be resolved is said, with candidates. */
export function bind(step: Step, ctx: WorkspaceCtx): { args: Args } | { error: string; candidates?: string[] } {
  const a: Args = {};
  const one = (phrase: unknown): string | { error: string; candidates?: string[] } => {
    if (phrase === '__sel0') return ctx.selection[0] ?? { error: 'Select two things first.' };
    if (phrase === '__sel1') return ctx.selection[1] ?? { error: 'Select two things first.' };
    const r = resolve(String(phrase ?? 'this'), ctx);
    if (r.how === 'none') return { error: r.why, ...(r.candidates ? { candidates: r.candidates.map((c) => c.ref) } : {}) };
    return r.refs[0];
  };
  const many = (phrase: unknown): string[] | { error: string; candidates?: string[] } => {
    const r = resolve(String(phrase ?? 'these'), ctx, { many: true });
    if (r.how === 'none') return { error: r.why, ...(r.candidates ? { candidates: r.candidates.map((c) => c.ref) } : {}) };
    return r.refs;
  };
  const s = step.args;
  for (const [k, v] of Object.entries(s)) if (v !== undefined && !['target', 'targets', 'from', 'to', 'beside', 'below', 'keep', 'hide', 'a', 'b'].includes(k)) a[k] = v;
  switch (step.command) {
    case 'transform': {
      const t = many(s.target ?? 'this');
      if (!Array.isArray(t)) return t;
      a.refs = t;
      a.target = t[0];
      if (s.to) a.as = String(s.to);
      return { args: a };
    }
    case 'connect':
    case 'disconnect': {
      const f = one(s.from);
      if (typeof f !== 'string') return f;
      const t = one(s.to);
      if (typeof t !== 'string') return t;
      a.from = f;
      a.to = t;
      // named in words ("connect A to B"): made at once; chosen by selection (/connect): what it means is asked
      a.direct = s.from !== '__sel0';
      return { args: a };
    }
    case 'move': {
      const t = many(s.targets ?? 'this');
      if (!Array.isArray(t)) return t;
      a.refs = t;
      for (const key of ['beside', 'below'] as const)
        if (s[key]) {
          const b = one(s[key]);
          if (typeof b !== 'string') return b;
          a[key] = b;
        }
      return { args: a };
    }
    case 'filter': {
      if (s.clear) return { args: { clear: true } };
      if (s.keep) {
        const topic = String(s.keep).replace(/^everything related to /, '');
        const r = relatedTo(topic, ctx);
        if (!r.length) return { error: `Nothing here relates to “${topic}”.` };
        return { args: { refs: r, label: topic } };
      }
      if (s.hide) {
        const t = many(s.hide);
        if (!Array.isArray(t)) return t;
        const hide = new Set(t);
        return { args: { refs: visibleRefs(ctx).filter((r) => !hide.has(r)), label: `without ${String(s.hide)}` } };
      }
      return { error: 'Show what?' };
    }
    case 'compare': {
      if (s.a && s.b) {
        const x = one(s.a);
        if (typeof x !== 'string') return x;
        const y = one(s.b);
        if (typeof y !== 'string') return y;
        a.refs = [x, y];
      } else {
        const t = many(s.a ?? 'these');
        if (!Array.isArray(t)) return t;
        a.refs = t;
      }
      return { args: a };
    }
    case 'create':
    case 'undo':
    case 'redo':
    case 'history':
    case 'library':
    case 'find-source':
    case 'new-workspace':
    case 'organise':
      return { args: a };
    case 'version': {
      // of what is selected; with nothing selected, of the whole model
      const t = many(s.targets ?? s.target ?? (ctx.selection.length ? 'these' : 'the model'));
      if (!Array.isArray(t)) return t;
      a.refs = t;
      return { args: a };
    }
    case 'group':
    case 'delete':
    case 'duplicate':
    case 'select': {
      const t = many(s.targets ?? s.target ?? 'these');
      if (!Array.isArray(t)) return t;
      a.refs = t;
      return { args: a };
    }
    default: {
      const t = one(s.target ?? 'this');
      if (typeof t !== 'string') return t;
      a.target = t;
      return { args: a };
    }
  }
}

/** Plans joined into one change: every operation of each, in order, as one transaction. */
export function joinPlans(plans: Plan[]): Plan {
  if (plans.length === 1) return plans[0];
  const rep = plans.flatMap((p) => p.rep ?? []);
  const nodes = plans.flatMap((p) => p.nodes ?? []);
  const ui = plans.flatMap((p) => p.ui ?? []);
  const asks = plans.filter((p) => p.ask);
  const confirm = plans.filter((p) => p.confirm).map((p) => p.confirm);
  const layout = joinPatches(...plans.map((p) => p.layout));
  return {
    label: plans.map((p) => p.label).join('; '),
    ...(rep.length ? { rep } : {}),
    ...(nodes.length ? { nodes } : {}),
    ...(ui.length ? { ui } : {}),
    ...(layout.items || layout.groups ? { layout } : {}),
    ...(asks.length ? { ask: { text: asks.map((x) => x.ask!.text).join(' '), refs: [...new Set(asks.flatMap((x) => x.ask!.refs))] } } : {}),
    ...(confirm.length ? { confirm: confirm.join(' ') } : {}),
    ...(plans.some((p) => p.history) ? { history: plans.find((p) => p.history)!.history } : {}),
    result: plans[plans.length - 1].result,
  };
}

/** The state a plan leaves, for planning the next step of the same instruction. */
function after(ctx: WorkspaceCtx, plan: Plan): WorkspaceCtx {
  const rep: Representation = plan.rep?.length ? applyRepOps(ctx.rep, plan.rep, { by: 'person', at: ctx.now }).rep : ctx.rep;
  const layout = plan.layout ? applyPatch(ctx.layout, plan.layout) : ctx.layout;
  const result = plan.result ?? [];
  return { ...ctx, rep, layout, selection: result.length ? result : ctx.selection, recent: [...ctx.recent, ...result].slice(-20) };
}

export type Interpretation =
  | { kind: 'plan'; plan: Plan }
  /** the words name something that cannot be resolved reliably here: say so (with what it might be) */
  | { kind: 'unclear'; why: string; candidates?: string[] }
  /** an instruction this cannot read: for the intelligence layer to turn into operations */
  | { kind: 'instruction' }
  /** a question or a thought: for the representation */
  | { kind: 'question' };

/** Steps planned in order, each against the state the one before leaves, joined into one change. */
export function planSteps(steps: readonly Step[], ctx: WorkspaceCtx): Interpretation {
  const plans: Plan[] = [];
  let c = ctx;
  for (const s of steps) {
    const cmd = commandById(s.command);
    if (!cmd) return { kind: 'instruction' };
    const b = bind(s, c);
    if ('error' in b) return { kind: 'unclear', why: b.error, ...(b.candidates ? { candidates: b.candidates } : {}) };
    const p = cmd.plan(c, b.args);
    if ('error' in p) return { kind: 'unclear', why: p.error };
    plans.push(p);
    c = after(c, p);
  }
  return { kind: 'plan', plan: joinPlans(plans) };
}

/** What the Smart Omnibox does with what was typed: a slash command, an instruction read here, or neither. */
export function interpret(text: string, ctx: WorkspaceCtx): Interpretation {
  const s = readSlash(text);
  if (s) return planSteps([s.slash.to(s.rest, ctx)], ctx);
  const r = readIntent(text);
  if (r.kind === 'steps') return planSteps(r.steps, ctx);
  return r;
}

/** The commands offered for the current selection, most relevant first (the toolbar shows the first few). */
export function offered(ctx: WorkspaceCtx): CommandDef[] {
  const sel = selInfo(ctx);
  const hidden = new Set(['select', 'focus', 'filter', 'create', 'library', 'history', 'undo', 'redo', 'find-source', 'new-workspace', 'organise', 'set', 'rename', 'move', 'open']);
  const list = COMMANDS.filter((c) => !hidden.has(c.id) && c.available(ctx, sel));
  return [...list.filter((c) => c.primary?.(sel)), ...list.filter((c) => !c.primary?.(sel))];
}

/** The commands the assistant may ask for, in words, for its instructions. */
export const COMMANDS_FOR_MODEL = `WORKSPACE COMMANDS (for instructions about the workspace rather than the problem; objects by id: r:<component>, g:<group>, n:<node>, s:<source>):
{ "command": "group", "refs": ["r:…", …], "name": "…" } · { "command": "ungroup", "target": "g:…" } · { "command": "collapse" | "expand", "target": "g:…" }
{ "command": "move", "refs": ["r:…"], "beside": "r:…" } · { "command": "connect", "from": "r:…", "to": "r:…", "kind": "supports|contradicts|…" } · { "command": "disconnect", "from": "r:…", "to": "r:…" }
{ "command": "transform", "target": "r:…", "as": "plot|table|bars|metrics|timeline|steps" } · { "command": "filter", "refs": ["r:…"] } · { "command": "focus", "target": "r:…" }
{ "command": "delete", "refs": ["r:…"] } · { "command": "duplicate", "refs": ["r:…"] } · { "command": "rename", "target": "r:…|g:…", "name": "…" } · { "command": "set", "target": "r:<variable>", "value": 30 }`;

/** A command the assistant asked for, planned by the same rules as the person's (its refs must be here). */
export function planFromModel(raw: unknown, ctx: WorkspaceCtx): Plan | { error: string } {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const cmd = commandById(String(o.command ?? ''));
  if (!cmd || ['undo', 'redo', 'history', 'new-workspace', 'library', 'find-source'].includes(cmd.id)) return err('Not a command the assistant may run.');
  const here = new Set([...Object.keys(ctx.layout.items), ...ctx.rep.items.map((i) => `r:${i.id}`), ...Object.keys(ctx.layout.groups ?? {}).map((g) => `g:${g}`)]);
  const ok = (r: unknown): r is string => typeof r === 'string' && here.has(r);
  const args: Args = {};
  if (Array.isArray(o.refs)) args.refs = o.refs.filter(ok).slice(0, 60);
  for (const k of ['target', 'from', 'to', 'beside', 'below'] as const) if (ok(o[k])) args[k] = o[k] as string;
  for (const k of ['name', 'kind', 'as'] as const) if (typeof o[k] === 'string') args[k] = clip(o[k], 120);
  if (typeof o.value === 'number') args.value = o.value;
  if (cmd.id === 'connect') args.direct = true;
  if ((cmd.needs === 'some' && !args.refs?.length && !args.target) || (cmd.needs === 'one' && !args.target) || (cmd.needs === 'two' && !(args.from && args.to) && (args.refs?.length ?? 0) < 2)) return err('The assistant named something that is not here.');
  return cmd.plan(ctx, args);
}

export { relationId };
