// test/model-router.test.mjs — WHICH MODEL ANSWERS (lib/model-router.ts).
//
// The tier is the server's (signed in or not, the plan it resolved), the level
// is read from the turn with no model call, a refused model steps down within
// the tier and never above it, every route that calls a model asks the router,
// and no request can name a model. Through the routes themselves:
// test/prompt-cache.test.mjs.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as R from './.tmp/model-router.mjs';
import { CORPUS } from './helpers/routing-corpus.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
let pass = 0;
let fail = 0;
const ok = (name, cond, info) => {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? '  ok  ' : '  FAIL'} ${name}${!cond && info !== undefined ? `  — ${typeof info === 'string' ? info : JSON.stringify(info)}` : ''}`);
};

console.log('\n=== the tier, from the server ===');
ok('signed out is a guest, whatever the plan says', R.tierOf(null, 'one') === 'guest' && R.tierOf(undefined, 'free') === 'guest');
ok('signed in on the free plan', R.tierOf('u1', 'free') === 'free');
ok('signed in with Socria One', R.tierOf('u1', 'one') === 'one');
ok('anything else is the free plan', R.tierOf('u1', 'gold') === 'free');

console.log('\n=== the brief, as a table ===');
const pick = (tier, level) => R.chooseModel(tier, { level, reasons: [] }).model;
ok('guests: GPT-4o mini at every level', ['light', 'standard', 'deep'].every((l) => pick('guest', l) === 'gpt-4o-mini'));
ok('free: GPT-6 Luna at every level', ['light', 'standard', 'deep'].every((l) => pick('free', l) === 'gpt-6-luna'));
ok('Socria One: GPT-6.1 Terra by default', pick('one', 'standard') === 'gpt-6.1-terra');
ok('  GPT-6.1 Sol for deep reasoning', pick('one', 'deep') === 'gpt-6.1-sol');
ok('  GPT-6 Luna for a thanks', pick('one', 'light') === 'gpt-6-luna');

console.log('\n=== a refused model steps down, never up ===');
ok('Sol → GPT-5.6 Sol → GPT-6.1 Terra → GPT-4o', JSON.stringify(R.chooseModel('one', { level: 'deep', reasons: [] }).ladder) === JSON.stringify(['gpt-6.1-sol', 'gpt-5.6-sol', 'gpt-6.1-terra', 'gpt-4o']));
ok('Terra → GPT-5.6 Terra → GPT-5.6 Sol → GPT-4o', JSON.stringify(R.chooseModel('one', { level: 'standard', reasons: [] }).ladder) === JSON.stringify(['gpt-6.1-terra', 'gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-4o']));
ok('free: Luna → GPT-5.6 Luna → GPT-4o mini', JSON.stringify(R.chooseModel('free', { level: 'deep', reasons: [] }).ladder) === JSON.stringify(['gpt-6-luna', 'gpt-5.6-luna', 'gpt-4o-mini']));
ok('guest: GPT-4o mini alone', JSON.stringify(R.chooseModel('guest', { level: 'deep', reasons: [] }).ladder) === JSON.stringify(['gpt-4o-mini']));
const forced = R.chooseModel('free', { level: 'deep', reasons: [] }, { OPENAI_MODEL_FREE_DEEP: 'gpt-6.1-sol' });
ok('even an override that puts a free turn on Sol keeps the free ladder below it', forced.model === 'gpt-6.1-sol' && !forced.ladder.slice(1).some((m) => /gpt-6\.1|gpt-5\.6-(sol|terra)|gpt-4o$/.test(m)), forced.ladder);
for (const tier of ['guest', 'free']) {
  for (const level of ['light', 'standard', 'deep']) {
    const l = R.chooseModel(tier, { level, reasons: [] }).ladder;
    ok(`${tier}/${level}: no member model anywhere on the ladder`, !l.some((m) => ['gpt-6.1-terra', 'gpt-6.1-sol', 'gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-4o'].includes(m)), l);
  }
}

console.log('\n=== overrides and the switch ===');
ok('a tier/level override, read at call time', R.chooseModel('one', { level: 'deep', reasons: [] }, { OPENAI_MODEL_ONE_DEEP: 'gpt-5.6-sol' }).model === 'gpt-5.6-sol');
ok('OPENAI_MODEL_LOGOS does not move a routed reply', R.chooseModel('one', { level: 'deep', reasons: [] }, { OPENAI_MODEL_LOGOS: 'gpt-4o' }).model === 'gpt-6.1-sol');
const off = R.chooseModel('free', { level: 'light', reasons: [] }, { LOGOS_ROUTER: 'off' });
ok('LOGOS_ROUTER=off: everyone on GPT-5.6 Sol, as before', off.model === 'gpt-5.6-sol' && off.unrouted && JSON.stringify(off.ladder) === JSON.stringify(['gpt-5.6-sol', 'gpt-4o']));
ok('  and OPENAI_MODEL_LOGOS moves it then', R.chooseModel('guest', { level: 'light', reasons: [] }, { LOGOS_ROUTER: 'off', OPENAI_MODEL_LOGOS: 'gpt-5.6-terra' }).model === 'gpt-5.6-terra');
ok('aux calls: standard work on the tier’s default', R.chooseAuxModel('one', 'standard').model === 'gpt-6.1-terra' && R.chooseAuxModel('free', 'standard').model === 'gpt-6-luna' && R.chooseAuxModel('guest', 'standard').model === 'gpt-4o-mini');
ok('  deep work (a synthesis) on Sol for a member', R.chooseAuxModel('one', 'deep').model === 'gpt-6.1-sol' && R.chooseAuxModel('free', 'deep').model === 'gpt-6-luna');
ok('  off: the route’s own model, as before', R.chooseAuxModel('one', 'standard', { LOGOS_ROUTER: 'off' }, 'gpt-5.6-terra').model === 'gpt-5.6-terra');

console.log('\n=== how hard the turn is, across subjects ===');
const bySubject = {};
let right = 0;
for (const c of CORPUS) {
  const got = R.levelOf(c).level;
  (bySubject[c.subject] ??= { n: 0, right: 0 }).n++;
  if (got === c.expect) {
    right++;
    bySubject[c.subject].right++;
  }
  ok(`${c.subject}: "${c.text.slice(0, 48)}${c.text.length > 48 ? '…' : ''}" → ${c.expect}`, got === c.expect, { got, reasons: R.levelOf(c).reasons });
}
console.log(`  (${right}/${CORPUS.length} turns at the level a careful reader gives them)`);
ok('a greeting with a proof in it is a proof', R.levelOf({ text: 'hi! prove that 0.999… = 1', exchange: 'social' }).level === 'deep');
ok('a long personal message is not small talk', R.levelOf({ text: 'I have been thinking a lot about whether to move back home, and honestly I keep going round in circles about my parents and the job and my friends here', exchange: 'personal' }).level !== 'light');
ok('"ok" to Socria’s question is an answer, never small talk', R.levelOf({ text: 'ok', exchange: 'conversation', lastReplyAsked: true }).level === 'standard' && R.levelOf({ text: 'ok', exchange: 'conversation' }).level === 'light');
ok('nothing known: ordinary work', R.levelOf({}).level === 'standard');

console.log('\n=== the history, compressed where it costs nothing ===');
{
  const long = 'A'.repeat(1800) + ' the middle ' + 'B'.repeat(3000) + ' and the question back?';
  const msgs = [
    { role: 'user', content: 'U1 ' + 'x'.repeat(5000) },
    { role: 'assistant', content: long },
    { role: 'user', content: 'U2' },
    { role: 'assistant', content: long },
    { role: 'user', content: 'U3' },
    { role: 'assistant', content: long },
    { role: 'user', content: 'U4' },
  ];
  const c = R.compressHistory(msgs);
  ok('an old reply is clipped, with its opening and its ending', c[1].content.length < long.length && c[1].content.startsWith('A'.repeat(100)) && c[1].content.endsWith('the question back?') && c[1].content.includes('[… shortened …]'));
  ok('the person’s words are never clipped, however long', c[0].content === msgs[0].content);
  ok('the newest few are read in full — the reply they answer above all', c[3].content === long && c[5].content === long && c[6].content === 'U4');
  ok('the same message clips the same way every turn (the cache still serves it)', JSON.stringify(R.compressHistory(msgs)) === JSON.stringify(c));
  ok('a short history is untouched', JSON.stringify(R.compressHistory(msgs.slice(-3))) === JSON.stringify(msgs.slice(-3)));
}

console.log('\n=== prices and keys ===');
ok('a call’s cost from its usage: 1M in, 1M out on Sol is $12', Math.abs(R.costOf('gpt-6.1-sol', { input: 1e6, output: 1e6 }) - 12) < 1e-9);
ok('  cached input at the cached price', Math.abs(R.costOf('gpt-6.1-terra', { input: 1e6, cached: 1e6, output: 0 }) - 0.05) < 1e-9);
ok('  no published cached price: the input price (overstates, never understates)', Math.abs(R.costOf('gpt-6-luna', { input: 1e6, cached: 1e6, output: 0 }) - 0.1) < 1e-9);
ok('  an unknown model: no guess', R.costOf('gpt-9', { input: 1, output: 1 }) === null);
ok('GPT-6 Luna is cheaper than GPT-4o mini on both sides', R.PRICES['gpt-6-luna'].input < R.PRICES['gpt-4o-mini'].input && R.PRICES['gpt-6-luna'].output < R.PRICES['gpt-4o-mini'].output);
const k1 = R.cacheKey('chat', 'conversation-abc');
ok('a cache key is stable for a line of thinking, and says nothing of it', k1 === R.cacheKey('chat', 'conversation-abc') && !k1.includes('abc') && k1 !== R.cacheKey('chat', 'conversation-abd'));
ok('  none without one', R.cacheKey('chat', null) === undefined);

console.log('\n=== refusal, and stepping down ===');
{
  const refused = Object.assign(new Error('The model `gpt-6.1-sol` does not exist'), { status: 404 });
  const tried = [];
  const r = await R.firstAccepted(['a', 'b', 'c'], async (m) => {
    tried.push(m);
    if (m !== 'c') throw refused;
    return 'answer';
  });
  ok('a refused model steps to the next', r.model === 'c' && r.result === 'answer' && tried.join() === 'a,b,c');
  let threw = null;
  try {
    await R.firstAccepted(['a', 'b'], async () => {
      throw Object.assign(new Error('rate limited'), { status: 429 });
    });
  } catch (e) {
    threw = e;
  }
  ok('any other failure is not retried down the ladder', threw?.status === 429);
}

console.log('\n=== on the server, everywhere a model is called ===');
{
  const chat = read('app/api/logos/chat/route.ts');
  ok('the reply: the tier from the session and the server’s plan', /chooseModel\(\s*tierOf\(userId, plan\)/.test(chat) && /const plan = await resolvePlanForRequest\(req, userId\)/.test(chat));
  ok('  the level from what the engine read, not from the request', /levelOf\(\{[\s\S]{0,600}mathCheck: accuracy\.check/.test(chat) && !/body\??\.model\b/.test(chat));
  ok('  refused ids step down the tier’s ladder', /firstAccepted\(route\.ladder, make/.test(chat));
  ok('  the model that answered is said in a header', /'X-Socria-Model': `\$\{route\.tier\}\/\$\{route\.level\}\/\$\{served\}`/.test(chat));
  ok('  older replies read back clipped', /compressHistory\(kept/.test(chat));
  ok('  one cache key per line of thinking', /prompt_cache_key: promptCacheKey/.test(chat));
  const map = read('app/api/logos/map/route.ts');
  ok('the map: by tier', /chooseAuxModel\(tierOf\(userId, plan\), 'standard'/.test(map) && /const ladder = route\.ladder/.test(map));
  for (const f of ['app/api/logos/explore/route.ts', 'app/api/logos/read/route.ts', 'app/api/logos/write/route.ts', 'app/api/logos/easy/route.ts', 'app/api/logos/synthesize/route.ts', 'app/api/logos/experience/route.ts', 'app/api/docs/page/route.ts', 'app/api/projects/[id]/synthesize/route.ts']) {
    const s = read(f);
    ok(`${f.replace('app/api/', '')}: by tier, stepping down within it`, /chooseAuxModel\(tierOf\(userId, /.test(s) && !/LOGOS_FALLBACK_MODEL/.test(s));
  }
  ok('both syntheses are deep work', /'deep'/.test(read('app/api/logos/synthesize/route.ts')) && /'deep'/.test(read('app/api/projects/[id]/synthesize/route.ts')));
  ok('the study routes pass the tier', ['app/api/logos/organize/route.ts', 'app/api/logos/practice/route.ts'].every((f) => /tier: tierOf\(userId, await resolvePlanForRequest\(req, userId\)\)/.test(read(f))) && /firstAccepted\(routed\.ladder, call\)/.test(read('lib/logos5/ask-json.ts')));
  ok('the memory extractor asks GPT-6 Luna, stepping down to GPT-4o mini', /firstAccepted\(extractorLadder\(\)/.test(read('lib/mind/extract.ts')));
  ok('a refused cache key is dropped and the call asked again', /refusesParam\(e, 'prompt_cache_key'\)/.test(read('lib/openai-usage.ts')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
