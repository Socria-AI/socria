// Socria Logos 2 — the model workspace.
//
// WHAT THIS PAGE SAYS, AND WHAT IT NO LONGER SAYS. Logos 2 began as the room
// with a second seat, and this page opened with two sections on it. The room
// is not in the product: its code is in the tree, parked behind a server flag
// (lib/rooms-flag.ts) until it ships, and a page describing a door that is not
// on the wall is the fastest way to lose a reader's trust. So the two-seat
// sections are gone from here, and the page is about the thing that IS
// reachable — a MODEL as something the person owns: built by the engine rather
// than drawn by a language model, with an id that survives being edited,
// revisions, undo and branches.
//
// The figures are the real components, live on the page — a model that goes
// through the same on-ramp a conversation's proposal does, and the library's
// models drawn by the same ModelView. No screenshots: the screens they showed
// were Logos 2's, and Logos 3 is the current Logos.

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Article, H2, Callout, Defs, Def } from '../Article';
import { DemoLibraryFigure, DemoModelWorkspace, DemoRefusal } from '../DocsDemo';
import { docPage } from '../registry';

const page = docPage('logos-2')!;
const sections = [
  { id: 'glance', heading: 'At a glance' },
  { id: 'gallery', heading: 'What you can build' },
  { id: 'try', heading: 'Things to ask for' },
  { id: 'features', heading: 'What you can do with a model' },
  { id: 'models', heading: 'Models you own' },
  { id: 'onramp', heading: 'Where a model comes from' },
  { id: 'editing', heading: 'Editing one' },
  { id: 'refuse', heading: 'When it will not build' },
  { id: 'limits', heading: 'What it does not do yet' },
  { id: 'access', heading: 'Access and plans' },
];

/** A figure the product draws here, live — where a screenshot of it used to be. */
function LiveShot({ id, title, children, wide }: { id: string; title: string; children: ReactNode; wide?: boolean }) {
  return (
    <figure className={`d-fig${wide ? ' is-wide' : ''}`}>
      <DemoLibraryFigure id={id} title={title} />
      <figcaption>{children}</figcaption>
    </figure>
  );
}

/** What each gallery model is, and the sentence that builds one like it. */
const GALLERY: { id: string; title: string; ask: string; note: string }[] = [
  { id: 'saddle', title: 'A saddle', ask: 'Model a saddle, z = a·x² − b·y²', note: 'A surface with its level sets, cross-sections and both partial derivatives. Push b below zero and it turns into a bowl.' },
  { id: 'lorenz', title: 'The Lorenz attractor', ask: 'Show me why the Lorenz system is chaotic', note: 'Three coupled equations, integrated. Move ρ past about 24 and the butterfly appears.' },
  { id: 'double-pendulum', title: 'A double pendulum', ask: 'Why is a double pendulum unpredictable?', note: 'Two arms, integrated as a system. Change the starting angle a little and the path parts company with itself.' },
  { id: 'orbit', title: 'A two-body orbit', ask: 'What happens to an orbit if I change the launch speed?', note: 'Gravity between two bodies. Circle, ellipse, escape — from one control.' },
  { id: 'oscillator', title: 'A mass on a spring, with damping', ask: 'Model a mass on a spring with damping', note: 'Assembled from parts into equations of motion. Every control carries its unit: kg, N/m, N·s/m.' },
  { id: 'torus', title: 'A torus', ask: 'Draw a torus I can reshape', note: 'Parametric geometry with a camera you can turn, and the two radii as controls.' },
  { id: 'vol-surface', title: 'An implied volatility surface', ask: 'Model a volatility smile across strike and maturity', note: 'A finance surface with named axes — strike, maturity in years, implied vol.' },
  { id: 'multivariate-model', title: 'A regression, read every way', ask: 'Fit y on two predictors and show me what the fit leaves out', note: 'Fitted to data with known coefficients: the fitted surface, its residuals and coefficients with their errors, side by side.' },
];

function Gallery() {
  return (
    <div className="d-gallery">
      {GALLERY.map((g) => (
        <figure key={g.id} className="d-fig">
          <DemoLibraryFigure id={g.id} title={g.title} />
          <figcaption>
            <strong>{g.title}.</strong> {g.note}
            <span className="d-ask">&ldquo;{g.ask}&rdquo;</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

export function Logos2() {
  return (
    <Article page={page} sections={sections}>
      <Callout tag="Logos 3 is the current Logos">
        Everything on this page is in <Link href="/docs/logos-3">Logos 3</Link> too — with a workspace
        around it: the map, the models and designs drawn in 3D from your words, side by side. The figures
        here are built live on this page by the same engine, not screenshots of an older screen.
      </Callout>
      <p>
        Logos 2 is the same surface as{' '}
        <Link href="/docs/logos">Logos</Link> — the conversation and the{' '}
        <Link href="/docs/thinking-map">Thinking Map</Link>, side by side — with
        one thing added: a <em>model workspace</em>. Structured, computed
        objects that you own, edit and undo, rather than pictures that are
        generated again each time you ask for a change.
      </p>

      <H2 id="glance">At a glance</H2>
      <LiveShot id="saddle" title="A saddle" wide>
        One sentence in, a model out — this one, built on this page by the same
        engine: controls for a and b, the surface with numbered axes. Move them.
        In the product the conversation sits beside it.
      </LiveShot>
      <ul>
        <li>
          <strong>Say what you are working through.</strong> Logos 2 maps the
          reasoning as you talk, and when what you describe is a system — a
          shape, a mechanism, a set of equations, a relationship in data — it
          builds a model of it beside you.
        </li>
        <li>
          <strong>Move it.</strong> Every control recomputes the model, and
          what depends on it moves with it.
        </li>
        <li>
          <strong>Read it.</strong> Each model opens a row of views — the
          surface, its level sets, a cross-section, the slope, the residuals —
          and an inspector that says what each part is and where its number
          came from.
        </li>
        <li>
          <strong>Change it by saying so.</strong> &ldquo;Make the damping
          zero&rdquo;, &ldquo;delete the second spring&rdquo;, &ldquo;undo
          that&rdquo; — the model changes, not a picture of it.
        </li>
        <li>
          <strong>No depth modes.</strong> Unlike Core 3.1 there is no depth to
          set. Logos 2 answers at one depth and puts the effort into the model.
        </li>
      </ul>

      <H2 id="gallery">What you can build</H2>
      <p>
        Every figure below is the same renderer drawing a model the engine
        built and solved, live on this page — there is no saddle component and
        no attractor component. Each caption ends with a sentence that builds
        one like it.
      </p>
      <Gallery />
      <p>
        Three things have a simulation of their own, with a camera and physics
        in three dimensions: a black hole, the expanding universe and an
        orbiting system. Ask for one — &ldquo;generate a black hole&rdquo; —
        and it opens: a Kerr hole with its horizon, photon orbit and innermost
        stable orbit, light traced as real geodesics, and mass, spin, disc and
        rays as controls.
      </p>

      <H2 id="try">Things to ask for</H2>
      <p>
        These land on shapes the engine knows how to build, which makes them
        the reliable ones. Name the thing and, if you have them, the numbers.
      </p>
      <Defs>
        <Def term="Surfaces and shapes">
          &ldquo;Model a saddle, z = a·x² − b·y²&rdquo; · &ldquo;Plot a
          bivariate normal and let me change the correlation&rdquo; ·
          &ldquo;Draw a torus I can reshape&rdquo;
        </Def>
        <Def term="Things that move">
          &ldquo;Model a mass on a spring with damping&rdquo; · &ldquo;Three
          masses joined by springs&rdquo; · &ldquo;Why is a double pendulum
          unpredictable?&rdquo; · &ldquo;Simulate an orbit&rdquo;
        </Def>
        <Def term="Systems over time">
          &ldquo;How does lowering the transmission rate flatten the
          curve?&rdquo; (an SIR epidemic) · &ldquo;Model a driven RLC
          circuit&rdquo; · &ldquo;Show me the Lorenz system&rdquo;
        </Def>
        <Def term="Relationships in data">
          &ldquo;wage = β₀ + β₁·educ + β₂·exper + u — set β₁ to 0.08&rdquo; ·
          &ldquo;Add experience squared&rdquo; · &ldquo;Fit it with unit
          effects&rdquo;
        </Def>
        <Def term="Objects in space">
          &ldquo;Generate a black hole&rdquo; · &ldquo;Simulate the big
          bang&rdquo; · &ldquo;Simulate an orbit&rdquo;
        </Def>
        <Def term="Then, about it">
          &ldquo;Why does the critical point stop being a saddle when b goes
          negative?&rdquo; · &ldquo;What does the damping do to the
          energy?&rdquo; · or select a part and press <em>Ask about this</em>.
        </Def>
      </Defs>
      <Callout tag="What works less well">
        A subject with nothing to compute — &ldquo;model the economy&rdquo;,
        &ldquo;model love&rdquo; — gets a map of the reasoning rather than a
        model. That is the honest result: the engine builds what can be
        written down, and says so when nothing can.
      </Callout>

      <H2 id="features">What you can do with a model</H2>
      <Defs>
        <Def term="Move every control">
          Sliders for each parameter and each free input, with their units —
          &ldquo;stiffness = 20 N/m&rdquo;, &ldquo;educ = 10 years&rdquo;. The
          model is solved again as you drag.
        </Def>
        <Def term="Read it from every side">
          The <em>Understand</em> row lists the views a model supports:
          surface, level sets, cross-section, values, curve, path, phase
          portrait, against time, slope, residuals, coefficients,
          diagnostics, dependencies, sensitivity. Each is the same model, not
          a second drawing of it.
        </Def>
        <Def term="Axes with numbers and units">
          Every axis carries the variable&rsquo;s name and, where the model
          declares one, its unit. 3D views carry round-numbered ticks on the
          cage, so a height can be read rather than guessed.
        </Def>
        <Def term="Ask about any part">
          Select an object and press <em>Ask about this</em>: the answer comes
          from the model — what it is, what it depends on, its value now, and
          whether that value was computed or chosen.
        </Def>
        <Def term="Edit by saying so">
          Change a value, remove or replace a part, add a body, undo, redo,
          duplicate into a branch — all from the conversation. See{' '}
          <a href="#editing">Editing one</a> below.
        </Def>
        <Def term="Edit the map too">
          Right-click any card on the Thinking Map to mark it resolved or
          remove it, or say &ldquo;delete the funding node&rdquo; in the chat.
          What you remove stays removed.
        </Def>
        <Def term="Keep it in a project">
          Lines of thinking sit in the same rail as your chats and can be
          filed into projects.
        </Def>
        <Def term="Save as image">
          <em>Save as image</em>, in the panel head, exports the Thinking Map
          as a picture to share.
        </Def>
      </Defs>

      <H2 id="models">Models you own</H2>
      <p>
        Everything else Socria draws is a picture of an idea. A{' '}
        <strong>model</strong> is different: it is structure the engine has
        validated and computed — objects, controls, equations, a solver — and it
        has a name that survives being changed. Move a control and it is solved
        again. Take a part out and the governing equations are assembled without
        it. Undo, and you get the previous state of the thing rather than the
        previous drawing.
      </p>
      <DemoModelWorkspace />
      <p>
        That figure is the real engine, running in this page. The block hangs on
        a spring with a damper; the parts were assembled into equations of
        motion; a Runge–Kutta integrator solved them; the panels underneath are
        the <em>same run</em> as the motion above, not second drawings of it.
        Drag the stiffness and the integration happens again.
      </p>
      <Defs>
        <Def term="A document, not a picture">
          A model has an id, a title and a stack of revisions. Edit it and it is
          the same model one revision later — which is what makes undo, history
          and branching possible at all.
        </Def>
        <Def term="A revision, not a regeneration">
          Nothing is re-authored when you change something. The structure you
          had is the structure you keep, with the one thing you changed changed.
        </Def>
        <Def term="A branch, not a replacement">
          &ldquo;Duplicate this and make the copy twice as stiff&rdquo; leaves
          the original exactly as it was, and records what the copy came from.
        </Def>
      </Defs>

      <H2 id="onramp">Where a model comes from</H2>
      <p>
        You ask for one in ordinary words — a mass on a spring, three tanks
        draining into each other, an epidemic, a regression on data you have
        given it. What happens next is the part worth knowing, because it is
        what separates a model from a convincing drawing:
      </p>
      <ol>
        <li>
          Socria <strong>proposes</strong> the structure: what the objects are,
          what the controls are, which equations or parts govern it.
        </li>
        <li>
          The <strong>engine</strong> — not the language model — sanitises it,
          checks that every expression resolves, works out what can actually be
          computed, and picks the solver.
        </li>
        <li>
          If it computes, you get a model. If something is missing, you get{' '}
          <em>that</em>, named.
        </li>
      </ol>
      <Callout tag="Socria proposes; the engine builds">
        Socria cannot hand you a computed model directly. It can only propose one,
        and the engine decides. A picture a model drew and a result an engine
        computed must never look the same, so they do not come from the same
        place.
      </Callout>
      <p>
        Everything in a proposal is marked as proposed — &ldquo;Socria suggested
        this and nothing has confirmed it&rdquo; — until you change it. A value
        you chose and a value it chose never read alike.
      </p>

      <H2 id="editing">Editing one</H2>
      <p>
        You edit a model by saying what you want, in the conversation, and the
        change happens to the model rather than to the picture:
      </p>
      <Defs>
        <Def term="“Change this mass to 4 kg.”">
          The parameter moves, everything that depends on it is recomputed, and
          the revision is remembered.
        </Def>
        <Def term="“Delete the second spring.”">
          The spring leaves the model. The equations are assembled again with one
          fewer term, so the motion is genuinely different — not the same motion
          with something hidden.
        </Def>
        <Def term="“Replace this damper with a spring.”">
          A dissipative term becomes a restoring one. The system is rebuilt and
          re-solved.
        </Def>
        <Def term="“Undo that.”">
          Back one revision. Redo goes forward again; it is your history, not a
          re-derivation.
        </Def>
        <Def term="“Duplicate this and make the copy twice as stiff.”">
          A branch under its own name, with the original untouched.
        </Def>
        <Def term="“Delete this model.”">
          It goes.
        </Def>
      </Defs>
      <p>
        Clicking a part works the same way: select the damper and ask what it is,
        and the answer comes from the model — what it is, what it depends on,
        what its number is at this instant, and whether that number was computed
        or chosen.
      </p>

      <H2 id="refuse">When it will not build</H2>
      <p>
        A refusal is a real answer here, and usually a more useful one than a
        picture. There are three kinds, and each says what would fix it.
      </p>
      <DemoRefusal />
      <Defs>
        <Def term="Something is missing">
          A mass with no value, a state with no starting point, a system with no
          rule for how one of its parts changes. The structure is kept and the
          model waits.
        </Def>
        <Def term="Nothing here computes">
          The engine can hold what you described and no solver it has runs it. It
          says so, rather than drawing something that implies otherwise.
        </Def>
        <Def term="The method is yours">
          Ask for a model of data without saying how to estimate it and Socria
          will not pick. You get the candidates, what each one assumes and what
          each one gives — and the choice stays yours, because choosing the
          specification <em>is</em> the work.
        </Def>
      </Defs>

      <H2 id="limits">What it does not do yet</H2>
      <p>
        Said plainly, because the gap between what a product can do and what it
        appears to do is where trust is lost.
      </p>
      <ul>
        <li>
          <strong>Not everything becomes a model.</strong> A curve, a limit, a
          market or a distribution is still drawn as a figure — those are already
          exact and a model of them would be a worse version of the picture.
        </li>
        <li>
          <strong>Mechanisms are one-dimensional.</strong> Bodies on a line, with
          springs, dampers and forces. Pendulums, linkages and anything rotating
          are written as systems of equations instead.
        </li>
        <li>
          <strong>Adding reaches parts, not everything.</strong> You can add a
          body, a spring or a damper. Adding a variable to a fitted model, or a
          column to data, is not there.
        </li>
        <li>
          <strong>Estimation stops at least squares.</strong> Ordinary,
          within-unit and lagged. No instruments, no clustered errors, no tests
          with critical values — and it says so rather than implying otherwise.
        </li>
        <li>
          <strong>Undo is per model.</strong> Undoing a change to the map itself
          is not a thing yet.
        </li>
        <li>
          <strong>Comparison is computed, not yet shown.</strong> Two revisions
          can be compared; nothing puts them side by side on screen.
        </li>
      </ul>

      <H2 id="access">Access and plans</H2>
      <p>
        Logos 2 needs an account. Pick it from the model menu beside the chat
        box; leaving it returns you to whichever Core model you were on. The{' '}
        <em>Try Logos 3</em> invitation beside the chat opens{' '}
        <Link href="/docs/logos-3">Logos 3</Link>, which is everything here
        with a second seat and thinking depth.
      </p>
      <Callout tag="Free, then Socria One">
        Two lines of thinking a month are free. After that, Logos 2 is part of{' '}
        <Link href="/docs/socria-one">Socria One</Link>.
      </Callout>
      <p>
        The conversation, the lenses and the moves on each card are the ones
        the original Logos had — see{' '}
        <Link href="/docs/logos">that page</Link> and{' '}
        <Link href="/docs/thinking-map">the Thinking Map</Link>. What is stored,
        and where, is on{' '}
        <Link href="/docs/accounts-data">accounts and data</Link>.
      </p>
    </Article>
  );
}
