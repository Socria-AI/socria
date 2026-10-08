// Socria Rewards — the marks beside the Socria mark, and the popups they open.
//
// The rule that decides when a popup may open by itself is pure
// (lib/rewards/popup-rule.ts) and pinned here first; then the places it meets
// the product: both rails carry the marks, each surface mounts the popups
// once, a popup never opens into a room something else is speaking in, and
// what they say about stacking is what the engine does (rewards.test.mjs).

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  POPUP_KINDS,
  POPUP_RULES,
  EMPTY_POPUP_MEMORY,
  readPopupMemory,
  writePopupMemory,
  remember,
  relevantKinds,
  hasWaited,
  pickPopup,
} from './.tmp/popup-rule.mjs';
import { EVENTS } from './.tmp/analytics.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 9, 8, 12, 0, 0);
const both = { enabled: true, give: true, challenge: true };
const empty = () => readPopupMemory(null);

console.log('=== what may open by itself ===');
{
  ok('two popups, the challenge first', POPUP_KINDS.length === 2 && POPUP_KINDS[0] === 'challenge' && POPUP_KINDS[1] === 'give');
  ok('rewards off, or signed out: nothing', pickPopup({ enabled: false, give: true, challenge: true }, empty(), T0) === null && relevantKinds({ enabled: false, give: true, challenge: true }).length === 0);
  ok('nothing to offer: nothing', pickPopup({ enabled: true, give: false, challenge: false }, empty(), T0) === null);
  ok('never shown: the challenge first — something to do here', pickPopup(both, empty(), T0) === 'challenge');
  ok('the challenge done (or a member): the gift alone', pickPopup({ enabled: true, give: true, challenge: false }, empty(), T0) === 'give');
  ok('no link: the challenge alone', pickPopup({ enabled: true, give: false, challenge: true }, empty(), T0) === 'challenge');
}

console.log('=== rarely: gaps, turns, "Not now" ===');
{
  let m = remember(empty(), 'challenge', 'shown', T0);
  ok('the next visit within the day: nothing at all', pickPopup(both, m, T0 + 6 * HOUR) === null && pickPopup(both, m, T0 + POPUP_RULES.anyGapMs - 1) === null);
  ok('a day later: the other one — they take turns', pickPopup(both, m, T0 + POPUP_RULES.anyGapMs) === 'give');
  m = remember(m, 'give', 'shown', T0 + DAY);
  ok('both shown recently: nothing', pickPopup(both, m, T0 + 2 * DAY) === null);
  ok('three days after the challenge: it again, the one shown longest ago', pickPopup(both, m, T0 + 3 * DAY + HOUR) === 'challenge');
  const alone = remember(empty(), 'give', 'shown', T0);
  ok('one kind alone waits its own gap, not just a day', pickPopup({ enabled: true, give: true, challenge: false }, alone, T0 + 2 * DAY) === null && pickPopup({ enabled: true, give: true, challenge: false }, alone, T0 + POPUP_RULES.sameGapMs) === 'give');
  const notNow = remember(remember(empty(), 'challenge', 'shown', T0), 'challenge', 'notNow', T0);
  ok('"Not now" rests that one ten days', !hasWaited(notNow, 'challenge', T0 + 9 * DAY) && hasWaited(notNow, 'challenge', T0 + POPUP_RULES.notNowMs));
  ok('…and the other still takes its turn', pickPopup(both, notNow, T0 + 2 * DAY) === 'give');
  const acted = remember(remember(empty(), 'give', 'shown', T0), 'give', 'acted', T0);
  ok('done what it asked (copied the link): fourteen days', !hasWaited(acted, 'give', T0 + 13 * DAY) && hasWaited(acted, 'give', T0 + POPUP_RULES.actedMs));
  const future = remember(empty(), 'challenge', 'shown', T0 + 100 * DAY);
  ok('a clock set back does not silence them for good', hasWaited(future, 'challenge', T0) && pickPopup(both, future, T0) === 'give');
  ok('the rules are days, not minutes', POPUP_RULES.anyGapMs >= 12 * HOUR && POPUP_RULES.sameGapMs >= 3 * DAY && POPUP_RULES.notNowMs > POPUP_RULES.sameGapMs && POPUP_RULES.actedMs >= POPUP_RULES.notNowMs);
}

console.log('=== the memory: tolerant, and only what it is for ===');
{
  const m = remember(remember(empty(), 'give', 'shown', T0), 'challenge', 'notNow', T0 + 1);
  const back = readPopupMemory(writePopupMemory(m));
  ok('round-trips', back.shown.give === T0 && back.notNow.challenge === T0 + 1);
  ok('garbage is an empty memory, never a throw', ['{', 'null', '[]', '"x"', '{"shown":{"give":"soon","evil":5,"challenge":-3}}'].every((raw) => {
    const r = readPopupMemory(raw);
    return Object.keys(r.shown).length === 0 && Object.keys(r.notNow).length === 0 && Object.keys(r.acted).length === 0;
  }));
  ok('remember never mutates', (() => { const a = empty(); remember(a, 'give', 'shown', T0); return a.shown.give === undefined; })());
  ok('the shared empty memory is not written through', (() => { remember(EMPTY_POPUP_MEMORY, 'give', 'shown', T0); return EMPTY_POPUP_MEMORY.shown.give === undefined; })());
  ok('it holds times, never content', !/progress|link|code|email|name/i.test(writePopupMemory(m)));
}

console.log('=== the marks: both rails, beside the Socria mark ===');
{
  const page = read('app/chat/page.tsx');
  const rail = read('components/LogosRail.tsx');
  const app = read('components/LogosApp.tsx');
  ok('Core rail: the marks right after the Socria mark', /<div className="s-top">\s*<Logo \/>\s*\{\/\*[^*]*\*\/\}\s*<RewardsBadges enabled=\{!!isSignedIn\} \/>/.test(page));
  ok('Logos rail: the same', /<div className="s-top">\s*<Logo \/>\s*<RewardsBadges enabled=\{rewards\} \/>/.test(rail));
  ok('…for a signed-in person only', /rewards = false,/.test(rail) && /<LogosRail\s+sessions=\{sessions\}\s+rewards=\{cloud\}/.test(app));
  const badges = read('components/rewards/RewardsBadges.tsx');
  ok('the gift while there is a link to give', /const showGive = !!view\.link;/.test(badges));
  ok('the challenge while it is open — not when done, not for a member', /const open = c\?\.state === 'open' \? c : null;/.test(badges));
  ok('rewards switched off: no marks', /if \(!view\?\.enabled\) return null;/.test(badges));
  ok('a mark opens its popup — asked for, never rationed', /onClick=\{\(\) => openRewardsPopup\('give'\)\}/.test(badges) && /onClick=\{\(\) => openRewardsPopup\('challenge'\)\}/.test(badges));
  ok('each mark says what it is to a screen reader', /aria-label=\{`Give \$\{give\}, Get \$\{get\}: invite a friend`\}/.test(badges) && /aria-label=\{`The 5-Node Challenge: \$\{open\.progress\} of \$\{open\.target\} nodes`\}/.test(badges));
  ok('the marks never count nodes', !/connectedCount|evaluateChallenge|nodes\.length/.test(badges));
  ok('Logos says the challenge once: its header chip shows progress only while the rail (and its mark) is put away', /<ChallengeChip enabled=\{cloud\} progress=\{!\(railOpen && !chromeHidden\)\}/.test(app) && /const showOpen = c\?\.state === 'open' && !hidden && progress;/.test(read('components/rewards/ChallengeChip.tsx')));
  ok('…and still says the completion there', /const showDone = c\?\.state === 'done' && !doneSeen;/.test(read('components/rewards/ChallengeChip.tsx')));
}

console.log('=== the popups: once per surface, into a quiet room ===');
{
  const page = read('app/chat/page.tsx');
  const mounts = page.match(/<RewardsPopups /g) || [];
  ok('mounted twice in the page — once in each branch, so once on screen', mounts.length === 2);
  ok('…Core with the way into Logos, Logos without', /<RewardsPopups enabled=\{!!isSignedIn\} quiet=\{rewardsQuiet\} surface="core" onOpenLogos=\{openNewestLogos\} \/>/.test(page) && /<RewardsPopups enabled=\{!!isSignedIn\} quiet=\{rewardsQuiet\} surface="logos" \/>/.test(page));
  ok('quiet waits for everything to be known, and for nothing else to be open', /const rewardsQuiet =\s*isLoaded && !hydrating && planState\.known && !spokeThisVisit && !anythingOpen && !findOpen;/.test(page));
  ok('once the One invitation, the tour or onboarding has spoken, the popups wait for another visit', /if \(onePrompt \|\| tourOpen \|\| tourAfter \|\| autoSend\) setSpokeThisVisit\(true\);/.test(page));
  ok('the challenge opens the newest Logos on offer', /if \(isOffered\('logos-3'\)\) \{\s*setModel\('logos-3'\);\s*chooseModel\('logos-3'\);/.test(page));
  const pop = read('components/rewards/RewardsPopups.tsx');
  ok('by itself only through the rule', /const kind = pickPopup\(factsOf\(view\), memory, now\);/.test(pop));
  ok('…once a visit, decided on arrival', /if \(visitSpoken\(\)\) return;\s*\/\/[^\n]*\n\s*markVisit\(\);/.test(pop));
  ok('…never over a dialog or the tour', /document\.querySelector\('\[aria-modal="true"\], \.tour-layer'\)/.test(pop) && /if \(screenTaken\(\)\) return;/.test(pop));
  ok('…after the room has been settled a moment', /POPUP_RULES\.settleMs/.test(pop));
  ok('no way to remember the visit: never by itself', /catch \{\s*\/\/[^\n]*\n\s*return true;/.test(pop));
  ok('"Not now" is remembered', /remember\(memory, open\.kind, 'notNow', Date\.now\(\)\)/.test(pop));
  ok('copying the link rests the gift longest, and keeps the popup open to say so', /onAct\(\);\s*track\('rewards_referral_link_copied', \{ surface: 'popup' \}\)/.test(pop) && /setCopied\(true\);/.test(pop));
  ok('the completion is said once per browser, and only on Core (Logos has its chip)', /surface === 'core' && c\?\.state === 'done' && c\.justNow && readFlag\(DONE_SEEN_KEY\) !== '1'/.test(pop) && /writeFlag\(DONE_SEEN_KEY, '1'\)/.test(pop));
  ok('a popup whose reward stopped meaning anything closes', /const stale =/.test(pop) && /if \(stale\) setOpen\(null\);/.test(pop));
  ok('a dialog, labelled, closable by Escape', /role="dialog" aria-modal="true" aria-labelledby=/.test(pop) && /e\.key === 'Escape'/.test(pop));
  ok('the popups never count nodes or grant anything', !/connectedCount|evaluateChallenge|grantReward|applyGrant|fetch\(/.test(pop));
  for (const e of ['rewards_popup_viewed', 'rewards_popup_dismissed']) ok(`${e} is declared`, EVENTS.includes(e));
}

console.log('=== what they say ===');
{
  const pop = read('components/rewards/RewardsPopups.tsx');
  const code = pop.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  ok('the offers in their own words', /Give <em>\{limits\.give\}<\/em>\. Get <em>\{limits\.get\}<\/em>\./.test(pop) && /Create a \{c\.target\}-node mind map\. Get \{limits\.challenge\} days of Socria One free\./.test(pop));
  ok('progress is the server\'s count', /Progress: \{c\.progress\}\/\{c\.target\} nodes/.test(pop));
  ok('do both and they stack — the sum is said, and the cap', /Do both and they stack: \$\{a\} \+ \$\{b\} = \$\{a \+ b\} days of Socria One, one after the other — up to \$\{limits\.cap\} days waiting at once\./.test(pop));
  ok('a member is told their days wait, and the subscription is never changed', /Your subscription is never changed\./.test(pop));
  ok('past the monthly limit, it says friends still get theirs', /friends still get their \$\{limits\.give\} days/.test(pop));
  ok('no countdowns, streaks or urgency', !/hurry|only today|expires soon|streak|countdown|don['’]t miss|last chance|limited time/i.test(code));
  const css = read('components/rewards/rewards-pop.css');
  ok('every animation stops for reduced motion', /@media \(prefers-reduced-motion: reduce\)/.test(css) && /animation: none !important/.test(css) && /\.rwb-spark, \.rwb-glint, \.rwp-mover \{ display: none; \}/.test(css));
  ok('the marks are small: 24px buttons', /width: 24px; height: 24px;/.test(css));
  ok('…and sit right after the wordmark, pushing the close button away', /\.app-root \.s-top \.rwb \{ margin-right: auto; \}/.test(css));
  ok('no SVG group is both positioned by attribute and moved by CSS', !/className="rwp-(gift|node|seal)[^"]*"[^>]*transform=|transform=[^>]*className="rwp-(gift|node|seal)/.test(pop));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
