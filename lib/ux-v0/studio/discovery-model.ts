// lib/ux-v0/studio/discovery-model.ts — what the model is told when it writes SocriaUX's next creative question, and
// how what it writes is held to shape.
//
// The model reads the conversation as it stands (what the person asked for, what they have said and chosen since,
// what is already known, the questions asked and how each was answered, what SocriaUX's own reader would ask next and
// how many questions are left) and decides one thing: ask one more question — written for this brief, with options
// generated for it — or say that the brief is enough and the work should be made. It never draws and never decides the
// design: its palettes, pairings of faces and moods are offers the person chooses from, and what is chosen lands on the
// decisions the engines already read (./discovery.ts applyChoice).
//
// What it writes is held to its shape twice: by the strict schema below (the provider cannot return a face outside the
// font library, a quality outside the engine's vocabulary, a colour that is not a colour) and by normalizeDiscovery-
// Question and the conversation's own rules here (never a question already asked or already answered by the brief,
// never more than two visual questions, never past the budget). When the model cannot be reached, the reader's question
// (./discovery.ts discoveryQuestion) is asked instead; nothing waits on this.

import { FONTS } from '../fonts';
import { QUALITIES, THEMES, TYPE_CHARACTERS } from '../graphics/creative/lexicon';
import { FORM_KINDS } from '../graphics/creative/forms';
import { DOMAINS } from '../graphics/generative/lexicon';
import type { StudioMode, StudioState } from './schema';
import { readFacts } from './facts';
import { creativeNeeds, knownOf, MAX_CREATIVE_QUESTIONS, normalizeDiscoveryQuestion, visualBudget, DISCOVERY_KINDS, type DiscoveryQuestion, type Known } from './discovery';

/** The conversation as the model reads it: compact, in words, nothing it does not need. */
export interface QuestionContext {
  mode: StudioMode;
  /** the kind of work, said plainly ("poster", "logo", "website", "campaign") */
  kind: string;
  /** everything the person has said, in order (cut short) */
  brief: string;
  /** what the subject is, as the engine reads it (food and drink, music…) */
  subject: string[];
  known: Known;
  /** decisions made so far, in words ("colours: Cream and terracotta, #f6f4ed / #c57221") */
  decided: string[];
  /** the creative questions asked before, and how each was answered */
  asked: { decides: string; text: string; answer: string }[];
  /** what SocriaUX's own reader would ask next, in order */
  open: string[];
  /** questions left in this conversation */
  remaining: number;
  /** visual questions (colour, type, vibe) already asked */
  visualAsked: number;
  /** visual questions the brief still leaves room for (./discovery.ts visualBudget) */
  visualLeft: number;
  pictures: number;
}

const P = { graphic: 'g', logo: 'l', website: 'w', board: 'b', system: 's', critique: 'c' } as const;
const VISUAL = new Set(['colour', 'type', 'vibe']);
const s = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');
const o = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
const TOPIC = /^[a-z]{2,16}$/;
const MODES: readonly StudioMode[] = ['graphic', 'logo', 'website', 'board', 'system', 'critique'];

const KIND_OF: Record<StudioMode, string> = { graphic: 'graphic', logo: 'logo', website: 'website', board: 'campaign', system: 'design system', critique: 'critique' };

/** The key an answer to a question of this kind is kept under. */
const keyFor = (st: Pick<StudioState, 'mode'>, decides: string) => {
  const p = P[st.mode];
  return decides === 'colour' ? `${p}.palette` : decides === 'type' ? `${p}.type` : decides === 'vibe' ? `${p}.vibe` : decides === 'purpose' ? 'w.purpose' : decides === 'about' ? 'l.about' : decides === 'pictures' ? `${p}.pictures` : `d.${decides}`;
};

/** How a question was answered, in words: the option chosen, the person's own words, or skipped. */
function answeredAs(st: StudioState, decides: string): string {
  const a = st.answers[keyFor(st, decides)];
  if (!a) return 'not answered';
  if (a.skipped) return 'skipped — left to SocriaUX';
  const f = a.fields ?? {};
  const parts = [f.name, a.text, f.ground && f.accent ? `${f.ground} / ${f.ink ?? ''} / ${f.accent}` : '', f.display ? `${f.display}${f.body && f.body !== f.display ? ` with ${f.body}` : ''}` : '', a.values.length && !f.name ? a.values.join(', ') : ''].filter(Boolean);
  return parts.join(' — ').slice(0, 200) || 'answered';
}

/**
 * The conversation as the model reads it, with the question waiting (the reader's, which the model may replace) left
 * out of what was asked and put first among what is open. Null for kinds of work that ask no creative questions.
 */
export function questionContextOf(st: StudioState): QuestionContext | null {
  if (st.mode === 'system' || st.mode === 'critique') return null;
  const p = P[st.mode];
  const waiting = st.pending === 'discover' ? st.discovery?.current : undefined;
  const asked = (st.discovery?.asked ?? []).filter((d) => d !== waiting?.decides);
  // what the reader would ask with the waiting question not yet asked
  const before: StudioState = { ...st, ...(st.discovery ? { discovery: { ...st.discovery, asked, current: undefined } } : {}) };
  const open = creativeNeeds(before);
  const facts = readFacts(st.prompt);
  const kind = st.mode === 'graphic' ? (st.answers['g.kind']?.values[0] ?? facts.kind ?? 'graphic') : KIND_OF[st.mode];
  const decided: string[] = [];
  for (const [decides, label] of [['vibe', 'feel'], ['colour', 'colours'], ['type', 'typefaces']] as const) {
    const a = st.answers[keyFor(st, decides)];
    if (a && !a.skipped && a.source !== 'socria') decided.push(`${label}: ${answeredAs(st, decides)}`.slice(0, 220));
  }
  const mood = st.answers[`${p}.personality`]?.values ?? [];
  if (mood.length) decided.push(`personality: ${mood.join(', ')}`);
  const look = st.answers[`${p}.look`]?.text;
  if (look) decided.push(`look: ${look.slice(0, 200)}`);
  const words = st.answers[`${p}.words`]?.fields ?? st.answers['w.words']?.fields ?? {};
  const named = st.answers['l.name']?.fields?.name;
  if (words.headline || named) decided.push(`its words: “${(named || words.headline || '').slice(0, 80)}”${words.subhead ? `, “${words.subhead.slice(0, 80)}”` : ''}`);
  return {
    mode: st.mode,
    kind,
    brief: st.prompt.slice(0, 1200),
    subject: DOMAINS.filter((d) => facts.domains.includes(d.id)).map((d) => d.label).slice(0, 3),
    known: knownOf(before),
    decided: decided.slice(0, 8),
    asked: asked.slice(0, 6).map((d) => ({ decides: d, text: '', answer: answeredAs(st, d) })),
    open: waiting && !open.includes(waiting.decides) ? [waiting.decides, ...open] : open,
    remaining: Math.max(0, MAX_CREATIVE_QUESTIONS - asked.length),
    visualAsked: asked.filter((d) => VISUAL.has(d)).length,
    visualLeft: Math.max(0, Math.min(2, visualBudget(before)) - asked.filter((d) => VISUAL.has(d)).length),
    pictures: st.attachments.filter((a) => a.kind === 'image').length,
  };
}

/** A context sent by the browser, held to its shape and size before it reaches a prompt. */
export function normalizeQuestionContext(v: unknown): QuestionContext | null {
  const r = o(v);
  const mode = MODES.includes(r.mode) ? (r.mode as StudioMode) : null;
  if (!mode || mode === 'system' || mode === 'critique') return null;
  const brief = s(r.brief, 1200);
  if (!brief) return null;
  const k = o(r.known);
  const bool = (x: unknown) => x === true;
  const arr = (x: unknown, n: number) => (Array.isArray(x) ? x.slice(0, n) : []);
  const asked = arr(r.asked, 6)
    .map((x) => ({ decides: s(o(x).decides, 16), text: s(o(x).text, 200), answer: s(o(x).answer, 200) }))
    .filter((x) => TOPIC.test(x.decides));
  return {
    mode,
    kind: s(r.kind, 40) || KIND_OF[mode],
    brief,
    subject: arr(r.subject, 3).map((x) => s(x, 40)).filter(Boolean),
    known: { palette: bool(k.palette), type: bool(k.type), vibe: bool(k.vibe), purpose: bool(k.purpose), about: bool(k.about), pictures: k.pictures !== false },
    decided: arr(r.decided, 8).map((x) => s(x, 220)).filter(Boolean),
    asked,
    open: arr(r.open, 6).map((x) => s(x, 16)).filter((x) => TOPIC.test(x)),
    // the budget is the conversation's, never the browser's to raise
    remaining: Math.max(0, Math.min(MAX_CREATIVE_QUESTIONS - asked.length, Number.isFinite(Number(r.remaining)) ? Math.floor(Number(r.remaining)) : 0)),
    visualAsked: Math.max(asked.filter((x) => VISUAL.has(x.decides)).length, Math.min(3, Math.max(0, Math.floor(Number(r.visualAsked) || 0)))),
    // never more than two visual questions in a conversation, whatever the browser says
    visualLeft: Math.max(0, Math.min(2 - asked.filter((x) => VISUAL.has(x.decides)).length, Math.floor(Number(r.visualLeft) || 0))),
    pictures: Math.max(0, Math.min(16, Math.floor(Number(r.pictures) || 0))),
  };
}

/** The instructions: the same for every conversation (cacheable), the rules of asking, the vocabulary and the faces. */
export function questionsSystem(): string {
  return [
    'You are the creative director inside SocriaUX, a design studio. Someone has asked, in a sentence or two, for a piece of design: a poster, a social post, a logo, a website, a campaign. Before it is made you may ask a few questions — the kind a good creative director asks: few, insightful, and only those whose answers would change the work. Then SocriaUX makes it at once; there is no separate approval of a direction.',
    '',
    'DECIDE',
    '1. Read the brief, what is already known and decided, and the questions asked before with their answers. Never ask for anything already said or chosen. Never ask a question again.',
    '2. If the brief is enough to make something good, answer ready: true and question: null. A detailed brief is made at once. When questions remain worth asking, answer ready: false and one question.',
    '3. OPEN lists what SocriaUX would ask next, in order: prefer its first item unless another question would clearly change this particular work more. REMAINING is how many questions are left; with none left, answer ready.',
    '4. Content that changes the work comes before taste: what a logo’s business does or stands for, what people should be able to do on a website, whether pictures the person brought are placed in the design or only lend their look.',
    '5. Visual questions are optional aids that help a person discover their taste — ask one only when the brief leaves it open and it matters for this kind of work (a logo is mostly its lettering; a poster or a campaign mostly its feel). When the brief already says how the work should feel, its colours and lettering follow from that: do not ask them. Never more visual questions than VISUAL QUESTIONS STILL ALLOWED, never all three kinds.',
    '',
    'KINDS OF QUESTION',
    'vibe — three or four moods written for this brief and its subject, as different from each other as the subject allows (not a list of generic styles). Each: a short name (two or three plain words), a one-line note saying what it would look like, the engine qualities it is made of (one to three), a theme only when the mood is a world (clouds, the ocean…), a type character, its own colours (ground, ink readable on the ground, accent) and a form.',
    'colour — three or four palettes for this brief (after a mood was chosen, palettes for that mood). Each: ground, ink (at least 4.5:1 on the ground), accent, up to three support colours, a short name and a note on how the colours relate.',
    'type — three pairings from the FONT LIBRARY only: a display face and a body face that is a text face, each a different typographic personality that suits this work, named by that personality, with a note. Weight 100–900; case upper or none.',
    'text — a short question with two to four suggested answers, each a label and the words it stands for, written for this brief. decides names what it settles in one lowercase word (about, purpose, pictures, audience, occasion…).',
    '',
    'VOICE',
    'The question is said to the person: second person, warm, plain, one or two short sentences. Say why it matters only when that is not obvious. No emoji, no exclamation marks, no jargon. Never write copy for the design itself.',
    '',
    'VOCABULARY (use these exact ids)',
    `qualities: ${QUALITIES.filter((q) => q.id !== 'depth' && q.id !== 'original').map((q) => `${q.id} (${q.says})`).join('; ')}`,
    `themes: ${THEMES.map((t) => `${t.id} (${t.label})`).join(', ')}`,
    `type characters: ${TYPE_CHARACTERS.join(', ')}`,
    `forms: ${FORM_KINDS.join(', ')}`,
    '',
    'FONT LIBRARY (name — kind; character)',
    ...FONTS.map((f) => `${f.name} — ${f.kind}${f.displayOnly ? ', display only' : ''}; ${f.note}`),
    '',
    'Every field in the schema is present: palettes only for colour, faces only for type, vibes only for vibe, options only for text; the rest null.',
  ].join('\n');
}

/** The conversation as it stands. */
export function questionsUser(c: QuestionContext): string {
  const knownList = (Object.keys(c.known) as (keyof Known)[]).filter((k) => c.known[k] && (k !== 'pictures' || c.pictures > 0)).map((k) => (k === 'palette' ? 'colours' : k === 'type' ? 'typefaces' : k === 'vibe' ? 'feel' : k));
  return [
    `THE WORK: a ${c.kind}${c.subject.length ? ` (its subject: ${c.subject.join(', ')})` : ''}`,
    `THE PERSON SAID: ${c.brief}`,
    `ALREADY KNOWN (never ask): ${knownList.length ? knownList.join(', ') : 'nothing beyond the words above'}`,
    ...(c.decided.length ? ['DECIDED SO FAR', ...c.decided.map((d) => `- ${d}`)] : []),
    ...(c.asked.length ? ['ASKED BEFORE (never again)', ...c.asked.map((a) => `- ${a.decides}${a.text ? `: “${a.text}”` : ''} → ${a.answer}`)] : []),
    `OPEN: ${c.open.length ? c.open.join(', ') : 'nothing — the reader would make it now'}`,
    `REMAINING: ${c.remaining} question${c.remaining === 1 ? '' : 's'}; visual questions asked: ${c.visualAsked}; visual questions still allowed: ${c.visualLeft}`,
    ...(c.pictures ? [`PICTURES BROUGHT: ${c.pictures}`] : []),
  ].join('\n');
}

/**
 * What the model wrote, held to the conversation's rules: a question in shape (normalizeDiscoveryQuestion), about
 * something not yet asked and not already known, within the budget and never a third visual question; or "ready".
 * Neither (a question that does not hold) means the reader's question stands.
 */
export function normalizeQuestionAnswer(v: unknown, c: QuestionContext): { ready: boolean; question: DiscoveryQuestion | null } {
  const r = o(v);
  if (c.remaining <= 0) return { ready: true, question: null };
  if (r.ready === true && !r.question) return { ready: true, question: null };
  const q = normalizeDiscoveryQuestion(r.question);
  if (!q) return { ready: false, question: null };
  const visual = VISUAL.has(q.kind);
  const known = q.kind === 'colour' ? c.known.palette : q.kind === 'type' ? c.known.type : q.kind === 'vibe' ? c.known.vibe : q.decides === 'purpose' ? c.known.purpose : q.decides === 'about' ? c.known.about : q.decides === 'pictures' ? c.known.pictures || !c.pictures : false;
  const repeated = c.asked.some((a) => a.decides === q.decides);
  if (known || repeated || (visual && (c.visualAsked >= 2 || c.visualLeft <= 0)) || (c.mode !== 'website' && q.decides === 'purpose') || (c.mode !== 'logo' && q.decides === 'about')) return { ready: false, question: null };
  // a text question needs words to ask with; its suggested answers are optional (the person can always write)
  if (q.kind === 'text' && q.text.length < 8) return { ready: false, question: null };
  return { ready: false, question: q };
}

// ── the strict shape of an answer, for the provider's structured output ──

type Schema = Record<string, unknown>;
const object = (properties: Record<string, Schema>): Schema => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const nullable = (x: Schema): Schema => ({ anyOf: [x, { type: 'null' }] });
const enumOf = (values: readonly string[]): Schema => ({ type: 'string', enum: [...values] });
const str = (n: number): Schema => ({ type: 'string', maxLength: n });
const hex: Schema = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' };
const DISPLAY = enumOf(FONTS.map((f) => f.name));
const BODY = enumOf(FONTS.filter((f) => !f.displayOnly).map((f) => f.name));

/** The answer as a strict JSON schema (every field present, null when it does not apply; lists bounded). */
export const STUDIO_QUESTION_SCHEMA: Schema = object({
  ready: { type: 'boolean' },
  question: nullable(
    object({
      kind: enumOf(DISCOVERY_KINDS),
      decides: { type: 'string', pattern: '^[a-z]{2,16}$' },
      text: str(300),
      why: nullable(str(200)),
      palettes: nullable({ type: 'array', maxItems: 4, items: object({ name: str(40), note: str(140), ground: hex, ink: hex, accent: hex, support: { type: 'array', items: hex, maxItems: 3 } }) }),
      faces: nullable({ type: 'array', maxItems: 4, items: object({ name: str(40), note: str(140), display: DISPLAY, body: BODY, character: nullable(enumOf(TYPE_CHARACTERS)), weight: nullable({ type: 'integer' }), case: nullable(enumOf(['upper', 'none'])) }) }),
      vibes: nullable({
        type: 'array',
        maxItems: 4,
        items: object({
          name: str(40),
          note: str(160),
          qualities: { type: 'array', items: enumOf(QUALITIES.filter((q) => q.id !== 'depth' && q.id !== 'original').map((q) => q.id)), maxItems: 3 },
          theme: nullable(enumOf(THEMES.map((t) => t.id))),
          character: nullable(enumOf(TYPE_CHARACTERS)),
          palette: object({ ground: hex, ink: hex, accent: hex }),
          form: nullable(enumOf(FORM_KINDS)),
        }),
      }),
      options: nullable({ type: 'array', maxItems: 4, items: object({ label: str(60), words: str(200) }) }),
    }),
  ),
});
