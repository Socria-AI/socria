// Live internet for Logos 5: OpenAI's web search as the provider of last
// resort (so a deployment with no Serper or Tavily key still reads the web),
// a bare "look it up" searching what they had just asked, and a question of
// fact about a named person, company or product searching too.

import { runSearch, searchConfigured } from './.tmp/logos-explore.mjs';
import { webIntent } from './.tmp/web.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const realFetch = globalThis.fetch;
const env = (k, v) => (v === undefined ? delete process.env[k] : (process.env[k] = v));
for (const k of ['SERPER_API_KEY', 'TAVILY_API_KEY', 'LOGOS_WEB_OPENAI', 'OPENAI_BASE_URL', 'OPENAI_MODEL_SEARCH']) env(k, undefined);

console.log('\n=== OpenAI web search, where no search key is set ===');
{
  env('OPENAI_API_KEY', 'sk-test');
  ok('an OpenAI key alone is enough to search', searchConfigured());
  env('LOGOS_WEB_OPENAI', 'off');
  ok('  …unless LOGOS_WEB_OPENAI=off', !searchConfigured());
  env('LOGOS_WEB_OPENAI', undefined);
  env('OPENAI_API_KEY', undefined);
  ok('  …and nothing without a key', !searchConfigured());

  env('OPENAI_API_KEY', 'sk-test');
  const calls = [];
  const text = 'Socria was founded in 2025 by a small team. Its new product is Logos 5.';
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body), auth: init.headers.Authorization });
    return new Response(JSON.stringify({ output: [
      { type: 'web_search_call', status: 'completed' },
      { type: 'message', content: [{ type: 'output_text', text, annotations: [
        { type: 'url_citation', url: 'https://socria.app/charter?utm_source=openai', title: 'The Socria Charter', start_index: 0, end_index: 44 },
        { type: 'url_citation', url: 'https://example.com/socria', title: 'Socria launches Logos 5', start_index: 45, end_index: 72 },
        { type: 'url_citation', url: 'https://socria.app/charter?utm_source=openai', title: 'dup', start_index: 0, end_index: 10 },
      ] }] },
    ] }), { status: 200 });
  };
  const b = await runSearch('Socria founder', { images: false });
  ok('it asks the Responses API with the web search tool, the stripped query and the key', calls.length === 1 && calls[0].url === 'https://api.openai.com/v1/responses' && calls[0].body.tools[0].type === 'web_search' && /Socria founder/.test(calls[0].body.input) && calls[0].auth === 'Bearer sk-test', JSON.stringify(calls[0]));
  ok('  the pages it cited come back as results, once each, without the tracking suffix', b.provider === 'openai' && b.results.length === 2 && b.results[0].url === 'https://socria.app/charter' && b.results[0].site === 'socria.app' && b.results[1].title === 'Socria launches Logos 5', JSON.stringify(b.results));
  ok('  each with the sentence that cited it as its snippet', /founded in 2025/.test(b.results[0].snippet) && /Logos 5/.test(b.results[1].snippet), JSON.stringify(b.results.map((r) => r.snippet)));

  calls.length = 0;
  let n = 0;
  globalThis.fetch = async (url, init) => {
    calls.push(JSON.parse(init.body).tools[0].type);
    return ++n === 1 ? new Response('{}', { status: 400 }) : new Response(JSON.stringify({ output: [] }), { status: 200 });
  };
  const old = await runSearch('anything', { images: false });
  ok('an account without the new tool name is asked with the older one', JSON.stringify(calls) === '["web_search","web_search_preview"]');
  ok('  and an empty answer is a named nothing, not a throw', old.results.length === 0 && old.failure?.provider === 'openai', JSON.stringify(old));

  globalThis.fetch = async () => { throw new Error('offline'); };
  const down = await runSearch('anything', { images: false });
  ok('a network that is down costs the turn its sources and nothing else', down.results.length === 0 && down.failure?.why === 'unreachable', JSON.stringify(down));

  env('SERPER_API_KEY', 'serper-key');
  calls.length = 0;
  globalThis.fetch = async (url) => { calls.push(String(url)); return new Response(JSON.stringify({ organic: [] }), { status: 200 }); };
  await runSearch('anything', { images: false });
  ok('a Serper key still comes first', calls.length >= 1 && calls.every((u) => u.includes('serper')), JSON.stringify(calls));
  env('SERPER_API_KEY', undefined);
  globalThis.fetch = realFetch;
}

console.log('\n=== when it looks things up ===');
{
  const yes = (t) => webIntent(t, {}, 'full').want === true;
  for (const t of ['look it up', 'Can you look that up?', 'search the web for it', 'google it', 'check online'])
    ok(`asked for: "${t}"`, yes(t), JSON.stringify(webIntent(t, {}, 'full')));
  for (const t of ['Who founded Socria?', 'Who is the CEO of Anthropic?', 'When did Apple release the Vision Pro?', 'What does Notion cost per month?', 'Where is Stripe headquartered?', 'How many employees does Duolingo have?'])
    ok(`a fact about a named thing: "${t}"`, yes(t), JSON.stringify(webIntent(t, {}, 'full')));
  for (const t of ['What is a derivative?', 'How do I make my essay shorter?', 'Should I take the job?', 'hi, how are you?', 'What should I name my dog?', 'Is my plan any good?'])
    ok(`nothing to look up: "${t}"`, !yes(t), JSON.stringify(webIntent(t, {}, 'full')));
  ok('never on a sensitive turn', !webIntent('Who founded Socria?', { sensitive: true }, 'full').want);
  ok('never off the record', !webIntent('Who founded Socria?', {}, 'none').want);
}

console.log(`web-live: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
