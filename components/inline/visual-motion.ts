'use client';
// components/inline/visual-motion.ts — MOTION THAT FOLLOWS THE MODEL, AND STOPS WHEN NOBODY IS LOOKING (Logos 6).
//
// One tween at a time per artifact, driven by requestAnimationFrame: each frame asks the caller for the state at time
// t (a parameter on its own step, lib/visual/actions.ts tweenAt), so what is drawn is always a state the model can be
// in — never an interpolated picture. It pauses and resumes (the person's Pause, or the artifact scrolled out of view),
// is cancelled when the artifact goes, and under reduced motion jumps to its end: the change is still shown (the start
// stays drawn faintly beside it), the movement is not.

import { useEffect, useRef, useState } from 'react';
import { reducedMotion } from './visual-bus';

export interface Tween {
  /** start a motion of `ms`; onFrame(t) with t from 0 to 1; onEnd when it reaches 1 (not when cancelled) */
  start: (ms: number, onFrame: (t: number) => void, onEnd?: () => void) => void;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  running: boolean;
  paused: boolean;
}

/** Whether an element is on screen (a motion offscreen waits for it). */
export function useInView<T extends Element>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((es) => setSeen(es.some((e) => e.isIntersecting)), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, seen];
}

export function useTween(inView: boolean): Tween {
  const raf = useRef<number | null>(null);
  const m = useRef<{ ms: number; t0: number; held: number | null; onFrame: (t: number) => void; onEnd?: () => void; userPaused: boolean } | null>(null);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);

  const stop = () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
  };
  const tick = () => {
    const cur = m.current;
    if (!cur || cur.held !== null) return;
    const t = cur.ms <= 0 ? 1 : Math.min(1, (performance.now() - cur.t0) / cur.ms);
    cur.onFrame(t);
    if (t >= 1) {
      m.current = null;
      raf.current = null;
      setRunning(false);
      setPaused(false);
      cur.onEnd?.();
      return;
    }
    raf.current = requestAnimationFrame(tick);
  };
  const hold = (byUser: boolean) => {
    const cur = m.current;
    if (!cur || cur.held !== null) return;
    cur.held = performance.now() - cur.t0;
    if (byUser) cur.userPaused = true;
    stop();
    if (byUser) setPaused(true);
  };
  const release = (byUser: boolean) => {
    const cur = m.current;
    if (!cur || cur.held === null) return;
    if (!byUser && cur.userPaused) return;
    if (byUser) cur.userPaused = false;
    cur.t0 = performance.now() - cur.held;
    cur.held = null;
    setPaused(false);
    raf.current = requestAnimationFrame(tick);
  };

  // out of view: held where it is; back in view: on from there (unless the person paused it)
  useEffect(() => {
    if (!m.current) return;
    if (inView) release(false);
    else hold(false);
  }, [inView]);
  useEffect(() => () => stop(), []);

  return {
    start(ms, onFrame, onEnd) {
      stop();
      const quick = reducedMotion() || ms <= 0;
      if (quick) {
        m.current = null;
        setRunning(false);
        setPaused(false);
        onFrame(1);
        onEnd?.();
        return;
      }
      m.current = { ms, t0: performance.now(), held: null, onFrame, onEnd, userPaused: false };
      setRunning(true);
      setPaused(false);
      if (inView) raf.current = requestAnimationFrame(tick);
      else m.current.held = 0;
    },
    pause: () => hold(true),
    resume: () => release(true),
    cancel() {
      stop();
      m.current = null;
      setRunning(false);
      setPaused(false);
    },
    running,
    paused,
  };
}
