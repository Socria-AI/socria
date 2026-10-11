// lib/objects/experience-asks.ts — what the experience route asks a model, and what it may do with the answer.
//
// THE SAME TRUST BOUNDARY AS EVERY DISPLAY: a language model proposes; the
// workspace decides. Each ask here builds one prompt from ONE experience's own
// state — never the person's memories, other conversations or anyone else's
// private material — and reads the answer into operations. Those operations
// are then applied AS SOCRIA to a scratch copy of the object, so the kind's
// own rules decide what survives: Socria cannot write the person's lines,
// speak for a participant, set a weight, make a commitment or decide. Only
// what passes goes back to the browser, to be applied there, as Socria's,
// again under the same rules.
//
//   rehearsal  reply     the counterpart's next line — simulated, in role
//              rephrase  another way to put the person's line, offered
//   untangle   sort      readings, groups and dependencies — all suggestions
//   crossroads consider  questions, assumptions and unknowns worth naming
//              imagine   hypothetical ways one option could go — no odds
//   commonground suggest possible shared goals, questions, experiments
//
// PURE — the route does the calling.

import { apply, create, currentOf, EMPTY_SPACE, kindOf, type ObjectSpace } from './core';
import { cleanText, nextId } from './display-base';
import { lineOf, whoseTurn, type RehearsalState } from './display-rehearsal';
import { CATEGORIES, CATEGORY_WORD, type UntangleState } from './display-untangle';
import { NOTE_WORD, type CrossroadsState } from './display-crossroads';
import { ITEM_KINDS, ITEM_WORD, nameOf, type GroundState } from './display-commonground';

export type Ask =
  | { kind: 'rehearsal'; action: 'reply' | 'rephrase'; turn?: string }
  | { kind: 'untangle'; action: 'sort' }
  | { kind: 'crossroads'; action: 'consider' | 'imagine'; alt?: string }
  | { kind: 'commonground'; action: 'suggest' };

const ACTIONS: Record<string, string[]> = { rehearsal: ['reply', 'rephrase'], untangle: ['sort'], crossroads: ['consider', 'imagine'], commonground: ['suggest'] };

/** The ask a request makes, or null when it is not one this route answers. */
export function readAsk(body: unknown): Ask | null {
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  const kind = typeof b?.kind === 'string' ? b.kind : '';
  const action = typeof b?.action === 'string' ? b.action : '';
  if (!ACTIONS[kind]?.includes(action)) return null;
  const id = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(v) ? v : undefined);
  if (kind === 'rehearsal') return { kind, action: action as 'reply' | 'rephrase', ...(id(b!.turn) ? { turn: id(b!.turn) } : {}) };
  if (kind === 'crossroads') return { kind, action: action as 'consider' | 'imagine', ...(id(b!.alt) ? { alt: id(b!.alt) } : {}) };
  return { kind, action } as Ask;
}

export interface Prompted {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  temperature: number;
}

/** What is refused before any model is asked — a reply when it is not their turn, an option that is not there. */
export function precheck(ask: Ask, state: unknown): string | null {
  if (ask.kind === 'rehearsal') {
    const s = state as RehearsalState;
    if (s.paused) return 'The rehearsal is paused.';
    if (ask.action === 'reply' && whoseTurn(s) !== 'them') return 'It is your turn to speak.';
    if (ask.action === 'rephrase' && !lineOf(s).some((t) => t.who === 'you' && (!ask.turn || t.id === ask.turn))) return 'Say a line first.';
  }
  if (ask.kind === 'untangle' && !(state as UntangleState).thoughts.length) return 'There are no thoughts to sort yet.';
  if (ask.kind === 'crossroads') {
    const s = state as CrossroadsState;
    if (!s.alternatives.length) return 'Add an option first.';
    if (ask.action === 'imagine' && !s.alternatives.some((a) => a.id === ask.alt)) return 'Say which option.';
  }
  if (ask.kind === 'commonground' && !(state as GroundState).perspectives.length && !(state as GroundState).items.length) return 'Write a perspective first — suggestions are made only from what is here.';
  return null;
}

const JSON_ONLY = 'Return ONLY JSON in the shape given. Write in plain, warm, unshowy English.';

const PUSHBACK: Record<RehearsalState['difficulty'], string> = {
  gentle: 'open to what the person says; you ask a clarifying question or two and are easy to persuade by a reasonable point',
  realistic: 'reasonable but with your own interests; you push back once or twice and need a good reason before agreeing',
  tough: 'hard to persuade: busy, sceptical, you raise objections and constraints, and agree only to what is well argued — never hostile or cruel',
};

export function buildPrompt(ask: Ask, state: unknown): Prompted {
  if (ask.kind === 'rehearsal') {
    const s = state as RehearsalState;
    const who = s.counterpart.name || s.counterpart.role || 'the other person';
    const setup = [
      `The person wants: ${s.goal || '(not said)'}`,
      s.situation ? `Situation, as they described it: ${s.situation}` : '',
      s.counterpart.about ? `What the person said about ${who} (their view, not a fact): ${s.counterpart.about}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    const line = lineOf(s);
    if (ask.action === 'reply') {
      return {
        temperature: 0.7,
        system: `You are playing ONE role in a rehearsal: ${who}${s.counterpart.name && s.counterpart.role ? ` (${s.counterpart.role})` : ''}. The person is practising a real conversation they are going to have.
${setup}
How you respond: ${PUSHBACK[s.difficulty]}.

RULES
- Reply with ONE turn, as ${who} might plausibly say it: one to three sentences of ordinary speech. No stage directions, no narration, no quotation marks around it.
- Stay in role. Never write the person's lines, never coach them, never comment on how they are doing.
- Do not invent facts about their life or work beyond what is here. Where your role would need a fact you do not have, ask for it, in role.
- No psychological judgments of the person. Be a believable human, not a caricature.
- This is a simulation — one possibility to practise against, not a prediction of what the real ${who} will say.
- If the person's last line closes the conversation, reply with a natural closing line.
${JSON_ONLY}
{"line": "what ${who} says"}`,
        messages: line.length ? line.map((t) => ({ role: t.who === 'you' ? ('user' as const) : ('assistant' as const), content: t.text })) : [{ role: 'user', content: '(The person has asked you to start. Open the conversation as you would.)' }],
      };
    }
    const mine = line.filter((t) => t.who === 'you');
    const target = (ask.turn ? mine.find((t) => t.id === ask.turn) : null) ?? mine[mine.length - 1];
    return {
      temperature: 0.6,
      system: `The person is rehearsing a conversation with ${who}. ${setup}
They asked for ANOTHER WAY to say one of their own lines. Offer ONE alternative that keeps their meaning, their aim and their voice — not a better person's speech, theirs, put another way. It is an option for them to consider, never a correction.
Their line: “${target?.text ?? ''}”
${JSON_ONLY}
{"text": "the alternative, as they might say it"}`,
      messages: [{ role: 'user', content: 'Another way to say it, please.' }],
    };
  }
  if (ask.kind === 'untangle') {
    const s = state as UntangleState;
    const list = s.thoughts.map((t) => `- [${t.id}] ${t.text} (kind: ${t.cat}${t.catBy === 'person' ? ', set by them' : ''}${t.cluster ? ', grouped' : ''})`).join('\n');
    return {
      temperature: 0.2,
      system: `The person wrote out what is on their mind, and it has been separated into thoughts, in their words. Suggest how it might be sorted — they will accept, change or ignore each suggestion.
THOUGHTS
${list}

Suggest:
1. "cats": a kind for thoughts whose kind they have NOT set themselves — one of: ${CATEGORIES.filter((c) => c !== 'commitment').join(', ')} (${CATEGORIES.filter((c) => c !== 'commitment')
        .map((c) => `${c} = ${CATEGORY_WORD[c].toLowerCase()}`)
        .join('; ')}). Never "commitment" — only the person makes one.
2. "groups": up to 5 short group names (2–4 words, in plain terms like "Money" or "School"), each with the ids of ungrouped thoughts that belong to it. Leave out what fits nowhere.
3. "ties": pairs where one plainly has to happen before the other ("from" first, then "to"). Only obvious ones; none is fine.
Never infer emotions, diagnoses or how important anything is to them.
${JSON_ONLY}
{"cats": [{"id": "t1", "cat": "task"}], "groups": [{"name": "Money", "ids": ["t3"]}], "ties": [{"from": "t2", "to": "t5"}]}`,
      messages: [{ role: 'user', content: 'Suggest how to sort these.' }],
    };
  }
  if (ask.kind === 'crossroads') {
    const s = state as CrossroadsState;
    const opts = s.alternatives.map((a) => `- [${a.id}] ${a.name}${a.note ? ` — ${a.note}` : ''}`).join('\n');
    const pris = s.priorities.map((p) => `- [${p.id}] ${p.name} (${p.kind === 'constraint' ? 'must-have' : 'matters'})`).join('\n') || '(none yet)';
    const notes = s.notes.map((n) => `- ${NOTE_WORD[n.kind]}${n.alt ? ` (${s.alternatives.find((a) => a.id === n.alt)?.name})` : ''}: ${n.text}`).join('\n') || '(none)';
    const qs = s.questions.map((q) => `- ${q.text}`).join('\n') || '(none)';
    const as = s.assumptions.map((a) => `- ${a.text}`).join('\n') || '(none)';
    const head = `The person is working through a decision: “${s.decision || s.title}”.
OPTIONS
${opts}
WHAT MATTERS TO THEM
${pris}
WHAT THEY HAVE NOTED
${notes}
QUESTIONS ALREADY OPEN
${qs}
ASSUMPTIONS ALREADY NAMED
${as}`;
    if (ask.action === 'imagine') {
      const alt = s.alternatives.find((a) => a.id === ask.alt)!;
      return {
        temperature: 0.6,
        system: `${head}

Imagine three HYPOTHETICAL ways “${alt.name}” could go — one where it goes well, one somewhere in between, one where it goes badly — each two or three sentences, concrete, grounded only in what is above. These are possibilities to think with, not forecasts: no probabilities, no percentages, no numbers they did not give, nothing about their future stated as fact.
${JSON_ONLY}
{"best": "…", "plausible": "…", "worst": "…"}`,
        messages: [{ role: 'user', content: `Imagine how ${alt.name} could go.` }],
      };
    }
    return {
      temperature: 0.3,
      system: `${head}

Help them think — never decide. Suggest only what is NOT already above:
- "questions": up to 3 questions worth finding out before deciding;
- "assumptions": up to 3 things the decision seems to rest on, each with the option id it concerns when it concerns one;
- "unknowns": up to 4 things not yet known about a particular option, each with its option id.
Never recommend an option, never say which is better, never rate or weigh anything.
${JSON_ONLY}
{"questions": ["…"], "assumptions": [{"text": "…", "alt": "a1"}], "unknowns": [{"alt": "a1", "text": "…"}]}`,
      messages: [{ role: 'user', content: 'What else should I be considering?' }],
    };
  }
  const s = state as GroundState;
  const persp = s.perspectives.map((p) => `- ${nameOf(s, p.author)}: stands — ${p.position || '(not said)'}; matters to them — ${p.why || '(not said)'}`).join('\n') || '(none yet)';
  const items = s.items.map((it) => `- ${ITEM_WORD[it.kind]}: ${it.text}`).join('\n') || '(none yet)';
  return {
    temperature: 0.3,
    system: `People who see something differently are looking for common ground on: “${s.question || s.title}”.
THEIR PERSPECTIVES, IN THEIR OWN WORDS
${persp}
WHAT THEY HAVE ALREADY WRITTEN DOWN
${items}

Suggest, for them to accept or ignore — never as anyone's view:
- up to 2 "goal"s they might share, only where the perspectives above plainly point to it;
- up to 3 "question"s that would clarify what someone means;
- up to 2 "evidence" items: something they could find out that would settle a point of fact;
- up to 2 "experiment"s: a small, reversible thing to try;
- up to 2 "compromise"s.
Never say who is right, never put words in anyone's mouth, never call anything agreed.
${JSON_ONLY}
{"items": [{"kind": "goal", "text": "…"}]}`,
    messages: [{ role: 'user', content: 'What might we be missing?' }],
  };
}

const PREACHY = /\b(?:you should|i(?:'d| would)? recommend|the (?:best|right|better) (?:option|choice)|go with|i suggest choosing)\b/i;
const ODDS = /\d+\s?%|\bpercent\b|\b(?:probability|chance|likely|odds) of\b/i;
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const str = (v: unknown, max: number) => cleanText(v, max);

/** The answer read into the operations it proposes — before the kind decides which may stand. */
export function readAnswer(ask: Ask, state: unknown, raw: unknown): { op: string; args: Record<string, string | number> }[] {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: { op: string; args: Record<string, string | number> }[] = [];
  if (ask.kind === 'rehearsal') {
    if (ask.action === 'reply') {
      const line = str(r.line, 600).replace(/^["“]|["”]$/g, '');
      if (line) out.push({ op: 'say', args: { who: 'them', text: line, by: 'socria' } });
    } else {
      const s = state as RehearsalState;
      const mine = lineOf(s).filter((t) => t.who === 'you');
      const target = (ask.turn ? mine.find((t) => t.id === ask.turn) : null) ?? mine[mine.length - 1];
      const text = str(r.text, 400);
      if (text && target) out.push({ op: 'hint', args: { turn: target.id, text, by: 'socria' } });
    }
    return out;
  }
  if (ask.kind === 'untangle') {
    const s = state as UntangleState;
    const ids = new Set(s.thoughts.map((t) => t.id));
    for (const c of arr(r.cats).slice(0, 60)) {
      const o = c as Record<string, unknown>;
      if (typeof o?.id === 'string' && ids.has(o.id) && CATEGORIES.includes(o.cat as never) && o.cat !== 'commitment') out.push({ op: 'cat', args: { id: o.id, cat: String(o.cat), by: 'socria' } });
    }
    const taken = [...s.thoughts.map((t) => t.id), ...s.clusters.map((c) => c.id)];
    for (const g of arr(r.groups).slice(0, 5)) {
      const o = g as Record<string, unknown>;
      const name = str(o?.name, 60);
      const members = arr(o?.ids).filter((x): x is string => typeof x === 'string' && ids.has(x));
      if (!name || !members.length) continue;
      const existing = s.clusters.find((c) => c.name.toLowerCase() === name.toLowerCase());
      const id = existing?.id ?? nextId('g', taken);
      if (!existing) {
        taken.push(id);
        out.push({ op: 'addCluster', args: { id, name, by: 'socria' } });
      }
      for (const m of members) out.push({ op: 'place', args: { id: m, cluster: id } });
    }
    for (const t of arr(r.ties).slice(0, 12)) {
      const o = t as Record<string, unknown>;
      if (typeof o?.from === 'string' && typeof o?.to === 'string' && ids.has(o.from) && ids.has(o.to) && o.from !== o.to) out.push({ op: 'tie', args: { from: o.from, to: o.to, kind: 'depends', by: 'socria' } });
    }
    return out;
  }
  if (ask.kind === 'crossroads') {
    const s = state as CrossroadsState;
    const alts = new Set(s.alternatives.map((a) => a.id));
    if (ask.action === 'imagine') {
      for (const c of ['best', 'plausible', 'worst'] as const) {
        const text = str(r[c], 400);
        if (text && !ODDS.test(text) && !PREACHY.test(text)) out.push({ op: 'addScenario', args: { alt: ask.alt!, case: c, text, by: 'socria' } });
      }
      return out;
    }
    for (const q of arr(r.questions).slice(0, 3)) {
      const text = str(q, 240);
      if (text && !PREACHY.test(text)) out.push({ op: 'addQuestion', args: { text, by: 'socria' } });
    }
    for (const a of arr(r.assumptions).slice(0, 3)) {
      const o = a as Record<string, unknown>;
      const text = str(o?.text ?? a, 240);
      if (text && !PREACHY.test(text)) out.push({ op: 'addAssumption', args: { text, ...(typeof o?.alt === 'string' && alts.has(o.alt) ? { alt: o.alt } : {}), by: 'socria' } });
    }
    for (const u of arr(r.unknowns).slice(0, 4)) {
      const o = u as Record<string, unknown>;
      const text = str(o?.text, 240);
      if (text && typeof o?.alt === 'string' && alts.has(o.alt) && !PREACHY.test(text)) out.push({ op: 'addNote', args: { alt: o.alt, kind: 'unknown', text, by: 'socria' } });
    }
    return out;
  }
  for (const it of arr(r.items).slice(0, 11)) {
    const o = it as Record<string, unknown>;
    const text = str(o?.text, 240);
    if (text && ITEM_KINDS.includes(o?.kind as never) && o?.kind !== 'fact' && o?.kind !== 'value' && o?.kind !== 'disagreement' && !PREACHY.test(text)) out.push({ op: 'add', args: { kind: String(o.kind), text, by: 'socria' } });
  }
  return out;
}

/**
 * The proposed operations, applied as Socria, one after another, to a scratch
 * copy of the object: what the kind refuses is dropped, and only what passes
 * is returned — in order, as the browser will apply it.
 */
export function vetOps(kind: string, state: unknown, ops: { op: string; args: Record<string, string | number> }[]): { ops: typeof ops; refused: string[] } {
  const made = create(EMPTY_SPACE, kind, state, { origin: 'person', name: 'X' });
  if (!made) return { ops: [], refused: ['That could not be read.'] };
  let space: ObjectSpace = made.space;
  const kept: typeof ops = [];
  const refused: string[] = [];
  for (const o of ops) {
    const r = apply(space, made.obj.id, o.op, o.args, { by: 'socria', at: 1 });
    if (r.ok) {
      space = r.space;
      kept.push(o);
    } else refused.push(r.why);
  }
  return { ops: kept, refused };
}

/** The kind's own reading of a state sent by the browser — nothing else of it is trusted. */
export function readState(kind: string, raw: unknown): unknown | null {
  const k = kindOf(kind);
  if (!k) return null;
  const s = k.sanitize(raw);
  return s === null ? null : s;
}

export { currentOf };
