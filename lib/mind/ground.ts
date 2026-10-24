// lib/mind/ground.ts — WHAT WAS SAID, CHECKED AGAINST THE WORDS.
//
// The extractor is a model, and its "stated" is a claim about what was said,
// not a record of it. The register decides everything downstream (gate.ts):
// a stated claim is believed on first sight; an inferred one is tentative,
// and a claim about the person waits for a second conversation. A model that
// labels its own reading "stated" therefore turned an inference into a fact
// with nobody looking — the one thing the Mind Graph promises never happens.
//
// So a claim labelled stated (or established) is held, here, to the person's
// OWN words: their half of the turn, without Socria's reply and without the
// text of anything they attached. One those words do not carry is stored as
// what it is — Socria's reading, `inferred`. A file is held further: a
// document says things; the person did not. Nothing read from one is stated
// by them (`fromFile`).
//
// Deterministic, and deliberately conservative: a true statement paraphrased
// past recognition waits for a second sighting; a false one is never believed
// on one. A claim that keeps the words but loses a "not" is not grounded.
//
// Pure.

import type { EdgeCandidate, NodeCandidate } from './apply';
import { isGeneralising } from './types';

const STOP = new Set(
  (
    'a an and are as at be been being but by can could did do does doing for from had has have having he her hers him his how i if in into is it its ' +
    'just me more most my no nor not of off on once only or other our ours out over own same she should so some such than that the their theirs them ' +
    'then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your ' +
    'yours im ive id dont doesnt didnt isnt wasnt cant wont really also about like get got gets going go want wants make makes thing things one ones ' +
    'user person their they them themself themselves someone people'
  ).split(' ')
);

const NEGATION = /\b(?:not|no|never|none|nobody|nothing|neither|nor|hardly|without)\b|n't\b|\b(?:dont|doesnt|didnt|isnt|wasnt|cant|wont|cannot)\b/i;
/** The same words, one at a time, with the apostrophes taken out as the reading takes them out. */
const NEGATOR = new Set(['not', 'no', 'never', 'none', 'nobody', 'nothing', 'neither', 'nor', 'hardly', 'without', 'dont', 'doesnt', 'didnt', 'isnt', 'wasnt', 'arent', 'werent', 'cant', 'wont', 'cannot', 'shouldnt', 'wouldnt', 'couldnt', 'hasnt', 'havent', 'aint', 'nt']);

/** "working" → "work", "studies" → "study", "liked" → "like": enough to meet a paraphrase halfway. */
function stem(w: string): string {
  if (w.length > 5 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  for (const suf of ['ingly', 'edly', 'ing', 'ers', 'er', 'ed', 'ly', 'es', 's']) {
    if (w.length - suf.length >= 3 && w.endsWith(suf)) return w.slice(0, -suf.length);
  }
  return w;
}

/** The words that carry meaning, stemmed. A hyphenated word is one word ("long-term" → "longterm"). */
export function stemsOf(text: string): string[] {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/([a-z0-9])-(?=[a-z0-9])/g, '$1')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .map(stem);
}

/**
 * The person's own words in a turn as the extractor reads it ("User: … /
 * Socria: …"): their half only, and not the text of a file or a picture they
 * attached (lib/chat-attachments.ts forMemory appends those after it).
 */
export function ownWords(turn: string): string {
  const theirs = String(turn ?? '').split(/\n\nSocria:/)[0].replace(/^User:\s*/, '');
  return theirs.split(/(?:^|\n\n)\[(?:File|Image) they attached/)[0].trim();
}

/**
 * A word of the claim, met in theirs: the same stem; or, for a long word, the
 * same first six letters ("entrepreneurship", "entrepreneur"); or written as
 * one word or two ("long term", "longterm").
 */
const meets = (s: string, said: ReadonlySet<string>, saidList: readonly string[], joined: string) =>
  said.has(s) || (s.length >= 6 && (saidList.some((w) => w.length >= 6 && w.slice(0, 6) === s.slice(0, 6)) || joined.includes(s)));

/**
 * Do their words carry this claim? Most of its name, or at least two of the
 * words of its content — and the same polarity: "I'm not vegetarian" does not
 * ground "Vegetarian".
 */
export function groundedIn(claim: { label: string; content: string }, said: string): boolean {
  const saidList = stemsOf(said);
  if (!saidList.length) return false;
  const saidSet = new Set(saidList);
  const joined = String(said).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const label = [...new Set(stemsOf(claim.label))];
  const content = [...new Set(stemsOf(claim.content))];
  const hitLabel = label.filter((s) => meets(s, saidSet, saidList, joined));
  const hitContent = content.filter((s) => meets(s, saidSet, saidList, joined));
  const carried =
    (label.length > 0 && hitLabel.length / label.length >= 0.6) ||
    (hitContent.length >= 2 && hitContent.length / Math.max(1, content.length) >= 0.4);
  if (!carried) return false;
  // THE SAME POLARITY. A word of the claim negated where they said it ("not",
  // "never", "don't" within the three words before it) against a claim with
  // no negation, or the other way round, is a different claim: "I'm not
  // vegetarian" does not ground "Vegetarian". Read word by word, not sentence
  // by sentence — "I'm vegetarian, so no meat" negates the meat, not them.
  const hits = new Set([...hitLabel, ...hitContent]);
  const claimNegated = NEGATION.test(`${claim.label} ${claim.content}`);
  const words = String(said)
    .toLowerCase()
    .replace(/[’']/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  let negatedHit = false;
  let plainHit = false;
  words.forEach((w, i) => {
    if (w.length < 3 || STOP.has(w) || !hits.has(stem(w))) return;
    const before = words.slice(Math.max(0, i - 3), i);
    if (before.some((b) => NEGATOR.has(b))) negatedHit = true;
    else plainHit = true;
  });
  if (!claimNegated && negatedHit && !plainHit) return false;
  if (claimNegated && !negatedHit) return false;
  return true;
}

const ASSERTS = new Set(['stated', 'established']);
/**
 * What is held to their words in a turn: the registers that let a claim land
 * on first sight — stated, established — and `tentative`, which is also what
 * a model response lands on when it leaves `kind` out (lib/mind/extract.ts).
 */
const CHECKED = new Set(['stated', 'established', 'tentative']);

/**
 * A turn's candidates, held to the person's words: a stated claim their
 * words do not carry becomes Socria's reading. The name read from their own
 * sentence (`restated`) is already their words. An edge between two claims is
 * no surer than its ends.
 */
export function groundCandidates(
  nodes: readonly NodeCandidate[],
  edges: readonly EdgeCandidate[],
  turn: string
): { nodes: NodeCandidate[]; edges: EdgeCandidate[]; downgraded: string[] } {
  const said = ownWords(turn);
  const downgraded: string[] = [];
  const out = nodes.map((n) => {
    if (!CHECKED.has(n.kind) || n.restated || groundedIn(n, said)) return n;
    downgraded.push(n.label);
    return { ...n, kind: 'inferred' as const };
  });
  const weak = new Set(downgraded.map((l) => l.toLowerCase()));
  const outEdges = edges.map((e) => (ASSERTS.has(e.kind) && (weak.has(e.sourceLabel.toLowerCase()) || weak.has(e.targetLabel.toLowerCase())) ? { ...e, kind: 'inferred' as const } : e));
  return { nodes: out, edges: outEdges, downgraded };
}

/** Knowledge a document can teach — as long as it is not about the person. */
const KNOWLEDGE = new Set(['concept', 'insight']);
/** The extractor writes a claim about the person in the third person ("They prefer…"). */
const ABOUT_THEM = /\b(?:they|their|theirs|them|themselves|the user|the person|i|my|me|mine)\b/i;

/**
 * What a FILE taught: never stated by the person. A thing in the world or
 * something that happened stays as the file says it; knowledge — a concept,
 * an insight that is not about them — is what it is, found in a source
 * (`researched`); a claim about the person is kept but tentative, never
 * overwriting their own words, until they confirm it. The one thing the
 * ingestion itself knows — that a claim came from this file (`derived_from`)
 * — stays stated.
 */
export function fromFile(nodes: readonly NodeCandidate[], edges: readonly EdgeCandidate[]): { nodes: NodeCandidate[]; edges: EdgeCandidate[] } {
  const person = new Set<string>();
  const out = nodes.map((n) => {
    if (!ASSERTS.has(n.kind) || !isGeneralising(n.type)) return n;
    if (KNOWLEDGE.has(String(n.type).toLowerCase()) && !ABOUT_THEM.test(`${n.label} ${n.content}`)) return { ...n, kind: 'researched' as const };
    person.add(n.label.toLowerCase());
    return { ...n, kind: 'tentative' as const };
  });
  return {
    nodes: out,
    edges: edges.map((e) =>
      ASSERTS.has(e.kind) && e.relationship !== 'derived_from' && (person.has(e.sourceLabel.toLowerCase()) || person.has(e.targetLabel.toLowerCase())) ? { ...e, kind: 'tentative' as const } : e
    ),
  };
}
