// lib/env.ts
//
// What this deployment needs, checked once, where it can be read.
//
// Until now every variable was read straight from process.env at its point of
// use, with no schema and no check. A typo'd SUPABASE_URL did not fail the
// deploy — it failed the first query, as a 500, for whoever happened to be
// using the product at the time. The difference between a misconfiguration
// and an outage was who noticed first.
//
// The rule this file follows, and the reason it will not take the site down:
//
//   AT BUILD / STARTUP  → shout. Print exactly what is missing or malformed.
//   IN PRODUCTION       → never throw. A running deployment that is already
//                         serving people must not be killed by a validator;
//                         the routes that need a missing variable already
//                         return a clean error for it.
//
// Failing the BUILD is where strictness belongs, because nobody is using a
// build. `npm run check:env` is the CI gate, and it is the one place a
// missing variable stops the pipeline.

type Scope = 'server' | 'public';

interface Spec {
  name: string;
  scope: Scope;
  /** what breaks without it */
  needed: string;
  /** required everywhere, or only in production */
  required: 'always' | 'production' | 'optional';
  /** shape check, when the shape is knowable */
  looksLike?: RegExp;
  /** a hint when the value is present but wrong */
  hint?: string;
}

export const ENV_SPEC: Spec[] = [
  {
    name: 'OPENAI_API_KEY',
    scope: 'server',
    needed: 'every model call — chat, the Thinking Map, Explore, image reading',
    required: 'always',
    looksLike: /^sk-/,
  },
  {
    name: 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
    scope: 'public',
    needed: 'sign-in',
    required: 'always',
    looksLike: /^pk_(test|live)_/,
    hint: 'pk_test_ for preview and local, pk_live_ only for production — see docs/PRIVATE-DEV.md',
  },
  {
    name: 'CLERK_SECRET_KEY',
    scope: 'server',
    needed: 'sign-in',
    required: 'always',
    looksLike: /^sk_(test|live)_/,
  },
  {
    name: 'SUPABASE_URL',
    scope: 'server',
    needed: 'cloud-stored conversations, usage counters, subscriptions',
    required: 'always',
    looksLike: /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/,
  },
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    scope: 'server',
    needed: 'every database read and write',
    required: 'always',
    looksLike: /^ey/,
    hint: 'the service_role key, not the anon key — this one is server-only and must never be NEXT_PUBLIC_',
  },
  {
    name: 'NEXT_PUBLIC_SITE_URL',
    scope: 'public',
    needed: 'OAuth redirect URIs and Stripe return URLs',
    required: 'production',
    looksLike: /^https?:\/\/[^\s/]+$/,
    hint: 'no trailing slash. Leave UNSET on previews so the request origin is used',
  },
  {
    name: 'STRIPE_SECRET_KEY',
    scope: 'server',
    needed: 'subscribing to Socria One',
    required: 'production',
    looksLike: /^sk_(test|live)_/,
  },
  {
    name: 'STRIPE_PRICE_SOCRIA_ONE',
    scope: 'server',
    needed: 'the checkout session',
    required: 'production',
    looksLike: /^price_/,
  },
  {
    name: 'STRIPE_WEBHOOK_SECRET',
    scope: 'server',
    needed: 'verifying Stripe callbacks — without it the webhook refuses everything',
    required: 'production',
    looksLike: /^whsec_/,
  },
  {
    name: 'CONNECTION_SECRET',
    scope: 'server',
    needed: 'encrypting stored OAuth tokens',
    required: 'optional',
    looksLike: /^.{16,}$/,
    hint: 'at least 16 characters. Rotating it orphans every existing connection',
  },
  {
    name: 'NEXT_PUBLIC_SANITY_PROJECT_ID',
    scope: 'public',
    needed: 'the journal',
    required: 'optional',
  },
  {
    name: 'UPSTASH_REDIS_REST_URL',
    scope: 'server',
    needed: 'rate limiting across instances; without it limits are per-instance',
    required: 'optional',
    looksLike: /^https:\/\//,
  },
];

export interface EnvProblem {
  name: string;
  kind: 'missing' | 'malformed' | 'leaked';
  message: string;
}

/**
 * Check the environment. Pure — returns problems rather than throwing, so the
 * caller decides what a problem is worth.
 */
export function checkEnv(
  env: NodeJS.ProcessEnv = process.env,
  target: 'production' | 'preview' | 'development' = 'development'
): EnvProblem[] {
  const problems: EnvProblem[] = [];

  for (const spec of ENV_SPEC) {
    const value = env[spec.name]?.trim();
    const mustHave =
      spec.required === 'always' || (spec.required === 'production' && target === 'production');

    if (!value) {
      if (mustHave) {
        problems.push({
          name: spec.name,
          kind: 'missing',
          message: `missing — needed for ${spec.needed}`,
        });
      }
      continue;
    }

    if (spec.looksLike && !spec.looksLike.test(value)) {
      problems.push({
        name: spec.name,
        kind: 'malformed',
        message: `does not look right${spec.hint ? ` — ${spec.hint}` : ''}`,
      });
    }
  }

  // The one check that is about safety rather than correctness: a secret must
  // never be published to the browser. NEXT_PUBLIC_ is a one-way door — once
  // a value is inlined into the client bundle it is public forever, including
  // in every build already deployed.
  for (const key of Object.keys(env)) {
    if (!key.startsWith('NEXT_PUBLIC_')) continue;
    const v = env[key] ?? '';
    const looksSecret =
      /^sk_live_|^sk_test_|^whsec_|^sk-[A-Za-z0-9]{20}|service_role/.test(v) ||
      /SECRET|SERVICE_ROLE|PRIVATE_KEY/i.test(key);
    if (looksSecret) {
      problems.push({
        name: key,
        kind: 'leaked',
        message: 'a secret is exposed to the browser — remove the NEXT_PUBLIC_ prefix',
      });
    }
  }

  return problems;
}

/** Human-readable, for a build log or a terminal. */
export function formatProblems(problems: EnvProblem[]): string {
  const order = { leaked: 0, missing: 1, malformed: 2 } as const;
  return problems
    .slice()
    .sort((a, b) => order[a.kind] - order[b.kind])
    .map((p) => `  ${p.kind.toUpperCase().padEnd(9)} ${p.name}\n            ${p.message}`)
    .join('\n');
}
