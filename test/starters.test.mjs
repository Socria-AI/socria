// The chips on an empty screen.
//
// The bug this suite exists to prevent shipped once: "More on " written in
// front of a person's own first sentence, and the chip's truncated text sent
// as the message when it was pressed.

import {
  buildStarters,
  isSentence,
  PENDING_TYPES,
  STARTER_COUNT,
} from './.tmp/starters.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const FALLBACK = [
  'I don’t know what decision to make',
  'Help me think through this idea',
  'I’m stuck on what to build',
  'Challenge my reasoning',
];
const build = (input, count) => buildStarters({ fallback: FALLBACK, ...input }, count);

console.log('=== a starter is a pair, and the prompt is never the clipped text ===');
{
  const long =
    'Why did concert ticket prices go up when the production cost of putting on the show stayed completely flat this year?';
  const [first] = build({ recent: [{ title: long, updatedAt: 3 }] });
  ok('the label is clipped to one line', first.label.length <= 58);
  ok('the label says so', first.label.endsWith('…'));
  ok('the prompt is the whole question', first.prompt === long);
  ok('the prompt is never truncated', !first.prompt.includes('…'));
}

console.log('\n=== nothing is ever prefixed onto a sentence ===');
{
  const sentences = [
    'Why did concert ticket prices go up when the production cost stayed flat?',
    "I don't understand why the production function is concave",
    'demand is P = 120 − 2Q, supply P = 30 + Q, find the equilibrium and the surplus',
    'Help me think about whether to take the job',
    'Should I move to Berlin',
  ];
  for (const t of sentences) {
    ok(`"${t.slice(0, 34)}…" reads as a sentence`, isSentence(t) === true);
    const [c] = build({ recent: [{ title: t }] });
    ok(`  and is offered as itself`, c.prompt === t && !c.prompt.startsWith('More on'));
  }
}

console.log('\n=== but a real title still takes "More on" ===');
{
  const titles = ['Ambition vs Security', 'The Berlin decision', 'Pricing strategy'];
  for (const t of titles) {
    ok(`"${t}" is not a sentence`, isSentence(t) === false);
    const [c] = build({ recent: [{ title: t }] });
    ok(`  and reads "More on ${t}"`, c.prompt === `More on ${t}`);
  }
}

console.log('\n=== the sources are ranked by how much they know ===');
{
  const all = build({
    suggestions: ['Work out what a per-unit tax does to that market'],
    pending: [{ label: 'Is the short side always the one that trades?', type: 'question', updatedAt: 9 }],
    threads: [{ topic: 'whether to launch the private beta', lastTouched: 9 }],
    recent: [{ title: 'Ambition vs Security', updatedAt: 9 }],
  });
  ok('a suggestion outranks everything', all[0].prompt.startsWith('Work out what a per-unit tax'));
  ok('then the map’s open question', all[1].prompt === 'Is the short side always the one that trades?');
  ok('then the open thread', all[2].prompt === 'Back to whether to launch the private beta');
  ok('and a generic opening still closes the list', FALLBACK.includes(all[3].prompt));
  ok('exactly the count asked for', all.length === STARTER_COUNT);
}

console.log('\n=== an unresolved node becomes a thing worth saying ===');
{
  const cases = [
    ['question', 'Does the short side really decide?', 'Does the short side really decide?'],
    ['tension', 'Two answers disagree', 'Work through this tension: Two answers disagree'],
    ['assumption', 'Producers respond instantly to price', 'Test this assumption: Producers respond instantly to price'],
    ['unknown', 'The equilibrium price', 'Solve for the equilibrium price'],
    ['misconception', 'Demand curves can slope up', 'Clear this up: Demand curves can slope up'],
    ['conjecture', 'Every bounded sequence converges', 'Try to prove this: Every bounded sequence converges'],
    ['counterpoint', 'Fixed costs are ignored here', 'Take this objection seriously: Fixed costs are ignored here'],
    ['error', 'The sign flipped at step three', 'Go back to where it went wrong: The sign flipped at step three'],
  ];
  for (const [type, label, want] of cases) {
    const [c] = build({ pending: [{ label, type }] });
    ok(`${type}: "${c.prompt}"`, c.prompt === want, `wanted ${want}`);
  }

  // A node type with no opener that fits is not offered at all — one fewer
  // chip beats a chip that does not parse.
  const goals = build({ pending: [{ label: 'Ship the beta', type: 'goal' }] });
  ok('a goal is not unfinished business', goals.every((c) => !c.prompt.includes('Ship the beta')));
  ok('and the list falls back to the openings', goals.length === STARTER_COUNT);
  for (const t of PENDING_TYPES) {
    const [c] = build({ pending: [{ label: 'Some open thing', type: t }] });
    ok(`${t} is offered`, c.prompt.includes('Some open thing'));
  }

  // A node label is capitalised because it is a label. Splicing one into the
  // middle of a clause put a capital there too ("…the assumption that
  // Producers respond…"), and lowering it is not available — nothing about
  // the shape of "Producers" tells it apart from "Berlin". Every opener that
  // takes a whole clause now introduces it with a colon instead.
  for (const t of PENDING_TYPES) {
    if (t === 'question' || t === 'unknown') continue;
    const [c] = build({ pending: [{ label: 'Producers respond instantly', type: t }] });
    const body = c.prompt.slice(c.prompt.indexOf('Producers'));
    ok(`${t}: the label keeps its own capital`, body.startsWith('Producers'), c.prompt);
    ok(
      `${t}: and never lands mid-clause`,
      /: Producers/.test(c.prompt),
      c.prompt
    );
  }

  // A proper noun is never lowered, whichever opener takes it.
  const berlin = build({ pending: [{ label: 'Berlin is the wrong move', type: 'assumption' }] });
  ok('a proper noun survives intact', berlin[0].prompt.includes('Berlin is the wrong move'));
}

console.log('\n=== always a way to start something new ===');
{
  const crowded = build({
    suggestions: ['One', 'Two', 'Three', 'Four', 'Five'],
    pending: [{ label: 'Six?', type: 'question' }],
  });
  ok('personal chips never fill the list', crowded.length === STARTER_COUNT);
  ok('the last is a generic opening', FALLBACK.includes(crowded[3].prompt));
  ok('at most three are personal', crowded.filter((c) => !FALLBACK.includes(c.prompt)).length <= 3);
}

console.log('\n=== nothing is offered twice ===');
{
  const dup = build({
    suggestions: ['Ambition vs Security'],
    recent: [{ title: 'Ambition vs Security' }, { title: 'ambition vs. security' }],
  });
  const prompts = dup.map((c) => c.prompt);
  ok('one chip per idea', new Set(prompts).size === prompts.length);
  ok('and the restatements are gone', prompts.filter((p) => /ambition/i.test(p)).length === 1);
}

console.log('\n=== junk never reaches a chip ===');
{
  const junk = build({
    suggestions: ['', '  ', null, undefined, 42],
    recent: [
      { title: 'New thought session' },
      { title: 'Untitled' },
      { title: 'chat' },
      { title: 'ok' },
      { title: null },
    ],
    threads: [{ topic: '' }, { topic: undefined }],
  });
  ok('placeholder titles are not offers', junk.every((c) => FALLBACK.includes(c.prompt)));
  ok('still a full set of chips', junk.length === STARTER_COUNT);
  ok('every chip has a label and a prompt', junk.every((c) => c.label && c.prompt));
}

console.log('\n=== no history at all ===');
{
  const fresh = build({});
  ok('the four written openings, in order', fresh.map((c) => c.prompt).join('|') === FALLBACK.join('|'));
  ok('label equals prompt when nothing needed clipping', fresh.every((c) => c.label === c.prompt));
}

console.log('\n=== a shorter list still keeps one opening ===');
{
  const three = build({ suggestions: ['A thing', 'Another thing', 'A third thing'] }, 3);
  ok('exactly three', three.length === 3);
  ok('and one of them is generic', three.filter((c) => FALLBACK.includes(c.prompt)).length >= 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
