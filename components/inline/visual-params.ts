'use client';
// components/inline/visual-params.ts — A MODEL'S PARAMETERS, MOVED BY ITS OWN STEPS (Logos 6).
//
// For an element whose picture is computed from a few parameters (forces, a simulation): the visual actions that
// change it — animate a parameter to a value, play the change it was drawn to show (spec.animate), replay, pause,
// resume, put back — done through the same values a slider sets, so the result is kept like a slider's (onState) and
// said like one. The graph does the same with its own camera and tracer (InlineUI.tsx InlineGraph).

import { useRef } from 'react';
import { tweenAt, tweenMs, type VisualAction } from '@/lib/visual/actions';
import type { AnimateSpec, ParamSpec } from '@/lib/inline-ui';
import type { Tween } from './visual-motion';

export interface ParamAnimator {
  /** do one action; false when it is not one this animator does */
  exec: (a: VisualAction) => boolean;
  /** the last move, for Replay and its label */
  last: React.MutableRefObject<{ param: string; from: number; to: number } | null>;
}

export function useParamAnimator(o: {
  params: readonly ParamSpec[];
  animate?: AnimateSpec;
  values: React.MutableRefObject<Record<string, number>>;
  setValues: (v: Record<string, number>) => void;
  save: (v: Record<string, number>) => void;
  tween: Tween;
}): ParamAnimator {
  const last = useRef<{ param: string; from: number; to: number } | null>(null);
  const start = () => Object.fromEntries(o.params.map((p) => [p.name, p.value]));
  const move = (param: string, to: number, ms?: number) => {
    const p = o.params.find((q) => q.name === param);
    if (!p) return;
    const from = o.values.current[param] ?? p.value;
    last.current = { param, from, to };
    o.tween.start(
      tweenMs(from, to, p, { ms }),
      (t) => {
        o.values.current = { ...o.values.current, [param]: tweenAt(t, from, to, p) };
        o.setValues(o.values.current);
      },
      () => {
        o.values.current = { ...o.values.current, [param]: to };
        o.setValues(o.values.current);
        o.save(o.values.current);
      }
    );
  };
  const play = (ms?: number) => {
    const an = o.animate;
    const p = an ? o.params.find((q) => q.name === an.param) : null;
    if (!an || !p) return false;
    o.values.current = { ...o.values.current, [p.name]: p.value };
    o.setValues(o.values.current);
    move(p.name, an.to, ms);
    return true;
  };
  const exec = (a: VisualAction): boolean => {
    const param = a.targets.find((t) => t.startsWith('param:'))?.slice(6);
    switch (a.op) {
      case 'update_parameter':
        if (!param || a.to === undefined) return false;
        o.tween.cancel();
        o.values.current = { ...o.values.current, [param]: a.to };
        o.setValues(o.values.current);
        o.save(o.values.current);
        return true;
      case 'animate':
        if (param && a.to !== undefined) move(param, a.to, a.ms);
        else return play(a.ms);
        return true;
      case 'replay':
        if (last.current) {
          const m = last.current;
          o.values.current = { ...o.values.current, [m.param]: m.from };
          o.setValues(o.values.current);
          move(m.param, m.to);
          return true;
        }
        return play();
      case 'pause':
        o.tween.pause();
        return true;
      case 'resume':
        if (o.tween.running) o.tween.resume();
        else return play();
        return true;
      case 'reset':
        o.tween.cancel();
        o.values.current = start();
        o.setValues(o.values.current);
        o.save(o.values.current);
        return true;
      default:
        return false;
    }
  };
  return { exec, last };
}
