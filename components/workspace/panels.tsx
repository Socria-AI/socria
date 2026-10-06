'use client';
// components/workspace/panels.tsx
//
// The Logos 3 surfaces that did not exist as surfaces before: a model on its
// own, its parameters, the inspector and the trace. Each is a REPRESENTATION
// of state the line of thinking already holds — a model document — and none
// keeps a copy of it. Every change goes through the document's own verbs:
//
//   a slider here      → setParam → the host's adopt → a revision (coalesced
//                        per drag, exactly as the model's own sliders are)
//   undo, redo, a step → docs.undo / redo / restore on the same document
//
// so the model panel, the inspector and the conversation all see the change
// because they all read the one document, not because anything messages them.
//
// Each is memoised on what it reads, so a reply streaming into the
// conversation does not redraw a 3D surface forty times a second.

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ModelView } from '@/components/model/ModelView';
import { SceneSurface, isSimulation } from '@/components/surfaces/SceneSurface';
import { MathViz } from '@/components/MathViz';
import type { VizScene } from '@/lib/logos-viz';
import type { VizModelState, VizOp } from '@/lib/viz-model';
import type { ThinkingMap } from '@/lib/logos';
import { current, modelFor, type ModelDoc } from '@/lib/model/docs';
import { setParam, type Model } from '@/lib/model/schema';
import { inputsOf } from '@/lib/model/derive';
import { affectedBy } from '@/lib/model/deps';
import { inspectModel, inspectObject, transparencyLine, type Inspection } from '@/lib/model/inspect';
import { describeFocus, type Focus } from '@/lib/workspace/focus';

// ── Model ─────────────────────────────────────────────────────────

/**
 * A model, or the picture a line of thinking holds when it has no model —
 * the same dispatch the map's plot lens makes, so a simulation is drawn by its
 * own surface and a formula by the plot renderer, never one dressed as the other.
 */
export const ModelPanel = memo(function ModelPanel({
  doc,
  edits,
  viz,
  pinnedView,
  onPinView,
  onModel,
  onAsk,
  onRead,
  ops,
}: {
  doc: ModelDoc | null;
  edits?: VizModelState['edits'];
  viz: VizScene | null;
  pinnedView?: string | null;
  onPinView?: (id: string | null) => void;
  onModel: (docId: string, m: Model) => void;
  onAsk?: (id: string, label: string) => void;
  onRead?: (read: (() => VizModelState) | null) => void;
  ops?: { seq: number; ops: VizOp[] } | null;
}) {
  const model = useMemo(() => (doc ? modelFor(doc) : null), [doc]);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: 400 });
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (model && doc) {
    return (
      <div className="ws-model lg-tokens" ref={box}>
        <ModelView
          model={model}
          edits={edits}
          fill
          pinnedView={pinnedView}
          // A panel pinned to one representation is that representation; the row
          // of views and the account belong to the model's own panel and the inspector.
          understand={pinnedView === undefined}
          onPinView={onPinView}
          onModel={(m) => onModel(doc.id, m)}
          onAsk={onAsk ? (id) => onAsk(id, model.objects.find((o) => o.id === id)?.label ?? id) : undefined}
          onRead={onRead}
          ops={ops}
        />
      </div>
    );
  }
  if (viz) {
    return (
      <div className="ws-model" ref={box}>
        {isSimulation(viz) ? (
          <SceneSurface scene={viz} onRead={onRead} ops={ops} />
        ) : (
          <MathViz scene={viz} width={size.w} height={size.h} onRead={onRead} ops={ops} />
        )}
      </div>
    );
  }
  return (
    <div className="ws-empty" ref={box}>
      <p>No model in this line of thinking yet.</p>
      <p className="ws-empty-sub">Ask for one in the conversation — “model the saddle z = a·x² − b·y²” — and it appears here.</p>
    </div>
  );
});

// ── Parameters ────────────────────────────────────────────────────

export const ParamsPanel = memo(function ParamsPanel({
  doc,
  focus,
  onModel,
  onFocus,
}: {
  doc: ModelDoc | null;
  focus: Focus;
  onModel: (docId: string, m: Model) => void;
  onFocus: (f: Focus) => void;
}) {
  const model = useMemo(() => (doc ? modelFor(doc) : null), [doc]);
  const inputs = useMemo(() => (model ? inputsOf(model) : []), [model]);
  if (!doc || !model) return <div className="ws-empty"><p>Parameters belong to a model, and there is none yet.</p></div>;
  if (!model.params.length && !inputs.length) return <div className="ws-empty"><p>{model.title} has nothing to adjust.</p></div>;
  const stated = current(doc);

  const setP = (id: string, v: number) => onModel(doc.id, setParam(stated, id, v, Date.now()));
  const setI = (id: string, v: number) => {
    const was = stated.at?.[id];
    onModel(doc.id, {
      ...stated,
      version: (stated.version ?? 0) + 1,
      at: { ...(stated.at ?? {}), [id]: v },
      lastChange: { what: `at ${id}`, ...(typeof was === 'number' ? { from: was } : {}), to: v, affected: affectedBy(stated, [id]), at: Date.now() },
    });
  };
  const on = (kind: 'param' | 'input', id: string) => focus && focus.kind === kind && focus.id === id && 'doc' in focus && focus.doc === doc.id;
  const fmt = (v: number) => String(Number(v.toPrecision(4)));

  return (
    <div className="ws-params">
      <p className="ws-sub">{model.title}</p>
      {model.params.length > 0 && <h3 className="ws-h">The model</h3>}
      {model.params.map((p) => (
        <div key={p.id} className={`ws-ctl${on('param', p.id) ? ' is-on' : ''}`}>
          <button type="button" className="ws-ctl-name" onClick={() => onFocus(on('param', p.id) ? null : { kind: 'param', doc: doc.id, id: p.id })} title={p.means || 'Select — the conversation and the inspector follow'}>
            {p.label}
          </button>
          <input
            type="range"
            min={p.min}
            max={p.max}
            step={p.step ?? (p.max - p.min) / 100}
            value={p.value}
            aria-label={p.label}
            onChange={(e) => setP(p.id, +e.target.value)}
            onFocus={() => onFocus({ kind: 'param', doc: doc.id, id: p.id })}
          />
          <span className="ws-ctl-v">
            {fmt(p.value)}
            {p.units ? ` ${p.units}` : ''}
            {p.assumed === 'value' && <em> placeholder</em>}
          </span>
        </div>
      ))}
      {inputs.length > 0 && <h3 className="ws-h">Where it is read</h3>}
      {inputs.map((q) => (
        <div key={q.id} className={`ws-ctl${on('input', q.id) ? ' is-on' : ''}`}>
          <button type="button" className="ws-ctl-name" onClick={() => onFocus(on('input', q.id) ? null : { kind: 'input', doc: doc.id, id: q.id })}>
            {q.label}
          </button>
          <input
            type="range"
            min={q.min}
            max={q.max}
            step={q.from === 'name' || q.from === 'type' ? 1 : (q.max - q.min) / 100}
            value={q.at}
            aria-label={q.label}
            onChange={(e) => setI(q.id, +e.target.value)}
            onFocus={() => onFocus({ kind: 'input', doc: doc.id, id: q.id })}
          />
          <span className="ws-ctl-v">
            {fmt(q.at)}
            {q.units ? ` ${q.units}` : ''}
            {q.from === 'assumed' && <em> range assumed</em>}
          </span>
        </div>
      ))}
    </div>
  );
});

// ── Inspector ─────────────────────────────────────────────────────

function Sections({ i, onPick }: { i: Inspection; onPick?: (id: string) => void }) {
  return (
    <>
      {i.sections.map((s) => (
        <details key={s.id} className="ws-sec" open={s.id === 'what' || s.id === 'state' || s.id === 'computation'}>
          <summary>
            <span>{s.label}</span>
            <em>{s.summary}</em>
          </summary>
          <dl>
            {s.facts.slice(0, 14).map((f, k) => (
              <div key={k}>
                <dt>{f.of && onPick ? <button type="button" onClick={() => onPick(f.of!)}>{f.label}</button> : f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      ))}
    </>
  );
}

/**
 * What the selected thing is. It follows the workspace focus — a parameter, a
 * free input, a part of a model, an idea on the map — and falls back to the
 * model as a whole, or the map, when nothing is selected.
 */
export const InspectorPanel = memo(function InspectorPanel({
  map,
  doc,
  focus,
  onFocus,
  onAsk,
}: {
  map: ThinkingMap;
  doc: ModelDoc | null;
  focus: Focus;
  onFocus: (f: Focus) => void;
  onAsk: (label: string) => void;
}) {
  const model = useMemo(() => (doc ? modelFor(doc) : null), [doc]);
  const brief = useMemo(() => describeFocus(focus, map), [focus, map]);
  const objectInspection = useMemo(
    () => (focus && focus.kind === 'object' && model && focus.doc === doc?.id ? inspectObject(model, focus.id) : null),
    [focus, model, doc]
  );
  const whole = useMemo(() => (model ? inspectModel(model) : null), [model]);

  if (brief) {
    return (
      <div className="ws-insp">
        <div className="ws-insp-head">
          <span className="ws-kicker">{brief.kind === 'node' ? 'On the map' : brief.kind === 'param' ? 'Parameter' : brief.kind === 'input' ? 'Free input' : 'Part of the model'}</span>
          <h3>{brief.label}</h3>
          <p className="ws-sub">{brief.of}</p>
        </div>
        {objectInspection ? (
          <Sections i={objectInspection} onPick={(id) => doc && onFocus({ kind: 'object', doc: doc.id, id })} />
        ) : (
          <ul className="ws-lines">
            {brief.lines.map((l, k) => (
              <li key={k}>{l}</li>
            ))}
          </ul>
        )}
        <div className="ws-insp-acts">
          <button type="button" onClick={() => onAsk(brief.label)}>Ask about this</button>
          <button type="button" className="is-quiet" onClick={() => onFocus(null)}>Clear selection</button>
        </div>
      </div>
    );
  }
  if (whole && model) {
    return (
      <div className="ws-insp">
        <div className="ws-insp-head">
          <span className="ws-kicker">The model</span>
          <h3>{model.title}</h3>
          {whole.grade && <p className="ws-sub">{whole.grade}</p>}
        </div>
        <p className="ws-hint">Select a part, a parameter or an idea anywhere in the workspace and it is described here.</p>
        <Sections i={whole} onPick={(id) => doc && onFocus({ kind: 'object', doc: doc.id, id })} />
      </div>
    );
  }
  const byType = map.nodes.reduce<Record<string, number>>((a, n) => ((a[n.type] = (a[n.type] ?? 0) + 1), a), {});
  return (
    <div className="ws-insp">
      <div className="ws-insp-head">
        <span className="ws-kicker">The map</span>
        <h3>{map.nodes.length ? `${map.nodes.length} idea${map.nodes.length === 1 ? '' : 's'}` : 'Nothing yet'}</h3>
      </div>
      {map.nodes.length > 0 ? (
        <>
          <ul className="ws-lines">
            {Object.entries(byType).map(([t, n]) => (
              <li key={t}>
                {n} {t}
                {n === 1 ? '' : 's'}
              </li>
            ))}
          </ul>
          <p className="ws-hint">Select an idea on the map and it is described here.</p>
        </>
      ) : (
        <p className="ws-hint">The map builds as you talk; what you select in it is described here.</p>
      )}
    </div>
  );
});

// ── Trace ─────────────────────────────────────────────────────────

/**
 * The model's history of SUBSTANCE: what changed, in order, each step one a
 * person can return to. Selections and opened views are canonical too but
 * they are not changes of mind, so they are left out of this reading of it —
 * and nothing about the workspace's arrangement is ever in it at all.
 */
export const TracePanel = memo(function TracePanel({
  doc,
  onUndo,
  onRedo,
  onRestore,
}: {
  doc: ModelDoc | null;
  onUndo: (docId: string) => void;
  onRedo: (docId: string) => void;
  onRestore: (docId: string, at: number) => void;
}) {
  if (!doc) return <div className="ws-empty"><p>The trace follows a model, and there is none yet.</p></div>;
  const model = modelFor(doc);
  const entries = doc.log.filter((l) => l.kind !== 'select' && l.kind !== 'view');
  return (
    <div className="ws-trace">
      <p className="ws-sub">{transparencyLine(model)}</p>
      <div className="ws-trace-acts">
        <button type="button" disabled={doc.at <= 0} onClick={() => onUndo(doc.id)}>Undo</button>
        <button type="button" disabled={doc.at >= doc.revisions.length - 1} onClick={() => onRedo(doc.id)}>Redo</button>
      </div>
      <ol className="ws-trace-list" reversed>
        {[...entries].reverse().map((l, k) => {
          const reachable = l.at >= 0 && l.at < doc.revisions.length;
          const here = l.at === doc.at;
          return (
            <li key={`${l.at}-${k}`} className={`${here ? 'is-here' : ''}${l.at > doc.at ? ' is-ahead' : ''}`}>
              <button type="button" disabled={!reachable || here} onClick={() => onRestore(doc.id, l.at)} title={here ? 'This is the model now' : 'Return the model to this point'}>
                <span className="ws-trace-said">{l.said}</span>
                {here && <em>now</em>}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
});
