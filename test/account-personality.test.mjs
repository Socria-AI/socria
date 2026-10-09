// Manage Account → Personalization → Socria Personality, and Sign out where
// it is always in view.
//
// The nine dials and the person's own words lived only behind Logos's own
// Personality sheet; Manage Account had the Conversation Style and nothing
// else of how Socria sounds. And Sign out sat at the end of the last section,
// where somebody looking for it did not find it. Held here: one store for both
// doors (lib/logos-personality.ts, lib/logos-style.ts), an open Logos hearing
// a change made in Manage Account, and Sign out in the footbar that never
// scrolls away — clearing this browser's Socria data first.

import { readFileSync } from 'node:fs';
import {
  DEFAULT_PERSONALITY,
  PERSONALITY_CHANGED,
  PERSONALITY_KEY,
  storePersonality,
  storedPersonality,
} from './.tmp/logos-personality.mjs';
import { STYLE_KEY, storeStyle, storedStyle } from './.tmp/logos-style.mjs';

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

console.log('=== one store, two doors ===');
{
  ok('nothing saved reads as the defaults', JSON.stringify(storedPersonality()) === JSON.stringify(DEFAULT_PERSONALITY));
  storePersonality({ ...DEFAULT_PERSONALITY, base: 'friendly' });
  ok('a moved dial is saved under the key Logos reads', JSON.parse(data.get(PERSONALITY_KEY)).base === 'friendly' && PERSONALITY_KEY === 'socria.personality.v1');
  ok('  and read back', storedPersonality().base === 'friendly');
  ok('  and whoever is listening hears it', heard.at(-1) === PERSONALITY_CHANGED);
  storePersonality(DEFAULT_PERSONALITY);
  ok('the defaults are stored as nothing', !data.has(PERSONALITY_KEY));
  data.set(PERSONALITY_KEY, '{"base":"not-a-register","made":"up"}');
  ok('what is stored is sanitised on the way out', storedPersonality().base === DEFAULT_PERSONALITY.base && !('made' in storedPersonality()));
  data.set(PERSONALITY_KEY, '{broken');
  ok('broken storage is the defaults', JSON.stringify(storedPersonality()) === JSON.stringify(DEFAULT_PERSONALITY));

  storeStyle('  Keep it short.  ');
  ok('their words are saved under the key Logos reads, trimmed', data.get(STYLE_KEY) === 'Keep it short.' && STYLE_KEY === 'socria.style.v1');
  ok('  read back', storedStyle() === 'Keep it short.');
  ok('  and heard, by the same event', heard.at(-1) === PERSONALITY_CHANGED);
  storeStyle('');
  ok('cleared words are removed', !data.has(STYLE_KEY) && storedStyle() === '');
  storeStyle('x'.repeat(5000));
  ok('words are bounded as Logos bounds them', storedStyle().length === 1200);
}

console.log('\n=== Manage Account carries the personality ===');
{
  const sheet = read('components/account/AccountSheet.tsx');
  const panel = read('components/account/PersonalitySettings.tsx');
  const personalization = sheet.slice(sheet.indexOf('<span className="lbl">Personalization</span>'), sheet.indexOf('What Socria calls you'));
  ok('under Personalization, after the Conversation Style', /<ConversationStylePicker signedIn=\{!!user\} \/>[\s\S]*<PersonalitySettings \/>/.test(personalization));
  ok('  named for what it is and where it applies', /Socria Personality, in Logos/.test(personalization));
  ok('the nine dials, in Logos’s own tokens', /<div className="lg-tokens">/.test(panel) && /PERSONALITY_DIMENSIONS\.map/.test(panel) && /<PersonalityDial/.test(panel));
  ok('  saved as they move, through the shared store', /storePersonality\(next\)/.test(panel));
  ok('  with the way back to the defaults', /Reset to Socria defaults/.test(panel));
  ok('their own words, saved on Save', /storeStyle\(words\)/.test(panel) && /maxLength=\{MAX_STYLE\}/.test(panel));
  ok('  and unsaved words survive a dial moved mid-sentence', /setWords\(\(prev\) => \(prev\.trim\(\) === savedRef\.current\.trim\(\) \? w : prev\)\)/.test(panel));
  ok('it hears Logos, here and in another tab', /addEventListener\(PERSONALITY_CHANGED, read\)/.test(panel) && /addEventListener\('storage', fromOtherTab\)/.test(panel));
  ok('it says the principles are not on the dial', /not your principles/.test(panel));
  const css = read('app/globals.css');
  ok('the dial styles reach the token wrapper', /:is\(\.logos-root, \.lg-tokens\) \.lg-dial \{/.test(css) && /:is\(\.logos-root, \.lg-tokens\) \.lg-persona-grid \{/.test(css) && !/\.logos-root \.lg-dial/.test(css));
}

console.log('\n=== an open Logos uses a change made elsewhere ===');
{
  const app = read('components/LogosApp.tsx');
  ok('Logos keeps no copy of the keys', !/const (STYLE_KEY|PERSONALITY_KEY) =/.test(app));
  ok('its own sheet saves through the shared store', /storeStyle\(next\);\s*storePersonality\(personaDraft\);/.test(app));
  ok('so does "remember this"', /setStyleText\(next\);\s*storeStyle\(next\);/.test(app));
  ok('and it re-reads on the change, from this tab or another', /window\.addEventListener\(PERSONALITY_CHANGED, read\)/.test(app) && /e\.key === PERSONALITY_KEY \|\| e\.key === STYLE_KEY/.test(app));
}

console.log('\n=== Sign out, always in view ===');
{
  const sheet = read('components/account/AccountSheet.tsx');
  const foot = sheet.slice(sheet.indexOf('<div className="footbar">'));
  ok('in the footbar, beside Done', /className="link-act out"[\s\S]*Sign out[\s\S]*Done/.test(foot));
  ok('  for somebody signed in', /\{user && \(\s*<button/.test(foot));
  ok('  clearing this browser’s Socria data first, then home', /clearSocriaLocalData\(\);\s*void signOut\(\{ redirectUrl: '\/' \}\);/.test(foot));
  ok('one Sign out in the sheet, not two', (sheet.match(/>\s*Sign out\s*</g) ?? []).length + (sheet.match(/<span className="t">Sign out<\/span>/g) ?? []).length === 1);
  ok('the buried one is gone', !/Your maps wait on the others/.test(sheet));
  ok('the footbar does not scroll: it sits outside the scrolling body', sheet.indexOf('<div className="footbar">') > sheet.lastIndexOf('<TestingTools onClose={onClose} />'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
