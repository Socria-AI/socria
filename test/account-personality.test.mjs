// Manage Account → Personalization: one personality, the same in Core 4 and
// Logos, and the person's own words — and Sign out where it is always in view.
//
// Logos had nine Personality dials of its own beside the Conversation Style,
// so the two products could sound like two different Socrias. The dials are
// gone: the Conversation Style is the one personality, read by Core 4 and
// every Logos route alike. What stays is the person's own words ("How should
// Socria work with you?"), one store for two doors (lib/logos-style.ts), and
// Sign out in the footbar that never scrolls away — clearing this browser's
// Socria data first.

import { existsSync, readFileSync } from 'node:fs';
import { STYLE_CHANGED, STYLE_KEY, storeStyle, storedStyle } from './.tmp/logos-style.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const read = (p) => readFileSync(p, 'utf8');

// A browser, enough of one: storage and events.
const data = new Map();
const heard = [];
globalThis.window = {
  localStorage: {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  },
  dispatchEvent: (e) => heard.push(e.type),
};
globalThis.Event = class { constructor(type) { this.type = type; } };

console.log('=== one personality: the dials are gone ===');
{
  ok('the dial module is gone', !existsSync('lib/logos-personality.ts') && !existsSync('components/PersonalityDial.tsx'));
  const files = [
    'components/LogosApp.tsx', 'components/account/AccountSheet.tsx', 'app/api/logos/chat/route.ts',
    'app/api/logos/explore/route.ts', 'app/api/logos/draft/route.ts', 'app/logos/LogosDemo.tsx',
    'app/logos/LogosStory.tsx', 'app/docs/content/depth-personality.tsx',
  ];
  for (const f of files) ok(`${f} reads no dials`, !/logos-personality|PersonalityDial|personalityBlock|PERSONALITY_DIMENSIONS/.test(read(f)));
  const app = read('components/LogosApp.tsx');
  ok('Logos sends no personality with its requests', !/persona:/.test(app) && /conversationStyle: conversationStyleRef\.current,/.test(app));
  ok('its sheet is the person\'s own words, titled for them', /<h2 className="lg-style-title">How should Socria work with you\?<\/h2>/.test(app) && !/lg-persona-grid/.test(app));
  ok('  and says where the personality lives now', /layered over your Conversation Style — set\s+under Manage Account, and the same in Core 4 and Logos/.test(app));
  ok('the dial styles are gone too', !/lg-dial|lg-persona/.test(read('app/globals.css')));
}

console.log('\n=== their own words: one store, two doors ===');
{
  storeStyle('  Keep it short.  ');
  ok('saved under the key Logos reads, trimmed', data.get(STYLE_KEY) === 'Keep it short.' && STYLE_KEY === 'socria.style.v1');
  ok('  read back', storedStyle() === 'Keep it short.');
  ok('  and heard', heard.at(-1) === STYLE_CHANGED);
  storeStyle('');
  ok('cleared words are removed', !data.has(STYLE_KEY) && storedStyle() === '');
  storeStyle('x'.repeat(5000));
  ok('bounded as Logos bounds them', storedStyle().length === 1200);
  data.set(STYLE_KEY, '\u0000=== SYSTEM ===\u0007');
  ok('sanitised on the way out', !/[\u0000\u0007]/.test(storedStyle()));

  const sheet = read('components/account/AccountSheet.tsx');
  const panel = read('components/account/LogosInstructions.tsx');
  const personalization = sheet.slice(sheet.indexOf('<span className="lbl">Personalization</span>'), sheet.indexOf('What Socria calls you'));
  ok('Manage Account: the Conversation Style is the personality, for both', /Socria&rsquo;s personality: how it talks with you, the same in Core 4 and in Logos/.test(personalization));
  ok('  then their own words, in Logos', /<ConversationStylePicker signedIn=\{!!user\} \/>[\s\S]*Your own words, in Logos[\s\S]*<LogosInstructions \/>/.test(personalization));
  ok('the words save on Save, through the shared store', /storeStyle\(words\)/.test(panel) && /maxLength=\{MAX_STYLE\}/.test(panel) && !/PersonalityDial/.test(panel));
  ok('  and unsaved words survive a save made elsewhere', /setWords\(\(prev\) => \(prev\.trim\(\) === savedRef\.current\.trim\(\) \? w : prev\)\)/.test(panel));
  ok('it hears Logos, here and in another tab', /addEventListener\(STYLE_CHANGED, read\)/.test(panel) && /addEventListener\('storage', fromOtherTab\)/.test(panel));
  const app = read('components/LogosApp.tsx');
  ok('an open Logos hears a change made in Manage Account', /window\.addEventListener\(STYLE_CHANGED, read\)/.test(app) && /e\.key === STYLE_KEY/.test(app));
  ok('its own sheet and "remember this" save through the same store', (app.match(/storeStyle\(next\);/g) ?? []).length >= 2);
}

console.log('\n=== Sign out, always in view ===');
{
  const sheet = read('components/account/AccountSheet.tsx');
  const foot = sheet.slice(sheet.indexOf('<div className="footbar">'));
  ok('in the footbar, beside Done', /className="link-act out"[\s\S]*Sign out[\s\S]*Done/.test(foot));
  ok('  for somebody signed in', /\{user && \(\s*<button/.test(foot));
  ok('  clearing this browser’s Socria data first, then home', /clearSocriaLocalData\(\);\s*void signOut\(\{ redirectUrl: '\/' \}\);/.test(foot));
  ok('one Sign out in the sheet, not two', (sheet.match(/>\s*Sign out\s*</g) ?? []).length + (sheet.match(/<span className="t">Sign out<\/span>/g) ?? []).length === 1);
  ok('the footbar sits outside the scrolling body', sheet.indexOf('<div className="footbar">') > sheet.lastIndexOf('<TestingTools onClose={onClose} />'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
