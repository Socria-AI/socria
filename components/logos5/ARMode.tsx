'use client';
// components/logos5/ARMode.tsx — AR MODE: the Logic Map, moved with your hands.
//
// The Logos 2 benches (the logos2-test and mind-ar pages, never linked) tried this on a toy map;
// this is it on the person's own, inside Logos 5. Nothing is rebuilt:
//
//   · the camera and the hand model are lib/hand-tracking.ts — MediaPipe from
//     jsDelivr at runtime, so the app's bundle gains nothing;
//   · a hand becomes an intention through lib/hand-gestures.ts — the poses,
//     the hysteresis, and the rule that nothing destructive happens without a
//     thumbs up (or a Confirm press);
//   · the geometry — the view, where cards start, what one frame of hands
//     does — is lib/logos5/ar.ts, pure and tested;
//   · cards start where the Logic Map's graph lens has them and are put down
//     in the same store (lib/canvas-store.ts), so a card moved here is moved
//     there; research, challenge and explore are the map's own actions
//     (onAction), and taking a card off the map is the map's own edit
//     (onEdit → lib/map-edit.ts).
//
// THE CAMERA IS NEVER ON BY ITSELF. Opening AR Mode shows the map in space and
// works with a mouse or touch at once; the camera is asked for only when a
// tester presses Start hand tracking, and is released the moment they stop or
// leave. Nobody who is not a tester is ever asked: they see a preview — their
// own map, moved by a ghost hand — and the waitlist.
//
// NOTHING LEAVES THE DEVICE. Frames are read in the browser and dropped; no
// video is recorded or uploaded.

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { LogosEdge, LogosNode, ThinkingMap } from '@/lib/logos';
import type { MapEdit } from '@/lib/map-edit';
import type { NodeMode } from '@/lib/logos-explore';
import type { ArAccess } from '@/lib/ar-access';
import { CONFIRM_WINDOW, GestureTracker, PinchTap, TwoHandTracker, type Action, type HandRead } from '@/lib/hand-gestures';
import { handSession, useHandSession, type HandFrame, type HandState } from '@/lib/hand-session';
import { HandCam, POSE_WORD, handCaption } from './HandCam';
import { findCard, type ArCommand } from '@/lib/logos5/hand-commands';
import { plainText } from '@/lib/logos5/canvas';
import {
  AR_HELP,
  AR_SAMPLE,
  HOME_VIEW,
  arStep,
  fitView,
  panBy,
  relationsOf,
  rotateAbout,
  seedPositions,
  separate,
  toScreen,
  toWorld,
  videoToStage,
  zoomAbout,
  type ArHold,
  type ArView,
  type Pt,
} from '@/lib/logos5/ar';
import { announceCanvas, isPinned, loadCanvas, pin, saveCanvas, unpin } from '@/lib/canvas-store';
import './ar-mode.css';

type MapNodeRef = { id: string; label: string; type: LogosNode['type'] };
type Camera = HandState;
type Armed = { action: Action; id: string; label: string };
type Join = { state: 'idle' | 'sending' | 'joined' | 'already' | 'error'; msg?: string };

/** The most cards AR Mode draws: a Logic Map is rarely near this; past it the stage is a crowd, not a map. */
const CARD_CAP = 160;
const WAIT_KEY = 'socria.ar.waitlist.v1';
const ACTION_WORD: Record<Action, string> = { grab: 'Move', research: 'Research', challenge: 'Challenge', delete: 'Take off the map' };

export function ARMode({
  map,
  layoutKey,
  access,
  readOnly = false,
  onClose,
  onAction,
  onEdit,
  onHands,
  command,
  onPoint,
  onArmed,
  voice,
  voiceOn = false,
  reply,
}: {
  map: ThinkingMap;
  /** the line of thinking whose card positions these are (lib/canvas-store.ts) */
  layoutKey: string | null;
  /** null while it is being asked (GET /api/ar/access) */
  access: ArAccess | null;
  /** a shared room the person may only read: cards can be arranged (that is this browser's), nothing else */
  readOnly?: boolean;
  onClose: () => void;
  onAction?: (mode: NodeMode, node: MapNodeRef) => void;
  onEdit?: (edit: MapEdit) => void;
  /** hands were started here: the app keeps them working on the rest of Logos 5 after AR Mode closes */
  onHands?: () => void;
  /** a spoken command (lib/logos5/hand-commands.ts), numbered so the same words said twice run twice */
  command?: { n: number; cmd: ArCommand } | null;
  /** the card the hand is on — else the one selected — so "this", in a question or a command, means it */
  onPoint?: (id: string | null) => void;
  /** an action waiting for a confirm, by its card's words — so a spoken "yes" can do it — or null */
  onArmed?: (label: string | null) => void;
  /** Socria Voice's button, so it can be started from here */
  voice?: React.ReactNode;
  /** Voice is listening: the confirm says "say yes" too */
  voiceOn?: boolean;
  /** Socria's latest answer, so a question asked from here is answered here */
  reply?: { id: string; text: string; pending: boolean } | null;
}) {
  const tester = !!access?.tester;
  const preview = !!access && !access.tester;
  const sample = map.nodes.length === 0;
  const nodes: LogosNode[] = useMemo(() => (sample ? AR_SAMPLE.nodes : map.nodes).slice(0, CARD_CAP), [sample, map.nodes]);
  const edges: LogosEdge[] = useMemo(() => {
    const ids = new Set(nodes.map((n) => n.id));
    return (sample ? AR_SAMPLE.edges : map.edges).filter((e) => ids.has(e.from) && ids.has(e.to));
  }, [sample, nodes, map.edges]);
  /** where cards are written: never for the sample, never in the preview */
  const keeps = tester && !sample && !!layoutKey;

  // ── the stage ─────────────────────────────────────────────────────
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const sizeRef = useRef(size);
  sizeRef.current = size;
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Positions and the view live in refs: hands and pointers move them up to sixty times a second, and
  // React is told once per frame at most (paint), never per event.
  const posRef = useRef<Record<string, Pt>>({});
  const pinnedRef = useRef<Set<string>>(new Set());
  const viewRef = useRef<ArView>({ ...HOME_VIEW });
  const fittedRef = useRef(false);
  const [, setFrame] = useState(0);
  const paintQueued = useRef(false);
  const paint = useCallback(() => {
    if (paintQueued.current) return;
    paintQueued.current = true;
    requestAnimationFrame(() => {
      paintQueued.current = false;
      setFrame((f) => (f + 1) % 1e9);
    });
  }, []);

  // Seed: the Logic Map's own arrangement, cards new since then placed where it would put them.
  const nodeSig = nodes.map((n) => n.id).join('|');
  useEffect(() => {
    // READ the Logic Map's arrangement whenever there is one — the preview shows a person their own map as
    // they left it — but WRITE it only for a tester (keepPlace). A sample has no arrangement.
    const doc = !sample && layoutKey ? loadCanvas(layoutKey) : null;
    const { pos, pinned, remembered } = seedPositions(nodes, edges, doc);
    const next: Record<string, Pt> = {};
    const fresh = new Set<string>();
    for (const n of nodes) {
      const had = posRef.current[n.id];
      next[n.id] = had ?? pos[n.id];
      if (!had && !remembered.has(n.id)) fresh.add(n.id);
    }
    // only the cards with no place yet are spread; what was placed stays where it was put
    posRef.current = separate(next, fresh);
    pinnedRef.current = pinned;
    paint();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeSig, layoutKey, sample]);
  /** what covers the stage: the bar along the top, and on a phone a panel docked across the bottom (the waitlist, the intro) */
  const insets = useCallback((): { top: number; bottom: number } => {
    const root = rootRef.current;
    const stage = stageRef.current;
    if (!root || !stage) return { top: 0, bottom: 0 };
    const sr = stage.getBoundingClientRect();
    const bar = root.querySelector('.arm-bar');
    // the preview's caption sits under the bar; it changes as the demo runs, so room is kept for it
    let top = bar ? bar.getBoundingClientRect().bottom - sr.top + (root.classList.contains('is-preview') ? 56 : 8) : 0;
    let bottom = 0;
    root.querySelectorAll('.arm-wait, .arm-intro').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > sr.width * 0.6 && r.bottom > sr.bottom - 40) bottom = Math.max(bottom, sr.bottom - r.top + 8);
    });
    top = Math.max(0, top);
    return { top, bottom };
  }, []);
  /** the person has moved the view — a later fit (access arriving) leaves it alone */
  const viewTouched = useRef(false);
  const fit = useCallback(() => {
    const { w, h } = sizeRef.current;
    viewRef.current = fitView(Object.values(posRef.current), w, h, w < 640 ? 24 : 96, insets());
    paint();
  }, [paint, insets]);
  // Fit once there is a stage to fit to…
  useEffect(() => {
    if (fittedRef.current || !size.w || !size.h || !nodes.length) return;
    fittedRef.current = true;
    fit();
  }, [size, nodes.length, fit]);
  // …and again when the answer about access brings a panel with it (the intro, the waitlist), unless the person has already moved the map
  useEffect(() => {
    if (!access || viewTouched.current || !fittedRef.current) return;
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!access, access?.tester]);

  /** Keep a card where it was put — the same pin the Logic Map's graph lens reads. */
  const keepPlace = useCallback(
    (id: string) => {
      if (!keeps) return;
      const p = posRef.current[id];
      if (!p) return;
      saveCanvas(layoutKey, pin(loadCanvas(layoutKey), 'graph', id, p.x, p.y));
      pinnedRef.current.add(id);
      announceCanvas(layoutKey);
    },
    [keeps, layoutKey]
  );
  const returnToPlace = useCallback(
    (id: string) => {
      if (!keeps) return;
      const doc = loadCanvas(layoutKey);
      if (!isPinned(doc, 'graph', id)) return;
      const next = unpin(doc, 'graph', id);
      saveCanvas(layoutKey, next);
      pinnedRef.current.delete(id);
      const settled = next.lenses.graph?.settled?.[id];
      if (settled) posRef.current = { ...posRef.current, [id]: { x: settled[0], y: settled[1] } };
      announceCanvas(layoutKey);
      paint();
    },
    [keeps, layoutKey, paint]
  );

  // ── selection, inspection, the confirm bar ─────────────────────────
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [armed, setArmed] = useState<Armed | null>(null);
  const hoverRef = useRef(hover);
  hoverRef.current = hover;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  // the card the hand is on — else the one selected — is "this" for Voice and for a question (Point & Ask)
  useEffect(() => {
    onPoint?.(hover ?? selected ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hover, selected]);
  useEffect(() => {
    onArmed?.(armed ? armed.label : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed]);
  const armedRef = useRef<Armed | null>(null);
  armedRef.current = armed;
  const [note, setNote] = useState('');
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const nodeRef = (id: string): MapNodeRef | null => {
    const n = nodesRef.current.find((x) => x.id === id);
    return n ? { id: n.id, label: n.label, type: n.type } : null;
  };

  /** Ask for an action on a card. Nothing happens until it is confirmed — by a thumbs up or the Confirm button. */
  const arm = useCallback(
    (action: Action, id: string) => {
      const n = nodesRef.current.find((x) => x.id === id);
      if (!n || !tester || sample || readOnly) return;
      setArmed({ action, id, label: n.label });
    },
    [tester, sample, readOnly]
  );
  const cancel = useCallback((why = 'Called off.') => {
    if (!armedRef.current) return;
    trackerRef.current.disarm();
    setArmed(null);
    setNote(why);
    // its bar has gone, and the focus with it: back to the dialog
    requestAnimationFrame(() => rootRef.current?.focus());
  }, []);
  const confirm = useCallback(() => {
    const a = armedRef.current;
    if (!a) return;
    setArmed(null);
    const n = nodeRef(a.id);
    if (!n) return;
    if (a.action === 'delete') {
      onEdit?.({ op: 'remove', id: a.id });
      setSelected((s) => (s === a.id ? null : s));
      setNote(`“${n.label}” is off the map.`);
      requestAnimationFrame(() => rootRef.current?.focus());
      return;
    }
    if (a.action === 'research' || a.action === 'challenge') {
      // Its findings open in the Logic Map, where the map's own panel shows them — so AR Mode steps aside.
      onAction?.(a.action, n);
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onAction, onEdit, onClose]);
  const explore = (id: string, mode: NodeMode) => {
    const n = nodeRef(id);
    if (!n || !onAction) return;
    onAction(mode, n);
    onClose();
  };

  // ── the camera and the hands (testers only, and only when asked) ────
  //
  // The camera and the model are the shared hand session (lib/hand-session.ts): AR Mode reads the same hands
  // the rest of Logos 5 does (components/logos5/HandControl.tsx), so going in and out of AR Mode neither asks
  // for the camera again nor reloads the model — and leaving AR Mode leaves the hands working on the rest of
  // the app, until Stop.
  const hands = useHandSession();
  const camera: Camera = hands.state;
  const camMsg = hands.message;
  /** the room behind the map: the session's own picture, full size */
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackerRef = useRef(new GestureTracker());
  const twoRef = useRef(new TwoHandTracker());
  const tapRef = useRef(new PinchTap(18, 450));
  const holdRef = useRef<ArHold>(null);
  /** where a card was when a hand picked it up — a pinch that put it back where it was is a select, not a move */
  const holdFrom = useRef<{ id: string; at: Pt } | null>(null);
  const [showVideo, setShowVideo] = useState(true);
  const [track, setTrack] = useState<{ hands: number; pose: string; held: { action: Action; at: number } | null; both: boolean }>({ hands: 0, pose: 'none', held: null, both: false });
  const trackSig = useRef('');
  const [cursors, setCursors] = useState<{ x: number; y: number; pinch: boolean }[]>([]);
  const noHandsSince = useRef(0);
  // No hand for a while is said, so somebody waving out of frame learns why nothing moves.
  const [, setLostTick] = useState(0);
  useEffect(() => {
    if (camera !== 'on' || track.hands > 0) return;
    const t = setTimeout(() => setLostTick((n) => n + 1), 4200);
    return () => clearTimeout(t);
  }, [camera, track.hands]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (hands.stream && v.srcObject !== hands.stream) {
      v.srcObject = hands.stream;
      void v.play().catch(() => {});
    }
    if (!hands.stream) v.srcObject = null;
  }, [hands.stream]);

  // Each frame the session reads, decided here — always by the newest version of this handler, so what a
  // gesture does (research, challenge, take off the map) goes to the map as it is now, never to a copy
  // from when the camera started.
  const onFrame = useCallback(
    (f: HandFrame) => {
      if (!stageRef.current) return;
      const { w, h } = sizeRef.current;
      const now = f.t;
      // the frame is MIRRORED already (lib/hand-session.ts), so everything here is in screen terms
      const toStage = (p: Pt) => videoToStage(p, f.video, { w, h }, false);
      const reads: HandRead[] = f.reads;
      // the hands in stage pixels, so a two-handed turn is measured on the screen's own proportions
      const inStage = reads.map((r) => ({ ...r, aim: toStage(r.aim), palm: toStage(r.palm) }));

      const out = trackerRef.current.read(reads[0] ?? null, now);
      const bothPinch = inStage.length === 2 && inStage.every((r) => r.pose === 'pinch' || r.pinch > 0.8);
      const both = bothPinch ? twoRef.current.read(inStage[0], inStage[1]) : (twoRef.current.reset(), null);
      const aim = toStage(out.aim);
      const tap = !bothPinch && reads[0] ? tapRef.current.read(out.grabbing, aim, now) : (tapRef.current.reset(), null);

      // AR Mode's own controls — Done, Fit, Stop camera, Confirm, the inspector's Research and Challenge — are
      // pressed by hand as well: over one, it is outlined, and a quick pinch clicks it instead of moving the map
      const stageBox = stageRef.current.getBoundingClientRect();
      const under = reads[0] && !bothPinch && !holdRef.current ? document.elementFromPoint(stageBox.left + aim.x, stageBox.top + aim.y) : null;
      const control = (under?.closest('button, a[href], input, select, textarea, [role="button"]') as HTMLElement | null) ?? null;
      const onControl = !!control && !control.closest('.arm-stage');
      if (hotRef.current !== (onControl ? control : null)) {
        hotRef.current?.classList.remove('hand-hot');
        hotRef.current = onControl ? control : null;
        hotRef.current?.classList.add('hand-hot');
      }
      if (onControl && tap && control) {
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(control.tagName)) control.focus();
        else control.click();
      }

      const view = viewRef.current;
      const cards = nodesRef.current.map((n) => {
        const world = posRef.current[n.id];
        const s = world ? toScreen(world, view, w, h) : { x: -9999, y: -9999 };
        return { id: n.id, x: s.x, y: s.y, world: world ?? { x: 0, y: 0 } };
      });
      // how near a hand must be to a card's middle to take it: most of a card, at the size cards are drawn
      const reach = Math.max(64, 104 * Math.max(0.6, Math.min(1.35, view.k)));
      const step = arStep(
        view,
        holdRef.current,
        { one: reads[0] && !onControl ? { aim, grabbing: out.grabbing } : null, both, tap: onControl ? null : tap },
        cards,
        w,
        h,
        reach
      );
      if (holdRef.current?.kind !== 'node' && step.hold?.kind === 'node') {
        const at = posRef.current[step.hold.id];
        holdFrom.current = at ? { id: step.hold.id, at } : null;
      }
      if (step.view !== view) viewTouched.current = true;
      viewRef.current = step.view;
      holdRef.current = step.hold;
      if (step.moved) posRef.current = { ...posRef.current, [step.moved.id]: step.moved.at };
      if (step.dropped) {
        const from = holdFrom.current;
        const at = posRef.current[step.dropped];
        if (from && from.id === step.dropped && at && Math.hypot(at.x - from.at.x, at.y - from.at.y) > 3) keepPlace(step.dropped);
        holdFrom.current = null;
      }
      if (step.select) setSelected(step.select.id);

      // what the hand is over, for the highlight — and what an armed action, or a spoken "this", is aimed at
      const overCard = !bothPinch && reads[0]
        ? cards.reduce<{ id: string; d: number } | null>((best, c) => {
            const d = Math.hypot(c.x - aim.x, c.y - aim.y);
            return d < reach && (!best || d < best.d) ? { id: c.id, d } : best;
          }, null)
        : null;
      setHover((cur) => (cur === (overCard?.id ?? null) ? cur : overCard?.id ?? null));

      if (out.justArmed) {
        if (overCard) arm(out.justArmed, overCard.id);
        else trackerRef.current.disarm();
      }
      if (out.fired) confirm();
      if (out.cancelled) cancel(out.cancelled.why === 'timeout' ? 'It gave up waiting for a thumbs up.' : 'Called off.');

      setCursors(inStage.map((r) => ({ x: r.aim.x, y: r.aim.y, pinch: r.pose === 'pinch' })));
      const sig = `${reads.length}|${out.pose}|${out.holding?.action ?? ''}${out.holding ? Math.round(out.holding.at * 20) : ''}|${bothPinch}`;
      if (sig !== trackSig.current) {
        trackSig.current = sig;
        setTrack({ hands: reads.length, pose: out.pose, held: out.holding, both: bothPinch });
      }
      if (reads.length === 0) {
        if (!noHandsSince.current) noHandsSince.current = now;
      } else noHandsSince.current = 0;
      if (step.moved || step.view !== view) paint();
    },
    [arm, cancel, confirm, keepPlace, paint]
  );
  const frameRef = useRef(onFrame);
  frameRef.current = onFrame;
  /** the control the hand is over (outlined), if any */
  const hotRef = useRef<HTMLElement | null>(null);
  useEffect(
    () => () => {
      hotRef.current?.classList.remove('hand-hot');
      hotRef.current = null;
    },
    []
  );
  useEffect(() => {
    if (!tester || camera !== 'on') return;
    noHandsSince.current = performance.now();
    const off = handSession.onFrame((f) => frameRef.current(f));
    return () => {
      off();
      trackerRef.current.reset();
      twoRef.current.reset();
      tapRef.current.reset();
      holdRef.current = null;
      holdFrom.current = null;
      setCursors([]);
      setHover(null);
      setTrack({ hands: 0, pose: 'none', held: null, both: false });
    };
  }, [tester, camera]);

  /** Start: the shared session asks for the camera — only here, only for a tester, only on their press. */
  const startHands = useCallback(() => {
    if (!tester) return;
    handSession.clear();
    void handSession.start();
    onHands?.();
  }, [tester, onHands]);
  /** Stop: the camera released and the model closed — for AR Mode and the rest of Logos 5 alike. */
  const stopHands = useCallback(() => handSession.stop(), []);

  // ── pointer, touch and wheel: the same map, without a camera ─────────
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ kind: 'card'; id: string; offset: Pt; moved: number; pid: number } | { kind: 'pan'; moved: number; pid: number } | null>(null);
  const pinch0 = useRef<{ d: number; a: number; mid: Pt } | null>(null);
  const local = (e: { clientX: number; clientY: number }): Pt => {
    const r = stageRef.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };
  const twoPointers = () => {
    const [a, b] = [...pointers.current.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
  };

  const onCardDown = (id: string) => (e: ReactPointerEvent) => {
    if (preview) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2) {
      // a second finger, wherever it lands, makes it a pinch of the whole map
      drag.current = null;
      pinch0.current = twoPointers();
      return;
    }
    if (pointers.current.size > 2) return;
    const { w, h } = sizeRef.current;
    const at = toWorld(p, viewRef.current, w, h);
    const world = posRef.current[id] ?? at;
    drag.current = { kind: 'card', id, offset: { x: world.x - at.x, y: world.y - at.y }, moved: 0, pid: e.pointerId };
  };
  const onStageDown = (e: ReactPointerEvent) => {
    if (preview) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 2) {
      drag.current = null;
      pinch0.current = twoPointers();
    } else if (!drag.current) drag.current = { kind: 'pan', moved: 0, pid: e.pointerId };
  };
  const onMove = (e: ReactPointerEvent) => {
    const before = pointers.current.get(e.pointerId);
    if (!before) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    const { w, h } = sizeRef.current;
    if (pointers.current.size === 2 && pinch0.current) {
      const now = twoPointers();
      const prev = pinch0.current;
      let v = viewRef.current;
      v = panBy(v, now.mid.x - prev.mid.x, now.mid.y - prev.mid.y);
      v = zoomAbout(v, now.d / Math.max(1, prev.d), now.mid.x, now.mid.y, w, h);
      let dr = now.a - prev.a;
      if (dr > Math.PI) dr -= 2 * Math.PI;
      if (dr < -Math.PI) dr += 2 * Math.PI;
      v = rotateAbout(v, dr, now.mid.x, now.mid.y, w, h);
      viewRef.current = v;
      viewTouched.current = true;
      pinch0.current = now;
      paint();
      return;
    }
    const d = drag.current;
    if (!d || d.pid !== e.pointerId) return;
    d.moved += Math.abs(p.x - before.x) + Math.abs(p.y - before.y);
    if (d.kind === 'card') {
      const at = toWorld(p, viewRef.current, w, h);
      posRef.current = { ...posRef.current, [d.id]: { x: at.x + d.offset.x, y: at.y + d.offset.y } };
    } else {
      viewRef.current = panBy(viewRef.current, p.x - before.x, p.y - before.y);
      viewTouched.current = true;
    }
    paint();
  };
  const onUp = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch0.current = null;
    const d = drag.current;
    if (!d || d.pid !== e.pointerId) return;
    drag.current = null;
    if (d.kind === 'card') {
      if (d.moved < 5) setSelected((s) => (s === d.id ? null : d.id));
      else keepPlace(d.id);
    } else if (d.moved < 5) setSelected(null);
  };
  // the wheel zooms about the pointer; with shift, it turns the map
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (preview) return;
      const r = el.getBoundingClientRect();
      const p = { x: e.clientX - r.left, y: e.clientY - r.top };
      const { w, h } = sizeRef.current;
      viewRef.current = e.shiftKey ? rotateAbout(viewRef.current, e.deltaY * 0.002, p.x, p.y, w, h) : zoomAbout(viewRef.current, Math.exp(-e.deltaY * 0.0015), p.x, p.y, w, h);
      viewTouched.current = true;
      paint();
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [paint, preview]);

  const zoomBy = (f: number) => {
    const { w, h } = sizeRef.current;
    viewRef.current = zoomAbout(viewRef.current, f, w / 2, h / 2, w, h);
    viewTouched.current = true;
    paint();
  };
  const turnBy = (dr: number) => {
    const { w, h } = sizeRef.current;
    viewRef.current = rotateAbout(viewRef.current, dr, w / 2, h / 2, w, h);
    viewTouched.current = true;
    paint();
  };

  /** Bring a card to the middle of the stage, as following one of its connections does. */
  const centreOn = (id: string) => {
    const p = posRef.current[id];
    if (!p || preview) return;
    const { w: W, h: H } = sizeRef.current;
    const sc = toScreen(p, viewRef.current, W, H);
    viewRef.current = panBy(viewRef.current, W / 2 - sc.x, H / 2 - sc.y);
    paint();
  };

  // ── what is said (Socria Voice, lib/logos5/hand-commands.ts) ─────────
  // "This" is the card the hand is on, else the one selected. Research, challenge and taking a card off the
  // map are ARMED, as a gesture arms them — a thumbs up, Confirm or a spoken "yes" does them.
  const lastCommand = useRef(0);
  useEffect(() => {
    if (!command || command.n === lastCommand.current) return;
    lastCommand.current = command.n;
    const c = command.cmd;
    const target = hoverRef.current ?? selectedRef.current;
    const needCard = () => setNote('Point at a card, or say “select” and its name, first.');
    switch (c.act) {
      case 'zoom':
        zoomBy(c.dir > 0 ? 1.25 : 1 / 1.25);
        return;
      case 'turn':
        turnBy((c.dir * Math.PI) / 12);
        return;
      case 'fit':
        fit();
        return;
      case 'deselect':
        setSelected(null);
        return;
      case 'select': {
        const n = findCard(nodesRef.current, c.label);
        if (!n) {
          setNote(`No card called “${c.label}” on this map.`);
          return;
        }
        setSelected(n.id);
        centreOn(n.id);
        return;
      }
      case 'research':
      case 'challenge':
        if (target) arm(c.act, target);
        else needCard();
        return;
      case 'remove':
        if (target) arm('delete', target);
        else needCard();
        return;
      case 'explore':
        if (target) explore(target, 'explore');
        else needCard();
        return;
      case 'confirm':
        if (armedRef.current) confirm();
        return;
      case 'cancel':
        cancel();
        return;
      case 'leave':
        onClose();
        return;
      case 'room':
        setShowVideo(c.shown);
        return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command]);

  // ── Socria's answer, here: a question asked from AR Mode is answered in AR Mode ───
  const replyAtOpen = useRef(reply?.id ?? null);
  const [replyShut, setReplyShut] = useState<string | null>(null);
  const showReply = !!reply && !preview && (reply.pending || reply.id !== replyAtOpen.current) && replyShut !== reply.id && !!(reply.text.trim() || reply.pending);

  // ── keyboard: every move has a key, and Esc steps back ───────────────
  //
  // Listened for on the WINDOW, first (capture), for as long as AR Mode is open. It is a dialog over the
  // whole page: Esc must work even when the focused button has just gone (Confirm takes its bar with it,
  // and focus falls to the page), and a key AR Mode uses must not ALSO reach the page under it — on the
  // canvas Esc means "back to chat", and ⌘K would open a search nobody can see.
  useEffect(() => {
    rootRef.current?.focus();
  }, []);
  const refocus = () => requestAnimationFrame(() => rootRef.current?.focus());
  const onKey = (e: KeyboardEvent) => {
    const root = rootRef.current;
    const t = e.target as HTMLElement | null;
    const inside = !!root && !!t && root.contains(t);
    // a dialog shown over AR Mode (Socria Voice's sheet) keeps its own keys: Esc, Tab, arrows
    const other = t?.closest?.('[role="dialog"], [aria-modal="true"]');
    if (other && root && other !== root && !root.contains(other)) return;
    const own = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (inside && t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) {
      // typing in the waitlist field is the field's; Esc only lets go of it
      if (e.key === 'Escape') {
        own();
        t.blur();
        refocus();
      }
      return;
    }
    if (e.key === 'Tab') {
      // focus stays in the dialog: from the page underneath, it comes back in
      if (!inside) {
        own();
        root?.focus();
      }
      return;
    }
    if (e.key === 'Escape') {
      own();
      if (armedRef.current) cancel();
      else if (selected) {
        setSelected(null);
        refocus();
      } else onClose();
      return;
    }
    // the page's own shortcuts (⌘K) wait until AR Mode is closed
    if (e.metaKey || e.ctrlKey || e.altKey) {
      if (e.key.length === 1) own();
      return;
    }
    if (preview) return;
    const { w, h } = sizeRef.current;
    const keyed: Record<string, () => void> = {
      '+': () => zoomBy(1.2),
      '=': () => zoomBy(1.2),
      '-': () => zoomBy(1 / 1.2),
      _: () => zoomBy(1 / 1.2),
      '0': () => fit(),
      '[': () => turnBy(-Math.PI / 24),
      ']': () => turnBy(Math.PI / 24),
    };
    if (keyed[e.key]) {
      own();
      keyed[e.key]();
    } else if (e.key.startsWith('Arrow')) {
      own();
      const dx = e.key === 'ArrowLeft' ? -24 : e.key === 'ArrowRight' ? 24 : 0;
      const dy = e.key === 'ArrowUp' ? -24 : e.key === 'ArrowDown' ? 24 : 0;
      if (selected && posRef.current[selected]) {
        // move the selected card by the screen's arrows, whichever way the map is turned
        const p = toScreen(posRef.current[selected], viewRef.current, w, h);
        posRef.current = { ...posRef.current, [selected]: toWorld({ x: p.x + dx, y: p.y + dy }, viewRef.current, w, h) };
        keepPlace(selected);
      } else {
        viewRef.current = panBy(viewRef.current, -dx, -dy);
        viewTouched.current = true;
      }
      paint();
    }
  };
  const keyRef = useRef(onKey);
  keyRef.current = onKey;
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, []);

  // ── the preview: their map, moved by a ghost hand ────────────────────
  const [ghost, setGhost] = useState<{ cursors: { x: number; y: number; pinch: boolean }[]; caption: string } | null>(null);
  const ghostBase = useRef<{ pos: Record<string, Pt>; view: ArView } | null>(null);
  useEffect(() => {
    if (!preview || !size.w || !nodes.length) return;
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const degree = new Map<string, number>();
    for (const e of edges) {
      degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
      degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    }
    const byDegree = [...nodes].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0));
    const a = byDegree[Math.min(1, byDegree.length - 1)];
    const b = byDegree[0];
    const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
    const lerp = (x: number, y: number, t: number) => x + (y - x) * t;
    let raf = 0;
    const t0 = performance.now();
    const LOOP = 11000;
    // the demo starts from the whole map, fitted inside what the waitlist leaves uncovered
    {
      const { w, h } = sizeRef.current;
      viewRef.current = fitView(Object.values(posRef.current), w, h, w < 640 ? 24 : 96, insets());
      ghostBase.current = null;
    }
    const frame = () => {
      const { w, h } = sizeRef.current;
      if (!ghostBase.current) ghostBase.current = { pos: { ...posRef.current }, view: { ...viewRef.current } };
      const base = ghostBase.current;
      const t = reduce ? 2600 : (performance.now() - t0) % LOOP;
      const aw = base.pos[a.id] ?? { x: 0, y: 0 };
      const aS = toScreen(aw, base.view, w, h);
      const lift = { x: Math.min(160, w * 0.18), y: -Math.min(70, h * 0.1) };
      const cur: { x: number; y: number; pinch: boolean }[] = [];
      let caption = '';
      let view = base.view;
      let carry = 0;
      let select: string | null = null;
      if (t < 1300) {
        const k = ease(t / 1300);
        cur.push({ x: lerp(w * 0.92, aS.x, k), y: lerp(h * 0.85, aS.y, k), pinch: false });
        caption = 'Reach for a card…';
      } else if (t < 3600) {
        carry = ease((t - 1500) / 1900);
        cur.push({ x: aS.x + lift.x * carry, y: aS.y + lift.y * carry, pinch: true });
        caption = 'Pinch to pick it up, and move it';
      } else if (t < 4300) {
        carry = 1;
        cur.push({ x: aS.x + lift.x, y: aS.y + lift.y, pinch: false });
        caption = 'Open your fingers to put it down';
      } else if (t < 7600) {
        carry = 1;
        const k = t < 6000 ? ease((t - 4300) / 1700) : 1 - ease((t - 6000) / 1600);
        const spread = 70 + 90 * k;
        const tilt = 0.18 * k;
        const c = { x: w / 2, y: h / 2 };
        cur.push({ x: c.x - Math.cos(tilt) * spread, y: c.y - Math.sin(tilt) * spread, pinch: true }, { x: c.x + Math.cos(tilt) * spread, y: c.y + Math.sin(tilt) * spread, pinch: true });
        view = rotateAbout(zoomAbout(base.view, 1 + 0.28 * k, c.x, c.y, w, h), tilt, c.x, c.y, w, h);
        caption = 'Pinch with both hands: pull apart to zoom, turn to rotate';
      } else if (t < 9800) {
        carry = 1;
        const bS = toScreen(base.pos[b.id] ?? { x: 0, y: 0 }, base.view, w, h);
        const k = ease((t - 7600) / 700);
        cur.push({ x: lerp(w / 2 + 160, bS.x, k), y: lerp(h / 2, bS.y, k), pinch: t > 8400 && t < 8700 });
        if (t > 8700) select = b.id;
        caption = 'A quick pinch opens a card: what it supports, and what pulls against it';
      } else {
        carry = 1 - ease((t - 9800) / 1100);
        caption = 'Join the waitlist to try it with your own hands';
      }
      posRef.current = { ...base.pos, [a.id]: toWorld({ x: aS.x + lift.x * carry, y: aS.y + lift.y * carry }, base.view, w, h) };
      viewRef.current = view;
      setSelected(select);
      setGhost({ cursors: cur, caption });
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // a new map, or the stage first measured, starts the preview again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, size.w > 0, nodeSig]);

  // ── the waitlist ──────────────────────────────────────────────────
  const [email, setEmail] = useState('');
  const [join, setJoin] = useState<Join>({ state: 'idle' });
  useEffect(() => {
    if (!access) return;
    let kept = '';
    try {
      kept = localStorage.getItem(WAIT_KEY) ?? '';
    } catch {}
    setEmail((e) => e || access.email || kept);
    if (access.waitlisted || (kept && (!access.email || kept === access.email))) setJoin({ state: 'already' });
  }, [access]);
  const submitJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (join.state === 'sending') return;
    const addr = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(addr)) {
      setJoin({ state: 'error', msg: 'That does not look like an email address.' });
      return;
    }
    setJoin({ state: 'sending' });
    try {
      const r = await fetch('/api/ar/waitlist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: addr }) });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; already?: boolean; error?: string } | null;
      if (r.ok && j?.ok) {
        try {
          localStorage.setItem(WAIT_KEY, addr.toLowerCase());
        } catch {}
        setJoin({ state: j.already ? 'already' : 'joined' });
      } else if (r.status === 429) setJoin({ state: 'error', msg: 'A lot of sign-ups from here just now. Try again in a minute.' });
      else setJoin({ state: 'error', msg: j?.error ?? 'The waitlist could not be reached. Try again in a moment.' });
    } catch {
      setJoin({ state: 'error', msg: 'You seem to be offline. Try again when you are connected.' });
    }
  };

  // ── drawing ───────────────────────────────────────────────────────
  const { w, h } = size;
  const view = viewRef.current;
  const screen = new Map<string, Pt>();
  for (const n of nodes) {
    const p = posRef.current[n.id];
    if (p) screen.set(n.id, toScreen(p, view, w, h));
  }
  const cardScale = Math.max(0.6, Math.min(1.35, view.k));
  const sel = selected ? nodes.find((n) => n.id === selected) ?? null : null;
  const rels = sel ? relationsOf(nodes, edges, sel.id) : [];
  const relIds = new Set(rels.map((r) => r.other.id));
  const carrying = holdRef.current?.kind === 'node' ? holdRef.current.id : drag.current?.kind === 'card' && drag.current.moved >= 5 ? drag.current.id : null;
  const handCursors = preview ? ghost?.cursors ?? [] : cursors;

  const status = preview
    ? sample
      ? 'A sample map, moved by a demo hand'
      : 'Your map, moved by a demo hand'
    : !access
      ? 'Checking access…'
      : camera === 'asking'
        ? 'Waiting for the camera…'
        : camera === 'loading'
          ? 'Loading hand tracking…'
          : camera === 'on'
            ? track.hands === 0
              ? 'Show a hand to the camera'
              : track.both
                ? 'Both hands: zoom and turn'
                : `${track.hands === 1 ? 'One hand' : 'Two hands'} · ${POSE_WORD[track.pose] ?? track.pose}`
            : 'Mouse and touch';
  const lost = camera === 'on' && track.hands === 0 && noHandsSince.current > 0 && performance.now() - noHandsSince.current > 4000;

  return (
    <div
      ref={rootRef}
      className={`arm${camera === 'on' && showVideo ? ' has-video' : ''}${preview ? ' is-preview' : ''}${sel ? ' has-sel' : ''}${voiceOn ? ' has-voice' : ''}${showReply ? ' has-reply' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={preview ? 'AR Mode preview' : 'AR Mode'}
      tabIndex={-1}
    >
      <video ref={videoRef} className="arm-video" playsInline muted aria-hidden="true" />

      <div
        ref={stageRef}
        className="arm-stage"
        onPointerDown={onStageDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        aria-label="The Logic Map, in space"
      >
        <svg className="arm-edges" width={w} height={h} aria-hidden="true">
          {edges.map((e) => {
            const a = screen.get(e.from);
            const b = screen.get(e.to);
            if (!a || !b) return null;
            const lit = sel && (e.from === sel.id || e.to === sel.id);
            return (
              <g key={`${e.from}>${e.to}`} className={`arm-edge is-${e.relation}${lit ? ' is-lit' : ''}${sel && !lit ? ' is-dim' : ''}`}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                {lit && (
                  <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 8} textAnchor="middle">
                    {e.relation.replace(/_/g, ' ')}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {nodes.map((n) => {
          const s = screen.get(n.id);
          if (!s) return null;
          const isSel = n.id === selected;
          const dim = !!sel && !isSel && !relIds.has(n.id);
          return (
            <div
              key={n.id}
              className={`arm-card lg-node lg-node-${n.type}${isSel ? ' is-sel' : ''}${hover === n.id || armed?.id === n.id ? ' is-aimed' : ''}${carrying === n.id ? ' is-carried' : ''}${dim ? ' is-dim' : ''}${pinnedRef.current.has(n.id) ? ' is-pinned' : ''}`}
              style={{ transform: `translate(${Math.round(s.x)}px, ${Math.round(s.y)}px) translate(-50%, -50%) scale(${carrying === n.id ? cardScale * 1.08 : cardScale})` }}
              role="button"
              tabIndex={preview ? -1 : 0}
              aria-pressed={isSel}
              aria-label={`${n.type}: ${n.label}`}
              onPointerDown={onCardDown(n.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelected((x) => (x === n.id ? null : n.id));
                }
              }}
            >
              <span className="lg-node-type">{n.type.replace(/_/g, ' ')}</span>
              <span className="lg-node-label">{n.label}</span>
            </div>
          );
        })}

        {handCursors.map((c, i) => (
          <span key={i} className={`arm-hand${c.pinch ? ' is-pinch' : ''}`} style={{ transform: `translate(${Math.round(c.x)}px, ${Math.round(c.y)}px)` }} aria-hidden="true">
            {i === 0 && track.held && !preview && (
              <svg viewBox="0 0 40 40">
                <circle className="arm-hold" cx="20" cy="20" r="17" strokeDasharray={`${track.held.at * 107} 107`} />
              </svg>
            )}
          </span>
        ))}
      </div>

      <header className="arm-bar">
        <div className="arm-title">
          <strong>AR Mode</strong>
          <span className="arm-badge">{preview ? 'Preview' : 'Early access'}</span>
          <span className="arm-status" role="status" aria-live="polite">
            {status}
          </span>
        </div>
        <div className="arm-tools">
          {tester &&
            (camera === 'on' || camera === 'loading' || camera === 'asking' ? (
              <button type="button" className="arm-btn" onClick={stopHands}>
                Stop camera
              </button>
            ) : (
              <button type="button" className="arm-btn is-primary" onClick={() => void startHands()}>
                Start hand tracking
              </button>
            ))}
          {tester && camera === 'on' && (
            <button type="button" className="arm-btn" aria-pressed={showVideo} onClick={() => setShowVideo((s) => !s)} title="The camera's picture, full size, behind the map">
              {showVideo ? 'Hide room' : 'Show room'}
            </button>
          )}
          {!preview && (
            <span className="arm-seg" role="group" aria-label="View">
              <button type="button" onClick={() => zoomBy(1 / 1.2)} aria-label="Zoom out">−</button>
              <button type="button" onClick={() => zoomBy(1.2)} aria-label="Zoom in">+</button>
              <button type="button" onClick={() => turnBy(-Math.PI / 12)} aria-label="Turn left">⟲</button>
              <button type="button" onClick={() => turnBy(Math.PI / 12)} aria-label="Turn right">⟳</button>
              <button type="button" onClick={fit} aria-label="Fit the map">Fit</button>
            </span>
          )}
          {tester && voice ? <span className="arm-voice">{voice}</span> : null}
          <button type="button" className="arm-btn" onClick={onClose} aria-label="Leave AR Mode">
            Done
          </button>
        </div>
      </header>

      {tester && (
        <HandCam
          placement="ar"
          caption={track.both ? 'Both hands · zoom and turn' : handCaption(track.hands, track.pose, false)}
          live={track.hands > 0}
        />
      )}
      {(camMsg || lost || note) && !preview && (
        <p className={`arm-note${camera === 'error' || camera === 'unsupported' ? ' is-warn' : ''}`} role="status">
          {camMsg || (lost ? 'No hand in view. Hold one up, palm towards the screen, about an arm’s length away — good light helps.' : note)}
        </p>
      )}

      {tester && camera === 'off' && !camMsg && (
        <div className="arm-intro">
          <p>
            <b>Move your Logic Map with your hands.</b> Start hand tracking and your camera turns on — only then, and only
            until you stop. The video stays on this device. Or drag, scroll and pinch with the mouse or touch.
          </p>
          <ul className="arm-keys">
            {AR_HELP.slice(0, 4).map((k) => (
              <li key={k.gesture}>
                <b>{k.gesture}</b> {k.does}
              </li>
            ))}
          </ul>
        </div>
      )}

      {sample && !preview && <p className="arm-sample">A sample map — nothing on this line of thinking’s Logic Map yet.</p>}

      {showReply && reply && (
        <aside className="arm-reply" aria-label="Socria’s answer">
          <header className="arm-reply-h">
            <b>Socria</b>
            {reply.pending ? <span className="arm-reply-s">answering…</span> : null}
            <button type="button" className="arm-x" onClick={() => setReplyShut(reply.id)} aria-label="Hide the answer">
              ×
            </button>
          </header>
          <p className="arm-reply-t" aria-live="polite">
            {plainText(reply.text).slice(0, 1200) || '…'}
          </p>
        </aside>
      )}

      {sel && (
        <aside className="arm-inspect" aria-label={`About ${sel.label}`}>
          <button
            type="button"
            className="arm-x"
            onClick={() => {
              setSelected(null);
              refocus();
            }}
            aria-label="Close"
          >
            ×
          </button>
          <span className={`arm-kind lg-node-${sel.type}`}>
            <span className="lg-node-type">{sel.type.replace(/_/g, ' ')}</span>
            {sel.status && sel.status !== 'open' ? <span className="arm-state">{sel.status}</span> : null}
            {sel.origin === 'socria' ? <span className="arm-state">Socria’s suggestion</span> : null}
          </span>
          <h2>{sel.label}</h2>
          {sel.note && <p className="arm-insp-note">{sel.note}</p>}
          {rels.length ? (
            <ul className="arm-rels">
              {rels.map((r, i) => (
                <li key={`${r.other.id}-${i}`} className={`is-${r.relation}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(r.other.id);
                      const p = posRef.current[r.other.id];
                      if (p && !preview) {
                        const { w: W, h: H } = sizeRef.current;
                        const s = toScreen(p, viewRef.current, W, H);
                        viewRef.current = panBy(viewRef.current, W / 2 - s.x, H / 2 - s.y);
                        paint();
                      }
                    }}
                  >
                    <em>{r.phrase}</em> {r.other.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="arm-insp-note">Nothing on the map connects to this yet.</p>
          )}
          {tester && !sample && !readOnly && (
            <div className="arm-acts">
              <button type="button" className="arm-btn" onClick={() => explore(sel.id, 'explore')}>
                Explore
              </button>
              <button type="button" className="arm-btn" onClick={() => arm('challenge', sel.id)}>
                Challenge
              </button>
              <button type="button" className="arm-btn" onClick={() => arm('research', sel.id)}>
                Research
              </button>
              {pinnedRef.current.has(sel.id) && (
                <button type="button" className="arm-btn" onClick={() => returnToPlace(sel.id)}>
                  Return to its place
                </button>
              )}
              <button type="button" className="arm-btn is-quiet" onClick={() => arm('delete', sel.id)}>
                Take off the map
              </button>
            </div>
          )}
        </aside>
      )}

      {armed && (
        <div className={`arm-confirm${armed.action === 'delete' ? ' is-del' : ''}`} role="alertdialog" aria-label={`${ACTION_WORD[armed.action]} “${armed.label}”?`}>
          <span className="arm-confirm-t">
            <b>{ACTION_WORD[armed.action]}</b> “{armed.label}”?
          </span>
          <span className="arm-confirm-h">
            {camera === 'on' ? 'Thumbs up to confirm · open hand to cancel' : 'Nothing has happened yet'}
            {voiceOn ? ' · or say “yes”' : ''}
            {armed.action !== 'delete' ? ' · opens in the Logic Map' : ''}
          </span>
          <span className="arm-confirm-b">
            <button type="button" className="arm-btn is-primary" onClick={confirm}>
              Confirm
            </button>
            <button type="button" className="arm-btn" onClick={() => cancel()}>
              Cancel
            </button>
          </span>
          <i className="arm-confirm-clock" style={{ animationDuration: `${CONFIRM_WINDOW}ms` }} />
        </div>
      )}

      {preview && (
        <>
          {ghost?.caption && (
            <p className="arm-caption" aria-hidden="true">
              {ghost.caption}
            </p>
          )}
          <section className="arm-wait" aria-label="AR Mode early access">
            <span className="arm-wait-k">Early access</span>
            <h2>Move your thinking with your hands</h2>
            <p>
              AR Mode turns your Logic Map into something you can pick up: pinch a card to move it, pull the map apart
              with both hands, and open any idea to see what supports it and what pulls against it. It uses your
              webcam, and the video never leaves your device. We are letting testers in a few at a time.
            </p>
            {sample && <p className="arm-wait-fine">The map behind this is a sample. Yours will be your own.</p>}
            {join.state === 'joined' || join.state === 'already' ? (
              <p className="arm-wait-done" role="status">
                {join.state === 'joined' ? 'You’re on the list. We’ll email you when it’s your turn.' : 'You’re already on the list — we’ll email you when it’s your turn.'}
              </p>
            ) : (
              <form className="arm-wait-form" onSubmit={submitJoin}>
                <label htmlFor="arm-wait-email" className="arm-sr">
                  Email
                </label>
                <input
                  id="arm-wait-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (join.state === 'error') setJoin({ state: 'idle' });
                  }}
                  required
                />
                <button type="submit" className="arm-btn is-primary" disabled={join.state === 'sending'}>
                  {join.state === 'sending' ? 'Joining…' : 'Join the waitlist'}
                </button>
              </form>
            )}
            {join.state === 'error' && (
              <p className="arm-wait-err" role="alert">
                {join.msg}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
