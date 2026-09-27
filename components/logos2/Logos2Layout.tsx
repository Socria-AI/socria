'use client';

// components/logos2/Logos2Layout.tsx
//
// Logos 2's workspace, and the reader decides what is in it.
//
// THE POINT. A reasoning environment that always shows four panes is a reading
// experience someone else chose. Sometimes the map IS the work and the
// transcript is noise; sometimes the opposite; sometimes a black hole needs the
// whole window and everything else should get out of the way. So every pane
// closes, every closed pane comes back from one chip, and the split between the
// two columns is dragged rather than fixed.
//
// WHAT THE LAYOUT OWNS AND WHAT IT DOES NOT. It owns which panes exist, how
// wide the columns are, and nothing else — each pane's content is passed in and
// keeps its own state. That is why closing the map does not reset the surface's
// camera, and why the surface can go full screen without the layout knowing.
//
// IT REMEMBERS. A workspace somebody arranged and lost on reload is a workspace
// they will not arrange twice, so the pane set and the split are written to
// localStorage. Wrapped, because private mode throws rather than returning
// null, and a layout that crashes on a privacy setting is worse than one that
// forgets.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

export type PaneId = 'rail' | 'chat' | 'map' | 'surface';

export interface PaneDef {
  id: PaneId;
  /** the word on the chip that brings it back */
  label: string;
  /** what sits in the title bar */
  title: string;
  node: ReactNode;
}

const KEY = 'socria.logos2.layout.v1';
const ALL: PaneId[] = ['rail', 'chat', 'map', 'surface'];

interface Saved {
  open: PaneId[];
  split: number;
  railW: number;
}

function load(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Saved;
    if (!Array.isArray(v.open)) return null;
    return {
      open: v.open.filter((p) => ALL.includes(p)),
      split: typeof v.split === 'number' ? v.split : 0.52,
      railW: typeof v.railW === 'number' ? v.railW : 260,
    };
  } catch {
    return null;
  }
}

export function Logos2Layout({ panes, title }: { panes: PaneDef[]; title: string }) {
  const [open, setOpen] = useState<PaneId[]>(ALL);
  const [split, setSplit] = useState(0.52);
  const [railW, setRailW] = useState(260);
  const [ready, setReady] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const drag = useRef<{ kind: 'split' | 'rail'; x: number; v: number } | null>(null);

  // Read the saved layout AFTER mount: localStorage does not exist on the
  // server, and rendering a different tree there than here is a hydration
  // mismatch. One frame of the default layout is the price.
  useEffect(() => {
    const s = load();
    if (s) {
      setOpen(s.open);
      setSplit(s.split);
      setRailW(s.railW);
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ open, split, railW }));
    } catch {
      /* private mode: the layout simply will not be remembered */
    }
  }, [ready, open, split, railW]);

  const shown = panes.filter((p) => open.includes(p.id));
  const has = (id: PaneId) => open.includes(id);
  const close = useCallback((id: PaneId) => setOpen((o) => o.filter((x) => x !== id)), []);
  const show = useCallback(
    (id: PaneId) => setOpen((o) => (o.includes(id) ? o : [...ALL.filter((x) => o.includes(x) || x === id)])),
    []
  );

  const down = useCallback(
    (kind: 'split' | 'rail') => (e: React.PointerEvent) => {
      drag.current = { kind, x: e.clientX, v: kind === 'split' ? split : railW };
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* uncapturable pointers still drag */
      }
      e.preventDefault();
    },
    [split, railW]
  );
  const move = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'rail') {
      setRailW(Math.min(420, Math.max(150, d.v + (e.clientX - d.x))));
    } else {
      const w = body.current?.clientWidth || 1000;
      setSplit(Math.min(0.82, Math.max(0.18, d.v + (e.clientX - d.x) / w)));
    }
  }, []);
  const up = useCallback(() => {
    drag.current = null;
  }, []);

  const pane = (id: PaneId) => shown.find((p) => p.id === id);
  const chat = pane('chat');
  const map = pane('map');
  const surface = pane('surface');
  const rail = pane('rail');
  const right = [map, surface].filter(Boolean) as PaneDef[];
  const closed = ALL.filter((id) => !open.includes(id));

  const Head = ({ p }: { p: PaneDef }) => (
    <div className="l2-head">
      <span className="l2-title">{p.title}</span>
      <button type="button" className="l2-x" onClick={() => close(p.id)} aria-label={`Close ${p.label}`}>
        ×
      </button>
    </div>
  );

  return (
    // `logos-root` as well as `l2`: the Thinking Map's whole stylesheet is
    // scoped under it in app/globals.css, so a map mounted outside that scope
    // renders as an unstyled stack of lens names and a bare table — which is
    // exactly what the first render of this layout showed.
    <div className="l2 logos-root">
      <div className="l2-top">
        <span className="l2-brand">{title}</span>
        <span className="l2-restore">
          {closed.length === 0 ? (
            <span className="l2-hint">Every pane closes. Drag the dividers to resize.</span>
          ) : (
            closed.map((id) => {
              const p = panes.find((q) => q.id === id);
              return (
                <button key={id} type="button" className="l2-chip" onClick={() => show(id)}>
                  + {p?.label ?? id}
                </button>
              );
            })
          )}
        </span>
      </div>

      <div className="l2-body" ref={body} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        {rail && (
          <>
            <aside className="l2-pane l2-rail" style={{ width: railW }}>
              <Head p={rail} />
              <div className="l2-fill">{rail.node}</div>
            </aside>
            <div className="l2-split" onPointerDown={down('rail')} role="separator" aria-orientation="vertical" />
          </>
        )}

        {chat && (
          <section
            className="l2-pane l2-chat"
            style={{ flex: right.length ? `0 0 ${(split * 100).toFixed(2)}%` : '1 1 auto' }}
          >
            <Head p={chat} />
            <div className="l2-fill">{chat.node}</div>
          </section>
        )}

        {chat && right.length > 0 && (
          <div className="l2-split" onPointerDown={down('split')} role="separator" aria-orientation="vertical" />
        )}

        {right.length > 0 && (
          <div className="l2-col">
            {right.map((p) => (
              <section key={p.id} className="l2-pane">
                <Head p={p} />
                <div className="l2-fill">{p.node}</div>
              </section>
            ))}
          </div>
        )}

        {shown.length === 0 && (
          <div className="l2-empty">
            <p>Nothing open.</p>
            <span>
              {ALL.map((id) => (
                <button key={id} type="button" className="l2-chip" onClick={() => show(id)}>
                  + {panes.find((q) => q.id === id)?.label ?? id}
                </button>
              ))}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
