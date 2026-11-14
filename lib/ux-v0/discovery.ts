// lib/ux-v0/discovery.ts — understanding what someone wants to make, a question at a time.
//
// Each turn sends what is known — the intent, the questions asked and how they
// were answered, the working understanding, how they have reacted to the
// moodboard — and asks for: the understanding, updated; the next one or two
// questions worth asking (or none); search queries for the moodboard, only
// when the visual direction moved; and whether there is enough to write the
// brief. Questions are adaptive and few: a topic already answered is never
// asked again, and a question is only worth asking if its answer would
// change the design.
//
// "Another direction" is the same call with a different task: queries (and,
// for palettes and type, alternatives) that deliberately contrast with what
// the person has kept so far.

import { fontMenu } from './fonts';
import {
  MOOD_CATEGORIES,
  TOPICS,
  TOPIC_LABEL,
  normalizePalette,
  normalizeQuestion,
  normalizeTypePair,
  normalizeUnderstanding,
  obj,
  arr,
  clean,
  oneOf,
  uid,
  type DiscoveryQuestion,
  type MoodCategory,
  type Moodboard,
  type Palette,
  type Topic,
  type TypePair,
  type Understanding,
} from './types';

export type Aspect = MoodCategory | 'palette' | 'type';
export const ASPECTS: readonly Aspect[] = ['imagery', 'texture', 'composition', 'palette', 'type'];

export interface DiscoverInput {
  intent: string;
  questions: DiscoveryQuestion[];
  understanding: Understanding;
  moodboard: Moodboard;
  /** a free remark from the composer, if they wrote one instead of answering */
  remark: string;
}

export interface DiscoverResult {
  understanding: Understanding;
  questions: DiscoveryQuestion[];
  queries: { category: MoodCategory; query: string }[];
  palettes: Palette[];
  type: TypePair[];
  ready: boolean;
  note: string;
}

const RULES = `Rules for questions:
- Ask only what would change the design. Skip anything the intent already answers.
- Never ask about a topic already answered. At most two questions per turn, usually one.
- An answer that is "not sure yet" leaves its topic open: do not record it as understood. If it matters, come back to it later in a more concrete form (an example, or answers to choose between); never ask it the same way again.
- Order: who it is for and what it must achieve first; then brand, visual direction, content and functionality; constraints and hierarchy when they matter.
- Each question gets "why" (one short sentence: why its answer matters to the design) and 2–5 short suggested answers that genuinely differ — not leading, not exhaustive. "multi": true when several answers can apply together.
- Topics: ${TOPICS.join(', ')}.

Rules for the moodboard:
- Only when the visual direction is new or moved, give search queries for a licensed photo library: concrete subjects, materials, light and mood (e.g. "morning light espresso bar marble counter", "handmade ceramic cup texture close up", "editorial magazine spread grid layout"). 2–6 queries, each with a category: imagery (photography of the subject world), texture (materials, surfaces, patterns), composition (layouts and compositions to learn from).
- Never repeat a query already used.
- Palettes: 0–2, each 4–6 colours as hex with roles (background, surface, text, muted, accent, accent-text, line), only when there is something to base them on.
- Type pairs: 0–2, display and body chosen ONLY from this list: ${fontMenu()}.

"ready": true only when the audience, the objective, the visual direction and the key content or functionality are understood well enough to write a brief.`;

export function discoverSystem(): string {
  return `You are SocriaUX, helping a designer work out what they want to make before anything is generated. You think with them, Socratically: a few precise questions, never a questionnaire. You never generate the design here.

${RULES}

Respond with ONE JSON object:
{"understanding": {"summary": "...", "known": {"<topic>": "..."}, "gaps": ["<topic>"]}, "questions": [{"topic": "...", "question": "...", "why": "...", "options": ["..."], "multi": false}], "moodboard": {"queries": [{"category": "imagery|texture|composition", "query": "..."}], "palettes": [{"name": "...", "colors": [{"hex": "#...", "role": "..."}]}], "type": [{"display": "...", "body": "...", "note": "..."}]}, "ready": false, "note": "one plain sentence reflecting back what is now understood"}`;
}

export function directionSystem(): string {
  return `You are SocriaUX. The designer asked to see another direction for one aspect of their moodboard. Propose a genuinely different, still appropriate direction — a contrast to what they have kept, not a variation of it — so they can compare and choose deliberately.

For imagery, texture or composition: 3–5 new search queries for that category (concrete subjects, materials, light, mood), none repeating earlier ones.
For palette: 2 palettes of 4–6 colours (hex, with roles background, surface, text, muted, accent, accent-text, line).
For type: 2 pairs, chosen ONLY from: ${fontMenu()}.

Respond with ONE JSON object: {"direction": "one sentence naming the contrasting direction", "moodboard": {"queries": [{"category": "...", "query": "..."}], "palettes": [...], "type": [...]}}`;
}

function moodSummary(m: Moodboard): string {
  const lines: string[] = [];
  for (const c of MOOD_CATEGORIES) {
    const kept = m.refs.filter((r) => r.category === c && r.state === 'kept').map((r) => r.title || r.query);
    const rejected = m.refs.filter((r) => r.category === c && r.state === 'rejected').map((r) => r.title || r.query);
    if (kept.length || rejected.length) lines.push(`${c}: kept ${kept.length ? kept.slice(0, 6).join('; ') : 'none'}${rejected.length ? ` — removed ${rejected.slice(0, 6).join('; ')}` : ''}`);
  }
  const keptPal = m.palettes.filter((p) => p.state === 'kept').map((p) => `${p.name} (${p.colors.map((c) => c.hex).join(' ')})`);
  const keptType = m.type.filter((t) => t.state === 'kept').map((t) => `${t.display} / ${t.body}`);
  if (keptPal.length) lines.push(`palettes kept: ${keptPal.join('; ')}`);
  if (keptType.length) lines.push(`type kept: ${keptType.join('; ')}`);
  if (m.queries.length) lines.push(`queries already used: ${m.queries.map((q) => `${q.category}: ${q.query}`).slice(-14).join(' | ')}`);
  return lines.join('\n') || 'empty so far';
}

export function discoverUser(input: DiscoverInput): string {
  const answered = input.questions.filter((q) => q.answer || q.skipped);
  const known = Object.entries(input.understanding.known)
    .map(([t, v]) => `- ${TOPIC_LABEL[t as Topic] ?? t}: ${v}`)
    .join('\n');
  return [
    `WHAT THEY WANT TO MAKE: “${input.intent}”`,
    answered.length
      ? `QUESTIONS SO FAR:\n${answered.map((q, i) => `${i + 1}. [${q.topic}] ${q.question}\n   → ${q.skipped ? '(skipped)' : unsure(q.answer) ? `(not sure yet: “${q.answer}”)` : q.answer}`).join('\n')}`
      : 'QUESTIONS SO FAR: none yet.',
    known ? `UNDERSTOOD SO FAR:\n${known}` : '',
    `THE MOODBOARD:\n${moodSummary(input.moodboard)}`,
    input.remark ? `THEY ALSO SAID: “${input.remark}”` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function directionUser(input: DiscoverInput, aspect: Aspect): string {
  return [`WHAT THEY WANT TO MAKE: “${input.intent}”`, input.understanding.summary ? `UNDERSTOOD: ${input.understanding.summary}` : '', `THE MOODBOARD:\n${moodSummary(input.moodboard)}`, `ANOTHER DIRECTION FOR: ${aspect}`].filter(Boolean).join('\n\n');
}

/** An answer saying the person does not know yet. The topic stays open: never recorded as known, askable again another way. */
export const unsure = (a: string) => /^\s*(?:i\s+)?(?:do\s*n[o'’]?t|really\s+don['’]?t)\s+know\b|^\s*(?:not\s+sure|no\s+idea|unsure|idk|dunno|no\s+clue|undecided|not\s+decided|haven['’]?t\s+decided)\b/i.test(a);

export const normQ = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();

/** Searches for the board from a model's list: each in a known category, none already used, at most `max`. */
export function readQueries(list: unknown, used: Set<string>, max = 6, only?: Aspect): { category: MoodCategory; query: string }[] {
  const queries: { category: MoodCategory; query: string }[] = [];
  for (const q of arr(list).map(obj)) {
    const query = clean(q.query, 100);
    const category = oneOf(q.category, MOOD_CATEGORIES, 'imagery');
    const key = normQ(query);
    if (!query || used.has(key)) continue;
    if (only && only !== 'palette' && only !== 'type' && category !== only) continue;
    used.add(key);
    queries.push({ category, query });
    if (queries.length >= max) break;
  }
  return queries;
}

function readMood(raw: unknown, used: Set<string>, only?: Aspect) {
  const m = obj(raw);
  const queries = readQueries(m.queries, used, 6, only);
  const palettes = arr(m.palettes).map(normalizePalette).filter((p): p is Palette => !!p).slice(0, 2);
  const type = arr(m.type).map(normalizeTypePair).filter((t): t is TypePair => !!t).slice(0, 2);
  return { queries, palettes, type };
}

export function parseDiscover(raw: unknown, input: DiscoverInput, now = Date.now()): DiscoverResult {
  const r = obj(raw);
  const understanding = normalizeUnderstanding(r.understanding);
  // what was answered stays known, whatever the model forgot
  for (const q of input.questions) if (q.answer && !unsure(q.answer) && !understanding.known[q.topic]) understanding.known[q.topic] = q.answer.slice(0, 400);
  // "not sure yet" is not knowing: drop it if the model wrote it down as understood
  for (const q of input.questions) if (q.answer && unsure(q.answer) && unsure(understanding.known[q.topic] ?? '')) delete understanding.known[q.topic];
  const answeredTopics = new Set(input.questions.filter((q) => q.answer && !unsure(q.answer)).map((q) => q.topic));
  const earlier = input.questions.map((q) => normQ(q.question));
  const questions: DiscoveryQuestion[] = [];
  for (const raw of arr(r.questions)) {
    const q = normalizeQuestion({ ...obj(raw), id: uid('q'), askedAt: now, answer: '', skipped: false });
    if (!q) continue;
    if (answeredTopics.has(q.topic) && !input.questions.some((x) => x.topic === q.topic && x.skipped)) continue;
    if (earlier.includes(normQ(q.question)) || questions.some((x) => normQ(x.question) === normQ(q.question))) continue;
    q.options = q.options.slice(0, 5);
    questions.push(q);
    if (questions.length >= 2) break;
  }
  const used = new Set(input.moodboard.queries.map((q) => normQ(q.query)));
  const mood = readMood(r.moodboard, used);
  const answered = input.questions.filter((q) => q.answer && !unsure(q.answer)).length;
  const knownCount = Object.keys(understanding.known).length;
  const ready = r.ready === true && (answered >= 2 || knownCount >= 4);
  return {
    understanding,
    questions: ready ? [] : questions,
    queries: mood.queries,
    palettes: mood.palettes,
    type: mood.type,
    ready: ready || (!questions.length && answered >= 3),
    note: clean(r.note, 300),
  };
}

export function parseDirection(raw: unknown, input: DiscoverInput, aspect: Aspect): { direction: string; queries: { category: MoodCategory; query: string }[]; palettes: Palette[]; type: TypePair[] } {
  const r = obj(raw);
  const used = new Set(input.moodboard.queries.map((q) => normQ(q.query)));
  const mood = readMood(r.moodboard, used, aspect);
  return {
    direction: clean(r.direction, 200),
    queries: aspect === 'palette' || aspect === 'type' ? [] : mood.queries,
    palettes: aspect === 'palette' ? mood.palettes : [],
    type: aspect === 'type' ? mood.type : [],
  };
}

/** The first question, asked without a model when there is no key or no answer: who it is for. */
export function openingQuestion(now = Date.now()): DiscoveryQuestion {
  return {
    id: uid('q'),
    topic: 'audience',
    question: 'Who is this for, and what do they come to it needing?',
    why: 'Everything else — tone, hierarchy, what goes first — follows from the person it serves.',
    options: [],
    multi: false,
    answer: '',
    skipped: false,
    askedAt: now,
  };
}
