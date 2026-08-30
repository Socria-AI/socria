// Security. Every measure described here was read out of the shipping code —
// the encryption, the signature verification, the SSRF screening, the sandboxed
// evaluator. Where something is NOT yet done, it says so, because a security
// page that overstates is worse than none.

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Security — Socria',
  description:
    'How Socria protects accounts and data: where it is stored, how it is encrypted, and what the server refuses to trust.',
};

export default function SecurityPage() {
  return (
    <article>
      <span className="lg-kicker">Engineering</span>
      <h1>Security</h1>
      <p className="lg-lead">
        What actually protects your account and your thinking. Everything below
        describes measures in the running code — where something is not yet
        done, this page says so.
      </p>
      <p className="lg-dates">
        Last reviewed August 2026 · Report a vulnerability:{' '}
        <a href="mailto:hellosocria@gmail.com">hellosocria@gmail.com</a>
      </p>

      <h2 id="accounts">Your account</h2>
      <p>
        Sign-in is handled by <strong>Clerk</strong> rather than by us.{' '}
        <strong>We never see or store your password.</strong> Session
        handling, multi-factor authentication where you enable it, and device
        management are theirs — a specialist doing one job well beats us
        reimplementing it.
      </p>
      <p>
        Payments run through <strong>Stripe&rsquo;s</strong> own hosted
        checkout. Card numbers never touch our servers; we hold only a customer
        reference and your subscription status.
      </p>

      <h2 id="data">Where your data sits</h2>
      <p>
        Conversations, maps, drafts and memory live in a managed Postgres
        database at <strong>Supabase</strong>, encrypted at rest and in transit
        by the host.{' '}
        <strong>The browser never talks to that database directly.</strong>{' '}
        Every read and write goes through our server, which checks on every
        request that the row belongs to the account asking for it. That is not a
        rule applied to deletes and hoped for elsewhere: every query in the
        codebase is filtered by account, updates included, and the routes that
        call the AI hold no database state at all, so there is no record
        identifier a request could substitute to reach someone else&rsquo;s
        thinking.
      </p>
      <p>
        The database has row-level security switched on with no policies and the
        public API roles revoked, which is a second wall rather than the first
        one. If a key ever leaked, or the database&rsquo;s own REST interface
        were exposed by mistake, the answer would be nothing rather than
        everything.
      </p>
      <div className="lg-note">
        <span className="t">What this is not</span>
        <p>
          Your messages are encrypted in transit and encrypted at rest by the
          database host, and access to them is controlled per account.{' '}
          <strong>They are not end-to-end encrypted.</strong> We could read them
          if we chose to, and so could our AI provider in the course of
          generating a reply. Anyone telling you otherwise about a product that
          builds a Thinking Map from your words is selling something.
        </p>
      </div>
      <div className="lg-note">
        <span className="t">Connected accounts</span>
        <p>
          If you ever connect Google or Notion, those access tokens are
          encrypted before they are stored — AES-256-GCM, with a key derived
          from a server-side secret. Without that secret the system refuses to
          store a connection at all rather than fall back to plaintext — a
          database dump on its own does not yield anyone&rsquo;s Google or
          Notion access. Finishing a connection also checks a signed, single-use
          link against the session making the request, so a link cannot be
          re-pointed at somebody else&rsquo;s account. Disconnecting deletes the
          stored credential.
        </p>
      </div>

      <h2 id="trust">What the server refuses to trust</h2>
      <p>
        Most of Socria&rsquo;s security work is in what it declines to take at
        face value.
      </p>
      <ul>
        <li>
          <strong>The browser is never the authority on what you have paid
          for.</strong> Every gated request re-decides your plan on the server,
          from the payment processor and your account — the client only states
          what it believes.
        </li>
        <li>
          <strong>Payment webhooks are verified before they are read.</strong>{' '}
          The raw body is checked against a signing secret before anything is
          parsed. A forged event, a replayed old one, or a genuine signature
          reused over an edited body are all rejected.
        </li>
        <li>
          <strong>The price comes from the server, never the request.</strong>{' '}
          A client that could name its own price could name its own number.
        </li>
        <li>
          <strong>Model output is treated as untrusted.</strong> Everything the
          AI returns is validated and bounded before it reaches your screen.
          When Logos shows you a quotation of your own words, the model supplies
          only the position in the transcript — the text is taken from your real
          transcript by the server, which is why a fabricated quote is not
          merely unlikely but impossible.
        </li>
      </ul>

      <h2 id="inputs">Handling risky input</h2>
      <ul>
        <li>
          <strong>Maths expressions are parsed, not evaluated.</strong> Plotting
          a function means running a string you typed. Socria uses a
          hand-written parser over a fixed grammar instead of the language&rsquo;s
          own evaluator: a hostile expression can produce a meaningless number,
          it cannot run code.
        </li>
        <li>
          <strong>Fetching a web page is screened.</strong> When you point
          Socria at a URL, the request is blocked from reaching internal
          addresses — loopback, private ranges, link-local and cloud metadata
          endpoints — including tricks like integer-encoded IPs, and the check
          is repeated after redirects.
        </li>
        <li>
          <strong>Rendered maths cannot inject markup.</strong> The formula
          renderer runs with untrusted input in mind and hard limits on how far
          an expression can expand.
        </li>
        <li>
          <strong>Rate limits</strong> apply per account, or per IP when signed
          out, across separate budgets for expensive and cheap operations.
        </li>
      </ul>

      <h2 id="honest">What we have not done yet</h2>
      <div className="lg-note">
        <span className="t">Stated plainly</span>
        <p>
          Socria is a young product. We have not completed a third-party
          security audit or a penetration test, we do not hold SOC&nbsp;2 or
          ISO&nbsp;27001, we do not yet run a formal bug-bounty programme, and
          we have not signed a data processing agreement with our AI provider or
          moved to a zero-retention endpoint. Your messages are not end-to-end
          encrypted. If your organisation needs any of those before adopting a
          tool, we are not there yet — and would rather tell you than let you
          assume.
        </p>
      </div>

      <h2 id="report">Reporting a vulnerability</h2>
      <p>
        If you find something, please tell us at{' '}
        <a href="mailto:hellosocria@gmail.com">hellosocria@gmail.com</a> before
        disclosing it
        publicly, and give us a reasonable window to fix it. We will confirm we
        received your report, keep you posted, and credit you if you would like
        that. We will not pursue legal action against anyone acting in good
        faith under this policy.
      </p>
      <p>
        For what we collect and how to have it deleted, see the{' '}
        <Link href="/privacy">privacy policy</Link>.
      </p>
    </article>
  );
}
