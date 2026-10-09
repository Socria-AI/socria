'use client';
// components/workspace/Workspace.tsx
//
// The Logos 3 workspace shell: it draws a layout (lib/workspace/tiling.ts) and
// nothing else. It owns no canonical state — every panel's content comes from
// the host's `render`, which draws the host's surfaces over the host's state —
// and it writes only the layout, which is the person's own arrangement.
//
// SIMPLE AT REST, POWERFUL ON DEMAND. The architecture underneath is a tiling
// tree of any surfaces; what a person sees is ONE thing in focus. A single
// panel has no chrome at all. Several panels are separated by hairlines, and
// each shows its name and its two controls (maximise, close) only while the
// pointer is over it. There is no row of modes: the ways the workspace can be
// arranged are offered inside "+ View", and only the ones that mean something
// for what is here. "+ View" also lists every kind of view there is (All
// views), each one opened or put away from there — a view with nothing to show
// yet still opens, and the menu says why it is empty. The conversation is a
// composer beneath the stage (the host's `dock`) until somebody wants more of it.
//
// THE HUMAN OWNS THE ARRANGEMENT. Nothing here moves unless a person moved it
// or accepted a suggestion to. A suggestion is one quiet line with an Open and
// a Not now.

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  closePanel,
  dominantPanel,
  maximize,
  movePanel,
  panelsOf,
  resizeSplit,
  restore,
  type LayoutNode,
  type PanelConfig,
  type PanelNode,
  type SplitNode,
  type SurfaceType,
  type WorkspaceLayout,
} from '@/lib/workspace/tiling';
import {
  closeView,
  openBeside,
  openView,
  viewCatalogue,
  type Arrangement,
  type CatalogueEntry,
  type LayoutSuggestion,
  type ViewSuggestion,
  type WorkspaceFacts,
} from '@/lib/workspace/surfaces';
import './workspace.css';

type Zone = 'left' | 'right' | 'top' | 'bottom' | 'center';

/** Where the conversation sits around the stage. The person's choice; kept per browser by the host. */
export type DockSide = 'bottom' | 'top' | 'left' | 'right';
export const DOCK_SIDES: readonly DockSide[] = ['bottom', 'top', 'left', 'right'];

export interface WorkspaceProps {
  layout: WorkspaceLayout;
  onLayout: (next: WorkspaceLayout) => void;
  /** the surface for a panel — the host's own components over the host's state */
  render: (panel: PanelNode) => ReactNode;
  /** the name a panel goes by, and what it is pointed at */
  titleOf: (panel: PanelNode) => { title: string; sub?: string };
  /** what may be opened now, ranked (lib/workspace/surfaces.ts suggestViews) */
  views: ViewSuggestion[];
  /** the arrangements that mean something now (lib/workspace/surfaces.ts arrangementsFor) */
  arrangements: Arrangement[];
  /**
   * What this line of thinking holds (lib/workspace/surfaces.ts factsFrom).
   * With it, "All views" says which views have nothing to show yet, and a view
   * opened beside a model shows what it should — the map its reasoning, a 3D
   * view the model's solids. Without it the views offered above stand in.
   */
  facts?: WorkspaceFacts | null;
  suggestion: LayoutSuggestion | null;
  onAccept: (s: LayoutSuggestion) => void;
  onDismiss: (s: LayoutSuggestion) => void;
  /** the row above the stage — the host's header; "+ View" sits at its end */
  head?: ReactNode;
  /** beneath the stage — the composer, while the conversation is not a panel */
  dock?: ReactNode;
  /** put the whole view back to how Logos 3 starts — asked for, and confirmed, in "+ View" */
  onResetView?: () => void;
  /** which side of the stage the dock sits on, and how the person moves it */
  dockSide?: DockSide;
  onDockSide?: (side: DockSide) => void;
  /** a contextual card (the inspector, for a selection), over the panel in focus */
  overlay?: ReactNode;
}

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

/**
 * "+ View": the representations worth opening, then every kind of view there
 * is — each open one marked, with a × that puts it away — then the
 * arrangements worth making.
 */
function ViewMenu({
  views,
  catalogue,
  arrangements,
  onPick,
  onView,
  onRemove,
  onArrange,
  onClose,
  onReset,
}: {
  views: ViewSuggestion[];
  catalogue: CatalogueEntry[];
  arrangements: Arrangement[];
  onPick: (v: ViewSuggestion) => void;
  onView: (e: CatalogueEntry) => void;
  onRemove: (e: CatalogueEntry) => void;
  onArrange: (a: Arrangement) => void;
  onClose: () => void;
  onReset?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // RESET VIEW asks first: it undoes every arrangement the person has made.
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement)?.closest?.('.ws-add')) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', key);
    };
  }, [onClose]);
  // What the state makes worth opening, first — only what is not already on
  // screen, and only the few that rank. Every kind of view follows, in full.
  const fresh = views.filter((v) => !v.open).slice(0, 4);
  // Putting a view away takes its × with it; the row it was on keeps the focus.
  const remove = (e: CatalogueEntry) => {
    onRemove(e);
    requestAnimationFrame(() => ref.current?.querySelector<HTMLButtonElement>(`[data-view="${e.id}"]`)?.focus());
  };
  return (
    <div className="ws-menu" ref={ref} role="menu" aria-label="Open a view">
      {fresh.length > 0 && <p className="ws-menu-k">Open beside</p>}
      {fresh.map((v, i) => (
        <button key={`v${i}`} type="button" role="menuitem" className="ws-menu-row" onClick={() => onPick(v)}>
          <span className="ws-menu-l">{v.label}</span>
          <span className="ws-menu-w">{v.why}</span>
        </button>
      ))}
      <p className={`ws-menu-k${fresh.length ? ' is-sub' : ''}`} id="ws-all-views">All views</p>
      <div className="ws-cat" role="group" aria-labelledby="ws-all-views">
        {catalogue.map((e) => (
          <div key={e.id} className={`ws-cat-row${e.isOpen ? ' is-open' : ''}`}>
            <button
              type="button"
              role="menuitem"
              className="ws-menu-row ws-cat-main"
              data-view={e.id}
              aria-label={e.isOpen ? `${e.name}, open — show it` : `Open ${e.name}${e.empty ? ` — ${e.empty}` : ''}`}
              onClick={() => onView(e)}
            >
              <span className="ws-menu-l">
                {e.name}
                {e.isOpen && <span className="ws-cat-on">Open</span>}
              </span>
              <span className={`ws-menu-w${e.empty ? ' is-empty' : ''}`}>{e.empty ?? e.says}</span>
            </button>
            {e.isOpen && (
              <button
                type="button"
                role="menuitem"
                className="ws-cat-x"
                aria-label={`Remove ${e.name} from the workspace`}
                title={`Remove ${e.name}`}
                onClick={() => remove(e)}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      {arrangements.length > 0 && <p className="ws-menu-k is-sub">Arrange</p>}
      {arrangements.map((a) => (
        <button key={a.id} type="button" role="menuitem" className="ws-menu-row" data-arrangement={a.id} onClick={() => onArrange(a)}>
          <span className="ws-menu-l">{a.label}</span>
          <span className="ws-menu-w">{a.why}</span>
        </button>
      ))}
      {onReset && (
        <div className="ws-menu-reset">
          {!confirming ? (
            <button type="button" role="menuitem" className="ws-menu-row ws-reset-row" onClick={() => setConfirming(true)}>
              <span className="ws-menu-l">Reset view</span>
              <span className="ws-menu-w">back to how Logos 3 starts</span>
            </button>
          ) : (
            <div className="ws-confirm" role="alertdialog" aria-label="Reset the view?">
              <p className="ws-confirm-q">Are you sure?</p>
              <p className="ws-confirm-d">
                Panels, where the conversation sits, the map’s tabs and zoom go back to their defaults. Your thinking, your map and your models are not touched.
              </p>
              <span className="ws-confirm-acts">
                <button
                  type="button"
                  className="is-go"
                  autoFocus
                  onClick={() => {
                    setConfirming(false);
                    onReset();
                  }}
                >
                  Reset view
                </button>
                <button type="button" onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Workspace(props: WorkspaceProps) {
  const { layout, onLayout, render, titleOf, views, arrangements } = props;
  const narrow = useNarrow();
  const [adding, setAdding] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [zone, setZone] = useState<{ id: string; zone: Zone } | null>(null);
  const [tab, setTab] = useState<string | null>(null);
  // MOVING THE CONVERSATION: a drag from its grip shows the four edges of the
  // stage, and it lands on whichever is nearest the pointer.
  const [dockDrag, setDockDrag] = useState<DockSide | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const side: DockSide = props.dockSide ?? 'bottom';
  const nearestEdge = (x: number, y: number): DockSide => {
    const r = mainRef.current?.getBoundingClientRect();
    if (!r) return side;
    const d: [DockSide, number][] = [
      ['left', (x - r.left) / r.width],
      ['right', (r.right - x) / r.width],
      ['top', (y - r.top) / r.height],
      ['bottom', (r.bottom - y) / r.height],
    ];
    return d.sort((a, b) => a[1] - b[1])[0][0];
  };
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  // Escape gives back the rest of the workspace.
  useEffect(() => {
    if (!layout.maximized) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target as HTMLElement)?.closest?.('input, textarea, [contenteditable="true"]')) onLayout(restore(layoutRef.current));
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [layout.maximized, onLayout]);

  const facts = props.facts ?? null;
  const open = useCallback(
    (v: { type: SurfaceType; config?: PanelConfig }) => {
      const placed = openBeside(layoutRef.current, v, facts);
      onLayout(placed.layout);
      if (placed.id) setTab(placed.id);
    },
    [onLayout, facts]
  );
  // EVERY KIND OF VIEW, open or not (lib/workspace/surfaces.ts viewCatalogue) — read while "+ View" is open.
  const catalogue = adding ? viewCatalogue(layout, facts, facts ? null : views) : [];
  const showView = (e: CatalogueEntry) => {
    const placed = openView(layoutRef.current, e.id, facts);
    if (placed.layout !== layoutRef.current) onLayout(placed.layout);
    if (placed.id) setTab(placed.id);
  };

  const panels = panelsOf(layout);
  const several = panels.length > 1;
  // The card sits over the panel with the most room, never over the smaller
  // one somebody may be working in.
  const focusId = layout.maximized ?? dominantPanel(layout)?.id ?? null;

  // ── one panel ────────────────────────────────────────────────────
  // Alone, a panel is only its content. Among several, a small chip in its
  // corner — its name, maximise, close — shows while the pointer is over it.
  const Panel = (p: PanelNode, isMax = false) => {
    const { title, sub } = titleOf(p);
    const showZones = dragging && dragging !== p.id;
    const chrome = several || isMax;
    return (
      <section
        key={p.id}
        className={`ws-panel ws-t-${p.type}${isMax ? ' is-max' : ''}${chrome ? ' has-chip' : ''}`}
        aria-label={sub ? `${title} — ${sub}` : title}
        data-panel={p.id}
        onDragOver={(e) => {
          if (!dragging || dragging === p.id) return;
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width;
          const y = (e.clientY - r.top) / r.height;
          const z: Zone = x < 0.22 ? 'left' : x > 0.78 ? 'right' : y < 0.22 ? 'top' : y > 0.78 ? 'bottom' : 'center';
          if (zone?.id !== p.id || zone.zone !== z) setZone({ id: p.id, zone: z });
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setZone((z) => (z?.id === p.id ? null : z));
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (dragging && zone?.id === p.id) onLayout(movePanel(layoutRef.current, dragging, p.id, zone.zone));
          setDragging(null);
          setZone(null);
        }}
      >
        <div className="ws-body">{render(p)}</div>
        {p.id === focusId && props.overlay}
        {chrome && (
          <div className="ws-chip">
            <span
              className="ws-chip-t"
              draggable={!isMax && !narrow}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', p.id);
                setDragging(p.id);
              }}
              onDragEnd={() => {
                setDragging(null);
                setZone(null);
              }}
              onDoubleClick={() => onLayout(isMax ? restore(layout) : maximize(layout, p.id))}
              title="Drag to move · double-click to give it the whole workspace"
            >
              {title}
            </span>
            <button
              type="button"
              className="ws-act"
              aria-label={isMax ? 'Restore the workspace' : `Give ${title} the whole workspace`}
              title={isMax ? 'Restore (Esc)' : 'Maximise'}
              onClick={() => onLayout(isMax ? restore(layout) : maximize(layout, p.id))}
            >
              {isMax ? '⤡' : '⤢'}
            </button>
            {several && !isMax && (
              <button type="button" className="ws-act" aria-label={`Close ${title}`} title="Close" onClick={() => onLayout(closePanel(layoutRef.current, p.id))}>
                ×
              </button>
            )}
          </div>
        )}
        {showZones && (
          <div className={`ws-drop${zone?.id === p.id ? ` is-${zone.zone}` : ''}`} aria-hidden="true">
            <span />
          </div>
        )}
      </section>
    );
  };

  // ── splits, with their dividers ──────────────────────────────────
  const Split = (s: SplitNode): ReactNode => {
    const row = s.dir === 'row';
    return (
      <div key={s.id} className={`ws-split is-${s.dir}`} data-split={s.id}>
        {s.children.map((c, i) => (
          <Fragment key={c.id}>
            <div className="ws-cell" style={{ flexGrow: s.sizes[i], flexBasis: 0 }}>
              {Node(c)}
            </div>
            {i < s.children.length - 1 && (
              <div
                className={`ws-divider is-${s.dir}`}
                role="separator"
                aria-orientation={row ? 'vertical' : 'horizontal'}
                aria-label="Resize"
                tabIndex={0}
                aria-valuenow={Math.round(s.sizes[i] * 100)}
                onKeyDown={(e) => {
                  const step = e.shiftKey ? 0.08 : 0.02;
                  const back = row ? 'ArrowLeft' : 'ArrowUp';
                  const fwd = row ? 'ArrowRight' : 'ArrowDown';
                  if (e.key === back || e.key === fwd) {
                    e.preventDefault();
                    onLayout(resizeSplit(layoutRef.current, s.id, i, e.key === fwd ? step : -step));
                  }
                }}
                onPointerDown={(e) => {
                  const box = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                  const span = row ? box.width : box.height;
                  let last = row ? e.clientX : e.clientY;
                  const el = e.currentTarget;
                  el.setPointerCapture(e.pointerId);
                  el.classList.add('is-active');
                  const move = (ev: PointerEvent) => {
                    const now = row ? ev.clientX : ev.clientY;
                    const d = (now - last) / Math.max(1, span);
                    if (Math.abs(d) > 0.001) {
                      last = now;
                      onLayout(resizeSplit(layoutRef.current, s.id, i, d));
                    }
                  };
                  const up = () => {
                    el.classList.remove('is-active');
                    el.removeEventListener('pointermove', move);
                    el.removeEventListener('pointerup', up);
                    el.removeEventListener('pointercancel', up);
                  };
                  el.addEventListener('pointermove', move);
                  el.addEventListener('pointerup', up);
                  el.addEventListener('pointercancel', up);
                }}
              />
            )}
          </Fragment>
        ))}
      </div>
    );
  };

  const Node = (n: LayoutNode): ReactNode => (n.kind === 'panel' ? Panel(n) : Split(n));

  // ── the top row: the host's header, a suggestion, + View ──────────
  const addView = (
    <span className="ws-add">
      <button type="button" className="ws-add-btn" data-tour="views" aria-haspopup="menu" aria-expanded={adding} onClick={() => setAdding((v) => !v)}>
        + View
      </button>
      {adding && (
        <ViewMenu
          views={views}
          catalogue={catalogue}
          arrangements={arrangements}
          onClose={() => setAdding(false)}
          onPick={(v) => {
            setAdding(false);
            open(v);
          }}
          onView={(e) => {
            setAdding(false);
            showView(e);
          }}
          onRemove={(e) => {
            // the menu stays open, so several can be put away in turn
            onLayout(closeView(layoutRef.current, e.id));
            setTab(null);
          }}
          onArrange={(a) => {
            setAdding(false);
            onLayout(a.layout);
            setTab(null);
          }}
          onReset={
            props.onResetView
              ? () => {
                  setAdding(false);
                  setTab(null);
                  props.onResetView!();
                }
              : undefined
          }
        />
      )}
    </span>
  );
  const top = (
    <div className="ws-top">
      <div className="ws-top-head">{props.head}</div>
      {props.suggestion && (
        <div className="ws-suggest" role="status">
          <span>{props.suggestion.text}</span>
          <button type="button" className="ws-suggest-go" onClick={() => props.onAccept(props.suggestion!)}>Open</button>
          <button type="button" className="ws-suggest-no" onClick={() => props.onDismiss(props.suggestion!)}>Not now</button>
        </div>
      )}
      {addView}
    </div>
  );

  // ── narrow screens: one surface at a time ────────────────────────
  if (narrow) {
    const active = panels.find((p) => p.id === (layout.maximized ?? tab)) ?? panels[0] ?? null;
    return (
      <div className="ws-root is-narrow">
        {top}
        {several && (
          <div className="ws-tabs" role="tablist">
            {panels.map((p) => (
              <button key={p.id} type="button" role="tab" aria-selected={active?.id === p.id} onClick={() => setTab(p.id)}>
                {titleOf(p).title}
              </button>
            ))}
          </div>
        )}
        <div className="ws-stage">
          {active ? (
            <section className={`ws-panel ws-t-${active.type}`} data-panel={active.id}>
              <div className="ws-body">{render(active)}</div>
            </section>
          ) : null}
          {props.overlay}
        </div>
        {props.dock}
      </div>
    );
  }

  const max = layout.maximized ? panels.find((p) => p.id === layout.maximized) : null;
  const dock = props.dock ? (
    <div className="ws-dockwrap">
      {props.onDockSide && (
        <button
          type="button"
          className="ws-dock-grip"
          aria-label={`Move the conversation — now on the ${side}. Drag it, or use the arrow keys.`}
          title="Drag to move the conversation"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            setDockDrag(side);
          }}
          onPointerMove={(e) => {
            if (dockDrag) {
              const z = nearestEdge(e.clientX, e.clientY);
              if (z !== dockDrag) setDockDrag(z);
            }
          }}
          onPointerUp={() => {
            if (dockDrag && dockDrag !== side) props.onDockSide?.(dockDrag);
            setDockDrag(null);
          }}
          onPointerCancel={() => setDockDrag(null)}
          onKeyDown={(e) => {
            const to: Partial<Record<string, DockSide>> = { ArrowUp: 'top', ArrowDown: 'bottom', ArrowLeft: 'left', ArrowRight: 'right' };
            const next = to[e.key];
            if (next) {
              e.preventDefault();
              props.onDockSide?.(next);
            }
          }}
        >
          <span aria-hidden="true" />
        </button>
      )}
      {props.dock}
    </div>
  ) : null;
  return (
    <div className={`ws-root${dragging ? ' is-dragging' : ''}${several ? ' is-several' : ''}`}>
      {top}
      <div ref={mainRef} className={`ws-main dock-${side}${dockDrag ? ' is-moving-dock' : ''}`}>
      <div className="ws-stage">
        {max ? (
          Panel(max, true)
        ) : layout.root ? (
          Node(layout.root)
        ) : (
          <div className="ws-blank">
            <div className="ws-blank-list">
              {views.slice(0, 4).map((v, i) => (
                <button key={i} type="button" onClick={() => open(v)}>
                  <span>{v.label}</span>
                  <em>{v.why}</em>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {dock}
      {dockDrag && (
        <div className="ws-dockzones" aria-hidden="true">
          {DOCK_SIDES.map((z) => (
            <span key={z} className={`is-${z}${dockDrag === z ? ' is-on' : ''}`} />
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
