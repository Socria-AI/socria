'use client';
// components/ux-v0/Frame.tsx — a page, drawn in the sandbox, and the inspector's voice.
//
// The iframe is `sandbox="allow-scripts"` and never `allow-same-origin`: the
// page runs at an opaque origin and cannot reach Socria. Everything it says
// arrives by postMessage, and is believed only if it comes from this frame's
// own window and has the inspector's shape; element captures pass the
// normaliser (lib/ux-v0/types.ts) before anything uses them. A page can lie
// about itself — about what was clicked — but never about anything else.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { normalizeCapture, type Box, type ElementCapture } from '@/lib/ux-v0/types';

export type FrameMode = 'element' | 'area' | 'none';

export type Step = 'parent' | 'child' | 'prev' | 'next';

/** Is this what the inspector sends for an element? Anything else from the frame is ignored. */
export function wellFormed(e: unknown): e is Record<string, unknown> {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return false;
  const r = e as Record<string, unknown>;
  const b = r.box as Record<string, unknown> | null | undefined;
  if (typeof r.tag !== 'string' || !/^[a-z][a-z0-9-]{0,23}$/i.test(r.tag)) return false;
  if (typeof r.selector !== 'string' || !r.selector || r.selector.length > 600) return false;
  if (!b || typeof b !== 'object') return false;
  const nums = [b.x, b.y, b.w, b.h];
  return nums.every((v) => typeof v === 'number' && Number.isFinite(v)) && (b.w as number) > 0 && (b.h as number) > 0;
}

export interface FrameHandle {
  query: (rect: Box) => Promise<{ elements: ElementCapture[]; container: string } | null>;
  /** find an element by its selector, or step from it to its parent, first child or a sibling */
  pick: (selector: string, step?: Step) => Promise<ElementCapture | null>;
}

export interface WheelLikeMsg {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  x: number;
  y: number;
}

interface Props {
  doc: string;
  width: number;
  height: number;
  mode: FrameMode;
  title: string;
  onReady: (info: { width: number; height: number; outline: string }) => void;
  onSize: (height: number) => void;
  onHover: (box: Box | null, label: string) => void;
  onSelect: (c: ElementCapture) => void;
  onWheel: (w: WheelLikeMsg) => void;
  onKey: (key: string, mod: boolean) => void;
  onMissing: (list: string[]) => void;
}

const n = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const boxOf = (v: any): Box | null => (v && typeof v === 'object' ? { x: n(v.x), y: n(v.y), w: Math.max(0, n(v.w)), h: Math.max(0, n(v.h)) } : null);

export const Frame = forwardRef<FrameHandle, Props>(function Frame(p, ref) {
  const frame = useRef<HTMLIFrameElement>(null);
  const pending = useRef(new Map<string, (v: any) => void>());
  const props = useRef(p);
  props.current = p;
  const ready = useRef(false);

  const send = useCallback((m: Record<string, unknown>) => {
    frame.current?.contentWindow?.postMessage({ ...m, __uxv0: 1 }, '*');
  }, []);

  const ask = useCallback(
    <T,>(m: Record<string, unknown>, timeout = 3000): Promise<T | null> =>
      new Promise((resolve) => {
        const id = Math.random().toString(36).slice(2);
        const t = window.setTimeout(() => {
          pending.current.delete(id);
          resolve(null);
        }, timeout);
        pending.current.set(id, (v) => {
          window.clearTimeout(t);
          resolve(v);
        });
        send({ ...m, id });
      }),
    [send]
  );

  useImperativeHandle(
    ref,
    () => ({
      query: async (rect) => {
        const r = await ask<any>({ type: 'query', rect });
        if (!r || typeof r !== 'object') return null;
        return { elements: (Array.isArray(r.elements) ? r.elements : []).slice(0, 12).map(normalizeCapture), container: String(r.container ?? '').slice(0, 200) };
      },
      pick: async (selector, step) => {
        const r = await ask<any>(step ? { type: 'step', dir: step, selector } : { type: 'pick', selector });
        return r ? normalizeCapture(r) : null;
      },
    }),
    [ask]
  );

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const m = e.data;
      if (!m || typeof m !== 'object' || m.__uxv0 !== 1 || typeof m.type !== 'string') return;
      const P = props.current;
      switch (m.type) {
        case 'ready':
          ready.current = true;
          send({ type: 'mode', mode: P.mode });
          P.onReady({ width: n(m.width), height: n(m.height), outline: typeof m.outline === 'string' ? m.outline.slice(0, 2400) : '' });
          break;
        case 'size':
          P.onSize(n(m.height));
          break;
        case 'hover':
          P.onHover(boxOf(m.box), typeof m.label === 'string' ? m.label.slice(0, 80) : '');
          break;
        case 'select': {
          // only a real capture becomes a selection: a tag, a selector and a box with size
          const el = wellFormed(m.element) ? m.element : null;
          if (typeof m.id === 'string' && pending.current.has(m.id)) {
            pending.current.get(m.id)!(el);
            pending.current.delete(m.id);
          } else if (el) P.onSelect(normalizeCapture(el));
          break;
        }
        case 'area':
          if (typeof m.id === 'string' && pending.current.has(m.id)) {
            pending.current.get(m.id)!(m.result ?? null);
            pending.current.delete(m.id);
          }
          break;
        case 'wheel':
          P.onWheel({ deltaX: n(m.deltaX), deltaY: n(m.deltaY), deltaMode: n(m.deltaMode), ctrlKey: !!m.ctrlKey, metaKey: !!m.metaKey, shiftKey: !!m.shiftKey, x: n(m.x), y: n(m.y) });
          break;
        case 'key':
          if (typeof m.key === 'string') P.onKey(m.key.slice(0, 12), !!m.metaKey || !!m.ctrlKey);
          break;
        case 'missing':
          if (Array.isArray(m.list)) P.onMissing(m.list.filter((x: unknown): x is string => typeof x === 'string').slice(0, 30).map((x: string) => x.slice(0, 300)));
          break;
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [send]);

  // a new document: the inspector says ready again
  useEffect(() => {
    ready.current = false;
  }, [p.doc]);

  useEffect(() => {
    if (ready.current) send({ type: 'mode', mode: p.mode });
  }, [p.mode, send]);

  return (
    <iframe
      ref={frame}
      className="v0-frame"
      title={p.title}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      srcDoc={p.doc}
      style={{ width: p.width, height: p.height, pointerEvents: p.mode === 'element' ? 'auto' : 'none' }}
    />
  );
});
