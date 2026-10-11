'use client';

// components/display/VennFigure.tsx — two or three sets, and what each holds.
//
// Where the circles sit, where each region's label goes and which region a
// point falls in are the kind's (lib/objects/display-venn.ts vennLayout,
// maskAt): fixed geometry, computed once, never improvised. This draws it —
// soft circles, the sets' names, every region's members as chips with a
// count, "in none" outside — and every change is an operation: drag a chip
// into another region (or tick its sets in its inspector), add a member,
// rename or remove a set.

import { useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { vennLayout, vennRegions, maskAt, regionWords, VENN_LIMITS, type VennState, type VennElement } from '@/lib/objects/display-venn';
import type { FigureProps } from '@/components/objects/figures';
import { AddRow, DisplayShell, Edit, useDisplay, type Display } from './DisplayShell';
import { Confirm, Inspector, Tool, useSelection } from './primitives';
import './venn.css';

type D = Display<VennState>;
const TONES = ['a', 'b', 'c'] as const;

export function VennFigure(p: FigureProps) {
  const d = useDisplay<VennState>(p);
  const [sel, select] = useSelection(p);
  const s = d.state;
  const addRef = useRef<HTMLDivElement>(null);
  const el = sel && !sel.startsWith('set:') ? (s.elements.find((e) => e.id === sel) ?? null) : null;
  const set = sel?.startsWith('set:') ? (s.sets.find((x) => `set:${x.id}` === sel) ?? null) : null;
  const shared = vennRegions(s).filter((r) => r.sets.length > 1).reduce((n, r) => n + r.count, 0);
  const focusAdd = () => addRef.current?.querySelector('input')?.focus();
  return (
    <DisplayShell
      p={p}
      d={d}
      aside={`${s.elements.length} item${s.elements.length === 1 ? '' : 's'} · ${shared} shared`}
      tools={
        <>
          <Tool label="Add an item" onClick={focusAdd}>
            + Item
          </Tool>
          {s.sets.length < VENN_LIMITS.sets && (
            <Tool label="Add a circle" onClick={() => d.act('addSet', { name: `Group ${s.sets.length + 1}`, by: 'person' })}>
              + Circle
            </Tool>
          )}
        </>
      }
    >
      {s.view === 'table' ? <Table s={s} d={d} sel={sel} select={select} /> : <Picture s={s} d={d} sel={sel} select={select} />}
      {el && <ItemInspector s={s} d={d} el={el} onClose={() => select(null)} />}
      {set && (
        <Inspector title="Circle" by={set.by} onClose={() => select(null)}>
          <div className="dsp-fields">
            {d.live ? (
              <label className="dsp-field is-wide">
                <span>Name</span>
                <Edit value={set.name} label="Circle name" max={VENN_LIMITS.name} onDone={(name) => name && d.act('renameSet', { id: set.id, name, by: 'person' })} />
              </label>
            ) : (
              <p>{set.name}</p>
            )}
          </div>
          {d.live && s.sets.length > VENN_LIMITS.minSets && (
            <div className="dsp-editor-foot">
              <Confirm label="Remove this circle" ask={`Remove “${set.name}”? Its items stay, outside it.`} onConfirm={() => d.act('removeSet', { id: set.id }) && select(null)} />
            </div>
          )}
        </Inspector>
      )}
      {d.live && (
        <div ref={addRef}>
          <AddMember s={s} d={d} />
        </div>
      )}
    </DisplayShell>
  );
}

/** The circles, drawn from the kind's fixed geometry, with every region's members where they belong. */
function Picture({ s, d, sel, select }: { s: VennState; d: D; sel: string | null; select: (id: string | null) => void }) {
  const lay = vennLayout(s);
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const byId = new Map(s.elements.map((e) => [e.id, e]));
  const at = (e: { clientX: number; clientY: number }) => {
    const r = box.current?.getBoundingClientRect();
    return r ? { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height } : null;
  };
  const down = (e: RPointerEvent<HTMLButtonElement>, id: string) => {
    if (!d.live || e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const f = at(e);
    if (f) setDrag({ id, ...f, moved: false });
  };
  const move = (e: RPointerEvent<HTMLButtonElement>) => {
    if (!drag) return;
    const f = at(e);
    if (!f) return;
    const moved = drag.moved || Math.hypot(f.x - drag.x, f.y - drag.y) > 0.01;
    setDrag({ ...drag, x: f.x, y: f.y, moved });
    setOver(maskAt(lay.circles, f.x, f.y));
  };
  const up = () => {
    if (!drag) return;
    const { id, x, y, moved } = drag;
    setDrag(null);
    setOver(null);
    if (!moved) return select(sel === id ? null : id);
    const mask = maskAt(lay.circles, x, y);
    const sets = s.sets.filter((_, i) => mask & (1 << i)).map((x2) => x2.id);
    const was = byId.get(id)?.sets ?? [];
    if (sets.join(',') !== was.join(',')) d.act('setsOf', { id, sets: sets.join(','), by: 'person' });
  };
  const describe = lay.regions.map((r) => `${regionWords(s, r.mask)}: ${r.count ? r.members.map((m) => byId.get(m)?.label).join(', ') : 'nothing'}`).join('. ');

  return (
    <div className="dsp-venn" ref={box} role="group" aria-label={`Venn diagram. ${describe}.`}>
      <svg className="dsp-venn-svg" viewBox="0 0 100 100" aria-hidden="true" preserveAspectRatio="none">
        <rect x="0.5" y="0.5" width="99" height="99" rx="2" className="dsp-venn-universe" />
        {lay.circles.map((c, i) => (
          <circle key={c.set} cx={c.cx * 100} cy={c.cy * 100} r={c.r * 100} className={`dsp-venn-circle is-${TONES[i]}${over !== null && over & (1 << i) ? ' is-over' : ''}`} />
        ))}
      </svg>
      {lay.circles.map((c, i) => (
        <button
          key={`name:${c.set}`}
          type="button"
          className={`dsp-venn-name is-${TONES[i]}${sel === `set:${c.set}` ? ' is-sel' : ''}`}
          style={{ left: `${c.label.x * 100}%`, top: `${c.label.y * 100}%` }}
          onClick={() => select(sel === `set:${c.set}` ? null : `set:${c.set}`)}
          aria-label={`Circle ${c.name}`}
        >
          {c.name}
        </button>
      ))}
      {lay.regions.map((r) => (
        <div
          key={r.mask}
          className={`dsp-venn-region${r.mask === 0 ? ' is-none' : ''}`}
          style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, maxWidth: `${Math.max(14, r.clearance * 190)}%` }}
        >
          {r.count > 0 && <span className="dsp-venn-count" aria-hidden="true">{r.count}</span>}
          {r.mask === 0 && r.count > 0 && <span className="dsp-venn-none">{regionWords(s, 0)}</span>}
          <span className="dsp-venn-members">
            {r.members.map((m) => {
              const e = byId.get(m);
              if (!e) return null;
              const moving = drag?.id === m && drag.moved;
              return (
                <button
                  key={m}
                  type="button"
                  className={`dsp-venn-chip${sel === m ? ' is-sel' : ''}${e.by === 'socria' ? ' is-socria' : ''}${moving ? ' is-moving' : ''}`}
                  aria-label={`${e.label} — ${regionWords(s, r.mask)}`}
                  onPointerDown={(ev) => down(ev, m)}
                  onPointerMove={move}
                  onPointerUp={up}
                  onPointerCancel={() => (setDrag(null), setOver(null))}
                  onClick={(ev) => {
                    // the pointer path selects; a keyboard press lands here
                    if (ev.detail === 0) select(sel === m ? null : m);
                  }}
                  data-worked=""
                >
                  {e.label}
                </button>
              );
            })}
          </span>
        </div>
      ))}
      {drag?.moved && (
        <span className="dsp-venn-ghost" style={{ left: `${drag.x * 100}%`, top: `${drag.y * 100}%` }} aria-hidden="true">
          {byId.get(drag.id)?.label}
        </span>
      )}
      {!s.elements.length && <p className="dsp-venn-empty">Add an item below — then drag it to where it belongs.</p>}
    </div>
  );
}

/** Every item against every circle: the same membership, ticked. */
function Table({ s, d, sel, select }: { s: VennState; d: D; sel: string | null; select: (id: string | null) => void }) {
  const regions = vennRegions(s);
  const toggle = (e: VennElement, setId: string) => {
    const next = e.sets.includes(setId) ? e.sets.filter((x) => x !== setId) : s.sets.filter((x) => x.id === setId || e.sets.includes(x.id)).map((x) => x.id);
    d.act('setsOf', { id: e.id, sets: next.join(','), by: 'person' });
  };
  return (
    <div className="dsp-venn-table">
      <table className="dsp-table">
        <thead>
          <tr>
            <th>Item</th>
            {s.sets.map((x) => (
              <th key={x.id} className="is-num">
                {x.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {s.elements.map((e) => (
            <tr key={e.id} className={sel === e.id ? 'is-sel' : ''}>
              <td>
                <button type="button" className="dsp-item-text" onClick={() => select(sel === e.id ? null : e.id)}>
                  {e.label}
                </button>
              </td>
              {s.sets.map((x) => (
                <td key={x.id} className="is-num">
                  <input type="checkbox" checked={e.sets.includes(x.id)} disabled={!d.live} onChange={() => toggle(e, x.id)} aria-label={`${e.label} is in ${x.name}`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="dsp-sub">How many in each part</p>
      <ul className="dsp-venn-counts">
        {regions.map((r) => (
          <li key={r.mask}>
            <span>{regionWords(s, r.mask)}</span>
            <strong>{r.count}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ItemInspector({ s, d, el, onClose }: { s: VennState; d: D; el: VennElement; onClose: () => void }) {
  const toggle = (setId: string) => {
    const next = el.sets.includes(setId) ? el.sets.filter((x) => x !== setId) : s.sets.filter((x) => x.id === setId || el.sets.includes(x.id)).map((x) => x.id);
    d.act('setsOf', { id: el.id, sets: next.join(','), by: 'person' });
  };
  return (
    <Inspector title={el.label} by={el.by} onClose={onClose}>
      <div className="dsp-fields">
        {d.live && (
          <label className="dsp-field is-wide">
            <span>Name</span>
            <Edit value={el.label} label="Item name" max={VENN_LIMITS.label} onDone={(label) => label && d.act('renameElement', { id: el.id, label, by: 'person' })} />
          </label>
        )}
        <fieldset className="dsp-field is-wide dsp-venn-in">
          <legend>In</legend>
          {s.sets.map((x, i) => (
            <label key={x.id} className={`dsp-venn-tick is-${TONES[i]}`}>
              <input type="checkbox" checked={el.sets.includes(x.id)} disabled={!d.live} onChange={() => toggle(x.id)} />
              {x.name}
            </label>
          ))}
        </fieldset>
      </div>
      {d.live && (
        <div className="dsp-editor-foot">
          <Confirm label="Remove" ask={`Remove “${el.label}”?`} onConfirm={() => d.act('removeElement', { id: el.id }) && onClose()} />
        </div>
      )}
    </Inspector>
  );
}

/** Add an item, ticking the circles it goes in. */
function AddMember({ s, d }: { s: VennState; d: D }) {
  const [into, setInto] = useState<string[]>([]);
  return (
    <AddRow
      label="Add an item"
      placeholder="Add an item…"
      onAdd={(label) => {
        const ok = d.act('addElement', { label, sets: s.sets.filter((x) => into.includes(x.id)).map((x) => x.id).join(','), by: 'person' });
        if (ok) setInto([]);
        return ok;
      }}
      extra={
        <span className="dsp-venn-into" role="group" aria-label="In which circles">
          {s.sets.map((x, i) => (
            <label key={x.id} className={`dsp-venn-tick is-${TONES[i]}`}>
              <input type="checkbox" checked={into.includes(x.id)} onChange={() => setInto((v) => (v.includes(x.id) ? v.filter((y) => y !== x.id) : [...v, x.id]))} />
              {x.name}
            </label>
          ))}
        </span>
      }
    />
  );
}
