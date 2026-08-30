// Scenarios, each matched to the model and settings that fit it. This page
// sells nothing; it routes people to the right part of the product.

import Link from 'next/link';
import { Article, H2, Callout } from '../Article';
import { docPage } from '../registry';

const page = docPage('use-cases')!;
const sections = [
  { id: 'deciding', heading: 'Making a decision' },
  { id: 'learning', heading: 'Learning something' },
  { id: 'math', heading: 'Working through math' },
  { id: 'writing', heading: 'Writing something that matters' },
  { id: 'research', heading: 'Testing an idea against evidence' },
  { id: 'quick', heading: 'Just thinking out loud' },
];

export function UseCases() {
  return (
    <Article page={page} sections={sections}>
      <p>
        Socria is one product with three registers, so the practical question
        is less <em>"what can it do"</em> than <em>"which surface fits this
        moment."</em> These are the shapes of use the product was actually
        built around.
      </p>

      <H2 id="deciding">Making a decision</H2>
      <p>
        <strong>Use Logos.</strong> A decision is exactly the kind of thinking
        that benefits from being seen: the reasons, the assumptions holding
        them together, and the tensions between them. Talk the decision
        through and the <Link href="/docs/thinking-map">Thinking Map</Link>{' '}
        draws it live — when two of your own reasons pull against each other,
        the map shows the conflict as a drawn edge rather than letting it hide
        in prose.
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
        <strong>Use Logos.</strong> Say you are studying, or ask to be
        taught, and the map turns to concepts and misconceptions as you build
        them. When the learning is mathematical, the{' '}
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
        <strong>Use Logos.</strong> When the conversation turns mathematical,
        the map does too: givens, unknowns, equation steps, mistakes and
        results become typed nodes with real LaTeX, and three extra lenses
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

      <H2 id="writing">Writing something that matters</H2>
      <p>
        <strong>Think in Logos, then open{' '}
        <Link href="/docs/drafts-grounding">Draft Space</Link>.</strong> Draft
        Space is the one surface built for prose — and you write it. The page
        starts blank, with your map alongside lighting the reasoning each
        paragraph rests on. Select any passage and five actions return
        something to read — Refine offers a clearer wording you can take or
        leave — while the thinking stays upstream on the map, where it can
        still be challenged.
      </p>

      <H2 id="research">Testing an idea against evidence</H2>
      <p>
        <strong>Use Research on a map node.</strong> It searches the live web,
        reads what it finds, and returns the evidence with sources listed —
        distinguishing what it actually cites from what it merely found. If no
        source supports a claim, it says so rather than inventing a citation.
        You can also ground a node in your own material — paste it, upload it,
        or point at a page — via <strong>Add context</strong>.
      </p>

      <H2 id="quick">Just thinking out loud</H2>
      <p>
        <strong>Core 2</strong> if you want a calm question-asker with no
        machinery at all — it works signed out, free.{' '}
        <strong>Core 3.1</strong> if the thread is one you will come back to:
        it holds memory across the conversation, periodically synthesizes what
        you have worked out, and keeps a running picture of how you tend to
        think. Either way, if the thinking starts to sprawl, open Logos and give
        it a line of thinking of its own — chat and Logos sessions sit in one
        list, interleaved by when you last touched them, whichever model made
        them.
      </p>
    </Article>
  );
}
