'use client';
// components/ux-v0/design/Canvas.tsx — the artboards, side by side on a surface that pans and zooms.
//
// Each artboard is its own sandboxed frame (lib/ux-v0/design/frame.ts), drawn at its real size and scaled with the
// surface, so what is seen is the artboard itself, not a picture of it. The frame's own script reports hover, select,
// drag, text edits and keys by postMessage; they are accepted here only from the frame they claim to come from and
// only in the shapes expected, then handed to the workspace as edits by element id.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STATE_LABEL, type DesignArtboard, type DesignDoc } from '@/lib/ux-v0/design/doc';
import { frameDoc } from '@/lib/ux-v0/design/frame';
import { sizeLabel, formatOf } from '@/lib/ux-v0/design/formats';
import { parseHtml } from './runtime';

export interface ElementPick {
  artboard: string;
  id: string;
  tag: string;
  text: string;
  textual: boolean;
  classes: string;
  inline: string;
  parent: string | null;
  box: { x: number; y: number; w: number; h: number };
  style: Record<string, string>;
}

export type FrameEvent =
  | { type: 'select'; artboard: string; pick: ElementPick | null }
  | { type: 'move'; artboard: string; id: string; dx: number; dy: number }
  | { type: 'text'; artboard: string; id: string; text: string }
  | { type: 'key'; artboard: string; key: string; shift: boolean; mod: boolean }
  | { type: 'ready'; artboard: string; issues: { id: string; kind: string; text: string }[]; height: number };

export interface View {
  x: number;
  y: number;
  k: number;
}

const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
const ID = /^e\d{1,6}$/;

/** A message from a frame, held to its shape (see the head of this file). */
function readMessage(artboard: string, m: any): FrameEvent | null {
  if (!m || typeof m !== 'object') return null;
  if (m.sx === 'select') {
    if (m.id == null) return { type: 'select', artboard, pick: null };
    if (!ID.test(String(m.id))) return null;
    const style: Record<string, string> = {};
    for (const [k, v] of Object.entries(m.style && typeof m.style === 'object' ? m.style : {}).slice(0, 60)) if (/^[a-z-]{1,40}$/.test(k)) style[k] = str(v, 300);
    const box = m.box && typeof m.box === 'object' ? m.box : {};
    return {
      type: 'select',
      artboard,
      pick: { artboard, id: String(m.id), tag: str(m.tag, 20), text: str(m.text, 200), textual: m.textual === true, classes: str(m.classes, 120), inline: str(m.inline, 600), parent: typeof m.parent === 'string' && ID.test(m.parent) ? m.parent : null, box: { x: Number(box.x) || 0, y: Number(box.y) || 0, w: Number(box.w) || 0, h: Number(box.h) || 0 }, style },
    };
  }
  if (m.sx === 'move' && ID.test(String(m.id)) && Number.isFinite(m.dx) && Number.isFinite(m.dy)) return { type: 'move', artboard, id: String(m.id), dx: Math.max(-20000, Math.min(20000, m.dx)), dy: Math.max(-20000, Math.min(20000, m.dy)) };
  if (m.sx === 'text' && ID.test(String(m.id)) && typeof m.text === 'string') return { type: 'text', artboard, id: String(m.id), text: m.text.slice(0, 5000) };
  if (m.sx === 'key' && typeof m.key === 'string') return { type: 'key', artboard, key: m.key.slice(0, 20), shift: !!m.shift, mod: !!m.mod };
  if (m.sx === 'ready' && !m.passive) return { type: 'ready', artboard, issues: Array.isArray(m.issues) ? m.issues.slice(0, 20).map((x: any) => ({ id: str(x?.id, 12), kind: str(x?.kind, 12), text: str(x?.text, 60) })) : [], height: Number(m.height) || 0 };
  return null;
}

interface FrameProps {
  a: DesignArtboard;
  tokens: string;
  assets: ReadonlyMap<string, string>;
  assetsKey: string;
  nonce: string;
  interactive: boolean;
  selectedElement: string | null;
  /** what the person has protected on it: element ids (joined), or everything */
  locks: string;
  lockAll: boolean;
  register: (id: string, w: Window | null) => void;
}

const ArtboardFrame = memo(function ArtboardFrame({ a, tokens, assets, assetsKey, nonce, interactive, selectedElement, locks, lockAll, register }: FrameProps) {
  const ref = useRef<HTMLIFrameElement>(null);
  // the page, made again only when what it draws changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const doc = useMemo(() => frameDoc(a, tokens, { parse: parseHtml, nonce, assets, interactive: true }), [a.html, a.width, a.height, tokens, assetsKey, nonce]);
  useEffect(() => {
    register(a.id, ref.current?.contentWindow ?? null);
    return () => register(a.id, null);
  }, [a.id, register, doc]);
  // the selection and the mode follow every load
  const tell = useCallback(() => {
    const w = ref.current?.contentWindow;
    if (!w) return;
    w.postMessage({ sx: 'mode', mode: interactive ? 'select' : 'none' }, '*');
    w.postMessage({ sx: 'locks', ids: locks ? locks.split(',') : [], all: lockAll }, '*');
    w.postMessage({ sx: 'select', id: selectedElement, report: !!selectedElement }, '*');
  }, [interactive, selectedElement, locks, lockAll]);
  useEffect(tell, [tell]);
  return <iframe ref={ref} className="dx-frame" title={a.name} sandbox="allow-scripts" srcDoc={doc} width={a.width} height={a.height} onLoad={tell} style={{ width: a.width, height: a.height }} />;
});

export interface CanvasProps {
  doc: DesignDoc;
  assets: ReadonlyMap<string, string>;
  nonce: string;
  interactive: boolean;
  /** artboards being written right now */
  writing: ReadonlySet<string>;
  selected: { artboard: string | null; element: string | null };
  view: View;
  onView: (v: View) => void;
  onSelectArtboard: (id: string | null) => void;
  onFrame: (e: FrameEvent) => void;
  onRename: (id: string, name: string) => void;
  onMenu: (id: string, action: 'duplicate' | 'delete' | 'variations' | 'export') => void;
  /** dim everything but these (a comparison, a review): absent, nothing is dimmed */
  focus?: ReadonlySet<string> | null;
  comments: Record<string, number>;
  /** set by the canvas: a message to one artboard's frame (select the parent, show an element) */
  control?: React.MutableRefObject<((artboard: string, msg: Record<string, unknown>) => void) | null>;
}

/** The view that shows every artboard in a box of this size. */
export function fitView(doc: DesignDoc, w: number, h: number, pad = 80): View {
  if (!doc.artboards.length) return { x: w / 2, y: h / 2, k: 0.5 };
  const x0 = Math.min(...doc.artboards.map((a) => a.x));
  const y0 = Math.min(...doc.artboards.map((a) => a.y)) - 40;
  const x1 = Math.max(...doc.artboards.map((a) => a.x + a.width));
  const y1 = Math.max(...doc.artboards.map((a) => a.y + a.height));
  const k = Math.max(0.03, Math.min(1, Math.min((w - pad * 2) / (x1 - x0), (h - pad * 2) / (y1 - y0))));
  return { k, x: (w - (x1 - x0) * k) / 2 - x0 * k, y: (h - (y1 - y0) * k) / 2 - y0 * k };
}

export function Canvas(p: CanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const windows = useRef(new Map<string, Window>());
  const [panning, setPanning] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  // a frame drawn again from the document (a drag or a retyping that was refused, or let go, leaves no trace)
  const [bumps, setBumps] = useState<Record<string, number>>({});
  const redraw = useCallback((id: string) => setBumps((b) => ({ ...b, [id]: (b[id] ?? 0) + 1 })), []);
  const assetsKey = useMemo(() => [...p.assets.keys()].sort().join(','), [p.assets]);
  const onFrame = useRef(p.onFrame);
  onFrame.current = p.onFrame;

  const register = useCallback((id: string, w: Window | null) => {
    if (w) windows.current.set(id, w);
    else windows.current.delete(id);
  }, []);
  if (p.control) p.control.current = (artboard, msg) => (msg.sx === 'redraw' ? redraw(artboard) : windows.current.get(artboard)?.postMessage(msg, '*'));

  useEffect(() => {
    const on = (e: MessageEvent) => {
      for (const [id, w] of windows.current) {
        if (e.source !== w) continue;
        if (e.data && typeof e.data === 'object' && e.data.sx === 'redraw') return redraw(id);
        const ev = readMessage(id, e.data);
        if (ev) onFrame.current(ev);
        return;
      }
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [redraw]);

  // zoom about the pointer (ctrl or ⌘ with the wheel, or a pinch); pan with the wheel
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const v = viewRef.current;
      if (e.ctrlKey || e.metaKey) {
        const k = Math.max(0.03, Math.min(4, v.k * Math.exp(-e.deltaY * 0.0025)));
        const mx = e.clientX - r.left;
        const my = e.clientY - r.top;
        p.onView({ k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k });
      } else p.onView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.onView]);
  const viewRef = useRef(p.view);
  viewRef.current = p.view;

  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const down = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains('dx-world')) return;
    drag.current = { x: e.clientX, y: e.clientY, vx: p.view.x, vy: p.view.y, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
    d.moved = true;
    setPanning(true);
    p.onView({ ...p.view, x: d.vx + dx, y: d.vy + dy });
  };
  const up = () => {
    if (drag.current && !drag.current.moved) p.onSelectArtboard(null);
    drag.current = null;
    setPanning(false);
  };

  return (
    <div ref={host} className={`dx-canvas${panning ? ' is-panning' : ''}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <div className="dx-world" style={{ transform: `translate(${p.view.x}px, ${p.view.y}px) scale(${p.view.k})` }}>
        {p.doc.artboards.map((a) => {
          const isSel = p.selected.artboard === a.id;
          const f = formatOf(a.format);
          const dim = !!p.focus && !p.focus.has(a.id);
          return (
            <div key={a.id} className={`dx-board${isSel ? ' is-sel' : ''}${p.writing.has(a.id) ? ' is-writing' : ''}${a.state ? ` is-${a.state}` : ''}${a.locked ? ' is-locked' : ''}${dim ? ' is-dim' : ''}`} data-artboard={a.id} style={{ left: a.x, top: a.y, width: a.width, height: a.height }}>
              <div className="dx-label" style={{ transform: `scale(${1 / p.view.k})`, transformOrigin: 'left bottom' }}>
                {renaming === a.id ? (
                  <input
                    autoFocus
                    className="dx-rename"
                    defaultValue={a.name}
                    onBlur={(e) => {
                      p.onRename(a.id, e.target.value.trim().slice(0, 80) || a.name);
                      setRenaming(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                  />
                ) : (
                  <button type="button" className="dx-label-name" onClick={() => p.onSelectArtboard(a.id)} onDoubleClick={() => setRenaming(a.id)} title="Select; double-click to rename">
                    {a.name}
                  </button>
                )}
                <span className="dx-label-size">{f ? sizeLabel(f) : `${a.width} × ${a.height}`}</span>
                {a.state ? <span className={`dx-state is-${a.state}`}>{STATE_LABEL[a.state]}</span> : null}
                {a.locked && a.state !== 'approved' ? <span className="dx-state is-lock">Locked</span> : null}
                {!a.locked && a.locks?.length ? <span className="dx-label-note">{a.locks.length} protected</span> : null}
                {a.seconds ? <span className="dx-label-note">{a.seconds} s</span> : null}
                {p.comments[a.id] ? <span className="dx-label-note">{p.comments[a.id]} note{p.comments[a.id] === 1 ? '' : 's'}</span> : null}
                {isSel && (
                  <span className="dx-label-acts">
                    <button type="button" onClick={() => p.onMenu(a.id, 'variations')} title="Three different directions beside it">
                      Variations
                    </button>
                    <button type="button" onClick={() => p.onMenu(a.id, 'duplicate')}>
                      Duplicate
                    </button>
                    <button type="button" onClick={() => p.onMenu(a.id, 'export')}>
                      Export
                    </button>
                    <button type="button" onClick={() => p.onMenu(a.id, 'delete')} className="is-danger" disabled={!!a.locked} title={a.locked ? 'Unlock or reopen it first' : undefined}>
                      Delete
                    </button>
                  </span>
                )}
              </div>
              <ArtboardFrame key={bumps[a.id] ?? 0} a={a} tokens={p.doc.tokens} assets={p.assets} assetsKey={assetsKey} nonce={p.nonce} interactive={p.interactive && !panning} selectedElement={isSel ? p.selected.element : null} locks={(a.locks ?? []).map((l) => l.id).join(',')} lockAll={!!a.locked} register={register} />
              {!p.interactive && !p.writing.has(a.id) && <div className="dx-shield" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
