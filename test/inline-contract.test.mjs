// test/inline-contract.test.mjs — EVERY EXAMPLE THE REPLY IS SHOWN IS ONE IT CAN WRITE.
//
// A model copies an example's shape exactly. An audit (November 2026) found
// five of the fifteen grammar examples failed their own sanitizers — a draft
// whose text was "…", an overview of one part, a sequence of one step, a
// single way onward, a decision between the same option twice — so the reply
// was taught to write elements that are never drawn. This holds the contract
// end to end, for every kind and every variant the planner can offer
// (lib/runtime/presentation.ts): each example in the text the reply is told
//
//   parses           lib/inline-ui.ts parseInlineSpec, to the kind it says
//   passes the gate  checkInlineSpec, in a permissive context (their words hold every figure in it)
//   draws            components/inline/InlineUI.tsx InlineBlock, a root of class "ln"
//
// and every grammar ends on what the prose around it is for ("Your prose").

import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as I from './.tmp/inline-under-test.mjs';

void createRequire;
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));

/** Every {"type":…} object in a text, by a balanced scan (strings and escapes respected). */
function jsonsIn(s) {
  const res = [];
  for (let i = s.indexOf('{"type"'); i >= 0; i = s.indexOf('{"type"', i + 1)) {
    let d = 0, str = false, esc = false;
    for (let j = i; j < s.length; j++) {
      const c = s[j];
      if (str) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') str = false;
        continue;
      }
      if (c === '"') str = true;
      else if (c === '{') d++;
      else if (c === '}') {
        d--;
        if (!d) {
          res.push(s.slice(i, j + 1));
          i = j;
          break;
        }
      }
    }
  }
  return res;
}

/** The reply's own words hold every figure its examples use, so a chart "given" passes; nothing else is relaxed. */
const theirs = '1200 400 150 300000 6 12000 80 150';
const ctx = (extra = {}) => ({ theirs, sources: '', questions: 1, shown: { n: 0 }, ...extra });
const host = { live: true, state: {}, onState() {}, onChoose() {}, onOpen() {}, onExplore() {} };
const draw = (spec) => {
  try {
    return renderToStaticMarkup(h(I.InlineBlock, { spec, open: false, n: 0, host, renderInline: (t, key) => h('span', { key }, t) }));
  } catch (e) {
    return 'THROW ' + e.message;
  }
};

// every form, and every variant the planner can choose for it
const offers = [];
for (const k of I.INLINE_KINDS) offers.push({ label: k, p: { forms: [k], reasons: [] } });
for (const g of ['plot', 'curve', 'rate', 'tangent', 'market', 'point']) offers.push({ label: `graph:${g}`, p: { forms: ['graph'], reasons: [], graph: g } });
for (const v of ['cycle', 'tree', 'flow', 'causes']) offers.push({ label: `diagram:${v}`, p: { forms: ['diagram'], reasons: [], diagram: v } });
offers.push({ label: 'sequence:timeline', p: { forms: ['sequence'], reasons: ['sequence:timeline'] } });
for (const r of ['paths:deeper', 'paths:more', 'paths:open-work', 'paths:next-layer']) offers.push({ label: r, p: { forms: ['paths'], reasons: [r] } });

console.log('\n=== every example the reply is shown parses, passes the gate and draws ===');
for (const { label, p } of offers) {
  const told = I.renderPresentation(p);
  const exs = jsonsIn(told);
  const kind = p.forms[0];
  ok(`${label}: an example is shown`, exs.length >= 1, told.slice(0, 200));
  for (const ex of exs) {
    let raw = null;
    try {
      raw = JSON.parse(ex);
    } catch (e) {
      ok(`${label}: its example is JSON`, false, e.message);
      continue;
    }
    ok(`${label}: the example is of its own kind`, raw.type === kind, raw.type);
    const spec = I.parseInlineSpec(ex);
    ok(`${label}: parses`, !!spec, ex.slice(0, 200));
    if (!spec) continue;
    const v = I.checkInlineSpec(spec, ctx());
    ok(`${label}: passes the gate`, v.ok, J(v));
    const html = draw(spec);
    ok(`${label}: draws, a root of class "ln"`, !html.startsWith('THROW') && /class="ln(?:\s|")/.test(html), html.slice(0, 200));
  }
  ok(`${label}: the grammar says what the prose around it is for`, /Your prose/.test(told), told.slice(-300));
}

console.log('\n=== the variants the planner offers are the ones it can name ===');
{
  const plan = (text) => {
    const signals = I.readSignals(text);
    const state = I.readTurnState({ text, history: [], signals, intent: I.routeTurn({ text }).intent });
    return I.planPresentation({ text, state, signals, questions: 1, ownWriting: false, guard: false, history: [] });
  };
  for (const [t, v] of [['explain the water cycle', 'cycle'], ['how is the US government organised?', 'tree'], ['what caused World War I?', 'causes'], ['effects of social media on teenagers', 'flow']]) {
    const p = plan(t);
    const told = I.renderPresentation(p);
    const spec = I.parseInlineSpec(jsonsIn(told).find((x) => x.includes('"type":"diagram"')) ?? '');
    ok(`"${t}": the ${v} diagram it is told parses as one`, p.diagram === v && spec?.type === 'diagram' && spec.view === v, J({ p, view: spec?.view }));
  }
}

function J(x) {
  return JSON.stringify(x);
}

console.log(`\ninline contract: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
