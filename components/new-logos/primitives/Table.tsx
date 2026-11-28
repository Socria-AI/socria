'use client';
// components/new-logos/primitives/Table.tsx — a table: columns of text, numbers or formulas, and rows. Cells are
// typed into directly (Enter moves down, Tab across); a formula column is worked out per row from the row's own
// cells (by column key) and the shared variables, so moving a slider recalculates it. Columns' kinds and formulas are
// set in the panel beside the canvas; names, cells, rows and columns are changed here.

import { useMemo } from 'react';
import { computeTable } from '@/lib/new-logos/compose';
import { keyFrom, newItemId, PRIMITIVE_LIMITS, type TableColumn, type TableRow } from '@/lib/new-logos/primitives';
import { CommitInput, type PrimProps } from './common';

export function TablePrim({ p, scope, editable, run }: PrimProps<'table'>) {
  const d = p.data;
  const cells = useMemo(() => computeTable(d, scope), [d, scope]);
  const setRows = (rows: TableRow[]) => run([{ op: 'update', id: p.id, data: { rows } as unknown as Record<string, unknown> }]);
  const setColumns = (columns: TableColumn[], rows?: TableRow[]) => run([{ op: 'update', id: p.id, data: { columns, ...(rows ? { rows } : {}) } as unknown as Record<string, unknown> }]);
  const setCell = (rowId: string, colId: string, v: string) => setRows(d.rows.map((r) => (r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: v } } : r)));
  const addRow = () => d.rows.length < PRIMITIVE_LIMITS.rows && setRows([...d.rows, { id: newItemId('r'), cells: {} }]);
  const addColumn = () => {
    if (d.columns.length >= PRIMITIVE_LIMITS.columns) return;
    const name = `Column ${d.columns.length + 1}`;
    setColumns([...d.columns, { id: newItemId('c'), name, key: keyFrom(name, new Set(d.columns.map((c) => c.key))), kind: 'number' }]);
  };
  const focusBelow = (el: HTMLElement) => {
    const td = el.closest('td');
    const tr = td?.parentElement;
    const index = td ? Array.from(tr!.children).indexOf(td) : -1;
    const next = tr?.nextElementSibling?.children[index]?.querySelector<HTMLInputElement>('input');
    next?.focus();
  };

  return (
    <div className="nl-prim-table nl-cv-scroll">
      <table>
        <thead>
          <tr>
            {d.columns.map((c) => (
              <th key={c.id} scope="col" className={c.kind === 'text' ? '' : 'is-num'}>
                {editable ? (
                  <CommitInput
                    className="nl-cell is-head"
                    aria-label={`Column name: ${c.name}`}
                    value={c.name}
                    onCommit={(v) => setColumns(d.columns.map((x) => (x.id === c.id ? { ...x, name: v || x.name } : x)))}
                  />
                ) : (
                  c.name
                )}
                {c.kind === 'formula' ? <span className="nl-th-formula" title={`${c.key} = ${c.expr ?? ''}`}>= {c.expr || '…'}</span> : null}
              </th>
            ))}
            {editable ? (
              <th className="nl-th-add">
                <button type="button" className="nl-icon-btn is-quiet" aria-label="Add a column" onClick={addColumn}>
                  +
                </button>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {d.rows.map((r, i) => (
            <tr key={r.id}>
              {d.columns.map((c) => {
                const cell = cells[i]?.[c.id];
                if (c.kind === 'formula')
                  return (
                    <td key={c.id} className="is-num is-formula" title={cell?.error}>
                      {cell?.error ? '?' : cell?.text}
                    </td>
                  );
                const bad = c.kind === 'number' && cell && cell.text && cell.value === null;
                return (
                  <td key={c.id} className={`${c.kind === 'number' ? 'is-num' : ''}${bad ? ' is-bad' : ''}`}>
                    {editable ? (
                      <CommitInput
                        className="nl-cell"
                        aria-label={`${c.name}, row ${i + 1}`}
                        numeric={c.kind === 'number'}
                        value={r.cells[c.id] ?? ''}
                        onCommit={(v) => setCell(r.id, c.id, v)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                            const el = e.currentTarget;
                            window.setTimeout(() => focusBelow(el), 0);
                          }
                        }}
                      />
                    ) : (
                      r.cells[c.id] ?? ''
                    )}
                  </td>
                );
              })}
              {editable ? (
                <td className="nl-td-remove">
                  <button type="button" className="nl-icon-btn is-quiet" aria-label={`Remove row ${i + 1}`} onClick={() => setRows(d.rows.filter((x) => x.id !== r.id))}>
                    ×
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      {editable ? (
        <button type="button" className="nl-btn is-quiet is-small nl-table-add" onClick={addRow}>
          + Row
        </button>
      ) : null}
      {!d.columns.length ? <p className="nl-prim-hint">No columns yet.</p> : null}
    </div>
  );
}
