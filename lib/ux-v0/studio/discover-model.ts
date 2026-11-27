// lib/ux-v0/studio/discover-model.ts — what the question model reads, what it is told, and how its answer is held to
// shape, for creative discovery (./discover.ts runs the conversation; app/api/ux-v0/studio-questions asks the model).
//
// The model reads the conversation as it stands and the brief so far, and decides one thing: one question — written
// for this work, with a visual aid only when seeing would help — or make it. It keeps the brief in the person's own
// words. Its answer is held to a strict schema (faces only from the library, colours only as colours) and then to the
// conversation's rules (normalizeDecision): never past the question limit, never an aid already shown or already
// chosen, never losing what the person picked unless they let it go. Server-safe: no browser, no engine.

import { FONTS } from '../fonts';
import { AID_KINDS, MAX_QUESTIONS, choiceWords, normalizeAsk, normalizeCreativeBrief, type Aid, type AidKind, type Ask, type CreativeBrief } from './brief';
import type { StudioMode } from './schema';

export type CreativeMode = 'graphic' | 'logo' | 'board' | 'website';
export const CREATIVE_MODES: readonly CreativeMode[] = ['graphic', 'logo', 'board', 'website'];
export const isCreative = (m: StudioMode): m is CreativeMode => (CREATIVE_MODES as readonly string[]).includes(m);

export type Decision = {
  action: 'ask' | 'make';
  /** what SocriaUX says first: what it took from the reply, or how it will make the work */
  say: string;
  ask: Ask | null;
  brief: CreativeBrief;
  /** the work turned out to be another kind (a logo, not a poster) */
  mode: CreativeMode | null;
  by: 'model' | 'reader';
  /** the reader's questions are marked with what they ask, so none is asked twice */
  stage?: 'what' | 'name' | 'purpose';
};


export interface DiscoverContext {
  mode: CreativeMode | 'unsure';
  /** the conversation in order, compact */
  conversation: { who: 'person' | 'socria'; text: string }[];
  brief: CreativeBrief | null;
  asked: number;
  /** aids already shown (each kind is offered once) */
  shown: AidKind[];
  pictures: string[];
  /** websites the person pointed to, as read */
  sites: string[];
  system: string | null;
  /** what the person picked from an aid in their latest reply (kept, whatever the model says about it) */
  justPicked: PickKind[];
}

export type PickKind = 'palette' | 'type' | 'mood';
const PICK_KINDS: readonly PickKind[] = ['palette', 'type', 'mood'];

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f]+/g, ' ').trim().slice(0, n) : '');

/** A context from the browser, held to shape and size before it reaches a prompt. */
export function normalizeDiscoverContext(v: unknown): DiscoverContext | null {
  const r = v && typeof v === 'object' ? (v as Record<string, any>) : {};
  const mode = r.mode === 'unsure' || (CREATIVE_MODES as readonly string[]).includes(r.mode) ? (r.mode as DiscoverContext['mode']) : null;
  if (!mode) return null;
  const conversation = (Array.isArray(r.conversation) ? r.conversation : [])
    .slice(-24)
    .map((m: any) => ({ who: m?.who === 'socria' ? ('socria' as const) : ('person' as const), text: clip(m?.text, 900) }))
    .filter((m: { text: string }) => m.text);
  if (!conversation.some((m: { who: string }) => m.who === 'person')) return null;
  return {
    mode,
    conversation,
    brief: normalizeCreativeBrief(r.brief),
    asked: Math.max(0, Math.min(20, Math.floor(Number(r.asked) || 0))),
    shown: (Array.isArray(r.shown) ? r.shown : []).filter((k: unknown): k is AidKind => (AID_KINDS as readonly unknown[]).includes(k)),
    pictures: (Array.isArray(r.pictures) ? r.pictures : []).map((x: unknown) => clip(x, 80)).filter(Boolean).slice(0, 8),
    sites: (Array.isArray(r.sites) ? r.sites : []).map((x: unknown) => clip(x, 300)).filter(Boolean).slice(0, 4),
    system: clip(r.system, 80) || null,
    justPicked: (Array.isArray(r.justPicked) ? r.justPicked : []).filter((k: unknown): k is PickKind => (PICK_KINDS as readonly unknown[]).includes(k)),
  };
}

// ── the model: what it is told ──

let instructions: string | null = null;

/** The same for every conversation (cacheable). */
export function discoverSystem(): string {
  if (instructions) return instructions;
  const faces = FONTS.map((f) => `${f.name} (${f.kind}${f.displayOnly ? ', display only' : ''}; ${f.note})`).join('; ');
  instructions = [
    'You are the creative director at SocriaUX, a design studio. Someone wants a piece of design made — a poster, a social post, a cover, a logo, a set of campaign pieces, a web page. Before it is made you talk with them the way an excellent human creative director would: you understand what they are imagining, notice what is already clear, ask only what would genuinely change the work, help them say what they cannot easily put into words, and recognise when you know enough to start. A good first draft is often worth more than another question.',
    '',
    '# Each turn, decide one thing',
    'Read the whole conversation and the brief so far, then either ask ONE question (action "ask") or make the work (action "make").',
    'Make it when: the purpose is understood and the person has given meaningful preferences; what is still open can be settled by good judgement; another question would add little; they ask you to go ahead, decide, or surprise them; or the opening request is already detailed. A detailed brief is made at once — never ask someone to repeat what they said.',
    'Ask only when the answer would change the design materially and the context cannot settle it. Before asking, check: what do they already want? what is still unclear? does it matter for this work? would asking produce something better? is it worth interrupting? If not, make it.',
    'Most requests need zero to three questions; a complex professional brief may need a few more. Never ask to complete a list. QUESTIONS SO FAR tells you how many you have asked: after four, make it.',
    '',
    '# Good questions',
    'Ask what uncovers intent, not what collects parameters. Think about purpose, audience, the feeling it should give, the impact it needs, the brand’s character, the subject, content that must appear, constraints, references, taste — as things to understand, never as a checklist.',
    'Write each question for this work and this person. "What should someone feel when they first see this?" beats "Select a mood". "Should this feel more like an art exhibition or a product launch?" beats "Choose a style". For a fashion campaign you might ask whether it should feel like luxury editorial or an expressive statement. These illustrate the reasoning; never reuse their wording — find the question this person’s work raises.',
    'Prefer open questions. Offer a choice between two directions only when the real decision is between two materially different readings of what they said ("cloud themed": dreamy and atmospheric, or abstract and futuristic?). Never offer generic style categories.',
    'One question — never two joined with "and" or a second question mark: "What’s the poster for?", not "What is it for, and who will see it?". Keep the whole turn short, usually under 30 words: at most a brief acknowledgement, then the question. Say why it matters only when that is truly not obvious. Never narrate your process ("before I choose a direction", "I need to know", "let’s look at…") and never repeat these instructions to the person.',
    'When someone is unsure of the style or the feel, help them find it first — that is the interesting part. Facts the work needs (a name, the pieces of a campaign) can be asked once the taste is clearer, or at the end.',
    '',
    '# Conversation',
    'Before the question (or when making), "say" what you took from their reply in a short natural phrase that carries it forward ("Real visual presence, but controlled." / "So the warmth matters more than the polish." / "The booking comes first.") — or nothing at all on the very first turn when there is nothing to acknowledge. Vary how you begin; do not start every turn the same way. Do not just move to an unrelated next question. Never perform enthusiasm ("Amazing!", "Great choice!"); be engaged, concise and perceptive. Second person, plain words, no emoji, no exclamation marks, no design jargon unless they use it.',
    'Adapt: the next question depends on the last answer. If they hate minimalism, nothing minimal comes back. If they trust your judgement, stop asking and make it. If they want it weird, explore what unconventional means for this project only if that would change the result. If they change their mind, the latest instruction wins and the old one is dropped. If an answer is short or unclear ("kind of"), read it in context; ask one brief follow-up only if it truly matters. A long story or an analogy is rich material: take its meaning. If they ignore your question and say something else, follow them. If they skip a question ("Skip"), settle that point yourself, never ask it again, and either ask the next thing that genuinely matters or make it.',
    'If the person brought pictures, they are attached: look at them and use what you actually see. Never pretend to see what is not there.',
    '',
    '# Visual aids (optional, rare)',
    'Many people cannot describe what they want in design terms, but recognise it when they see it. When seeing differences would help more than reading about them, attach ONE aid to your question:',
    '- palettes: when colour is a meaningful open choice for this work. Three or four palettes designed for this brief (never generic), each 3–5 colours as #rrggbb: ground first, then an ink that reads on it at 4.5:1 or better, then an accent, then support colours. A short name and a note on how the colours relate.',
    '- type: when lettering carries much of the personality (a logo, a type-led poster) and it is open. Three pairings from the FONT LIBRARY only: a display face and a body face that sets text, each a distinct personality that suits this work, with a short name and a note on how it feels. "sample" is the work’s own name or a word from what they said.',
    '- moods: when the atmosphere is open and words alone will not get there. Three or four moods that are genuinely different readings of THIS brief: each a short name, a note saying what it would look and feel like, 3–4 colours (ground, readable ink, accent, support) and a display face from the library. "sample" as for type.',
    'Never attach an aid for something already said or chosen (they named colours, so no palettes), never one already shown (SHOWN lists them), never more than one per question. Most questions have none. An aid is a way to talk, not a template: what they pick tells the designer about their taste, never the layout.',
    '"suggestions" are up to three very short replies they could tap — each a real answer to the question you asked, in their voice (never one that only promises an answer, like "I’ll tell you") — only when they genuinely help (usually none; never with an aid).',
    '',
    '# The brief',
    'Return the whole brief, updated, every turn, in the person’s own words wherever possible. Do not reduce nuance to tags — "quiet, like a library at closing time, but with one loud thing in it" stays as words.',
    'kind: what is being made, plainly. purpose, audience: as understood (empty if not). content: only words they said should appear in the design, copied exactly, one item per line; empty if none — never invent copy, names, dates or places. feel: how it should feel, in their words.',
    'explicit: what they asked for outright. implied: strong implications of the context. tentative: your own interpretations they have not confirmed — never move a guess into explicit. avoid: what they turned down or want kept out (when they reverse a preference, the old one goes here). references: links, pictures, named influences. open: what is still unclear. clear: usually empty — only when they took back something they had picked from an aid (they picked a palette, then asked for other colours): "palette", "type" or "mood". A pick they just made is kept: never clear it.',
    'mode: set only when the work turned out to be another kind than KIND says (graphic, logo, board for a set of campaign pieces, website); otherwise null. When KIND is unsure, work it out from what they said, or ask what they are making.',
    '',
    '# Kinds of work',
    'A logo needs its name: ask for it if it is not given (once the taste is clearer if they were unsure of it), unless they asked you to decide — then the designer invents one. A campaign (board) needs to know roughly which pieces, unless a sensible set is obvious. A web page needs to know what people should do there. A poster, post or cover needs to know what it is for — unless the request already says (a poster for a book fair announces the fair: do not ask what it should make people do); its words can be written by the designer as stand-ins when none are given — do not ask for headlines like a form.',
    '',
    `# FONT LIBRARY (exact names)\n${faces}`,
    '',
    'Answer in the required JSON shape: every field present; question null when making; aid null when not used; palettes, faces and moods null except the one the aid uses.',
  ].join('\n');
  return instructions;
}

/** The conversation as it stands. */
export function discoverUser(c: DiscoverContext): string {
  const b = c.brief;
  const briefLines = b
    ? [
        b.kind && `kind: ${b.kind}`,
        b.purpose && `purpose: ${b.purpose}`,
        b.audience && `audience: ${b.audience}`,
        b.content && `content (exact): ${b.content.replace(/\n/g, ' / ')}`,
        b.feel && `feel: ${b.feel}`,
        b.explicit.length && `explicit: ${b.explicit.join(' | ')}`,
        b.implied.length && `implied: ${b.implied.join(' | ')}`,
        b.tentative.length && `tentative: ${b.tentative.join(' | ')}`,
        b.avoid.length && `avoid: ${b.avoid.join(' | ')}`,
        b.references.length && `references: ${b.references.join(' | ')}`,
        b.open.length && `open: ${b.open.join(' | ')}`,
        b.chosen.palette && `chosen palette: ${choiceWords('palettes', b.chosen.palette)}`,
        b.chosen.type && `chosen type: ${choiceWords('type', b.chosen.type)}`,
        b.chosen.mood && `chosen mood: ${choiceWords('moods', b.chosen.mood)}`,
      ].filter(Boolean)
    : [];
  return [
    `KIND: ${c.mode === 'unsure' ? 'unsure — not yet said' : c.mode === 'board' ? 'board (a set of campaign pieces)' : c.mode}`,
    ...(c.system ? [`DESIGN SYSTEM: made in “${c.system}” — its colours and type are decided; never ask about them`] : []),
    'CONVERSATION:',
    ...c.conversation.map((m) => `${m.who === 'person' ? 'PERSON' : 'SOCRIAUX'}: ${m.text}`),
    briefLines.length ? `BRIEF SO FAR:\n${briefLines.join('\n')}` : 'BRIEF SO FAR: nothing yet',
    `QUESTIONS SO FAR: ${c.asked}`,
    `SHOWN: ${c.shown.length ? c.shown.join(', ') : 'none'}`,
    ...(c.pictures.length ? [`PICTURES THEY BROUGHT: ${c.pictures.join(', ')} (attached when they can be)`] : []),
    ...(c.sites.length ? ['SITES THEY POINTED TO, AS READ:', ...c.sites.map((x) => `- ${x}`)] : []),
  ].join('\n');
}

// ── the model: the shape of its answer ──

type Schema = Record<string, unknown>;
const object = (properties: Record<string, Schema>): Schema => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const nullable = (x: Schema): Schema => ({ anyOf: [x, { type: 'null' }] });
const enumOf = (values: readonly string[]): Schema => ({ type: 'string', enum: [...values] });
const str = (n: number): Schema => ({ type: 'string', maxLength: n });
const strs = (n: number, len: number): Schema => ({ type: 'array', maxItems: n, items: str(len) });
const hexS: Schema = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' };
const FACE = enumOf(FONTS.map((f) => f.name));
const TEXT_FACE = enumOf(FONTS.filter((f) => !f.displayOnly).map((f) => f.name));

export const DISCOVER_SCHEMA: Schema = object({
  action: enumOf(['ask', 'make']),
  say: str(300),
  question: nullable(
    object({
      text: str(400),
      suggestions: strs(3, 80),
      aid: nullable(
        object({
          kind: enumOf(AID_KINDS),
          sample: nullable(str(40)),
          palettes: nullable({ type: 'array', maxItems: 4, items: object({ name: str(40), note: str(160), colours: { type: 'array', maxItems: 5, items: hexS } }) }),
          faces: nullable({ type: 'array', maxItems: 4, items: object({ name: str(40), note: str(160), display: FACE, body: TEXT_FACE, weight: nullable({ type: 'integer' }), upper: { type: 'boolean' } }) }),
          moods: nullable({ type: 'array', maxItems: 4, items: object({ name: str(40), note: str(180), colours: { type: 'array', maxItems: 4, items: hexS }, display: FACE }) }),
        }),
      ),
    }),
  ),
  mode: nullable(enumOf(CREATIVE_MODES)),
  brief: object({
    kind: str(120),
    purpose: str(600),
    audience: str(300),
    content: str(1200),
    feel: str(600),
    explicit: strs(10, 300),
    implied: strs(10, 300),
    tentative: strs(10, 300),
    avoid: strs(10, 300),
    references: strs(8, 300),
    open: strs(6, 300),
    clear: { type: 'array', maxItems: 3, items: enumOf(['palette', 'type', 'mood']) },
  }),
});

/**
 * What the model wrote, held to shape and to the conversation's rules: a question with words (its aid only when real,
 * not already shown and not already chosen), never past the question limit; or the making. The brief keeps what the
 * person picked from an aid unless they let it go. Null when nothing usable came back (the reader decides instead).
 */
export function normalizeDecision(v: unknown, c: DiscoverContext): Decision | null {
  const r = v && typeof v === 'object' ? (v as Record<string, any>) : null;
  if (!r || (r.action !== 'ask' && r.action !== 'make')) return null;
  const nb = normalizeCreativeBrief(r.brief);
  if (!nb) return null;
  const prev = c.brief?.chosen ?? {};
  // a pick is let go only when they took it back — never the one their latest reply made
  const clear = new Set((Array.isArray(r.brief?.clear) ? r.brief.clear : []).filter((x: unknown): x is PickKind => (PICK_KINDS as readonly unknown[]).includes(x) && !(c.justPicked ?? []).includes(x as PickKind)));
  const chosen: CreativeBrief['chosen'] = {};
  if (prev.palette && !clear.has('palette')) chosen.palette = prev.palette;
  if (prev.type && !clear.has('type')) chosen.type = prev.type;
  if (prev.mood && !clear.has('mood')) chosen.mood = prev.mood;
  const brief: CreativeBrief = { ...nb, chosen };
  const mode = (CREATIVE_MODES as readonly string[]).includes(r.mode) ? (r.mode as CreativeMode) : null;
  const say = typeof r.say === 'string' ? r.say.replace(/\s+/g, ' ').trim().slice(0, 300) : '';
  if (r.action === 'make' || c.asked >= MAX_QUESTIONS) return { action: 'make', say: r.action === 'make' ? say : '', ask: null, brief, mode, by: 'model' };
  const q = r.question && typeof r.question === 'object' ? r.question : null;
  const aidRaw = q?.aid ? { kind: q.aid.kind, sample: q.aid.sample, options: q.aid.kind === 'palettes' ? q.aid.palettes : q.aid.kind === 'type' ? q.aid.faces : q.aid.moods } : null;
  const ask = normalizeAsk({ text: q?.text, suggestions: q?.suggestions, aid: aidRaw });
  if (!ask) return null;
  // an aid for something shown before or already chosen is dropped (the question stands)
  const taken = (k: AidKind) => c.shown.includes(k) || (k === 'palettes' && !!(chosen.palette || chosen.mood)) || (k === 'type' && !!(chosen.type || chosen.mood)) || (k === 'moods' && !!chosen.mood) || (!!c.system && k !== 'moods');
  const aid: Aid | null = ask.aid && !taken(ask.aid.kind) ? ask.aid : null;
  return { action: 'ask', say, ask: { text: ask.text, aid, suggestions: aid ? [] : ask.suggestions }, brief, mode, by: 'model' };
}


/**
 * A decision as the route sent it, held to shape again in the browser (the same rules as normalizeDecision: the
 * question limit, aids shown or chosen before, what the person picked kept unless they let it go).
 */
export function reviveDecision(v: unknown, c: DiscoverContext): Decision | null {
  const r = v && typeof v === 'object' ? (v as Record<string, any>) : null;
  if (!r || (r.action !== 'ask' && r.action !== 'make')) return null;
  const b = normalizeCreativeBrief(r.brief);
  if (!b) return null;
  const aid = r.ask?.aid && typeof r.ask.aid === 'object' ? r.ask.aid : null;
  // the route's decision carries the brief with its picks resolved: shaped back into the model's form, then judged
  const raw = {
    action: r.action,
    say: r.say,
    mode: r.mode,
    question: r.ask ? { text: r.ask.text, suggestions: r.ask.suggestions, aid: aid ? { kind: aid.kind, sample: aid.sample, palettes: aid.kind === 'palettes' ? aid.options : null, faces: aid.kind === 'type' ? aid.options : null, moods: aid.kind === 'moods' ? aid.options : null } : null } : null,
    brief: { ...b, clear: (['palette', 'type', 'mood'] as const).filter((k) => !!c.brief?.chosen[k] && !b.chosen[k]) },
  };
  return normalizeDecision(raw, c);
}
