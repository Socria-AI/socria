'use client';
// components/logos5/UniverseMap.tsx — the Universal Map as a map.
//
// Project frames with their conversations in them, laid out by
// lib/logos5/universe.ts; what conversations share, named between them; the
// person's own links and notes. Moving about is the Logic Map's (lib/canvas.ts):
// drag the empty map, pinch or ⌘/Ctrl-scroll to zoom, scroll to move.
// Arranging is the person's: drag a conversation anywhere — into another
// Project's frame to file it there — drag a frame by its name to move all of
// it, its corner to make it wider or narrower; shift-drag (or Select) to
// choose several; double-click the map to write a note. On a touch screen a
// press-and-hold picks a conversation up, so a plain drag still moves the map.
// The tiles say more the closer you are: a name far off; its kind and key
// ideas nearer; where it stands and its small graph up close.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cameraTransform, fitCamera, isDrag, keepInView, pinchCamera, readWheel, toWorld, zoomAt, KEY_PAN, type Camera } from '@/lib/canvas';
import {
  detailAt,
  freshness,
  frameAt,
  mapLayout,
  nearestWay,
  noteBox,
  placeIdeas,
  scaleOf,
  sharedIdeas,
  snapToSlot,
  boxAround,
  GAP,
  PAD,
  type Box,
  type Group,
  type Match,
  type PlacedTile,
  type Tile,
} from '@/lib/logos5/universe';
import type { Arrangement } from '@/lib/logos5/arrange';
import { MapTile, PALETTE, PROJECT_HEX, accentOf, colorKeyOf, cssVars, groupHex } from './UniverseParts';

export interface MapActs {
  onSelect: (ids: string[], add?: boolean) => void;
  /** a conversation pressed: its card, beside where it is on screen */
  onPreview: (id: string | null, at: DOMRect | null) => void;
  onOpen: (id: string) => void;
  /**
   * conversations put down: each in a group — its own, or another it was
   * dropped into — at a place relative to that group's corner, and where it
   * was (fx, fy) in its own; with every other conversation still in its
   * group's order (`others`), where it is now, so it can stay there
   */
  onDrop: (moves: Drop[], others: Kept[]) => void;
  onMoveFrame: (key: string, dx: number, dy: number) => void;
  onFrameCols: (key: string, cols: number) => void;
  onFold: (key: string, folded: boolean) => void;
  onRename?: (key: string, name: string) => void;
  onColor?: (key: string, color: string) => void;
  /** a note begun at a point on the map */
  onNote: (x: number, y: number) => void;
  onNoteEdit: (id: string, text: string) => void;
  onNoteMove: (id: string, x: number, y: number) => void;
  /** in link mode: the conversation pressed is the other end */
  onLinkTo: (id: string) => void;
  /** a link's words changed; null takes the link away */
  onLinkEdit: (id: string, label: string | null) => void;
}

export interface Drop {
  id: string;
  to: string;
  x: number;
  y: number;
  /** where it was, relative to its own group's corner */
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
  | { kind: 'tiles'; ids: string[]; dx: number; dy: number; over: string | null }
  | { kind: 'frame'; key: string; dx: number; dy: number }
  | { kind: 'note'; id: string; dx: number; dy: number }
  | { kind: 'resize'; key: string; cols: number }
  | { kind: 'lasso'; x0: number; y0: number; x1: number; y1: number };

type Target = { kind: 'canvas' } | { kind: 'tile'; id: string } | { kind: 'frame'; key: string } | { kind: 'note'; id: string } | { kind: 'resize'; key: string };

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

export function MapCanvas({
  groups,
  tileById,
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
  acts,
}: {
  groups: Group[];
  tileById: Map<string, Tile>;
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
  /** a phone: frames two across at most, one under another */
  narrow?: boolean;
  acts: MapActs;
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
  const [lit, setLit] = useState<string[] | null>(null);
  const [palette, setPalette] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ key: string; name: string } | null>(null);
  const [linkEdit, setLinkEdit] = useState<{ id: string; label: string } | null>(null);
  const [noteText, setNoteText] = useState('');
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const lastTap = useRef<{ id: string; t: number } | null>(null);

  // while a frame is being made wider, the map is drawn as it will be
  const frames = drag?.kind === 'resize' ? { ...arr.frames, [drag.key]: { ...(arr.frames[drag.key] ?? { dx: 0, dy: 0 }), cols: drag.cols } } : arr.frames;
  const layout = useMemo(() => mapLayout(groups, { pins: arr.pins, frames }, { narrow }), [groups, arr.pins, frames, narrow]);
  const groupOf = useMemo(() => new Map(groups.map((g) => [g.key, g])), [groups]);
  const shownTiles = useMemo(() => groups.flatMap((g) => g.tiles), [groups]);
  const ideas = useMemo(() => (arr.display.ideas ? placeIdeas(sharedIdeas(shownTiles), layout) : []), [arr.display.ideas, shownTiles, layout]);
  const content = useMemo<Box>(() => boxAround([...layout.frames, ...arr.notes.map(noteBox), ...ideas]), [layout.frames, arr.notes, ideas]);
  const detail = arr.display.labels === 'minimal' ? 'far' : detailAt(cam.k);
  const sel = useMemo(() => new Set(selected), [selected]);
  const starred = useMemo(() => new Set(arr.starred), [arr.starred]);

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
    if (!size.w || !size.h || !content.w) return;
    const c = fitCamera(content, size.w, size.h, { pad: narrow ? 12 : 36, insets: { top, right: 0, bottom: 12, left: 0 }, maxK: 1.1, minK: narrow ? 0.5 : 0.3, align: 'start' });
    // a phone reads from the top
    setCam(narrow ? { ...c, y: top + 10 - content.y * c.k } : c);
  }, [size.w, size.h, content, setCam, top, narrow]);
  const fitted = useRef(-1);
  useEffect(() => {
    if (fitted.current === fitKey || !size.w || !content.w) return;
    fitted.current = fitKey;
    fitNow();
  }, [fitKey, size.w, content.w, fitNow]);

  const keep = useCallback((c: Camera) => keepInView(c, content.w ? content : null, size.w, size.h, 90), [content, size.w, size.h]);
  if (centerRef) centerRef.current = toWorld(cam, size.w / 2, (size.h + top) / 2);

  // the wheel: zoom where the pointer is, move where the trackpad goes (as on the Logic Map)
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  wheelRef.current = (e: WheelEvent) => {
    if ((e.target as Element | null)?.closest?.('.l5h-palette, textarea, input')) return;
    e.preventDefault();
    acts.onPreview(null, null);
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

  /** A conversation's place on screen, for its card. */
  const screenRect = (id: string): DOMRect | null => {
    const el = box.current?.querySelector(`[data-tile="${CSS.escape(id)}"]`);
    return el ? el.getBoundingClientRect() : null;
  };

  /** Bring a conversation into view if it is not. */
  const reveal = (t: PlacedTile) => {
    const c = camRef.current;
    const sx = t.x * c.k + c.x;
    const sy = t.y * c.k + c.y;
    const margin = 40;
    if (sx >= margin && sy >= top + margin / 2 && sx + t.w * c.k <= size.w - margin && sy + t.h * c.k <= size.h - margin) return;
    setCam({ ...c, x: size.w / 2 - (t.x + t.w / 2) * c.k, y: (size.h + top) / 2 - (t.y + t.h / 2) * c.k });
  };

  // ── pressing, dragging, letting go ──
  const targetOf = (el: Element): Target | null => {
    if (el.closest('[data-control], input, textarea, .l5h-zoom, .l5h-linklabel button')) return null;
    const t = el.closest('[data-tile]');
    if (t) return { kind: 'tile', id: t.getAttribute('data-tile')! };
    const r = el.closest('[data-resize]');
    if (r) return { kind: 'resize', key: r.getAttribute('data-resize')! };
    const f = el.closest('[data-fhead]');
    if (f) return { kind: 'frame', key: f.getAttribute('data-fhead')! };
    const n = el.closest('[data-note]');
    if (n) return { kind: 'note', id: n.getAttribute('data-note')! };
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

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.pinch) {
      const pts = [...pointers.current.values()];
      if (pts.length < 2) return;
      const r = box.current!.getBoundingClientRect();
      const off = (p: { x: number; y: number }) => ({ x: p.x - r.left, y: p.y - r.top });
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
      // on a touch screen, a drag that did not wait to pick something up moves the map
      if (!g.held && g.target.kind !== 'canvas') g.target = { kind: 'canvas' };
      // the card beside a conversation belongs to where it was: anything moving puts it away
      acts.onPreview(null, null);
    }
    const k = camRef.current.k;
    const t = g.target;
    if (t.kind === 'canvas') {
      if (g.lasso) {
        const a = local({ clientX: g.sx, clientY: g.sy });
        const b = local(e);
        setDrag({ kind: 'lasso', x0: a.x, y0: a.y, x1: b.x, y1: b.y });
      } else setCam(keep({ ...g.cam0, x: g.cam0.x + dx, y: g.cam0.y + dy }));
    } else if (t.kind === 'tile') {
      const ids = sel.has(t.id) ? selected.filter((id) => layout.byId.get(id) && !layout.byId.get(id)!.folded) : [t.id];
      const w = world(e);
      const f = frameAt(layout.frames, w.x, w.y);
      setDrag({ kind: 'tiles', ids, dx: dx / k, dy: dy / k, over: f?.key ?? null });
    } else if (t.kind === 'frame') setDrag({ kind: 'frame', key: t.key, dx: dx / k, dy: dy / k });
    else if (t.kind === 'note') setDrag({ kind: 'note', id: t.id, dx: dx / k, dy: dy / k });
    else if (t.kind === 'resize') {
      const f = layout.frames.find((x) => x.key === t.key);
      if (!f) return;
      const w = world(e);
      const cols = Math.max(1, Math.min(6, Math.round((w.x - f.origin.x - PAD + GAP) / (f.cell.w + GAP))));
      setDrag({ kind: 'resize', key: t.key, cols });
    }
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
      if (g.target.kind === 'tile') pressTile(g.target.id, e);
      else if (g.target.kind === 'canvas') {
        acts.onSelect([]);
        acts.onPreview(null, null);
        setPalette(null);
      }
      return;
    }
    if (!d) return;
    if (d.kind === 'tiles') {
      const moves: Drop[] = [];
      for (const id of d.ids) {
        const p = layout.byId.get(id);
        if (!p) continue;
        const to = d.over ?? p.g;
        const f = layout.frames.find((x) => x.key === to);
        const own = layout.frames.find((x) => x.key === p.g);
        if (!f || !own) continue;
        let x = p.x + d.dx - f.origin.x;
        let y = p.y + d.dy - f.origin.y;
        if (arr.display.snap) ({ x, y } = snapToSlot(x, y, f.cell));
        moves.push({ id, to, x, y, fx: p.x - own.origin.x, fy: p.y - own.origin.y });
      }
      // the rest, where they are now: moving one of them moves none of the others
      const others: Kept[] = layout.tiles
        .filter((t) => !t.pinned && !t.folded && !d.ids.includes(t.id))
        .map((t) => {
          const f = layout.frames.find((x) => x.key === t.g)!;
          return { id: t.id, g: t.g, x: t.x - f.origin.x, y: t.y - f.origin.y };
        });
      if (moves.length) acts.onDrop(moves, others);
    } else if (d.kind === 'frame') {
      const step = arr.display.snap ? 24 : 1;
      acts.onMoveFrame(d.key, Math.round(d.dx / step) * step, Math.round(d.dy / step) * step);
    } else if (d.kind === 'note') {
      const n = arr.notes.find((x) => x.id === d.id);
      if (n) acts.onNoteMove(n.id, n.x + d.dx, n.y + d.dy);
    } else if (d.kind === 'resize') acts.onFrameCols(d.key, d.cols);
    else if (d.kind === 'lasso') {
      const c = camRef.current;
      const a = toWorld(c, Math.min(d.x0, d.x1), Math.min(d.y0, d.y1));
      const b = toWorld(c, Math.max(d.x0, d.x1), Math.max(d.y0, d.y1));
      const ids = layout.tiles.filter((t) => !t.folded && t.x < b.x && t.x + t.w > a.x && t.y < b.y && t.y + t.h > a.y).map((t) => t.id);
      acts.onSelect(ids, e.shiftKey);
    }
  };

  const pressTile = (id: string, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
    if (linkFrom) return acts.onLinkTo(id);
    if (e.shiftKey || e.metaKey || e.ctrlKey) return acts.onSelect([id], true);
    const now = Date.now();
    if (lastTap.current?.id === id && now - lastTap.current.t < 360) {
      lastTap.current = null;
      return acts.onOpen(id);
    }
    lastTap.current = { id, t: now };
    acts.onSelect([id]);
    acts.onPreview(id, screenRect(id));
  };

  // ── keys: arrows go from one conversation to the next ──
  const onKeyDown = (e: React.KeyboardEvent) => {
    const el = e.target as Element;
    if (el.closest('input, textarea')) return;
    const focusedTile = el.closest('[data-tile]')?.getAttribute('data-tile') ?? null;
    const cur = focusedTile ?? (selected.length === 1 ? selected[0] : null);
    const ways: Record<string, 'left' | 'right' | 'up' | 'down'> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    if (ways[e.key]) {
      e.preventDefault();
      if (e.shiftKey) {
        const c = camRef.current;
        const dx = e.key === 'ArrowLeft' ? KEY_PAN : e.key === 'ArrowRight' ? -KEY_PAN : 0;
        const dy = e.key === 'ArrowUp' ? KEY_PAN : e.key === 'ArrowDown' ? -KEY_PAN : 0;
        return setCam(keep({ ...c, x: c.x + dx, y: c.y + dy }));
      }
      const among = layout.tiles.filter((t) => !t.folded && (!matchOf || matchOf(t.id)));
      const from = cur ? layout.byId.get(cur) : null;
      const next = from ? nearestWay(ways[e.key], from, among) : (resumeId && among.find((t) => t.id === resumeId)?.id) || among[0]?.id || null;
      if (!next) return;
      acts.onSelect([next]);
      acts.onPreview(null, null);
      const p = layout.byId.get(next);
      if (p) reveal(p);
      requestAnimationFrame(() => (box.current?.querySelector(`[data-tile="${CSS.escape(next)}"]`) as HTMLElement | null)?.focus({ preventScroll: true }));
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
    if (e.key === '+' || e.key === '=') return setCam(keep(zoomAt(camRef.current, camRef.current.k * 1.2, size.w / 2, size.h / 2)));
    if (e.key === '-') return setCam(keep(zoomAt(camRef.current, camRef.current.k / 1.2, size.w / 2, size.h / 2)));
    if (e.key === '0') return fitNow();
  };

  // ── drawing ──
  const tileShift = (t: PlacedTile): { x: number; y: number } => {
    if (drag?.kind === 'tiles' && drag.ids.includes(t.id)) return { x: drag.dx, y: drag.dy };
    if (drag?.kind === 'frame' && drag.key === t.g) return { x: drag.dx, y: drag.dy };
    return { x: 0, y: 0 };
  };
  const placeOf = (id: string): Box | null => {
    const t = layout.byId.get(id);
    if (!t) return null;
    if (t.folded) {
      const f = layout.frames.find((x) => x.key === t.g);
      return f ? { x: f.x, y: f.y, w: f.w, h: f.h } : null;
    }
    const s = tileShift(t);
    return { x: t.x + s.x, y: t.y + s.y, w: t.w, h: t.h };
  };
  /** the point on a box nearest another point: where a line meets it */
  const edge = (b: Box, px: number, py: number) => ({ x: Math.max(b.x, Math.min(b.x + b.w, px)), y: Math.max(b.y, Math.min(b.y + b.h, py)) });
  const dimmed = (id: string) => !!matchOf && !matchOf(id);
  const litSet = lit ? new Set(lit) : null;

  return (
    <div
      ref={box}
      className={`l5h-map d-${detail}${drag ? ` is-${drag.kind}` : ''}${linkFrom ? ' is-linking' : ''}${selectMode ? ' is-selecting' : ''}`}
      tabIndex={0}
      role="group"
      aria-label="Your conversations, by Project. Arrow keys go from one to the next; Enter opens it."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId);
        endGesture();
      }}
      onDoubleClick={(e) => {
        const t = targetOf(e.target as Element);
        if (t?.kind === 'canvas') {
          const w = world(e);
          acts.onNote(w.x, w.y);
        } else if (t?.kind === 'note') setEditNote(t.id);
      }}
      onKeyDown={onKeyDown}
    >
      <div className="l5h-world" style={{ transform: cameraTransform(cam) }}>
        {layout.frames.map((f) => {
          const g = groupOf.get(f.key)!;
          const hex = groupHex(g);
          const shift = drag?.kind === 'frame' && drag.key === f.key ? { x: drag.dx, y: drag.dy } : { x: 0, y: 0 };
          const over = drag?.kind === 'tiles' && drag.over === f.key && drag.ids.some((id) => layout.byId.get(id)?.g !== f.key);
          const project = g.kind === 'project';
          const latest = [...g.tiles].sort((a, b) => b.at - a.at)[0];
          return (
            <div
              key={f.key}
              className={`l5h-frame k-${g.kind}${f.collapsed ? ' is-folded' : ''}${f.empty ? ' is-empty' : ''}${over ? ' is-over' : ''}${g.archived ? ' is-archived' : ''}`}
              style={{ left: f.x + shift.x, top: f.y + shift.y, width: f.w, height: f.h, ...cssVars({ '--fc': hex }) }}
              data-frame={f.key}
              aria-label={`${g.name}: ${g.tiles.length} ${g.tiles.length === 1 ? 'conversation' : 'conversations'}`}
            >
              <div className="l5h-fhead" data-fhead={f.key} title="Drag to move this frame and everything in it">
                {project && onColorable(acts) ? (
                  <button type="button" data-control className="l5h-fdot" aria-label={`Colour of ${g.name}`} onClick={() => setPalette(palette === f.key ? null : f.key)} />
                ) : (
                  <span className="l5h-fdot" aria-hidden="true" />
                )}
                {renaming?.key === f.key ? (
                  <form
                    data-control
                    className="l5h-frename"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (renaming.name.trim() && renaming.name.trim() !== g.name) acts.onRename?.(f.key, renaming.name.trim());
                      setRenaming(null);
                    }}
                  >
                    <input
                      autoFocus
                      value={renaming.name}
                      maxLength={80}
                      aria-label={`Rename ${g.name}`}
                      onChange={(e) => setRenaming({ key: f.key, name: e.target.value })}
                      onBlur={(e) => e.currentTarget.form?.requestSubmit()}
                      onKeyDown={(e) => e.key === 'Escape' && setRenaming(null)}
                    />
                  </form>
                ) : (
                  <span
                    className="l5h-fname"
                    onDoubleClick={(e) => {
                      if (!project || !acts.onRename) return;
                      e.stopPropagation();
                      setRenaming({ key: f.key, name: g.name });
                    }}
                    title={project && acts.onRename ? 'Double-click to rename' : undefined}
                  >
                    {g.name}
                    {g.archived ? ' · archived' : ''}
                  </span>
                )}
                <span className="l5h-fcount">{g.tiles.length}</span>
                <button type="button" data-control className="l5h-ffold" aria-expanded={!f.collapsed} aria-label={f.collapsed ? `Unfold ${g.name}` : `Fold ${g.name}`} onClick={() => acts.onFold(f.key, !f.collapsed)}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={f.collapsed ? 'M9 6l6 6-6 6' : 'M6 9l6 6 6-6'} />
                  </svg>
                </button>
              </div>
              {palette === f.key && (
                <div className="l5h-palette" data-control role="radiogroup" aria-label={`Colour of ${g.name}`}>
                  {PALETTE.map((c) => (
                    <button key={c} type="button" role="radio" aria-checked={colorKeyOf(g) === c} aria-label={c} className={colorKeyOf(g) === c ? 'is-on' : ''} style={{ background: PROJECT_HEX[c] }} onClick={() => (acts.onColor?.(f.key, c), setPalette(null))} />
                  ))}
                </div>
              )}
              {f.empty && !f.collapsed && <div className="l5h-fempty">Drag a line of thinking here to file it</div>}
              {f.collapsed && (
                <div className="l5h-fsum">
                  {g.tiles.length ? `${g.tiles.length} · latest: ${latest?.title ?? ''}` : 'Nothing in it yet'}
                </div>
              )}
              {!f.collapsed && <div className="l5h-resize" data-resize={f.key} title="Drag to make it wider or narrower" aria-hidden="true" />}
            </div>
          );
        })}

        <svg className="l5h-lines" aria-hidden="true">
          {ideas.map((idea) => {
            const cx = idea.x + idea.w / 2;
            const cy = idea.y + idea.h / 2;
            const on = !litSet || litSet.has(idea.members[0]) || idea.members.some((m) => litSet.has(m));
            const dim = idea.members.every((m) => dimmed(m));
            return (
              <g key={idea.key} className={`l5h-share${idea.theme ? ' is-theme' : ''}${on ? '' : ' is-quiet'}${dim ? ' is-dim' : ''}`}>
                {idea.members.map((m) => {
                  const b = placeOf(m);
                  if (!b) return null;
                  const p = edge(b, cx, cy);
                  return <line key={m} x1={cx} y1={cy} x2={p.x} y2={p.y} />;
                })}
              </g>
            );
          })}
          {arr.links.map((l) => {
            const A = placeOf(l.a);
            const B = placeOf(l.b);
            if (!A || !B) return null;
            const ac = { x: A.x + A.w / 2, y: A.y + A.h / 2 };
            const bc = { x: B.x + B.w / 2, y: B.y + B.h / 2 };
            const p = edge(A, bc.x, bc.y);
            const q = edge(B, ac.x, ac.y);
            const mx = (p.x + q.x) / 2;
            const my = (p.y + q.y) / 2 - Math.min(90, Math.hypot(q.x - p.x, q.y - p.y) * 0.18);
            return <path key={l.id} className={`l5h-own${dimmed(l.a) && dimmed(l.b) ? ' is-dim' : ''}`} d={`M${p.x},${p.y} Q${mx},${my} ${q.x},${q.y}`} />;
          })}
        </svg>

        {layout.tiles.map((t) => {
          if (t.folded) return null;
          const tile = tileById.get(t.id);
          const g = groupOf.get(t.g);
          if (!tile || !g) return null;
          const s = tileShift(t);
          const m = matchOf ? matchOf(t.id) : null;
          return (
            <MapTile
              key={t.id}
              tile={tile}
              groupName={g.name}
              lifted={drag?.kind === 'tiles' && drag.ids.includes(t.id)}
              style={{ left: t.x + s.x, top: t.y + s.y, width: t.w, height: t.h }}
              look={{
                detail,
                labels: arr.display.labels,
                accent: accentOf(tile, g, arr.display.color, now),
                fresh: freshness(tile.at, now),
                scale: scaleOf(tile, arr.display.size, now),
                starred: starred.has(t.id),
                here: t.id === activeId,
                resume: t.id === resumeId,
                selected: sel.has(t.id) || (!!litSet && litSet.has(t.id)),
                dim: !!matchOf && !m,
                found: m && m.why !== 'title' ? m.said : undefined,
              }}
            />
          );
        })}

        {ideas.map((idea) => (
          <button
            key={idea.key}
            type="button"
            data-control
            className={`l5h-idea${idea.theme ? ' is-theme' : ''}${idea.members.every((m) => dimmed(m)) ? ' is-dim' : ''}`}
            style={{ left: idea.x, top: idea.y, width: idea.w, height: idea.h }}
            title={`${idea.theme ? 'A theme that keeps coming back' : 'An idea they share'}: ${idea.members.map((m) => tileById.get(m)?.title ?? '').join(' · ')}`}
            onPointerEnter={() => setLit(idea.members)}
            onPointerLeave={() => setLit(null)}
            onClick={() => acts.onSelect(idea.members)}
          >
            <span aria-hidden="true">{idea.theme ? '◆' : '◇'}</span> {idea.says}
            {idea.theme && <span className="l5h-idea-n">{idea.members.length}</span>}
          </button>
        ))}

        {arr.links.map((l) => {
          const A = placeOf(l.a);
          const B = placeOf(l.b);
          if (!A || !B) return null;
          const x = (A.x + A.w / 2 + B.x + B.w / 2) / 2;
          const y = (A.y + A.h / 2 + B.y + B.h / 2) / 2 - Math.min(45, Math.hypot(B.x - A.x, B.y - A.y) * 0.09);
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

        {arr.notes.map((n) => {
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
        <button type="button" aria-label="Zoom out" onClick={() => setCam(keep(zoomAt(camRef.current, camRef.current.k / 1.25, size.w / 2, size.h / 2)))}>
          −
        </button>
        <button type="button" aria-label="Zoom in" onClick={() => setCam(keep(zoomAt(camRef.current, camRef.current.k * 1.25, size.w / 2, size.h / 2)))}>
          +
        </button>
        <button type="button" className="is-fit" onClick={fitNow}>
          Fit
        </button>
      </div>
    </div>
  );
}

/** Colour is the Project's own: it can be changed only where Projects can be. */
const onColorable = (acts: MapActs) => !!acts.onColor;
