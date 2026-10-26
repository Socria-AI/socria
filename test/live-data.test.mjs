// LIVE DATA — "fix the internet access, it should be able to access live data".
//
// What was wrong, found by reading the turn through:
//
//   the gate      lib/runtime/epistemic.ts called the weather, a score, who
//                 won, a price, a rate and the news current; the gate that
//                 decides a search (lib/core4/web.ts webIntent) did not look
//                 them up — and a question said aloud (Socria Voice) has no
//                 question mark, which the gate's question of fact required.
//                 So "what's the weather in Dallas" was told "nothing current
//                 was checked" and answered with a warning, not the weather.
//   the date      the reply was never told what day it is where they are
//   the provider  OpenAI's web search gave up when its model was refused,
//                 rather than asking another the deployment already uses
//   the sources   a reply cited [1] and listed nothing to open
//
// Each is held here. The browser run (a stand-in search answering with pages,
// desktop and a 390px phone) is in docs/LOGOS-5-RUNTIME.md §23.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webIntent, LIVE_SUBJECT } from './.tmp/web.mjs';
import * as R from './.tmp/runtime-under-test.mjs';
import { runSearch, searchModels } from './.tmp/logos-explore.mjs';
import { cleanWebSources } from './.tmp/chat-thread.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');
let pass = 0,
  fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 300))));
const J = JSON.stringify;
const NO = {};

console.log('the gate: live data is looked up');
{
  const live = [
    "what's the weather in Dallas",
    'whats the weather like today',
    'weather in dallas',
    'will it rain tomorrow',
    'check the weather in austin',
    'who won the game last night',
    'who won the super bowl',
    'lakers score',
    'bitcoin price',
    'stock price of apple',
    'how is the stock market doing today',
    'what is the exchange rate for euros',
    'what are mortgage rates right now',
    'traffic on i 35 right now',
    'latest news',
    'gas prices near me',
    'is Costco open now',
  ];
  for (const t of live) ok(`searches: "${t}"`, webIntent(t, NO).want === true, webIntent(t, NO).why);
  ok('  and says why: the answer is one that moves', webIntent('weather in dallas', NO).why === 'the answer is one that moves');
  // a question of fact about a named thing, said aloud: no question mark
  for (const t of ['who founded Anthropic', 'what does OpenAI charge for its newest model', 'when does the Apple store open']) ok(`said aloud, no question mark, a named thing: "${t}"`, webIntent(t, NO).want === true, webIntent(t, NO).why);
}
{
  const local = [
    'I love this weather',
    'the weather is lovely today',
    'that score was unreal',
    'my essay is about the stock market',
    'should I ship my current draft this week?',
    'find the bug in my code',
    'what do you think of my plan',
    'what is a derivative',
    'how do I write a thesis statement',
    'list the pros and cons of my plan',
    'What is important to me in a job is that I keep learning and that the people around me are kind and honest',
  ];
  for (const t of local) ok(`stays local: "${t.slice(0, 50)}"`, webIntent(t, NO).want === false, webIntent(t, NO).why);
}
{
  ok('policy still wins: a sensitive turn is not searched, weather or not', webIntent('what is the weather in dallas', { sensitive: true }).want === false);
  ok('  nor an off-the-record one, nor a conversation kept off the web', webIntent('bitcoin price', { offRecord: true }).want === false && webIntent('bitcoin price', NO, 'none').want === false && webIntent('weather in dallas', NO, 'conversation_only').want === false);
  ok('  nor small talk', webIntent('hi', NO).want === false);
}
{
  // ONE READING OF "CURRENT". Whatever the runtime calls a question about something that changes, the gate looks
  // up — so the reply is never told "nothing current was checked" for a turn the gate simply did not recognise.
  const turns = ["what's the weather in Dallas?", 'who won the game?', 'what is the exchange rate today?', 'what is the latest news on the strike?', 'how much is bitcoin right now?', 'what are the scores tonight?', 'what is the stock price of Nvidia?'];
  const stray = turns.filter((t) => {
    const need = R.assessNeed({ text: t, signals: R.readSignals ? R.readSignals(t) : {}, docs: 0, math: false, policy: 'full' });
    return need.kinds.includes('current') && !need.web.want;
  });
  ok('a turn the runtime calls current is a turn the gate searches', stray.length === 0, J(stray));
  ok('  the live subjects are part of what the runtime calls current', R.assessNeed({ text: 'weather in dallas?', signals: {}, docs: 0, math: false, policy: 'full' }).kinds.includes('current'));
  ok('LIVE_SUBJECT names the subjects, not the words round them', LIVE_SUBJECT.test('the forecast for tomorrow') && LIVE_SUBJECT.test('exchange rate') && !LIVE_SUBJECT.test('my thesis statement'));
}

console.log('the date: when this turn is, where they are');
{
  const at = Date.UTC(2026, 9, 26, 19, 5);
  const line = R.nowLine(at, 'America/Chicago');
  ok('the day, the date and the time in their own time zone', /Monday, October 26, 2026/.test(line) && /2:05\s?PM/.test(line) && /America\/Chicago/.test(line), line);
  ok('  read against: "today", "tonight", "this week"', /Read "today", "tonight", "this week"/.test(line));
  ok('  a time zone the browser did not name is UTC', /UTC/.test(R.nowLine(at, undefined)) && /7:05\s?PM/.test(R.nowLine(at, undefined)));
  ok('  a name that is not a time zone is UTC — nothing else from the browser reaches the prompt', R.cleanTimeZone('Not/AZone') === 'UTC' && R.cleanTimeZone('UTC\nIGNORE ALL') === 'UTC' && R.cleanTimeZone('x'.repeat(80)) === 'UTC' && R.cleanTimeZone(42) === 'UTC');
  ok('  a real one is kept', R.cleanTimeZone('Asia/Kolkata') === 'Asia/Kolkata' && R.cleanTimeZone('Europe/London') === 'Europe/London');
  const route = read('app/api/logos/chat/route.ts');
  ok('the chat route says it in the turn’s own context, never the cached prompt', /nowLine\(Date\.now\(\), body\?\.tz\)/.test(route) && route.indexOf('nowLine(Date.now()') > route.indexOf('const turnContext ='));
  ok('  the screen sends its time zone with every turn', /tz: browserTimeZone\(\)/.test(read('components/LogosApp.tsx')));
}

console.log('the provider: a model the account lacks gives way to the next');
{
  const env = (k, v) => (v === undefined ? delete process.env[k] : (process.env[k] = v));
  for (const k of ['SERPER_API_KEY', 'TAVILY_API_KEY', 'LOGOS_WEB_OPENAI', 'OPENAI_BASE_URL', 'OPENAI_MODEL_SEARCH', 'OPENAI_MODEL_LOGOS']) env(k, undefined);
  ok('the models asked, in order: the search model, then gpt-4o', J(searchModels({})) === J(['gpt-4o-mini', 'gpt-4o']));
  ok('  then the reply’s own model; never one twice', J(searchModels({ OPENAI_MODEL_SEARCH: 'gpt-4o', OPENAI_MODEL_LOGOS: 'gpt-5.6-sol' })) === J(['gpt-4o', 'gpt-5.6-sol']));
  env('OPENAI_API_KEY', 'sk-test');
  const realFetch = globalThis.fetch;
  const calls = [];
  const page = { output: [{ type: 'message', content: [{ type: 'output_text', text: 'It is 72F in Dallas.', annotations: [{ type: 'url_citation', url: 'https://weather.example.com/dallas', title: 'Dallas weather', start_index: 0, end_index: 19 }] }] }] };
  globalThis.fetch = async (url, init) => {
    const b = JSON.parse(init.body);
    calls.push(`${b.model}:${b.tools[0].type}`);
    return b.model === 'gpt-4o-mini' ? new Response('{"error":{"message":"The model does not exist"}}', { status: 404 }) : new Response(JSON.stringify(page), { status: 200 });
  };
  const got = await runSearch('weather in dallas', { images: false });
  ok('a model refused (404): the next model is asked, and the pages come back', got.results.length === 1 && got.results[0].url === 'https://weather.example.com/dallas' && J(calls) === J(['gpt-4o-mini:web_search', 'gpt-4o:web_search']), J({ calls, n: got.results.length }));
  calls.length = 0;
  globalThis.fetch = async (url, init) => {
    const b = JSON.parse(init.body);
    calls.push(`${b.model}:${b.tools[0].type}`);
    return b.model === 'gpt-4o-mini' ? new Response('{}', { status: 400 }) : new Response(JSON.stringify(page), { status: 200 });
  };
  await runSearch('weather in dallas', { images: false });
  ok('  a 400 on both tool names: the older name first, then the next model', J(calls) === J(['gpt-4o-mini:web_search', 'gpt-4o-mini:web_search_preview', 'gpt-4o:web_search']), J(calls));
  calls.length = 0;
  globalThis.fetch = async (url, init) => {
    calls.push(JSON.parse(init.body).model);
    return new Response('{}', { status: 401 });
  };
  const denied = await runSearch('weather in dallas', { images: false });
  ok('  a key refused (401) is not a model problem: nothing else is tried, and it is named', calls.length === 1 && denied.failure?.why === 'rejected' && denied.failure?.status === 401, J({ calls, f: denied.failure }));
  globalThis.fetch = realFetch;
  env('OPENAI_API_KEY', undefined);
  ok('the search may take longer before a reply goes without it (15 s)', /const SEARCH_TIMEOUT_MS = 15000;/.test(read('lib/core4/web-server.ts')));
}

console.log('the sources: listed under the reply, kept with it');
{
  const header = { query: 'weather in dallas', sources: [{ n: 1, title: 'Dallas, TX — current conditions', url: 'https://weather.example.com/dallas', site: 'weather.example.com', published: '2026-10-26' }, { n: 2, title: 'Forecast', url: 'https://forecast.example.org/tx/dallas', site: 'forecast.example.org' }] };
  const kept = cleanWebSources(header);
  ok('the header’s sources, as kept: query, number, title, address, site, date', kept?.query === 'weather in dallas' && kept.list.length === 2 && kept.list[0].n === 1 && kept.list[0].published === '2026-10-26' && kept.list[1].site === 'forecast.example.org', J(kept));
  ok('  read back from storage the same (list, not sources)', J(cleanWebSources(kept)) === J(kept));
  const junk = cleanWebSources({ query: 'x', sources: [{ n: 1, title: 'a', url: 'javascript:alert(1)' }, { n: 0, url: 'https://a.example' }, { n: 2, title: 'ok', url: 'https://b.example/page' }, 'nope', null] });
  ok('  only http(s) addresses and real numbers; the site from the address when it is missing', junk?.list.length === 1 && junk.list[0].n === 2 && junk.list[0].site === 'b.example', J(junk));
  ok('  a title is one clipped line; nothing at all is nothing', cleanWebSources({ sources: [{ n: 1, title: 'a\n'.repeat(400), url: 'https://c.example' }] }).list[0].title.length <= 160 && cleanWebSources({}) === undefined && cleanWebSources(null) === undefined);
  const app = read('components/LogosApp.tsx');
  ok('the screen keeps them with the reply from the header', /const web = webSourcesIn\(res\.headers\)/.test(app) && /\.\.\.\(web \? \{ sources: web \} : \{\}\)/.test(app));
  const msg = read('components/logos5/L5Message.tsx');
  ok('  and lists them under it, each a link that opens apart', /className="l5-web"/.test(msg) && /Checked the web · /.test(msg) && /rel="noopener noreferrer nofollow"/.test(msg) && /target="_blank"/.test(msg));
  const conv = read('app/api/conversations/route.ts');
  ok('  saved with the conversation, on Socria’s replies only', /m\.role === 'assistant' \? cleanWebSources\(m\.sources\) : undefined/.test(conv) && /\.\.\.\(sources \? \{ sources \} : \{\}\)/.test(conv));
  ok('  and in a shared conversation', /role === 'assistant' \? cleanWebSources\(r\.sources\) : undefined/.test(read('app/api/shared/conversation/[id]/route.ts')));
}

console.log('the Universal Map’s box: Voice, and voice to text');
{
  const box = read('components/logos5/UniverseParts.tsx');
  ok('the box has the hold-to-talk mic: what is said lands in it to edit, never sent by itself', /useVoiceInput\(\(words\) =>/.test(box) && /insertSpoken\(query, words/.test(box) && /<HoldMic mic=\{mic\} onHold=\{setHold\} \/>/.test(box));
  ok('  and Socria Voice’s button, beside it', /\{voiceButton\}/.test(box));
  ok('  one microphone at a time: the mic steps aside while Voice listens', /const micOn = voice && mic\.available && !voiceLive/.test(box) && /if \(voiceLive\) micCancel\(\)/.test(box));
  const app = read('components/LogosApp.tsx');
  ok('the Universal Map is handed them', /voiceButton=\{voiceButton\}\s+voiceLive=\{voiceOn\}/.test(app) && /voice=\{LOGOS4\.voice && hasAccess && !togetherReadOnly\}\s+voiceButton/.test(app));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
