#!/usr/bin/env node
// Advance one scenario on one arm as far as the available completions allow.
//
//   node evals/core4/step.mjs --run <dir> --scenario <id> --arm core4|baseline
//
// Prints one JSON line:
//   {"status":"done","result":"<file>"}                     the scenario is complete
//   {"status":"pending","pending":["<request.json>", ...]}  answer these, then run again
//   {"status":"error","error":"..."}
//
// In STEPWISE mode (the default) each pending request file holds the exact
// system prompt and messages the pipeline sent; write the completion text to
// the file named in its "answerTo" field. With --live and OPENAI_API_KEY set,
// no client is installed and the production client answers every call.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildRoute, FAKE_DB } from './lib/build.mjs';
import { stepwiseClient, freezeWorld } from './lib/clients.mjs';
import { runCore4, runBaseline } from './lib/runner.mjs';
import { loadCorpus } from './lib/corpus.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]?.startsWith('--') ? true : all[i + 1] ?? true]] : acc), [])
);
const runDir = resolve(args.run || 'evals/core4/runs/scratch');
const arm = args.arm || 'core4';
const live = !!args.live;

const quiet = (orig) => (...a) => {
  const first = typeof a[0] === 'string' ? a[0] : '';
  if (first.startsWith('[socria') || first.startsWith('conversations')) return;
  orig(...a);
};
console.error = quiet(console.error.bind(console));
console.warn = quiet(console.warn.bind(console));
// The route's dev log and the expected "pending" stream errors are noise
// here; the one JSON line on stdout is the interface.
console.log = () => {};
const realError = console.error;
console.error = (...a) => {
  const first = typeof a[0] === 'string' ? a[0] : '';
  if (first.startsWith('stream error') || first.startsWith('[socria')) return;
  realError(...a);
};
const say = (o) => process.stdout.write(JSON.stringify(o) + '\n');

try {
  const scenario = loadCorpus().find((s) => s.id === args.scenario);
  if (!scenario) throw new Error(`no scenario "${args.scenario}"`);
  mkdirSync(runDir, { recursive: true });
  const routePath = join(runDir, '.build', 'chat.mjs');
  if (!existsSync(routePath)) await buildRoute(join(runDir, '.build'));

  const world = freezeWorld();
  const step = stepwiseClient(runDir, arm);
  if (!live) globalThis.__socriaModelClient = step.client;
  const { db } = await import(pathToFileURL(FAKE_DB).href);

  // Arms: core4 (the real route), baseline (A1: strongest prompt, equal
  // token cap), bplus (A2: A1 plus one self-critique pass — the primary
  // comparator, council D16).
  // Arms: core4 | baseline (A1, oracle memory) | bplus (A2) | natural (A1
  // with only this session, which is what a prompt-only product really has).
  const res = arm === 'baseline' || arm === 'bplus' || arm === 'natural'
    ? await runBaseline(scenario, { step, world, critique: arm === 'bplus', memory: arm === 'natural' ? 'natural' : 'oracle' })
    : await runCore4(scenario, { routePath, db, step, world });

  if (res.status === 'done') {
    const dir = join(runDir, 'results', arm);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${scenario.id}.json`);
    writeFileSync(file, JSON.stringify({ scenario: scenario.id, arm, sessions: res.sessions, calls: step.calls.length }, null, 2));
    say({ status: 'done', result: file });
  } else {
    // Only status and the pending request. The run's sessions carry each
    // turn's `expect`, and printing them here showed the model players what
    // behaviour was wanted (pilot run, reported by a player agent). A player
    // must see requests and nothing else.
    say(res.status === 'pending' ? { status: 'pending', pending: res.pending } : { status: res.status, error: res.error });
  }
  process.exit(0);
} catch (e) {
  say({ status: 'error', error: String(e?.stack || e) });
  process.exit(1);
}
