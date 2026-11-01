#!/usr/bin/env node
// scripts/dev/fake-openai.mjs — a scripted stand-in for the OpenAI API, for
// driving the real app in a browser with no key and no spend.
//
//   node scripts/dev/fake-openai.mjs [port]        (default 3999)
//   OPENAI_API_KEY=sk-local OPENAI_BASE_URL=http://127.0.0.1:3999/v1 npm run dev
//
// The SDK reads OPENAI_BASE_URL, so every route's model call lands here. The
// answers are canned and deterministic — enough to exercise the surfaces
// (a streamed reply, a map, a display, a transcription), never a judgement of
// what the real model would say. It must never be pointed at by a deployment.
//
// FAKE_STREAM_MS=400 slows the stream (default 12ms a word), so a reply can be
// watched arriving — and stopped — in a browser.
//
// FAKE_OPENAI_TRACE=/path/trace.jsonl appends the last few messages of every
// reply request, one JSON line each, so a journey can read what the server
// actually sent the model (the history, the line saying what they did).
//
// What it answers:
//   POST /v1/chat/completions      streamed text, or JSON when json_object is asked
//                                  (a map, a study's topics, journal-entry practice,
//                                  a reading or proposed edits for the writing space)
//   POST /v1/audio/transcriptions  {"text": …} — the voice composer's path
//   POST /v1/responses             a web search (tools: web_search): a short answer
//                                  citing two fixed example pages (url_citation),
//                                  the shape OpenAI's web search returns
//   GET  /v1/models                a short list

import http from 'node:http';
import { appendFileSync } from 'node:fs';

const PORT = Number(process.argv[2] || process.env.FAKE_OPENAI_PORT || 3999);

const lastUser = (messages) => {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i]?.role === 'user') return String(messages[i].content ?? '');
  return '';
};
const allUser = (messages) => messages.filter((m) => m?.role === 'user').map((m) => String(m.content ?? ''));

/** A reply in Logos's register, chosen by what the last message is plainly doing. */
function chatReply(messages) {
  // pages from the web were given this turn (app/api/logos/chat renderResearch): the answer cites the first
  const web = messages.find((m) => m?.role === 'system' && String(m.content ?? '').includes('=== From the web'));
  if (web) {
    const first = /\[1\] [^\n]*\n\s+([^\n]+)/.exec(String(web.content))?.[1]?.trim() ?? '';
    return `${first ? first.replace(/[.\s]+$/, '') : 'The page says so'} [1]. Readings like this change through the day, so check again before you plan around it.`;
  }
  const t = lastUser(messages).toLowerCase();
  if (/custom artifact/.test(t)) return 'It is in Artifacts: tick each day as you go — the days and the bar work themselves out. Which habit is the hardest to keep?';
  if (/\bchart|plot|graph\b/.test(t)) return 'Rent is most of it — three-quarters of what you listed. Is that the share you expected?';
  if (/derivative|d\/dx|differentiate/.test(t)) return 'Use the quotient rule or the chain rule — both give $-\\csc(x)\\cot(x)$. Which route do you want to check by hand?';
  if (/what is|what's|define|meaning of/.test(t)) return 'It is the share of a cost that buyers end up paying after a tax, set by how strongly each side reacts to price.';
  if (/offer|job/.test(t)) return 'The raise and the growth are two different reasons, and you have put them in one sentence. Which one would make you leave if the other were missing?';
  if (/\?\s*$/.test(t)) return 'Plainly: it depends on the part you have not stated yet — what you would give up. Name that and the choice gets smaller.';
  return 'Keep going — what is the part you are least sure of?';
}

/**
 * What they did with an element in an earlier reply (lib/inline-ui.ts didLine,
 * put before their words by app/api/logos/chat), answered the way the model is
 * asked to: by what they actually did, not by the reply as it was first shown.
 */
function didReply(messages) {
  const said = /\[What they did with the elements in your replies before writing this — (.+?)\. Take it into account\.\]/.exec(lastUser(messages))?.[1];
  if (!said) return null;
  const guess = /predicted “([^”]+)”/.exec(said)?.[1];
  const doubt = /doubted “([^”]+)”/.exec(said)?.[1];
  if (doubt) return `Fair to press on “${doubt}”. The strongest version of it is the one worth testing — what would you expect to see if it were true?`;
  const chord = /the chord from x = (\S+) to x = (\S+) has slope (\S+)/.exec(said);
  const match = /the tangent matches that slope at x = ([^;]+)/.exec(said)?.[1];
  if (chord) return `With the ends at ${chord[1]} and ${chord[2]}, the average slope is ${chord[3]}${match ? `, and the tangent matches it at x = ${match.replace(/ and x = /g, ' and ')}` : ''}: some instant always keeps the average pace, wherever you put the ends.`;
  const moved = /turning point moved from (\([^)]*\)) to (\([^)]*\))/.exec(said);
  if (moved) return `${guess ? `You said ${guess.toLowerCase()}` : 'You moved it'}, and the turning point went from ${moved[1]} to ${moved[2]}: x = −b/2a, so doubling b doubles how far left it sits. Why did it drop as well?`;
  const tried = /tried (.+?)(?:;|$)/.exec(said)?.[1];
  if (tried) return `You tried ${tried}. The two that land together add up to 90°. What does that say about sin 2a?`;
  return `I can see what you did: ${said}. What did you expect before you tried it?`;
}

/**
 * A turn offered an inline element (app/api/logos/chat, lib/runtime/presentation.ts
 * renderPresentation) is answered with one, so the browser can be driven through
 * a chart, a slider, a comparison, choices, a draft and folded reasoning. The
 * chart is drawn from the numbers in their message, as the real model is told to.
 */
function inlineReply(messages) {
  const sys = messages.filter((m) => m?.role === 'system').map((m) => String(m.content ?? '')).join('\n');
  // a write-up they asked to keep (lib/runtime/presentation.ts WRITE_UP): a document, title first, for Content
  if (sys.includes('A WRITE-UP, READ IN CONTENT')) {
    const about = (lastUser(messages).match(/\b(?:on|about|to|for)\s+(.{3,80}?)[.?!]*$/i)?.[1] ?? 'what you asked').replace(/^the\s+/i, '');
    const title = about.charAt(0).toUpperCase() + about.slice(1);
    return `# ${title}\n\nNo single cause explains it; several pressures met at once, and each made the others more dangerous.\n\n## Alliances\n\nTwo blocs had promised to fight for each other, so a local quarrel could not stay local.\n\n## Militarism\n\nArms races and rigid mobilisation plans made speed decisive: whoever waited risked losing.\n\n## Nationalism\n\nNew nations and old empires each had a claim the others could not accept.\n\n## The spark\n\nAn assassination in Sarajevo gave all of it a reason to start.`;
  }
  const ui = (o) => '```ui\n' + JSON.stringify(o) + '\n```';
  // going deeper on one thread (lib/runtime/presentation.ts SHAPES.deeper): that thread, in parts that fold
  if (sys.includes('they asked to go deeper on one thread')) {
    return `The first five minutes have one job: get someone from a blank screen to a map of their own thinking, without ever showing them a tour.\n\n### The first minute\n\nThey land on one question — what are you working through? — with an example under it they can take or ignore. No feature list, no wall of options. Whatever they type starts a real conversation, so the first reply has to earn its place on its own: short, specific, and plainly about what they said.\n\n### The first map\n\nAfter two or three exchanges the Logic Map draws itself beside the conversation, from their own sentences. This is the moment the product explains itself: they see that Socria was listening for the structure of their thinking, not just answering. Name it in a line and let them move a card.\n\n### What to leave out\n\nViews, Artifacts, Memory and Voice can all wait until someone reaches for them. Each earns a one-line hint the first time it would help, never before. People who used the old Logos get one extra note on their first visit: where the things they relied on have moved.\n\nOnce that first map exists, the real question is what brings them back the next day — and that is retention more than onboarding.`;
  }
  if (!sys.includes('INLINE, IF IT HELPS')) return null;
  const t = lastUser(messages);
  // minimum explanation, maximum understanding: the insight, one thing to see it in, the ways deeper
  if (sys.includes('"type":"graph"') && /mean value|mvt|rolle/i.test(t)) {
    return `If a curve is unbroken on [a, b] and smooth in between, then somewhere inside it its slope at one instant equals its average slope over the whole stretch: $f'(c) = \\frac{f(b) - f(a)}{b - a}$.\n\n${ui({ type: 'graph', title: 'Average slope, matched', expr: 'x^3 - 3*x', x: [-2.5, 2.5], params: [{ name: 'a', label: 'a', value: -1.5, min: -2.5, max: 2.5, step: 0.1 }, { name: 'b', label: 'b', value: 2, min: -2.5, max: 2.5, step: 0.1 }], chord: ['a', 'b'], features: ['mean-value'] })}\n\nDrag either end: the chord tilts, and c slides to wherever the tangent runs parallel to it.${sys.includes('"type":"paths"') ? `\n\n${ui({ type: 'paths', title: 'Deeper, when you want it', items: [{ label: 'Why it needs a smooth curve', gist: 'What a corner like |x| does to it.' }, { label: 'Where c comes from', gist: 'The proof from Rolle’s theorem, in three lines.' }, { label: 'Where it is used', gist: 'Why an average speed can prove you sped.' }] })}` : ''}`;
  }
  if (sys.includes('"type":"graph"') && /derivative|tangent|slope at/i.test(t)) {
    return `A derivative is the slope of the curve at a single point — how fast y is changing right there, as the gap you measure it over shrinks to nothing.\n\n${ui({ type: 'graph', title: 'The slope at a point', expr: 'x^2', x: [-3, 3], params: [{ name: 'p', label: 'p', value: 1, min: -2.5, max: 2.5, step: 0.1 }], tangent: 'p' })}\n\nDrag the point: on $x^2$ the slope is always twice where you stand.`;
  }
  if (sys.includes('"type":"graph"') && /tax|supply|price ceiling|tariff|subsid/i.test(t)) {
    return `Because the tax opens a gap between what buyers pay and what sellers keep, and the price settles where both sides still trade — so buyers carry only part of it, and the less they can walk away, the more they carry.\n\n${ui({ type: 'graph', title: 'A tax on sellers', expr: '10 - x', label: 'demand', curves: [{ expr: '2 + x + t', label: 'supply' }], x: [0, 10], params: [{ name: 't', label: 'tax', value: 0, min: 0, max: 4, step: 0.5 }], features: ['crossings'] })}\n\nRaise the tax and watch the price where the curves meet: it climbs by half of it here.`;
  }
  if (sys.includes('"type":"graph"') && /elastic/i.test(t)) {
    return `Elasticity is how strongly the quantity people buy reacts to price, in percentages: a 10% price rise that cuts sales by 20% is an elasticity of 2.\n\n${ui({ type: 'graph', title: 'Elasticity along a demand curve', expr: '10 - x', label: 'demand', x: [0, 10], params: [{ name: 'q', label: 'quantity', value: 3, min: 0.5, max: 9.5, step: 0.5 }], at: ['q'], readouts: [{ label: 'elasticity', expr: '(10-q)/q', digits: 2 }] })}\n\nSlide the point down the line: the same straight curve is elastic near the top and inelastic near the bottom.`;
  }
  if (sys.includes('"type":"claim"')) {
    if (/brain/i.test(t)) return `No — over a day virtually the whole brain is active; the 10% figure was never a finding.\n\n${ui({ type: 'claim', claim: 'We only use 10% of our brains', verdict: 'fails', parts: [{ text: 'Imaging shows activity across virtually every region over a day', holds: 'yes', basis: 'brain scans of ordinary activity, awake and asleep' }, { text: 'Not every neuron fires at once', holds: 'yes', basis: 'that would be a seizure; activity moves around' }, { text: 'The 10% figure comes from research', holds: 'no', basis: 'no study found it; it traces to misquoted popular accounts' }] })}`;
    return `Not as a rule: it depends on the setup — hybrid work shows little or no loss in the better studies, while fully remote work can cost the newest staff the most.\n\n${ui({ type: 'claim', claim: 'Remote work kills productivity', verdict: 'partly', parts: [{ text: 'Hybrid arrangements show little or no productivity loss', holds: 'yes', basis: 'randomised trials of hybrid schedules' }, { text: 'Fully remote work can slow new staff and mentoring', holds: 'partly', basis: 'field studies of onboarding and feedback' }, { text: 'Remote work lowers productivity everywhere', holds: 'no', basis: 'results differ by task, team and how it is run' }] })}`;
  }
  // the conversation as something to reason with (GRAMMAR graph / sim / check / steps)
  if (sys.includes('"type":"graph"') && /vertex|parabola|b\/2a/i.test(t)) {
    return `No — c only lifts the whole curve; where it turns depends on a and b. Guess first, then try it.\n\n${ui({ type: 'graph', title: 'Where the vertex sits', expr: 'a*x^2 + b*x + c', x: [-6, 4], params: [{ name: 'a', value: 1, min: -3, max: 3, step: 0.5 }, { name: 'b', value: 2, min: -6, max: 6, step: 1 }, { name: 'c', value: -1, min: -5, max: 5, step: 1 }], features: ['turning', 'roots', 'intercept'], predict: { prompt: 'If b doubles, which way does the vertex move?', options: ['Left', 'Right', 'It stays put'] } })}`;
  }
  if (sys.includes('"type":"sim"') && /throw|angle|projectile|45/i.test(t)) {
    return `Because 45° splits the throw evenly between going up and going forward. Move the angle and watch where it lands.\n\n${ui({ type: 'sim', title: 'Throw at 10 m/s', x: 'v*cos(a*pi/180)*t', y: 'v*sin(a*pi/180)*t - 4.9*t^2', t: [0, '2*v*sin(a*pi/180)/9.8'], view: { x: [0, 12], y: [0, 5] }, params: [{ name: 'a', label: 'angle', value: 45, min: 5, max: 85, step: 1, unit: '°' }, { name: 'v', label: 'speed', value: 10, min: 2, max: 20, step: 1, unit: 'm/s' }], readouts: [{ label: 'range', expr: 'v^2*sin(2*a*pi/180)/9.8', unit: 'm', digits: 1 }], predict: { prompt: 'Which angle lands as far as 30°?', options: ['60°', '15°', 'None'] } })}`;
  }
  if (sys.includes('"type":"steps"')) {
    return `Complete the square: half of b, squared, makes the perfect square.\n\n${ui({ type: 'steps', title: 'Completing the square', lines: [{ tex: 'y = x^2 + 4x - 1' }, { tex: '= (x^2 + 4x + 4) - 4 - 1', why: 'half of 4, squared, is 4' }, { tex: '= (x+2)^2 - 5' }], check: { prompt: 'Now you: where is the vertex of y = x² − 6x + 2?', label: 'x', answer: '6/2' } })}`;
  }
  if (sys.includes('"type":"check"')) {
    return `One like it.\n\n${ui({ type: 'check', prompt: 'Where is the vertex of y = 2x² − 8x + 3?', label: 'x', answer: '-(-8)/(2*2)', explain: 'x = −b/2a = 8/4 = 2' })}`;
  }
  // an open piece of work (SHAPES.open): the problem that matters, one starting point, the ways onward
  if (sys.includes('"type":"paths"')) {
    return `The hard part isn't the screens — it's that Logos 5 asks people to think *with* it, and nobody arrives knowing how.\n\nSo I'd build onboarding around one first success instead of a tour: in the first few minutes someone brings a real question of their own, talks it through, and watches their reasoning come back as a Logic Map they didn't have to draw. Views, Artifacts and Memory can wait until they reach for them.\n\nA relaunch adds one wrinkle: people who learned the old Logos will look for what moved, so they need a different first minute from someone arriving cold.\n\n${ui({ type: 'paths', title: 'Where to take it', items: [
      { label: 'Sketch the first five minutes', gist: 'Moment by moment, from landing to their first map.' },
      { label: 'Returning users vs. new ones', gist: 'What each needs to see first, and what to leave out.' },
      { label: "How you'd know it's working", gist: 'The few signals that show someone got it, before retention data exists.' },
    ] })}`;
  }
  // a choice that is theirs (decide): what it rests on, a first reading, and no winner named
  if (sys.includes('"type":"decide"')) {
    return `It turns on what the first session is for: proof that Socria works, or proof that it works on *their* thinking.\n\n${ui({ type: 'decide', title: 'Guided example or their own question', options: ['Guided example', 'Their own question'], rows: [
      { label: 'Time to a first map', scores: [3, 2], note: 'An example maps at once; their own takes two or three turns' },
      { label: 'Shows what Logos is for', scores: [1, 3], note: 'Only their own thinking shows the point' },
      { label: 'Works with nothing in mind', scores: [3, 1] },
      { label: 'Feels like theirs, not a demo', scores: [1, 3] },
    ] })}\n\nSay how much each of these matters to you and the leaning follows from that.`;
  }
  if (sys.includes('"type":"chart"')) {
    const pairs = [...t.matchAll(/\b([A-Za-z][A-Za-z]{1,20}|[A-Za-z]\d{1,2})\s*[:=]?\s*\$?(\d[\d,]*(?:\.\d+)?)(k?)\b(?!\s*%)/g)]
      .filter((m) => !/^(?:at|of|is|was|are|and|or|my|the|a|over|for|on|in)$/i.test(m[1]))
      .slice(0, 8);
    if (pairs.length >= 3) {
      const x = pairs.map((m) => m[1][0].toUpperCase() + m[1].slice(1));
      const values = pairs.map((m) => Number(m[2].replace(/,/g, '')));
      const top = x[values.indexOf(Math.max(...values))];
      return `${top} is the largest part of it.\n\n${ui({ type: 'chart', kind: 'bar', title: 'What you listed', x, series: [{ values }], basis: 'given' })}\n\nThe rest are close to each other.`;
    }
  }
  if (sys.includes('"type":"slider"')) {
    return `About $1,799 a month at those numbers. Move them to see how it changes.\n\n${ui({ type: 'slider', title: 'Monthly payment', formula: 'p*(r/1200)/(1-(1+r/1200)^(-n))', result: { label: 'Monthly payment', unit: '$', digits: 0 }, vars: [{ name: 'p', label: 'Loan', min: 50000, max: 1000000, step: 5000, value: 300000, unit: '$' }, { name: 'r', label: 'Rate', min: 1, max: 12, step: 0.25, value: 6, unit: '%' }, { name: 'n', label: 'Months', min: 60, max: 480, step: 12, value: 360 }] })}`;
  }
  if (sys.includes('"type":"compare"')) {
    const two = /\b([A-Z][\w+#.]*)\s+(?:and|or|vs\.?|versus)\s+(?:the\s+)?([A-Z][\w+#.]*)/.exec(t);
    const [a, b] = two ? [two[1], two[2]] : ['The first', 'The second'];
    return `They differ most on cost and on how much you have to look after.\n\n${ui({ type: 'compare', options: [a, b], rows: [{ label: 'Cost', values: ['$15 a month', '$25 a month'] }, { label: 'Upkeep', values: ['Low', 'Medium'] }, { label: 'Best for', values: ['Getting started', 'Scaling later'] }], pick: 0 })}\n\nI lean to ${a} for where you are now.`;
  }
  if (sys.includes('"type":"draft"')) {
    return `Here is one you can send.\n\n${ui({ type: 'draft', kind: 'email', title: 'To your landlord', text: 'Hi Sam,\n\nThe heater in my flat stopped working on Monday and the place is getting cold. Could you arrange for someone to look at it this week?\n\nThanks,\nAlex' })}`;
  }
  if (sys.includes('"type":"options"')) {
    return `Happy to. Where do you want to start?\n\n${ui({ type: 'options', options: [{ label: 'The structure' }, { label: 'The opening' }, { label: 'Tightening the argument' }] })}`;
  }
  if (sys.includes('"type":"concepts"')) {
    return `Microeconomics is the study of choices made one market at a time — how buyers and sellers decide, and how their decisions settle into prices. Four ideas carry most of it, and each leans on the others.\n\n${ui({ type: 'concepts', title: 'Microeconomics', items: [
      { name: 'Supply and demand', gist: 'How a price settles where what sellers offer meets what buyers want.', detail: 'Demand falls as price rises; supply rises with it. Where the two meet is the price that clears the market, and anything that shifts either curve moves it.', links: ['Market structure', 'Elasticity'] },
      { name: 'Consumer behaviour', gist: 'How people choose what to buy with a limited budget.', detail: 'People weigh what an extra unit is worth to them against its price. Add up those choices and you get the demand curve.', links: ['Supply and demand'] },
      { name: 'Costs of production', gist: 'What it costs a firm to make one more unit.', detail: 'Fixed costs stay put; variable costs grow with output. A firm keeps producing while one more unit brings in more than it costs.', links: ['Market structure'] },
      { name: 'Market structure', gist: 'How many firms compete, and how much say each has over price.', detail: 'From many small firms that take the price as given to one firm that sets it, the structure decides how far prices sit above costs.' },
      { name: 'Elasticity', gist: 'How strongly buyers or sellers react when the price moves.', detail: 'Necessities barely react; luxuries react a lot. It decides who ends up paying a tax and whether a price rise brings in more or less money.' },
    ] })}`;
  }
  if (sys.includes('"type":"sequence"')) {
    if (sys.includes('sequence:timeline') || /timeline|events|happened|over time|chronolog/i.test(t)) {
      return `It moved fast once it started: in a little over two years the monarchy went from reform to abolition.\n\n${ui({ type: 'sequence', kind: 'timeline', title: 'The French Revolution, the first years', items: [
        { label: 'The Estates-General meets', when: 'May 1789', detail: 'Called to fix the Crown\'s finances, it splits over how votes are counted.' },
        { label: 'The Bastille falls', when: 'July 1789', detail: 'Crowds take the fortress; the King\'s authority in Paris collapses.' },
        { label: 'Declaration of the Rights of Man', when: 'Aug 1789' },
        { label: 'The monarchy is abolished', when: 'Sept 1792', detail: 'The Convention declares a republic.' },
      ] })}`;
    }
    if (sys.includes('sequence:how-it-works') || /football/i.test(t)) {
      return `The whole game is a fight for ten yards: the team with the ball gets four tries, called downs, to carry it ten yards forward. Make it, and the count starts again; fail, and the ball goes to the other side.\n\n${ui({ type: 'sequence', kind: 'steps', title: 'The four downs', items: [
        { label: '1st down — 10 yards to go', detail: 'A run or a pass; whatever is gained comes off the ten.' },
        { label: '2nd down', detail: 'Another try from wherever the last one ended.' },
        { label: '3rd down', detail: 'Usually the decisive one: make the rest of the ten or face fourth.' },
        { label: '4th down', detail: 'Kick it away (a punt), try for a field goal, or gamble on going for it.' },
      ] })}\n\nScoring is how a drive ends well — want that next?`;
    }
    return `Four steps, and the second is the one people skip.\n\n${ui({ type: 'sequence', kind: 'steps', title: 'Setting up a budget', items: [
      { label: 'Add up what comes in each month' },
      { label: 'List every fixed cost', detail: 'Rent, phone, subscriptions — the bills that arrive whether you think about them or not.' },
      { label: 'Set a weekly limit for the rest' },
      { label: 'Check it after a month and adjust' },
    ] })}`;
  }
  if (sys.includes('"type":"reasoning"')) {
    return `Yes — 36 is right, not 42.\n\n${ui({ type: 'reasoning', summary: 'The integral of 2x from 0 to 6 is 36', steps: ['An antiderivative of 2x is x²', 'Evaluate at 6: 36', 'Evaluate at 0: 0', '36 − 0 = 36'] })}`;
  }
  return null;
}

/**
 * The map pass sends the map as it stands and then the conversation, under
 * "=== THE CONVERSATION ===", in one message (app/api/logos/map): the
 * conversation alone, so the canned map is drawn from what was said.
 */
function conversationOf(messages) {
  return messages.map((m) => {
    const text = String(m.content ?? '');
    const at = text.indexOf('=== THE CONVERSATION ===\n');
    return at < 0 ? m : { ...m, content: text.slice(at + '=== THE CONVERSATION ===\n'.length) };
  });
}

/** A Thinking Map for the conversation so far: deterministic, from the person's own sentences. */
function mapReply(messages) {
  const transcript = messages.map((m) => String(m.content ?? '')).join('\n');
  const said = allUser(messages).join(' ');
  const lower = said.toLowerCase();
  if (/\b(chart|plot|graph|pie)\b/.test(lower) && /\d/.test(lower)) {
    return {
      context: 'analysing',
      ask: { action: 'construct', artifact: 'display', topic: 'their numbers' },
      nodes: [{ id: 'numbers', type: 'evidence', label: 'Their numbers', status: 'open' }],
      edges: [],
    };
  }
  if (/derivative|integral|limit|d\/dx|\bx\^/.test(lower)) {
    return {
      context: 'math',
      intent: 'learning',
      ask: { action: 'explain', artifact: 'answer', topic: 'calculus' },
      nodes: [{ id: 'q', type: 'question', label: 'What is the derivative?', status: 'open' }],
      edges: [],
    };
  }
  const sentences = said
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3)
    .slice(0, 6);
  const nodes = sentences.map((s, i) => ({
    id: `n${i + 1}`,
    type: i === 0 ? 'question' : /because|since|so\b/i.test(s) ? 'claim' : /maybe|probably|i think|assum/i.test(s) ? 'assumption' : 'claim',
    label: s.replace(/[.!?]+$/, '').slice(0, 60),
    status: 'open',
  }));
  const edges = nodes.slice(1).map((n) => ({ from: 'n1', to: n.id, relation: 'depends' }));
  void transcript;
  return { context: /offer|job|decide|should i/.test(lower) ? 'deciding' : 'reflecting', ask: { action: 'discuss', artifact: 'map' }, nodes, edges };
}

/**
 * A custom artifact drafted (lib/objects/display-custom.ts): from their own
 * template when one was handed over (its blocks kept, a table's rows filled
 * from what they asked), else a habit tracker for the things they named.
 */
function customReply(system, transcript) {
  // the latest request: the transcript holds every one made so far
  const asked = [...transcript.matchAll(/Make a custom artifact[^:\n]*:\s*([^\n]+)/gi)].pop()?.[1] ?? '';
  const things = asked
    .replace(/^(?:a|an)\s+[\w\s]*?\bfor\s+/i, '')
    .replace(/\bthis week\b|\bevery day\b/gi, '')
    .split(/,\s*|\s+and\s+/)
    .map((x) => x.trim().replace(/^and\s+/i, ''))
    .filter(Boolean)
    .slice(0, 6);
  const named = things.length ? things : ['Exercise', 'Reading', 'Sleep'];
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  const tplName = /THEIR TEMPLATE, “([^”]+)”/.exec(system)?.[1];
  const tpl = /Template: (\{.*\})\s*$/m.exec(system)?.[1];
  if (tplName && tpl) {
    const blocks = JSON.parse(tpl).blocks.map((b) => (b.type === 'table' ? { ...b, rows: named.map((n) => ({ cells: { [b.columns[0].id]: cap(n) } })) } : b));
    return { display: { kind: 'custom', state: { title: `${tplName}: ${named.map(cap).join(', ')}`.slice(0, 80), blocks } }, gaps: [] };
  }
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  return {
    display: {
      kind: 'custom',
      state: {
        title: 'Habit tracker',
        about: 'Tick each day you did it.',
        blocks: [
          { id: 'week', type: 'table', label: 'This week', columns: [{ id: 'habit', label: 'Habit' }, ...days.map((d) => ({ id: d.toLowerCase(), label: d, kind: 'check' })), { id: 'days', label: 'Days', kind: 'calc', expr: days.map((d) => d.toLowerCase()).join(' + '), total: true }], rows: named.map((n) => ({ cells: { habit: cap(n) } })) },
          { id: 'done', type: 'progress', label: 'This week so far', of: 'week' },
          { id: 'goal', type: 'number', label: 'Days a week to aim for', value: 4, min: 1, max: 7, step: 1, control: 'stepper' },
          { id: 'notes', type: 'field', label: 'What got in the way?', multiline: true, placeholder: 'A line for the week' },
        ],
      },
    },
    gaps: [],
  };
}

/** The study sort (lib/logos5/study-ask.ts sortAsk): topics from the keyed passages' own headings. */
function sortReply(user) {
  const lines = user.split('\n').map((l) => /^\[(\d+:p\d+\.\d+)\] (?:(heading|title|list|quote|table|caption): )?(.*)$/.exec(l)).filter(Boolean);
  const topics = [];
  let cur = null;
  for (const [, key, kind, text] of lines) {
    if (kind === 'heading' || kind === 'title' || !cur) {
      cur = { title: (kind === 'heading' || kind === 'title' ? text : 'Overview').slice(0, 40), kind: /review|question|exam/i.test(text) ? 'review' : topics.length ? 'procedure' : 'foundation', summary: `What the files say about ${text.toLowerCase().slice(0, 40)}.`, blocks: [], quotes: [], after: topics.length ? [0] : [] };
      topics.push(cur);
    }
    cur.blocks.push(key);
    if (!kind && cur.quotes.length < 2) {
      const first = (text.match(/[^.!?]+[.!?]/) || [text])[0].trim();
      cur.quotes.push({ block: key, text: first });
    }
  }
  const course = (/\b([A-Z]{3,4} ?\d{4})\b/.exec(user) || [])[1];
  return { course: course ? `${course} · Exam 2` : '', topics: topics.filter((t) => t.blocks.length > 1 || t.quotes.length).slice(0, 8), start: 0, why: 'The other topics build on it.' };
}

/** Journal-entry practice (entriesAsk): events from the passages' own numbers. */
function entriesReply(user) {
  const money = (s) => Number(String(s).replace(/[$,]/g, ''));
  const events = [];
  let dA = 0, dL = 0, dE = 0;
  for (const m of user.matchAll(/^\[(\d+:p\d+\.\d+)\] (.*)$/gm)) {
    const [, key, text] = m;
    const amt = /\$([\d,]+)/.exec(text);
    if (!amt) continue;
    const v = money(amt[1]);
    if (/wages/i.test(text)) {
      events.push({ block: key, text: `Mar 31 — wages earned but not yet paid, $${amt[1]}`, lines: [{ account: 'Wages Expense', also: ['Salaries Expense'], side: 'dr', amount: v, why: 'The work was done in March, so the expense belongs to March.' }, { account: 'Wages Payable', side: 'cr', amount: v, why: 'It is owed until payday — a liability.' }], hint: 'What does the business owe at the end of March that its books do not show yet?' });
      dL += v; dE -= v;
    } else if (/rent/i.test(text) && /six months/i.test(text)) {
      const r = v / 6;
      events.push({ block: key, text: 'Mar 31 — one month of the rent paid in advance is used up', lines: [{ account: 'Rent Expense', side: 'dr', amount: r, why: 'One month of the prepaid rent was used in March.' }, { account: 'Prepaid Rent', side: 'cr', amount: r, why: 'The asset shrinks by the month used.' }], hint: 'Something paid for in advance was partly used up. Which asset gets smaller?' });
      dA -= r; dE -= r;
    } else if (/services/i.test(text)) {
      events.push({ block: key, text: `Services provided on account, not yet billed, $${amt[1]}`, lines: [{ account: 'Accounts Receivable', side: 'dr', amount: v, why: 'The customer owes for work already done.' }, { account: 'Service Revenue', side: 'cr', amount: v, why: 'Revenue is recorded when it is earned, billed or not.' }], hint: 'The work is done; nobody has paid. What does the business now have a right to?' });
      dA += v; dE += v;
    }
  }
  const bal = /total assets were \$([\d,]+), liabilities \$([\d,]+) and equity \$([\d,]+)/i.exec(user);
  const balance = bal ? { assets: money(bal[1]) + dA, liabilities: money(bal[2]) + dL, equity: money(bal[3]) + dE } : null;
  return { title: 'Record the adjustments for March 31', events: events.slice(0, 4), balance };
}

/** An easy view, as a vision model would read a photo of a café menu — unless the photo was never sent. */
function easyReply(messages) {
  const user = messages.find((m) => m?.role === 'user');
  const sawPhoto = Array.isArray(user?.content) && user.content.some((p) => p?.type === 'image_url' && /^data:image\//.test(p.image_url?.url ?? ''));
  if (!sawPhoto) return { title: '', kind: 'other', summary: '', sections: [] };
  return {
    title: 'Rosa’s Kitchen',
    kind: 'menu',
    summary: 'A restaurant menu with starters, mains and desserts.',
    sections: [
      { title: 'Starters', items: [{ name: 'Tomato soup', detail: 'with warm sourdough', value: '$6.50', tags: ['vegetarian'] }, { name: 'Garlic prawns', detail: 'chilli, lemon, parsley', value: '$9.00', tags: ['spicy'] }] },
      { title: 'Mains', items: [{ name: 'Mushroom risotto', detail: 'parmesan, thyme', value: '$14.50', tags: ['vegetarian', 'gluten free'] }, { name: 'Grilled salmon', detail: 'new potatoes, green beans', value: '$19.00' }, { name: 'Steak frites', detail: 'peppercorn sauce', value: '$24.00' }] },
      { title: 'Desserts', items: [{ name: 'Apple crumble', detail: 'custard or ice cream', value: '$7.00', tags: ['vegetarian'] }] },
    ],
    facts: [{ label: 'Open', value: 'Tue–Sun, 12 – 10 pm' }, { label: 'Phone', value: '(555) 014-2290' }],
    steps: [],
    times: [],
    warnings: ['Garlic prawns contain shellfish.', 'Please tell us about any allergies.'],
    unclear: ['The line under Desserts is too faint to read.'],
  };
}

/** The writing assist route (lib/write/assist.ts): canned, but always about the words it was given. */
function writeReply(system) {
  const op = /^You help someone with their own writing\. Task: (\w+)\./.exec(system)?.[1] ?? '';
  const sel = /The passage they selected:\n"""\n([\s\S]*?)\n"""/.exec(system)?.[1] ?? '';
  const words = sel.split(/\s+/).filter(Boolean);
  const gist = words.slice(0, 9).join(' ');
  const swaps = [
    [/\bvery very\b/i, 'very', 'One “very” is enough.', 'grammar'],
    [/\balot\b/, 'a lot', '“A lot” is two words.', 'grammar'],
    [/\bcould of\b/i, 'could have', '“could have”, not “could of”.', 'grammar'],
    [/\bin order to\b/i, 'to', '“To” says the same.', 'concision'],
    [/\bdue to the fact that\b/i, 'because', '“Because” says the same.', 'concision'],
    [/\bat this point in time\b/i, 'now', '“Now” says the same.', 'concision'],
    [/\breally /i, '', '“Really” adds little here.', 'concision'],
    [/\bvery /i, '', '“Very” adds little here.', 'concision'],
  ];
  const edits = [];
  for (const [re, to, why, kind] of swaps) {
    const m = re.exec(sel);
    if (m && !edits.some((e) => sel.indexOf(e.from) < m.index + m[0].length && m.index < sel.indexOf(e.from) + e.from.length)) edits.push({ from: m[0], to, why, kind });
  }
  if (op === 'explain') return { body: `A reader takes this as saying: ${gist}${words.length > 9 ? '…' : ''} — and as something you believe, not something you are reporting.`, points: words.length > 6 ? ['“It” could point back to more than one thing here.'] : [] };
  if (op === 'critique') return { body: 'This asks a reader to accept a general claim on the strength of what you have said so far.', points: ['The claim is stated, not shown — a sceptical reader asks for the case behind it.', 'It assumes the reader already agrees about why this matters.'], question: 'What is the one piece of evidence that would convince someone who disagrees?' };
  if (op === 'shorten') return { edits: edits.filter((e) => e.to.length < e.from.length), body: edits.length ? 'The length is in a few words that repeat what the sentence already says.' : 'This is already tight.' };
  if (op === 'improve') return { edits, body: edits.length ? 'A couple of small slips were making it harder to read.' : 'This is already clear.' };
  if (op === 'develop') {
    const key = words.find((w) => w.length > 5)?.replace(/[^\p{L}]/gu, '') || words[0] || 'this';
    const prev = /The paragraph before:/.test(system);
    return { questions: [`What exactly do you mean by “${key}”?`, 'Why is that so — what makes it true?', 'What is one example a reader would recognise?'], shape: '[your claim] because [your reason]. For instance, [your example].', transitions: prev ? [{ text: 'As a result,', why: 'it follows from the paragraph before' }] : [], missing: 'Who or what this is about, specifically.' };
  }
  if (op === 'phrase') return { options: [{ text: sel.includes(' and ') ? sel.replace(' and ', ', and ') : `Put simply, ${sel[0]?.toLowerCase() ?? ''}${sel.slice(1)}`, why: 'a pause where the thought turns' }] };
  if (op === 'proofread') {
    const issues = [];
    for (const m of system.matchAll(/^\[([A-Za-z0-9_-]+)\](?: \(\w+\))? (.*)$/gm)) {
      const [, block, text] = m;
      const g = /\b(they|we|you) was\b/i.exec(text);
      if (g) issues.push({ block, quote: g[0], kind: 'grammar', certainty: 'definite', why: `“${g[1]}” takes “were”.`, fix: `${g[1]} were` });
      const l = /\b(therefore|so) (every|all|always)\b[^.]*/i.exec(text);
      if (l) issues.push({ block, quote: l[0], kind: 'logic', certainty: 'likely', why: 'This goes from one case to every case — a reader will ask what makes it general. It may be right; it is not yet shown.' });
    }
    return { issues };
  }
  if (op === 'structure') {
    // a reverse outline of the paragraphs it was given: roles from their wording, the first sentence that argues as the claim
    const paras = Array.from(system.matchAll(/^\[([A-Za-z0-9_-]+)\](?: \((\w+)\))? (.*)$/gm)).map((m) => ({ id: m[1], t: m[2] ?? 'p', text: m[3] }));
    const role = (x) => (/^h/.test(x.t) ? 'other' : /\b(for example|for instance)\b/i.test(x.text) ? 'example' : /\b(but|however|critics)\b/i.test(x.text) ? 'counter' : /\b(\d+%|data|study|survey)\b/i.test(x.text) ? 'evidence' : /\b(so|therefore|in conclusion)\b/i.test(x.text) ? 'conclusion' : /\b(should|must|because)\b/i.test(x.text) ? 'claim' : 'background');
    const outline = paras.map((x) => ({ block: x.id, role: role(x), does: `${role(x) === 'other' ? 'names the section' : role(x) === 'example' ? 'gives an example' : role(x) === 'evidence' ? 'gives a figure as support' : role(x) === 'claim' ? 'makes the argument' : role(x) === 'counter' ? 'raises an objection' : role(x) === 'conclusion' ? 'draws the conclusion' : 'sets the scene'}` }));
    const claimP = paras.find((x) => role(x) === 'claim');
    const sentence = claimP ? (claimP.text.match(/[^.!?]+[.!?]/) ?? [claimP.text])[0].trim() : null;
    const ex = paras.findIndex((x) => role(x) === 'example');
    const cl = claimP ? paras.indexOf(claimP) : -1;
    const moves = ex >= 0 && cl > ex ? [{ block: paras[ex].id, after: paras[cl].id, why: 'The example comes before the claim it illustrates; after it, a reader knows what it is an example of.' }] : [];
    return { outline, ...(sentence ? { thesis: { block: claimP.id, quote: sentence } } : {}), moves, gaps: ['What would someone who disagrees point to first?'] };
  }
  if (op === 'board') {
    const cards = Array.from(system.matchAll(/^\[([A-Za-z0-9_-]+)\] \((\w+), pile: ([^)]*)\) (.*)$/gm)).map((m) => ({ id: m[1], kind: m[2], pile: m[3], text: m[4] }));
    const claim = cards.find((c) => c.kind === 'claim');
    const ev = cards.find((c) => c.kind === 'evidence');
    const findings = [];
    if (claim && ev && claim.pile !== ev.pile) findings.push({ kind: 'connection', cards: [claim.id, ev.id], says: 'The evidence that backs this claim sits in a different pile from it — a reader meets the claim with nothing under it.', question: 'Should they be in the same paragraph?' });
    else if (claim && !ev) findings.push({ kind: 'unsupported', cards: [claim.id], says: 'This claim is the centre of the board and nothing on the board supports it yet.', question: 'What would someone who disagrees need to see?' });
    return { findings };
  }
  return {};
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function streamText(res, text, model) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  const id = `chatcmpl-local-${Date.now()}`;
  const words = text.match(/\S+\s*/g) ?? [text];
  let i = 0;
  const tick = () => {
    if (i < words.length) {
      res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, delta: { content: words[i] }, finish_reason: null }] })}\n\n`);
      i++;
      setTimeout(tick, Number(process.env.FAKE_STREAM_MS || 12));
      return;
    }
    res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  };
  tick();
}

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const raw = Buffer.concat(chunks);
    if (req.method === 'GET' && url.pathname.endsWith('/models')) {
      return send(res, 200, { object: 'list', data: [{ id: 'gpt-local', object: 'model' }] });
    }
    if (req.method === 'POST' && url.pathname.endsWith('/audio/transcriptions')) {
      // the voice composer's request: multipart with a file part. The text is canned.
      const sized = raw.length > 200;
      return send(res, 200, { text: sized ? 'Okay so the new role is mostly maintaining the quarterly reports, which is basically what I do now.' : '' });
    }
    if (req.method === 'POST' && url.pathname.endsWith('/responses')) {
      // OpenAI's web search (lib/logos-explore.ts openaiSearch): an answer that cites pages
      let body;
      try {
        body = JSON.parse(raw.toString('utf8'));
      } catch {
        return send(res, 400, { error: { message: 'bad json' } });
      }
      const q = String(body.input ?? '').replace(/^Search the web for:\s*/i, '').split('\n')[0].trim();
      const weather = /weather|forecast|rain|temperature/i.test(q);
      const text = weather
        ? `It is 72°F and sunny in Dallas right now, with a light south wind. Tonight falls to 58°F under clear skies.`
        : `The latest reporting on ${q || 'this'} says the figures were updated this morning. Analysts expect another revision next week.`;
      const cut = text.indexOf('.') + 1;
      return send(res, 200, {
        id: 'resp_local',
        output: [
          { type: 'web_search_call', status: 'completed' },
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text,
                annotations: [
                  { type: 'url_citation', url: weather ? 'https://weather.example.com/dallas?utm_source=openai' : 'https://news.example.com/latest?utm_source=openai', title: weather ? 'Dallas, TX — current conditions' : 'Latest update', start_index: 0, end_index: cut },
                  { type: 'url_citation', url: weather ? 'https://forecast.example.org/tx/dallas' : 'https://wire.example.org/story', title: weather ? 'Dallas forecast — tonight and tomorrow' : 'What comes next', start_index: cut + 1, end_index: text.length },
                ],
              },
            ],
          },
        ],
      });
    }
    if (req.method === 'POST' && url.pathname.endsWith('/chat/completions')) {
      let body;
      try {
        body = JSON.parse(raw.toString('utf8'));
      } catch {
        return send(res, 400, { error: { message: 'bad json' } });
      }
      const model = body.model || 'gpt-local';
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const system = String(messages[0]?.role === 'system' ? messages[0].content : '');
      if (body.response_format?.type === 'json_object') {
        const isMap = /"nodes": \[\{"id": "short_snake_case_id"/.test(system);
        const isSort = /sort a student’s files into study topics/.test(system);
        const isEntries = /journal-entry practice/.test(system);
        const isWrite = system.startsWith('You help someone with their own writing.');
        const isCustom = system.startsWith('You draft EVERYDAY DISPLAYS') && /- "custom" —/.test(system);
        // an easy view of a photo (app/api/logos/easy): the stand-in reads every photo as the same café menu
        const isEasy = system.startsWith('You make an EASY VIEW of a photo');
        const content = JSON.stringify(isEasy ? easyReply(messages) : isWrite ? writeReply(system) : isMap ? mapReply(conversationOf(messages.slice(1))) : isSort ? sortReply(lastUser(messages)) : isEntries ? entriesReply(lastUser(messages)) : isCustom ? customReply(system, messages.slice(1).map((m) => String(m.content ?? '')).join('\n')) : {});
        return send(res, 200, { id: `chatcmpl-local-${Date.now()}`, object: 'chat.completion', model, choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
      }
      if (process.env.FAKE_OPENAI_TRACE) {
        try {
          appendFileSync(process.env.FAKE_OPENAI_TRACE, JSON.stringify({ at: Date.now(), messages: messages.slice(-4).map((m) => ({ role: m.role, content: String(m.content ?? '').slice(0, 4000) })) }) + '\n');
        } catch {}
      }
      const text = didReply(messages) ?? inlineReply(messages) ?? chatReply(messages.slice(1));
      if (body.stream) return streamText(res, text, model);
      return send(res, 200, { id: `chatcmpl-local-${Date.now()}`, object: 'chat.completion', model, choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
    }
    send(res, 404, { error: { message: `not scripted: ${req.method} ${url.pathname}` } });
  });
});

server.listen(PORT, '127.0.0.1', () => console.log(`fake openai on http://127.0.0.1:${PORT}/v1`));
