'use client';
// components/share/RemoteCursors.tsx
//
// LIVE POINTERS ON A SHARED MAP. Each person's pointer is sent in MAP
// coordinates (lib/share/sync.ts toWorld) — not screen pixels — so it lands on
// the same card for everyone, whatever each of them has panned or zoomed to.
// Each screen turns them back with its own camera, read off the map's world
// layer, every frame, so a pointer stays on its card while you pan.

import { useEffect, useRef, useState } from 'react';
import { camFromTransform, toScreen, toWorld } from '@/lib/share/sync';
import { hueOf } from '@/lib/share/hue';

const MAP = '.logos-root .lg-map:not(.is-embedded)';

function mapParts(): { map: HTMLElement; world: HTMLElement | null } | null {
  const map = document.querySelector<HTMLElement>(MAP);
  if (!map) return null;
  return { map, world: map.querySelector<HTMLElement>('.lg-map-world') };
}

/** Report this person's pointer over the map, in map coordinates (null when it leaves). */
export function useMapPointer(enabled: boolean, onPoint: (p: { x: number; y: number } | null) => void) {
  const cb = useRef(onPoint);
  cb.current = onPoint;
  useEffect(() => {
    if (!enabled) return;
    let bound: HTMLElement | null = null;
    const move = (e: PointerEvent) => {
      const parts = mapParts();
      if (!parts) return;
      const r = parts.map.getBoundingClientRect();
      const cam = camFromTransform(parts.world ? getComputedStyle(parts.world).transform : null);
      cb.current(toWorld({ x: e.clientX - r.left, y: e.clientY - r.top }, cam));
    };
    const leave = () => cb.current(null);
    // the map is mounted and remounted as lenses and views change: find it again
    const attach = () => {
      const el = document.querySelector<HTMLElement>(MAP);
      if (el === bound) return;
      bound?.removeEventListener('pointermove', move);
      bound?.removeEventListener('pointerleave', leave);
      bound = el;
      el?.addEventListener('pointermove', move);
      el?.addEventListener('pointerleave', leave);
    };
    attach();
    const t = setInterval(attach, 1000);
    return () => {
      clearInterval(t);
      bound?.removeEventListener('pointermove', move);
      bound?.removeEventListener('pointerleave', leave);
    };
  }, [enabled]);
}

interface Person {
  id: string;
  name: string;
  you: boolean;
  cursor: { x: number; y: number; on?: string } | null;
}

/** Everyone else's pointer, drawn where it is on their map — and so on this one. */
export function RemoteCursors({ people }: { people: Person[] }) {
  const others = people.filter((p) => !p.you && p.cursor && p.cursor.on === 'map');
  const [placed, setPlaced] = useState<{ id: string; name: string; x: number; y: number; hue: string }[]>([]);
  const list = useRef(others);
  list.current = others;
  useEffect(() => {
    if (!others.length) {
      setPlaced([]);
      return;
    }
    let raf = 0;
    const frame = () => {
      const parts = mapParts();
      if (parts) {
        const r = parts.map.getBoundingClientRect();
        const cam = camFromTransform(parts.world ? getComputedStyle(parts.world).transform : null);
        const next = list.current
          .map((p) => {
            const s = toScreen(p.cursor!, cam);
            return { id: p.id, name: p.name, x: r.left + s.x, y: r.top + s.y, hue: hueOf(p.id), inside: s.x >= 0 && s.y >= 0 && s.x <= r.width && s.y <= r.height };
          })
          .filter((p) => p.inside);
        setPlaced((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [others.length]);
  if (!placed.length) return null;
  return (
    <div className="rc-layer" aria-hidden="true">
      {placed.map((p) => (
        <div key={p.id} className="rc-cursor" style={{ transform: `translate(${p.x}px, ${p.y}px)` }}>
          <svg width="18" height="22" viewBox="0 0 18 22">
            <path d="M1 1 L1 17 L5.6 13.2 L8.6 20.4 L11.6 19.1 L8.7 12 L15 12 Z" fill={p.hue} stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
          <span style={{ background: p.hue }}>{p.name}</span>
        </div>
      ))}
    </div>
  );
}
