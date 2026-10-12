// components/objects/figures.ts — which component draws which kind of object.
//
// The registry's own rule 4 (lib/objects/core.ts): a kind is a registry entry,
// not a branch in a renderer. `ObjectFigure` used to switch on kind names; it
// now asks this registry, and a kind's figure registers itself here beside the
// kind — so adding the everyday displays (a plan, a comparison, a worksheet…)
// is adding entries, not editing a switch.
//
// The props are the one contract every figure honours: it DRAWS canonical
// state and sends what the person does back up as an operation (`onOp`),
// computed in lib/objects and returned as the next state. It keeps no state
// of its own beyond what the hand is in the middle of.

import type { ComponentType } from 'react';
import type { ObjectSpace, ThoughtObject } from '@/lib/objects/core';
import type { MapHistory } from '@/lib/map-history';

export type FigureMode = 'live' | 'trail' | 'card';

/**
 * What an experience may ask of the workspace beyond its own object — each
 * one the person's action, refused for anyone who may only read:
 *
 *   make      a new object linked to this one ("make a plan from my next
 *             steps", "look back at this decision") — opened beside it;
 *             `origin: 'source'` when what it holds came from material the
 *             person attached (a document's table, charted)
 *   socria    Socria's own steps on this object, from a reply it was asked
 *             for: the counterpart's line, a suggestion — applied AS Socria,
 *             so the kind's rules about what is the person's still hold
 *   seek      look at an earlier state of another object (the Time Machine)
 *   branch    start a new object from an earlier state of one, beside it
 *   forget    delete an object's history before a state — the person's retention control
 *   forgetMap delete the map's record of changes before one
 *   open      bring another object into view
 */
export type WorkspaceAction =
  | { type: 'make'; kind: string; state: unknown; from?: { obj: string; part?: string }; origin?: 'source' }
  | { type: 'socria'; obj: string; ops: { op: string; args: Record<string, string | number> }[] }
  | { type: 'seek'; obj: string; at: number }
  | { type: 'branch'; obj: string; at: number; from?: string }
  | { type: 'forget'; obj: string; before: number }
  | { type: 'forgetMap'; before: number }
  | { type: 'open'; obj: string };

export interface WorkspaceResult {
  ok: boolean;
  why?: string;
  /** the object made, branched or opened */
  id?: string;
  /** how many of Socria's steps were applied, when some were refused */
  applied?: number;
}

/** A request to the experience route (app/api/logos/experience): what came back, or why nothing did. */
export type AskExperience = (body: Record<string, unknown>) => Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; why: string }>;

export interface FigureProps {
  obj: ThoughtObject;
  at: number;
  mode: FigureMode;
  guarded?: boolean;
  /** the selected part of THIS object, if any ('r2', 'e2.1', 'p:a') */
  sel?: string | null;
  onSelect?: (part: string | null) => void;
  /** an operation the person chose; the answer is whether it was computed, and why not if not */
  onOp?: (op: string, args: Record<string, string | number>, suggested?: boolean) => { ok: boolean; why?: string };
  /** put a sentence into the chat box, to be finished and sent there — the caret at `caret` */
  onDraft?: (text: string, caret?: number) => void;
  onSeek?: (at: number) => void;
  /** operations Socria suggested, offered — never applied by themselves */
  suggestions?: { op: string; args: Record<string, string | number>; said: string }[];
  /** open a view that lives elsewhere (a 2 × 2 matrix on the plane; a display in its own panel) */
  onView?: (view: string) => void;
  /** the whole workspace — an experience reads what it links to, and the Time Machine reads everything */
  space?: ObjectSpace;
  /** the map's record of changes (lib/map-history.ts) */
  history?: MapHistory;
  /** who is looking — Common Ground records what they write under their own name */
  me?: { id: string; name: string };
  /** this line of thinking is shared: everyone in it sees what is written here */
  shared?: boolean;
  /** the workspace beyond this object; absent where an experience is only shown */
  onWorkspace?: (a: WorkspaceAction) => WorkspaceResult;
  /** ask the experience route — a counterpart's line, suggestions — never applied by itself */
  ask?: AskExperience;
}

const FIGURES = new Map<string, ComponentType<FigureProps>>();

/** A kind's figure, registered beside the kind. */
export function registerFigure(kind: string, figure: ComponentType<FigureProps>): void {
  FIGURES.set(kind, figure);
}

export const figureFor = (kind: string): ComponentType<FigureProps> | null => FIGURES.get(kind) ?? null;
