// Economics: the three diagrams a first course is mostly made of.
// Checkable against lib/logos-econ.ts and the three builders in
// lib/logos-viz.ts. Every figure is live — see the note in mathematics.tsx.

import Link from 'next/link';
import { Article, H2, Callout, Defs, Def } from '../Article';
import { DemoAdAs, DemoCeiling, DemoMarket, DemoPpc } from '../DocsDemo';
import { docPage } from '../registry';

const page = docPage('economics')!;
const sections = [
  { id: 'why', heading: 'Why economics is drawings' },
  { id: 'market', heading: 'Supply and demand' },
  { id: 'controls', heading: 'Price controls and surplus' },
  { id: 'ppc', heading: 'Opportunity cost and the frontier' },
  { id: 'macro', heading: 'AD, SRAS and potential output' },
  { id: 'limits', heading: 'What these models do not say' },
];

export function Economics() {
  return (
    <Article page={page} sections={sections}>
      <p>
        Introductory micro and macro — AP, or a first college course — is
        taught almost entirely through a handful of pictures. Logos draws
        them, and draws them as <em>instruments</em>: the curves are described
        by their intercepts and slopes, the crossing is computed rather than
        placed, and the sliders move real curves rather than replaying an
        animation.
      </p>

      <H2 id="why">Why economics is drawings</H2>
      <p>
        Every one of these diagrams answers a question of the form{' '}
        <em>what happens to this when that moves</em>. On paper that means
        redrawing the whole figure, carefully, and hoping you moved the right
        curve. It is the redrawing — not the concept — that most of the
        difficulty lives in.
      </p>
      <Callout tag="One convention, taken from the textbook">
        <p>
          Price sits on the vertical axis and quantity on the horizontal,
          which is backwards from the way an economist would write the
          function and is the way every course draws it. So a &ldquo;demand
          curve&rdquo; here is <code>P = intercept + slope·Q</code>, with the
          slope negative. The drawing is the thing being taught, so the
          drawing&rsquo;s convention wins.
        </p>
      </Callout>

      <H2 id="market">Supply and demand</H2>
      <p>
        Two curves and the one price at which the amount wanted and the amount
        offered are the same number. Drag <strong>ΔD</strong> or{' '}
        <strong>ΔS</strong> and watch which way the crossing travels — the
        original curve stays behind as a dashed ghost so a shift reads as a
        shift rather than as a different diagram:
      </p>
      <DemoMarket />
      <p>
        The thing worth doing here is the one the exam asks for. A rise in
        demand pushes price and quantity <em>the same way</em>; a rise in
        supply pushes them <em>opposite ways</em>. That difference is how you
        work out which curve moved when you are only told what happened to the
        price — and it is much easier to keep hold of once you have watched it
        than once you have read it.
      </p>
      <Callout tag="A slider that means what it says">
        <p>
          Increasing supply moves the curve down and to the right, which
          lowers its intercept. Left to the arithmetic, a slider marked
          &ldquo;more supply&rdquo; would therefore have to be dragged
          left. It is not: the sign is flipped so that pushing the supply
          control up puts more on the market, which is what the label
          promises.
        </p>
      </Callout>

      <H2 id="controls">Price controls and surplus</H2>
      <p>
        Add a ceiling or a floor and the diagram gains the parts a welfare
        question needs: how much buyers want at that price, how much sellers
        offer, and — the part students reliably get backwards — which of those
        two numbers actually trades.
      </p>
      <DemoCeiling />
      <Defs>
        <Def term="The short side decides">
          Nobody can be made to buy or sell, so whichever side wants less sets
          the quantity that changes hands. Under a binding ceiling that is the
          sellers; under a floor, the buyers.
        </Def>
        <Def term="Binding or not">
          A ceiling above the market price does nothing at all, and so does a
          floor below it. Move the control price through the crossing and
          watch the gap open and close — that is the whole of the distinction.
        </Def>
        <Def term="Deadweight loss">
          Surplus that simply is not created, because trades both sides would
          have agreed to are no longer allowed to happen. It is shaded where
          it is, between the two curves and out to the quantity that was lost.
        </Def>
      </Defs>

      <H2 id="ppc">Opportunity cost and the frontier</H2>
      <p>
        The production possibilities curve is opportunity cost made into a
        picture. The frontier is what you can have; its <em>steepness</em> is
        what the next unit costs — and on a bowed frontier that cost climbs as
        you specialise, which is the only thing the bow means.
      </p>
      <DemoPpc />
      <p>
        Slide from one end to the other. The first unit of the first good is
        nearly free, because the resources moved across are the ones worst
        suited to what they were doing; the last few cost enormous amounts,
        because by then you are moving the resources that were best at the
        other job. Set the frontier straight instead and the cost is the same
        everywhere — resources equally good at both jobs, which is the special
        case rather than the usual one.
      </p>
      <p>
        The other two points on the figure are the ones the curve exists to
        rule on. Inside it is attainable and wasteful — unemployment, or
        resources in the wrong place. Outside is unattainable, and stays that
        way until the frontier itself moves, which is what the growth control
        does.
      </p>

      <H2 id="macro">AD, SRAS and potential output</H2>
      <p>
        The macro picture is the same crossing with one addition that changes
        what the diagram is <em>for</em>: a vertical line at potential output.
        Every equilibrium is then read as a distance from that line rather
        than on its own terms.
      </p>
      <DemoAdAs />
      <p>
        Below potential is a <strong>recessionary gap</strong> — the economy
        is capable of more than it is producing. Above it is an{' '}
        <strong>inflationary gap</strong>, which is not a better economy but
        one running hotter than it can sustain. LRAS does not move when demand
        does, and watching it stay put while everything else slides is most of
        the intuition for why demand-side policy has limits.
      </p>

      <H2 id="limits">What these models do not say</H2>
      <p>
        These are the introductory models, and being honest about their
        edges is part of teaching them:
      </p>
      <ul>
        <li>
          <strong>The curves are straight.</strong> Real demand is not linear,
          and elasticity varies along a real curve. At this level the algebra
          has to stay out of the way of the idea, and a straight demand curve
          is the model rather than an approximation of it.
        </li>
        <li>
          <strong>Nothing here is estimated.</strong> The numbers are the ones
          you or Logos put in. A diagram showing a shortage of 30 is showing
          what <em>this</em> model implies, not a claim about any real market.
        </li>
        <li>
          <strong>Welfare is not the whole argument.</strong> Deadweight loss
          measures surplus, and surplus is not the same thing as fairness or
          as who bears the cost. A binding ceiling can destroy surplus and
          still be the policy someone argues for, on grounds this diagram does
          not draw.
        </li>
      </ul>
      <p>
        The <Link href="/docs/mathematics#guard">Answer Guard</Link> reaches
        these scenes like any other: when the work is learning rather than
        checking, the equilibrium price and quantity are withheld and the
        curves are drawn anyway, with a question instead of a number.
      </p>
    </Article>
  );
}
