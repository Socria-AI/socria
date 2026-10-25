// Scenarios, each matched to the part of Logos 5 that fits it. This page
// sells nothing; it routes people to the right part of the product. There is
// one model now, so the question is no longer which model but which view.

import Link from 'next/link';
import { Article, H2, Callout } from '../Article';
import { docPage } from '../registry';

const page = docPage('use-cases')!;
const sections = [
  { id: 'deciding', heading: 'Making a decision' },
  { id: 'learning', heading: 'Learning something' },
  { id: 'math', heading: 'Working through math' },
  { id: 'systems', heading: 'Building a model of something' },
  { id: 'writing', heading: 'Writing something that matters' },
  { id: 'research', heading: 'Testing an idea against evidence' },
  { id: 'quick', heading: 'Just thinking out loud' },
];

export function UseCases() {
  return (
    <Article page={page} sections={sections}>
      <p>
        Socria is one model, <Link href="/docs/logos-5">Logos 5</Link>, so the
        practical question is less <em>"which one"</em> than <em>"where in it
        does this happen."</em> Everything starts as a conversation; the views
        beside it open when what you asked for lives there. These are the
        shapes of use the product was actually built around.
      </p>

      <H2 id="deciding">Making a decision</H2>
      <p>
        <strong>Talk it through, then open the Logic Map.</strong> A decision
        is exactly the kind of thinking that benefits from being seen: the
        reasons, the assumptions holding them together, and the tensions
        between them. Ask for the structure — &ldquo;what does this rest
        on?&rdquo; — and the <Link href="/docs/thinking-map">Thinking Map</Link>{' '}
        draws it beside the conversation — when two of your own reasons pull
        against each other, the map shows the conflict as a drawn edge rather
        than letting it hide in prose. Weighing options? Ask for a comparison
        and it is made from your own words. The call stays yours: &ldquo;you
        decide&rdquo; gets Socria&rsquo;s view, marked as one.
      </p>
      <p>
        When a claim looks load-bearing, click it: <strong>Challenge</strong>{' '}
        lists the concrete ways it could be wrong, <strong>Trace</strong> shows
        where it entered the conversation — quoting you verbatim — and{' '}
        <strong>Research</strong> checks it against real sources. None of them
        hands you a verdict; each ends on a question that is yours to answer.
      </p>

      <H2 id="learning">Learning something</H2>
      <p>
        <strong>Drop your files on the Universal Map&rsquo;s box.</strong> Say
        what for, and they are sorted into topics in their own words, every
        quote with its page; ask for practice and it is made from them and
        checked when you submit. Say you want to work the problems out
        yourself and Socria holds the answers back from then on — saying so
        once, and saying what you can have instead. When the learning is
        mathematical, the{' '}
        <Link href="/docs/mathematics">Answer Guard</Link> also arms: from
        then on Socria guides instead of solving — hints and next-step
        questions — and the result stays masked on every surface until{' '}
        <em>you</em> reach it, or until you choose &ldquo;Show
        solution,&rdquo; which is always available and never paid.
      </p>
      <Callout tag="Why the guard exists">
        <p>
          Being handed an answer and learning something are different events
          that look identical in a chat log. The guard keeps them distinct.
        </p>
      </Callout>

      <H2 id="math">Working through math</H2>
      <p>
        <strong>Ask in Chat; open the Logic Map for the working.</strong>{' '}
        A derivative, integral, limit or root you ask for is computed by the
        engine rather than recalled, and your own steps are checked against
        it. On the map, givens, unknowns, equation steps, mistakes and results
        become typed nodes with real LaTeX, and three extra lenses
        appear — the <strong>Solution</strong> chain, which follows the work
        step by step and leads the view; the <strong>Board</strong>, which
        lays it out like a hand-written scratch page (mistakes struck through
        with the fix beside them, never erased); and a{' '}
        <strong>function plot</strong> when there is something to graph.
        This carries from school algebra through college work — integration
        by parts and hypothesis tests chain the same way. Details and live
        examples on the <Link href="/docs/mathematics">Mathematics</Link>{' '}
        page.
      </p>

      <H2 id="systems">Building a model of something</H2>
      <p>
        <strong>Say what it is; it lands in Artifacts.</strong> When what you
        are thinking about is a <em>system</em> — a shape, something that
        moves, quantities that change over time, a relationship in data — say
        so in a sentence and the engine builds a model of it beside the
        conversation: controls you can drag, axes with numbers and units, and
        a row of views that read the same model different ways.
      </p>
      <ul>
        <li>
          <strong>Studying calculus or physics:</strong> &ldquo;Model a saddle,
          z = a·x² − b·y²&rdquo;, &ldquo;Model a mass on a spring with
          damping&rdquo;, &ldquo;Why is a double pendulum
          unpredictable?&rdquo;
        </li>
        <li>
          <strong>Economics and econometrics:</strong> &ldquo;wage = β₀ +
          β₁·educ + β₂·exper + u&rdquo; — then read the slope in $/hour per
          year, the residuals and the coefficients.
        </li>
        <li>
          <strong>Epidemics, circuits, chaos:</strong> &ldquo;How does lowering
          the transmission rate flatten the curve?&rdquo;, &ldquo;Model a
          driven RLC circuit&rdquo;, &ldquo;Show me the Lorenz system&rdquo;.
        </li>
        <li>
          <strong>Objects in space:</strong> &ldquo;Generate a black
          hole&rdquo;, &ldquo;Simulate the big bang&rdquo;, &ldquo;Simulate an
          orbit&rdquo;.
        </li>
      </ul>
      <p>
        Then change it by saying so — &ldquo;make the damping zero&rdquo;,
        &ldquo;undo that&rdquo; — or select a part and ask about it. Pictures
        of each, and more to ask for, are on the{' '}
        <Link href="/docs/logos-2#gallery">Logos 2 page</Link>, where they
        began, and on <Link href="/docs/logos-3-engineering">Engineering</Link>{' '}
        and <Link href="/docs/logos-3-dynamics">Dynamics and chaos</Link>.
      </p>

      <H2 id="writing">Writing something that matters</H2>
      <p>
        <strong>Think it through, then open{' '}
        <Link href="/docs/drafts-grounding">Write</Link>.</strong>{' '}
        Brain-dump ideas as notes, sort them into piles that will each be a
        paragraph, link them to the passages of your files and the ideas on
        your map, then turn them into an outline and write. The page is
        yours: Socria checks, improves or thinks it through with you only
        when you ask, and every proposed edit is yours to accept or reject,
        one at a time. A practical piece you simply want written — an email,
        a note to a landlord — Socria will write as a draft you edit in
        place.
      </p>

      <H2 id="research">Testing an idea against evidence</H2>
      <p>
        <strong>Ask, or use Research on a map node.</strong> A question that
        needs current information is looked up, and the reply cites only the
        sources it actually had. Research on a node searches the live web,
        reads what it finds, and returns the evidence with sources listed —
        distinguishing what it actually cites from what it merely found. If no
        source supports a claim, it says so rather than inventing a citation.
        You can also ground a node in your own material — paste it, upload it,
        or point at a page — via <strong>Add context</strong>.
      </p>

      <H2 id="quick">Just thinking out loud</H2>
      <p>
        <strong>Just talk.</strong> A conversation that needs none of the
        workspace is just a conversation: a hello is answered as a hello, a
        joke as a joke, something hard as something hard — no tasks
        suggested, no lesson begun. If the thinking starts to sprawl, ask for
        the structure and the Logic Map draws it; everything you talk through
        stays on your Universal Map, where you can come back to it. Long,
        consequential work — a decision that runs for weeks, a piece of
        research — is the same conversation: what you have said holds across
        it, so you are not asked again.
      </p>
    </Article>
  );
}
