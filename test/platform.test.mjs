// SocriaUX 2.0 — the creative platform: designs combined across artboards ("the typography of the first with the
// composition of the second", "combine the best elements"), alternatives on artboards of their own ("try something
// completely different", "keep the visual language but change the composition"), artboards with a visual language of
// their own, identities generated from words ("a premium architectural studio identity"), vague improvements read
// against the design in front ("make it more interesting"), precise edits by degree ("slightly smaller"), comments
// pinned on objects. No model, no network: everything here is the engine's own.

import * as P from './.tmp/platform-under-test.mjs';

let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, String(x).slice(0, 900))));
const J = JSON.stringify;

const BRIEF = { purpose: 'A poster for an architecture studio open house', kind: 'poster', formats: ['a4'], content: { headline: 'Open Studio', subhead: 'Drawings, models and conversations', details: ['14 March 2027', 'Kanso Architects, Leeds'], brand: 'Kanso' }, mood: ['minimal'], images: [] };
const calmDir = P.languageDirection('Open Studio', ['minimal', 'calm'], 'one');
const loudDir = P.languageDirection('Open Studio', ['bold', 'expressive', 'playful'], 'two-x');
const calm = () => P.composeGraphic(BRIEF, calmDir, { seed: 3 }).doc;
const loud = () => P.composeGraphic(BRIEF, loudDir, { seed: 17 }).doc;
/** Two designs in one document, the second made in another direction (a visual language of its own). */
const pair = () => {
  const a = calm();
  const b = loud();
  return P.normalizeDoc({ ...a, artboards: [{ ...a.artboards[0], name: 'Calm' }, { ...b.artboards[0], id: 'ab_second', name: 'Loud', tokens: b.tokens, direction: { name: loudDir.name, language: loudDir.language }, children: b.artboards[0].children.map((n) => ({ ...n, id: `x${n.id}` })) }] });
};
const texts = (board) => P.walk(board).filter((l) => l.node.type === 'text' && !l.node.decorative).map((l) => l.node.text).sort().join('|');
const sim = (a, b) => P.similarity(P.signatureOfBoard(a), P.signatureOfBoard(b));
const high = (doc, board) => P.checkDoc({ ...doc, artboards: [board], tokens: P.boardTokens(doc, board) }).filter((f) => f.severity === 'high');

// ── 1. artboards with a visual language of their own ──
{
  const doc = pair();
  ok('an artboard keeps tokens of its own through normalisation', !!doc.artboards[1].tokens && doc.artboards[1].tokens.fonts.display === loud().tokens.fonts.display && !doc.artboards[0].tokens, J(doc.artboards.map((b) => !!b.tokens)));
  ok('  and the direction it came from', doc.artboards[1].direction?.name === loudDir.name);
  const d1 = P.readDecisions(doc, doc.artboards[1].id);
  const d0 = P.readDecisions(doc, doc.artboards[0].id);
  ok('decisions are read in each artboard’s own colours', d1.palette.accent === doc.artboards[1].tokens.colors.accent && d0.palette.accent === doc.tokens.colors.accent, J([d0.palette, d1.palette]));
  const view = P.boardView(doc, 'ab_second');
  ok('the view of an artboard puts its tokens in the document’s place, the others holding theirs', view.tokens === doc.artboards[1].tokens && J(view.artboards[0].tokens) === J(doc.tokens));
  const back = P.fromBoardView(doc, view, 'ab_second');
  ok('  and goes back exactly', J(back) === J(doc));
  // an edit on the second artboard changes its own colours only
  const r = P.applyOps(view, [{ op: 'tokens', set: { colors: { accent: '#123456' } } }]);
  const after = P.fromBoardView(doc, r.doc, 'ab_second');
  ok('a change of colour on an artboard of its own stays on it', after.artboards[1].tokens.colors.accent === '#123456' && after.tokens.colors.accent === doc.tokens.colors.accent && !after.artboards[0].tokens, J([after.tokens.colors.accent, after.artboards[1].tokens.colors.accent]));
  const svg = P.renderArtboard(doc, doc.artboards[1]);
  ok('an artboard of its own renders', svg.startsWith('<svg') && svg.length > 500);
}

// ── 9. comments pinned on objects ──
{
  const doc = calm();
  const b = doc.artboards[0];
  const h = P.mainWords(b);
  const list = P.normalizeComments([{ id: 'cm1', board: b.id, nodes: [h.id, 'nope'], text: ' Make this feel lighter ', at: 5, status: 'open' }, { board: 'gone', nodes: [], text: 'x' }, { board: b.id, nodes: [], text: '' }], doc);
  ok('a comment keeps only the objects that exist, on an artboard that exists, with words', list.length === 1 && J(list[0].nodes) === J([h.id]) && list[0].text === 'Make this feel lighter' && list[0].status === 'open', J(list));
  const r = P.applyOps(doc, [{ op: 'comments', comments: list }]);
  ok('comments are kept with the design through its operation, and back through normalisation', r.ok && r.doc.comments?.length === 1 && P.normalizeDoc(r.doc).comments?.length === 1);
  const many = P.normalizeComments(Array.from({ length: 90 }, (_, i) => ({ board: b.id, nodes: [h.id], text: `c${i}` })), doc);
  ok('comments are bounded', many.length <= 60);
}

// ── 13. research: through the workspace's provider, said as it is, never invented ──
{
  const ask = P.researchAskOf('Find me some interesting references for an experimental architecture website');
  ok('“find me some interesting references for an experimental architecture website” is a search for websites', ask && /experimental architecture website/.test(ask.query) && ask.kind === 'websites', J(ask));
  ok('“show me pictures of brutalist concrete textures” is a search for pictures', P.researchAskOf('show me pictures of brutalist concrete textures')?.kind === 'images');
  for (const w of ['make the headline bigger', 'Make this cloud themed.', 'take the typography from the first']) ok(`“${w}” is not a search`, P.researchAskOf(w) === null);
  ok('only web addresses of public names are kept', P.webAddress('https://example.com/a') && !P.webAddress('javascript:alert(1)') && !P.webAddress('http://localhost:3000') && !P.webAddress('http://10.0.0.2/x') && !P.webAddress('http://intranet.local/') && !P.webAddress('ftp://example.com') && !P.webAddress('https://user:pw@example.com'));
  const clean = P.cleanResult({ title: '<b>Studio</b> &amp; Co', url: 'https://www.studio.example/work', snippet: '<script>x</script>Work', thumb: 'javascript:bad' }, 'Brave Search', 'website', 0);
  ok('a result is held to its shape: markup removed, a bad preview dropped, its site named', clean && clean.title === 'Studio & Co' && !clean.thumb && clean.host === 'studio.example' && !/script/.test(clean.snippet ?? ''), J(clean));
  const none = await P.research({ query: 'experimental architecture website', kind: 'websites' }, { env: {} });
  ok('with no provider configured it says so plainly, and nothing is passed off as found', none.status === 'not-configured' && none.results.length === 0 && /needs a search provider/.test(none.message) && none.provider === null, J(none));
  const calls = [];
  const fake = (body, status = 200) => async (url, init) => (calls.push({ url: String(url), init }), new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
  const brave = await P.research({ query: 'experimental architecture website', kind: 'websites' }, { env: { BRAVE_SEARCH_API_KEY: 'k' }, fetcher: fake({ web: { results: [{ title: 'Studio One', url: 'https://one.example/', description: 'Spatial work', thumbnail: { src: 'https://imgs.search.brave.com/one.jpg' } }, { title: 'Bad', url: 'javascript:x' }, { title: 'Dup', url: 'https://one.example/' }, { title: 'Two', url: 'https://two.example/p' }] } }) });
  ok('Brave: its API is called with the key in its header and safe search on', calls[0].url.startsWith('https://api.search.brave.com/res/v1/web/search?') && /safesearch=strict/.test(calls[0].url) && calls[0].init.headers['X-Subscription-Token'] === 'k');
  ok('  and what it returned is kept with its source, bad and repeated addresses dropped', brave.status === 'ok' && brave.results.length === 2 && brave.results[0].host === 'one.example' && brave.results.every((r) => r.provider === 'Brave Search') && /2 pages found by Brave Search/.test(brave.message), J(brave));
  calls.length = 0;
  const g = await P.research({ query: 'brutalist concrete', kind: 'images' }, { env: { GOOGLE_CSE_KEY: 'k', GOOGLE_CSE_CX: 'cx' }, fetcher: fake({ items: [{ title: 'Concrete', link: 'https://img.example/c.jpg', image: { contextLink: 'https://page.example/c', thumbnailLink: 'https://encrypted-tbn0.gstatic.com/t.jpg', width: 800, height: 600 } }] }) });
  ok('Google Programmable Search: images, each with the page it is on', /searchType=image/.test(calls[0].url) && g.status === 'ok' && g.results[0].url === 'https://page.example/c' && g.results[0].thumb && g.results[0].kind === 'image', J(g));
  calls.length = 0;
  const se = await P.research({ query: 'gallery website', kind: 'websites' }, { env: { SOCRIAUX_RESEARCH_PROVIDER: 'serper', SERPER_API_KEY: 'k', BRAVE_SEARCH_API_KEY: 'b' }, fetcher: fake({ organic: [{ title: 'Gallery', link: 'https://gallery.example', snippet: 'Rooms' }] }) });
  ok('the provider the workspace names is the one used (Serper here, though Brave has a key too)', calls[0].url === 'https://google.serper.dev/search' && calls[0].init.headers['X-API-KEY'] === 'k' && se.provider === 'Serper', J(calls[0]));
  const refused = await P.research({ query: 'x design', kind: 'websites' }, { env: { BRAVE_SEARCH_API_KEY: 'k' }, fetcher: fake({ error: 'no' }, 401) });
  ok('a refused key is said as it is; nothing shown', refused.status === 'unavailable' && /key was refused/.test(refused.message) && !refused.results.length, J(refused));
  const slow = await P.research({ query: 'x design', kind: 'websites' }, { env: { BRAVE_SEARCH_API_KEY: 'k' }, timeoutMs: 20, fetcher: (u, init) => new Promise((res, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })))) });
  ok('a provider that takes too long is let go and said', slow.status === 'unavailable' && /too long/.test(slow.message), J(slow));
  const empty = await P.research({ query: 'x design', kind: 'websites' }, { env: { BRAVE_SEARCH_API_KEY: 'k' }, fetcher: fake({ web: { results: [] } }) });
  ok('nothing found is said, not padded', empty.status === 'empty' && !empty.results.length);
  // the conversation: the ask becomes a search for the caller to run, and what it found is kept with its sources
  const st = P.emptyStudio('website', 'A website for Kanso, an architecture studio in Leeds');
  const turn = P.respond(st, 'Find me some interesting references for an experimental architecture website', {});
  ok('in the conversation, the ask is heard as research and becomes a search (no project is started for it)', turn.search && /experimental architecture website/.test(turn.search.query) && turn.move.kind !== 'create', J({ search: turn.search, move: turn.move.kind }));
  const kept = P.said(turn.st, { from: 'socria', kind: 'research', text: 'found', found: { query: 'q', provider: 'Brave Search', results: [{ id: 'a', kind: 'website', title: 'One', url: 'https://one.example/', host: 'one.example', provider: 'Brave Search' }, { id: 'b', kind: 'website', title: 'Bad', url: 'javascript:x', host: 'x', provider: 'Brave Search' }] } });
  const back = P.normalizeStudio(JSON.parse(JSON.stringify(kept)));
  const msg = back.transcript.find((m) => m.kind === 'research');
  ok('what a search found is kept with the conversation, held to its shape when read back', msg && msg.found.results.length === 1 && msg.found.results[0].url === 'https://one.example/', J(msg));
}

// ── 14. understanding at generation ──
{
  const themed = P.briefRealisation(P.emptyStudio('graphic', 'A cloud-themed poster for our bakery’s opening day'));
  ok('a world named for the look in the brief (“cloud-themed”) is carried into the first design as a theme', themed && themed.changes.some((c) => c.decision === 'theme' && c.theme === 'cloud') && themed.keep.includes('words'), J(themed));
  ok('a world inside a name is not a theme (“Cloud Nine Bakery”)', P.briefRealisation(P.emptyStudio('graphic', 'A poster for “Cloud Nine Bakery”, opening Saturday')) === null);
  ok('a brief that names no world brings no theme', P.briefRealisation(P.emptyStudio('graphic', 'A poster for our summer sale, bold and loud')) === null);
}

console.log(`platform: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
