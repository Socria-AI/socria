// evals/engagement/scenarios.mjs — TWELVE CONVERSATIONS FOR THE ENGAGEMENT READING (lib/runtime/engagement.ts).
//
// Each scenario is a short scripted conversation. A turn has what the person says (`user`), what the reading
// should decide for it (`expect`: any of strategy, invitation, continuation, cue, cap, uptake — and `questions`,
// the move's final budget), and the reply that followed (`reply`), which becomes history for the next turn.
//
// THE REPLIES ARE SCRIPTED, NOT A MODEL'S. They exist so the next turn has something to answer, pass or close on,
// and — in the runner — so the stream gate has a reply to act on. `tempt`, where given, is a reply written the way
// a habit would write it (a closing question where none is wanted): the runner sends it through the real gate in
// both arms to show what reaches the person. Nothing here is evidence of what a model would say.
//
// Used by test/engagement.test.mjs (the decisions, in code) and evals/engagement/run.mjs (the real route, before
// and after; live with a key).

/** The reading's fields a turn may pin. Unlisted fields are not checked. */
export const FIELDS = ['strategy', 'invitation', 'continuation', 'cue', 'cap', 'uptake', 'questions'];

export const SCENARIOS = [
  {
    id: 'S01',
    name: 'An absurd question, asked for fun',
    wants: 'A real answer, enjoyed. Not a dry fact, and not a lesson.',
    turns: [
      {
        user: 'random question: could a T. rex beat 100 chickens in a fight?',
        expect: { strategy: 'play', invitation: 'subtle', continuation: 'answer', cue: 'forfun', cap: 1 },
        reply: 'Comfortably, on the arithmetic: a T. rex weighed about as much as 3,000 chickens, and the chickens have no way to hurt it. The catch is appetite — a hundred chickens is a snack it would have to chase one at a time.',
      },
      {
        user: 'lol ok but what if the chickens were also dinosaurs',
        expect: { strategy: 'play', cap: 1 },
      },
    ],
  },
  {
    id: 'S02',
    name: 'A casual conversation about an everyday thing',
    wants: 'Interest in what they said, in proportion. No help offered, no lesson, and a clean end when they go.',
    turns: [
      {
        // A LIMIT, ON PURPOSE. Something told in the first person reads the same in code whether it is tomatoes or
        // bad news ("just got back from the vet"), so the reading adds nothing here: the turn is what it is today,
        // and the model — which can tell the two apart — is left to it. What the reading does for this conversation
        // comes after: their answer is taken up first, and their goodbye is let go.
        user: 'just got back from the farmers market and bought way too many tomatoes again',
        expect: { strategy: 'direct', invitation: 'none', cue: null, cap: 1, questions: 1 },
        reply: "The farmers-market trap: they look so good that restraint fails. What's the plan — sauce, or a week of caprese?",
      },
      {
        user: "sauce probably, my grandmother's recipe takes like four hours though",
        expect: { strategy: 'build', continuation: 'deepen', cue: 'built', uptake: 'took' },
        reply: "Four hours is the point of it — that's what turns the tomatoes sweet. A slow Sunday job.",
      },
      {
        user: 'haha yeah. ok I should get going',
        expect: { strategy: 'close', invitation: 'none', continuation: 'conclude', cue: 'close', cap: 0, questions: 0 },
        tempt: 'Enjoy it. What else are you cooking this week?',
      },
    ],
    also: [
      // ANOTHER LIMIT, ON PURPOSE. "I should go <and do something>" is how people leave — and how they say "I
      // should go see a doctor about this lump". Code cannot tell the two apart, so only a leave-taking that is the
      // whole of its sentence closes a turn; this one is left as it is today.
      {
        history: [
          { role: 'user', content: 'just got back from the farmers market and bought way too many tomatoes again' },
          { role: 'assistant', content: "The farmers-market trap: they look so good that restraint fails. What's the plan — sauce, or a week of caprese?" },
          { role: 'user', content: "sauce probably, my grandmother's recipe takes like four hours though" },
          { role: 'assistant', content: "Four hours is the point of it — that's what turns the tomatoes sweet. A slow Sunday job." },
        ],
        user: 'haha yeah. ok I should go start chopping',
        expect: { cue: null, cap: 1 },
        tempt: 'Enjoy it. What else are you cooking this week?',
      },
      // a thought about the world, said out loud in the middle of small talk: that is met
      { user: "it's funny how tomatoes only taste of anything for about six weeks a year", expect: { strategy: 'build', invitation: 'explicit', continuation: 'explore', cue: 'aloud', cap: 1 } },
    ],
  },
  {
    id: 'S03',
    name: 'Good news, shared',
    wants: "Gladness about the thing itself, briefly — and the one question a friend would ask. No next steps.",
    turns: [
      {
        user: 'I got the internship!!',
        expect: { strategy: 'attune', invitation: 'explicit', continuation: 'invite', cue: 'goodnews', cap: 1, questions: 1 },
        reply: "That's a real one — congratulations. Which team is it with?",
      },
      {
        user: 'the data team at the transit agency, I start in June',
        expect: { strategy: 'build', cue: 'built', uptake: 'took' },
      },
    ],
  },
  {
    id: 'S04',
    name: 'Venting',
    wants: 'To be heard. Said in so many words: room, and nothing asked. Not said: one gentle question at most.',
    turns: [
      {
        user: 'ugh my manager moved the deadline up again without telling anyone. I just need to vent',
        expect: { strategy: 'attune', invitation: 'subtle', continuation: 'invite', cue: null, cap: 0, questions: 0 },
        tempt: 'That is infuriating — moving a deadline without a word is not on. Have you thought about raising it with them?',
      },
    ],
    also: [
      {
        user: 'rough day. my manager moved the deadline up again without telling anyone',
        expect: { strategy: 'attune', invitation: 'explicit', continuation: 'invite', cue: 'hardday', cap: 1 },
      },
    ],
  },
  {
    id: 'S05',
    name: 'An idea, explored',
    wants: 'A thinking partner: their idea taken up and pushed on, and a back-and-forth once there is one.',
    turns: [
      {
        user: "I've been thinking that cities are basically machines for making strangers trust each other",
        expect: { strategy: 'build', invitation: 'explicit', continuation: 'explore', cue: 'aloud', cap: 1 },
        reply: 'That fits how markets work too — rules and reputation standing in for knowing someone. What set you off on this?',
      },
      {
        user: 'walking through a street market where nobody knew each other and everything still worked',
        expect: { strategy: 'build', cue: 'built', uptake: 'took' },
        reply: 'Street markets are the cleanest case: prices, queues and the next stall watching do the work that knowing each other would.',
      },
      {
        user: 'and I think the trust part matters more than the density part',
        expect: { strategy: 'build', invitation: 'sustained', continuation: 'explore', cue: 'together', cap: 1 },
      },
    ],
    also: [
      { user: 'do you think free will is real?', expect: { strategy: 'hook', invitation: 'explicit', continuation: 'explore', cue: 'position' } },
      { user: 'I think social media is ruining attention spans', expect: { strategy: 'build', invitation: 'explicit', continuation: 'explore', cue: 'theirview' } },
    ],
  },
  {
    id: 'S06',
    name: 'Learning a difficult concept',
    wants: 'The explanation engine plans the question that makes them use it. This reading adds nothing to it.',
    turns: [
      {
        user: "I'm studying for my calc exam and I don't get why the harmonic series diverges",
        expect: { strategy: 'socratic', continuation: 'invite', cue: null, cap: 1 },
      },
    ],
    also: [
      // asked out of curiosity, not for an exam: one closing observation, and not on the reply after it
      { user: 'why is the sky blue?', expect: { strategy: 'hook', invitation: 'subtle', continuation: 'answer', cue: 'wonder', cap: 1 } },
      { user: "I've always wondered how planes actually stay up", expect: { strategy: 'hook', invitation: 'subtle', cue: 'wonder' } },
      // a reaction that shows interest, after the answer: one more step on the thread, as a statement
      {
        history: [
          { role: 'user', content: 'why is the sky blue?' },
          { role: 'assistant', content: 'Because air scatters short wavelengths of sunlight far more than long ones, so blue light reaches your eye from every direction.' },
        ],
        user: 'huh, I never knew that',
        expect: { strategy: 'hook', invitation: 'subtle', continuation: 'deepen', cue: 'more', cap: 1 },
      },
    ],
  },
  {
    id: 'S07',
    name: 'Brainstorming a startup',
    wants: 'Ideas, generously — and the choosing handed back.',
    turns: [
      {
        user: "let's brainstorm startup ideas around food waste on campus",
        expect: { strategy: 'build', invitation: 'explicit', continuation: 'explore', cue: 'riff', cap: 1, questions: 1 },
        reply: "A few, loosely: a last-hour discount board for the dining halls; a fridge-share between flats; a compost-for-credit scheme with the gardens; a 'rescued lunch' subscription. The one I'd pull on is the discount board — it needs no new behaviour from anyone. What could you actually get the dining halls to agree to?",
      },
      {
        user: 'they already throw out trays at 2pm, so probably posting what is left would be an easy yes',
        expect: { strategy: 'build', uptake: 'took' },
      },
    ],
  },
  {
    id: 'S08',
    name: 'A direct factual question',
    wants: 'The answer. Nothing after it.',
    turns: [
      {
        user: "what's the capital of Australia?",
        expect: { strategy: 'direct', invitation: 'none', continuation: 'answer', cue: null, questions: 0 },
        tempt: 'Canberra. Are you planning a trip?',
      },
    ],
    also: [{ user: 'convert 5 km to miles', expect: { strategy: 'direct', invitation: 'none', cue: null, questions: 0 } }],
  },
  {
    id: 'S09',
    name: "Socria's question, let pass",
    wants: 'The question is not repeated and nothing else is asked that turn. Two in a row, and questions wait.',
    history: [
      { role: 'user', content: 'I want to start running' },
      { role: 'assistant', content: 'Start with three short runs a week and build slowly — most people who stop, stop because they did too much in week one. What is drawing you to it: fitness, or something to clear your head?' },
    ],
    turns: [
      {
        user: 'how do I export my notes as a PDF?',
        expect: { strategy: 'direct', invitation: 'none', continuation: 'answer', cue: 'letgo', cap: 0, uptake: 'passed', questions: 0 },
        reply: 'From the menu at the top right of a note: Export, then PDF. Is this for sharing with someone, or for printing?',
        tempt: 'From the menu at the top right of a note: Export, then PDF. And what was it that drew you to running?',
      },
      {
        user: 'can it keep the headings?',
        expect: { invitation: 'none', cue: 'letgo', cap: 0, uptake: 'passed', questions: 0 },
        reply: 'Yes — headings come through as PDF headings, so the outline works in a reader.',
      },
      {
        user: 'ok and what about images',
        // two questions let pass in a row: none is asked for the next few replies, whatever else is read
        expect: { cap: 0, questions: 0 },
      },
    ],
  },
  {
    id: 'S10',
    name: "Socria's reasoning, challenged",
    wants: 'The objection engaged on its merits, first — not the earlier answer said again.',
    history: [
      { role: 'user', content: 'why is the sky blue?' },
      { role: 'assistant', content: 'Because air scatters short wavelengths of sunlight far more than long ones, so blue light reaches your eye from every direction.' },
    ],
    turns: [
      {
        user: "no, that's wrong — it should be violet then, violet scatters even more",
        expect: { strategy: 'build', invitation: 'subtle', continuation: 'deepen', cue: 'objection', cap: 1 },
      },
    ],
    also: [
      // not an objection to the answer: the reply missed what they asked. The repair is the move's; nothing is invited,
      // and the question that finds out what they meant is not taken away
      { user: "that's not what I meant", expect: { strategy: 'direct', invitation: 'none', cue: null, cap: 1 } },
      { user: "that didn't answer my question", expect: { strategy: 'direct', invitation: 'none', cue: null, cap: 1 } },
    ],
  },
  {
    id: 'S11',
    name: 'Wanting to conclude',
    wants: 'One line back, in kind. No question, no offer, nothing new.',
    history: [
      { role: 'user', content: 'why is the sky blue?' },
      { role: 'assistant', content: 'Because air scatters short wavelengths of sunlight far more than long ones, so blue light reaches your eye from every direction.' },
    ],
    turns: [
      {
        user: 'got it, thanks!',
        expect: { strategy: 'close', invitation: 'none', continuation: 'conclude', cue: 'close', cap: 0, questions: 0 },
        tempt: 'Anytime. What are you looking into next?',
      },
    ],
    also: [
      { user: "that's all for now, bye", expect: { strategy: 'close', continuation: 'conclude', cue: 'close', cap: 0 } },
      { user: 'ok', expect: { strategy: 'close', continuation: 'conclude', cue: 'settled', cap: 0 } },
      { user: "ok I'll think about it", expect: { strategy: 'close', continuation: 'conclude', cue: 'close', cap: 0 } },
      // not a close: "go on" asks for more
      { user: 'go on', expect: { continuation: 'deepen', cue: null, cap: 1 } },
    ],
  },
  {
    id: 'S12',
    name: 'A long conversation whose intentions change',
    wants: 'Each turn met as what it is: a hello, a fact, curiosity, their own idea, pushback, a joke, their own work, "just tell me", news, a goodbye.',
    turns: [
      { user: 'hey', expect: { strategy: 'attune', invitation: 'subtle', continuation: 'answer', cue: null }, reply: 'Hey. Good to see you.' },
      {
        user: 'what temperature does water boil at in Denver?',
        expect: { strategy: 'direct', invitation: 'none', cue: null },
        reply: 'About 95 °C (203 °F): Denver sits a mile up, and water boils roughly 1 °C lower for every 300 m of altitude.',
      },
      {
        user: "huh, I've always wondered why altitude does that",
        expect: { strategy: 'hook', invitation: 'subtle', cue: 'wonder' },
        reply: 'Boiling is the moment the water’s own vapour pressure matches the air pressing down on it. Higher up there is less air above you, so the water gets there at a lower temperature. It is also why food takes longer to cook up there: the water never gets as hot.',
      },
      {
        user: 'I think that means a pressure cooker is basically bringing sea level back, or even going below it',
        expect: { strategy: 'build', cue: 'theirview' },
        reply: 'That is exactly it, and "below" is the right instinct: a pressure cooker runs at about twice sea-level pressure, so water boils near 120 °C. What do you think happens to cooking time at that temperature?',
      },
      {
        user: "no wait, that can't be right — if it boils at 120 then it never boils on a normal stove",
        expect: { strategy: 'build', continuation: 'deepen', cue: 'objection' },
        reply: 'It does boil: the sealed pot traps steam, the pressure climbs, and the boiling point climbs with it until the valve holds it at about 120 °C. The stove only has to keep adding heat.',
      },
      { user: 'lol ok fine you win', expect: { strategy: 'play', cue: null }, reply: 'I will take it. The valve did most of the work.' },
      {
        user: 'can you check my homework: the integral of x e^x dx, I got x e^x - e^x + C',
        expect: { strategy: 'socratic', cue: null },
        reply: 'That is right: differentiate it and the e^x terms cancel, leaving x e^x.',
      },
      { user: 'just tell me the next one: integral of x cos x dx', expect: { strategy: 'direct', invitation: 'none', cue: null, questions: 0 }, reply: 'x sin x + cos x + C.' },
      {
        // met as news, whatever came before it. No question is invited: "just tell me", one turn ago, closed the
        // budget for a while (Core 4, MR), and their words about how to be helped outrank this reading.
        user: 'also I passed my driving test today!!',
        expect: { strategy: 'attune', invitation: 'subtle', continuation: 'invite', cue: null, questions: 0 },
        reply: 'Today, on top of the calculus — well done. That is a good day.',
      },
      // something said, and then that they are going: what they said is answered as it would be, and nothing is asked
      { user: "took me two tries, but who's counting. thanks, that's all for today", expect: { strategy: 'direct', continuation: 'conclude', cue: null, cap: 0, questions: 0 }, tempt: 'Nobody is. Well earned. What are you going to drive first?' },
    ],
  },
];

/** Every turn of every scenario, with the history it is said in: the main thread, then each "also" from the scenario's start. */
export function turnsOf(scenario) {
  const out = [];
  const history = [...(scenario.history ?? [])];
  scenario.turns.forEach((t, i) => {
    out.push({ id: `${scenario.id}.${i + 1}`, history: [...history], ...t });
    history.push({ role: 'user', content: t.user });
    if (t.reply) history.push({ role: 'assistant', content: t.reply });
  });
  (scenario.also ?? []).forEach((t, i) => out.push({ id: `${scenario.id}.also${i + 1}`, history: [...(scenario.history ?? [])], ...t }));
  return out;
}
