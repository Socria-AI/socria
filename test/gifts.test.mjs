// test/gifts.test.mjs — now and then, a taste of Socria One (lib/gifts.ts):
// the deep answer (server) and the Celestial pass (this browser), and the
// rule that keeps their notes rare.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as G from './.tmp/gifts.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let failed = 0;
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${!cond && detail ? `\n      ${detail}` : ''}`);
  if (!cond) failed += 1;
};
const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 10, 12, 12);

console.log('\n=== on unless switched off ===');
ok('on by default', G.giftsOn({}) && G.giftsOn({ SOCRIA_GIFTS: '' }) && G.giftsOn({ SOCRIA_GIFTS: 'on' }));
ok('SOCRIA_GIFTS=off (or 0, false, no) turns them off', ['off', 'OFF', '0', 'false', 'no', ' off '].every((v) => !G.giftsOn({ SOCRIA_GIFTS: v })));

console.log('\n=== the deep answer ===');
const want = (o) => G.deepGiftWanted({ tier: 'free', level: 'deep', on: true, ...o });
ok('a trial question that needs depth may be given one', want({}));
ok('never for a guest, never for a member', !want({ tier: 'guest' }) && !want({ tier: 'one' }));
ok('never for an ordinary or light turn', !want({ level: 'standard' }) && !want({ level: 'light' }));
ok('never when gifts are off, or routing is', !want({ on: false }) && !want({ unrouted: true }));
ok('one window every four days', G.GIFT_DEEP_WINDOW_MS === 4 * DAY && G.deepGiftWindow(T0) === G.deepGiftWindow(T0 + 1000) && G.deepGiftWindow(T0) !== G.deepGiftWindow(T0 + 4 * DAY));
const row = G.deepGiftRow('user_1', T0);
ok('claimed in its own usage row per person and window', row.user === 'user_1' && row.scope === `gift:deep:${G.deepGiftWindow(T0)}` && row.counter === 'deep');
ok('a new window, a new row', G.deepGiftRow('user_1', T0 + 4 * DAY).scope !== row.scope);

console.log('\n=== one try of Celestial ===');
const fresh = G.parseThemeGift(null, T0);
ok('a browser first seen now', fresh.firstSeen === T0 && !fresh.offeredAt && !fresh.triedAt);
ok('rubbish in storage reads as nothing', G.parseThemeGift('{not json', T0).firstSeen === T0 && G.parseThemeGift('{"firstSeen":-4,"triedAt":"x","before":"night"}', T0).triedAt === undefined);
ok('a first-seen in the future is now', G.parseThemeGift(JSON.stringify({ firstSeen: T0 + DAY }), T0).firstSeen === T0);
ok('not offered in the first two days', !G.themeGiftDue(fresh, T0 + DAY));
ok('offered after two days', G.themeGiftDue(fresh, T0 + 2 * DAY));
const off = G.offered(fresh, T0 + 2 * DAY);
ok('offered once, ever — turned down, never again', !G.themeGiftDue(off, T0 + 400 * DAY));
const tried = G.accepted(off, T0 + 2 * DAY, 'dark');
ok('taken up: Celestial for the rest of this visit', G.themeTryActive(tried, true) && G.passTheme(tried, true) === 'night');
ok('…and not in any later visit', !G.themeTryActive(tried, false) && G.passTheme(tried, false) === null);
ok('never offered again once tried', !G.themeGiftDue(tried, T0 + 400 * DAY));
ok('the theme they had is kept, to give back', tried.before === 'dark' && G.accepted(off, T0, 'night').before === undefined);
ok('its end is said once, in the next visit', !G.themeTryEnded(tried, true) && G.themeTryEnded(tried, false) && !G.themeTryEnded(G.endSaid(tried), false));
ok('no try, no theme', G.passTheme(fresh, true) === null);

console.log('\n=== the ledger in this browser never throws ===');
const mem = new Map();
const store = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
const visit = new Map();
const tab = { getItem: (k) => (visit.has(k) ? visit.get(k) : null), setItem: (k, v) => visit.set(k, String(v)) };
G.writeThemeGift(tried, store);
ok('outside the try’s visit, no theme', G.giftedTheme(T0, store, tab) === null);
G.beginTryVisit(tab);
ok('in it (a reload too), Celestial', G.inTryVisit(tab) && G.giftedTheme(T0, store, tab) === 'night');
const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
ok('a blocked store costs the gift, never the page', G.giftedTheme(T0, broken, broken) === null && G.lastNoteAt(broken) === null && !G.inTryVisit(broken) && (G.writeThemeGift(tried, broken), G.noteShown(T0, broken), G.beginTryVisit(broken), true));

console.log('\n=== notes stay rare ===');
ok('no more than one note a day', G.noteAllowed('theme-offer', null, T0) && !G.noteAllowed('theme-offer', T0, T0 + DAY - 1) && G.noteAllowed('theme-offer', T0, T0 + DAY));
ok('…but a deep answer is always said (it is on screen)', G.noteAllowed('deep', T0, T0 + 1));
G.noteShown(T0, store);
ok('the last note is remembered', G.lastNoteAt(store) === T0);
ok('every note has a title, a sentence, an action and a way to close', Object.values(G.GIFT_NOTES).every((n) => n.title && n.body && n.action && n.dismiss));

console.log('\n=== wired where it belongs ===');
const chat = read('app/api/logos/chat/route.ts');
ok('the chat route claims once per window, and only when wanted', /deepGiftWanted\(\{ tier: route\.tier, level: route\.level, on: giftsOn\(process\.env\)/.test(chat) && /createOnce\(deepGiftRow\(userId, Date\.now\(\)\), 1, Date\.now\(\)\)\.catch\(\(\) => false\)/.test(chat));
ok('a given gift answers on One\'s ladder and is said in a header', /route = \{ \.\.\.chooseModel\('one', level, process\.env\), tier: 'free' \}/.test(chat) && /\[GIFT_HEADER\]: gift/.test(chat));
ok('the store unable to answer means no gift, not a failed turn', /withTimeout\(\s*createOnce\(/.test(chat));
const theme = read('lib/theme.ts');
ok('a pass opens only its own theme', /chosen !== granted \? 'paper' : chosen/.test(theme));
const app = read('components/LogosApp.tsx');
ok('the app says a deep answer', /res\.headers\.get\(GIFT_HEADER\) === 'deep' && !one\) showGift\('deep'\)/.test(app));
{
  const at = app.indexOf('<ThemeGiftCheck');
  const ready = at > 0 ? app.slice(at, app.indexOf('onEnded=', at)) : '';
  ok('the pass is offered only when nothing else is open', ['!one', 'homeShown', '!introWanted', '!busy', '!oneOpen', '!acctOpen', '!guideOpen', '!tourOpen', '!trialEnded', '!giftNote'].every((c) => ready.includes(c)), ready);
}
const picker = read('components/account/ThemePicker.tsx');
ok('the theme picker opens the gifted theme and says so', /id !== granted/.test(picker) && /Yours for now/.test(picker));
const note = read('components/logos5/GiftNote.tsx');
ok('the note closes on Escape and goes by itself', /Escape/.test(note) && /LINGER_MS/.test(note) && /role="status"/.test(note));

ok('one note a visit: a gift keeps the welcome-back away, and a One prompt keeps the offer away', /!giftNote && !giftThisVisit\}/.test(app) && /!onePrompt\?\.open && !promptSeenRef\.current/.test(app) && /if \(onePrompt\?\.open\) promptSeenRef\.current = true;/.test(app));
ok('the try gives back the theme they had', /chooseTheme\(g\.before \?\? 'paper', false\)/.test(app) && /beginTryVisit\(\)/.test(app));

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
