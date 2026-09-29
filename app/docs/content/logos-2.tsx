// Socria Logos 2 — the two-seat room, and the model workspace.
//
// TWO THINGS EARNED THIS PAGE, and the second is the newer one. Logos 2 began
// as the room with a second seat, and for a while a page would have been four
// paragraphs of "the same as Logos, with somebody else in it" — which is why
// the comparison table said it was deliberately absent. What changed is that a
// MODEL became a thing the person owns: built by the engine rather than drawn by
// a language model, with an id that survives being edited, revisions, undo and
// branches. That is not "Logos with a second seat"; it is a different kind of
// object in the workspace, and it needs saying.
//
// The figures are the real components — the map a two-seat room produces, and a
// model that goes through the same on-ramp a conversation's proposal does.

import Link from 'next/link';
import { Article, H2, Callout, Defs, Def } from '../Article';
import { DemoModelWorkspace, DemoRefusal, DemoTwoSeats } from '../DocsDemo';
import { docPage } from '../registry';

const page = docPage('logos-2')!;
const sections = [
  { id: 'two', heading: 'Two people, one map' },
  { id: 'between', heading: 'What Socria does between you' },
  { id: 'models', heading: 'Models you own' },
  { id: 'onramp', heading: 'Where a model comes from' },
  { id: 'editing', heading: 'Editing one' },
  { id: 'refuse', heading: 'When it will not build' },
  { id: 'limits', heading: 'What it does not do yet' },
];

export function Logos2() {
  return (
    <Article page={page} sections={sections}>
      <p>
        Logos 2 is the same surface as{' '}
        <Link href="/docs/logos">Logos</Link> — the conversation and the{' '}
        <Link href="/docs/thinking-map">Thinking Map</Link>, side by side — with
        two things added. A second seat, so two people can think in one
        workspace. And a <em>model workspace</em>: structured, computed objects
        that you own, edit and undo, rather than pictures that are generated
        again each time you ask for a change.
      </p>

      <H2 id="two">Two people, one map</H2>
      <p>
        Share a line of thinking and the other person arrives in the same room,
        not a copy of it. You both talk to Socria; you both see the map take
        shape; and every node it draws carries <em>whose thought it was</em>.
        The colours are seats rather than people — host and guest — so the map
        stays readable when neither of you is reading your own name.
      </p>
      <DemoTwoSeats />
      <p>
        The map is the shared object: one extraction, sent to both of you, so
        there is never a moment where your structure and theirs have quietly
        diverged. Sessions, lenses, the four moves on a node and everything else
        on the Logos page work exactly as they do alone.
      </p>

      <H2 id="between">What Socria does between you</H2>
      <p>
        With two people in the room Socria becomes the layer between them, and
        the boundary tightens rather than loosens. It names things neither of you
        has said out loud: where your reasoning connects, where it{' '}
        <em>disagrees</em>, what each of you is assuming, and which question is
        still open for both. It does not take a side, does not pick a winner and
        does not conclude on your behalf.
      </p>
      <Callout tag="A disagreement is not a fault">
        A disagreement between two people is not a problem for Socria to solve.
        It is usually the most useful thing in the room, and the job is to make
        it precise — not to resolve it while you are both watching.
      </Callout>

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
      <Callout tag="Getting to it">
        Logos 2 needs an account, and the two-seat room needs both people signed
        in. Everything on this page is the same surface as Logos — see{' '}
        <Link href="/docs/logos">that page</Link> for the conversation, the
        lenses and the moves, and{' '}
        <Link href="/docs/accounts-data">accounts and data</Link> for what is
        stored.
      </Callout>
    </Article>
  );
}
