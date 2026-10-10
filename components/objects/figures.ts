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
import type { ThoughtObject } from '@/lib/objects/core';

export type FigureMode = 'live' | 'trail' | 'card';

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
}

const FIGURES = new Map<string, ComponentType<FigureProps>>();

/** A kind's figure, registered beside the kind. */
export function registerFigure(kind: string, figure: ComponentType<FigureProps>): void {
  FIGURES.set(kind, figure);
}

export const figureFor = (kind: string): ComponentType<FigureProps> | null => FIGURES.get(kind) ?? null;
