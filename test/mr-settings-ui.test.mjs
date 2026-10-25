// Manage Account → Personalization → How Socria adjusts to you
// (components/account/MRSettings.tsx, components/useMRSettings.ts).
//
// Three things are proved here, through the real component and the real
// client, bundled from components/:
//
//   NO PLACEBO. The section renders nothing unless the account answered and
//   MR runs on this deployment — not while loading, not on a failed answer,
//   not signed out, not when `active` is anything but a plain true.
//   When it does render: two real switches (role=switch, aria-checked,
//   labelled), the latest five adjustments in plain words, a reset that asks
//   first — and no code or trigger id anywhere in the markup.
//
//   OPTIMISTIC, AND HONEST ABOUT FAILURE. A switch moves at once; a change
//   the account does not take is put back; two quick flips settle on the
//   last; a load that started before a flip does not undo it; answers that
//   arrive out of order settle on what the account holds (by their stamps);
//   a reset that fails brings the list back, and one that removed the rows
//   but could not save itself says so instead.
//
//   HONEST ABOUT WHAT RESET DOES, and about what the list cannot show: what
//   still holds with no entry in the list is counted.
//
//   STRICT READING. The API's answer is read through bounded parsers:
//   consent to carry is only a plain true, a malformed adjustment is dropped.
//
// The fetch is a fake with deferred answers, so each ordering is exact.

import { build } from 'esbuild';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 300))));
const J = JSON.stringify;

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-mr-settings');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  stdin: {
    contents: "export * from '@/components/account/MRSettings'; export * from '@/components/useMRSettings'; export { adjustmentWords } from '@/lib/mr/words';",
    resolveDir: root,
    sourcefile: 'mr-settings-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: join(OUT, 'mr-settings.mjs'),
  tsconfig: join(root, 'tsconfig.json'),
  jsx: 'automatic',
  loader: { '.css': 'empty' },
  // one React: the component must render with the react-dom in node_modules
  external: ['react', 'react/*', 'react-dom', 'react-dom/*'],
  logLevel: 'error',
});
const U = await import(pathToFileURL(join(OUT, 'mr-settings.mjs')).href);

const NOW = Date.UTC(2026, 9, 25, 12, 0, 0);
const DEFAULTS = { version: 1, enabled: true, carryAcross: false, research: null, resetAt: null };
const adj = (over = {}) => ({ turn: 3, at: NOW - 5 * 60_000, action: 'fewer_questions', trigger: 'ifr.observed.unproductive_questions', status: 'ended', scope: 'turns', conversation: true, standing: false, ...over });
const noop = async () => true;
const view = (over = {}) =>
  renderToStaticMarkup(
    h(U.MRSettingsView, { state: 'ready', active: true, settings: DEFAULTS, adjustments: [], resetting: false, setEnabled: noop, setCarryAcross: noop, reset: noop, now: NOW, ...over })
  );
const count = (s, re) => (s.match(re) ?? []).length;

console.log('\n=== no placebo: nothing renders unless MR runs and the account answered ===');
{
  ok('MR off on this deployment → nothing', view({ active: false }) === '', view({ active: false }));
  ok("  'active' that is not a plain true → nothing", view({ active: 'true' }) === '' && view({ active: 1 }) === '');
  for (const state of ['loading', 'failed', 'signed-out']) ok(`${state} → nothing, even with active true`, view({ state }) === '', view({ state }));
  // the wrapper itself renders nothing signed out: no fetch, no markup
  let asked = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => (asked++, { ok: true, status: 200, json: async () => ({ active: true, settings: DEFAULTS, adjustments: [] }) });
  ok('<MRSettings signedIn={false} /> renders nothing', renderToStaticMarkup(h(U.MRSettings, { signedIn: false })) === '');
  ok('<MRSettings /> renders nothing before the account answers (no flash of a control)', renderToStaticMarkup(h(U.MRSettings, {})) === '');
  ok('  and rendering asks nothing (the account is asked from an effect, in the browser)', asked === 0, asked);
  globalThis.fetch = realFetch;
}

console.log('\n=== on: one sub-section, two real switches ===');
{
  const html = view();
  ok('one .sub of the Personalization section', html.startsWith('<div class="sub mr">') && count(html, /class="sub[ "]/g) === 1, html.slice(0, 80));
  ok('titled for them', /<h3 class="sub-h">How Socria adjusts to you<\/h3>/.test(html));
  ok('says plainly what it does, that it never overrides them, and that it can be turned off', /isn&#x27;t working|isn’t working/.test(html) && /questions that aren(&#x27;|’)t helping/.test(html) && /explanation that didn(&#x27;|’)t\s+land/.test(html) && /never overrides what you asked for/.test(html) && /you can turn\s+it off/.test(html), html);
  ok('exactly two switches', count(html, /role="switch"/g) === 2, count(html, /role="switch"/g));
  const switches = [...html.matchAll(/<button[^>]*role="switch"[^>]*>/g)].map((m) => m[0]);
  const attr = (tag, a) => (tag.match(new RegExp(`${a}="([^"]*)"`)) ?? [])[1];
  ok('each is a button with aria-checked', switches.every((s) => /^<button type="button"/.test(s) && /aria-checked="(true|false)"/.test(s)), J(switches));
  for (const s of switches) {
    const id = attr(s, 'id');
    ok(`  #${id} is named by a <label for> and described by its note`, new RegExp(`<label class="mr-label" for="${id}">`).test(html) && new RegExp(`id="${attr(s, 'aria-describedby')}"`).test(html), s);
  }
  ok("'Let Socria adjust how it helps' — on by default", /<label class="mr-label" for="mr-enabled">Let Socria adjust how it helps<\/label>/.test(html) && /id="mr-enabled" role="switch" aria-checked="true"/.test(html), html);
  ok("'Remember what you told it across conversations' — off by default", /<label class="mr-label" for="mr-carry">Remember what you told it across conversations<\/label>/.test(html) && /id="mr-carry" role="switch" aria-checked="false"/.test(html), html);
  ok('  saying only what is said for the future is carried, and "for the rest of this chat" stays there', /Only things you said for the future — “from now on”, “always” — are carried; what you limited to one chat stays in that chat/.test(html), html);
  const flipped = view({ settings: { ...DEFAULTS, enabled: false, carryAcross: true } });
  ok('the switches show the settings, not a default', /id="mr-enabled" role="switch" aria-checked="false"/.test(flipped) && /id="mr-carry" role="switch" aria-checked="true"/.test(flipped) && /class="mr-switch on"/.test(flipped));
  ok('a status line that is read out', /role="status" aria-live="polite"/.test(html));
}

console.log('\n=== the latest adjustments, in plain words ===');
{
  ok('empty: says so', /Nothing adjusted yet/.test(view()) && !/<ul class="mr-list"/.test(view()));
  const list = [
    adj({ at: NOW - 2 * 60_000, action: 'fewer_questions', trigger: 'ifr.explicit.stop_questions', status: 'active', scope: 'conversation' }),
    adj({ at: NOW - 3 * 3_600_000, action: 'worked_example', trigger: 'ifr.observed.repeated_confusion' }),
    adj({ at: NOW - 2 * 86_400_000, action: 'shorter', trigger: 'ifr.explicit.shorter', status: 'active', scope: 'standing', standing: true }),
    adj({ action: 'direct', trigger: 'mr.no_such_rule' }),
    adj({ action: 'execute', trigger: 'ifr.observed.routine_task' }),
    adj({ action: 'simplify', trigger: 'mr.explicit.simpler' }),
    adj({ action: 'verify', trigger: 'mr.explicit.verify' }),
  ];
  const html = view({ adjustments: list });
  ok('at most five', count(html, /<li /g) === 5, count(html, /<li /g));
  ok('in the words lib/mr/words.ts gives', html.includes('Asked fewer questions because you asked it to stop asking questions') && html.includes('Showed a worked example first because an explanation didn&#x27;t land'), html);
  ok('an unknown rule reads as the general line', html.includes('Answered directly because of how the conversation was going'));
  ok('when, relatively', /2m ago/.test(html) && /3h ago/.test(html) && /2d ago/.test(html), html);
  ok("'still on' for the ones in force, and only those", count(html, /still on/g) === 2, count(html, /still on/g));
  ok('  with how far they reach — a standing one held where it was said while they do not let it carry', count(html, /still on<\/span> · for the rest of that conversation/g) === 2 && !/in every conversation/.test(html), html);
  const carrying = view({ adjustments: list, settings: { ...DEFAULTS, carryAcross: true } });
  ok('  "in every conversation" only while they let it carry', /still on<\/span> · in every conversation/.test(carrying) && count(carrying, /for the rest of that conversation/g) === 1, carrying);
  ok('no code reaches the page', !/ifr\.|mr\.|explicit\.|observed\.|_questions|no_such_rule/.test(html.replace(/class="[^"]*"|id="[^"]*"|aria-[a-z]+="[^"]*"|for="[^"]*"/g, '')), html);
}

console.log('\n=== the list claims no more than is so ===');
{
  // `conversation` only says it was recorded with a conversation id; how far
  // it reaches is its scope. A two-turn adjustment is not "for the rest of
  // that conversation".
  const few = view({ adjustments: [adj({ status: 'active', scope: 'turns', conversation: true })] });
  ok('a few-turn adjustment in force: still on, and no claim that it lasts the conversation', /still on/.test(few) && !/for the rest of that conversation|in every conversation/.test(few), few);
  const one = view({ adjustments: [adj({ status: 'active', scope: 'turn', conversation: true })] });
  ok('  nor a one-reply one', !/for the rest of that conversation/.test(one), one);
  const unknown = view({ adjustments: [adj({ status: 'active', scope: null, conversation: true })] });
  ok('  no scope in the answer → no claim about reach', /still on/.test(unknown) && !/for the rest of that conversation|in every conversation/.test(unknown), unknown);
  const conv = view({ adjustments: [adj({ status: 'active', scope: 'conversation' })] });
  ok('  a conversation-long one says so', /still on<\/span> · for the rest of that conversation/.test(conv), conv);
  const ended = view({ adjustments: [adj({ status: 'ended', scope: 'conversation' })] });
  ok('  an ended one says neither', !/still on|for the rest of/.test(ended), ended);

  // their "off" ends every adjustment (lib/mr/experiment.ts: user_off → baseline)
  const off = view({ settings: { ...DEFAULTS, enabled: false, carryAcross: true }, adjustments: [adj({ status: 'active', scope: 'standing', standing: true }), adj({ status: 'active', scope: 'conversation' })] });
  ok('switched off: nothing is "still on", and no reach is claimed', !/still on|in every conversation|for the rest of/.test(off) && count(off, /<li /g) === 2, off);

  const partEmpty = view({ adjustments: [], adjustmentsIncomplete: true });
  ok('a list the account could not read is not "Nothing adjusted yet"', !/Nothing adjusted yet/.test(partEmpty) && /couldn(&#x27;|’)t be loaded/.test(partEmpty), partEmpty);
  const part = view({ adjustments: [adj()], adjustmentsIncomplete: true });
  ok('  and a partial one says it is partial', count(part, /<li /g) === 1 && /Some adjustments couldn(&#x27;|’)t be loaded/.test(part), part);
  ok('  (a complete one says neither)', !/couldn(&#x27;|’)t be loaded/.test(view({ adjustments: [adj()] })) && !/couldn(&#x27;|’)t be loaded/.test(view()));

  const locked = view({ settingsUnsupported: true });
  const lockedSwitches = [...locked.matchAll(/<button[^>]*role="switch"[^>]*>/g)].map((m) => m[0]);
  ok('an account that cannot keep the settings: both switches say they are not available, and why', lockedSwitches.length === 2 && lockedSwitches.every((t) => /aria-disabled="true"/.test(t) && /aria-describedby="[^"]*mr-locked"/.test(t)) && /id="mr-locked"/.test(locked), J(lockedSwitches));
  ok('  (an account that can: neither is)', ![...view().matchAll(/<button[^>]*role="switch"[^>]*>/g)].some((m) => /aria-disabled/.test(m[0])) && !/mr-locked/.test(view()));
}

console.log('\n=== reset asks first ===');
{
  const html = view({ adjustments: [adj()] });
  ok("a 'Reset adjustments' button", /<button type="button" class="mr-reset">Reset adjustments<\/button>/.test(html), html);
  ok('  and no confirmation until it is pressed', !/Keep them/.test(html) && !/class="mr-reset-yes"/.test(html));
  const busy = view({ resetting: true });
  ok('while a reset is out it says so and cannot be pressed twice', /aria-disabled="true"/.test(busy) && /Resetting…/.test(busy), busy);
  const src = readFileSync(join(root, 'components/account/MRSettings.tsx'), 'utf8');
  ok('the confirm step has Reset and a safe way out, and focus goes to the safe one', /className="mr-reset-yes"/.test(src) && /Keep them/.test(src) && /if \(confirming\) keepBtn\.current\?\.focus\(\)/.test(src));
}

// ── the client, through a fake fetch with deferred answers ───────────

function fakeFetch() {
  const calls = [];
  const fetch = (url, init = {}) =>
    new Promise((resolve, reject) => {
      calls.push({ url, method: init.method ?? 'GET', body: init.body, resolve, reject });
    });
  const answer = (i, status, body) => calls[i].resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
  return { fetch, calls, answer };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const GOOD = (over = {}) => ({ active: true, settings: { ...DEFAULTS }, adjustments: [adj()], ...over });

console.log('\n=== loading ===');
{
  {
    const f = fakeFetch();
    const seen = [];
    const c = U.mrSettingsClient({ fetch: f.fetch, emit: (s) => seen.push(s) }, false);
    await c.load(false);
    ok('signed out: the account is not asked', f.calls.length === 0 && c.snapshot().state === 'signed-out');
  }
  const cases = [
    ['401', 401, {}, 'signed-out', false],
    ['500', 500, { error: 'x' }, 'failed', false],
    ['not JSON-shaped', 200, 'nope', 'failed', false],
    ['active: true', 200, GOOD(), 'ready', true],
    ["active: 'true' (a string)", 200, GOOD({ active: 'true' }), 'ready', false],
    ['active missing', 200, { settings: DEFAULTS, adjustments: [] }, 'ready', false],
  ];
  for (const [name, status, body, state, active] of cases) {
    const f = fakeFetch();
    const c = U.mrSettingsClient({ fetch: f.fetch, emit: () => {} });
    const p = c.load(true);
    ok(`${name}: loading first`, c.snapshot().state === 'loading' && f.calls[0]?.url === '/api/mr' && f.calls[0]?.method === 'GET');
    f.answer(0, status, body);
    await p;
    ok(`  → ${state}, active ${active}`, c.snapshot().state === state && c.snapshot().active === active, J(c.snapshot()));
  }
  {
    const f = fakeFetch();
    const c = U.mrSettingsClient({ fetch: f.fetch, emit: () => {} });
    const p = c.load(true);
    f.calls[0].reject(new Error('offline'));
    await p;
    ok('offline → failed, and nothing shows', c.snapshot().state === 'failed' && c.snapshot().active === false);
  }
  {
    const f = fakeFetch();
    const c = U.mrSettingsClient({ fetch: f.fetch, emit: () => {} });
    const p = c.load(true);
    c.stop();
    f.answer(0, 200, GOOD());
    await p;
    ok('a load answered after the sheet closed is not adopted', c.snapshot().state === 'loading' && c.snapshot().active === false);
  }
}

/** A client already loaded with `body`. */
async function loaded(body = GOOD()) {
  const f = fakeFetch();
  const seen = [];
  const c = U.mrSettingsClient({ fetch: f.fetch, emit: (s) => seen.push(s) });
  const p = c.load(true);
  f.answer(0, 200, body);
  await p;
  return { f, c, seen };
}

console.log('\n=== a switch moves at once, and comes back if the account refuses ===');
{
  {
    const { f, c, seen } = await loaded();
    const p = c.setEnabled(false);
    ok('optimistic: off before the account answers', c.snapshot().settings.enabled === false && seen.at(-1).settings.enabled === false);
    ok('  one PUT with only that switch', f.calls[1].method === 'PUT' && f.calls[1].body === J({ enabled: false }), J(f.calls[1]));
    f.answer(1, 200, { ok: true, settings: { ...DEFAULTS, enabled: false } });
    ok('  the account took it → true, and it stays off', (await p) === true && c.snapshot().settings.enabled === false);
  }
  for (const [name, status, body] of [['500', 500, { error: 'x' }], ['ok: false', 200, { ok: false }], ['no body', 200, null]]) {
    const { f, c } = await loaded();
    const p = c.setCarryAcross(true);
    ok(`${name}: on at once`, c.snapshot().settings.carryAcross === true);
    f.answer(1, status, body);
    ok(`  refused → false, and put back off`, (await p) === false && c.snapshot().settings.carryAcross === false, J(c.snapshot().settings));
  }
  {
    const { f, c } = await loaded();
    const p = c.setEnabled(false);
    f.calls[1].reject(new Error('offline'));
    ok('offline → put back', (await p) === false && c.snapshot().settings.enabled === true);
  }
  {
    const { f, c } = await loaded();
    const p = c.setEnabled(false);
    f.answer(1, 401, {});
    ok('signed out under it → false, and the section goes', (await p) === false && c.snapshot().state === 'signed-out');
  }
  {
    // two quick flips: off, then on again. The first fails late: the last flip stands.
    const { f, c } = await loaded();
    const p1 = c.setEnabled(false);
    const p2 = c.setEnabled(true);
    f.answer(2, 200, { ok: true, settings: { ...DEFAULTS, enabled: true } });
    await p2;
    f.answer(1, 500, {});
    await p1;
    ok('two quick flips settle on the last, whatever happens to the first', c.snapshot().settings.enabled === true);
  }
  {
    // the same choice twice; the first is refused while the second is still out
    const { f, c } = await loaded();
    const p1 = c.setEnabled(false);
    const p2 = c.setEnabled(false);
    f.answer(1, 500, {});
    await p1;
    ok('a refused flip is not put back while a newer flip of that switch is on its way', c.snapshot().settings.enabled === false, J(c.snapshot().settings));
    f.answer(2, 200, { ok: true, settings: { ...DEFAULTS, enabled: false } });
    ok('  and the newer one, taken, stands', (await p2) === true && c.snapshot().settings.enabled === false);
  }
  {
    // the first lands, the second is refused: back to what the account holds after the first
    const { f, c } = await loaded();
    const p1 = c.setEnabled(false);
    const p2 = c.setEnabled(true);
    f.answer(1, 200, { ok: true, settings: { ...DEFAULTS, enabled: false } });
    await p1;
    ok('  an answer for an older flip does not move the switch', c.snapshot().settings.enabled === true);
    f.answer(2, 500, {});
    await p2;
    ok('  the newer one refused → back to the older, which the account holds', c.snapshot().settings.enabled === false);
  }
  {
    // flipping one switch while the other is on its way: each keeps its own
    const { f, c } = await loaded();
    const pe = c.setEnabled(false);
    const pc = c.setCarryAcross(true);
    f.answer(1, 200, { ok: true, settings: { ...DEFAULTS, enabled: false, carryAcross: false } });
    await pe;
    ok("the account's answer for one switch does not undo the other's flip on its way", c.snapshot().settings.carryAcross === true && c.snapshot().settings.enabled === false);
    f.answer(2, 500, {});
    await pc;
    ok('  and the other, refused, goes back on its own', c.snapshot().settings.carryAcross === false && c.snapshot().settings.enabled === false);
  }
  {
    const { f, c } = await loaded();
    const p = c.setEnabled(false);
    f.answer(1, 200, { ok: true, settings: { ...DEFAULTS, enabled: false, resetAt: 123 } });
    await p;
    ok("the account's own answer is adopted (its resetAt, say)", c.snapshot().settings.resetAt === 123);
  }
  {
    // a load that went out before a flip comes back after it
    const f = fakeFetch();
    const c = U.mrSettingsClient({ fetch: f.fetch, emit: () => {} });
    const first = c.load(true);
    f.answer(0, 200, GOOD());
    await first;
    const again = c.load(true);
    const p = c.setCarryAcross(true);
    f.answer(1, 200, GOOD()); // carryAcross false, as of before the flip
    await again;
    ok('a load that started before a flip does not undo it', c.snapshot().settings.carryAcross === true);
    f.answer(2, 200, { ok: true, settings: { ...DEFAULTS, carryAcross: true } });
    await p;
  }
}

console.log('\n=== a refused switch goes back to what the account holds ===');
{
  for (const order of ['newer first', 'older first']) {
    // on → off → on, both refused: the account still holds on
    const { f, c } = await loaded();
    const p1 = c.setEnabled(false);
    const p2 = c.setEnabled(true);
    if (order === 'newer first') {
      f.answer(2, 500, {});
      await p2;
      f.answer(1, 500, {});
      await p1;
    } else {
      f.answer(1, 500, {});
      await p1;
      f.answer(2, 500, {});
      await p2;
    }
    ok(`two flips both refused (${order}) → the account's value, not the first flip's`, c.snapshot().settings.enabled === true, J(c.snapshot().settings));
  }
  {
    // the newer is refused first; the older then lands — the account now holds the older
    const { f, c } = await loaded();
    const p1 = c.setEnabled(false);
    const p2 = c.setEnabled(true);
    f.answer(2, 500, {});
    await p2;
    f.answer(1, 200, { ok: true, settings: { ...DEFAULTS, enabled: false } });
    ok('  the newer refused, the older taken after it → shows what the account took', (await p1) === true && c.snapshot().settings.enabled === false, J(c.snapshot().settings));
  }
  {
    // three flips; the middle one lands, the last is refused
    const { f, c } = await loaded();
    const ps = [c.setCarryAcross(true), c.setCarryAcross(false), c.setCarryAcross(true)];
    f.answer(2, 200, { ok: true, settings: { ...DEFAULTS, carryAcross: false } });
    await ps[1];
    f.answer(3, 500, {});
    await ps[2];
    f.answer(1, 500, {});
    await ps[0];
    ok('  three flips, only the middle taken → consent shows off, as the account holds it', c.snapshot().settings.carryAcross === false, J(c.snapshot().settings));
  }
  {
    // a read that goes out while a PUT is on its way, and answers after it
    const { f, c } = await loaded();
    const p = c.setEnabled(false);
    const again = c.load(true);
    f.answer(1, 200, { ok: true, settings: { ...DEFAULTS, enabled: false } });
    await p;
    f.answer(2, 200, GOOD()); // read before the write landed: enabled true
    await again;
    ok('a read that was out with a PUT does not undo what the PUT said the account holds', c.snapshot().settings.enabled === false, J(c.snapshot().settings));
  }
  {
    // the account could not read their settings: no guess
    const { f, c } = await loaded(GOOD({ settings: null, incomplete: ['settings'] }));
    ok('settings unreadable on the first load → nothing shows (never the defaults)', c.snapshot().state === 'failed' && c.snapshot().active === false, J(c.snapshot()));
    ok('  and nothing was asked to change', f.calls.length === 1);
  }
  {
    const { f, c } = await loaded(GOOD({ settings: { ...DEFAULTS, enabled: false } }));
    const p = c.reset();
    f.answer(1, 200, { ok: true });
    await tick();
    f.answer(2, 200, GOOD({ settings: null, adjustments: [] }));
    await p;
    ok('  after a reset, a re-read without settings keeps the ones already read (still off)', c.snapshot().state === 'ready' && c.snapshot().settings.enabled === false, J(c.snapshot().settings));
  }
  {
    const { c } = await loaded(GOOD({ incomplete: ['adjustments'], adjustments: [], settingsUnsupported: true }));
    ok('incomplete and unsupported reach the snapshot', c.snapshot().adjustmentsIncomplete === true && c.snapshot().settingsUnsupported === true);
  }
  {
    const { c } = await loaded(GOOD({ adjustments: [adj({ applied: false, status: 'active' }), adj({ turn: 4, applied: true })] }));
    ok('a shadow decision does not reach the list', c.snapshot().adjustments.length === 1 && c.snapshot().adjustments[0].turn === 4, J(c.snapshot().adjustments));
  }
}

console.log('\n=== reset ===');
{
  {
    const { f, c } = await loaded(GOOD({ adjustments: [adj(), adj({ turn: 4, at: NOW - 1000 })] }));
    const p = c.reset();
    ok('the list clears at once', c.snapshot().adjustments.length === 0 && c.snapshot().resetting === true);
    ok('  one DELETE', f.calls[1].method === 'DELETE' && f.calls[1].url === '/api/mr');
    f.answer(1, 200, { ok: true });
    await tick();
    ok('  then the account is read again', f.calls[2]?.method === 'GET', J(f.calls.map((x) => x.method)));
    f.answer(2, 200, GOOD({ adjustments: [], settings: { ...DEFAULTS, resetAt: NOW } }));
    ok('  → true, its resetAt adopted, nothing listed', (await p) === true && c.snapshot().settings.resetAt === NOW && c.snapshot().adjustments.length === 0 && c.snapshot().resetting === false);
  }
  for (const [name, status, body] of [['500', 500, {}], ['ok: false', 200, { ok: false }]]) {
    const { f, c } = await loaded(GOOD({ adjustments: [adj(), adj({ turn: 4 })] }));
    const p = c.reset();
    f.answer(1, status, body);
    ok(`${name}: refused → false, and the list comes back`, (await p) === false && c.snapshot().adjustments.length === 2 && c.snapshot().resetting === false);
  }
  {
    // a load already out when reset is pressed would bring the old list back
    const { f, c } = await loaded();
    const stale = c.load(true);
    const p = c.reset();
    f.answer(1, 200, GOOD({ adjustments: [adj(), adj()] }));
    await stale;
    ok('a load already out when reset is pressed is not adopted', c.snapshot().adjustments.length === 0);
    f.answer(2, 200, { ok: true });
    await tick();
    f.answer(3, 200, GOOD({ adjustments: [] }));
    await p;
  }
  {
    // a reset that went through but whose re-read failed keeps the section
    const { f, c } = await loaded();
    const p = c.reset();
    f.answer(1, 200, {});
    await tick();
    f.answer(2, 500, {});
    ok('a re-read that fails after a reset does not hide the section', (await p) === true && c.snapshot().state === 'ready' && c.snapshot().active === true);
  }
}

console.log('\n=== reading the answer strictly ===');
{
  const s = U.mrSettingsFrom({ enabled: 'no', carryAcross: 'yes', research: { studyId: 7 }, resetAt: 'yesterday' });
  ok('a field of the wrong type is the default; consent is only a plain true', s.enabled === true && s.carryAcross === false && s.research === null && s.resetAt === null && s.version === 1, J(s));
  ok('a plain false is kept', U.mrSettingsFrom({ enabled: false }).enabled === false);
  ok('no settings object → null, and the answer says so (never the defaults in its place)', U.mrSettingsFrom(null) === null && U.mrSettingsFrom([true]) === null && U.mrResponseFrom({ active: true }).settings === null && U.mrResponseFrom({ active: true, settings: null }).settings === null);
  const list = U.mrAdjustmentsFrom([
    adj({ at: NOW - 10 }),
    adj({ action: 'none' }),
    adj({ action: 'rm_rf' }),
    adj({ turn: -1 }),
    adj({ turn: 1.5 }),
    adj({ at: Infinity }),
    adj({ at: 0 }),
    'junk',
    null,
    adj({ at: NOW, status: 'running', conversation: 'yes', standing: 1, trigger: 'ifr.' + 'x'.repeat(200) }),
    adj({ at: NOW - 20, trigger: 42 }),
  ]);
  ok('a malformed entry is dropped, and so is a "none"', list.length === 3, J(list));
  ok('newest first', list[0].at === NOW && list[1].at === NOW - 10 && list[2].at === NOW - 20);
  ok('status is active only when it says so; reach only on a plain true', list[0].status === 'ended' && list[0].conversation === false && list[0].standing === false);
  ok('a trigger is bounded, and a non-string one is empty', list[0].trigger.length === 80 && list[2].trigger === '');
  const applied = U.mrAdjustmentsFrom([adj({ turn: 1, applied: true }), adj({ turn: 2, applied: false }), adj({ turn: 3, applied: null }), adj({ turn: 4 })]);
  ok('a decision that changed nothing (shadow, a comparison arm: applied false) is not an adjustment', applied.length === 3 && !applied.some((a) => a.turn === 2), J(applied));
  const scoped = U.mrAdjustmentsFrom(['turn', 'turns', 'conversation', 'standing', 'forever', 7, undefined].map((scope, i) => adj({ turn: i, at: NOW - i, scope })));
  ok('scope is one of the four, or null', J(scoped.map((a) => a.scope)) === J(['turn', 'turns', 'conversation', 'standing', null, null, null]), J(scoped.map((a) => a.scope)));
  const r = U.mrResponseFrom({ active: true, settings: DEFAULTS, adjustments: [], incomplete: ['adjustments'], settingsUnsupported: true });
  ok('incomplete and settingsUnsupported are read', r.adjustmentsIncomplete === true && r.settingsUnsupported === true);
  const r2 = U.mrResponseFrom({ active: true, settings: DEFAULTS, adjustments: [], incomplete: 'adjustments', settingsUnsupported: 'yes' });
  ok('  only in their own shape', r2.adjustmentsIncomplete === false && r2.settingsUnsupported === false);
  ok('not a list → nothing', U.mrAdjustmentsFrom({ length: 3 }).length === 0);
  ok('the list kept is bounded', U.mrAdjustmentsFrom(Array.from({ length: 500 }, (_, i) => adj({ turn: i, at: NOW - i }))).length === 50);
}


console.log('\n=== answers that arrive out of order: the sheet shows what the account holds (MR-PRIV-5) ===');
{
  /**
   * An account behind a fake fetch: a request is APPLIED (the server reads or
   * writes, and stamps) and DELIVERED (its answer arrives) separately, in
   * whatever order a test says — two serverless instances, HTTP/2.
   */
  function account(initial = { ...DEFAULTS }) {
    let state = { ...initial };
    let stamp = 10;
    const calls = [];
    const fetch = (url, init = {}) => new Promise((resolve) => calls.push({ method: init.method ?? 'GET', body: init.body, resolve, answer: null }));
    const apply = (i) => {
      const c = calls[i];
      if (c.method === 'PUT') {
        state = { ...state, ...JSON.parse(c.body) };
        stamp += 1;
        c.answer = { ok: true, settings: { ...state }, stamp };
      } else c.answer = GOOD({ settings: { ...state }, stamp, adjustments: [adj({ turn: 7 })] });
    };
    const deliver = async (i) => {
      calls[i].resolve({ ok: true, status: 200, json: async () => calls[i].answer });
      await tick();
      await tick();
    };
    return { fetch, calls, apply, deliver, holds: () => state };
  }
  const start = async (a) => {
    const c = U.mrSettingsClient({ fetch: a.fetch, emit: () => {} });
    const p = c.load(true);
    a.apply(0);
    await a.deliver(0);
    await p;
    return c;
  };
  for (const applied of [[1, 2], [2, 1]]) {
    for (const delivered of [[1, 2], [2, 1]]) {
      const a = account();
      const c = await start(a);
      const p1 = c.setEnabled(false);
      const p2 = c.setEnabled(true);
      for (const i of applied) a.apply(i);
      for (const i of delivered) await a.deliver(i);
      await Promise.all([p1, p2]);
      ok(`two quick flips, applied ${applied.join('→')}, answered ${delivered.join('→')}: the sheet shows what the account holds`, c.snapshot().settings.enabled === a.holds().enabled, `sheet ${c.snapshot().settings.enabled} | account ${a.holds().enabled}`);
    }
  }
  {
    // the review's probe: applied in order, answered newest first
    const a = account();
    const c = await start(a);
    const p1 = c.setEnabled(false);
    const p2 = c.setEnabled(true);
    a.apply(1);
    a.apply(2);
    await a.deliver(2);
    await a.deliver(1);
    await Promise.all([p1, p2]);
    ok('  (the review\'s case: the older answer, arriving last, does not turn the switch back off)', c.snapshot().settings.enabled === true && a.holds().enabled === true);
  }
  {
    // the two switches, each flipped once, answered out of order
    const a = account();
    const c = await start(a);
    const pe = c.setEnabled(false);
    const pc = c.setCarryAcross(true);
    a.apply(1);
    a.apply(2);
    await a.deliver(2);
    await a.deliver(1);
    await Promise.all([pe, pc]);
    ok('  one flip of each switch, answered newest first: both as the account holds them', c.snapshot().settings.enabled === false && c.snapshot().settings.carryAcross === true, J(c.snapshot().settings));
  }
  {
    // a read that saw the account before a write whose answer is already in
    const a = account();
    const c = await start(a);
    const p = c.setEnabled(false);
    const again = c.load(true);
    a.apply(2); // the read: before the write
    a.apply(1); // the write
    await a.deliver(1);
    await p;
    await a.deliver(2);
    await again;
    ok('a read older than a write already answered does not undo it', c.snapshot().settings.enabled === false && a.holds().enabled === false, J(c.snapshot().settings));
    ok('  (the rest of that answer — the list — is still taken)', c.snapshot().adjustments.length === 1 && c.snapshot().adjustments[0].turn === 7);
    const third = c.load(true);
    a.apply(3);
    await a.deliver(3);
    await third;
    ok('  and a newer read is the account again', c.snapshot().settings.enabled === false && J(c.snapshot().settings) === J({ ...a.holds(), research: null }), J(c.snapshot().settings));
  }
  {
    // a flip the account took, whose stamp is older than one already adopted, still says it was taken
    const a = account();
    const c = await start(a);
    const p1 = c.setCarryAcross(true);
    const p2 = c.setCarryAcross(false);
    a.apply(1);
    a.apply(2);
    await a.deliver(2);
    await a.deliver(1);
    ok('  an older answer is not adopted, but the flip it answers was taken: true', (await p1) === true && (await p2) === true && c.snapshot().settings.carryAcross === false);
  }
  ok('the stamp is read strictly', U.mrStampFrom({ stamp: 12 }) === 12 && U.mrStampFrom({ stamp: '12' }) === null && U.mrStampFrom({ stamp: Infinity }) === null && U.mrStampFrom(null) === null);
}

console.log('\n=== a reset that removed the rows but could not save itself (MR-PRIV-9) ===');
{
  {
    const { f, c } = await loaded(GOOD({ adjustments: [adj(), adj({ turn: 4 })], unlisted: 2 }));
    const p = c.reset();
    f.answer(1, 500, { ok: false, deleted: true, stamped: false, error: 'What MR recorded was removed, but the reset itself could not be saved. Please reset again.' });
    await tick();
    ok('the list stays clear — the rows are gone — never "nothing was cleared"', c.snapshot().adjustments.length === 0 && c.snapshot().unlisted === 0);
    ok('  and the account is read again for what it does hold', f.calls[2]?.method === 'GET', J(f.calls.map((x) => x.method)));
    f.answer(2, 200, GOOD({ adjustments: [] }));
    ok("  → 'partial' (not true, not false)", (await p) === 'partial' && c.snapshot().resetting === false && c.snapshot().adjustments.length === 0);
  }
  {
    const { f, c } = await loaded(GOOD({ adjustments: [adj()], unlisted: 2 }));
    const p = c.reset();
    f.answer(1, 500, { error: 'Could not delete what MR recorded. Please try again.' });
    ok('a reset that deleted nothing is still a plain refusal: false, and the list and its count come back', (await p) === false && c.snapshot().adjustments.length === 1 && c.snapshot().unlisted === 2);
  }
}

console.log('\n=== what still holds and is not listed is counted, never hidden (MR-PRIV-4) ===');
{
  const two = view({ unlisted: 2 });
  ok('an empty list with adjustments in force it has no entry for: not "Nothing adjusted yet"', !/Nothing adjusted yet/.test(two) && /2 adjustments are still on but aren’t listed here\./.test(two), two);
  const reset = view({ unlisted: 1, settings: { ...DEFAULTS, resetAt: NOW - 1000 } });
  ok('  after a reset, it says why: what they asked for before it still holds where they asked', /1 adjustment is still on but isn’t listed here: what you asked for before your last reset still holds in the conversation you asked in\./.test(reset), reset);
  const more = view({ adjustments: [adj({ status: 'active', scope: 'conversation' })], unlisted: 1 });
  ok('  under a list: "more"', /<li /.test(more) && /1 more adjustment is still on but isn’t listed here/.test(more), more);
  ok('  with MR off for them nothing is "still on", so no count', !/still on but/.test(view({ unlisted: 3, settings: { ...DEFAULTS, enabled: false } })));
  ok('  a list that could not be read says that first', /couldn(&#x27;|’)t be loaded/.test(view({ unlisted: 2, adjustmentsIncomplete: true })) && !/still on but/.test(view({ unlisted: 2, adjustmentsIncomplete: true })));
  ok('  nothing unlisted: the empty list says so as before', /Nothing adjusted yet/.test(view({ unlisted: 0 })) && /Nothing adjusted yet/.test(view()));
  const r = U.mrResponseFrom({ active: true, settings: DEFAULTS, adjustments: [], unlisted: 3 });
  ok('the count is read strictly: a whole number, bounded', r.unlisted === 3 && [-1, 1.5, '3', null, undefined, NaN].every((n) => U.mrResponseFrom({ active: true, settings: DEFAULTS, unlisted: n }).unlisted === 0) && U.mrResponseFrom({ active: true, settings: DEFAULTS, unlisted: 5000 }).unlisted === 999);
  const { c } = await loaded(GOOD({ unlisted: 2 }));
  ok('  and reaches the snapshot', c.snapshot().unlisted === 2);
}

console.log('\n=== reset says what it does — not "everything ends" (MR-PRIV-4) ===');
{
  const src = readFileSync(join(root, 'components/account/MRSettings.tsx'), 'utf8');
  ok('no claim that every adjustment ends, or that nothing from before is used again', !/End every adjustment|Nothing from before is used again|Nothing it adjusted before now is used again/.test(src));
}

console.log('\n=== wired into the account sheet, and nowhere it should not reach ===');
{
  const sheet = readFileSync(join(root, 'components/account/AccountSheet.tsx'), 'utf8');
  const personalization = sheet.slice(sheet.indexOf('<span className="lbl">Personalization</span>'), sheet.indexOf('{/* The university programme.'));
  ok('one <MRSettings /> in the sheet', count(sheet, /<MRSettings\b/g) === 1);
  ok('  inside Personalization, after their own words and before the name', /<LogosInstructions \/>\s*<\/div>\s*\{\/\*[^]*?\*\/\}\s*<MRSettings signedIn=\{!!user\} \/>\s*<div className="sub">\s*<h3 className="sub-h">What Socria calls you<\/h3>/.test(personalization), personalization.slice(0, 200));
  const comp = readFileSync(join(root, 'components/account/MRSettings.tsx'), 'utf8');
  const hook = readFileSync(join(root, 'components/useMRSettings.ts'), 'utf8');
  ok('client components, both', /^'use client';/.test(comp) && /^'use client';/.test(hook));
  ok('neither reaches the ledger, the database or the model', ![comp, hook].some((s) => /lib\/mr\/(ledger|store|deliberate|index)|lib\/supabase|openai/.test(s)));
  ok('no browser copy of the settings (the server reads them each turn)', !/localStorage|sessionStorage/.test(comp + hook));
  const css = readFileSync(join(root, 'app/account-sheet.css'), 'utf8');
  const mine = css.split('\n').filter((l) => /\.mr-/.test(l));
  ok('its styles are scoped to the sheet', mine.length > 5 && mine.every((l) => /^\s*\.acct-sheet \.mr-|^@media.*\.acct-sheet \.mr-|^\.acct-sheet \.mr-|^\s*\.acct-sheet \.mr-/.test(l) || !/^[.@]/.test(l.trim())), J(mine.filter((l) => !/\.acct-sheet \.mr-/.test(l))));
  ok('  with a visible focus ring on the switch', /\.acct-sheet \.mr-switch:focus-visible\{outline:2px solid/.test(css));
}

console.log('\n=== driven like a person would (jsdom) ===');
{
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
  const w = dom.window;
  for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLButtonElement', 'Node', 'Event', 'MouseEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    try {
      globalThis[k] = k === 'window' ? w : w[k];
    } catch {}
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import('react-dom/client');
  const { act } = await import('react');
  const quiet = console.error;
  console.error = (...a) => (/not wrapped in act|Not implemented/.test(String(a[0])) ? undefined : quiet(...a));
  const mount = async (el) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(el));
    return { host, rerender: (e) => act(async () => root.render(e)), unmount: () => act(async () => root.unmount()) };
  };
  const press = (b) => act(async () => void b.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })));
  const props = (over = {}) => ({ state: 'ready', active: true, settings: DEFAULTS, adjustments: [], adjustmentsIncomplete: false, settingsUnsupported: false, resetting: false, setEnabled: noop, setCarryAcross: noop, reset: noop, now: NOW, ...over });

  {
    const calls = [];
    const m = await mount(h(U.MRSettingsView, props({ setEnabled: async (on) => (calls.push(['enabled', on]), true), setCarryAcross: async (on) => (calls.push(['carry', on]), false) })));
    await press(m.host.querySelector('#mr-enabled'));
    ok('pressing a switch asks for the other position', J(calls) === J([['enabled', false]]), J(calls));
    ok('  and says it saved', /Saved\./.test(m.host.querySelector('[role="status"]').textContent));
    await press(m.host.querySelector('label[for="mr-carry"]'));
    ok('its label flips it too', J(calls.at(-1)) === J(['carry', true]), J(calls));
    ok('  a change the account refused is said, and stays said', /did not save/.test(m.host.querySelector('[role="status"]').textContent) && /is-bad/.test(m.host.querySelector('[role="status"]').className));
    await m.unmount();
  }
  {
    const calls = [];
    const m = await mount(h(U.MRSettingsView, props({ settingsUnsupported: true, setEnabled: async (on) => (calls.push(on), true), setCarryAcross: async (on) => (calls.push(on), true) })));
    await press(m.host.querySelector('#mr-enabled'));
    await press(m.host.querySelector('#mr-carry'));
    await press(m.host.querySelector('label[for="mr-enabled"]'));
    ok('locked (the account cannot keep it): pressing sends nothing and claims nothing', calls.length === 0 && m.host.querySelector('[role="status"]').textContent === '', J(calls));
    await m.unmount();
  }
  {
    let resets = 0;
    const m = await mount(h(U.MRSettingsView, props({ adjustments: [adj()], reset: async () => (resets++, true) })));
    await press(m.host.querySelector('.mr-reset'));
    ok('Reset asks first, and focus goes to the safe answer', resets === 0 && !!m.host.querySelector('.mr-reset-yes') && document.activeElement === m.host.querySelector('.mr-reset-no'));
    await press(m.host.querySelector('.mr-reset-no'));
    ok('  "Keep them" resets nothing and gives focus back to Reset', resets === 0 && !m.host.querySelector('.mr-reset-yes') && document.activeElement === m.host.querySelector('.mr-reset'));
    await press(m.host.querySelector('.mr-reset'));
    await press(m.host.querySelector('.mr-reset-yes'));
    ok('  confirmed, it resets once and says so', resets === 1 && /^Reset\./.test(m.host.querySelector('[role="status"]').textContent), m.host.querySelector('[role="status"]').textContent);
    await m.rerender(h(U.MRSettingsView, props({ resetting: true, reset: async () => (resets++, true) })));
    await press(m.host.querySelector('.mr-reset'));
    ok('  while one is out, pressing again opens nothing', !m.host.querySelector('.mr-reset-yes') && resets === 1);
    await m.unmount();
  }
  {
    // what the confirm step and the answer say
    let outcome = true;
    const m = await mount(h(U.MRSettingsView, props({ adjustments: [adj()], reset: async () => outcome })));
    await press(m.host.querySelector('.mr-reset'));
    const ask = m.host.querySelector('.mr-confirm').textContent.replace(/\s+/g, ' ');
    ok('the confirm step says what a reset ends and what it does not', /What it adjusted on its own ends in every conversation it kept a record of, from your next message there/.test(ask) && /nothing from before is carried into another conversation/.test(ask) && /What you asked for in your own words still holds in the conversation you said it in/.test(ask) && /nothing was recorded for \(incognito, off the record\) has nothing to reset/.test(ask), ask);
    ok('  described by that text, for a screen reader', m.host.querySelector('.mr-confirm').getAttribute('aria-describedby') === 'mr-confirm-d' && !!m.host.querySelector('#mr-confirm-d'));
    await press(m.host.querySelector('.mr-reset-yes'));
    const done = m.host.querySelector('[role="status"]').textContent;
    ok('  done: it says Socria\'s own adjustments end and what they asked for still holds', /^Reset\. What Socria adjusted on its own ends from your next message, in every conversation it kept a record of; what you asked for still holds where you asked for it\.$/.test(done) && !/is-bad/.test(m.host.querySelector('[role="status"]').className), done);
    outcome = 'partial';
    await press(m.host.querySelector('.mr-reset'));
    await press(m.host.querySelector('.mr-reset-yes'));
    const part = m.host.querySelector('[role="status"]');
    ok("  'partial': the rows were removed, the reset should be tried again — said as a problem, and it stays", /What Socria recorded was removed, but the reset itself didn’t save\. Reset again to finish it\./.test(part.textContent) && /is-bad/.test(part.className) && !/nothing was cleared/.test(part.textContent), part.textContent);
    outcome = false;
    await press(m.host.querySelector('.mr-reset'));
    await press(m.host.querySelector('.mr-reset-yes'));
    ok('  refused: nothing was cleared, as before', /did not reset, so nothing was cleared/.test(m.host.querySelector('[role="status"]').textContent));
    await m.unmount();
  }
  {
    // the real wrapper, through the real hook, against a fake account
    const realFetch = globalThis.fetch;
    const seen = [];
    let answer = { status: 200, body: GOOD({ settings: null, incomplete: ['settings'] }) };
    globalThis.fetch = async (url, init = {}) => {
      seen.push(`${init.method ?? 'GET'} ${url}${init.body ? ' ' + init.body : ''}`);
      if ((init.method ?? 'GET') === 'PUT') return { ok: true, status: 200, json: async () => ({ ok: true, settings: { ...DEFAULTS, ...JSON.parse(init.body) } }) };
      return { ok: answer.status < 300, status: answer.status, json: async () => answer.body };
    };
    let m = await mount(h(U.MRSettings, { signedIn: true }));
    ok('<MRSettings /> with settings the account could not read: asked once, shows nothing', seen.length === 1 && m.host.innerHTML === '', m.host.innerHTML);
    await m.unmount();
    answer = { status: 200, body: GOOD({ settings: { ...DEFAULTS, enabled: false } }) };
    m = await mount(h(U.MRSettings, { signedIn: true }));
    const sw = m.host.querySelector('#mr-enabled');
    ok('  with an answer: the switches show the account (off)', !!sw && sw.getAttribute('aria-checked') === 'false', m.host.innerHTML.slice(0, 200));
    await press(sw);
    ok('  pressing it sends one PUT and it shows on', seen.at(-1) === 'PUT /api/mr {"enabled":true}' && m.host.querySelector('#mr-enabled').getAttribute('aria-checked') === 'true', J(seen));
    await m.unmount();
    answer = { status: 200, body: GOOD({ active: false }) };
    m = await mount(h(U.MRSettings, { signedIn: true }));
    ok('  a deployment where MR is off: nothing, even after the answer', m.host.innerHTML === '');
    await m.unmount();
    const before = seen.length;
    m = await mount(h(U.MRSettings, { signedIn: false }));
    ok('  signed out: nothing, and nothing asked', m.host.innerHTML === '' && seen.length === before);
    await m.unmount();
    globalThis.fetch = realFetch;
  }
  console.error = quiet;
}

console.log(`\nmr-settings-ui: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
