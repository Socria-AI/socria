// The few emails Socria sends on its own — and the rules that keep them few.
//
// The thing to be afraid of here is not a missed email. It is an email that
// arrives while the boundary is still on screen, an email that mentions One
// because time passed, an email with a conversation title in it, or a second
// copy of a welcome. Every block below guards one of those. The copy is
// checked as text, because voice is a contract too: day-N never says One,
// limit-chats says exactly what the screen said, and nothing carries content.

import {
  LIFECYCLE_KINDS,
  UNSUBSCRIBED_KIND,
  DAY_MS,
  QUIET_MS,
  LIMIT_DELAY_MS,
  DAY_OF,
  dayWindow,
  decideLifecycle,
  resetDateFor,
  viaLink,
  lifecycleLink,
  unsubscribeUrl,
  unsubscribeToken,
  verifyUnsubscribeToken,
  lifecycleCopy,
  escapeHtml,
  isLifecycleKind,
  isDayKind,
} from './.tmp/lifecycle.mjs';
import { boundaryNote } from './.tmp/entitlements.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const NOW = 1_800_000_000_000;
const day = (n) => NOW - n * DAY_MS;

console.log('=== the kinds that exist ===');
{
  ok('four kinds', LIFECYCLE_KINDS.length === 4);
  for (const k of ['welcome-one', 'limit-chats', 'day-3', 'day-7']) ok(`${k} exists`, isLifecycleKind(k));
  ok('the opt-out is not a kind', !isLifecycleKind(UNSUBSCRIBED_KIND));
  ok('junk is not a kind', !isLifecycleKind('reset') && !isLifecycleKind(3) && !isLifecycleKind(null));
  ok('day kinds are the dated ones', isDayKind('day-3') && isDayKind('day-7') && !isDayKind('welcome-one'));
  ok('a day of quiet is a day', QUIET_MS === DAY_MS && LIMIT_DELAY_MS === DAY_MS);
  ok('windows are half-open and a day wide', (() => {
    const w = dayWindow('day-3', NOW);
    return w.to - w.from === DAY_MS && w.to === NOW - 3 * DAY_MS;
  })());
  ok('day-7 is four days after day-3', dayWindow('day-7', NOW).to === dayWindow('day-3', NOW).to - 4 * DAY_MS);
  ok('DAY_OF agrees', DAY_OF['day-3'] === 3 && DAY_OF['day-7'] === 7);
}

console.log('\n=== nothing overrides a refusal, and nothing goes twice ===');
{
  for (const kind of LIFECYCLE_KINDS) {
    ok(`${kind}: unsubscribed → skip`, decideLifecycle({ kind, plan: 'one', unsubscribed: true, alreadySent: false, now: NOW, firstSeenAt: day(3.5), lastSeenAt: day(2), refusedAt: day(2) }).reason === 'unsubscribed');
    ok(`${kind}: already sent → skip`, decideLifecycle({ kind, plan: 'one', unsubscribed: false, alreadySent: true, now: NOW, firstSeenAt: day(3.5), lastSeenAt: day(2), refusedAt: day(2) }).reason === 'already-sent');
  }
}

console.log('\n=== welcome-one goes only to a member ===');
{
  ok('member → send', decideLifecycle({ kind: 'welcome-one', plan: 'one', unsubscribed: false, alreadySent: false, now: NOW }).send === true);
  ok('free → not-member', decideLifecycle({ kind: 'welcome-one', plan: 'free', unsubscribed: false, alreadySent: false, now: NOW }).reason === 'not-member');
}

console.log('\n=== limit-chats waits a day, and only for the free ===');
{
  const base = { kind: 'limit-chats', plan: 'free', unsubscribed: false, alreadySent: false, now: NOW };
  ok('no refusal → skip', decideLifecycle({ ...base }).reason === 'no-refusal');
  ok('refused an hour ago → too early', decideLifecycle({ ...base, refusedAt: NOW - 3_600_000 }).reason === 'too-early');
  ok('refused 23h ago → too early', decideLifecycle({ ...base, refusedAt: NOW - 23 * 3_600_000 }).reason === 'too-early');
  ok('refused a day ago → send', decideLifecycle({ ...base, refusedAt: day(1) }).send === true);
  ok('refused a week ago → send', decideLifecycle({ ...base, refusedAt: day(7) }).send === true);
  // They joined since. The boundary no longer exists; an email about it is untrue.
  ok('a member never gets it', decideLifecycle({ ...base, plan: 'one', refusedAt: day(2) }).reason === 'member');
}

console.log('\n=== day-N: inside the window, after a day of quiet, never a member ===');
{
  const base = { kind: 'day-3', plan: 'free', unsubscribed: false, alreadySent: false, now: NOW };
  ok('no activity → skip', decideLifecycle({ ...base }).reason === 'no-activity');
  ok('2.5 days in → too early', decideLifecycle({ ...base, firstSeenAt: day(2.5), lastSeenAt: day(2) }).reason === 'too-early');
  ok('exactly 3 days in, quiet → send', decideLifecycle({ ...base, firstSeenAt: day(3), lastSeenAt: day(1.5) }).send === true);
  ok('3.9 days in, quiet → send', decideLifecycle({ ...base, firstSeenAt: day(3.9), lastSeenAt: day(1.5) }).send === true);
  ok('4 days in → too late (that is day-7’s job, later)', decideLifecycle({ ...base, firstSeenAt: day(4), lastSeenAt: day(1.5) }).reason === 'too-late');
  // Still working: the note would land on top of them.
  ok('active an hour ago → not quiet', decideLifecycle({ ...base, firstSeenAt: day(3.5), lastSeenAt: NOW - 3_600_000 }).reason === 'not-quiet');
  ok('unknown last activity → not quiet', decideLifecycle({ ...base, firstSeenAt: day(3.5), lastSeenAt: null }).reason === 'not-quiet');
  ok('a member is never nudged', decideLifecycle({ ...base, plan: 'one', firstSeenAt: day(3.5), lastSeenAt: day(2) }).reason === 'member');
  ok('day-7 has its own window', decideLifecycle({ ...base, kind: 'day-7', firstSeenAt: day(7.2), lastSeenAt: day(2) }).send === true);
  ok('day-7 at 3.5 days → too early', decideLifecycle({ ...base, kind: 'day-7', firstSeenAt: day(3.5), lastSeenAt: day(2) }).reason === 'too-early');
}

console.log('\n=== dates and links ===');
{
  // 2027-01-15 → "1 February 2027"; December rolls the year.
  ok('reset is the first of next month', resetDateFor(Date.UTC(2027, 0, 15)) === '1 February 2027');
  ok('December rolls the year', resetDateFor(Date.UTC(2026, 11, 31, 23)) === '1 January 2027');
  ok('via link carries the kind and nothing else', viaLink('https://socria.app/', '/chat', 'day-3') === 'https://socria.app/chat?via=day-3');
  ok('via link keeps a session id', viaLink('https://socria.app', '/chat', 'day-3', { s: 'lg_abc' }) === 'https://socria.app/chat?s=lg_abc&via=day-3');
  ok('empty params are dropped', !viaLink('https://socria.app', '/chat', 'day-7', { s: '' }).includes('s='));
  ok('day-N deep-links to the session when known', lifecycleLink('day-3', { base: 'https://socria.app', sessionId: 'lg_1' }).includes('s=lg_1'));
  ok('day-N without a session goes to /chat', lifecycleLink('day-7', { base: 'https://socria.app' }) === 'https://socria.app/chat?via=day-7');
  ok('welcome from Core stays on Core', !lifecycleLink('welcome-one', { base: 'https://socria.app', surface: 'core' }).includes('model=logos'));
  ok('welcome from anywhere else opens Logos', lifecycleLink('welcome-one', { base: 'https://socria.app', surface: 'logos' }).includes('model=logos'));
  ok('unsubscribe url carries id and token', unsubscribeUrl('https://socria.app', 'user_1', 'tok') === 'https://socria.app/api/email/unsubscribe?u=user_1&t=tok');
}

console.log('\n=== the unsubscribe token ===');
{
  const t = unsubscribeToken('user_1', 'secret-a');
  ok('is hex', /^[0-9a-f]{64}$/.test(t));
  ok('verifies', verifyUnsubscribeToken('user_1', t, 'secret-a') === true);
  ok('a different user fails', verifyUnsubscribeToken('user_2', t, 'secret-a') === false);
  ok('a different secret fails', verifyUnsubscribeToken('user_1', t, 'secret-b') === false);
  ok('a tampered token fails', verifyUnsubscribeToken('user_1', t.slice(0, -1) + (t.endsWith('0') ? '1' : '0'), 'secret-a') === false);
  ok('a short token fails without throwing', verifyUnsubscribeToken('user_1', 'abc', 'secret-a') === false);
  ok('an empty secret fails', verifyUnsubscribeToken('user_1', t, '') === false);
  for (const junk of [null, undefined, 3, {}, '']) {
    ok(`${JSON.stringify(junk) ?? 'undefined'} fails as a token`, verifyUnsubscribeToken('user_1', junk, 'secret-a') === false);
    ok(`...and as an id`, verifyUnsubscribeToken(junk, t, 'secret-a') === false);
  }
}

console.log('\n=== the copy: what each says, and what none may say ===');
{
  const ctx = { link: 'https://socria.app/chat?via=x', unsubscribeUrl: 'https://socria.app/api/email/unsubscribe?u=1&t=2', resetDate: '1 October 2026' };
  const all = Object.fromEntries(LIFECYCLE_KINDS.map((k) => [k, lifecycleCopy(k, ctx)]));

  // day-N are not One prompts. Not one word — in the body. The footer's
  // unsubscribe address is the one place the letters "subscribe" may appear.
  const body = (k) => all[k].text.split('\n\n').filter((p) => !p.includes(ctx.unsubscribeUrl)).join('\n');
  const bodyHtml = (k) => all[k].html.replace(/<p style="color:#6e6e73[^]*?<\/p>/, '');
  for (const k of ['day-3', 'day-7']) {
    ok(`${k} never says One`, !/Socria One|\bOne\b|member|subscribe|upgrade/i.test(body(k)), body(k));
    ok(`${k} never says One in HTML`, !/Socria One|member|subscribe|upgrade/i.test(bodyHtml(k)));
  }
  ok('day-3 says the map is where it was left', /still on the map, exactly as you left it/.test(all['day-3'].text));
  ok('day-7 is one line', /The map’s still there\./.test(all['day-7'].text));

  // limit-chats repeats the boundary verbatim — no second opinion.
  ok('limit-chats is the boundary’s own two sentences', all['limit-chats'].text.includes(boundaryNote('chats')));
  ok('...and the reset date', all['limit-chats'].text.includes('1 October 2026'));
  ok('limit-chats subject', all['limit-chats'].subject === 'Your free lines of thinking for this month');

  // welcome says what One does, and that nothing moved. What it says had to
  // change when the free tier stopped being clipped: it used to promise a map
  // that grows past where free held it, every lens, and Research on demand,
  // and a new member now had all three the day before they paid.
  ok('welcome opens with the volume', /as many lines of thinking as you have/.test(all['welcome-one'].text));
  ok('welcome promises the continuity', /carries what it learns about how you reason/.test(all['welcome-one'].text));
  ok('...on both surfaces', /into Core and into Logos/.test(all['welcome-one'].text));
  ok('welcome reassures', /Nothing you have already made changes/.test(all['welcome-one'].text));

  // And it must not sell back anything the free tier already holds.
  for (const claim of [/every lens/i, /all four depth/i, /Draft Space/i, /keeps? developing past/i]) {
    ok(`welcome does not re-sell ${claim}`, !claim.test(all['welcome-one'].text));
  }

  // Every email: the link, the sign-off, the footer with a way out.
  for (const k of LIFECYCLE_KINDS) {
    ok(`${k} carries its link`, all[k].text.includes(ctx.link) && all[k].html.includes(escapeHtml(ctx.link)));
    ok(`${k} carries the unsubscribe`, all[k].text.includes(ctx.unsubscribeUrl) && all[k].html.includes('Stop these notes'));
    ok(`${k} is signed`, all[k].text.includes('— Socria'));
    ok(`${k} says why it arrived`, /because you have a Socria account/.test(all[k].text));
    ok(`${k} has a subject`, all[k].subject.length > 4 && !/\n/.test(all[k].subject));
    // No countdowns, no meters.
    ok(`${k} has no countdown`, !/\d+ (days|hours) left|remaining/i.test(all[k].text));
  }

  // Conversation-shaped input cannot reach the body through the context.
  const secret = 'I am deciding whether to leave my partner';
  const leak = lifecycleCopy('day-3', { link: secret, unsubscribeUrl: ctx.unsubscribeUrl });
  ok('a link is rendered as a link, escaped, never as prose', leak.html.includes(escapeHtml(secret)) && !leak.html.includes(`<p>${secret}`));
  ok('escapeHtml escapes', escapeHtml('<a href="x">&\'') === '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
