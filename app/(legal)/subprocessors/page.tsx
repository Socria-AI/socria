// The sub-processor register.
//
// Named companies, not categories — which is what a regulator, and anyone
// doing vendor review, actually needs. Kept as its own page so it can be
// updated when a vendor changes without reopening the privacy policy.

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Sub-processors — Socria',
  description:
    'The companies that process data on Socria’s behalf, what each one receives, and why.',
};

const ROWS = [
  {
    name: 'OpenAI, L.L.C.',
    role: 'AI inference',
    gets: 'Your messages and recent conversation history — sent to generate each reply, and separately to build your Thinking Map, memory and syntheses.',
    where: 'United States',
    site: 'https://openai.com/policies/privacy-policy',
  },
  {
    name: 'Supabase, Inc.',
    role: 'Database and storage',
    gets: 'Everything stored: conversations, maps, drafts, grounded material, thread memory, the Thinking Journey, and subscription status.',
    where: 'United States',
    site: 'https://supabase.com/privacy',
  },
  {
    name: 'Clerk, Inc.',
    role: 'Authentication',
    gets: 'Your email address and sign-in credentials, and session management.',
    where: 'United States',
    site: 'https://clerk.com/legal/privacy',
  },
  {
    name: 'Stripe, Inc.',
    role: 'Subscription and payment processing',
    gets: 'Billing details for Socria One. Card numbers go to Stripe directly and never reach our servers.',
    where: 'United States',
    site: 'https://stripe.com/privacy',
  },
  {
    name: 'Vercel, Inc.',
    role: 'Application hosting',
    gets: 'Request metadata in the ordinary course of serving the site, including IP address.',
    where: 'United States',
    site: 'https://vercel.com/legal/privacy-policy',
  },
  {
    name: 'Vercel, Inc.',
    role: 'Analytics',
    gets: 'Aggregate page views. Not tied to your conversations.',
    where: 'United States',
    site: 'https://vercel.com/legal/privacy-policy',
  },
  {
    name: 'Upstash, Inc.',
    role: 'Rate limiting',
    gets: 'A counter keyed to your account id, or to your IP address when you are not signed in. No message content. Entries expire on their own within the hour.',
    where: 'United States',
    site: 'https://upstash.com/trust/privacy.pdf',
  },
  {
    name: 'Serper / Tavily',
    role: 'Web search, when a source is looked up',
    gets: 'The search phrase only — not your conversation. Only when Logos looks something up for you.',
    where: 'United States',
    site: 'https://serper.dev/privacy-policy',
  },
];

// Reached only because you connected the account yourself, and only while the
// connection is live. Listed because data does move, not because we chose them.
const CONNECTED = [
  {
    name: 'Google LLC',
    role: 'Drive, Gmail and Calendar, if you connect them',
    gets: 'The searches you run against your own account, and the documents you choose to pull in.',
    site: 'https://policies.google.com/privacy',
  },
  {
    name: 'Notion Labs, Inc.',
    role: 'Notion, if you connect it',
    gets: 'The searches you run against your own workspace, and the pages you choose to pull in.',
    site: 'https://www.notion.com/privacy',
  },
];

export default function SubprocessorsPage() {
  return (
    <article>
      <span className="lg-kicker">Register</span>
      <h1>Sub-processors</h1>
      <p className="lg-lead">
        The companies that process data on Socria&rsquo;s behalf. Each sees one
        slice, and only what it needs to do its job.
      </p>
      <p className="lg-dates">Last updated August 2026</p>

      <h2 id="list">Who processes what</h2>
      <div className="lg-tablewrap">
        <table>
          <thead>
            <tr>
              <th>Company</th>
              <th>Role</th>
              <th>Receives</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={`${r.name}-${r.role}`}>
                <td>
                  <strong>{r.name}</strong>
                  <br />
                  <a href={r.site} target="_blank" rel="noopener noreferrer">
                    privacy policy
                  </a>
                </td>
                <td>{r.role}</td>
                <td>{r.gets}</td>
                <td>{r.where}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 id="connected">Only if you connect them</h2>
      <p>
        Nothing below is reached until you link the account yourself, and
        disconnecting it in Logos deletes the stored credential.
      </p>
      <div className="lg-tablewrap">
        <table>
          <thead>
            <tr>
              <th>Company</th>
              <th>Role</th>
              <th>Receives</th>
            </tr>
          </thead>
          <tbody>
            {CONNECTED.map((r) => (
              <tr key={r.name}>
                <td>
                  <strong>{r.name}</strong>
                  <br />
                  <a href={r.site} target="_blank" rel="noopener noreferrer">
                    privacy policy
                  </a>
                </td>
                <td>{r.role}</td>
                <td>{r.gets}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 id="ai">A note on AI processing</h2>
      <p>
        Your conversations are sent to OpenAI to generate replies and to build
        your map. Under OpenAI&rsquo;s API data-usage policy, data submitted
        through the API is{' '}
        <strong>not used to train their models by default</strong>, and inputs
        and outputs are retained for{' '}
        <strong>up to 30 days for abuse monitoring</strong> before deletion,
        unless a longer period is required by law. Socria uses the standard API,
        not a zero-retention endpoint, so that 30-day window applies to us.
      </p>
      <div className="lg-note">
        <span className="t">Verify this yourself</span>
        <p>
          Those durations are OpenAI&rsquo;s published policy, not a private
          agreement we hold, and their terms are theirs to change. We have not
          signed a DPA with them or enabled Zero Data Retention. If your
          organisation needs either one contractually guaranteed, that is a
          conversation to have with us before you rely on it. Ask us at{' '}
          <a href="mailto:hellosocria@gmail.com">hellosocria@gmail.com</a>.
        </p>
      </div>

      <h2 id="transfers">International transfers</h2>
      <p>
        All of the above are United States companies, so data about you is
        processed in the US. If you are in the EEA, the UK or Switzerland, that
        is an international transfer, and these vendors rely on Standard
        Contractual Clauses and their own transfer frameworks.{' '}
        <strong>
          If you require a signed data processing agreement, write to us
        </strong>{' '}
        — for a product at this stage that is a conversation, not a download.
      </p>

      <h2 id="changes">Changes</h2>
      <p>
        We will update this page when a sub-processor is added or replaced.
        Questions:{' '}
        <a href="mailto:hellosocria@gmail.com">hellosocria@gmail.com</a>. See
        also the <Link href="/privacy">privacy policy</Link> and{' '}
        <Link href="/security">security</Link>.
      </p>
    </article>
  );
}
