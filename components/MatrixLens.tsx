'use client';

// components/MatrixLens.tsx
//
// The comparison, as a table.
//
// Every other lens draws a graph, because a graph is what a Thinking Map is.
// A comparison is not a graph — it is options down one side and criteria
// across the top — and almost every field makes one: which solvent, which
// algorithm, which treatment, which policy, which reading, which supplier.
//
// It is a table and not an SVG on purpose. A table IS the right element for
// tabular data: it reads correctly to a screen reader, the columns line up
// without arithmetic, and long labels wrap instead of colliding.
//
// THE EMPTY CELLS ARE THE POINT. A blank is not missing data. It is a pairing
// nobody has said anything about — a question still open — and it is drawn as
// a question mark rather than left bare, because a bare cell reads as "nothing
// to say here" when the truth is "nobody has looked".

import type { ComparisonMatrix, CellVerdict } from '@/lib/logos-layout';

/** What each verdict is called, for the cell and for a screen reader. */
const SAYS: Record<CellVerdict, { mark: string; said: string }> = {
  good: { mark: '+', said: 'does well on this' },
  bad: { mark: '−', said: 'does badly on this' },
  noted: { mark: '·', said: 'mentioned, not judged' },
  unknown: { mark: '?', said: 'nobody has said' },
};

export function MatrixLens({
  matrix,
  width,
  height,
  guarded,
  onPick,
}: {
  matrix: ComparisonMatrix;
  /**
   * Measured, not inherited. The lens container has no intrinsic height —
   * every other lens fills it with something absolutely positioned and is
   * handed its pixel size — so a table that sized itself from its parent
   * collapsed to nothing but its own padding.
   */
  width: number;
  height: number;
  /** while the guard is up, the marks stay and the wording softens */
  guarded?: boolean;
  /** open a node the way the other lenses do */
  onPick?: (id: string) => void;
}) {
  const { options, criteria, cells, unknowns } = matrix;

  return (
    <div className="lg-mx" style={{ width, height }}>
      <div className="lg-mx-scroll">
        <table className="lg-mx-table">
          <caption className="lg-sr">
            Each option down the side, each thing that matters across the top.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="lg-mx-corner">
                <span className="lg-sr">Option</span>
              </th>
              {criteria.map((c) => (
                <th key={c.id} scope="col" className="lg-mx-crit">
                  <button type="button" onClick={() => onPick?.(c.id)} title={c.note || undefined}>
                    {c.label}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {options.map((o, i) => (
              <tr key={o.id}>
                <th scope="row" className="lg-mx-opt">
                  <button type="button" onClick={() => onPick?.(o.id)} title={o.note || undefined}>
                    {o.label}
                  </button>
                </th>
                {cells[i].map((cell, j) => (
                  <td
                    key={criteria[j].id}
                    className={`lg-mx-cell is-${cell.verdict}${cell.strength ? ` s-${cell.strength}` : ''}`}
                  >
                    <span className="lg-mx-mark" aria-hidden="true">
                      {SAYS[cell.verdict].mark}
                    </span>
                    <span className="lg-sr">
                      {o.label}, {criteria[j].label}: {SAYS[cell.verdict].said}
                    </span>
                    {cell.note && <span className="lg-mx-note">{cell.note}</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* The most useful sentence on the screen, when it is true. */}
      {unknowns > 0 && (
        <p className="lg-mx-open" role="note">
          {unknowns === 1
            ? 'One pairing nobody has looked at yet.'
            : `${unknowns} pairings nobody has looked at yet.`}{' '}
          {guarded
            ? 'Which of them would change your mind?'
            : 'A blank is a question, not a zero — the gaps are usually where the decision actually turns.'}
        </p>
      )}
    </div>
  );
}
