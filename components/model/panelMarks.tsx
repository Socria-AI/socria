// components/model/panelMarks.tsx
//
// A VIEW THAT IS READ, DRAWN IN THE SAME FRAME AS ONE THAT IS LOOKED AT.
//
// WHY IT IS SVG AND NOT A DIV. The frame (Surface3D) owns the controls, the
// clock, the selection, full screen, the fidelity line and the seam to the
// conversation. A table rendered beside it as HTML would need its own copy of
// every one of those — and the last time something was mounted as a sibling of
// that frame it squeezed the picture to nothing and the 3D view disappeared.
// So a read view goes where a drawn view goes: inside the same <svg>, through
// the same `render` callback, with the same chrome around it. Switching
// representation then cannot change the layout, because the layout is one frame.
//
// IT DECIDES NOTHING. Every string here comes from lib/model/viewdata.ts, which
// derives it from the model. This is type-setting: where the rows go, what fits
// the width, which words are a link.
//
// NO DOMAIN APPEARS BELOW.

import type { ReactNode } from 'react';
import type { PanelContent } from '@/lib/model/viewdata';

const PAD = 26;
const LINE = 20;
/** roughly the width of a character at the sizes below; used to fit, not to lay out */
const CH = 6.6;

function fit(s: string, chars: number): string {
  return s.length <= chars ? s : `${s.slice(0, Math.max(1, chars - 1))}…`;
}

export interface PanelMarks {
  content: ReactNode;
  note: string;
  label: string;
  left?: string;
  right?: string;
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
  const rows = Math.max(1, Math.floor((a.H - PAD * 2) / LINE));
  const chars = Math.max(8, Math.floor((a.W - PAD * 2) / CH));

  if (panel.kind === 'none') {
    // NOT AN EMPTY FRAME. The most confident thing this engine can draw is a
    // box with nothing in it, and it is the least honest — so the reason is the
    // content, in the middle, where the content would have been.
    return {
      content: (
        <g className="eng-read is-none">
          <text x={a.W / 2} y={a.H / 2} textAnchor="middle" className="eng-read-none">
            {fit(panel.why, Math.floor(chars * 1.1))}
          </text>
        </g>
      ),
      note: panel.why,
      label: `Nothing to show: ${panel.why}`,
    };
  }

  if (panel.kind === 'equation') {
    const shown = panel.rows.slice(0, Math.floor(rows / 2));
    return {
      content: (
        <g className="eng-read is-equation">
          {shown.map((r, i) => (
            <g key={`${r.label}-${i}`} transform={`translate(${PAD}, ${PAD + i * LINE * 2})`}>
              <text
                className={`eng-read-key${r.of && onSelect ? ' is-link' : ''}`}
                onClick={r.of && onSelect ? () => onSelect(r.of!) : undefined}
              >
                {fit(r.label, Math.floor(chars * 0.5))}
              </text>
              <text y={LINE * 0.9} className="eng-read-math">
                {fit(r.body, chars)}
              </text>
            </g>
          ))}
        </g>
      ),
      note: `${panel.rows.length} relation${panel.rows.length === 1 ? '' : 's'} as this model states them${shown.length < panel.rows.length ? `; the first ${shown.length} shown` : ''}`,
      label: shown.map((r) => `${r.label}: ${r.body}`).join('. '),
      left: 'as written',
      right: `${panel.rows.length} stated`,
    };
  }

  if (panel.kind === 'table') {
    const cols = panel.columns.length || 1;
    // COLUMNS SHARE THE WIDTH EVENLY and every cell is clipped to its own
    // share: a long label must not be allowed to overrun the column beside it,
    // because a number sitting under the wrong heading is a wrong number.
    const w = (a.W - PAD * 2) / cols;
    const per = Math.max(4, Math.floor(w / CH) - 1);
    const body = panel.rows.slice(0, rows - 2);
    return {
      content: (
        <g className="eng-read is-table">
          {panel.columns.map((c, j) => (
            <text key={`h${j}`} x={PAD + j * w} y={PAD} className="eng-read-head">
              {fit(c, per)}
            </text>
          ))}
          <path d={`M${PAD},${PAD + 7} L${a.W - PAD},${PAD + 7}`} className="eng-read-rule" />
          {body.map((r, i) => (
            <g key={`r${i}`}>
              {r.map((cell, j) => (
                <text key={j} x={PAD + j * w} y={PAD + LINE + i * LINE} className="eng-read-cell">
                  {fit(cell, per)}
                </text>
              ))}
            </g>
          ))}
        </g>
      ),
      note: `${panel.note}${body.length < panel.rows.length ? `; ${body.length} of ${panel.rows.length} rows fit here` : ''}`,
      label: `A table of ${panel.rows.length} rows and ${cols} columns: ${panel.columns.join(', ')}.`,
      left: `${panel.rows.length} rows`,
      right: panel.columns.join(' · '),
    };
  }

  if (panel.kind === 'text') {
    const lines: { key: string; text: string; head: boolean; of?: string }[] = [];
    for (const s of panel.sections) {
      lines.push({ key: s.id, text: s.label, head: true });
      for (const f of s.facts) lines.push({ key: `${s.id}-${f.label}`, text: `${f.label} — ${f.value}`, head: false, of: f.of });
    }
    const shown = lines.slice(0, rows - 1);
    return {
      content: (
        <g className="eng-read is-text">
          {shown.map((l, i) => (
            <text
              key={`${l.key}-${i}`}
              x={PAD + (l.head ? 0 : 12)}
              y={PAD + i * LINE}
              className={`${l.head ? 'eng-read-head' : 'eng-read-cell'}${l.of && onSelect ? ' is-link' : ''}`}
              onClick={l.of && onSelect ? () => onSelect(l.of!) : undefined}
            >
              {fit(l.text, chars)}
            </text>
          ))}
        </g>
      ),
      // WHAT it is goes in the readout; the note says how much of it is here.
      // Both said the same sentence, so the caption read it twice.
      note: `${lines.length} line${lines.length === 1 ? '' : 's'} in ${panel.sections.length} section${panel.sections.length === 1 ? '' : 's'}${shown.length < lines.length ? `, of which ${shown.length} fit here` : ''}`,
      label: panel.what,
      left: panel.what,
      right: `${panel.sections.length} section${panel.sections.length === 1 ? '' : 's'}`,
    };
  }

  // ── the dependency graph ────────────────────────────────────────
  //
  // LAID OUT BY DEPTH, because the graph's meaning is direction: what rests on
  // what. A force-directed blob would be prettier and would say nothing. Depth
  // is the longest path in, computed iteratively so a cycle bounds rather than
  // hangs — a model can state a circular dependency and this still draws it.
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
  // COLUMNS AS WIDE AS THE NAMES IN THEM, not as wide as their share of the
  // frame. Even columns put two short names at opposite ends of a wide box with
  // a long line between them, which reads as distance where there is none.
  const per = Math.max(6, Math.floor((a.W - PAD * 2) / Math.max(1, depths.length) / CH) - 2);
  const widthOf = (d: number) =>
    Math.max(...(byDepth.get(d) ?? []).map((id) => Math.min((nodes.find((n) => n.id === id)?.label.length ?? 4), per)), 4) * CH;
  const colX: number[] = [];
  let x = PAD;
  for (const d of depths) {
    colX.push(x);
    x += widthOf(d) + 64;
  }
  // …and centred as a block, so a two-column graph is not pinned to the left.
  const shift = Math.max(0, (a.W - (x - 64) - PAD) / 2 - PAD / 2);
  const place = new Map<string, { x: number; y: number }>();
  // SPACED LIKE TEXT, NOT SPREAD TO FILL. Dividing the height by the count put
  // two names at opposite ends of the frame joined by a line that swooped across
  // it, which reads as a dramatic relationship rather than a plain one. Rows sit
  // at a line's height and the column is centred, so a graph of three things
  // looks like three things.
  const tallest = Math.max(...depths.map((d) => byDepth.get(d)?.length ?? 0), 1);
  const gap = Math.min(LINE * 1.7, (a.H - PAD * 2) / tallest);
  depths.forEach((d, j) => {
    const ids = byDepth.get(d) ?? [];
    const top = (a.H - gap * (ids.length - 1)) / 2;
    ids.forEach((id, i) => {
      place.set(id, { x: colX[j] + shift, y: top + i * gap });
    });
  });
  // WHERE EACH NAME ENDS, so an edge leaves the word it belongs to rather than
  // the column it sits in. Using the column's character budget made every edge
  // start a couple of hundred pixels to the right of its own node, which drew a
  // graph whose lines pointed at nothing.
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
          return (
            <path
              key={`e${i}`}
              d={`M${x0},${p.y} C${mx},${p.y} ${mx},${q.y} ${x1},${q.y}`}
              className="eng-read-edge"
            />
          );
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
              onClick={onSelect ? () => onSelect(n.of) : undefined}
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
