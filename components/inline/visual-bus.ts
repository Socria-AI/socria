'use client';
// components/inline/visual-bus.ts — ONE PLACE WHERE WHAT IS SHOWN IS DIRECTED (Logos 6, November 2026).
//
// Every artifact on the page registers here under its key ("<message id>:<n>", lib/visual/elements.ts), with a way to
// read it as it now stands (its parts, its parameters). Anything that wants to point at it — a reply's marker as it is
// read, a person's request, a press on a part — sends an action here, and it is checked (lib/visual/actions.ts) against
// the artifact as it is at that moment before anything changes. Then:
//   • emphasis (highlight, focus, zoom, trace, reveal) is held HERE, for a moment or until something else is pointed
//     at: never written into the artifact, never a version of it;
//   • a change to the model (animate, update_parameter, reset, step, compare, pause, resume, replay) is handed to the
//     artifact's renderer as a numbered command, which does it with its own values — the same path a slider takes, so
//     it is kept like one, and Socria is told about it like one.
// A command carries a number, so drawing the same artifact again (a rerender, the Everything view's card and its
// enlarged copy) never does it twice. An action for an artifact not drawn yet waits (a reply's marker names the graph
// below it) and is done when it is, or dropped after a while — never done to something else.
//
// What changed meaningfully, what is selected and which artifact was last touched are kept for the person's next
// message (LogosApp, lib/visual/context.ts) — never every frame.

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { actionSaid, checkAction, isKept, type VisualAction } from '@/lib/visual/actions';
import type { VisualArtifact } from '@/lib/visual/elements';

export interface Emphasis {
  ids: string[];
  op: 'highlight' | 'focus' | 'zoom' | 'trace' | 'reveal';
  hold: boolean;
  k?: number;
  n: number;
}
export interface Command {
  action: VisualAction;
  n: number;
  /** who asked: the person, or Socria (a marker in a reply) */
  by: 'you' | 'socria';
}
export interface VisState {
  emph: Emphasis | null;
  cmd: Command | null;
  /** the part pressed (and kept pressed) */
  selected: string | null;
  /** where it started shown beside where it is now */
  compare: boolean;
}

const NONE: VisState = { emph: null, cmd: null, selected: null, compare: false };
const states = new Map<string, VisState>();
const subs = new Set<() => void>();
/** how each artifact on the page reads as it stands, newest registration last */
const readers = new Map<string, { read: () => VisualArtifact; values: () => Record<string, number> }>();
const waiting: { key: string | null; resolve?: (a: VisualAction) => string | null; action: VisualAction; by: Command['by']; until: number; done?: (ok: boolean) => void }[] = [];
const changes: { key: string; line: string; at: number }[] = [];
let active: string | null = null;
let counter = 0;
/** bumped whenever an artifact comes or goes, so what waits on one can look again */
let version = 0;
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function emit() {
  subs.forEach((f) => f());
}
function put(key: string, next: Partial<VisState>) {
  states.set(key, { ...(states.get(key) ?? NONE), ...next });
  emit();
}

/** Whether motion should be kept to what carries meaning (the person's setting). */
export function reducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

// ── registering ──────────────────────────────────────────────────────

/** An artifact on the page, readable as it now stands; what was waiting for it is done now. */
export function register(key: string, read: () => VisualArtifact, values: () => Record<string, number>) {
  readers.delete(key);
  readers.set(key, { read, values });
  version++;
  flush();
  emit();
  return () => {
    if (readers.get(key)?.read === read) {
      readers.delete(key);
      version++;
      emit();
    }
  };
}

/** The page's artifacts changed (one drawn, one gone): for what resolves against them. */
export function useRegistry(): number {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    () => version,
    () => 0
  );
}

/** The artifacts on the page, newest first, as they now stand. */
export function onPage(): { art: VisualArtifact; values: Record<string, number> }[] {
  return [...readers.values()].reverse().map((r) => ({ art: r.read(), values: r.values() }));
}

function flush() {
  const now = Date.now();
  for (let i = 0; i < waiting.length; i++) {
    const w = waiting[i];
    if (w.until < now) {
      waiting.splice(i--, 1);
      w.done?.(false);
      continue;
    }
    const key = w.key ?? w.resolve?.(w.action) ?? null;
    if (!key || !readers.has(key)) continue;
    waiting.splice(i--, 1);
    w.done?.(apply(key, w.action, w.by));
  }
}

// ── doing ────────────────────────────────────────────────────────────

/**
 * An action for one artifact: checked against it as it now stands, then shown or handed to it. Not drawn yet: it
 * waits (20 s), then is dropped. Returns whether it was done now.
 */
export function act(key: string, action: VisualAction, by: Command['by'] = 'you', done?: (ok: boolean) => void): boolean {
  if (!readers.has(key)) {
    waiting.push({ key, action, by, until: Date.now() + 20_000, done });
    return false;
  }
  const ok = apply(key, action, by);
  done?.(ok);
  return ok;
}

/** An action whose artifact is found when it can be (a reply's marker: its own elements first, then the newest). */
export function actWhen(resolve: (a: VisualAction) => string | null, action: VisualAction, by: Command['by'], done?: (ok: boolean) => void) {
  const key = resolve(action);
  if (key && readers.has(key)) {
    const ok = apply(key, action, by);
    done?.(ok);
    return;
  }
  waiting.push({ key: null, resolve, action, by, until: Date.now() + 20_000, done });
}

/** Whether an action can be done to an artifact on the page as it stands (for a marker: shown as a control, or as words). */
export function can(key: string, action: VisualAction): boolean {
  const r = readers.get(key);
  return !!r && checkAction(action, r.read(), r.values()).ok;
}

function apply(key: string, raw: VisualAction, by: Command['by']): boolean {
  const r = readers.get(key);
  if (!r) return false;
  const art = r.read();
  const values = r.values();
  const c = checkAction(raw, art, values);
  if (!c.ok) return false;
  const a = c.action;
  const n = ++counter;
  const cur = states.get(key) ?? NONE;
  if (a.op === 'unhighlight') {
    put(key, { emph: null });
    return true;
  }
  if (a.op === 'highlight' || a.op === 'focus' || a.op === 'zoom' || a.op === 'trace' || a.op === 'reveal') {
    put(key, { emph: { ids: a.targets, op: a.op, hold: !!a.hold, n, ...(a.k ? { k: a.k } : {}) }, ...(a.op === 'trace' || a.op === 'zoom' ? { cmd: { action: a, n, by } } : {}) });
    // a moment's emphasis fades; a person's own request stays until something else is pointed at
    clearTimeout(timers.get(key));
    if (!a.hold && a.op !== 'zoom') timers.set(key, setTimeout(() => (states.get(key)?.emph?.n === n ? put(key, { emph: null }) : undefined), a.op === 'trace' ? 4200 : 3400));
    active = key;
    return true;
  }
  if (a.op === 'compare') {
    put(key, { compare: !cur.compare, cmd: { action: a, n, by } });
    return true;
  }
  put(key, { cmd: { action: a, n, by }, ...(a.op === 'reset' ? { compare: false, emph: null } : {}) });
  active = key;
  if (isKept(a) && a.op !== 'reset') noteChange(key, `${actionSaid(a, art, values).replace(/\.$/, '')} (${by === 'you' ? 'asked by them' : 'by Socria'}).`);
  return true;
}

/** Run actions one after another on one artifact: each given time to be seen before the next. */
export function sequence(key: string, actions: VisualAction[], by: Command['by'] = 'you', gap = 650) {
  let t = 0;
  for (const a of actions) {
    const ms = a.op === 'animate' || a.op === 'update_parameter' ? (a.ms ?? 1600) : a.op === 'step' ? 500 : 900;
    setTimeout(() => act(key, a, by), t);
    t += reducedMotion() ? 120 : ms + gap;
  }
}

// ── a reply's markers, in reading order ──────────────────────────────

const fired = new Set<string>();
const queues = new Map<string, Promise<void>>();

/**
 * A marker in a fresh reply, done once, in its turn: after the one before it in the same reply has had its moment,
 * never all at once, never again when the reply is drawn again.
 */
export function cue(id: string, run: (done: () => void) => void) {
  if (fired.has(id)) return;
  fired.add(id);
  const group = id.split('|')[0];
  const prev = queues.get(group) ?? Promise.resolve();
  const next = prev.then(
    () =>
      new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          setTimeout(resolve, reducedMotion() ? 200 : 1500);
        };
        run(finish);
        setTimeout(finish, 22_000);
      })
  );
  queues.set(group, next);
}
export const wasCued = (id: string) => fired.has(id);

// ── what the person did, for their next message ──────────────────────

/** A meaningful change to an artifact (a parameter moved, a step taken), kept for the next message: never a frame. */
export function noteChange(key: string, line: string) {
  const i = changes.findIndex((c) => c.key === key && c.line.split(' (')[0] === line.split(' (')[0]);
  if (i >= 0) changes.splice(i, 1);
  changes.push({ key, line, at: Date.now() });
  while (changes.length > 6) changes.shift();
}
/** The changes since the last message, oldest first, taken (the next message carries them once). */
export function takeChanges(): string[] {
  const out = changes.map((c) => c.line);
  changes.length = 0;
  return out.slice(-4);
}

export function touch(key: string) {
  active = key;
}
export const activeKey = () => active;

/** A part pressed: selected (pressed again, let go); one at a time on the page. */
export function select(key: string, id: string | null) {
  for (const [k, s] of states) if (k !== key && s.selected) states.set(k, { ...s, selected: null });
  const cur = states.get(key)?.selected ?? null;
  put(key, { selected: id && cur !== id ? id : null });
  active = key;
}
export function selection(): { key: string; id: string } | null {
  for (const [k, s] of states) if (s.selected) return { key: k, id: s.selected };
  return null;
}

/** For tests and the page's own clean-up. */
export function resetBus() {
  states.clear();
  readers.clear();
  waiting.length = 0;
  changes.length = 0;
  fired.clear();
  queues.clear();
  active = null;
}

// ── in a renderer ────────────────────────────────────────────────────

/** This artifact's emphasis, command, selection and comparison, as they change. */
export function useVisual(key: string | undefined): VisState {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    () => (key ? states.get(key) ?? NONE : NONE),
    () => NONE
  );
}

/** Registered while drawn: readable as it stands (the reader is kept current every render). */
export function useRegister(key: string | undefined, read: () => VisualArtifact, values: () => Record<string, number>) {
  const r = useRef({ read, values });
  r.current = { read, values };
  useEffect(() => {
    if (!key) return;
    return register(
      key,
      () => r.current.read(),
      () => r.current.values()
    );
  }, [key]);
}

/**
 * A command, done once by this drawing of the artifact: a command given before it was drawn (it waited) is done; one
 * already done before this drawing appeared (the card enlarged after the animation) is not done again.
 */
export function useCommand(vis: VisState, run: (c: Command) => void) {
  const seen = useRef<number>(0);
  const mounted = useRef(false);
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      seen.current = vis.cmd?.n ?? 0;
      return;
    }
    if (vis.cmd && vis.cmd.n > seen.current) {
      seen.current = vis.cmd.n;
      runRef.current(vis.cmd);
    }
  }, [vis.cmd]);
}

/** A class for a part: lit when pointed at, quiet while something else is, selected when pressed. */
export function emphClass(vis: VisState, id: string): string {
  const lit = vis.emph?.ids.includes(id);
  return `${lit ? ' is-vlit' : vis.emph ? ' is-vquiet' : ''}${vis.selected === id ? ' is-vsel' : ''}`;
}
