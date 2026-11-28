'use client';
// components/new-logos/represent/RepObject.tsx — AN ITEM OF A REPRESENTATION, AS IT SITS ON THE CANVAS.
//
// The minimum useful form of each kind (inspection and Focus hold the rest):
//   a question reads as the problem, in larger words, unboxed; a statement is a sentence with a rule beside it (solid
//   when it rests on something, dashed when it is an interpretation); a possibility is a short phrase in a dashed
//   outline, its standing in words when it is not open; an observation is solid, with a filled mark; a person or
//   thing is a name; an open question is hollow, and its answer appears under it; a caveat carries its mark; a
//   measure is its number; a timeline is its events in order (uncertain ones hollow); steps are numbered; a document
//   is a reference that opens it; the model's equations, variables, plots and comparisons are the live primitives
//   (a slider moves everything that uses it, a cell takes typing) — no further question to the assistant needed.
// Never colour alone: outline (solid, dashed, dotted), marks and words carry the meaning, and each item says what it
// is when read aloud.

import { useMemo } from 'react';
import type { ArtifactOp } from '@/lib/new-logos/artifact-ops';
import type { Composition } from '@/lib/new-logos/primitives';
import type { Scope } from '@/lib/new-logos/compose';
import { formatNumber } from '@/lib/new-logos/expr';
import { KIND_WORD, STATUS_WORD, standingWords, whenKey, type ItemOf, type RepItem } from '@/lib/new-logos/representation';
import { PrimitiveBody } from '../primitives/Primitive';
import { SourceGlyph } from '../sources/Library';
import { EquationAsPlot, PlotAsTable, TableAsBars, TableAsMetrics, TableAsPlot } from './Views';

export interface RepModel {
  comp: Composition;
  scope: Scope;
  values: Record<string, number>;
}

const pageOf = (passage?: string) => (passage ? Number(/^p(\d+)\./.exec(passage)?.[1] ?? 0) : 0);

/** The item's value when it is a measure: as written, or worked out from the model. */
export function metricValue(it: ItemOf<'metric'>, values: Record<string, number>): string {
  if (it.value) return it.value;
  const v = values[`metric:${it.id}`];
  return v === undefined || !Number.isFinite(v) ? '—' : formatNumber(v, 4);
}

/** Events in time order when every one can be placed in time; otherwise as written. */
export function orderedEvents(it: ItemOf<'timeline'>) {
  const keyed = it.events.map((e, k) => ({ e, k, t: whenKey(e.when) }));
  return keyed.every((x) => x.t !== null) ? keyed.sort((a, b) => (a.t as number) - (b.t as number) || a.k - b.k).map((x) => x.e) : it.events;
}

/** What the item says, read aloud: its kind, its standing, its words. */
export function spokenOf(it: RepItem): string {
  const standing = standingWords(it);
  return `${KIND_WORD[it.kind]}${standing ? `, ${standing.toLowerCase()}` : ''}: ${it.text || (it.kind === 'timeline' ? 'events in order' : '')}`;
}

export function RepObject({
  item,
  model,
  fresh,
  selected,
  run,
  onSource,
  sourceName,
}: {
  item: RepItem;
  model: RepModel;
  /** changed by the latest batch */
  fresh: 'added' | 'revised' | null;
  selected: boolean;
  /** artifact operations on the model: a slider moved, a cell typed */
  run: (ops: ArtifactOp[]) => void;
  onSource: (sourceId: string, passage?: string) => void;
  sourceName: (id: string) => string | null;
}) {
  const it = item;
  const cls = [
    'nl-r',
    `is-${it.kind}`,
    it.kind === 'hypothesis' ? `is-${it.status}` : '',
    it.kind === 'statement' ? `is-basis-${it.basis} is-role-${it.role}` : '',
    it.kind === 'caveat' ? `is-${it.weight}` : '',
    it.kind === 'unknown' && it.answer ? 'is-answered' : '',
    it.by === 'person' ? 'is-mine' : '',
    fresh ? `is-fresh is-${fresh}` : '',
    selected ? 'is-on' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const events = useMemo(() => (it.kind === 'timeline' ? orderedEvents(it) : []), [it]);
  const cites = it.cites?.length ? (
    <button type="button" className="nl-r-cite" title={`Drawn from ${it.cites.length} passage${it.cites.length === 1 ? '' : 's'}`} aria-label={`Open the source it is drawn from`} onClick={() => onSource(it.cites![0].sourceId, it.cites![0].passage)}>
      <SourceGlyph kind="document" size={10} />
      {it.cites.length > 1 ? <span>{it.cites.length}</span> : null}
    </button>
  ) : null;

  let body: React.ReactNode;
  switch (it.kind) {
    case 'question':
      body = <p className="nl-r-text">{it.text}</p>;
      break;
    case 'statement':
    case 'observation':
      body = (
        <p className="nl-r-text">
          {it.text}
          {cites}
        </p>
      );
      break;
    case 'hypothesis':
      body = (
        <>
          <p className="nl-r-text">
            {it.text}
            {cites}
          </p>
          {it.status !== 'open' ? <span className="nl-r-standing">{STATUS_WORD[it.status]}</span> : null}
        </>
      );
      break;
    case 'entity':
      body = <span className="nl-r-text">{it.text}</span>;
      break;
    case 'unknown':
      body = (
        <>
          <p className="nl-r-text">
            <span className="nl-r-mark" aria-hidden="true">
              ?
            </span>
            {it.text}
          </p>
          {it.answer ? <p className="nl-r-answer">{it.answer}</p> : null}
        </>
      );
      break;
    case 'caveat':
      body = (
        <p className="nl-r-text">
          <span className="nl-r-mark" aria-hidden="true">
            {it.weight === 'important' ? '!' : 'i'}
          </span>
          {it.text}
        </p>
      );
      break;
    case 'metric':
      body = (
        <>
          <div className="nl-r-value">
            {metricValue(it, model.values)}
            {it.unit && !it.value ? <span className="nl-r-unit"> {it.unit}</span> : null}
          </div>
          <div className="nl-r-label">
            {it.text}
            {cites}
          </div>
        </>
      );
      break;
    case 'timeline':
      body = it.view?.as === 'steps' ? (
        <>
          {it.text ? <div className="nl-r-title">{it.text}</div> : null}
          <ol className="nl-r-steps">
            {events.map((e) => (
              <li key={e.id}>
                {e.when ? <span className="nl-r-when">{e.when}: </span> : null}
                {e.text}
              </li>
            ))}
          </ol>
        </>
      ) : (
        <>
          {it.text ? <div className="nl-r-title">{it.text}</div> : null}
          <ol className="nl-r-tl">
            {events.map((e) => (
              <li key={e.id} className={e.sure ? '' : 'is-unsure'}>
                <span className="nl-r-when">{e.when}</span>
                <span className="nl-r-dot" aria-hidden="true" />
                <span className="nl-r-event">
                  {e.text}
                  {e.sure ? '' : <span className="nl-sr"> (uncertain)</span>}
                </span>
              </li>
            ))}
          </ol>
        </>
      );
      break;
    case 'sequence':
      body = it.view?.as === 'timeline' ? (
        <>
          {it.text ? <div className="nl-r-title">{it.text}</div> : null}
          <ol className="nl-r-tl">
            {it.steps.map((st, k) => (
              <li key={st.id}>
                <span className="nl-r-when">Step {k + 1}</span>
                <span className="nl-r-dot" aria-hidden="true" />
                <span className="nl-r-event">{st.text}</span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <>
          {it.text ? <div className="nl-r-title">{it.text}</div> : null}
          <ol className="nl-r-steps">
            {it.steps.map((s) => (
              <li key={s.id} title={s.detail}>
                {s.text}
              </li>
            ))}
          </ol>
        </>
      );
      break;
    case 'document': {
      const page = pageOf(it.passage);
      body = (
        <>
          <button type="button" className="nl-r-doc" onClick={() => onSource(it.sourceId, it.passage)}>
            <SourceGlyph kind="document" size={13} />
            <span>{sourceName(it.sourceId) ?? 'A source no longer in the library'}</span>
            {page ? <span className="nl-r-page">p. {page}</span> : null}
          </button>
          {it.text ? <p className="nl-r-text">{it.text}</p> : null}
        </>
      );
      break;
    }
    case 'equation':
    case 'variable':
    case 'plot':
    case 'matrix':
    case 'diagram':
    case 'media': {
      const as = it.view?.as;
      const view =
        it.kind === 'matrix' && as === 'plot' ? <TableAsPlot it={it} model={model} selected={selected} run={run} />
        : it.kind === 'matrix' && as === 'bars' ? <TableAsBars it={it} model={model} />
        : it.kind === 'matrix' && as === 'metrics' ? <TableAsMetrics it={it} model={model} />
        : it.kind === 'plot' && as === 'table' ? <PlotAsTable it={it} model={model} />
        : it.kind === 'equation' && as === 'plot' ? (
          <>
            <div className="nl-r-prim is-line">
              <PrimitiveBody p={it.prim} comp={model.comp} scope={model.scope} editable selected={selected} run={run} />
            </div>
            <EquationAsPlot it={it} model={model} selected={selected} run={run} />
          </>
        )
        : null;
      const prim = it.kind === 'variable' && as === 'number' && it.prim.type === 'control' ? ({ ...it.prim, data: { ...it.prim.data, kind: 'number' } } as typeof it.prim) : it.prim;
      body = (
        <>
          {it.text && it.kind !== 'variable' ? <div className="nl-r-title">{it.text}</div> : null}
          {view ?? (
            <div className={`nl-r-prim is-${it.kind}`}>
              <PrimitiveBody p={prim} comp={model.comp} scope={model.scope} editable selected={selected} run={run} />
            </div>
          )}
        </>
      );
      break;
    }
  }
  return (
    <div className={cls} data-drag title={selected ? undefined : 'Select to inspect; drag to move'} aria-label={spokenOf(it)}>
      {body}
      {it.kept ? <span className="nl-r-kept" title="Kept in the workspace" aria-label="Kept in the workspace" /> : null}
    </div>
  );
}
