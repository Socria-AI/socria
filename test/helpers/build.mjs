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
        outfile: join(OUT, m.split('/').pop().replace(/\.ts$/, '.mjs')),
        logLevel: 'error',
      })
    )
  );
}
