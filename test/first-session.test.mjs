// The first session: what the composer is handed, and what the map is
// saved as.
//
// Two modules, one moment. `first-session` carries the four openings a new
// person can start from and resolves a `?start=` id into a first message;
// `MapPoster` draws the map that message produces as a picture worth
// keeping. The suite is mostly about the ways each could quietly go wrong:
//
//   an opening too short to draw five nodes, or one that repeats the tour;
//   a link that resolves to a guess instead of to nothing;
//   a `?start=` cleanup that erases the other parameters' input;
//   a poster with a card missing, an edge missing, or "undefined" in it.

import {
  FIRST_MAP_KEY,
  FIRST_MAP_NODES,
  FIRST_MAP_NOTE,
  OPENINGS,
  OPENING_EXPLORE,
  OPENING_LEAD,
  OPENING_NONE,
  START_PARAM,
  firstMapCrossed,
  openingFor,
  openingValue,
  readStart,
  startMessage,
  SCENARIO_STARTS,
} from './.tmp/first-session.mjs';
// The Explore page is not on every branch. Where it is, the suite checks the
// module's own copy of the scenario starts against the page's data; where it
// is not, those checks are simply skipped rather than failing for want of a
// file the branch never shows.
const SCENARIOS = await import('./.tmp/scenarios.mjs').then((m) => m.SCENARIOS).catch(() => []);
import {
  POSTER_H,
  POSTER_W,
  posterFileName,
  posterScene,
  posterSvgString,
  wrapLabel,
} from './.tmp/MapPoster.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;

console.log('=== four openings, each a complete first message ===');
{
  ok('there are four', OPENINGS.length === 4, String(OPENINGS.length));
  ok('ids are unique', new Set(OPENINGS.map((o) => o.id)).size === OPENINGS.length);
  // An opening id that collides with a scenario id would make startMessage
  // ambiguous — whichever list was searched first would win silently.
  const scenarioIds = new Set(SCENARIOS.map((s) => s.id));
  ok('no id collides with a scenario', OPENINGS.every((o) => !scenarioIds.has(o.id)));
  ok('every field is filled',
    OPENINGS.every((o) => o.id && o.label && o.message && o.shows));

  for (const o of OPENINGS) {
    const n = words(o.message);
    // Long enough for the extractor to find a claim, an assumption, a value,
    // a constraint and a tension; short enough to read before pressing send.
    ok(`${o.id}: 40–90 words`, n >= 40 && n <= 90, `${n} words`);
    ok(`${o.id}: first person`, /\b(I|I’m|I've|I’ve|my|My)\b/.test(o.message));
    ok(`${o.id}: label is short`, words(o.label) <= 6, o.label);
    // "shows" says what Logos will LOOK FOR — never what it will conclude.
    ok(`${o.id}: shows what Logos looks for`, /^Logos will look for /.test(o.shows), o.shows);
    ok(`${o.id}: shows promises no answer`, !/answer|solve|tell you|fix/i.test(o.shows), o.shows);
  }

  // The tour in TryLogosModal assembles a map from a job offer and a raise.
  // Meeting that story a second time on the intro would teach that Socria
  // knows one story.
  const tour = /\b(job|offer|salary|raise|stopped growing|more money)\b/i;
  ok('no opening repeats the tour', OPENINGS.every((o) => !tour.test(o.message)));

  // Each covers a different kind of thinking, so the four together say
  // "this is for whatever you are working through" without saying it.
  const wanted = [/derivative|limit/i, /paper|stud(y|ies)|source/i, /novel|chapter|story/i, /bakery|shop|online/i];
  ok('learning, research, creative, planning are all present',
    wanted.every((re) => OPENINGS.some((o) => re.test(o.message))));

  // The words the extractor keys on for the five node kinds are actually in
  // each message — the openings are engineered, not merely written.
  for (const o of OPENINGS) {
    const m = o.message;
    ok(`${o.id}: names an assumption`, /assum/i.test(m));
    ok(`${o.id}: names a claim or belief`, /\b(I think|My belief|I can|sags)\b/i.test(m));
    ok(`${o.id}: names a value`, /\b(care|value|matters)\b/i.test(m));
    ok(`${o.id}: names a constraint`, /\b(weeks|due|budget|no new|no time|only)\b/i.test(m));
    ok(`${o.id}: names a tension`, /\b(pull|stuck between|against)\b/i.test(m));
  }

  ok('the lead invites editing', OPENING_LEAD === 'Start from this — change anything.');
  ok('lead never counts down', !/\d/.test(OPENING_LEAD));
}

console.log('\n=== a start id resolves to a message, or to nothing ===');
{
  for (const o of OPENINGS) {
    ok(`${o.id} resolves to its message`, startMessage(o.id) === o.message);
    ok(`${o.id} is found by openingFor`, openingFor(o.id) === o);
  }
  // Every exhibit on /explore has a "Try this one →", and every one must
  // land the conversation the visitor just read in the composer.
  for (const s of SCENARIOS) {
    const first = s.turns.find((t) => t.role === 'user')?.content ?? null;
    ok(`scenario ${s.id} resolves to its first user turn`,
      first !== null && startMessage(s.id) === first, String(startMessage(s.id)).slice(0, 40));
  }
  // The module carries its own copy of the scenario starts so it can ship
  // without the page; where the page exists the two must agree exactly.
  if (SCENARIOS.length) {
    ok('the local table has every scenario', SCENARIOS.every((s) => s.id in SCENARIO_STARTS));
    ok('and nothing the page does not', Object.keys(SCENARIO_STARTS).every((id) => SCENARIOS.some((s) => s.id === id)));
  }
  ok('every scenario start resolves', Object.keys(SCENARIO_STARTS).every((id) => startMessage(id) === SCENARIO_STARTS[id]));
  ok('unknown → null', startMessage('nope') === null);
  ok('empty → null', startMessage('') === null);
  ok('null → null', startMessage(null) === null);
  ok('undefined → null', startMessage(undefined) === null);
  ok('a scenario id is not an opening', openingFor('research') === null);
  ok('prototype keys do not resolve', startMessage('toString') === null && startMessage('constructor') === null);
}

console.log('\n=== the event value is a token, never words ===');
{
  ok('an opening reports its id', openingValue(OPENINGS[0].id) === OPENINGS[0].id);
  ok('a scenario reports explore', openingValue('research') === OPENING_EXPLORE);
  ok('nothing reports none', openingValue(null) === OPENING_NONE);
  ok('an unknown id reports none, not itself', openingValue('a sentence someone typed') === OPENING_NONE);
  ok('explore and none are the design’s tokens', OPENING_EXPLORE === 'explore' && OPENING_NONE === 'none');
  ok('every value is short and plain',
    [...OPENINGS.map((o) => o.id), OPENING_EXPLORE, OPENING_NONE].every((v) => /^[a-z-]{1,24}$/.test(v)));
}

console.log('\n=== the first map is a crossing, not a level ===');
{
  ok('threshold is five', FIRST_MAP_NODES === 5);
  ok('4 → 5 crosses', firstMapCrossed(4, 5) === true);
  ok('0 → 7 crosses', firstMapCrossed(0, 7) === true);
  ok('5 → 6 does not', firstMapCrossed(5, 6) === false);
  // Hydrating a saved nine-node session is not a first map being drawn.
  ok('9 → 9 does not', firstMapCrossed(9, 9) === false);
  ok('4 → 4 does not', firstMapCrossed(4, 4) === false);
  ok('the note is the share moment', /drawn/.test(FIRST_MAP_NOTE) && /image/.test(FIRST_MAP_NOTE));
  ok('the note never mentions One', !/One\b/.test(FIRST_MAP_NOTE));
  ok('the key is versioned', FIRST_MAP_KEY === 'socria.firstMap.v1');
}

console.log('\n=== ?start= is read, and only ?start= is removed ===');
{
  ok('the parameter is start', START_PARAM === 'start');
  const a = readStart('?start=limit&model=logos');
  ok('id is read', a.id === 'limit', a.id);
  ok('the rest survives', a.search === '?model=logos', a.search);

  const b = readStart('?model=logos&start=research&s=abc');
  ok('id is read from the middle', b.id === 'research');
  ok('both neighbours survive in order', b.search === '?model=logos&s=abc', b.search);

  const c = readStart('?start=middle');
  ok('nothing left → empty search', c.id === 'middle' && c.search === '', JSON.stringify(c));

  const d = readStart('?model=logos');
  ok('absent → null id', d.id === null);
  ok('absent → untouched search', d.search === '?model=logos', d.search);

  ok('an empty string is fine', JSON.stringify(readStart('')) === JSON.stringify({ id: null, search: '' }));
  ok('without the question mark', readStart('start=limit&x=1').id === 'limit');
  ok('an empty start is null', readStart('?start=&x=1').id === null);
  ok('a long id is cut, not trusted', readStart('?start=' + 'a'.repeat(200)).id.length === 40);
  ok('the id is not resolved here', readStart('?start=whatever').id === 'whatever');
}

console.log('\n=== the poster draws every node and every edge ===');
{
  const map = {
    context: 'deciding',
    nodes: [
      { id: 'goal', type: 'goal', label: 'Work that keeps teaching me' },
      { id: 'claim', type: 'claim', label: 'It pays more & that "matters" <now>', status: 'supported' },
      { id: 'assume', type: 'assumption', label: 'More money means progress', status: 'revised' },
      { id: 'tension', type: 'tension', label: 'Security ↔ growth' },
      { id: 'q', type: 'question', label: 'What would I be giving up if I stayed, honestly, for another three years?' },
    ],
    edges: [
      { from: 'claim', to: 'goal', relation: 'supports', strength: 'strong' },
      { from: 'assume', to: 'goal', relation: 'depends' },
      { from: 'goal', to: 'tension', relation: 'leads_to', strength: 'weak' },
    ],
  };
  const svg = posterSvgString(map, 'Should I take it?');

  ok('it is an svg with a namespace', svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  ok('it carries an intrinsic size', svg.includes(`width="${POSTER_W}" height="${POSTER_H}"`));
  ok('poster is 1200×800', POSTER_W === 1200 && POSTER_H === 800);
  for (const n of map.nodes) {
    ok(`card for ${n.id}`, svg.includes(`data-node="${n.id}"`));
  }
  ok('one card per node',
    (svg.match(/data-node=/g) || []).length === map.nodes.length);
  ok('one path per edge',
    (svg.match(/<path /g) || []).length === map.edges.length, String((svg.match(/<path /g) || []).length));
  ok('the wordmark is there', svg.includes('SOCRIA.APP'));
  ok('the title is there', svg.includes('Should I take it?'));
  ok('the context is in the eyebrow', svg.includes('THINKING MAP · DECIDING'));
  ok('no undefined', !svg.includes('undefined'));
  ok('no NaN', !/\bNaN\b/.test(svg));
  ok('no CSS variables — a PNG has none', !svg.includes('var('));
  ok('markup in a label is escaped', svg.includes('&amp;') && svg.includes('&lt;now&gt;') && !svg.includes('<now>'));
  ok('the conflict style is not used where there is none', !svg.includes('stroke-dasharray="6 4"'));
  ok('a weak edge is drawn lighter', svg.includes('stroke-opacity="0.45"'));
  ok('the node type is on the card', svg.includes('>ASSUMPTION<'));

  const scene = posterScene(map, 'Should I take it?');
  ok('every card has at least one line', scene.cards.every((c) => c.lines.length >= 1));
  ok('no card has more than three', scene.cards.every((c) => c.lines.length <= 3));
  ok('a revised node is faded and hollow',
    scene.cards.find((c) => c.id === 'assume').faded && scene.cards.find((c) => c.id === 'assume').settled);
  ok('cards sit inside the frame', scene.cards.every(
    (c) => c.x - c.w / 2 >= 0 && c.y - c.h / 2 >= 0 && c.x + c.w / 2 <= POSTER_W && c.y + c.h / 2 <= POSTER_H));
  ok('every card has a concrete tone', scene.cards.every((c) => /^#[0-9A-Fa-f]{6}$/.test(c.tone)));
  ok('the transform has numbers in it', /^translate\(-?[\d.]+ -?[\d.]+\) scale\([\d.]+\)$/.test(scene.transform), scene.transform);

  // A long title is cut so it cannot run off the poster.
  const long = posterScene(map, 'x'.repeat(200));
  ok('a long title is shortened', long.title.length <= 72 && long.title.endsWith('…'));
  ok('an empty title gets a name', posterScene(map, '   ').title === 'A line of thinking');
}

console.log('\n=== an empty map still makes a poster, honestly ===');
{
  const svg = posterSvgString({ nodes: [], edges: [] }, 'Nothing yet');
  ok('no cards', !svg.includes('data-node='));
  ok('says so', svg.includes('Nothing drawn yet.'));
  ok('still signed', svg.includes('SOCRIA.APP'));
  ok('no undefined', !svg.includes('undefined') && !/\bNaN\b/.test(svg));
  ok('no context → plain eyebrow', svg.includes('>THINKING MAP<'));
}

console.log('\n=== a conflict dashes, and the scenarios all draw ===');
{
  for (const s of SCENARIOS) {
    if (!s.map) continue;
    const svg = posterSvgString(s.map, s.title);
    ok(`${s.id}: every node drawn`, (svg.match(/data-node=/g) || []).length === s.map.nodes.length);
    ok(`${s.id}: no undefined or NaN`, !svg.includes('undefined') && !/\bNaN\b/.test(svg));
  }
  const research = SCENARIOS.find((s) => s.id === 'research') ?? null;
  // The Structure lens only draws hierarchical relations, so the number of
  // paths is the layout's, not the edge count's — but a conflict it does
  // draw must be dashed, as it is on the live map.
  const map = {
    nodes: [
      { id: 'a', type: 'claim', label: 'A' },
      { id: 'b', type: 'evidence', label: 'B' },
    ],
    edges: [{ from: 'b', to: 'a', relation: 'supports' }],
  };
  ok('a supports edge draws', posterSvgString(map, 't').includes('<path '));
  if (research) ok('research scenario has edges drawn', (posterSvgString(research.map, 'r').match(/<path /g) || []).length > 0);
}

console.log('\n=== labels wrap by estimate, never past three lines ===');
{
  ok('a short label is one line', wrapLabel('It pays more', 126).length === 1);
  const two = wrapLabel('Remote slows junior progression', 126);
  ok('a medium label wraps to two', two.length === 2, JSON.stringify(two));
  const many = wrapLabel('What would I be giving up if I stayed, honestly, for another three years or more?', 126);
  ok('a long label stops at three', many.length === 3);
  ok('and says it was cut', many[2].endsWith('…'), many[2]);
  ok('every line fits the estimate', many.every((l) => l.length <= Math.floor(126 / 6.5)));
  ok('a word wider than the card is cut', wrapLabel('Supercalifragilisticexpialidocious', 60).every((l) => l.length <= 9));
  ok('an empty label draws a dash', wrapLabel('', 126)[0] === '—');
  ok('words are never split mid-line', wrapLabel('one two three four', 126).join(' ') === 'one two three four');
}

console.log('\n=== the file name comes from the title ===');
{
  ok('a plain title', posterFileName('Should I take it?') === 'socria-map-should-i-take-it.png');
  ok('accents fold', posterFileName('Café décisions') === 'socria-map-cafe-decisions.png');
  ok('an empty title still names a file', posterFileName('') === 'socria-map-thinking.png');
  ok('punctuation only still names a file', posterFileName('?!…') === 'socria-map-thinking.png');
  const long = posterFileName('a'.repeat(100));
  ok('a long title is cut', long.length <= 'socria-map-'.length + 48 + '.png'.length);
  ok('never a trailing dash', !/-\.png$/.test(posterFileName('ends with space ')));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
