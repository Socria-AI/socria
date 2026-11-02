// lib/hand-dom.ts — WHAT A HAND DOES TO THE PAGE.
//
// lib/hand-pointer.ts turns hands into intents (hover, press, drag, release,
// cancel, zoom). This turns intents into the input every Logos 5 view already
// takes — pointer and mouse events, clicks, scrolling, the wheel — dispatched
// at whatever is under the hand. No view is taught hands; each one is used
// the way it is used with a mouse or a finger.
//
//   · A press on something that handles its own dragging — a map, a card, a
//     3D model, a slider handle — is a pointer drag. That is decided the way
//     a touch screen decides it, by the element's own `touch-action`: what
//     says `none` takes the drag itself; anything else is scrolled.
//   · A press anywhere else drags the page the way a finger does: the list,
//     the chat or the panel under it scrolls.
//   · A press that does not travel is a click (CLICK_SLOP), and a field or a
//     button it lands on is focused, as a mouse would.
//   · A range slider is set where the hand is.
//   · Both hands are the trackpad pinch: a ctrl-wheel at the point between them.
//
// Browser-only. Events made here are untrusted: they cannot open a file
// picker, play sound or go full screen, and the browser will not scroll for
// them by itself — which is why scrolling is done here, explicitly.

import { CLICK_SLOP, zoomWheelDelta, type PointerIntent } from './hand-pointer';
import { registerHandPointer } from './hand-bus';

/** The hand's pointer id: one no mouse, pen or finger uses. */
export const HAND_POINTER_ID = 47;

// ── pointer capture, for a pointer the browser does not know ─────────────
//
// A view that drags calls setPointerCapture(e.pointerId) on pointerdown, and
// the browser throws for an id it has no pointer for. While hands are on, the
// hand's id is captured here instead: moves and the release then go to the
// element that captured them, exactly as real capture would send them.
let shimUsers = 0;
let captured: Element | null = null;
let original: { set: Element['setPointerCapture']; release: Element['releasePointerCapture']; has: Element['hasPointerCapture'] } | null = null;

function installCaptureShim() {
  if (typeof Element === 'undefined') return;
  shimUsers += 1;
  if (shimUsers > 1) return;
  const P = Element.prototype;
  original = { set: P.setPointerCapture, release: P.releasePointerCapture, has: P.hasPointerCapture };
  const o = original;
  P.setPointerCapture = function (this: Element, id: number) {
    if (id === HAND_POINTER_ID) {
      captured = this;
      return;
    }
    return o.set.call(this, id);
  };
  P.releasePointerCapture = function (this: Element, id: number) {
    if (id === HAND_POINTER_ID) {
      if (captured === this) captured = null;
      return;
    }
    return o.release.call(this, id);
  };
  P.hasPointerCapture = function (this: Element, id: number) {
    if (id === HAND_POINTER_ID) return captured === this;
    return o.has.call(this, id);
  };
}

function uninstallCaptureShim() {
  if (typeof Element === 'undefined' || shimUsers === 0) return;
  shimUsers -= 1;
  if (shimUsers > 0 || !original) return;
  const P = Element.prototype;
  P.setPointerCapture = original.set;
  P.releasePointerCapture = original.release;
  P.hasPointerCapture = original.has;
  original = null;
  captured = null;
}

// ── what is under the hand, and what it does with a drag ──────────────

const EDITABLE = 'input:not([type=range]):not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable=""], [contenteditable="true"]';
/** What a pinch would press — highlighted while the hand is over it. */
const PRESSABLE =
  'button, a[href], input, textarea, select, summary, label, [role=button], [role=menuitem], [role=tab], [role=option], [role=switch], [role=checkbox], [role=slider], [contenteditable=""], [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

function scrolls(el: Element): boolean {
  const s = getComputedStyle(el);
  const y = (s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1;
  const x = (s.overflowX === 'auto' || s.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1;
  return y || x;
}

/** Does this element (or one around it, short of a scroller) take a drag itself, as `touch-action: none` says? */
export function takesDrag(el: Element | null): boolean {
  for (let n: Element | null = el; n && n !== document.documentElement; n = n.parentElement) {
    if (n instanceof SVGElement || n instanceof HTMLCanvasElement || n instanceof HTMLElement) {
      const ta = getComputedStyle(n).touchAction;
      if (ta === 'none' || ta === 'pinch-zoom') return true;
      if (scrolls(n)) return false;
    }
  }
  return false;
}

/** The nearest thing that scrolls, from here up — the page itself last. */
export function scrollerOf(el: Element | null): Element | null {
  for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) if (scrolls(n)) return n;
  const root = document.scrollingElement;
  return root && root.scrollHeight > root.clientHeight + 1 ? root : null;
}

function focusableOf(el: Element | null): HTMLElement | null {
  const f = el?.closest<HTMLElement>('input, textarea, select, button, a[href], [contenteditable=""], [contenteditable="true"], [tabindex]');
  return f ?? null;
}

type Kind = 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel' | 'pointerover' | 'pointerout';
type MKind = 'mousedown' | 'mousemove' | 'mouseup' | 'mouseover' | 'mouseout' | 'click';

function firePointer(type: Kind, el: Element, x: number, y: number, buttons: number, related: Element | null = null) {
  try {
    el.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: x,
        clientY: y,
        screenX: x,
        screenY: y,
        pointerId: HAND_POINTER_ID,
        pointerType: 'mouse',
        isPrimary: true,
        width: 1,
        height: 1,
        pressure: buttons ? 0.5 : 0,
        button: type === 'pointermove' || type === 'pointerover' || type === 'pointerout' ? -1 : 0,
        buttons,
        relatedTarget: related,
        view: window,
      })
    );
  } catch {}
}

function fireMouse(type: MKind, el: Element, x: number, y: number, buttons: number, related: Element | null = null) {
  try {
    el.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: x,
        clientY: y,
        screenX: x,
        screenY: y,
        button: 0,
        buttons,
        detail: type === 'click' ? 1 : 0,
        relatedTarget: related,
        view: window,
      })
    );
  } catch {}
}

/** A whole click where the hand pinched: down, up, click — and focus, as a mouse gives it. */
function clickAt(el: Element, x: number, y: number) {
  firePointer('pointerdown', el, x, y, 1);
  fireMouse('mousedown', el, x, y, 1);
  focusableOf(el)?.focus({ preventScroll: true });
  firePointer('pointerup', el, x, y, 0);
  fireMouse('mouseup', el, x, y, 0);
  fireMouse('click', el, x, y, 0);
}

/** A range input set where the hand is, telling React as a person dragging it would. */
function setRange(input: HTMLInputElement, x: number) {
  const r = input.getBoundingClientRect();
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const step = Number(input.step) || 1;
  const f = Math.max(0, Math.min(1, (x - r.left) / Math.max(1, r.width)));
  const raw = min + f * (max - min);
  const v = Math.max(min, Math.min(max, Math.round((raw - min) / step) * step + min));
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (String(v) === input.value) return;
  set?.call(input, String(v));
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * The driver in use. A spoken command reaches it through lib/hand-bus.ts ("click", "scroll down", "zoom in"),
 * so the app never has to load this file to act where the hand is.
 */
let current: HandDriver | null = null;

/**
 * Views that zoom on a ctrl-wheel through React's own wheel handler. React listens to the wheel passively, so
 * there the event cannot say it was used (defaultPrevented stays false); every other view that zooms takes the
 * wheel natively and says so.
 */
const ZOOMS_PASSIVELY = '.lcv-scroll, [data-hand-zoom]';

/** A pressable thing, said in a few words: its label, else its text. */
export function wordsFor(el: Element | null): string {
  if (!el) return '';
  const label = el.getAttribute('aria-label') || el.getAttribute('title') || (el as HTMLElement).innerText || el.textContent || '';
  return label.replace(/\s+/g, ' ').trim().slice(0, 80);
}

/** What the hand is doing to the page, one intent at a time. */
export class HandDriver {
  private target: Element | null = null;
  private mode: 'drag' | 'scroll' | 'range' | 'tap' | null = null;
  private start = { x: 0, y: 0 };
  private last = { x: 0, y: 0 };
  private travelled = 0;
  private scroller: Element | null = null;
  private hovered: Element | null = null;
  private hot: Element | null = null;
  private lastHover = { x: -1, y: -1 };

  constructor(private opts: { onHover?: (el: Element | null) => void } = {}) {
    installCaptureShim();
    current = this;
    registerHandPointer({ click: () => this.clickHere(), scroll: (dir) => this.scrollHere(dir), zoom: (scale) => this.zoomHere(scale) });
  }

  here() {
    const { x, y } = this.lastHover;
    if (x < 0) return null;
    const el = this.at(x, y);
    const hot = el?.closest(PRESSABLE) ?? el?.closest('[data-hand-target]') ?? el;
    return { x, y, el: hot ?? null, label: wordsFor(hot ?? null) };
  }

  clickHere(): string | null {
    const h = this.here();
    if (!h?.el) return null;
    clickAt(h.el, h.x, h.y);
    return h.label || 'that';
  }

  scrollHere(dir: 1 | -1): boolean {
    const h = this.here();
    const sc = scrollerOf(h?.el ?? document.body);
    if (!sc) return false;
    sc.scrollBy({ top: dir * Math.round(sc.clientHeight * 0.7), behavior: 'smooth' });
    return true;
  }

  /** True only when what is under the hand took the zoom — over a panel or a button, nothing zooms, and it says so. */
  zoomHere(scale: number): boolean {
    const { x, y } = this.lastHover;
    if (x < 0) return false;
    const took = this.zoom(x, y, scale);
    return took || !!this.at(x, y)?.closest(ZOOMS_PASSIVELY);
  }

  /** Under the hand: what the page would hit, ignoring anything marked as the hand's own (pointer-events: none). */
  private at(x: number, y: number): Element | null {
    return document.elementFromPoint(x, y);
  }

  private light(el: Element | null) {
    const next = el?.closest(PRESSABLE) ?? el?.closest('[data-hand-target]') ?? null;
    if (next === this.hot) return;
    this.hot?.classList.remove('hand-hot');
    next?.classList.add('hand-hot');
    this.hot = next;
  }

  apply(i: PointerIntent) {
    switch (i.kind) {
      case 'hover':
        return this.hover(i.x, i.y);
      case 'press':
        return this.press(i.x, i.y);
      case 'drag':
        return this.drag(i.x, i.y);
      case 'release':
        return this.release(i.x, i.y);
      case 'cancel':
        return this.cancel();
      case 'zoom':
        return this.zoom(i.x, i.y, i.scale);
    }
  }

  hover(x: number, y: number) {
    if (Math.abs(x - this.lastHover.x) < 1 && Math.abs(y - this.lastHover.y) < 1) return;
    this.lastHover = { x, y };
    const el = this.at(x, y);
    if (el !== this.hovered) {
      if (this.hovered) {
        firePointer('pointerout', this.hovered, x, y, 0, el);
        fireMouse('mouseout', this.hovered, x, y, 0, el);
      }
      if (el) {
        firePointer('pointerover', el, x, y, 0, this.hovered);
        fireMouse('mouseover', el, x, y, 0, this.hovered);
      }
      this.hovered = el;
      this.light(el);
      this.opts.onHover?.(el);
    }
    if (el) {
      firePointer('pointermove', el, x, y, 0);
      fireMouse('mousemove', el, x, y, 0);
    }
  }

  press(x: number, y: number) {
    const el = this.at(x, y);
    this.target = el;
    this.start = { x, y };
    this.last = { x, y };
    this.travelled = 0;
    this.scroller = null;
    if (!el) {
      this.mode = null;
      return;
    }
    if (el instanceof HTMLInputElement && el.type === 'range') {
      this.mode = 'range';
      el.focus({ preventScroll: true });
      setRange(el, x);
      return;
    }
    if (el.closest(EDITABLE)) {
      this.mode = 'tap';
      return;
    }
    if (takesDrag(el)) {
      this.mode = 'drag';
      firePointer('pointerdown', el, x, y, 1);
      fireMouse('mousedown', el, x, y, 1);
      focusableOf(el)?.focus({ preventScroll: true });
      return;
    }
    this.scroller = scrollerOf(el);
    if (this.scroller) {
      this.mode = 'scroll';
      return;
    }
    // nothing scrolls here and nothing says it drags: a plain pointer press, as a mouse would make
    this.mode = 'drag';
    firePointer('pointerdown', el, x, y, 1);
    fireMouse('mousedown', el, x, y, 1);
  }

  drag(x: number, y: number) {
    if (!this.mode) return;
    const dx = x - this.last.x;
    const dy = y - this.last.y;
    this.travelled += Math.hypot(dx, dy);
    this.last = { x, y };
    if (this.mode === 'range' && this.target instanceof HTMLInputElement) {
      setRange(this.target, x);
    } else if (this.mode === 'scroll' && this.scroller) {
      if (this.travelled > CLICK_SLOP) this.scroller.scrollBy({ left: -dx, top: -dy, behavior: 'instant' as ScrollBehavior });
    } else if (this.mode === 'drag') {
      const el = captured ?? this.at(x, y) ?? this.target;
      if (el) {
        firePointer('pointermove', el, x, y, 1);
        fireMouse('mousemove', el, x, y, 1);
      }
    }
  }

  release(x: number, y: number) {
    const el = this.target;
    const mode = this.mode;
    const click = this.travelled < CLICK_SLOP;
    if (mode === 'drag') {
      const to = captured ?? this.at(x, y) ?? el;
      if (to) {
        firePointer('pointerup', to, x, y, 0);
        fireMouse('mouseup', to, x, y, 0);
      }
      captured = null;
      if (click && el && el.isConnected) fireMouse('click', el, this.start.x, this.start.y, 0);
    } else if ((mode === 'scroll' || mode === 'tap') && click && el && el.isConnected) {
      clickAt(el, this.start.x, this.start.y);
    } else if (mode === 'range' && el instanceof HTMLInputElement) {
      setRange(el, x);
    }
    this.target = null;
    this.mode = null;
    this.scroller = null;
  }

  cancel() {
    if (this.mode === 'drag') {
      const to = captured ?? this.target;
      if (to) {
        firePointer('pointercancel', to, this.last.x, this.last.y, 0);
        fireMouse('mouseup', to, this.last.x, this.last.y, 0);
      }
    }
    captured = null;
    this.target = null;
    this.mode = null;
    this.scroller = null;
  }

  /** A trackpad pinch at a point: a ctrl-wheel. True when a view took it (it marks the wheel as used). */
  zoom(x: number, y: number, scale: number): boolean {
    const el = this.at(x, y);
    const deltaY = zoomWheelDelta(scale);
    if (!el || !deltaY) return false;
    try {
      const ev = new WheelEvent('wheel', { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, deltaX: 0, deltaY, deltaMode: 0, ctrlKey: true, view: window });
      el.dispatchEvent(ev);
      return ev.defaultPrevented;
    } catch {
      return false;
    }
  }

  /** Let go of everything: nothing left pressed, nothing left lit, real pointer capture restored. */
  dispose() {
    this.cancel();
    if (this.hovered) {
      fireMouse('mouseout', this.hovered, this.lastHover.x, this.lastHover.y, 0, null);
      this.hovered = null;
    }
    this.light(null);
    uninstallCaptureShim();
    if (current === this) {
      current = null;
      registerHandPointer(null);
    }
  }
}
