// The technical reference: stack, API surface, environment, self-deploy.
// Checkable against package.json, middleware.ts, app/api/**, .env.example,
// supabase/schema.sql, lib/rate-limit.ts.

import Link from 'next/link';
import { Article, H2, Callout, Defs, Def, TableWrap } from '../Article';
import { docPage } from '../registry';

const page = docPage('technical')!;
const sections = [
  { id: 'stack', heading: 'The stack' },
  { id: 'engines', heading: 'Model engines' },
  { id: 'api', heading: 'API reference' },
  { id: 'limits', heading: 'Rate limits' },
  { id: 'storage', heading: 'Database' },
  { id: 'env', heading: 'Environment variables' },
  { id: 'deploy', heading: 'Running your own' },
];

export function Technical() {
  return (
    <Article page={page} sections={sections}>
      <H2 id="stack">The stack</H2>
      <Defs>
        <Def term="Framework">Next.js 14 (App Router), React 18, TypeScript.</Def>
        <Def term="Styling">Tailwind plus extensive hand-written CSS; four Google fonts — Instrument Serif (display), Inter (body), Kalam (the Board&rsquo;s handwriting), STIX Two Text (equations).</Def>
        <Def term="Auth">Clerk — middleware on every page and API route except static assets and the Studio.</Def>
        <Def term="Storage">Supabase Postgres, reached only from the server with the service-role key. The browser never talks to the database.</Def>
        <Def term="Billing">Stripe subscriptions, pinned API version, webhook-driven.</Def>
        <Def term="Math">KaTeX, rendered with <code>trust: false</code> and bounded size/expansion so hostile TeX cannot break layout or inject markup.</Def>
        <Def term="Journal">Sanity (the blog and its Studio at <code>/studio</code>).</Def>
        <Def term="Evals">An A/B conversational eval replays 22 multi-turn scenarios (plus a depth-comparison case) against Core 3.1 with its controller on vs. off; deterministic checks always run, and a model judge joins when the eval is given an API key (<code>npm run eval:core3</code>).</Def>
      </Defs>

      <H2 id="engines">Model engines</H2>
      <p>
        Each Socria model runs on its own underlying OpenAI engine, every one
        overridable per deployment, and the two premium models auto-retry on
        a fallback engine if the configured id is rejected — a mis-set model
        id never takes the product down:
      </p>
      <TableWrap>
        <table>
          <thead>
            <tr><th>Surface</th><th>Default engine</th><th>Override</th><th>Fallback</th></tr>
          </thead>
          <tbody>
            <tr><td>Core 2</td><td><code>gpt-4o-mini</code></td><td><code>OPENAI_MODEL</code></td><td>—</td></tr>
            <tr><td>Core 3.1</td><td><code>gpt-5.6-luna</code></td><td><code>OPENAI_MODEL_CORE_3</code></td><td><code>gpt-4o</code></td></tr>
            <tr><td>Logos</td><td><code>gpt-5.6-sol</code></td><td><code>OPENAI_MODEL_LOGOS</code> (map: <code>OPENAI_MODEL_LOGOS_MAP</code>)</td><td><code>gpt-4o</code></td></tr>
            <tr><td>Background passes</td><td><code>gpt-4o-mini</code></td><td><code>OPENAI_MEMORY_MODEL</code>, <code>OPENAI_INSIGHT_MODEL</code>, <code>OPENAI_SYNTHESIS_MODEL</code>, <code>OPENAI_JOURNEY_MODEL</code>, <code>OPENAI_STATE_MODEL</code></td><td>—</td></tr>
          </tbody>
        </table>
      </TableWrap>

      <H2 id="api">API reference</H2>
      <p>
        Auth comes in three flavors: <strong>account</strong> (Clerk session
        required), <strong>account/key</strong> (a session or a valid access
        key), and <strong>open</strong>. All model-calling routes are rate
        limited.
      </p>
      <TableWrap>
        <table>
          <thead>
            <tr><th>Route</th><th>Auth</th><th>Does</th></tr>
          </thead>
          <tbody>
            <tr><td><code>POST /api/chat</code></td><td>account/key¹</td><td>Streams a Core reply; Core 3.1 adds the per-turn controller and semantic state pass</td></tr>
            <tr><td><code>GET·PUT·POST /api/conversations</code></td><td>account</td><td>List, upsert, and bulk-migrate conversations (chat and Logos both)</td></tr>
            <tr><td><code>DELETE /api/conversations/:id</code></td><td>account</td><td>Delete one conversation, scoped to its owner</td></tr>
            <tr><td><code>GET·PUT /api/profile</code></td><td>account</td><td>Imported AI-history profile + the Thinking Journey; partial updates only</td></tr>
            <tr><td><code>POST /api/extract-memory</code></td><td>account/key</td><td>Updates thread memory after each Core 3.1 exchange</td></tr>
            <tr><td><code>POST /api/generate-insight</code></td><td>account/key</td><td>One insight card, when earned</td></tr>
            <tr><td><code>POST /api/generate-synthesis</code></td><td>account/key</td><td>A structured synthesis, paced by depth</td></tr>
            <tr><td><code>POST /api/update-understanding</code></td><td>account/key</td><td>Refreshes the cross-conversation journey; guarded against wipes</td></tr>
            <tr><td><code>POST /api/logos/chat</code></td><td>account/key</td><td>Streams the Logos reply (optionally focused on one node)</td></tr>
            <tr><td><code>POST /api/logos/map</code></td><td>account/key</td><td>Re-extracts the Thinking Map; clamps depth and caps free maps server-side</td></tr>
            <tr><td><code>POST /api/logos/explore</code></td><td>account/key</td><td>The four node moves; free Research past the first returns 402</td></tr>
            <tr><td><code>POST /api/logos/draft</code></td><td>account/key</td><td>The five Draft Space actions on a selected passage</td></tr>
            <tr><td><code>POST /api/logos/read</code></td><td>account/key</td><td>Reads an attached image once into text</td></tr>
            <tr><td><code>GET /api/logos/sources</code> · <code>POST …/search</code> · <code>POST …/fetch</code></td><td>account/key</td><td>Lists context sources; searches one; fetches one chosen item</td></tr>
            <tr><td><code>GET·DELETE /api/logos/connections</code>, <code>GET /api/logos/connect/:provider(/callback)</code></td><td>account/key³</td><td>Per-user OAuth connections (dormant unless enabled)</td></tr>
            <tr><td><code>GET /api/logos/plan</code></td><td>open</td><td>The server&rsquo;s answer on your plan; anonymous resolves to free</td></tr>
            <tr><td><code>POST /api/logos/redeem</code></td><td>open²</td><td>Redeems an access code; signed-in redemptions follow the account</td></tr>
            <tr><td><code>POST /api/stripe/checkout</code> · <code>portal</code></td><td>account</td><td>Start a subscription; open the billing portal</td></tr>
            <tr><td><code>POST /api/stripe/webhook</code></td><td>signature</td><td>The only writer of Stripe lifecycle state; verifies before parsing</td></tr>
          </tbody>
        </table>
      </TableWrap>
      <p>
        ¹ Core 2 is open to anonymous users; Core 3.1 requires the account or
        key. ² Rate limited; typed codes are also checked on every account/key
        route, so this is the throttled front door rather than the only door —
        and the codes are soft gates by design, not secrets. ³ Reading
        connection status allows the key; connecting and disconnecting
        require the account.
      </p>
      <Callout tag="Entitlement is decided server-side">
        <p>
          Every gated route resolves the plan itself, in order: live Stripe
          subscription → account grant → operator allowlist → typed code. The
          browser states what it believes; the server decides. Free-tier
          research is the one deliberate exception — a client-reported count,
          because it is a boundary, not a lock.
        </p>
      </Callout>

      <H2 id="limits">Rate limits</H2>
      <p>
        Fixed-window limits keyed by user id (or IP when anonymous), backed
        by Upstash Redis when configured and per-instance memory otherwise.
        Two buckets: <strong>chat</strong> (the expensive models) at 20/min
        · 400/day signed in and 8/min · 80/day anonymous; <strong>aux</strong>{' '}
        (background passes, node moves, billing surfaces) at 40/min ·
        1,200/day signed in and 20/min · 300/day anonymous. Over budget
        returns 429 with a Retry-After.
      </p>

      <H2 id="storage">Database</H2>
      <p>
        Four tables, defined idempotently in <code>supabase/schema.sql</code>:
      </p>
      <Defs>
        <Def term={<code>conversations</code>}>
          Chat and Logos sessions in one table, told apart by{' '}
          <code>kind</code>; messages, memory, the map, the draft and grounded
          contexts. On a database that predates the newer columns, those
          fields ride inside the memory JSON until the operator migrates —
          nothing is dropped.
        </Def>
        <Def term={<code>user_profiles</code>}>
          The imported AI-history profile and the Thinking Journey.
        </Def>
        <Def term={<code>logos_connections</code>}>
          OAuth token bundles, AES-256-GCM encrypted with a key derived from{' '}
          <code>CONNECTION_SECRET</code> — never plaintext.
        </Def>
        <Def term={<code>socria_subscriptions</code>}>
          The local projection of Stripe — lifecycle state written by the
          webhook, plus the pre-checkout customer stub and complimentary
          rows from redeemed codes.
        </Def>
      </Defs>

      <H2 id="env">Environment variables</H2>
      <TableWrap>
        <table>
          <thead>
            <tr><th>Variable</th><th>Needed for</th></tr>
          </thead>
          <tbody>
            <tr><td><code>OPENAI_API_KEY</code></td><td>Everything — the one hard requirement</td></tr>
            <tr><td><code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code>, <code>CLERK_SECRET_KEY</code></td><td>Sign-in and cross-device sync</td></tr>
            <tr><td><code>SUPABASE_URL</code>, <code>SUPABASE_SERVICE_ROLE_KEY</code></td><td>Cloud-stored conversations</td></tr>
            <tr><td><code>NEXT_PUBLIC_SITE_URL</code></td><td>Canonical origin — metadata, OAuth redirects, Stripe return URLs</td></tr>
            <tr><td><code>STRIPE_SECRET_KEY</code>, <code>STRIPE_PRICE_SOCRIA_ONE</code>, <code>STRIPE_WEBHOOK_SECRET</code></td><td>Socria One billing (without them, access codes still work)</td></tr>
            <tr><td><code>SOCRIA_ONE_USER_IDS</code></td><td>Comma-separated Clerk ids comped onto One</td></tr>
            <tr><td><code>SERPER_API_KEY</code> or <code>TAVILY_API_KEY</code></td><td>Web research; with neither, Logos shows zero sources rather than inventing any</td></tr>
            <tr><td><code>NEXT_PUBLIC_SANITY_PROJECT_ID</code> (+ dataset, api version)</td><td>The journal</td></tr>
            <tr><td><code>UPSTASH_REDIS_REST_URL</code>, <code>UPSTASH_REDIS_REST_TOKEN</code></td><td>Cross-instance rate limits (in-memory fallback otherwise)</td></tr>
            <tr><td><code>CONNECTION_SECRET</code></td><td>Encrypting OAuth tokens (16+ chars); nothing stores without it</td></tr>
            <tr><td><code>SOCRIA_CONNECTORS</code> + <code>NEXT_PUBLIC_SOCRIA_CONNECTORS</code></td><td>Waking the dormant connectors (both must be <code>on</code>)</td></tr>
            <tr><td><code>GOOGLE_OAUTH_CLIENT_ID/SECRET</code>, <code>NOTION_OAUTH_CLIENT_ID/SECRET</code></td><td>The per-user OAuth apps, if connectors are on</td></tr>
            <tr><td><code>OPENAI_MODEL*</code> family</td><td>Per-surface engine overrides (table above)</td></tr>
            <tr><td><code>RATE_LIMIT_DISABLED</code>, <code>SOCRIA_DISABLE_STATE</code></td><td>Kill switches: limiting off (effective in any environment — never set it in production) and Core 3.1&rsquo;s state pass off</td></tr>
          </tbody>
        </table>
      </TableWrap>

      <H2 id="deploy">Running your own</H2>
      <ol>
        <li>Set <code>OPENAI_API_KEY</code> — the app runs with just this, local-only.</li>
        <li>Add Clerk keys for accounts, and Supabase keys plus one run of{' '}
          <code>supabase/schema.sql</code> (idempotent — safe to re-run) for
          cloud sync.</li>
        <li>Add a search provider key if you want Research to cite anything.</li>
        <li>For billing: create the $15/month price in Stripe, point a
          webhook at <code>/api/stripe/webhook</code> subscribed to{' '}
          <code>checkout.session.completed</code> and{' '}
          <code>customer.subscription.created&thinsp;/&thinsp;updated&thinsp;/&thinsp;deleted</code>,
          and set the three Stripe variables.</li>
      </ol>
      <p>
        Everything degrades deliberately: no Supabase means local-only
        sessions, no Stripe means codes-only membership, no search key means
        sourceless research, no Sanity means no journal. Missing
        configuration turns features off; it does not break the ones that
        remain.
      </p>
    </Article>
  );
}
