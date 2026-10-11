'use client';

// components/display/Gallery.tsx — what can be made here, shown working.
//
// Every experience and every display the workspace has, read from the one
// catalogue (lib/objects/display-base.ts displayKinds) — nothing is listed
// here that the workspace cannot make. Each is shown by its own figure,
// drawn read-only over a small example state its kind keeps (the catalogue's
// example, or the kind's maker run on its own example words), and with the
// things a person might say to start one. Choosing one puts the words in the
// composer, to be changed and sent there: the conversation stays the one way
// in, and nothing is made until it is asked for.

import { useMemo } from 'react';
import { ObjectFigure } from '@/components/objects/ObjectFigure';
import { apply, create, displayKinds, EMPTY_SPACE, type DisplayMeta, type ObjectSpace, type ThoughtObject } from '@/lib/objects';
import { crossroadsFromWords } from '@/lib/objects/display-crossroads';
import { untangleFromWords } from '@/lib/objects/display-untangle';
import { groundFromWords } from '@/lib/objects/display-commonground';
import { timeMachineFromWords } from '@/lib/objects/display-timemachine';
import { numberLineFromWords } from '@/lib/objects/display-numberline';
import './gallery.css';

/** Example states for the experiences, made by their own makers from example words — labelled as examples where they are shown. */
const SAMPLES: Record<string, () => unknown> = {
  crossroads: () => crossroadsFromWords('Should I take the job in Austin or stay in Dallas? I care about salary and being near family.'),
  untangle: () => untangleFromWords('I need to finish the essay, my car is making a noise, not sure if I should drop chem, rent is due Friday, want to start running again'),
  commonground: () => groundFromWords('Help us find common ground on how to split the chores'),
  timemachine: () => timeMachineFromWords('How has my thinking changed?'),
  numberline: () => numberLineFromWords('Show -2 <= x < 5 or x = 7 on a number line'),
};

function sampleOf(m: DisplayMeta): ThoughtObject | null {
  try {
    const state = SAMPLES[m.kind]?.() ?? m.example;
    if (!state) return null;
    return create(EMPTY_SPACE, m.kind, state, { origin: 'socria', name: 'Ex' })?.obj ?? null;
  } catch {
    return null;
  }
}

/** What the Time Machine's preview looks back through: an example decision with two recorded steps, at fixed moments. */
function sampleSpace(): ObjectSpace | undefined {
  const made = create(EMPTY_SPACE, 'crossroads', SAMPLES.crossroads(), { origin: 'socria', name: 'Ex' });
  if (!made) return undefined;
  let sp = made.space;
  const id = made.obj.id;
  const p = (made.obj.states[0] as { priorities?: { id: string }[] }).priorities?.[0]?.id;
  for (const [op, args, at] of [
    ['addAlt', { name: 'Go back to school', by: 'person' }, Date.UTC(2026, 9, 1, 9)],
    ...(p ? ([['weight', { id: p, weight: 8 }, Date.UTC(2026, 9, 3, 18)]] as const) : []),
  ] as [string, Record<string, string | number>, number][]) {
    const r = apply(sp, id, op, args, { by: 'person', at });
    if (r.ok) sp = r.space;
  }
  return sp;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function Gallery({ onPrompt, onClose }: { onPrompt?: (text: string) => void; onClose?: () => void }) {
  const all = displayKinds();
  const experiences = all.filter((m) => m.experience);
  const displays = all.filter((m) => !m.experience);
  return (
    <section className="gal" aria-label="What you can make here">
      <header className="gal-head">
        <h2 className="gal-title">Make something to think with</h2>
        <p className="gal-sub">Choose an example to put it in the conversation — change the words to your own, then send it. Everything opens here, yours to work in.</p>
        {onClose && (
          <button type="button" className="gal-close" onClick={onClose}>
            Back
          </button>
        )}
      </header>
      <h3 className="gal-section">Think it through</h3>
      <ul className="gal-grid">
        {experiences.map((m) => (
          <Card key={m.kind} m={m} onPrompt={onPrompt} />
        ))}
      </ul>
      <h3 className="gal-section">Displays to work in</h3>
      <ul className="gal-grid">
        {displays.map((m) => (
          <Card key={m.kind} m={m} onPrompt={onPrompt} />
        ))}
      </ul>
    </section>
  );
}

function Card({ m, onPrompt }: { m: DisplayMeta; onPrompt?: (text: string) => void }) {
  const sample = useMemo(() => sampleOf(m), [m]);
  const space = useMemo(() => (m.kind === 'timemachine' ? sampleSpace() : undefined), [m.kind]);
  return (
    <li className="gal-card" data-kind={m.kind}>
      {/* inert: a picture of the figure, not a second copy to tab through (React 18 has no typed `inert`) */}
      <div className="gal-preview" aria-hidden="true" {...({ inert: '' } as Record<string, string>)}>
        {sample ? (
          <div className="gal-preview-in">
            <ObjectFigure obj={sample} at={sample.at} mode="live" space={space} />
          </div>
        ) : (
          <span className="gal-preview-none">{cap(m.noun)}</span>
        )}
      </div>
      <div className="gal-body">
        <h4 className="gal-name">{cap(m.noun)}</h4>
        <p className="gal-about">{m.about}</p>
        {!!m.prompts?.length && (
          <ul className="gal-prompts" aria-label={`Ways to ask for ${m.noun === 'untangle' ? 'an untangle' : `a ${m.noun}`}`}>
            {m.prompts.map((p) => (
              <li key={p}>
                {onPrompt ? (
                  <button type="button" className="gal-prompt" onClick={() => onPrompt(p)}>
                    “{p}”
                  </button>
                ) : (
                  <span className="gal-prompt is-text">“{p}”</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
