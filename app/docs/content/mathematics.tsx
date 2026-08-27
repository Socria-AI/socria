// Mathematics: math maps, the Board, the plot, the evaluator, the guard.
// Checkable against lib/logos-math.ts, lib/logos-guidance.ts,
// components/MathBoard.tsx and components/MathPlot.tsx.

import Link from 'next/link';
import { Article, H2, Callout, Defs, Def } from '../Article';
import { DemoBoard, DemoGuard } from '@/app/logos/LogosDemo';
import { DemoCollege, DemoPlot } from '../DocsDemo';
import { docPage } from '../registry';

const page = docPage('mathematics')!;
const sections = [
  { id: 'maps', heading: 'A map of the work' },
  { id: 'intents', heading: 'Four kinds of math moment' },
  { id: 'board', heading: 'The Board' },
  { id: 'plot', heading: 'The function plot' },
  { id: 'college', heading: 'Calculus, statistics, and beyond' },
  { id: 'guard', heading: 'The Answer Guard' },
];

export function Mathematics() {
  return (
    <Article page={page} sections={sections}>
      <p>
        When the conversation turns quantitative, Logos stops drawing a
        mind-map <em>about</em> the problem and starts drawing a map of{' '}
        <em>the work</em>: each state of the expression is a node, each
        operation an edge with the move written on it —{' '}
        <code>−6 both sides</code>, <code>factor</code> — so the solution
        reads as a chain. Math is written in real LaTeX everywhere it
        appears: the chat, the map, the Board, the node panels, the drafts.
      </p>

      <H2 id="maps">A map of the work</H2>
      <p>
        Eleven node types exist for this — givens, unknowns, equations,
        definitions, transformations, theorems, steps, inferences,
        verifications, results, and errors — with proofs chaining on{' '}
        <code>implies</code> and a theorem attaching to the step it licenses
        via <code>justifies</code>.
      </p>
      <Callout tag="Errors are the point">
        <p>
          If your work diverges, Logos does not replace it with a correct
          chain. Your steps are kept; the <em>first</em> wrong one is flagged,
          with the specific mistake and how to repair it — and never a step it
          would merely have done differently. Confirmed steps can earn a
          verified mark.
        </p>
      </Callout>

      <H2 id="intents">Four kinds of math moment</H2>
      <p>
        The map also reads <em>why</em> the math is happening, because the
        right behavior differs:
      </p>
      <Defs>
        <Def term="Learning">
          You are working a problem to understand it. The Answer Guard engages
          — guidance toward the next step, never the full worked solution.
        </Def>
        <Def term="Verification">
          You did the work and want it checked. Logos finds the first step
          where it diverged, names exactly what went wrong there, and helps
          you repair that step — it never silently rewrites.
        </Def>
        <Def term="Utility">
          A quick calculation where teaching would be friction —
          &ldquo;what&rsquo;s 18% of 340&rdquo;. It just computes it,
          plainly. No Socratic detour.
        </Def>
        <Def term="Exploration">
          Understanding a concept rather than solving an assigned problem. It
          explains, and describes functions so they can be seen.
        </Def>
      </Defs>
      <p>
        The goal is never to withhold an answer artificially — only to avoid
        replacing reasoning you are trying to build. When in doubt between
        learning and utility, Logos assumes learning if a specific problem is
        being worked.
      </p>

      <H2 id="board">The Board</H2>
      <p>
        The Board renders the same map as a worked-through notebook page:
        equations in a serif math face, operations and asides in a
        handwritten one, givens tagged <em>given</em> and unknowns tagged{' '}
        <em>find</em> across the top, the chain flowing down the page with
        hand-drawn arrows, theorems as margin notes beside the step they
        justify. Mistakes are struck through in rust with the fix written
        beneath — never erased — the result gets a hand-drawn box, and
        verified steps a handwritten check.
      </p>
      <p>
        Every wobble and tilt is seeded from the node&rsquo;s own id, so the
        board looks hand-made but never jitters between renders. Watch it
        work the demo problem — the sign slip goes down, stays down, and the
        fix arrives beside it:
      </p>
      <DemoBoard />


      <H2 id="plot">The function plot</H2>
      <p>
        When the map holds something graphable, the Plot lens draws it — up
        to four curves with a KaTeX legend. What counts as graphable is
        deliberately narrow: a single-variable expression with an actual
        operation in it (a bare <code>x</code> or <code>42</code> is not a
        curve), never an error node (a wrong line does not get drawn), and
        implicit multiplication like <code>2x</code> or <code>x sin(x)</code>{' '}
        is understood.
      </p>
      <Callout tag="Sandboxed by construction">
        <p>
          Expressions are parsed by a hand-written evaluator with a whitelist
          grammar — twenty functions, three constants, one variable — not by{' '}
          <code>eval()</code>. A hostile string can compute a NaN; it cannot
          run code. Asymptotes render as pen-up gaps rather than spikes.
        </p>
      </Callout>
      <DemoPlot />

      <H2 id="college">Calculus, statistics, and beyond</H2>
      <p>
        The quadratic above is deliberately small — but nothing about the
        machinery is tied to school algebra. The map&rsquo;s mathematical
        vocabulary is domain-agnostic: the same eleven node types and the
        same chain edges carry college work unchanged.
      </p>
      <ul>
        <li>
          <strong>Calculus</strong> — a derivative or an integral is a chain
          like any other, each state becoming the next with the move written
          on the edge: <em>pick u and dv</em>, <em>apply the rule</em>,{' '}
          <em>differentiate to check</em>. The rule you invoked — by parts,
          the chain rule, a known limit — attaches to the step it licenses as
          a theorem in the margin, and the Plot lens graphs whatever function
          the work holds.
        </li>
        <li>
          <strong>Statistics</strong> — a hypothesis test maps its sample and
          its H&#8320; as givens, the question as the unknown, the
          t-statistic as the theorem justifying the standardizing step, and
          the verdict as the result. Confidence intervals and regressions
          take the same shape.
        </li>
        <li>
          <strong>Proofs and logic</strong> — proof steps chain on{' '}
          <code>implies</code> rather than <code>transforms_to</code>, with
          inference nodes for the deductions.
        </li>
        <li>
          <strong>Linear algebra and the rest</strong> — row operations,
          substitutions, unit conversions: anywhere the work is a sequence of
          justified moves, the map is a map of the work.
        </li>
      </ul>
      <p>
        Two of those, on the real Board — including calculus&rsquo;s most
        classic mistake, kept and repaired in place:
      </p>
      <DemoCollege />
      <p>
        Everything on this page applies at every level: the intents read the
        same way (a problem set being checked is <em>verification</em>; a
        concept being explored is <em>exploration</em>), and the{' '}
        <Link href="#guard">Answer Guard</Link> arms for learning-intent work
        whether the problem is a quadratic or an integral.
      </p>

      <H2 id="guard">The Answer Guard</H2>
      <p>
        The guard arms on one condition: the work is math <em>and</em> the
        intent is learning. Verification, utility and exploration are never
        guarded — those answers are what you asked for.
      </p>
      <p>
        While armed, it is <strong>one shared state across every
        surface</strong>, so the chat cannot withhold an answer that the map,
        the Board, or a node panel quietly reveals. The chat behaves like an
        excellent lab instructor, climbing a six-rung ladder one rung at a
        time — observe, nudge, concept hint, specific hint, one minimal
        partial step, and only then the full solution. Pushed with
        &ldquo;just tell me&rdquo;, it gives the next-smallest hint and
        mentions the reveal button; it does not lecture, and it does not
        cave. On the map and the Board, the result and any verification of it
        are masked as <code>= ?</code> — the working stays visible, because
        the working is yours. The plot still draws your curve faithfully — and it
        never annotates roots, intercepts or extrema with their values, so it
        can never become the surface that hands over what the chat is
        withholding.
      </p>
      <p>
        The bar under the chat says what is happening —{' '}
        <em>&ldquo;Guiding, not solving — you&rsquo;re working this one
        out&rdquo;</em> — with two buttons: <strong>Another hint</strong>, and{' '}
        <strong>Show solution</strong>, which lifts the guard for that
        conversation and regenerates every surface with the results unmasked.
        The reveal is per-conversation, remembered, and{' '}
        <Link href="/docs/socria-one">never priced</Link>.
      </p>
      <DemoGuard />

    </Article>
  );
}
