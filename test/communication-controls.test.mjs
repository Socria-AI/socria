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
// registry rather than by an id, that the page actually sends what it stores,
// and that the route validates instead of trusting the browser.

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

console.log('\n=== the picker ===');
{
  const src = read('components/ModelPicker.tsx');
  ok('it renders both tables', /READABILITY_OPTIONS\.map/.test(src) && /LENGTH_OPTIONS\.map/.test(src));
  ok('gated on the registry flag', /current\.supportsCommunication/.test(src));
  // A component that names a model is a component that has to be edited when
  // the next one arrives.
  ok('no model id is special-cased', !/'core-4'/.test(src));
  // Both halves or neither: a sheet offering one of two settings reads as a
  // half-built control.
  ok('both settings are required together',
    /!!readability && !!onReadability && !!length && !!onLength/.test(src));
  ok('the sheet does not close on a communication pick',
    !/onReadability\?\.\([^)]*\);\s*\n\s*setOpen\(false\)/.test(src));
  ok('the note says these are about expression, not effort',
    /how the answer is written — never how hard it is\s*\n?\s*thought about/.test(src));
}

console.log('\n=== the page stores it and sends it ===');
{
  const src = read('app/chat/page.tsx');
  ok('both are persisted', /READABILITY_KEY/.test(src) && /LENGTH_KEY/.test(src));
  ok('  and hydrated on mount', /setReadability\(readReadability\(\)\)/.test(src) && /setReplyLength\(readLength\(\)\)/.test(src));
  ok('both are sent with the turn', /\n\s+readability,\n\s+length: replyLength,/.test(src));
  ok('the picker is given both', /readability=\{readability\}/.test(src) && /length=\{replyLength\}/.test(src));

  // A stored value is whatever was last in localStorage, including whatever a
  // previous version of the app or a hand-edit put there.
  ok('an unknown stored readability falls back to standard', /raw === 'simple' \|\| raw === 'advanced'/.test(src));
  ok('an unknown stored length falls back to standard', /raw === 'concise' \|\| raw === 'detailed'/.test(src));
}

console.log('\n=== the route does not trust the browser ===');
{
  const src = read('app/api/chat/route.ts');
  ok('readability is checked against the allowed three',
    /\['simple', 'standard', 'advanced'\]\.includes\(String\(body\?\.readability\)\)/.test(src));
  ok('length is checked against the allowed three',
    /\['concise', 'standard', 'detailed'\]\.includes\(String\(body\?\.length\)\)/.test(src));
  ok('and anything else becomes standard', (src.match(/: 'standard',/g) || []).length >= 2);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
