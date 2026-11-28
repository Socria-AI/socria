'use client';
// components/new-logos/primitives/Control.tsx — a control: a slider, a number field, a toggle or a choice, bound to a
// shared variable. Moving it sets the variable, and everything that reads the variable follows at once: the change is
// an operation like any other (var.set), shown immediately and saved shortly after.

import { formatNumber } from '@/lib/new-logos/expr';
import { NumberInput, setOrWiden, type PrimProps } from './common';

export function ControlPrim({ p, comp, editable, run }: PrimProps<'control'>) {
  const v = comp.variables.find((x) => x.name === p.data.variable);
  if (!v) {
    return (
      <div className="nl-prim-ctl is-missing">
        <p className="nl-prim-hint">{p.data.variable ? `There is no variable called ${p.data.variable}.` : 'Not bound to a variable yet.'}</p>
        {editable && p.data.variable ? (
          <button type="button" className="nl-btn is-small" onClick={() => run([{ op: 'var.add', variable: { name: p.data.variable, value: 1, min: 0, max: 10, step: 0.1 } }])}>
            Make {p.data.variable} a variable
          </button>
        ) : null}
        {editable && comp.variables.length ? (
          <select className="nl-select nl-cv-noDrag" aria-label="Bind to a variable" value="" onChange={(e) => e.target.value && run([{ op: 'update', id: p.id, data: { variable: e.target.value } }])}>
            <option value="">Bind to…</option>
            {comp.variables.map((x) => (
              <option key={x.name} value={x.name}>
                {x.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>
    );
  }
  // where the artifact cannot be changed (archived), a control shows its value and does nothing
  const set = (value: number) => editable && run([setOrWiden(v, value)]);
  const name = v.label || v.name;
  const shown = `${formatNumber(v.value)}${v.unit ? ` ${v.unit}` : ''}`;
  if (v.kind === 'boolean' || p.data.kind === 'toggle') {
    const on = v.value !== 0;
    return (
      <div className="nl-prim-ctl">
        <button type="button" role="switch" aria-checked={on} disabled={!editable} className={`nl-switch nl-cv-noDrag${on ? ' is-on' : ''}`} onClick={() => set(on ? 0 : 1)}>
          <span className="nl-switch-knob" aria-hidden="true" />
          <span className="nl-switch-label">{name}</span>
          <span className="nl-switch-state">{on ? 'On' : 'Off'}</span>
        </button>
      </div>
    );
  }
  if (p.data.kind === 'choice') {
    return (
      <div className="nl-prim-ctl">
        <span className="nl-ctl-name">{name}</span>
        {p.data.options.length ? (
          <div className="nl-seg nl-cv-noDrag" role="radiogroup" aria-label={name}>
            {p.data.options.map((o) => (
              <button key={`${o.label}-${o.value}`} type="button" role="radio" aria-checked={v.value === o.value} disabled={!editable} onClick={() => set(o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="nl-prim-hint">No choices yet. Add them in the panel on the right.</p>
        )}
      </div>
    );
  }
  if (p.data.kind === 'number') {
    return (
      <div className="nl-prim-ctl">
        <label className="nl-ctl-row">
          <span className="nl-ctl-name">{name}</span>
          <NumberInput className="nl-in nl-ctl-num" aria-label={name} value={v.value} onCommit={set} disabled={!editable} />
          {v.unit ? <span className="nl-ctl-unit">{v.unit}</span> : null}
        </label>
        <div className="nl-ctl-steps nl-cv-noDrag">
          <button type="button" className="nl-icon-btn" aria-label={`Decrease ${name}`} disabled={!editable} onClick={() => set(Number((v.value - v.step).toPrecision(12)))}>
            −
          </button>
          <button type="button" className="nl-icon-btn" aria-label={`Increase ${name}`} disabled={!editable} onClick={() => set(Number((v.value + v.step).toPrecision(12)))}>
            +
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="nl-prim-ctl">
      <div className="nl-ctl-row">
        <span className="nl-ctl-name">{name}</span>
        <output className="nl-ctl-value" aria-live="off">
          {shown}
        </output>
      </div>
      <input
        type="range"
        className="nl-range nl-cv-noDrag"
        aria-label={name}
        aria-valuetext={shown}
        min={v.min}
        max={v.max}
        step={v.step}
        value={Math.max(v.min, Math.min(v.max, v.value))}
        disabled={!editable}
        onChange={(e) => set(Number(e.target.value))}
      />
      <div className="nl-ctl-range" aria-hidden="true">
        <span>{formatNumber(v.min)}</span>
        <span>{formatNumber(v.max)}</span>
      </div>
    </div>
  );
}
