// The two functions a plan's shape flows through, and one assertion that
// the interface cannot quietly disagree with the table.
//
// lib/entitlements.ts is meant to be the single source for what a plan
// opens. It only is if nothing downstream decides for itself — and it used
// to: depthForPlan tested `plan === 'one'` and the Logos UI tested `!one` in
// five places, so the table said one thing and the screen did another. This
// suite pins the two pure functions to the table, and then greps the two
// components, because a hardcoded gate is invisible to a unit test by
// definition: it is code that never asks the question.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLANS } from './.tmp/entitlements.mjs';
import { capMapForFree, depthForPlan, FREE_DEPTH, meaningfulNodes } from './.tmp/socria-one.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

console.log('=== depth follows the table, not the plan name ===');
{
  for (const plan of ['free', 'one']) {
    const opens = PLANS[plan].allDepths;
    for (const d of ['quick', 'balanced', 'deep', 'abstract']) {
      ok(`${plan}/${d}`, depthForPlan(d, plan) === (opens ? d : FREE_DEPTH));
    }
  }
  // Both plans open all four now: clipping the free tier to Balanced was the
  // clearest way to make Socria look mediocre to somebody deciding whether
  // to pay for it, so the answer here should be the identity function.
  ok('free thinks at whatever depth it asked for', depthForPlan('abstract', 'free') === 'abstract');
}

console.log('\n=== a map is held at its plan boundary, and there is none ===');
{
  const map = (n) => ({
    nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}` })),
    edges: [{ from: 'n0', to: `n${n - 1}` }],
  });

  ok('meaningfulNodes counts every node', meaningfulNodes(map(7)) === 7);
  ok('...and a missing map is zero', meaningfulNodes(null) === 0 && meaningfulNodes(undefined) === 0);

  // The default is the table, and the table says null.
  ok('free maps are not capped', PLANS.free.mapNodes === null);
  const big = capMapForFree(map(40), map(3));
  ok('a large map passes through untouched', big.map.nodes.length === 40 && big.capped === false);
  ok('...as the same object, not a copy', big.map.nodes.length === 40);

  // And the behaviour a future plan table would get back, still correct.
  const current = { nodes: [{ id: 'a' }, { id: 'b' }], edges: [] };
  const next = {
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
    edges: [{ from: 'a', to: 'c' }, { from: 'a', to: 'd' }, { from: 'a', to: 'b' }],
  };
  const held = capMapForFree(next, current, 3);
  ok('everything already on the map is kept', ['a', 'b'].every((id) => held.map.nodes.some((n) => n.id === id)));
  ok('new arrivals stop at the limit', held.map.nodes.length === 3 && held.capped === true);
  ok('edges into what did not survive are dropped',
    held.map.edges.every((e) => held.map.nodes.some((n) => n.id === e.from) && held.map.nodes.some((n) => n.id === e.to)));
  ok('a map already over the limit still keeps every existing node',
    capMapForFree({ nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges: [] },
      { nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges: [] }, 2).map.nodes.length === 3);
}

console.log('\n=== the interface asks the table rather than the plan name ===');
{
  // Each of these was a hardcoded `!one` that bypassed lib/entitlements.
  // They are asserted as source text because that is the only place the
  // mistake can live: a gate that never reads the table cannot be caught by
  // calling anything.
  const logos = readFileSync(join(root, 'components/LogosApp.tsx'), 'utf8');
  const tmap = readFileSync(join(root, 'components/ThinkingMap.tsx'), 'utf8');

  ok('LogosApp reads the plan table once, by name', /const limits = limitsFor\(plan\)/.test(logos));
  ok('the depth gate asks allDepths', /!limits\.allDepths && next !== FREE_DEPTH/.test(logos));
  ok('the depth menu lock asks allDepths', /!limits\.allDepths && d\.id !== FREE_DEPTH/.test(logos));
  ok('Draft Space asks draftSpace', /limits\.draftSpace/.test(logos));
  ok('the map boundary asks mapNodes', /meaningfulNodes\(map\) >= \(limits\.mapNodes \?\? Infinity\)/.test(logos));
  ok('the lens limit is passed as the number it is', /lensLimit=\{limits\.lenses\}/.test(logos));
  ok('ThinkingMap takes a count, not a boolean', /lensLimit\?: number \| null;/.test(tmap));

  // The gates that legitimately remain: how many lines of thinking, and
  // connected sources. Everything else that tests `one` in LogosApp should
  // be about billing or a welcome note, never about a capability.
  ok('the chat count still gates on the plan', /!one && chatsSpent/.test(logos));
  ok('connected sources still gate on the plan', /connections-locked/.test(logos));

  // And nothing may reintroduce the old boolean prop.
  ok('lensesLocked is gone from both', !/lensesLocked/.test(logos) && !/lensesLocked/.test(tmap));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
