// lib/onboarding-script.ts
//
// The first exchange, before there is an account to charge or a model to call.
//
// WHAT THIS IS. A new person types one real thing — the actual decision, the
// actual proof — and Socria asks them a question back that lands. No API
// call, no latency, no key: the question is chosen from a table by matching
// what they wrote. It is a rehearsal, and it is honest about being one,
// because the thing it is rehearsing is the only claim the product makes —
// that the useful move is a better question, not a faster answer.
//
// WHY NOT JUST CALL THE MODEL. Three reasons, and the third is the real one.
// It costs nothing and cannot rate-limit. It cannot fail in front of somebody
// who has known the product for nine seconds. And it is instant, which
// matters more here than anywhere else in the product: the whole effect
// depends on the reply arriving while they are still looking at their own
// sentence.
//
// WHAT COULD GO WRONG, and what the suite is therefore about. A table of
// regexes has exactly two failure modes and both are silent. A pattern that
// never fires means the careful question written for it is dead code nobody
// will ever see. A pattern that fires too broadly swallows the ones below it,
// and every person gets the same reply whatever they typed — which is the
// one outcome that would make this feel like a script instead of a reading.

export interface Intent {
  id: string;
  /** the numeral on the card */
  rn: string;
  title: string;
  detail: string;
  /** two real examples, pressable — they prefill rather than send */
  eg: [string, string];
  /** the fifth card is subordinate by design, not a fifth equal choice */
  wide?: boolean;
}

export const INTENTS: Intent[] = [
  {
    id: 'understand', rn: 'i', title: 'Understand something',
    detail: 'A concept, a proof, a paper that will not sit still.',
    eg: ['Why does integration by parts work?', 'What is bounded rationality?'],
  },
  {
    id: 'through', rn: 'ii', title: 'Think something through',
    detail: 'A decision you keep turning over and not landing.',
    eg: ['Whether to take the Berlin offer', 'Two co-founders, one seat'],
  },
  {
    id: 'challenge', rn: 'iii', title: 'Challenge my thinking',
    detail: 'You have a position. Have it tested properly.',
    eg: ['Remote work is better for most people', 'We should raise before shipping'],
  },
  {
    id: 'visualize', rn: 'iv', title: 'Visualize something',
    detail: 'See the shape of an argument you are already inside.',
    eg: ['My dissertation argument', 'Why this launch plan feels wrong'],
  },
  {
    // Deliberately subordinate: it exists so nobody has to pick a box that is
    // only nearly right, which is the commonest way these screens lose people.
    id: 'other', rn: 'v', title: 'Something else',
    detail: 'None of these quite fit. Bring it anyway.',
    eg: ['I am not sure yet, honestly', 'Something I cannot phrase properly'],
    wide: true,
  },
];

export interface Script {
  /** the question, with one <em> emphasis. OURS, never anything they typed. */
  q: string;
  /** what was noticed — an assumption, stated without resolving it */
  n: string;
  /** three labels for the drawn map: question, claim, assumption */
  map: [string, string, string];
}

/**
 * Keyed on what they actually typed. ORDER IS LOAD-BEARING: the first match
 * wins, so the specific patterns sit above the general ones, and
 * `should i|do i|am i` is last because it appears inside half the sentences
 * anybody writes about a decision and would otherwise eat the table.
 *
 * WORD BOUNDARIES ARE NOT DECORATION. The design's patterns were bare stems,
 * and `quit` matched inside `quite` — so "the weather is quite mild" was
 * answered with a question about why they were open to leaving their job.
 * `who` did the same inside `whole` and `whose`, `move` inside `remove`, and
 * `am i` inside `team is`. Whole words get \b; the genuine stems — `pric`,
 * `deriv`, `integrat`, `relocat`, `argu` — keep theirs on purpose, because
 * `pricing` and `derivative` are the words people actually type.
 */
export const MATCH: { k: RegExp; s: Script }[] = [
  { k: /\bjobs?\b|\boffer|salary|\bquit\b|promotion|\broles?\b|\bcompany\b/i, s: {
    q: 'Before the offer — <em>what made you open to leaving in the first place?</em>',
    n: 'You are weighing the new thing. You have not yet said what is wrong with the old one.',
    map: ['Should I take it?', 'It pays more', 'the move is about money'] } },
  { k: /co-?founder|partner|\bhir(e|ing)\b|\bteam\b|\bwho\b/i, s: {
    q: 'Set the two of them aside. <em>What does this seat actually need to be good at?</em>',
    n: 'You are comparing two people before naming the job.',
    map: ['Which co-founder?', 'Both are capable', 'the seat is well defined'] } },
  { k: /most people|everyone|nobody|better for/i, s: {
    q: '<em>“Most people”</em> is the load-bearing word. Who is it not true for?',
    n: '“Most people” has not been tested. It may mean people like you.',
    map: ['Is it better?', 'Better for most', '“most” = people like me'] } },
  { k: /\braise|\binvest|runway|funding|\bpric|\bmoney\b|\bcosts?\b/i, s: {
    q: 'Money is the second question. <em>What would you do differently with it — specifically?</em>',
    n: 'The amount is settled before the purpose is.',
    map: ['Raise now?', 'We need runway', 'more money changes the plan'] } },
  { k: /integrat|deriv|\blimit|proof|theorem|equation|solv|=/i, s: {
    q: 'Before the method — <em>what is the thing you are actually trying to undo?</em>',
    n: 'You are reaching for a technique before naming the structure.',
    map: ['How does it work?', 'I can apply it', 'the steps are the understanding'] } },
  { k: /essay|dissertation|\bargu|thesis|draft|chapter|paper/i, s: {
    q: 'Say the argument in one sentence. <em>If it takes two, you have two arguments.</em>',
    n: 'The draft is stuck where the claim is still doing two jobs.',
    map: ['What is it arguing?', 'One clear claim', 'the parts already agree'] } },
  { k: /\bmov(e|ing)\b|\bcity\b|relocat|abroad|\bleav(e|ing)\b/i, s: {
    q: 'Before the logistics — <em>are you moving toward something, or away from something?</em>',
    n: 'The destination is specified. The reason is not.',
    map: ['Should I move?', 'Somewhere new', 'the problem is the place'] } },
  { k: /\bshould i\b|\bdo i\b|\bam i\b/i, s: {
    q: 'Maybe. First — <em>what are you hoping I will say, and why that one?</em>',
    n: 'You have a preferred answer already. It is worth looking at.',
    map: ['Should I?', 'I am leaning one way', 'I want permission, not analysis'] } },
];

/** One per intent, for the sentences no pattern was written for. */
export const FALLBACK: Record<string, Script> = {
  understand: {
    q: 'Before the explanation — <em>what part of it do you already half-know?</em>',
    n: 'You are asking for the whole thing. Some of it is already yours.',
    map: ['What is this?', 'Some of it is clear', 'I understand none of it'] },
  through: {
    q: '<em>What would have to be true</em> for the answer to be obvious?',
    n: 'The decision is stuck because two conditions are unstated.',
    map: ['What should I do?', 'Two options', 'both are fully understood'] },
  challenge: {
    q: 'I will take the other side properly. <em>What is the strongest version of the case against you?</em>',
    n: 'You have stated the position. The objection has not been given its best form.',
    map: ['My position', 'I believe this', 'the counter-case is weak'] },
  visualize: {
    q: 'Before I draw it — <em>which two parts of it pull against each other?</em>',
    n: 'The shape is hard to see because a tension inside it is unnamed.',
    map: ['The argument', 'It holds together', 'nothing is in tension'] },
  other: {
    q: 'Start anywhere. <em>What is the part you keep coming back to?</em>',
    n: 'You have brought something unshaped. Finding its shape is the first useful move.',
    map: ['What is this?', 'Something is here', 'I need it defined to begin'] },
};

/**
 * The question for what they wrote.
 *
 * A pattern beats an intent, because what somebody TYPED is better evidence
 * than the box they pressed thirty seconds earlier — a person who picked
 * "Understand something" and then wrote about a job offer is thinking about a
 * job offer. An unknown intent falls through to `through`, which asks what
 * would have to be true, and is the least presumptuous question in the table.
 */
export function resolveScript(text: unknown, intentId?: unknown): Script {
  const s = typeof text === 'string' ? text : '';
  if (s.trim()) {
    const hit = MATCH.find((m) => m.k.test(s));
    if (hit) return hit.s;
  }
  const id = typeof intentId === 'string' ? intentId : '';
  return FALLBACK[id] ?? FALLBACK.through;
}

/** What beat iii hands to the chat, so they land in their own session. */
export const CARRY_KEY = 'socria.ob';

export interface Carried {
  text: string;
  intent: string | null;
  q: string;
  n: string;
}

/**
 * Read it back, once.
 *
 * Total, and it CLEARS as it reads: the handover is for exactly one landing,
 * and a key that survives would re-prefill the composer every time somebody
 * opened the chat afterwards.
 */
export function takeCarried(store: Pick<Storage, 'getItem' | 'removeItem'>): Carried | null {
  try {
    const raw = store.getItem(CARRY_KEY);
    if (!raw) return null;
    store.removeItem(CARRY_KEY);
    const v = JSON.parse(raw) as Partial<Carried>;
    if (!v || typeof v.text !== 'string' || !v.text.trim()) return null;
    return {
      text: v.text.slice(0, 2000),
      intent: typeof v.intent === 'string' ? v.intent.slice(0, 80) : null,
      q: typeof v.q === 'string' ? v.q.slice(0, 400) : '',
      n: typeof v.n === 'string' ? v.n.slice(0, 400) : '',
    };
  } catch {
    return null;
  }
}
