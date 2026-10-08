// Dynamics and chaos in Logos 3 — maps and flows, what to ask for, what the
// engine builds, and the numbers it computes about them.
//
// As on the engineering page: each example is a proposal in the form a Logos
// reply sends (lib/model/dynamics-examples.ts), opened live by the same
// engine; each "Computed" line is the engine's own arithmetic, done as this
// page is built; and the tests hold each number to what is known.

import Link from 'next/link';
import { Article, H2, Callout, Defs, Def } from '../Article';
import { DemoEngineering } from '../DocsDemo';
import { docPage } from '../registry';
import { DYNAMICS, type DynamicsExample, type Topic } from '@/lib/model/dynamics-examples';

const page = docPage('logos-3-dynamics')!;

const TOPICS: { id: string; t: Topic; lead: string }[] = [
  { id: 'maps', t: 'Maps and chaos', lead: 'Systems that step — once a generation, once a cycle. Their pictures are the cobweb and the bifurcation diagram, and the numbers that say what they do are a period, a Lyapunov exponent, and Feigenbaum’s δ.' },
  { id: 'flows', t: 'Flows and attractors', lead: 'Systems that flow, and the maps hidden inside them: fixed points with their eigenvalues, closed orbits, and the Poincaré section of a strange attractor.' },
];

const sections = [{ id: 'how', heading: 'How to read these' }, ...TOPICS.map((x) => ({ id: x.id, heading: x.t })), { id: 'limits', heading: 'Where it stops' }];

function Example({ e }: { e: DynamicsExample }) {
  const computed = e.check(e.model());
  return (
    <section className="d-eng" id={`ex-${e.id}`} aria-labelledby={`ex-${e.id}-h`}>
      <h3 id={`ex-${e.id}-h`}>{e.title}</h3>
      <p className="d-eng-ask">
        <span className="d-eng-ask-k">Ask</span>
        <span className="d-eng-ask-q">{e.ask}</span>
      </p>
      <Defs>
        <Def term="What it builds">{e.builds}</Def>
        <Def term="What to look at">{e.look}</Def>
        <Def term="Computed">
          <span className="d-eng-computed">{computed}</span>
        </Def>
      </Defs>
      <DemoEngineering id={e.id} />
    </section>
  );
}

export function Logos3Dynamics() {
  return (
    <Article page={page} sections={sections}>
      <p>
        Logos 3 steps maps and integrates flows, and then reads what they do: where they settle, whether they repeat,
        how fast nearby starts separate. This page is {DYNAMICS.length} examples, each with the words that ask for it,
        what the engine builds, what to look at, and the numbers it computes — from the road to chaos to the Lorenz
        butterfly cut open.
      </p>

      <H2 id="how">How to read these</H2>
      <Defs>
        <Def term="Ask">The words to type into the Logos 3 conversation. Logos reads them and proposes a model; the engine checks it, and refuses it — naming what is missing — rather than inventing a value.</Def>
        <Def term="Views">
          A map offers its <em>Iterates</em>, a <em>Cobweb</em> when it has one state, and a <em>Bifurcation diagram</em>{' '}
          across the range of a control. A flow offers its <em>Path</em>, <em>Phase portrait</em> and{' '}
          <em>Against time</em>, and — with three or more states and no clock in its rates — a <em>Poincaré section</em>.
        </Def>
        <Def term="Computed">
          The engine’s own arithmetic on the model as this page was built. Periods are read off the orbit; Lyapunov
          exponents come from products of Jacobians along it; Feigenbaum’s δ comes from the map’s own superstable
          cycles, found one by one. Each is checked in Socria’s tests against what is known.
        </Def>
      </Defs>
      <Callout tag="Finite-time estimates">
        A Lyapunov exponent is a limit over infinite time, and a computer stops. The ones here are averaged over
        thousands of steps after a settling time, and say so; a period of “none within 64” means none was found within
        64 steps, not that none exists.
      </Callout>

      {TOPICS.map((x) => (
        <div key={x.id}>
          <H2 id={x.id}>{x.t}</H2>
          <p className="d-eng-lead">{x.lead}</p>
          {DYNAMICS.filter((e) => e.topic === x.t).map((e) => (
            <Example key={e.id} e={e} />
          ))}
        </div>
      ))}

      <H2 id="limits">Where it stops</H2>
      <ul>
        <li>
          <strong>Everything is numerical.</strong> Fixed points are found by Newton’s method from many starts in the
          region the orbit visits; one outside it is not looked for.
        </li>
        <li>
          <strong>A bifurcation diagram sweeps one control</strong> across its own range, carrying each column’s end into
          the next. Near a bifurcation the orbit settles slowly, and a column there can look undecided — the period is
          only counted where its values are visibly apart.
        </li>
        <li>
          <strong>A Poincaré section is taken at one plane</strong>: the third state crossing its mean, upward. Another
          plane is not chosen for you yet.
        </li>
      </ul>
      <p>
        Fields — heat along a rod, a reaction front, a shock, patterns on a plane — are on{' '}
        <Link href="/docs/logos-3-engineering">Engineering in Logos 3</Link>.
      </p>
    </Article>
  );
}
