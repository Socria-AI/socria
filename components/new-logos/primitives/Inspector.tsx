'use client';
// components/new-logos/primitives/Inspector.tsx — the properties of the selected primitive, and the artifact's shared
// variables: what is not worked on directly in the primitive itself (a plot's ranges and series kinds, a column's
// formula, a control's range, an annotation's subject, an image's caption and source). It floats beside the canvas and
// only while something is selected; every field is one operation.

import { useState } from 'react';
import type { ArtifactOp } from '@/lib/new-logos/artifact-ops';
import { formatNumber, isIdent } from '@/lib/new-logos/expr';
import type { Scope } from '@/lib/new-logos/compose';
import { cleanUrl } from '@/lib/new-logos/clean';
import {
  PRIMITIVE_LABEL,
  freeName,
  keyFrom,
  newItemId,
  type Composition,
  type PlotSeries,
  type Primitive,
  type PrimitiveOf,
  type TableColumn,
} from '@/lib/new-logos/primitives';
import { CommitInput, NumberInput, PrimGlyph, setOrWiden } from './common';
import { equationLine, readEquationLine } from './Equation';

type Run = (ops: ArtifactOp[]) => void;


const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="nl-insp-row">
    <span>{label}</span>
    {children}
  </label>
);

export function Inspector({ p, comp, scope, run, onClose, onDuplicate, onRemove }: { p: Primitive; comp: Composition; scope: Scope; run: Run; onClose: () => void; onDuplicate: () => void; onRemove: () => void }) {
  const upd = (data: Record<string, unknown>) => run([{ op: 'update', id: p.id, data }]);
  return (
    <aside className="nl-inspector nl-cv-ui nl-cv-scroll" aria-label={`${PRIMITIVE_LABEL[p.type]} properties`}>
      <div className="nl-insp-head">
        <PrimGlyph type={p.type} />
        <strong>{PRIMITIVE_LABEL[p.type]}</strong>
        <span className="nl-grow" />
        <button type="button" className="nl-icon-btn is-quiet" aria-label="Close properties" onClick={onClose}>
          ×
        </button>
      </div>
      <Row label="Label">
        <CommitInput aria-label="Label" placeholder={PRIMITIVE_LABEL[p.type]} value={p.label} onCommit={(v) => run([{ op: 'update', id: p.id, label: v }])} />
      </Row>
      {p.type === 'text' ? <TextProps p={p} comp={comp} upd={upd} /> : null}
      {p.type === 'equation' ? <EquationProps p={p} scope={scope} upd={upd} /> : null}
      {p.type === 'control' ? <ControlProps p={p} comp={comp} run={run} upd={upd} /> : null}
      {p.type === 'plot' ? <PlotProps p={p} comp={comp} upd={upd} /> : null}
      {p.type === 'table' ? <TableProps p={p} upd={upd} /> : null}
      {p.type === 'media' ? <MediaProps p={p} upd={upd} /> : null}
      {p.type === 'graph' || p.type === 'diagram' ? <p className="nl-hint">Work on it directly: double-click to add, drag to move, select one and drag its circle to connect.</p> : null}
      <div className="nl-insp-actions">
        <button type="button" className="nl-btn is-small" onClick={onDuplicate}>
          Duplicate
        </button>
        <button type="button" className="nl-btn is-small" onClick={() => run([{ op: 'order', id: p.id, to: 'front' }])}>
          To front
        </button>
        <button type="button" className="nl-btn is-small" onClick={() => run([{ op: 'order', id: p.id, to: 'back' }])}>
          To back
        </button>
        <button type="button" className="nl-btn is-small is-danger" onClick={onRemove}>
          Remove
        </button>
      </div>
    </aside>
  );
}

function TextProps({ p, comp, upd }: { p: PrimitiveOf<'text'>; comp: Composition; upd: (d: Record<string, unknown>) => void }) {
  return (
    <>
      <Row label="Style">
        <select className="nl-select" value={p.data.style} onChange={(e) => upd({ style: e.target.value })}>
          <option value="plain">Plain</option>
          <option value="note">Note</option>
          <option value="callout">Callout</option>
          <option value="annotation">Annotation</option>
        </select>
      </Row>
      {p.data.style === 'annotation' ? (
        <Row label="Annotates">
          <select className="nl-select" value={p.data.target ?? ''} onChange={(e) => upd({ target: e.target.value || null })}>
            <option value="">Nothing</option>
            {comp.primitives
              .filter((x) => x.id !== p.id)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label || PRIMITIVE_LABEL[x.type]}
                </option>
              ))}
          </select>
        </Row>
      ) : null}
      <label className="nl-insp-check">
        <input type="checkbox" checked={p.data.live !== false} onChange={(e) => upd({ live: e.target.checked })} /> Show {'{{…}}'} as live values
      </label>
      <p className="nl-hint">Double-click the text to write. {'{{expression}}'} shows a live value, such as {'{{price * quantity}}'}.</p>
    </>
  );
}

function EquationProps({ p, scope, upd }: { p: PrimitiveOf<'equation'>; scope: Scope; upd: (d: Record<string, unknown>) => void }) {
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <>
      <Row label="Equation">
        <CommitInput
          className="nl-in is-mono"
          aria-label="Equation"
          value={equationLine(p.data)}
          onCommit={(line) => {
            const r = readEquationLine(line);
            if (!r.ok) return setProblem(r.error);
            setProblem(null);
            upd(r.data as unknown as Record<string, unknown>);
          }}
        />
      </Row>
      {problem ? <p className="nl-prim-error">{problem}</p> : null}
      <p className="nl-hint">
        Write <code>name = expression</code> to define a value others can use, <code>f(x) = expression</code> for a function a plot can draw, or an expression alone to work it out.
        {Number.isFinite(scope.results[p.id]) ? ` Now: ${formatNumber(scope.results[p.id])}.` : ''}
      </p>
    </>
  );
}

function ControlProps({ p, comp, run, upd }: { p: PrimitiveOf<'control'>; comp: Composition; run: Run; upd: (d: Record<string, unknown>) => void }) {
  const v = comp.variables.find((x) => x.name === p.data.variable);
  const varUpd = (patch: Record<string, unknown>) => v && run([{ op: 'var.update', name: v.name, patch }]);
  return (
    <>
      <Row label="Variable">
        <select className="nl-select" value={p.data.variable} onChange={(e) => upd({ variable: e.target.value })}>
          {!v ? <option value={p.data.variable}>{p.data.variable || 'None'}</option> : null}
          {comp.variables.map((x) => (
            <option key={x.name} value={x.name}>
              {x.name}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Kind">
        <select className="nl-select" value={v?.kind === 'boolean' ? 'toggle' : p.data.kind} onChange={(e) => {
          const kind = e.target.value;
          const ops: ArtifactOp[] = [{ op: 'update', id: p.id, data: { kind } }];
          if (v && (kind === 'toggle') !== (v.kind === 'boolean')) ops.push({ op: 'var.update', name: v.name, patch: kind === 'toggle' ? { kind: 'boolean' } : { kind: 'number', min: 0, max: 10, step: 0.1 } });
          run(ops);
        }}>
          <option value="slider">Slider</option>
          <option value="number">Number field</option>
          <option value="toggle">Toggle</option>
          <option value="choice">Choice</option>
        </select>
      </Row>
      {v && v.kind === 'number' ? (
        <>
          <div className="nl-insp-grid">
            <Row label="From">
              <NumberInput aria-label="Smallest value" value={v.min} onCommit={(n) => varUpd({ min: n })} />
            </Row>
            <Row label="To">
              <NumberInput aria-label="Largest value" value={v.max} onCommit={(n) => varUpd({ max: n })} />
            </Row>
            <Row label="Step">
              <NumberInput aria-label="Step" value={v.step} onCommit={(n) => varUpd({ step: n })} />
            </Row>
          </div>
          <div className="nl-insp-grid">
            <Row label="Shown as">
              <CommitInput aria-label="Shown as" placeholder={v.name} value={v.label ?? ''} onCommit={(s) => varUpd({ label: s })} />
            </Row>
            <Row label="Unit">
              <CommitInput aria-label="Unit" value={v.unit ?? ''} onCommit={(s) => varUpd({ unit: s })} />
            </Row>
          </div>
        </>
      ) : null}
      {p.data.kind === 'choice' ? (
        <Row label="Choices">
          <CommitInput
            aria-label="Choices"
            placeholder="Low = 1, Medium = 2, High = 3"
            value={p.data.options.map((o) => `${o.label} = ${o.value}`).join(', ')}
            onCommit={(s) =>
              upd({
                options: s
                  .split(',')
                  .map((part) => part.split('='))
                  .map(([label, value]) => ({ label: (label ?? '').trim(), value: Number((value ?? label ?? '').trim()) }))
                  .filter((o) => Number.isFinite(o.value)),
              })
            }
          />
        </Row>
      ) : null}
    </>
  );
}

function PlotProps({ p, comp, upd }: { p: PrimitiveOf<'plot'>; comp: Composition; upd: (d: Record<string, unknown>) => void }) {
  const d = p.data;
  const tables = comp.primitives.filter((x): x is PrimitiveOf<'table'> => x.type === 'table');
  const setSeries = (series: PlotSeries[]) => upd({ series });
  const patch = (id: string, change: Partial<PlotSeries>) => setSeries(d.series.map((s) => (s.id === id ? ({ ...s, ...change } as PlotSeries) : s)));
  return (
    <>
      <div className="nl-insp-grid">
        <Row label="x from">
          <NumberInput aria-label="x from" value={d.x.min} onCommit={(n) => upd({ x: { ...d.x, min: n } })} />
        </Row>
        <Row label="to">
          <NumberInput aria-label="x to" value={d.x.max} onCommit={(n) => upd({ x: { ...d.x, max: n } })} />
        </Row>
        <Row label="x is">
          <CommitInput aria-label="Horizontal axis label" value={d.x.label} onCommit={(s) => upd({ x: { ...d.x, label: s } })} />
        </Row>
      </div>
      <label className="nl-insp-check">
        <input type="checkbox" checked={d.y.auto} onChange={(e) => upd({ y: { ...d.y, auto: e.target.checked } })} /> Fit y to what is drawn
      </label>
      <div className="nl-insp-grid">
        {!d.y.auto ? (
          <>
            <Row label="y from">
              <NumberInput aria-label="y from" value={d.y.min} onCommit={(n) => upd({ y: { ...d.y, min: n } })} />
            </Row>
            <Row label="to">
              <NumberInput aria-label="y to" value={d.y.max} onCommit={(n) => upd({ y: { ...d.y, max: n } })} />
            </Row>
          </>
        ) : null}
        <Row label="y is">
          <CommitInput aria-label="Vertical axis label" value={d.y.label} onCommit={(s) => upd({ y: { ...d.y, label: s } })} />
        </Row>
      </div>
      <label className="nl-insp-check">
        <input type="checkbox" checked={d.grid} onChange={(e) => upd({ grid: e.target.checked })} /> Grid
      </label>
      <div className="nl-label">Series</div>
      {d.series.map((s) => (
        <div key={s.id} className="nl-insp-series">
          <CommitInput aria-label="Series name" placeholder="Name (optional)" value={s.label} onCommit={(v) => patch(s.id, { label: v })} />
          {s.kind === 'fn' ? (
            <>
              <CommitInput className="nl-in is-mono" aria-label="Function of x" value={s.expr} onCommit={(v) => patch(s.id, { expr: v })} />
              <select className="nl-select" aria-label="Line" value={s.style} onChange={(e) => patch(s.id, { style: e.target.value as 'solid' })}>
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
            </>
          ) : s.kind === 'point' ? (
            <div className="nl-insp-grid">
              <CommitInput className="nl-in is-mono" aria-label="Point x" value={s.x} onCommit={(v) => patch(s.id, { x: v })} />
              <CommitInput className="nl-in is-mono" aria-label="Point y" value={s.y} onCommit={(v) => patch(s.id, { y: v })} />
            </div>
          ) : (
            (() => {
              const t = tables.find((x) => x.id === s.table);
              return (
                <div className="nl-insp-grid">
                  <select className="nl-select" aria-label="x column" value={s.x} onChange={(e) => patch(s.id, { x: e.target.value })}>
                    <option value="">x column…</option>
                    {t?.data.columns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <select className="nl-select" aria-label="y column" value={s.y} onChange={(e) => patch(s.id, { y: e.target.value })}>
                    <option value="">y column…</option>
                    {t?.data.columns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <select className="nl-select" aria-label="Mark" value={s.mark} onChange={(e) => patch(s.id, { mark: e.target.value as 'points' })}>
                    <option value="points">Points</option>
                    <option value="line">Line</option>
                  </select>
                </div>
              );
            })()
          )}
        </div>
      ))}
      {tables.length && d.series.length < 8 ? (
        <select
          className="nl-select"
          aria-label="Plot data from a table"
          value=""
          onChange={(e) => {
            const t = tables.find((x) => x.id === e.target.value);
            if (!t) return;
            const nums = t.data.columns.filter((c) => c.kind !== 'text');
            setSeries([...d.series, { id: newItemId('s'), kind: 'table', table: t.id, x: nums[0]?.id ?? '', y: nums[1]?.id ?? nums[0]?.id ?? '', label: '', mark: 'points', style: 'solid' }]);
          }}
        >
          <option value="">+ Data from a table…</option>
          {tables.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label || 'Table'}
            </option>
          ))}
        </select>
      ) : null}
    </>
  );
}

function TableProps({ p, upd }: { p: PrimitiveOf<'table'>; upd: (d: Record<string, unknown>) => void }) {
  const cols = p.data.columns;
  const setCols = (columns: TableColumn[]) => upd({ columns });
  return (
    <>
      <div className="nl-label">Columns</div>
      {cols.map((c, i) => (
        <div key={c.id} className="nl-insp-series">
          <div className="nl-insp-grid">
            <CommitInput aria-label="Column name" value={c.name} onCommit={(v) => setCols(cols.map((x) => (x.id === c.id ? { ...x, name: v || x.name } : x)))} />
            <select className="nl-select" aria-label="Column kind" value={c.kind} onChange={(e) => setCols(cols.map((x) => (x.id === c.id ? { ...x, kind: e.target.value as TableColumn['kind'], ...(e.target.value === 'formula' && !x.expr ? { expr: cols.find((y) => y.kind === 'number' && y.id !== x.id)?.key ?? '1' } : {}) } : x)))}>
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="formula">Formula</option>
            </select>
          </div>
          <div className="nl-insp-grid">
            <CommitInput
              className="nl-in is-mono"
              aria-label="Name in formulas"
              value={c.key}
              onCommit={(v) => isIdent(v) && !cols.some((x) => x.key === v && x.id !== c.id) && setCols(cols.map((x) => (x.id === c.id ? { ...x, key: v } : x)))}
            />
            {c.kind === 'formula' ? <CommitInput className="nl-in is-mono" aria-label="Formula" placeholder="price * quantity" value={c.expr ?? ''} onCommit={(v) => setCols(cols.map((x) => (x.id === c.id ? { ...x, expr: v } : x)))} /> : null}
          </div>
          <div className="nl-row">
            <button type="button" className="nl-btn is-quiet is-small" disabled={i === 0} onClick={() => setCols([...cols.slice(0, i - 1), c, cols[i - 1], ...cols.slice(i + 1)])}>
              Move left
            </button>
            <button type="button" className="nl-btn is-quiet is-small" onClick={() => setCols(cols.filter((x) => x.id !== c.id))}>
              Remove column
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="nl-btn is-small" onClick={() => setCols([...cols, { id: newItemId('c'), name: `Column ${cols.length + 1}`, key: keyFrom(`Column ${cols.length + 1}`, new Set(cols.map((c) => c.key))), kind: 'number' }])}>
        + Column
      </button>
      <p className="nl-hint">A formula is worked out for each row from the row&rsquo;s other columns (by their names in formulas) and the shared variables, left to right.</p>
    </>
  );
}

function MediaProps({ p, upd }: { p: PrimitiveOf<'media'>; upd: (d: Record<string, unknown>) => void }) {
  const d = p.data;
  return (
    <>
      <Row label="Description">
        <CommitInput aria-label="Description for people who cannot see it" placeholder="What it shows" value={d.alt} onCommit={(v) => upd({ alt: v })} />
      </Row>
      <Row label="Caption">
        <CommitInput aria-label="Caption" value={d.caption} onCommit={(v) => upd({ caption: v })} />
      </Row>
      <div className="nl-insp-grid">
        <Row label="Source">
          <CommitInput aria-label="Source" placeholder="Where it is from" value={d.source?.label ?? ''} onCommit={(v) => upd({ source: v || d.source?.url ? { label: v, url: d.source?.url } : null })} />
        </Row>
        <Row label="Address">
          <CommitInput aria-label="Source address" placeholder="https://…" value={d.source?.url ?? ''} onCommit={(v) => upd({ source: v || d.source?.label ? { label: d.source?.label ?? '', url: cleanUrl(v) ?? null } : null })} />
        </Row>
      </div>
      <Row label="Fit">
        <select className="nl-select" value={d.fit} onChange={(e) => upd({ fit: e.target.value })}>
          <option value="contain">Whole image</option>
          <option value="cover">Fill the frame</option>
        </select>
      </Row>
      {d.src ? (
        <button type="button" className="nl-btn is-small" onClick={() => upd({ src: null })}>
          Take the image out
        </button>
      ) : null}
    </>
  );
}

/** The artifact's shared variables: their values, ranges and names, and new ones. */
export function VariablesPanel({ comp, run, onClose }: { comp: Composition; run: Run; onClose: () => void }) {
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <aside className="nl-inspector nl-cv-ui nl-cv-scroll" aria-label="Shared variables">
      <div className="nl-insp-head">
        <strong>Shared variables</strong>
        <span className="nl-grow" />
        <button type="button" className="nl-icon-btn is-quiet" aria-label="Close variables" onClick={onClose}>
          ×
        </button>
      </div>
      <p className="nl-hint">Every equation, plot, table formula and live value in this artifact can use these by name. Controls move them.</p>
      {comp.variables.map((v) => (
        <div key={v.name} className="nl-insp-series">
          <div className="nl-insp-grid">
            <CommitInput
              className="nl-in is-mono"
              aria-label={`Name of ${v.name}`}
              value={v.name}
              onCommit={(to) => {
                if (!isIdent(to)) return setProblem(`“${to}” cannot be a name: letters, digits and _, starting with a letter, and not a word that already means something.`);
                setProblem(null);
                run([{ op: 'var.rename', from: v.name, to }]);
              }}
            />
            {v.kind === 'boolean' ? (
              <button type="button" className="nl-btn is-small" aria-pressed={v.value !== 0} onClick={() => run([{ op: 'var.set', name: v.name, value: v.value ? 0 : 1 }])}>
                {v.value ? 'On' : 'Off'}
              </button>
            ) : (
              <NumberInput aria-label={`Value of ${v.name}`} value={v.value} onCommit={(n) => run([setOrWiden(v, n)])} />
            )}
            <button type="button" className="nl-icon-btn is-quiet" aria-label={`Remove ${v.name}`} onClick={() => run([{ op: 'var.remove', name: v.name }])}>
              ×
            </button>
          </div>
          {v.kind === 'number' ? (
            <div className="nl-insp-grid is-small">
              <NumberInput aria-label={`${v.name} from`} value={v.min} onCommit={(n) => run([{ op: 'var.update', name: v.name, patch: { min: n } }])} />
              <NumberInput aria-label={`${v.name} to`} value={v.max} onCommit={(n) => run([{ op: 'var.update', name: v.name, patch: { max: n } }])} />
              <NumberInput aria-label={`${v.name} step`} value={v.step} onCommit={(n) => run([{ op: 'var.update', name: v.name, patch: { step: n } }])} />
            </div>
          ) : null}
        </div>
      ))}
      {problem ? <p className="nl-prim-error">{problem}</p> : null}
      <button type="button" className="nl-btn is-small" onClick={() => run([{ op: 'var.add', variable: { name: freeName(comp), value: 1, min: 0, max: 10, step: 0.1 } }])}>
        + Variable
      </button>
    </aside>
  );
}
