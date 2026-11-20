'use client';

// components/ux-v0/QualityPanel.tsx — the top of the Checks rail: whether the design can be released, what its
// quality adds up to, and the direction's decisions it keeps.
//
// Gates first (accessibility, security, critical function: pass, waiting on the designer, or failing), because a
// score must never hide a page that does not work. Then the weighted dimensions, each with what it stands on. Then
// the decisions of the approved direction, each with whether the drawn page keeps it. Failures (measured) and
// judgements (opinions about the design, specific and actionable) are counted apart. Nothing here asks a model.

import { useMemo } from 'react';
import { decisionsOf } from '@/lib/ux-v0/decisions';
import type { ArtDirection } from '@/lib/ux-v0/direction';
import type { Evaluation, PageAudit } from '@/lib/ux-v0/evaluate';
import type { Originality } from '@/lib/ux-v0/originality';
import { GATE_LABEL, qualityReport, type EditRecord } from '@/lib/ux-v0/quality';
import type { DesignSpec } from '@/lib/ux-v0/spec';

const STATE_WORD = { pass: 'Passes', attention: 'Waits on you', fail: 'Fails' } as const;

export function QualityPanel({
  spec,
  ev,
  audits,
  originality,
  direction,
  html,
  edits,
  undone,
  onPublish,
}: {
  spec: DesignSpec;
  ev: Evaluation;
  audits: { desktop: PageAudit | null; tablet: PageAudit | null; phone: PageAudit | null };
  originality: Originality | null;
  direction: ArtDirection | null;
  html: string;
  edits: EditRecord | null;
  /** fixes the last repair took back because they made something worse */
  undone: string[];
  onPublish: () => void;
}) {
  const q = useMemo(() => qualityReport({ spec, ev, audits, originality, edits, html }), [spec, ev, audits, originality, edits, html]);
  const decisions = useMemo(() => decisionsOf(direction, spec, audits.desktop), [direction, spec, audits.desktop]);
  const kept = decisions.filter((d) => d.held === true).length;
  const broken = decisions.filter((d) => d.held === false);
  const measured = decisions.filter((d) => d.held !== null).length;
  return (
    <>
      <section className="v0-cellset v0-quality" aria-labelledby="q-release">
        <span className="sb-label" id="q-release">
          Ready to release?
        </span>
        <p className="v0-cell-title">{q.releasable ? (q.gates.every((g) => g.state === 'pass') ? 'Yes' : 'Yes, once you set what waits on you') : 'Not yet'}</p>
        <ul className="v0-gates">
          {q.gates.map((g) => (
            <li key={g.id} className={`v0-gate is-${g.state}`}>
              <span className="v0-gate-h">
                <b>{GATE_LABEL[g.id]}</b> <span className="v0-gate-s">{STATE_WORD[g.state]}</span>
              </span>
              {g.items.length > 0 && (
                <ul className="v0-plain">
                  {g.items.slice(0, 4).map((it) => (
                    <li key={it}>{it}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
        {q.gates.some((g) => g.state === 'attention' && g.id === 'function') && (
          <button type="button" className="sb-link is-meta" onClick={onPublish}>
            Set destinations and the form in Publish
          </button>
        )}
        {undone.length > 0 && <p className="v0-quiet">The last check took back {undone.length === 1 ? 'one fix' : `${undone.length} fixes`} that made something else worse: {undone.join('; ')}.</p>}
      </section>
      <section className="v0-cellset" aria-labelledby="q-score">
        <span className="sb-label" id="q-score">
          Quality {q.score} of 100
        </span>
        <ul className="v0-dims">
          {q.dimensions.map((d) => (
            <li key={d.id} className={d.score === null ? 'is-unmeasured' : ''}>
              <span className="v0-dim-l">
                {d.label} <span className="v0-quiet">({d.weight}%)</span>
              </span>
              <span className="v0-dim-bar" aria-hidden="true">
                <span style={{ width: `${d.score ?? 0}%` }} />
              </span>
              <span className="v0-dim-n">{d.score === null ? '—' : d.score}</span>
              <span className="v0-quiet v0-dim-basis">{d.basis}</span>
            </li>
          ))}
        </ul>
        <p className="v0-quiet">
          {q.failures.length} measured failure{q.failures.length === 1 ? '' : 's'} and {q.judgements.length} judgement{q.judgements.length === 1 ? '' : 's'} below. Judgements are opinions about the design, said with what they rest on; the gates are not scored.
        </p>
      </section>
      {decisions.length > 0 && (
        <section className="v0-cellset" aria-labelledby="q-decisions">
          <details className="v0-decisions" open={broken.length > 0}>
            <summary>
              <span className="sb-label" id="q-decisions">
                Decisions it keeps: {kept} of {measured} measured{broken.length ? `, ${broken.length} not kept` : ''}
              </span>
            </summary>
            <ul className="v0-plain v0-decision-list">
              {decisions.map((d) => (
                <li key={d.area} className={d.held === false ? 'is-broken' : ''}>
                  <span className="v0-decision-h">
                    <span aria-hidden="true">{d.held === true ? '✓' : d.held === false ? '✗' : '·'}</span>
                    <span className="sr-only">{d.held === true ? 'Kept: ' : d.held === false ? 'Not kept: ' : 'Said, not measured: '}</span>
                    <b>{d.label}</b>: {d.value}
                  </span>
                  {d.because && <span className="v0-quiet">Because {d.because.replace(/^[A-Z]/, (c) => c.toLowerCase()).replace(/\.$/, '')}.</span>}
                  <span className="v0-quiet">{d.how}</span>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </>
  );
}
