// lib/hand-bus.ts — REACHING THE HANDS WITHOUT LOADING THEM.
//
// Hand tracking (lib/hand-session.ts) and the hand pointer (lib/hand-dom.ts)
// are fetched only once somebody uses their hands. The app still has to reach
// them — Stop, from the menu or said aloud, and what Voice says to the pointer
// ("click", "scroll down", "zoom in") — and must never wait on a download to
// do it: Stop above all has to work offline, during a deploy, every time. So
// the session and the pointer put themselves here as they load, and the app
// asks here. This file is tiny on purpose and touches no camera; with hands
// never used, every call is a no-op.

/** What a spoken command can ask of the hand pointer, where the hand is. */
export interface HandPointerApi {
  /** Click what the hand points at: what was clicked, in words, or null when nothing is there. */
  click(): string | null;
  /** Scroll what is under the hand by most of a screen; false when nothing there scrolls. */
  scroll(dir: 1 | -1): boolean;
  /** Zoom what is under the hand, as a pinch would; false when nothing there zooms. */
  zoom(scale: number): boolean;
}

let stopper: (() => void) | null = null;
let pointer: HandPointerApi | null = null;

/** The hand session, as it loads: how to stop it. */
export function registerHandStop(stop: () => void): void {
  stopper = stop;
}

/** The hand pointer while it follows the hands; null once it lets go. */
export function registerHandPointer(p: HandPointerApi | null): void {
  pointer = p;
}

/**
 * Stop the hands at once — the camera released, the model closed — with nothing to download.
 * False when hand tracking was never loaded, so nothing can have been on.
 */
export function stopHands(): boolean {
  if (!stopper) return false;
  stopper();
  return true;
}

/** The hand pointer, while the hands are a pointer over the app; null otherwise. */
export function handPointer(): HandPointerApi | null {
  return pointer;
}
