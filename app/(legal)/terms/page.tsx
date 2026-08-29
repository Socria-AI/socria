// Terms of service. The commercial terms mirror what the billing code actually
// does — the cancellation grace period and the past_due behaviour are real
// entitlement rules, not aspirations.

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms — Socria',
  description:
    'The agreement for using Socria: what you can expect, what we ask of you, and how billing works.',
};

export default function TermsPage() {
  return (
    <article>
      <span className="lg-kicker">Agreement</span>
      <h1>Terms of service</h1>
      <p className="lg-lead">
        The agreement between you and Socria. Written to be read — if a clause
        here needs a lawyer to decode, that is our failure, not yours.
      </p>
      <p className="lg-dates">
        Effective August 2026 · Provided by Socria —{' '}
        <a href="mailto:hellosocria@gmail.com">hellosocria@gmail.com</a>
      </p>

      <h2 id="who">Who can use Socria</h2>
      <p>
        You must be at least <strong>13</strong> years old, and older where your
        country sets a higher digital age of consent. If you are using Socria
        for an organisation, you confirm you may accept these terms on its
        behalf. Keep your sign-in details to yourself; you
        are responsible for what happens under your account.
      </p>

      <h2 id="yours">Your work is yours</h2>
      <p>
        You keep every right you have in what you write — your messages, your
        maps, your drafts. We claim no ownership of them. We store and process
        them only to run the service for you, as described in the{' '}
        <Link href="/privacy">privacy policy</Link>.
      </p>
      <p>
        You are responsible for what you put in. Do not paste material you have
        no right to share.
      </p>

      <h2 id="output">What Socria gives back</h2>
      <p>
        Socria is a thinking environment, not an oracle. It can be wrong, and it
        is designed to ask rather than answer.{' '}
        <strong>
          Nothing it produces is professional advice — legal, medical,
          financial, or otherwise
        </strong>{' '}
        — and the conclusions you reach are yours, which is the entire point of
        the product.
      </p>
      <p>
        As far as the law allows, the service is provided &ldquo;as is&rdquo;
        and &ldquo;as available&rdquo;, without warranties of any kind, and our
        total liability to you for any claim relating to Socria is limited to
        what you paid us in the twelve months before it arose. Nothing here
        limits liability that cannot lawfully be limited.
      </p>

      <h2 id="fair">Fair use</h2>
      <p>Please do not:</p>
      <ul>
        <li>Break the law, or use Socria to harm or harass anyone.</li>
        <li>Try to extract other people&rsquo;s data, or break the service&rsquo;s limits.</li>
        <li>Resell access, or scrape the service for bulk automated use.</li>
        <li>Use it to generate work you will pass off as your own where that is prohibited — that is between you and whoever set the rule, but Socria is built to prevent it, not to help.</li>
      </ul>
      <p>
        Rate limits apply so one person cannot exhaust the service for everyone.
      </p>

      <h2 id="billing">Socria One</h2>
      <p>
        Socria One costs <strong>$15 per month</strong>, billed through our
        payment processor and renewing automatically until cancelled. Prices may
        change; if they do, we will tell you before it affects you.
      </p>
      <p>Two rules we hold ourselves to, and which the software actually enforces:</p>
      <ul>
        <li>
          <strong>Cancel and you keep the month you paid for.</strong> Access
          ends when the paid period ends, not the moment you cancel.
        </li>
        <li>
          <strong>A failed payment does not lock you out mid-thought.</strong>{' '}
          If a renewal fails we will sort it out with you rather than cut you
          off immediately.
        </li>
      </ul>
      <p>
        Cancel any time from the billing portal inside the app — there is no
        retention flow to argue with. Because cancelling already leaves you the
        rest of the month you paid for, we do not refund partial months by
        default; if something went genuinely wrong, write to us and we will put
        it right.
      </p>

      <h2 id="free">The free tier</h2>
      <p>
        The free tier has limits on how many lines of thinking you keep, how far
        a map grows, and how often Research runs. Reaching a limit stops new
        growth; <strong>it never hides or deletes what you already made.</strong>{' '}
        Your maps stay visible and interactive at every tier, including after a
        subscription ends.
      </p>

      <h2 id="ending">Ending it</h2>
      <p>
        You can stop using Socria and delete your account whenever you like. We
        may suspend an account that breaks these terms or endangers the service,
        and we will explain why unless we are legally prevented from doing so.
      </p>

      <h2 id="legal">Governing law and changes</h2>
      <p>
        These Terms are governed by the laws of the State of Texas, without
        regard to its conflict-of-laws principles.
      </p>
      <p>
        If we change these terms materially, we will give notice in the product
        rather than silently updating the page. Questions:{' '}
        <a href="mailto:hellosocria@gmail.com">hellosocria@gmail.com</a>.
      </p>
    </article>
  );
}
