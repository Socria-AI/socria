// The environment gate.
//
// Run in CI and before a build. This is the ONE place a bad environment stops
// the pipeline — nothing at runtime throws, because a running deployment
// serving real people must not be killed by a validator.
//
//   npm run check:env                  checks against this shell
//   TARGET=production npm run check:env   checks production's requirements
//
// Exits non-zero when something is missing, malformed, or — worst — when a
// secret has been exposed to the browser through a NEXT_PUBLIC_ prefix.

import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'socria-env-'));
try {
  const outfile = join(dir, 'env.mjs');
  await build({
    entryPoints: ['lib/env.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    logLevel: 'error',
  });
  const { checkEnv, formatProblems } = await import(pathToFileURL(outfile).href);

  const target =
    process.env.TARGET ||
    process.env.VERCEL_ENV ||
    (process.env.NODE_ENV === 'production' ? 'production' : 'development');

  const problems = checkEnv(process.env, target);
  const leaked = problems.filter((p) => p.kind === 'leaked');

  if (!problems.length) {
    console.log(`environment ok for "${target}"`);
    process.exit(0);
  }

  console.error(`\nEnvironment problems for "${target}":\n`);
  console.error(formatProblems(problems));
  console.error(
    leaked.length
      ? '\nA secret is reachable from the browser. Rotate it — anything inlined into a client bundle is public in every build already deployed.\n'
      : '\nSee .env.example for what each variable is for.\n'
  );
  process.exit(1);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
