// components/model/panelMarks.tsx
//
// A VIEW THAT IS READ, SET IN THE SAME FRAME AS ONE THAT IS LOOKED AT.
//
// WHY IT SITS INSIDE THE SVG. The frame (Surface3D) owns the controls, the
// clock, the selection, full screen, the fidelity line and the seam to the
// conversation. A table rendered beside it as HTML would need its own copy of
// every one of those — and the last time something was mounted as a sibling
// of that frame it squeezed the picture to nothing. So a read view goes where
// a drawn view goes: through the same `render` callback, inside the same
// <svg>, with the same chrome around it.
//
// WHY IT IS HTML ALL THE SAME. The first version set tables and equations as
// SVG <text>, which has no wrapping, no columns and no scrolling, so every
// cell was cut to a character budget — "wage, as the model impl…", four rows
// in a row — and anything past the frame's height was simply not there. A
// <foreignObject> gives the frame real typography: a table whose columns are
// as wide as their contents, cells that wrap, a list that scrolls. The
// picking contract is unchanged: every row and name that means something
// carries data-obj, and the frame's own press-and-release selects it.
//
// IT DECIDES NOTHING. Every string here comes from lib/model/viewdata.ts,
// which derives it from the model. This is type-setting.

import type { ReactNode } from 'react';
import type { PanelContent } from '@/lib/model/viewdata';

const PAD = 22;
const LINE = 20;
const CH = 6.6;

export interface PanelMarks {
  content: ReactNode;
  note: string;
  label: string;
  left?: string;
  right?: string;
}

/** The frame's own readout line sits along the bottom of the stage; the island stops above it. */
const FOOT = 26;

/** The HTML island, the size of the frame less its footer. */
function Island({ a, kind, children }: { a: { W: number; H: number }; kind: string; children: ReactNode }) {
  const h = Math.max(40, a.H - FOOT);
  return (
    <foreignObject x={0} y={0} width={a.W} height={h}>
      <div
        // @ts-expect-error — the XHTML namespace is what makes this render inside an SVG
        xmlns="http://www.w3.org/1999/xhtml"
        className={`eng-read eng-read-html is-${kind}`}
        style={{ width: `${a.W}px`, height: `${h}px` }}
      >
        {children}
      </div>
    </foreignObject>
  );
}

/**
 * Set a derived panel into a frame of W by H.
 *
 * `onSelect` is the same canonical selection everything else writes, so a name
 * clicked in a table means what a point clicked on a surface means.
 */
export function panelMarks(
  panel: PanelContent,
  a: { W: number; H: number },
  onSelect?: (id: string) => void
): PanelMarks {
  if (panel.kind === 'none') {
    // NOT AN EMPTY FRAME. The most confident thing this engine can draw is a
    // box with nothing in it, and it is the least honest — so the reason is
    // the content, in the middle, where the content would have been.
    return {
      content: (
        <Island a={a} kind="none">
          <p className="eng-read-none">{panel.why}</p>
        </Island>
      ),
      note: panel.why,
      label: `Nothing to show: ${panel.why}`,
    };
  }

  if (panel.kind === 'equation') {
    return {
      content: (
        <Island a={a} kind="equation">
          <dl className="eng-read-eqs">
            {panel.rows.map((r, i) => (
              <div
                key={`${r.label}-${i}`}
                className={`eng-read-eq${r.of && onSelect ? ' is-link' : ''}`}
                data-obj={r.of ?? undefined}
              >
                <dt className="eng-read-key">{r.label}</dt>
                <dd className="eng-read-math">{r.body}</dd>
              </div>
            ))}
          </dl>
        </Island>
      ),
      note: `${panel.rows.length} relation${panel.rows.length === 1 ? '' : 's'} as this model states them`,
      label: panel.rows.map((r) => `${r.label}: ${r.body}`).join('. '),
      left: 'as written',
      right: `${panel.rows.length} stated`,
    };
  }

  if (panel.kind === 'table') {
    const cols = panel.columns.length || 1;
    const kinds = panel.kinds ?? panel.columns.map(() => 'text' as const);
    // GROUPED BY THE FIRST COLUMN WHEN IT REPEATS. Four consecutive rows that
    // all begin "wage, as the model implies it" are one output with four
    // parameters, and setting the name once over the group is how a reader
    // sees that. Only consecutive repeats group, so an interleaved table is
    // left as it is.
    const groupable = kinds[0] === 'text' && cols > 2 && panel.rows.some((r, i) => i > 0 && r[0] === panel.rows[i - 1][0]);
    const groups: { head: string | null; ref?: string; rows: { cells: string[]; ref?: string }[] }[] = [];
    panel.rows.forEach((r, i) => {
      const ref = panel.refs?.[i];
      if (groupable) {
        const last = groups[groups.length - 1];
        if (last && last.head === r[0]) last.rows.push({ cells: r.slice(1), ref });
        else groups.push({ head: r[0], ref, rows: [{ cells: r.slice(1), ref }] });
      } else {
        // One body: a plain table is rows, not a stack of one-row sections.
        if (!groups.length) groups.push({ head: null, rows: [] });
        groups[0].rows.push({ cells: r, ref });
      }
    });
    const numeric = kinds.every((k) => k === 'number' || k === 'text') && kinds.some((k) => k === 'number');
    const heads = groupable ? panel.columns.slice(1) : panel.columns;
    const headKinds = groupable ? kinds.slice(1) : kinds;
    return {
      content: (
        <Island a={a} kind="table">
          <table className={`eng-read-table${numeric ? ' is-numeric' : ''}${groupable ? ' is-grouped' : ''}`}>
            <thead>
              <tr>
                {groupable && <th className="is-text" scope="col">{panel.columns[0]}</th>}
                {heads.map((c, j) => (
                  <th key={j} className={`is-${headKinds[j] ?? 'text'}`} scope="col">{c}</th>
                ))}
              </tr>
            </thead>
            {groups.map((g, gi) => (
              <tbody key={gi} className={g.head !== null ? 'is-group' : undefined}>
                {g.rows.map((r, i) => (
                  <tr
                    key={i}
                    className={r.ref && onSelect ? 'is-link' : undefined}
                    data-obj={r.ref ?? undefined}
                  >
                    {g.head !== null && i === 0 && (
                      <th className="eng-read-group is-text" scope="rowgroup" rowSpan={g.rows.length}>
                        {g.head}
                      </th>
                    )}
                    {r.cells.map((cell, j) => (
                      <td key={j} className={`is-${headKinds[j] ?? 'text'}`}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </Island>
      ),
      note: panel.note,
      label: `A table of ${panel.rows.length} rows and ${cols} columns: ${panel.columns.join(', ')}.`,
      left: `${panel.rows.length} rows`,
      right: panel.columns.join(' · '),
    };
  }

  if (panel.kind === 'text') {
    return {
      content: (
        <Island a={a} kind="text">
          {panel.sections.map((s) => (
            <section key={s.id} className="eng-read-section">
              <h3 className="eng-read-head">{s.label}</h3>
              <dl className="eng-read-facts">
                {s.facts.map((f, i) => (
                  <div
                    key={`${f.label}-${i}`}
                    className={`eng-read-fact${f.of && onSelect ? ' is-link' : ''}`}
                    data-obj={f.of ?? undefined}
                  >
                    <dt>{f.label}</dt>
                    <dd>{f.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </Island>
      ),
      note: `${panel.sections.reduce((n, s) => n + s.facts.length, 0)} line${panel.sections.length === 1 ? '' : 's'} in ${panel.sections.length} section${panel.sections.length === 1 ? '' : 's'}`,
      label: panel.what,
      left: panel.what,
      right: `${panel.sections.length} section${panel.sections.length === 1 ? '' : 's'}`,
    };
  }

  // ── the dependency graph ────────────────────────────────────────
  //
  // STILL A DRAWING. Laid out by depth, because the graph's meaning is
  // direction: what rests on what. Depth is the longest path in, computed
  // iteratively so a cycle bounds rather than hangs.
  const { nodes, edges } = panel;
  const depth = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (let pass = 0; pass < Math.min(nodes.length, 12); pass++) {
    let moved = false;
    for (const e of edges) {
      const d = (depth.get(e.from) ?? 0) + 1;
      if (depth.has(e.to) && d > (depth.get(e.to) ?? 0)) {
        depth.set(e.to, d);
        moved = true;
      }
    }
    if (!moved) break;
  }
  const byDepth = new Map<number, string[]>();
  for (const n of nodes) {
    const d = depth.get(n.id) ?? 0;
    byDepth.set(d, [...(byDepth.get(d) ?? []), n.id]);
  }
  const depths = [...byDepth.keys()].sort((p, q) => p - q);
  const per = Math.max(6, Math.floor((a.W - PAD * 2) / Math.max(1, depths.length) / CH) - 2);
  const fit = (s: string, chars: number) => (s.length <= chars ? s : `${s.slice(0, Math.max(1, chars - 1))}…`);
  const widthOf = (d: number) =>
    Math.max(...(byDepth.get(d) ?? []).map((id) => Math.min(nodes.find((n) => n.id === id)?.label.length ?? 4, per)), 4) * CH;
  const colX: number[] = [];
  let x = PAD;
  for (const d of depths) {
    colX.push(x);
    x += widthOf(d) + 64;
  }
  const shift = Math.max(0, (a.W - (x - 64) - PAD) / 2 - PAD / 2);
  const place = new Map<string, { x: number; y: number }>();
  const tallest = Math.max(...depths.map((d) => byDepth.get(d)?.length ?? 0), 1);
  const gap = Math.min(LINE * 1.7, (a.H - PAD * 2) / tallest);
  depths.forEach((d, j) => {
    const ids = byDepth.get(d) ?? [];
    const top = (a.H - gap * (ids.length - 1)) / 2;
    ids.forEach((id, i) => {
      place.set(id, { x: colX[j] + shift, y: top + i * gap });
    });
  });
  const ends = new Map(nodes.map((n) => [n.id, Math.min(n.label.length, per) * CH]));
  return {
    content: (
      <g className="eng-read is-structure">
        {edges.map((e, i) => {
          const p = place.get(e.from), q = place.get(e.to);
          if (!p || !q) return null;
          const x0 = p.x + (ends.get(e.from) ?? 0) + 6;
          const x1 = Math.max(x0 + 8, q.x - 6);
          const mx = (x0 + x1) / 2;
          return <path key={`e${i}`} d={`M${x0},${p.y} C${mx},${p.y} ${mx},${q.y} ${x1},${q.y}`} className="eng-read-edge" />;
        })}
        {nodes.map((n) => {
          const p = place.get(n.id);
          if (!p) return null;
          return (
            <text
              key={n.id}
              x={p.x}
              y={p.y + 4}
              className={`eng-read-node${onSelect ? ' is-link' : ''}`}
              data-obj={n.of}
            >
              {fit(n.label, per)}
            </text>
          );
        })}
      </g>
    ),
    note: `${nodes.length} things and ${edges.length} dependenc${edges.length === 1 ? 'y' : 'ies'}, laid out left to right: what a thing rests on is to its left`,
    label: `A dependency graph of ${nodes.length} nodes and ${edges.length} edges.`,
    left: `${nodes.length} nodes`,
    right: `${edges.length} edges`,
  };
}
