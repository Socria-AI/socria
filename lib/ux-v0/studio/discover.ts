// lib/ux-v0/studio/discover.ts — the spatial creative brief: what SocriaUX understands about a graphic, a logo, a
// campaign or a website before it is made, and how the brief changes as the person shapes it.
//
// Not a conversation. The person's idea opens the brief (StudioState.prompt, editable in place). What is understood
// (StudioState.brief, ./brief.ts CreativeBrief) sits beside it, each line marked as theirs, implied, or SocriaUX's own
// guess. A few considerations are placed in it (StudioState.space, ./brief.ts SpatialBrief) — each a question written
// for this work, sometimes with palettes, pairings of faces or moods to look at. The person answers in words, picks,
// skips, edits a line in place, removes a pick, changes a colour, or adds a note in their own words; each change is
// applied here at once, and the question model (./discover-model.ts, through /api/ux-v0/studio-questions) then returns
// the brief updated: the considerations worth showing now, the brief in their words, a short line on what it took from
// the change. When the model cannot be reached, a small reader here raises only what the work cannot do without (what
// it is, a logo's name, what a vague request is for). Generating is possible at any moment: designBriefOf writes what is
// understood for the designer, in the person's own words, and the designer itself is unchanged.

import { readFacts } from './facts';
import { recognizeIntent } from './intent';
import { subjectOf } from './director';
import { said, type StudioMessage, type StudioMode, type StudioState } from './schema';
import { BRIEF_LIMITS, HEX, MAX_ASKED, MAX_OPEN, choiceWords, contrast, emptyBrief, emptySpace, type AidKind, type BriefField, type BriefModule, type CreativeBrief, type Mood, type Palette, type SpatialBrief, type TypePair } from './brief';
import { isCreative, pickKindOf, type CreativeMode, type PickKind, type Plan, type SpaceContext } from './discover-model';

export { isCreative, CREATIVE_MODES, type CreativeMode, type Plan } from './discover-model';

// ── what the person said ──

const DELEGATE =
  /^(?:(?:ok(?:ay)?|sure|honestly|just|please|yeah|yes|no|nah|fine|hmm+)[,.! ]+)*(?:surprise me|you decide|you choose|you pick|your call|up to you|dealer'?s choice|i trust (?:you|your (?:judge?ment|taste|eye))|whatever you (?:think|like|want)(?: is best)?|(?:it )?doesn'?t matter|no preference|i don'?t mind|(?:just )?(?:make|create|design|generate) (?:it|something|anything|whatever)(?: now| for me)?|go(?: ahead)?|go for it|let'?s go|do it|start|ready|that'?s (?:it|enough|all)|looks good)(?:[,.! ]+(?:(?:just )?(?:make|create|design|generate) (?:it|something|anything|whatever)(?: now| for me)?|surprise me|you decide|go(?: ahead)?|go for it|please|thanks|thank you|now))*[.!]*$/i;

/** Words that hand the rest to SocriaUX ("you decide", "surprise me", "just make something"). */
export const wantsMake = (text: string) => {
  const t = (text ?? '').trim().replace(/\s+/g, ' ');
  return t.length > 0 && t.length <= 90 && DELEGATE.test(t);
};

const SKIP = /^(?:(?:ok(?:ay)?|no|nah|hmm+)[,.! ]+)?(?:skip(?: (?:it|this(?: one)?|that(?: one)?|this question))?|pass|next(?: question)?|not sure|unsure|no idea|no clue|idk|dunno|i don[’']?t know|i[’']?m not sure|whatever)[.!]*$/i;

/** A consideration passed on in words ("Skip", "pass"): SocriaUX settles that point itself. */
export const skips = (text: string) => SKIP.test((text ?? '').trim().replace(/\s+/g, ' '));

const spaceOf = (st: StudioState): SpatialBrief => st.space ?? emptySpace();

/** Everything the person has said about the work, in order: their idea, their answers in words, their notes. */
export function personWordsOf(st: StudioState): string[] {
  const sp = st.space;
  const out = [st.prompt.trim()];
  if (sp) {
    for (const m of sp.modules) if (m.status === 'answered' && m.answer && m.answer.pick === null) out.push(m.answer.text);
    for (const n of sp.notes) out.push(n.text);
  } else {
    for (const m of st.transcript) if (m.from === 'person' && m.kind !== 'prompt' && m.text.trim() && !skips(m.text)) out.push(m.text.trim());
  }
  return out.filter(Boolean);
}

/** Considerations open now, in their order. */
export const openModules = (st: StudioState) => spaceOf(st).modules.filter((m) => m.status === 'open');
/** The aids shown in this brief (each kind is offered once). */
export const aidsShown = (st: StudioState): AidKind[] => spaceOf(st).shown;
/** Considerations shown in all. */
export const questionsAsked = (st: StudioState) => spaceOf(st).asked;

/** Whether the brief has a change the model has not yet seen (and the work has not begun). */
export function awaitingPlan(st: StudioState): boolean {
  return st.status === 'discovering' && isCreative(st.mode) && spaceOf(st).stale && !spaceOf(st).making;
}

/** Whether Generate was pressed (a reload picks the making up). */
export const makingNow = (st: StudioState) => isCreative(st.mode) && st.status === 'discovering' && !!st.space?.making;

// ── the person's changes, applied at once ──

const touch = (st: StudioState, change: string, patch: Partial<SpatialBrief> = {}): StudioState => {
  const sp = spaceOf(st);
  return { ...st, space: { ...sp, ...patch, stale: true, change: change.slice(0, 200) } };
};
/** Any other change the person made (a design system chosen, pictures brought, the kind of work switched), marked for
 * the model to see. */
export const changed = (st: StudioState, change: string): StudioState => touch(st, change);
const withModule = (st: StudioState, id: string, f: (m: BriefModule) => BriefModule) => ({ ...spaceOf(st), modules: spaceOf(st).modules.map((m) => (m.id === id ? f(m) : m)) });
const briefOf = (st: StudioState): CreativeBrief => st.brief ?? readerBrief(st);

/** A consideration answered in the person's own words (or, for a choice, one of its answers). */
export function answerModule(st: StudioState, id: string, text: string, now = Date.now()): StudioState {
  const m = spaceOf(st).modules.find((x) => x.id === id);
  const t = text.trim().slice(0, 400);
  if (!m || !t) return st;
  if (skips(t)) return skipModule(st, id);
  const space = withModule(st, id, (x) => ({ ...x, status: 'answered', answer: { text: t, pick: null, at: now }, lead: false }));
  return touch({ ...st, space }, `answered “${m.topic}” in their words: ${t}`);
}

/** One of the options a visual consideration offered, picked: kept in the brief as their taste. */
export function pickOption(st: StudioState, id: string, index: number, now = Date.now()): StudioState {
  const m = spaceOf(st).modules.find((x) => x.id === id);
  const opt = m?.aid?.options[index];
  if (!m?.aid || !opt) return st;
  const brief = briefOf(st);
  const chosen: CreativeBrief['chosen'] = { ...brief.chosen };
  if (m.aid.kind === 'palettes') chosen.palette = opt as Palette;
  if (m.aid.kind === 'type') chosen.type = opt as TypePair;
  if (m.aid.kind === 'moods') chosen.mood = opt as Mood;
  const words = choiceWords(m.aid.kind, opt);
  const space = withModule(st, id, (x) => ({ ...x, status: 'answered', answer: { text: words, pick: index, at: now }, lead: false }));
  return touch({ ...st, brief: { ...brief, chosen }, space }, `picked for “${m.topic}”: ${words}`);
}

/** A consideration passed on: SocriaUX settles it. */
export function skipModule(st: StudioState, id: string): StudioState {
  const m = spaceOf(st).modules.find((x) => x.id === id);
  if (!m) return st;
  const space = withModule(st, id, (x) => ({ ...x, status: 'skipped', answer: null, lead: false }));
  return touch({ ...st, space }, `skipped “${m.topic}” (left to SocriaUX)`);
}

/** An answered or skipped consideration opened again (its pick, if any, let go). */
export function reopenModule(st: StudioState, id: string): StudioState {
  const m = spaceOf(st).modules.find((x) => x.id === id);
  if (!m || m.status === 'open') return st;
  let brief = st.brief;
  if (m.aid && m.answer?.pick !== null && m.answer && brief) {
    const k = pickKindOf(m.aid.kind);
    const { [k]: _gone, ...rest } = brief.chosen;
    brief = { ...brief, chosen: rest };
  }
  const space = withModule(st, id, (x) => ({ ...x, status: 'open', answer: null }));
  // reopened by the person: it stays open whatever the cap on new considerations says
  return { ...st, brief, space: { ...space, stale: false, change: `reopened “${m.topic}”` } };
}

/** Their idea, edited in place. */
export function editPrompt(st: StudioState, text: string): StudioState {
  const t = text.replace(/\s+/g, ' ').trim().slice(0, 2000);
  if (!t || t === st.prompt) return st;
  return touch({ ...st, prompt: t }, `edited their idea to: ${t}`);
}

/** A line of what is understood, written by the person in place: theirs from now on. */
export function editField(st: StudioState, field: BriefField, value: string): StudioState {
  const v = field === 'content' ? value.replace(/\u0000/g, '').trim().slice(0, BRIEF_LIMITS.content) : value.replace(/\s+/g, ' ').trim().slice(0, BRIEF_LIMITS.field);
  const brief = briefOf(st);
  if (brief[field] === v) return st;
  const sp = spaceOf(st);
  const own = v ? [...new Set([...sp.own, field])] : sp.own.filter((f) => f !== field);
  return touch({ ...st, brief: { ...brief, [field]: v } }, `${v ? `set “${field}” themselves: ${v}` : `cleared “${field}”`}`, { own });
}

/** Something added in their own words, outside any consideration ("darker, more mysterious"). */
export function addNote(st: StudioState, text: string, now = Date.now()): StudioState {
  const t = text.trim().slice(0, 600);
  if (!t) return st;
  const sp = spaceOf(st);
  const notes = [...sp.notes, { id: `n${now.toString(36)}${sp.notes.length}`, text: t, at: now }].slice(-12);
  return touch(st, `added a note: ${t}`, { notes });
}

/** A note taken back. */
export function removeNote(st: StudioState, id: string): StudioState {
  const sp = spaceOf(st);
  const n = sp.notes.find((x) => x.id === id);
  if (!n) return st;
  return touch(st, `took back their note: ${n.text}`, { notes: sp.notes.filter((x) => x.id !== id) });
}

/** A pick taken back (its consideration opened again, to pick another or answer in words). */
export function removeChosen(st: StudioState, kind: PickKind): StudioState {
  const brief = briefOf(st);
  if (!brief.chosen[kind]) return st;
  const { [kind]: _gone, ...chosen } = brief.chosen;
  const sp = spaceOf(st);
  const modules = sp.modules.map((m) => (m.aid && pickKindOf(m.aid.kind) === kind && m.answer?.pick !== null && m.status === 'answered' ? { ...m, status: 'open' as const, answer: null } : m));
  return touch({ ...st, brief: { ...brief, chosen } }, `took back the ${kind} they had picked`, { modules });
}

/** One colour of the picked palette changed by the person (any colour: the brief says when its ink may not read). */
export function setPaletteColour(st: StudioState, index: number, hex: string): StudioState {
  const brief = briefOf(st);
  const p = brief.chosen.palette;
  const h = hex.trim().toLowerCase();
  if (!p || !HEX.test(h) || index < 0 || index >= p.colours.length || p.colours[index] === h) return st;
  const colours = p.colours.map((c, i) => (i === index ? h : c));
  return touch({ ...st, brief: { ...brief, chosen: { ...brief.chosen, palette: { ...p, colours, edited: true } } } }, `changed a colour of their palette to ${h}`);
}

/** Whether a palette's ink reads on its ground (4.5:1). */
export const paletteReads = (p: Palette) => p.colours.length >= 2 && contrast(p.colours[0], p.colours[1]) >= 4.5;

/** SocriaUX's guess confirmed by the person: theirs now. */
export function keepTentative(st: StudioState, line: string): StudioState {
  const brief = briefOf(st);
  if (!brief.tentative.includes(line)) return st;
  return touch({ ...st, brief: { ...brief, tentative: brief.tentative.filter((x) => x !== line), explicit: [...brief.explicit, line].slice(-BRIEF_LIMITS.list) } }, `confirmed SocriaUX’s reading: ${line}`);
}

/** SocriaUX's guess turned down: it goes, and is kept out. */
export function dropTentative(st: StudioState, line: string): StudioState {
  const brief = briefOf(st);
  if (!brief.tentative.includes(line)) return st;
  return touch({ ...st, brief: { ...brief, tentative: brief.tentative.filter((x) => x !== line), avoid: [...brief.avoid, line].slice(-BRIEF_LIMITS.list) } }, `turned down SocriaUX’s reading: ${line}`);
}

/** A line of what to avoid, taken back. */
export function dropAvoid(st: StudioState, line: string): StudioState {
  const brief = briefOf(st);
  if (!brief.avoid.includes(line)) return st;
  return touch({ ...st, brief: { ...brief, avoid: brief.avoid.filter((x) => x !== line) } }, `no longer wants to avoid: ${line}`);
}

// ── the brief updated by the model (or the reader) ──

/** A plan carried out: answered considerations kept, open ones kept or retired, new ones added in their place. */
export function applyPlan(st: StudioState, plan: Plan): StudioState {
  const sp = spaceOf(st);
  const mode = plan.mode && plan.mode !== st.mode && isCreative(st.mode) ? plan.mode : st.mode;
  const settled = !!plan.mode;
  const fresh = new Map(plan.modules.map((m) => [m.id, m]));
  const retire = new Set(plan.retire);
  const prevChosen = st.brief?.chosen ?? {};
  // answers a later change superseded, rewritten; a pick its kind no longer holds becomes words
  const revised = new Map(plan.answers.map((a) => [a.id, a.text]));
  let modules: BriefModule[] = sp.modules
    .filter((m) => !(m.status === 'open' && retire.has(m.id)))
    .map((m) => {
      if (m.status === 'open' && fresh.has(m.id)) return { ...fresh.get(m.id)!, status: 'open' as const, answer: null };
      if (m.status === 'answered' && m.answer) {
        const lostPick = m.aid && m.answer.pick !== null && !!prevChosen[pickKindOf(m.aid.kind)] && !plan.brief.chosen[pickKindOf(m.aid.kind)];
        const text = revised.get(m.id);
        if (text || lostPick) return { ...m, answer: { ...m.answer, text: text ?? m.answer.text, pick: lostPick ? null : m.answer.pick } };
      }
      return m;
    });
  const known = new Set(modules.map((m) => m.id));
  const added = plan.modules.filter((m) => !known.has(m.id));
  const open = modules.filter((m) => m.status === 'open').length;
  const room = Math.max(0, MAX_OPEN - open);
  const take = added.slice(0, room);
  modules = [...modules, ...take];
  // one lead: the plan's, or the one kept, or the first open
  const leadId = plan.modules.find((m) => m.lead)?.id ?? modules.find((m) => m.status === 'open' && m.lead)?.id ?? modules.find((m) => m.status === 'open')?.id;
  modules = modules.map((m) => ({ ...m, lead: m.status === 'open' && m.id === leadId }));
  const shown = [...new Set([...sp.shown, ...take.map((m) => m.aid?.kind).filter((k): k is AidKind => !!k)])];
  const space: SpatialBrief = {
    ...sp,
    note: plan.note,
    modules,
    ready: plan.ready || !modules.some((m) => m.status === 'open'),
    by: plan.by,
    asked: sp.asked + take.length,
    shown,
    stale: false,
    rev: sp.rev + 1,
  };
  return { ...st, mode, ...(settled || (st.modeBy === 'unsure' && mode !== st.mode) ? { modeBy: 'recognised' as const } : {}), brief: plan.brief, space };
}

/** Generate: made now with what is understood, whatever is still open left to SocriaUX. */
export function startMaking(st: StudioState, now = Date.now()): StudioState {
  const brief = briefOf(st);
  const left = 'Anything not said here is left to SocriaUX’s judgement.';
  const b = brief.implied.includes(left) ? brief : { ...brief, implied: [...brief.implied, left].slice(-BRIEF_LIMITS.list) };
  const sp = spaceOf(st);
  return said({ ...st, brief: b, space: { ...sp, making: true, stale: false } }, { from: 'socria', kind: 'note', stage: 'making', text: 'Making it from the brief.', at: now });
}

// ── the reader: when the model cannot be reached ──

const KIND_SAID: Record<CreativeMode, string> = { graphic: 'graphic', logo: 'logo', board: 'campaign', website: 'website' };

function kindWord(st: StudioState): string {
  const f = readFacts(personWordsOf(st).join(' \n'));
  if (st.mode === 'graphic' && f.kind && !['logo', 'campaign', 'identity'].includes(f.kind)) return f.kind === 'social' ? (f.story ? 'story' : 'post') : f.kind;
  return isCreative(st.mode) ? KIND_SAID[st.mode] : 'design';
}

/** The brief as the reader can tell it: the person's words, nothing invented. */
export function readerBrief(st: StudioState): CreativeBrief {
  const words = personWordsOf(st);
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

const readerModule = (id: string, topic: string, question: string, o: { options?: string[]; placeholder?: string } = {}): BriefModule => ({
  id,
  topic,
  question,
  kind: o.options ? 'choice' : 'text',
  lead: false,
  options: o.options ?? [],
  placeholder: o.placeholder ?? '',
  aid: null,
  status: 'open',
  answer: null,
});

/**
 * What the reader plans: only what the work cannot do without — what it is (when nothing says), a logo's name, what an
 * idea that says nothing about its subject is for — each raised once; otherwise the brief is ready.
 */
export function readerPlan(st: StudioState): Plan {
  const sp = spaceOf(st);
  const has = (id: string) => sp.modules.some((m) => m.id === id);
  let mode: CreativeMode | null = null;
  let cur = st;
  // the kind of work, read from the answer to "what are you making"
  const what = sp.modules.find((m) => m.id === 'what' && m.status === 'answered');
  if (st.modeBy === 'unsure' && what?.answer) {
    const r = recognizeIntent(what.answer.text);
    if (r.mode && isCreative(r.mode)) {
      mode = r.mode;
      cur = { ...st, mode: r.mode, modeBy: 'recognised' };
    }
  }
  const brief = readerBrief(cur);
  const modules: BriefModule[] = [];
  if (cur.modeBy === 'unsure' && !has('what')) modules.push(readerModule('what', 'What it is', 'What are you making?', { options: ['A poster or a post', 'A logo', 'A website', 'A campaign'] }));
  else {
    const words = personWordsOf(cur).join(' \n');
    const f = readFacts(words);
    if (cur.mode === 'logo' && !(f.brand || f.headline || f.quoted[0]) && !has('name')) modules.push(readerModule('name', 'The name', 'What’s it called?', { placeholder: 'The name, exactly as it should be set' }));
    if (!subjectOf(words) && !has('purpose')) modules.push(readerModule('purpose', 'What it is for', `What’s the ${kindWord(cur)} for?`));
  }
  const open = sp.modules.some((m) => m.status === 'open') || modules.length > 0;
  return { note: '', ready: !open, modules: modules.slice(0, Math.max(0, MAX_ASKED - sp.asked)), answers: [], retire: [], brief, mode, by: 'reader' };
}

// ── what the model is sent ──

/** The brief as the model reads it. */
export function spaceContextOf(st: StudioState, env: { systemName?: string } = {}): SpaceContext {
  const sp = spaceOf(st);
  return {
    mode: st.modeBy === 'unsure' ? 'unsure' : isCreative(st.mode) ? st.mode : 'graphic',
    system: env.systemName ? env.systemName.slice(0, 80) : null,
    prompt: st.prompt.slice(0, 2000) || 'Something to design',
    modules: sp.modules.map((m) => ({
      id: m.id,
      topic: m.topic,
      question: m.question,
      kind: m.kind,
      status: m.status,
      answer: m.answer ? `${m.answer.pick !== null ? 'picked ' : ''}${m.answer.text}` : '',
      offers: m.status === 'open' ? (m.aid ? m.aid.options.map((x) => x.name) : m.options) : [],
    })),
    notes: sp.notes.map((n) => n.text),
    change: sp.change,
    brief: st.brief ?? null,
    own: sp.own,
    asked: sp.asked,
    shown: sp.shown,
    pictures: st.attachments.filter((a) => a.kind === 'image').map((a) => a.name.slice(0, 80)).slice(0, 8),
    sites: (st.references ?? []).filter((r) => r.state === 'liked').map((r) => `${r.host}${r.title ? ` (“${r.title}”)` : ''}: colours ${r.colours.slice(0, 5).join(' ')}${r.fonts.length ? `; type ${r.fonts.slice(0, 3).join(', ')}` : ''}${r.take?.length ? `; take: ${r.take.join(', ')}` : ''}`.slice(0, 300)).slice(0, 4),
    justPicked: justPicked(st),
  };
}

/** What the latest change picked from an aid. */
function justPicked(st: StudioState): PickKind[] {
  const sp = spaceOf(st);
  if (!/^picked for /.test(sp.change)) return [];
  const latest = [...sp.modules].filter((m) => m.status === 'answered' && m.answer && m.answer.pick !== null && m.aid).sort((a, b) => (b.answer!.at ?? 0) - (a.answer!.at ?? 0))[0];
  return latest?.aid ? [pickKindOf(latest.aid.kind)] : [];
}

// ── the brief, as the designer reads it ──

const linesOf = (label: string, xs: readonly string[]) => (xs.length ? `${label}:\n${xs.map((x) => `- ${x}`).join('\n')}` : '');

/** What was understood, written for the designer (lib/ux-v0/design/start.ts puts it in the project's memory). */
export function designBriefOf(st: StudioState): string {
  const b = st.brief ?? readerBrief(st);
  const sp = spaceOf(st);
  const considered = sp.modules
    .filter((m) => m.status !== 'open')
    .map((m) => `- ${m.topic} (“${m.question}”): ${m.status === 'skipped' ? 'left to SocriaUX' : `${m.answer?.pick !== null ? 'they picked ' : ''}${m.answer?.text ?? ''}`}`);
  const chosen = [
    b.chosen.palette ? `Colours they picked (${b.chosen.palette.name}): ${b.chosen.palette.colours.join(', ')}${b.chosen.palette.edited ? ' (colours adjusted by them, in this order: ground, ink, accent, support)' : ''} — ${b.chosen.palette.note}` : '',
    b.chosen.type ? `Lettering they picked (${b.chosen.type.name}): ${b.chosen.type.display}${b.chosen.type.body !== b.chosen.type.display ? ` for display, ${b.chosen.type.body} for text` : ''} — ${b.chosen.type.note}` : '',
    b.chosen.mood ? `Mood they picked (${b.chosen.mood.name}): ${b.chosen.mood.note}; its colours ${b.chosen.mood.colours.join(', ')}; its face ${b.chosen.mood.display}` : '',
  ].filter(Boolean);
  const text = [
    `In their words: “${st.prompt.trim().slice(0, 600)}”`,
    considered.length ? `What they settled in the brief:\n${considered.join('\n')}` : '',
    sp.notes.length ? `What they added in their own words (where these disagree, the later one holds):\n${sp.notes.map((n) => `- ${n.text}`).join('\n')}` : '',
    b.kind ? `What it is: ${b.kind}` : '',
    b.purpose ? `What it is for: ${b.purpose}` : '',
    b.audience ? `Who it is for: ${b.audience}` : '',
    b.content ? `Words to set, exactly as given:\n${b.content}` : 'No words were given for it: write short stand-in words that fit, keep facts (dates, places, prices, names of people) as obvious placeholders, and say which words are stand-ins.',
    b.feel ? `How it should feel, in their words: ${b.feel}` : '',
    linesOf('They asked for', b.explicit.filter((x) => x !== st.prompt.trim())),
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
  const words = personWordsOf(st).join(' \n');
  const f = readFacts(words);
  const first = (b?.content ?? '').split('\n')[0]?.trim();
  return (first || f.brand || f.headline || f.quoted[0] || subjectOf(words).replace(/\b\p{L}/gu, (ch) => ch.toUpperCase()) || '').slice(0, 80);
}

export type { StudioMessage, StudioMode };
