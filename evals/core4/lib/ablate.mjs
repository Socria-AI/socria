// Build a Core 4 route with one or more mechanisms switched OFF.
//
// WHY THIS EXISTS. The question a mechanism has to answer is not "could a
// prompt reproduce my internals" but "does the reply get worse without me".
// Only an ablation answers that, and only if the ablated build is otherwise
// byte-identical to the real one.
//
// WHY IT IS A BUILD PLUGIN AND NOT AN ENV VAR. A runtime flag to disable a
// mechanism is production machinery that exists solely to serve an experiment:
// it has to be read, defaulted, documented and tested, and it is one bad
// default away from shipping a disabled mechanism to real people. A build-time
// stub cannot reach production because it exists only inside the eval's own
// bundle.
//
// WHY IT DOES NOT PATCH THE WORKING TREE. An earlier ablation (run 9b) edited
// the source, built, and edited it back. That works until something fails in
// between, and then the repository is left holding a deliberately broken
// function with no sign of it. This intercepts the import instead: the files
// on disk are never touched.
//
// The stub re-exports every name the real module exports, so `turn.ts` links
// exactly as it would otherwise. The disabled functions return the same
// "nothing to report" values they return in production when a probe fails or
// finds nothing — which is the correct null hypothesis. The arm is not Core 4
// with a hole in it; it is Core 4 on a turn where the mechanism found nothing.

import { buildRoute } from './build.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** What can be switched off, and what the module looks like when it is. */
export const MECHANISMS = {
  // Counterfactual ablation: no premise is ever put to a test.
  counterfactual: {
    module: 'counterfactual',
    stub: `
      export const CF_FLOOR = 0.55;
      export const MAX_ABLATIONS = 6;
      export function targetOf() { return null; }
      export function candidates() { return []; }
      export async function ablateOne() { return null; }
      export async function testDependencies() { return null; }
      export function renderCounterfactual() { return ''; }
      export function contradictionCandidates() { return []; }
      export async function testContradictions() { return []; }
      export function renderContradictions() { return ''; }
    `,
  },
  // Measured contradiction only — ablation left intact.
  contradiction: {
    module: 'counterfactual',
    keepReal: true,
    stub: `
      export * from '__REAL__';
      import { renderCounterfactual as __rc } from '__REAL__';
      export async function testContradictions() { return []; }
      export function renderContradictions() { return ''; }
    `,
  },
  // Sampled disagreement: the claim is never re-derived.
  calibration: {
    module: 'calibration',
    stub: `
      export const SAMPLES = 5;
      export const SAME = 0.5;
      export const SPLIT_AT = 0.6;
      export function claimOf() { return null; }
      export function sameAnswer() { return false; }
      export function cluster() { return []; }
      export async function calibrate() { return null; }
      export function renderCalibration() { return ''; }
    `,
  },
  // The whole missing-contribution layer: the structure says nothing.
  contribution: {
    module: 'contribution',
    stub: `
      export const MISSING_KINDS = [];
      export function detectMissing() { return []; }
      export function gateContributions() { return []; }
      export function renderMissing() { return ''; }
    `,
  },
};

/**
 * Build the chat route with `off` disabled.
 *
 * @param {string} outDir      where to put chat.mjs
 * @param {string[]} off       keys of MECHANISMS to switch off
 */
export async function buildAblatedRoute(outDir, off) {
  const unknown = off.filter((k) => !MECHANISMS[k]);
  if (unknown.length) throw new Error(`unknown mechanism(s): ${unknown.join(', ')}`);

  const byModule = new Map();
  for (const key of off) {
    const m = MECHANISMS[key];
    if (byModule.has(m.module)) {
      throw new Error(`two ablations target lib/core4/${m.module}.ts; run them as separate arms so each result has one cause`);
    }
    byModule.set(m.module, m);
  }

  const stub = {
    name: 'ablate',
    setup(b) {
      for (const mod of byModule.keys()) {
        b.onResolve({ filter: new RegExp(`(^|/)${mod}$`) }, (args) => {
          if (!args.importer.includes('/lib/core4/')) return null;
          return { path: `ablate:${mod}`, namespace: 'ablate' };
        });
      }
      b.onLoad({ filter: /.*/, namespace: 'ablate' }, (args) => {
        const mod = args.path.replace('ablate:', '');
        const spec = byModule.get(mod);
        return {
          contents: spec.stub.replaceAll('__REAL__', join(ROOT, 'lib', 'core4', `${mod}.ts`)),
          loader: 'ts',
          resolveDir: join(ROOT, 'lib', 'core4'),
        };
      });
    },
  };

  // The SAME build the real route uses, with one plugin in front of it.
  return buildRoute(outDir, { plugins: [stub] });
}
