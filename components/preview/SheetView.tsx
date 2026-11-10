'use client';

// components/preview/SheetView.tsx — a workbook, or a CSV, as its grid.
//
// Column letters across the top and row numbers down the side stay in view while
// the grid scrolls; frozen panes stay frozen; merged cells are merged; every cell is
// shown with its number format, weight, colour, fill and alignment. Sheets are tabs
// along the bottom, as in the application. A long sheet is drawn a few hundred rows
// at a time as it is scrolled to, up to the preview's limit, and says when there is
// more than it shows.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { colName, delimitedSheet, readWorkbook, type Cell, type Sheet, type Workbook } from '@/lib/preview/sheet';

const CHUNK = 300;

export function SheetView({ blob, name, delimited, zoom, onPages, onError }: { blob: Blob; name: string; delimited: boolean; zoom: number; onPages: (n: number) => void; onError: (msg: string) => void }) {
  const [wb, setWb] = useState<Workbook | null>(null);
  const [at, setAt] = useState(0);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const book = delimited ? delimitedSheet(name, await blob.text()) : await readWorkbook(await blob.arrayBuffer());
        if (!live) return;
        setWb(book);
        onPages(book.sheets.length);
        // open on the first sheet a person can see
        const first = book.sheets.findIndex((s) => !s.hidden);
        setAt(first < 0 ? 0 : first);
      } catch (e) {
        if (live) onError(e instanceof Error && e.message ? e.message : 'This spreadsheet could not be opened.');
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blob]);

  if (!wb) return <p className="fp-wait">Opening the spreadsheet…</p>;
  const sheet = wb.sheets[at];
  return (
    <div className="fp-sheet">
      {sheet.kind === 'chart' ? (
        <p className="fp-note fp-sheet-chart">“{sheet.name}” is a chart sheet. Charts are not drawn in the preview — download the workbook to see it.</p>
      ) : (
        <Grid key={at} sheet={sheet} zoom={zoom} />
      )}
      {wb.sheets.length > 1 && (
        <div className="fp-tabs-sheets" role="tablist" aria-label="Sheets">
          {wb.sheets.map((s, i) => (
            <button key={i} type="button" role="tab" aria-selected={i === at} className={`${i === at ? 'is-on' : ''}${s.hidden ? ' is-hidden' : ''}`} onClick={() => setAt(i)} title={s.hidden ? `${s.name} (hidden in the workbook)` : s.name}>
              {s.name}
              {s.hidden ? ' · hidden' : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Grid({ sheet, zoom }: { sheet: Sheet; zoom: number }) {
  const [shown, setShown] = useState(Math.min(sheet.rows, CHUNK));
  const end = useRef<HTMLTableRowElement>(null);
  const box = useRef<HTMLDivElement>(null);

  // more rows as the end comes into view
  useEffect(() => {
    const el = end.current;
    if (!el || shown >= sheet.rows) return;
    const io = new IntersectionObserver((e) => e[0]?.isIntersecting && setShown((n) => Math.min(sheet.rows, n + CHUNK)), { root: box.current, rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [shown, sheet.rows]);

  // cells covered by a merge are not drawn; the merge's first cell spans them
  const { spans, covered } = useMemo(() => {
    const spans = new Map<string, { rows: number; cols: number }>();
    const covered = new Set<string>();
    for (const m of sheet.merges) {
      spans.set(`${m.r}:${m.c}`, { rows: m.rows, cols: m.cols });
      for (let r = m.r; r < m.r + m.rows; r++) for (let c = m.c; c < m.c + m.cols; c++) if (r !== m.r || c !== m.c) covered.add(`${r}:${c}`);
    }
    return { spans, covered };
  }, [sheet]);

  const hiddenCols = useMemo(() => new Set(sheet.hiddenCols ?? []), [sheet]);
  const hiddenRows = useMemo(() => new Set(sheet.hiddenRows ?? []), [sheet]);
  const cols = Array.from({ length: sheet.cols }, (_, c) => c).filter((c) => !hiddenCols.has(c));
  const fr = sheet.frozen?.rows ?? 0;
  const fc = sheet.frozen?.cols ?? 0;
  // where each frozen row and column sticks: after the headers and the frozen ones before it
  const HEAD_H = 22;
  const NUM_W = Math.max(36, String(sheet.rows).length * 8 + 16);
  const top = (r: number) => HEAD_H + sheet.rowHeights.slice(0, r).reduce((a, b, k) => a + (hiddenRows.has(k) ? 0 : b), 0);
  const left = (c: number) => NUM_W + sheet.colWidths.slice(0, c).reduce((a, b, k) => a + (hiddenCols.has(k) ? 0 : b), 0);

  return (
    <div ref={box} className={`fp-grid-box${sheet.noGrid ? ' no-grid' : ''}`} tabIndex={0} aria-label={`Sheet ${sheet.name}`}>
      {sheet.cut && (
        <p className="fp-note fp-grid-cut">
          Showing the first {Math.min(sheet.cut.rows, sheet.rows).toLocaleString()} rows and {Math.min(sheet.cut.cols, sheet.cols)} columns of {sheet.cut.rows.toLocaleString()} × {sheet.cut.cols}. Download the workbook to see all of it.
        </p>
      )}
      <table className="fp-grid" style={{ zoom } as CSSProperties}>
        <colgroup>
          <col style={{ width: NUM_W }} />
          {cols.map((c) => (
            <col key={c} style={{ width: sheet.colWidths[c] }} />
          ))}
        </colgroup>
        <thead>
          <tr style={{ height: HEAD_H }}>
            <th className="fp-corner" aria-hidden="true" />
            {cols.map((c) => (
              <th key={c} scope="col" className="fp-colh" style={c < fc ? { left: left(c), zIndex: 4 } : undefined}>
                {colName(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: shown }, (_, r) => r)
            .filter((r) => !hiddenRows.has(r))
            .map((r) => (
              <tr key={r} style={{ height: sheet.rowHeights[r] }} ref={r === shown - 1 ? end : undefined} className={r < fr ? 'is-frozen' : undefined}>
                <th scope="row" className="fp-rowh" style={r < fr ? { top: top(r), zIndex: 4 } : undefined}>
                  {r + 1}
                </th>
                {cols.map((c) => {
                  const key = `${r}:${c}`;
                  if (covered.has(key)) return null;
                  const span = spans.get(key);
                  const cell = sheet.cells[r]?.[c];
                  const sticky: CSSProperties = {
                    ...(r < fr ? { position: 'sticky', top: top(r), zIndex: c < fc ? 3 : 2 } : {}),
                    ...(c < fc ? { position: 'sticky', left: left(c), zIndex: r < fr ? 3 : 1 } : {}),
                  };
                  return <CellView key={c} cell={cell} span={span} sticky={sticky} />;
                })}
              </tr>
            ))}
        </tbody>
      </table>
      {shown < sheet.rows && <p className="fp-wait">More rows below…</p>}
    </div>
  );
}

function CellView({ cell, span, sticky }: { cell: Cell | undefined; span?: { rows: number; cols: number }; sticky: CSSProperties }) {
  const st = cell?.style;
  const style: CSSProperties = {
    ...sticky,
    ...(st?.fill ? { background: st.fill } : sticky.position ? { background: 'var(--fp-grid-bg)' } : {}),
    ...(st?.color ? { color: st.color } : {}),
    ...(st?.b ? { fontWeight: 700 } : {}),
    ...(st?.i ? { fontStyle: 'italic' } : {}),
    ...(st?.u || st?.strike ? { textDecoration: `${st.u ? 'underline' : ''} ${st.strike ? 'line-through' : ''}`.trim() } : {}),
    ...(st?.size ? { fontSize: `${(st.size / 11) * 100}%` } : {}),
    ...(st?.font ? { fontFamily: `'${st.font.replace(/'/g, '')}', var(--fp-grid-font)` } : {}),
    textAlign: st?.align ?? (cell?.num ? 'right' : 'left'),
    verticalAlign: st?.valign ?? 'bottom',
    whiteSpace: st?.wrap ? 'pre-wrap' : 'pre',
    ...(st?.indent ? { paddingLeft: 4 + st.indent * 9 } : {}),
    ...(st?.borders?.t ? { borderTop: st.borders.t } : {}),
    ...(st?.borders?.r ? { borderRight: st.borders.r } : {}),
    ...(st?.borders?.b ? { borderBottom: st.borders.b } : {}),
    ...(st?.borders?.l ? { borderLeft: st.borders.l } : {}),
  };
  return (
    <td style={style} rowSpan={span && span.rows > 1 ? span.rows : undefined} colSpan={span && span.cols > 1 ? span.cols : undefined} className={st?.wrap ? 'is-wrap' : undefined}>
      {cell?.text ?? ''}
    </td>
  );
}
