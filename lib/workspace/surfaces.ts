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
import { isOpen, panelsOf, type PanelConfig, type SurfaceType, type WorkspaceLayout } from './tiling';

/** What a person can point at, in any surface. */
export type FocusKind = 'node' | 'object' | 'param' | 'input';

export interface SurfaceContract {
  type: SurfaceType;
  title: string;
  /** which part of the canonical state it is a representation of */
  represents: 'conversation' | 'map' | 'model' | 'selection' | 'history';
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
    lenses: availableLenses(m as ThinkingMap),
    docs,
    activeDoc: ws?.active ?? null,
    viz: m.viz ? (m.viz.kind === 'simulation' ? 'simulation' : 'picture') : null,
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
  structure: 'what this is trying to accomplish, laid out as a structure',
  tensions: 'the places your reasons pull against each other',
  evidence: 'what each belief rests on',
  solve: 'the working, step by step',
  board: 'the working, as you would write it by hand',
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

  const order: SurfaceType[] = ['model', 'params', 'inspector', 'map', 'chat', 'trace'];
  return out.sort((a, b) => Number(a.open) - Number(b.open) || b.score - a.score || order.indexOf(a.type) - order.indexOf(b.type));
}

// ── suggestions to change the arrangement ─────────────────────────

export interface LayoutSuggestion {
  id: string;
  text: string;
  action: { type: SurfaceType; config?: PanelConfig }[];
}

/**
 * At most one suggestion, and only one the state earns. The workspace is the
 * person's: Socria may suggest a change and preview what it would open, and
 * nothing moves until they accept. A suggestion they dismissed is not made
 * again in this line of thinking.
 */
export function suggestLayout(
  facts: WorkspaceFacts,
  layout: WorkspaceLayout,
  lastSaid: string,
  dismissed: ReadonlySet<string>
): LayoutSuggestion | null {
  const open = (t: SurfaceType) => panelsOf(layout).some((p) => p.type === t);
  const doc = facts.docs.find((d) => d.id === facts.activeDoc) ?? facts.docs[facts.docs.length - 1] ?? null;
  const said = lastSaid.toLowerCase();
  const offer = (s: LayoutSuggestion) => (dismissed.has(s.id) ? null : s);

  if (facts.docs.length >= 2 && /\b(compare|versus|vs\.?|side by side|difference between)\b/.test(said)) {
    const [a, b] = facts.docs.slice(-2);
    const both = panelsOf(layout).filter((p) => p.type === 'model').map((p) => p.config?.doc);
    if (!(both.includes(a.id) && both.includes(b.id))) {
      const s = offer({ id: `compare:${a.id}:${b.id}`, text: `Open ${a.title} and ${b.title} side by side?`, action: [{ type: 'model', config: { doc: a.id } }, { type: 'model', config: { doc: b.id } }] });
      if (s) return s;
    }
  }
  if (doc && !open('model')) {
    const s = offer({ id: `model:${doc.id}`, text: `Open ${doc.title} in the workspace?`, action: [{ type: 'model' }] });
    if (s) return s;
  }
  if (doc && open('model') && doc.params + doc.inputs >= 2 && !open('params')) {
    const s = offer({ id: `params:${doc.id}`, text: 'Open its parameters and the inspector beside it?', action: [{ type: 'params' }, ...(open('inspector') ? [] : [{ type: 'inspector' as const }])] });
    if (s) return s;
  }
  if (!doc && facts.nodes >= 6 && facts.lenses.includes('evidence') && /\b(source|evidence|cite|research|study|studies|data)\b/.test(said) && !isOpen(layout, 'map', { lens: 'evidence' })) {
    const s = offer({ id: 'evidence', text: 'Open the evidence beside the map?', action: [{ type: 'map', config: { lens: 'evidence' } }] });
    if (s) return s;
  }
  return null;
}
