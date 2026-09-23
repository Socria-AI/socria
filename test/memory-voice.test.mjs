// Everything Socria saves about a person is written TO them.
//
// Saved memory is shown back on the Memory page, and "The user wants to be an
// entrepreneur" reads as a file kept on someone. Three writers produce saved
// lines — the thread memory, the Thinking Journey, the Mind Graph — and each
// must carry the voice rule. Every block that reads saved lines back to a
// model must say that "you" in them means the person, not the model.
//
// The Mind Graph modules are server-only and are checked in source; the
// prompt builders are checked as built, so a rule that is imported but never
// rendered into the prompt fails here.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AI_IMPORT_PROMPT,
  EMPTY_MEMORY,
  EMPTY_UNDERSTANDING,
  buildJourneyExtractorPrompt,
  buildMemoryExtractorPrompt,
  buildSystemPrompt,
} from './.tmp/socria-prompt.mjs';
import { renderPersonMemory } from './.tmp/person-memory.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(join(here, '..', p), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const RULE = /write it TO them, in the second person/;
const READING = /"you" in them means the person, not you/;

console.log('=== the writers ===');
const journey = buildJourneyExtractorPrompt(EMPTY_UNDERSTANDING, null, '', 'User: hi');
ok('the journey pass carries the voice rule', RULE.test(journey));
ok('and no longer asks for third person', !/in plain third person/i.test(journey));
ok('its entries are exemplified in the second person', /You can\\?'t move cities/.test(journey));
ok('the person\'s own words stay first person', /returnCue and nextQuestions[^\n]*stay first person/.test(journey));

const thread = buildMemoryExtractorPrompt(EMPTY_MEMORY, 'User: hi', 1);
ok('the thread memory carries the voice rule', RULE.test(thread));

const extract = src('lib/mind/extract.ts');
ok('the Mind Graph extractor renders the voice rule', /\$\{SAVED_VOICE_RULE\}/.test(extract));
ok('and keeps labels as names, not sentences', /a\s+name, not a sentence about them/.test(extract));

console.log('\n=== the readers ===');
const built = buildSystemPrompt(
  'core-3',
  'balanced',
  { ...EMPTY_MEMORY, goals: ['You want to start a company'] },
  'ABOUT YOU\nYou study finance.'
);
const sys = typeof built === 'string' ? built : built.prompt;
const section = (h) => {
  const from = sys.indexOf(h);
  const next = sys.indexOf('\n=== ', from + h.length);
  return from < 0 ? '' : sys.slice(from, next < 0 ? undefined : next);
};
ok('thread memory is read as addressed to the person', READING.test(section('=== Thread Memory')));
ok('an imported profile is too', READING.test(section('=== Imported Background')));
const pm = renderPersonMemory(
  [{ id: 'a', kind: 'fact', text: 'You study finance', confidence: 'stated', firstSeen: 1, lastSeen: 1, seen: 1 }],
  'core'
);
ok('person memory is read as addressed to the person', READING.test(pm));
ok('the Mind Graph block says so too', /\$\{SAVED_VOICE_READING\}/.test(src('lib/mind/serialize.ts')));

console.log('\n=== the import prompt ===');
ok('asks for the profile in the second person', /Write it to me, in the second person/.test(AI_IMPORT_PROMPT));
ok('asks it to admit what it cannot see', /say so in one line at the top/.test(AI_IMPORT_PROMPT));
ok('asks for inferences to be marked', /\(inferred\)/.test(AI_IMPORT_PROMPT));
ok('keeps secrets and other people\'s details out', /Leave out passwords/.test(AI_IMPORT_PROMPT) && /private details/.test(AI_IMPORT_PROMPT));
ok('has a budget that fits what Socria keeps', /under 900 words/.test(AI_IMPORT_PROMPT));
ok('never says "the user" except to forbid it', (AI_IMPORT_PROMPT.match(/the user/gi) || []).length === 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
