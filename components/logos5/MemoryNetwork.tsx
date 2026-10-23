'use client';
// components/logos5/MemoryNetwork.tsx — the Memory view's network: the atlas
// of a mind (lib/logos5/memoryAtlas.ts), drawn, and moved through.
//
// The drawing lives in its own space (the atlas's world) and is fitted to the
// screen; zooming and panning move the whole world — the wheel, a drag, two
// fingers, the buttons, or the keyboard (+ − 0, and the arrows). Words are set
// at one size on screen, so closer in, more of them fit, and they are placed
// again whenever the distance changes enough to matter.
//
// What is selected lights its relationships, each with its word, and dims
// what it does not touch. A change runs once, in gold, along what it reached
// (`pulse`); with reduced motion it is a still highlight and nothing moves.

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  REGION,
  dendritesOf,
  fibrePath,
  neighbourToward,
  overviewScene,
  placeRelWords,
  placeWords,
  regionScene,
  relWord,
  stateWords,
  estimate,
  type Cell,
  type EdgeIn,
  type Fibre,
  type Measure,
  type Memory,
  type RegionId,
  type Scene,
} from '@/lib/logos5/memoryAtlas';
import { Icon, Legend, regionVar } from './MemoryParts';

const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

interface View {
  k: number;
  x: number;
  y: number;
}

const K_MIN = 0.25, K_MAX = 6;
const ARROWS: Record<string, 'left' | 'right' | 'up' | 'down' | undefined> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };

/** Words measured in the screen's own font, where there is one. */
function useMeasure(el: HTMLElement | null): Measure {
  return useMemo(() => {
    if (typeof document === 'undefined' || !el) return estimate;
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return estimate;
    const family = getComputedStyle(el).fontFamily || 'Inter, system-ui, sans-serif';
    const cache = new Map<string, number>();
    return (text: string, px: number, weight = 500) => {
      const key = `${weight}|${px.toFixed(2)}|${text}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      ctx.font = `${weight} ${px}px ${family}`;
      const w = ctx.measureText(text).width * 1.03;
      cache.set(key, w);
      return w;
    };
  }, [el]);
}

export function MemoryNetwork({
  memories,
  byId,
  edges,
  narrow,
  open,
  onOpen,
  selected,
  onSelect,
  matches,
  pulse,
  reduced,
  reviewCounts,
  insets,
  hint,
  children,
}: {
  memories: Memory[];
  byId: ReadonlyMap<string, Memory>;
  edges: EdgeIn[];
  narrow: boolean;
  open: RegionId | null;
  onOpen: (r: RegionId | null) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** what a search or a filter keeps; the rest is drawn quieter */
  matches: ((m: Memory) => boolean) | null;
  pulse: { id: string; key: number } | null;
  reduced: boolean;
  /** "N to review", per region — said inside the lobes on a phone */
  reviewCounts: Partial<Record<RegionId, number>>;
  /** room the page's own controls take at each edge */
  insets: { top: number; right: number; bottom: number; left: number };
  hint?: ReactNode;
  children?: ReactNode;
}) {
  const uid = useId().replace(/:/g, '');
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useBeforePaint(() => {
    const el = boxRef.current;
    if (!el) return;
    setBox(el);
    const read = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => (Math.abs(s.w - r.width) < 1 && Math.abs(s.h - r.height) < 1 ? s : { w: Math.round(r.width), h: Math.round(r.height) }));
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const measure = useMeasure(box);

  // the scene: the whole mind, or one region opened in place
  const openW = narrow && size.w ? Math.max(320, Math.round(size.w / 10) * 10) : undefined;
  const openH = narrow && size.h ? Math.max(320, Math.round(size.h / 10) * 10) : undefined;
  const scene: Scene = useMemo(
    () => (open ? regionScene(memories, edges, open, { narrow, w: openW, h: openH }) : overviewScene(memories, edges, { narrow })),
    [memories, edges, open, narrow, openW, openH]
  );

  // ── where the world sits on the screen ──
  const fitView = useCallback((): View => {
    if (!size.w || !size.h) return { k: 1, x: 0, y: 0 };
    const aw = Math.max(80, size.w - insets.left - insets.right);
    const ah = Math.max(80, size.h - insets.top - insets.bottom);
    const k = Math.min(aw / scene.w, ah / scene.h) * (narrow && open ? 1 : 0.98);
    return { k, x: insets.left + (aw - scene.w * k) / 2, y: insets.top + (ah - scene.h * k) / 2 };
  }, [size.w, size.h, insets.left, insets.right, insets.top, insets.bottom, scene.w, scene.h, narrow, open]);
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const [moving, setMoving] = useState(false);
  const fitted = useRef('');
  useBeforePaint(() => {
    const key = `${open}|${size.w}|${size.h}|${narrow}`;
    if (fitted.current === key) return;
    fitted.current = key;
    setView(fitView());
  }, [open, size.w, size.h, narrow, fitView]);
  const fit = () => setView(fitView());
  const zoomAt = useCallback(
    (factor: number, cx?: number, cy?: number) =>
      setView((v) => {
        const k = Math.min(K_MAX, Math.max(K_MIN * fitView().k, v.k * factor));
        const px = cx ?? size.w / 2, py = cy ?? size.h / 2;
        return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
      }),
    [fitView, size.w, size.h]
  );

  // the wheel zooms where the pointer is (a listener that may prevent the page scrolling)
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [zoomAt]);

  // a drag pans; two fingers pinch
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; dist: number; mid: { x: number; y: number } } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as Element).closest('.l5mm-ctl, button, a, input')) return;
    const r = boxRef.current!.getBoundingClientRect();
    pointers.current.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
    // the pointer is taken only once a drag begins (onMove): taken now, the
    // click that follows would land on the ground instead of the memory pressed
    const ps = [...pointers.current.values()];
    gesture.current = {
      moved: gesture.current?.moved ?? false,
      dist: ps.length > 1 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0,
      mid: ps.length > 1 ? { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 } : ps[0],
    };
  };
  const onMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !gesture.current) return;
    const r = boxRef.current!.getBoundingClientRect();
    const now = { x: e.clientX - r.left, y: e.clientY - r.top };
    pointers.current.set(e.pointerId, now);
    const ps = [...pointers.current.values()];
    if (ps.length > 1) {
      const dist = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
      const mid = { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 };
      const g = gesture.current;
      if (g.dist > 0) {
        const factor = dist / g.dist;
        setView((v) => {
          const k = Math.min(K_MAX, Math.max(K_MIN * fitView().k, v.k * factor));
          return { k, x: mid.x - ((g.mid.x - v.x) * k) / v.k, y: mid.y - ((g.mid.y - v.y) * k) / v.k };
        });
      }
      gesture.current = { moved: true, dist, mid };
      setMoving(true);
      return;
    }
    const dx = now.x - prev.x, dy = now.y - prev.y;
    if (!gesture.current.moved && Math.hypot(dx, dy) < 3) return;
    if (!gesture.current.moved) {
      try {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      } catch {
        /* it still pans; it may lose the pointer outside the window */
      }
    }
    gesture.current.moved = true;
    setMoving(true);
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      const moved = gesture.current?.moved;
      gesture.current = null;
      setMoving(false);
      // a tap on the ground, not a drag: put the selection down
      if (!moved && !(e.target as Element).closest('.l5mm-cellg, .l5mm-lobe, .l5mm-inner')) onSelect(null);
    }
  };

  // ── words, for this distance ──
  const bucket = useMemo(() => Math.pow(2, Math.round(Math.log2(Math.max(0.05, view.k)) * 2) / 2), [view.k]);
  const must = useMemo(() => new Set(selected ? [selected] : []), [selected]);
  // A phone sees the regions first — names, counts, what waits — and the
  // memories' own names only once it has come closer; never over a region's name.
  const fitK = fitView().k;
  const memoryWords = !narrow || !!open || view.k >= fitK * 1.8;
  const innerBoxes = useMemo(
    () =>
      narrow && !open
        ? scene.regions.map((r) => {
            const w = measure(REGION[r.id].short, 12, 600) + 10;
            return { x: r.cx - w / 2, y: r.cy - 16, w, h: 34 };
          })
        : [],
    [narrow, open, scene.regions, measure]
  );
  const words = useMemo(() => {
    const placed = placeWords(scene, byId, { scale: bucket, measure, must, kickers: !!open && !narrow, most: narrow ? 24 : 30, regionNames: !narrow || !!open, avoid: innerBoxes });
    return memoryWords ? placed : { labels: placed.labels.filter((l) => must.has(l.id)), names: placed.names };
  }, [scene, byId, bucket, measure, must, open, narrow, innerBoxes, memoryWords]);
  const lit = useMemo(() => (selected ? scene.fibres.filter((fb) => fb.a === selected || fb.b === selected) : []), [scene.fibres, selected]);
  const near = useMemo(() => new Set(selected ? [selected, ...lit.map((fb) => (fb.a === selected ? fb.b : fb.a))] : []), [selected, lit]);
  const relWords = useMemo(() => {
    const show = selected ? lit : open && !narrow ? scene.fibres : [];
    if (!show.length) return [];
    return placeRelWords(show, [...words.labels.map((l) => l.box), ...words.names.map((n) => n.box)], {
      scale: bucket,
      measure,
      w: scene.w,
      h: scene.h,
      words: (fb) => (fb.a === selected || !selected ? relWord(fb.rel, true) : relWord(fb.rel, false)),
    });
  }, [selected, lit, open, narrow, scene, words, bucket, measure]);
  const litIds = useMemo(() => new Set(lit.map((fb) => fb.id)), [lit]);
  const pulsed = useMemo(() => (pulse ? scene.fibres.filter((fb) => fb.a === pulse.id || fb.b === pulse.id) : []), [pulse, scene.fibres]);

  // ── the keyboard ──
  const cellRefs = useRef(new Map<string, SVGGElement>());
  useEffect(() => {
    if (selected) cellRefs.current.get(selected)?.focus({ preventScroll: true });
  }, [selected]);
  // a decision or an edit re-reads the memory and redraws it; if that took the
  // focus away with the button pressed, it comes back to the memory, so the
  // arrow keys and Esc go on working
  useEffect(() => {
    if (!selected || typeof document === 'undefined') return;
    const a = document.activeElement;
    if (!a || a === document.body) cellRefs.current.get(selected)?.focus({ preventScroll: true });
  }, [selected, scene]);
  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as Element).closest('input, textarea')) return;
    if (e.key === '+' || e.key === '=') return (e.preventDefault(), zoomAt(1.25));
    if (e.key === '-' || e.key === '_') return (e.preventDefault(), zoomAt(0.8));
    if (e.key === '0') return (e.preventDefault(), fit());
    const dir = ARROWS[e.key];
    if (!dir) return;
    e.preventDefault();
    const from = selected ? scene.cells.find((c) => c.id === selected) : null;
    if (from) {
      const to = neighbourToward(from, scene.cells, scene.fibres, dir);
      if (to) onSelect(to);
      return;
    }
    const step = 60;
    setView((v) => ({ ...v, x: v.x + (dir === 'left' ? step : dir === 'right' ? -step : 0), y: v.y + (dir === 'up' ? step : dir === 'down' ? -step : 0) }));
  };

  const k = view.k;
  const cellById = useMemo(() => new Map(scene.cells.map((c) => [c.id, c])), [scene.cells]);
  const quietOf = (m: Memory | undefined) => !!m && ((matches && !matches(m)) || (!!selected && !near.has(m.id)));

  const cell = (c: Cell) => {
    const m = byId.get(c.id);
    if (!m) return null;
    const s = m.state;
    const on = selected === c.id;
    const dim = quietOf(m);
    const r = c.r;
    const hit = Math.max(r + 5, 13 / k);
    return (
      <g
        key={c.id}
        ref={(el) => {
          if (el) cellRefs.current.set(c.id, el);
          else cellRefs.current.delete(c.id);
        }}
        className={`l5mm-cellg${on ? ' is-on' : ''}${dim ? ' is-dim' : ''}${c.ghost ? ' is-ghost' : ''}${s.faded && !on ? ' is-faded' : ''}`}
        style={{ ['--c' as string]: regionVar(m.region) }}
        role="button"
        tabIndex={on || (!selected && c === scene.cells[0]) ? 0 : -1}
        aria-label={`${m.label}. ${m.type}, ${REGION[m.region].name}. ${stateWords(m, Date.now()).join(', ')}.`}
        aria-pressed={on}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(on ? null : c.id);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(c.id);
          }
        }}
      >
        {!narrow || open
          ? dendritesOf(c.id, c.x, c.y, r).map((d, i) => <path key={i} d={d.d} className={d.fine ? 'l5mm-den is-fine' : 'l5mm-den'} />)
          : null}
        {on && <circle cx={c.x} cy={c.y} r={r + 30 / Math.max(1, k * 0.8)} fill={`url(#${uid}-sel)`} />}
        {s.recent && !on && (
          <>
            <circle cx={c.x} cy={c.y} r={r + 15} fill={`url(#${uid}-halo)`} />
            <circle cx={c.x} cy={c.y} r={r + 5.2} className="l5mm-ring" />
          </>
        )}
        {on && <circle cx={c.x} cy={c.y} r={r + 6} className="l5mm-selring" />}
        <circle cx={c.x} cy={c.y} r={r} className={`l5mm-body${s.proposed ? ' is-dashed' : ''}`} strokeDasharray={s.proposed ? `${Math.max(2.4, r * 0.38)} ${Math.max(2, r * 0.3)}` : undefined} />
        <circle cx={c.x} cy={c.y} r={r * 0.48} className="l5mm-core" opacity={s.proposed ? 0.38 : 0.58} />
        {s.pinned && (!narrow || open) && (
          <g className="l5mm-pin">
            <path d={`M${c.x + Math.cos(-2.35) * (r + 3) + 3},${c.y + Math.sin(-2.35) * (r + 3) + 3} L${c.x + Math.cos(-2.35) * (r + 3)},${c.y + Math.sin(-2.35) * (r + 3)}`} />
            <circle cx={c.x + Math.cos(-2.35) * (r + 3) - 1.5} cy={c.y + Math.sin(-2.35) * (r + 3) - 1.5} r={4.3} />
          </g>
        )}
        {s.warn && (!narrow || open) && (
          <g className="l5mm-warn" transform={`translate(${c.x + Math.cos(-0.75) * (r + 5)} ${c.y + Math.sin(-0.75) * (r + 5)})`}>
            <path d="M0,-7 L7,5.2 L-7,5.2 Z" />
            <path d="M0,-2.3 L0,1.2 M0,3.3 L0,3.5" className="l5mm-warn-on" />
          </g>
        )}
        <circle cx={c.x} cy={c.y} r={hit} className="l5mm-hit" />
      </g>
    );
  };

  const fibreEl = (fb: Fibre, litNow: boolean) => {
    const a = byId.get(fb.a), b = byId.get(fb.b);
    const dim = quietOf(a) && quietOf(b);
    return (
      <g key={fb.id} className={`l5mm-fib${fb.inter ? ' is-inter' : ''}${fb.conflict ? ' is-conflict' : ''}${litNow ? ' is-lit' : ''}${dim && !litNow ? ' is-dim' : ''}`} style={{ ['--c' as string]: a ? regionVar(a.region) : undefined }}>
        {litNow && <path d={fibrePath(fb)} className="l5mm-fib-glow" />}
        <path d={fibrePath(fb)} className="l5mm-fib-line" strokeDasharray={fb.conflict || fb.proposed ? '4 3.5' : undefined} />
      </g>
    );
  };

  const empty = !memories.length;
  return (
    <div
      ref={boxRef}
      className={`l5mm-canvas${moving ? ' is-moving' : ''}${reduced ? ' is-still' : ''}`}
      tabIndex={0}
      role="application"
      aria-roledescription="memory network"
      aria-label={open ? `${REGION[open].name}: its memories, and what connects to them` : `Your memory: ${memories.length} memories in 8 regions`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onKeyDown={onKey}
    >
      <svg className="l5mm-svg" width={size.w || '100%'} height={size.h || '100%'} aria-hidden={empty || undefined}>
        <defs>
          <radialGradient id={`${uid}-halo`}>
            <stop offset="0%" className="l5mm-stop-halo" stopOpacity={0.42} />
            <stop offset="100%" className="l5mm-stop-halo" stopOpacity={0} />
          </radialGradient>
          <radialGradient id={`${uid}-sel`}>
            <stop offset="0%" className="l5mm-stop-halo" stopOpacity={0.55} />
            <stop offset="55%" className="l5mm-stop-halo" stopOpacity={0.18} />
            <stop offset="100%" className="l5mm-stop-halo" stopOpacity={0} />
          </radialGradient>
          {scene.regions.map((r) => (
            <radialGradient key={r.id} id={`${uid}-rg-${r.id}`} cx="50%" cy="45%" r="60%">
              <stop offset="0%" style={{ stopColor: regionVar(r.id) }} stopOpacity={0.12} />
              <stop offset="100%" style={{ stopColor: regionVar(r.id) }} stopOpacity={0.04} />
            </radialGradient>
          ))}
          {scene.tracts.map((t) => (
            <linearGradient key={`${t.a}-${t.b}`} id={`${uid}-tr-${t.a}-${t.b}`} gradientUnits="userSpaceOnUse" x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}>
              <stop offset="0" className="l5mm-stop-tract" stopOpacity={0} />
              <stop offset={t.inA} className="l5mm-stop-tract" stopOpacity={0.22} />
              <stop offset={1 - t.inB} className="l5mm-stop-tract" stopOpacity={0.22} />
              <stop offset="1" className="l5mm-stop-tract" stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <g className="l5mm-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${k})` }}>
          {scene.regions.map((r) => (
            <g
              key={r.id}
              className={`l5mm-lobe${r.quiet ? ' is-quiet' : ''}${r.strong ? ' is-strong' : ''}${r.count ? '' : ' is-empty'}`}
              style={{ ['--c' as string]: regionVar(r.id) }}
              onClick={(e) => {
                if (r.strong) return;
                e.stopPropagation();
                onOpen(r.id);
              }}
            >
              <path d={r.d} fill={`url(#${uid}-rg-${r.id})`} className="l5mm-lobe-fill" />
              <path d={r.d} className="l5mm-lobe-edge" />
            </g>
          ))}
          {scene.tracts.map((t) => (
            <path key={`${t.a}-${t.b}`} d={t.d} fill={`url(#${uid}-tr-${t.a}-${t.b})`} className="l5mm-tract" />
          ))}
          <g className="l5mm-fibs">{scene.fibres.filter((fb) => !litIds.has(fb.id)).map((fb) => fibreEl(fb, false))}</g>
          <g className="l5mm-fibs is-lit">{lit.map((fb) => fibreEl(fb, true))}</g>
          {pulsed.map((fb) => (
            <path key={`${pulse?.key}-${fb.id}`} d={fibrePath(fb)} className={`l5mm-pulse${reduced ? ' is-still' : ''}`} pathLength={100} />
          ))}
          <g className="l5mm-cells">{scene.cells.map(cell)}</g>
          {/* names: regions, then memories, then the words of what is lit */}
          {words.names.map((n) => (
            <g key={n.id} className={`l5mm-rname${n.quiet ? ' is-quiet' : ''}`} style={{ ['--c' as string]: regionVar(n.id) }} onClick={(e) => (e.stopPropagation(), onOpen(n.id))}>
              <text x={n.x} y={n.y} style={{ fontSize: n.fs }} className="l5mm-rname-t">
                {n.text}
              </text>
              <text x={n.cx} y={n.y} style={{ fontSize: n.fs }} className="l5mm-rname-n">
                {n.count}
              </text>
            </g>
          ))}
          {narrow &&
            !open &&
            scene.regions.map((r) => (
              <g key={r.id} className="l5mm-inner" style={{ ['--c' as string]: regionVar(r.id) }} onClick={(e) => (e.stopPropagation(), onOpen(r.id))}>
                <text x={r.cx} y={r.cy - 2} textAnchor="middle" className="l5mm-inner-t">
                  {REGION[r.id].short}
                </text>
                <text x={r.cx} y={r.cy + 12} textAnchor="middle" className="l5mm-inner-s">
                  {r.count}
                  {reviewCounts[r.id] ? <tspan className="l5mm-inner-rv">{` · ${reviewCounts[r.id]} to review`}</tspan> : null}
                </text>
              </g>
            ))}
          {words.labels.map((l) => {
            const m = byId.get(l.id);
            const dim = quietOf(m);
            return (
              <g key={l.id} className={`l5mm-lbl t${l.tier}${dim ? ' is-dim' : ''}${m?.state.faded ? ' is-faded' : ''}${selected === l.id ? ' is-on' : ''}`}>
                {l.kicker && (
                  <text x={l.x} y={l.y - l.fs - 3 / bucket} textAnchor={l.anchor} className="l5mm-kick" style={{ fontSize: 9.5 / bucket }}>
                    {l.kicker}
                  </text>
                )}
                <text x={l.x} y={l.y} textAnchor={l.anchor} style={{ fontSize: l.fs }} className={`l5mm-lbl-t${l.kicker ? ' is-big' : ''}`}>
                  {l.text}
                </text>
              </g>
            );
          })}
          {relWords.map((w) => {
            const fb = scene.fibres.find((x) => x.id === w.id);
            return (
              <g key={w.id} className={`l5mm-relw${litIds.has(w.id) ? ' is-lit' : ''}${fb?.conflict ? ' is-conflict' : ''}`}>
                <rect x={w.box.x} y={w.box.y} width={w.box.w} height={w.box.h} rx={w.box.h / 2} />
                <text x={w.x} y={w.y + 4 / bucket} textAnchor="middle" style={{ fontSize: 12.5 / bucket }}>
                  {fb ? (fb.a === selected || !selected ? relWord(fb.rel, true) : relWord(fb.rel, false)) : ''}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      {hint}
      <div className="l5mm-ctl l5mm-legend-at">
        <Legend folded={!!open || narrow} />
      </div>
      <div className="l5mm-ctl l5mm-zoom" role="group" aria-label="Zoom">
        <button type="button" aria-label="Zoom out" onClick={() => zoomAt(0.8)}>
          <Icon name="minus" />
        </button>
        <button type="button" aria-label="Zoom in" onClick={() => zoomAt(1.25)}>
          <Icon name="plus" />
        </button>
        <i aria-hidden="true" />
        <button type="button" className="l5mm-fit" onClick={fit}>
          Fit all
        </button>
      </div>
      {children}
      {/* the network, in words, for whoever does not see it: every memory is in the list beside it */}
      <p className="l5mm-sr" aria-live="polite">
        {selected && byId.get(selected) ? `${byId.get(selected)!.label} selected. ${lit.length} relationships. Arrow keys move along them.` : ''}
      </p>
      {cellById.size === 0 && !empty && <p className="l5mm-none">Nothing here matches.</p>}
    </div>
  );
}
