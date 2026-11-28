'use client';
// components/new-logos/engine/Actions.tsx — WHAT CAN BE DONE WITH WHAT IS SELECTED, where it is.
//
//   • the ACTION BAR: a small floating row over the selection with only what applies to it (two selected: group,
//     connect, compare; a table: show it as a plot, bars or measures; a group: collapse, ungroup…), the rest a
//     press away under More;
//   • the CONTEXT MENU: the same commands, at the pointer (right-click, or a long press on a touch screen); on the
//     empty plane, what can be made there.
// Both draw from the operation engine's registry (lib/new-logos/engine/commands.ts), so every entry is also what the
// Smart Omnibox does when asked in words, and runs through the same engine.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { offered, selInfo, type CommandDef } from '@/lib/new-logos/engine/commands';
import { viewsFor, analyticalFor, type ViewOption } from '@/lib/new-logos/engine/transforms';
import type { WorkspaceCtx } from '@/lib/new-logos/engine/resolve';

export type Act = { kind: 'command'; id: string; args?: Record<string, unknown> } | { kind: 'view'; view: ViewOption; ref: string } | { kind: 'ask'; text: string; refs: string[] } | { kind: 'make'; what: string };

const SHORT: Record<string, string> = { group: 'Group', connect: 'Connect', compare: 'Compare', transform: 'Show as…', duplicate: 'Duplicate', delete: 'Remove', ungroup: 'Ungroup', collapse: 'Collapse', expand: 'Expand', enter: 'Enter', backlinks: 'Where used', inspect: 'Inspect', version: 'New version', disconnect: 'Disconnect' };

/** The selection's place on screen: the box around its objects. */
function useSelectionBox(refs: readonly string[]) {
  const [box, setBox] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (!refs.length) return setBox(null);
    let raf = 0;
    let last = '';
    const tick = () => {
      const els = refs.map((r) => document.querySelector<HTMLElement>(`[data-ref="${CSS.escape(r)}"]`)).filter((e): e is HTMLElement => !!e);
      if (els.length) {
        const rs = els.map((e) => e.getBoundingClientRect());
        const l = Math.min(...rs.map((r) => r.left)), t = Math.min(...rs.map((r) => r.top)), rr = Math.max(...rs.map((r) => r.right)), b = Math.max(...rs.map((r) => r.bottom));
        const key = `${Math.round(l)},${Math.round(t)},${Math.round(rr)},${Math.round(b)}`;
        if (key !== last) {
          last = key;
          setBox(new DOMRect(l, t, rr - l, b - t));
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [refs]);
  return box;
}

function entries(ctx: WorkspaceCtx): { primary: Act[]; more: { label: string; act: Act }[]; label: (a: Act) => string } {
  const sel = selInfo(ctx);
  const cmds: CommandDef[] = offered(ctx);
  const views = sel.items.length === 1 && sel.refs.length === 1 ? viewsFor(sel.items[0]).filter((v) => v.as !== (sel.items[0].view?.as ?? viewsFor(sel.items[0])[0]?.as)) : [];
  const analytic = analyticalFor(sel.items);
  const primary: Act[] = [];
  for (const v of views.slice(0, 2)) primary.push({ kind: 'view', view: v, ref: sel.refs[0] });
  for (const c of cmds.filter((c) => c.id !== 'transform').slice(0, Math.max(1, 4 - primary.length))) primary.push({ kind: 'command', id: c.id });
  const more: { label: string; act: Act }[] = [];
  for (const v of views.slice(2)) more.push({ label: v.label, act: { kind: 'view', view: v, ref: sel.refs[0] } });
  for (const c of cmds.filter((c) => c.id !== 'transform' && !primary.some((p) => p.kind === 'command' && p.id === c.id))) more.push({ label: c.title, act: { kind: 'command', id: c.id } });
  for (const a of analytic) more.push({ label: a.label, act: { kind: 'ask', text: a.ask, refs: sel.refs } });
  const label = (a: Act) => (a.kind === 'view' ? a.view.label : a.kind === 'ask' ? 'Ask' : a.kind === 'make' ? a.what : SHORT[a.id] ?? a.id);
  return { primary, more, label };
}

export function ActionBar({ ctx, onAct, hidden }: { ctx: WorkspaceCtx; onAct: (a: Act) => void; hidden?: boolean }) {
  const box = useSelectionBox(ctx.selection);
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [ctx.selection]);
  if (hidden || !box || !ctx.selection.length) return null;
  const { primary, more: rest, label } = entries(ctx);
  if (!primary.length && !rest.length) return null;
  const narrow = typeof window !== 'undefined' && window.innerWidth < 640;
  const top = box.top > 140 ? box.top - 44 : Math.min(window.innerHeight - 150, box.bottom + 10);
  const left = narrow ? 8 : Math.max(8, Math.min(window.innerWidth - 360, box.left));
  return (
    <div className="nl-actbar nl-cv-ui" role="toolbar" aria-label={`Actions for what is selected (${ctx.selection.length})`} style={narrow ? { left: 8, right: 8, top } : { left, top }}>
      {ctx.selection.length > 1 ? <span className="nl-actbar-count">{ctx.selection.length} selected</span> : null}
      {primary.map((a, k) => (
        <button key={k} type="button" className="nl-actbar-btn" onClick={() => onAct(a)}>
          {label(a)}
        </button>
      ))}
      {rest.length ? (
        <span className="nl-actbar-more">
          <button type="button" className="nl-actbar-btn" aria-expanded={more} aria-haspopup="menu" onClick={() => setMore((m) => !m)}>
            More
          </button>
          {more ? (
            <div className="nl-menu-pop" role="menu">
              {rest.map((r, k) => (
                <button key={k} type="button" role="menuitem" onClick={() => (setMore(false), onAct(r.act))}>
                  {r.label}
                </button>
              ))}
            </div>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

const MAKE = [
  { what: 'A thought', kind: 'thought' },
  { what: 'A question', kind: 'question' },
  { what: 'A table', kind: 'table' },
  { what: 'A model', kind: 'model' },
  { what: 'A plot', kind: 'plot' },
  { what: 'A timeline', kind: 'timeline' },
  { what: 'A diagram', kind: 'diagram' },
];

export function ContextMenu({ ctx, screen, onAct, onMake, onClose }: { ctx: WorkspaceCtx; screen: { x: number; y: number }; onAct: (a: Act) => void; onMake: (kind: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', esc);
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', esc);
    };
  }, [onClose]);
  const left = Math.max(8, Math.min(screen.x, (typeof window === 'undefined' ? 1200 : window.innerWidth) - 232));
  const top = Math.max(56, Math.min(screen.y, (typeof window === 'undefined' ? 800 : window.innerHeight) - 360));
  const list = ctx.selection.length ? entries(ctx) : null;
  return (
    <div ref={ref} className="nl-ctxmenu nl-cv-ui" role="menu" aria-label={ctx.selection.length ? 'Actions' : 'Make something here'} style={{ left, top }}>
      {list
        ? [...list.primary.map((a) => ({ label: list.label(a), act: a })), ...list.more].map((e, k) => (
            <button key={k} type="button" role="menuitem" onClick={() => (onClose(), onAct(e.act))}>
              {e.label}
            </button>
          ))
        : MAKE.map((m) => (
            <button key={m.kind} type="button" role="menuitem" onClick={() => (onClose(), onMake(m.kind))}>
              {m.what}
            </button>
          ))}
    </div>
  );
}
