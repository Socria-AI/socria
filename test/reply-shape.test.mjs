// HOW A LOGOS 5 REPLY READS — what it is asked to say first, and how the page
// lays it out (logos5-v4).
//
// The benchmark: "I need to redesign an onboarding system for Socria's new
// Logos 5 relaunch." came back as a sentence of preamble, five bolded sections
// of advice that would fit anyone's project, and "Would you like me to go
// deeper on any of these?". What is held down here:
//
//   • THE ASK. The core prompt puts the answer, or the real problem, first; no
//     preamble, no recap, no five-part plan for an open request, at most one
//     question and only a purposeful one, depth on request — and no word limit.
//     The planner gives an open piece of work its shape (the problem, one
//     starting point, the ways onward offered as paths), a request to go deeper
//     its own (that thread, in parts, with room to say it), and a choice that is
//     theirs a decision they weigh themselves. Nothing changes for a hello, an
//     explanation, a practical email or a bug.
//   • THE PAGE. A short opening statement is set as a lead; a bold line
//     standing alone is read as the heading it is; labelled items become terms;
//     the later parts of a long reply fold under their titles — by a rule that
//     looks only backward, so a reply folds the same way mid-stream as landed —
//     and the closing question, the closing line and the ways onward stay in
//     view. A document in Content is not laid out as a reply.
//   • THE PIECES. "paths" and "decide" are descriptions, never code: cleaned,
//     capped, read as words wherever a picture cannot go, kept with the message
//     when used, and a decision carries no weights a reply tried to set.
//   • DEGRADING. A block that is not valid draws nothing and the words around
//     it stay; anything streamed half-way is a placeholder, never half a JSON.

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as I from './.tmp/inline-under-test.mjs';

let pass = 0,
  fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 500))));
const J = JSON.stringify;
const html = (el) => renderToStaticMarkup(el);
const fence = (o) => '```ui\n' + JSON.stringify(o) + '\n```';
const reply = (content, extra = {}) => html(h(I.L5Message, { m: { id: 'm1', role: 'assistant', content, ...(extra.ui ? { ui: extra.ui } : {}) }, side: 'socria', who: 'Socria', group: false, cont: false, showQuote: false, canReply: false, ...extra.props }));

// ── the benchmark, as it used to come back ───────────────────────────
const BEFORE = `A relaunch is a good moment to rethink onboarding from the ground up, because first impressions will shape how people understand what Logos 5 is. Here's a structured way to approach it.

**1. Clarify the goals**
- Decide what a successful first session looks like
- Identify the core value you want new users to experience first
- Align the onboarding with the Logos 5 positioning

**2. Understand your users**
- Segment new users and returning users from earlier versions
- Map their goals, motivations and pain points
- Gather feedback from current users about their first experience

**3. Design the flow**
- Keep the first steps simple and focused
- Introduce features gradually through progressive disclosure
- Use interactive walkthroughs instead of static tours
- Make it easy to skip or revisit onboarding

**4. Test and iterate**
- Run usability tests with real users
- A/B test different versions of key screens
- Track where people drop off and refine those steps

**5. Measure success**
- Activation rate
- Time to first value
- Retention after 7 and 30 days
- Qualitative feedback from new users

Would you like me to go deeper on any of these areas, such as designing the first-session flow or defining the metrics?`;

// ── …and in the shape it is now asked for ────────────────────────────
const PATHS = { type: 'paths', title: 'Where to take it', items: [
  { label: 'Sketch the first five minutes', gist: 'Moment by moment, from landing to their first map.' },
  { label: 'Returning users vs. new ones', gist: 'What each needs to see first, and what to leave out.' },
  { label: "How you'd know it's working", gist: 'The few signals that show someone got it, before retention data exists.' },
] };
const AFTER = `The hard part isn't the screens — it's that Logos 5 asks people to think *with* it, and nobody arrives knowing how.

So I'd build onboarding around one first success instead of a tour: in the first few minutes someone brings a real question of their own, talks it through, and watches their reasoning come back as a Logic Map they didn't have to draw. Views, Artifacts and Memory can wait until they reach for them.

A relaunch adds one wrinkle: people who learned the old Logos will look for what moved, so they need a different first minute from someone arriving cold.

${fence(PATHS)}`;

const DEEPER = `The first five minutes have one job: get someone from a blank screen to a map of their own thinking, without ever showing them a tour.

### The first minute

They land on one question — what are you working through? — with an example under it they can take or ignore. No feature list, no wall of options. Whatever they type starts a real conversation, so the first reply has to earn its place on its own: short, specific, and plainly about what they said.

### The first map

After two or three exchanges the Logic Map draws itself beside the conversation, from their own sentences. This is the moment the product explains itself: they see that Socria was listening for the structure of their thinking, not just answering. Name it in a line and let them move a card.

### What to leave out

Views, Artifacts, Memory and Voice can all wait until someone reaches for them. Each earns a one-line hint the first time it would help, never before. People who used the old Logos get one extra note on their first visit: where the things they relied on have moved.

Once that first map exists, the real question is what brings them back the next day — and that is retention more than onboarding.`;

const DECIDE = { type: 'decide', title: 'Guided example or their own question', options: ['Guided example', 'Their own question'], rows: [
  { label: 'Time to a first map', scores: [3, 2], note: 'An example maps at once; their own takes two or three turns' },
  { label: 'Shows what Logos is for', scores: [1, 3] },
  { label: 'Works with nothing in mind', scores: [3, 1] },
  { label: 'Feels like theirs, not a demo', scores: [1, 3] },
] };

const layout = (text, o) => I.layoutReply(I.editorialBlocks(I.parseBlocks(text, { rich: true }), { more: !!o?.streaming }), o);
const kinds = (pieces) => pieces.map((p) => (p.kind === 'block' ? (p.lead ? 'lead' : 'b') : p.kind)).join(' ');

console.log('\n=== the ask: what comes first, and what a reply is not ===');
{
  const core = I.LOGOS5_CORE;
  ok('the persona says it changed: logos5-v5', I.PERSONA_VERSION === 'logos5-v5');
  // The core says the rule in a line each; the detail of an open request and
  // of going deeper travels in that turn's own shape note (presentation.ts
  // SHAPES, pinned below), so the cached core stays inside its budget.
  ok('the first sentence is the answer, the insight, or the real problem underneath', /Lead with what matters: the answer, the insight, the finding, or the real problem under the request/.test(core));
  ok('no preamble, no announced structure', /No preamble or announced structure \("Here's a structured approach"\)/.test(core));
  ok('length follows the work — no word limit', /Length follows the work, never a habit/.test(core) && !/one to five sentences/.test(core));
  ok('each thing said once; no generic advice, no recap', /say each thing once — no generic advice, no recap/.test(core));
  ok('an open request is a starting point — not a cue for a complete plan', /not a cue for a complete plan/.test(core));
  ok('  and the line that produced the five sections is gone', !/name the two or three directions it could go/.test(core));
  ok('at most one question, and only one whose answer changes what comes next', /At most one, and only when its answer would change what you say next/.test(core) && /Never a list of questions/.test(core));
  ok('  never "would you like me to go deeper…?"', /would you like me to go deeper…\?/.test(core));
  ok('bold is only a list item’s label — never a heading of its own', /\*\*bold\*\* only as a list item's label/.test(core) && !/\*\*bold\*\* as a list label;/.test(core) && /Never # headings unless this turn's note asks/.test(core));
  ok('the cached core stays inside its budget (runtime.test.mjs holds it to 55% of Logos 3.5)', core.length < 14000, String(core.length));
  ok('Human-First stays: their decisions and their writing are theirs', /Theirs: consequential decisions/.test(core) && /do not produce the finished piece from nothing/.test(core));
}

console.log('\n=== the planner: a shape for the turns where habit is the chatbot’s ===');
const sig = (t) => I.readSignals(t);
const plan = (text, o = {}) => {
  const history = o.history ?? [];
  const state = I.readTurnState({ text, history, signals: sig(text), intent: I.routeTurn({ text }).intent });
  return I.planPresentation({ text, state, signals: sig(text), questions: o.questions ?? 1, ownWriting: !!o.ownWriting, ownJudgment: !!o.ownJudgment, ownReasoning: false, guard: !!o.guard, history });
};
{
  const bench = plan("I need to redesign an onboarding system for Socria's new Logos 5 relaunch.");
  ok('the benchmark: an open piece of work, with the ways onward offered as paths', bench.shape === 'open' && J(bench.forms) === J(['paths']), J(bench));
  const said = I.renderPresentation(bench);
  ok('  told: the problem that matters, one starting point, then the paths — and not the plan', /THE SHAPE OF THIS REPLY — an open piece of work\. Don't write the plan\./.test(said) && /the one starting point you would take/.test(said) && /as a paths block/.test(said) && /No headings, no bolded sections, no generic best practice/.test(said) && said.includes('"type":"paths"'), said);
  ok(`  short enough to ride every such turn: ${said.length} characters`, said.length < 1600, said.length);
  const off = I.renderPresentation({ ...bench, forms: [] });
  ok('  with inline elements switched off, the ways onward are named in a sentence instead', /name the two or three ways it could go next, in a sentence/.test(off) && !off.includes('paths block'), off);
  for (const t of ['We want to launch a podcast next spring', 'help me plan the team offsite', 'how should I approach the database migration?'])
    ok(`  "${t}": the same shape`, plan(t).shape === 'open' && plan(t).forms.includes('paths'), J(plan(t)));

  for (const t of [I.pathAsk({ label: 'Sketch the first five minutes' }), 'Take me further into Supply and demand.', 'say more about the second one', 'ok, expand on that'])
    ok(`going deeper: "${t}" — that thread, in parts`, plan(t).shape === 'deeper' && !plan(t).forms.includes('paths'), J(plan(t)));
  const deep = plan(I.pathAsk({ label: 'Sketch the first five minutes' }));
  const deepSaid = I.renderPresentation(deep);
  ok('  told to go deep on that thread only, as long as it needs, in parts that can be read one at a time', /go deeper on one thread/.test(deepSaid) && /as long as it needs/.test(deepSaid) && /### A few words/.test(deepSaid) && /no summary/.test(deepSaid), deepSaid);
  ok('  and given the room for it: a cut-off part is worse than a long one', I.presentationRoom(deep) === 600 && I.presentationRoom({ forms: ['chart'], shape: 'deeper' }) === 950);
  ok('  a way deeper opened is a conversation turn, not a drawing ("Sketch …")', I.routeTurn({ text: I.pathAsk({ label: 'Sketch the first five minutes' }) }).intent === 'conversation');

  for (const t of ['Should we open with a guided example or with their own question?', "I'm torn between Lisbon and Porto for the move", 'Should I take the job in Berlin or stay where I am for another year?'])
    ok(`a choice that is theirs: "${t}" — a decision they weigh`, plan(t).forms.includes('decide') && !plan(t).forms.includes('compare') && !plan(t).forms.includes('reasoning'), J(plan(t)));
  ok('  the facts side by side are still a comparison', plan('compare Postgres and MySQL for a small startup').forms.includes('compare'));
  ok('  its grammar: no winner named in the prose, their weights decide', /name no winner in your prose/.test(I.renderPresentation({ forms: ['decide'], reasons: [] })));

  for (const t of ['hi', 'I need to fix this function, it throws on empty arrays', 'thanks so much'])
    ok(`left alone: "${t}"`, !plan(t).shape && !plan(t).forms.includes('paths') && !plan(t).forms.includes('decide'), J(plan(t)));
  // an idea to understand is not left alone any more: the insight first, and (where it has depth) the ways deeper
  // to open one at a time (test/minimum-explanation.test.mjs) — never an open-work plan or a decision
  for (const t of ['what is tax incidence', 'Why did the Roman Republic fall?'])
    ok(`an idea to understand: "${t}" — the understanding shape, no plan, no decision`, plan(t).shape === 'understand' && !plan(t).forms.includes('decide'), J(plan(t)));
  const email = plan('I need to write an email to my landlord about the heater');
  ok('  a practical email is written, not scoped: a draft, no paths', email.forms.includes('draft') && !email.forms.includes('paths') && !email.shape, J(email));
  ok('  "help me with my essay" still gets its few directions to tap', plan('help me with my essay').forms.includes('options') && !plan('help me with my essay').shape);
  const ran = [{ role: 'user', content: 'a' }, { role: 'assistant', content: `x\n\n${fence(PATHS)}` }, { role: 'user', content: 'b' }, { role: 'assistant', content: '[shown inline — paths: Where to take it]' }];
  ok('  not the ways onward a third time running', !plan('We want to launch a podcast next spring', { history: ran }).forms.includes('paths'));
}

console.log('\n=== the page: lead, headings, terms ===');
{
  ok('a bold line standing alone over what follows is a heading', I.fakeHeading('**1. Clarify the goals**') === '1. Clarify the goals' && I.fakeHeading('**Cost:**') === 'Cost' && I.fakeHeading('**What it gives you:**') === 'What it gives you');
  ok('  a bold sentence is emphasis, not a heading', I.fakeHeading('**Do not skip this step.**') === null && I.fakeHeading('**Is this right?**') === null && I.fakeHeading('Plain words') === null && I.fakeHeading('**one** and **two**') === null);
  const lone = I.editorialBlocks(I.parseBlocks('Some words here.\n\n**Done.**', { rich: true }));
  ok('  and a bold line at the very end has nothing to head', lone[1].kind === 'p');
  const blocks = I.editorialBlocks(I.parseBlocks(BEFORE, { rich: true }));
  ok('the benchmark’s five bold lines are read as the five headings they are', blocks.filter((b) => b.kind === 'h').map((b) => b.text).join('|') === '1. Clarify the goals|2. Understand your users|3. Design the flow|4. Test and iterate|5. Measure success', J(blocks.map((b) => b.kind)));
  const terms = I.editorialBlocks(I.parseBlocks('Three numbers say it:\n\n- **Activation:** the share who make a first map\n- **Time to value** — minutes from landing to that map\n- **Return:** who comes back within a week', { rich: true }));
  ok('a list whose every item is a label and its text becomes terms', terms[1].kind === 'terms' && terms[1].items.map((x) => x.label).join('|') === 'Activation|Time to value|Return' && terms[1].items[1].body === 'minutes from landing to that map', J(terms[1]));
  const mixed = I.editorialBlocks(I.parseBlocks('- **Activation:** the share\n- just a plain point', { rich: true }));
  ok('  a list with one plain item stays a list', mixed[0].kind === 'ul');
  ok('a lead: a short statement with substance after it', I.isLead({ kind: 'p', text: "The hard part isn't the screens — it's that Logos 5 asks people to think *with* it." }, 80));
  ok('  not a question, not a line introducing a list, not a long paragraph, not alone', !I.isLead({ kind: 'p', text: 'Who is this relaunch mostly for, returning users or new ones?' }, 80) && !I.isLead({ kind: 'p', text: 'Three things matter most here, in this order:' }, 80) && !I.isLead({ kind: 'p', text: 'word '.repeat(50).trim() + '.' }, 80) && !I.isLead({ kind: 'p', text: 'Sure, that works for me.' }, 4));
}

console.log('\n=== the page: folds, by a rule that only looks back ===');
{
  const final = layout(BEFORE);
  const folds = final.filter((p) => p.kind === 'fold');
  ok('the benchmark’s first part stays open; the later parts fold under their titles', final[0].lead === true && folds.length >= 3 && folds.every((f) => f.head > 1), kinds(final));
  ok('  each folded part shows its first words', folds.every((f) => f.preview.length > 10 && !/\*\*/.test(f.preview)), J(folds.map((f) => f.preview)));
  ok('  the closing question is never folded', final[final.length - 1].kind === 'ask');
  const blocks = I.editorialBlocks(I.parseBlocks(BEFORE, { rich: true }));
  const finalFolded = new Set(folds.map((f) => f.head));
  // every way the stream can be cut: at each blank line, inside paragraphs, inside a heading line
  const cuts = [];
  for (let i = 20; i < BEFORE.length; i += 37) cuts.push(i);
  let agree = true,
    why = '';
  for (const c of cuts) {
    const { settled, tail } = I.streamingSplit(BEFORE.slice(0, c), true);
    const mid = I.layoutReply(I.editorialBlocks(I.parseBlocks(settled, { rich: true }), { more: true }), { streaming: true, tail });
    const midBlocks = I.editorialBlocks(I.parseBlocks(settled, { rich: true }), { more: true });
    for (const p of mid) {
      if (p.kind === 'fold' && !p.writing && !finalFolded.has(p.head)) (agree = false), (why = `cut ${c}: part ${p.head} folded mid-stream, open when landed`);
      if (p.kind === 'block' && midBlocks[p.i]?.kind === 'h' && finalFolded.has(p.i)) (agree = false), (why = `cut ${c}: part ${p.i} open mid-stream, folded when landed`);
    }
  }
  ok(`folded mid-stream exactly as when landed, at ${cuts.length} places the stream could stop`, agree, why);
  // The same guarantee for a reply with no headings at all (lib/reply-layout.ts PARAGRAPH DISCLOSURE):
  // DEEPER's paragraphs alone, its ### lines taken out (and AFTER's middle paragraph added, so there is
  // enough of it to fold), fold after their first 140-odd words — and a paragraph is folded mid-stream
  // exactly when it is folded once landed (test/reply-disclosure.test.mjs holds the rest of it).
  const deepParas = DEEPER.replace(/^### .*\n\n/gm, '').split('\n\n');
  const plainDeep = [...deepParas.slice(0, 2), AFTER.split('\n\n')[1], ...deepParas.slice(2)].join('\n\n');
  const plainFinal = layout(plainDeep);
  const inFold = (ps) => new Set(ps.flatMap((p) => (p.kind === 'fold' ? p.body : [])));
  const plainFolded = inFold(plainFinal);
  ok('a reply with no headings folds too, once it has said enough', plainFinal.some((p) => p.kind === 'fold' && p.head === -1) && !plainFolded.has(0) && !plainFolded.has(1), kinds(plainFinal));
  let same = true,
    whyNot = '';
  for (let c = 20; c < plainDeep.length; c += 29) {
    const { settled, tail } = I.streamingSplit(plainDeep.slice(0, c), true);
    const mid = I.layoutReply(I.editorialBlocks(I.parseBlocks(settled, { rich: true }), { more: true }), { streaming: true, tail });
    const midFolded = inFold(mid);
    const settledCount = I.parseBlocks(settled, { rich: true }).length;
    for (let i = 0; i < settledCount; i++) if (plainFolded.has(i) !== midFolded.has(i)) {
      const lastLanded = I.parseBlocks(plainDeep, { rich: true }).length - 1;
      if (!(i === lastLanded && midFolded.has(i))) (same = false), (whyNot = `cut ${c}: paragraph ${i} ${midFolded.has(i) ? 'folded' : 'open'} mid-stream, ${plainFolded.has(i) ? 'folded' : 'open'} landed`);
    }
  }
  ok('  and folds the same paragraphs mid-stream as when landed (its closing line comes out at the end)', same, whyNot);
  const at = BEFORE.indexOf('**4. Test and iterate**') + '**4. Test and iterate**\n- Run usab'.length;
  const s = I.streamingSplit(BEFORE.slice(0, at), true);
  const writing = I.layoutReply(I.editorialBlocks(I.parseBlocks(s.settled, { rich: true }), { more: true }), { streaming: true, tail: s.tail });
  const last = writing[writing.length - 1];
  ok('a part being written under a folded title stays inside its fold, said as "Writing…"', last.kind === 'fold' && last.writing && last.body.includes(I.editorialBlocks(I.parseBlocks(s.settled, { rich: true }), { more: true }).length), J(last));
  const d = layout(DEEPER);
  ok('going deeper: the lead, the first part open, the rest folded', kinds(d).startsWith('lead b b') && d.filter((p) => p.kind === 'fold').length === 2, kinds(d));
  ok('  and its closing line — what it opens up next — kept in view, not folded into the last part', d[d.length - 1].kind === 'block' && /what brings them back the next day/.test(I.parseBlocks(DEEPER, { rich: true })[d[d.length - 1].i].text), kinds(d));
  const short = layout('A start.\n\n### One\n\nA few words in it.\n\n### Two\n\nAnd a few here.');
  ok('a short reply with parts does not fold at all', !short.some((p) => p.kind === 'fold'), kinds(short));
  const tiny = layout(`${'Words that set the scene and say what matters most here. '.repeat(3)}\n\n### First\n\n${'The first part has enough to say for itself, at some length. '.repeat(3)}\n\n### Second\n\nOnly a line.`);
  ok('a finished part too short to be worth a press is shown open', !tiny.some((p) => p.kind === 'fold'), kinds(tiny));
  const withPaths = layout(`${BEFORE.replace(/\n\nWould you like[\s\S]*$/, '')}\n\n${fence(PATHS)}`);
  ok('the ways onward are never folded, whatever comes before them', withPaths[withPaths.length - 1].kind === 'block' && I.parseBlocks(`${BEFORE.replace(/\n\nWould you like[\s\S]*$/, '')}\n\n${fence(PATHS)}`, { rich: true })[withPaths[withPaths.length - 1].i].kind === 'ui', kinds(withPaths));
}

console.log('\n=== drawn: a reply that reads like Socria ===');
{
  const a = reply(AFTER, { props: { onExplore: () => {} } });
  ok('the opening statement is set as the lead', /<p class="socria-lead"><span>The hard part isn/.test(a), a.slice(0, 300));
  ok('  the rest is prose, with nothing folded and no headings', !a.includes('socria-fold') && !a.includes('socria-h'));
  ok('the ways onward: a row each, a button that goes deeper', (a.match(/class="ln-path"/g) ?? []).length === 3 && a.includes('Go deeper: </span>') && a.includes('Where to take it') && !a.includes('ln-card'), a);
  ok('  each with its line on what opening it gives', a.includes('Moment by moment, from landing to their first map.'));
  const still = reply(AFTER);
  ok('  where nothing can be sent, they are the words they are', (still.match(/ln-path is-still/g) ?? []).length === 3 && !still.includes('<button type="button" class="ln-path"'));
  const done = reply(AFTER, { ui: { 0: { done: [0] } }, props: { onExplore: () => {} } });
  ok('  an explored way is marked, and stays there to come back to', done.includes('class="is-done"') && done.includes('Explored') && (done.match(/class="ln-path"/g) ?? []).length === 3);
  const b = reply(BEFORE);
  const lastDetails = b.lastIndexOf('</details>');
  ok('the old benchmark reply, drawn now: folded parts, the question after them', (b.match(/<details class="socria-fold"/g) ?? []).length >= 3 && b.indexOf('socria-ask') > lastDetails && b.includes('Open all'), b.slice(0, 200));
  ok('  each fold names its part and shows its first words, hidden from a screen reader as a repeat', /<span class="socria-fold-t">.*Understand your users|Design the flow/.test(b) && b.includes('class="socria-fold-p" aria-hidden="true"'));
  const dp = reply(DEEPER);
  ok('a reply’s parts are sections under the page’s one heading: h2, not a level skipped', dp.includes('<h2 class="socria-h socria-h3">') && !/<h[3-6][ >]/.test(dp), dp.slice(0, 400));
  const t = reply('Three numbers say it:\n\n- **Activation:** the share who make a first map\n- **Time to value** — minutes from landing to that map');
  ok('labelled items drawn as terms: the label, then what it says', t.includes('<ul class="socria-terms">') && t.includes('<span class="socria-term">') && t.includes('minutes from landing to that map'), t);
  const doc = html(h(I.RichText, { text: `# A document\n\n${'Words. '.repeat(30)}\n\n## Part one\n\n${'More words here. '.repeat(20)}\n\n## Part two\n\n${'Yet more. '.repeat(20)}`, rich: true }));
  ok('a document read in Content is not laid out as a reply: no lead, no folds', !doc.includes('socria-lead') && !doc.includes('socria-fold') && doc.includes('socria-h'));
  const junk = reply('Before.\n\n```ui\n{"type":"paths","items":[{"label":"Only one"}]}\n```\n\nAfter the block, the reply goes on.');
  ok('a block that is not valid draws nothing — the words around it stay', junk.includes('Before.') && junk.includes('After the block') && !junk.includes('ln-paths') && !junk.includes('&quot;'), junk);
  const half = html(h(I.StreamingRichText, { text: `${AFTER.slice(0, AFTER.indexOf('"items"'))}`, rich: true, editorial: true }));
  ok('streaming: a block still arriving is a quiet placeholder, never half a JSON', half.includes('ln-pending') && !half.includes('&quot;type'), half.slice(-300));
  const at = BEFORE.indexOf('**4. Test and iterate**') + '**4. Test and iterate**\n- Run usab'.length;
  const mid = html(h(I.StreamingRichText, { text: BEFORE.slice(0, at), rich: true, editorial: true }));
  ok('streaming: the part being written sits inside its fold, said as "Writing…", not spilled out', /Writing…<\/span><\/summary><div class="socria-fold-body">[\s\S]*class="is-tail"/.test(mid) && !mid.includes('Open all'), mid.slice(-400));
}

console.log('\n=== the pieces: paths and decide, as descriptions ===');
{
  const p = I.parseInlineSpec(J({ type: 'paths', items: [{ label: 'First way.', gist: 'what it gives' }, 'Second way', { label: 'first way' }, { label: '' }, { label: 'Third' }, { label: 'Fourth' }, { label: 'Fifth' }] }));
  ok('paths: cleaned — trailing marks off, a repeat dropped, at most four', p?.type === 'paths' && J(p.items.map((x) => x.label)) === J(['First way', 'Second way', 'Third', 'Fourth']) && p.items[0].gist === 'what it gives', J(p));
  ok('  one way is not a choice: nothing is drawn', I.parseInlineSpec(J({ type: 'paths', items: [{ label: 'Only one' }] })) === null);
  ok('  a way opened is plain words in their voice', I.pathAsk({ label: 'Sketch the first five minutes' }) === 'Go deeper: Sketch the first five minutes');
  const d = I.parseInlineSpec(J({ ...DECIDE, weights: [3, 3, 0, 0], rows: [...DECIDE.rows, { label: 'Bad', scores: [5, 1] }, { label: 'Short', scores: [1] }] }));
  ok('decide: cleaned — readings 0–3 only, rows that do not fit dropped', d?.type === 'decide' && d.rows.length === 4 && d.rows.every((r) => r.scores.every((v) => Number.isInteger(v) && v >= 0 && v <= 3)), J(d));
  ok('  and no weights from the reply: how much each thing matters is theirs to say', d && !('weights' in d));
  ok('  one thing to weigh is a sentence, not a framework; options must differ', I.parseInlineSpec(J({ ...DECIDE, rows: [DECIDE.rows[0]] })) === null && I.parseInlineSpec(J({ ...DECIDE, options: ['A', 'a'] })) === null);
  const ctx = { theirs: '', sources: '', questions: 0, shown: { n: 0 }, ownJudgment: true, guard: true };
  ok('  both pass the gate where a question may not go, and count toward two a reply', I.checkInlineSpec(d, ctx).ok && I.checkInlineSpec(I.parseInlineSpec(J(PATHS)), ctx).ok && !I.checkInlineSpec(d, ctx).ok);
  const words = I.contentAsText(AFTER);
  ok('as words, wherever a picture cannot go: copy, export, search', words.includes('Where to take it') && words.includes('- Sketch the first five minutes — Moment by moment') && !words.includes('```'), words.slice(-300));
  ok('  as the model reads it back on a later turn', /\[shown inline — paths: Where to take it/.test(I.contentForHistory(AFTER)));
  ok('  a decision in words: each reading out of three', /Time to a first map: Guided example 3\/3, Their own question 2\/3/.test(I.inlinePlainText(DECIDE)));
  const st = I.sanitizeInlineStateOne({ weights: [3, 2, 9, 1], scores: [[3, 1], [2, 2]], done: [0, 1] });
  ok('what they did with it is kept, cleaned: weights out of range are not', st && !st.weights && J(st.scores) === J([[3, 1], [2, 2]]) && J(st.done) === J([0, 1]), J(st));
  ok('  and good weights are', J(I.sanitizeInlineStateOne({ weights: [3, 2, 0, 1] })?.weights) === J([3, 2, 0, 1]));
}

console.log('\n=== decide: the leaning is arithmetic on their weights ===');
{
  const even = I.decideTally(DECIDE);
  ok('weighted evenly to begin with: the totals are the readings, summed', J(even.totals) === J([16, 18]) && even.most === 24 && J(even.leaders) === J([1]));
  ok('  said as arithmetic, and as theirs to change', I.decideLeaning(DECIDE, even) === 'Weighted evenly, Their own question comes out ahead — mostly on shows what Logos is for. Say what matters more and it may change.', I.decideLeaning(DECIDE, even));
  const theirs = I.decideTally(DECIDE, { weights: [3, 0, 3, 0] });
  ok('their weights decide it: speed and a blank start → the guided example', J(theirs.leaders) === J([0]) && /^With your weights, Guided example comes out ahead/.test(I.decideLeaning(DECIDE, theirs)), I.decideLeaning(DECIDE, theirs));
  ok('  a tie is said as a tie', /it’s even between Guided example and Their own question/.test(I.decideLeaning(DECIDE, I.decideTally(DECIDE, { weights: [0, 1, 1, 0] }))));
  ok('  nothing weighed, nothing leans', /Give at least one thing some weight/.test(I.decideLeaning(DECIDE, I.decideTally(DECIDE, { weights: [0, 0, 0, 0] }))));
  const drawn = reply(`It turns on what the first session is for.\n\n${fence(DECIDE)}`, { ui: { 0: { weights: [3, 2, 2, 2], scores: [[3, 2], [2, 3], [3, 1], [1, 3]] } } });
  ok('drawn: each weight and each reading a button that says what it is', drawn.includes('aria-label="How much Time to a first map matters to you: matters most. Press to change."') && drawn.includes('aria-label="Guided example on Shows what Logos is for: good, your reading. Press to change."') && drawn.includes('ln-rate is-theirs'), drawn.slice(0, 600));
  ok('  the leaning under it, live, in a sentence', /class="ln-decide-lean" aria-live="polite">With your weights, /.test(drawn));
  ok('  and the bars carry their totals for a screen reader', /role="img" aria-label="Guided example: \d+ of \d+"/.test(drawn));
  const art = I.artifactFromSpec({ ...DECIDE, weights: [3, 2, 0, 1], rows: DECIDE.rows.map((r, i) => (i === 1 ? { ...r, scores: [2, 3], theirs: [0] } : r)) });
  ok('opened in Artifacts: a comparison with their weights and readings, each marked as whose', art?.kind === 'compare' && J(art.state.criteria.map((c) => c.weight)) === J([10, 7, 0, 3]) && art.state.criteria.every((c) => c.by === 'person') && art.state.scores.find((x) => x.criterion === 'c2' && x.option === 'o1')?.by === 'person' && art.state.scores.find((x) => x.criterion === 'c1' && x.option === 'o1')?.by === 'socria' && art.state.view === 'ranking', J(art?.state.criteria));
  const made = I.makeDisplay(I.EMPTY_SPACE, art.kind, art.state, 'socria');
  ok('  and it is a real comparison the workspace accepts', made.ok, J(made).slice(0, 200));
}

console.log(`\nreply shape: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
