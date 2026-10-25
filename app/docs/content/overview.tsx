// The front door: what Socria is, in the product's own terms, and a map of
// the docs themselves. Socria is one model now — Logos 5 — and the count is
// held to the menu by test/docs-wiki.test.mjs.

import Link from 'next/link';
import { Article, H2, Callout } from '../Article';
import { DemoSplit } from '../demos';
import { ARCHIVE_DATE, DOC_PAGES, docPage } from '../registry';
import { priceWithPeriod } from '@/lib/socria-one';
import { PLANS } from '@/lib/entitlements';

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
        it — it does the mechanical work readily, shows you what your view
        rests on, and leaves the decisions and the substance of your work
        with you.
      </p>
      <p>
        That stance is called <strong>Human-First AI</strong>, and it is not a
        tone of voice — it is enforced in the product. Which part of a turn is
        yours is decided in code from what you have said, and anything held
        back is held back only for a reason you gave, in your own words, with
        what you can have instead. The map draws <em>your</em> claims, not its
        verdicts. And your writing stays yours: Socria never writes into it, and
        an edit it proposes lands on the page only if you accept it.
      </p>

      <H2 id="shape">The shape of the product</H2>
      <p>
        Socria is one model, <Link href="/docs/logos-5">Logos 5</Link>, at{' '}
        <code>socria.app/chat</code>. You arrive on the Universal Map — every
        conversation you have had, on one map — and a conversation opens on
        Chat, with three more views beside it for when there is something to
        show: Content for your files, Artifacts for what is made, and the
        Logic Map, the <Link href="/docs/thinking-map">Thinking Map</Link> of
        the conversation, which looks like this:
      </p>
      <DemoSplit />
      <p>
        Inside it is what the earlier models built, put together:{' '}
        <Link href="/docs/core-4">Core 4</Link>&rsquo;s decision about whose
        work is whose; the map from the original{' '}
        <Link href="/docs/logos">Logos</Link>; the models{' '}
        <Link href="/docs/logos-2">Logos 2</Link> let you move and undo;
        designs in 3D, everyday displays and documents read and cited from{' '}
        <Link href="/docs/logos-3">Logos 3</Link> and{' '}
        <Link href="/docs/logos-3-5">3.5</Link>; and a word processor for your
        own writing. The Core models and Logos 2 were archived on{' '}
        {ARCHIVE_DATE}; every conversation you had with them opens in Logos 5,
        and <Link href="/docs/history">the history</Link> tells how each one
        led to the next.
      </p>
      <p>
        Logos 5 is free to start with an account, and it is the centerpiece of{' '}
        <Link href="/docs/socria-one">Socria One</Link>, the{' '}
        {priceWithPeriod()} plan. Its free tier is not a trial but Logos 5
        itself, counted — {PLANS.free.counters.chats} lines of thinking a
        month and {PLANS.free.counters.messages} messages a day: what Socria
        One sells is how much a day and a month can hold, and what is carried
        between conversations, never a better version of any one of them.
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
          <strong>Authorship.</strong> Your conclusions are yours. Socria
          contributes, challenges and connects; it does not decide for you, and
          it does not write the substance of your work for you — and in your
          own writing its edits are proposals you accept or reject one at a
          time.
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
          <strong>Nothing held hostage.</strong> Reaching a free limit — the
          day&rsquo;s chats or messages, or the month&rsquo;s lines of thinking
          — pauses only what is new; it never hides, deletes, or locks what you
          have already thought. Your existing maps stay visible and
          interactive, the conversations you have begun stay open, and the
          day&rsquo;s allowance comes back tomorrow.
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
