#!/usr/bin/env node
// Intelligent presentation, before and after — offline, no model.
//
//   node evals/logos5/presentation.mjs [--before <git ref>] [--out <file>]
//
// What a Logos 5 reply is TOLD about its shape, for the same prompts, under the
// planner and core prompt at <ref> (default 55bce15, the last commit before
// intelligent presentation) and under this checkout:
//
//   • which inline elements the planner offers each prompt (lib/runtime/
//     presentation.ts planPresentation), with the same turn reading for both;
//   • the core prompt's rule on the shape of a reply (lib/runtime/behavior.ts).
//
// This measures the instructions, not the replies: what a live model does with
// them needs a key (evals/logos5/run.mjs, the 'presentation' group, with
// --root a worktree of <ref> for its before). Nothing here is a model's output.

import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : d;
};
const BEFORE = arg('--before', '55bce15');
const OUT = arg('--out', join(here, 'results', 'presentation.json'));
const TMP = join(root, 'test', '.tmp', 'eval-presentation');
mkdirSync(TMP, { recursive: true });

const PROMPTS = [
  ['general explanation', 'Give me an overview of microeconomics'],
  ['general explanation', 'What is microeconomics?'],
  ['general explanation', 'Why did the Roman Republic fall?'],
  ['general explanation', 'Can you explain what tax incidence is?'],
  ['general explanation', 'how does a vaccine train the immune system?'],
  ['casual', 'hi'],
  ['casual', 'hey, how is it going?'],
  ['casual', 'thanks, that helped'],
  ['casual', 'I had the worst day at work'],
  ['explicit list', 'List the main concepts of microeconomics'],
  ['explicit list', 'give me a bulleted list of the key ideas in psychology'],
  ['explicit list', 'what are the steps to apply for a passport? just list them'],
  ['multiple concepts', 'Explain the key concepts in statistics'],
  ['multiple concepts', 'What are the main branches of philosophy?'],
  ['multiple concepts', 'teach me the basics of organic chemistry'],
  ['multiple concepts', 'What does macroeconomics cover?'],
  ['comparison', 'compare Python and JavaScript for a beginner'],
  ['comparison', 'what is the difference between mitosis and meiosis'],
  ['mathematics', 'what would a 300k mortgage at 6% over 30 years cost me each month?'],
  ['mathematics', 'solve 2x + 3 = 7'],
  ['mathematics', 'what is calculus?'],
  ['mathematics', 'what are the steps to solve a quadratic equation?'],
  ['complex reasoning', 'Should I refinance my mortgage at 5.5% if I plan to move in 3 years?'],
  ['complex reasoning', 'What happened during the French Revolution?'],
  ['complex reasoning', 'how does a bill become law?'],
  ['UI unnecessary', "what's the capital of France?"],
  ['UI unnecessary', 'how many ounces are in a pound?'],
  ['UI unnecessary', 'tell me about the history of jazz in New Orleans'],
  ['UI unnecessary', 'write an overview of microeconomics for my essay intro'],
  ['UI unnecessary', 'brainstorm some ideas for a microeconomics project'],
];

const common = { bundle: true, format: 'esm', platform: 'node', tsconfig: join(root, 'tsconfig.json'), logLevel: 'error', external: ['react', 'react-dom'] };
// this checkout: the planner, the turn reading it is given, the core prompt
await build({
  ...common,
  stdin: {
    contents: `export { planPresentation } from './lib/runtime/presentation'; export { readTurnState } from './lib/runtime/state'; export { routeTurn } from './lib/runtime/orchestrate'; export { readSignals } from './lib/core4/signals'; export { LOGOS5_CORE } from './lib/runtime/behavior';`,
    resolveDir: root,
    loader: 'ts',
  },
  outfile: join(TMP, 'after.mjs'),
});
// <ref>'s planner and core prompt, resolved against this checkout's modules (they import nothing that changed shape)
const at = (path) => execFileSync('git', ['show', `${BEFORE}:${path}`], { cwd: root, encoding: 'utf8' });
await build({ ...common, stdin: { contents: at('lib/runtime/presentation.ts'), resolveDir: join(root, 'lib', 'runtime'), loader: 'ts' }, outfile: join(TMP, 'before-plan.mjs') });
await build({ ...common, stdin: { contents: at('lib/runtime/behavior.ts'), resolveDir: join(root, 'lib', 'runtime'), loader: 'ts' }, outfile: join(TMP, 'before-behavior.mjs') });
const A = await import(pathToFileURL(join(TMP, 'after.mjs')).href);
const Bp = await import(pathToFileURL(join(TMP, 'before-plan.mjs')).href);
const Bb = await import(pathToFileURL(join(TMP, 'before-behavior.mjs')).href);

const rows = PROMPTS.map(([category, text]) => {
  const signals = A.readSignals(text);
  const state = A.readTurnState({ text, history: [], signals, intent: A.routeTurn({ text }).intent });
  const input = { text, state, signals, questions: 1, ownWriting: false, ownJudgment: false, ownReasoning: false, guard: false, history: [] };
  return { category, text, before: Bp.planPresentation(input).forms, after: A.planPresentation(input).forms };
});

const shapeRule = (core) => core.split('\n').filter((l) => /prose|list|heading|bold|marks this surface|INLINE/i.test(l) && l.startsWith('- ')).join('\n');
const byCategory = {};
for (const r of rows) {
  const c = (byCategory[r.category] ??= { prompts: 0, offeredBefore: 0, offeredAfter: 0 });
  c.prompts++;
  if (r.before.length) c.offeredBefore++;
  if (r.after.length) c.offeredAfter++;
}
const result = {
  about: 'What a Logos 5 reply is told about its shape, before and after intelligent presentation, for the same prompts. Instructions only: no model was run.',
  before: BEFORE,
  rows,
  byCategory,
  changed: rows.filter((r) => r.before.join() !== r.after.join()).length,
  rule: { before: shapeRule(Bb.LOGOS5_CORE), after: shapeRule(A.LOGOS5_CORE) },
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');

const pad = (s, n) => String(s).padEnd(n);
console.log(`presentation offers, ${BEFORE} → this checkout (no model)\n`);
console.log(pad('category', 20), pad('prompt', 66), pad('before', 18), 'after');
for (const r of rows) console.log(pad(r.category, 20), pad(r.text.slice(0, 64), 66), pad(r.before.join(',') || '—', 18), r.after.join(',') || '—');
console.log(`\n${result.changed} of ${rows.length} prompts are offered something different.`);
for (const [c, v] of Object.entries(byCategory)) console.log(`  ${pad(c, 20)} offered something: ${v.offeredBefore}/${v.prompts} before, ${v.offeredAfter}/${v.prompts} after`);
console.log(`\nwritten to ${OUT}`);
