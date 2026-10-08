// Engineering in Logos 3 — what to ask for, what the engine builds, and the
// numbers it computes, across eight disciplines and Live 3D.
//
// NOTHING ON THIS PAGE IS TYPED-IN RESULTS. Each model example is a proposal
// in exactly the form a Logos reply sends (lib/model/engineering.ts), opened by
// the same on-ramp; each "Computed" line is the engine's arithmetic on that
// model, done as this page is built; and test/model-engineering.test.mjs holds
// every one of those numbers to its closed form. The Live 3D examples are read
// by the same reader the panel uses, so what is listed under each is what
// typing it builds.

import Link from 'next/link';
import { Article, H2, Callout, Defs, Def, TableWrap } from '../Article';
import { DemoEngineering } from '../DocsDemo';
import { docPage } from '../registry';
import { ENGINEERING, SCENE_EXAMPLES, type Discipline, type EngineeringExample, type SceneExample } from '@/lib/model/engineering';
import { readScene } from '@/lib/objects/scene-intent';
import { SCENE, SHAPE_WORD, massOf, sizeOf, type SceneState } from '@/lib/objects/scene';

const page = docPage('logos-3-engineering')!;

const DISCIPLINES: { id: string; d: Discipline; lead: string }[] = [
  { id: 'engines', d: 'Engines', lead: 'Cycles, the crank that turns pressure into rotation, and the wheel that stores it.' },
  { id: 'vibration', d: 'Mechanisms and vibration', lead: 'Things that oscillate, settle, ring or refuse to repeat — assembled from parts or written as equations of motion, and integrated.' },
  { id: 'electrical', d: 'Electrical', lead: 'Circuits as differential equations: the same grammar as a mass on a spring, with the names changed.' },
  { id: 'structures', d: 'Structures', lead: 'Beams, columns and shafts from their closed-form solutions, with the load, the material and the section as controls.' },
  { id: 'fluids', d: 'Thermal and fluids', lead: 'Bodies cooling, tanks draining, flow through ducts and pipes.' },
  { id: 'aero', d: 'Aerospace', lead: 'Rockets, orbits and lift — the equations, with what they assume.' },
  { id: 'chemical', d: 'Chemical and process', lead: 'Rates and the reactions they drive.' },
  { id: 'control', d: 'Control', lead: 'Feedback loops, and what tuning a gain does to where a system settles.' },
];

const sections = [
  { id: 'how', heading: 'How to read these' },
  ...DISCIPLINES.map((x) => ({ id: x.id, heading: x.d })),
  { id: 'live3d', heading: 'Geometry in Live 3D' },
  { id: 'limits', heading: 'Where it stops' },
];

function Example({ e }: { e: EngineeringExample }) {
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

const EMPTY: SceneState = { nodes: [], next: 1, unit: 'm' };
const kg = (v: number) => (v >= 1000 ? `${Number((v / 1000).toPrecision(4))} t` : v >= 1 ? `${Number(v.toPrecision(4))} kg` : `${Number((v * 1000).toPrecision(4))} g`);

function SceneBlock({ x }: { x: SceneExample }) {
  const r = readScene(x.say, EMPTY);
  const s = r.preview;
  const facts = SCENE.facts(s, { guarded: false }).filter((f) => /^mass |^everything fits/.test(f));
  const own = s.nodes.flatMap((n) => (SCENE.partFacts(s, n.id) ?? []).filter((f) => /narrowest radius|area ratios|planform area|curve’s length/.test(f)).map((f) => `${n.name}: ${f}`));
  return (
    <section className="d-eng" id={`scene-${x.id}`} aria-labelledby={`scene-${x.id}-h`}>
      <h3 id={`scene-${x.id}-h`}>
        {x.title} <span className="d-eng-tag">{x.discipline}</span>
      </h3>
      <p className="d-eng-ask">
        <span className="d-eng-ask-k">Type into Live 3D</span>
        <span className="d-eng-ask-q">{x.say}</span>
      </p>
      <p className="d-eng-read">
        Read as: {r.clauses.map((c) => c.understood ?? c.problem).join(' · ')}
      </p>
      <TableWrap>
        <table className="d-eng-parts">
          <thead>
            <tr>
              <th>Part</th>
              <th>Shape</th>
              <th>Size</th>
              <th>Mass</th>
            </tr>
          </thead>
          <tbody>
            {s.nodes.map((n) => {
              const m = massOf(n);
              return (
                <tr key={n.id}>
                  <td>{n.name}</td>
                  <td>{SHAPE_WORD[n.shape]}</td>
                  <td>{sizeOf(n, s.unit)}</td>
                  <td>{m ? `${kg(m.kg)}${m.nominal ? ' (nominal density)' : ''}${m.how === 'numerical' ? ' — numerical' : ''}` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
      {[...facts, ...own].length > 0 && (
        <ul className="d-eng-facts">
          {[...facts, ...own].map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      <p>{x.look}</p>
    </section>
  );
}

export function Logos3Engineering() {
  return (
    <Article page={page} sections={sections}>
      <p>
        Logos 3 builds models from what you say — curves, systems that evolve, mechanisms assembled from parts — and, in
        its experimental Live 3D panel, geometry you describe. This page is a field guide for engineers: {ENGINEERING.length}{' '}
        models across eight disciplines and {SCENE_EXAMPLES.length} pieces of geometry, each with the words that ask for it,
        what Logos builds, what to look at, and the numbers it computes.
      </p>

      <H2 id="how">How to read these</H2>
      <Defs>
        <Def term="Ask">
          The words to type into the Logos 3 conversation. Logos reads them and proposes a model; the engine checks the
          proposal — and refuses it, naming what is missing, rather than inventing a value — then computes it. Name your
          numbers and the proposal uses them; leave them out and it says which values it chose.
        </Def>
        <Def term="The model below each">
          Written out in exactly the form a reply proposes, and opened by the same engine, live on this page. Move a
          control and it is solved again. What a reply proposes for your own words may differ in its details.
        </Def>
        <Def term="Computed">
          The engine’s own arithmetic on that model — an eigenvalue, a value at a point, the moment a run peaks — done as
          this page was built. Each of these numbers is checked against its closed form in Socria’s test suite, so a figure
          here is a computation that has been verified, not a number somebody typed.
        </Def>
        <Def term="Views to open">
          A model offers what its structure supports: a curve its <em>Slope</em> and <em>Values</em>; a system its{' '}
          <em>Path</em>, <em>Phase portrait</em> and <em>Against time</em>; a mechanism its <em>Mechanism</em>. The Inspector’s{' '}
          <em>How it behaves</em> lists a system’s fixed points with their eigenvalues and, where it applies, Lyapunov
          exponents. See <Link href="/docs/logos-2">Logos 2</Link> for the views in detail.
        </Def>
      </Defs>
      <Callout tag="Previews and formulas, not certification">
        Every model states its assumptions — Euler–Bernoulli beams, ideal gases, lumped bodies, isentropic flow — and the
        result is exactly as good as they are. Nothing here checks a real member against a design code, analyses a part by
        finite elements, or simulates a flow field. A material property or a coefficient in these models is a value you
        give, not one looked up from a certified source.
      </Callout>

      {DISCIPLINES.map((x) => (
        <div key={x.id}>
          <H2 id={x.id}>{x.d}</H2>
          <p className="d-eng-lead">{x.lead}</p>
          {ENGINEERING.filter((e) => e.discipline === x.d).map((e) => (
            <Example key={e.id} e={e} />
          ))}
        </div>
      ))}

      <H2 id="live3d">Geometry in Live 3D</H2>
      <p>
        Live 3D is an experimental panel in the Logos 3 workspace — <em>+ View → Live 3D</em>. Describe a shape and it is
        drawn as you type; press Enter and it is built. Every part keeps its identity, every size is exact, and parts can
        rest on one another. Give a part a material and it has a mass: density × its volume. It is a{' '}
        <strong>geometric preview</strong> — nothing in it is loaded, stressed or simulated — and it says so. The
        descriptions below are read by the same reader the panel uses, so what is listed is what typing them builds.
      </p>
      {SCENE_EXAMPLES.map((x) => (
        <SceneBlock key={x.id} x={x} />
      ))}
      <Callout tag="Nominal densities">
        A named material — steel, aluminium, oak — takes a typical density, and the panel marks it nominal. It is a
        reasonable value at room temperature, not a material card: type the density you measured and it replaces it.
      </Callout>

      <H2 id="limits">Where it stops</H2>
      <ul>
        <li>
          <strong>No finite elements, no CFD.</strong> Stress fields in a part, flow around a wing, heat moving through a
          solid in two or three dimensions — none of these is computed. The models here are closed forms and ordinary
          differential equations.
        </li>
        <li>
          <strong>Coefficients are inputs.</strong> A friction factor, a lift coefficient, a heat-transfer coefficient:
          you give them, and Logos computes what follows. It does not derive them from roughness, Reynolds number or an
          airfoil.
        </li>
        <li>
          <strong>Live 3D is not CAD.</strong> No sketches with constraints, no booleans, fillets, threads or gear teeth,
          no assemblies with joints, no interference checks, and no import or export of CAD files. Parts can overlap and
          nothing will say so.
        </li>
        <li>
          <strong>A model is its assumptions.</strong> Each states them. A buckling load is an ideal column’s; a cycle
          efficiency is an air-standard cycle’s; a tank drains through a lossless orifice. Read the assumptions before the
          number.
        </li>
      </ul>
      <p>
        For how Logos 3 itself works — the workspace, rooms and what is shared — see <Link href="/docs/logos-3">Logos 3</Link>.
      </p>
    </Article>
  );
}
