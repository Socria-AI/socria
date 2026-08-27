// The money page. Everything here is a statement about the shipped
// entitlement code, so it can be checked against lib/socria-one.ts,
// lib/subscriptions.ts and the stripe routes.

import Link from 'next/link';
import { Article, H2, Callout, Defs, Def, TableWrap } from '../Article';
import { docPage } from '../registry';

const page = docPage('socria-one')!;
const sections = [
  { id: 'plans', heading: 'The two plans' },
  { id: 'free', heading: 'What the free tier holds' },
  { id: 'never', heading: 'What is never gated' },
  { id: 'codes', heading: 'Access codes' },
  { id: 'billing', heading: 'How billing behaves' },
];

export function SocriaOne() {
  return (
    <Article page={page} sections={sections}>
      <H2 id="plans">The two plans</H2>
      <p>
        Socria has one paid plan: <strong>Socria One, $15/month</strong>. It
        opens the complete reasoning environment — all four{' '}
        <Link href="/docs/depth-personality">depth modes</Link>, Thinking Maps
        with unbounded branching and every lens, Research across the whole map
        as often as it&rsquo;s needed, Draft Space, and unlimited lines of
        thinking with full history. Core 2 is not part of the paywall at all —
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
      <TableWrap>
        <table>
          <thead>
            <tr><th>Limit</th><th>Free</th><th>Socria One</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Lines of thinking kept at once</td>
              <td>2</td>
              <td>Unlimited</td>
            </tr>
            <tr>
              <td>Nodes a map grows to</td>
              <td>4</td>
              <td>Unbounded</td>
            </tr>
            <tr>
              <td>Research runs per conversation</td>
              <td>1</td>
              <td>As often as needed</td>
            </tr>
            <tr>
              <td>Thinking depth</td>
              <td>Balanced</td>
              <td>All four modes</td>
            </tr>
            <tr>
              <td>Map lenses</td>
              <td>The map&rsquo;s lead lens</td>
              <td>All seven</td>
            </tr>
            <tr>
              <td>Draft Space</td>
              <td>—</td>
              <td>Included</td>
            </tr>
          </tbody>
        </table>
      </TableWrap>
      <Callout tag="Boundary, not wall">
        <p>
          Hitting a limit stops <em>new</em> growth — the map stops taking on
          nodes, the rail stops taking new sessions. It never hides, deletes,
          or locks anything you already thought: the map you built stays on
          screen, stays interactive, and stays yours.
        </p>
      </Callout>

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
