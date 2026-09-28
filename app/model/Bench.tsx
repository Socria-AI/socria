'use client';

import { useMemo, useState } from 'react';
import { ModelView } from '@/components/model/ModelView';
import { LIBRARY } from '@/lib/model/library';
import { chooseRepresentation } from '@/lib/model/spec';
import { sanitizeModel } from '@/lib/model/schema';
import type { VizOp } from '@/lib/viz-model';

export function Bench() {
  const [id, setId] = useState(LIBRARY[0].id);
  // THE BENCH DRIVES THE VIEW THE WAY A REPLY WOULD. Not a prop and not an
  // internal flag: the same op the conversation sends, through the same seam,
  // so pressing this exercises the path that matters rather than a shortcut
  // around it.
  const [ops, setOps] = useState<{ seq: number; ops: VizOp[] } | null>(null);
  const send = (op: VizOp) => setOps((prev) => ({ seq: (prev?.seq ?? 0) + 1, ops: [op] }));
  const entry = LIBRARY.find((m) => m.id === id) ?? LIBRARY[0];
  // Sanitised on the way in, exactly as a model arriving from a conversation
  // or a saved project would be. The bench should exercise the real path.
  const model = useMemo(() => sanitizeModel(entry.build())!, [entry]);
  const choice = useMemo(() => chooseRepresentation(model), [model]);

  return (
    <div className="eng-page lg-tokens">
      <header className="eng-head">
        <p className="eng-kicker">Socria · Logos · the representation engine</p>
        <h1>
          One renderer, <em>ten models</em>.
        </h1>
        <p className="eng-lede">
          Every picture below is the same component drawing a different piece of
          data. There is no saddle component and no attractor component: a model
          says what its objects are, what they mean, and how each was actually
          produced, and the engine samples, integrates and draws them.
        </p>
      </header>

      <nav className="eng-tabs" aria-label="Models">
        {LIBRARY.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`eng-tab${m.id === id ? ' is-on' : ''}`}
            aria-pressed={m.id === id}
            onClick={() => setId(m.id)}
          >
            {m.label}
          </button>
        ))}
      </nav>

      <div className="eng-stage">
        <ModelView key={id} model={model} fill ops={ops} />
      </div>

      <div className="eng-ops">
        <button type="button" onClick={() => send({ op: 'view', as: '3d' })}>in space</button>
        <button type="button" onClick={() => send({ op: 'view', as: '2d' })}>flatten</button>
        <button type="button" onClick={() => send({ op: 'slice', axis: 'y', at: 0 })}>slice y = 0</button>
        <button type="button" onClick={() => send({ op: 'unslice' })}>whole thing</button>
        <button type="button" onClick={() => send({ op: 'reset' })}>reset</button>
        <span>the same ops a reply sends</span>
      </div>

      <section className="eng-about">
        <p className="eng-tests">
          <strong>What this one exercises.</strong> {entry.tests}
        </p>
        <p className="eng-choice">
          <strong>Why {choice.dimensionality} dimensions.</strong> {choice.why}
          {choice.alternatives.length ? ` Other honest answers: ${choice.alternatives.join(', ')}.` : ''}
        </p>
        {model.assumptions?.length ? (
          <ul className="eng-assume">
            {model.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
