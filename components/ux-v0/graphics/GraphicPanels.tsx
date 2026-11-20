'use client';

// components/ux-v0/graphics/GraphicPanels.tsx — the layers, the artboards, what can be added, the pictures, and the
// inspector: every routine change by hand, exactly, without asking a model.

import { useEffect, useRef, useState } from 'react';
import { FONTS } from '@/lib/ux-v0/fonts';
import { FORMATS, formatOf, sizeLabel } from '@/lib/ux-v0/graphics/formats';
import { isLocked, newId, walk, type Artboard, type GraphicDoc, type Located, type Node, type Op, type Paint, type TextNode } from '@/lib/ux-v0/graphics/doc';
import type { GFinding } from '@/lib/ux-v0/graphics/check';
import { figureFor, type FormSystem } from '@/lib/ux-v0/form';
import { weightsFor } from '../TypePanel';

const r1 = (v: number) => Math.round(v * 10) / 10;
const kindLabel = (n: Node) => (n.type === 'text' ? 'Text' : n.type === 'image' ? 'Picture' : n.type === 'group' ? 'Group' : n.type === 'chart' ? 'Chart' : n.shape === 'recipe' ? 'Shape' : n.shape.charAt(0).toUpperCase() + n.shape.slice(1));
export const nodeLabel = (n: Node) => n.name ?? (n.type === 'text' ? n.text.split('\n')[0].slice(0, 28) : kindLabel(n));

/** A number field committed on Enter or when left: one operation, one history step. */
function Num({ label, value, onCommit, step = 1, min, max, suffix }: { label: string; value: number; onCommit: (v: number) => void; step?: number; min?: number; max?: number; suffix?: string }) {
  const [v, setV] = useState(String(r1(value)));
  useEffect(() => setV(String(r1(value))), [value]);
  const commit = () => {
    const n = Number(v);
    if (!Number.isFinite(n)) return setV(String(r1(value)));
    const c = Math.max(min ?? -1e6, Math.min(max ?? 1e6, n));
    if (Math.abs(c - value) > 1e-6) onCommit(c);
    else setV(String(r1(value)));
  };
  return (
    <label className="gx-num">
      <span>{label}</span>
      <input type="number" value={v} step={step} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
      {suffix && <em>{suffix}</em>}
    </label>
  );
}

function Colour({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  return (
    <label className="gx-colour">
      <span>{label}</span>
      <input type="color" value={value.slice(0, 7)} onChange={(e) => onCommit(e.target.value)} />
      <code>{value.slice(0, 7)}</code>
    </label>
  );
}

// ── layers ──

export function LayersPanel({ board, selection, onSelect, onOps }: { board: Artboard; selection: readonly string[]; onSelect: (ids: string[]) => void; onOps: (ops: Op[], label: string) => void }) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const rows = walk(board).slice().reverse();
  return (
    <section className="gx-panel" aria-label="Layers">
      <p className="gx-panel-h">Layers <span className="v0-quiet">top first</span></p>
      <ul className="gx-layers" role="tree" aria-label={`Layers of ${board.name}`}>
        {rows.map((l) => {
          const n = l.node;
          const on = selection.includes(n.id);
          return (
            <li
              key={n.id}
              role="treeitem"
              aria-selected={on}
              aria-level={l.parents.length + 1}
              className={`gx-layer${on ? ' is-on' : ''}${n.hidden ? ' is-hidden' : ''}`}
              style={{ paddingLeft: 8 + l.parents.length * 14 }}
              draggable={!isLocked(l)}
              onDragStart={() => setDragId(n.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (!dragId || dragId === n.id) return;
                const from = rows.find((x) => x.node.id === dragId);
                if (!from || from.parents.map((p) => p.id).join() !== l.parents.map((p) => p.id).join()) return setDragId(null);
                onOps([{ op: 'reorder', id: dragId, to: l.index }], 'layer order changed');
                setDragId(null);
              }}
              onClick={(e) => onSelect(e.shiftKey ? (on ? selection.filter((x) => x !== n.id) : [...selection, n.id]) : [n.id])}
            >
              <span className="gx-layer-kind" aria-hidden="true">
                {n.type === 'text' ? 'T' : n.type === 'image' ? '▣' : n.type === 'group' ? '◫' : n.type === 'chart' ? '▥' : '◆'}
              </span>
              {renaming === n.id ? (
                <input
                  className="gx-rename"
                  autoFocus
                  defaultValue={nodeLabel(n)}
                  aria-label="Layer name"
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    setRenaming(null);
                    if (e.target.value.trim() && e.target.value.trim() !== nodeLabel(n)) onOps([{ op: 'update', id: n.id, set: { name: e.target.value.trim() } }], 'renamed');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                />
              ) : (
                <span className="gx-layer-name" onDoubleClick={() => setRenaming(n.id)}>
                  {nodeLabel(n)}
                </span>
              )}
              <button type="button" className="gx-icon" aria-pressed={!n.hidden} aria-label={n.hidden ? `Show ${nodeLabel(n)}` : `Hide ${nodeLabel(n)}`} onClick={(e) => (e.stopPropagation(), onOps([{ op: 'update', id: n.id, set: { hidden: n.hidden ? null : true } }], n.hidden ? 'shown' : 'hidden'))}>
                {n.hidden ? '◌' : '●'}
              </button>
              <button type="button" className="gx-icon" aria-pressed={!!n.locked} aria-label={n.locked ? `Unlock ${nodeLabel(n)}` : `Lock ${nodeLabel(n)}`} onClick={(e) => (e.stopPropagation(), onOps([{ op: 'update', id: n.id, set: { locked: n.locked ? null : true } }], n.locked ? 'unlocked' : 'locked'))}>
                {n.locked ? '🔒' : '🔓'}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── artboards ──

export function ArtboardsPanel({ doc, boardId, onPick, onOps, onAdapt }: { doc: GraphicDoc; boardId: string; onPick: (id: string) => void; onOps: (ops: Op[], label: string) => void; onAdapt: (formatId: string) => void }) {
  const [fmt, setFmt] = useState('story');
  return (
    <section className="gx-panel" aria-label="Artboards">
      <p className="gx-panel-h">Artboards</p>
      <ol className="gx-boards">
        {doc.artboards.map((b, i) => (
          <li key={b.id} className={b.id === boardId ? 'is-on' : ''}>
            <button type="button" className="gx-board-pick" aria-current={b.id === boardId} onClick={() => onPick(b.id)}>
              <b>{b.name}</b>
              <span className="v0-quiet">{sizeLabel(b)}</span>
            </button>
            <span className="gx-board-acts">
              <button type="button" className="gx-icon" aria-label={`Move ${b.name} up`} disabled={i === 0} onClick={() => onOps([{ op: 'artboard-reorder', id: b.id, to: i - 1 }], 'artboard moved')}>
                ↑
              </button>
              <button type="button" className="gx-icon" aria-label={`Duplicate ${b.name}`} onClick={() => onOps([{ op: 'artboard-duplicate', id: b.id }], 'artboard duplicated')}>
                ⧉
              </button>
              <button type="button" className="gx-icon" aria-label={`Delete ${b.name}`} disabled={doc.artboards.length < 2} onClick={() => onOps([{ op: 'artboard-remove', id: b.id }], 'artboard removed')}>
                ✕
              </button>
            </span>
          </li>
        ))}
      </ol>
      <div className="gx-row">
        <select className="v0-select" value={fmt} onChange={(e) => setFmt(e.target.value)} aria-label="Format to adapt to">
          {FORMATS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        <button type="button" className="sb-link is-meta is-strong" onClick={() => onAdapt(fmt)}>
          Adapt to this format
        </button>
      </div>
      <p className="v0-quiet">Re-laid out on the new format’s own grid: the words kept exactly, never stretched.</p>
    </section>
  );
}

// ── adding ──

export function AddPanel({ board, form, doc, onOps, onUpload }: { board: Artboard; form: FormSystem | null; doc: GraphicDoc; onOps: (ops: Op[], label: string) => void; onUpload: (f: File) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const cx = board.width / 2;
  const cy = board.height / 2;
  const u = Math.min(board.width, board.height) / 100;
  const add = (node: Record<string, unknown>, label: string) => onOps([{ op: 'add', artboard: board.id, node: { id: newId('n'), rotation: 0, opacity: 1, ...node } }], label);
  return (
    <section className="gx-panel" aria-label="Add">
      <p className="gx-panel-h">Add</p>
      <div className="gx-add">
        <button type="button" onClick={() => add({ type: 'text', role: 'body', text: 'Your words', font: doc.tokens.fonts.body, size: Math.max(12, u * 4), x: cx - u * 20, y: cy - u * 3, w: u * 40, h: u * 8, color: doc.tokens.colors.text, autoHeight: true }, 'text added')}>Text</button>
        <button type="button" onClick={() => add({ type: 'shape', shape: 'rect', role: 'motif', fill: doc.tokens.colors.accent, x: cx - u * 12, y: cy - u * 12, w: u * 24, h: u * 24 }, 'rectangle added')}>Rectangle</button>
        <button type="button" onClick={() => add({ type: 'shape', shape: 'ellipse', role: 'motif', fill: doc.tokens.colors.accent, x: cx - u * 12, y: cy - u * 12, w: u * 24, h: u * 24 }, 'ellipse added')}>Ellipse</button>
        <button type="button" onClick={() => add({ type: 'shape', shape: 'line', role: 'motif', stroke: { color: doc.tokens.colors.text, width: Math.max(1, u * 0.4) }, x: cx - u * 20, y: cy, w: u * 40, h: u * 2 }, 'line added')}>Line</button>
        <button type="button" onClick={() => add({ type: 'shape', shape: 'polygon', sides: 6, role: 'motif', fill: doc.tokens.colors.accent, x: cx - u * 12, y: cy - u * 12, w: u * 24, h: u * 24 }, 'polygon added')}>Polygon</button>
        <button type="button" onClick={() => add({ type: 'shape', shape: 'star', sides: 5, inner: 0.45, role: 'motif', fill: doc.tokens.colors.accent, x: cx - u * 12, y: cy - u * 12, w: u * 24, h: u * 24 }, 'star added')}>Star</button>
        {form && (
          <button type="button" onClick={() => add({ type: 'shape', shape: 'recipe', recipe: figureFor(form, 'mass', Date.now() % 97, 'add'), role: 'motif', fill: doc.tokens.colors.accent, x: cx - u * 15, y: cy - u * 15, w: u * 30, h: u * 30 }, 'a shape of the direction added')}>
            A shape of the direction
          </button>
        )}
        <button type="button" onClick={() => add({ type: 'chart', chart: 'column', role: 'data', data: [{ label: '[A]', value: 1 }, { label: '[B]', value: 2 }], values: true, colors: [], font: doc.tokens.fonts.body, color: doc.tokens.colors.text, x: cx - u * 30, y: cy - u * 18, w: u * 60, h: u * 36 }, 'chart added (fill in its numbers)')}>Chart</button>
        <button type="button" onClick={() => file.current?.click()}>Picture…</button>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
      </div>
    </section>
  );
}

// ── the inspector ──

export function Inspector({
  doc,
  board,
  selected,
  findings,
  onOps,
  onFix,
  onFixAll,
  textRef,
}: {
  doc: GraphicDoc;
  board: Artboard;
  selected: Located[];
  findings: GFinding[];
  onOps: (ops: Op[], label: string) => void;
  onFix: (f: GFinding) => void;
  onFixAll: () => void;
  textRef: React.RefObject<HTMLTextAreaElement>;
}) {
  const one = selected.length === 1 ? selected[0] : null;
  const n = one?.node;
  const [keepRatio, setKeepRatio] = useState(false);
  const set = (s: Record<string, unknown>, label: string) => n && onOps([{ op: 'update', id: n.id, set: s }], label);
  if (selected.length > 1) {
    const ids = selected.map((l) => l.node.id);
    const bs = selected.map((l) => l.node);
    const align = (how: string) => {
      const minX = Math.min(...bs.map((b) => b.x));
      const maxX = Math.max(...bs.map((b) => b.x + b.w));
      const minY = Math.min(...bs.map((b) => b.y));
      const maxY = Math.max(...bs.map((b) => b.y + b.h));
      const ops: Op[] = bs.map((b) => ({ op: 'move', id: b.id, dx: how === 'left' ? minX - b.x : how === 'right' ? maxX - b.x - b.w : how === 'center' ? (minX + maxX) / 2 - (b.x + b.w / 2) : 0, dy: how === 'top' ? minY - b.y : how === 'bottom' ? maxY - b.y - b.h : how === 'middle' ? (minY + maxY) / 2 - (b.y + b.h / 2) : 0 }) as Op);
      onOps(ops, `aligned ${how}`);
    };
    const distribute = (axis: 'x' | 'y') => {
      const sorted = [...bs].sort((p, q) => p[axis] - q[axis]);
      const size = axis === 'x' ? 'w' : 'h';
      const total = sorted.reduce((s, b) => s + b[size], 0);
      const span = sorted[sorted.length - 1][axis] + sorted[sorted.length - 1][size] - sorted[0][axis];
      const gap = (span - total) / (sorted.length - 1);
      let at = sorted[0][axis];
      const ops: Op[] = sorted.map((b) => {
        const op = { op: 'move', id: b.id, dx: axis === 'x' ? at - b.x : 0, dy: axis === 'y' ? at - b.y : 0 } as Op;
        at += b[size] + gap;
        return op;
      });
      onOps(ops, `distributed ${axis === 'x' ? 'across' : 'down'}`);
    };
    return (
      <section className="gx-panel" aria-label="Selection">
        <p className="gx-panel-h">{selected.length} objects</p>
        <div className="gx-btns" role="group" aria-label="Align">
          {['left', 'center', 'right', 'top', 'middle', 'bottom'].map((a) => (
            <button key={a} type="button" onClick={() => align(a)}>
              Align {a}
            </button>
          ))}
          {selected.length > 2 && (
            <>
              <button type="button" onClick={() => distribute('x')}>Distribute across</button>
              <button type="button" onClick={() => distribute('y')}>Distribute down</button>
            </>
          )}
        </div>
        <div className="gx-btns">
          <button type="button" onClick={() => onOps([{ op: 'group', ids }], 'grouped')}>Group</button>
        </div>
      </section>
    );
  }
  if (!n || !one) {
    // the artboard itself, and what is wrong with the design
    const f = formatOf(board.format);
    return (
      <>
        <section className="gx-panel" aria-label="Artboard">
          <p className="gx-panel-h">{board.name}</p>
          <p className="v0-quiet">
            {sizeLabel(board)}
            {f ? ` · ${f.label}` : ''}
            {board.unit === 'pt' ? ` · exported at ${board.dpi} dpi${board.bleed ? `, ${r1(board.bleed / (72 / 25.4))} mm bleed` : ''}` : ''}
          </p>
          <label className="gx-text">
            <span>Name</span>
            <input defaultValue={board.name} key={board.id} onBlur={(e) => e.target.value.trim() && e.target.value !== board.name && onOps([{ op: 'artboard-update', id: board.id, set: { name: e.target.value.trim() } }], 'artboard renamed')} />
          </label>
          <div className="gx-grid2">
            <Num label="W" value={board.width} min={16} max={20000} onCommit={(v) => onOps([{ op: 'artboard-update', id: board.id, set: { width: v } }], 'artboard width')} suffix={board.unit} />
            <Num label="H" value={board.height} min={16} max={20000} onCommit={(v) => onOps([{ op: 'artboard-update', id: board.id, set: { height: v } }], 'artboard height')} suffix={board.unit} />
          </div>
          <div className="gx-grid2">
            {board.background ? <Colour label="Ground" value={board.background} onCommit={(v) => onOps([{ op: 'artboard-update', id: board.id, set: { background: v } }], 'ground colour')} /> : <span className="v0-quiet">Transparent</span>}
            <label className="gx-check">
              <input type="checkbox" checked={board.background === null} onChange={(e) => onOps([{ op: 'artboard-update', id: board.id, set: { background: e.target.checked ? null : doc.tokens.colors.background } }], e.target.checked ? 'transparent ground' : 'ground colour')} /> Transparent
            </label>
          </div>
          <div className="gx-grid2">
            <Num label="Safe" value={board.safe} min={0} max={Math.min(board.width, board.height) / 3} onCommit={(v) => onOps([{ op: 'artboard-update', id: board.id, set: { safe: v } }], 'safe area')} suffix={board.unit} />
            <Num label="Bleed" value={board.bleed} min={0} max={Math.min(board.width, board.height) / 4} onCommit={(v) => onOps([{ op: 'artboard-update', id: board.id, set: { bleed: v } }], 'bleed')} suffix={board.unit} />
          </div>
        </section>
        <section className="gx-panel" aria-label="Checks">
          <p className="gx-panel-h">
            Checks <span className="v0-quiet">{findings.filter((f) => f.severity !== 'low').length ? `${findings.filter((f) => f.severity !== 'low').length} to fix` : 'nothing to fix'}</span>
          </p>
          {findings.some((f) => f.fix && !f.blocked) && (
            <button type="button" className="sb-link is-meta is-strong" onClick={onFixAll}>
              Fix what can be fixed (at most two rounds)
            </button>
          )}
          <ul className="gx-findings">
            {findings.slice(0, 14).map((f) => (
              <li key={f.id} className={`is-${f.severity}`}>
                <span>{f.message}</span>
                {f.fix && !f.blocked && (
                  <button type="button" className="sb-link is-meta" onClick={() => onFix(f)}>
                    Fix
                  </button>
                )}
                {f.blocked && <span className="v0-quiet">Locked: left to you.</span>}
              </li>
            ))}
          </ul>
        </section>
      </>
    );
  }
  const locked = isLocked(one);
  return (
    <section className="gx-panel" aria-label={`${kindLabel(n)} properties`}>
      <p className="gx-panel-h">
        {kindLabel(n)}
        {n.role ? <span className="v0-quiet"> · {n.role}</span> : null}
        {locked && <span className="gx-badge">Locked</span>}
      </p>
      <fieldset disabled={locked} className="gx-fields">
        <div className="gx-grid2">
          <Num label="X" value={n.x} onCommit={(v) => onOps([{ op: 'move', id: n.id, dx: v - n.x, dy: 0 }], 'moved')} />
          <Num label="Y" value={n.y} onCommit={(v) => onOps([{ op: 'move', id: n.id, dx: 0, dy: v - n.y }], 'moved')} />
          <Num label="W" value={n.w} min={1} onCommit={(v) => onOps([{ op: 'resize', id: n.id, w: v, h: keepRatio ? (v * n.h) / n.w : n.h }], 'resized')} />
          <Num label="H" value={n.h} min={1} onCommit={(v) => onOps([{ op: 'resize', id: n.id, w: keepRatio ? (v * n.w) / n.h : n.w, h: v }], 'resized')} />
          <label className="gx-check gx-ratio">
            <input type="checkbox" checked={keepRatio} onChange={(e) => setKeepRatio(e.target.checked)} /> Keep proportions
          </label>
          <Num label="Turn" value={n.rotation} min={-360} max={360} onCommit={(v) => set({ rotation: v }, 'turned')} suffix="°" />
          <Num label="Opacity" value={Math.round(n.opacity * 100)} min={0} max={100} onCommit={(v) => set({ opacity: v / 100 }, 'opacity')} suffix="%" />
        </div>
        {n.type === 'text' && <TextFields n={n} set={set} textRef={textRef} />}
        {n.type === 'shape' && (
          <div className="gx-grid2">
            {n.fill !== null && typeof n.fill === 'string' && <Colour label="Fill" value={n.fill} onCommit={(v) => set({ fill: v }, 'fill colour')} />}
            {n.fill !== null && typeof n.fill === 'object' && <GradientFields fill={n.fill} onCommit={(f) => set({ fill: f }, 'gradient')} />}
            {n.shape !== 'line' && (
              <label className="gx-check">
                <input type="checkbox" checked={n.fill !== null && typeof n.fill === 'object'} onChange={(e) => set({ fill: e.target.checked ? { type: 'linear', angle: 90, stops: [{ at: 0, color: typeof n.fill === 'string' ? n.fill : doc.tokens.colors.accent }, { at: 1, color: doc.tokens.colors.text }] } : typeof n.fill === 'object' && n.fill ? n.fill.stops[0].color : doc.tokens.colors.accent }, e.target.checked ? 'gradient fill' : 'solid fill')} /> Gradient
              </label>
            )}
            <Colour label="Stroke" value={n.stroke?.color ?? '#111111'} onCommit={(v) => set({ stroke: { ...(n.stroke ?? { width: 1 }), color: v } }, 'stroke colour')} />
            <Num label="Stroke" value={n.stroke?.width ?? 0} min={0} max={200} step={0.5} onCommit={(v) => set({ stroke: v > 0 ? { ...(n.stroke ?? { color: '#111111' }), width: v } : null }, 'stroke width')} suffix={board.unit} />
            {n.shape === 'rect' && <Num label="Radius" value={n.radius ?? 0} min={0} onCommit={(v) => set({ radius: v }, 'corner radius')} />}
            {(n.shape === 'polygon' || n.shape === 'star') && <Num label={n.shape === 'star' ? 'Points' : 'Sides'} value={n.sides ?? 5} min={3} max={24} onCommit={(v) => set({ sides: Math.round(v) }, 'sides')} />}
            {n.stroke && (
              <label className="gx-sel-field">
                <span>Joins</span>
                <select className="v0-select" value={n.stroke.join ?? 'miter'} onChange={(e) => set({ stroke: { ...n.stroke!, join: e.target.value } }, 'line joins')}>
                  <option value="miter">Mitre</option>
                  <option value="round">Round</option>
                  <option value="bevel">Bevel</option>
                </select>
              </label>
            )}
          </div>
        )}
        {n.type === 'image' && (
          <div className="gx-grid2">
            <label className="gx-sel-field">
              <span>Fit</span>
              <select className="v0-select" value={n.fit} onChange={(e) => set({ fit: e.target.value }, 'picture fit')}>
                <option value="cover">Fill the box</option>
                <option value="contain">Show it whole</option>
              </select>
            </label>
            <label className="gx-sel-field">
              <span>Mask</span>
              <select className="v0-select" value={n.mask === 'ellipse' ? 'ellipse' : n.mask ? 'shape' : 'none'} onChange={(e) => set({ mask: e.target.value === 'ellipse' ? 'ellipse' : e.target.value === 'none' ? null : { kind: 'organic', seed: 5 } }, 'mask')}>
                <option value="none">None</option>
                <option value="ellipse">Ellipse</option>
                <option value="shape">A shape</option>
              </select>
            </label>
            <Num label="Focus X" value={n.focus?.x ?? 50} min={0} max={100} onCommit={(v) => set({ focus: { x: v, y: n.focus?.y ?? 50 } }, 'focus')} suffix="%" />
            <Num label="Focus Y" value={n.focus?.y ?? 50} min={0} max={100} onCommit={(v) => set({ focus: { x: n.focus?.x ?? 50, y: v } }, 'focus')} suffix="%" />
            <Num label="Grey" value={Math.round((n.filter?.grayscale ?? 0) * 100)} min={0} max={100} onCommit={(v) => set({ filter: { ...(n.filter ?? {}), grayscale: v / 100 } }, 'grey')} suffix="%" />
            <Num label="Contrast" value={Math.round((n.filter?.contrast ?? 1) * 100)} min={20} max={300} onCommit={(v) => set({ filter: { ...(n.filter ?? {}), contrast: v / 100 } }, 'contrast')} suffix="%" />
            <select className="v0-select" aria-label="Replace the picture" value={n.asset} onChange={(e) => set({ asset: e.target.value }, 'picture replaced')}>
              {doc.assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {n.type === 'chart' && <ChartFields n={n} set={set} />}
      </fieldset>
      <div className="gx-btns">
        <button type="button" onClick={() => set({ locked: n.locked ? null : true }, n.locked ? 'unlocked' : 'locked')} disabled={!!one.artboard.locked}>
          {n.locked ? 'Unlock' : 'Lock'}
        </button>
        <button type="button" onClick={() => set({ hidden: n.hidden ? null : true }, n.hidden ? 'shown' : 'hidden')}>{n.hidden ? 'Show' : 'Hide'}</button>
        <button type="button" disabled={locked} onClick={() => onOps([{ op: 'duplicate', id: n.id }], 'duplicated')}>Duplicate</button>
        {n.type === 'group' && <button type="button" disabled={locked} onClick={() => onOps([{ op: 'ungroup', id: n.id }], 'ungrouped')}>Ungroup</button>}
        <button type="button" disabled={locked} onClick={() => onOps([{ op: 'reorder', id: n.id, to: 1e6 }], 'brought to front')}>To front</button>
        <button type="button" disabled={locked} onClick={() => onOps([{ op: 'reorder', id: n.id, to: 0 }], 'sent to back')}>To back</button>
        <button type="button" disabled={locked} onClick={() => onOps([{ op: 'remove', id: n.id }], 'deleted')}>Delete</button>
      </div>
    </section>
  );
}

function TextFields({ n, set, textRef }: { n: TextNode; set: (s: Record<string, unknown>, label: string) => void; textRef: React.RefObject<HTMLTextAreaElement> }) {
  const [words, setWords] = useState(n.text);
  useEffect(() => setWords(n.text), [n.text, n.id]);
  const fam = FONTS.find((f) => f.name === n.font);
  return (
    <div className="gx-textfields">
      <label className="gx-text">
        <span>Words</span>
        <textarea ref={textRef} rows={3} value={words} onChange={(e) => setWords(e.target.value)} onBlur={() => words.trim() && words !== n.text && set({ text: words }, 'words changed')} />
      </label>
      <label className="gx-sel-field">
        <span>Face</span>
        <select className="v0-select" value={n.font} onChange={(e) => set({ font: e.target.value }, `set in ${e.target.value}`)}>
          {!fam && <option value={n.font}>{n.font} (not on the list)</option>}
          {FONTS.map((f) => (
            <option key={f.name} value={f.name}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <div className="gx-grid2">
        <Num label="Size" value={n.size} min={4} max={2000} step={0.5} onCommit={(v) => set({ size: v }, 'size')} />
        <label className="gx-sel-field">
          <span>Weight</span>
          <select className="v0-select" value={n.weight} onChange={(e) => set({ weight: Number(e.target.value) }, 'weight')}>
            {[...new Set([...weightsFor(n.font), n.weight])].sort((p, q) => p - q).map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
        <Num label="Leading" value={n.lineHeight} min={0.7} max={3} step={0.05} onCommit={(v) => set({ lineHeight: v }, 'line height')} />
        <Num label="Tracking" value={n.tracking} min={-200} max={800} step={5} onCommit={(v) => set({ tracking: v }, 'tracking')} />
      </div>
      <div className="gx-btns" role="group" aria-label="Alignment">
        {(['left', 'center', 'right'] as const).map((a) => (
          <button key={a} type="button" aria-pressed={n.align === a} onClick={() => set({ align: a }, `aligned ${a}`)}>
            {a}
          </button>
        ))}
        <button type="button" aria-pressed={n.case === 'upper'} onClick={() => set({ case: n.case === 'upper' ? null : 'upper' }, 'case')}>
          AA
        </button>
        <button type="button" aria-pressed={!!n.italic} onClick={() => set({ italic: n.italic ? null : true }, 'italic')}>
          <i>I</i>
        </button>
        <button type="button" aria-pressed={!!n.vertical} onClick={() => set({ vertical: n.vertical ? null : true }, n.vertical ? 'horizontal' : 'vertical')}>
          Vertical
        </button>
      </div>
      <div className="gx-grid2">
        <Colour label="Colour" value={n.color} onCommit={(v) => set({ color: v }, 'text colour')} />
        <Num label="Outline" value={n.stroke?.width ?? 0} min={0} max={40} step={0.5} onCommit={(v) => set({ stroke: v > 0 ? { color: n.stroke?.color ?? n.color, width: v } : null }, 'outline')} />
      </div>
    </div>
  );
}

function GradientFields({ fill, onCommit }: { fill: Exclude<Paint, string>; onCommit: (f: Paint) => void }) {
  return (
    <div className="gx-gradient">
      {fill.stops.map((s, i) => (
        <Colour key={i} label={i === 0 ? 'From' : 'To'} value={s.color} onCommit={(v) => onCommit({ ...fill, stops: fill.stops.map((x, j) => (j === i ? { ...x, color: v } : x)) })} />
      ))}
      <Num label="Angle" value={fill.angle} min={-360} max={360} onCommit={(v) => onCommit({ ...fill, angle: v })} suffix="°" />
    </div>
  );
}

function ChartFields({ n, set }: { n: Extract<Node, { type: 'chart' }>; set: (s: Record<string, unknown>, label: string) => void }) {
  const [rows, setRows] = useState(n.data.map((d) => `${d.label}: ${d.value}`).join('\n'));
  useEffect(() => setRows(n.data.map((d) => `${d.label}: ${d.value}`).join('\n')), [n.data]);
  return (
    <div className="gx-textfields">
      <label className="gx-sel-field">
        <span>Chart</span>
        <select className="v0-select" value={n.chart} onChange={(e) => set({ chart: e.target.value }, 'chart kind')}>
          <option value="column">Columns</option>
          <option value="bar">Bars</option>
          <option value="line">Line</option>
          <option value="donut">Donut</option>
        </select>
      </label>
      <label className="gx-text">
        <span>Data (label: value, one per line)</span>
        <textarea
          rows={5}
          value={rows}
          onChange={(e) => setRows(e.target.value)}
          onBlur={() => {
            const data = rows
              .split('\n')
              .map((l) => l.match(/^\s*(.+?)\s*[:=]\s*(-?[\d.,]+)\s*$/))
              .filter((m): m is RegExpMatchArray => !!m)
              .map((m) => ({ label: m[1], value: Number(m[2].replace(/,/g, '')) }));
            if (data.length) set({ data }, 'chart data');
          }}
        />
      </label>
      <label className="gx-text">
        <span>Source</span>
        <input defaultValue={n.source ?? ''} key={n.id} onBlur={(e) => set({ source: e.target.value.trim() || null }, 'source')} />
      </label>
      <label className="gx-check">
        <input type="checkbox" checked={n.values} onChange={(e) => set({ values: e.target.checked }, 'values shown')} /> Values on the chart
      </label>
    </div>
  );
}
