'use client';
// components/new-logos/primitives/Equation.tsx — an equation: a definition (revenue = price · quantity), a function
// (f(x) = a x² + b) or a bare expression, drawn as mathematics from its structure, with its value now. Click it to
// edit the line as text; a name it uses that nothing defines can be made a variable, with a control, in one step.

import { useState } from 'react';
import { formatNumber, isIdent, nameTex, toTex } from '@/lib/new-logos/expr';
import { newPrimitive, type EquationData } from '@/lib/new-logos/primitives';
import { parseCached, undefinedNames } from '@/lib/new-logos/compose';
import { CommitInput, Tex, type PrimProps } from './common';

/** The line as a person writes it. */
export const equationLine = (d: EquationData) => (d.name ? `${d.name}${d.params.length ? `(${d.params.join(', ')})` : ''} = ${d.expr}` : d.expr);

/** A line read back: "f(x, y) = …", "name = …", or an expression on its own. */
export function readEquationLine(line: string): { ok: true; data: EquationData } | { ok: false; error: string } {
  const m = /^\s*([A-Za-z_]\w*)\s*(?:\(\s*([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)?\s*\))?\s*=(?!=)\s*([\s\S]*)$/.exec(line);
  if (!m) return { ok: true, data: { name: '', params: [], expr: line.trim() } };
  const [, name, params, expr] = m;
  if (!isIdent(name)) return { ok: false, error: `“${name}” already means something (a function or a constant). Choose another name.` };
  const ps = params ? params.split(',').map((x) => x.trim()) : [];
  const bad = ps.find((x) => !isIdent(x) || x === name);
  if (bad) return { ok: false, error: `“${bad}” cannot be a parameter.` };
  return { ok: true, data: { name, params: [...new Set(ps)], expr: expr.trim() } };
}

export function EquationPrim({ p, scope, editable, run }: PrimProps<'equation'>) {
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const d = p.data;
  const parsed = d.expr.trim() ? parseCached(d.expr) : null;
  const lhs = d.name ? `${nameTex(d.name)}${d.params.length ? `\\left(${d.params.map(nameTex).join(', ')}\\right)` : ''} = ` : '';
  const value = scope.results[p.id];
  const showValue = !d.params.length && Number.isFinite(value) && !(parsed?.ast && parsed.ast.t === 'num');
  const error = problem ?? scope.errors[p.id];
  const missing = editable ? undefinedNames(scope, d.expr, d.params).slice(0, 4) : [];

  const makeVariable = (name: string, k: number) => {
    run([
      { op: 'var.add', variable: { name, value: 1, min: 0, max: 10, step: 0.1, kind: 'number' } },
      { op: 'add', primitive: newPrimitive('control', { x: p.x + k * 24, y: p.y + p.h + 16 + k * 104 }, { variable: name }) as unknown as Record<string, unknown> },
    ]);
  };

  return (
    <div className="nl-prim-eq">
      {editing && editable ? (
        <CommitInput
          autoFocus
          className="nl-in nl-eq-input"
          aria-label="Equation"
          placeholder="revenue = price * quantity"
          value={equationLine(d)}
          onCommit={(line) => {
            const r = readEquationLine(line);
            if (!r.ok) return setProblem(r.error);
            setProblem(null);
            run([{ op: 'update', id: p.id, data: r.data as unknown as Record<string, unknown> }]);
          }}
          onBlur={() => setEditing(false)}
        />
      ) : (
        <button type="button" className="nl-eq-show nl-cv-noDrag" disabled={!editable} onClick={() => setEditing(true)} aria-label={`Equation ${equationLine(d) || 'empty'}${editable ? '. Click to edit' : ''}`}>
          {parsed?.ast ? <Tex src={`${lhs}${toTex(parsed.ast)}`} display /> : <span className="nl-prim-hint">{d.expr.trim() ? equationLine(d) : editable ? 'Click to write an equation' : 'Empty'}</span>}
          {showValue ? <span className="nl-eq-value">= {formatNumber(value)}</span> : null}
        </button>
      )}
      {error ? (
        <p className="nl-prim-error" role="status">
          {error}
        </p>
      ) : null}
      {missing.length ? (
        <div className="nl-eq-missing">
          {missing.map((n, k) => (
            <button key={n} type="button" className="nl-btn is-small" onClick={() => makeVariable(n, k)}>
              Make {n} a variable
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
