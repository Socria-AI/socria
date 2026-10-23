// THE TURNS THE MAP IS NOT REDRAWN FOR — lib/map-skip.ts.
//
// What is held down:
//   • an acknowledgement and nothing else — "ok", "thanks!", "got it 👍", a
//     thumbs up — leaves the map as it is: no extraction is asked for;
//   • anything that might be an answer or a stance is sent as before: "yes",
//     "sure", "do it", "exactly", "fair enough", "makes sense", anything with
//     a question mark, anything longer than a few words;
//   • so is every "ok" after a reply that asked or offered something, a reply
//     to one particular message, a turn that brings a file, and a map that is
//     still empty;
//   • both of LogosApp's sends ask this before rebuilding the map, and nothing
//     else in it changed.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAcknowledgement, lastReplyIn, skipsMap } from './.tmp/map-skip.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));

console.log('\n=== an acknowledgement and nothing else ===');
for (const t of ['ok', 'OK.', 'okay!', 'k', 'kk', 'alright', 'thanks', 'Thanks!', 'thank you', 'thank you so much', 'thx', 'ty', 'cheers', 'ok thanks', 'great, thanks!', 'got it 👍', 'Perfect, thank you.', 'cool', 'nice!!', 'lol', 'hahaha', 'oh i see', 'thanks, that helps', 'very helpful', 'much appreciated', '👍', '🙏🙏', '👍🏽', '❤️', '!!', '...', 'ok :)', '  thanks  '])
  ok(`"${t}"`, isAcknowledgement(t) === true);

console.log('\n=== anything that might be an answer or a stance ===');
for (const t of ['yes', 'yeah', 'yep', 'no', 'nope', 'sure', 'please', 'do it', 'go ahead', 'go on', 'continue', 'more', 'exactly', 'agreed', 'right', 'true', 'fair enough', 'makes sense', 'sounds good', 'ok?', 'thanks?', '?', 'hmm', 'wait', 'why', 'ok so what about pricing', 'thanks, but the pricing is not settled', 'ok, launch in March then', 'great point about cash flow', 'ok ok ok ok ok ok', '2', 'option b', 'x^2', '@socria thanks', '', '   '])
  ok(`"${t}" is not`, isAcknowledgement(t) === false);
ok('a long run of thanks is not either', isAcknowledgement('thanks '.repeat(8)) === false);

console.log('\n=== what came before decides too ===');
const base = { text: 'thanks', mapNodes: 4, lastReply: 'That is the assumption carrying the decision.' };
ok('after a reply that said something, "thanks" leaves the map', skipsMap(base) === true);
ok('after one that asked anything, it does not — "ok" may be the answer', skipsMap({ ...base, text: 'ok', lastReply: 'Which matters more to you, the date or the price?' }) === false);
for (const offer of ['I can graph the supply curve for this.', 'Shall I lay the two options side by side.', 'If you’d like, the steps can go on the map.', 'Let me sketch it.', 'I’ll draw the two curves.', 'Want me to compare them'])
  ok(`after an offer — "${offer}" — "ok" is a yes and is sent`, skipsMap({ ...base, text: 'ok', lastReply: offer }) === false);
ok('a reply to one particular message is sent', skipsMap({ ...base, replying: true }) === false);
ok('a turn that brings a file is sent', skipsMap({ ...base, attachments: 1 }) === false);
ok('a map still empty is owed its first drawing', skipsMap({ ...base, mapNodes: 0 }) === false);
ok('…and one with no count at all is treated as empty', skipsMap({ text: 'thanks', lastReply: 'Noted.' }) === false);
ok('the first turn of all ("thanks", no reply before it) on a drawn map is skipped', skipsMap({ text: 'thanks', mapNodes: 2, lastReply: null }) === true);
ok('a turn that says something is always sent', skipsMap({ ...base, text: 'The pricing is not settled, though.' }) === false);

console.log('\n=== Socria\'s last turn ===');
ok('is the last assistant message', lastReplyIn([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'user', content: 'c' }]) === 'b');
ok('none before it: null', lastReplyIn([{ role: 'user', content: 'a' }]) === null && lastReplyIn([]) === null);
ok('one with no words: an empty string, which offers nothing', lastReplyIn([{ role: 'assistant' }]) === '');

console.log('\n=== LogosApp asks before rebuilding the map ===');
{
  const src = readFileSync(join(root, 'components', 'LogosApp.tsx'), 'utf8');
  ok('imported from lib/map-skip', /import \{ lastReplyIn, skipsMap \} from '@\/lib\/map-skip';/.test(src));
  const gates = [...src.matchAll(/if \(!skipsMap\(\{[^}]*\}\)\) refreshMap\(\);/g)];
  ok('both sends — the composer and a node\'s thread — are gated', gates.length === 2, String(gates.length));
  ok('  the composer\'s with its files, its reply-to and what Socria said before', gates.some((g) => /attachments: atts\.length/.test(g[0]) && /replying: !!replying/.test(g[0]) && /lastReplyIn\(before\)/.test(g[0])));
  ok('  the node thread\'s with that thread\'s last reply', gates.some((g) => /lastReplyIn\(prior\)/.test(g[0])));
  ok('  both with the map as it stands', gates.every((g) => /mapNodes: mapRef\.current\.nodes\.length/.test(g[0])));
  ok('no other map rebuild is gated (reveal, grounding, a conversation that owes its map)', (src.match(/skipsMap\(/g) ?? []).length === 2);
}

console.log(`\nmap skip: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
