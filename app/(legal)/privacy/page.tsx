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
          what you typed. If you would rather Socria did not keep one, there is
          a control for exactly that: <a href="/account/data">Data &amp;
          Privacy</a> clears the Journey and every thread&rsquo;s memory and
          leaves your own words untouched.
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
        We do <strong>not</strong> sell your data, we do not share it for
        cross-context behavioural advertising, and we do not use your
        conversations to train models &mdash; we do not have a model of our own
        to train. Under OpenAI&rsquo;s published API policy, data sent through
        their API is not used to train their models by default, and inputs and
        outputs are retained for{' '}
        <strong>up to 30 days for abuse monitoring</strong> before deletion.
        That is their policy rather than a contract we hold, and we have not
        signed a data processing agreement or enabled zero retention with them
        &mdash; if you need either, ask us before you rely on it.
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
            <tr>
              <td><strong>Upstash, Inc.</strong></td>
              <td>Rate limiting</td>
              <td>A counter keyed to your account id, or your IP when signed out. No content.</td>
            </tr>
            <tr>
              <td><strong>Serper / Tavily</strong></td>
              <td>Web search</td>
              <td>The search phrase only, when Research looks something up</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        When Research looks something up, a search provider receives{' '}
        <strong>the search phrase and nothing else</strong> &mdash; your
        conversation is never sent to it. A rate-limiting service receives a
        counter keyed to your account id, or your IP when you are signed out,
        and no content at all. If you connect Google or Notion yourself, your
        searches and the documents you choose reach those services too; both are
        listed on the register.
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
        <strong>Signed out</strong>, they are{' '}
        <strong>never written to our database</strong> &mdash; they live in your
        browser&rsquo;s local storage, and clearing your browser data clears
        them. Be precise about what that does and does not mean: to answer you
        at all, each message still passes through our server and on to our AI
        provider. It is not stored; it is not anonymous. Your personality
        settings, your custom instructions, and which maths solutions you chose
        to reveal stay on your device either way, signed in or out.
      </p>

      <h2 id="rights">Your choices</h2>
      <ul>
        <li><strong>See it</strong> — everything you have written is visible in the app.</li>
        <li><strong>Delete a conversation</strong> — deleting one removes it, and its map, draft and memory, from our database.</li>
        <li>
          <strong>Forget what Socria worked out</strong> &mdash;{' '}
          <a href="/account/data">Data &amp; Privacy</a> has a control that
          clears thread memory and the Thinking Journey from every conversation
          while leaving your own words, maps and drafts exactly where they are.
          Being forgotten and losing your notes are different requests.
        </li>
        <li>
          <strong>Export</strong> &mdash; one click in{' '}
          <a href="/account/data">Data &amp; Privacy</a> downloads everything we
          hold about you as a JSON file: conversations, maps, drafts, memory,
          profile and subscription status. Connected accounts are listed as
          connected; their access tokens are never included.
        </li>
        <li>
          <strong>Delete everything</strong> &mdash; the same page deletes your
          account outright. It cancels any subscription first, then removes
          every row keyed to you, then the account itself. It is immediate and
          it is not reversible. If you would rather a person did it, write to{' '}
          <a href="mailto:hellosocria@gmail.com">hellosocria@gmail.com</a> from
          your account address.
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

      <h2 id="keep">How long we keep it</h2>
      <p>
        Nothing you write expires on a timer. A conversation stays until you
        delete it, because a thinking record you lose track of is not a thinking
        record. Deleting a conversation removes it immediately; deleting your
        account removes all of it immediately. Neither is a soft delete &mdash;
        we do not keep a copy in a bin.
      </p>
      <p>Three things survive that, and you should hear it from us:</p>
      <ul>
        <li>
          <strong>Payment records.</strong> Stripe keeps invoice and transaction
          records to meet its own tax and legal obligations after a subscription
          ends. That retention is theirs, and not ours to override.
        </li>
        <li>
          <strong>Abuse-monitoring logs at OpenAI</strong>, for up to the 30 days
          described above.
        </li>
        <li>
          <strong>Encrypted database backups</strong>, which contain a deleted
          row until they age out of their retention window and are overwritten.
        </li>
      </ul>
      <p>
        Our own application logs record route names, error codes and counts.
        They do not contain your messages, and they never contain an access
        token.
      </p>

      <h2 id="legal">Legal bases, and rights by region</h2>
      <p>
        For people in the EEA, the UK and Switzerland, we rely on{' '}
        <strong>contract</strong> to run the service you asked for &mdash;
        holding your conversations, generating replies, maintaining memory and
        managing your subscription &mdash; and on{' '}
        <strong>legitimate interests</strong> for keeping the service up and
        preventing abuse, which is the rate limiting described above. We do not
        rely on consent for any of it, so there is no consent to withdraw; the
        equivalent is to stop using Socria and delete your account, which you
        can do in one click.
      </p>
      <p>
        You have the right to access, correct, erase and port your data, to
        object to or restrict processing, and to complain to your local
        supervisory authority. The export and delete controls above are that
        access, portability and erasure, available without asking us. All of our
        sub-processors are United States companies, so your data is transferred
        to and processed in the US; those transfers rely on the Standard
        Contractual Clauses and each vendor&rsquo;s own transfer framework.
      </p>
      <p>
        For people in California and other US states with comparable laws: we do
        not sell personal information, and we do not share it for cross-context
        behavioural advertising &mdash; there is nothing to opt out of, because
        we do not do it. You have the right to know, delete and correct what we
        hold, and to portability, and we will not treat you differently for
        exercising any of it. If you use an authorised agent, we will ask for
        proof they are acting for you.
      </p>
      <p>
        We honour these rights for everyone, wherever you live, rather than
        gating them by jurisdiction. We answer within 30 days, and tell you if
        we need longer and why.
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
        quietly re-dating the page. If a breach ever puts your data at real
        risk, we will tell you and the relevant authority within the deadlines
        the law sets, and we will say what happened rather than what sounds
        best. How we protect the data in the first place is set out on the{' '}
        <a href="/security">security page</a>. Questions, or a request about
        your data: <a href="mailto:hellosocria@gmail.com">hellosocria@gmail.com</a>.
      </p>
    </article>
  );
}
