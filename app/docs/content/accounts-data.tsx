// Accounts, storage, sync, deletion. Checkable against middleware.ts,
// supabase/schema.sql, app/api/conversations/route.ts, lib/logos-sessions.ts.

import Link from 'next/link';
import { Article, H2, Callout, Defs, Def } from '../Article';
import { docPage } from '../registry';

const page = docPage('accounts-data')!;
const sections = [
  { id: 'signedout', heading: 'Signed out' },
  { id: 'signedin', heading: 'Signed in' },
  { id: 'where', heading: 'What lives where' },
  { id: 'onelist', heading: 'One list of sessions' },
  { id: 'deletion', heading: 'Deletion' },
];

export function AccountsData() {
  return (
    <Article page={page} sections={sections}>
      <H2 id="signedout">Signed out</H2>
      <p>
        You can use Socria without an account: Core 2 gives every anonymous
        visitor one full session, kept in that browser. Logos and Core 3.1
        normally ask you to sign in — an access code opens them without an
        account, in which case your lines of thinking are kept locally and
        the rail says so plainly: <em>&ldquo;Kept in this
        browser.&rdquo;</em>
      </p>

      <H2 id="signedin">Signed in</H2>
      <p>
        Accounts are handled by Clerk. On your first sign-in from a browser
        that already holds local chat conversations, they are migrated up to
        your account — once — and from then on everything syncs:{' '}
        <em>&ldquo;Synced to your account.&rdquo;</em> Conversations, maps,
        drafts and grounded material follow you across devices. One caveat:
        Logos sessions created while key-unlocked and signed out stay in the
        browser that made them — signing in starts cloud sessions but does
        not lift the local ones up.
      </p>

      <H2 id="where">What lives where</H2>
      <Defs>
        <Def term="Your account (cloud)">
          Conversations and Logos sessions (each holding its messages, map,
          draft and grounded contexts), your cross-conversation Thinking
          Journey, redeemed grants, and — if you subscribe — the billing
          projection Stripe writes.
        </Def>
        <Def term="Your browser (local)">
          Interface state and preferences: which model and depth you were
          on, personality settings and custom instructions, which solutions
          you chose to reveal, free-tier counters, and — when signed out —
          the conversations themselves.
        </Def>
      </Defs>
      <Callout tag="Older databases">
        <p>
          Deployments whose database predates newer columns still work: the
          newer fields ride along inside an existing column until the
          operator migrates, and the app reads both shapes. Data is never
          dropped for being newer than the schema.
        </p>
      </Callout>

      <H2 id="onelist">One list of sessions</H2>
      <p>
        Chat conversations and Logos lines of thinking live in one store and
        one sidebar, interleaved by when you last touched each — the Logos
        glyph on a row tells you which surface opens it. Opening a Logos
        session switches the model to Logos; leaving Logos returns you to
        whichever Core model you came from.
      </p>

      <H2 id="deletion">Deletion</H2>
      <p>
        Deleting a session deletes it from wherever it lives — your account
        when signed in, the browser otherwise. Subscription state follows
        Stripe: cancelling in the billing portal ends renewal, and the{' '}
        <Link href="/docs/socria-one">entitlement rules</Link> keep access
        through what you already paid for.
      </p>
    </Article>
  );
}
