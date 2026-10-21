'use client';
// components/logos5/UniverseSky.tsx — the Universal Map, drawn.
//
// Every conversation a node, laid out by lib/logos5/spatial.ts for the lens
// the person chose: a hub is a star with its name and kind beside it; a quick
// question a small ambient dot, named when pointed at. Clusters are named over
// their stars; inside one, the hubs are joined in the order they were begun;
// an idea conversations share is named between them, with a dotted line to
// each — across subjects too. Changing the lens moves the stars to their new
// places rather than redrawing them, so it can be seen where each went.
//
// Moving about is the Logic Map's (lib/canvas.ts): drag the empty map, pinch
// or ⌘/Ctrl-scroll to zoom, scroll to move. By subject the person arranges:
// drag a star anywhere — into another cluster to give it that subject, into a
// Project to file it — drag a cluster by its name to move all of it; shift-drag
// (or Select) to choose several; double-click the map to write a note. On a
// touch screen a press-and-hold picks a star up, so a plain drag still moves
// the map. Today and By week are arranged by time; there a drag moves the map.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { cameraTransform, fitCamera, isDrag, keepInView, pinchCamera, readWheel, toWorld, zoomAt, KEY_PAN, type Camera } from '@/lib/canvas';
import { boxAround, detailAt, freshness, nearestWay, noteBox, type Box, type Match, type SharedIdea, type Tile } from '@/lib/logos5/universe';
import { clusterAt, hashOf, nodeBox, placeSkyIdeas, skyLayout, snapToCell, PROJECT_COLOR_KEYS, type Homes, type SkyCluster, type SkyLens, type SkyNode } from '@/lib/logos5/spatial';
import type { Arrangement } from '@/lib/logos5/arrange';
import { MadeMark, StarMark, kindLine, tileSaid } from './UniverseParts';

export interface SkyActs {
  onSelect: (ids: string[], add?: boolean) => void;
  /** a star pressed: its card, beside where it is on screen */
  onPreview: (id: string | null, at: DOMRect | null) => void;
  onOpen: (id: string) => void;
  /**
   * stars put down (By subject): each in a cluster — its own, or another it
   * was dropped into — at a place relative to that cluster's origin, and
   * where it was (fx, fy) in its own; with every other star still in its
   * cluster's order (`others`), where it is now, so it can stay there
   */
  onDrop: (moves: Drop[], others: Kept[]) => void;
  onMoveCluster: (key: string, dx: number, dy: number) => void;
  onFold: (key: string, folded: boolean) => void;
  onRename?: (key: string, name: string) => void;
  onColor?: (key: string, color: string) => void;
  /** a subject read from the conversations, made a Project with them in it */
  onMakeProject?: (key: string) => void;
  /** what is shown in a Project for its subject, filed in it */
  onFileSuggested?: (key: string) => void;
  /** a note begun at a point on the map */
  onNote: (x: number, y: number) => void;
  onNoteEdit: (id: string, text: string) => void;
  onNoteMove: (id: string, x: number, y: number) => void;
  /** in link mode: the star pressed is the other end */
  onLinkTo: (id: string) => void;
  /** a ↩ pressed: the conversation of its subject from before, found in time */
  onBack?: (id: string) => void;
  /** a link's words changed; null takes the link away */
  onLinkEdit: (id: string, label: string | null) => void;
}

export interface Drop {
  id: string;
  to: string;
  x: number;
  y: number;
  /** where it was, relative to its own cluster's origin */
  fx: number;
  fy: number;
}
export interface Kept {
  id: string;
  g: string;
  x: number;
  y: number;
}

type Drag =
  | { kind: 'nodes'; ids: string[]; dx: number; dy: number; over: string | null }
  | { kind: 'cluster'; key: string; dx: number; dy: number }
  | { kind: 'note'; id: string; dx: number; dy: number }
  | { kind: 'lasso'; x0: number; y0: number; x1: number; y1: number };

type Target = { kind: 'canvas' } | { kind: 'node'; id: string } | { kind: 'cluster'; key: string } | { kind: 'note'; id: string };

interface Gesture {
  target: Target;
  sx: number;
  sy: number;
  cam0: Camera;
  moved: boolean;
  /** a touch held long enough to pick something up */
  held: boolean;
  touch: boolean;
  lasso: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  pinch?: { a0: { x: number; y: number }; b0: { x: number; y: number } };
}

/** the bar over the map, which nothing is fitted under */
const BAR = 64;

const css = (vars: Record<string, string | number>): CSSProperties => vars as unknown as CSSProperties;
/** A colour key as the theme draws it. */
export const colorVar = (key: string | null | undefined) => (key ? `var(--sc-${key})` : 'var(--sc-none)');

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Oct 5" */
export const shortDate = (at: number) => {
  const d = new Date(at);
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
};

export function SkyCanvas({
  lens,
  tiles,
  tileById,
  homes,
  ideas,
  arr,
  now,
  activeId,
  resumeId,
  selected,
  matchOf,
  linkFrom,
  editNote,
  setEditNote,
  selectMode,
  fitKey,
  centerRef,
  top = BAR,
  narrow = false,
  keepEmpty = true,
  backOf,
  fromTop = false,
  acts,
}: {
  lens: SkyLens;
  /** the conversations shown */
  tiles: readonly Tile[];
  tileById: Map<string, Tile>;
  homes: Homes;
  /** the ideas the shown conversations share */
  ideas: readonly SharedIdea[];
  arr: Arrangement;
  now: number;
  activeId: string | null;
  resumeId: string | null;
  selected: string[];
  /** with a search: what each conversation matched, or null for nothing */
  matchOf: ((id: string) => Match | null) | null;
  linkFrom: string | null;
  editNote: string | null;
  setEditNote: (id: string | null) => void;
  /** dragging the map chooses instead of moving it (for touch) */
  selectMode: boolean;
  /** changes when the map should be fitted again */
  fitKey: number;
  /** told where the middle of the view is, on the map — for a note begun from a menu */
  centerRef?: React.MutableRefObject<{ x: number; y: number }>;
  /** how much of the top the bar over the map covers */
  top?: number;
  narrow?: boolean;
  /** by subject: an empty Project drawn too (all of it), or left out (one week) */
  keepEmpty?: boolean;
  /** a conversation's subject from before this stretch: the last of it, for a ↩ beside its first here */
  backOf?: ReadonlyMap<string, { id: string; at: number }>;
  /** fitted under the bar rather than in the middle: a week's map is read from its name down */
  fromTop?: boolean;
  acts: SkyActs;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [cam, setCamState] = useState<Camera>({ x: 0, y: 0, k: 1 });
  const camRef = useRef(cam);
  const setCam = useCallback((c: Camera) => {
    camRef.current = c;
    setCamState(c);
  }, []);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [lit, setLit] = useState<string[] | null>(null);
  const [palette, setPalette] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ key: string; name: string } | null>(null);
  const [linkEdit, setLinkEdit] = useState<{ id: string; label: string } | null>(null);
  const [noteText, setNoteText] = useState('');
  const [moving, setMoving] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const lastTap = useRef<{ id: string; t: number } | null>(null);
  const subject = lens === 'subject';

  const layout = useMemo(
    () => skyLayout({ lens, tiles, homes, ideas, arr: { pins: arr.pins, frames: arr.frames, order: arr.order, sort: arr.sort, display: arr.display }, now, narrow, keepEmpty }),
    [lens, tiles, homes, ideas, arr.pins, arr.frames, arr.order, arr.sort, arr.display, now, narrow, keepEmpty]
  );
  // today's ring already says why each is there, so the shared ideas are drawn on the other two
  const placed = useMemo(() => (arr.display.ideas && lens !== 'today' ? placeSkyIdeas(ideas, layout) : []), [arr.display.ideas, lens, ideas, layout]);
  const notes = subject ? arr.notes : [];
  const content = useMemo<Box>(() => boxAround([layout.bounds, ...notes.map(noteBox), ...placed]), [layout.bounds, notes, placed]);
  const detail = arr.display.labels === 'minimal' ? 'far' : detailAt(cam.k);
  const sel = useMemo(() => new Set(selected), [selected]);
  const starred = useMemo(() => new Set(arr.starred), [arr.starred]);
  const clusterOf = useMemo(() => new Map(layout.clusters.map((c) => [c.key, c])), [layout.clusters]);

  // what is joined to what: a star's neighbours, lit when it is pointed at
  const near = useMemo(() => {
    const m = new Map<string, Set<string>>();
    const join = (a: string, b: string) => {
      m.set(a, (m.get(a) ?? new Set()).add(b));
      m.set(b, (m.get(b) ?? new Set()).add(a));
    };
    for (const [a, b] of layout.chains) join(a, b);
    for (const i of placed) for (const x of i.members) for (const y of i.members) if (x < y) join(x, y);
    for (const n of layout.nodes) if (n.via) join(n.id, n.via.id);
    for (const l of arr.links) join(l.a, l.b);
    return m;
  }, [layout, placed, arr.links]);
  const litSet = useMemo(() => {
    if (lit) return new Set(lit);
    if (hover && !drag) return new Set([hover, ...(near.get(hover) ?? [])]);
    return null;
  }, [lit, hover, drag, near]);

  // ── the viewport ──
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);

  const fitNow = useCallback(() => {
    const target = layout.focus.w ? layout.focus : content;
    if (!size.w || !size.h || !target.w) return;
    const few = layout.nodes.length <= 4;
    const c = fitCamera(target, size.w, size.h, { pad: narrow ? 14 : 40, insets: { top, right: 0, bottom: 12, left: 0 }, maxK: few ? 1.3 : 1.1, minK: narrow ? 0.46 : 0.3, align: narrow ? 'start' : 'center' });
    // a phone reads from the top; so does a week, from its name down
    setCam(narrow || fromTop ? { ...c, y: top + (narrow ? 12 : 24) - target.y * c.k } : c);
  }, [size.w, size.h, layout.focus, layout.nodes.length, content, setCam, top, narrow, fromTop]);
  const fitted = useRef<string>('');
  /** the person has moved or zoomed the map since it was last fitted */
  const touched = useRef(false);
  useEffect(() => {
    const want = `${fitKey}|${lens}`;
    if (fitted.current === want || !size.w || !content.w) return;
    const lensChanged = !!fitted.current && fitted.current.split('|')[1] !== lens;
    fitted.current = want;
    touched.current = false;
    if (lensChanged) setMoving(true);
    fitNow();
  }, [fitKey, lens, size.w, content.w, fitNow]);
  // the room changed (the list opened beside it, the window was resized): fitted again, unless the person has moved it themselves
  const fittedSize = useRef({ w: 0, h: 0 });
  useEffect(() => {
    const was = fittedSize.current;
    fittedSize.current = size;
    if (!was.w || touched.current || !fitted.current) return;
    if (Math.abs(was.w - size.w) > 40 || Math.abs(was.h - size.h) > 40) fitNow();
  }, [size, fitNow]);
  useEffect(() => {
    if (!moving) return;
    const t = setTimeout(() => setMoving(false), 720);
    return () => clearTimeout(t);
  }, [moving]);

  const keep = useCallback((c: Camera) => keepInView(c, content.w ? content : null, size.w, size.h, 90), [content, size.w, size.h]);
  if (centerRef) centerRef.current = toWorld(cam, size.w / 2, (size.h + top) / 2);

  // the wheel: zoom where the pointer is, move where the trackpad goes (as on the Logic Map)
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  wheelRef.current = (e: WheelEvent) => {
    if ((e.target as Element | null)?.closest?.('.l5h-palette, textarea, input')) return;
    e.preventDefault();
    acts.onPreview(null, null);
    touched.current = true;
    const it = readWheel(e);
    const r = box.current!.getBoundingClientRect();
    const c = camRef.current;
    setCam(keep(it.kind === 'zoom' ? zoomAt(c, c.k * it.factor, e.clientX - r.left, e.clientY - r.top) : { ...c, x: c.x + it.dx, y: c.y + it.dy }));
  };
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const on = (e: WheelEvent) => wheelRef.current(e);
    el.addEventListener('wheel', on, { passive: false });
    return () => el.removeEventListener('wheel', on);
  }, []);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const world = (e: { clientX: number; clientY: number }) => {
    const p = local(e);
    return toWorld(camRef.current, p.x, p.y);
  };

  /** A star's place on screen, for its card. */
  const screenRect = (id: string): DOMRect | null => {
    const el = box.current?.querySelector(`[data-node="${CSS.escape(id)}"] .l5n-label`) ?? box.current?.querySelector(`[data-node="${CSS.escape(id)}"] .l5n-star`);
    return el ? el.getBoundingClientRect() : null;
  };

  /** Bring a star into view if it is not. */
  const reveal = (n: SkyNode) => {
    const c = camRef.current;
    const b = nodeBox(n);
    const sx = b.x * c.k + c.x;
    const sy = b.y * c.k + c.y;
    const margin = 40;
    if (sx >= margin && sy >= top + margin / 2 && sx + b.w * c.k <= size.w - margin && sy + b.h * c.k <= size.h - margin) return;
    setCam({ ...c, x: size.w / 2 - n.x * c.k, y: (size.h + top) / 2 - n.y * c.k });
  };

  // ── pressing, dragging, letting go ──
  const targetOf = (el: Element): Target | null => {
    if (el.closest('[data-control], input, textarea, .l5h-zoom, .l5h-linklabel button')) return null;
    const n = el.closest('[data-node]');
    if (n) return { kind: 'node', id: n.getAttribute('data-node')! };
    const h = el.closest('[data-chead]');
    if (h) return { kind: 'cluster', key: h.getAttribute('data-chead')! };
    const t = el.closest('[data-note]');
    if (t) return { kind: 'note', id: t.getAttribute('data-note')! };
    return { kind: 'canvas' };
  };

  const endGesture = () => {
    const g = gesture.current;
    if (g?.timer) clearTimeout(g.timer);
    gesture.current = null;
    setDrag(null);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const target = targetOf(e.target as Element);
    if (!target) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      // two fingers: zoom and move, whatever the first one was doing
      const [a, b] = [...pointers.current.values()];
      if (gesture.current?.timer) clearTimeout(gesture.current.timer);
      setDrag(null);
      gesture.current = { target: { kind: 'canvas' }, sx: 0, sy: 0, cam0: camRef.current, moved: true, held: false, touch: true, lasso: false, timer: null, pinch: { a0: a, b0: b } };
      return;
    }
    const touch = e.pointerType !== 'mouse';
    const g: Gesture = { target, sx: e.clientX, sy: e.clientY, cam0: camRef.current, moved: false, held: !touch, touch, lasso: target.kind === 'canvas' && (e.shiftKey || selectMode), timer: null };
    if (touch && target.kind !== 'canvas') {
      // held still for a moment, it is picked up; moved first, the map moves
      g.timer = setTimeout(() => {
        if (gesture.current === g && !g.moved) {
          g.held = true;
          box.current?.classList.add('is-holding');
        }
      }, 380);
    }
    gesture.current = g;
    // the pointer is held by the map only once a drag begins, so a click or a double-click still lands where it was aimed
  };

  const canMove = (t: Target): boolean => {
    if (t.kind === 'node') return subject && !!layout.byId.get(t.id) && !layout.byId.get(t.id)!.folded;
    if (t.kind === 'cluster') return !!clusterOf.get(t.key)?.movable;
    return t.kind === 'note';
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) {
      return;
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.pinch) {
      const pts = [...pointers.current.values()];
      if (pts.length < 2) return;
      const r = box.current!.getBoundingClientRect();
      const off = (p: { x: number; y: number }) => ({ x: p.x - r.left, y: p.y - r.top });
      touched.current = true;
      setCam(keep(pinchCamera(g.cam0, off(g.pinch.a0), off(g.pinch.b0), off(pts[0]), off(pts[1]))));
      return;
    }
    const dx = e.clientX - g.sx;
    const dy = e.clientY - g.sy;
    if (!g.moved) {
      if (!isDrag(dx, dy, e.pointerType)) return;
      g.moved = true;
      box.current?.setPointerCapture?.(e.pointerId);
      if (g.timer) clearTimeout(g.timer);
      // on a touch screen, a drag that did not wait to pick something up moves the map — and so does anything the lens keeps in place
      if ((!g.held && g.target.kind !== 'canvas') || !canMove(g.target)) g.target = { kind: 'canvas' };
      // the card beside a star belongs to where it was: anything moving puts it away
      acts.onPreview(null, null);
      setHover(null);
    }
    const k = camRef.current.k;
    const t = g.target;
    if (t.kind === 'canvas') {
      if (g.lasso) {
        const a = local({ clientX: g.sx, clientY: g.sy });
        const b = local(e);
        setDrag({ kind: 'lasso', x0: a.x, y0: a.y, x1: b.x, y1: b.y });
      } else {
        touched.current = true;
        setCam(keep({ ...g.cam0, x: g.cam0.x + dx, y: g.cam0.y + dy }));
      }
    } else if (t.kind === 'node') {
      const ids = sel.has(t.id) ? selected.filter((id) => layout.byId.get(id) && !layout.byId.get(id)!.folded) : [t.id];
      const w = world(e);
      const c = clusterAt(layout.clusters, w.x, w.y);
      setDrag({ kind: 'nodes', ids, dx: dx / k, dy: dy / k, over: c?.key ?? null });
    } else if (t.kind === 'cluster') setDrag({ kind: 'cluster', key: t.key, dx: dx / k, dy: dy / k });
    else if (t.kind === 'note') setDrag({ kind: 'note', id: t.id, dx: dx / k, dy: dy / k });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    box.current?.classList.remove('is-holding');
    const g = gesture.current;
    if (!g) return;
    if (g.pinch) {
      if (!pointers.current.size) endGesture();
      return;
    }
    const d = drag;
    endGesture();
    if (!g.moved) {
      if (g.target.kind === 'node') pressNode(g.target.id, e);
      else if (g.target.kind === 'canvas') {
        acts.onSelect([]);
        acts.onPreview(null, null);
        setPalette(null);
      }
      return;
    }
    if (!d) return;
    if (d.kind === 'nodes') {
      const moves: Drop[] = [];
      for (const id of d.ids) {
        const n = layout.byId.get(id);
        if (!n) continue;
        const to = d.over ?? n.g;
        const f = clusterOf.get(to);
        const own = clusterOf.get(n.g);
        if (!f || !own) continue;
        let x = n.x + d.dx - f.origin.x;
        let y = n.y + d.dy - f.origin.y;
        if (arr.display.snap) ({ x, y } = snapToCell(f, x, y, n.hub));
        moves.push({ id, to, x: Math.round(x), y: Math.round(y), fx: Math.round(n.x - own.origin.x), fy: Math.round(n.y - own.origin.y) });
      }
      // the rest, where they are now: moving one of them moves none of the others
      const others: Kept[] = layout.nodes
        .filter((n) => !n.pinned && !n.folded && !d.ids.includes(n.id) && clusterOf.get(n.g)?.movable)
        .map((n) => {
          const f = clusterOf.get(n.g)!;
          return { id: n.id, g: n.g, x: Math.round(n.x - f.origin.x), y: Math.round(n.y - f.origin.y) };
        });
      if (moves.length) acts.onDrop(moves, others);
    } else if (d.kind === 'cluster') {
      const step = arr.display.snap ? 24 : 1;
      acts.onMoveCluster(d.key, Math.round(d.dx / step) * step, Math.round(d.dy / step) * step);
    } else if (d.kind === 'note') {
      const n = arr.notes.find((x) => x.id === d.id);
      if (n) acts.onNoteMove(n.id, n.x + d.dx, n.y + d.dy);
    } else if (d.kind === 'lasso') {
      const c = camRef.current;
      const a = toWorld(c, Math.min(d.x0, d.x1), Math.min(d.y0, d.y1));
      const b = toWorld(c, Math.max(d.x0, d.x1), Math.max(d.y0, d.y1));
      const ids = layout.nodes.filter((n) => !n.folded && n.x > a.x && n.x < b.x && n.y > a.y && n.y < b.y).map((n) => n.id);
      acts.onSelect(ids, e.shiftKey);
    }
  };

  const pressNode = (id: string, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
    if (linkFrom) return acts.onLinkTo(id);
    if (e.shiftKey || e.metaKey || e.ctrlKey) return acts.onSelect([id], true);
    const t = Date.now();
    if (lastTap.current?.id === id && t - lastTap.current.t < 360) {
      lastTap.current = null;
      return acts.onOpen(id);
    }
    lastTap.current = { id, t };
    acts.onSelect([id]);
    acts.onPreview(id, screenRect(id));
  };

  // ── keys: arrows go from one star to the next ──
  const onKeyDown = (e: React.KeyboardEvent) => {
    const el = e.target as Element;
    if (el.closest('input, textarea')) return;
    const focused = el.closest('[data-node]')?.getAttribute('data-node') ?? null;
    const cur = focused ?? (selected.length === 1 ? selected[0] : null);
    const ways: Record<string, 'left' | 'right' | 'up' | 'down'> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    if (ways[e.key]) {
      e.preventDefault();
      if (e.shiftKey) {
        const c = camRef.current;
        const dx = e.key === 'ArrowLeft' ? KEY_PAN : e.key === 'ArrowRight' ? -KEY_PAN : 0;
        const dy = e.key === 'ArrowUp' ? KEY_PAN : e.key === 'ArrowDown' ? -KEY_PAN : 0;
        return setCam(keep({ ...c, x: c.x + dx, y: c.y + dy }));
      }
      const among = layout.nodes.filter((n) => !n.folded && (!matchOf || matchOf(n.id))).map((n) => ({ id: n.id, x: n.x - 6, y: n.y - 6, w: 12, h: 12 }));
      const from = cur ? layout.byId.get(cur) : null;
      const next = from ? nearestWay(ways[e.key], { x: from.x - 6, y: from.y - 6, w: 12, h: 12 }, among) : (resumeId && among.find((n) => n.id === resumeId)?.id) || among[0]?.id || null;
      if (!next) return;
      acts.onSelect([next]);
      acts.onPreview(null, null);
      const p = layout.byId.get(next);
      if (p) {
        touched.current = true;
        reveal(p);
      }
      requestAnimationFrame(() => (box.current?.querySelector(`[data-node="${CSS.escape(next)}"]`) as HTMLElement | null)?.focus({ preventScroll: true }));
      return;
    }
    if (e.key === 'Enter' && cur) {
      e.preventDefault();
      return acts.onOpen(cur);
    }
    if (e.key === ' ' && cur) {
      e.preventDefault();
      return acts.onPreview(cur, screenRect(cur));
    }
    if (e.key === '+' || e.key === '=') return (touched.current = true), setCam(keep(zoomAt(camRef.current, camRef.current.k * 1.2, size.w / 2, size.h / 2)));
    if (e.key === '-') return (touched.current = true), setCam(keep(zoomAt(camRef.current, camRef.current.k / 1.2, size.w / 2, size.h / 2)));
    if (e.key === '0') return (touched.current = false), fitNow();
  };

  // ── drawing ──
  const shiftOf = (n: Pick<SkyNode, 'id' | 'g'>): { x: number; y: number } => {
    if (drag?.kind === 'nodes' && drag.ids.includes(n.id)) return { x: drag.dx, y: drag.dy };
    if (drag?.kind === 'cluster' && drag.key === n.g) return { x: drag.dx, y: drag.dy };
    return { x: 0, y: 0 };
  };
  /** where a star is drawn now; a folded one's lines end at its cluster's name */
  const at = (id: string): { x: number; y: number } | null => {
    const n = layout.byId.get(id);
    if (!n) return null;
    if (n.folded) {
      const c = clusterOf.get(n.g);
      return c ? { x: c.head.x + 40, y: c.head.y + c.head.h / 2 } : null;
    }
    const s = shiftOf(n);
    return { x: n.x + s.x, y: n.y + s.y };
  };
  const dimmed = (id: string) => !!matchOf && !matchOf(id);
  const homeColor = (id: string) => homes.of.get(id)?.color ?? null;
  const colorOf = (t: Tile): string => {
    if (arr.display.color === 'kind') return `var(--lk-${t.look})`;
    if (arr.display.color === 'recency') {
      const f = freshness(t.at, now);
      return `var(--rc-${f > 0.85 ? 0 : f > 0.6 ? 1 : f > 0.3 ? 2 : 3})`;
    }
    return colorVar(homeColor(t.id));
  };
  const lineOn = (ids: readonly string[]) => !litSet || ids.some((i) => litSet.has(i));
  /** what a link's words should not be written over: the stars' names, and the ideas named between them */
  const solids = useMemo<Box[]>(() => [...layout.nodes.filter((n) => !n.folded && n.named).map((n) => nodeBox(n)), ...placed], [layout.nodes, placed]);

  return (
    <div
      ref={box}
      className={`l5h-map d-${detail} lens-${lens}${narrow ? ' is-narrow' : ''}${drag ? ` is-${drag.kind}` : ''}${linkFrom ? ' is-linking' : ''}${selectMode ? ' is-selecting' : ''}${moving ? ' is-moving' : ''}${litSet && !matchOf ? ' has-lit' : ''}`}
      style={css({ '--cx': `${Math.round(cam.x)}px`, '--cy': `${Math.round(cam.y)}px` })}
      tabIndex={0}
      role="group"
      aria-label={`Your conversations, ${lens === 'today' ? 'today’s and what they build on' : lens === 'week' ? 'by week' : keepEmpty ? 'by subject' : 'this week’s, by subject'}. Arrow keys go from one to the next; Enter opens it.`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId);
        endGesture();
      }}
      onDoubleClick={(e) => {
        const t = targetOf(e.target as Element);
        if (t?.kind === 'canvas' && subject) {
          const w = world(e);
          acts.onNote(w.x, w.y);
        } else if (t?.kind === 'note') setEditNote(t.id);
      }}
      onKeyDown={onKeyDown}
    >
      <div className="l5n-sky" aria-hidden="true" />
      <div className="l5h-world" style={{ transform: cameraTransform(cam) }}>
        {layout.clusters.map((c) => {
          if (c.open && c.kind !== 'today') return null;
          const shift = drag?.kind === 'cluster' && drag.key === c.key ? { x: drag.dx, y: drag.dy } : { x: 0, y: 0 };
          const over = drag?.kind === 'nodes' && drag.over === c.key && drag.ids.some((id) => layout.byId.get(id)?.g !== c.key);
          return (
            <div
              key={c.key}
              className={`l5n-cl k-${c.kind}${c.collapsed ? ' is-folded' : ''}${c.empty ? ' is-empty' : ''}${over ? ' is-over' : ''}`}
              style={{ left: c.x + shift.x, top: c.y + shift.y, width: c.w, height: c.h, ...css({ '--c': colorVar(c.color) }) }}
              data-cluster={c.key}
              aria-hidden="true"
            >
              <div className="l5n-wash" />
              {c.empty && !c.collapsed && <span className="l5n-empty">Drag a conversation here to file it</span>}
            </div>
          );
        })}

        <svg className="l5n-lines" aria-hidden="true">
          {layout.chains.map(([a, b]) => {
            const p = at(a);
            const q = at(b);
            if (!p || !q) return null;
            return <line key={`${a}>${b}`} className={`l5n-chain${lineOn([a, b]) ? '' : ' is-quiet'}${dimmed(a) && dimmed(b) ? ' is-dim' : ''}`} style={css({ '--c': colorVar(homeColor(a)) })} x1={p.x} y1={p.y} x2={q.x} y2={q.y} />;
          })}
          {placed.map((idea) => {
            const cx = idea.x + idea.w / 2;
            const cy = idea.y + idea.h / 2;
            return (
              <g key={idea.key} className={`l5n-share${idea.theme ? ' is-theme' : ''}${lineOn(idea.members) ? (litSet ? ' is-lit' : '') : ' is-quiet'}${idea.members.every((m) => dimmed(m)) ? ' is-dim' : ''}`}>
                {idea.members.map((m) => {
                  const p = at(m);
                  return p ? <line key={m} x1={cx} y1={cy} x2={p.x} y2={p.y} /> : null;
                })}
              </g>
            );
          })}
          {layout.nodes.map((n) => {
            if (!n.via) return null;
            const p = at(n.id);
            const q = at(n.via.id);
            if (!p || !q) return null;
            const mx = (p.x + q.x) / 2;
            const my = (p.y + q.y) / 2 - Math.min(60, Math.hypot(q.x - p.x, q.y - p.y) * 0.12);
            const lit = !!litSet && litSet.has(n.id) && litSet.has(n.via.id);
            return <path key={`via:${n.id}`} className={`l5n-via${lit || sel.has(n.id) ? ' is-lit' : lineOn([n.id, n.via.id]) ? '' : ' is-quiet'}${dimmed(n.id) ? ' is-dim' : ''}`} d={`M${p.x},${p.y} Q${mx},${my} ${q.x},${q.y}`} />;
          })}
          {arr.links.map((l) => {
            const p = at(l.a);
            const q = at(l.b);
            if (!p || !q) return null;
            const m = linkBend(p, q);
            return <path key={l.id} className={`l5n-own${dimmed(l.a) && dimmed(l.b) ? ' is-dim' : ''}`} d={`M${p.x},${p.y} Q${m.x},${m.y} ${q.x},${q.y}`} />;
          })}
        </svg>

        {layout.sectors.map((s) => (
          <span key={`sector:${s.key}`} className="l5n-sector" style={{ left: s.x, top: s.y, ...css({ '--c': colorVar(s.color) }) }}>
            {s.name}
          </span>
        ))}

        {layout.clusters.map((c) => (c.head.w ? <ClusterHead key={`head:${c.key}`} c={c} shift={drag?.kind === 'cluster' && drag.key === c.key ? { x: drag.dx, y: drag.dy } : null} lens={lens} acts={acts} palette={palette} setPalette={setPalette} renaming={renaming} setRenaming={setRenaming} /> : null))}

        {layout.nodes.map((n) => {
          if (n.folded) return null;
          const tile = tileById.get(n.id);
          if (!tile) return null;
          const s = shiftOf(n);
          const m = matchOf ? matchOf(n.id) : null;
          const resume = n.id === resumeId;
          return (
            <div
              key={n.id}
              className={`l5n-node ${n.hub ? 'is-hub' : 'is-dot'}${tile.kind === 'core' ? ' is-chat' : ''}${n.named ? ' is-named' : ''}${n.suggested ? ' is-sugg' : ''}${n.side === 'left' ? ' side-left' : ''}${n.g === 't:rest' ? ' is-rest' : ''}${n.g === 't:ring' ? ' is-ring' : ''}${sel.has(n.id) ? ' is-sel' : ''}${n.id === activeId ? ' is-here' : ''}${matchOf && !m ? ' is-dim' : ''}${m && matchOf ? ' is-found' : ''}${litSet?.has(n.id) && !sel.has(n.id) ? ' is-lit' : ''}${drag?.kind === 'nodes' && drag.ids.includes(n.id) ? ' is-lifted' : ''}`}
              style={{ transform: `translate(${n.x + s.x}px, ${n.y + s.y}px)`, ...css({ '--c': colorOf(tile), '--r': `${n.r}px`, '--fresh': freshness(tile.at, now).toFixed(2), '--tw': ((hashOf(n.id) % 100) / 100).toFixed(2) }) }}
              data-node={n.id}
              role="button"
              tabIndex={matchOf && !m ? -1 : 0}
              aria-pressed={sel.has(n.id)}
              aria-label={tileSaid(tile, homes.of.get(n.id)?.name) + (n.suggested ? ', suggested for this Project' : '')}
              // pointed at with a mouse; a finger's press is a press, not a hover
              onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(n.id)}
              onPointerLeave={() => setHover((h) => (h === n.id ? null : h))}
            >
              {resume && <span className="l5n-ring" aria-hidden="true" />}
              <span className="l5n-star" aria-hidden="true" />
              <span className="l5n-label" style={{ left: n.label.x - n.x, top: n.label.y - n.y, width: n.label.w }}>
                <span className="l5n-t">
                  {tile.title}
                  {starred.has(n.id) && <StarMark />}
                </span>
                <span className="l5n-k">
                  {resume ? (
                    <span>
                      {tile.lookSaid} · <b className="l5n-last">last here</b>
                    </span>
                  ) : (
                    <span>{kindLine(tile)}</span>
                  )}
                  {tile.made > 0 && <MadeMark n={tile.made} />}
                  {tile.open && (
                    <span className="l5n-q" title="Socria asked something and is waiting for you">
                      ?
                    </span>
                  )}
                </span>
                {backOf?.get(n.id) && acts.onBack && (
                  <span className="l5n-backrow">
                    <button
                      type="button"
                      data-control
                      className="l5n-back"
                      title={`Where this subject was before: “${tileById.get(backOf.get(n.id)!.id)?.title ?? 'a conversation'}” — find it in time`}
                      onClick={(e) => {
                        e.stopPropagation();
                        acts.onBack?.(backOf.get(n.id)!.id);
                      }}
                    >
                      ↩ {shortDate(backOf.get(n.id)!.at)}
                    </button>
                  </span>
                )}
                {n.via ? <span className="l5n-why">{n.via.why}</span> : m && m.why !== 'title' ? <span className="l5n-found">{m.said}</span> : tile.stands ? <span className="l5n-s">{tile.stands}</span> : null}
              </span>
            </div>
          );
        })}

        {placed.map((idea) => (
          <button
            key={idea.key}
            type="button"
            data-control
            className={`l5n-idea${idea.theme ? ' is-theme' : ''}${idea.members.every((m) => dimmed(m)) ? ' is-dim' : ''}`}
            style={{ left: idea.x, top: idea.y, width: idea.w, height: idea.h }}
            title={`${idea.theme ? 'A theme that keeps coming back' : 'An idea they share'}: ${idea.members.map((m) => tileById.get(m)?.title ?? '').join(' · ')}`}
            onPointerEnter={() => setLit(idea.members)}
            onPointerLeave={() => setLit(null)}
            onClick={() => acts.onSelect(idea.members)}
          >
            <span aria-hidden="true">{idea.theme ? '◆' : '◇'}</span> {idea.says}
            {idea.theme && <span className="l5n-idea-n">{idea.members.length}</span>}
          </button>
        ))}

        {arr.links.map((l) => {
          const p = at(l.a);
          const q = at(l.b);
          if (!p || !q) return null;
          const { x, y } = linkLabelAt(p, q, l.label, solids);
          const editing = linkEdit?.id === l.id;
          return (
            <div key={l.id} className={`l5h-linklabel${editing ? ' is-editing' : ''}`} style={{ left: x, top: y }} data-control>
              {editing ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    acts.onLinkEdit(l.id, linkEdit!.label);
                    setLinkEdit(null);
                  }}
                >
                  <input autoFocus value={linkEdit!.label} maxLength={60} placeholder="What joins them?" aria-label="What joins them" onChange={(e) => setLinkEdit({ id: l.id, label: e.target.value })} onKeyDown={(e) => e.key === 'Escape' && setLinkEdit(null)} />
                  <button type="submit" className="l5h-btn">
                    Keep
                  </button>
                  <button type="button" className="l5h-btn is-danger" onClick={() => (acts.onLinkEdit(l.id, null), setLinkEdit(null))}>
                    Remove
                  </button>
                </form>
              ) : (
                <button type="button" className="l5h-linkchip" onClick={() => setLinkEdit({ id: l.id, label: l.label })} title="Your link — press to name it or take it away">
                  {l.label || '⟷'}
                </button>
              )}
            </div>
          );
        })}

        {notes.map((n) => {
          const shift = drag?.kind === 'note' && drag.id === n.id ? { x: drag.dx, y: drag.dy } : { x: 0, y: 0 };
          const editing = editNote === n.id;
          return (
            <div key={n.id} className={`l5h-note${editing ? ' is-editing' : ''}`} style={{ left: n.x + shift.x, top: n.y + shift.y }} data-note={n.id} title={editing ? undefined : 'Double-click to change it; drag to move it'}>
              {editing ? (
                <textarea
                  autoFocus
                  defaultValue={n.text}
                  maxLength={280}
                  rows={Math.max(1, n.text.split('\n').length)}
                  aria-label="A note on the map"
                  onFocus={(e) => {
                    e.currentTarget.select();
                    setNoteText(n.text);
                  }}
                  onChange={(e) => setNoteText(e.target.value)}
                  onBlur={() => {
                    acts.onNoteEdit(n.id, noteText);
                    setEditNote(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      e.currentTarget.blur();
                    } else if (e.key === 'Escape') {
                      setNoteText(n.text);
                      setEditNote(null);
                    }
                  }}
                />
              ) : (
                n.text
              )}
            </div>
          );
        })}
      </div>

      {drag?.kind === 'lasso' && (
        <div className="l5h-lasso" style={{ left: Math.min(drag.x0, drag.x1), top: Math.min(drag.y0, drag.y1), width: Math.abs(drag.x1 - drag.x0), height: Math.abs(drag.y1 - drag.y0) }} aria-hidden="true" />
      )}

      <div className="l5h-zoom" data-control>
        <button type="button" aria-label="Zoom out" onClick={() => ((touched.current = true), setCam(keep(zoomAt(camRef.current, camRef.current.k / 1.25, size.w / 2, size.h / 2))))}>
          −
        </button>
        <button type="button" aria-label="Zoom in" onClick={() => ((touched.current = true), setCam(keep(zoomAt(camRef.current, camRef.current.k * 1.25, size.w / 2, size.h / 2))))}>
          +
        </button>
        <button type="button" className="is-fit" onClick={() => ((touched.current = false), fitNow())}>
          Fit
        </button>
      </div>
    </div>
  );
}

/** The bend of a link: lifted from the straight line by a share of its length. */
export function linkBend(p: { x: number; y: number }, q: { x: number; y: number }): { x: number; y: number } {
  return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 - Math.min(90, Math.hypot(q.x - p.x, q.y - p.y) * 0.18) };
}

/**
 * Where a link's words go: on its curve, as near its middle as they can be
 * without sitting on a star's name or a shared idea.
 */
function linkLabelAt(p: { x: number; y: number }, q: { x: number; y: number }, label: string, solid: readonly Box[]): { x: number; y: number } {
  const m = linkBend(p, q);
  const w = Math.max(36, Math.min(60, label.length || 2) * 8.4 + 26);
  const h = 28;
  const on = (t: number) => ({ x: (1 - t) ** 2 * p.x + 2 * (1 - t) * t * m.x + t * t * q.x, y: (1 - t) ** 2 * p.y + 2 * (1 - t) * t * m.y + t * t * q.y });
  for (const t of [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82]) {
    const c = on(t);
    const b = { x: c.x - w / 2, y: c.y - h / 2, w, h };
    if (!solid.some((s) => b.x < s.x + s.w && s.x < b.x + b.w && b.y < s.y + s.h && s.y < b.y + b.h)) return c;
  }
  return on(0.5);
}

/** A cluster's name over its stars — and, By subject, what can be done to it. */
function ClusterHead({
  c,
  shift,
  lens,
  acts,
  palette,
  setPalette,
  renaming,
  setRenaming,
}: {
  c: SkyCluster;
  shift: { x: number; y: number } | null;
  lens: SkyLens;
  acts: SkyActs;
  palette: string | null;
  setPalette: (key: string | null) => void;
  renaming: { key: string; name: string } | null;
  setRenaming: (r: { key: string; name: string } | null) => void;
}) {
  const project = c.kind === 'project';
  const read = c.kind === 'course' || c.kind === 'field';
  const foldable = lens !== 'today' && c.kind !== 'ring' && c.kind !== 'rest';
  const s = shift ?? { x: 0, y: 0 };
  const canMake = lens === 'subject' && read && !!acts.onMakeProject;
  return (
    <div
      className={`l5n-head k-${c.kind}${c.movable ? ' is-movable' : ''}${c.collapsed ? ' is-folded' : ''}`}
      data-chead={c.movable ? c.key : undefined}
      style={{ left: c.head.x + s.x, top: c.head.y + s.y, width: c.head.w, ...css({ '--c': c.color ? colorVar(c.color) : c.kind === 'today' || c.kind === 'ring' ? 'var(--l5h-gold)' : 'var(--lg-ink-40)' }) }}
      title={c.movable ? 'Drag to move it, and everything in it' : undefined}
    >
      {(canMake || foldable) && (
        <div className="l5n-tools" data-control>
          {canMake && (
            <button type="button" className="l5n-hbtn" onClick={() => acts.onMakeProject!(c.key)} title={`Make “${c.name}” a Project, with these in it`}>
              Make it a Project
            </button>
          )}
          {foldable && (
            <button type="button" className="l5n-hbtn" aria-expanded={!c.collapsed} aria-label={c.collapsed ? `Unfold ${c.name}` : `Fold ${c.name}`} onClick={() => acts.onFold(c.key, !c.collapsed)}>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={c.collapsed ? 'M9 6l6 6-6 6' : 'M6 9l6 6 6-6'} />
              </svg>
              {c.collapsed ? 'Unfold' : 'Fold'}
            </button>
          )}
        </div>
      )}
      <span className="l5n-kick">
        {project && acts.onColor ? (
          <button type="button" data-control className="l5n-dotc" aria-label={`Colour of ${c.name}`} onClick={() => setPalette(palette === c.key ? null : c.key)} />
        ) : c.color ? (
          <span className="l5n-dotc" aria-hidden="true" />
        ) : null}
        {c.kicker}
        {lens === 'subject' && project && c.suggested.length > 0 && acts.onFileSuggested && (
          <button type="button" data-control className="l5n-sugg" onClick={() => acts.onFileSuggested!(c.key)} title={`${c.suggested.length === 1 ? 'One conversation is' : `${c.suggested.length} conversations are`} about ${c.name} but not filed in it`}>
            + {c.suggested.length} about it · File {c.suggested.length === 1 ? 'it' : 'them'}
          </button>
        )}
      </span>
      <div className="l5n-cl-row">
        {renaming?.key === c.key ? (
          <form
            data-control
            className="l5n-frename"
            onSubmit={(e) => {
              e.preventDefault();
              if (renaming.name.trim() && renaming.name.trim() !== c.name) acts.onRename?.(c.key, renaming.name.trim());
              setRenaming(null);
            }}
          >
            <input
              autoFocus
              value={renaming.name}
              maxLength={80}
              aria-label={`Rename ${c.name}`}
              onChange={(e) => setRenaming({ key: c.key, name: e.target.value })}
              onBlur={(e) => e.currentTarget.form?.requestSubmit()}
              onKeyDown={(e) => e.key === 'Escape' && setRenaming(null)}
            />
          </form>
        ) : (
          <span
            className="l5n-name"
            onDoubleClick={(e) => {
              if (!project || !acts.onRename) return;
              e.stopPropagation();
              setRenaming({ key: c.key, name: c.name });
            }}
            title={project && acts.onRename ? 'Double-click to rename' : c.name}
          >
            {c.name}
          </span>
        )}
      </div>
      {c.collapsed && <span className="l5n-sum">{c.count === 1 ? 'One conversation, folded away' : `${c.count} conversations, folded away`}</span>}
      <span className="l5n-rule" aria-hidden="true" />
      {palette === c.key && (
        <div className="l5h-palette" data-control role="radiogroup" aria-label={`Colour of ${c.name}`}>
          {PROJECT_COLOR_KEYS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={c.color === k} aria-label={k} className={c.color === k ? 'is-on' : ''} style={{ background: colorVar(k) }} onClick={() => (acts.onColor?.(c.key, k), setPalette(null))} />
          ))}
        </div>
      )}
    </div>
  );
}
