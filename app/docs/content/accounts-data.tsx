// Accounts, storage, sync, deletion. Checkable against middleware.ts,
// supabase/schema.sql, app/api/conversations/route.ts, lib/logos-sessions.ts,
// lib/guest-pass.ts (a guest's one line of thinking) and components/LogosApp.tsx
// (what a signed-out browser holds is saved to the account on sign-in).

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
        You can use Socria without an account. Signed out, Logos 5 gives you
        one line of thinking and its map, kept in that browser; starting a
        second asks you to sign up — free — and the one you have comes with
        you. An access key opens Logos 5 without an account as well, and what
        you think through with it is kept in that browser too.
      </p>

      <H2 id="signedin">Signed in</H2>
      <p>
        Accounts are handled by Clerk. On your first sign-in from a browser
        that holds conversations kept while signed out, they are saved to your
        account — once — and are then no longer kept in the browser; from then
        on everything syncs. Conversations, maps, drafts and grounded material
        follow you across devices.
      </p>

      <H2 id="where">What lives where</H2>
      <Defs>
        <Def term="Your account (cloud)">
          Conversations and Logos sessions (each holding its messages, map,
          draft and grounded contexts), your cross-conversation Thinking
          Journey, your Conversation Style, redeemed grants, the free
          plan&rsquo;s counts of the chats you start and the messages you send
          — kept on the server, never in the browser — and, if you subscribe,
          the billing projection Stripe writes.
        </Def>
        <Def term="Your browser (local)">
          Interface state and preferences: the reply length you chose, your
          custom instructions, which solutions you chose to reveal, a copy of
          your Conversation Style so a visit does not wait for it, and — when
          signed out — the conversations themselves.
        </Def>
      </Defs>
      <Callout tag="Older databases">
        <p>
          Deployments whose database predates newer columns still work for
          your sessions: the newer Logos fields — kind, map, draft, grounded
          contexts — ride along inside an existing column of the
          conversations table until the operator migrates, and the app reads
          both shapes, so session data is never dropped for being newer than
          the schema. The one exception is the cross-conversation Thinking
          Journey, whose column has no ride-along — on an un-migrated
          database it simply isn&rsquo;t stored until the schema is run.
        </p>
      </Callout>

      <H2 id="onelist">One list of sessions</H2>
      <p>
        Every conversation lives in one store and on one map. The Universal
        Map holds every line of thinking — the conversations from the earlier
        models among them — and each one opens in Logos 5.
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
