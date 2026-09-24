// Bundle the libraries under test into plain ESM.
//
// The suites exercise pure modules — the evaluator, the visualisation
// builders, the entitlement table, the local detectors. None of them touch
// React, the network or the database, which is what makes them fast enough to
// run on every push and worth trusting when they pass.
//
// esbuild rather than a test framework: the project already carries it, it
// strips the types in milliseconds, and a runner this small is easier to read
// than the configuration a framework would need.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const OUT = join(here, '..', '.tmp');

/** Every module a suite may import. Add one here when a suite needs it. */
const MODULES = [
  'lib/logos-math.ts',
  'lib/logos-viz.ts',
  'lib/logos-layout.ts',
  'lib/logos.ts',
  'lib/entitlements.ts',
  'lib/usage-scope.ts',
  'lib/logos-flow.ts',
  'lib/onboarding.ts',
  'lib/onboarding-script.ts',
  'lib/pfp.ts',
  'lib/tour.ts',
  'lib/hints.ts',
  'lib/find.ts',
  'lib/socria-one.ts',
  'lib/rich-text.ts',
  'lib/easter-eggs.ts',
  'lib/upstream-error.ts',
  'lib/upstream-health.ts',
  'lib/socria-model-store.ts',
  'lib/math-context.ts',
  'lib/topic-drift.ts',
  'lib/one-prompt.ts',
  'lib/analytics.ts',
  'lib/tex-split.ts',
  'lib/logos-econ.ts',
  'lib/starters.ts',
  'lib/subscriptions.ts',
  'lib/entitlement-rule.ts',
  'lib/billing-message.ts',
  'lib/stripe-diagnosis.ts',
  'lib/socria-edu.ts',
  'lib/clerk-errors.ts',
  'lib/qr.ts',
  'lib/account-guards.ts',
  'lib/logos-personality.ts',
  'lib/logos-viz3d.ts',
  'lib/why-not-answer.ts',
  'lib/wrong-chat.ts',
  'lib/auth-links.ts',
  'lib/auth-flow.ts',
  'lib/session-rail.ts',
  'lib/logos-connect.ts',
  'lib/access-codes-server.ts',
  'lib/local-data.ts',
  'lib/cognition/state.ts',
  'lib/core4/signals.ts',
  'lib/core4/questions.ts',
  'lib/core4/merge.ts',
  'lib/core4/budget.ts',
  'lib/core4/allocation.ts',
  'lib/core4/intervene.ts',
  'lib/core4/considered.ts',
  'lib/core4/problem.ts',
  'lib/core4/contribution.ts',
  'lib/core4/guard2.ts',
  'lib/core4/verify.ts',
  'lib/core4/ledger.ts',
  'lib/core4/capability.ts',
  'lib/core4/counterfactual.ts',
  'lib/core4/history.ts',
  'lib/core4/trace.ts',
  'lib/core4/stream-gate.ts',
  'lib/cognition/router.ts',
  'lib/cognition/guard.ts',
  'lib/mind/types.ts',
  'lib/mind/layout.ts',
  'lib/mind/projects.ts',
  'lib/mind/resolve.ts',
  'lib/mind/gate.ts',
  'lib/mind/apply.ts',
  'lib/mind/activate.ts',
  'lib/mind/serialize.ts',
  'lib/mind/extract.ts',
  'lib/mind/ingest-text.ts',
  'lib/collab.ts',
  'lib/collab-transport.ts',
  'lib/checkout-attribution.ts',
  'lib/person-memory.ts',
  'lib/file-kinds.ts',
  'lib/file-extract.ts',
  'lib/asl-fingerspell.ts',
  'lib/first-session.ts',
  'components/MapPoster.tsx',
  'lib/lifecycle.ts',
  'lib/email.ts',
  'lib/socria-prompt.ts',
  'app/explore/scenarios.ts',
];

export async function buildAll() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const root = join(here, '..', '..');
  await Promise.all(
    MODULES.map((m) =>
      build({
        entryPoints: [join(root, m)],
        bundle: true,
        format: 'esm',
        platform: 'node',
        outfile: join(OUT, m.split('/').pop().replace(/\.tsx?$/, '.mjs')),
        // tsconfig says jsx: preserve, which Node cannot load; the one .tsx
        // module under test (the poster) is bundled with the automatic runtime.
        jsx: 'automatic',
        // `server-only` is a guard, not code: its whole job is to throw when
        // resolved for a browser. esbuild picks the browser condition by
        // default even at platform:'node', so a server-only module under test
        // would explode on import. Resolving it as Next.js does on the server
        // gives the no-op, and the guard still does its real job at build time
        // — test/no-client-secrets asserts separately that no client component
        // imports one of these modules.
        // See test/helpers/server-only-shim.mjs: the marker package throws
        // when resolved outside a server component, which would stop a
        // server-only module being tested at all.
        alias: { 'server-only': join(here, 'server-only-shim.mjs') },
        // undici uses dynamic require() internally, which does not survive
        // being bundled into ESM. It is a real dependency at runtime, so let
        // Node resolve it there instead of inlining it.
        // Both use dynamic require() internally, which does not survive
        // being bundled into ESM. They are real dependencies at runtime, so
        // Node resolves them there.
        external: ['undici', 'openai', 'unpdf'],
        logLevel: 'error',
      })
    )
  );
}
