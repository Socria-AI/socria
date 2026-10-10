// A MARKET — Logos 3.5's predict-then-reveal economics (release workflow 6).
//
// What is held down here: every number is computed through lib/logos-econ.ts
// and checked against values worked by hand (demand P = 20 − Q, supply
// P = 2 + Q); a tax collected from buyers trades the same quantity at the
// same two prices as one put on sellers; a binding control and a
// non-binding one are told apart; predict → reveal → a graded log; the next
// scenario follows the last one taken; NOTHING states the numbers after a
// posed change before the person reveals it, guarded or not; only the person
// predicts and reveals; every edit is an operation, computed and undoable;
// and words become operations only when they plainly are one.

import { apply, create, currentOf, kindOf, sanitizeSpace, seek, describeObject, EMPTY_SPACE } from './.tmp/index.mjs';
import {
  sanitizeMarket,
  readMarketOp,
  outcome,
  shifted,
  scenarioSizes,
  scenarioChange,
  describeChange,
  explainChange,
  gradePrediction,
  closeEnough,
  nextScenario,
  mergeChange,
  marketCurves,
  marketWindow,
  segmentIn,
  posedOutcomes,
  niceFloor,
  lineSaid,
  NO_LEVERS,
  SCENARIOS,
  MARKET_LIMITS,
} from './.tmp/display-market.mjs';
import { equilibrium, taxIncidence } from './.tmp/logos-econ.mjs';
import { stableKey } from './.tmp/display-base.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const near = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;
const J = (v) => JSON.stringify(v);

// The market used throughout: D: P = 20 − Q, S: P = 2 + Q, in dollars and cups.
// 20 − Q = 2 + Q → Q* = 9, P* = 11. CS = ½·9·9 = 40.5, PS = ½·9·9 = 40.5.
const coffee = {
  title: 'Coffee',
  demand: { intercept: 20, slope: -1 },
  supply: { intercept: 2, slope: 1 },
  units: { price: '$', quantity: 'cups' },
};
const lev = (x) => ({ ...NO_LEVERS, ...x });

console.log('=== the state is canonical and checked ===');
{
  const s = sanitizeMarket(coffee);
  ok('a market is read', !!s && s.view === 'graph' && s.revealed === false && s.log.length === 0);
  ok('  with nothing applied', J(s.applied) === J(NO_LEVERS));
  ok('  the same state read twice is the same state', stableKey(sanitizeMarket(s)) === stableKey(s));
  ok('  and survives being saved and reopened', stableKey(sanitizeMarket(JSON.parse(JSON.stringify(s)))) === stableKey(s));
  ok('demand must slope down and supply up', sanitizeMarket({ ...coffee, demand: { intercept: 20, slope: 1 } }) === null && sanitizeMarket({ ...coffee, supply: { intercept: 2, slope: -1 } }) === null);
  ok('curves that never cross where a market could exist are not a market', sanitizeMarket({ ...coffee, demand: { intercept: 10, slope: -1 }, supply: { intercept: 50, slope: 1 } }) === null);
  ok('junk is not a market', sanitizeMarket(null) === null && sanitizeMarket({}) === null && sanitizeMarket('market') === null);
  const lv = (applied) => sanitizeMarket({ ...coffee, applied }).applied;
  ok('a negative tax is no tax', lv({ tax: -3 }).tax === 0);
  ok('with no tax, who it is on is not kept', lv({ tax: 0, on: 'buyers' }).on === 'sellers');
  ok('a floor above the ceiling is dropped: there would be no legal price', lv({ ceiling: 9, floor: 13 }).floor === null && lv({ ceiling: 9, floor: 13 }).ceiling === 9);
  ok('a tax and a control together: the control wins, as in the diagrams', lv({ tax: 2, ceiling: 9 }).tax === 0 && lv({ tax: 2, ceiling: 9 }).ceiling === 9);
  ok('a tax and a subsidy together are their difference', J(lv({ tax: 3, subsidy: 1 })) === J(lev({ tax: 2 })));
  const posed = { ...coffee, pending: { scenario: 0, text: 'Answer: the price goes up to 12!', change: { tax: 2, on: 'sellers' } } };
  ok('a posed change’s words are written from the change, never stored freely', sanitizeMarket(posed).pending.text === 'A tax of $2 per unit is put on sellers.');
  ok('a prediction Socria wrote is not a prediction', sanitizeMarket({ ...posed, prediction: { price: 'up', quantity: 'down', why: '', by: 'socria' } }).prediction === undefined);
  ok('  the person’s is kept', sanitizeMarket({ ...posed, prediction: { price: 'up', quantity: 'down', why: 'costs', by: 'person' } }).prediction?.price === 'up');
  ok('a prediction with nothing posed is dropped, and so is “revealed”', sanitizeMarket({ ...coffee, prediction: { price: 'up', by: 'person' }, revealed: true }).prediction === undefined && sanitizeMarket({ ...coffee, revealed: true }).revealed === false);
  const entry = (i) => ({ scenario: 0, text: `Try ${i}`, predicted: { price: 'down', quantity: 'down' }, result: { priceBefore: 11, priceAfter: 12, quantityBefore: 9, quantityAfter: 8 }, right: { price: true, quantity: true } });
  const logged = sanitizeMarket({ ...coffee, log: Array.from({ length: 14 }, (_, i) => entry(i)) });
  ok(`the log keeps the latest ${MARKET_LIMITS.log}`, logged.log.length === MARKET_LIMITS.log && logged.log[0].text === 'Try 4');
  ok('a log cannot claim a prediction was right when its numbers say otherwise', logged.log[0].right.price === false && logged.log[0].right.quantity === true && logged.log[0].result.price === 'up');
}

console.log('\n=== equilibrium and tax incidence, worked by hand ===');
{
  const s = sanitizeMarket(coffee);
  const free = outcome(s, NO_LEVERS);
  ok('the market clears at Q* = 9, P* = 11', near(free.quantity, 9) && near(free.price, 11) && near(free.free.q, 9));
  ok('consumer and producer surplus 40.5 each, nothing lost', near(free.welfare.consumer, 40.5) && near(free.welfare.producer, 40.5) && near(free.welfare.deadweight, 0));
  // a tax of 2 on sellers: S + t is P = 4 + Q; 20 − Q = 4 + Q → Q = 8, Pb = 12, Ps = 10
  const t = outcome(s, lev({ tax: 2, on: 'sellers' }));
  ok('a $2 tax on sellers: 8 trade', near(t.quantity, 8));
  ok('  buyers pay 12', near(t.price, 12));
  ok('  sellers keep 10 — the gap is the tax', near(t.received, 10) && near(t.price - t.received, 2));
  ok('  revenue 2 × 8 = 16', near(t.welfare.government, 16));
  ok('  consumer surplus ½·8·8 = 32, producer surplus ½·8·8 = 32', near(t.welfare.consumer, 32) && near(t.welfare.producer, 32));
  ok('  deadweight loss 81 − 80 = 1, the triangle ½·2·1', near(t.welfare.deadweight, 1));
  ok('  equally steep curves split it 1 and 1', near(t.incidence.buyerShare, 1) && near(t.incidence.sellerShare, 1));
  const direct = taxIncidence(s.demand, s.supply, 2);
  ok('every one of those is logos-econ’s own computation', near(direct.pricePaid, t.price) && near(direct.priceReceived, t.received) && near(direct.quantity, t.quantity));
  // the transfer check: collected from buyers instead, demand shifts DOWN by t: P = 18 − Q → Q = 8; sellers receive 10, buyers pay 12
  const b = outcome(s, lev({ tax: 2, on: 'buyers' }));
  ok('A TAX ON BUYERS: the same quantity', near(b.quantity, t.quantity));
  ok('  the same price paid and kept, the same split', near(b.price, t.price) && near(b.received, t.received) && near(b.incidence.buyerShare, t.incidence.buyerShare));
  ok('  and the shifted demand curve really is P = 18 − Q', near(equilibrium({ intercept: 18, slope: -1 }, s.supply).p, b.received));
  // a subsidy of 2 to sellers: S − s is P = Q → Q = 10, Pb = 10, Ps = 12; cost 20; CS 50, PS 50, DWL 100 − 20 vs 81 → 1
  const sub = outcome(s, lev({ subsidy: 2 }));
  ok('a $2 subsidy: 10 trade, buyers pay 10, sellers receive 12', near(sub.quantity, 10) && near(sub.price, 10) && near(sub.received, 12));
  ok('  it costs 20, and loses 1 on trades worth less than they cost', near(sub.welfare.government, -20) && near(sub.welfare.deadweight, 1) && near(sub.welfare.consumer, 50) && near(sub.welfare.producer, 50));
  // steeper demand carries more: P = 30 − 2Q, P = Q; tax 3 → 30 − 2Q = 3 + Q → Q = 9, Pb = 12 (was 10): buyers carry 2 of 3
  const steep = sanitizeMarket({ demand: { intercept: 30, slope: -2 }, supply: { intercept: 0.01, slope: 1 } });
  const st = outcome(steep, lev({ tax: 3 }));
  ok('steeper demand: buyers carry two thirds', near(st.incidence.buyerShare / 3, 2 / 3, 1e-6));
  ok('  and the explanation says why', explainChange(steep, { tax: 3, on: 'sellers' }).some((x) => /demand is the steeper one — buyers are less able to walk away — so they carry 66\.67%/.test(x)), J(explainChange(steep, { tax: 3, on: 'sellers' })));
}

console.log('\n=== shifts: horizontal, in units of quantity ===');
{
  const s = sanitizeMarket(coffee);
  ok('demand +2: buyers want 2 more at every price — P = 22 − Q', shifted(s, { demandShift: 2, supplyShift: 0 }).demand.intercept === 22);
  ok('  so Q = 10, P = 12: both rise', near(outcome(s, lev({ demandShift: 2 })).quantity, 10) && near(outcome(s, lev({ demandShift: 2 })).price, 12));
  ok('supply +2: P = Q, so Q = 10, P = 10', shifted(s, { demandShift: 0, supplyShift: 2 }).supply.intercept === 0 && near(outcome(s, lev({ supplyShift: 2 })).price, 10));
  ok('a horizontal shift scales with the slope: P = 30 − 2Q shifted right by 2 is P = 34 − 2Q', shifted({ demand: { intercept: 30, slope: -2 }, supply: s.supply }, { demandShift: 2, supplyShift: 0 }).demand.intercept === 34);
}

console.log('\n=== ceilings and floors: binding or not ===');
{
  const s = sanitizeMarket(coffee);
  // a ceiling at 9: Qd = 11, Qs = 7 → a shortage of 4; 7 trade; CS = (11 + 4)/2·7 = 52.5, PS = (7 + 0)/2·7 = 24.5, DWL 81 − 77 = 4
  const c = outcome(s, lev({ ceiling: 9 }));
  ok('a ceiling at 9 binds', c.control.binds && c.control.kind === 'ceiling');
  ok('  buyers want 11, sellers offer 7: a shortage of 4', near(c.control.qd, 11) && near(c.control.qs, 7) && near(c.control.imbalance, 4));
  ok('  only the short side trades: 7, at 9', near(c.quantity, 7) && near(c.price, 9));
  ok('  surplus 52.5 and 24.5, deadweight loss 4', near(c.welfare.consumer, 52.5) && near(c.welfare.producer, 24.5) && near(c.welfare.deadweight, 4));
  const loose = outcome(s, lev({ ceiling: 13 }));
  ok('a ceiling at 13 does not bind: the market clears at 11 with 9', !loose.control.binds && near(loose.price, 11) && near(loose.quantity, 9));
  ok('  and the facts say so', kindOf('market').facts(sanitizeMarket({ ...coffee, applied: { ceiling: 13 } }), { guarded: false }).some((f) => /ceiling of \$13 is above the market price, so it does not bind/.test(f)));
  // a floor at 13: Qd = 7, Qs = 11 → a surplus of 4; 7 trade
  const f = outcome(s, lev({ floor: 13 }));
  ok('a floor at 13 binds: sellers offer 11, buyers want 7, a surplus of 4, 7 trade', f.control.binds && near(f.control.qs, 11) && near(f.control.qd, 7) && near(-f.control.imbalance, 4) && near(f.quantity, 7) && near(f.price, 13));
  ok('a floor at 9 does not bind', !outcome(s, lev({ floor: 9 })).control.binds && near(outcome(s, lev({ floor: 9 })).price, 11));
  ok('the facts give a binding ceiling’s shortage', kindOf('market').facts(sanitizeMarket({ ...coffee, applied: { ceiling: 9 } }), { guarded: false }).some((x) => /At the ceiling of \$9, buyers want 11 cups but sellers offer only 7 cups: a shortage of 4 cups; 7 cups trade/.test(x)));
}

console.log('\n=== the scenario library ===');
{
  const s = sanitizeMarket(coffee);
  ok('sizes fit the market: a tax of 2, a shift of 2, a step of 2', J((({ tax, shift, step }) => ({ tax, shift, step }))(scenarioSizes(s))) === J({ tax: 2, shift: 2, step: 2 }));
  ok('round sizes', niceFloor(2.7) === 2 && niceFloor(12) === 10 && niceFloor(9.9) === 5 && niceFloor(0.15) === 0.1 && niceFloor(0) === 0);
  const expect = [
    [{ tax: 2, on: 'sellers' }, 'up', 'down', 'A tax of $2 per unit is put on sellers.'],
    [{ tax: 2, on: 'buyers' }, 'up', 'down', 'A tax of $2 per unit is collected from buyers.'],
    [{ subsidy: 2, on: 'sellers' }, 'down', 'up', 'Sellers are paid a subsidy of $2 per unit.'],
    [{ demandShift: 2 }, 'up', 'up', 'Demand increases: buyers want 2 cups more at every price.'],
    [{ demandShift: -2 }, 'down', 'down', 'Demand decreases: buyers want 2 cups fewer at every price.'],
    [{ supplyShift: 2 }, 'down', 'up', 'Supply increases: sellers offer 2 cups more at every price.'],
    [{ supplyShift: -2 }, 'up', 'down', 'Supply decreases: sellers offer 2 cups fewer at every price.'],
    [{ ceiling: 9 }, 'down', 'down', 'A price ceiling is set at $9.'],
    [{ floor: 13 }, 'up', 'down', 'A price floor is set at $13.'],
  ];
  ok(`${SCENARIOS.length} scenarios`, SCENARIOS.length === expect.length);
  expect.forEach(([change, p, q, text], i) => {
    const c = scenarioChange(s, i);
    const after = outcome(s, mergeChange(NO_LEVERS, c));
    const before = outcome(s, NO_LEVERS);
    const dir = (a, b) => (b > a + 1e-9 ? 'up' : b < a - 1e-9 ? 'down' : 'same');
    ok(`scenario ${i + 1}, ${SCENARIOS[i]}: price ${p}, quantity ${q}`, J(c) === J(change) && dir(before.price, after.price) === p && dir(before.quantity, after.quantity) === q && describeChange(c, s.units) === text, `${J(c)} ${describeChange(c, s.units)}`);
  });
  ok('the controls in the library bind', outcome(s, mergeChange(NO_LEVERS, scenarioChange(s, 7))).control.binds && outcome(s, mergeChange(NO_LEVERS, scenarioChange(s, 8))).control.binds);
  const big = sanitizeMarket({ demand: { intercept: 100, slope: -1 }, supply: { intercept: 20, slope: 1 } });
  ok('the same library in a bigger market: a tax of 10, a ceiling at 50, a floor at 70', scenarioChange(big, 0).tax === 10 && scenarioChange(big, 7).ceiling === 50 && scenarioChange(big, 8).floor === 70);
  ok('without units, plain numbers', describeChange({ tax: 10, on: 'sellers' }) === 'A tax of 10 per unit is put on sellers.' && describeChange({ demandShift: 1 }) === 'Demand increases: buyers want 1 unit more at every price.');
  ok('the first scenario is the first; then each follows the last one taken', nextScenario(s) === 0 && nextScenario({ ...s, pending: { scenario: 0, text: 'x', change: { tax: 2 } } }) === 1);
  ok('  after the last comes the first again', nextScenario({ ...s, log: [{ scenario: 8, text: 'x', predicted: null, result: {}, right: {} }] }) === 0);
}

console.log('\n=== predict, then reveal: a graded log (workflow 6) ===');
{
  const k = kindOf('market');
  const c = create(EMPTY_SPACE, 'market', coffee, { name: 'M1', origin: 'socria' });
  ok('the market is an object of thought', !!c && c.obj.kind === 'market' && k.label === 'Market');
  let space = c.space;
  const id = c.obj.id;
  const cur = () => currentOf(space.objs[0]);
  const step = (op, args, by = 'person') => {
    const r = apply(space, id, op, args, { by, at: 1 });
    if (r.ok) space = r.space;
    return r;
  };
  const posed = step('pose', { scenario: 0 }, 'socria');
  ok('Socria poses the first scenario', posed.ok && cur().pending.scenario === 0 && cur().revealed === false);
  ok('  the step says the question, not the answer', /Posed: “A tax of \$2 per unit is put on sellers\.” What happens to the price buyers pay/.test(posed.step.note) && !/12|went from|rises|falls/.test(posed.step.note));
  // The answer is: buyers pay $12 (up), sellers keep $10, 8 cups trade (down).
  const leaks = (lines) => lines.filter((x) => /\$12(?![.\d])|\$10(?![.\d])|(?<![.\d])8 cups|went from|deadweight loss \$1\b|Revealed|supply shifts up|half each|rises|falls/.test(x));
  const waiting = () => [
    ...k.facts(cur(), { guarded: false }),
    ...k.facts(cur(), { guarded: true }),
    k.text(cur()),
    ...(k.partFacts(cur(), 'scenario') ?? []),
    k.shape(cur()),
    ...describeObject(space.objs[0], { guarded: false }),
    ...describeObject(space.objs[0], { guarded: true }),
  ];
  ok('BEFORE THE REVEAL NOTHING STATES THE ANSWER — guarded or not', leaks(waiting()).length === 0, J(leaks(waiting())));
  ok('  what is said: the market before, the question, and that the answer waits', k.facts(cur(), { guarded: false }).some((f) => /clears at a price of \$11, with 9 cups traded/.test(f)) && k.facts(cur(), { guarded: false }).some((f) => /withheld until they reveal it/.test(f)));
  ok('  guarded, even the price before is theirs to work out', !k.facts(cur(), { guarded: true }).some((f) => /\$11/.test(f)));
  ok('  a renderer is given the before, and no after', posedOutcomes(cur()).after === null && near(posedOutcomes(cur()).before.price, 11));
  ok('Socria cannot predict for the person', /Only you can predict/.test(step('predict', { price: 'up', quantity: 'down', by: 'socria' }, 'socria').why));
  ok('  nor claim to be them', !step('predict', { price: 'up', quantity: 'down', by: 'person' }, 'socria').ok);
  ok('a prediction needs a direction or a number', !step('predict', { why: 'no idea', by: 'person' }).ok && !step('predict', { price: 'sideways', by: 'person' }).ok);
  const p = step('predict', { price: 'up', quantity: 'down', priceValue: 12.2, quantityValue: 7.9, why: 'the tax raises what it costs sellers to supply', by: 'person' });
  ok('the person predicts', p.ok && cur().prediction.price === 'up' && cur().prediction.by === 'person');
  ok('  and still nothing states the answer', leaks(waiting()).length === 0, J(leaks(waiting())));
  ok('  their prediction is told, as theirs', k.facts(cur(), { guarded: false }).some((f) => /Their prediction: price up, quantity down \(price \$12\.2, quantity 7\.9 cups\), because “the tax raises/.test(f)));
  ok('Socria cannot reveal it', /person’s call/.test(step('reveal', {}, 'socria').why));
  ok('  nor set the prediction aside with another scenario, the next one, or a reset', !step('pose', { scenario: 3 }, 'socria').ok && /prediction is waiting/.test(step('next', {}, 'socria').why) && !step('reset', {}, 'socria').ok);
  ok('the market cannot be moved while a change waits', [['tax', { t: 1 }], ['shift', { curve: 'demand', by: 1 }], ['ceiling', { p: 8 }], ['param', { curve: 'demand', intercept: 25, by: 'person' }]].every(([op, a]) => /waiting for a prediction/.test(step(op, a).why)));
  const before = space.objs[0].at;
  const rv = step('reveal', {});
  ok('the person reveals', rv.ok && cur().revealed === true && cur().log.length === 1);
  const e = cur().log[0];
  ok('  the result is computed: price 11 → 12 (up), quantity 9 → 8 (down)', J(e.result) === J({ price: 'up', quantity: 'down', priceBefore: 11, priceAfter: 12, quantityBefore: 9, quantityAfter: 8 }), J(e.result));
  ok('  and graded: both directions right, both numbers close enough', J(e.right) === J({ price: true, quantity: true }));
  ok('  the change is now applied', cur().applied.tax === 2 && cur().applied.on === 'sellers');
  ok('  the step says what happened and how the prediction did', /Revealed: the price buyers pay went from \$11 to \$12 \(up\)/.test(rv.step.note) && /price up — right/.test(rv.step.note), rv.step.note);
  const after = k.facts(cur(), { guarded: false });
  ok('after the reveal the facts state the numbers', after.some((f) => /Buyers pay \$12 and sellers keep \$10; 8 cups trade/.test(f)), J(after));
  ok('  whether each predicted direction was right', after.some((f) => /They predicted price up — right; price \$12\.2 — close enough to count; quantity down — right/.test(f)), J(after));
  ok('  and why: the mechanism, from the computation', after.some((f) => /raises their cost of supplying every unit by \$2, so supply shifts up by \$2/.test(f)) && after.some((f) => /equally steep here, so buyers and sellers carry half each/.test(f)));
  ok('  (the leak detector used above does see the answer, now that it is out)', leaks(after).length > 0);
  ok('  guarded too, once revealed', k.facts(cur(), { guarded: true }).some((f) => /\$12/.test(f)));
  ok('  and never claim mastery', ![...after, ...k.facts(cur(), { guarded: true })].some((f) => /mastered|you understand|you have learned|you know this/i.test(f)));
  ok('a renderer now gets the after too', near(posedOutcomes(cur()).after.price, 12));
  ok('a prediction after the reveal is refused', /already revealed/.test(step('predict', { price: 'down', by: 'person' }).why));
  ok('undo steps back to before the reveal — and the answer is withheld again', (() => {
    const back = seek(space, id, before);
    const o = back.objs[0];
    const st = currentOf(o);
    const lines = [...k.facts(st, { guarded: false }), k.text(st)];
    return st.revealed === false && st.prediction?.price === 'up' && leaks(lines).length === 0;
  })());
  // next: the same tax, collected from buyers — the transfer check
  const nx = step('next', {});
  ok('the next scenario is the same tax on buyers', nx.ok && cur().pending.scenario === 1 && cur().pending.text === 'A tax of $2 per unit is collected from buyers.');
  ok('  posed from the market with nothing applied, the prediction cleared', J(cur().applied) === J(NO_LEVERS) && cur().prediction === undefined && cur().revealed === false);
  step('predict', { price: 'down', quantity: 'down', why: 'buyers hand over the tax', by: 'person' });
  step('reveal', {});
  const e2 = cur().log[1];
  ok('the same outcome as the tax on sellers: buyers pay 12, 8 trade', e2.result.priceAfter === e.result.priceAfter && e2.result.quantityAfter === e.result.quantityAfter);
  ok('  graded: price wrong, quantity right', J(e2.right) === J({ price: false, quantity: true }));
  ok('  and the explanation names the transfer', k.facts(cur(), { guarded: false }).some((f) => /exactly what the same tax on sellers does: who hands the tax over does not decide who bears it/.test(f)));
  step('next', {});
  ok('then a subsidy', cur().pending.scenario === 2);
  step('reveal', {});
  ok('revealed without a prediction: nothing graded', cur().log[2].predicted === null && J(cur().log[2].right) === J({ price: null, quantity: null }) && k.facts(cur(), { guarded: false }).some((f) => /revealed it without predicting/.test(f)));
  ok('the log is a record of attempts: 3 of 4 directions right', k.facts(cur(), { guarded: false }).some((f) => /Across the 3 scenarios in the log, 3 of 4 predicted directions were right — a record of these attempts, not a measure of mastery/.test(f)));
  const saved = sanitizeSpace(JSON.parse(JSON.stringify(space)));
  ok('the whole history survives a save: every step re-computed', saved.objs[0].steps.length === space.objs[0].steps.length && stableKey(currentOf(saved.objs[0])) === stableKey(cur()));
  // and on past the log's cap: the next scenario never sticks
  for (let i = 0; i < 9; i++) {
    step('next', {});
    step('reveal', {});
  }
  // 0, 1, 2, then nine more: 3 … 8, 0, 1, 2 — twelve in all, the latest ten kept
  ok(`the log keeps the latest ${MARKET_LIMITS.log}, and the scenarios keep coming in order past it`, cur().log.length === MARKET_LIMITS.log && cur().log.map((x) => x.scenario).join() === '2,3,4,5,6,7,8,0,1,2' && cur().pending.scenario === 2, cur().log.map((x) => x.scenario).join());
  // a forged history is cut on load: a stored step in which Socria predicts never replays
  const forged = JSON.parse(JSON.stringify(c.space));
  const s0 = sanitizeMarket({ ...coffee, pending: { scenario: 0, change: { tax: 2, on: 'sellers' } } });
  const s1 = { ...s0, prediction: { price: 'up', quantity: 'down', priceValue: null, quantityValue: null, why: '', by: 'person' } };
  forged.objs[0].states = [s0, s1];
  forged.objs[0].steps = [{ op: 'predict', args: { price: 'up', quantity: 'down', by: 'socria' }, said: 'x', by: 'socria', at: 3 }];
  forged.objs[0].at = 1;
  ok('a stored step in which Socria predicted for the person is cut on load', sanitizeSpace(forged).objs[0].states.length === 1);
}

console.log('\n=== grading ===');
{
  ok('within 2%, or half a unit, counts', closeEnough(12.2, 12) && !closeEnough(12.6, 12) && closeEnough(1015, 1000) && !closeEnough(1030, 1000) && closeEnough(0.4, 0));
  const r = { price: 'up', quantity: 'down', priceBefore: 11, priceAfter: 12, quantityBefore: 9, quantityAfter: 8 };
  const g = gradePrediction({ price: 'up', quantity: null, priceValue: 13, quantityValue: null, why: '' }, r);
  ok('a right direction with a number too far off is not right', g.price.direction === true && g.price.value === false && g.price.right === false && g.quantity.right === null);
  ok('a number alone is graded on its own', gradePrediction({ price: null, quantity: null, priceValue: null, quantityValue: 8.3, why: '' }, r).quantity.right === true);
  ok('“same” is graded like any direction', gradePrediction({ price: 'same', quantity: 'same', priceValue: null, quantityValue: null, why: '' }, { ...r, price: 'same', quantity: 'same' }).price.right === true);
  ok('no prediction, no grade', J(gradePrediction(null, r)) === J({ price: { direction: null, value: null, right: null }, quantity: { direction: null, value: null, right: null } }));
}

console.log('\n=== every operation ===');
{
  const c = create(EMPTY_SPACE, 'market', coffee, { name: 'M2', origin: 'socria' });
  let space = c.space;
  const id = c.obj.id;
  const k = kindOf('market');
  const cur = () => currentOf(space.objs[0]);
  const step = (op, args, by = 'person') => {
    const r = apply(space, id, op, args, { by, at: 1 });
    if (r.ok) space = r.space;
    return r;
  };
  const facts = () => k.facts(cur(), { guarded: false }).join(' ');
  ok('a tax on buyers', step('tax', { t: 2, on: 'buyers' }).ok && /Buyers pay \$12 and sellers keep \$10; 8 cups trade\. The tax raises \$16; buyers carry 50% of it/.test(facts()), facts());
  ok('  a subsidy cannot go on top of it', /tax off first/.test(step('subsidy', { s: 1 }).why));
  ok('  nor a control', /tax or subsidy off first/.test(step('ceiling', { p: 9 }).why));
  ok('  taken off', step('tax', { t: 0 }).ok && cur().applied.tax === 0 && cur().applied.on === 'sellers');
  ok('  and not taken off twice', !step('tax', { t: 0 }).ok);
  ok('a subsidy', step('subsidy', { s: 2 }).ok && /Buyers pay \$10 and sellers receive \$12 with the subsidy; 10 cups trade\. The subsidy costs \$20/.test(facts()), facts());
  ok('  off again', step('subsidy', { s: 0 }).ok);
  ok('demand shifted right by 2', step('shift', { curve: 'demand', by: 2 }).ok && cur().applied.demandShift === 2 && /clears at a price of \$12, with 10 cups traded/.test(facts()));
  ok('  and back', step('shift', { curve: 'demand', by: -2 }).ok && cur().applied.demandShift === 0);
  ok('  a shift of nothing is refused', !step('shift', { curve: 'demand', by: 0 }).ok);
  ok('a ceiling at 9', step('ceiling', { p: 9 }).ok && /shortage of 4 cups/.test(facts()));
  ok('  a floor above it is refused', /no legal price/.test(step('floor', { p: 13 }).why));
  ok('  a tax with it is refused', /control off first/.test(step('tax', { t: 2 }).why));
  ok('  the ceiling off', step('ceiling', { p: '' }).ok && cur().applied.ceiling === null && !step('ceiling', { p: '' }).ok);
  ok('a floor at 13', step('floor', { p: 13 }).ok && /surplus of 4 cups/.test(facts()) && step('floor', { p: '' }).ok);
  ok('the person sets the demand curve, and it is theirs', step('param', { curve: 'demand', intercept: 24, by: 'person' }).ok && cur().demand.intercept === 24 && cur().demand.by === 'person');
  ok('  Socria cannot change it', /yours/.test(step('param', { curve: 'demand', slope: -2, by: 'socria' }, 'socria').why));
  ok('  Socria can change its own supply curve', step('param', { curve: 'supply', slope: 2, by: 'socria' }, 'socria').ok && cur().supply.slope === 2 && cur().supply.by === 'socria');
  ok('  a slope with the wrong sign is refused', /slopes down/.test(step('param', { curve: 'demand', slope: 1, by: 'person' }).why));
  ok('  curves that would never cross are refused', /would not cross/.test(step('param', { curve: 'supply', intercept: 40, by: 'person' }).why));
  step('param', { curve: 'demand', intercept: 20, by: 'person' });
  step('param', { curve: 'supply', slope: 1, by: 'socria' }, 'socria');
  const mine = step('pose', { scenario: -1, tax: 2, on: 'buyers' });
  ok('the person poses a scenario of their own', mine.ok && cur().pending.scenario === -1 && cur().pending.text === 'A tax of $2 per unit is collected from buyers.');
  ok('  one that would close the market is refused: nothing to predict', /nothing traded/.test(step('pose', { scenario: -1, tax: 50 }).why));
  ok('  a tax and a control together are not posed', !step('pose', { scenario: -1, tax: 2, ceiling: 9 }).ok);
  ok('  nor a scenario that does not exist', !step('pose', { scenario: 9 }).ok && !step('pose', { scenario: 1.5 }).ok);
  ok('reset takes everything off', step('reset', {}).ok && J(cur().applied) === J(NO_LEVERS) && cur().pending === undefined);
  ok('  and there is then nothing to reset', !step('reset', {}).ok);
  ok('shown as numbers', step('view', { view: 'numbers' }).ok && cur().view === 'numbers' && step('view', { view: 'graph' }).ok);
  ok('renamed', step('title', { title: 'My coffee' }).ok && cur().title === 'My coffee');
  ok('every state an operation leaves is canonical', space.objs[0].states.every((st) => stableKey(sanitizeMarket(JSON.parse(JSON.stringify(st)))) === stableKey(st)));
  const at = space.objs[0].at;
  ok('undo and redo', currentOf(seek(space, id, at - 1).objs[0]).title === 'Coffee' && currentOf(seek(space, id, at).objs[0]).title === 'My coffee');
  const back = sanitizeSpace(JSON.parse(JSON.stringify(space)));
  ok('the history survives a save', back.objs[0].steps.length === space.objs[0].steps.length && stableKey(currentOf(back.objs[0])) === stableKey(cur()));
}

console.log('\n=== for a renderer ===');
{
  const s = sanitizeMarket(coffee);
  ok('the curve a tax on sellers moves is supply, up by the tax', (() => {
    const c = marketCurves({ ...s, applied: lev({ tax: 2 }) });
    return c.wedged.curve === 'supply' && c.wedged.line.intercept === 4 && c.supply.intercept === 2;
  })());
  ok('on buyers it is demand, down by the tax', (() => {
    const c = marketCurves({ ...s, applied: lev({ tax: 2, on: 'buyers' }) });
    return c.wedged.curve === 'demand' && c.wedged.line.intercept === 18;
  })());
  ok('the starting curves stay for ghosts once shifted', marketCurves({ ...s, applied: lev({ demandShift: 2 }) }).demand0.intercept === 20 && marketCurves({ ...s, applied: lev({ demandShift: 2 }) }).demand.intercept === 22);
  ok('a curve’s endpoints, clipped to the window', J(segmentIn(s.demand, 20, 25)) === J({ q0: 0, p0: 20, q1: 20, p1: 0 }) && J(segmentIn(s.supply, 20, 25)) === J({ q0: 0, p0: 2, q1: 20, p1: 22 }) && J(segmentIn(s.supply, 30, 25)) === J({ q0: 0, p0: 2, q1: 23, p1: 25 }));
  ok('  and none for a line that misses it', segmentIn({ intercept: 30, slope: 1 }, 20, 25) === null);
  const w = marketWindow(s);
  ok('a window that holds both curves, with round ticks from zero', w.qMax === 20 && w.pMax === 25 && w.qTicks[0] === 0 && w.pTicks.includes(25));
  ok('curves written as a person writes them', lineSaid(s.demand) === '20 − Q' && lineSaid({ intercept: 2, slope: 0.5 }) === '2 + 0.5Q' && lineSaid({ intercept: 0, slope: 1 }) === 'Q');
  const k = kindOf('market');
  ok('sizes: card, trail, live', J(k.size(s, 'card')) === J({ w: 260, h: 150 }) && J(k.size(s, 'trail')) === J({ w: 200, h: 110 }) && k.size(s, 'live').w <= 720 && k.size(s, 'live').h <= 640);
  ok('the curves are parts, with their facts', k.parts(s).length === 2 && k.partFacts(s, 'demand')[0] === 'Demand: P = 20 − Q');
  const long = sanitizeMarket({
    ...coffee,
    log: Array.from({ length: 10 }, (_, i) => ({ scenario: 0, text: `Scenario ${i} ${'with a long description '.repeat(8)}`, predicted: { price: 'up', quantity: 'down', priceValue: 12, quantityValue: 8 }, result: { priceBefore: 11, priceAfter: 12, quantityBefore: 9, quantityAfter: 8 } })),
  });
  const t = k.text(long);
  ok('a long log’s text is capped by leaving out the earliest entries whole, never cutting one', t.length <= 2400 && /the earliest \d+ not shown/.test(t) && t.endsWith('the quantity traded went from 9 cups to 8 cups (down).') && /Scenario 9/.test(t) && !/Scenario 0 /.test(t), t.slice(-300));
}

console.log('\n=== words become operations only when they plainly are one ===');
{
  const s = sanitizeMarket(coffee);
  const waiting = sanitizeMarket({ ...coffee, pending: { scenario: 0, change: { tax: 2, on: 'sellers' } } });
  const r = (t, st = s) => readMarketOp(t, st);
  ok('"I think the price goes up and the quantity falls"', J(r('I think the price goes up and the quantity falls', waiting)) === J({ op: 'predict', args: { price: 'up', quantity: 'down', by: 'person' } }), J(r('I think the price goes up and the quantity falls', waiting)));
  ok('"price up, quantity down because …" keeps the reason', J(r('price up, quantity down because sellers pass on part of the tax', waiting)) === J({ op: 'predict', args: { price: 'up', quantity: 'down', why: 'sellers pass on part of the tax', by: 'person' } }), J(r('price up, quantity down because sellers pass on part of the tax', waiting)));
  ok('"the price rises to 12 and fewer cups are sold"', J(r('the price rises to 12 and fewer cups are sold', waiting)?.args) === J({ price: 'up', quantity: 'down', priceValue: 12, by: 'person' }), J(r('the price rises to 12 and fewer cups are sold', waiting)));
  ok('"price and quantity both fall"', J(r('price and quantity both fall', waiting)?.args) === J({ price: 'down', quantity: 'down', by: 'person' }));
  ok('"p up, q down"', J(r('p up, q down', waiting)?.args) === J({ price: 'up', quantity: 'down', by: 'person' }));
  ok('"Price: up. Quantity: down."', J(r('Price: up. Quantity: down.', waiting)?.args) === J({ price: 'up', quantity: 'down', by: 'person' }), J(r('Price: up. Quantity: down.', waiting)));
  ok('"higher price, lower quantity"', J(r('higher price, lower quantity', waiting)?.args) === J({ price: 'up', quantity: 'down', by: 'person' }));
  ok('"the price goes up to 12.5" keeps the decimal', r('the price goes up to 12.5', waiting)?.args.priceValue === 12.5);
  ok('"the quantity won’t change"', r('the quantity won’t change', waiting)?.args.quantity === 'same');
  ok('a negated direction is not guessed at', r('the price doesn’t go up', waiting) === null);
  for (const t of ['reveal', 'show me', 'what happens?', 'ok, what happens now?', 'Reveal the answer please']) ok(`"${t}" reveals`, J(r(t, waiting)) === J({ op: 'reveal', args: {} }), J(r(t, waiting)));
  for (const t of ['next one', 'another', 'Great, next!', 'give me another one']) ok(`"${t}" is the next scenario`, J(r(t, waiting)) === J({ op: 'next', args: {} }) && J(r(t)) === J({ op: 'next', args: {} }));
  ok('"put a $2 tax on sellers" while a change waits is left to the conversation', r('put a $2 tax on sellers', waiting) === null);
  ok('  so is a shift', r('shift demand right by 10', waiting) === null);
  ok('"put a $2 tax on sellers" poses it', J(r('put a $2 tax on sellers')) === J({ op: 'pose', args: { scenario: -1, tax: 2, on: 'sellers' } }), J(r('put a $2 tax on sellers')));
  ok('  "impose a tax of 3 dollars on buyers"', J(r('impose a tax of 3 dollars on buyers')?.args) === J({ scenario: -1, tax: 3, on: 'buyers' }));
  ok('  "give sellers a $1 subsidy"', J(r('give sellers a $1 subsidy')?.args) === J({ scenario: -1, subsidy: 1, on: 'sellers' }));
  ok('  "what if there was a $2 tax?" — on sellers, the textbook default', J(r('what if there was a $2 tax?')?.args) === J({ scenario: -1, tax: 2, on: 'sellers' }));
  ok('  and once revealed, a new one can be posed', r('put a $2 tax on sellers', { ...waiting, revealed: true, log: [{}] })?.op === 'pose');
  ok('"shift demand right by 10"', J(r('shift demand right by 10')) === J({ op: 'shift', args: { curve: 'demand', by: 10 } }));
  ok('"shift supply left by 2", "increase demand by 4", "supply falls by 3"', r('shift supply left by 2')?.args.by === -2 && r('increase demand by 4')?.args.by === 4 && J(r('supply falls by 3')?.args) === J({ curve: 'supply', by: -3 }));
  ok('"set a price ceiling at 8"', J(r('set a price ceiling at 8')) === J({ op: 'ceiling', args: { p: 8 } }));
  ok('  with a full stop, or a decimal price', J(r('Set a price ceiling at 8.')) === J({ op: 'ceiling', args: { p: 8 } }) && r('set a price ceiling at 8.50')?.args.p === 8.5);
  ok('"put a price floor of $14"', J(r('put a price floor of $14')) === J({ op: 'floor', args: { p: 14 } }));
  ok('"remove the price ceiling" — when there is one', J(r('remove the price ceiling', sanitizeMarket({ ...coffee, applied: { ceiling: 9 } }))) === J({ op: 'ceiling', args: { p: '' } }) && r('remove the price ceiling') === null);
  ok('"show the numbers"', J(r('show the numbers')) === J({ op: 'view', args: { view: 'numbers' } }));
  ok('the kind reads words the same way', J(kindOf('market').readOp('set a price ceiling at 8', s)) === J(r('set a price ceiling at 8')));
  // what must be left to the conversation
  const quiet = [
    ['reveal', s],
    ['show me', s],
    ['I think the price goes up', s],
    ['I think the price of eggs is too high', waiting],
    ['what happens next in the story?', waiting],
    ['will the price go up?', waiting],
    ['show me how elasticity works', waiting],
    ['the government should tax the rich', s],
    ['demand for housing is rising', s],
    ['can you explain supply and demand?', s],
    ['next, let’s talk about inflation', s],
    ['another question: what is GDP?', s],
    ['I left my keys on the floor at 5pm', s],
    ['set the vase on the floor at 3', s],
    ['shift supply up by 2', s],
    ['put a 10% sales tax on sellers', s],
    ['what is a price ceiling?', s],
  ];
  for (const [t, st] of quiet) ok(`left to the conversation: "${t}"`, r(t, st) === null, J(r(t, st)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
