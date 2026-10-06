'use client';
// components/workspace/Workspace.tsx
//
// The Logos 3 workspace shell: it draws a layout (lib/workspace/tiling.ts) and
// nothing else. It owns no canonical state — every panel's content comes from
// the host's `render`, which draws the host's surfaces over the host's state —
// and it writes only the layout, which is the person's own arrangement.
//
// QUIET BY DESIGN. A panel's chrome is one small caps title and, on hover or
// focus, two controls. Dividers are hairlines that thicken under the pointer.
// The content is the point; the shell should almost disappear while somebody
// is thinking.
//
// THE HUMAN OWNS THE ARRANGEMENT. Nothing here moves unless a person moved it
// or accepted a suggestion to. Suggestions arrive from the host as one quiet
// line with an Open and a Not now.

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  addPanel,
  closePanel,
  maximize,
  movePanel,
  panelsOf,
  replacePanel,
  resizeSplit,
  restore,
  splitPanel,
  type LayoutNode,
  type PanelConfig,
  type PanelNode,
  type PresetId,
  type SplitNode,
  type SurfaceType,
  type WorkspaceLayout,
} from '@/lib/workspace/tiling';
import type { LayoutSuggestion, ViewSuggestion } from '@/lib/workspace/surfaces';
import './workspace.css';

type Zone = 'left' | 'right' | 'top' | 'bottom' | 'center';

export interface WorkspaceProps {
  layout: WorkspaceLayout;
  onLayout: (next: WorkspaceLayout) => void;
  /** the surface for a panel — the host's own components over the host's state */
  render: (panel: PanelNode) => ReactNode;
  /** the name a panel goes by, and what it is pointed at */
  titleOf: (panel: PanelNode) => { title: string; sub?: string };
  /** what may be opened now, ranked (lib/workspace/surfaces.ts suggestViews) */
  views: ViewSuggestion[];
  presets: readonly { id: PresetId; label: string; says: string }[];
  onPreset: (id: PresetId) => void;
  onReset: () => void;
  suggestion: LayoutSuggestion | null;
  onAccept: (s: LayoutSuggestion) => void;
  onDismiss: (s: LayoutSuggestion) => void;
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

/** A small menu of surfaces to open — the + View list, and Split / Replace inside a panel. */
function ViewMenu({ views, onPick, onClose, title }: { views: ViewSuggestion[]; onPick: (v: ViewSuggestion) => void; onClose: () => void; title: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', key);
    };
  }, [onClose]);
  const fresh = views.filter((v) => !v.open);
  const open = views.filter((v) => v.open);
  return (
    <div className="ws-menu" ref={ref} role="menu" aria-label={title}>
      <p className="ws-menu-k">{title}</p>
      {fresh.map((v, i) => (
        <button key={`f${i}`} type="button" role="menuitem" className="ws-menu-row" onClick={() => onPick(v)}>
          <span className="ws-menu-l">{v.label}</span>
          <span className="ws-menu-w">{v.why}</span>
        </button>
      ))}
      {open.length > 0 && <p className="ws-menu-k is-sub">Already open</p>}
      {open.map((v, i) => (
        <button key={`o${i}`} type="button" role="menuitem" className="ws-menu-row is-open" onClick={() => onPick(v)}>
          <span className="ws-menu-l">{v.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Workspace(props: WorkspaceProps) {
  const { layout, onLayout, render, titleOf, views } = props;
  const narrow = useNarrow();
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState<{ id: string; mode: 'actions' | 'split-row' | 'split-col' | 'replace' } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [zone, setZone] = useState<{ id: string; zone: Zone } | null>(null);
  const [tab, setTab] = useState<string | null>(null);
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

  const open = useCallback(
    (v: { type: SurfaceType; config?: PanelConfig }) => {
      const placed = addPanel(layoutRef.current, v);
      onLayout(placed.layout);
      if (placed.id) setTab(placed.id);
    },
    [onLayout]
  );

  const panels = panelsOf(layout);

  // ── one panel ────────────────────────────────────────────────────
  const Panel = (p: PanelNode, isMax = false) => {
    const { title, sub } = titleOf(p);
    const showZones = dragging && dragging !== p.id;
    return (
      <section
        key={p.id}
        className={`ws-panel ws-t-${p.type}${isMax ? ' is-max' : ''}`}
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
        <header
          className="ws-head"
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
          <span className="ws-title">{title}</span>
          {sub && <span className="ws-title-sub">{sub}</span>}
          <span className="ws-acts">
            <button
              type="button"
              className="ws-act"
              aria-label={isMax ? 'Restore the workspace' : `Give ${title} the whole workspace`}
              title={isMax ? 'Restore (Esc)' : 'Maximise'}
              onClick={() => onLayout(isMax ? restore(layout) : maximize(layout, p.id))}
            >
              {isMax ? '⤡' : '⤢'}
            </button>
            {!isMax && (
              <button type="button" className="ws-act" aria-label={`${title}: more`} aria-haspopup="menu" aria-expanded={menu?.id === p.id} onClick={() => setMenu(menu?.id === p.id ? null : { id: p.id, mode: 'actions' })}>
                ···
              </button>
            )}
          </span>
          {menu?.id === p.id && menu.mode === 'actions' && (
            <div className="ws-menu ws-menu-small" role="menu">
              <button type="button" role="menuitem" className="ws-menu-row" onClick={() => setMenu({ id: p.id, mode: 'split-row' })}>Split right…</button>
              <button type="button" role="menuitem" className="ws-menu-row" onClick={() => setMenu({ id: p.id, mode: 'split-col' })}>Split below…</button>
              <button type="button" role="menuitem" className="ws-menu-row" onClick={() => setMenu({ id: p.id, mode: 'replace' })}>Show something else here…</button>
              <button type="button" role="menuitem" className="ws-menu-row" onClick={() => { setMenu(null); onLayout(maximize(layout, p.id)); }}>Maximise</button>
              <button type="button" role="menuitem" className="ws-menu-row is-close" onClick={() => { setMenu(null); onLayout(closePanel(layout, p.id)); }}>Close</button>
            </div>
          )}
          {menu?.id === p.id && menu.mode !== 'actions' && (
            <ViewMenu
              title={menu.mode === 'replace' ? 'Show here instead' : menu.mode === 'split-row' ? 'Open to the right' : 'Open below'}
              views={views}
              onClose={() => setMenu(null)}
              onPick={(v) => {
                const m = menu.mode;
                setMenu(null);
                if (m === 'replace') onLayout(replacePanel(layoutRef.current, p.id, v.type, v.config));
                else onLayout(splitPanel(layoutRef.current, p.id, m === 'split-row' ? 'row' : 'col', { type: v.type, config: v.config }).layout);
              }}
            />
          )}
        </header>
        <div className="ws-body">{render(p)}</div>
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

  // ── the bar ──────────────────────────────────────────────────────
  const bar = (
    <div className="ws-bar">
      <nav className="ws-presets" aria-label="Start from">
        {props.presets.map((p) => (
          <button key={p.id} type="button" className={layout.preset === p.id ? 'is-on' : ''} onClick={() => props.onPreset(p.id)} title={p.says}>
            {p.label}
          </button>
        ))}
      </nav>
      {props.suggestion && (
        <div className="ws-suggest" role="status">
          <span>{props.suggestion.text}</span>
          <button type="button" className="ws-suggest-go" onClick={() => props.onAccept(props.suggestion!)}>Open</button>
          <button type="button" className="ws-suggest-no" onClick={() => props.onDismiss(props.suggestion!)}>Not now</button>
        </div>
      )}
      <span className="ws-bar-r">
        <span className="ws-add">
          <button type="button" className="ws-add-btn" aria-haspopup="menu" aria-expanded={adding} onClick={() => setAdding((v) => !v)}>
            + View
          </button>
          {adding && (
            <ViewMenu
              title="Open beside what is here"
              views={views}
              onClose={() => setAdding(false)}
              onPick={(v) => {
                setAdding(false);
                open(v);
              }}
            />
          )}
        </span>
        <button type="button" className="ws-reset" onClick={props.onReset} title="Back to the starting layout for what this line of thinking holds">
          Reset
        </button>
      </span>
    </div>
  );

  // ── narrow screens: one surface at a time, the rest a tab away ───
  if (narrow) {
    // Until a tab is chosen, a phone opens on the conversation: it is where
    // the first thing anybody does on a small screen — say something — happens.
    const active = panels.find((p) => p.id === (layout.maximized ?? tab)) ?? panels.find((p) => p.type === 'chat') ?? panels[0] ?? null;
    return (
      <div className="ws-root is-narrow">
        <div className="ws-tabs" role="tablist">
          {panels.map((p) => (
            <button key={p.id} type="button" role="tab" aria-selected={active?.id === p.id} onClick={() => setTab(p.id)}>
              {titleOf(p).title}
            </button>
          ))}
          <span className="ws-add">
            <button type="button" className="ws-add-btn" onClick={() => setAdding((v) => !v)}>+</button>
            {adding && <ViewMenu title="Open" views={views} onClose={() => setAdding(false)} onPick={(v) => { setAdding(false); open(v); }} />}
          </span>
        </div>
        <div className="ws-stage">{active ? Panel(active, false) : null}</div>
      </div>
    );
  }

  const max = layout.maximized ? panels.find((p) => p.id === layout.maximized) : null;
  return (
    <div className={`ws-root${dragging ? ' is-dragging' : ''}`}>
      {bar}
      <div className="ws-stage">
        {max ? (
          Panel(max, true)
        ) : layout.root ? (
          Node(layout.root)
        ) : (
          <div className="ws-blank">
            <p>An empty workspace.</p>
            <div className="ws-blank-list">
              {views.slice(0, 6).map((v, i) => (
                <button key={i} type="button" onClick={() => open(v)}>
                  <span>{v.label}</span>
                  <em>{v.why}</em>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
