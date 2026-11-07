// lib/logos5/morph.ts — ONE SPACE (Logos 5.5): the page and the Universal Map
// are two levels of one place, not two screens. Going between them, the line's
// name travels with you: the page's title becomes the name on its bubble, or
// the bubble's name becomes the page's title, while the rest steps back or
// comes forward. It is the browser's View Transitions: where they are missing,
// or the person has asked for less motion, the change is simply made.

import { flushSync } from 'react-dom';

/** The name the travelling element carries for the length of the move. */
export const MORPH_NAME = 'l5-line';

type Transitioning = Document & { startViewTransition?: (update: () => void) => { finished: Promise<void> } };

/** What travels: on the page, its title; on the Universal Map, the name on the conversation's bubble. */
export function pageTitleEl(): Element | null {
  return typeof document === 'undefined' ? null : document.querySelector('.l5v-title');
}
export function hubNameEl(id: string | null | undefined): Element | null {
  if (!id || typeof document === 'undefined') return null;
  const safe = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '');
  return document.querySelector(`.l5b-hub[data-node="${safe}"] .l5b-hub-t`);
}

/** Whether this browser can move between the levels, and the person wants motion. */
export function canMorph(): boolean {
  if (typeof document === 'undefined') return false;
  if (typeof (document as Transitioning).startViewTransition !== 'function') return false;
  return !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
}

const named = (el: Element | null | undefined, v: string) => {
  if (el instanceof HTMLElement) el.style.viewTransitionName = v;
};

/**
 * Make `update` — the state change that goes up or down a level — with the
 * move drawn: `from` (in the level being left) and what `to` finds (in the
 * level arrived at) are the one thing that travels. `dir` says which way, for
 * how the rest moves: out steps back and shrinks, in comes forward.
 */
export function morph(dir: 'out' | 'in', update: () => void, from: Element | null, to: () => Element | null): void {
  if (!canMorph()) return update();
  const root = document.documentElement;
  root.dataset.l5Morph = dir;
  named(from, MORPH_NAME);
  let target: Element | null = null;
  try {
    const t = (document as Transitioning).startViewTransition!(() => {
      named(from, '');
      flushSync(update);
      target = to();
      named(target, MORPH_NAME);
    });
    t.finished.finally(() => {
      named(target, '');
      delete root.dataset.l5Morph;
    });
  } catch {
    named(from, '');
    delete root.dataset.l5Morph;
    update();
  }
}

/**
 * A pinch (or Ctrl and the wheel) read as a wish to go a level up: the wheel's
 * outward travel adds up while it keeps coming, and past `enough` it is a
 * move. Returns whether this event was such a pinch (so it is not also the
 * browser's own zoom).
 */
export function pinchOut(e: { ctrlKey: boolean; deltaY: number }, acc: { n: number; at: number }, now: number, enough = 80): 'move' | 'gathering' | null {
  if (!e.ctrlKey || e.deltaY <= 0) {
    acc.n = 0;
    return null;
  }
  if (now - acc.at > 400) acc.n = 0;
  acc.at = now;
  acc.n += e.deltaY;
  if (acc.n >= enough) {
    acc.n = 0;
    return 'move';
  }
  return 'gathering';
}
