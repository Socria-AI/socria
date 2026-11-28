// lib/ux-v0/studio/discover-model.ts — what the question model reads, what it is told, and how its answer is held to
// shape, for the spatial creative brief (./discover.ts keeps the brief; app/api/ux-v0/studio-questions asks the model).
//
// Each time the person changes the brief — their idea, an answer, a pick, a skip, a note in their own words, a line
// edited in place — the model sees the brief as it stands and returns it updated: the creative brief in their words,
// the considerations worth showing now (each a question written for this work, sometimes with palettes, pairings of
// faces or moods to look at), a short line saying what it took from the change, and whether anything essential is
// still missing. Its answer is held to a strict schema (faces only from the library, colours only as colours) and then
// to the brief's rules (normalizePlan): never more than three open at once or six in all, never one already answered
// or skipped, never an aid already shown or already chosen, never losing what the person picked or wrote themselves.
// Server-safe: no browser, no engine.

import { FONTS } from '../fonts';
import { AID_KINDS, MAX_ASKED, MAX_OPEN, choiceWords, moduleId, normalizeCreativeBrief, normalizeModule, BRIEF_FIELDS, type AidKind, type BriefField, type BriefModule, type CreativeBrief } from './brief';
import type { StudioMode } from './schema';

export type CreativeMode = 'graphic' | 'logo' | 'board' | 'website';
export const CREATIVE_MODES: readonly CreativeMode[] = ['graphic', 'logo', 'board', 'website'];
export const isCreative = (m: StudioMode): m is CreativeMode => (CREATIVE_MODES as readonly string[]).includes(m);

export type PickKind = 'palette' | 'type' | 'mood';
const PICK_KINDS: readonly PickKind[] = ['palette', 'type', 'mood'];
export const pickKindOf = (k: AidKind): PickKind => (k === 'palettes' ? 'palette' : k === 'type' ? 'type' : 'mood');

/** The brief updated: what to show now, and what is understood. */
export interface Plan {
  note: string;
  ready: boolean;
  /** the open considerations to show now (new ones, or open ones kept — by id) */
  modules: BriefModule[];
  /** answers rewritten because a later change superseded them */
  answers: { id: string; text: string }[];
  /** open considerations no longer worth asking */
  retire: string[];
  brief: CreativeBrief;
  /** the work turned out to be another kind (a logo, not a poster) */
  mode: CreativeMode | null;
  by: 'model' | 'reader';
}

/** A consideration as the model reads it. */
export interface ModuleView {
  id: string;
  topic: string;
  question: string;
  kind: string;
  status: 'open' | 'answered' | 'skipped';
  /** what holds now (their words, or the option picked by name) */
  answer: string;
  /** what an open aid or choice offers, by name */
  offers: string[];
}

export interface SpaceContext {
  mode: CreativeMode | 'unsure';
  system: string | null;
  /** their idea, as it stands (they can edit it) */
  prompt: string;
  modules: ModuleView[];
  /** what they added in their own words, oldest first */
  notes: string[];
  /** what changed last */
  change: string;
  brief: CreativeBrief | null;
  /** fields they set themselves */
  own: BriefField[];
  asked: number;
  shown: AidKind[];
  pictures: string[];
  /** websites the person pointed to, as read */
  sites: string[];
  /** what the latest change picked from an aid (kept, whatever the model says about it) */
  justPicked: PickKind[];
}

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f]+/g, ' ').trim().slice(0, n) : '');
const strings = (v: unknown, n: number, len: number) => (Array.isArray(v) ? v : []).map((x) => clip(x, len)).filter(Boolean).slice(0, n);

/** A context from the browser, held to shape and size before it reaches a prompt. */
export function normalizeSpaceContext(v: unknown): SpaceContext | null {
  const r = v && typeof v === 'object' ? (v as Record<string, any>) : {};
  const mode = r.mode === 'unsure' || (CREATIVE_MODES as readonly string[]).includes(r.mode) ? (r.mode as SpaceContext['mode']) : null;
  const prompt = clip(r.prompt, 2000);
  if (!mode || !prompt) return null;
  const modules = (Array.isArray(r.modules) ? r.modules : []).slice(0, 16).map((m: any) => ({
    id: moduleId(m?.id),
    topic: clip(m?.topic, 40),
    question: clip(m?.question, 240),
    kind: clip(m?.kind, 12),
    status: m?.status === 'answered' || m?.status === 'skipped' ? m.status : ('open' as const),
    answer: clip(m?.answer, 400),
    offers: strings(m?.offers, 4, 60),
  })).filter((m: ModuleView) => m.id && m.question);
  return {
    mode,
    system: clip(r.system, 80) || null,
    prompt,
    modules,
    notes: strings(r.notes, 12, 600),
    change: clip(r.change, 200),
    brief: normalizeCreativeBrief(r.brief),
    own: (Array.isArray(r.own) ? r.own : []).filter((k: unknown): k is BriefField => (BRIEF_FIELDS as readonly unknown[]).includes(k)),
    asked: Math.max(0, Math.min(40, Math.floor(Number(r.asked) || 0))),
    shown: (Array.isArray(r.shown) ? r.shown : []).filter((k: unknown): k is AidKind => (AID_KINDS as readonly unknown[]).includes(k)),
    pictures: strings(r.pictures, 8, 80),
    sites: strings(r.sites, 4, 300),
    justPicked: (Array.isArray(r.justPicked) ? r.justPicked : []).filter((k: unknown): k is PickKind => (PICK_KINDS as readonly unknown[]).includes(k)),
  };
}

// ── the model: what it is told ──

let instructions: string | null = null;

/** The same for every brief (cacheable). */
export function discoverSystem(): string {
  if (instructions) return instructions;
  const faces = FONTS.map((f) => `${f.name} (${f.kind}${f.displayOnly ? ', display only' : ''}; ${f.note})`).join('; ');
  instructions = [
    'You are the creative director at SocriaUX, a design studio. Someone has described a piece of design they want — a poster, a social post, a cover, a logo, a set of campaign pieces, a web page. SocriaUX shows them a spatial creative brief: their idea at the top, what is understood so far beside it, and a few considerations placed in it — each a question written for this work, sometimes with something to look at. You decide what that brief holds. Each time they change something — their idea, an answer, a pick, a skip, a line edited in place, a note in their own words — you see the brief as it stands and return it updated, the way an excellent human creative director would: understand what they are imagining, notice what is already clear, raise only what would genuinely change the work, help them find what they cannot easily put into words, and recognise when enough is known. A good first draft is often worth more than another question.',
    '',
    '# What you return each time',
    '- brief: the whole creative brief, updated (rules below).',
    '- modules: the open considerations to show now — at most three, usually one or two, often none. Each raises one thing that would change the design materially and that the brief cannot settle. Mark the single most valuable one "lead". Keep an open consideration that is still worth raising by returning it with the same id (you may sharpen its wording); put the id of one that no longer matters in "retire" (its answer arrived some other way, or another change made it moot). Never return one that is answered or skipped (CONSIDERATIONS shows each with its status) and never raise its subject again under another id. Do not lay everything out at once: show what matters most now — more can follow their answer.',
    '- ready: true when a strong first design can be made now (the purpose is understood and what is still open can be settled by good judgement, or they asked you to go ahead). They can generate at any moment regardless; ready only says nothing essential is missing. A detailed idea is ready at once, with no considerations — never make someone repeat what they said.',
    '- note: one short line showing what you took from the latest change and what matters now (for a garden-centre sale: "A spring sale for regulars — warmth matters more than polish."), or "" when there is nothing worth saying. It is not a chat message: no greeting, no question (questions belong in considerations), no enthusiasm, under 20 words, plain words, second person if any. Vary it; never start every note the same way.',
    '- answers: when a later change supersedes an answer they gave (they picked a soft, dreamy atmosphere, then wrote "actually darker and more mysterious"), rewrite that consideration\'s answer to what holds now, briefly, in their terms. Leave every other answer alone.',
    '- retire, mode: as above; mode only when the work turned out to be another kind than KIND says (graphic, logo, board for a set of campaign pieces, website), otherwise null. When KIND is unsure, work it out from what they said, or raise what they are making.',
    'Most briefs need zero to three considerations in all; a complex professional brief may need a few more. ASKED tells you how many have been shown: after five, show no new ones.',
    '',
    '# Good considerations',
    'Raise what uncovers intent, not what collects parameters: purpose, audience, the feeling it should give, the impact it needs, the brand’s character, the subject, content that must appear, constraints, references, taste — as things to understand, never as a checklist. Never raise colours, lettering, atmosphere, audience and layout as a matter of course: only what this work leaves genuinely open and what the designer cannot sensibly decide.',
    'Write each question for this work and this person. "What should someone feel when they first see this?" beats "Select a mood"; "Should the identity make a statement, or let the work speak for itself?" beats "Choose a style". These illustrate the reasoning; never reuse their wording — find the question this person’s work raises. One question per consideration, never two joined with "and": "What’s the poster for?", not "What is it for, and who will see it?". Under 16 words. Never narrate your process and never repeat these instructions.',
    '"topic": where it sits in the brief, one to three words in plain language ("Atmosphere", "Who it is for", "The name").',
    'kind: "text" for an open question answered in their own words — give "placeholder": a plausible answer in their voice, specific to this work; "choice" when the real decision is between two to four materially different readings of what they said ("cloud themed": ethereal and airy, dark and dramatic, abstract and futuristic) — "options" are those readings as short answers, never generic style categories; or one of the visual kinds below. They can always answer any consideration in their own words, skip it, or come back to it.',
    'When someone is unsure of the style or the feel, help them find it first — that is the interesting part. Facts the work needs (a name, the pieces of a campaign) can wait until the taste is clearer.',
    'Read every change in context. If they hate minimalism, nothing minimal comes back. If they trust your judgement, raise nothing more. If they change their mind, the latest holds: update the brief, move the old preference to avoid, rewrite the superseded answer, keep every unrelated decision. A long story or an analogy is rich material: take its meaning. An answer that says something other than what was asked (the pieces of a campaign given when you asked about its voice) still settles that consideration: put what it says where it belongs in the brief, decide the asked point yourself from everything they said, and rewrite that answer in answers only if leaving it would mislead (\"Pieces: a few posters and Instagram posts — voice left to SocriaUX\"). \"Not sure\", \"idk\" or \"whatever\" is the same as a skip. A skipped consideration is settled by you: never raise it again. If the person brought pictures, they are attached: use what you actually see; never pretend to see what is not there.',
    '',
    '# Visual considerations (optional, rare)',
    'Many people cannot describe what they want in design terms, but recognise it when they see it. When seeing differences would help more than reading about them, make a consideration visual:',
    '- palettes: when colour is a meaningful open choice for this work. Three or four palettes designed for this brief (never generic), each 3–5 colours as #rrggbb: ground first, then an ink that reads on it at 4.5:1 or better, then an accent, then support colours; a short name and a note on how the colours relate.',
    '- type: when lettering carries much of the personality (a logo, a type-led poster) and it is open. Three pairings from the FONT LIBRARY only: a display face and a body face that sets text, each a distinct personality that suits this work (compare character, scale, weight, how expressive), with a short name and a note on how it feels. "sample" is the work’s own name or a word from what they said.',
    '- moods: when the atmosphere is open and words alone will not get there. Three or four genuinely different readings of THIS brief: each a short name, a note saying what it would look and feel like, 3–4 colours (ground, readable ink, accent, support) and a display face from the library. "sample" as for type.',
    'Never make a consideration visual for something already said or chosen (they named colours, so no palettes), never a kind already shown (SHOWN lists them), never in a design system for colours or lettering (it decides them). Most considerations are not visual. What they pick tells the designer about their taste, never the layout.',
    '',
    '# The brief',
    'Return the whole brief, updated, in the person’s own words wherever possible. Do not reduce nuance to tags — "quiet, like a library at closing time, but with one loud thing in it" stays as words. Fields listed under THEY SET THESE THEMSELVES are theirs: copy them exactly.',
    'kind: what is being made, plainly. purpose, audience: as understood (empty if not). content: only words they said should appear in the design, copied exactly, one item per line; empty if none — never invent copy, names, dates or places. feel: how it should feel, in their words.',
    'explicit: what they asked for outright. implied: strong implications of the context. tentative: your own interpretations they have not confirmed — never move a guess into explicit. avoid: what they turned down or want kept out (when they reverse a preference, the old one goes here). references: links, pictures, named influences. open: what is still unclear. clear: usually empty — only when they took back something they had picked ("palette", "type" or "mood"); a pick their latest change made is kept: never clear it.',
    '',
    '# Kinds of work',
    'A logo needs its name: raise it if it is not given (once the taste is clearer if they were unsure of it), unless they asked you to decide — then the designer invents one. A campaign (board) needs to know roughly which pieces, unless a sensible set is obvious. A web page needs to know what people should do there. A poster, post or cover needs to know what it is for — unless the idea already says (a poster for a book fair announces the fair); its words can be written by the designer as stand-ins when none are given — never ask for headlines like a form.',
    '',
    `# FONT LIBRARY (exact names)\n${faces}`,
    '',
    'Answer in the required JSON shape: every field present; null where a field does not apply (options for non-choice kinds, placeholder for non-text kinds, sample/palettes/faces/moods except what a visual kind uses).',
  ].join('\n');
  return instructions;
}

/** The brief as it stands. */
export function discoverUser(c: SpaceContext): string {
  const b = c.brief;
  const own = new Set(c.own);
  const mark = (f: BriefField) => (own.has(f) ? ' (they set this themselves)' : '');
  const briefLines = b
    ? [
        b.kind && `kind: ${b.kind}${mark('kind')}`,
        b.purpose && `purpose: ${b.purpose}${mark('purpose')}`,
        b.audience && `audience: ${b.audience}${mark('audience')}`,
        b.content && `content (exact): ${b.content.replace(/\n/g, ' / ')}${mark('content')}`,
        b.feel && `feel: ${b.feel}${mark('feel')}`,
        b.explicit.length && `explicit: ${b.explicit.join(' | ')}`,
        b.implied.length && `implied: ${b.implied.join(' | ')}`,
        b.tentative.length && `tentative: ${b.tentative.join(' | ')}`,
        b.avoid.length && `avoid: ${b.avoid.join(' | ')}`,
        b.references.length && `references: ${b.references.join(' | ')}`,
        b.open.length && `open: ${b.open.join(' | ')}`,
        b.chosen.palette && `chosen palette: ${choiceWords('palettes', b.chosen.palette)}${b.chosen.palette.edited ? ' (colours changed by them)' : ''}`,
        b.chosen.type && `chosen type: ${choiceWords('type', b.chosen.type)}`,
        b.chosen.mood && `chosen mood: ${choiceWords('moods', b.chosen.mood)}`,
      ].filter(Boolean)
    : [];
  const mods = c.modules.map((m) => `- [${m.id}] ${m.topic} — “${m.question}” (${m.kind}) — ${m.status === 'answered' ? `ANSWERED: ${m.answer}` : m.status === 'skipped' ? 'SKIPPED (settle it yourself)' : `OPEN${m.offers.length ? `, offering: ${m.offers.join(' / ')}` : ''}`}`);
  return [
    `KIND: ${c.mode === 'unsure' ? 'unsure — not yet said' : c.mode === 'board' ? 'board (a set of campaign pieces)' : c.mode}`,
    ...(c.system ? [`DESIGN SYSTEM: made in “${c.system}” — its colours and type are decided; never raise them`] : []),
    `THEIR IDEA: “${c.prompt}”`,
    mods.length ? `CONSIDERATIONS:\n${mods.join('\n')}` : 'CONSIDERATIONS: none yet',
    c.notes.length ? `NOTES THEY ADDED (oldest first; the latest holds):\n${c.notes.map((n) => `- ${n}`).join('\n')}` : '',
    `LATEST CHANGE: ${c.change || 'opened the brief'}`,
    briefLines.length ? `BRIEF SO FAR:\n${briefLines.join('\n')}` : 'BRIEF SO FAR: nothing yet',
    `ASKED: ${c.asked}`,
    `SHOWN: ${c.shown.length ? c.shown.join(', ') : 'none'}`,
    ...(c.pictures.length ? [`PICTURES THEY BROUGHT: ${c.pictures.join(', ')} (attached when they can be)`] : []),
    ...(c.sites.length ? ['SITES THEY POINTED TO, AS READ:', ...c.sites.map((x) => `- ${x}`)] : []),
  ]
    .filter(Boolean)
    .join('\n');
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

export const PLAN_SCHEMA: Schema = object({
  note: str(200),
  ready: { type: 'boolean' },
  mode: nullable(enumOf(CREATIVE_MODES)),
  modules: {
    type: 'array',
    maxItems: MAX_OPEN,
    items: object({
      id: str(40),
      topic: str(40),
      question: str(240),
      kind: enumOf(['text', 'choice', 'palettes', 'type', 'moods']),
      lead: { type: 'boolean' },
      options: nullable(strs(4, 60)),
      placeholder: nullable(str(120)),
      sample: nullable(str(40)),
      palettes: nullable({ type: 'array', maxItems: 4, items: object({ name: str(40), note: str(160), colours: { type: 'array', maxItems: 5, items: hexS } }) }),
      faces: nullable({ type: 'array', maxItems: 4, items: object({ name: str(40), note: str(160), display: FACE, body: TEXT_FACE, weight: nullable({ type: 'integer' }), upper: { type: 'boolean' } }) }),
      moods: nullable({ type: 'array', maxItems: 4, items: object({ name: str(40), note: str(180), colours: { type: 'array', maxItems: 4, items: hexS }, display: FACE }) }),
    }),
  },
  answers: { type: 'array', maxItems: 6, items: object({ id: str(40), text: str(300) }) },
  retire: strs(6, 40),
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
 * What the model wrote, held to shape and to the brief's rules: at most three open considerations and six in all,
 * none already answered or skipped (by id or by subject), aids only when real, not already shown, not already chosen
 * and not in a design system (otherwise the question stands, answered in words); the brief keeps what the person
 * picked and what they wrote themselves. Null when nothing usable came back (the reader decides instead).
 */
export function normalizePlan(v: unknown, c: SpaceContext): Plan | null {
  const r = v && typeof v === 'object' ? (v as Record<string, any>) : null;
  if (!r) return null;
  const nb = normalizeCreativeBrief(r.brief);
  if (!nb) return null;
  const prevBrief = c.brief;
  const prev = prevBrief?.chosen ?? {};
  // a pick is let go only when they took it back — never the one their latest change made
  const clear = new Set((Array.isArray(r.brief?.clear) ? r.brief.clear : []).filter((x: unknown): x is PickKind => (PICK_KINDS as readonly unknown[]).includes(x) && !c.justPicked.includes(x as PickKind)));
  const chosen: CreativeBrief['chosen'] = {};
  if (prev.palette && !clear.has('palette')) chosen.palette = prev.palette;
  if (prev.type && !clear.has('type')) chosen.type = prev.type;
  if (prev.mood && !clear.has('mood')) chosen.mood = prev.mood;
  const brief: CreativeBrief = { ...nb, chosen };
  // what they set themselves stays in their words
  for (const f of c.own) if (prevBrief) brief[f] = prevBrief[f];
  const mode = (CREATIVE_MODES as readonly string[]).includes(r.mode) ? (r.mode as CreativeMode) : null;

  const settled = c.modules.filter((m) => m.status !== 'open');
  const settledIds = new Set(settled.map((m) => m.id));
  const settledTopics = new Set(settled.map((m) => m.topic.trim().toLowerCase()).filter(Boolean));
  const openIds = new Set(c.modules.filter((m) => m.status === 'open').map((m) => m.id));
  const taken = (k: AidKind, id: string) =>
    (c.shown.includes(k) && !openIds.has(id)) || (k === 'palettes' && !!(chosen.palette || chosen.mood)) || (k === 'type' && !!(chosen.type || chosen.mood)) || (k === 'moods' && !!chosen.mood) || (!!c.system && k !== 'moods');
  const modules: BriefModule[] = [];
  const seen = new Set<string>();
  let fresh = 0;
  for (const raw of Array.isArray(r.modules) ? r.modules : []) {
    const q = raw && typeof raw === 'object' ? (raw as Record<string, any>) : {};
    const visual = q.kind === 'palettes' || q.kind === 'type' || q.kind === 'moods';
    const m = normalizeModule({
      ...q,
      options: q.kind === 'choice' ? q.options : visual ? (q.kind === 'palettes' ? q.palettes : q.kind === 'type' ? q.faces : q.moods) : null,
      status: 'open',
      answer: null,
    });
    if (!m || seen.has(m.id) || settledIds.has(m.id) || settledTopics.has(m.topic.trim().toLowerCase())) continue;
    // a new consideration only while there is room for one
    if (!openIds.has(m.id)) {
      if (c.asked + fresh >= MAX_ASKED) continue;
      fresh++;
    }
    // an aid shown before, already chosen, or decided by a design system: the question stands, answered in words
    if (m.aid && taken(m.aid.kind, m.id)) {
      m.aid = null;
      m.kind = 'text';
    }
    seen.add(m.id);
    modules.push(m);
    if (modules.length >= MAX_OPEN) break;
  }
  // one lead at most: the first the model marked, or none (the brief keeps the one it had)
  let lead = false;
  for (const m of modules) {
    if (m.lead && !lead) lead = true;
    else m.lead = false;
  }
  const answers = (Array.isArray(r.answers) ? r.answers : [])
    .map((a: any) => ({ id: moduleId(a?.id), text: clip(a?.text, 300) }))
    .filter((a: { id: string; text: string }) => a.text && c.modules.some((m) => m.id === a.id && m.status === 'answered'));
  const retire = strings(r.retire, 6, 40)
    .map(moduleId)
    .filter((id) => openIds.has(id) && !modules.some((m) => m.id === id));
  return { note: clip(r.note, 200).replace(/\s+/g, ' '), ready: r.ready === true, modules, answers, retire, brief, mode, by: 'model' };
}

/**
 * A plan as the route sent it, held to shape again in the browser (the same rules: what was answered, shown, chosen or
 * written by the person stays theirs).
 */
export function revivePlan(v: unknown, c: SpaceContext): Plan | null {
  const r = v && typeof v === 'object' ? (v as Record<string, any>) : null;
  if (!r) return null;
  const b = normalizeCreativeBrief(r.brief);
  if (!b) return null;
  // the route's plan carries its modules in the brief's own shape: shaped back into the model's form, then judged
  const raw = {
    ...r,
    modules: (Array.isArray(r.modules) ? r.modules : []).map((m: any) => {
      const aid = m?.aid && typeof m.aid === 'object' ? m.aid : null;
      return { ...m, sample: aid?.sample ?? null, palettes: aid?.kind === 'palettes' ? aid.options : null, faces: aid?.kind === 'type' ? aid.options : null, moods: aid?.kind === 'moods' ? aid.options : null };
    }),
    brief: { ...b, clear: (['palette', 'type', 'mood'] as const).filter((k) => !!c.brief?.chosen[k] && !b.chosen[k]) },
  };
  return normalizePlan(raw, c);
}
