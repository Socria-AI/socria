// The money page. Everything here is a statement about the shipped
// entitlement code, so it can be checked against lib/socria-one.ts,
// lib/entitlements.ts, lib/subscriptions.ts and the stripe routes.
//
// The plan table is GENERATED from lib/entitlements rather than typed out.
// The hand-written one it replaced claimed a free map holds 4 nodes when it
// holds 8, and listed one of the seven counters. A number written down twice
// goes stale; this one cannot.
//
// Since November 9, 2026 there is no free tier: every account has a seven-day
// trial (lib/trial.ts), and its numbers are read from there.

import Link from 'next/link';
import { Article, H2, Callout, Defs, Def } from '../Article';
import { DemoLimitsTable } from '../demos';
import { priceWithPeriod } from '@/lib/socria-one';
import { PLANS, freePlanSentence, megabytes, onePlanSentence } from '@/lib/entitlements';
import { GUEST_TURNS } from '@/lib/guest-limits';
import { DAY_RESET_WORDS, TRIAL } from '@/lib/trial';
import { docPage } from '../registry';

const page = docPage('socria-one')!;
/** The trial's numbers as the page says them: "10,000", "70,000". */
const tokens = (n: number) => n.toLocaleString('en-GB');
const sections = [
  { id: 'plans', heading: 'The trial and the plan' },
  { id: 'trial', heading: 'What the trial holds' },
  { id: 'asking', heading: 'When Socria asks' },
  { id: 'never', heading: 'What is never gated' },
  { id: 'codes', heading: 'No codes, no free months' },
  { id: 'billing', heading: 'How billing behaves' },
];

export function SocriaOne() {
  return (
    <Article page={page} sections={sections}>
      <H2 id="plans">The trial and the plan</H2>
      <p>
        Socria has one paid plan, <strong>Socria One, {priceWithPeriod()}</strong>,
        and one way to try it first: every account starts with{' '}
        {freePlanSentence()}. There is no free tier. Socria One is{' '}
        {onePlanSentence().replace(/^U/, 'u')} — and a Socria that
        carries what it learns about how you reason from each conversation
        into the next. Socria Voice, sharing your own conversations (a chat or
        a whole Project), the experiments and the two themes are Socria
        One&rsquo;s alone; joining what somebody shares with you is free.
        Without an account you can still try a short preview — one line of
        thinking and its map, up to {GUEST_TURNS} messages, kept in your
        browser — and signing up brings it with you.
      </p>
      <p>
        What Socria One deliberately does <em>not</em> open is anything Socria
        can do inside a single line of thinking. Every{' '}
        <Link href="/docs/depth-personality">reply length</Link>, Logic Maps
        with unbounded branching and every lens, Research, Write and its
        notes, and grounding in your own material are in the trial too, at
        full strength. The trial is the product for seven days, not a
        cut-down version of it: nobody subscribes to more of something they
        have only watched be mediocre.
      </p>
      <p>
        Inside a line of thinking, one more thing differs: the size of a
        document. Anything up to{' '}
        {megabytes(PLANS.free.uploadBytes)} travels
        straight to our server and is read there, in the trial or on Socria
        One. Socria One
        carries larger documents, up to {megabytes(PLANS.one.uploadBytes)},
        through private storage instead, and deletes each one the moment it
        has been read.
      </p>
      <p>
        You subscribe from the <Link href="/one">Socria One page</Link> or
        from any boundary inside Logos. Payment runs through Stripe Checkout;
        cancelling, changing card and reading invoices happen in Stripe&rsquo;s
        own billing portal — Socria deliberately has no home-grown cancellation
        flow to navigate.
      </p>

      <H2 id="trial">What the trial holds</H2>
      <p>
        The trial is {freePlanSentence()}. Its seven days begin with the
        first request that does real work for you — a reply, a Logic Map, an
        artifact or a reading — never at sign-up, and they are seven days of
        24 hours. A day runs from 00:00 to 24:00 UTC, and a day&rsquo;s limit
        is the smaller of {tokens(TRIAL.daily)} and what the trial has left,
        so a trial that begins late in a UTC day still ends at{' '}
        {tokens(TRIAL.total)}.
      </p>
      <p>
        Tokens count what Socria reads afresh for you and everything it
        writes, together. Our own upkeep is never counted: a
        conversation&rsquo;s title, the memory kept about you, our checks on a
        draft, and an attempt that failed. When a day&rsquo;s tokens are used,
        Socria rests until {DAY_RESET_WORDS}. When the seven days are over,
        or all {tokens(TRIAL.total)} tokens are used, every new AI request
        needs Socria One.
      </p>
      <p>
        One trial is for one person, as far as is reasonable and private: a
        keyed hash of the account&rsquo;s verified email address is kept,
        never the address, so a new account on the same address starts with
        its trial already used. The trial and Socria One, side by side:
      </p>
      <DemoLimitsTable />
      <p className="d-after-table">
        Those numbers are read from the entitlement table the product itself
        enforces, so this page cannot drift from what actually happens. Most
        rows are identical on both sides, and that is the point rather than an
        oversight. Where a figure appears on both it is a fair-use ceiling —
        a guard against a runaway loop, set where serious work will not meet
        it — rather than an allowance you are meant to ration; Socria One does
        not lift those, because there is nothing there to lift.
      </p>
      <Callout tag="Boundary, not wall">
        <p>
          Reaching a trial day&rsquo;s limit, or the end of the trial, pauses
          only what is <em>new</em> — a new question, a new map, a new
          artifact. It never hides, deletes, or locks anything you already
          thought: every map you built stays on screen, stays interactive, and
          stays yours; everything you have begun stays open; and moving,
          writing, renaming, organising, exporting and deleting by hand go on
          working.
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
          You used a trial day&rsquo;s tokens, reached the end of the trial,
          or pressed Voice or Share, and what you tried stopped. The
          prompt names what stopped and how to carry on. These appear
          immediately and are not rationed by the rules below — a button that
          silently does nothing is worse than an explanation — though the same
          boundary is only explained once per browser session. A fair-use
          ceiling never opens one of these at all: Socria One shares it, so
          there would be nothing to offer.
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
        subscription — so ordinary use during the trial never silences an
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
        Two capabilities are never charged for — in the trial, after it, or
        on Socria One — because charging for them would make the product
        dishonest:
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

      <H2 id="codes">No codes, no free months</H2>
      <p>
        Socria One is paid for, or it is not held. It used to be opened by
        typed access codes, complimentary grants, a student month and Socria
        Rewards; none of those opens it now, and a code typed today is told
        so plainly. Everyone already paying keeps exactly what they have. The
        access key that opens Logos 5 for a signed-out visitor is a different
        thing and is unaffected: it opens the product, never the plan.
      </p>

      <H2 id="billing">How billing behaves</H2>
      <p>
        Stripe is the source of truth for paid subscriptions, and its signed
        webhook events are the only writer of Stripe lifecycle state. Socria
        itself writes one other kind of row: a pre-checkout customer stub
        (status <code>incomplete</code>, which never entitles anyone). The
        rules the projection enforces:
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
          expired subscriptions and unknown states all resolve to no
          subscription: the trial, if the account has one left; otherwise
          everything it made stays open, and new AI requests wait for Socria
          One.
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
