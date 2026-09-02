// The money page. Everything here is a statement about the shipped
// entitlement code, so it can be checked against lib/socria-one.ts,
// lib/entitlements.ts, lib/subscriptions.ts and the stripe routes.
//
// The plan table is GENERATED from lib/entitlements rather than typed out.
// The hand-written one it replaced claimed a free map holds 4 nodes when it
// holds 8, and listed one of the seven counters. A number written down twice
// goes stale; this one cannot.

import Link from 'next/link';
import { Article, H2, Callout, Defs, Def } from '../Article';
import { DemoLimitsTable } from '../DocsDemo';
import { priceWithPeriod } from '@/lib/socria-one';
import { docPage } from '../registry';

const page = docPage('socria-one')!;
const sections = [
  { id: 'plans', heading: 'The two plans' },
  { id: 'free', heading: 'What the free tier holds' },
  { id: 'asking', heading: 'When Socria asks' },
  { id: 'never', heading: 'What is never gated' },
  { id: 'codes', heading: 'Access codes' },
  { id: 'billing', heading: 'How billing behaves' },
];

export function SocriaOne() {
  return (
    <Article page={page} sections={sections}>
      <H2 id="plans">The two plans</H2>
      <p>
        Socria has one paid plan: <strong>Socria One, {priceWithPeriod()}</strong>. It
        opens the complete reasoning environment — all four{' '}
        <Link href="/docs/depth-personality">depth modes</Link>, Thinking Maps
        with unbounded branching and every lens, Research across the whole map
        as often as it&rsquo;s needed, Draft Space, and as many lines of thinking as you
        keep, with their full history. Core 2 is not part of the paywall at all —
        it stays free, account or no account.
      </p>
      <p>
        You subscribe from the <Link href="/one">Socria One page</Link> or
        from any boundary inside Logos. Payment runs through Stripe Checkout;
        cancelling, changing card and reading invoices happen in Stripe&rsquo;s
        own billing portal — Socria deliberately has no home-grown cancellation
        flow to navigate.
      </p>

      <H2 id="free">What the free tier holds</H2>
      <p>
        The free tier is a working trial of the whole loop, not a demo. Its
        exact shape:
      </p>
      <DemoLimitsTable />
      <p className="d-after-table">
        Those numbers are read from the entitlement table the product itself
        enforces, so this page cannot drift from what actually happens. Where
        Socria One carries a figure at all it is a fair-use ceiling — set
        where serious work will not meet it — rather than an allowance you are
        meant to ration.
      </p>
      <Callout tag="Boundary, not wall">
        <p>
          Hitting a limit stops <em>new</em> growth — the map stops taking on
          nodes, the rail stops taking new sessions. It never hides, deletes,
          or locks anything you already thought: the map you built stays on
          screen, stays interactive, and stays yours.
        </p>
      </Callout>

      <H2 id="asking">When Socria asks</H2>
      <p>
        A place to think cannot also be a place that interrupts you to sell,
        so there are rules about when Socria One is allowed to come up at
        all — and most of them are rules about staying quiet.
      </p>
      <p>
        A prompt appears because <strong>you did something</strong>. Never
        because time passed, never because you are new, never because a
        session started. There are two kinds, and they are treated very
        differently:
      </p>
      <Defs>
        <Def term="You reached a boundary">
          You pressed Explore, or began a third line of thinking, and it
          stopped. The prompt names the thing that stopped and how to carry
          on. These appear immediately and are never rationed — a button that
          silently does nothing is worse than an explanation.
        </Def>
        <Def term="Nobody asked">
          At most one of these per browser session, ever. It needs you to have
          come back across at least two different days with a map of real
          size, and it only appears just after a reply lands — the one moment
          where mentioning more room continues what you were doing rather
          than interrupting it.
        </Def>
      </Defs>
      <p>
        Closing the second kind starts a cooldown: a week the first time, a
        fortnight the second, then two months, then six. Saying no is taken as
        an answer. Closing the first kind costs nothing — it is a
        &ldquo;not now&rdquo; to what you were doing, not a verdict on the
        subscription — so ordinary use of the free tier never silences an
        explanation you might want later.
      </p>
      <Callout tag="Where it stays quiet regardless">
        <p>
          When the map reads the conversation as <em>reflecting</em> —
          someone working through something personal — the unprompted kind is
          suppressed outright, whatever else is true. Boundary explanations
          still appear there, because in the middle of that conversation
          silence from a button you pressed is worse than a sentence saying
          why.
        </p>
        <p>
          Members never see any of it. That is the first thing checked, before
          anything else can override it.
        </p>
      </Callout>
      <p>
        There are no countdowns, no expiring offers and no manufactured
        scarcity anywhere in this. The price is on the face of every prompt
        rather than behind a checkout.
      </p>

      <H2 id="never">What is never gated</H2>
      <p>
        Two capabilities are free at every tier, permanently, because charging
        for them would make the product dishonest:
      </p>
      <ul>
        <li>
          <strong>Trace</strong> — seeing where a thought on your map came
          from, in your own quoted words. You can always audit your own
          reasoning.
        </li>
        <li>
          <strong>Correction</strong> — telling Logos it read you wrong. You
          can always fix the record.
        </li>
      </ul>
      <p>
        The <Link href="/docs/mathematics">Answer Guard</Link>&rsquo;s
        &ldquo;Show solution&rdquo; door belongs on this list too: revealing an
        answer you are working toward is never a paid action.
      </p>

      <H2 id="codes">Access codes</H2>
      <p>
        Socria One can also be opened with a typed access code — the same
        mechanism as the Core 3.1 access key. A code is a <em>soft gate</em>,
        not a secret: it ships in the client bundle, and it exists for handing
        out (teams, friends, promotions), not for security.
      </p>
      <Defs>
        <Def term="Typed while signed out">
          Unlocks One in that browser, stored locally.
        </Def>
        <Def term="Typed while signed in">
          Also redeemed to the account (via <code>/api/logos/redeem</code>),
          so it follows you across devices. Codes are case-insensitive.
        </Def>
        <Def term="Comp grants">
          A deployment can grant One to specific accounts with no billing
          attached — by user id or email. A comp&rsquo;d person who later
          subscribes for real gets a normal Stripe relationship; a comp is
          never allowed to overwrite one.
        </Def>
      </Defs>

      <H2 id="billing">How billing behaves</H2>
      <p>
        Stripe is the source of truth for paid subscriptions, and its signed
        webhook events are the only writer of Stripe lifecycle state. Socria
        itself writes just two other kinds of row: a pre-checkout customer
        stub (status <code>incomplete</code>, which never entitles anyone)
        and complimentary grants from redeemed codes. The rules the
        projection enforces:
      </p>
      <ul>
        <li>
          <strong>Cancelling keeps access until the paid month runs out.</strong>{' '}
          Someone who cancels on the 3rd has paid through the period; access
          ends at the period&rsquo;s end, not at the moment of cancelling.
        </li>
        <li>
          <strong>A failed renewal does not lock you out.</strong> The{' '}
          <code>past_due</code> state stays entitled — a card problem is a
          billing conversation, not a reason to interrupt thinking you are in
          the middle of.
        </li>
        <li>
          <strong>Nothing entitles by accident.</strong> Abandoned checkouts,
          expired subscriptions and unknown states all resolve to the free
          tier.
        </li>
      </ul>
      <p>
        For operators: the pricing is configured server-side (the client can
        never name its own price), and webhook requests are
        signature-verified with replay protection. The exact setup lives in
        the repository&rsquo;s <code>.env.example</code>.
      </p>
    </Article>
  );
}
