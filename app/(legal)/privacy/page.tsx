// The privacy policy. Every claim here describes what the code actually does;
// where a fact belongs to the operator rather than the software — the legal
// entity, the contact address, the governing law — it is marked as a blank to
// fill rather than invented.

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy — Socria',
  description:
    'What Socria collects, why, who it is shared with, and how to get it back or have it deleted.',
};

export default function PrivacyPage() {
  return (
    <article>
      <span className="lg-kicker">Policy</span>
      <h1>Privacy</h1>
      <p className="lg-lead">
        Socria exists so your thinking stays yours. That principle is worth
        very little if we are vague about what we hold, so this page says
        plainly what is collected, why, and how to get it back or have it
        deleted.
      </p>
      <p className="lg-dates">
        Effective August 2026 · Last updated August 2026 · Data controller:
        Socria — <a href="mailto:hellosocria@gmail.com">hellosocria@gmail.com</a>
      </p>

      <h2 id="what">What we collect</h2>

      <h3>What you write</h3>
      <p>
        Your messages, and Socria&rsquo;s replies. If you use Logos, that also
        means the <strong>Thinking Map</strong> built from those messages —
        your claims, assumptions, tensions and evidence — along with anything
        you write in Draft Space and any material you attach or paste.
      </p>

      <h3>What Socria works out about your thinking</h3>
      <p>
        This is the part most people would not guess, so it comes first rather
        than buried. To hold a conversation across turns and sessions, Socria
        keeps notes on it:
      </p>
      <ul>
        <li>
          <strong>Thread memory</strong> — goals, values, constraints,
          preferences, decisions, uncertainties and insights extracted from a
          conversation, so it does not ask you the same thing twice.
        </li>
        <li>
          <strong>The Thinking Journey</strong> — a short running account, kept
          across conversations, of what you appear to be working through, which
          threads are still open, and a timeline of moments. It is written in
          terms like &ldquo;weighing whether to launch before fixing
          onboarding&rdquo;.
        </li>
      </ul>
      <div className="lg-note">
        <span className="t">Be clear-eyed about this</span>
        <p>
          The Journey is an evolving description of how you think, not a log of
          what you typed. If you would rather Socria did not keep one, do not
          use Core&nbsp;3.1 — or delete the conversations that feed it, and ask
          us to erase it.
        </p>
      </div>

      <h3>Your account</h3>
      <p>
        Your email address and sign-in details, handled by our authentication
        provider. If you subscribe to Socria One, our payment processor holds
        your billing details — <strong>we never see or store your card
        number.</strong>
      </p>

      <h3>Technical data</h3>
      <p>
        Standard request information, plus a rate-limiting counter keyed to your
        account. If you are <em>not</em> signed in, that counter is keyed to
        your <strong>IP address</strong> instead, because there is nothing else
        to key it to.
      </p>

      <h2 id="why">Why we hold it</h2>
      <div className="lg-tablewrap">
        <table>
          <thead>
            <tr><th>Purpose</th><th>What it uses</th></tr>
          </thead>
          <tbody>
            <tr><td>Running the conversation</td><td>Your messages, sent to our AI provider to generate a reply and to build your map</td></tr>
            <tr><td>Continuity</td><td>Thread memory and the Journey, so a conversation picks up where it left off</td></tr>
            <tr><td>Your account and plan</td><td>Email, sign-in, subscription status</td></tr>
            <tr><td>Keeping the service up</td><td>Rate limiting and abuse prevention</td></tr>
            <tr><td>Understanding usage</td><td>Aggregate, privacy-preserving page analytics</td></tr>
          </tbody>
        </table>
      </div>
      <p>
        We do <strong>not</strong> sell your data, and we do not use your
        conversations to train models. OpenAI does not train on data submitted
        through its API, and retains it only briefly for abuse monitoring; their
        current terms govern that, not us.
      </p>

      <h2 id="who">Who it is shared with</h2>
      <p>
        Socria is built on services that each see one slice. We share only what
        each needs to do its job:
      </p>
      <div className="lg-tablewrap">
        <table>
          <thead>
            <tr><th>Sub-processor</th><th>Purpose</th><th>Receives</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>OpenAI, L.L.C.</strong></td>
              <td>AI inference</td>
              <td>Your messages and conversation history, to generate replies, maps and summaries</td>
            </tr>
            <tr>
              <td><strong>Supabase, Inc.</strong></td>
              <td>Database and storage</td>
              <td>Everything stored: conversations, maps, drafts, memory, the Journey</td>
            </tr>
            <tr>
              <td><strong>Clerk</strong></td>
              <td>Authentication</td>
              <td>Email and sign-in credentials</td>
            </tr>
            <tr>
              <td><strong>Stripe, Inc.</strong></td>
              <td>Subscription and payment processing</td>
              <td>Billing details, for Socria One only</td>
            </tr>
            <tr>
              <td><strong>Vercel, Inc.</strong></td>
              <td>Application hosting</td>
              <td>Request metadata; your account id, or your IP when signed out</td>
            </tr>
            <tr>
              <td><strong>Vercel, Inc.</strong></td>
              <td>Analytics</td>
              <td>Aggregate page views</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        If web Research is enabled on this deployment, a search provider also
        receives the generated search query — never your private details, which
        the code strips by design.
      </p>
      <p>
        The full register, with each company&rsquo;s role, location and privacy
        policy, is at <a href="/subprocessors">subprocessors</a>.
      </p>

      <h2 id="where">Where it lives</h2>
      <p>
        <strong>Signed in</strong>, your conversations and maps are stored in
        our database and follow you across devices.
      </p>
      <p>
        <strong>Signed out</strong>, they stay in your browser&rsquo;s local
        storage and never reach us. So do your personality settings, your custom
        instructions, and which maths solutions you chose to reveal — those stay
        on your device even when you are signed in. Clearing your browser data
        clears them.
      </p>

      <h2 id="rights">Your choices</h2>
      <ul>
        <li><strong>See it</strong> — everything you have written is visible in the app.</li>
        <li><strong>Delete a conversation</strong> — deleting one removes it, and its map, draft and memory, from our database.</li>
        <li>
          <strong>Delete everything</strong> — email{' '}
          <a href="mailto:hellosocria@gmail.com">hellosocria@gmail.com</a> from
          your account address and we will erase your account and all of its
          data. Self-service account deletion is not built yet; until it is,
          that address is the route, and we will confirm when it is done.
        </li>
        <li>
          <strong>Export</strong> — not yet available as a one-click download.
          Ask at the same address and we will send you what we hold.
        </li>
        <li><strong>Correct it</strong> — tell Socria in the conversation when it has read you wrong; correcting the record is never a paid feature.</li>
      </ul>
      <p>
        We keep what you write for as long as your account exists, because it is
        what the product is for; deleting a conversation removes it, and
        deleting your account removes all of it. If you are in the EU, the UK or
        California you have further rights over your data — access, correction,
        erasure, portability and objection — and the right to complain to your
        local supervisory authority. Write to us first and we will try to settle
        it directly.
      </p>

      <h2 id="children">Children</h2>
      <p>
        You must be at least <strong>13</strong> to use Socria, and older where
        your country sets a higher digital age of consent — several EU member
        states set it at 14, 15 or 16. We do not knowingly collect data from
        anyone below that age; if you believe a child has given us data, write
        to us and we will delete it.
      </p>

      <h2 id="changes">Changes and contact</h2>
      <p>
        If this policy changes in a way that matters, we will say so rather than
        quietly re-dating the page. Questions, or a request to delete your data:{' '}
        <a href="mailto:hellosocria@gmail.com">hellosocria@gmail.com</a>.
      </p>
    </article>
  );
}
