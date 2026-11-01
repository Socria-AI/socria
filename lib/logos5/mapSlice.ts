// lib/logos5/mapSlice.ts — THE LOGIC MAP, A FEW CARDS AT A TIME, IN THE CONVERSATION.
//
// Under a reply whose turn added ideas to the person's Logic Map, the cards it
// added are drawn there — at most four, in the shapes the map draws them in —
// with the full map a press away. What a card is called is what it is to the
// person ("You said", "Assumed", "Pulls against"), and one of Socria's that
// they kept says so: the map is theirs, and nothing is quietly made theirs.
//
// Pure: no React.

/** How each kind of idea reads, in the person's terms. */
const SAID: Record<string, string> = {
  goal: 'What you want',
  value: 'What matters to you',
  decision: 'Deciding',
  belief: 'You believe',
  idea: 'Your idea',
  assumption: 'Assumed',
  evidence: 'Evidence',
  question: 'Open question',
  tension: 'Pulls against',
  consequence: 'Would follow',
  claim: 'You said',
  counterpoint: 'Against it',
  source: 'Source',
  concept: 'Concept',
  misconception: 'A mix-up',
  theme: 'Theme',
  character: 'Character',
  constraint: 'Constraint',
  milestone: 'Milestone',
  given: 'Given',
  unknown: 'Solving for',
  equation: 'Equation',
  definition: 'Definition',
  transformation: 'Operation',
  theorem: 'Rule',
  step: 'Step',
  inference: 'So',
  verification: 'Checked',
  result: 'Result',
  error: 'Where it went wrong',
  axiom: 'Taken as true',
  lemma: 'Lemma',
  conjecture: 'Conjecture',
  counterexample: 'Counterexample',
};

export function cardSaid(type: string, origin?: string): string {
  const said = SAID[type] ?? (type ? type.replace(/[_-]+/g, ' ').replace(/^./, (c) => c.toUpperCase()) : 'Idea');
  return origin === 'socria' ? `${said} · kept from Socria` : origin === 'source' ? `${said} · from what you brought` : said;
}

/** The shape a card is drawn in: what they want (tinted), what pulls (rust, square), what is taken for granted (dashed), what is open (round), anything else (plain). */
export type CardShape = 'want' | 'pull' | 'taken' | 'open' | 'plain';
export function cardShape(type: string): CardShape {
  if (['goal', 'value', 'decision', 'result'].includes(type)) return 'want';
  if (['tension', 'error', 'misconception', 'counterexample', 'counterpoint'].includes(type)) return 'pull';
  if (['assumption', 'conjecture', 'axiom'].includes(type)) return 'taken';
  if (['question', 'unknown'].includes(type)) return 'open';
  return 'plain';
}

export interface SliceCard {
  id: string;
  label: string;
  type: string;
  origin?: string;
}

/** The cards a turn added, as the slice draws them: four at most, and how many more there are. */
export function sliceOf(cards: readonly SliceCard[], cap = 4): { shown: (SliceCard & { said: string; shape: CardShape })[]; more: number } {
  const shown = cards.slice(0, cap).map((c) => ({ ...c, said: cardSaid(c.type, c.origin), shape: cardShape(c.type) }));
  return { shown, more: Math.max(0, cards.length - shown.length) };
}
