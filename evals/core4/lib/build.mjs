// Bundle the REAL chat route for in-process evaluation.
//
// The route, the cognition modules, the Mind Graph and the prompt are exactly
// what ships. Only the three things an eval cannot use are swapped: Supabase
// (an in-memory database that enforces keys), Clerk (a settable user id) and
// `server-only` (a guard that has no meaning outside Next). The model is NOT
// swapped at build time — the harness installs a client through the seam in
// lib/core4/model.ts, so the same bundle runs live or stepwise.

import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, '..', '..', '..');
const HELPERS = join(ROOT, 'test', 'helpers');
export const FAKE_DB = join(HELPERS, 'fake-supabase.mjs');

export async function buildRoute(outDir) {
  mkdirSync(outDir, { recursive: true });
  await build({
    entryPoints: { chat: join(ROOT, 'app/api/chat/route.ts') },
    bundle: true,
    format: 'esm',
    platform: 'node',
    outdir: outDir,
    outExtension: { '.js': '.mjs' },
    tsconfig: join(ROOT, 'tsconfig.json'),
    plugins: [
      {
        name: 'eval-swap',
        setup(b) {
          b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
            const p = a.path.startsWith('@/') ? join(ROOT, a.path.slice(2)) : res(a.resolveDir, a.path);
            if (p === join(ROOT, 'lib', 'supabase')) return { path: pathToFileURL(FAKE_DB).href, external: true };
            return undefined;
          });
          b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({
            path: pathToFileURL(join(HELPERS, 'fake-clerk.mjs')).href,
            external: true,
          }));
          b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(HELPERS, 'server-only-shim.mjs') }));
          b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
        },
      },
    ],
    external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend', 'unpdf', 'openai'],
    logLevel: 'error',
  });
  return join(outDir, 'chat.mjs');
}

/** The pure text utilities the grader uses — the SAME code the guard uses, so "a question" means one thing. */
export async function buildGraderLib(outDir) {
  mkdirSync(outDir, { recursive: true });
  await build({
    // `problem`, `counterfactual` and `calibration` are here for
    // evals/core4/validate.mjs (E17/E18), which drives the REAL functions
    // against labelled ground truth rather than testing a copy of them.
    entryPoints: {
      questions: join(ROOT, 'lib/core4/questions.ts'),
      considered: join(ROOT, 'lib/core4/considered.ts'),
      problem: join(ROOT, 'lib/core4/problem.ts'),
      counterfactual: join(ROOT, 'lib/core4/counterfactual.ts'),
      calibration: join(ROOT, 'lib/core4/calibration.ts'),
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    outdir: outDir,
    outExtension: { '.js': '.mjs' },
    logLevel: 'error',
  });
  return {
    questions: join(outDir, 'questions.mjs'),
    considered: join(outDir, 'considered.mjs'),
    problem: join(outDir, 'problem.mjs'),
    counterfactual: join(outDir, 'counterfactual.mjs'),
    calibration: join(outDir, 'calibration.mjs'),
  };
}
