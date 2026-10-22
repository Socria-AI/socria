'use client';
// components/logos5/UniverseBubbles.tsx — the Universal Map, drawn as subjects.
//
// Today and This week, laid out by lib/logos5/bubbles.ts as the person's own
// design draws them: each subject a dashed circle named round its upper edge;
// each real study session a disc in the subject's colour with its name inside
// it, the one to pick up from wearing a pale halo; each quick question a dot
// on a spoke from its session, its words beside it; what joins two subjects a
// dashed curve, and over the one that matters most a card that says why. On
// Today a subject not worked on today is folded to its name and a few dots;
// pressed, it opens. The person's Projects are always there, drawn as theirs —
// a solid ring in the Project's own colour — folded when nothing in one is
// here, waiting to be dragged into when it is empty; "+ New project" makes
// one, named there, or with whatever is dropped on it.
//
// Moving about is the Logic Map's (lib/canvas.ts): drag the empty map, pinch
// or ⌘/Ctrl-scroll to zoom, scroll to move. Pressing a conversation opens its
// card; pressing it again opens it. Dragged into another subject's circle —
// on a touch screen, held a moment first — a conversation is given that
// subject, or filed in that Project, folded or empty ones too; dropped on
// "+ New project", a Project is made with it in it. Shift-drag (or Select)
// chooses several.
// On This week, double-click the map to write a note.
//
// Each lens, and each week, comes in drawn: the circles open, the sessions
// rise into place, the spokes and joins are drawn out to what they hang from,
// the quick questions settle, and the card arrives last over its curve.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { cameraTransform, fitCamera, isDrag, keepInView, pinchCamera, readWheel, toWorld, zoomAt, KEY_PAN, type Camera } from '@/lib/canvas';
import { boxAround, freshness, nearestWay, noteBox, type Box, type Match, type SharedIdea, type Tile } from '@/lib/logos5/universe';
import { bubbleLayout, foldedBox, type BubbleCluster, type BubbleLens, type BubbleLink } from '@/lib/logos5/bubbles';
import { PROJECT_COLOR_KEYS, type Homes } from '@/lib/logos5/spatial';
import type { Arrangement } from '@/lib/logos5/arrange';
import { MadeMark, StarMark, colorVar, shortDate, tileSaid } from './UniverseParts';

export interface BubbleActs {
  onSelect: (ids: string[], add?: boolean) => void;
  /** a conversation pressed: its card, beside where it is on screen */
  onPreview: (id: string | null, at: DOMRect | null) => void;
  onOpen: (id: string) => void;
  /** conversations dropped into another subject: given it — into a Project, filed there */
  onRefile: (ids: string[], to: string) => void;
  /** This week: a subject folded away, or opened again */
  onFold: (key: string, folded: boolean) => void;
  /** a subject or Project not this lens's own, opened here, or folded again */
  onOpenFar: (key: string, open: boolean) => void;
  /** a new Project, named — with these conversations filed in it, when some were dropped on it */
  onNewProject?: (name: string, ids: string[]) => void;
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
  /** in link mode: the conversation pressed is the other end */
  onLinkTo: (id: string) => void;
  /** a link's words changed; null takes the link away */
  onLinkEdit: (id: string, label: string | null) => void;
  /** a ↩ pressed: the conversation of a subject from before, found in time */
  onBack?: (id: string) => void;
}

type Drag =
  | { kind: 'nodes'; ids: string[]; dx: number; dy: number; over: string | null }
  | { kind: 'note'; id: string; dx: number; dy: number }
  | { kind: 'lasso'; x0: number; y0: number; x1: number; y1: number };

type Target = { kind: 'canvas' } | { kind: 'node'; id: string } | { kind: 'note'; id: string };

interface Gesture {
  target: Target;
  sx: number;
  sy: number;
  cam0: Camera;
  moved: boolean;
  /** a touch held long enough to pick something up */
  held: boolean;
  lasso: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  pinch?: { a0: { x: number; y: number }; b0: { x: number; y: number } };
}

const css = (vars: Record<string, string | number>): CSSProperties => vars as unknown as CSSProperties;
/** before paint in a browser — the map is fitted before it is first seen; nothing on the server */
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;
/** what a drag is over when it is over "+ New project" */
const NEW_PROJECT = '+new';
/** when each thing arrives as the map comes in, in ms */
const ARRIVE = { circle: 0, circleStep: 70, hub: 140, hubStep: 70, line: 240, dot: 380, dotStep: 34, link: 760, linkStep: 90, card: 980 } as const;

export function BubbleMap({
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
  top,
  bottom,
  narrow = false,
  all,
  opened,
  backOf,
  acts,
}: {
  lens: BubbleLens;
  /** Today: every conversation shown (the day and what it builds on are chosen from them); This week: the week's */
  tiles: readonly Tile[];
  tileById: Map<string, Tile>;
  homes: Homes;
  ideas: readonly SharedIdea[];
  arr: Arrangement;
  now: number;
  activeId: string | null;
  resumeId: string | null;
  selected: readonly string[];
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
  /** how much of the top and the foot the page's own words and the box cover */
  top: number;
  bottom: number;
  narrow?: boolean;
  /** every conversation shown, whatever the lens: for how many a Project holds, and its newest when opened */
  all?: readonly Tile[];
  /** the folded subjects and Projects the person opened here */
  opened?: ReadonlySet<string>;
  /** a conversation's subject from before this week: the last of it, for a ↩ by its subject's name */
  backOf?: ReadonlyMap<string, { id: string; at: number }>;
  acts: BubbleActs;
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
  const [cardFor, setCardFor] = useState<string | null>(null);
  const [palette, setPalette] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ key: string; name: string } | null>(null);
  const [linkEdit, setLinkEdit] = useState<{ id: string; label: string } | null>(null);
  const [noteText, setNoteText] = useState('');
  /** a new Project being named — with what was dropped on it */
  const [making, setMaking] = useState<{ ids: string[]; name: string } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const lastTap = useRef<{ id: string; t: number } | null>(null);

  const folded = useMemo(() => new Set(Object.entries(arr.frames).filter(([, f]) => f.collapsed).map(([k]) => k)), [arr.frames]);
  const L = useMemo(
    () => bubbleLayout({ lens, tiles, all, homes, ideas, links: arr.links, now, narrow, folded: lens === 'week' ? folded : undefined, opened, resumeId, cardFor, size: arr.display.size, ideaLinks: arr.display.ideas, canMake: !!acts.onNewProject }),
    [lens, tiles, all, homes, ideas, arr.links, now, narrow, folded, opened, resumeId, cardFor, arr.display.size, arr.display.ideas, acts.onNewProject]
  );
  const notes = lens === 'week' ? arr.notes : [];
  const content = useMemo<Box>(() => boxAround([L.bounds, ...notes.map(noteBox)]), [L.bounds, notes]);
  const sel = useMemo(() => new Set(selected), [selected]);
  const starred = useMemo(() => new Set(arr.starred), [arr.starred]);
  const clusterOf = useMemo(() => new Map(L.clusters.map((c) => [c.key, c])), [L.clusters]);
  const linkOf = useMemo(() => new Map(L.links.map((l) => [l.key, l])), [L.links]);
  const ownOf = useMemo(() => new Map(arr.links.map((l) => [l.id, l])), [arr.links]);

  // what is joined to what: a conversation's neighbours, lit when it is pointed at
  const near = useMemo(() => {
    const m = new Map<string, Set<string>>();
    const join = (a: string, b: string) => {
      m.set(a, (m.get(a) ?? new Set()).add(b));
      m.set(b, (m.get(b) ?? new Set()).add(a));
    };
    for (const [a, b] of L.joins) join(a, b);
    for (const [a, b] of L.spokes) join(a, b);
    for (const l of L.links) join(l.a, l.b);
    return m;
  }, [L]);
  const litSet = useMemo(() => (hover && !drag ? new Set([hover, ...(near.get(hover) ?? [])]) : null), [hover, drag, near]);

  // ── the viewport ──
  useBeforePaint(() => {
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
    const c = fitCamera(content, size.w, size.h, { pad: narrow ? 14 : 28, insets: { top, right: 0, bottom, left: 0 }, maxK: 1, minK: narrow ? 0.62 : 0.34, align: narrow ? 'start' : 'center' });
    setCam(c);
  }, [size.w, size.h, content, narrow, top, bottom, setCam]);
  const fitted = useRef('');
  /** the person has moved or zoomed the map since it was last fitted */
  const touched = useRef(false);
  useBeforePaint(() => {
    const want = String(fitKey);
    if (fitted.current === want || !size.w || !content.w) return;
    fitted.current = want;
    touched.current = false;
    fitNow();
  }, [fitKey, size.w, content.w, fitNow]);
  // the room changed, or what is drawn did (a subject opened, a week's last one came in): fitted again, unless the person has moved it
  const fittedTo = useRef({ w: 0, h: 0, cw: 0, ch: 0, top: 0, bottom: 0 });
  useBeforePaint(() => {
    const was = fittedTo.current;
    fittedTo.current = { w: size.w, h: size.h, cw: content.w, ch: content.h, top, bottom };
    if (!was.w || touched.current || !fitted.current) return;
    if (Math.abs(was.w - size.w) > 40 || Math.abs(was.h - size.h) > 40 || Math.abs(was.cw - content.w) > 24 || Math.abs(was.ch - content.h) > 24 || Math.abs(was.top - top) > 6 || Math.abs(was.bottom - bottom) > 6) fitNow();
  }, [size, content.w, content.h, top, bottom, fitNow]);

  const keep = useCallback((c: Camera) => keepInView(c, content.w ? content : null, size.w, size.h, 90), [content, size.w, size.h]);
  if (centerRef) centerRef.current = toWorld(cam, size.w / 2, (size.h + top - bottom) / 2);

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
  /** A conversation's place on screen, for its card. */
  const screenRect = (id: string): DOMRect | null => {
    const el = box.current?.querySelector(`[data-node="${CSS.escape(id)}"] :is(.l5b-disc, .l5b-pip)`);
    return el ? el.getBoundingClientRect() : null;
  };
  /** Bring a conversation into view if it is not. */
  const reveal = (id: string) => {
    const n = L.byId.get(id);
    if (!n) return;
    const c = camRef.current;
    const sx = n.x * c.k + c.x;
    const sy = n.y * c.k + c.y;
    const margin = 60;
    if (sx >= margin && sy >= top + margin / 2 && sx <= size.w - margin && sy <= size.h - bottom - margin / 2) return;
    setCam({ ...c, x: size.w / 2 - n.x * c.k, y: (size.h + top - bottom) / 2 - n.y * c.k });
  };
  /** What a point on the map is in: a circle, a folded one's name and dots (an empty Project's too), or "+ New project". */
  const dropAt = (x: number, y: number): string | null => {
    const near = (b: { x: number; y: number; w: number; h: number }) => x >= b.x - 12 && x <= b.x + b.w + 12 && y >= b.y - 12 && y <= b.y + b.h + 12;
    for (const c of L.clusters) if (c.folded ? near(foldedBox(c)) : Math.hypot(x - c.x, y - c.y) <= c.r) return c.key;
    return L.make && acts.onNewProject && near(L.make) ? NEW_PROJECT : null;
  };

  // ── pressing, dragging, letting go ──
  const targetOf = (el: Element): Target | null => {
    if (el.closest('[data-control], input, textarea, button, .l5h-zoom')) return null;
    const n = el.closest('[data-node]');
    if (n) return { kind: 'node', id: n.getAttribute('data-node')! };
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
      gesture.current = { target: { kind: 'canvas' }, sx: 0, sy: 0, cam0: camRef.current, moved: true, held: false, lasso: false, timer: null, pinch: { a0: a, b0: b } };
      return;
    }
    const touch = e.pointerType !== 'mouse';
    const g: Gesture = { target, sx: e.clientX, sy: e.clientY, cam0: camRef.current, moved: false, held: !touch, lasso: target.kind === 'canvas' && (e.shiftKey || selectMode), timer: null };
    if (touch && target.kind !== 'canvas')
      // held still for a moment, it is picked up; moved first, the map moves
      g.timer = setTimeout(() => {
        if (gesture.current === g && !g.moved) {
          g.held = true;
          box.current?.classList.add('is-holding');
        }
      }, 380);
    gesture.current = g;
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
      // on a touch screen, a drag that did not wait to pick something up moves the map
      if (!g.held && g.target.kind !== 'canvas') g.target = { kind: 'canvas' };
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
      const ids = sel.has(t.id) ? selected.filter((id) => L.byId.has(id)) : [t.id];
      const w = world(e);
      const over = dropAt(w.x, w.y);
      setDrag({ kind: 'nodes', ids, dx: dx / k, dy: dy / k, over: over && over !== L.byId.get(t.id)?.g ? over : null });
    } else setDrag({ kind: 'note', id: t.id, dx: dx / k, dy: dy / k });
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
    if (d.kind === 'nodes' && d.over === NEW_PROJECT) setMaking({ ids: d.ids, name: '' });
    else if (d.kind === 'nodes' && d.over) acts.onRefile(d.ids, d.over);
    else if (d.kind === 'note') {
      const n = arr.notes.find((x) => x.id === d.id);
      if (n) acts.onNoteMove(n.id, n.x + d.dx, n.y + d.dy);
    } else if (d.kind === 'lasso') {
      const c = camRef.current;
      const a = toWorld(c, Math.min(d.x0, d.x1), Math.min(d.y0, d.y1));
      const b = toWorld(c, Math.max(d.x0, d.x1), Math.max(d.y0, d.y1));
      const ids = [...L.byId.entries()].filter(([, n]) => n.x > a.x && n.x < b.x && n.y > a.y && n.y < b.y).map(([id]) => id);
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

  // ── keys: arrows go from one conversation to the next ──
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
      const among = [...L.byId.entries()].filter(([id]) => !matchOf || matchOf(id)).map(([id, n]) => ({ id, x: n.x - 6, y: n.y - 6, w: 12, h: 12 }));
      const from = cur ? L.byId.get(cur) : null;
      const next = from ? nearestWay(ways[e.key], { x: from.x - 6, y: from.y - 6, w: 12, h: 12 }, among) : (resumeId && among.find((n) => n.id === resumeId)?.id) || among[0]?.id || null;
      if (!next) return;
      acts.onSelect([next]);
      acts.onPreview(null, null);
      touched.current = true;
      reveal(next);
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
  const shiftOf = (id: string) => (drag?.kind === 'nodes' && drag.ids.includes(id) ? { x: drag.dx, y: drag.dy } : { x: 0, y: 0 });
  const at = (id: string) => {
    const n = L.byId.get(id);
    if (!n) return null;
    const s = shiftOf(id);
    return { x: n.x + s.x, y: n.y + s.y, r: n.r };
  };
  /** from one circle's edge towards another's */
  const edge = (a: { x: number; y: number; r: number }, b: { x: number; y: number; r: number }) => {
    const d = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    return { x1: a.x + ((b.x - a.x) / d) * a.r, y1: a.y + ((b.y - a.y) / d) * a.r, x2: b.x - ((b.x - a.x) / d) * b.r, y2: b.y - ((b.y - a.y) / d) * b.r };
  };
  const dimmed = (id: string) => !!matchOf && !matchOf(id);
  const lineLit = (ids: readonly string[]) => (litSet ? (ids.every((i) => litSet.has(i)) ? ' is-lit' : ' is-quiet') : '');
  /** a conversation's colour: its subject's, or its kind's, or how recent it is — as the person chose */
  const colorOf = (t: Tile, g: string): string => {
    if (arr.display.color === 'kind') return `var(--lk-${t.look})`;
    if (arr.display.color === 'recency') {
      const f = freshness(t.at, now);
      return `var(--rc-${f > 0.85 ? 0 : f > 0.6 ? 1 : f > 0.3 ? 2 : 3})`;
    }
    return colorVar(clusterOf.get(g)?.color ?? null);
  };
  // the order things arrive in as the map comes in
  const clusterIndex = useMemo(() => new Map(L.clusters.map((c, i) => [c.key, i])), [L.clusters]);
  const hubIndex = useMemo(() => new Map(L.hubs.map((h, i) => [h.id, i])), [L.hubs]);
  const hubArrives = (id: string) => ARRIVE.hub + (hubIndex.get(id) ?? 0) * ARRIVE.hubStep + (clusterIndex.get(L.byId.get(id)?.g ?? '') ?? 0) * 40;
  const backFor = (c: BubbleCluster) => {
    if (!backOf || !acts.onBack) return null;
    for (const id of c.ids) {
      const b = backOf.get(id);
      if (b) return b;
    }
    return null;
  };
  const over = drag?.kind === 'nodes' ? drag.over : null;
  const cardLink: BubbleLink | null = L.card ? linkOf.get(L.card.link) ?? null : null;
  const own = cardLink?.own ? ownOf.get(cardLink.own) ?? null : null;

  return (
    <div
      ref={box}
      className={`l5h-map l5b lens-${lens}${narrow ? ' is-narrow' : ''}${arr.display.labels === 'minimal' ? ' is-minimal' : ''}${drag ? ` is-${drag.kind}` : ''}${linkFrom ? ' is-linking' : ''}${selectMode ? ' is-selecting' : ''}${litSet && !matchOf ? ' has-lit' : ''}`}
      style={css({ '--cx': `${Math.round(cam.x)}px`, '--cy': `${Math.round(cam.y)}px`, '--k': cam.k.toFixed(3) })}
      tabIndex={0}
      role="group"
      aria-label={`Your conversations, ${lens === 'today' ? 'today’s and what they build on' : 'this week’s'}, by subject. Arrow keys go from one to the next; Enter opens it.`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId);
        endGesture();
      }}
      onDoubleClick={(e) => {
        const t = targetOf(e.target as Element);
        if (t?.kind === 'canvas' && lens === 'week') {
          const w = world(e);
          acts.onNote(w.x, w.y);
        } else if (t?.kind === 'note') setEditNote(t.id);
      }}
      onKeyDown={onKeyDown}
    >
      <div className="l5n-sky" aria-hidden="true" />
      <div className="l5h-world" style={{ transform: cameraTransform(cam) }}>
        <svg className="l5b-lines" aria-hidden="true">
          <defs>
            {L.links.map((l) => (
              <mask key={l.key} id={`l5b-m-${maskId(l.key)}`} maskUnits="userSpaceOnUse" x={content.x - 400} y={content.y - 400} width={content.w + 800} height={content.h + 800}>
                <path className="l5b-draw" d={pathOf(l)} pathLength={1} style={css({ '--d': `${ARRIVE.link + L.links.indexOf(l) * ARRIVE.linkStep}ms` })} />
              </mask>
            ))}
          </defs>
          {L.clusters
            .filter((c) => !c.folded)
            .map((c, i) => (
              <circle
                key={c.key}
                className={`l5b-ring${c.kind === 'project' ? ' is-project' : ''}${over === c.key ? ' is-over' : ''}${c.ids.every(dimmed) ? ' is-dim' : ''}`}
                cx={c.x}
                cy={c.y}
                r={c.r}
                style={css({ '--c': colorVar(c.color), '--d': `${ARRIVE.circle + i * ARRIVE.circleStep}ms` })}
              />
            ))}
          {L.joins.map(([a, b]) => {
            const p = at(a);
            const q = at(b);
            if (!p || !q) return null;
            const e = edge(p, q);
            return <path key={`j:${a}>${b}`} className={`l5b-join${lineLit([a, b])}${dimmed(a) && dimmed(b) ? ' is-dim' : ''}`} d={`M${e.x1},${e.y1} L${e.x2},${e.y2}`} pathLength={1} style={css({ '--d': `${hubArrives(b) + 120}ms` })} />;
          })}
          {L.spokes.map(([d, h]) => {
            const p = at(h);
            const q = at(d);
            if (!p || !q) return null;
            const e = edge(p, q);
            return <path key={`s:${d}`} className={`l5b-spoke${lineLit([d, h])}${dimmed(d) ? ' is-dim' : ''}`} d={`M${e.x1},${e.y1} L${e.x2},${e.y2}`} pathLength={1} style={css({ '--d': `${hubArrives(h) + ARRIVE.line}ms` })} />;
          })}
          {L.links.map((l) => (
            <g key={l.key} className={`l5b-link is-${l.kind}${L.card?.link === l.key ? ' is-carded' : ''}${lineLit([l.a, l.b])}${dimmed(l.a) && dimmed(l.b) ? ' is-dim' : ''}`}>
              <path className="l5b-link-line" d={pathOf(l)} mask={`url(#l5b-m-${maskId(l.key)})`} />
              <path
                className="l5b-link-hit"
                d={pathOf(l)}
                data-control
                onClick={() => setCardFor(l.key)}
                onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(l.a)}
                onPointerLeave={() => setHover(null)}
              >
                <title>{l.kind === 'own' ? 'Your link — press for what joins them' : `An idea both come back to: ${l.idea}`}</title>
              </path>
            </g>
          ))}
        </svg>

        {L.clusters.map((c) =>
          c.folded ? (
            c.empty ? (
              <div
                key={`f:${c.key}`}
                className={`l5b-fold is-project is-empty${over === c.key ? ' is-over' : ''}`}
                style={{ left: c.label.x, top: c.label.y, ...css({ '--c': colorVar(c.color), '--d': `${ARRIVE.circle + (clusterIndex.get(c.key) ?? 0) * ARRIVE.circleStep + 200}ms` }) }}
                data-control
                role="group"
                aria-label={`${c.name}: a Project with nothing in it yet. Drag a conversation here to file it.`}
              >
                <span className="l5b-name-t">
                  <span className="l5b-dotc" aria-hidden="true" />
                  {c.name}
                </span>
                <span className="l5b-fold-empty">Empty — drag one here</span>
              </div>
            ) : (
              <button
                key={`f:${c.key}`}
                type="button"
                data-control
                className={`l5b-fold${c.kind === 'project' ? ' is-project' : ''}${over === c.key ? ' is-over' : ''}`}
                style={{ left: c.label.x, top: c.label.y, ...css({ '--c': colorVar(c.color), '--d': `${ARRIVE.circle + (clusterIndex.get(c.key) ?? 0) * ARRIVE.circleStep + 200}ms` }) }}
                onClick={() => (c.far ? acts.onOpenFar(c.key, true) : acts.onFold(c.key, false))}
                title={`${c.kind === 'project' ? 'Your Project · ' : ''}${c.count === 1 ? 'One conversation' : `${c.count} conversations`} — press to open`}
                aria-label={`${c.field ? `${c.field}, ` : ''}${c.name}${c.kind === 'project' ? ', a Project of yours' : ''}: ${c.count === 1 ? 'one conversation' : `${c.count} conversations`}, folded. Open it.`}
              >
                <span className="l5b-name-t">
                  {c.kind === 'project' && <span className="l5b-dotc" aria-hidden="true" />}
                  {c.field ? `${c.field} · ${c.name}` : c.name} <span aria-hidden="true">→</span>
                </span>
                {c.pips.map((p, i) => (
                  <span key={i} className="l5b-fold-pip" aria-hidden="true" style={{ left: p.x - c.label.x - p.r, top: p.y - c.label.y - p.r, width: 2 * p.r, height: 2 * p.r }} />
                ))}
              </button>
            )
          ) : (
            <SubjectName
              key={`n:${c.key}`}
              c={c}
              lens={lens}
              acts={acts}
              arrives={ARRIVE.circle + (clusterIndex.get(c.key) ?? 0) * ARRIVE.circleStep + 160}
              back={backFor(c)}
              backTitle={(id) => tileById.get(id)?.title ?? 'a conversation'}
              palette={palette}
              setPalette={setPalette}
              renaming={renaming}
              setRenaming={setRenaming}
            />
          )
        )}

        {L.make && acts.onNewProject && (
          <div className={`l5b-make${making ? ' is-naming' : ''}${over === NEW_PROJECT ? ' is-over' : ''}`} style={{ left: L.make.x, top: L.make.y, ...css({ '--d': `${ARRIVE.circle + L.clusters.length * ARRIVE.circleStep + 260}ms` }) }} data-control>
            {making ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = making.name.trim();
                  if (name) acts.onNewProject?.(name, making.ids);
                  setMaking(null);
                }}
              >
                <input autoFocus value={making.name} maxLength={80} placeholder="Name the project" aria-label="Name the new Project" onChange={(e) => setMaking({ ...making, name: e.target.value })} onKeyDown={(e) => e.key === 'Escape' && setMaking(null)} onBlur={(e) => !e.currentTarget.value.trim() && setMaking(null)} />
                <span className="l5b-make-s">{making.ids.length ? `with ${making.ids.length === 1 ? 'it' : `these ${making.ids.length}`} in it · Enter to make it` : 'Enter to make it'}</span>
              </form>
            ) : (
              <button type="button" onClick={() => setMaking({ ids: [], name: '' })} title="Make a Project — or drop conversations here to make one with them in it">
                <span className="l5b-name-t">+ New project</span>
                <span className="l5b-make-pip" aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        {L.hubs.map((h) => {
          const tile = tileById.get(h.id);
          if (!tile) return null;
          const s = shiftOf(h.id);
          const m = matchOf ? matchOf(h.id) : null;
          return (
            <div
              key={h.id}
              className={[
                'l5b-hub',
                h.shade ? 'is-shade' : '',
                h.halo ? 'has-halo' : '',
                h.focus ? 'is-focus' : '',
                sel.has(h.id) ? 'is-sel' : '',
                h.id === activeId ? 'is-here' : '',
                matchOf && !m ? 'is-dim' : '',
                matchOf && m ? 'is-found' : '',
                litSet?.has(h.id) && !sel.has(h.id) ? 'is-lit' : '',
                drag?.kind === 'nodes' && drag.ids.includes(h.id) ? 'is-lifted' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{
                left: h.x - h.r,
                top: h.y - h.r,
                width: 2 * h.r,
                height: 2 * h.r,
                transform: s.x || s.y ? `translate(${s.x}px, ${s.y}px)` : undefined,
                ...css({ '--c': colorOf(tile, h.g), '--r': `${h.r}px`, '--f': `${h.font}px`, '--lines': h.lines, '--d': `${hubArrives(h.id)}ms` }),
              }}
              data-node={h.id}
              role="button"
              tabIndex={matchOf && !m ? -1 : 0}
              aria-pressed={sel.has(h.id)}
              aria-label={tileSaid(tile, homes.of.get(h.id)?.name) + (h.halo && h.id === resumeId ? ', where you left off' : '') + (h.why ? `, ${h.why}` : '')}
              title={h.why ? `${tile.title} — ${h.why}` : undefined}
              onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(h.id)}
              onPointerLeave={() => setHover((x) => (x === h.id ? null : x))}
            >
              <span className="l5b-hub-in">
                {h.halo && <span className="l5b-halo" aria-hidden="true" />}
                <span className="l5b-disc" aria-hidden="true" />
                <span className="l5b-hub-words" aria-hidden="true">
                  <span className="l5b-hub-t">
                    {tile.title}
                    {starred.has(h.id) && (
                      <>
                        {' '}
                        <StarMark />
                      </>
                    )}
                  </span>
                  <span className="l5b-hub-s">{h.sub}</span>
                </span>
                {tile.open && (
                  <span className="l5b-ask" title="Socria asked something and is waiting for you">
                    ?
                  </span>
                )}
                {tile.made > 0 && h.r >= 64 && (
                  <span className="l5b-made">
                    <MadeMark n={tile.made} />
                  </span>
                )}
              </span>
            </div>
          );
        })}

        {L.dots.map((d) => {
          const tile = tileById.get(d.id);
          if (!tile) return null;
          const s = shiftOf(d.id);
          const m = matchOf ? matchOf(d.id) : null;
          const k = L.dots.indexOf(d);
          return (
            <div
              key={d.id}
              className={[
                'l5b-dot',
                tile.kind === 'core' ? 'is-chat' : '',
                d.named ? 'is-named' : '',
                `side-${d.side}`,
                sel.has(d.id) ? 'is-sel' : '',
                d.id === activeId ? 'is-here' : '',
                matchOf && !m ? 'is-dim' : '',
                matchOf && m ? 'is-found' : '',
                litSet?.has(d.id) && !sel.has(d.id) ? 'is-lit' : '',
                drag?.kind === 'nodes' && drag.ids.includes(d.id) ? 'is-lifted' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ left: d.x + s.x, top: d.y + s.y, ...css({ '--c': colorOf(tile, d.g), '--r': `${d.r}px`, '--d': `${(d.hub ? hubArrives(d.hub) : ARRIVE.hub) + ARRIVE.dot + k * ARRIVE.dotStep}ms` }) }}
              data-node={d.id}
              role="button"
              tabIndex={matchOf && !m ? -1 : 0}
              aria-pressed={sel.has(d.id)}
              aria-label={tileSaid(tile, homes.of.get(d.id)?.name) + (d.why ? `, ${d.why}` : '')}
              title={d.why ? `${tile.title} — ${d.why}` : undefined}
              onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(d.id)}
              onPointerLeave={() => setHover((x) => (x === d.id ? null : x))}
            >
              <span className="l5b-pip" aria-hidden="true" />
              <span
                className={`l5b-dot-t is-${d.align} side-${d.side}`}
                // held by the edge nearest the dot, so words that take a line more grow away from it
                style={d.side === 'above' ? { left: d.label.x - d.x, bottom: d.y - d.label.y - d.label.h, width: d.label.w } : d.side === 'below' ? { left: d.label.x - d.x, top: d.label.y - d.y, width: d.label.w } : { left: d.label.x - d.x, top: 0, width: d.label.w }}
                aria-hidden="true"
              >
                {tile.title}
                {starred.has(d.id) && (
                  <>
                    {' '}
                    <StarMark />
                  </>
                )}
                {m && m.why !== 'title' && <span className="l5b-found">{m.said}</span>}
              </span>
            </div>
          );
        })}

        {L.card && (
          <div
            className={`l5b-card${cardLink?.kind === 'own' ? ' is-own' : ' is-idea'}`}
            style={{ left: L.card.x, top: L.card.y, width: L.card.w, ...css({ '--d': `${ARRIVE.card}ms` }) }}
            data-control
            onPointerEnter={() => cardLink && setHover(cardLink.a)}
            onPointerLeave={() => setHover(null)}
          >
            <p className="l5b-card-t">{L.card.title}</p>
            {own && linkEdit?.id === own.id ? (
              <form
                className="l5b-card-edit"
                onSubmit={(e) => {
                  e.preventDefault();
                  acts.onLinkEdit(own.id, linkEdit.label);
                  setLinkEdit(null);
                }}
              >
                <input autoFocus value={linkEdit.label} maxLength={60} placeholder="What joins them?" aria-label="What joins them" onChange={(e) => setLinkEdit({ id: own.id, label: e.target.value })} onKeyDown={(e) => e.key === 'Escape' && setLinkEdit(null)} />
                <button type="submit" className="l5h-btn">
                  Keep
                </button>
              </form>
            ) : (
              <p className="l5b-card-s">
                {L.card.says.map((x, i) => (x.em ? <em key={i}>{x.text}</em> : <span key={i}>{x.text}</span>))} {L.card.note}
              </p>
            )}
            {own && linkEdit?.id !== own.id && (
              <span className="l5b-card-acts">
                <button type="button" className="l5b-card-btn" aria-label={own.label ? 'Change what joins them' : 'Say what joins them'} title={own.label ? 'Change the words' : 'Say what joins them'} onClick={() => setLinkEdit({ id: own.id, label: own.label })}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 19l4-1L19 8l-3-3L6 15zM14 7l3 3" />
                  </svg>
                </button>
                <button type="button" className="l5b-card-btn is-danger" aria-label="Unlink them" title="Unlink" onClick={() => acts.onLinkEdit(own.id, null)}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </span>
            )}
          </div>
        )}

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

      {drag?.kind === 'lasso' && <div className="l5h-lasso" style={{ left: Math.min(drag.x0, drag.x1), top: Math.min(drag.y0, drag.y1), width: Math.abs(drag.x1 - drag.x0), height: Math.abs(drag.y1 - drag.y0) }} aria-hidden="true" />}

      <div className="l5h-zoom" data-control style={{ bottom: bottom + 14 }}>
        <button type="button" aria-label="Zoom in" onClick={() => ((touched.current = true), setCam(keep(zoomAt(camRef.current, camRef.current.k * 1.25, size.w / 2, size.h / 2))))}>
          +
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => ((touched.current = true), setCam(keep(zoomAt(camRef.current, camRef.current.k / 1.25, size.w / 2, size.h / 2))))}>
          −
        </button>
        <button type="button" className="is-fit" aria-label="Fit the map to the screen" onClick={() => ((touched.current = false), fitNow())}>
          Fit
        </button>
      </div>
    </div>
  );
}

/** A link's curve, as drawn. */
const pathOf = (l: Pick<BubbleLink, 'p0' | 'c' | 'p1'>) => `M${l.p0.x},${l.p0.y} Q${l.c.x},${l.c.y} ${l.p1.x},${l.p1.y}`;
/** A link's key, as an id a mask can be found by. */
const maskId = (key: string) => key.replace(/[^A-Za-z0-9_-]/g, '_');

/** A subject's name round its circle — and, pointed at, what can be done with it. */
function SubjectName({
  c,
  lens,
  acts,
  arrives,
  back,
  backTitle,
  palette,
  setPalette,
  renaming,
  setRenaming,
}: {
  c: BubbleCluster;
  lens: BubbleLens;
  acts: BubbleActs;
  arrives: number;
  back: { id: string; at: number } | null;
  backTitle: (id: string) => string;
  palette: string | null;
  setPalette: (key: string | null) => void;
  renaming: { key: string; name: string } | null;
  setRenaming: (r: { key: string; name: string } | null) => void;
}) {
  const project = c.kind === 'project';
  const read = c.kind === 'course' || c.kind === 'field';
  const canFold = lens === 'week' || c.far;
  return (
    <div className={`l5b-name${project ? ' is-project' : ''}`} style={{ left: c.label.x, top: c.label.y, ...css({ '--c': colorVar(c.color), '--d': `${arrives}ms` }) }} data-control>
      {renaming?.key === c.key ? (
        <form
          className="l5n-frename"
          onSubmit={(e) => {
            e.preventDefault();
            if (renaming.name.trim() && renaming.name.trim() !== c.name) acts.onRename?.(c.key, renaming.name.trim());
            setRenaming(null);
          }}
        >
          <input autoFocus value={renaming.name} maxLength={80} aria-label={`Rename ${c.name}`} onChange={(e) => setRenaming({ key: c.key, name: e.target.value })} onBlur={(e) => e.currentTarget.form?.requestSubmit()} onKeyDown={(e) => e.key === 'Escape' && setRenaming(null)} />
        </form>
      ) : (
        <span
          className="l5b-name-t"
          onDoubleClick={() => project && acts.onRename && setRenaming({ key: c.key, name: c.name })}
          title={project && acts.onRename ? 'Your Project — double-click to rename' : undefined}
        >
          {project && (acts.onColor ? <button type="button" className="l5b-dotc" aria-label={`Colour of ${c.name}`} onClick={() => setPalette(palette === c.key ? null : c.key)} /> : <span className="l5b-dotc" aria-hidden="true" />)}
          {c.field ? `${c.field} · ${c.name}` : c.name}
          {project && <span className="l5b-tag">Project</span>}
        </span>
      )}
      {back && (
        <button type="button" className="l5b-back" title={`Where this subject was before: “${backTitle(back.id)}” — find it in time`} onClick={() => acts.onBack?.(back.id)}>
          {`↩ ${shortDate(back.at)}`}
        </button>
      )}
      <span className="l5b-tools">
        {project && c.suggested.length > 0 && acts.onFileSuggested && (
          <button type="button" className="l5b-tool" onClick={() => acts.onFileSuggested!(c.key)} title={`${c.suggested.length === 1 ? 'One conversation is' : `${c.suggested.length} conversations are`} about ${c.name} but not filed in it`}>
            + {c.suggested.length} about it · File {c.suggested.length === 1 ? 'it' : 'them'}
          </button>
        )}
        {read && acts.onMakeProject && (
          <button type="button" className="l5b-tool" onClick={() => acts.onMakeProject!(c.key)} title={`Make “${c.name}” a Project, with these in it`}>
            Make it a Project
          </button>
        )}
        {canFold && (
          <button type="button" className="l5b-tool" aria-label={`Fold ${c.name}`} onClick={() => (c.far ? acts.onOpenFar(c.key, false) : acts.onFold(c.key, true))}>
            Fold
          </button>
        )}
      </span>
      {palette === c.key && (
        <div className="l5h-palette" role="radiogroup" aria-label={`Colour of ${c.name}`}>
          {PROJECT_COLOR_KEYS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={c.color === k} aria-label={k} className={c.color === k ? 'is-on' : ''} style={{ background: colorVar(k) }} onClick={() => (acts.onColor?.(c.key, k), setPalette(null))} />
          ))}
        </div>
      )}
    </div>
  );
}
