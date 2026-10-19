// lib/objects/display-study.ts — A STUDY: THE PERSON'S FILES SORTED INTO
// TOPICS, AND THE PRACTICE MADE FROM THEM.
//
// Logos 5's study path (lib/logos5/study.ts) keeps everything it makes here,
// as one display in the line of thinking's map — the topics with their
// verbatim quotes, which one to start with, each practice set, what was typed
// into it and whether it was checked. So a study is saved, synced and shared
// with the conversation like any display, and a saved conversation keeps its
// shape. The quotes are kept in the state, not only pointed at: documents
// stay on the device that read them, and a collaborator still sees the words.
//
// It is made only by "Organize it", never asked for by name or proposed
// (`internal`). Its screen is the board and the practice, not a panel in the
// workspace. It changes by whole states (`restudy`): a sort or a practice set
// is far larger than a step's arguments, and nothing in it needs undoing
// step by step — so it keeps only two states.
//
// What the reply model is told about it never includes the answer to
// practice the person has not submitted.
//
// PURE.

import { kindOf, register, type ObjectSpace, type Part, type ThoughtObject, type ViewDecl } from './core';
import { cleanText, displayKind, headOps, registerDisplay, type DisplayHead, type DisplayMeta } from './display-base';
import { INTENTS, sanitizeStudy as sanitizeStudyCore, sortedSaid, sourcesOf, TOPIC_KIND_LABEL, type StudyState as StudyCore } from '@/lib/logos5/study';

export type StudyView = 'board';
export interface StudyState extends StudyCore, DisplayHead {
  view: StudyView;
}

const views: ViewDecl<StudyState>[] = [
  { id: 'board', label: 'Topics', shows: 'the files sorted into topics, each with its quotes and pages, and the practice made from them', primary: true, interactions: ['pick a topic', 'practise it', 'check answers'] },
];

export function sanitizeStudyDisplay(raw: unknown): StudyState | null {
  const core = sanitizeStudyCore(raw);
  if (!core) return null;
  const r = raw as Record<string, unknown>;
  return { ...core, title: cleanText(r.title, 80) || core.course || 'Study', view: 'board' };
}

type S = StudyState;

export const STUDY = displayKind<S>({
  kind: 'study',
  label: 'Study',
  sanitize: sanitizeStudyDisplay,
  ops: { ...headOps<S>(views, sanitizeStudyDisplay) },
  readOp: () => null,
  facts: (s) => {
    const out = [`${s.title}: the person is ${INTENTS[s.goal]}. Socria ${sortedSaid(s)}${s.plain ? ' by the files’ own sections' : ''}.`];
    const start = s.topics.find((t) => t.id === s.start);
    if (start) out.push(`Recommended start: “${start.title}”.${s.why ? ` ${s.why}` : ''}`);
    for (const p of s.practice.slice(-3)) {
      const topic = s.topics.find((t) => t.id === p.topic)?.title ?? 'a topic';
      if (!p.checked) out.push(`They are practising “${topic}” (${p.kind === 'journal' ? 'journal entries' : 'fill in the blank'}), not yet submitted — do not give its answers.`);
      else
        out.push(
          `They checked their practice on “${topic}”: ${p.checked.right} of ${p.checked.of} right.${p.checked.gaps.length ? ` What they missed: ${p.checked.gaps
            .slice(0, 3)
            .map((g) => `${g.label} — ${g.answer}`)
            .join('; ')}.` : ''}`
        );
    }
    return out;
  },
  text: (s) =>
    [
      `STUDY “${s.title}” — ${sortedSaid(s)}:`,
      ...s.topics.map((t, i) => `${i + 1}. ${t.title} (${TOPIC_KIND_LABEL[t.kind]}, ${sourcesOf(t)} sources)${t.summary ? ` — ${t.summary}` : ''}`),
    ]
      .join('\n')
      .slice(0, 1400),
  parts: (s): Part[] => s.topics.map((t) => ({ id: t.id, label: t.title })),
  partLabel: (s, part) => s.topics.find((t) => t.id === part)?.title ?? null,
  // a topic pointed at (Point & Ask): what it is, and the files' own words for it, with their pages
  partFacts: (s, part) => {
    const t = s.topics.find((x) => x.id === part);
    if (!t) return null;
    const file = (doc: string) => s.files.find((f) => f.doc === doc)?.name ?? 'their file';
    return [
      `The topic “${t.title}” (${TOPIC_KIND_LABEL[t.kind].toLowerCase()}, ${sourcesOf(t)} sources)${t.summary ? `: ${t.summary}` : ''}`,
      ...t.quotes.slice(0, 4).map((q) => `“${q.text}” — ${file(q.doc)}, p.${q.page}`),
    ];
  },
  views,
  maxStates: 2,
  argLimits: { count: 4, length: 80 },
  size: (_s, mode) => (mode === 'card' ? { w: 280, h: 150 } : mode === 'trail' ? { w: 200, h: 110 } : { w: 900, h: 640 }),
  shape: (s) => `${s.topics.length} topics · ${s.files.length} files`,
});

export const STUDY_META: DisplayMeta = {
  kind: 'study',
  noun: 'study',
  handle: 'St',
  about: 'Your files sorted into topics, each with the files’ own words and pages, and practice made from them — checked when you submit.',
  internal: true,
  tell: () =>
    'A STUDY is the person’s files sorted into topics; its quotes are the files’ own words. When they ask about a topic, ground what you say in the passages under DOCUMENTS and cite them by key; when a passage is not there, say so rather than filling it in. Never give the answers to practice they have not submitted — point at the passage and ask.',
};

register(STUDY);
registerDisplay(STUDY_META);

/** The study in a line of thinking, if it has one. */
export function studyIn(space: ObjectSpace | undefined): { obj: ThoughtObject; state: StudyState } | null {
  const obj = space?.objs.find((o) => o.kind === 'study');
  if (!obj) return null;
  const state = obj.states[obj.at] as StudyState | undefined;
  return state ? { obj, state } : null;
}

/**
 * The study changed as a whole: a new sort, a practice set made, answers
 * typed, a check. The object keeps its id and name; its state is replaced,
 * kept only if it survives being saved and read back. Null when it would not.
 */
export function restudy(space: ObjectSpace, id: string, next: unknown): ObjectSpace | null {
  const k = kindOf('study');
  const state = k?.sanitize(JSON.parse(JSON.stringify(next)));
  if (!k || !state) return null;
  let found = false;
  const objs = space.objs.map((o): ThoughtObject => {
    if (o.id !== id) return o;
    found = true;
    const { trimmed: _t, ...rest } = o;
    return { ...rest, states: [state], steps: [], at: 0 };
  });
  return found ? { objs } : null;
}
