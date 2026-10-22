'use client';

// components/surfaces/Surface3D.tsx
//
// The frame every working surface sits in, and the only place the interaction
// lives.
//
// WHY A SHARED FRAME. The black hole, the Big Bang and the gravity sandbox are
// three different pictures with one set of manners: drag to turn, wheel to
// zoom, a row of control groups, a row of layer toggles, a clock, and a line
// underneath that describes what is happening without stating the conclusion.
// Written three times those manners drift, and the third one is always the one
// that forgets the keyboard. Written once, a new surface is a render function
// and a list of controls.
//
// WHAT THE FRAME OWNS: the camera, the clock, full screen, the panel's height,
// and the controls. What a surface owns: turning (camera, time, its own
// parameters) into SVG. A surface never touches the DOM and never starts a
// timer of its own, which is what makes each of them testable as a pure
// function of its inputs.

import './surfaces.css';
import type { VizEntity, VizModelState, VizOp } from '@/lib/viz-model';
import { scienceLines, type ScienceMeta } from '@/lib/model/science';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/** before paint in a browser; nothing on the server */
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export interface Cam {
  yaw: number;
  pitch: number;
  dist: number;
}

export interface SurfaceCtl {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  /** what the number means, shown at the right of the slider */
  read: (v: number) => string;
  /** plain words: what moving this does */
  help?: string;
}

export interface SurfaceGroup {
  id: string;
  label: string;
  ctls: SurfaceCtl[];
}

export interface SurfaceLayer {
  id: string;
  label: string;
  /** declared off: starts hidden */
  on?: boolean;
}

export interface RenderArgs {
  /** the viewBox, in its own units */
  W: number;
  H: number;
  cam: Cam;
  /** seconds of surface time elapsed, already scaled by the rate control */
  t: number;
  vals: Record<string, number>;
  layers: Record<string, boolean>;
  /**
   * The theme's colours as the page resolves them, for a surface that has to
   * mix its own — a shaded face is arithmetic on a colour, and a CSS variable
   * cannot be multiplied. Read from the frame itself, so a surface inside
   * `.lg-tokens` gets the tokens it is drawn among, and read again when the
   * theme changes. Absent on the server.
   */
  palette?: Palette;
}

/** The colours a surface may mix, resolved: `rgb(…)` or `#rrggbb`. */
export interface Palette {
  primary: string;
  accent: string;
  tension: string;
  ink: string;
  paper: string;
}

export const DEFAULT_PALETTE: Palette = { primary: '#354620', accent: '#264653', tension: '#9c5b3c', ink: '#23241f', paper: '#faf8f2' };

export interface SurfaceRender {
  /** everything inside the <svg> */
  content: ReactNode;
  /** bottom-left and bottom-right readouts, as plain strings */
  left?: string;
  right?: string;
  /** the line under the controls; it describes, and never concludes */
  note: string;
  /** what a screen reader is told the picture is */
  label: string;
  /**
   * The handful of facts about named objects that really are live, by entity
   * id: "2 of 6 captured", "inner edge at 3.0 r". Meaning is declared once in
   * lib/viz-semantics.ts; this is only what changes as it runs, and it is what
   * lets the conversation answer "why did that one disappear?" with what the
   * simulation recorded rather than with a plausible story.
   */
  live?: Record<string, string>;
}

/**
 * What every surface takes from whoever mounts it.
 *
 * A surface knows its own controls and their sensible defaults; a caller knows
 * where it is being put and, sometimes, what the conversation already said it
 * should start at — "a ten-solar-mass hole" is a starting value, not a new
 * control. Anything unknown is ignored and anything out of range is clamped by
 * the control itself, so a caller cannot widen a physical range by passing a
 * number through here.
 */
/**
 * Snap a float on its way into an SVG attribute.
 *
 * WHY THIS EXISTS. `Math.pow`, `Math.sin` and `Math.cbrt` are not required to
 * agree to the last bit across two V8 builds, and a server render and the
 * browser that hydrates it ARE two builds. A disc patch came out at
 * fillOpacity 0.2738210066763288 on the server and 0.27382100667632886 in the
 * page: the same number to look at, and a hydration mismatch to React, which
 * then throws away the server's markup for that subtree. Path coordinates
 * already go through `toFixed(1)` for exactly this reason — this is the same
 * discipline for everything that is not a path.
 *
 * Three decimals is far past what an opacity or a radius in viewBox units can
 * show, so the drawing loses nothing by it.
 */
export function snap(n: number, dp = 3): number {
  return Number.isFinite(n) ? Number(n.toFixed(dp)) : 0;
}

export interface SurfaceProps {
  initial?: Record<string, number>;
  fill?: boolean;
  /**
   * The seam to the conversation. The frame hands back a function that reads
   * the surface's whole state at the moment it is called — not a copy pushed
   * on every frame, because the clock ticks sixty times a second and the only
   * moment the state actually matters is the moment somebody presses send.
   */
  onRead?: (read: (() => VizModelState) | null) => void;
  /**
   * Changes asked for in words. `seq` is what makes it fire: the same batch
   * handed down twice does nothing, and a reply with no changes in it never
   * touches the picture.
   */
  ops?: { seq: number; ops: VizOp[] } | null;
}

export interface Surface3DProps {
  title: string;
  groups: SurfaceGroup[];
  layers?: SurfaceLayer[];
  /** starting values, by control id */
  initial: Record<string, number>;
  initialCam?: Cam;
  /** how far the wheel may zoom, in the model's own units */
  distRange?: [number, number];
  render: (a: RenderArgs) => SurfaceRender;
  /** surfaces with nothing moving hide the clock and the play button */
  animated?: boolean;
  /**
   * Who this surface is, for the conversation: the surface id, what each
   * rendered object means, and what the model behind it holds fixed. Declared
   * in lib/viz-semantics.ts rather than here so a reviewer can read every
   * claim the product makes about its own pictures in one file.
   */
  surface: string;
  entities?: VizEntity[];
  model?: string;
  assumptions?: string[];
  equations?: string[];
  /**
   * The model's own account of itself (lib/model/science.ts). Turned into lines
   * once, here, rather than in the render — none of it changes per frame.
   */
  science?: ScienceMeta;
  /** the document this is a revision of, when it is one — see VizModelState.edits */
  edits?: VizModelState['edits'];
  /**
   * Verbs this view supports beyond the universal ones — slicing, flattening,
   * moving through time, comparing. A surface built by hand has none of them;
   * one backed by a model (lib/model/) has all four, because they are
   * operations on the model rather than on the drawing.
   */
  can?: VizModelState['can'];
  /**
   * Ops the frame does not own, handed on rather than dropped.
   *
   * The frame applies what it holds — a control, a layer, the clock, the
   * camera — and a model-backed view owns the rest. Without this the frame
   * would either have to learn what a slice is or silently swallow one, and
   * a reply that said "sliced at y = 1" while nothing moved is the worse of
   * those two failures.
   */
  onOps?: (ops: VizOp[]) => void;
  /**
   * Fill the box it is mounted in rather than standing as a card of its own.
   * Set wherever something else has already decided the size — the Logos plot
   * lens, a workspace pane — so the surface does not draw a border inside a
   * border and ignore the height it was handed.
   */
  fill?: boolean;
  /** the host's selection, when the host owns it; the frame mirrors it and reports clicks through onSelect */
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  /** the model's clock, when the host moved it (a reply's "time 3"); the frame follows rather than overwriting it */
  time?: number;
  /** what the model says about itself that the picture's own captions do not — placeholders, assumed ranges, what is not estimated */
  notes?: string[];
  /** a line under the title: what kind of thing this is */
  subtitle?: string;
  /** at the right of the header, before the selection: the host's own controls — a model's views */
  headExtra?: ReactNode;
  /** the side panel's first section, before the controls — what is selected */
  asideTop?: ReactNode;
  /** the side panel's own sections, after the controls — a model's results and its account */
  aside?: ReactNode;
  /**
   * Whether dragging turns it and the wheel zooms it. A flat figure is neither,
   * so it is not offered the hint or the camera's tools.
   */
  turnable?: boolean;
}

// THE VIEWBOX IS THE PIXEL BOX, 1:1, and that is not a detail.
//
// A fixed 300-unit viewBox stretched to fit means the SVG's own text scales
// with the panel: 8.5 units of label is six pixels in a wide pane and twenty in
// a narrow one, so the same picture came out with readable labels beside the
// black hole and enormous ones in a column. Matching the viewBox to the real
// pixel size makes a unit a pixel everywhere — labels stay the size they were
// set, and a surface that wants something to scale scales it deliberately.

export function Surface3D({
  title,
  groups,
  layers = [],
  initial,
  initialCam = { yaw: 0.5, pitch: 0.34, dist: 15 },
  distRange = [4, 80],
  render,
  animated = true,
  fill = false,
  surface,
  entities = [],
  model = '',
  assumptions = [],
  equations = [],
  science,
  edits,
  can,
  selected: selectedProp,
  onSelect,
  time: timeProp,
  notes = [],
  subtitle,
  headExtra,
  asideTop,
  aside,
  turnable = true,
  onOps,
  onRead,
  ops = null,
}: Surface3DProps & Pick<SurfaceProps, 'onRead' | 'ops'>) {
  const [vals, setVals] = useState<Record<string, number>>(initial);
  // RE-SEEDED WHEN THE DOCUMENT MOVES. `vals` was seeded once, so when a new
  // revision arrived (a reply's edit, an undo, another document) the frame
  // kept the old handle positions and ModelView's sync wrote them straight
  // back over the revision: the document said k = 3 and the picture drew
  // k = 8. `initial` changes identity exactly when the host hands over a
  // different revision (ModelView keys it on id@version).
  const seeded = useRef(initial);
  useEffect(() => {
    if (seeded.current === initial) return;
    seeded.current = initial;
    setVals(initial);
  }, [initial]);
  const [cam, setCam] = useState<Cam>(initialCam);
  // A layer declared off starts off. Every layer began on, so "Level sets"
  // declared `on: false` drew anyway.
  const [on, setOn] = useState<Record<string, boolean>>(
    () => Object.fromEntries(layers.map((l) => [l.id, l.on !== false]))
  );
  const [group, setGroup] = useState(groups[0]?.id ?? '');
  const [t, setT] = useState(0);
  // THE HOST'S CLOCK WINS WHEN IT MOVES. A reply's "time 3" set model.time.t
  // and the frame's own `t` stayed where it was — and wrote itself back on
  // the next frame. Followed here, and only on a change the frame did not
  // make itself (its own ticks come back equal).
  const tSeen = useRef(timeProp);
  useEffect(() => {
    if (timeProp === undefined || timeProp === tSeen.current) return;
    tSeen.current = timeProp;
    setT((v) => (Math.abs(v - timeProp) > 1e-9 ? timeProp : v));
  }, [timeProp]);
  const [playing, setPlaying] = useState(animated);
  const [full, setFull] = useState(false);
  /**
   * What the reader last clicked, by entity id.
   *
   * THIS IS WHAT MAKES "what is this?" ANSWERABLE. A pronoun with nothing
   * behind it is the commonest thing anyone says to a picture, and it was the
   * one thing the conversation could not resolve. Held here, beside the state
   * it belongs to, and sent with the next message.
   */
  const [selected, setSelectedLocal] = useState<string | null>(selectedProp ?? null);
  // ONE SELECTION. The frame held its own, ModelView held `view.selected` and
  // the model held `selected`, and none of them told the others: a click on a
  // mark did not reach the inspector, a pick in the inspector did not dim the
  // picture, and "what is this?" resolved to whichever the frame last saw.
  // When a host owns the selection, the frame mirrors it and reports clicks.
  useEffect(() => {
    if (selectedProp !== undefined) setSelectedLocal(selectedProp);
  }, [selectedProp]);
  const setSelected = useCallback(
    (id: string | null) => {
      setSelectedLocal(id);
      onSelect?.(id);
    },
    [onSelect]
  );
  // The panel's own height, which the reader drags. Stored rather than derived
  // so it survives a re-render and a full-screen round trip.
  const [tall, setTall] = useState(460);

  const stage = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  // ── two fingers: a pinch is the zoom a phone has, where there is no wheel ──
  const fingers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d0: number; dist0: number } | null>(null);
  const spread2 = () => {
    const [p, q] = [...fingers.current.values()];
    return Math.hypot(p.x - q.x, p.y - q.y) || 1;
  };
  const orbit = useRef<{
    x: number;
    y: number;
    yaw: number;
    pitch: number;
    moved: number;
    /** what was under the finger when it went down — see `up` */
    hit: string | null;
  } | null>(null);
  const sizing = useRef<{ y: number; h: number } | null>(null);
  const [box, setBox] = useState({ w: 600, h: 320 });

  // ── the stage's true size, so the viewBox keeps its aspect ──
  useBeforePaint(() => {
    const el = stage.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 4 && r.height > 4) setBox({ w: r.width, h: r.height });
    };
    read();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', read);
      return () => window.removeEventListener('resize', read);
    }
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [full, tall]);

  // ── the theme's colours, for a surface that mixes its own ──
  // Read off the frame, where the tokens it is drawn among are in force, and
  // again whenever the theme changes. Only a change is a new state, so a
  // render that reads the same colours is not made twice.
  const [palette, setPalette] = useState<Palette>(DEFAULT_PALETTE);
  useBeforePaint(() => {
    const el = shell.current;
    if (!el || typeof getComputedStyle !== 'function') return;
    const read = () => {
      const cs = getComputedStyle(el);
      const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
      const next: Palette = {
        primary: v('--lg-primary', DEFAULT_PALETTE.primary),
        accent: v('--lg-accent', DEFAULT_PALETTE.accent),
        tension: v('--lg-tension', DEFAULT_PALETTE.tension),
        ink: v('--lg-ink', DEFAULT_PALETTE.ink),
        paper: v('--lg-paper', v('--lg-panel', DEFAULT_PALETTE.paper)),
      };
      setPalette((p) => ((Object.keys(next) as (keyof Palette)[]).every((k) => p[k] === next[k]) ? p : next));
    };
    read();
    if (typeof MutationObserver === 'undefined') return;
    const watch = new MutationObserver(read);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => watch.disconnect();
  }, []);

  // ── how to hold it, said once: until the first turn or zoom ──
  const [handled, setHandled] = useState(false);

  // ── the clock ──
  // Stopped under reduced motion, not merely slowed: a surface that keeps
  // moving after the system has asked it not to is not honouring the request.
  const rate = vals.rate ?? 1;
  useEffect(() => {
    if (!animated || !playing) return;
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      setT((v) => v + dt * rate);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animated, playing, rate]);

  // ── full screen ──
  // The real Fullscreen API where it exists, and a fixed overlay where it does
  // not (iOS Safari refuses it on anything but a video). Both paths set the
  // same flag, so nothing downstream has to know which one it got.
  const toggleFull = useCallback(() => {
    const el = shell.current;
    if (!el) return;
    if (!document.fullscreenElement && el.requestFullscreen) {
      el.requestFullscreen().then(() => setFull(true)).catch(() => setFull((f) => !f));
    } else if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().then(() => setFull(false)).catch(() => setFull(false));
    } else {
      setFull((f) => !f);
    }
  }, []);
  useEffect(() => {
    const sync = () => {
      if (!document.fullscreenElement) setFull(false);
    };
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  useEffect(() => {
    if (!full) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) setFull(false);
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [full]);

  // ── turning it ──
  const down = useCallback(
    (e: React.PointerEvent) => {
      // WHAT WAS CLICKED IS READ HERE, NOT ON THE CLICK.
      //
      // The stage captures the pointer so a drag that leaves the panel still
      // turns the camera — and a captured pointer retargets everything after
      // it, including the click, to the capturing element. So by the time a
      // click event arrives its target is the stage div and the mark under
      // the finger is gone. Pointerdown is the one event that still knows.
      const hit = (e.target as Element | null)?.closest?.('[data-obj]') ?? null;
      setHandled(true);
      fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (turnable && fingers.current.size === 2) {
        // the second finger down: what follows is a pinch, not a turn and not a pick
        pinch.current = { d0: spread2(), dist0: cam.dist };
        orbit.current = null;
        return;
      }
      orbit.current = {
        x: e.clientX,
        y: e.clientY,
        yaw: cam.yaw,
        pitch: cam.pitch,
        moved: 0,
        hit: hit?.getAttribute('data-obj') ?? null,
      };
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* a pointer that cannot be captured still drags; it just may escape */
      }
    },
    [cam.yaw, cam.pitch, cam.dist, turnable]
  );
  const move = useCallback((e: React.PointerEvent) => {
    if (fingers.current.has(e.pointerId)) fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pz = pinch.current;
    if (pz && fingers.current.size >= 2) {
      const k = pz.d0 / spread2();
      setCam((c) => ({ ...c, dist: Math.min(distRange[1], Math.max(distRange[0], pz.dist0 * k)) }));
      return;
    }
    const d = orbit.current;
    if (!d) return;
    // How far this press has travelled, so a turn is not also a selection.
    d.moved = Math.max(d.moved, Math.hypot(e.clientX - d.x, e.clientY - d.y));
    // a flat figure is not turned: the press is only ever a pick
    if (!turnable) return;
    setCam((c) => ({
      ...c,
      yaw: d.yaw + (e.clientX - d.x) * 0.008,
      // Clamped short of the poles: at ±π/2 the projection is edge-on and the
      // object vanishes, which reads as a bug however correct it is.
      pitch: Math.min(1.45, Math.max(-1.45, d.pitch - (e.clientY - d.y) * 0.006)),
    }));
  }, [distRange, turnable]);
  // ── letting go: a press that did not travel is a click on a thing ──
  //
  // Every surface tags its marks with `data-obj="<entity id>"`, so this is the
  // whole of the picking logic and it is the same for all of them. A press
  // that turned the camera is not a selection, and a press on empty paper
  // clears it, which is what empty paper should do.
  const up = useCallback((e: React.PointerEvent) => {
    fingers.current.delete(e.pointerId);
    if (pinch.current) {
      // a pinch ends when it is down to one finger, and that finger turns nothing until it is lifted
      if (fingers.current.size < 2) pinch.current = null;
      orbit.current = null;
      return;
    }
    const d = orbit.current;
    orbit.current = null;
    if (!d || d.moved > 4) return;
    setSelected(d.hit && entities.some((x) => x.id === d.hit) ? d.hit : null);
  }, [entities]);

  // ── zoom ──
  // Not passive: the wheel has to be claimed or the page scrolls out from
  // under the model. React's onWheel is passive by default in some builds, so
  // the listener is attached by hand.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // A READ VIEW SCROLLS. The stage claims the wheel for the camera, which
      // is right over a surface and wrong over a table of forty rows: the
      // table could never be scrolled, and the wheel zoomed a camera that has
      // nothing to look at.
      if ((e.target as Element | null)?.closest?.('.eng-read-html')) return;
      e.preventDefault();
      setHandled(true);
      setCam((c) => ({
        ...c,
        dist: Math.min(distRange[1], Math.max(distRange[0], c.dist * (e.deltaY > 0 ? 1.09 : 0.917))),
      }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [distRange]);

  // ── the keyboard, because a model only a pointer can turn is one half the
  // people who arrive cannot turn at all ──
  const onKey = useCallback(
    (e: React.KeyboardEvent) => {
      const s = e.shiftKey ? 0.28 : 0.09;
      if (e.key === 'ArrowLeft') setCam((c) => ({ ...c, yaw: c.yaw - s }));
      else if (e.key === 'ArrowRight') setCam((c) => ({ ...c, yaw: c.yaw + s }));
      else if (e.key === 'ArrowUp') setCam((c) => ({ ...c, pitch: Math.min(1.45, c.pitch + s) }));
      else if (e.key === 'ArrowDown') setCam((c) => ({ ...c, pitch: Math.max(-1.45, c.pitch - s) }));
      else if (e.key === '+' || e.key === '=') setCam((c) => ({ ...c, dist: Math.max(distRange[0], c.dist * 0.88) }));
      else if (e.key === '-') setCam((c) => ({ ...c, dist: Math.min(distRange[1], c.dist * 1.14) }));
      else if (e.key === 'f') toggleFull();
      else if (e.key === ' ') setPlaying((p) => !p);
      else return;
      e.preventDefault();
    },
    [distRange, toggleFull]
  );

  // ── dragging the panel taller ──
  const sizeDown = useCallback(
    (e: React.PointerEvent) => {
      sizing.current = { y: e.clientY, h: tall };
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* as above */
      }
      e.preventDefault();
    },
    [tall]
  );
  const sizeMove = useCallback((e: React.PointerEvent) => {
    const d = sizing.current;
    if (!d) return;
    setTall(Math.min(1400, Math.max(240, d.h + (e.clientY - d.y))));
  }, []);
  const sizeUp = useCallback(() => {
    sizing.current = null;
  }, []);

  /** the camera's own tools: a nudge in or out, and the view it started with */
  const zoomBy = useCallback(
    (k: number) => setCam((c) => ({ ...c, dist: Math.min(distRange[1], Math.max(distRange[0], c.dist * k)) })),
    [distRange]
  );
  const resetView = useCallback(() => setCam(initialCam), [initialCam]);

  const reset = useCallback(() => {
    setVals(initial);
    setCam(initialCam);
    setOn(Object.fromEntries(layers.map((l) => [l.id, l.on !== false])));
    setT(0);
    setSelected(null);
    // Deliberately NOT the panel height or full screen: those are the
    // reader's window onto the thing, not part of the thing, and having
    // "reset" collapse the panel they just enlarged is a small betrayal.
  }, [initial, initialCam, layers]);

  // ── changes asked for in words ──
  //
  // Every op has already been checked against the state that was sent (see
  // lib/viz-model.ts parseVizOps): the ids exist and the numbers are inside
  // the ranges. So this applies them and does not second-guess them — except
  // for the camera distance, whose limits belong to THIS surface and are not
  // in the state at all.
  // STARTS AT WHATEVER IS ALREADY THERE. Seeded at −1, a surface that mounted
  // with the host's last batch still in state replayed it: drag k to 2, switch
  // lens and back, and "set k 5" from three turns ago ran again — and a new
  // session's surface replayed the previous session's ops.
  const seen = useRef(ops?.seq ?? -1);
  useEffect(() => {
    if (!ops || ops.seq === seen.current) return;
    seen.current = ops.seq;
    const mine = new Set(['set', 'layer', 'select', 'play', 'pause', 'reset', 'camera']);
    const theirs = ops.ops.filter((o) => !mine.has(o.op));
    if (theirs.length) onOps?.(theirs);
    for (const op of ops.ops) {
      if (op.op === 'set') setVals((v) => ({ ...v, [op.id]: op.value }));
      else if (op.op === 'layer') setOn((o) => ({ ...o, [op.id]: op.on }));
      else if (op.op === 'select') setSelected(op.id);
      else if (op.op === 'play') setPlaying(true);
      else if (op.op === 'pause') setPlaying(false);
      else if (op.op === 'reset') reset();
      else if (op.op === 'camera') {
        setCam((c) =>
          op.field === 'dist'
            ? { ...c, dist: Math.min(distRange[1], Math.max(distRange[0], op.value)) }
            : { ...c, [op.field]: op.value }
        );
      }
    }
  }, [ops, reset, distRange, onOps]);

  const W = Math.max(140, Math.round(box.w));
  const H = Math.max(90, Math.round(box.h));
  const out = useMemo(
    () => render({ W, H, cam, t, vals, layers: on, palette }),
    [render, W, H, cam, t, vals, on, palette]
  );
  const active = groups.find((g) => g.id === group) ?? groups[0];
  const sel = selected ? entities.find((e) => e.id === selected) ?? null : null;

  // ── the state, when somebody asks for it ──
  //
  // PULLED, NOT PUSHED. The clock advances sixty times a second and a state
  // pushed up on every tick would re-render the whole chat around it for no
  // reader's benefit. What the conversation needs is the state at ONE moment —
  // the moment a message is sent — so the frame hands out a function that
  // reads the current state, and holds the pieces in a ref that every render
  // refreshes. The reply is then answering the picture as it actually stood,
  // not as it stood some number of frames ago.
  // `edits` rides in the ref rather than being captured by the callback: a
  // document's revision changes as it is edited, and a read that reported the
  // revision it opened at would tell the conversation the model is one edit
  // behind — which is exactly the kind of stale claim this whole seam exists to
  // avoid.
  // EVERYTHING THE CONVERSATION READS, BEHIND ONE REF. `read` was a stable
  // callback that closed over `entities`, `groups`, `title` and the rest from
  // the FIRST render, on the claim that they do not change for the life of a
  // surface. In ModelView they change with every revision, and the instance
  // survives a switch to another document — so the chat was told the first
  // model's title, entities and controls, and validated edits against ids
  // that no longer existed.
  const now = useRef({ vals, on, cam, t, playing, out, selected, edits, groups, entities, title, model, assumptions, equations, layers, animated, can, science, surface, initial, notes });
  useEffect(() => {
    now.current = { vals, on, cam, t, playing, out, selected, edits, groups, entities, title, model, assumptions, equations, layers, animated, can, science, surface, initial, notes };
  });
  const read = useCallback((): VizModelState => {
    const c = now.current;
    const live = c.out.live ?? {};
    const ctls = c.groups.flatMap((g) => g.ctls);
    return {
      surface: c.surface,
      title: c.title,
      model: c.model,
      assumptions: c.assumptions,
      equations: c.equations,
      ...(c.science ? { science: scienceLines(c.science) } : {}),
      ...(c.edits ? { edits: c.edits } : {}),
      entities: c.entities.map((e) => {
        const state = live[e.id];
        return state ? { ...e, state } : e;
      }),
      params: ctls.map((ctl) => {
        // A control the revision added reads the model's value, not its minimum.
        const v = c.vals[ctl.id] ?? c.initial[ctl.id] ?? ctl.min;
        return {
          id: ctl.id,
          label: ctl.label,
          value: v,
          read: ctl.read(v),
          min: ctl.min,
          max: ctl.max,
          ...(ctl.help ? { means: ctl.help } : {}),
        };
      }),
      layers: c.layers.map((l) => ({ id: l.id, label: l.label, on: c.on[l.id] !== false })),
      camera: { ...c.cam },
      ...(c.animated
        ? { clock: { t: c.t, playing: c.playing, rate: c.vals.rate ?? 1 } }
        : {}),
      // The model's own notes first: a placeholder coefficient or an assumed
      // range is the thing a reply must not misstate, and the caption cap is
      // six lines.
      readouts: [...c.notes.slice(0, 3), c.out.left, c.out.right, c.out.note].filter(Boolean) as string[],
      selected: c.selected,
      ...(c.can?.length ? { can: c.can } : {}),
    };
    // Everything read inside comes from the ref, so this function is stable —
    // which is what lets the effect below register it once instead of on
    // every frame.
  }, []);
  useEffect(() => {
    onRead?.(read);
    return () => onRead?.(null);
  }, [onRead, read]);

  const ctls = active?.ctls ?? [];
  const hasCtls = groups.some((g) => g.ctls.length > 0);
  // the share of its range a control is at, for the filled part of its track
  const share = (c: SurfaceCtl, v: number) => `${Math.round(Math.min(1, Math.max(0, (v - c.min) / (c.max - c.min || 1))) * 1000) / 10}%`;

  return (
    <div
      ref={shell}
      className={`sfx${full ? ' is-full' : ''}${fill ? ' is-fill' : ''}${turnable ? ' is-turnable' : ''}`}
      style={full || fill ? undefined : ({ ['--sfx-h' as string]: `${tall}px` })}
    >
      {/* ── THE HEADER: what this is, and the ways of looking at it ── */}
      <div className="sfx-head">
        <div className="sfx-titles">
          <h3 className="sfx-title">{title}</h3>
          {subtitle && (
            <p className="sfx-sub" title={subtitle}>
              {subtitle}
            </p>
          )}
        </div>
        <span className="sfx-head-r">
          {headExtra}
          {/* What "this" means, if they have clicked something. Said out loud
              rather than left as a highlight, because a highlight tells you
              something is selected and not what it is — and the whole point of
              selecting is to be able to ask about it by pronoun. */}
          {sel && (
            <button
              type="button"
              className="sfx-sel"
              onClick={() => setSelected(null)}
              title="Clear the selection"
            >
              <span>{sel.label}</span>
              <i aria-hidden="true">×</i>
            </button>
          )}
        </span>
      </div>
      <p className="sfx-live" aria-live="polite">
        {sel ? `Selected: ${sel.label}. ${sel.meaning}` : ''}
      </p>

      <div className="sfx-body">
        {/* ── THE FIGURE: the picture, and the camera's own tools over it ── */}
        <div className="sfx-figure">
          <div
            ref={stage}
            className="sfx-stage"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            onKeyDown={onKey}
            tabIndex={0}
            role="img"
            aria-label={out.label}
          >
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="xMidYMid meet"
              className="sfx-svg"
              // The selection is marked in one attribute and drawn by one CSS rule
              // (`[data-sel="x"] [data-obj="x"]`), so no surface has to know that
              // selection exists — it only has to say what its marks are.
              data-sel={selected ?? undefined}
            >
              {/* WHY A STYLE TAG AND NOT A CLASS. CSS cannot say "the mark whose
                  id matches the one on the svg" — it has no way to compare two
                  attributes — and the alternative is for the frame to reach into
                  every surface's rendered nodes and add a class, which would make
                  selection something each surface has to know about. One rule,
                  written for the id that is actually selected, keeps it the
                  frame's business alone. The id comes from this surface's own
                  entity list and is checked against it, so there is nothing here
                  a page could inject into. */}
              {selected && /^[\w-]+$/.test(selected) && (
                <style>{`.sfx-svg[data-sel="${selected}"] [data-obj]:not([data-obj="${selected}"]){opacity:.42}`}</style>
              )}
              {out.content}
            </svg>
          </div>
          {turnable && !handled && (
            <p className="sfx-hint" aria-hidden="true">
              <span className="sfx-hint-fine">Drag to turn · scroll to zoom</span>
              <span className="sfx-hint-touch">Drag to turn · pinch to zoom</span>
            </p>
          )}
          {/* under the picture rather than over it: the readouts, and the camera's tools */}
          <div className="sfx-bar">
            {(out.left || out.right) && (
              <div className="sfx-caps" aria-hidden="true">
                {out.left && <span className="sfx-cap">{out.left}</span>}
                {out.right && <span className="sfx-cap">{out.right}</span>}
              </div>
            )}
            <div className="sfx-tools" role="toolbar" aria-label="The view">
              {turnable && (
                <>
                  <button type="button" className="sfx-tool" onClick={resetView} aria-label="Put the view back" title="Put the view back">
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M4.5 9a5.6 5.6 0 1 1 1.6 4.3" />
                      <path d="M3.6 4.8v4.6h4.6" />
                    </svg>
                  </button>
                  <button type="button" className="sfx-tool" onClick={() => zoomBy(1.18)} aria-label="Zoom out" title="Zoom out (−)">
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M5 10h10" />
                    </svg>
                  </button>
                  <button type="button" className="sfx-tool" onClick={() => zoomBy(0.85)} aria-label="Zoom in" title="Zoom in (+)">
                    <svg viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M5 10h10M10 5v10" />
                    </svg>
                  </button>
                </>
              )}
              <button
                type="button"
                className="sfx-tool"
                onClick={toggleFull}
                aria-pressed={full}
                aria-label={full ? 'Exit full screen' : 'Full screen'}
                title={full ? 'Exit full screen (f)' : 'Full screen (f)'}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  {full ? <path d="M8 3.5V8H3.5M12 3.5V8h4.5M8 16.5V12H3.5M12 16.5V12h4.5" /> : <path d="M3.5 7.5v-4h4M12.5 3.5h4v4M16.5 12.5v4h-4M7.5 16.5h-4v-4" />}
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* ── THE SIDE: what can be moved, what can be shown, and what it all is ── */}
        <aside className="sfx-aside" aria-label="Controls">
          {asideTop}

          {hasCtls && (
            <section className="sfx-sec sfx-adjust">
              <div className="sfx-sec-h">
                <span className="sfx-sec-k">Adjust</span>
                <button type="button" className="sfx-reset" onClick={reset} title="Every control, the view and the clock back to where they started">
                  Reset all
                </button>
              </div>
              {groups.length > 1 && (
                <div className="sfx-groups" role="tablist" aria-label="Control group">
                  {groups.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      role="tab"
                      aria-selected={active?.id === g.id}
                      onClick={() => setGroup(g.id)}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="sfx-ctls">
                {ctls.map((c) => {
                  const v = vals[c.id] ?? initial[c.id] ?? c.min;
                  return (
                    <label key={c.id} className="sfx-ctl" title={c.help}>
                      <span className="sfx-ctl-row">
                        <span className="k">{c.label}</span>
                        <span className="v">{c.read(v)}</span>
                      </span>
                      <input
                        type="range"
                        min={c.min}
                        max={c.max}
                        step={c.step}
                        value={v}
                        style={{ ['--p' as string]: share(c, v) }}
                        onChange={(e) => setVals((x) => ({ ...x, [c.id]: +e.target.value }))}
                      />
                      {c.help && <span className="sfx-ctl-help">{c.help}</span>}
                    </label>
                  );
                })}
              </div>
            </section>
          )}

          {layers.length > 0 && (
            <section className="sfx-sec">
              <div className="sfx-sec-h">
                <span className="sfx-sec-k">Show</span>
              </div>
              <div className="sfx-layers">
                {layers.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    aria-pressed={!!on[l.id]}
                    onClick={() => setOn((o) => ({ ...o, [l.id]: !o[l.id] }))}
                  >
                    <i aria-hidden="true" />
                    {l.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          {animated && (
            <section className="sfx-sec sfx-transport">
              <div className="sfx-seg">
                <button type="button" className="sfx-pp" aria-pressed={playing} onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}>
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    {playing ? <path d="M7 5v10M13 5v10" /> : <path d="M7 4.8l8.2 5.2L7 15.2z" />}
                  </svg>
                  <span>{playing ? 'Pause' : 'Play'}</span>
                </button>
                <button type="button" onClick={() => setT(0)}>
                  Restart
                </button>
                {!hasCtls && (
                  <button type="button" onClick={reset}>
                    Reset all
                  </button>
                )}
              </div>
              <span className="sfx-clock">t = {t.toFixed(1)} s</span>
            </section>
          )}

          {aside}

          {out.note && <p className="sfx-note">{out.note}</p>}
        </aside>
      </div>

      {!fill && (
        <div
          className="sfx-grip"
          onPointerDown={sizeDown}
          onPointerMove={sizeMove}
          onPointerUp={sizeUp}
          onPointerCancel={sizeUp}
          role="separator"
          aria-label="Drag to resize, or use the arrow keys"
          aria-orientation="horizontal"
          tabIndex={0}
          onKeyDown={(e) => {
            const s = e.shiftKey ? 80 : 24;
            if (e.key === 'ArrowUp') setTall((h) => Math.max(240, h - s));
            else if (e.key === 'ArrowDown') setTall((h) => Math.min(1400, h + s));
            else return;
            e.preventDefault();
          }}
        >
          <i />
        </div>
      )}
    </div>
  );
}
