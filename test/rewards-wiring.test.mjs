// Socria Rewards — the wiring. The rules are pinned in rewards.test.mjs; this
// suite pins the places those rules meet the rest of Socria, where a one-line
// change could quietly give Socria One away, take paid access away, or sell
// something twice.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeRefCookie, encodeRefCookie } from './.tmp/referral-rule.mjs';
import { EVENTS, scrub } from './.tmp/analytics.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

console.log('=== the plan: paid first, promotional only when nothing else holds ===');
{
  const s = read('lib/socria-one-server.ts');
  const resolve = s.slice(s.indexOf('export async function resolvePlanForRequest'));
  ok('the plan asks the base plan first and returns it when it is One', /const base = await resolveBasePlanForRequest\(req, userId\);\s*if \(base === 'one' \|\| !userId\) return base;/.test(resolve));
  ok('…and only then promotional time', /return \(await promoOn\(userId\)\) \? 'one' : 'free';/.test(resolve));
  ok('the base plan never consults rewards', !/promo/i.test(s.slice(s.indexOf('export async function resolveBasePlanForRequest'), s.indexOf('/** Promotional Socria One running right now'))));
  ok('a reward write clears the remembered plan', /promoMemo\.delete\(userId\)/.test(s));
  ok('for rewards, "could not tell" means "still entitled" — banked days never start by accident', /return !sub\.ok \|\| grant === null;/.test(s));
  const pa = read('lib/rewards/promo-access.ts');
  ok('the per-request check only reads', /getAccount\(userId\)/.test(pa) && !/casAccount|insertLedger|updateLedger|createAccount|resolvePromo/.test(pa));
  ok('…and any failure answers "no promotional access"', (pa.match(/return false;/g) || []).length >= 2);
}

console.log('=== billing: never sells twice, never refuses someone on a reward, never touches Stripe ===');
{
  const co = read('app/api/stripe/checkout/route.ts');
  ok('checkout refuses on the BASE plan, so a reward can still convert', /\(await resolveBasePlanForRequest\(req, userId\)\) === 'one'/.test(co) && !/resolvePlanForRequest\(/.test(co));
  const wh = read('app/api/stripe/webhook/route.ts');
  const apply = wh.slice(wh.indexOf('async function applySubscription'), wh.indexOf('export async function POST'));
  ok('the webhook tells rewards only after the subscription is written', apply.indexOf('upsertSubscription(') < apply.indexOf('rewardsAfterBilling(') && apply.indexOf('writeStripeMirror(') < apply.indexOf('rewardsAfterBilling('));
  ok('…bounded, so Stripe is not kept waiting', /withTimeout\(rewardsAfterBilling\(/.test(apply));
  const rs = read('lib/rewards/rewards-server.ts');
  ok('rewards never throws into the webhook', /export async function rewardsAfterBilling[\s\S]*?try \{[\s\S]*?\} catch \{/.test(rs));
  const all = ['lib/rewards/promo-engine.ts', 'lib/rewards/rewards-service.ts', 'lib/rewards/rewards-server.ts', 'lib/rewards/supabase-rewards-store.ts', 'lib/rewards/promo-access.ts'].map(read).join('\n');
  ok('nothing in Socria Rewards calls Stripe', !/stripe\(|from '@\/lib\/stripe'|from '\.\.\/stripe'|subscriptions\.(update|create|cancel)/.test(all));
  ok('nothing in Socria Rewards writes the subscriptions table', !/socria_subscriptions/.test(all));
  const plan = read('app/api/logos/plan/route.ts');
  ok('the plan endpoint says when One comes from a reward alone', /only: plan === 'one' && base === 'free'/.test(plan));
  const up = read('components/usePlan.ts');
  ok('a reward is never cached in the browser as a membership', /plan === 'one' && !promo\?\.only/.test(up));
  ok('…in Logos either', /json\.plan === 'one' && !json\?\.promo\?\.only/.test(read('components/LogosApp.tsx')));
  const one = read('app/one/OneIssue.tsx');
  ok('/one still sells to someone on a reward, and says what happens to their days', /const isOne = plan\.known && plan\.plan === 'one' && !fromReward;/.test(one) && /saved, not lost/.test(one));
  const sheet = read('components/account/AccountSheet.tsx');
  ok('the account says "from Socria Rewards", not "manage membership", for reward-only One', /fromReward \? 'Keep Socria One →'/.test(sheet));
}

console.log('=== the server decides, the browser asks ===');
{
  const api = read('app/api/rewards/route.ts');
  ok('rewards need an account', /if \(!userId\) return NextResponse\.json\(\{ error: 'Sign in to see your rewards\.' \}, \{ status: 401 \}\)/.test(api));
  ok('…are rate-limited', /enforceRateLimit\(req, userId, 'aux'\)/.test(api));
  ok('…read nothing from the request body', !/req\.json\(\)/.test(api));
  ok('…and a missing table is "unavailable", not an error', /RewardsUnavailable/.test(api) && /unavailable: true/.test(api));
  ok('the link\'s cookie is cleared once attribution has been decided', /if \(decided\) clearRefCookie\(res\);/.test(api));
  ok('switched off, the route says so and does nothing', /if \(!cfg\.enabled\) return NextResponse\.json\(\{ enabled: false \}\);/.test(api));
  const hook = read('components/rewards/useRewards.ts');
  ok('the surfaces never count nodes themselves', !/connectedCount|evaluateChallenge|nodes\.length/.test(hook + read('components/rewards/ChallengeChip.tsx') + read('components/rewards/RewardsPanel.tsx')));
  ok('progress is asked again after Logos saves the map', /SESSION_SAVED/.test(hook) && /window\.dispatchEvent\(new Event\(SESSION_SAVED\)\)/.test(read('components/LogosApp.tsx')));
}

console.log('=== the link and invitations ===');
{
  const r = read('app/r/[code]/route.ts');
  ok('/r/<code> remembers only a code someone holds', /ownerOfCode\(code\)/.test(r));
  ok('…and never for someone already signed in', /if \(userId\) return NextResponse\.redirect\(new URL\('\/chat', req\.url\)\);/.test(r));
  ok('"a friend invited you" is said only for a code someone holds', /if \(held\) dest\.searchParams\.set\('invited', '1'\);/.test(r) && !/searchParams\.set\('invited'[^\n]*\n?[^\n]*cfg\.enabled\)/.test(r) && /held = !!\(await supabaseRewardsStore\(\)\.ownerOfCode\(code\)\)/.test(r));
  const rs = read('lib/rewards/rewards-server.ts');
  ok('first link wins: a fresh cookie is not replaced', /if \(readRefCookie\(req, cfg\)\) return false;/.test(rs));
  ok('the cookie is httpOnly and lax', /httpOnly: true,\s*sameSite: 'lax'/.test(rs));
  ok('the cookie remembers a Think Together invitation as one', decodeRefCookie(encodeRefCookie({ code: 'ABCD2345', at: Date.now() - 1000, via: 'invite' }), Date.now(), 30)?.via === 'invite' && decodeRefCookie(encodeRefCookie({ code: 'ABCD2345', at: Date.now() - 1000 }), Date.now(), 30)?.via === undefined);
  const acc = read('app/api/share/accept/route.ts');
  ok('a signed-out person opening a share invitation: the inviter is remembered', /await rememberInviter\(req, res, inviter\);/.test(acc));
  ok('…rate-limited, and the answer is still the 401', /enforceRateLimit\(req, null, 'aux'\)/.test(acc) && /status: 401/.test(acc));
  ok('…signed in, accepting works exactly as before', /if \(token\) joined = await acceptLink\(userId, token\);/.test(acc));
  const inv = read('app/api/rewards/invite/route.ts');
  ok('a Think Together room link remembers its host', /openRoomByCode\(room\)\)\?\.hostUserId/.test(inv));
  ok('…does nothing for someone signed in', /if \(userId \|\| !rewardsConfig\(\)\.enabled\) return res;/.test(inv));
  ok('…and never says who the inviter is', !/inviter[^\n]*NextResponse\.json/.test(inv));
  ok('Logos asks it for a signed-out visitor holding a room link', /if \(!isLoaded \|\| isSignedIn \|\| !joinCode\) return;[\s\S]{0,200}\/api\/rewards\/invite/.test(read('components/LogosApp.tsx')));
  const share = read('lib/share/server.ts');
  const fn = share.slice(share.indexOf('export async function inviterOf'), share.indexOf('/** Invitations sent to an address'));
  ok('the inviter lookup only reads — it joins no one', !/\.insert\(|\.update\(|\.delete\(|join\(/.test(fn));
  ok('a reset link or a withdrawn invitation names no inviter', /linkToken\(sh\.id, sh\.linkNonce\) === input\.token/.test(fn) && /is\('removed_at', null\)/.test(fn));
}

console.log('=== data: deleted with the account, exported, walled ===');
{
  const del = read('app/api/account/delete/route.ts');
  for (const t of ['promo_accounts', 'promo_ledger', 'referral_codes', 'referrals']) {
    ok(`${t} is deleted with the account`, new RegExp(`'${t}'`).test(del.slice(del.indexOf('const OWNED_TABLES'), del.indexOf('] as const;'))));
  }
  ok('a deleted referrer is cut from the rows of the people they invited', /await purgeReferrer\(userId\);/.test(del));
  const exp = read('app/api/account/export/route.ts');
  ok('the export never includes another person\'s id', !/referrals'\)\.select\('[^']*(user_id|referrer_id)/.test(exp));
  const schema = read('supabase/schema.sql');
  ok('a reward is recorded once: its key is the primary key', /create table if not exists promo_ledger \(\s*key text primary key/.test(schema));
  ok('one referrer per account: the invited person is the primary key', /create table if not exists referrals \(\s*user_id text primary key/.test(schema));
  ok('and nobody is their own referrer, even by hand', /referrals_not_self check \(referrer_id is null or referrer_id <> user_id\)/.test(schema));
  ok('codes are unique', /code text not null unique/.test(schema));
  const store = read('lib/rewards/supabase-rewards-store.ts');
  ok('the account update is compare-and-swap on version', /\.eq\('user_id', next\.userId\)\s*\.eq\('version', expected\)/.test(store));
  ok('…and a non-winner never overwrites a settled ledger row', /if \(opts\?\.onlyIfPending\) q = q\.eq\('status', 'pending'\);/.test(store));
  const cron = JSON.parse(read('vercel.json')).crons;
  ok('the sweep runs daily', cron.some((c) => c.path === '/api/cron/rewards'));
  ok('…behind CRON_SECRET', /CRON_SECRET/.test(read('app/api/cron/rewards/route.ts')) && /status: 503/.test(read('app/api/cron/rewards/route.ts')));
}

console.log('=== analytics: shape only ===');
{
  const need = ['rewards_challenge_viewed', 'rewards_challenge_started', 'rewards_challenge_completed', 'rewards_challenge_reward_granted', 'rewards_referral_link_copied', 'rewards_referral_signup_completed', 'rewards_referral_activation_completed', 'rewards_referral_reward_granted', 'rewards_promo_expired', 'rewards_promo_converted'];
  for (const e of need) ok(`${e} is declared`, EVENTS.includes(e));
  const s = scrub({ kind: 'challenge', outcome: 'active', surface: 'link', code: 'ABCD2345', userId: 'user_1', email: 'a@b.c' });
  ok('a reward event carries its kind and outcome, and never a code, an id or an address', s.kind === 'challenge' && s.outcome === 'active' && !('code' in s) && !('userId' in s) && !('email' in s));
  const svc = read('lib/rewards/rewards-service.ts');
  ok('the service tracks no ids', !/track\?\.\([^)]*userId/.test(svc) && !/track\?\.\([^)]*referrerId/.test(svc));
}

console.log('=== the surfaces stay quiet ===');
{
  const chip = read('components/rewards/ChallengeChip.tsx');
  ok('the chip opens by itself only when the challenge is complete', /if \(showDone\) setOpen\(true\);/.test(chip) && !/setOpen\(true\)[^\n]*showOpen/.test(chip));
  ok('"Not now" puts it away for good on this browser', /writeFlag\(CHIP_HIDDEN_KEY, 'hidden'\)/.test(chip));
  ok('the completion says exactly the offer', /Challenge Complete!/.test(chip) && /You've unlocked \$\{days\} days of Socria One\./.test(chip) && /Start Exploring Socria One/.test(chip));
  const panel = read('components/rewards/RewardsPanel.tsx');
  ok('the referral panel says the offer in its own words', /Give \{give\}\. Get \{get\}\./.test(panel) && /Referrals: \{r\.rewardedThisMonth\}\/\{r\.monthlyCap\} rewarded this month/.test(panel) && /Earned: \{r\.earnedDays\} days/.test(panel));
  const code = (chip + panel).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  ok('no countdowns, streaks or urgency in anything shown', !/hurry|only today|expires soon|streak|countdown|don['’]t miss/i.test(code));
  const css = read('components/rewards/rewards.css');
  ok('motion respects reduced motion', /prefers-reduced-motion: reduce/.test(css));
  // found in a browser: the Logos header is nowrap, so the card ran its text out of itself, slid off a
  // phone's right edge, and stayed open over the account sheet it had just opened
  ok('the card wraps its own text inside a nowrap header', /\.rwc-card \{[^}]*white-space: normal/.test(css));
  ok('the card is kept on screen on a narrow header', /useBeforePaint\(\(\) => \{/.test(chip) && /document\.documentElement\.clientWidth - EDGE/.test(chip) && /style=\{shift \? \{ left: shift \} : undefined\}/.test(chip));
  ok('"Socria Rewards" closes the card before opening the account', /function toAccount\(\) \{\s*setOpen\(false\);\s*onOpenAccount\?\.\(\);/.test(chip));
  ok('Think Together keeps its name: the rewards UI does not rename it', !/Think Together/.test(chip + panel));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
