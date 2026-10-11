'use client';

// components/display/WorksheetFigure.tsx — an accounting worksheet the person fills in.
//
// A balance sheet, a journal entry or an income statement
// (lib/objects/display-worksheet.ts). Every amount is the person's — nothing
// is ever filled in for them. The totals are plain sums of what they entered;
// whether it balances, whether a line is classified rightly, whether an entry
// is complete is said only when they ask for a check (each check is kept as
// an attempt), and help comes as a ladder of hints, one rung when asked.

import { useState } from 'react';
import {
  WORKSHEET_LIMITS,
  checkWorksheet,
  currentHint,
  lineValue,
  sayMoney,
  totalsOf,
  type WorksheetLine,
  type WorksheetSection,
  type WorksheetState,
} from '@/lib/objects/display-worksheet';
import type { FigureProps } from '@/components/objects/figures';
import { AddRow, DisplayShell, Edit, useDisplay, type Display } from './DisplayShell';
import { NumberEdit, Tool } from './primitives';
import './worksheet.css';

type S = WorksheetState;
type D = Display<S>;

export function WorksheetFigure(p: FigureProps) {
  const d = useDisplay<S>(p);
  const s = d.state;
  const hint = currentHint(s);
  const lines = s.sections.reduce((n, sec) => n + sec.lines.length, 0);
  const entered = s.sections.reduce((n, sec) => n + sec.lines.filter((l) => l.amount !== null).length, 0);
  return (
    <DisplayShell
      p={p}
      d={d}
      aside={`${entered} of ${lines} amounts entered${s.attempts.length ? ` · ${s.attempts.length} check${s.attempts.length === 1 ? '' : 's'}` : ''}`}
      tools={
        <>
          <Tool label="Check my work" onClick={() => d.act('check', {})} disabled={!lines}>
            Check
          </Tool>
          <Tool label="Ask for a hint" onClick={() => d.act('hint', {})}>
            Hint
          </Tool>
          {s.template === 'balance-sheet' && (
            <Tool label="Pose the next transaction" onClick={() => d.act('next', {})}>
              Next transaction
            </Tool>
          )}
        </>
      }
    >
      {s.scenario && (
        <p className="dsp-ws-scenario">
          <span className="dsp-sub">Record this</span> {s.scenario.text}
        </p>
      )}
      {hint && (
        <p className="dsp-ws-hint" role="status">
          <span className="dsp-sub">Hint {s.assist.level} of 4</span> {hint}
        </p>
      )}
      {s.view === 'sheet' ? <Sheet d={d} /> : <Checks s={s} />}
    </DisplayShell>
  );
}

function Sheet({ d }: { d: D }) {
  const s = d.state;
  const t = totalsOf(s);
  // the kind's own line value: a contra account (accumulated depreciation) counts against its heading
  const totalOf = (sec: WorksheetSection) => sec.lines.reduce((n, l) => n + lineValue(l, sec), 0);
  return (
    <div className="dsp-ws">
      {s.sections.map((sec) => (
        <section key={sec.id} className={`dsp-ws-sec is-${sec.role}`} aria-label={sec.label}>
          <h5 className="dsp-ws-h">
            {sec.label}
            {sec.term && <span className="dsp-ws-term"> · {sec.term === 'current' ? 'current' : 'non-current'}</span>}
          </h5>
          <table className="dsp-table dsp-ws-table">
            <tbody>
              {sec.lines.map((l) => (
                <Line key={l.id} d={d} l={l} sec={sec} />
              ))}
              <tr className="dsp-ws-total">
                <th scope="row">Total {sec.label.toLowerCase()}</th>
                <td className="is-num">{sayMoney(totalOf(sec))}</td>
                <td />
              </tr>
            </tbody>
          </table>
          {d.live && sec.lines.length < WORKSHEET_LIMITS.lines && <AddRow label={`Add a line under ${sec.label}`} placeholder={`Add a line under ${sec.label}…`} onAdd={(text) => d.act('addLine', { section: sec.id, label: text, by: 'person' })} />}
        </section>
      ))}
      <dl className="dsp-ws-sums">
        {s.template === 'balance-sheet' && (
          <>
            <div>
              <dt>Total assets</dt>
              <dd>{sayMoney(t.assets)}</dd>
            </div>
            <div>
              <dt>Liabilities + equity</dt>
              <dd>{sayMoney(t.liabilities + t.equity)}</dd>
            </div>
          </>
        )}
        {s.template === 'journal-entry' && (
          <>
            <div>
              <dt>Debits</dt>
              <dd>{sayMoney(t.debits)}</dd>
            </div>
            <div>
              <dt>Credits</dt>
              <dd>{sayMoney(t.credits)}</dd>
            </div>
          </>
        )}
        {s.template === 'income-statement' && (
          <>
            <div>
              <dt>Revenue</dt>
              <dd>{sayMoney(t.revenue)}</dd>
            </div>
            <div>
              <dt>Expenses</dt>
              <dd>{sayMoney(t.expenses)}</dd>
            </div>
          </>
        )}
      </dl>
      <p className="dsp-empty">Sums of what you entered. Whether it is right is said when you ask for a check.</p>
    </div>
  );
}

function Line({ d, l, sec }: { d: D; l: WorksheetLine; sec: WorksheetSection }) {
  const s = d.state;
  const [moving, setMoving] = useState(false);
  return (
    <tr className={l.by === 'socria' ? 'is-socria' : ''}>
      <th scope="row">
        {d.live ? <Edit value={l.label} label={`Line name: ${l.label}`} onDone={(v) => v && v !== l.label && d.act('label', { line: l.id, label: v, by: 'person' })} max={WORKSHEET_LIMITS.label} /> : l.label}
      </th>
      <td className="is-num">
        <NumberEdit value={l.amount} label={`Amount for ${l.label}`} placeholder="—" disabled={!d.live} onDone={(v) => d.act('enter', { line: l.id, amount: v === null ? '' : v })} />
      </td>
      <td className="dsp-ws-acts">
        {d.live &&
          (moving ? (
            <select
              autoFocus
              aria-label={`Move ${l.label} under`}
              defaultValue=""
              onBlur={() => setMoving(false)}
              onChange={(e) => {
                if (e.target.value) d.act('moveLine', { line: l.id, section: e.target.value });
                setMoving(false);
              }}
            >
              <option value="">move under…</option>
              {s.sections
                .filter((x) => x.id !== sec.id)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
            </select>
          ) : (
            <>
              <button type="button" className="dsp-tool" onClick={() => setMoving(true)} aria-label={`Move ${l.label}`}>
                Move
              </button>
              <button type="button" className="dsp-x" aria-label={`Remove ${l.label}`} onClick={() => d.act('removeLine', { line: l.id })}>
                ×
              </button>
            </>
          ))}
      </td>
    </tr>
  );
}

function Checks({ s }: { s: S }) {
  const checks = checkWorksheet(s);
  const failing = checks.filter((c) => !c.ok && !c.unchecked);
  return (
    <div className="dsp-ws-checks">
      <p className={failing.length ? 'dsp-why' : 'dsp-note'}>{failing.length ? `${failing.length} check${failing.length === 1 ? '' : 's'} to look at.` : 'Every check passes.'}</p>
      <ul>
        {checks.map((c) => (
          <li key={c.id} className={c.unchecked ? 'is-unchecked' : c.ok ? 'is-ok' : 'is-fail'}>
            <span className="dsp-ws-mark">{c.unchecked ? 'Not checkable' : c.ok ? 'Passes' : 'Look again'}</span> {c.message}
          </li>
        ))}
      </ul>
      {s.attempts.length > 0 && (
        <p className="dsp-empty">
          Your checks so far: {s.attempts.map((a) => `#${a.n} — ${a.failing === 0 ? 'all passed' : `${a.failing} to look at`}`).join(' · ')}
        </p>
      )}
    </div>
  );
}
