// WHAT THE SUPPORT PAGE PROMISES, CHECKED AGAINST THE PRODUCT.
//
// Every answer on a support page is a claim, and a claim about a product goes
// out of date silently: nothing throws when the page tells somebody to press a
// Google button that was removed last week, and nobody notices until a person
// is stuck in front of a screen that does not match what they were told.
//
// This suite is the part of that which CAN be checked mechanically. It cannot
// know whether an answer is helpful. It can know that the page does not name a
// sign-in method the product no longer offers, does not recommend a model that
// has been withdrawn, does not link anywhere that is not a route, and does not
// leave its own search and highlighting broken on the inputs people actually
// type — which is where the design's own version had a real bug.

import { readFileSync } from 'node:fs';
import {
  TOPICS,
  SUPPORT_EMAIL,
  allItems,
  plainText,
  filterTopics,
  highlight,
} from './.tmp/support-faq.mjs';
import { WITHHELD_OAUTH } from './.tmp/auth-flow.mjs';
import { PLANS } from './.tmp/entitlements.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const ALL = allItems();
const PROSE = ALL.map(plainText).join(' \n ');

console.log('=== the page has answers, and they are shaped like answers ===');
{
  ok('there are topics', TOPICS.length >= 5, String(TOPICS.length));
  ok('and enough answers to be worth a search', ALL.length >= 15, String(ALL.length));
  ok('every topic has a stable id', TOPICS.every((t) => /^[a-z]+$/.test(t.id)));
  ok('  and they are unique', new Set(TOPICS.map((t) => t.id)).size === TOPICS.length);
  ok('every question ends in a question mark or a full stop',
    ALL.every((i) => /[?.]$/.test(i.q)), ALL.filter((i) => !/[?.]$/.test(i.q)).map((i) => i.q).join(' | '));
  // A short paragraph is fine when it is the lead-in to a procedure — "Try
  // these, in order:" is doing its whole job in five words. A short paragraph
  // with nothing after it is an answer that stops before it has said anything.
  const thin = ALL.filter((i) => !i.steps && i.a.some((p) => p.trim().length <= 20));
  ok('every question is answered', ALL.every((i) => i.a.length > 0) && thin.length === 0,
    thin.map((i) => i.q).join(' | '));
  // `after` without `steps` is a paragraph that reads as the end of a procedure
  // that never happened.
  ok('nothing says "and then" with no steps before it', ALL.every((i) => !i.after || i.steps));
}

console.log('\n=== it does not promise a way in that is not there ===');
{
  // The one that would actually strand somebody: Google sign-in is withheld
  // (lib/auth-flow.ts) and the form has no provider buttons at all.
  ok('the withheld provider is not offered as a way to sign in',
    !/sign in with google|use google|google or apple|with google/i.test(PROSE),
    PROSE.match(/.{0,60}google.{0,60}/g)?.join(' || ') ?? '');
  ok('  and the withheld list is the one this is checked against', WITHHELD_OAUTH.includes('oauth_google'));
  // Mentioning Google is FINE and necessary — an existing Google account still
  // signs in. What is not fine is telling a new person to press the button.
  ok('but an existing Google account is not left unexplained',
    /google/i.test(PROSE), 'nothing at all is said about it');
  ok('no provider button is named that the form does not render',
    !/apple/i.test(PROSE), PROSE.match(/.{0,50}apple.{0,50}/g)?.join(' || ') ?? '');
}

console.log('\n=== it recommends what the product actually ships ===');
{
  const prompt = readFileSync('lib/socria-prompt.ts', 'utf8');
  // The keys are quoted only when they have to be — `logos: {` and
  // `'logos-2': {` both appear — so the quotes are optional in the pattern.
  const withdrawn = [...prompt.matchAll(/'?([a-z0-9-]+)'?:\s*\{[^{}]*?withdrawn:/gs)].map((m) => m[1]);
  ok('something is withdrawn, so this test is testing something', withdrawn.length > 0, withdrawn.join(','));
  // A withdrawn model is one nobody can pick. Recommending it sends somebody
  // looking for a menu entry that is deliberately not in the menu.
  for (const id of withdrawn) {
    const label = id === 'logos' ? 'logos' : id;
    const recommended = new RegExp(`<b>${label}</b>`, 'i').test(ALL.map((i) => i.a.join(' ')).join(' '));
    ok(`  ${id} is withdrawn and is not recommended in bold`, !recommended);
  }
  ok('Core 4 is named, since it is what the rest of the site introduces', /core 4/i.test(PROSE));
  // THE FREE TIER, IN THE PLAN TABLE'S OWN NUMBERS. Read from lib/entitlements
  // rather than typed here, so a change to the table fails this line until the
  // answer catches up — the page once promised "two Core 4 conversations a
  // calendar month" and "a map pauses at four branches" long after both had
  // stopped being true.
  const f = PLANS.free.counters;
  ok('the free tier is stated rather than left to be discovered',
    PROSE.includes(`${f['core-chats']} new chats and ${f['core-messages']} messages a day`) &&
      PROSE.includes(`${f.chats} new lines of thinking a calendar month and ${f.messages} messages a day`),
    PROSE.match(/.{0,60}messages a day.{0,20}/g)?.join(' || ') ?? 'no daily limit is stated');
  ok('  and no limit that has gone is still promised',
    !/four branches|core 4 conversations a calendar month|handful of sessions|core 3\.1 is open either way/i.test(PROSE),
    PROSE.match(/.{0,40}(four branches|conversations a calendar month|handful of sessions|open either way).{0,40}/g)?.join(' || ') ?? '');
}

console.log('\n=== every link goes somewhere this app serves ===');
{
  const hrefs = [...ALL.flatMap((i) => [...i.a, ...(i.steps ?? []), ...(i.after ?? [])])
    .join(' ')
    .matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  ok('there are links to check', hrefs.length > 0, String(hrefs.length));
  for (const h of hrefs) {
    // The prototype linked flat files — "../app/memory.html". Any of those
    // surviving the port is a 404 with a confident sentence over it.
    ok(`  ${h} is an app route, not an exported file`, h.startsWith('/') && !h.endsWith('.html'));
  }
  ok('the address somebody writes to is a real one', /@/.test(SUPPORT_EMAIL) && !/example|test/.test(SUPPORT_EMAIL), SUPPORT_EMAIL);
}

console.log('\n=== the search finds things, and finds the right things ===');
{
  ok('a word in an answer finds it', filterTopics('refund', 'all').length === 1);
  ok('  case does not matter', filterTopics('REFUND', 'all').length === 1);
  ok('a word in no answer finds nothing', filterTopics('xyzzy', 'all').length === 0);
  ok('an empty search shows everything', filterTopics('', 'all').length === TOPICS.length);
  ok('a topic narrows to that topic', filterTopics('', 'one').every((s) => s.id === 'one'));
  ok('  and an empty topic is dropped rather than shown empty',
    filterTopics('refund', 'start').length === 0);
  // SEARCHING MARKUP IS FINDING THE WRONG THING. "account" appears in the
  // href of an answer that never says the word; matching on it would return a
  // result the reader cannot see the reason for.
  const memory = TOPICS.find((t) => t.id === 'memory').qs[0];
  ok('the text searched is the text shown', !plainText(memory).includes('href'));
}

console.log('\n=== highlighting does not break what it marks ===');
{
  const a = '<a href="/account/data">your memory page</a>';
  // The naive replace puts a <mark> inside the href the moment somebody
  // searches for a word that appears in a URL, and the link silently dies.
  ok('a term inside an attribute is left alone', highlight(a, 'account').includes('href="/account/data"'), highlight(a, 'account'));
  ok('  while the visible text is still marked', highlight(a, 'memory').includes('<mark class="hl">memory</mark>'));
  ok('a regex metacharacter is a literal, not a pattern',
    highlight('costs $15 a month', '$15').includes('<mark class="hl">$15</mark>'), highlight('costs $15 a month', '$15'));
  ok('  and does not throw', (() => { try { highlight('a.b', '.'); return true; } catch { return false; } })());
  ok('an empty term changes nothing', highlight(a, '') === a);
  ok('  as does whitespace', highlight(a, '   ') === a);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
