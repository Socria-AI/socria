// lib/ux-v0/studio/discover.ts — creative discovery: the conversation before a graphic, a logo, a campaign or a website
// is made.
//
// Each time the person speaks, SocriaUX decides one thing: ask one question that would change the work, or make it. A
// model decides when it can be reached (/api/ux-v0/studio-questions, the question stage's own model): it reads the
// whole conversation and the brief so far, writes the question in its own words for this work — with a few palettes,
// pairings of typefaces or moods to look at only when seeing would help more than reading — and keeps the brief up to
// date in the person's own words. When it cannot be reached, a small reader here asks only what the work cannot do
// without (what it is, a logo's name, what a vague request is for) and otherwise makes it. Nothing is a questionnaire:
// there is no list of topics to get through, no option has to be chosen, every reply is read as words, and "make it",
// "you decide" or "surprise me" make it at once.
//
// What was understood goes to the designer as it was said (designBriefOf): the opening words, the conversation, what
// was asked for outright, what is implied, SocriaUX's own tentative reading (marked as such), what was turned down,
// and anything picked from an aid — as a picture of taste, never a template. The designer itself is unchanged.

import { readFacts } from './facts';
import { recognizeIntent } from './intent';
import { subjectOf } from './director';
import { said, type StudioMessage, type StudioMode, type StudioState } from './schema';
import { BRIEF_LIMITS, choiceWords, emptyBrief, type AidKind, type CreativeBrief, type Mood, type Palette, type TypePair } from './brief';
import { isCreative, type CreativeMode, type Decision, type DiscoverContext, type PickKind } from './discover-model';

export { isCreative, CREATIVE_MODES, type CreativeMode, type Decision } from './discover-model';

// ── what the person said ──

const DELEGATE =
  /^(?:(?:ok(?:ay)?|sure|honestly|just|please|yeah|yes|no|nah|fine|hmm+)[,.! ]+)*(?:surprise me|you decide|you choose|you pick|your call|up to you|dealer'?s choice|i trust (?:you|your (?:judge?ment|taste|eye))|whatever you (?:think|like|want)(?: is best)?|(?:it )?doesn'?t matter|no preference|i don'?t mind|(?:just )?(?:make|create|design) (?:it|something|anything|whatever)(?: now| for me)?|go(?: ahead)?|go for it|let'?s go|do it|start|ready|that'?s (?:it|enough|all)|looks good)(?:[,.! ]+(?:(?:just )?(?:make|create|design) (?:it|something|anything|whatever)(?: now| for me)?|surprise me|you decide|go(?: ahead)?|go for it|please|thanks|thank you|now))*[.!]*$/i;

/** Words that hand the rest to SocriaUX ("you decide", "surprise me", "just make something"). */
export const wantsMake = (text: string) => {
  const t = (text ?? '').trim().replace(/\s+/g, ' ');
  return t.length > 0 && t.length <= 90 && DELEGATE.test(t);
};

const SKIP = /^(?:(?:ok(?:ay)?|no|nah|hmm+)[,.! ]+)?(?:skip(?: (?:it|this(?: one)?|that(?: one)?|this question))?|pass|next(?: question)?)[.!]*$/i;

/** A question passed on ("Skip", "pass", "next"): SocriaUX settles that point itself and does not ask it again. */
export const skips = (text: string) => SKIP.test((text ?? '').trim().replace(/\s+/g, ' '));

/** Everything the person has said, in order (the opening words alone for a record that kept no messages); a question
 * passed on says nothing about the work, so "Skip" is never read as its subject or its words. */
const personWords = (st: StudioState) => {
  const said_ = st.transcript.filter((m) => m.from === 'person' && m.text.trim() && !skips(m.text)).map((m) => m.text.trim());
  return said_.length ? said_ : st.prompt.trim() ? [st.prompt.trim()] : [];
};
const lastPerson = (st: StudioState) => [...st.transcript].reverse().find((m) => m.from === 'person');
/** The aids already shown in this conversation (each kind is offered once). */
export const aidsShown = (st: StudioState): AidKind[] => [...new Set(st.transcript.map((m) => m.aid?.kind).filter((k): k is AidKind => !!k))];
/** Questions SocriaUX has asked in this conversation. */
export const questionsAsked = (st: StudioState) => st.transcript.filter((m) => m.from === 'socria' && m.kind === 'question').length;

/** Whether it is SocriaUX's turn: the person spoke last, and the work has not begun. */
export function awaitingTurn(st: StudioState): boolean {
  if (st.status !== 'discovering' || !isCreative(st.mode)) return false;
  const last = st.transcript[st.transcript.length - 1];
  return !!last && last.from === 'person';
}

/** Whether the conversation's last word is that the work is being made. */
export function makingNow(st: StudioState): boolean {
  const last = [...st.transcript].reverse().find((m) => m.from === 'socria' || m.from === 'person');
  return !!last && last.from === 'socria' && last.stage === 'making';
}

/** The person's message, kept (with what it carried); the turn that follows is SocriaUX's. */
export function personSays(st: StudioState, text: string, o: { attachments?: string[]; now?: number } = {}): StudioState {
  const t = text.trim().slice(0, 1200);
  return said(st, { from: 'person', kind: 'reply', text: t || 'These', ...(o.attachments?.length ? { attachments: o.attachments } : {}), at: o.now ?? Date.now() });
}

/** One of the options an aid offered, picked: said as the person's reply, and kept in the brief as their taste. */
export function chooseAid(st: StudioState, index: number, now = Date.now()): StudioState | null {
  const q = [...st.transcript].reverse().find((m) => m.from === 'socria' || m.from === 'person');
  const aid = q?.from === 'socria' ? q.aid : undefined;
  if (!aid) return null;
  const opt = aid.options[index];
  if (!opt) return null;
  const brief = st.brief ?? readerBrief(st);
  const chosen: CreativeBrief['chosen'] = { ...brief.chosen };
  if (aid.kind === 'palettes') chosen.palette = opt as Palette;
  if (aid.kind === 'type') chosen.type = opt as TypePair;
  if (aid.kind === 'moods') chosen.mood = opt as Mood;
  const lead = aid.kind === 'palettes' ? 'These colours' : aid.kind === 'type' ? 'This lettering' : 'This one';
  return said({ ...st, brief: { ...brief, chosen } }, { from: 'person', kind: 'reply', text: `${lead}: ${choiceWords(aid.kind, opt)}`, at: now });
}

// ── what SocriaUX does with a decision ──

const MAKING: Record<CreativeMode, string> = {
  graphic: 'That’s enough to begin — making it now. Change anything in your own words once you see it.',
  logo: 'That’s enough to begin — designing the logo now. Change anything in your own words once you see it.',
  board: 'That’s enough to begin — making the set now, one idea across every piece. Change anything once you see it.',
  website: 'That’s enough to begin — making the page now. Change anything in your own words once you see it.',
};

/** A decision carried out on the conversation: the brief updated, then the question (with its aid) or the making. */
export function applyDecision(st: StudioState, d: Decision, now = Date.now()): StudioState {
  const mode = d.mode && d.mode !== st.mode && isCreative(st.mode) ? d.mode : st.mode;
  // the kind of work is settled once a decision names it (or the work is being made in the kind it is)
  const settled = !!d.mode || (d.action === 'make' && st.modeBy === 'unsure');
  const base: StudioState = { ...st, mode, ...(settled ? { modeBy: 'recognised' as const } : {}), brief: d.brief };
  const { pending: _p, ...rest } = base;
  if (d.action === 'ask' && d.ask) {
    const text = [d.say, d.ask.text].filter(Boolean).join(' ').slice(0, 900);
    return said(rest, { from: 'socria', kind: 'question', stage: d.stage ?? 'discover', text, ...(d.ask.aid ? { aid: d.ask.aid } : {}), ...(d.ask.suggestions.length ? { suggestions: d.ask.suggestions } : {}), at: now });
  }
  const m = isCreative(mode) ? mode : 'graphic';
  return said(rest, { from: 'socria', kind: 'note', stage: 'making', text: (d.say || MAKING[m]).slice(0, 600), at: now });
}

/** "Make it now", "surprise me": made at once with what is understood, the rest left to SocriaUX. */
export function makeNow(st: StudioState, say = ''): Decision {
  const brief = st.brief ?? readerBrief(st);
  const left = 'Anything not said here is left to SocriaUX’s judgement.';
  return { action: 'make', say: say || 'Leaving the rest to me, then — making it now. Change anything once you see it.', ask: null, brief: brief.implied.includes(left) ? brief : { ...brief, implied: [...brief.implied, left].slice(-BRIEF_LIMITS.list) }, mode: null, by: 'reader' };
}

// ── the reader: when the model cannot be reached ──

const KIND_SAID: Record<CreativeMode, string> = { graphic: 'graphic', logo: 'logo', board: 'campaign', website: 'website' };

function kindWord(st: StudioState): string {
  const f = readFacts(personWords(st).join(' \n'));
  if (st.mode === 'graphic' && f.kind && !['logo', 'campaign', 'identity'].includes(f.kind)) return f.kind === 'social' ? (f.story ? 'story' : 'post') : f.kind;
  return isCreative(st.mode) ? KIND_SAID[st.mode] : 'design';
}

/** The brief as the reader can tell it: the person's words, nothing invented. */
export function readerBrief(st: StudioState): CreativeBrief {
  const words = personWords(st);
  const all = words.join('\n');
  const f = readFacts(all);
  const prev = st.brief;
  const b = prev ? { ...prev } : emptyBrief();
  b.kind = b.kind || kindWord(st);
  if (!b.content && f.quoted.length) b.content = f.quoted.join('\n').slice(0, BRIEF_LIMITS.content);
  if (!b.feel && f.mood.length) b.feel = f.mood.join(', ');
  b.explicit = [...new Set([...b.explicit, ...words])].slice(-BRIEF_LIMITS.list).map((x) => x.slice(0, BRIEF_LIMITS.line));
  if (f.avoid.length) b.avoid = [...new Set([...b.avoid, ...f.avoid])].slice(0, BRIEF_LIMITS.list);
  return b;
}

const askedStage = (st: StudioState, stage: string) => st.transcript.some((m) => m.from === 'socria' && m.kind === 'question' && m.stage === stage);

/**
 * What the reader decides: only what the work cannot do without — what it is (when nothing says), a logo's name, what a
 * request that says nothing about its subject is for — at most two questions; otherwise make it.
 */
export function readerDecision(st: StudioState): Decision {
  const last = lastPerson(st)?.text ?? '';
  if (wantsMake(last)) return makeNow(st);
  let mode: CreativeMode | null = null;
  let cur = st;
  // the kind of work, read from the reply to "what are you making"
  if (st.modeBy === 'unsure') {
    // the reply to "what are you making" first, then everything said
    const r0 = recognizeIntent(last);
    const r = r0.mode && isCreative(r0.mode) ? r0 : recognizeIntent(personWords(st).join(' '));
    if (r.mode && isCreative(r.mode) && r.confidence >= 0.3 && askedStage(st, 'what')) {
      mode = r.mode;
      cur = { ...st, mode: r.mode, modeBy: 'recognised' };
    }
  }
  const brief = readerBrief(cur);
  const ask = (stage: 'what' | 'name' | 'purpose', text: string, suggestions: string[] = []): Decision => ({ action: 'ask', say: '', ask: { text, aid: null, suggestions }, brief, mode, by: 'reader', stage });
  const make = (): Decision => ({ action: 'make', say: '', ask: null, brief, mode, by: 'reader' });
  const asked = questionsAsked(cur);
  if (asked >= 2) return make();
  if (cur.modeBy === 'unsure' && !askedStage(cur, 'what')) return ask('what', 'What are you making — a poster or a post, a logo, a website, a whole campaign? Or something else entirely.', ['A poster', 'A logo', 'A website']);
  const words = personWords(cur).join(' \n');
  const f = readFacts(words);
  if (cur.mode === 'logo' && !(f.brand || f.headline || f.quoted[0]) && !askedStage(cur, 'name')) return ask('name', 'What’s it called? I’ll set the name exactly as you write it.');
  const subject = subjectOf(words);
  if (!subject && !askedStage(cur, 'purpose')) return ask('purpose', `What’s the ${kindWord(cur)} for?`);
  return make();
}

// ── the model: what it reads ──

// ── what the model is sent ──

/** The conversation as the model reads it. */
export function discoverContextOf(st: StudioState, env: { systemName?: string } = {}): DiscoverContext {
  const msgs = st.transcript.filter((m) => m.text.trim() && (m.from === 'person' || m.kind === 'question' || m.stage === 'making' || m.kind === 'note' || m.kind === 'change')).slice(-24);
  return {
    mode: st.modeBy === 'unsure' ? 'unsure' : isCreative(st.mode) ? st.mode : 'graphic',
    conversation: msgs.map((m) => ({ who: m.from, text: `${m.text}${m.aid ? ` [showed ${m.aid.kind}: ${m.aid.options.map((x) => x.name).join(' / ')}]` : ''}`.slice(0, 900) })),
    brief: st.brief ?? null,
    asked: questionsAsked(st),
    shown: aidsShown(st),
    pictures: st.attachments.filter((a) => a.kind === 'image').map((a) => a.name.slice(0, 80)).slice(0, 8),
    sites: (st.references ?? []).filter((r) => r.state === 'liked').map((r) => `${r.host}${r.title ? ` (“${r.title}”)` : ''}: colours ${r.colours.slice(0, 5).join(' ')}${r.fonts.length ? `; type ${r.fonts.slice(0, 3).join(', ')}` : ''}${r.take?.length ? `; take: ${r.take.join(', ')}` : ''}`.slice(0, 300)).slice(0, 4),
    system: env.systemName ? env.systemName.slice(0, 80) : null,
    justPicked: justPicked(st),
  };
}

/** What the person's latest reply picked from the aid the question before it showed. */
function justPicked(st: StudioState): PickKind[] {
  const [q, m] = st.transcript.slice(-2);
  if (m?.from !== 'person' || q?.from !== 'socria' || !q.aid) return [];
  const k: PickKind = q.aid.kind === 'palettes' ? 'palette' : q.aid.kind === 'type' ? 'type' : 'mood';
  const pick = st.brief?.chosen[k];
  return pick && q.aid.options.some((o) => o.name === pick.name) ? [k] : [];
}

// ── the brief, as the designer reads it ──

const linesOf = (label: string, xs: readonly string[]) => (xs.length ? `${label}:\n${xs.map((x) => `- ${x}`).join('\n')}` : '');

/** What was understood, written for the designer (lib/ux-v0/design/start.ts puts it in the project's memory). */
export function designBriefOf(st: StudioState): string {
  const b = st.brief ?? readerBrief(st);
  const turns = st.transcript.filter((m) => (m.from === 'person' || m.kind === 'question') && m.text.trim());
  // the opening words, then the conversation since (SocriaUX's questions with the answers they drew)
  const [first, ...rest] = turns;
  const conversation = rest.map((m) => `${m.from === 'person' ? 'They said' : 'SocriaUX asked'}: ${m.text.trim().slice(0, 400)}`);
  const chosen = [
    b.chosen.palette ? `Colours they picked (${b.chosen.palette.name}): ${b.chosen.palette.colours.join(', ')} — ${b.chosen.palette.note}` : '',
    b.chosen.type ? `Lettering they picked (${b.chosen.type.name}): ${b.chosen.type.display}${b.chosen.type.body !== b.chosen.type.display ? ` for display, ${b.chosen.type.body} for text` : ''} — ${b.chosen.type.note}` : '',
    b.chosen.mood ? `Mood they picked (${b.chosen.mood.name}): ${b.chosen.mood.note}; its colours ${b.chosen.mood.colours.join(', ')}; its face ${b.chosen.mood.display}` : '',
  ].filter(Boolean);
  const text = [
    `In their words: “${(first?.text ?? st.prompt).trim().slice(0, 600)}”`,
    conversation.length ? `The conversation since:\n${conversation.join('\n')}` : '',
    b.kind ? `What it is: ${b.kind}` : '',
    b.purpose ? `What it is for: ${b.purpose}` : '',
    b.audience ? `Who it is for: ${b.audience}` : '',
    b.content ? `Words to set, exactly as given:\n${b.content}` : 'No words were given for it: write short stand-in words that fit, keep facts (dates, places, prices, names of people) as obvious placeholders, and say which words are stand-ins.',
    b.feel ? `How it should feel, in their words: ${b.feel}` : '',
    linesOf('They asked for', b.explicit.filter((x) => x !== (first?.text ?? '').trim())),
    linesOf('Implied by the context', b.implied),
    linesOf('SocriaUX’s own reading, not confirmed by them (keep it or change it freely)', b.tentative),
    linesOf('Picked from what SocriaUX showed them — a picture of their taste, not a layout to copy', chosen),
    linesOf('Avoid', b.avoid),
    linesOf('References', b.references),
  ]
    .filter(Boolean)
    .join('\n');
  return text.slice(0, 4000);
}

/** The work's name, from what was said: the words to set, a brand, or what it is about. */
export function nameOf(st: StudioState): string {
  const b = st.brief;
  const f = readFacts(personWords(st).join(' \n'));
  const first = (b?.content ?? '').split('\n')[0]?.trim();
  return (first || f.brand || f.headline || f.quoted[0] || subjectOf(personWords(st).join(' ')).replace(/\b\p{L}/gu, (ch) => ch.toUpperCase()) || '').slice(0, 80);
}

export type { StudioMessage };
