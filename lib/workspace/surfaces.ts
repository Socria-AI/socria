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
// "+ View" leads with the representations that are valid for the state: a
// model with two free inputs offers its surface, its level sets and its
// cross-sections because the representation registry (lib/model/views.ts)
// says the model supports them; a conversation that is an argument offers the
// map's structure, tensions and evidence. Beneath those it lists every kind of
// view there is (the catalogue, at the end of this file), so any of them can
// be opened or put away by hand — one with nothing to show yet says so.
//
// It also answers the surfaces a person asks for by name (lib/workspace/
// interface-request.ts) and decides what a freshly built model opens
// (afterBuild). Every function here returns a layout or a suggestion; the
// client applies it. Nothing here moves a panel by itself.
//
// PURE.

import type { ThinkingMap } from '@/lib/logos';
import { availableLenses, leadLens, LENSES, reasoningLens, type LensId } from '@/lib/logos-layout';
import { modelFor, current } from '@/lib/model/docs';
import type { Model } from '@/lib/model/schema';
import { viewsFor } from '@/lib/model/views';
import { inputsOf } from '@/lib/model/derive';
import { surfacesNamed, type InterfaceRequest } from './interface-request';
import {
  addPanel,
  besideShare,
  SERVING,
  closePanel,
  configurePanel,
  dominantPanel,
  isOpen,
  maximize,
  pairLayout,
  panelsOf,
  reshare,
  restore,
  rowLayout,
  singleLayout,
  splitPanel,
  visiblePanels,
  type PanelConfig,
  type PanelNode,
  type SurfaceType,
  type WorkspaceLayout,
} from './tiling';

/** What a person can point at, in any surface. */
export type FocusKind = 'node' | 'object' | 'param' | 'input';

export interface SurfaceContract {
  type: SurfaceType;
  title: string;
  /** which part of the canonical state it is a representation of */
  represents: 'conversation' | 'map' | 'model' | 'selection' | 'history' | 'object' | 'memory';
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
  // Studio (CAD), experimental: shapes in 3D — a Live 3D scene object of thought built by describing it in
  // the chat, or (pinned with `doc`) the solids a model holds, kept in step with its parameters
  scene: { type: 'scene', title: 'Studio (CAD)', represents: 'object', emits: ['object'], responds: ['object'], duplicable: true, canBeStale: false, heavy: true },
  // Mind: this line of thinking among every other, and what Socria remembers (lib/mind/atlas.ts)
  mind: { type: 'mind', title: 'Mind', represents: 'memory', emits: [], responds: [], duplicable: false, canBeStale: true, heavy: true },
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
  /** it holds 3D solids, so it has a 3D view: a 'scene' panel pinned to it with `doc` */
  solids?: boolean;
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
  /** there is an account whose memory this line of thinking joins — the Mind view is offered */
  mind?: boolean;
  /** the lens a map panel with no lens of its own opens on (logos-layout leadLens) */
  lead?: LensId | null;
  /** the lens a map panel shows beside a model or a 3D view — the reasoning, not the model again (logos-layout reasoningLens) */
  reasoning?: LensId | null;
  /**
   * The model the last turn built, until the next turn: the server's own
   * verdict (`build.ok` and `build.id`), never a count of documents. While it
   * is set and not on screen, "+ View" offers it ('built') and the suggestion
   * line asks to open it (`built:<doc>`). The client sets it; factsFrom does not.
   */
  built?: { doc: string; solids: boolean } | null;
}

export interface FactsOptions {
  /** does this model hold 3D solids — the caller knows; without it no model is said to */
  solids?: (docId: string, model: Model) => boolean;
}

export function factsFrom(map: ThinkingMap | null | undefined, opts: FactsOptions = {}): WorkspaceFacts {
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
      solids: !!opts.solids?.(d.id, model),
      views,
    };
  });
  // the workspace is Logos 3's: no Board, a detailed Structure in its place
  const lenses = availableLenses(m as ThinkingMap, { workspace: true });
  const building = (m as ThinkingMap).building ?? null;
  return {
    nodes: m.nodes.length,
    context: m.context ?? null,
    lenses,
    docs,
    activeDoc: ws?.active ?? null,
    viz: m.viz ? (m.viz.kind === 'simulation' ? 'simulation' : 'picture') : null,
    scenes: (m.objects?.objs ?? [])
      .filter((o) => o.kind === 'scene')
      .map((o) => ({ id: o.id, name: o.name, parts: ((o.states[o.at] as { nodes?: unknown[] } | undefined)?.nodes ?? []).length })),
    // the same reading ThinkingMap makes: a model is a picture of its own
    lead: leadLens(lenses, !!m.viz || !!ws?.docs?.length, building),
    reasoning: reasoningLens(lenses, building),
  };
}

/**
 * What the conversation's interface reader needs to know (readInterfaceRequest
 * `ctx`), read from the same facts the workspace uses: is there a model, is
 * anything in 3D (a Live 3D scene, or a model with solids), does the map hold
 * ideas.
 */
export function interfaceContext(facts: WorkspaceFacts): { hasModel: boolean; hasScene: boolean; hasMap: boolean } {
  return {
    hasModel: facts.docs.length > 0 || !!facts.viz,
    hasScene: facts.scenes.length > 0 || facts.docs.some((d) => !!d.solids),
    hasMap: facts.nodes > 0,
  };
}

/** The document a model panel with no `doc` of its own shows: the active one, else the newest. */
function shownDoc(facts: WorkspaceFacts): DocFacts | null {
  return facts.docs.find((d) => d.id === facts.activeDoc) ?? facts.docs[facts.docs.length - 1] ?? null;
}
const leadOf = (facts: WorkspaceFacts | null | undefined): LensId | null =>
  !facts ? null : facts.lead !== undefined ? facts.lead : leadLens(facts.lenses, !!facts.viz || facts.docs.length > 0);
const reasoningOf = (facts: WorkspaceFacts): LensId | null => (facts.reasoning !== undefined ? facts.reasoning : reasoningLens(facts.lenses));
const hasModel = (facts: WorkspaceFacts | null | undefined) => !!facts && (facts.docs.length > 0 || !!facts.viz);

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

  // A model's solids, in 3D, where it has any.
  if (doc?.solids) {
    push({ type: 'scene', config: { doc: doc.id }, label: `${VIEW_NAMES.scene} · ${doc.title}`, why: 'its solids in 3D, kept in step with the model', score: 87 });
  }
  // A scene is offered where there is one; starting one is always possible, and
  // said to be what it is — a preview of shapes, not a model of anything physical.
  for (const sc of facts.scenes) {
    push({ type: 'scene', config: { obj: sc.id }, label: `${VIEW_NAMES.scene} · ${sc.name}`, why: `${sc.parts} part${sc.parts === 1 ? '' : 's'}, built by describing them in the chat — a geometric preview`, score: 86 });
  }
  if (!facts.scenes.length && !doc?.solids) {
    push({ type: 'scene', label: `${VIEW_NAMES.scene} · experimental`, why: 'describe shapes in the chat and they are drawn as you type — a geometric preview, not a simulation', score: 30 });
  }

  // Where this line of thinking sits among all the others, and what Socria
  // remembers — offered to an account, whose memory it joins.
  if (facts.mind) {
    push({ type: 'mind', label: 'Mind', why: 'this line of thinking among all your others, and what Socria remembers', score: 54 });
  }

  const order: SurfaceType[] = ['model', 'params', 'inspector', 'map', 'scene', 'chat', 'trace', 'mind'];
  return out.sort((a, b) => Number(a.open) - Number(b.open) || b.score - a.score || order.indexOf(a.type) - order.indexOf(b.type));
}

// ── arrangements: contextual, never permanent modes ───────────────

export interface Arrangement {
  id: string;
  label: string;
  why: string;
  layout: WorkspaceLayout;
}

/** How much room each surface is given when several are laid side by side. */
const WEIGHT: Record<SurfaceType, number> = { map: 3, model: 4, scene: 4, mind: 3, params: 2, inspector: 2, trace: 2, chat: 2 };
/** Left to right. */
const LAYOUT_ORDER: SurfaceType[] = ['map', 'model', 'scene', 'params', 'inspector', 'trace', 'mind', 'chat'];

/**
 * The 3D panel for what is here: the solids of a model (`doc`, the active
 * one unless named), else the newest Live 3D scene. Null when nothing is in 3D.
 */
function threeDPanel(facts: WorkspaceFacts, doc?: string, solids?: boolean): { type: SurfaceType; config: PanelConfig } | null {
  const d = doc ?? shownDoc(facts)?.id ?? null;
  const holds = solids ?? !!facts.docs.find((x) => x.id === d)?.solids;
  if (d && holds) return { type: 'scene', config: { doc: d } };
  const sc = facts.scenes[facts.scenes.length - 1];
  return sc ? { type: 'scene', config: { obj: sc.id } } : null;
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
  const reasoning = reasoningOf(facts);
  // WHAT WAS JUST BUILT, opened into the arrangement the person has — added
  // beside what is there, never a new arrangement in its place.
  const built = facts.built ? facts.docs.find((d) => d.id === facts.built!.doc) ?? null : null;
  if (facts.built && built && !showsDoc(layout, facts, built.id)) {
    const solids = !!facts.built.solids;
    out.push({
      id: 'built',
      label: solids ? 'Open the model and its 3D view' : 'Open the model',
      why: `${built.title}, just built — beside what is here`,
      layout: layoutForSurfaces(solids ? ['model', 'scene'] : ['model'], layout, facts, { doc: built.id, solids }),
    });
  }
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
  // model itself — and in the lens that draws that reasoning. Pinned to the
  // graph, as it was, the map fell back to the plot (a map holding a model did
  // not offer the graph) and showed the model twice.
  const mapPanel = reasoning ? { type: 'map' as const, config: { lens: reasoning } } : null;
  const third = threeDPanel(facts);
  if (doc && facts.nodes >= 3 && mapPanel) {
    out.push({ id: 'map-model', label: 'Map beside the model', why: 'the reasoning and the model together', layout: rowLayout([mapPanel, { type: 'model' }], [WEIGHT.map, WEIGHT.model]) });
  }
  if (third && facts.nodes >= 3 && mapPanel) {
    out.push({ id: 'map-scene', label: `Map beside ${VIEW_NAMES.scene}`, why: 'the reasoning beside the shape, in 3D', layout: rowLayout([mapPanel, third], [WEIGHT.map, WEIGHT.scene]) });
  }
  if (doc && third) {
    out.push({
      id: 'model-scene',
      label: `Model beside ${VIEW_NAMES.scene}`,
      why: third.config.doc ? 'the model and its solids in 3D, kept in step' : 'the model beside the shape you are building in 3D',
      layout: rowLayout([{ type: 'model' }, third], [WEIGHT.model, WEIGHT.scene]),
    });
  }
  if (doc && third && facts.nodes >= 3 && mapPanel) {
    out.push({ id: 'all', label: `Map, model and ${VIEW_NAMES.scene}`, why: 'the reasoning, the model and its shape in 3D, together', layout: rowLayout([mapPanel, { type: 'model' }, third], [WEIGHT.map, WEIGHT.model, WEIGHT.scene]) });
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

const TOGETHER = /\b(side by side|side-by-side|beside|next to|alongside|together|both|at the same time|at once)\b/;
const COMPARING = /\b(compare|versus|vs\.?|difference between)\b/;
const NAMED_TEXT: Record<string, string> = {
  'map-model': 'Put the map beside the model?',
  'map-scene': 'Put the map beside the 3D view?',
  'model-scene': 'Put the model beside its 3D view?',
  all: 'Show the map, the model and the 3D view together?',
};

/** The suggestion a build makes when it lands in an arrangement of the person's own. */
function builtSuggestion(built: { doc: string; solids: boolean }): LayoutSuggestion {
  return { id: `built:${built.doc}`, text: built.solids ? 'Open the model and its 3D view?' : 'Open the model?', arrangement: 'built' };
}

/**
 * At most one suggestion, and only when the conversation asks for a different
 * arrangement or a model was just built where nothing shows it. The workspace
 * is the person's: nothing moves until they accept, and a suggestion they
 * dismissed is not made again.
 *
 * "Side by side" is read for what it names. "The map and the model side by
 * side" is the map beside the model, not a comparison: the compare chip is for
 * two models, or for "compare" and "versus" said outright.
 */
export function suggestLayout(
  facts: WorkspaceFacts,
  layout: WorkspaceLayout,
  lastSaid: string,
  dismissed: ReadonlySet<string>
): LayoutSuggestion | null {
  const said = lastSaid.toLowerCase();
  const arrangements = arrangementsFor(facts, layout);
  const find = (id: string) => arrangements.find((a) => a.id === id) ?? null;
  const has = (id: string) => !!find(id);
  // a build, landed where nothing shows it
  if (facts.built && has('built')) {
    const s = builtSuggestion(facts.built);
    if (!dismissed.has(s.id)) return s;
  }
  const twoModels = panelsOf(layout).filter((p) => p.type === 'model').length >= 2;
  const named = new Set(surfacesNamed(said));
  const together = TOGETHER.test(said);
  const comparing = COMPARING.test(said);
  if ((together || comparing) && (named.has('map') || named.has('scene'))) {
    // the surfaces it names, side by side — never a comparison of the model with itself
    const id =
      named.has('map') && named.has('scene') ? (named.has('model') ? 'all' : 'map-scene')
      : named.has('map') ? 'map-model'
      : has('model-scene') ? 'model-scene' : 'map-scene';
    const arr = find(id);
    if (arr && !inPlace(arr.layout, layout, facts)) {
      const s = { id, text: NAMED_TEXT[id], arrangement: id };
      if (!dismissed.has(s.id)) return s;
    }
  } else if (!twoModels && has('compare') && (comparing || (together && facts.docs.length >= 2))) {
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

// ── surfaces asked for: open, close, side by side ─────────────────
//
// "Open the model", "show it in 3D", "put the map beside the model", "close
// the 3D view" (interface-request.ts), and what a build opens (afterBuild),
// made with the tiling's own operations. Panels already there are used again
// rather than duplicated; a panel nobody asked about stays where it is; the
// conversation, as a panel, keeps its place — it is the dock's, not the
// stage's, and only a request for it moves it.

export interface SurfaceOptions {
  /** the model the model panel and its 3D view are for — the one just built; the active one when absent */
  doc?: string;
  /** that model holds 3D solids, so its 3D view is a 3D panel pinned to it (afterBuild passes the build's own answer) */
  solids?: boolean;
  /** the map's lens; otherwise a map beside a model or a 3D view shows its reasoning (facts.reasoning) */
  lens?: LensId;
}

/** The lens a map panel actually shows: its own, while the map can draw it, else the one the map leads with. */
function lensShown(p: PanelNode, facts: WorkspaceFacts | null | undefined): LensId | null {
  const own = p.config?.lens as LensId | undefined;
  if (own && (!facts || facts.lenses.includes(own))) return own;
  return leadOf(facts) ?? own ?? null;
}

/** The model a panel shows: its pinned document, or the active one. */
function docShownBy(p: PanelNode, facts: WorkspaceFacts | null | undefined): string | null {
  if (p.config?.doc) return p.config.doc;
  if (p.type === 'scene') return null; // a 3D panel shows a model only when pinned to it
  return facts ? shownDoc(facts)?.id ?? null : null;
}

/**
 * Is this model on screen, not set aside behind a maximised panel? In a model
 * panel, as its 3D view, or on a Math plotting panel — the plot lens draws the
 * active model, and a person who chose that view has the model in front of
 * them. (A map with no lens of its own does not count: it leads with the plot
 * only because there is a model, and a build opens the model beside it.)
 */
export function showsDoc(layout: WorkspaceLayout, facts: WorkspaceFacts, doc: string): boolean {
  return visiblePanels(layout).some((p) => {
    if (p.type === 'map') return p.config?.lens === 'plot' && facts.lenses.includes('plot') && shownDoc(facts)?.id === doc;
    return (p.type === 'model' || (p.type === 'scene' && !!p.config?.doc)) && docShownBy(p, facts) === doc;
  });
}

/**
 * The panel a surface is opened as, for what is here. The map beside a model
 * or a 3D view takes the reasoning lens. A model panel is pinned only to a
 * model other than the one it would show anyway, so that it keeps following
 * the work. A 3D panel draws the model's solids when it has some, else the
 * newest Live 3D scene, else it is the empty Studio, where a shape described
 * in the conversation is drawn.
 */
export function panelFor(
  surface: SurfaceType,
  facts: WorkspaceFacts,
  opts: SurfaceOptions = {},
  beside: ReadonlySet<SurfaceType> = new Set()
): { type: SurfaceType; config?: PanelConfig } {
  const pin = opts.doc && opts.doc !== shownDoc(facts)?.id ? { doc: opts.doc } : undefined;
  switch (surface) {
    case 'map': {
      const lens = opts.lens ?? (beside.has('model') || beside.has('scene') ? reasoningOf(facts) ?? undefined : undefined);
      return lens ? { type: 'map', config: { lens } } : { type: 'map' };
    }
    case 'model':
    case 'params':
      return pin ? { type: surface, config: pin } : { type: surface };
    case 'scene':
      return threeDPanel(facts, opts.doc, opts.doc ? opts.solids : undefined) ?? { type: 'scene' };
    default:
      return { type: surface };
  }
}

/** A panel already in the layout that is what this spec asks for — the best of them. */
function reusable(layout: WorkspaceLayout, spec: { type: SurfaceType; config?: PanelConfig }, facts: WorkspaceFacts, taken: ReadonlySet<string>): PanelNode | null {
  const ps = panelsOf(layout).filter((p) => p.type === spec.type && !taken.has(p.id));
  if (!ps.length) return null;
  switch (spec.type) {
    case 'map': {
      // Math plotting is a view of its own: a plain map is never the plot panel, and the plot is that one first
      if (spec.config?.lens === 'plot') return ps.find((p) => p.config?.lens === 'plot') ?? ps.find((p) => !p.config?.lens) ?? null;
      const maps = ps.filter((p) => p.config?.lens !== 'plot');
      const rank = (p: PanelNode) => (spec.config?.lens && p.config?.lens === spec.config.lens ? 0 : !p.config?.lens ? 1 : 2);
      return [...maps].sort((a, b) => rank(a) - rank(b))[0] ?? null;
    }
    case 'model':
    case 'params':
    case 'trace': {
      const want = spec.config?.doc ?? shownDoc(facts)?.id ?? null;
      const showing = ps.filter((p) => !want || docShownBy(p, facts) === want);
      return showing.find((p) => !p.config?.view) ?? showing[0] ?? null;
    }
    case 'scene': {
      if (spec.config?.doc) return ps.find((p) => p.config?.doc === spec.config!.doc) ?? null;
      if (spec.config?.obj) return ps.find((p) => p.config?.obj === spec.config!.obj) ?? ps.find((p) => !p.config?.obj && !p.config?.doc) ?? null;
      return ps.find((p) => !p.config?.doc) ?? null;
    }
    default:
      return ps[0];
  }
}

/**
 * A map with a model or a 3D view beside it shows the reasoning. The map
 * panel a request named takes the lens it asked for, if it asked for one.
 * Otherwise a map panel is re-pointed only when it would land on the plot or
 * the objects because it has no lens of its own (or one the map cannot draw
 * now). A lens somebody chose is theirs — Math plotting most of all, which is
 * the plot on purpose.
 */
function reasonBeside(layout: WorkspaceLayout, facts: WorkspaceFacts, asked?: { id: string; lens: LensId } | null): WorkspaceLayout {
  let out = layout;
  if (asked && panelsOf(out).find((p) => p.id === asked.id)?.config?.lens !== asked.lens) out = configurePanel(out, asked.id, { lens: asked.lens });
  const vis = visiblePanels(out);
  const reasoning = reasoningOf(facts);
  if (!reasoning || !vis.some((p) => p.type === 'model' || p.type === 'scene')) return out;
  for (const p of vis) {
    if (p.type !== 'map' || p.id === asked?.id) continue;
    const own = p.config?.lens as LensId | undefined;
    if (own === 'plot' || (own && facts.lenses.includes(own))) continue;
    const shown = lensShown(p, facts);
    if (shown === 'plot' || shown === 'work' || shown === null) out = configurePanel(out, p.id, { lens: reasoning });
  }
  return out;
}

/**
 * Open a panel beside what is there, as "+ View" does: beside the panel with
 * the most room, a serving panel at a third of it. With the facts, a map that
 * now has a model or a 3D view beside it reads as the reasoning — "Thinking
 * Map" opened beside a model used to show the model a second time.
 */
export function openBeside(
  layout: WorkspaceLayout,
  panel: { type: SurfaceType; config?: PanelConfig },
  facts?: WorkspaceFacts | null
): { layout: WorkspaceLayout; id: string | null } {
  const placed = addPanel(layout, panel, 1.6, besideShare(panel.type));
  return facts && placed.id ? { layout: reasonBeside(placed.layout, facts), id: placed.id } : placed;
}

/**
 * The surfaces asked for, on screen together, side by side.
 *
 * Map, model and 3D view are laid out left to right in that order, so "map |
 * model", "map | 3D", "model | 3D" and "map | model | 3D" come out the same
 * whichever was there first. A panel already open is used again where it is;
 * one that is missing opens beside its nearest neighbour among those asked
 * for, or beside the largest panel; the room of the ones opened together is
 * shared by what each is (the model and the 3D view more than the map, a
 * serving panel a third). Anything set aside behind a maximised panel comes
 * back. Other panels keep their place. The conversation is never added — it is
 * the dock's — and a conversation panel is kept.
 */
export function layoutForSurfaces(surfaces: SurfaceType[], current: WorkspaceLayout, facts: WorkspaceFacts, opts: SurfaceOptions = {}): WorkspaceLayout {
  const wanted = LAYOUT_ORDER.filter((s) => s !== 'chat' && surfaces.includes(s));
  if (!wanted.length) return current;
  const together = new Set(wanted);
  const specs = wanted.map((s) => panelFor(s, facts, opts, together));
  if (!current.root) return rowLayout(specs, specs.map((s) => WEIGHT[s.type]));

  let layout = current;
  const taken = new Set<string>();
  const ids: (string | null)[] = specs.map((spec) => {
    const p = reusable(layout, spec, facts, taken);
    if (p) taken.add(p.id);
    return p?.id ?? null;
  });
  // everything asked for is seen together — unless it is the one panel already given the workspace
  if (layout.maximized && !(ids.length === 1 && ids[0] === layout.maximized)) layout = restore(layout);
  const fresh = new Set<string>();
  // the panel a group opened beside, when none of its own neighbours was there: it shares the room with them
  let anchor: PanelNode | null = null;
  // A map, a model or a 3D view opens beside another of them; a serving panel beside anything asked for.
  const neighbour = (i: number, k: number) => !!ids[k] && (SERVING.has(specs[i].type) || !SERVING.has(specs[k].type));
  const nearest = (i: number, step: 1 | -1) => {
    for (let k = i + step; k >= 0 && k < specs.length; k += step) if (neighbour(i, k)) return k;
    return -1;
  };
  for (let i = 0; i < specs.length; i++) {
    if (ids[i]) continue;
    const before = nearest(i, -1);
    const after = nearest(i, 1);
    let placed: { layout: WorkspaceLayout; id: string | null };
    if (before >= 0) placed = splitPanel(layout, ids[before]!, 'row', specs[i], 'after', besideShare(specs[i].type));
    else if (after >= 0) placed = splitPanel(layout, ids[after]!, 'row', specs[i], 'before', besideShare(specs[i].type));
    else {
      // beside the panel with the most room, taking what the group still to open is worth beside it
      const target = dominantPanel(layout);
      const group = specs.reduce((w, s, k) => (k >= i && !ids[k] ? w + WEIGHT[s.type] : w), 0);
      placed = addPanel(layout, specs[i], 1.6, target ? group / (group + WEIGHT[target.type]) : 0.5);
      if (placed.id && target && !anchor) anchor = target;
    }
    if (placed.id) {
      layout = placed.layout;
      ids[i] = placed.id;
      fresh.add(placed.id);
    }
  }
  const mapAt = specs.findIndex((s) => s.type === 'map');
  layout = reasonBeside(layout, facts, opts.lens && mapAt >= 0 && ids[mapAt] ? { id: ids[mapAt]!, lens: opts.lens } : null);
  if (fresh.size) {
    // the room of what opened together is shared by what each one is
    const laid = ids.map((id, i) => [id, specs[i].type] as const).filter(([id]) => !!id) as [string, SurfaceType][];
    const withAnchor = anchor && !laid.some(([id]) => id === anchor!.id) ? [[anchor.id, anchor.type] as [string, SurfaceType], ...laid] : laid;
    const shared = reshare(layout, withAnchor.map(([id]) => id), withAnchor.map(([, t]) => WEIGHT[t]));
    layout = shared !== layout ? shared : reshare(layout, laid.map(([id]) => id), laid.map(([, t]) => WEIGHT[t]));
  }
  return { ...layout, maximized: layout.maximized ?? null };
}

/**
 * Take surfaces off the stage: every panel of those kinds (only the ones
 * showing `lens`, for a map; only those showing `doc`, for a model). A
 * workspace closed down to nothing rests on the map — or on the model, when it
 * was the map that was put away and there is a model.
 */
export function closeSurfaces(
  surfaces: SurfaceType[],
  current: WorkspaceLayout,
  facts?: WorkspaceFacts | null,
  opts: { lens?: LensId; doc?: string } = {}
): WorkspaceLayout {
  const types = new Set(surfaces);
  const doomed = panelsOf(current).filter((p) => {
    if (!types.has(p.type)) return false;
    if (p.type === 'map' && opts.lens) return lensShown(p, facts) === opts.lens;
    if (opts.doc && p.type !== 'map') return docShownBy(p, facts) === opts.doc;
    return true;
  });
  if (!doomed.length) return current;
  let layout = current;
  for (const p of doomed) layout = closePanel(layout, p.id);
  if (!layout.root && current.root) {
    if (!types.has('map')) return singleLayout('map');
    if (hasModel(facts) && !types.has('model')) return singleLayout('model');
  }
  return layout;
}

/**
 * Give the stage to what was asked for. One surface is given the whole
 * workspace — maximised among several, so restore brings the arrangement back,
 * as a lens asked for by name is (showLens). Several become the workspace:
 * the others are closed, the conversation keeps its place.
 */
export function onlySurfaces(surfaces: SurfaceType[], current: WorkspaceLayout, facts: WorkspaceFacts, opts: SurfaceOptions = {}): WorkspaceLayout {
  const wanted = LAYOUT_ORDER.filter((s) => s !== 'chat' && surfaces.includes(s));
  if (!wanted.length) return current;
  const together = new Set(wanted);
  const specs = wanted.map((s) => panelFor(s, facts, opts, together));
  if (specs.length === 1) {
    const spec = specs[0];
    if (panelsOf(current).length <= 1) return singleLayout(spec.type, spec.config);
    const there = reusable(current, spec, facts, new Set());
    if (there) return maximize(spec.type === 'map' && opts.lens && there.config?.lens !== opts.lens ? configurePanel(current, there.id, { lens: opts.lens }) : current, there.id);
    const added = addPanel(current, spec, 1.6, besideShare(spec.type));
    return added.id ? maximize(added.layout, added.id) : current;
  }
  let layout = restore(current);
  const taken = new Set<string>();
  for (const spec of specs) {
    const p = reusable(layout, spec, facts, taken);
    if (p) taken.add(p.id);
  }
  for (const p of panelsOf(layout)) if (p.type !== 'chat' && !taken.has(p.id)) layout = closePanel(layout, p.id);
  return layoutForSurfaces(wanted, layout, facts, opts);
}

/**
 * A request read from the conversation (readInterfaceRequest), as the layout
 * it asks for. A lens asked for by name is applied exactly as it always was
 * (showLens). A request that includes the conversation leaves the conversation
 * to the client, which opens or folds its dock.
 */
export function layoutForRequest(
  req: Pick<InterfaceRequest, 'op' | 'surfaces' | 'lens'>,
  current: WorkspaceLayout,
  facts: WorkspaceFacts,
  opts: SurfaceOptions = {}
): WorkspaceLayout {
  const o = req.lens ? { ...opts, lens: req.lens } : opts;
  switch (req.op) {
    case 'close':
      return closeSurfaces(req.surfaces, current, facts, { lens: req.lens });
    case 'only':
      return onlySurfaces(req.surfaces, current, facts, o);
    default:
      if (req.lens && req.surfaces.length === 1 && req.surfaces[0] === 'map') return showLens(current, req.lens);
      return layoutForSurfaces(req.surfaces, current, facts, o);
  }
}

/**
 * WHAT A BUILD OPENS — keyed on the build itself (the server's `build.ok` and
 * `build.id`), never on a count of documents, so the seventh model, built
 * where only six are kept (DOC_CAP), opens like the first.
 *
 *   · Already on screen (a model panel showing it, or its 3D view): nothing.
 *   · A lone map, or an empty workspace: the model opens BESIDE the map — and
 *     its 3D view too when it holds solids. The map takes its reasoning lens,
 *     or it would draw the model a second time. (A map with nothing on it yet
 *     has no reading but the model, so the model takes the stage alone.) The
 *     conversation, if it is a panel, keeps its place and does not count.
 *   · Any other arrangement is the person's own: nothing moves, and the
 *     suggestion line offers to open it ('built:<doc>'). Its arrangement is
 *     'built', which arrangementsFor offers while `facts.built` is set.
 */
export function afterBuild(
  current: WorkspaceLayout,
  facts: WorkspaceFacts,
  built: { doc: string; solids: boolean }
): { layout?: WorkspaceLayout; suggestion?: LayoutSuggestion } {
  if (!built?.doc) return {};
  if (showsDoc(current, facts, built.doc)) return {};
  const surfaces: SurfaceType[] = built.solids ? ['model', 'scene'] : ['model'];
  const opts: SurfaceOptions = { doc: built.doc, solids: !!built.solids };
  const stage = panelsOf(current).filter((p) => p.type !== 'chat');
  if (!stage.length || (stage.length === 1 && stage[0].type === 'map')) {
    if (reasoningOf(facts) && facts.nodes > 0) return { layout: layoutForSurfaces(['map', ...surfaces], current, facts, opts) };
    const without = stage.length ? closePanel(current, stage[0].id) : current;
    return { layout: layoutForSurfaces(surfaces, without, facts, opts) };
  }
  return { suggestion: builtSuggestion(built) };
}

/** Is an arrangement already what is on screen? Then suggesting it says nothing. */
function inPlace(arr: WorkspaceLayout, layout: WorkspaceLayout, facts: WorkspaceFacts): boolean {
  const vis = visiblePanels(layout);
  return panelsOf(arr).every((want) =>
    vis.some((p) => {
      if (p.type !== want.type) return false;
      if (p.type === 'map') {
        const shown = lensShown(p, facts);
        return want.config?.lens ? shown === want.config.lens || (shown !== 'plot' && shown !== 'work') : true;
      }
      if (p.type === 'scene') return (p.config?.doc ?? '') === (want.config?.doc ?? '') && (!want.config?.obj || !p.config?.obj || p.config.obj === want.config.obj);
      if (p.type === 'model') return docShownBy(p, facts) === (want.config?.doc ?? shownDoc(facts)?.id ?? null) && (p.config?.view ?? '') === (want.config?.view ?? '');
      return true;
    })
  );
}

// ── every view, by name: the catalogue "+ View" lists in full ─────
//
// "+ View" leads with what the state makes worth opening (suggestViews). Under
// it is every kind of view there is, so a person can open any of them by hand
// — or put away the ones they do not want. A view with nothing to show yet can
// still be opened onto its own empty state; the menu says so, quietly.

export type ViewId = 'map' | 'plot' | 'model' | 'scene' | 'params' | 'inspector' | 'trace' | 'mind' | 'chat';

/** What each kind of view is called — in "+ View", and wherever the workspace titles a panel of it. */
export const VIEW_NAMES: Record<ViewId, string> = {
  map: 'Thinking Map',
  plot: 'Math plotting',
  model: 'Modeling',
  scene: 'Studio (CAD)',
  params: 'Parameters',
  inspector: 'Inspector',
  trace: 'Trace',
  mind: 'Mind',
  chat: 'Conversation',
};

/** Every kind of view, in the order "+ View" lists them. Math plotting is the map's plot lens, as a panel of its own. */
export const VIEW_CATALOGUE: readonly { id: ViewId; type: SurfaceType; config?: PanelConfig; name: string; says: string }[] = [
  { id: 'map', type: 'map', name: VIEW_NAMES.map, says: 'the ideas so far, and how they connect' },
  { id: 'plot', type: 'map', config: { lens: 'plot' }, name: VIEW_NAMES.plot, says: 'the functions and models of this line of thinking, plotted' },
  { id: 'model', type: 'model', name: VIEW_NAMES.model, says: 'a model you can move: its sliders, readouts and views' },
  { id: 'scene', type: 'scene', name: VIEW_NAMES.scene, says: 'shapes in 3D, built by describing them — a geometric preview' },
  { id: 'params', type: 'params', name: VIEW_NAMES.params, says: 'every control of the model, each one a change to it' },
  { id: 'inspector', type: 'inspector', name: VIEW_NAMES.inspector, says: 'what the selected thing is, and how it was computed' },
  { id: 'trace', type: 'trace', name: VIEW_NAMES.trace, says: 'every change to the model, each one undoable' },
  { id: 'mind', type: 'mind', name: VIEW_NAMES.mind, says: 'this line of thinking among all your others' },
  { id: 'chat', type: 'chat', name: VIEW_NAMES.chat, says: 'the conversation, as a panel of its own' },
];

/** Which kind of view a panel is. */
export function viewOf(p: Pick<PanelNode, 'type' | 'config'>): ViewId {
  if (p.type === 'map') return p.config?.lens === 'plot' ? 'plot' : 'map';
  return p.type;
}

export interface CatalogueEntry {
  id: ViewId;
  name: string;
  type: SurfaceType;
  /** what one line says it is */
  says: string;
  /** the panel opening it adds, configured for what is here (a 3D panel on the model's solids, say) */
  panel: { type: SurfaceType; config?: PanelConfig };
  /** the panels of this kind in the layout */
  panels: string[];
  isOpen: boolean;
  /** one of them is on screen, not set aside behind a maximised panel */
  visible: boolean;
  /** it has nothing to show yet, and why — it still opens, onto its own empty state */
  empty: string | null;
}

function catalogueSpec(id: ViewId, layout: WorkspaceLayout, facts?: WorkspaceFacts | null): { type: SurfaceType; config?: PanelConfig } {
  switch (id) {
    case 'plot':
      return { type: 'map', config: { lens: 'plot' } };
    case 'map': {
      // the map opened beside a model or a 3D view reads as the reasoning
      if (!facts) return { type: 'map' };
      const beside = visiblePanels(layout).some((p) => p.type === 'model' || p.type === 'scene');
      const lead = leadOf(facts);
      const reasoning = reasoningOf(facts);
      return beside && reasoning && (lead === 'plot' || lead === 'work') ? { type: 'map', config: { lens: reasoning } } : { type: 'map' };
    }
    case 'scene':
      return (facts && threeDPanel(facts)) || { type: 'scene' };
    default:
      return { type: id };
  }
}

function emptyNote(id: ViewId, facts?: WorkspaceFacts | null, offered?: readonly ViewSuggestion[] | null): string | null {
  if (facts) {
    const doc = shownDoc(facts);
    switch (id) {
      case 'map':
        return facts.nodes ? null : 'nothing on it yet — it builds as you talk';
      case 'plot':
        return facts.lenses.includes('plot') ? null : 'nothing to plot yet — it shows the map until there is';
      case 'model':
        return hasModel(facts) ? null : 'no model yet — ask for one in the conversation';
      case 'scene':
        return facts.scenes.length || doc?.solids ? null : 'empty — describe a shape in the conversation';
      case 'params':
        return !doc ? 'no model yet' : doc.params + doc.inputs ? null : 'the model has nothing to adjust';
      case 'inspector':
        return doc || facts.nodes ? null : 'nothing to inspect yet';
      case 'trace':
        return !doc ? 'no model yet' : doc.changes ? null : 'no changes yet';
      case 'mind':
        return facts.mind ? null : 'joins your account — sign in to see it';
      default:
        return null;
    }
  }
  if (offered) {
    const any = (type: SurfaceType, pinned?: keyof PanelConfig) => offered.some((v) => v.type === type && (!pinned || !!v.config?.[pinned]));
    switch (id) {
      case 'model':
        return any('model') ? null : 'no model yet — ask for one in the conversation';
      case 'scene':
        return any('scene', 'obj') || any('scene', 'doc') ? null : 'empty — describe a shape in the conversation';
      case 'params':
        return any('params') ? null : 'nothing to adjust yet';
      case 'inspector':
        return any('inspector') ? null : 'nothing to inspect yet';
      case 'trace':
        return any('trace') ? null : 'no changes yet';
      case 'mind':
        return any('mind') ? null : 'joins your account — sign in to see it';
      default:
        return null;
    }
  }
  return null;
}

/**
 * Every kind of view, each with whether it is open and what opening it adds.
 * With the facts, a view that has nothing to show yet says why. Without them,
 * the views "+ View" was offered (suggestViews) stand in for the facts.
 */
export function viewCatalogue(layout: WorkspaceLayout, facts?: WorkspaceFacts | null, offered?: readonly ViewSuggestion[] | null): CatalogueEntry[] {
  const all = panelsOf(layout);
  const vis = new Set(visiblePanels(layout).map((p) => p.id));
  return VIEW_CATALOGUE.map((v) => {
    const panels = all.filter((p) => viewOf(p) === v.id).map((p) => p.id);
    return {
      id: v.id,
      name: v.name,
      type: v.type,
      says: v.says,
      panel: catalogueSpec(v.id, layout, facts),
      panels,
      isOpen: panels.length > 0,
      visible: panels.some((id) => vis.has(id)),
      empty: emptyNote(v.id, facts, offered),
    };
  });
}

/**
 * Open a view from the catalogue. One already open is brought back on screen
 * if a maximised panel had set it aside. Otherwise it opens the way the same
 * view asked for in the conversation would (layoutForSurfaces): beside what is
 * there, the map as its reasoning when a model is beside it. Math plotting and
 * the conversation open as panels of their own, beside the panel with the most
 * room. Without the facts, it is opened plainly beside that panel.
 */
export function openView(layout: WorkspaceLayout, id: ViewId, facts?: WorkspaceFacts | null): { layout: WorkspaceLayout; id: string | null } {
  const there = panelsOf(layout).filter((p) => viewOf(p) === id);
  if (there.length) {
    const vis = new Set(visiblePanels(layout).map((p) => p.id));
    const seen = there.find((p) => vis.has(p.id));
    return seen ? { layout, id: seen.id } : { layout: restore(layout), id: there[0].id };
  }
  if (facts && id !== 'plot' && id !== 'chat') {
    const before = new Set(panelsOf(layout).map((p) => p.id));
    const next = layoutForSurfaces([id], layout, facts);
    return { layout: next, id: panelsOf(next).find((p) => !before.has(p.id))?.id ?? null };
  }
  return openBeside(layout, catalogueSpec(id, layout, facts), facts);
}

/** Put a view away: every panel of that kind closes, and its room goes to its neighbours. */
export function closeView(layout: WorkspaceLayout, id: ViewId): WorkspaceLayout {
  let out = layout;
  for (const p of panelsOf(layout)) if (viewOf(p) === id) out = closePanel(out, p.id);
  return out;
}
