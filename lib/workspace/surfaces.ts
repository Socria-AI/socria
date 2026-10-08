// lib/workspace/surfaces.ts
//
// THE PANEL CONTRACT, AND WHICH SURFACES ARE MEANINGFUL RIGHT NOW.
//
// Every surface in the Logos 3 workspace is a representation of the one
// canonical state a line of thinking holds — its conversation, its Thinking
// Map, its model documents. None of them owns state of its own beyond how it
// is looking (a camera, a scroll position, a pinned view). This file declares,
// for each kind of surface, what it represents, what it lets a person select,
// what selections it follows, whether it can go stale, and — the part "+ View"
// turns on — WHEN IT MEANS ANYTHING.
//
// "+ View" does not list every renderer Logos has. It reads the state and
// offers the representations that are valid for it: a model with two free
// inputs offers its surface, its level sets and its cross-sections because the
// representation registry (lib/model/views.ts) says the model supports them; a
// conversation that is an argument offers the map's structure, tensions and
// evidence; nobody is offered a model panel for a question that has no model.
//
// PURE.

import type { ThinkingMap } from '@/lib/logos';
import { availableLenses, LENSES, type LensId } from '@/lib/logos-layout';
import { modelFor, current } from '@/lib/model/docs';
import { viewsFor } from '@/lib/model/views';
import { inputsOf } from '@/lib/model/derive';
import { addPanel, configurePanel, dominantPanel, isOpen, maximize, pairLayout, panelsOf, singleLayout, type PanelConfig, type SurfaceType, type WorkspaceLayout } from './tiling';

/** What a person can point at, in any surface. */
export type FocusKind = 'node' | 'object' | 'param' | 'input';

export interface SurfaceContract {
  type: SurfaceType;
  title: string;
  /** which part of the canonical state it is a representation of */
  represents: 'conversation' | 'map' | 'model' | 'selection' | 'history' | 'object';
  /** what a person can select in it */
  emits: FocusKind[];
  /** what selections elsewhere it follows */
  responds: FocusKind[];
  /** can two of it be open at once and mean something different */
  duplicable: boolean;
  /** can what it shows lag the state it represents (and say so) */
  canBeStale: boolean;
  /** expensive enough to unmount when it is not on screen */
  heavy: boolean;
}

export const SURFACES: Record<SurfaceType, SurfaceContract> = {
  chat: { type: 'chat', title: 'Conversation', represents: 'conversation', emits: [], responds: ['node', 'object', 'param', 'input'], duplicable: false, canBeStale: false, heavy: false },
  map: { type: 'map', title: 'Thinking Map', represents: 'map', emits: ['node'], responds: ['node'], duplicable: true, canBeStale: true, heavy: true },
  model: { type: 'model', title: 'Model', represents: 'model', emits: ['object', 'input', 'param'], responds: ['object', 'param', 'input'], duplicable: true, canBeStale: true, heavy: true },
  params: { type: 'params', title: 'Parameters', represents: 'model', emits: ['param', 'input'], responds: ['param', 'input'], duplicable: false, canBeStale: false, heavy: false },
  inspector: { type: 'inspector', title: 'Inspector', represents: 'selection', emits: ['object'], responds: ['node', 'object', 'param', 'input'], duplicable: false, canBeStale: false, heavy: false },
  trace: { type: 'trace', title: 'Trace', represents: 'history', emits: [], responds: [], duplicable: false, canBeStale: false, heavy: false },
  // Live 3D (experimental): a scene object of thought, drawn in 3D and built by describing it in the chat
  scene: { type: 'scene', title: 'Live 3D', represents: 'object', emits: ['object'], responds: ['object'], duplicable: true, canBeStale: false, heavy: true },
};

// ── what this line of thinking holds, as the workspace needs to know it ──

export interface DocFacts {
  id: string;
  title: string;
  params: number;
  inputs: number;
  /** changes of substance in its history — not selections, not opened views */
  changes: number;
  dynamic: boolean;
  views: { id: string; label: string; subject: string; variant: string; primary: boolean; marks: boolean }[];
}

export interface WorkspaceFacts {
  nodes: number;
  context: string | null;
  lenses: LensId[];
  docs: DocFacts[];
  activeDoc: string | null;
  /** a picture with no model document behind it — a simulation, a plot */
  viz: 'simulation' | 'picture' | null;
  /** Live 3D scenes among the objects of thought */
  scenes: { id: string; name: string; parts: number }[];
}

export function factsFrom(map: ThinkingMap | null | undefined): WorkspaceFacts {
  const m = map ?? { nodes: [], edges: [] };
  const ws = m.models;
  const docs: DocFacts[] = (ws?.docs ?? []).map((d) => {
    const model = modelFor(d);
    const views = viewsFor(model)
      .filter((v) => !v.notDrawnYet)
      .map((v) => ({ id: v.id, label: v.label, subject: v.subject, variant: v.variant, primary: !!v.primary, marks: v.marks }));
    return {
      id: d.id,
      title: current(d).title,
      params: model.params.length,
      inputs: inputsOf(model).length,
      // The first entry is the build itself; after it, only changes of substance.
      changes: d.log.filter((l, i) => i > 0 && l.kind !== 'select' && l.kind !== 'view').length,
      dynamic: !!model.time,
      views,
    };
  });
  return {
    nodes: m.nodes.length,
    context: m.context ?? null,
    // the workspace is Logos 3's: no Board, a detailed Structure in its place
    lenses: availableLenses(m as ThinkingMap, { workspace: true }),
    docs,
    activeDoc: ws?.active ?? null,
    viz: m.viz ? (m.viz.kind === 'simulation' ? 'simulation' : 'picture') : null,
    scenes: (m.objects?.objs ?? [])
      .filter((o) => o.kind === 'scene')
      .map((o) => ({ id: o.id, name: o.name, parts: ((o.states[o.at] as { nodes?: unknown[] } | undefined)?.nodes ?? []).length })),
  };
}

// ── + View ────────────────────────────────────────────────────────

export interface ViewSuggestion {
  type: SurfaceType;
  config?: PanelConfig;
  label: string;
  /** why it is offered, from the state — never "because a renderer exists" */
  why: string;
  /** already on screen somewhere */
  open: boolean;
  score: number;
}

const LENS_WHY: Partial<Record<LensId, string>> = {
  structure: 'every part, what it serves and what it rests on, in detail',
  tensions: 'the places your reasons pull against each other',
  evidence: 'what each belief rests on',
  solve: 'the working, step by step',
  matrix: 'each option against what matters',
};

/**
 * The representations worth opening now, best first.
 *
 * Valid ones only: a surface that has nothing to represent is not offered,
 * and one already on screen is listed after the rest so the menu leads with
 * something new. Ties are broken by a fixed order so the list does not shuffle
 * between renders.
 */
export function suggestViews(facts: WorkspaceFacts, layout: WorkspaceLayout): ViewSuggestion[] {
  const out: ViewSuggestion[] = [];
  const doc = facts.docs.find((d) => d.id === facts.activeDoc) ?? facts.docs[facts.docs.length - 1] ?? null;
  const push = (s: Omit<ViewSuggestion, 'open'>) => out.push({ ...s, open: isOpen(layout, s.type, s.config) });

  push({ type: 'chat', label: 'Conversation', why: 'talk it through — it knows what you have selected', score: 50 });

  if (facts.nodes > 0 || !doc) {
    push({ type: 'map', label: 'Thinking Map', why: facts.nodes ? `${facts.nodes} idea${facts.nodes === 1 ? '' : 's'} so far, and how they connect` : 'the map builds as you talk', score: doc ? 60 : 90 });
    for (const lens of facts.lenses) {
      if (lens === 'graph' || lens === 'plot') continue;
      const name = LENSES.find((l) => l.id === lens)?.label ?? lens;
      push({ type: 'map', config: { lens }, label: `Thinking Map · ${name}`, why: LENS_WHY[lens] ?? 'another way of reading the map', score: 70 });
    }
  }

  if (doc) {
    push({ type: 'model', label: doc.title, why: 'the model itself, live', score: 95 });
    // The engine's own choice is what a plain Model panel already shows; every
    // other view the registry lists — including a second primary, such as a
    // mechanism's parts beside its path — is offered as a representation.
    const shown = doc.views.find((v) => v.primary)?.id;
    for (const v of doc.views) {
      if (v.id === shown) continue;
      const label = `${v.subject || doc.title} · ${v.variant}`;
      push({ type: 'model', config: { view: v.id }, label, why: v.marks ? 'drawn from the same model, linked to it' : 'read from the same model, linked to it', score: v.marks ? 80 : 62 });
    }
    if (doc.params + doc.inputs > 0) {
      push({ type: 'params', label: 'Parameters', why: `${doc.params + doc.inputs} control${doc.params + doc.inputs === 1 ? '' : 's'}, each one a change to the model`, score: 88 });
    }
    push({ type: 'inspector', label: 'Inspector', why: 'what the selected thing is, what it rests on, and how it was computed', score: 84 });
    if (doc.changes > 0) push({ type: 'trace', label: 'Trace', why: `${doc.changes} change${doc.changes === 1 ? '' : 's'} to the model, each one undoable`, score: 66 });
    for (const other of facts.docs) {
      if (other.id === doc.id) continue;
      push({ type: 'model', config: { doc: other.id }, label: other.title, why: 'another model in this line of thinking', score: 64 });
    }
  } else if (facts.viz) {
    push({ type: 'model', label: facts.viz === 'simulation' ? 'Simulation' : 'Picture', why: facts.viz === 'simulation' ? 'the simulation, running' : 'the picture on the map, larger', score: 90 });
  } else if (facts.nodes > 0) {
    push({ type: 'inspector', label: 'Inspector', why: 'what the selected idea is and what it connects to', score: 58 });
  }

  // A scene is offered where there is one; starting one is always possible, and
  // said to be what it is — a preview of shapes, not a model of anything physical.
  for (const sc of facts.scenes) {
    push({ type: 'scene', config: { obj: sc.id }, label: `Live 3D · ${sc.name}`, why: `${sc.parts} part${sc.parts === 1 ? '' : 's'}, built by describing them in the chat — a geometric preview`, score: 86 });
  }
  if (!facts.scenes.length) {
    push({ type: 'scene', label: 'Live 3D · experimental', why: 'describe shapes in the chat and they are drawn as you type — a geometric preview, not a simulation', score: 30 });
  }

  const order: SurfaceType[] = ['model', 'params', 'inspector', 'map', 'scene', 'chat', 'trace'];
  return out.sort((a, b) => Number(a.open) - Number(b.open) || b.score - a.score || order.indexOf(a.type) - order.indexOf(b.type));
}

// ── arrangements: contextual, never permanent modes ───────────────

export interface Arrangement {
  id: string;
  label: string;
  why: string;
  layout: WorkspaceLayout;
}

/**
 * The ways the workspace could be arranged for what is here — offered inside
 * "+ View", and only when they mean something. A comparison needs two things
 * to compare; "one view" needs more than one. There is no permanent row of
 * modes: the workspace is simple until the work is not.
 */
export function arrangementsFor(facts: WorkspaceFacts, layout: WorkspaceLayout): Arrangement[] {
  const out: Arrangement[] = [];
  const doc = facts.docs.find((d) => d.id === facts.activeDoc) ?? facts.docs[facts.docs.length - 1] ?? null;
  const panels = panelsOf(layout);
  if (facts.docs.length >= 2) {
    const [a, b] = facts.docs.slice(-2);
    out.push({ id: 'compare', label: 'Compare side by side', why: `${a.title} beside ${b.title}`, layout: pairLayout({ type: 'model', config: { doc: a.id } }, { type: 'model', config: { doc: b.id } }) });
  } else if (doc) {
    const other = doc.views.find((v) => !v.primary && v.marks);
    if (other) out.push({ id: 'compare', label: 'Compare side by side', why: `the model beside its ${other.variant.toLowerCase()}, linked`, layout: pairLayout({ type: 'model' }, { type: 'model', config: { view: other.id } }) });
  }
  if (doc && doc.params + doc.inputs > 0) {
    out.push({ id: 'controls', label: 'Model with its controls', why: 'every parameter beside the model', layout: pairLayout({ type: 'model' }, { type: 'params' }, 0.72) });
  }
  // The map beside its model only when the map holds reasoning beyond the
  // model itself — and as the graph, or it would be the same picture twice.
  if (doc && facts.nodes >= 3) {
    out.push({ id: 'map-model', label: 'Map beside the model', why: 'the reasoning and the model together', layout: pairLayout({ type: 'map', config: { lens: 'graph' } }, { type: 'model' }) });
  }
  if (facts.nodes >= 4 && facts.lenses.includes('evidence')) {
    out.push({ id: 'evidence', label: 'Map beside its evidence', why: 'what each belief rests on, next to the map', layout: pairLayout({ type: 'map' }, { type: 'map', config: { lens: 'evidence' } }) });
  }
  if (panels.length > 1) {
    const d = dominantPanel(layout);
    if (d) out.push({ id: 'one', label: 'One view', why: 'just the one in focus', layout: singleLayout(d.type, d.config) });
  }
  return out;
}

// ── suggestions to change the arrangement ─────────────────────────

export interface LayoutSuggestion {
  id: string;
  text: string;
  /** an arrangement from arrangementsFor — applied only if the person accepts */
  arrangement: string;
}

/**
 * At most one suggestion, and only when the conversation itself asks for a
 * different arrangement. The workspace is the person's: nothing moves until
 * they accept, and a suggestion they dismissed is not made again.
 */
export function suggestLayout(
  facts: WorkspaceFacts,
  layout: WorkspaceLayout,
  lastSaid: string,
  dismissed: ReadonlySet<string>
): LayoutSuggestion | null {
  const said = lastSaid.toLowerCase();
  const has = (id: string) => arrangementsFor(facts, layout).some((a) => a.id === id);
  const twoModels = panelsOf(layout).filter((p) => p.type === 'model').length >= 2;
  if (!twoModels && has('compare') && /\b(compare|versus|vs\.?|side by side|difference between)\b/.test(said)) {
    const s = { id: `compare:${facts.docs.map((d) => d.id).join(',')}`, text: 'Compare them side by side?', arrangement: 'compare' };
    if (!dismissed.has(s.id)) return s;
  }
  if (!isOpen(layout, 'map', { lens: 'evidence' }) && has('evidence') && /\b(source|evidence|cite|research|study|studies)\b/.test(said)) {
    const s = { id: 'evidence', text: 'Put the evidence beside the map?', arrangement: 'evidence' };
    if (!dismissed.has(s.id)) return s;
  }
  return null;
}

// ── a view asked for by name ──────────────────────────────────────

/**
 * "Show this as a structure": the Thinking Map, in that lens, takes over the
 * workspace. A single surface simply becomes the map in that lens. In an
 * arrangement of several panels the map panel (added if there is none) is
 * pointed at the lens and given the whole workspace — maximized, so the
 * arrangement is kept exactly as it was for when they restore it.
 */
export function showLens(layout: WorkspaceLayout, lens: LensId): WorkspaceLayout {
  const ps = panelsOf(layout);
  if (ps.length <= 1) return { ...singleLayout('map', { lens }) };
  const map = ps.find((p) => p.type === 'map');
  if (map) return maximize(configurePanel(layout, map.id, { lens }), map.id);
  const added = addPanel(layout, { type: 'map', config: { lens } });
  return added.id ? maximize(added.layout, added.id) : layout;
}
