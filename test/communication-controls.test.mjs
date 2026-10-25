// The two controls that replaced the depth dial, end to end.
//
// Core 4 decides how hard to think from the evidence in front of it, so the
// dial asked the person a question only somebody who cannot see that evidence
// would be answering. What they CAN judge is how they want to be written to.
//
// THE LOAD-BEARING CLAIM IS A NEGATIVE ONE: these settings reach the register
// and nothing else. core4-voice.test.mjs pins that on the engine — Simple
// changes no move, no coverage, no question budget. This suite pins the wiring
// around it: the tables the menu reads, that the menu is driven by the model
// registry rather than by an id, that Logos 5 actually sends the length it
// stores, and that the routes validate instead of trusting the browser.
//
// Readability, the other dial, went with the Core chat when it was archived
// on 24 October 2026: Logos 5 offers the length alone
// (components/logos5/ConcisePicker.tsx).

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { READABILITY_OPTIONS, LENGTH_OPTIONS, SOCRIA_MODELS } from './.tmp/socria-prompt.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

console.log('=== the two tables ===');
{
  ok('readability is the three the brief asked for',
    READABILITY_OPTIONS.map((r) => r.id).join(',') === 'simple,standard,advanced',
    READABILITY_OPTIONS.map((r) => r.id).join(','));
  ok('length is the three the brief asked for',
    LENGTH_OPTIONS.map((l) => l.id).join(',') === 'concise,standard,detailed',
    LENGTH_OPTIONS.map((l) => l.id).join(','));

  // A menu row with no sentence under it is a row the person has to guess at.
  for (const o of [...READABILITY_OPTIONS, ...LENGTH_OPTIONS]) {
    ok(`${o.id} says what it does`, o.label.length > 0 && o.description.length > 12, JSON.stringify(o));
  }

  // The middle of each is the default, and the default is the adaptive one:
  // settings are a standing preference, not a template that overrides the
  // reading of the moment.
  ok('standard readability describes adaptation, not a fixed register',
    /pitches|reads the moment/i.test(READABILITY_OPTIONS.find((r) => r.id === 'standard').description));
  ok('standard length describes adaptation too',
    /follows the moment/i.test(LENGTH_OPTIONS.find((l) => l.id === 'standard').description));

  // The whole point of two controls rather than one: neither description may
  // promise the other axis. "Simple" must not mean shorter, "Concise" must not
  // mean plainer — Advanced + Concise has to be a coherent thing to pick.
  const R = READABILITY_OPTIONS.map((r) => r.description).join(' ');
  const L = LENGTH_OPTIONS.map((l) => l.description).join(' ');
  ok('readability never promises a length', !/\b(shorter|longer|brief|length)\b/i.test(R), R);
  ok('length never promises a vocabulary', !/\b(plain|jargon|simpler|technical term)\b/i.test(L), L);
}

console.log('\n=== the registry drives the menu, not a model id ===');
{
  const core4 = SOCRIA_MODELS['core-4'];
  ok('Core 4 has no depth axis', core4.supportsDepth === false);
  ok('  and has the communication axis instead', core4.supportsCommunication === true);

  // Exactly one model may claim it today, and the menu would otherwise show a
  // model both sets of controls at once.
  const both = Object.values(SOCRIA_MODELS).filter((m) => m.supportsDepth && m.supportsCommunication);
  ok('no model claims both axes', both.length === 0, both.map((m) => m.id).join(','));
  const comm = Object.values(SOCRIA_MODELS).filter((m) => m.supportsCommunication);
  ok('only Core 4 carries it', comm.length === 1 && comm[0].id === 'core-4', comm.map((m) => m.id).join(','));
}

console.log('\n=== the dial ===');
{
  // The Core model picker held two dials, readability and length; it was deleted with the Core models.
  // The dial itself is Logos 5's one setting now: how much Socria says (components/logos5/ConcisePicker.tsx).
  const src = read('components/Dial.tsx');
  const concise = read('components/logos5/ConcisePicker.tsx');
  ok('the length reaches a dial', /<Dial name="How much it says" options=\{CONCISENESS\}/.test(concise) && /from '\.\.\/Dial'/.test(concise));
  // A real range input, so drag, click, arrow keys, Home and End all work
  // without any of them being written here — the version of this control that
  // is three styled buttons gets at least one of those wrong.
  ok('the dial is a range input', /type="range"/.test(src));
  ok('  with the position announced as a setting, not as "1 of 3"', /aria-valuetext=\{now\.label\}/.test(src));
  ok('  and a label, since the heading above it is not one', /aria-label=\{name\}/.test(src));
  ok('the stop labels are hidden from the accessibility tree', /className="mp-stops" aria-hidden="true"/.test(src));
  ok('  and unreachable by tab, since the slider already is', /tabIndex=\{-1\}/.test(src));
  ok('the sentence follows the position', /\{now\.description\}/.test(src));
  // "gated on the registry flag", "both settings are required together" and the sheet's note went with the picker.
  // A component that names a model is a component that has to be edited when
  // the next one arrives.
  ok('no model id is special-cased', !/'core-4'/.test(src) && !/'core-4'/.test(concise));
  ok('the sheet does not close on a dial move', !/onPick\([^)]*\);?\s*\n?\s*setOpen\(false\)/.test(src));
}

console.log('\n=== Logos 5 stores the length and sends it ===');
{
  const src = read('components/LogosApp.tsx');
  const page = read('app/chat/page.tsx');
  const send = src.slice(src.indexOf('async function send('), src.indexOf('// ── FOUND ALONG THE WAY'));
  // The keys moved into lib/socria-model-store.ts when onboarding started
  // setting them too: two copies of a storage key is how a preference set in
  // one place quietly fails to be read in another.
  const store = read('lib/socria-model-store.ts');
  // Readability's persist, hydrate, send and picker were the Core chat page's — archived with it.
  ok('the length is persisted', /const pickLength = \(next: ReplyLength\) => \{\s*setReplyLength\(next\);\s*rememberLength\(next\);/.test(src));
  ok('  through one definition of each key, not two',
    /READABILITY_KEY = 'socria\.readability\.v1'/.test(store) && /LENGTH_KEY = 'socria\.length\.v1'/.test(store)
      && [src, page].every((s) => !/'socria\.(readability|length)\.v1'/.test(s)));
  ok('  and hydrated on mount', /useEffect\(\(\) => setReplyLength\(readLength\(\)\), \[\]\);/.test(src));
  // Every Logos request carries guidance(); Logos 5 is the only screen, so the length always rides in it.
  ok('the length is sent with every turn',
    /\.\.\.\(l5Ref\.current \? \{ length: lengthRef\.current, surface: 'logos5' as const \} : \{\}\)/.test(src)
      && /const l5 = true;\s*l5Ref\.current = l5;/.test(src)
      && /fetch\('\/api\/logos\/chat'[\s\S]*?\.\.\.guidance\(\),/.test(send));
  ok('the picker is given it', /<ConcisePicker value=\{replyLength\} onChange=\{pickLength\} \/>/.test(src));

  // A stored value is whatever was last in localStorage, including whatever a
  // previous version of the app or a hand-edit put there.
  ok('an unknown stored readability falls back to standard',
    /raw === 'simple' \|\| raw === 'advanced' \? raw : 'standard'/.test(store));
  ok('an unknown stored length falls back to standard',
    /raw === 'concise' \|\| raw === 'detailed' \? raw : 'standard'/.test(store));
  // A private window throws on every accessor, and a dial is not worth a
  // white screen: both readers answer 'standard' from their catch.
  ok('  and a browser that refuses storage still answers',
    (store.match(/\} catch \{\s*return 'standard';/g) ?? []).length === 2);
}

console.log('\n=== the route does not trust the browser ===');
{
  const src = read('app/api/chat/route.ts');
  ok('readability is checked against the allowed three',
    /\['simple', 'standard', 'advanced'\]\.includes\(String\(body\?\.readability\)\)/.test(src));
  ok('length is checked against the allowed three',
    /\['concise', 'standard', 'detailed'\]\.includes\(String\(body\?\.length\)\)/.test(src));
  ok('and anything else becomes standard', (src.match(/: 'standard',/g) || []).length >= 2);

  // Logos 5 sends the length to its own route, which reads it through one resolver.
  const lchat = read('app/api/logos/chat/route.ts');
  const behavior = read('lib/runtime/behavior.ts');
  ok('Logos 5\'s route checks it too: resolved (anything else is standard), or against the allowed three',
    /export const resolveLength = \(v: unknown\): ReplyLength => \(v === 'concise' \|\| v === 'detailed' \? v : 'standard'\);/.test(behavior)
      && /export const lengthLine = \(v: unknown\): string => LENGTH_LINE\[resolveLength\(v\)\];/.test(behavior)
      && /export const replyCeiling = \(v: unknown\): number => \(\{[^}]*\}\)\[resolveLength\(v\)\];/.test(behavior)
      && /replyCeiling\(body\?\.length\)/.test(lchat) && /lengthLine\(body\?\.length\)/.test(lchat)
      && /\(body\?\.length === 'concise' \|\| body\?\.length === 'standard' \|\| body\?\.length === 'detailed'\) \? \(body\.length as /.test(lchat));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
