// The front door: what Socria is, in the product's own terms, and a map of
// the docs themselves.

import Link from 'next/link';
import { Article, H2, Callout } from '../Article';
import { DemoSplit } from '@/app/logos/LogosDemo';
import { DOC_PAGES, docPage } from '../registry';

const page = docPage('overview')!;
const sections = [
  { id: 'idea', heading: 'The idea' },
  { id: 'shape', heading: 'The shape of the product' },
  { id: 'principles', heading: 'What never changes' },
  { id: 'map', heading: 'Where to go' },
];

export function Overview() {
  return (
    <Article page={page} sections={sections}>
      <H2 id="idea">The idea</H2>
      <p>
        Socria is built on a single conviction: <strong>the thinking should stay
        yours.</strong> Most AI products optimize for producing your answer.
        Socria optimizes for the quality of your own reasoning on the way to
        it — it asks before it answers, it notices the
        assumptions in your wording, and when you are working a math problem
        to learn it, it will guide you to the result rather than hand it
        over.
      </p>
      <p>
        That stance is called <strong>Human-First AI</strong>, and it is not a
        tone of voice — it is enforced in the product. In Core 3.1 and
        Logos, questions are earned, never reflexive; conclusions stay yours
        everywhere. The map draws <em>your</em> claims, not its verdicts. And
        even Draft Space — the one surface built for prose — starts blank and
        stays yours: Socria offers rewordings of passages you wrote, and they
        land on the page only if you apply them.
      </p>

      <H2 id="shape">The shape of the product</H2>
      <p>
        Everything lives at one address — <code>socria.app/chat</code> — behind
        one model switcher. This is what the fullest of the three looks like:
        the conversation on the left, a map of the thinking it produced on the
        right, kept in step with each other.
      </p>
      <DemoSplit />
      <p>Three models share that address:</p>
      <ul>
        <li>
          <strong><Link href="/docs/core-2">Core 2</Link></strong> — calm,
          restrained Socratic questioning in plain prose. Free, works without
          an account.
        </li>
        <li>
          <strong><Link href="/docs/core-3">Core 3.1</Link></strong> — the
          conversation that remembers: thread memory, periodic syntheses of
          what you have worked out, and a running model of how you think.
        </li>
        <li>
          <strong><Link href="/docs/logos">Logos</Link></strong> — the full
          reasoning environment. The conversation runs beside a live{' '}
          <Link href="/docs/thinking-map">Thinking Map</Link> that draws your
          claims, assumptions, tensions and evidence as you talk, with{' '}
          <Link href="/docs/mathematics">mathematics support</Link>, a{' '}
          <Link href="/docs/drafts-grounding">Draft Space</Link>, and research
          grounded in real sources.
        </li>
      </ul>
      <p>
        Core 2 and Core 3.1 are chat models with different depths of attention.
        Logos is a different kind of thing — an environment — and it is the
        centerpiece of <Link href="/docs/socria-one">Socria One</Link>, the
        $15/month plan. Its free tier is a real trial: the whole loop, with
        boundaries rather than walls.
      </p>

      <H2 id="principles">What never changes</H2>
      <Callout tag="Protected principles">
        <p>
          Four things hold at every tier, every depth, and every personality
          setting — they sit above all configuration and cannot be paid to go
          away, or paid to come back:
        </p>
      </Callout>
      <ul>
        <li>
          <strong>Authorship.</strong> Your conclusions are yours. Socria asks,
          reflects, challenges and connects; it does not decide for you, and
          it does not write for you — even in Draft Space, where its Refine
          suggestions are proposals that land only if you apply them yourself.
        </li>
        <li>
          <strong>The Answer Guard.</strong> While you are learning
          mathematics — working a problem to understand it — Socria will not
          hand you the result: not in the chat, not on the map, not on the
          Board. The door out (revealing the solution) is always yours to
          open, and it is never priced.
        </li>
        <li>
          <strong>Transparency.</strong> You can always see where a thought on
          the map came from — the Trace move quotes you verbatim — and always
          tell Socria it read you wrong. Neither is ever gated.
        </li>
        <li>
          <strong>Nothing held hostage.</strong> Hitting a free-tier limit stops
          new growth; it never hides, deletes, or locks what you have already
          thought. Your existing maps stay visible and interactive.
        </li>
      </ul>

      <H2 id="map">Where to go</H2>
      <div className="d-cards">
        {DOC_PAGES.filter((p) => p.slug !== 'overview').map((p) => (
          <Link key={p.slug} href={`/docs/${p.slug}`} className="d-card">
            <span className="t">{p.title}</span>
            <span className="b">{p.blurb}</span>
          </Link>
        ))}
      </div>
    </Article>
  );
}
