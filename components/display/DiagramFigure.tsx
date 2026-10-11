'use client';

// components/display/DiagramFigure.tsx — things and how they connect, in the shape that fits.
//
// One set of nodes and connections (lib/objects/display-diagram.ts), drawn as
// a concept map, a mind map, a hierarchy, a flow, a decision tree or an
// outline — the kind lays each one out, and this only draws it. In the
// concept view a node can be dragged where the person wants it, and stays
// there (`place`). In a decision tree the rollback is the kind's: what each
// node is worth from the payoffs and chances the person gave, the best option
// at each decision, and — in words — what stops it being computed. Nothing
// is assumed where a number is missing.

import { useState } from 'react';
import {
  DIAGRAM_LIMITS,
  drawDiagram,
  outlineOf,
  placementOf,
  rollback,
  type DiagramNode,
  type DiagramState,
  type NodeKind,
} from '@/lib/objects/display-diagram';
import type { FigureProps } from '@/components/objects/figures';
import { AddRow, DisplayShell, Edit, useDisplay, type Display } from './DisplayShell';
import { Confirm, Field, Inspector, NumberEdit, Segmented, Tool, useSelection } from './primitives';
import { NodeLinks } from './NodeLinks';
import './diagram.css';

type S = DiagramState;
type D = Display<S>;
const BOX = { w: 150, h: 46, gapX: 26, gapY: 52 };
const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '—' : Math.abs(n) >= 1000 ? Math.round(n).toLocaleString() : String(Math.round(n * 100) / 100));

export function DiagramFigure(p: FigureProps) {
  const d = useDisplay<S>(p);
  const s = d.state;
  const [sel, select] = useSelection(p);
  const picked = s.nodes.find((n) => n.id === sel) ?? null;
  const rb = s.view === 'decision' ? rollback(s) : null;
  return (
    <DisplayShell
      p={p}
      d={d}
      aside={`${s.nodes.length} node${s.nodes.length === 1 ? '' : 's'} · ${s.edges.length} connection${s.edges.length === 1 ? '' : 's'}`}
      tools={
        <>
          <Tool label="Add a node" onClick={() => select('__add')} disabled={s.nodes.length >= DIAGRAM_LIMITS.nodes}>
            + Node
          </Tool>
          <Tool label={s.detail === 'simple' ? 'Show every node' : 'Show only the main nodes'} on={s.detail === 'simple'} onClick={() => d.act('detail', { detail: s.detail === 'simple' ? 'full' : 'simple' })}>
            Simple
          </Tool>
        </>
      }
    >
      {!s.nodes.length && <p className="dsp-empty">No nodes yet — add the first, then the ones that connect to it.</p>}
      {s.view === 'outline' ? <Outline d={d} sel={sel} select={select} /> : <Picture d={d} sel={sel} select={select} rb={rb} />}
      {rb && <Rollback s={s} rb={rb} />}
      {sel === '__add' && d.live && (
        <Inspector title="A new node" by="person" onClose={() => select(null)}>
          <AddRow label="A new node" placeholder="What it is…" onAdd={(t) => d.act('addNode', { label: t, by: 'person' }) && (select(null), true)} />
        </Inspector>
      )}
      {picked && <NodePanel d={d} n={picked} onClose={() => select(null)} />}
    </DisplayShell>
  );
}

function Picture({ d, sel, select, rb }: { d: D; sel: string | null; select: (id: string | null) => void; rb: ReturnType<typeof rollback> | null }) {
  const s = d.state;
  const drawing = drawDiagram(s, BOX);
  const byId = new Map(s.nodes.map((n) => [n.id, n]));
  if (!drawing || !drawing.boxes.length) return null;
  const concept = s.view === 'concept';
  return (
    <>
      {concept && d.live && <p className="dsp-empty">Drag a node to where you want it — it stays there.</p>}
      <NodeLinks
        width={drawing.width}
        height={drawing.height}
        boxes={drawing.boxes}
        label={`Diagram: ${s.title}`}
        lines={drawing.lines.map((l) => ({
          from: l.from,
          to: l.to,
          label: l.prob !== undefined ? `${Math.round(l.prob * 1000) / 10}%${l.label ? ` · ${l.label}` : ''}` : l.label,
          className: `is-${l.how}${rb && rb.best[l.from] === l.to ? ' is-best' : ''}`,
          dashed: l.how !== 'along',
          arrow: s.view !== 'mind',
        }))}
        draggable={concept && d.live ? () => true : undefined}
        onDrop={(id, x, y) => {
          const b = drawing.boxes.find((bx) => bx.id === id);
          if (!b) return;
          const at = placementOf(x, y, drawing.width, drawing.height, b.w, b.h);
          d.act('place', { id, x: at.x, y: at.y });
        }}
        boxClass={(id) => {
          const n = byId.get(id);
          return `dsp-dg-box${n?.kind ? ` is-${n.kind}` : ''}${n?.by === 'socria' ? ' is-socria' : ''}${sel === id ? ' is-sel' : ''}${drawing.loose.includes(id) ? ' is-loose' : ''}${n && n.x !== undefined ? ' is-placed' : ''}`;
        }}
        renderBox={(b) => {
          const n = byId.get(b.id)!;
          return (
            <button type="button" className="dsp-dg-in" aria-pressed={sel === n.id} onClick={() => select(sel === n.id ? null : n.id)}>
              {n.kind && <span className="dsp-dg-kind">{n.kind}</span>}
              <span className="dsp-dg-label">{n.label}</span>
              {rb && rb.values[n.id] !== undefined && <span className="dsp-dg-val">worth {fmt(rb.values[n.id])}</span>}
              {n.group && s.view === 'concept' && <span className="dsp-dg-group">{n.group}</span>}
            </button>
          );
        }}
      />
      {drawing.loose.length > 0 && <p className="dsp-empty">{drawing.loose.length} node{drawing.loose.length === 1 ? '' : 's'} could not be set into this shape and {drawing.loose.length === 1 ? 'sits' : 'sit'} beneath it.</p>}
    </>
  );
}

function Outline({ d, sel, select }: { d: D; sel: string | null; select: (id: string | null) => void }) {
  const s = d.state;
  const o = outlineOf(s);
  const byId = new Map(s.nodes.map((n) => [n.id, n]));
  return (
    <>
      <ol className="dsp-dg-outline">
        {o.lines.map((l) => (
          <li key={l.id} style={{ paddingLeft: l.depth * 18 }}>
            <button type="button" className={`dsp-dg-line${sel === l.id ? ' is-sel' : ''}`} aria-pressed={sel === l.id} onClick={() => select(sel === l.id ? null : l.id)}>
              {byId.get(l.id)?.label}
              {byId.get(l.id)?.note && <span className="dsp-dg-note"> — {byId.get(l.id)!.note}</span>}
            </button>
          </li>
        ))}
      </ol>
      {o.loose.length > 0 && (
        <p className="dsp-empty">
          {o.lines.length ? 'Not reached from the root: ' : 'No root yet — choose a node to grow it from. Nodes: '}
          {o.loose.map((id) => byId.get(id)?.label).join(', ')}
        </p>
      )}
    </>
  );
}

function Rollback({ s, rb }: { s: S; rb: ReturnType<typeof rollback> }) {
  const name = (id: string | null) => s.nodes.find((n) => n.id === id)?.label ?? '';
  return (
    <div className="dsp-dg-rb">
      {rb.root && rb.values[rb.root] !== null && rb.values[rb.root] !== undefined && (
        <p className="dsp-note">
          Rolled back from your payoffs and chances, {name(rb.root)} is worth {fmt(rb.values[rb.root])}.
        </p>
      )}
      {Object.entries(rb.best).map(([dec, opt]) => (
        <p key={dec} className="dsp-dg-best">
          At “{name(dec)}”, “{name(opt)}” is worth the most on these numbers — what you choose is yours.
        </p>
      ))}
      {rb.problems.length > 0 && (
        <ul className="dsp-dg-problems">
          {rb.problems.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NodePanel({ d, n, onClose }: { d: D; n: DiagramNode; onClose: () => void }) {
  const s = d.state;
  const [to, setTo] = useState('');
  const out = s.edges.filter((e) => e.from === n.id);
  const into = s.edges.filter((e) => e.to === n.id);
  const name = (id: string) => s.nodes.find((x) => x.id === id)?.label ?? id;
  return (
    <Inspector title={n.label} by={n.by} onClose={onClose}>
      <div className="dsp-fields">
        <Field label="Name" wide>
          {d.live ? <Edit value={n.label} label="Name" onDone={(v) => v && v !== n.label && d.act('rename', { id: n.id, label: v })} max={DIAGRAM_LIMITS.label} /> : <span>{n.label}</span>}
        </Field>
        <Field label="Note" wide>
          {d.live ? <Edit value={n.note ?? ''} label="Note" placeholder="—" onDone={(v) => (v || n.note) && d.act('note', { id: n.id, note: v })} max={DIAGRAM_LIMITS.note} /> : <span>{n.note ?? '—'}</span>}
        </Field>
        <Field label="Group">
          {d.live ? <Edit value={n.group ?? ''} label="Group" placeholder="—" onDone={(v) => (v || n.group) && d.act('group', { id: n.id, group: v })} max={DIAGRAM_LIMITS.group} /> : <span>{n.group ?? '—'}</span>}
        </Field>
        {s.view === 'decision' && (
          <div className="dsp-field is-wide">
            <span>In the decision tree</span>
            <Segmented
              label="What it is in the decision tree"
              options={[
                { id: 'decision', label: 'Decision' },
                { id: 'chance', label: 'Chance' },
                { id: 'outcome', label: 'Outcome' },
                { id: '', label: '—' },
              ]}
              value={(n.kind ?? '') as NodeKind | ''}
              disabled={!d.live}
              onChange={(k) => d.act('kind', { id: n.id, kind: k })}
            />
          </div>
        )}
        {n.kind === 'outcome' && (
          <Field label="Payoff">
            <NumberEdit value={n.value ?? null} label="Payoff" disabled={!d.live} onDone={(v) => d.act('value', { id: n.id, value: v === null ? '' : v })} />
          </Field>
        )}
      </div>
      {out.length > 0 && (
        <div className="dsp-dg-edges">
          <span className="dsp-sub">Leads to</span>
          <ul>
            {out.map((e) => (
              <li key={e.to}>
                {name(e.to)}
                {n.kind === 'chance' && (
                  <NumberEdit
                    value={e.prob === undefined ? null : Math.round(e.prob * 1000) / 10}
                    label={`Chance of ${name(e.to)}, in percent`}
                    placeholder="%"
                    disabled={!d.live}
                    onDone={(v) => d.act('prob', { from: e.from, to: e.to, p: v === null ? '' : v / 100 })}
                  />
                )}
                {n.kind === 'chance' && <span className="dsp-empty">%</span>}
                {d.live && (
                  <button type="button" className="dsp-x" aria-label={`Disconnect from ${name(e.to)}`} onClick={() => d.act('disconnect', { from: e.from, to: e.to })}>
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {into.length > 0 && <p className="dsp-empty">Comes from: {into.map((e) => name(e.from)).join(', ')}</p>}
      {d.live && (
        <div className="dsp-dg-acts">
          <AddRow label={`Add a node beneath ${n.label}`} placeholder="Add beneath it…" onAdd={(t) => d.act('addNode', { label: t, parent: n.id, by: 'person' })} />
          <span className="dsp-dg-connect">
            <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Connect it to">
              <option value="">connect to…</option>
              {s.nodes
                .filter((x) => x.id !== n.id && !out.some((e) => e.to === x.id))
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label.slice(0, 50)}
                  </option>
                ))}
            </select>
            <button type="button" className="dsp-tool" disabled={!to} onClick={() => d.act('connect', { from: n.id, to, by: 'person' }) && setTo('')}>
              Connect
            </button>
            {s.root !== n.id && (
              <button type="button" className="dsp-tool" onClick={() => d.act('root', { id: n.id })}>
                Grow it from here
              </button>
            )}
            {n.x !== undefined && (
              <button type="button" className="dsp-tool" onClick={() => d.act('place', { id: n.id, x: '', y: '' })}>
                Let the layout place it
              </button>
            )}
          </span>
          <Confirm label="Remove" ask={`Remove “${n.label}”?`} onConfirm={() => (d.act('removeNode', { id: n.id }), onClose())} />
        </div>
      )}
    </Inspector>
  );
}
