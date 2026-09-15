// The first exchange, and the two silent ways a table of regexes dies.
//
// A pattern that NEVER fires means the careful question written for it is
// dead code nobody will ever see. A pattern that fires too BROADLY swallows
// everything under it, and every person gets the same reply whatever they
// typed — which is the one outcome that would make this feel like a script
// instead of a reading. Neither shows up as an error.

import {
  INTENTS, MATCH, FALLBACK, resolveScript, takeCarried, CARRY_KEY,
} from './.tmp/onboarding-script.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

console.log('=== every pattern can actually fire ===');
{
  // A sentence written for each entry, in the order the table declares them.
  const PROBES = [
    'I have two job offers and cannot choose',
    'my co-founder and I disagree about the hire',
    'remote work is better for most people',
    'should we raise before we have runway',
    'how does integration by parts actually work',
    'my dissertation argument will not hold together',
    'thinking about whether to move to Berlin',
    'should i, honestly',
  ];
  ok('a probe for every pattern', PROBES.length === MATCH.length, `${PROBES.length} vs ${MATCH.length}`);

  PROBES.forEach((text, i) => {
    const got = resolveScript(text, 'through');
    // THE TEST THAT MATTERS: this probe must reach ITS OWN entry, not one above.
    ok(`pattern ${i} is reachable`, got === MATCH[i].s,
      `"${text}" → ${JSON.stringify(got.map[0])}, wanted ${JSON.stringify(MATCH[i].s.map[0])}`);
  });
}

console.log('\n=== no pattern swallows the table ===');
{
  // Nothing may match a sentence with none of its words in it.
  const NEUTRAL = [
    'the weather today is quite mild',
    'I enjoy long walks by the river',
    'she plays the cello on Thursdays',
  ];
  for (const s of NEUTRAL) {
    const hit = MATCH.find((m) => m.k.test(s));
    ok(`nothing catches "${s.slice(0, 28)}…"`, !hit, hit && String(hit.k));
  }

  // And the broadest pattern must be LAST, or it eats the specific ones.
  const broad = MATCH.findIndex((m) => m.k.test('should i'));
  ok('the "should i" catch-all is last in the table', broad === MATCH.length - 1, String(broad));

  // Proof it would matter: a sentence with both a specific word and "should I"
  // must get the specific reading.
  const both = resolveScript('should i take the job offer', 'through');
  ok('a specific word beats the catch-all', both === MATCH[0].s, JSON.stringify(both.map[0]));
}

console.log('\n=== what they typed beats the box they pressed ===');
{
  // Somebody who picked "Understand something" and then wrote about a job
  // offer is thinking about a job offer.
  const got = resolveScript('I have two job offers', 'understand');
  ok('the text wins over the intent', got === MATCH[0].s, JSON.stringify(got.map[0]));

  // With no pattern hit, the intent decides.
  for (const i of INTENTS) {
    const r = resolveScript('the weather is mild', i.id);
    ok(`${i.id} falls back to its own question`, r === FALLBACK[i.id], JSON.stringify(r.q.slice(0, 30)));
  }
}

console.log('\n=== nothing here is worth a blank screen ===');
{
  // This runs on the very first thing a stranger does with the product.
  for (const junk of [null, undefined, 42, {}, [], true, '', '   ']) {
    const r = resolveScript(junk, 'through');
    ok(`${JSON.stringify(junk) ?? typeof junk} still yields a script`, !!r && !!r.q && !!r.n);
  }
  ok('an unknown intent still yields one', resolveScript('', 'nonsense') === FALLBACK.through);
  ok('no intent at all still yields one', !!resolveScript('').q);
  ok('a very long sentence does not hang',
    !!resolveScript('job '.repeat(4000)).q);
}

console.log('\n=== the copy holds its shape ===');
{
  const all = [...MATCH.map((m) => m.s), ...Object.values(FALLBACK)];
  for (const s of all) {
    ok('the question has one emphasis', (s.q.match(/<em>/g) || []).length === 1, s.q);
    ok('the emphasis closes', (s.q.match(/<\/em>/g) || []).length === 1, s.q);
    // It asks. That is the entire product thesis on the first screen.
    // It asks, or it directs — either way the next move is theirs. A
    // statement that closed the question would be the product contradicting
    // itself on the first screen, so what is checked is that it never does.
    ok('it puts the next move on them', /\?|^Say |^Start /.test(s.q), s.q);
    // It notices without resolving — a verdict here would be the product
    // contradicting itself before the person has typed twice.
    ok('the noticing is a sentence', s.n.length > 20 && s.n.length < 200, s.n);
    ok('three labels for the map', s.map.length === 3, JSON.stringify(s.map));
    ok('and they are short enough to draw', s.map.every((l) => l.length <= 34), JSON.stringify(s.map));
  }

  // The tags are ours, from a fixed table — never anything a person typed.
  ok('no script interpolates anything',
    all.every((s) => !s.q.includes('${') && !s.n.includes('${')));
  ok('and nothing carries a script tag',
    all.every((s) => !/<script|onerror|javascript:/i.test(s.q + s.n)));
}

console.log('\n=== the intents ===');
{
  ok('five cards', INTENTS.length === 5, String(INTENTS.length));
  ok('ids are unique', new Set(INTENTS.map((i) => i.id)).size === 5);
  ok('every intent has a fallback', INTENTS.every((i) => !!FALLBACK[i.id]));
  ok('exactly one is subordinate', INTENTS.filter((i) => i.wide).length === 1);
  ok('and it is the last one', INTENTS[INTENTS.length - 1].wide === true);
  for (const i of INTENTS) {
    ok(`${i.id}: two examples`, i.eg.length === 2, JSON.stringify(i.eg));
    ok(`${i.id}: has a numeral`, /^[iv]+$/.test(i.rn), i.rn);
  }
}

console.log('\n=== the handover happens exactly once ===');
{
  const mk = (v) => {
    let held = v;
    return {
      getItem: () => held,
      removeItem: () => { held = null; },
      peek: () => held,
    };
  };

  const s = mk(JSON.stringify({ text: 'two job offers', intent: 'Think something through', q: 'Q', n: 'N' }));
  const first = takeCarried(s);
  ok('it reads', first && first.text === 'two job offers', JSON.stringify(first));
  // THE POINT: a key that survives re-prefills the composer forever.
  ok('and it is gone', s.peek() === null);
  ok('a second read is null', takeCarried(s) === null);

  ok('empty store is null', takeCarried(mk(null)) === null);
  ok('junk is null, not a throw', takeCarried(mk('{{{')) === null);
  ok('an empty text is null', takeCarried(mk(JSON.stringify({ text: '   ' }))) === null);
  ok('a missing text is null', takeCarried(mk(JSON.stringify({ q: 'Q' }))) === null);
  // A hostile payload is bounded rather than trusted: it reaches a composer.
  const big = takeCarried(mk(JSON.stringify({ text: 'x'.repeat(99999), q: 'y'.repeat(9999) })));
  ok('an enormous text is clipped', big && big.text.length <= 2000, String(big && big.text.length));
  ok('an enormous question is clipped', big && big.q.length <= 400, String(big && big.q.length));
  // A store that throws (private window, blocked storage) must not take the page down.
  const boom = { getItem() { throw new Error('denied'); }, removeItem() {} };
  ok('a throwing store is survivable', takeCarried(boom) === null);

  ok('the key is namespaced', CARRY_KEY.startsWith('socria.'), CARRY_KEY);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
