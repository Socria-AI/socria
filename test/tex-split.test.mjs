// Where the mathematics is in a sentence.
//
// This suite exists because of a bug that reached production and mangled
// every reply containing a bare number in maths mode. It printed
//
//   "as x approaches  approaches $0$"
//
// which is two separate failures wearing one coat: a rejected span re-emitted
// the text in front of it, and `$0$` was being judged as money in the first
// place. The regression cases below are the actual sentence that broke.

import { splitMath, hasMath, looksMath } from './.tmp/tex-split.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
/** Reassemble a split back into a string, marking maths, for readable checks. */
const round = (s) => splitMath(s).map((g) => (g.kind === 'text' ? g.body : `«${g.body}»`)).join('');
/** Everything the reader would see as words, with maths removed. */
const proseOf = (s) => splitMath(s).filter((g) => g.kind === 'text').map((g) => g.body).join('');

console.log('=== nothing is ever duplicated ===');
{
  // The exact shape that shipped broken.
  const src = 'the sine function to oscillate rapidly between $-1$ and $1$.';
  ok('the sentence survives once', round(src) ===
     'the sine function to oscillate rapidly between «-1» and «1».', round(src));

  const approaches = 'Consider $f(x)$ as $x$ approaches $0$.';
  ok('"approaches" appears once', (proseOf(approaches).match(/approaches/g) || []).length === 1, proseOf(approaches));

  // The property that matters, stated generally: putting the pieces back
  // together must give back exactly what came in.
  const cases = [
    'plain prose with no mathematics at all',
    'a bare $0$ in a sentence',
    'two: $0$ and $1$',
    'it cost $5 and $10 in total',
    'mixed $x^2$ and $$\\int_0^1 f$$ and \\(y\\) and \\[z\\]',
    '$x$',
    '$$block$$',
    'trailing dollar $',
    '$ leading space is not a span $',
    'unclosed $x + 1 runs on',
    'money then maths: $5 and $10, so $x+2=0$',
    'nested-ish $a$b$c$',
    '',
  ];
  for (const c of cases) {
    const back = splitMath(c).map((g) => (g.kind === 'text' ? g.body : g.body)).join('');
    // Delimiters are consumed for real maths, so compare on the prose runs
    // plus the bodies — the invariant is that no CHARACTER is repeated.
    ok(`no growth: ${JSON.stringify(c).slice(0, 42)}`, back.length <= c.length, `${back.length} > ${c.length}`);
  }
}

console.log('\n=== a bare number between paired delimiters is mathematics ===');
{
  for (const b of ['0', '1', '-1', '3.14', '-0.5', '+7', '1,000'])
    ok(`$${b}$ is maths`, looksMath(b) === true, b);
  ok('$0$ renders as maths', splitMath('near $0$.')[1].kind === 'inline');
  ok('$-1$ renders as maths', splitMath('from $-1$ up')[1].kind === 'inline');
}

console.log('\n=== …and an amount running into prose is not ===');
{
  // This is the case the judgement exists for, and it used to get it wrong.
  ok('"5 and" is not maths', looksMath('5 and') === false);
  ok('"10 to" is not maths', looksMath('10 to') === false);
  ok('"20 or so" is not maths', looksMath('20 or so') === false);
  ok('"5-" is not maths', looksMath('5-') === false);
  ok('empty is not maths', looksMath('') === false);
  ok('whitespace is not maths', looksMath('   ') === false);

  const money = 'it cost $5 and $10 in total';
  ok('a price list stays prose', !round(money).includes('«'), round(money));
  ok('and keeps every character', proseOf(money) === money, proseOf(money));
}

console.log('\n=== the real signals still read as maths ===');
{
  for (const b of ['x', 'x^2', '\\pi', 'a_1', '\\frac{a}{b}', 'x = 3', '14 - 6 = 8', 'f(x)'])
    ok(`$${b}$ is maths`, looksMath(b) === true, b);
}

console.log('\n=== delimiters: longest first ===');
{
  const s = splitMath('before $$a+b$$ after');
  ok('$$…$$ is one block, not two inlines', s.filter((g) => g.kind === 'block').length === 1, JSON.stringify(s));
  ok('block body is right', s.find((g) => g.kind === 'block').body === 'a+b');
  ok('\\[…\\] is a block', splitMath('x \\[q\\] y').some((g) => g.kind === 'block' && g.body === 'q'));
  ok('\\(…\\) is inline', splitMath('x \\(q\\) y').some((g) => g.kind === 'inline' && g.body === 'q'));
}

console.log('\n=== hasMath agrees with splitMath, always ===');
{
  const probes = [
    'no maths here', 'a $0$ here', 'it cost $5 and $10', '$$x$$', '\\(y\\)', '\\[z\\]',
    'money then maths: $5 and $10, so $x+2=0$', 'trailing $', '$x$', 'plain',
    'a $ b $ c', '$-1$ and $1$',
  ];
  for (const s of probes) {
    const splitSaysMath = splitMath(s).some((g) => g.kind !== 'text');
    ok(`agree on ${JSON.stringify(s).slice(0, 40)}`, hasMath(s) === splitSaysMath,
       `hasMath=${hasMath(s)} split=${splitSaysMath}`);
  }
  // A global regex keeps lastIndex between calls; calling twice must agree.
  const t = 'a $0$ here';
  ok('hasMath is not stateful', hasMath(t) === hasMath(t) && hasMath(t) === true);
}

console.log('\n=== degenerate input terminates ===');
{
  ok('empty string', splitMath('').length === 0);
  ok('only delimiters', Array.isArray(splitMath('$$$$')));
  ok('many spans terminates', splitMath('$x$ '.repeat(300)).length > 0);
  const long = 'a'.repeat(5000) + '$x$';
  ok('a long run is fine', splitMath(long).some((g) => g.kind === 'inline'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
